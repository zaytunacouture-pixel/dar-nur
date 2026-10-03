/**
 * Configuration de l'Edge Function, lue dans ses SECRETS (supabase secrets set …) —
 * jamais dans le dépôt, le site ou une table publique. Les valeurs ne sont jamais
 * renvoyées ni journalisées : seuls les NOMS des réglages manquants le sont.
 */

export type EnvGetter = (name: string) => string | undefined;

export interface WorkerConfig {
  supabaseUrl: string;
  serviceKey: string;
  workerSecret: string;
  brevoApiKey: string;
  senderEmail: string;
  senderName: string;
  replyToEmail: string | null;
  testRecipients: string[];
  allowProduction: boolean;
}

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function loadWorkerConfig(env: EnvGetter): { ok: true; config: WorkerConfig } | { ok: false; missing: string[] } {
  const get = (name: string) => (env(name) ?? '').trim();
  const missing: string[] = [];
  const need = (name: string, valid: (v: string) => boolean = (v) => v.length > 0) => {
    const value = get(name);
    if (!valid(value)) missing.push(name);
    return value;
  };
  const supabaseUrl = need('SUPABASE_URL', (v) => /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(v));
  const serviceKey = need('SUPABASE_SERVICE_ROLE_KEY');
  const workerSecret = need('ORDER_EMAILS_WORKER_SECRET', (v) => v.length >= 32);
  const brevoApiKey = need('BREVO_API_KEY');
  const senderEmail = need('BREVO_SENDER_EMAIL', (v) => EMAIL.test(v));
  const replyTo = get('BREVO_REPLY_TO_EMAIL');
  if (replyTo && !EMAIL.test(replyTo)) missing.push('BREVO_REPLY_TO_EMAIL');
  const testRecipients = get('ORDER_EMAILS_TEST_RECIPIENTS')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (testRecipients.some((v) => !EMAIL.test(v))) missing.push('ORDER_EMAILS_TEST_RECIPIENTS');
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      supabaseUrl,
      serviceKey,
      workerSecret,
      brevoApiKey,
      senderEmail,
      senderName: get('BREVO_SENDER_NAME') || 'Dar Nūr',
      replyToEmail: replyTo || null,
      testRecipients,
      allowProduction: get('ORDER_EMAILS_ALLOW_PRODUCTION') === 'true',
    },
  };
}

/** Comparaison à temps constant (empreintes SHA-256 de même longueur). */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export async function bearerMatches(request: Request, expected: string): Promise<boolean> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  return sameSecret(match?.[1] ?? '', expected);
}

/** Appel RPC PostgREST avec la clé service (worker et webhook seulement). */
export function makeRpc(supabaseUrl: string, serviceKey: string, doFetch: typeof fetch = fetch) {
  return async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const headers: Record<string, string> = { apikey: serviceKey, 'content-type': 'application/json' };
    // Ancienne clé service (JWT) : aussi en Authorization. Nouvelle clé « sb_secret_… » : apikey seule.
    if (!serviceKey.startsWith('sb_')) headers.authorization = `Bearer ${serviceKey}`;
    const response = await doFetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`rpc ${fn}: HTTP ${response.status}`);
    return response.json();
  };
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
