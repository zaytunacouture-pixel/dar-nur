// Banc d'essai des migrations de l'étape 6 — hors ligne, sans aucun secret.
//
//   node run.mjs --live                 catalogue PUBLIC lu avec la clé publique (CI)
//   node run.mjs --data <dossier>       sauvegarde JSON complète (brouillons compris), en local
//
// Déroulé, sur PGlite (Postgres en WASM) chargé avec baseline.sql = schéma de
// production figé (tables, contraintes, triggers, fonctions, RLS, droits) :
//   1. chargement des données, empreinte des colonnes historiques ;
//   2. migrations supabase/migrations/*etape6* dans l'ordre ;
//   3. contrôles : 0 appel de régénération, données historiques identiques
//      (updated_at compris), supabase/checks/etape6_invariants.sql, effectifs ;
//   4. seconde exécution (idempotence) ;
//   5. scénarios de l'ancien système (admin, import, panier, promo) et des
//      nouveaux garde-fous, rejoués avec les VRAIS rôles (anon / admin) ;
//   6. rollback puis réapplication, sur une seconde instance.
// Code de sortie 1 au premier échec.

import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{14}_etape6_.*\.sql$/.test(f)).sort();
const ROLLBACK = path.join(ROOT, 'supabase/rollback/20261002_etape6_rollback.sql');
const INVARIANTS = readFileSync(path.join(ROOT, 'supabase/checks/etape6_invariants.sql'), 'utf8');
const BASELINE = readFileSync(path.join(HERE, 'baseline.sql'), 'utf8');

// Valeurs PUBLIQUES par conception (identiques à .github/workflows/site-ci.yml).
const PUBLIC_URL = 'https://sxlpgcnjerlayitaxxyv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_3J_jC58tHskgwggDRahQCg_q8xM_xAY';
const TEST_ADMIN = '00000000-0000-4000-8000-00000000ad00';

const LEGACY_TABLES = ['categories', 'brands', 'products', 'product_variants', 'offers', 'offer_products', 'promo_codes',
  'admins', 'product_sources', 'product_supply', 'product_source_observations', 'sync_proposals'];
const NEW_PRODUCT_COLS = ['status', 'availability', 'replaced_by_product_id', 'net_quantity', 'net_unit', 'seo_title', 'seo_description', 'size_guide_id'];
const NEW_OFFER_PRODUCT_COLS = ['product_id', 'variant_id', 'quantity'];

let failures = 0;
let passes = 0;
function check(cond, label, detail = '') {
  if (cond) { passes++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failures++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n▸ ${title}`); }

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------
async function loadData() {
  const args = process.argv.slice(2);
  const dataIdx = args.indexOf('--data');
  if (dataIdx >= 0) {
    const dir = path.resolve(args[dataIdx + 1]);
    const data = {};
    for (const t of LEGACY_TABLES) {
      try { data[t] = JSON.parse(readFileSync(path.join(dir, `${t}.json`), 'utf8')); } catch { data[t] = []; }
    }
    return { data, source: `sauvegarde ${dir}` };
  }
  if (!args.includes('--live')) throw new Error('Préciser --live ou --data <dossier>.');
  const get = async (q) => {
    const r = await fetch(`${PUBLIC_URL}/rest/v1/${q}`, { headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}` } });
    if (!r.ok) throw new Error(`${q} : HTTP ${r.status} ${await r.text()}`);
    return r.json();
  };
  const data = {
    categories: await get('categories?select=*'),
    brands: await get('brands?select=*'),
    products: await get('products?select=*'),
    product_variants: await get('product_variants?select=*'),
    offers: await get('offers?select=*'),
    offer_products: await get('offer_products?select=*'),
  };
  // Un produit référencé par une variante ou une marque inactive invisible : on écarte les lignes orphelines.
  const productIds = new Set(data.products.map((p) => p.id));
  data.product_variants = data.product_variants.filter((v) => productIds.has(v.product_id));
  const brandIds = new Set(data.brands.map((b) => b.id));
  for (const p of data.products) if (p.brand_slug && !brandIds.has(p.brand_slug)) p.brand_slug = null;
  return { data, source: 'catalogue public (clé publique, lecture sous RLS)' };
}

