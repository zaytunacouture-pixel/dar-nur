/**
 * Webhook transactionnel Brevo → statut de remise (information administration UNIQUEMENT).
 * Ne modifie JAMAIS une commande : seule la colonne delivery_status de l'outbox change.
 *
 * Brevo ne signe pas ses webhooks (pas de HMAC) : authentification par jeton bearer
 * (« auth: { type: 'bearer', token } » à la création du webhook), comparé à temps constant
 * à BREVO_WEBHOOK_TOKEN. Charge utile validée strictement ; l'adresse e-mail présente dans
 * l'événement n'est ni stockée ni journalisée (rapprochement par message-id seulement).
 * Référence : https://developers.brevo.com/docs/transactional-webhooks
 */

import { bearerMatches, json, makeRpc, type EnvGetter } from './config.ts';
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

export async function handleBrevoWebhook(
  request: Request,
  env: EnvGetter,
  overrides: { rpc?: Rpc; fetch?: typeof fetch } = {},
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const token = (env('BREVO_WEBHOOK_TOKEN') ?? '').trim();
  if (token.length < 32 || !(await bearerMatches(request, token))) return json(401, { error: 'unauthorized' });

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
  for (const event of events) {
    if (!event || typeof event !== 'object') {
      ignored++;
      continue;
    }
    const e = event as Record<string, unknown>;
    const name = typeof e.event === 'string' ? e.event : '';
    const messageId = typeof e['message-id'] === 'string' ? e['message-id'] : '';
    // Ouvertures, clics, désabonnements… : sans intérêt pour une commande, ignorés.
    if (!DELIVERY_EVENTS.has(name) || !MESSAGE_ID.test(messageId)) {
      ignored++;
      continue;
    }
    const ts = typeof e.ts_event === 'number' && Number.isFinite(e.ts_event) ? e.ts_event : null;
    const at = ts && ts > 1_600_000_000 && ts < 4_000_000_000 ? new Date(ts * 1000).toISOString() : null;
    try {
      const result = (await rpc('order_emails_delivery_event', {
        p_message_id: messageId,
        p_event: name,
        p_at: at,
      })) as { ok?: boolean; matched?: number };
      matched += result?.matched ?? 0;
    } catch {
      // Brevo réessaie sur une réponse en erreur : on signale l'échec.
      return json(500, { error: 'store_failed' });
    }
  }
  return json(200, { ok: true, matched, ignored });
}
