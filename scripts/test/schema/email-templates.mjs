// Banc des gabarits d'e-mails (étape 11) — hors ligne, sans secret, sans réseau.
//   node email-templates.mjs [--preview <dossier>]   (--preview écrit les 4 e-mails en HTML/texte)
// Contrôle : les 4 types, montants, lien de suivi, absence de données internes, HTML et texte,
// commande avec / sans suivi transporteur, livraison 0, international, accents, échappement HTML,
// client Brevo (requête, erreurs, doublon), configuration, webhook (authentification, validation).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.resolve(HERE, '../../../supabase/functions/_shared/order-emails');
const { renderEmail, escapeHtml, formatCents, safeExternalUrl, RenderError } = await import(pathToFileURL(path.join(SHARED, 'templates.ts')).href);
const { sendWithBrevo } = await import(pathToFileURL(path.join(SHARED, 'brevo.ts')).href);
const { loadWorkerConfig, sameSecret } = await import(pathToFileURL(path.join(SHARED, 'config.ts')).href);
const { handleBrevoWebhook } = await import(pathToFileURL(path.join(SHARED, 'webhook.ts')).href);
const { handleWorkerRequest } = await import(pathToFileURL(path.join(SHARED, 'worker.ts')).href);

let failures = 0;
let passes = 0;
function check(cond, label, detail = '') {
  if (cond) { passes++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failures++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const section = (t) => console.log(`\n▸ ${t}`);
const throwsCode = (fn) => { try { fn(); return null; } catch (e) { return e instanceof RenderError ? e.code : `autre:${e.message}`; } };

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde';
const ORDER_UUID = '7b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const base = (over = {}) => ({
  id: '11111111-2222-4333-8444-555555555555',
  claim_id: '66666666-7777-4888-9999-000000000000',
  email_type: 'order_received',
  locale: 'fr',
  environment: 'production',
  attempt: 1,
  recipient: { email: 'client@example.com', first_name: 'Aïcha' },
  tracking_url: `https://dar-nur.fr/suivi/#${TOKEN}`,
  order: {
    number: 'DN-2026-ABC234',
    created_at: '2026-10-03T10:00:00Z',
    country_code: 'FR',
    currency: 'EUR',
    items: [
      { name: 'Miel de Nigelle', variant: '250 g', quantity: 2, unit_price_cents: 1490, line_total_cents: 2980, on_demand: false, unavailable: false },
      { name: 'Qamis Sultan « Saphir »', variant: 'Taille 56', quantity: 1, unit_price_cents: 3900, line_total_cents: 3900, on_demand: true, unavailable: false },
    ],
    subtotal_cents: 6880,
    total_confirmed: false,
    shipping_cents: null,
    discount_cents: null,
    total_cents: null,
    has_payment_link: false,
    paid_at: null,
    shipment: null,
  },
  ...over,
});
const withOrder = (job, over) => ({ ...job, order: { ...job.order, ...over } });
const confirmed = (job, shipping = 990, discount = 0) =>
  withOrder(job, { total_confirmed: true, shipping_cents: shipping, discount_cents: discount, total_cents: job.order.subtotal_cents + shipping - discount });
const ctx = { replyToConfigured: false };
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const eur = (c) => formatCents(c);

const FORBIDDEN = [ORDER_UUID, 'token_hash', 'admin_note', 'Note interne', 'supplier', 'fournisseur', 'payment_reference',
  'ip_hash', 'sxlpgcnjerlayitaxxyv', 'service_role', '11111111-2222', '66666666-7777', '+33', 'rue de'];