async function newDb(data) {
  const db = new PGlite();
  await db.exec(BASELINE);
  await db.exec(`insert into auth.users (id) values ('${TEST_ADMIN}') on conflict do nothing`);
  for (const a of data.admins ?? []) await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [a.user_id]);
  for (const t of LEGACY_TABLES) {
    const rows = data[t] ?? [];
    if (!rows.length) continue;
    const overriding = t === 'product_source_observations' ? 'overriding system value' : '';
    await db.query(`insert into public.${t} ${overriding} select * from jsonb_populate_recordset(null::public.${t}, $1::jsonb)`, [JSON.stringify(rows)]);
  }
  await db.query('insert into public.admins (user_id, note) values ($1, $2) on conflict do nothing', [TEST_ADMIN, 'banc d\'essai']);
  await db.exec('truncate test.notify_log');
  return db;
}

async function rows(db, sql, params) { return (await db.query(sql, params)).rows; }
async function one(db, sql, params) { return (await db.query(sql, params)).rows[0]; }
async function asRole(db, role, fn) {
  await db.exec(`set role ${role}`);
  if (role === 'authenticated') await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [TEST_ADMIN]);
  try { return await fn(); } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
async function expectError(promise, pattern) {
  try { await promise; return false; } catch (e) { return pattern ? pattern.test(e.message) : true; }
}

async function fingerprint(db) {
  const out = {};
  for (const t of LEGACY_TABLES) {
    const drop = t === 'products' ? NEW_PRODUCT_COLS : t === 'offer_products' ? NEW_OFFER_PRODUCT_COLS : [];
    const r = await one(db, `select count(*)::int as n, md5(coalesce(string_agg((to_jsonb(x) - $1::text[])::text, '|' order by (to_jsonb(x) - $1::text[])::text), '')) as h from public.${t} x`, [drop]);
    out[t] = `${r.n}:${r.h}`;
  }
  // Ordre physique : l'ancien site trie par sort_order seul, les ex-aequo suivent l'ordre des lignes.
  for (const t of ['products', 'product_variants', 'offer_products']) {
    out[`${t}#ordre`] = (await one(db, `select md5(string_agg((to_jsonb(x) ->> $1), ',' order by ctid)) as h from public.${t} x`,
      [t === 'offer_products' ? 'product_slug' : 'id'])).h;
  }
  return out;
}

async function applyMigrations(db) {
  for (const f of MIGRATIONS) await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
}

async function newTableCounts(db) {
  const tables = ['collections', 'product_collections', 'legacy_category_collections', 'option_types', 'option_values',
    'product_variant_options', 'product_media', 'size_guides', 'size_guide_rows', 'product_apparel_details',
    'product_food_details', 'settings', 'redirects', 'product_relations', 'product_groupings', 'product_grouping_members'];
  const out = {};
  for (const t of tables) out[t] = (await one(db, `select count(*)::int as n from public.${t}`)).n;
  return out;
}

// Règle de quantité nette réimplémentée indépendamment du SQL, pour recouper.
function expectedNetQuantity(p) {
  if (p.weight != null && p.volume != null) return null;
  if ((p.variant_axes || []).some((a) => a === 'format' || a === 'contenance')) return null;
  let m = p.weight && /^\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\s*$/i.exec(p.weight);
  if (m) return [Number(m[1].replace(',', '.')), m[2].toLowerCase()];
  m = p.volume && /^\s*(\d+(?:[.,]\d+)?)\s*(ml|l)\s*$/i.exec(p.volume);
  if (m) return [Number(m[1].replace(',', '.')), m[2].toLowerCase()];
  m = p.volume && /^\s*(\d+)\s*g[ée]lules?\s*$/i.exec(p.volume);
  if (m) return [Number(m[1]), 'capsule'];
  return null;
}

