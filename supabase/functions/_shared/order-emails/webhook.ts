/**
 * Webhook transactionnel Brevo → statut de remise (information administration UNIQUEMENT).
 * Ne modifie JAMAIS une commande : seule la colonne delivery_status de l'outbox change, et
 * chaque événement authentifié est journalisé (orders_private.email_delivery_events, sans
 * donnée personnelle), une seule fois même si Brevo le renvoie.
 *
 * Brevo ne signe pas ses webhooks (pas de HMAC). Authentification par le secret
 * BREVO_WEBHOOK_TOKEN, comparé à temps constant, selon l'option choisie dans Brevo :
 *   - « Token » : Authorization: Bearer <jeton> ;
 *   - « Basic » : Authorization: Basic base64(<identifiant>:<jeton>) (identifiant libre).
 * Charge utile validée strictement ; l'adresse e-mail, l'objet et le motif présents dans
 * l'événement ne sont ni stockés ni journalisés (rapprochement par message-id seulement).
 * Référence : https://developers.brevo.com/docs/transactional-webhooks
 */

import { json, makeRpc, sameSecret, type EnvGetter } from './config.ts';
import type { Rpc } from './worker.ts';

export const DELIVERY_EVENTS = new Set([
  'deferred',
  'delivered',
  'soft_bounce',
  'hard_bounce',
  'blocked',
  'invalid_email',
  'spam',
  'error',
]);
const MAX_BYTES = 64 * 1024;
const MESSAGE_ID = /^[\x21-\x7e]{1,200}$/;

/** Jeton présenté (Bearer, ou mot de passe d'un en-tête Basic) et nom du schéma, sans le jeton. */
export function presentedSecret(request: Request): { scheme: string; secret: string } {
  const header = request.headers.get('authorization') ?? '';
  const bearer = /^Bearer (.+)$/i.exec(header);
  if (bearer) return { scheme: 'bearer', secret: bearer[1]!.trim() };
  const basic = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(header);
  if (basic) {
    try {
      const decoded = atob(basic[1]!);
      const colon = decoded.indexOf(':');
      return { scheme: 'basic', secret: colon >= 0 ? decoded.slice(colon + 1) : '' };
    } catch {
      return { scheme: 'basic_invalid', secret: '' };
    }
  }
  return { scheme: header ? 'other' : 'none', secret: '' };
}

/**
 * Diagnostic d'un jeton refusé, SANS rien révéler du secret ni de la valeur reçue :
 * longueurs, et forme de l'écart (tronqué, entouré de caractères, espaces, guillemets).
 */
export function mismatchHint(given: string, expected: string): string {
  const hints = [`longueur reçue ${given.length}, attendue ${expected.length}`];
  if (given && given.length < expected.length && expected.startsWith(given)) hints.push('début tronqué du jeton');
  if (given.length > expected.length && given.includes(expected)) hints.push('jeton entouré de caractères en plus');
  if (/\s/.test(given)) hints.push('espace dans la valeur');
  if (/^["'«]|["'»]$/.test(given)) hints.push('guillemets');
  return hints.join(', ');
}

/** Horodatage Brevo : ts_epoch (ms) si présent, sinon ts_event (s) ; NULL si absent ou aberrant. */
function eventTime(e: Record<string, unknown>): string | null {
  const ms =
    typeof e.ts_epoch === 'number' && Number.isFinite(e.ts_epoch)
      ? e.ts_epoch
      : typeof e.ts_event === 'number' && Number.isFinite(e.ts_event)
        ? e.ts_event * 1000
        : null;
  return ms && ms > 1_600_000_000_000 && ms < 4_000_000_000_000 ? new Date(ms).toISOString() : null;
}

export async function handleBrevoWebhook(
  request: Request,
  env: EnvGetter,
  overrides: { rpc?: Rpc; fetch?: typeof fetch; log?: (line: string) => void } = {},
): Promise<Response> {
  const log = overrides.log ?? ((line: string) => console.log(line));
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const token = (env('BREVO_WEBHOOK_TOKEN') ?? '').trim();
  const presented = presentedSecret(request);
  if (token.length < 32 || !(await sameSecret(presented.secret, token))) {
    // Diagnostic sans secret : quel schéma d'authentification Brevo (ou un tiers) a envoyé.
    const detail =
      token.length < 32
        ? ', jeton non configuré'
        : presented.secret
          ? `, ${mismatchHint(presented.secret, token)}`
          : '';
    log(`webhook: refusé (authentification ${presented.scheme}${detail})`);
    return json(401, { error: 'unauthorized' });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) return json(413, { error: 'too_large' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const events = (Array.isArray(body) ? body : [body]).slice(0, 50);

  const url = (env('SUPABASE_URL') ?? '').trim();
  const key = (env('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const rpc = overrides.rpc ?? (url && key ? makeRpc(url, key, overrides.fetch) : null);
  if (!rpc) return json(503, { error: 'not_configured' });

  let matched = 0;
  let ignored = 0;
  let duplicates = 0;
  for (const event of events) {
    if (!event || typeof event !== 'object') {
      ignored++;
      continue;
    }
    const e = event as Record<string, unknown>;
    const name = typeof e.event === 'string' ? e.event : '';
    const messageId = typeof e['message-id'] === 'string' ? e['message-id'] : '';
    // Envoi (« request »), ouvertures, clics, désabonnements… : sans intérêt pour une commande.
    if (!DELIVERY_EVENTS.has(name) || !MESSAGE_ID.test(messageId)) {
      ignored++;
      log(`webhook: ignoré (${name ? name.replace(/[^a-z_]/g, '').slice(0, 30) : 'sans type'})`);
      continue;
    }
    try {
      const result = (await rpc('order_emails_delivery_event', {
        p_message_id: messageId,
        p_event: name,
        p_at: eventTime(e),
      })) as { ok?: boolean; matched?: number; duplicate?: boolean };
      matched += result?.matched ?? 0;
      if (result?.duplicate) duplicates++;
      log(`webhook: ${name} ${result?.duplicate ? 'déjà reçu' : `rapproché=${result?.matched ?? 0}`}`);
    } catch {
      // Brevo réessaie sur une réponse en erreur : on signale l'échec.
      log('webhook: enregistrement impossible');
      return json(500, { error: 'store_failed' });
    }
  }
  return json(200, { ok: true, matched, ignored, duplicates });
}
