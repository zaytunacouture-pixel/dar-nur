// Banc d'essai de l'étape 11 (outbox des e-mails transactionnels) — hors ligne, sans secret.
//
//   node emails.mjs --live              catalogue PUBLIC lu avec la clé publique (CI)
//   node emails.mjs --data <dossier>    sauvegarde JSON complète, en local
//
// PGlite + baseline.sql + migrations étapes 6, 10 et 11, rôles réels (anon, authenticated,
// admin, service_role). Le VRAI worker (supabase/functions/_shared/order-emails/worker.ts)
// tourne contre la base, Brevo est simulé (BREVO_API_KEY=fake_test_key, aucun réseau).
//   A. mise en file : 4 types, aucun autre, un seul par événement, nouvelle demande de paiement ;
//   B. garde-fous : interrupteur, liste de test, URL du site, production, expiration ;
//   C. worker : envoi, ordre, montants, provider_message_id, journal « prévenu », idempotence ;
//   D. erreurs : nouvelles tentatives (5 min / 30 min / 2 h), limite, échec définitif, « Réessayer » ;
//   E. concurrence : deux workers, bail expiré, compte rendu périmé, doublon reconnu par Brevo ;
//   F. webhook : statut de remise sans effet sur la commande ; alertes admin ;
//   G. sécurité : droits, erreurs nettoyées, panne d'outbox sans effet sur la commande, pg_net ;
//   H. invariants, purge, idempotence et rollback des migrations.
// Code de sortie 1 au premier échec constaté (après exécution complète).

import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const byStep = (n) => readdirSync(MIGRATIONS_DIR).filter((f) => new RegExp(`^\\d{14}_etape${n}_.*\\.sql$`).test(f)).sort();
const ETAPE6 = byStep(6);
const ETAPE10 = byStep(10);
const ETAPE11 = byStep(11);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const ROLLBACK11 = read('supabase/rollback/20261003_etape11_rollback.sql');
const INVARIANTS11 = read('supabase/checks/etape11_invariants.sql');
const INVARIANTS10 = read('supabase/checks/etape10_invariants.sql');
const PURGE = read('supabase/maintenance/20261003_etape10_purger_commandes_test.sql');
const BASELINE = readFileSync(path.join(HERE, 'baseline.sql'), 'utf8');
const SHARED = path.join(ROOT, 'supabase/functions/_shared/order-emails');
const { runOrderEmails } = await import(pathToFileURL(path.join(SHARED, 'worker.ts')).href);
const { sendWithBrevo } = await import(pathToFileURL(path.join(SHARED, 'brevo.ts')).href);

const PUBLIC_URL = 'https://sxlpgcnjerlayitaxxyv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_3J_jC58tHskgwggDRahQCg_q8xM_xAY';
const ADMIN = '00000000-0000-4000-8000-00000000ad00';
const NOT_ADMIN = '00000000-0000-4000-8000-0000000000b0';
const LEGACY_TABLES = ['categories', 'brands', 'products', 'product_variants', 'offers', 'offer_products'];
const TEST_EMAIL = 'test.commande@example.com';
const PREPROD_URL = 'https://preprod.example.net';

let failures = 0;
let passes = 0;
function check(cond, label, detail = '') {
  if (cond) { passes++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failures++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const section = (t) => console.log(`\n▸ ${t}`);

async function loadData() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--data');
  if (i >= 0) {
    const dir = path.resolve(args[i + 1]);
    const data = {};
    for (const t of LEGACY_TABLES) {
      try { data[t] = JSON.parse(readFileSync(path.join(dir, `${t}.json`), 'utf8')); } catch { data[t] = []; }
    }
    return data;
  }
  if (!args.includes('--live')) throw new Error('Préciser --live ou --data <dossier>.');
  const get = async (q) => {
    const r = await fetch(`${PUBLIC_URL}/rest/v1/${q}`, { headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}` } });
    if (!r.ok) throw new Error(`${q} : HTTP ${r.status}`);
    return r.json();
  };
  const data = {};
  for (const t of LEGACY_TABLES) data[t] = await get(`${t}?select=*`);
  const ids = new Set(data.products.map((p) => p.id));
  data.product_variants = data.product_variants.filter((v) => ids.has(v.product_id));
  const brands = new Set(data.brands.map((b) => b.id));
  for (const p of data.products) if (p.brand_slug && !brands.has(p.brand_slug)) p.brand_slug = null;
  return data;
}

async function newDb(data, { etape11 = true } = {}) {
  const db = new PGlite();
  await db.exec(BASELINE);
  // Rôle du worker et du webhook (clé service de Supabase).
  await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;
                 grant usage on schema public to service_role;`);
  await db.query('insert into auth.users (id) values ($1), ($2)', [ADMIN, NOT_ADMIN]);
  for (const t of LEGACY_TABLES) {
    if (!data[t]?.length) continue;
    await db.query(`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t}, $1::jsonb)`, [JSON.stringify(data[t])]);
  }
  await db.query(`insert into public.admins (user_id, note) values ($1, 'banc étape 11')`, [ADMIN]);
  for (const f of [...ETAPE6, ...ETAPE10, ...(etape11 ? ETAPE11 : [])]) await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  return db;
}

const rows = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
async function as(db, who, fn, headers = null) {
  const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === 'admin' ? ADMIN : who === 'user' ? NOT_ADMIN : '']);
  await db.query(`select set_config('request.headers', $1, false)`, [headers ? JSON.stringify(headers) : '']);
  try { return await fn(); } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.headers', '', false)`);
  }
}
async function error(promise) {
  try { await promise; return null; } catch (e) { return e.message; }
}

