// Banc d'essai de l'étape 10 (commandes) — hors ligne, sans aucun secret.
//
//   node orders.mjs --live              catalogue PUBLIC lu avec la clé publique (CI)
//   node orders.mjs --data <dossier>    sauvegarde JSON complète, en local
//
// PGlite chargé avec baseline.sql (schéma de production figé avant l'étape 6) + données,
// puis migrations étape 6 et étape 10. Scénarios rejoués avec les VRAIS rôles :
// anon (navigateur), authenticated non admin, admin (public.admins).
//   A. métier : produit simple, miel/contenance, qamis/taille, plusieurs lignes, France,
//      international, coming_soon, produit devenu indisponible, prix modifié, double soumission ;
//   B. paiement et expédition : non demandé → demandé → payé → expédié, refus d'expédier
//      sans paiement (fonction ET écriture directe en superutilisateur), annulation, remboursement dû ;
//   C. sécurité : RLS, droits, prix/produit/variante falsifiés, quantités, taille, injection,
//      jeton invalide, pot de miel, limitation de débit, environnement usurpé ;
//   D. idempotence et rollback des migrations.
// Code de sortie 1 au premier échec.

import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const ETAPE6 = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{14}_etape6_.*\.sql$/.test(f)).sort();
const ETAPE10 = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{14}_etape10_.*\.sql$/.test(f)).sort();
const ROLLBACK = readFileSync(path.join(ROOT, 'supabase/rollback/20261003_etape10_rollback.sql'), 'utf8');
const INVARIANTS = readFileSync(path.join(ROOT, 'supabase/checks/etape10_invariants.sql'), 'utf8');
const BASELINE = readFileSync(path.join(HERE, 'baseline.sql'), 'utf8');
const COUNTRIES_TS = readFileSync(path.join(ROOT, 'site/src/config/countries.ts'), 'utf8');

const PUBLIC_URL = 'https://sxlpgcnjerlayitaxxyv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_3J_jC58tHskgwggDRahQCg_q8xM_xAY';
const ADMIN = '00000000-0000-4000-8000-00000000ad00';
const NOT_ADMIN = '00000000-0000-4000-8000-0000000000b0';
const LEGACY_TABLES = ['categories', 'brands', 'products', 'product_variants', 'offers', 'offer_products'];

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

async function newDb(data, { etape10 = true } = {}) {
  const db = new PGlite();
  await db.exec(BASELINE);
  await db.query('insert into auth.users (id) values ($1), ($2)', [ADMIN, NOT_ADMIN]);
  for (const t of LEGACY_TABLES) {
    if (!data[t]?.length) continue;
    await db.query(`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t}, $1::jsonb)`, [JSON.stringify(data[t])]);
  }
  await db.query(`insert into public.admins (user_id, note) values ($1, 'banc étape 10')`, [ADMIN]);
  for (const f of ETAPE6) await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  if (etape10) for (const f of ETAPE10) await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  return db;
}