// ---------------------------------------------------------------------------
async function main() {
  const { data, source } = await loadData();
  const full = !process.argv.includes('--live');
  console.log(`Banc étape 6 — données : ${source}`);
  console.log(`  ${data.products.length} produits, ${data.product_variants.length} variantes, ${data.offer_products.length} lignes d'offres`);
  console.log(`  migrations : ${MIGRATIONS.join(', ')}`);

  const db = await newDb(data);
  const before = await fingerprint(db);

  section('1. Première application');
  await applyMigrations(db);
  const notify1 = (await one(db, 'select count(*)::int as n from test.notify_log')).n;
  check(notify1 === 0, 'aucun appel de régénération GitHub pendant la migration', `${notify1} appel(s)`);
  const after = await fingerprint(db);
  const changed = Object.keys(before).filter((t) => before[t] !== after[t]);
  check(changed.length === 0, 'données historiques ET ordre physique des lignes identiques (updated_at compris)', changed.length ? `modifiés : ${changed.join(', ')}` : `${LEGACY_TABLES.length} tables`);

  section('2. Invariants (supabase/checks/etape6_invariants.sql)');
  for (const r of await rows(db, INVARIANTS)) check(r.ok === true, r.check_name, r.detail);

  section('3. Remplissage — effectifs');
  const P = data.products;
  const st = await one(db, `select count(*) filter (where status = 'published')::int as pub, count(*) filter (where status = 'draft')::int as draft,
                                   count(*) filter (where availability = 'available')::int as avail, count(*) filter (where availability is null)::int as pending from public.products`);
  check(st.pub === P.filter((p) => p.active).length && st.draft === P.filter((p) => !p.active).length,
    'status = active (published / draft)', `${st.pub} published, ${st.draft} draft`);
  check(st.avail === P.filter((p) => !p.coming_soon).length && st.pending === P.filter((p) => p.coming_soon).length,
    'availability : available si coming_soon = false, NULL (à arbitrer) sinon', `${st.avail} available, ${st.pending} NULL`);

  const nq = await rows(db, 'select slug, net_quantity::float as q, net_unit as u from public.products where net_quantity is not null');
  const nqMap = new Map(nq.map((r) => [r.slug, `${r.q} ${r.u}`]));
  const nqExpected = new Map(P.map((p) => [p.slug, expectedNetQuantity(p)]).filter(([, v]) => v).map(([s, v]) => [s, `${v[0]} ${v[1]}`]));
  const nqDiff = [...new Set([...nqMap.keys(), ...nqExpected.keys()])].filter((s) => nqMap.get(s) !== nqExpected.get(s));
  check(nqDiff.length === 0, 'quantité nette = règle recalculée indépendamment', `${nq.length} produits, écarts : ${nqDiff.join(', ') || 'aucun'}`);

  const pvo = (await one(db, 'select count(*)::int as n from public.product_variant_options')).n;
  check(pvo === data.product_variants.reduce((n, v) => n + Object.keys(v.options || {}).length, 0), 'toutes les options historiques normalisées', `${pvo} lignes`);
  const media = (await one(db, 'select count(*)::int as n from public.product_media')).n;
  const mediaExpected = P.reduce((n, p) => n + p.images.filter((u) => u && u.trim()).length, 0)
    + data.product_variants.reduce((n, v) => n + v.images.filter((u) => u && u.trim()).length, 0);
  check(media === mediaExpected, 'product_media = images[] des produits et des variantes', `${media} lignes`);

  const prim = await rows(db, `select c.slug, count(*)::int as n from public.product_collections pc join public.collections c on c.id = pc.collection_id
                                where pc.role = 'primary' group by c.slug order by c.slug`);
  console.log(`    principales : ${prim.map((r) => `${r.slug} ${r.n}`).join(' · ')}`);
  if (full) {
    const want = { miels: 18, 'miels-gourmands': 10, poudres: 17, gelules: 12, parfums: 39, 'parfums-interieur': 6, tahara: 10,
      soins: 27, brumes: 5, huiles: 16, abayas: 62, qamis: 8, chaussures: 11, accessoires: 10 };
    const got = Object.fromEntries(prim.map((r) => [r.slug, r.n]));
    check(JSON.stringify(Object.keys(want).sort().map((k) => [k, want[k]])) === JSON.stringify(Object.keys(got).sort().map((k) => [k, got[k]])),
      'effectifs par collection principale conformes aux étapes 2 et 3 (251 produits)');
    const sec = await one(db, `select count(*) filter (where c.slug = 'idees-cadeaux')::int as gift, count(*) filter (where c.slug = 'offres')::int as offres
                                 from public.product_collections pc join public.collections c on c.id = pc.collection_id where pc.role = 'secondary'`);
    check(sec.gift === 36 && sec.offres === 6, 'secondaires : 36 Idées cadeaux, 6 Offres & packs', `${sec.gift} / ${sec.offres}`);
    const mig = (await one(db, `select count(*)::int as n from public.product_collections where source = 'migration' and role = 'primary'`)).n;
    check(mig === 33, 'reclassements documentés : 24 + 5 + 3 + 1', `${mig}`);
  }
  check((await one(db, 'select count(*)::int as n from public.collections')).n === 20, '20 collections (3 univers, 15 collections/sous-collections, 2 transverses)');
  check((await one(db, 'select count(*)::int as n from public.redirects')).n === 0, 'redirects : table vide (aucune règle chargée)');
  const counts1 = await newTableCounts(db);

  section('4. Seconde exécution (idempotence)');
  let rerunOk = true;
  try { await applyMigrations(db); } catch (e) { rerunOk = false; console.log(`    ${e.message}`); }
  check(rerunOk, 'les 9 migrations se rejouent sans erreur');
  check(JSON.stringify(await newTableCounts(db)) === JSON.stringify(counts1), 'aucune ligne ajoutée ni retirée par la seconde exécution');
  check(JSON.stringify(await fingerprint(db)) === JSON.stringify(before), 'données historiques toujours identiques');
  check((await one(db, 'select count(*)::int as n from test.notify_log')).n === 0, 'toujours aucun appel de régénération');
  for (const r of await rows(db, INVARIANTS)) if (!r.ok) check(false, `invariant après rejeu : ${r.check_name}`, r.detail);

  section('5. Lecture publique (rôle anon)');
  await asRole(db, 'anon', async () => {
    const n = (await one(db, 'select count(*)::int as n from public.products')).n;
    check(n === P.filter((p) => p.active).length, 'anon lit les produits actifs (politique historique inchangée)', `${n}`);
    check((await one(db, 'select count(*)::int as n from public.collections')).n === 20, 'anon lit les collections publiées');
    const pc = (await one(db, 'select count(*)::int as n from public.product_collections pc join public.products p on p.id = pc.product_id')).n;
    check(pc === (await one(db, 'select count(*)::int as n from public.product_collections')).n, 'anon ne voit aucune appartenance de brouillon');
    check(await expectError(db.query('select * from public.product_groupings limit 1'), /permission denied/), 'regroupements internes refusés à anon');
    check(await expectError(db.query('select * from public.product_sources limit 1'), /permission denied/), 'données fournisseur toujours refusées à anon');
    const keys = (await rows(db, 'select key from public.settings order by key')).map((r) => r.key);
    check(!keys.includes('free_shipping_threshold') && keys.includes('national_shipping_enabled'), 'settings : seules les clés publiques', keys.join(', '));
    check(await expectError(db.query(`insert into public.collections (slug, path, type, name) values ('x', '/x/', 'transverse', 'X')`)), 'anon ne peut pas écrire');
    check(await expectError(db.query(`update public.products set status = 'archived'`)) || (await one(db, `select count(*)::int as n from public.products where status = 'archived'`)).n === 0, 'anon ne peut pas modifier un produit');
  });

  section('6. Ancien admin, import, synchroniseur, panier (rôle admin authentifié)');
  const pick = async (where) => one(db, `select * from public.products where ${where} order by slug limit 1`);
  await asRole(db, 'authenticated', async () => {
    // saveProduct() : PATCH de tous les champs du formulaire, coming_soon et active compris.
    const a = await pick(`active and not coming_soon and category_id = 'miels' and not gift_idea`);
    await db.query(`update public.products set name = name, price_value = price_value, active = false, coming_soon = false,
                    category_id = category_id, gift_idea = gift_idea where id = $1`, [a.id]);
    let r = await one(db, 'select status, availability from public.products where id = $1', [a.id]);
    check(r.status === 'draft' && r.availability === 'available', 'admin : décocher « Actif » → status draft', `${a.slug}`);
    await db.query('update public.products set active = true where id = $1', [a.id]);   // toggleProductActive()
    r = await one(db, 'select status from public.products where id = $1', [a.id]);
    check(r.status === 'published', 'admin : bouton Activer → status published');

    const cs = await pick(`coming_soon and active`);
    await db.query('update public.products set price_value = price_value, coming_soon = true, active = true where id = $1', [cs.id]);
    r = await one(db, 'select availability from public.products where id = $1', [cs.id]);
    check(r.availability === null, 'admin : édition d\'un produit « bientôt » sans toucher la case → disponibilité reste à arbitrer', cs.slug);
    await db.query('update public.products set coming_soon = false where id = $1', [cs.id]);
    r = await one(db, 'select availability from public.products where id = $1', [cs.id]);
    check(r.availability === 'available', 'admin : décocher « Bientôt disponible » → available (décision humaine)');
    await db.query('update public.products set coming_soon = true where id = $1', [cs.id]);
    r = await one(db, 'select availability from public.products where id = $1', [cs.id]);
    check(r.availability === 'coming_soon', 'admin : cocher « Bientôt disponible » → coming_soon');

    await db.query('update public.products set active = false where id = $1', [a.id]);
    check(await expectError(db.query(`update public.products set active = true, status = 'archived' where id = $1`, [a.id]), /incohérents/),
      'modification simultanée incohérente active/status refusée');
    await db.query('update public.products set active = true where id = $1', [a.id]);
    await db.query(`update public.products set status = 'archived' where id = $1`, [a.id]);
    r = await one(db, 'select active from public.products where id = $1', [a.id]);
    check(r.active === false, 'nouveau modèle : status archived → active = false pour l\'ancien site');
    await db.query(`update public.products set status = 'published' where id = $1`, [a.id]);

    // Catégorie : la principale legacy suit, la principale « migration » ne bouge pas.
    await db.query(`update public.products set category_id = 'miels-gourmands' where id = $1`, [a.id]);
    r = await one(db, `select c.slug from public.product_collections pc join public.collections c on c.id = pc.collection_id where pc.product_id = $1 and pc.role = 'primary'`, [a.id]);
    check(r.slug === 'miels-gourmands', 'changement de catégorie → la principale (legacy) suit');
    await db.query(`update public.products set category_id = 'miels' where id = $1`, [a.id]);
    const soin = await pick(`slug = 'savon-noir-karite'`);
    if (soin) {
      await db.query(`update public.products set category_id = 'huiles' where id = $1`, [soin.id]);
      r = await one(db, `select c.slug from public.product_collections pc join public.collections c on c.id = pc.collection_id where pc.product_id = $1 and pc.role = 'primary'`, [soin.id]);
      check(r.slug === 'soins', 'reclassement documenté jamais écrasé par un changement de catégorie');
      await db.query(`update public.products set category_id = 'tahara' where id = $1`, [soin.id]);
    }

    // gift_idea → Idées cadeaux
    await db.query('update public.products set gift_idea = true where id = $1', [a.id]);
    r = await one(db, `select count(*)::int as n from public.product_collections pc join public.collections c on c.id = pc.collection_id where pc.product_id = $1 and c.slug = 'idees-cadeaux'`, [a.id]);
    check(r.n === 1, 'cocher « Idée cadeau » → appartenance Idées cadeaux');
    await db.query('update public.products set gift_idea = false where id = $1', [a.id]);
    r = await one(db, `select count(*)::int as n from public.product_collections pc join public.collections c on c.id = pc.collection_id where pc.product_id = $1 and c.slug = 'idees-cadeaux'`, [a.id]);
    check(r.n === 0, 'décocher « Idée cadeau » → appartenance retirée');

    // Galerie
    await db.query(`update public.products set images = array['assets/test/a.webp', 'assets/test/b.webp'] where id = $1`, [a.id]);
    r = await rows(db, `select url, sort_order from public.product_media where product_id = $1 and variant_id is null order by sort_order`, [a.id]);
    check(r.length === 2 && r[0].url === 'assets/test/a.webp', 'galerie modifiée dans l\'admin → product_media recopié dans l\'ordre');

    // Import fournisseur : nouveau brouillon + variantes contenance.
    const imp = await one(db, `insert into public.products (slug, category_id, name, active, variant_axes, volume, images)
                               values ('test-import-parfum', 'parfums', 'Parfum test', false, '{contenance}', null, '{assets/x.webp}') returning *`);
    check(imp.status === 'draft' && imp.availability === 'available' && imp.coming_soon === false, 'import : brouillon → status draft, availability available');
    await db.query(`insert into public.product_variants (product_id, name, options, price, sort_order) values
                    ($1, '50 ml', '{"contenance":"50 ml"}', 10, 0), ($1, '100 ml', '{"contenance":"100 ml"}', 20, 1)`, [imp.id]);
    r = await one(db, `select count(*)::int as n from public.product_variant_options pvo join public.product_variants v on v.id = pvo.variant_id where v.product_id = $1`, [imp.id]);
    check(r.n === 2, 'import : variantes contenance normalisées automatiquement');
    r = await one(db, `select c.slug from public.product_collections pc join public.collections c on c.id = pc.collection_id where pc.product_id = $1 and pc.role = 'primary'`, [imp.id]);
    check(r?.slug === 'parfums', 'import : collection principale posée d\'après la catégorie');

    // Variante à valeur inconnue et variante en double : l'admin n'est jamais bloqué.
    const v3 = await one(db, `insert into public.product_variants (product_id, name, options, price) values ($1, '30 ml', '{"contenance":"30 ml"}', 5) returning id`, [imp.id]);
    r = await one(db, 'select count(*)::int as n from public.product_variant_options where variant_id = $1', [v3.id]);
    check(r.n === 0, 'valeur inconnue (30 ml) : variante acceptée, laissée non normalisée');
    let dupOk = true;
    try { await db.query(`update public.product_variants set options = '{"contenance":"50 ml"}' where id = $1`, [v3.id]); } catch { dupOk = false; }
    check(dupOk, 'combinaison en double saisie dans l\'admin : enregistrement accepté (non normalisé)');
    check(await expectError(db.query(`insert into public.product_variant_options (variant_id, option_type_id, option_value_id)
      select $1, 'contenance', id from public.option_values where code = '100-ml'`, [v3.id]), /déjà utilisée/),
    'nouveau modèle : combinaison en double refusée par la contrainte');

    // Offres : saveOfferProducts() supprime puis réinsère par slug.
    const offer = await one(db, 'select offer_id from public.offer_products limit 1');
    if (offer) {
      await db.query('delete from public.offer_products where offer_id = $1', [offer.offer_id]);
      await db.query(`insert into public.offer_products (offer_id, product_slug, sort_order) values ($1, $2, 0), ($1, 'slug-inconnu', 1)`, [offer.offer_id, a.slug]);
      r = await rows(db, 'select product_slug, product_id from public.offer_products where offer_id = $1 order by sort_order', [offer.offer_id]);
      check(r[0].product_id === a.id && r[1].product_id === null, 'offre enregistrée par slug → product_id résolu ; slug inconnu toléré (comportement actuel)');
      await db.query(`delete from public.offer_products where offer_id = $1 and product_slug = 'slug-inconnu'`, [offer.offer_id]);
    }

    // Suppressions de l'admin : jamais bloquées par les nouvelles clés étrangères.
    const victim = await one(db, `select p.id from public.products p join public.offer_products op on op.product_id = p.id
                                   where p.id not in (select product_id from public.product_grouping_members) order by p.slug limit 1`);
    let delOk = true;
    try { await db.query('delete from public.products where id = $1', [victim.id]); } catch (e) { delOk = false; console.log(`    ${e.message}`); }
    check(delOk, 'suppression d\'un produit présent dans une offre, des collections et des médias : acceptée');
    const leftover = await one(db, 'select count(*)::int as n from public.offer_products where product_id is null');
    check(leftover.n >= 1, 'la ligne d\'offre garde son slug (product_id NULL), comme aujourd\'hui');
    let varDel = true;
    try { await db.query('delete from public.product_variants where id = $1', [v3.id]); } catch { varDel = false; }
    check(varDel, 'suppression d\'une variante : acceptée');
  });

  section('7. Panier et code promo (fonctions existantes)');
  const cart = await one(db, `select slug from public.products where active and not coming_soon and price_value is not null and category_id = 'gelules' limit 1`);
  if (cart) {
    const promo = await one(db, `select public.check_promo_code('CODE-INEXISTANT', $1::jsonb) as r`, [JSON.stringify([{ slug: cart.slug, qty: 1 }])]);
    check(promo.r.valid === false && promo.r.reason === 'invalid_code', 'check_promo_code répond toujours (verdict attendu)');
  }

  section('8. Garde-fous des nouvelles tables');
  await asRole(db, 'authenticated', async () => {
    check(await expectError(db.query(`insert into public.redirects (source_path, target_path, reason) values ('/a/', '/a/?couleur=noir', 'manual')`)), 'redirection vers elle-même refusée');
    await db.query(`insert into public.redirects (source_path, target_path, reason) values ('/test-a/', '/test-b/', 'manual')`);
    check(await expectError(db.query(`insert into public.redirects (source_path, target_path, reason) values ('/test-a/', '/test-c/', 'manual')`)), 'deux redirections actives pour une même source refusées');
    await db.query(`update public.redirects set active = false, deactivated_at = now() where source_path = '/test-a/'`);
    let reAdd = true;
    try { await db.query(`insert into public.redirects (source_path, target_path, reason) values ('/test-a/', '/test-c/', 'manual')`); } catch { reAdd = false; }
    check(reAdd, 'historique : une source désactivée peut être reprise');
    check(!(await expectError(db.query(`insert into public.redirects (source_path, status_code, reason) values ('/disparu/', 410, 'product_archived')`))), '410 sans destination accepté');
    check(await expectError(db.query(`insert into public.redirects (source_path, target_path, reason) values ('/Majuscule/', '/x/', 'manual')`)), 'source non normalisée refusée');
    await db.query(`delete from public.redirects`);
    check(await expectError(db.query(`update public.settings set value = '"oui"' where key = 'national_shipping_enabled'`)), 'settings : valeur d\'un mauvais type refusée');
    const mode = await one(db, `select id from public.collections where slug = 'mode'`);
    const qamis = await one(db, `select id from public.collections where slug = 'qamis'`);
    check(await expectError(db.query('update public.collections set parent_id = $1 where id = $2', [qamis.id, mode.id])), 'collections : cycle refusé');
    check(await expectError(db.query(`insert into public.product_collections (product_id, collection_id, role)
      select pc.product_id, c.id, 'primary' from public.product_collections pc, public.collections c where pc.role = 'primary' and c.slug = 'offres' limit 1`)), 'deuxième collection principale refusée');
    const path0 = (await one(db, `select path from public.collections where slug = 'qamis'`)).path;
    await db.query('update public.collections set parent_id = $1 where slug = \'qamis\'', [mode.id]);
    const path1 = (await one(db, `select path from public.collections where slug = 'qamis'`)).path;
    check(path0 === path1, 'changer le parent ne change pas l\'URL', path1);
  });
  for (const r of await rows(db, INVARIANTS)) {
    // Écarts VOULUS par les scénarios : une variante en double laissée non normalisée, et la ligne
    // d'offre d'un produit supprimé (slug conservé, product_id NULL — comportement historique).
    if (!r.ok && !/non recopiée|offer_products/.test(r.check_name)) check(false, `invariant après scénarios : ${r.check_name}`, r.detail);
  }

  section('9. Rollback puis réapplication (seconde instance)');
  const db2 = await newDb(data);
  const before2 = await fingerprint(db2);
  await applyMigrations(db2);
  await db2.exec(readFileSync(ROLLBACK, 'utf8'));
  const cols = await rows(db2, `select table_name, column_name from information_schema.columns where table_schema = 'public' order by 1, 2`);
  const fresh = await newDb(data);
  const colsFresh = await rows(fresh, `select table_name, column_name from information_schema.columns where table_schema = 'public' order by 1, 2`);
  check(JSON.stringify(cols) === JSON.stringify(colsFresh), 'après rollback : schéma identique à la production d\'avant', `${cols.length} colonnes`);
  check(JSON.stringify(await fingerprint(db2)) === JSON.stringify(before2), 'après rollback : données historiques identiques');
  const trg = await rows(db2, `select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not tgisinternal order by 1`);
  const trgFresh = await rows(fresh, `select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not tgisinternal order by 1`);
  check(JSON.stringify(trg) === JSON.stringify(trgFresh), 'après rollback : triggers d\'origine seulement', `${trg.length}`);
  check((await one(db2, 'select count(*)::int as n from test.notify_log')).n === 0, 'rollback : aucun appel de régénération');
  let reapply = true;
  try { await applyMigrations(db2); } catch (e) { reapply = false; console.log(`    ${e.message}`); }
  check(reapply, 'réapplication après rollback sans erreur');
  for (const r of await rows(db2, INVARIANTS)) if (!r.ok) check(false, `invariant après réapplication : ${r.check_name}`, r.detail);

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${passes} contrôle(s) réussi(s), ${failures} échec(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