// ── Commandes (comme le navigateur et l'admin de l'étape 10) ───────────────
let ipCounter = 0;
const nextIp = () => ({ 'x-forwarded-for': `203.0.113.${(ipCounter++ % 250) + 1}` });
let ITEM = null;
function payload(over = {}) {
  return { idempotency_key: crypto.randomUUID(), environment: 'preprod',
    customer: { first_name: 'Aïcha', last_name: 'Test', email: TEST_EMAIL, phone: '+33 6 12 34 56 78' },
    shipping: { address_line1: '1 rue de Test', postal_code: '75001', city: 'Paris', country_code: 'FR' },
    items: [ITEM], terms_accepted: true, website: '', ...over };
}
async function create(db, over = {}, headers = nextIp()) {
  const r = await as(db, 'anon', async () => (await one(db, 'select public.create_order_request($1::jsonb) as r', [JSON.stringify(payload(over))])).r, headers);
  if (!r.ok) throw new Error(`commande refusée : ${JSON.stringify(r)}`);
  return { ...(await one(db, 'select id, status, payment_status from public.orders where public_number = $1', [r.order.number])), number: r.order.number, token: r.token };
}
async function admin(db, orderId, action, data = {}) {
  return as(db, 'admin', async () => (await one(db, 'select public.admin_update_order($1, $2, $3::jsonb) as r', [orderId, action, JSON.stringify(data)])).r);
}
async function toAwaitingPayment(db, orderId, shipping = 990, extra = {}) {
  await admin(db, orderId, 'start_review');
  for (const it of await rows(db, 'select id from public.order_items where order_id = $1', [orderId]))
    await admin(db, orderId, 'set_item_availability', { item_id: it.id, available: true });
  await admin(db, orderId, 'set_shipping', { shipping_cents: shipping, carrier: 'Colissimo' });
  await admin(db, orderId, 'request_payment', extra);
}
const emails = (db, orderId) => rows(db, `select * from orders_private.order_emails where order_id = $1 order by created_at, occurrence`, [orderId]);
const setConfig = (db, sql) => db.exec(`update orders_private.email_config set ${sql}`);
const due = (db, where = 'true') => db.exec(`update orders_private.order_emails set next_attempt_at = now() - interval '1 second' where status = 'pending' and ${where}`);

// RPC PostgREST simulé : la fonction est appelée sous le rôle service_role, comme par l'Edge Function.
const serviceRpc = (db) => async (fn, args) => {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  return as(db, 'service', async () => (await one(db, sql, keys.map((k) => args[k]))).r);
};

// Faux Brevo : enregistre chaque requête ; dédoublonne par idempotencyKey (30 min) comme l'API réelle.
function fakeBrevo() {
  const state = { requests: [], delivered: new Map(), next: [] };
  state.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    state.requests.push({ url, headers: init.headers, body });
    const forced = state.next.shift();
    if (forced) return new Response(JSON.stringify(forced.body ?? {}), { status: forced.status });
    const key = body.headers.idempotencyKey;
    if (state.delivered.has(key)) return new Response(JSON.stringify({ code: 'duplicate_parameter', message: 'duplicate' }), { status: 400 });
    const messageId = `<2026100312.${state.delivered.size + 1}@smtp-relay.mailin.fr>`;
    state.delivered.set(key, { messageId, to: body.to[0].email, subject: body.subject, html: body.htmlContent, text: body.textContent, tag: body.tags[1] });
    return new Response(JSON.stringify({ messageId }), { status: 201 });
  };
  return state;
}
// Passe(s) du worker jusqu'à épuisement de la file due (comme les réveils successifs) ; totaux cumulés.
async function worker(db, brevo, over = {}) {
  const total = { claimed: 0, sent: 0, retry: 0, failed: 0, skipped: 0, report_errors: 0 };
  for (let i = 0; i < 20; i++) {
    const s = await workerOnce(db, brevo, over);
    for (const k of Object.keys(total)) total[k] += s[k];
    if (s.claimed === 0) break;
  }
  return total;
}
function workerOnce(db, brevo, over = {}) {
  return runOrderEmails({
    rpc: serviceRpc(db),
    send: (email) => sendWithBrevo({ apiKey: 'fake_test_key', senderEmail: 'expediteur@example.com', senderName: 'Dar Nūr', replyToEmail: null, fetch: brevo.fetch }, email),
    testRecipients: [TEST_EMAIL],
    allowProduction: false,
    replyToConfigured: false,
    log: () => {},
    ...over,
  });
}

