/**
 * Worker des e-mails transactionnels (étape 11) — logique indépendante de Deno,
 * testée sous Node avec une base PGlite et un faux Brevo (scripts/test/schema/emails.mjs).
 *
 * 1. Réclame les e-mails dus (public.order_emails_claim : bail de 5 min, SKIP LOCKED).
 * 2. Garde-fous propres à la fonction, EN PLUS de ceux de la base :
 *    commande de test → destinataire dans ORDER_EMAILS_TEST_RECIPIENTS ;
 *    commande de production → ORDER_EMAILS_ALLOW_PRODUCTION = true.
 * 3. Rendu (templates.ts), envoi (brevo.ts), compte rendu (public.order_emails_report).
 * Le worker n'accepte AUCUN paramètre de l'appelant : ni destinataire, ni contenu.
 */

import { sendWithBrevo, type OutgoingEmail, type SendOutcome } from './brevo.ts';
import { bearerMatches, json, loadWorkerConfig, makeRpc, type EnvGetter } from './config.ts';
import { RenderError, renderEmail } from './templates.ts';
import type { EmailJob } from './types.ts';

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export interface WorkerDeps {
  rpc: Rpc;
  send: (email: OutgoingEmail) => Promise<SendOutcome>;
  testRecipients: string[];
  allowProduction: boolean;
  replyToConfigured: boolean;
  log?: (line: string) => void;
}

export interface WorkerSummary {
  claimed: number;
  sent: number;
  retry: number;
  failed: number;
  skipped: number;
  report_errors: number;
}

const short = (id: string) => String(id).slice(0, 8);

export async function runOrderEmails(deps: WorkerDeps, limit = 10): Promise<WorkerSummary> {
  const log = deps.log ?? (() => {});
  const summary: WorkerSummary = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, report_errors: 0 };
  const jobs = (await deps.rpc('order_emails_claim', { p_limit: limit })) as EmailJob[] | null;
  if (!Array.isArray(jobs)) return summary;
  summary.claimed = jobs.length;
  const allow = new Set(deps.testRecipients.map((e) => e.toLowerCase()));

  for (const job of jobs) {
    let outcome: 'sent' | 'retry' | 'failed' | 'skipped';
    let messageId: string | null = null;
    let error: string | null = null;

    const recipient = String(job.recipient?.email ?? '').toLowerCase();
    if (job.environment !== 'production' && !allow.has(recipient)) {
      outcome = 'skipped';
      error = 'recipient_not_allowlisted_worker';
    } else if (job.environment === 'production' && !deps.allowProduction) {
      outcome = 'skipped';
      error = 'production_disabled_worker';
    } else {
      try {
        const rendered = renderEmail(job, { replyToConfigured: deps.replyToConfigured });
        const result = await deps.send({
          to: recipient,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          tag: job.email_type,
          idempotencyKey: job.id,
        });
        if (result.outcome === 'sent') {
          outcome = 'sent';
          messageId = result.messageId;
          error = result.note;
        } else {
          outcome = result.outcome;
          error = result.error;
        }
      } catch (e) {
        outcome = 'failed';
        error = e instanceof RenderError ? `render_${e.code}` : 'worker_exception';
      }
    }

    try {
      const report = (await deps.rpc('order_emails_report', {
        p_id: job.id,
        p_claim_id: job.claim_id,
        p_outcome: outcome,
        p_message_id: messageId,
        p_error: error,
      })) as { ok: boolean; status?: string; error?: string };
      if (!report?.ok) {
        summary.report_errors++;
        log(`e-mail ${short(job.id)} ${job.email_type} : compte rendu refusé (${report?.error ?? 'inconnu'})`);
        continue;
      }
      const final = report.status === 'failed' ? 'failed' : outcome === 'retry' ? 'retry' : outcome;
      summary[final]++;
      log(`e-mail ${short(job.id)} ${job.email_type} : ${report.status}${error ? ` (${error})` : ''}`);
    } catch {
      // Bail non libéré : la ligne sera reprise après expiration (Brevo dédoublonne 30 min).
      summary.report_errors++;
      log(`e-mail ${short(job.id)} ${job.email_type} : compte rendu impossible`);
    }
  }
  return summary;
}

/**
 * Point d'entrée HTTP (Edge Function order-emails). POST + « Authorization: Bearer
 * <ORDER_EMAILS_WORKER_SECRET> » (envoyé par pg_net depuis Vault). Le corps est ignoré.
 */
export async function handleWorkerRequest(
  request: Request,
  env: EnvGetter,
  overrides: { fetch?: typeof fetch; log?: (line: string) => void } = {},
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const loaded = loadWorkerConfig(env);
  // Sans jeton configuré, personne ne peut s'authentifier : refus avant toute autre information.
  const secret = (env('ORDER_EMAILS_WORKER_SECRET') ?? '').trim();
  if (secret.length < 32 || !(await bearerMatches(request, secret))) return json(401, { error: 'unauthorized' });
  if (!loaded.ok) return json(503, { error: 'not_configured', missing: loaded.missing });
  const cfg = loaded.config;
  const doFetch = overrides.fetch ?? fetch;
  try {
    const summary = await runOrderEmails({
      rpc: makeRpc(cfg.supabaseUrl, cfg.serviceKey, doFetch),
      send: (email) =>
        sendWithBrevo(
          {
            apiKey: cfg.brevoApiKey,
            senderEmail: cfg.senderEmail,
            senderName: cfg.senderName,
            replyToEmail: cfg.replyToEmail,
            fetch: doFetch,
          },
          email,
        ),
      testRecipients: cfg.testRecipients,
      allowProduction: cfg.allowProduction,
      replyToConfigured: Boolean(cfg.replyToEmail),
      log: overrides.log ?? ((line) => console.log(line)),
    });
    return json(200, summary);
  } catch {
    return json(500, { error: 'worker_failed' });
  }
}