section('1. Commande reçue');
let job = base();
let r = renderEmail(job, ctx);
check(r.subject === 'Dar Nūr — Commande DN-2026-ABC234 reçue', 'objet', r.subject);
check(r.html.startsWith('<!doctype html>') && r.html.includes('lang="fr"') && r.html.includes('charset="utf-8"'), 'HTML complet, lang fr, UTF-8');
check(r.html.includes('max-width:600px') && r.html.includes('name="viewport"'), 'largeur 600 px max + viewport mobile');
check(!/<script|<img|@import|<link /i.test(r.html), 'aucun script, aucune image, aucune police web');
check(plain(r.html).includes('Bonjour Aïcha,') && r.text.includes('Bonjour Aïcha,'), 'salutation (accents conservés)');
check(r.text.includes('DN-2026-ABC234') && plain(r.html).includes('DN-2026-ABC234'), 'numéro de commande');
check(r.text.includes('Miel de Nigelle (250 g, x2') && r.text.includes(eur(2980)) && r.text.includes(eur(3900)), 'articles et montants de ligne (texte)');
check(plain(r.html).includes('Qamis Sultan « Saphir »') && plain(r.html).includes('Sur commande'), 'guillemets français et « sur commande » (HTML)');
check(r.text.includes(`Sous-total produits : ${eur(6880)}`) && r.text.includes('Livraison : À confirmer'), 'sous-total + livraison « À confirmer »');
check(r.text.includes('Aucun paiement n’est demandé à ce stade.'), 'aucun paiement demandé');
check(/vérifie maintenant la disponibilité des articles et calcule les frais de livraison/.test(r.text), 'explication de la vérification');
for (const bad of ['paiement reçu', 'confirmée définitivement', 'expédition en cours', 'Total à régler'])
  check(!r.text.toLowerCase().includes(bad.toLowerCase()) && !plain(r.html).toLowerCase().includes(bad.toLowerCase()), `jamais « ${bad} »`);
check(r.html.includes(`href="https://dar-nur.fr/suivi/#${TOKEN}"`) && r.text.includes(`Suivre ma commande : https://dar-nur.fr/suivi/#${TOKEN}`), 'lien de suivi /suivi/#jeton (HTML + texte)');
check(!r.html.includes('[TEST]') && !r.subject.startsWith('[TEST]'), 'production : aucun marquage test');
check(!r.text.includes('Répondez') , 'sans reply-to configuré : pas d’invitation à répondre');
check(renderEmail(job, { replyToConfigured: true }).text.includes('Répondez simplement à cet e-mail'), 'avec reply-to : invitation à répondre');

section('2. Paiement demandé');
job = confirmed(base({ email_type: 'payment_requested' }), 990, 500);
r = renderEmail(job, ctx);
check(r.subject === 'Dar Nūr — Paiement demandé pour la commande DN-2026-ABC234', 'objet', r.subject);
check(r.text.includes(`Sous-total produits : ${eur(6880)}`) && r.text.includes(`Remise : − ${eur(500)}`) &&
      r.text.includes(`Livraison : ${eur(990)}`) && r.text.includes(`Total à régler : ${eur(7370)}`), 'sous-total, remise, livraison, total exact', eur(7370));