async function main() {
  const data = await loadData();
  console.log(`Banc étape 11 — ${data.products.length} produits, migrations : ${ETAPE11.join(', ')}`);
  const db = await newDb(data);
  const p = await one(db, `select p.id, p.price_value from public.products p where p.status = 'published' and p.availability = 'available' and p.price_value > 0
    and not exists (select 1 from public.product_variants v where v.product_id = p.id)
    and not exists (select 1 from public.offer_products op join public.offers o on o.id = op.offer_id where op.product_id = p.id and o.type = 'product_promo')
    order by p.slug limit 1`);
  ITEM = { product_id: p.id, variant_id: null, quantity: 2, unit_price_cents: Math.round(Number(p.price_value) * 100) };

  // ── A. Mise en file ─────────────────────────────────────────────────────
  section('A. Mise en file (trigger sur order_events)');
  const cfg0 = await one(db, 'select * from orders_private.email_config');
  check(cfg0.sending_enabled === false && cfg0.production_sending_enabled === false && cfg0.test_recipients.length === 0 && cfg0.worker_url === null,
    'défauts sûrs : envoi coupé, production coupée, aucune adresse de test, aucun worker');
  const o1 = await create(db);
  let e = await emails(db, o1.id);
  const created = await one(db, `select id from public.order_events where order_id = $1 and type = 'created'`, [o1.id]);
  check(e.length === 1 && e[0].email_type === 'order_received' && e[0].status === 'pending' && e[0].environment === 'preprod' && e[0].event_id == created.id,
    'commande créée → 1 e-mail « order_received » en attente, lié à l’événement « created »');
  check(!('recipient_email' in e[0]) && !Object.keys(e[0]).some((k) => /html|body|subject|content/.test(k)), 'outbox : ni adresse, ni contenu stockés');
  await admin(db, o1.id, 'start_review');
  for (const it of await rows(db, 'select id from public.order_items where order_id = $1', [o1.id]))
    await admin(db, o1.id, 'set_item_availability', { item_id: it.id, available: true });
  await admin(db, o1.id, 'set_shipping', { shipping_cents: 990, carrier: 'Colissimo' });
  await admin(db, o1.id, 'set_note', { note: 'note interne' });
  check((await emails(db, o1.id)).length === 1, 'vérification, disponibilités, livraison, note : aucun e-mail');
  await admin(db, o1.id, 'request_payment', {});
  e = await emails(db, o1.id);
  check(e.length === 2 && e[1].email_type === 'payment_requested' && e[1].occurrence === 1, 'paiement demandé → « payment_requested » (occurrence 1)');
  await admin(db, o1.id, 'reopen_review');
  await admin(db, o1.id, 'set_shipping', { shipping_cents: 1290, carrier: 'Colissimo' });
  await admin(db, o1.id, 'request_payment', {});
  e = await emails(db, o1.id);
  check(e.length === 3 && e[1].status === 'skipped' && e[1].last_error === 'superseded' && e[2].occurrence === 2 && e[2].status === 'pending',
    'nouvelle demande de paiement (nouveau total) → occurrence 2, l’ancienne non partie est abandonnée « superseded »');
  const before = await one(db, 'select status, payment_status, updated_at from public.orders where id = $1', [o1.id]);
  await admin(db, o1.id, 'confirm_payment', {});
  e = await emails(db, o1.id);
  check(e.length === 4 && e[3].email_type === 'payment_confirmed', 'paiement confirmé (manuel) → « payment_confirmed »');
  await admin(db, o1.id, 'start_preparation');
  await admin(db, o1.id, 'set_tracking', { carrier: 'Colissimo', service: 'Suivi', tracking_number: '6A123', tracking_url: 'https://www.laposte.fr/outils/suivre-vos-envois?code=6A123' });
  check((await emails(db, o1.id)).length === 4, 'préparation et suivi : aucun e-mail');
  await admin(db, o1.id, 'mark_shipped');
  e = await emails(db, o1.id);
  check(e.length === 5 && e[4].email_type === 'order_shipped', 'expédiée → « order_shipped »');
  await admin(db, o1.id, 'mark_completed');
  check((await emails(db, o1.id)).length === 5, 'livrée : aucun e-mail (hors périmètre)');
  check(before.status === 'awaiting_payment', 'la mise en file n’a modifié aucun statut (workflow de l’étape 10 inchangé)');

  const oc = await create(db);
  await admin(db, oc.id, 'cancel', { reason: 'test annulation' });
  check((await emails(db, oc.id)).map((x) => x.email_type).join() === 'order_received', 'annulation : aucun e-mail d’annulation (hors périmètre)');

  const dupErr = await error(db.query(`insert into orders_private.order_emails (order_id, event_id, email_type, environment) values ($1, $2, 'order_received', 'preprod')`, [o1.id, created.id]));
  check(/uq_order_emails_event|duplicate key/.test(dupErr ?? ''), 'unicité : un événement → un seul e-mail');
  const other = await one(db, `select id from public.order_events where order_id = $1 and type = 'note_set'`, [o1.id]);
  const occErr = await error(db.query(`insert into orders_private.order_emails (order_id, event_id, email_type, environment) values ($1, $2, 'order_received', 'preprod')`, [o1.id, other.id]));
  check(/uq_order_emails_occurrence|duplicate key/.test(occErr ?? ''), 'unicité : (commande, type, occurrence)');
  const occ2Err = await error(db.query(`insert into orders_private.order_emails (order_id, event_id, email_type, occurrence, environment) values ($1, $2, 'payment_confirmed', 2, 'preprod')`, [o1.id, other.id]));
  check(/chk_order_emails_occ/.test(occ2Err ?? ''), 'seul « payment_requested » peut avoir plusieurs occurrences');
  check(/chk_order_emails_type/.test(await error(db.query(`insert into orders_private.order_emails (order_id, event_id, email_type, environment) values ($1, $2, 'promo', 'preprod')`, [o1.id, other.id])) ?? ''),
    'type libre refusé (4 valeurs contrôlées)');

  // ── B. Garde-fous ───────────────────────────────────────────────────────
  section('B. Garde-fous avant envoi');
  const brevo = fakeBrevo();
  let s = await worker(db, brevo);
  check(s.claimed === 0 && brevo.requests.length === 0, 'interrupteur général coupé → rien réclamé, rien envoyé');
  await setConfig(db, `sending_enabled = true`);
  s = await worker(db, brevo);
  e = await emails(db, oc.id);
  check(s.claimed === 0 && brevo.requests.length === 0 && e[0].status === 'skipped' && e[0].last_error === 'recipient_not_allowlisted',
    'liste de test vide → aucun envoi, e-mails de test abandonnés « recipient_not_allowlisted »', `${(await one(db, `select count(*)::int n from orders_private.order_emails where last_error = 'recipient_not_allowlisted'`)).n} ligne(s)`);
  await db.exec(`update orders_private.order_emails set status = 'pending', last_error = null where last_error = 'recipient_not_allowlisted'`);
  await setConfig(db, `test_recipients = '{${TEST_EMAIL}}'`);
  s = await worker(db, brevo);
  check(brevo.requests.length === 0 && (await one(db, `select count(*)::int n from orders_private.order_emails where last_error = 'site_url_missing'`)).n > 0,
    'URL du site de test absente → aucun envoi (« site_url_missing »)');
  await db.exec(`update orders_private.order_emails set status = 'pending', last_error = null where last_error = 'site_url_missing'`);
  await setConfig(db, `site_url_test = '${PREPROD_URL}'`);
  check(/chk_email_config_recipients/.test(await error(setConfig(db, `test_recipients = '{Test@Example.com}'`)) ?? ''), 'liste de test : minuscules imposées');
  check(/chk_email_config_worker/.test(await error(setConfig(db, `worker_url = 'https://evil.example/x'`)) ?? ''), 'URL du worker : projet Supabase seulement');

  // ── C. Worker de bout en bout ───────────────────────────────────────────
  section('C. Worker (faux Brevo)');
  s = await worker(db, brevo);
  e = await emails(db, o1.id);
  const byType = Object.fromEntries(e.map((x) => [`${x.email_type}:${x.occurrence}`, x]));
  check(byType['order_received:1'].status === 'sent' && byType['payment_confirmed:1'].status === 'sent' && byType['order_shipped:1'].status === 'sent',
    'commande expédiée : « reçue », « paiement reçu », « expédiée » envoyés', JSON.stringify(s));
  check(byType['payment_requested:2'].status === 'skipped' && byType['payment_requested:2'].last_error === 'obsolete',
    '« paiement demandé » devenu sans objet (déjà payée) → non envoyé');
  check(byType['order_received:1'].provider_message_id?.startsWith('<2026100312.') && byType['order_received:1'].sent_at !== null, 'provider_message_id et sent_at enregistrés');
  const cancelledMail = (await emails(db, oc.id))[0];
  check(cancelledMail.status === 'skipped' && cancelledMail.last_error === 'obsolete', 'commande annulée avant envoi → « commande reçue » non envoyé');
  const sentOrder = [...brevo.delivered.values()].map((d) => d.tag);
  check(sentOrder.join() === 'order_received,payment_confirmed,order_shipped', 'ordre chronologique respecté', sentOrder.join(' → '));
  const shippedMail = [...brevo.delivered.values()].find((d) => d.tag === 'order_shipped');
  const tok = o1.token;
  check(shippedMail.to === TEST_EMAIL && shippedMail.subject === `[TEST] Dar Nūr — Commande ${o1.number} expédiée`, 'destinataire de test, objet marqué [TEST]');
  check(shippedMail.text.includes(`${PREPROD_URL}/suivi/#${tok}`) && shippedMail.html.includes(`href="${PREPROD_URL}/suivi/#${tok}"`), 'lien de suivi = /suivi/#<jeton de la commande> (jeton dans le fragment)');
  check(shippedMail.text.includes('Numéro de suivi : 6A123') && shippedMail.html.includes('laposte.fr'), 'transporteur et suivi repris de la commande');
  const paidMail = [...brevo.delivered.values()].find((d) => d.tag === 'payment_confirmed');
  const total = (await one(db, 'select total_cents from public.orders where id = $1', [o1.id])).total_cents;
  const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(total / 100);
  check(paidMail.text.includes(`Total payé : ${eur}`), 'montant payé = total de la commande (livraison 12,90 € comprise)', eur);
  const leaks = [o1.id, 'rue de Test', '+33', 'note interne', '75001'].filter((x) => [...brevo.delivered.values()].some((d) => d.html.includes(x) || d.text.includes(x)));
  check(leaks.length === 0, 'aucune adresse, téléphone, note interne ni UUID de commande dans les e-mails', leaks.join());
  const evts = await rows(db, `select type, notified_at, details from public.order_events where order_id = $1 order by id`, [o1.id]);
  const notified = evts.filter((x) => x.type === 'customer_notified');
  check(notified.length === 3 && notified.every((x) => x.details.channel === 'email'), 'journal : 3 « customer_notified » (canal e-mail)');
  check(evts.find((x) => x.type === 'created').notified_at !== null, 'événement « created » marqué prévenu automatiquement');
  const after = await one(db, 'select status, payment_status from public.orders where id = $1', [o1.id]);
  check(after.status === 'completed' && after.payment_status === 'paid', 'statut et paiement de la commande inchangés par les envois');
  const n = brevo.requests.length;
  s = await worker(db, brevo);
  check(s.claimed === 0 && brevo.requests.length === n, 'deuxième passage : rien n’est renvoyé (idempotence)');

  // Paiement demandé envoyé quand la commande l'attend, avec lien de paiement sur le suivi.
  const o2 = await create(db);
  await worker(db, brevo);
  await toAwaitingPayment(db, o2.id, 0, { payment_url: 'https://pay.example.com/c/123', payment_provider: 'lien' });
  await worker(db, brevo);
  const reqMail = [...brevo.delivered.values()].find((d) => d.tag === 'payment_requested');
  check(reqMail && reqMail.text.includes('Livraison : 0,00') && reqMail.text.includes('disponible sur votre page de suivi') && !reqMail.html.includes('pay.example.com'),
    '« paiement demandé » : livraison 0 €, renvoi vers le suivi, URL de paiement jamais dans l’e-mail');

  // ── D. Erreurs et nouvelles tentatives ──────────────────────────────────
  section('D. Erreurs, nouvelles tentatives, « Réessayer »');
  const o3 = await create(db);
  brevo.next.push({ status: 500, body: { code: 'internal' } });
  await worker(db, brevo);
  let m = (await emails(db, o3.id))[0];
  const minutes = (row) => Math.round((new Date(row.next_attempt_at) - Date.now()) / 60000);
  check(m.status === 'pending' && m.attempts === 1 && m.last_error === 'brevo_500_internal' && minutes(m) === 5, 'erreur 500 → nouvelle tentative dans 5 min', `${minutes(m)} min`);
  s = await worker(db, brevo);
  check(s.claimed === 0, 'pas de nouvelle tentative avant l’échéance');
  const delays = [];
  for (let i = 0; i < 3; i++) {
    await due(db, `order_id = '${o3.id}'`);
    brevo.next.push({ status: 503, body: {} });
    await worker(db, brevo);
    m = (await emails(db, o3.id))[0];
    delays.push(m.status === 'pending' ? `${minutes(m)} min` : m.status);
  }
  check(delays.join(', ') === '30 min, 120 min, failed' && m.attempts === 4, 'tentatives : immédiate, +5 min, +30 min, +2 h, puis « failed » (pas de boucle)', delays.join(', '));
  await due(db);
  s = await worker(db, brevo);
  check(s.claimed === 0 && (await emails(db, o3.id))[0].status === 'failed', 'un e-mail « failed » n’est plus jamais réclamé automatiquement');
  const countBefore = (await one(db, 'select count(*)::int n from orders_private.order_emails')).n;
  const retry = await as(db, 'admin', async () => (await one(db, 'select public.admin_retry_order_email($1) as r', [m.id])).r);
  m = (await emails(db, o3.id))[0];
  check(retry.ok && m.status === 'pending' && m.attempts === 0 && (await one(db, 'select count(*)::int n from orders_private.order_emails')).n === countBefore,
    '« Réessayer » : même ligne remise en file, compteur remis à zéro, aucune ligne créée');
  await worker(db, brevo);
  m = (await emails(db, o3.id))[0];
  check(m.status === 'sent' && [...brevo.delivered.keys()].filter((k) => k === m.id).length === 1, 'renvoi réussi, une seule remise réelle');
  check(/dn:email_already_sent/.test(await error(as(db, 'admin', () => db.query('select public.admin_retry_order_email($1)', [m.id]))) ?? ''), '« Réessayer » sur un e-mail envoyé → refusé');
  const superseded = (await emails(db, o1.id)).find((x) => x.last_error === 'superseded');
  const obsolete = (await emails(db, o1.id)).find((x) => x.last_error === 'obsolete');
  check(/dn:email_obsolete/.test(await error(as(db, 'admin', () => db.query('select public.admin_retry_order_email($1)', [obsolete.id]))) ?? ''), '« Réessayer » sur un e-mail devenu sans objet → refusé');
  check(/dn:email_superseded/.test(await error(as(db, 'admin', () => db.query('select public.admin_retry_order_email($1)', [superseded.id]))) ?? ''), '« Réessayer » sur une demande de paiement remplacée → refusé');

  const o4 = await create(db);
  brevo.next.push({ status: 400, body: { code: 'invalid_parameter', message: `bad ${TEST_EMAIL}` } });
  await worker(db, brevo);
  m = (await emails(db, o4.id))[0];
  check(m.status === 'failed' && m.attempts === 1 && m.last_error === 'brevo_400_invalid_parameter', 'requête refusée (400) → échec définitif immédiat, sans adresse dans l’erreur');
  await as(db, 'admin', () => db.query('select public.admin_retry_order_email($1)', [m.id]));

  // ── E. Concurrence ──────────────────────────────────────────────────────
  section('E. Concurrence et reprise');
  const o5 = await create(db);
  const rpc = serviceRpc(db);
  const claimA = await rpc('order_emails_claim', { p_limit: 10 });
  const claimB = await rpc('order_emails_claim', { p_limit: 10 });
  const mineA = claimA.filter((j) => j.order.number === o5.number);
  check(mineA.length === 1 && claimB.length === 0, 'deux workers simultanés : la ligne n’est remise qu’à un seul (bail + SKIP LOCKED)');
  check(mineA[0].recipient.email === TEST_EMAIL && !('id' in mineA[0].order) && !JSON.stringify(mineA[0]).includes('rue de Test'), 'données réclamées : minimales (ni UUID de commande, ni adresse)');
  // Le worker A envoie puis « meurt » avant son compte rendu : le bail expire, B reprend.
  await sendWithBrevo({ apiKey: 'fake_test_key', senderEmail: 'expediteur@example.com', senderName: 'Dar Nūr', replyToEmail: null, fetch: brevo.fetch },
    { to: TEST_EMAIL, subject: 's', html: '<p>x</p>', text: 'x', tag: 'order_received', idempotencyKey: mineA[0].id });
  await db.exec(`update orders_private.order_emails set locked_until = now() - interval '1 second' where id = '${mineA[0].id}'`);
  s = await worker(db, brevo);
  m = (await emails(db, o5.id))[0];
  check(m.status === 'sent' && m.provider_message_id === null && m.last_error === 'duplicate_at_provider' && m.attempts === 2,
    'reprise après bail expiré : Brevo reconnaît le doublon (idempotencyKey) → compté envoyé, aucune 2ᵉ remise');
  check([...brevo.delivered.keys()].filter((k) => k === mineA[0].id).length === 1, 'une seule remise réelle au destinataire');
  const late = await rpc('order_emails_report', { p_id: mineA[0].id, p_claim_id: mineA[0].claim_id, p_outcome: 'sent', p_message_id: '<late@x>', p_error: null });
  check(late.ok === false && late.error === 'stale_claim' && (await emails(db, o5.id))[0].provider_message_id === null, 'compte rendu tardif du worker A (bail repris) → refusé');
  const o6 = await create(db);
  await db.exec(`update orders_private.order_emails set status = 'sending', claim_id = gen_random_uuid(), locked_until = now() - interval '1 minute', attempts = 4 where order_id = '${o6.id}'`);
  await worker(db, brevo);
  m = (await emails(db, o6.id))[0];
  check(m.status === 'failed' && m.last_error === 'lease_expired_after_last_attempt', 'bail expiré après la 4ᵉ tentative → « failed » (pas de boucle)');
  const o7 = await create(db);
  await db.exec(`update orders_private.order_emails set queued_at = now() - interval '49 hours' where order_id = '${o7.id}'`);
  await worker(db, brevo);
  check((await emails(db, o7.id))[0].last_error === 'expired', 'en file depuis plus de 48 h → non envoyé (« expired »), relançable à la main');

  // Garde-fous propres au worker (en plus de la base).
  const o8 = await create(db, { customer: { first_name: 'Autre', last_name: 'Test', email: 'autre@example.com', phone: '+33 6 12 34 56 78' } });
  await setConfig(db, `test_recipients = '{${TEST_EMAIL},autre@example.com}'`);
  await worker(db, brevo);
  m = (await emails(db, o8.id))[0];
  check(m.status === 'skipped' && m.last_error === 'recipient_not_allowlisted_worker' && ![...brevo.delivered.values()].some((d) => d.to === 'autre@example.com'),
    'adresse autorisée en base mais pas dans le secret de la fonction → non envoyé');
  await setConfig(db, `test_recipients = '{${TEST_EMAIL}}'`);
  await db.exec(`update orders_private.config set production_ordering_open = true`);
  const op = await create(db, { environment: 'production' }, { ...nextIp(), origin: 'https://dar-nur.fr' });
  await db.exec(`update orders_private.config set production_ordering_open = false`);
  await worker(db, brevo);
  check((await emails(db, op.id))[0].last_error === 'production_sending_disabled', 'commande de production, envoi production coupé en base → non envoyé');
  await setConfig(db, `production_sending_enabled = true`);
  await db.exec(`update orders_private.order_emails set status = 'pending', last_error = null where order_id = '${op.id}'`);
  await worker(db, brevo);
  m = (await emails(db, op.id))[0];
  check(m.last_error === 'production_disabled_worker' && !brevo.delivered.has(m.id),
    'production ouverte en base mais pas dans la fonction (ORDER_EMAILS_ALLOW_PRODUCTION) → non envoyé');
  await setConfig(db, `production_sending_enabled = false`);

  // ── F. Webhook de remise ────────────────────────────────────────────────
  section('F. Statut de remise (webhook Brevo) et alertes');
  const target = (await emails(db, o1.id)).find((x) => x.email_type === 'order_received');
  const statusBefore = await one(db, 'select status, payment_status, updated_at from public.orders where id = $1', [o1.id]);
  let d = await rpc('order_emails_delivery_event', { p_message_id: target.provider_message_id, p_event: 'hard_bounce', p_at: new Date().toISOString() });
  check(d.ok && d.matched === 1 && (await emails(db, o1.id)).find((x) => x.id === target.id).delivery_status === 'hard_bounce', 'hard_bounce enregistré');
  d = await rpc('order_emails_delivery_event', { p_message_id: target.provider_message_id, p_event: 'delivered', p_at: null });
  check(d.matched === 0 && (await emails(db, o1.id)).find((x) => x.id === target.id).delivery_status === 'hard_bounce', '« delivered » tardif n’efface pas un rebond définitif');
  const other2 = (await emails(db, o1.id)).find((x) => x.email_type === 'order_shipped');
  await rpc('order_emails_delivery_event', { p_message_id: other2.provider_message_id, p_event: 'deferred', p_at: null });
  await rpc('order_emails_delivery_event', { p_message_id: other2.provider_message_id, p_event: 'delivered', p_at: null });
  check((await emails(db, o1.id)).find((x) => x.id === other2.id).delivery_status === 'delivered', 'report temporaire puis « delivered » → delivered');
  d = await rpc('order_emails_delivery_event', { p_message_id: '<inconnu@x>', p_event: 'hard_bounce', p_at: null });
  check(d.ok && d.matched === 0, 'message-id inconnu → sans effet');
  d = await rpc('order_emails_delivery_event', { p_message_id: target.provider_message_id, p_event: 'opened', p_at: null });
  check(d.ok === false && d.error === 'event_ignored', 'événement de suivi marketing (ouverture) ignoré');
  const statusAfter = await one(db, 'select status, payment_status, updated_at from public.orders where id = $1', [o1.id]);
  check(JSON.stringify(statusBefore) === JSON.stringify(statusAfter), 'le webhook ne modifie JAMAIS la commande (statut, paiement, updated_at)');
  const alerts = await as(db, 'admin', async () => (await one(db, 'select public.admin_order_email_alerts() as r')).r);
  check(alerts.includes(o1.id) && alerts.includes(o6.id), 'alertes admin : rebond définitif et échec signalés');
  const view = await as(db, 'admin', async () => (await one(db, 'select public.admin_order_emails($1) as r', [o1.id])).r);
  check(view.sending_enabled === true && view.environment_enabled === true && view.emails.length === 5 && view.emails[0].delivery_status === 'hard_bounce' && !JSON.stringify(view).includes('@'),
    'bloc admin : 5 notifications, statuts, sans adresse e-mail');

  // ── G. Sécurité ─────────────────────────────────────────────────────────
  section('G. Sécurité');
  for (const who of ['anon', 'user', 'admin']) {
    for (const call of [`public.order_emails_claim(1)`, `public.order_emails_report('${m.id}', '${m.id}', 'sent')`, `public.order_emails_delivery_event('<a@x>', 'delivered')`])
      check(/permission denied/.test(await error(as(db, who, () => db.query(`select ${call}`))) ?? ''), `${who} : ${call.split('(')[0]} refusé`);
  }
  await as(db, 'anon', async () => {
    check(/permission denied/.test(await error(db.query('select * from orders_private.order_emails')) ?? ''), 'anon : outbox illisible');
    check(/permission denied/.test(await error(db.query(`select public.admin_order_emails('${o1.id}')`)) ?? ''), 'anon : bloc admin refusé');
    check(/permission denied/.test(await error(db.query(`select public.admin_retry_order_email('${m.id}')`)) ?? ''), 'anon : « Réessayer » refusé');
  });
  await as(db, 'user', async () => {
    check(/dn:forbidden/.test(await error(db.query(`select public.admin_order_emails('${o1.id}')`)) ?? ''), 'authentifié non admin : bloc admin refusé');
    check(/dn:forbidden/.test(await error(db.query(`select public.admin_retry_order_email('${m.id}')`)) ?? ''), 'authentifié non admin : « Réessayer » refusé');
    check(/permission denied/.test(await error(db.query('select * from orders_private.email_config')) ?? ''), 'authentifié : configuration illisible');
  });
  await as(db, 'service', async () => {
    check(/permission denied/.test(await error(db.query(`select public.admin_retry_order_email('${m.id}')`)) ?? ''), 'service_role : fonctions admin refusées');
    check(/permission denied/.test(await error(db.query('select * from orders_private.order_emails')) ?? ''), 'service_role : aucune lecture directe de l’outbox');
    check(/permission denied/.test(await error(db.query(`update public.orders set status = 'paid'`)) ?? ''), 'service_role (worker) : aucune écriture de commande');
  });
  const o9 = await create(db);
  const claim9 = (await rpc('order_emails_claim', { p_limit: 10 })).find((j) => j.order.number === o9.number);
  await rpc('order_emails_report', { p_id: claim9.id, p_claim_id: claim9.claim_id, p_outcome: 'retry', p_message_id: null,
    p_error: `Unauthorized key xkeysib-0123456789abcdef-XYZ for ${TEST_EMAIL}\n eyJhbGciOiJIUzI1NiJ9.e30.sig` });
  m = (await emails(db, o9.id))[0];
  check(m.last_error === 'Unauthorized key [secret] for [email] [secret]', 'erreur nettoyée : ni clé, ni adresse, ni JWT, ni retour à la ligne', m.last_error);
  check(/dn:invalid_outcome/.test(await error(rpc('order_emails_report', { p_id: m.id, p_claim_id: m.id, p_outcome: 'delivered', p_message_id: null, p_error: null })) ?? ''), 'compte rendu : issue hors liste refusée');

  // Panne de l'outbox : la commande passe quand même (et le contrôle la signale).
  await db.exec(`alter table orders_private.order_emails add constraint test_panne check (false) not valid`);
  let ok = true;
  let oFail;
  try { oFail = await create(db); } catch { ok = false; }
  await db.exec(`alter table orders_private.order_emails drop constraint test_panne`);
  check(ok && (await emails(db, oFail.id)).length === 0, 'outbox en panne → la commande est quand même enregistrée (aucun blocage métier)');
  let inv = Object.fromEntries((await rows(db, INVARIANTS11)).map((r) => [r.check_name, r]));
  check(inv.every_event_enqueued.ok === false, 'le contrôle every_event_enqueued signale l’événement sans e-mail');
  await db.exec(`insert into orders_private.order_emails (order_id, event_id, email_type, environment)
                 select order_id, id, 'order_received', 'preprod' from public.order_events where order_id = '${oFail.id}' and type = 'created'`);

  // Réveil immédiat par pg_net (simulé) : URL, jeton Vault, aucune incidence sur la commande.
  await db.exec(`create schema if not exists net; create schema if not exists vault;
    create table net.calls (url text, body jsonb, headers jsonb, timeout_milliseconds int);
    create table net.fail (on_ boolean); insert into net.fail values (false);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
      returns bigint language plpgsql as $f$ begin
        if (select on_ from net.fail) then raise exception 'pg_net en panne'; end if;
        insert into net.calls values (url, body, headers, timeout_milliseconds); return 1; end $f$;
    create table vault.decrypted_secrets (name text, decrypted_secret text, created_at timestamptz default now());`);
  const o10 = await create(db);
  check((await one(db, 'select count(*)::int n from net.calls')).n === 0, 'sans worker_url : aucun appel réseau');
  await setConfig(db, `worker_url = 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/order-emails'`);
  await create(db);
  check((await one(db, 'select count(*)::int n from net.calls')).n === 0, 'sans jeton dans Vault : aucun appel réseau');
  await db.exec(`insert into vault.decrypted_secrets (name, decrypted_secret) values ('order_emails_worker_secret', '${'s'.repeat(48)}')`);
  await create(db);
  const call = await one(db, 'select * from net.calls');
  check(call?.url === 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/order-emails' && call.headers.Authorization === `Bearer ${'s'.repeat(48)}` && call.body.reason === 'event' && call.timeout_milliseconds === 5000,
    'événement → réveil immédiat de l’Edge Function (pg_net, jeton lu dans Vault, sans données de commande)');
  check(!JSON.stringify(call.body).includes('@') && Object.keys(call.body).join() === 'reason', 'le réveil ne transporte aucune donnée personnelle');
  await db.exec(`update orders_private.order_emails set next_attempt_at = now() + interval '1 hour' where status = 'pending'`);
  const cronKick = await one(db, `select orders_private.kick_order_email_worker('cron', true) as k`);
  await due(db);
  const cronKick2 = await one(db, `select orders_private.kick_order_email_worker('cron', true) as k`);
  check(cronKick.k === false && cronKick2.k === true, 'rattrapage : réveil seulement si un e-mail est dû', `rien dû → ${cronKick.k}, dû → ${cronKick2.k}`);
  await db.exec(`update net.fail set on_ = true`);
  ok = true;
  try { await create(db); } catch { ok = false; }
  check(ok, 'pg_net en panne → la commande est quand même enregistrée');
  await db.exec(`update net.fail set on_ = false`);
  await setConfig(db, `sending_enabled = false`);
  const calls = (await one(db, 'select count(*)::int n from net.calls')).n;
  await create(db);
  check((await one(db, 'select count(*)::int n from net.calls')).n === calls, 'interrupteur coupé → aucun réveil');
  void o10;

  // ── H. Invariants, purge, idempotence, rollback ─────────────────────────
  section('H. Invariants, purge, idempotence, rollback');
  for (const row of await rows(db, INVARIANTS11)) check(row.ok === true, `invariant 11 : ${row.check_name}`, row.detail ?? '');
  for (const row of await rows(db, INVARIANTS10)) check(row.ok === true, `invariant 10 (inchangé) : ${row.check_name}`, row.detail ?? '');
  let rerun = true;
  try { for (const f of ETAPE11) await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')); } catch (err) { rerun = false; console.log(`    ${err.message}`); }
  const cfg1 = await one(db, 'select * from orders_private.email_config');
  check(rerun && cfg1.test_recipients.join() === TEST_EMAIL && cfg1.site_url_test === PREPROD_URL, 'migrations 11 rejouables, configuration conservée');
  const victims = [o3.number, o4.number];
  const before2 = (await one(db, 'select count(*)::int n from orders_private.order_emails')).n;
  await db.exec(PURGE.replace(/array\[[^\]]*\]::text\[\]/, `array[${victims.map((x) => `'${x}'`).join(', ')}]::text[]`));
  const after2 = (await one(db, 'select count(*)::int n from orders_private.order_emails')).n;
  check(after2 === before2 - 2 && (await one(db, `select count(*)::int n from orders_private.order_emails m left join public.orders o on o.id = m.order_id where o.id is null`)).n === 0,
    'purge des commandes de test : leurs e-mails disparaissent avec elles', `${before2} → ${after2}`);

  const db2 = await newDb(data);
  const fresh = await newDb(data, { etape11: false });
  await db2.exec(ROLLBACK11);
  const shape = async (x) => JSON.stringify(await rows(x, `select table_schema, table_name, column_name from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema') order by 1, 2, 3`)) +
    JSON.stringify(await rows(x, `select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'orders_private') order by 1, 2`)) +
    JSON.stringify(await rows(x, `select tgname from pg_trigger where not tgisinternal order by 1`));
  check(await shape(db2) === await shape(fresh), 'rollback 11 : schéma identique à l’état d’après l’étape 10');
  let reapply = true;
  try { for (const f of ETAPE11) await db2.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')); } catch (err) { reapply = false; console.log(`    ${err.message}`); }
  check(reapply, 'réapplication après rollback');

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${passes} contrôle(s) réussi(s), ${failures} échec(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
