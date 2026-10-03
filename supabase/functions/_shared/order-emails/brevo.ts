/**
 * Client minimal de l'API transactionnelle Brevo (POST /v3/smtp/email) — aucun SDK.
 * Documentation : https://developers.brevo.com/reference/sendtransacemail
 *
 * - En-tête `api-key` : la clé ne sort jamais de l'Edge Function (ni journal, ni base).
 * - `headers.idempotencyKey` (UUID, 30 min côté Brevo) = id de la ligne d'outbox :
 *   protection SECONDAIRE ; la protection principale est la contrainte unique en base.
 *   Un doublon reconnu par Brevo (`duplicate_parameter` / `duplicate_request`) signifie que
 *   la première requête a été acceptée : l'e-mail est compté « envoyé », sans renvoi.
 * - Les erreurs sont réduites à un code court (statut + code Brevo) : la réponse brute,
 *   qui peut citer l'adresse du destinataire, n'est jamais conservée.
 */

export interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  replyToEmail: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
  endpoint?: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  tag: string;
  idempotencyKey: string;
}

export type SendOutcome =
  | { outcome: 'sent'; messageId: string | null; note: string | null }
  | { outcome: 'retry' | 'failed'; error: string };

export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const DUPLICATE_CODES = new Set(['duplicate_parameter', 'duplicate_request']);

const code = (value: unknown) =>
  typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40) : '';

export async function sendWithBrevo(cfg: BrevoConfig, email: OutgoingEmail): Promise<SendOutcome> {
  const doFetch = cfg.fetch ?? fetch;
  const payload: Record<string, unknown> = {
    sender: { email: cfg.senderEmail, name: cfg.senderName },
    to: [{ email: email.to }],
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    tags: ['dar-nur-commande', email.tag],
    headers: { idempotencyKey: email.idempotencyKey },
  };
  if (cfg.replyToEmail) payload.replyTo = { email: cfg.replyToEmail };

  let response: Response;
  try {
    response = await doFetch(cfg.endpoint ?? BREVO_ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': cfg.apiKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 10_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return { outcome: 'retry', error: name === 'TimeoutError' || name === 'AbortError' ? 'brevo_timeout' : 'brevo_network_error' };
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok) {
    const id = typeof body?.messageId === 'string' ? body.messageId : null;
    return { outcome: 'sent', messageId: id, note: id ? null : 'message_id_missing' };
  }
  const brevoCode = code(body?.code);
  if (response.status === 400 && DUPLICATE_CODES.has(brevoCode)) {
    return { outcome: 'sent', messageId: null, note: 'duplicate_at_provider' };
  }
  const error = `brevo_${response.status}${brevoCode ? `_${brevoCode}` : ''}`;
  // 400 (requête refusée) : définitif. 401/403 (clé), 402 (crédits), 404, 429, 5xx : temporaire,
  // l'administration voit l'erreur et peut corriger la configuration avant épuisement des tentatives.
  return { outcome: response.status === 400 || response.status === 422 ? 'failed' : 'retry', error };
}