check(r.text.includes('Les instructions de paiement vous seront transmises par Dar Nūr.'), 'sans lien de paiement : instructions transmises par Dar Nūr');
check(!/https:\/\/(?!dar-nur\.fr)/.test(r.html.replace(/https:\/\/dar-nur\.fr[^"]*/g, '')), 'aucun faux bouton / lien de paiement externe');
check(!/payer maintenant|carte bancaire/i.test(r.text), 'aucun appel « payer maintenant »');
r = renderEmail(withOrder(job, { has_payment_link: true }), ctx);
check(r.text.includes('Le lien de paiement sécurisé est disponible sur votre page de suivi.') && r.text.includes(`Voir ma commande et le paiement : https://dar-nur.fr/suivi/#${TOKEN}`),
  'avec lien de paiement : renvoi vers la page de suivi (le lien lui-même n’est pas dans l’e-mail)');
r = renderEmail(confirmed(base({ email_type: 'payment_requested' }), 0), ctx);
check(r.text.includes(`Livraison : ${eur(0)}`) && r.text.includes(`Total à régler : ${eur(6880)}`) && !r.text.includes('Remise'), 'livraison 0 € : affichée 0,00 €, pas de remise vide');
const intl = confirmed(withOrder(base({ email_type: 'payment_requested' }), { country_code: 'BE', items: [
  ...base().order.items, { name: 'Bakhour Ambre', variant: null, quantity: 1, unit_price_cents: 1200, line_total_cents: 1200, on_demand: false, unavailable: true }] }), 2490);
r = renderEmail(intl, ctx);
check(r.text.includes(`Livraison : ${eur(2490)}`) && r.text.includes('Bakhour Ambre (x1) : Indisponible — non facturé'), 'international + article indisponible marqué non facturé');
check(throwsCode(() => renderEmail(base({ email_type: 'payment_requested' }), ctx)) === 'total_not_confirmed', 'total non confirmé → refus de rendu');

section('3. Paiement confirmé');
job = confirmed(base({ email_type: 'payment_confirmed' }), 990);
r = renderEmail(job, ctx);
check(r.subject === 'Dar Nūr — Paiement reçu pour la commande DN-2026-ABC234', 'objet', r.subject);
check(r.text.includes(`Total payé : ${eur(7870)}`), 'total payé', eur(7870));
check(r.text.includes('nous préparons l’expédition') && !/\b(\d{1,2}\/\d{1,2}|sous \d+ jours?|demain)\b/i.test(r.text), 'prochaine étape, aucune date promise');

section('4. Commande expédiée');
const shipped = (shipment) => confirmed(withOrder(base({ email_type: 'order_shipped' }), { shipment: { shipped_at: '2026-10-05T09:00:00Z', ...shipment } }), 990);
r = renderEmail(shipped({ carrier: 'Colissimo', service: 'Suivi international', tracking_number: '6A12345678901', tracking_url: 'https://www.laposte.fr/outils/suivre-vos-envois?code=6A12345678901' }), ctx);
check(r.subject === 'Dar Nūr — Commande DN-2026-ABC234 expédiée', 'objet', r.subject);
check(r.text.includes('Transporteur : Colissimo') && r.text.includes('Service : Suivi international') && r.text.includes('Numéro de suivi : 6A12345678901'), 'transporteur, service, numéro');
check(r.html.includes('href="https://www.laposte.fr/outils/suivre-vos-envois?code=6A12345678901"'), 'lien transporteur https conservé');
check(r.html.includes(`href="https://dar-nur.fr/suivi/#${TOKEN}"`), 'lien vers le suivi Dar Nūr');
r = renderEmail(shipped({ carrier: null, service: null, tracking_number: null, tracking_url: null }), ctx);
check(!r.text.includes('Transporteur :') && !r.text.includes('Numéro de suivi :') && r.text.includes('Aucun numéro de suivi transporteur'), 'sans suivi : aucun suivi fictif, mention neutre');
for (const bad of ['http://evil.example/x', 'https://user:pass@evil.example/', 'https://localhost/x', 'https://127.0.0.1/x', 'javascript:alert(1)', 'https://evil.example/a b'])
  check(safeExternalUrl(bad) === null, `lien transporteur refusé : ${bad}`);
r = renderEmail(shipped({ carrier: 'DHL', service: null, tracking_number: 'X1', tracking_url: 'http://insecure.example/track' }), ctx);
check(!r.html.includes('insecure.example') && r.text.includes('Numéro de suivi : X1'), 'lien transporteur non sûr omis, numéro gardé');
check(throwsCode(() => renderEmail(confirmed(base({ email_type: 'order_shipped' })), ctx)) === 'not_shipped', 'sans expédition → refus de rendu');

section('5. Sécurité du contenu');
const xss = '<img src=x onerror=alert(1)>"\'&';
r = renderEmail(withOrder(base({ recipient: { email: 'a@example.com', first_name: xss } }), {
  items: [{ name: `<script>alert(1)</script>${xss}`, variant: '<b>v</b>', quantity: 1, unit_price_cents: 100, line_total_cents: 100, on_demand: false, unavailable: false }],
  subtotal_cents: 100 }), ctx);
check(!r.html.includes('<script') && !r.html.includes('<img') && !r.html.includes('<b>v') && r.html.includes('&lt;script&gt;') && r.html.includes('&quot;&#39;&amp;'), 'injection HTML (produit, variante, prénom) échappée');
check(escapeHtml('<a href="x">') === '&lt;a href=&quot;x&quot;&gt;', 'escapeHtml');
r = renderEmail(shipped({ carrier: '<i>Evil</i>', service: null, tracking_number: '"><svg onload=1>', tracking_url: null }), ctx);
check(!r.html.includes('<svg') && !r.html.includes('<i>Evil'), 'transporteur / numéro de suivi échappés');
for (const type of ['order_received', 'payment_requested', 'payment_confirmed', 'order_shipped']) {
  const j = type === 'order_shipped' ? shipped({ carrier: 'Colissimo', service: null, tracking_number: 'N1', tracking_url: null })
    : type === 'order_received' ? base() : confirmed(base({ email_type: type }));
  const out = renderEmail({ ...j, email_type: type }, ctx);
  const leaks = FORBIDDEN.filter((f) => out.html.includes(f) || out.text.includes(f));
  check(leaks.length === 0, `${type} : aucune donnée interne (UUID, jeton haché, notes, fournisseur, adresse, téléphone…)`, leaks.join(', '));
  check(!out.html.includes('client@example.com') && !out.text.includes('client@example.com'), `${type} : l’adresse e-mail n’est pas répétée dans le corps`);
  check(out.text.length > 200 && !/<[a-z]/i.test(out.text), `${type} : version texte complète, sans balise`);
  check(out.html.match(/<table/g)?.length === out.html.match(/<\/table>/g)?.length, `${type} : tableaux équilibrés`);
}
check(throwsCode(() => renderEmail(base({ tracking_url: `https://dar-nur.fr/suivi/?t=${TOKEN}` }), ctx)) === 'invalid_tracking_url', 'jeton en paramètre de requête (envoyé au serveur) → refusé : fragment obligatoire');
check(throwsCode(() => renderEmail(base({ tracking_url: `http://dar-nur.fr/suivi/#${TOKEN}` }), ctx)) === 'invalid_tracking_url', 'lien de suivi http → refusé');
check(throwsCode(() => renderEmail(withOrder(base(), { number: 'DN-2026-ABC234\r\nBcc: x@y' }), ctx)) === 'invalid_number', 'numéro hors format (injection d’en-tête) → refusé');
check(throwsCode(() => renderEmail(base({ locale: 'en' }), ctx)) === 'unknown_locale', 'langue inconnue → refusée (français seul)');

section('6. Préproduction');
r = renderEmail(base({ environment: 'preprod', tracking_url: `https://preprod.example.net/suivi/#${TOKEN}` }), ctx);
check(r.subject.startsWith('[TEST] ') && r.text.startsWith('*** E-mail de test') && plain(r.html).includes('E-mail de test'), 'commande de test : objet [TEST] + bandeau HTML et texte');
check(r.html.includes('href="https://preprod.example.net"') && r.html.includes('preprod.example.net/suivi/#'), 'liens vers le site de préproduction');

section('7. Client Brevo (faux serveur, BREVO_API_KEY=fake_test_key)');
const calls = [];
const fakeFetch = (status, body, opts = {}) => async (url, init) => {
  calls.push({ url, init });
  if (opts.throw) throw Object.assign(new Error('x'), { name: opts.throw });
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};
const cfg = (f) => ({ apiKey: 'fake_test_key', senderEmail: 'expediteur@example.com', senderName: 'Dar Nūr', replyToEmail: 'reponse@example.com', fetch: f });
const mail = { to: 'client@example.com', subject: 'S', html: '<p>h</p>', text: 't', tag: 'order_received', idempotencyKey: '11111111-2222-4333-8444-555555555555' };
let out = await sendWithBrevo(cfg(fakeFetch(201, { messageId: '<202610031200.123@smtp-relay.mailin.fr>' })), mail);
const sent = JSON.parse(calls.at(-1).init.body);
check(out.outcome === 'sent' && out.messageId === '<202610031200.123@smtp-relay.mailin.fr>', '201 → envoyé + messageId');
check(calls.at(-1).url === 'https://api.brevo.com/v3/smtp/email' && calls.at(-1).init.headers['api-key'] === 'fake_test_key', 'POST /v3/smtp/email, en-tête api-key');
check(sent.headers.idempotencyKey === mail.idempotencyKey && sent.to[0].email === 'client@example.com' && !('name' in sent.to[0]), 'idempotencyKey = id d’outbox ; destinataire sans nom (minimisation)');
check(sent.htmlContent && sent.textContent && sent.replyTo.email === 'reponse@example.com' && !('templateId' in sent), 'HTML + texte + reply-to, aucun templateId');
out = await sendWithBrevo(cfg(fakeFetch(400, { code: 'duplicate_parameter', message: 'client@example.com already' })), mail);
check(out.outcome === 'sent' && out.messageId === null && out.note === 'duplicate_at_provider', 'doublon reconnu par Brevo → compté envoyé, sans renvoi');
out = await sendWithBrevo(cfg(fakeFetch(400, { code: 'invalid_parameter', message: 'email client@example.com invalid' })), mail);
check(out.outcome === 'failed' && out.error === 'brevo_400_invalid_parameter' && !out.error.includes('@'), '400 → échec définitif, code court sans adresse');
for (const [status, expected] of [[401, 'retry'], [402, 'retry'], [429, 'retry'], [500, 'retry'], [503, 'retry']]) {
  out = await sendWithBrevo(cfg(fakeFetch(status, { code: 'x' })), mail);
  check(out.outcome === expected, `${status} → nouvelle tentative`, out.error);
}
out = await sendWithBrevo(cfg(fakeFetch(0, null, { throw: 'TimeoutError' })), mail);
check(out.outcome === 'retry' && out.error === 'brevo_timeout', 'délai dépassé → nouvelle tentative');
out = await sendWithBrevo(cfg(fakeFetch(0, null, { throw: 'TypeError' })), mail);
check(out.outcome === 'retry' && out.error === 'brevo_network_error', 'réseau coupé → nouvelle tentative');
check(!JSON.stringify(calls.map((c) => c.init.body)).includes('fake_test_key'), 'la clé n’apparaît jamais dans le corps');

section('8. Configuration et authentification');
const env = (o) => (k) => o[k];
const good = { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', ORDER_EMAILS_WORKER_SECRET: 'w'.repeat(40),
  BREVO_API_KEY: 'fake_test_key', BREVO_SENDER_EMAIL: 'expediteur@example.com' };
let loaded = loadWorkerConfig(env(good));
check(loaded.ok && loaded.config.allowProduction === false && loaded.config.testRecipients.length === 0 && loaded.config.senderName === 'Dar Nūr', 'défauts sûrs : production interdite, aucune adresse de test');
loaded = loadWorkerConfig(env({ ...good, BREVO_API_KEY: '', BREVO_SENDER_EMAIL: 'pas-une-adresse' }));
check(!loaded.ok && loaded.missing.join() === 'BREVO_API_KEY,BREVO_SENDER_EMAIL' && !JSON.stringify(loaded).includes('fake_test_key'), 'réglages manquants nommés, valeurs jamais renvoyées');
check(await sameSecret('abc', 'abc') && !(await sameSecret('abc', 'abd')) && !(await sameSecret('', '')), 'comparaison de secrets');
const post = (headers = {}, body = '{}') => new Request('https://x.supabase.co/functions/v1/order-emails', { method: 'POST', headers, body });
let res = await handleWorkerRequest(post(), env(good));
check(res.status === 401, 'worker : sans jeton → 401');
res = await handleWorkerRequest(post({ authorization: `Bearer ${'x'.repeat(40)}` }), env(good));
check(res.status === 401, 'worker : mauvais jeton → 401');
res = await handleWorkerRequest(post({ authorization: 'Bearer ' }), env({ ...good, ORDER_EMAILS_WORKER_SECRET: '' }));
check(res.status === 401, 'worker : secret non configuré → personne ne passe');
res = await handleWorkerRequest(new Request('https://x/functions/v1/order-emails'), env(good));
check(res.status === 405, 'worker : GET → 405');
res = await handleWorkerRequest(post({ authorization: `Bearer ${good.ORDER_EMAILS_WORKER_SECRET}` }), env({ ...good, BREVO_API_KEY: '' }));
check(res.status === 503 && (await res.json()).missing.includes('BREVO_API_KEY'), 'worker : clé Brevo absente → 503, rien n’est réclamé');
const rpcCalls = [];
res = await handleWorkerRequest(post({ authorization: `Bearer ${good.ORDER_EMAILS_WORKER_SECRET}` }, JSON.stringify({ to: 'victime@example.com', html: 'spam' })), env(good),
  { fetch: async (url, init) => { rpcCalls.push({ url, init }); return new Response('[]', { status: 200 }); }, log: () => {} });
check(res.status === 200 && rpcCalls.length === 1 && rpcCalls[0].url.endsWith('/rest/v1/rpc/order_emails_claim') && JSON.parse(rpcCalls[0].init.body).p_limit === 10,
  'worker : corps de la requête ignoré (aucun destinataire ni contenu imposable), seule l’outbox est lue');
check(rpcCalls[0].init.headers.apikey === 'svc' && rpcCalls[0].init.headers.authorization === 'Bearer svc', 'worker : appel RPC avec la clé service');

section('9. Webhook Brevo');
const WH = { BREVO_WEBHOOK_TOKEN: 't'.repeat(40), SUPABASE_URL: good.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: 'svc' };
const stored = [];
const fakeRpc = async (fn, args) => { stored.push({ fn, args }); return { ok: true, matched: 1 }; };
const hook = (body, token = WH.BREVO_WEBHOOK_TOKEN) => handleBrevoWebhook(
  new Request('https://x/functions/v1/order-emails-webhook', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
  env(WH), { rpc: fakeRpc });
res = await hook({ event: 'hard_bounce', email: 'client@example.com', 'message-id': '<abc@smtp-relay.mailin.fr>', ts_event: 1791000000, reason: 'mailbox unknown client@example.com' });
check(res.status === 200 && stored.length === 1 && stored[0].fn === 'order_emails_delivery_event' && stored[0].args.p_event === 'hard_bounce', 'hard_bounce transmis');
check(!JSON.stringify(stored).includes('client@example.com') && !JSON.stringify(stored).includes('mailbox'), 'adresse et motif bruts jamais transmis à la base');
res = await hook({ event: 'hard_bounce', 'message-id': '<abc@x>' }, 'u'.repeat(40));
check(res.status === 401 && stored.length === 1, 'jeton faux → 401, rien enregistré');
res = await hook({ event: 'opened', 'message-id': '<abc@x>' });
check(res.status === 200 && (await res.json()).ignored === 1 && stored.length === 1, 'ouverture (tracking) ignorée');
res = await hook({ event: 'delivered', 'message-id': 'a b' });
check((await res.json()).ignored === 1 && stored.length === 1, 'message-id invalide ignoré');
res = await hook('pas du json');
check(res.status === 400, 'JSON invalide → 400');
res = await hook('x'.repeat(70_000));
check(res.status === 413, 'charge > 64 Ko → 413');
res = await hook([{ event: 'delivered', 'message-id': '<a@x>' }, { event: 'blocked', 'message-id': '<b@x>' }]);
check(res.status === 200 && stored.length === 3, 'lot d’événements accepté');
res = await handleBrevoWebhook(new Request('https://x', { method: 'POST', headers: { authorization: 'Bearer ' }, body: '{}' }), env({ ...WH, BREVO_WEBHOOK_TOKEN: '' }), { rpc: fakeRpc, log: () => {} });
check(res.status === 401, 'webhook sans jeton configuré → personne ne passe');
const logs = [];
const hookWith = (authorization, body = { event: 'delivered', 'message-id': '<basic@x>', ts_event: 1791000000, ts_epoch: 1791000000123 }) => handleBrevoWebhook(
  new Request('https://x/functions/v1/order-emails-webhook', { method: 'POST', headers: authorization ? { authorization } : {}, body: JSON.stringify(body) }),
  env(WH), { rpc: fakeRpc, log: (l) => logs.push(l) });
const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
let before = stored.length;
res = await hookWith(basic('brevo', WH.BREVO_WEBHOOK_TOKEN));
check(res.status === 200 && stored.length === before + 1, 'authentification « Basic » (mot de passe = jeton) acceptée');
check(stored.at(-1).args.p_at === '2026-10-03T04:00:00.123Z', 'horodatage ts_epoch (ms) préféré à ts_event', stored.at(-1).args.p_at);
before = stored.length;
for (const [label, auth] of [['Basic, mauvais mot de passe', basic('brevo', 'u'.repeat(40))], ['Basic, jeton en identifiant', basic(WH.BREVO_WEBHOOK_TOKEN, '')],
  ['Basic mal formé', 'Basic !!!'], ['jeton brut sans schéma', WH.BREVO_WEBHOOK_TOKEN], ['aucun en-tête', '']]) {
  res = await hookWith(auth);
  check(res.status === 401 && stored.length === before, `${label} → 401, rien enregistré`);
}
check(logs.some((l) => /refusé \(authentification basic\)/.test(l)) && logs.some((l) => /refusé \(authentification none\)/.test(l))
  && !logs.join(' ').includes(WH.BREVO_WEBHOOK_TOKEN) && !logs.join(' ').includes('@'), 'journal de la fonction : schéma refusé indiqué, jamais le jeton ni une adresse');
// Diagnostic d'un jeton refusé : forme de l'écart, jamais le jeton ni la valeur reçue.
const T = WH.BREVO_WEBHOOK_TOKEN.slice(0, 20) + 'abcdefghijklmnopqrst';
const WH2 = { ...WH, BREVO_WEBHOOK_TOKEN: T };
const diag = async (authorization) => {
  const lines = [];
  const r = await handleBrevoWebhook(new Request('https://x', { method: 'POST', headers: { authorization }, body: '{}' }), env(WH2), { rpc: fakeRpc, log: (l) => lines.push(l) });
  return { status: r.status, line: lines.join(' ') };
};
let dg = await diag(`Bearer ${T.slice(0, 32)}`);
check(dg.status === 401 && /longueur reçue 32, attendue 40, début tronqué du jeton/.test(dg.line) && !dg.line.includes(T.slice(0, 8)), 'refus : jeton tronqué signalé (longueurs), sans le révéler', dg.line);
dg = await diag(`Bearer "${T}"`);
check(dg.status === 401 && /jeton entouré de caractères en plus, guillemets/.test(dg.line) && !dg.line.includes(T.slice(0, 8)), 'refus : jeton entre guillemets signalé', dg.line);
dg = await diag(`Bearer ${T.slice(0, 20)} ${T.slice(20)}`);
check(dg.status === 401 && /espace dans la valeur/.test(dg.line), 'refus : espace dans la valeur signalé', dg.line);
dg = await diag(`Bearer ${'z'.repeat(40)}`);
check(dg.status === 401 && /longueur reçue 40, attendue 40\)$/.test(dg.line), 'refus : valeur différente de même longueur (aucun autre indice)', dg.line);
dg = await diag(basic('brevo', T.slice(0, 10)));
check(dg.status === 401 && /authentification basic, longueur reçue 10, attendue 40, début tronqué du jeton/.test(dg.line), 'refus Basic : diagnostic identique', dg.line);
dg = await diag(`Bearer ${T}`);
check(dg.status === 200, 'jeton exact (40 caractères alphanumériques) accepté');
const dupRpc = async () => ({ ok: true, matched: 0, duplicate: true });
res = await handleBrevoWebhook(new Request('https://x', { method: 'POST', headers: { authorization: `Bearer ${WH.BREVO_WEBHOOK_TOKEN}` },
  body: JSON.stringify({ event: 'delivered', 'message-id': '<d@x>', ts_epoch: 1791000000123 }) }), env(WH), { rpc: dupRpc, log: () => {} });
check(res.status === 200 && (await res.json()).duplicates === 1, 'événement déjà reçu → 200 (Brevo n’insiste pas), compté en doublon');
res = await hookWith(`Bearer ${WH.BREVO_WEBHOOK_TOKEN}`, { event: 'request', 'message-id': '<s@x>', email: 'client@example.com' });
check(res.status === 200 && (await res.json()).ignored === 1 && !logs.join(' ').includes('client@example.com'), 'événement « request » (envoi) ignoré sans journaliser l’adresse');

// Aperçus pour relecture visuelle (non versionnés).
const pi = process.argv.indexOf('--preview');
if (pi >= 0) {
  const dir = path.resolve(process.argv[pi + 1]);
  mkdirSync(dir, { recursive: true });
  const samples = {
    'commande-recue': base(),
    'paiement-demande': confirmed(withOrder(base({ email_type: 'payment_requested' }), { has_payment_link: true }), 990, 500),
    'paiement-confirme': confirmed(base({ email_type: 'payment_confirmed' }), 990),
    'commande-expediee': shipped({ carrier: 'Colissimo', service: 'Suivi international', tracking_number: '6A12345678901', tracking_url: 'https://www.laposte.fr/outils/suivre-vos-envois?code=6A12345678901' }),
    'test-preprod': base({ environment: 'preprod', tracking_url: `https://preprod.example.net/suivi/#${TOKEN}` }),
  };
  for (const [name, j] of Object.entries(samples)) {
    const o = renderEmail(j, { replyToConfigured: true });
    writeFileSync(path.join(dir, `${name}.html`), o.html);
    writeFileSync(path.join(dir, `${name}.txt`), `Objet : ${o.subject}\n\n${o.text}`);
  }
  console.log(`\n  aperçus écrits dans ${dir}`);
}

console.log(`\n${failures === 0 ? '✅' : '❌'} ${passes} contrôle(s) réussi(s), ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