const rows = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
async function as(db, who, fn, headers = null) {
  const role = who === 'anon' ? 'anon' : 'authenticated';
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

// ── Construction des requêtes (comme le navigateur) ─────────────────────────
let ipCounter = 0;
const nextIp = () => ({ 'x-forwarded-for': `203.0.113.${(ipCounter++ % 250) + 1}` });
const customer = (over = {}) => ({ first_name: 'Test', last_name: 'Commande', email: 'test.commande@example.com', phone: '+33 6 12 34 56 78', ...over });
const frAddress = (over = {}) => ({ address_line1: '1 rue de Test', postal_code: '75001', city: 'Paris', country_code: 'FR', ...over });
function payload(items, over = {}) {
  return { idempotency_key: crypto.randomUUID(), environment: 'preprod', customer: customer(), shipping: frAddress(),
    items, terms_accepted: true, website: '', ...over };
}
async function create(db, body, headers = nextIp()) {
  return as(db, 'anon', async () => (await one(db, 'select public.create_order_request($1::jsonb) as r', [JSON.stringify(body)])).r, headers);
}
async function admin(db, orderId, action, data = {}) {
  return as(db, 'admin', async () => (await one(db, 'select public.admin_update_order($1, $2, $3::jsonb) as r', [orderId, action, JSON.stringify(data)])).r);
}
async function track(db, token) {
  return as(db, 'anon', async () => (await one(db, 'select public.get_order_tracking($1) as r', [token])).r);
}
async function orderOf(db, number) {
  return one(db, 'select * from public.orders where public_number = $1', [number]);
}

async function main() {
  const data = await loadData();
  console.log(`Banc étape 10 — ${data.products.length} produits, migrations : ${ETAPE10.join(', ')}`);
  const db = await newDb(data);

  // Produits témoins, choisis dans les données réelles.
  const line = async (where, variantWhere = null, quantity = 1) => {
    const p = await one(db, `select p.id, p.slug, p.price_value from public.products p where ${where} order by p.slug limit 1`);
    if (!p) throw new Error(`aucun produit pour : ${where}`);
    let v = null;
    if (variantWhere) {
      v = await one(db, `select v.id, v.price from public.product_variants v where v.product_id = $1 and v.active and ${variantWhere} order by v.sort_order limit 1`, [p.id]);
      if (!v) throw new Error(`aucune variante pour ${p.slug} : ${variantWhere}`);
    }
    const price = Math.round(Number(v?.price ?? p.price_value) * 100);
    return { slug: p.slug, item: { product_id: p.id, variant_id: v?.id ?? null, quantity, unit_price_cents: price } };
  };
  const simpleWhere = `p.status = 'published' and p.availability = 'available' and p.price_value > 0
    and not exists (select 1 from public.product_variants v where v.product_id = p.id)
    and not exists (select 1 from public.offer_products op join public.offers o on o.id = op.offer_id where op.product_id = p.id and o.type = 'product_promo')`;
  const simple = await line(simpleWhere);
  const simple2 = await line(`${simpleWhere} and p.slug <> '${simple.slug}'`, null, 2);
  const miel = await line(`p.slug = 'miel-nigelle' and p.status = 'published'`,
    `exists (select 1 from public.product_variant_options pvo join public.option_values ov on ov.id = pvo.option_value_id where pvo.variant_id = v.id and ov.label = '200 g')`);
  const qamis = await line(`p.status = 'published' and p.availability = 'available' and exists (select 1 from public.product_variants v
      join public.product_variant_options pvo on pvo.variant_id = v.id where v.product_id = p.id and pvo.option_type_id = 'taille' and v.active)`,
    `exists (select 1 from public.product_variant_options pvo where pvo.variant_id = v.id and pvo.option_type_id = 'taille')`);
  const comingSoon = await one(db, `select id, price_value from public.products where status = 'published' and availability is distinct from 'available' and price_value > 0 order by slug limit 1`);

  // ── A. Parcours métier ──────────────────────────────────────────────────
  section('A. Demandes de commande (rôle anon)');
  let r = await create(db, payload([simple.item]));
  check(r.ok === true && /^DN-\d{4}-[A-HJ-NP-Z2-9]{6}$/.test(r.order.number), '1. produit simple disponible → commande reçue', r.order?.number ?? JSON.stringify(r));
  check(r.order.status === 'submitted' && r.order.payment_status === 'not_requested', '   statut « submitted », paiement « not_requested » (aucun paiement demandé)');
  check(/^[A-Za-z0-9_-]{43}$/.test(r.token), '   jeton de suivi imprévisible (43 caractères, 256 bits)');
  check(r.order.subtotal_cents === simple.item.unit_price_cents && r.order.total_cents === null && r.order.shipping_cents === null,
    '   sous-total recalculé, livraison et total « à confirmer » (null)');
  const first = r;

  r = await create(db, payload([miel.item]));
  let items = await rows(db, 'select * from public.order_items i join public.orders o on o.id = i.order_id where o.public_number = $1', [r.order?.number]);
  check(r.ok && items[0]?.variant_label === '200 g' && items[0]?.options?.[0]?.axis === 'contenance', '2. miel avec contenance → snapshot « 200 g »', items[0] ? `${items[0].product_name} · ${items[0].variant_label}` : JSON.stringify(r));

  r = await create(db, payload([qamis.item]));
  items = await rows(db, 'select i.* from public.order_items i join public.orders o on o.id = i.order_id where o.public_number = $1', [r.order?.number]);
  check(r.ok && items[0]?.options?.some((o) => o.axis === 'taille'), '3. qamis avec taille → taille conservée', items[0] ? `${items[0].product_name} · ${items[0].variant_label}` : JSON.stringify(r));

  r = await create(db, payload([simple.item, simple2.item, miel.item]));
  const expected = simple.item.unit_price_cents + 2 * simple2.item.unit_price_cents + miel.item.unit_price_cents;
  check(r.ok && r.order.items.length === 3 && r.order.subtotal_cents === expected, '4. plusieurs lignes → sous-total = Σ prix × quantités', `${r.order?.subtotal_cents} = ${expected}`);
  const multi = r;

  r = await create(db, payload([simple.item], { customer: customer({ phone: '+971 50 123 4567' }),
    shipping: { address_line1: 'Building 12, Al Wasl Road', city: 'Dubaï', region: 'Dubaï', country_code: 'AE' } }));
  check(r.ok && r.order.country_code === 'AE', '5. international (Émirats, sans code postal, téléphone +971)');
  r = await create(db, payload([simple.item], { shipping: { address_line1: '10 Downing Street', postal_code: 'SW1A 2AA', city: 'London', country_code: 'GB' } }));
  check(r.ok, '5b. Royaume-Uni (code postal alphanumérique)');
  r = await create(db, payload([simple.item], { shipping: frAddress({ address_line2: 'Bâtiment B', instructions: 'Interphone 12\nDeuxième étage' }) }));
  check(r.ok, '6. adresse française complète (ligne 2, instructions sur deux lignes)');
  r = await create(db, payload([simple.item], { shipping: frAddress({ postal_code: '7500' }) }));
  check(r.ok === false && r.error === 'invalid_fields' && r.fields.postal_code === 'invalid', '6b. France : code postal à 5 chiffres exigé', JSON.stringify(r.fields));
  r = await create(db, payload([simple.item], { shipping: frAddress({ postal_code: null }) }));
  check(r.fields?.postal_code === 'required', '6c. France : code postal obligatoire');

  const before = (await one(db, 'select count(*)::int as n from public.orders')).n;
  if (comingSoon) {
    r = await create(db, payload([{ product_id: comingSoon.id, variant_id: null, quantity: 1, unit_price_cents: Math.round(comingSoon.price_value * 100) }]));
    check(r.ok === false && r.error === 'cart_changed' && r.lines[0].issue === 'unavailable', '7. produit non disponible (coming_soon / NULL) refusé', r.lines?.[0]?.issue);
  }
  await db.query(`update public.products set availability = 'out_of_stock' where id = $1`, [simple2.item.product_id]);
  r = await create(db, payload([simple.item, simple2.item]));
  check(r.ok === false && r.lines.find((l) => l.index === 2)?.issue === 'unavailable' && r.lines[0].issue === null,
    '8. produit devenu épuisé entre panier et validation → refus, ligne signalée');
  await db.query(`update public.products set availability = 'available' where id = $1`, [simple2.item.product_id]);

  await db.query('update public.product_variants set price = price + 1 where id = $1', [miel.item.variant_id]);
  r = await create(db, payload([miel.item]));
  const newPrice = r.lines?.[0]?.unit_price_cents;
  check(r.ok === false && r.lines[0].issue === 'price_changed' && newPrice === miel.item.unit_price_cents + 100,
    '9. prix modifié → refus avec le nouveau prix (aucune commande à l\'ancien prix)', `${miel.item.unit_price_cents} → ${newPrice}`);
  r = await create(db, payload([{ ...miel.item, unit_price_cents: newPrice }]));
  check(r.ok && r.order.subtotal_cents === newPrice, '9b. panier rafraîchi au nouveau prix → accepté');
  await db.query('update public.product_variants set price = price - 1 where id = $1', [miel.item.variant_id]);
  check((await one(db, 'select count(*)::int as n from public.orders')).n === before + 1, '   aucune commande créée par les refus');

  const body = payload([simple.item]);
  const a1 = await create(db, body);
  const a2 = await create(db, body);
  check(a1.ok && a2.ok && a2.replayed === true && a1.order.number === a2.order.number && a1.token === a2.token,
    '10. double soumission (même clé) → même commande, même jeton', a1.order?.number);
  const conflict = await create(db, { ...body, items: [simple2.item] });
  check(conflict.ok === false && conflict.error === 'idempotency_conflict', '10b. même clé, contenu différent → refus');
  check((await one(db, 'select count(*)::int as n from public.orders where idempotency_key = $1', [body.idempotency_key])).n === 1, '10c. une seule ligne en base');

  // Promotion produit prouvée (Nissah 59,99 → 40 €) et pack jamais appliqué.
  const promo = await one(db, `select p.id, p.price_value, o.promo_price from public.products p join public.offer_products op on op.product_id = p.id
    join public.offers o on o.id = op.offer_id where o.type = 'product_promo' and o.active and p.status = 'published' and p.availability = 'available'
    and round(o.normal_price * 100) = round(p.price_value * 100) and not exists (select 1 from public.product_variants v where v.product_id = p.id) limit 1`);
  if (promo) {
    const cents = Math.round(promo.promo_price * 100);
    r = await create(db, payload([{ product_id: promo.id, variant_id: null, quantity: 1, unit_price_cents: cents }]));
    items = await rows(db, 'select i.* from public.order_items i join public.orders o on o.id = i.order_id where o.public_number = $1', [r.order?.number]);
    check(r.ok && items[0].unit_price_cents === cents && items[0].list_unit_price_cents === Math.round(promo.price_value * 100) && items[0].offer_id,
      '   offre produit prouvée appliquée par le serveur, prix catalogue conservé', `${items[0]?.list_unit_price_cents} → ${items[0]?.unit_price_cents}`);
    r = await create(db, payload([{ product_id: promo.id, variant_id: null, quantity: 1, unit_price_cents: Math.round(promo.price_value * 100) }]));
    check(r.ok === false && r.lines[0].issue === 'price_changed', '   ancien prix (sans l\'offre) refusé : le navigateur doit afficher le prix réel');
  }

  // on_demand : commandable, signalé.
  await db.query(`update public.products set availability = 'on_demand' where id = $1`, [simple2.item.product_id]);
  r = await create(db, payload([simple2.item]));
  check(r.ok && r.order.items[0].on_demand === true, '   produit « sur commande » accepté, disponibilité à confirmer');
  await db.query(`update public.products set availability = 'available' where id = $1`, [simple2.item.product_id]);

  // ── B. Paiement et expédition ───────────────────────────────────────────
  section('B. Administration, paiement, expédition');
  const o1 = await orderOf(db, multi.order.number);
  let t = await track(db, multi.token);
  check(t.found && t.order.payment_status === 'not_requested' && t.order.payment_url === null && t.order.total_cents === null,
    '11. paiement non demandé : le client ne voit ni total ni lien');
  check(!JSON.stringify(t).includes('example.com') && !JSON.stringify(t).includes('rue de Test') && !('admin_note' in t.order),
    '    suivi sans e-mail, adresse, téléphone ni note interne');

  check(/dn:invalid_transition/.test(await error(admin(db, o1.id, 'request_payment'))), '    paiement impossible avant vérification (submitted → awaiting_payment refusé)');
  await admin(db, o1.id, 'start_review', { expected_status: 'submitted' });
  check(/dn:stale_order/.test(await error(admin(db, o1.id, 'set_note', { expected_status: 'submitted', note: 'x' }))), '    concurrence : statut affiché périmé refusé');
  check(/dn:availability_unchecked/.test(await error(admin(db, o1.id, 'request_payment'))), '    disponibilités non vérifiées → paiement refusé');
  const lines1 = await rows(db, 'select id, line_total_cents from public.order_items where order_id = $1 order by position', [o1.id]);
  for (const l of lines1) await admin(db, o1.id, 'set_item_availability', { item_id: l.id, available: true });
  await admin(db, o1.id, 'set_item_availability', { item_id: lines1[2].id, available: false });
  let o = await one(db, 'select * from public.orders where id = $1', [o1.id]);
  check(o.subtotal_cents === lines1[0].line_total_cents + lines1[1].line_total_cents, '    ligne indisponible exclue du sous-total', `${o.subtotal_cents}`);
  await admin(db, o1.id, 'set_item_availability', { item_id: lines1[2].id, available: true });
  check(/dn:shipping_missing/.test(await error(admin(db, o1.id, 'request_payment'))), '    frais de livraison absents → paiement refusé');
  await admin(db, o1.id, 'set_shipping', { shipping_cents: 1290, carrier: 'Transporteur test', estimate: '3 à 5 jours ouvrés' });
  await admin(db, o1.id, 'set_discount', { discount_cents: 500, reason: 'Geste commercial (test)' });
  check(/dn:invalid_amount/.test(await error(admin(db, o1.id, 'set_discount', { discount_cents: 10_000_000, reason: 'trop' }))), '    remise supérieure au sous-total refusée');
  check(/dn:invalid_payment_url/.test(await error(admin(db, o1.id, 'request_payment', { payment_url: 'http://paiement.example/x' }))), '    URL de paiement non https refusée');
  check(/dn:invalid_payment_url/.test(await error(admin(db, o1.id, 'request_payment', { payment_url: 'https://user:pass@paiement.example/x' }))), '    URL avec identifiants refusée');
  check(/dn:invalid_payment_url/.test(await error(admin(db, o1.id, 'request_payment', { payment_url: 'javascript:alert(1)' }))), '    URL javascript: refusée');
  await admin(db, o1.id, 'request_payment', { expected_status: 'reviewing', payment_provider: 'test', payment_url: 'https://paiement.example/session/abc', payment_reference: 'TEST-1' });
  o = await one(db, 'select * from public.orders where id = $1', [o1.id]);
  check(o.status === 'awaiting_payment' && o.payment_status === 'pending' && o.total_cents === o.subtotal_cents + 1290 - 500,
    '12. paiement demandé : total = sous-total + livraison − remise', `${o.total_cents}`);
  t = await track(db, multi.token);
  check(t.order.total_cents === o.total_cents && t.order.payment_url === 'https://paiement.example/session/abc' && t.order.shipping_cents === 1290,
    '    le client voit le total final et le lien de paiement');
  check(/dn:amounts_locked/.test(await error(admin(db, o1.id, 'set_shipping', { shipping_cents: 1 }))) ||
        /dn:invalid_transition/.test(await error(admin(db, o1.id, 'set_shipping', { shipping_cents: 1 }))), '    montants figés pendant la demande de paiement');
  check(/dn:order_items_locked/.test(await error(admin(db, o1.id, 'set_item_availability', { item_id: lines1[0].id, available: false }))), '    disponibilités figées pendant la demande de paiement');

  check(/dn:payment_not_confirmed/.test(await error(admin(db, o1.id, 'mark_shipped'))), '13. expédition sans paiement refusée (fonction admin)');
  check(/dn:invalid_transition|chk_orders/.test(await error(db.query(`update public.orders set status = 'shipped', shipped_at = now() where id = $1`, [o1.id]))),
    '    … et par la base, même en écriture directe superutilisateur');
  check(/dn:invalid_transition|chk_orders/.test(await error(db.query(`update public.orders set status = 'shipped', payment_status = 'paid', paid_at = now(), payment_confirmation_source = 'admin_manual', shipped_at = now() where id = $1`, [o1.id]))),
    '    … même en marquant « payé » dans la même écriture (awaiting_payment → shipped interdit)');
  check(/chk_orders_status_payment|dn:invalid/.test(await error(db.query(`update public.orders set status = 'paid' where id = $1`, [o1.id]))),
    '    statut « paid » sans paiement confirmé refusé (contrainte)');
  check(/dn:invalid_transition/.test(await error(admin(db, o1.id, 'start_preparation'))), '    préparation d\'expédition avant paiement refusée');

  await admin(db, o1.id, 'confirm_payment', { payment_reference: 'VIR-TEST-1' });
  o = await one(db, 'select * from public.orders where id = $1', [o1.id]);
  check(o.status === 'paid' && o.payment_status === 'paid' && o.payment_confirmation_source === 'admin_manual' && o.payment_confirmed_by === ADMIN,
    '    paiement confirmé par l\'administration (source admin_manual, auteur tracé)');
  t = await track(db, multi.token);
  check(t.order.payment_url === null && t.order.status === 'paid', '    lien de paiement retiré du suivi une fois payé');
  check(/dn:invalid_transition/.test(await error(admin(db, o1.id, 'mark_shipped'))), '    payé → expédié direct interdit (préparation d\'abord)');
  await admin(db, o1.id, 'start_preparation');
  check(/dn:invalid_tracking_url/.test(await error(admin(db, o1.id, 'set_tracking', { tracking_url: 'http://suivi.example/1' }))), '    URL de suivi non https refusée');
  await admin(db, o1.id, 'set_tracking', { carrier: 'Transporteur test', tracking_number: 'TRK123', tracking_url: 'https://suivi.example/TRK123' });
  await admin(db, o1.id, 'mark_shipped');
  o = await one(db, 'select * from public.orders where id = $1', [o1.id]);
  check(o.status === 'shipped' && o.shipped_at, '14. expédition après paiement acceptée');
  t = await track(db, multi.token);
  check(t.order.shipment?.tracking_number === 'TRK123' && t.order.shipment?.tracking_url === 'https://suivi.example/TRK123', '    le client voit le transporteur et le suivi');
  check(/dn:invalid_transition/.test(await error(admin(db, o1.id, 'cancel', { reason: 'trop tard' }))), '    une commande expédiée ne s\'annule pas');
  await admin(db, o1.id, 'mark_completed');
  const ev = await rows(db, `select type, from_status, to_status, actor, actor_id, notify_customer from public.order_events where order_id = $1 order by id`, [o1.id]);
  const statusEvents = ev.filter((e) => e.type === 'status_changed').map((e) => e.to_status).join(' → ');
  check(statusEvents === 'reviewing → awaiting_payment → paid → preparing_shipment → shipped → completed', '    journal complet des statuts', statusEvents);
  check(ev[0].type === 'created' && ev[0].actor === 'customer' && ev.filter((e) => e.type !== 'created').every((e) => e.actor === 'admin' && e.actor_id === ADMIN),
    '    acteurs tracés (client à la création, admin ensuite)');
  check(ev.filter((e) => e.notify_customer).length === 4, '    4 événements à notifier : reçue, paiement demandé, paiement reçu, expédiée');
  const evDetails = JSON.stringify(await rows(db, 'select details from public.order_events where order_id = $1', [o1.id]));
  check(!/example\.com|rue de Test|\+33/.test(evDetails), '    journal sans donnée personnelle');

  // Annulations.
  const c1 = await orderOf(db, first.order.number);
  check(/dn:reason_required/.test(await error(admin(db, c1.id, 'cancel', {}))), '15. annulation : motif obligatoire');
  await admin(db, c1.id, 'cancel', { reason: 'Demande du client (test)' });
  o = await one(db, 'select status, payment_status from public.orders where id = $1', [c1.id]);
  check(o.status === 'cancelled' && o.payment_status === 'not_requested', '    annulation avant paiement');
  t = await track(db, first.token);
  check(t.order.status === 'cancelled' && !JSON.stringify(t).includes('Demande du client'), '    le client voit « annulée », pas le motif interne');
  check(/dn:invalid_transition/.test(await error(admin(db, c1.id, 'start_review'))), '    une commande annulée ne repart pas');

  const pay = await create(db, payload([simple.item]));
  const p1 = await orderOf(db, pay.order.number);
  await admin(db, p1.id, 'start_review');
  for (const l of await rows(db, 'select id from public.order_items where order_id = $1', [p1.id])) await admin(db, p1.id, 'set_item_availability', { item_id: l.id, available: true });
  await admin(db, p1.id, 'set_shipping', { shipping_cents: 0 });
  await admin(db, p1.id, 'request_payment', {});
  t = await track(db, pay.token);
  check(t.order.status === 'awaiting_payment' && t.order.payment_url === null, '    paiement demandé SANS lien : aucun bouton « Payer » possible (instructions par Dar Nūr)');
  await admin(db, p1.id, 'reopen_review');
  o = await one(db, 'select status, payment_status, total_confirmed_at from public.orders where id = $1', [p1.id]);
  check(o.status === 'reviewing' && o.payment_status === 'not_requested' && o.total_confirmed_at === null, '    retour en vérification : total à reconfirmer');
  await admin(db, p1.id, 'request_payment', {});
  await admin(db, p1.id, 'confirm_payment', {});
  await admin(db, p1.id, 'cancel', { reason: 'Rupture fournisseur (test)' });
  o = await one(db, 'select status, payment_status from public.orders where id = $1', [p1.id]);
  check(o.status === 'cancelled' && o.payment_status === 'refund_due', '    payée puis annulée → remboursement DÛ (manuel)');
  await admin(db, p1.id, 'mark_refunded', { payment_reference: 'REMB-TEST' });
  check((await one(db, 'select payment_status from public.orders where id = $1', [p1.id])).payment_status === 'refunded', '    remboursement marqué effectué');

  // Notifications.
  const pending = await one(db, `select id from public.order_events where order_id = $1 and notify_customer and notified_at is null order by id limit 1`, [p1.id]);
  await admin(db, p1.id, 'mark_notified', { event_id: pending.id });
  check(/dn:event_not_found/.test(await error(admin(db, p1.id, 'mark_notified', { event_id: pending.id }))), '    notification marquée « prévenu » une seule fois');

  // ── C. Sécurité ─────────────────────────────────────────────────────────
  section('C. Sécurité et RLS');
  await as(db, 'anon', async () => {
    for (const tbl of ['public.orders', 'public.order_items', 'public.order_events', 'orders_private.config', 'orders_private.submissions'])
      check(/permission denied/.test(await error(db.query(`select * from ${tbl} limit 1`))), `anon : lecture de ${tbl} refusée`);
    check(/permission denied/.test(await error(db.query(`insert into public.orders (public_number) values ('x')`))), 'anon : insertion directe refusée');
    check(/permission denied/.test(await error(db.query(`update public.orders set payment_status = 'paid'`))), 'anon : impossible de s\'auto-marquer payé');
    check(/permission denied/.test(await error(db.query(`select public.admin_update_order($1, 'confirm_payment', '{}')`, [o1.id]))), 'anon : fonctions d\'administration refusées');
    check(/permission denied/.test(await error(db.query(`select orders_private.order_token($1)`, [o1.id]))), 'anon : dérivation du jeton refusée');
  });
  await as(db, 'user', async () => {
    check((await one(db, 'select count(*)::int as n from public.orders')).n === 0, 'authentifié non admin : aucune commande visible');
    check(/dn:forbidden/.test(await error(db.query(`select public.admin_update_order($1, 'confirm_payment', '{}')`, [o1.id]))), 'authentifié non admin : actions refusées');
    check(/dn:forbidden/.test(await error(db.query(`select public.admin_order_tracking_token($1)`, [o1.id]))), 'authentifié non admin : jeton de suivi refusé');
    check(/permission denied/.test(await error(db.query(`update public.orders set status = 'shipped'`))), 'authentifié non admin : écriture directe refusée');
  });
  await as(db, 'admin', async () => {
    const n = (await one(db, 'select count(*)::int as n from public.orders')).n;
    check(n > 10, 'admin : lecture de toutes les commandes', `${n}`);
    check(/permission denied/.test(await error(db.query(`update public.orders set status = 'shipped'`))), 'admin : aucune écriture directe (tout passe par admin_update_order)');
    check(/permission denied/.test(await error(db.query(`delete from public.order_events`))), 'admin : journal non supprimable');
    const tok = (await one(db, 'select public.admin_order_tracking_token($1) as t', [o1.id])).t;
    check(tok === multi.token, 'admin : lien de suivi renvoyable au client');
  });
  check(/dn:order_delete_forbidden/.test(await error(db.query('delete from public.orders where id = $1', [o1.id]))), 'superutilisateur : suppression de commande refusée');
  check(/dn:order_item_immutable/.test(await error(db.query('update public.order_items set unit_price_cents = 1 where order_id = $1', [o1.id]))), 'superutilisateur : prix d\'une ligne immuable');
  check(/dn:order_field_immutable/.test(await error(db.query(`update public.orders set customer_email = 'autre@example.com' where id = $1`, [o1.id]))), 'superutilisateur : coordonnées figées');
  check(/dn:order_event_immutable/.test(await error(db.query(`update public.order_events set details = '{}' where order_id = $1`, [o1.id]))), 'superutilisateur : journal immuable');

  r = await create(db, payload([{ ...simple.item, unit_price_cents: 1 }]));
  check(r.ok === false && r.lines[0].issue === 'price_changed', 'prix modifié dans DevTools (1 centime) → refusé');
  r = await create(db, payload([{ ...simple.item, product_id: '00000000-0000-4000-8000-000000000000' }]));
  check(r.lines?.[0]?.issue === 'not_found', 'product_id inventé → not_found');
  r = await create(db, payload([{ ...simple.item, product_id: 'pas-un-uuid' }]));
  check(r.lines?.[0]?.issue === 'invalid_line', 'product_id mal formé → invalid_line');
  r = await create(db, payload([{ ...qamis.item, variant_id: miel.item.variant_id }]));
  check(r.lines?.[0]?.issue === 'variant_mismatch', 'variant_id d\'un autre produit → variant_mismatch');
  r = await create(db, payload([{ ...qamis.item, variant_id: null }]));
  check(r.lines?.[0]?.issue === 'variant_required', 'variante omise pour un produit à variantes → variant_required');
  for (const q of [0, -1, 2.5, 100, 1e9, '3', null])
    check((await create(db, payload([{ ...simple.item, quantity: q }]))).lines?.[0]?.issue === 'invalid_quantity', `quantité ${JSON.stringify(q)} → invalid_quantity`);
  r = await create(db, payload([simple.item, simple.item]));
  check(r.lines?.[1]?.issue === 'duplicate_line', 'ligne en double → refusée');
  r = await create(db, payload(Array.from({ length: 31 }, () => simple.item)));
  check(r.error === 'too_many_lines', '31 lignes → too_many_lines');
  r = await create(db, payload([simple.item], { padding: 'x'.repeat(17_000) }));
  check(r.error === 'payload_too_large', 'requête de 17 Ko → payload_too_large');
  r = await create(db, payload([]));
  check(r.error === 'cart_empty', 'panier vide → cart_empty');
  r = await create(db, payload([simple.item], { terms_accepted: 'true' }));
  check(r.fields?.terms_accepted === 'required', 'conditions non acceptées (booléen exigé)');
  r = await create(db, payload([simple.item], { customer: customer({ email: 'pas-un-email' }) }));
  check(r.fields?.email === 'invalid', 'e-mail invalide refusé côté serveur');
  r = await create(db, payload([simple.item], { customer: customer({ email: 'a@b..fr' }) }));
  check(r.fields?.email === 'invalid', 'e-mail à double point refusé');
  r = await create(db, payload([simple.item], { customer: customer({ phone: '12' }) }));
  check(r.fields?.phone === 'invalid', 'téléphone trop court refusé (aucun format national imposé)');
  r = await create(db, payload([simple.item], { customer: customer({ first_name: 'A\u0007B' }) }));
  check(r.fields?.first_name === 'invalid', 'caractère de contrôle refusé');
  r = await create(db, payload([simple.item], { shipping: frAddress({ country_code: 'XX' }) }));
  check(r.fields?.country_code === 'invalid', 'pays hors ISO 3166-1 refusé');
  const xss = '<img src=x onerror=alert(1)>';
  r = await create(db, payload([simple.item], { customer: customer({ last_name: xss }), shipping: frAddress({ city: `${xss}"'` }) }));
  const stored = r.ok ? await orderOf(db, r.order.number) : null;
  check(stored?.customer_last_name === xss && !JSON.stringify(r).includes('onerror'), 'injection HTML : stockée comme texte brut, jamais renvoyée au suivi (échappée à l\'affichage)');
  r = await create(db, payload([simple.item], { website: 'https://spam.example' }));
  check(r.error === 'rejected', 'pot de miel rempli → rejeté');
  for (const tok of ['', 'abc', 'A'.repeat(43), multi.token.slice(0, 42) + (multi.token.endsWith('A') ? 'B' : 'A'), `${multi.token}'--`])
    check((await track(db, tok)).found === false, `jeton invalide « ${tok.slice(0, 12)}… » → introuvable`);

  r = await create(db, payload([simple.item], { environment: 'production' }));
  check(r.ok && r.order.environment === 'preprod', '« production » sans origine dar-nur.fr → enregistrée comme test (preprod)');
  r = await create(db, payload([simple.item], { environment: 'production' }), { ...nextIp(), origin: 'https://dar-nur.fr' });
  check(r.error === 'ordering_closed', 'production fermée tant que les CGV ne sont pas révisées');

  const ip = { 'x-forwarded-for': '198.51.100.7' };
  const results = [];
  for (let i = 0; i < 6; i++) results.push((await create(db, payload([simple.item]), ip)).ok ? 'ok' : 'refus');
  check(results.join(',') === 'ok,ok,ok,ok,ok,refus', 'limitation : 5 demandes / 10 min par IP', results.join(','));
  check((await create(db, payload([simple.item]), { 'x-forwarded-for': '198.51.100.8' })).ok, '   une autre IP reste servie');
  check((await one(db, `select count(*)::int as n from orders_private.submissions where ip_hash is not null`)).n > 0 &&
        !(await rows(db, `select encode(ip_hash, 'escape') as h from orders_private.submissions`)).some((x) => x.h.includes('198.51')), '   IP jamais stockée en clair');

  // check_cart (rafraîchissement du panier)
  const cc = await as(db, 'anon', async () => (await one(db, 'select public.check_cart($1::jsonb) as r', [JSON.stringify([simple.item, { ...miel.item, unit_price_cents: 1 }])])).r);
  check(cc.ok && cc.valid === false && cc.lines[1].issue === 'price_changed' && cc.lines[1].unit_price_cents === miel.item.unit_price_cents, 'check_cart : écarts signalés avec le prix actuel');

  // Produit supprimé après commande : la commande ne change pas.
  const snap = await one(db, 'select i.product_name, i.unit_price_cents from public.order_items i join public.orders o on o.id = i.order_id where o.id = $1 order by position limit 1', [o1.id]);
  await db.query('delete from public.products where id = $1', [simple.item.product_id]);
  const after = await one(db, 'select i.product_id, i.product_name, i.unit_price_cents from public.order_items i where i.order_id = $1 order by position limit 1', [o1.id]);
  check(after.product_id === null && after.product_name === snap.product_name && after.unit_price_cents === snap.unit_price_cents,
    'produit supprimé dans l\'admin : suppression acceptée, snapshot intact');

  section('D. Invariants, pays, idempotence, rollback');
  for (const row of await rows(db, INVARIANTS)) check(row.ok === true, `invariant : ${row.check_name}`, row.detail ?? '');
  const sqlCodes = (await one(db, 'select public.order_country_codes() as c')).c;
  const tsBlock = /COUNTRY_CODES = \[([^\]]+)\]/.exec(COUNTRIES_TS)?.[1] ?? '';
  const tsCodes = [...tsBlock.matchAll(/'([A-Z]{2})'/g)].map((m) => m[1]);
  check(sqlCodes.length === tsCodes.length && sqlCodes.every((c) => tsCodes.includes(c)), 'liste des pays identique en base et sur le site', `${sqlCodes.length} pays`);
  let rerun = true;
  try { for (const f of ETAPE10) await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')); } catch (e) { rerun = false; console.log(`    ${e.message}`); }
  check(rerun, 'migrations rejouables (idempotence)');
  check((await one(db, 'select count(*)::int as n from orders_private.config')).n === 1, 'secret conservé au rejeu (singleton)');

  // Purge explicite des commandes de test (supabase/maintenance/…_purger_commandes_test.sql).
  const PURGE = readFileSync(path.join(ROOT, 'supabase/maintenance/20261003_etape10_purger_commandes_test.sql'), 'utf8');
  const withNumbers = (numbers) => PURGE.replace(/array\[[^\]]*\]::text\[\]/, `array[${numbers.map((n) => `'${n}'`).join(', ')}]::text[]`);
  const victims = (await rows(db, `select public_number from public.orders where is_test order by created_at limit 2`)).map((r) => r.public_number);
  const total = (await one(db, 'select count(*)::int as n from public.orders')).n;
  const refused = /purge refusée/.test(await error(db.exec(withNumbers([...victims, 'DN-2026-ZZZZZZ']))));
  await db.exec('rollback'); // la CLI annule à la fin de la connexion ; PGlite garde la transaction avortée
  check(refused && (await one(db, 'select count(*)::int as n from public.orders')).n === total, 'purge : numéro inconnu → tout est refusé, rien supprimé');
  await db.exec(withNumbers(victims));
  const left = (await one(db, 'select count(*)::int as n from public.orders')).n;
  check(left === total - 2 && (await one(db, 'select count(*)::int as n from public.order_events e left join public.orders o on o.id = e.order_id where o.id is null')).n === 0,
    'purge : seules les commandes listées disparaissent (lignes et journal compris)', `${total} → ${left}`);
  check(/dn:order_delete_forbidden/.test(await error(db.query('delete from public.orders where id = $1', [o1.id]))), 'purge : garde-fous réactivés ensuite');

  const db2 = await newDb(data);
  const fresh = await newDb(data, { etape10: false });
  await db2.exec(ROLLBACK);
  const shape = async (d) => JSON.stringify(await rows(d, `select table_schema, table_name, column_name from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema') order by 1, 2, 3`)) +
    JSON.stringify(await rows(d, `select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'orders_private') order by 1, 2`));
  check(await shape(db2) === await shape(fresh), 'rollback : schéma identique à l\'état d\'après l\'étape 6');
  let reapply = true;
  try { for (const f of ETAPE10) await db2.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')); } catch (e) { reapply = false; console.log(`    ${e.message}`); }
  check(reapply, 'réapplication après rollback');

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${passes} contrôle(s) réussi(s), ${failures} échec(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
