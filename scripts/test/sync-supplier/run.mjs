// Banc d'essai hors ligne du synchroniseur fournisseur V1.
//
//   cd scripts/test/sync-supplier && npm install && node run.mjs
//
// Aucun appel réseau sortant : le fournisseur et Supabase sont deux serveurs
// locaux éphémères ; la base est PGlite (Postgres 18 en WASM) initialisée avec
// le socle (schema-stub.sql) puis les VRAIS fichiers du dépôt :
// supabase/sql/product_sources.sql et supabase/sql/sync_supplier.sql.
//
// Ce que ce banc prouve, scénario par scénario (voir les titres `section()`) :
// migration + rollback + idempotence, RLS, dry-run sans écriture, enregistrement
// des faits et des propositions, dédoublonnage, obsolescence après changement
// des faits (avant ET après acceptation), application limitée aux prix et au
// prix de base, --verify, et surtout : aucune écriture de `active` ni de
// `coming_soon` n'est possible, ni par le code ni par les données.

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startMockBackend } from './mock-postgrest.mjs';
import { startMockSupplier } from './mock-supplier.mjs';
import { seed, supplierProducts, IDS, SUPPLIER_CODE } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SCRIPT = path.join(ROOT, 'scripts', 'sync-supplier.mjs');
const sync = await import(pathToFileURL(SCRIPT).href); // exports uniquement (le script ne s'exécute pas à l'import)

let passed = 0, failed = 0, current = '';
function section(t) { current = t; console.log(`\n## ${t}`); }
function ok(cond, label, detail) {
  if (cond) { passed++; console.log(`  ✔ ${label}`); }
  else { failed++; console.log(`  ✖ ${label}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
}
async function throws(fn, label, re) {
  try { await fn(); ok(false, label, 'aucune exception'); }
  catch (e) { ok(!re || re.test(e.message), label, e.message); }
}

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dn-sync-test-'));
const backend = await startMockBackend();
const supplier = await startMockSupplier({ products: supplierProducts() });
const db = backend.db;
const supplierConfigPath = path.join(tmp, 'supplier.test.json');
await writeFile(supplierConfigPath, JSON.stringify({ code: SUPPLIER_CODE, baseUrl: supplier.baseUrl, storeApiPath: '/wp-json/wc/store/v1' }));

const sql = async f => db.exec(await readFile(path.join(ROOT, 'supabase', 'sql', f), 'utf8'));
const q = async (s, p = []) => (await db.query(s, p)).rows;
const one = async (s, p = []) => (await q(s, p))[0];
const asRole = async (role, uid, fn) => {
  await db.exec(`set role ${role}`);
  if (uid) await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  try { return await fn(); } finally { await db.exec(`reset role`); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
};

let runCounter = 0;
async function runScript(args, { expectFail = false } = {}) {
  const work = path.join(tmp, `run-${++runCounter}`);
  await mkdir(work, { recursive: true });
  const env = { ...process.env, DN_SUPABASE_URL: backend.url, DN_SUPABASE_KEY: 'test-service-key', DN_SYNC_DELAY_MS: '0' };
  const full = [...args];
  if (!args.includes('--verify')) full.push('--work', work);
  if (!args.includes('--apply') && !args.includes('--verify')) full.push('--supplier-config', supplierConfigPath);
  const { code, out } = await new Promise(resolve => {
    const child = spawn(process.execPath, [SCRIPT, ...full], { env, cwd: ROOT });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => resolve({ code, out }));
  });
  if ((code !== 0) !== expectFail) { console.log(out); }
  ok((code !== 0) === expectFail, `exécution ${args.join(' ')} → code ${code}`);
  let plan = null, manifest = null;
  try { plan = JSON.parse(await readFile(path.join(work, 'plan.json'), 'utf8')); } catch {}
  try { manifest = JSON.parse(await readFile(path.join(work, 'apply-manifest.json'), 'utf8')); } catch {}
  return { code, out, work, plan, manifest };
}
const writesSince = mark => backend.writes.slice(mark);
const det = (plan, label) => plan.results.find(r => r.label === label);
const kinds = r => (r?.detections || []).map(d => d.kind).sort();
const snapshotFlags = () => q('select id, active, coming_soon, price_value from public.products order by slug');
const pending = (label) => q(`select p.kind, p.level, p.target, p.suggested_value, p.status from public.sync_proposals p where p.status='pending' order by kind`);

try {
  // ────────────────────────────────────────────────────────────────────────
  section('Migration : socle, product_sources.sql, sync_supplier.sql, rollback, idempotence');
  await db.exec(await readFile(path.join(HERE, 'schema-stub.sql'), 'utf8'));
  await sql('product_sources.sql');
  await sql('sync_supplier.sql');
  const tables = async () => (await q(`select tablename from pg_tables where schemaname='public' order by 1`)).map(r => r.tablename);
  let t = await tables();
  ok(['product_source_observations', 'product_supply', 'sync_proposals'].every(x => t.includes(x)), 'tables créées', t);
  const cols = async () => (await q(`select column_name from information_schema.columns where table_name='product_sources' order by 1`)).map(r => r.column_name);
  let c = await cols();
  ok(['last_attempt_at', 'last_error', 'purchase_price_at', 'purchase_price_origin'].every(x => c.includes(x)), 'product_sources : 4 colonnes ajoutées', c);
  await sql('sync_supplier.sql');
  ok(true, 'migration ré-exécutable sans erreur (idempotente)');
  await sql('sync_supplier_rollback.sql');
  t = await tables(); c = await cols();
  ok(!t.includes('sync_proposals') && !t.includes('product_supply') && !t.includes('product_source_observations'), 'rollback : tables supprimées', t);
  ok(!c.includes('last_attempt_at') && !c.includes('purchase_price_origin'), 'rollback : colonnes retirées', c);
  ok(t.includes('product_sources') && t.includes('products'), 'rollback : product_sources et products intacts');
  await sql('sync_supplier.sql');
  ok((await tables()).includes('sync_proposals'), 'migration ré-appliquée après rollback');
  backend.invalidateTypes();

  section('Contraintes');
  await seed(db);
  const src = await one(`select id from public.product_sources where variant_id = $1`, [IDS.yara50]);
  await throws(() => q(`update public.product_sources set purchase_price = 4.9 where id = $1`, [src.id]), 'purchase_price sans date ni origine refusé', /chk_product_sources_purchase_price_qualified/);
  await throws(() => q(`update public.product_sources set purchase_price = 4.9, purchase_price_at = now(), purchase_price_origin = 'devinette' where id = $1`, [src.id]), 'origine hors liste refusée', /purchase_price_origin/);
  await q(`update public.product_sources set purchase_price = 4.9, purchase_price_at = now(), purchase_price_origin = 'facture' where id = $1`, [src.id]);
  await q(`update public.product_sources set purchase_price = null, purchase_price_at = null, purchase_price_origin = null where id = $1`, [src.id]);
  ok(true, 'prix d’achat daté et sourcé accepté, puis remis à NULL');
  await throws(() => q(`insert into public.product_supply (product_id, stock_mode) values ($1, 'dropship')`, [IDS.yara]), 'stock_mode hors liste refusé', /stock_mode/);
  await throws(() => q(`insert into public.sync_proposals (run_id, product_id, kind, level, target, suggested_action, fingerprint) values ('t', $1, 'x', 'info', 'product_active', 'a', 'f')`, [IDS.yara]), 'cible « product_active » impossible (contrainte target)', /target/);
  await throws(() => q(`insert into public.sync_proposals (run_id, product_id, kind, level, target, suggested_action, fingerprint, status) values ('t', $1, 'x', 'info', 'none', 'a', 'f', 'accepted')`, [IDS.yara]), 'accepted sans decided_at refusé', /decided/);
  await q(`insert into public.sync_proposals (run_id, product_id, kind, level, target, suggested_action, fingerprint) values ('t', $1, 'dup', 'info', 'none', 'a', 'f')`, [IDS.yara]);
  await throws(() => q(`insert into public.sync_proposals (run_id, product_id, kind, level, target, suggested_action, fingerprint) values ('t', $1, 'dup', 'info', 'none', 'a', 'f2')`, [IDS.yara]), 'deux propositions pending de même (produit, kind) refusées par l’index', /uq_sync_proposals_pending/);
  await q(`delete from public.sync_proposals where kind='dup'`);
  await q(`insert into public.product_source_observations (source_id, regular_price, price, on_sale, in_stock) values ($1, 14.9, 4.9, true, true)`, [src.id]);
  await throws(() => q(`update public.product_source_observations set price = 1 where source_id = $1`, [src.id]), 'observations : UPDATE refusé même en propriétaire', /append-only/);
  await throws(() => q(`delete from public.product_source_observations where source_id = $1`, [src.id]), 'observations : DELETE refusé même en propriétaire', /append-only/);
  await db.exec('alter table public.product_source_observations disable trigger trg_pso_readonly'); await q(`delete from public.product_source_observations`); await db.exec('alter table public.product_source_observations enable trigger trg_pso_readonly');

  section('RLS : anon jamais, authentifié non-admin jamais, admin oui');
  for (const tbl of ['product_sources', 'product_source_observations', 'product_supply', 'sync_proposals']) {
    await throws(() => asRole('anon', null, () => q(`select * from public.${tbl}`)), `anon → ${tbl} : refusé`, /permission denied/);
    const rows = await asRole('authenticated', '22222222-2222-4222-8222-222222222222', () => q(`select * from public.${tbl}`));
    ok(rows.length === 0, `authentifié non-admin → ${tbl} : 0 ligne`);
  }
  const adminRows = await asRole('authenticated', IDS.admin, () => q(`select * from public.product_sources`));
  ok(adminRows.length === 11, `admin → product_sources : ${adminRows.length} lignes`);
  const anonProducts = await asRole('anon', null, () => q(`select slug, active from public.products`));
  ok(anonProducts.every(p => p.active) && anonProducts.length === 3, `anon → products : ${anonProducts.length} actifs seulement`);
  await asRole('authenticated', IDS.admin, () => q(`insert into public.product_supply (product_id, stock_mode) values ($1, 'on_demand')`, [IDS.orderable]));
  ok(true, 'admin → product_supply : insertion acceptée');
  await throws(() => asRole('authenticated', '22222222-2222-4222-8222-222222222222', () => q(`insert into public.product_supply (product_id, stock_mode) values ($1, 'on_demand')`, [IDS.khamrah])), 'non-admin → product_supply : insertion refusée', /policy/);
  await throws(() => asRole('authenticated', IDS.admin, () => q(`delete from public.sync_proposals`)), 'admin → sync_proposals : DELETE non accordé', /permission denied/);

  section('Garde-fous d’écriture du script (unitaires)');
  ok(sync.FORBIDDEN_COLUMNS.has('active') && sync.FORBIDDEN_COLUMNS.has('coming_soon'), 'FORBIDDEN_COLUMNS = {active, coming_soon}');
  const allAllowed = Object.values(sync.WRITABLE).flatMap(m => Object.values(m).flat());
  ok(!allAllowed.includes('active') && !allAllowed.includes('coming_soon'), 'aucune liste blanche ne contient active / coming_soon');
  for (const mode of Object.keys(sync.WRITABLE)) for (const table of ['products', 'product_variants', 'product_sources', 'sync_proposals', 'product_supply']) {
    for (const col of ['active', 'coming_soon']) {
      await throws(async () => sync.assertWritable(mode, table, { [col]: true }), `assertWritable(${mode}, ${table}, {${col}}) refuse`, /interdite|non autorisée/);
    }
  }
  await throws(async () => sync.assertWritable('record', 'products', { price_value: 1 }), 'mode record : products interdite', /non autorisée/);
  await throws(async () => sync.assertWritable('apply', 'products', { price_value: 1, slug: 'x' }), 'mode apply : products.slug interdite', /non autorisée/);
  await throws(async () => sync.assertWritable('dry-run', 'product_sources', { last_error: null }), 'mode dry-run : aucune table écrivable', /non autorisée/);
  ok(sync.assertWritable('apply', 'products', { price_value: 15 }).includes('price_value'), 'mode apply : products.price_value autorisée');
  const src2 = await readFile(SCRIPT, 'utf8');
  const writeCalls = [...src2.matchAll(/writeRow\(ctx, '(PATCH|POST)', '([a-z_]+)'/g)].map(m => m[2]);
  ok(!writeCalls.some(t => !['product_sources', 'product_source_observations', 'sync_proposals', 'products', 'product_variants', 'product_supply'].includes(t)), `writeRow n’écrit que : ${[...new Set(writeCalls)].join(', ')}`);
  ok(!/method:\s*'(PATCH|DELETE|PUT)'/.test(src2) && (src2.match(/method:\s*'POST'/g) || []).length === 1 && /grant_type=password[\s\S]{0,200}method: 'POST'/.test(src2), 'hors writeRow, le seul POST littéral du script est la connexion Auth ; aucun PATCH/DELETE/PUT littéral');

  // ────────────────────────────────────────────────────────────────────────
  section('Dry-run : détections attendues, zéro écriture');
  let mark = backend.writes.length;
  const dry = await runScript([]);
  ok(writesSince(mark).length === 0, 'aucune écriture Supabase en dry-run');
  ok(dry.plan && dry.plan.mode === 'dry-run', 'plan.json produit');
  const y50 = det(dry.plan, 'Yara — 50 ml');
  ok(y50 && JSON.stringify(kinds(y50)) === JSON.stringify(['base_price_missing', 'dn_below_regular', 'promo_strong']), 'Yara 50 ml : base_price_missing + dn_below_regular + promo_strong', kinds(y50));
  ok(y50.detections.every(d => d.level === 'info' || d.kind === 'promo_strong'), 'Yara 50 ml (brouillon) : niveaux info, promo_strong = attention', y50.detections.map(d => d.level));
  ok(/rentabilité inconnue/.test(y50.detections.find(d => d.kind === 'dn_below_regular').suggested_action) && !/perte de/.test(JSON.stringify(y50.detections)), 'Yara : « rentabilité inconnue », jamais « perte de X € »');
  const yParent = det(dry.plan, 'Yara');
  ok(JSON.stringify(kinds(yParent)) === JSON.stringify(['stock_mode_missing']), 'Yara (parent variable) : seulement stock_mode_missing', kinds(yParent));
  const kh = det(dry.plan, 'Khamrah');
  ok(JSON.stringify(kinds(kh)) === JSON.stringify(['base_price_missing', 'dn_below_regular', 'promo_strong', 'stock_mode_missing']), 'Khamrah : promo_strong (écart 16 €) + dn_below_regular + déclarations manquantes', kinds(kh));
  ok(kh.detections.find(d => d.kind === 'dn_below_regular').level === 'attention', 'Khamrah (actif, coming_soon, stock inconnu) : dn_below_regular = attention');
  const am = det(dry.plan, 'Amber d’Or');
  ok(kinds(am).includes('supplier_out_of_stock') && am.detections.find(d => d.kind === 'supplier_out_of_stock').level === 'info' && /ne pas activer/i.test(am.detections.find(d => d.kind === 'supplier_out_of_stock').suggested_action), 'Amber d’Or (brouillon, rupture) : supplier_out_of_stock info « ne pas activer »');
  const ord = det(dry.plan, 'Test commandable');
  const obs = ord.detections.find(d => d.kind === 'dn_below_supplier');
  ok(obs && obs.level === 'bloquant' && obs.target === 'none', 'Produit actif commandable à la commande, 20 € < 25 € fournisseur : dn_below_supplier BLOQUANT, cible none (pas de prix de base)', obs);
  ok(!kinds(ord).includes('stock_mode_missing'), 'stock_mode déclaré (on_demand) → pas de stock_mode_missing');
  ok(dry.plan.results.every(r => r.changed === true), 'première observation : toutes les sources marquées « changées » (historique vide)');

  section('Record #1 : faits + observations + propositions ; produits intacts');
  const flagsBefore = await snapshotFlags();
  mark = backend.writes.length;
  const rec1 = await runScript(['--record']);
  const w1 = writesSince(mark);
  ok(new Set(w1.map(w => w.table)).size && [...new Set(w1.map(w => w.table))].every(t => ['product_sources', 'product_source_observations', 'sync_proposals'].includes(t)), `tables écrites : ${[...new Set(w1.map(w => w.table))].join(', ')}`);
  ok(!w1.some(w => JSON.stringify(w.body).includes('"active"') || JSON.stringify(w.body).includes('"coming_soon"')), 'aucun corps de requête ne contient active / coming_soon');
  ok(w1.every(w => /columns=/.test(w.query)), 'chaque écriture porte columns= (liste blanche côté PostgREST)');
  const nObs = await one('select count(*)::int n from public.product_source_observations');
  ok(nObs.n === 11, `observations : ${nObs.n} (une par source, première observation)`);
  const nProp = await one(`select count(*)::int n from public.sync_proposals where status='pending'`);
  ok(nProp.n === dry.plan.results.reduce((s, r) => s + r.detections.length, 0), `propositions pending : ${nProp.n} = détections du dry-run`);
  ok(JSON.stringify(await snapshotFlags()) === JSON.stringify(flagsBefore), 'products : active / coming_soon / price_value identiques avant/après');
  const srcAfter = await one(`select last_synced_at, last_attempt_at, last_error from public.product_sources where variant_id=$1`, [IDS.yara50]);
  ok(srcAfter.last_error === null && srcAfter.last_attempt_at && String(srcAfter.last_synced_at) === String(srcAfter.last_attempt_at), 'product_sources : last_synced_at = last_attempt_at, last_error NULL');
  ok(/Aucun prix, aucun `active`, aucun `coming_soon`/.test(await readFile(path.join(rec1.work, 'report.md'), 'utf8')), 'report.md : mention explicite « aucun prix, aucun active, aucun coming_soon »');

  section('Record #2 sans changement : dédoublonnage');
  mark = backend.writes.length;
  await runScript(['--record']);
  const w2 = writesSince(mark);
  ok(!w2.some(w => w.table === 'product_source_observations'), 'aucune nouvelle observation');
  ok(!w2.some(w => w.table === 'sync_proposals'), 'aucune proposition créée ni rendue obsolète');
  ok((await one(`select count(*)::int n from public.sync_proposals where status='pending'`)).n === nProp.n, 'nombre de propositions pending inchangé');

  section('Déclarations Dar Nūr (faits B) → propositions recalculées');
  await q(`insert into public.product_supply (product_id, variant_id, stock_mode) values ($1, null, 'on_demand')`, [IDS.yara]);
  await q(`insert into public.product_supply (product_id, variant_id, base_price) values ($1, $2, 15)`, [IDS.yara, IDS.yara50]);
  mark = backend.writes.length;
  const rec3 = await runScript(['--record']);
  const y50b = det(rec3.plan, 'Yara — 50 ml');
  ok(!kinds(y50b).includes('base_price_missing') && y50b.toObsolete.length === 3 && y50b.toCreate.length === 2, 'Yara 50 ml : 3 anciennes obsolètes (faits modifiés), 2 recréées, base_price_missing disparu', { obs: y50b.toObsolete.length, cre: y50b.toCreate });
  ok(det(rec3.plan, 'Yara').toObsolete.length === 1 && det(rec3.plan, 'Yara').toCreate.length === 0, 'Yara parent : stock_mode_missing levé');
  const y100b = det(rec3.plan, 'Yara — 100 ml');
  ok(kinds(y100b).includes('base_price_missing') && y100b.toObsolete.length === 3 && y100b.toCreate.length === 3, 'Yara 100 ml : stock_mode hérité du produit → empreinte changée, propositions recréées (base_price toujours manquant)');
  ok((await one(`select count(*)::int n from public.sync_proposals where status='obsolete'`)).n === 7, 'obsolètes en base : 7');

  section('Fin de promo Yara 50 ml : promo_end proposé, prix intact');
  supplier.set(1051, { regular: 14.9, price: 14.9 });
  supplier.set(1001, { regular: 14.9, price: 14.9 });
  mark = backend.writes.length;
  const rec4 = await runScript(['--record']);
  const y50c = det(rec4.plan, 'Yara — 50 ml');
  ok(JSON.stringify(kinds(y50c)) === JSON.stringify(['dn_below_supplier', 'promo_end']), 'Yara 50 ml : promo_end + dn_below_supplier (promo_strong et dn_below_regular levés)', kinds(y50c));
  const pe = y50c.detections.find(d => d.kind === 'promo_end');
  ok(pe.target === 'variant_price' && pe.suggested_value === 15, 'promo_end : cible variant_price, valeur suggérée = prix de base 15 €', pe);
  const dbs = y50c.detections.find(d => d.kind === 'dn_below_supplier');
  ok(dbs.level === 'info' && dbs.target === 'variant_price' && dbs.suggested_value === 15, 'dn_below_supplier (brouillon) : info, propose le retour au prix de base', dbs);
  ok((await one('select count(*)::int n from public.product_source_observations where source_id=$1', [src.id])).n === 2, 'Yara 50 ml : 2e observation enregistrée (changement)');
  const yaraPrices = await one('select p.price_value, v.price from public.products p join public.product_variants v on v.id=$1 where p.id=$2', [IDS.yara50, IDS.yara]);
  ok(Number(yaraPrices.price) === 5 && Number(yaraPrices.price_value) === 5, 'Yara 50 ml toujours 5 € (aucune écriture de prix sans décision)');
  const report4 = await readFile(path.join(rec4.work, 'report.md'), 'utf8');
  ok(/\| Yara — 50 ml \(brouillon\) \| 5,00 € \| 4,90 € \| 14,90 € \| non \| 207 \| à la commande \| non renseigné \|/.test(report4), 'rapport : ligne Yara 50 ml (prix DN / avant / actuel / promo / stock / stock DN / achat)');

  section('Acceptation puis changement des faits AVANT --apply → obsolète, rien n’est appliqué');
  const peRow = await one(`select id from public.sync_proposals where status='pending' and kind='promo_end' and variant_id=$1`, [IDS.yara50]);
  await q(`update public.sync_proposals set status='accepted', decided_at=now(), decided_by=$2, decided_value=15, decision_note='test' where id=$1`, [peRow.id, IDS.admin]);
  supplier.set(1051, { regular: 13.9, price: 13.9 });
  await runScript(['--record']);
  const peAfter = await one(`select status, obsolete_reason, applied_at from public.sync_proposals where id=$1`, [peRow.id]);
  ok(peAfter.status === 'obsolete' && /après acceptation/.test(peAfter.obsolete_reason) && !peAfter.applied_at, 'proposition acceptée rendue obsolète par --record (faits modifiés après acceptation)', peAfter);
  mark = backend.writes.length;
  const ap0 = await runScript(['--apply']);
  ok(/Rien à appliquer/.test(ap0.out) && writesSince(mark).length === 0, '--apply : rien à appliquer, aucune écriture');

  section('Acceptation puis modification du prix Dar Nūr AVANT --apply (chemin --apply) → refus');
  const pe2 = await one(`select id from public.sync_proposals where status='pending' and kind='dn_below_supplier' and variant_id=$1`, [IDS.yara50]);
  ok(!!pe2, 'dn_below_supplier (état) recréé avec les nouveaux faits (13,90 €) ; promo_end (événement) non recréé');
  ok((await one(`select count(*)::int n from public.sync_proposals where status='pending' and kind='promo_end' and variant_id=$1`, [IDS.yara50])).n === 0, 'aucun promo_end pending après obsolescence (un événement ne se rejoue pas)');
  await q(`update public.sync_proposals set status='accepted', decided_at=now(), decided_by=$2, decided_value=15 where id=$1`, [pe2.id, IDS.admin]);
  await q(`update public.product_variants set price = 6 where id=$1`, [IDS.yara50]); // un administrateur change le prix à la main entre-temps
  mark = backend.writes.length;
  const ap1 = await runScript(['--apply']);
  const pe2After = await one(`select status, obsolete_reason, applied_at from public.sync_proposals where id=$1`, [pe2.id]);
  ok(pe2After.status === 'obsolete' && /entre l’acceptation et l’application/.test(pe2After.obsolete_reason), '--apply : empreinte différente → obsolète', pe2After);
  ok(ap1.manifest.applied.length === 0 && ap1.manifest.refused.length === 1, 'manifeste : 0 appliquée, 1 refusée');
  ok(writesSince(mark).every(w => w.table === 'sync_proposals'), 'seule sync_proposals a été écrite');
  ok(Number((await one('select price from public.product_variants where id=$1', [IDS.yara50])).price) === 6, 'prix variante inchangé (6 €, valeur manuelle)');
  await q(`update public.product_variants set price = 5 where id=$1`, [IDS.yara50]);

  section('Chemin nominal : promo → fin de promo → record → accepter → apply → verify');
  supplier.set(1051, { regular: 14.9, price: 4.9 });
  const recP = await runScript(['--record']);
  ok(JSON.stringify(kinds(det(recP.plan, 'Yara — 50 ml'))) === JSON.stringify(['dn_below_regular', 'promo_strong', 'regular_up']), 'retour en promo : promo_strong + dn_below_regular (+ regular_up : 13,90 → 14,90)', kinds(det(recP.plan, 'Yara — 50 ml')));
  supplier.set(1051, { regular: 14.9, price: 14.9 });
  const recE = await runScript(['--record']);
  ok(JSON.stringify(kinds(det(recE.plan, 'Yara — 50 ml'))) === JSON.stringify(['dn_below_supplier', 'promo_end']), 'fin de promo : promo_end + dn_below_supplier', kinds(det(recE.plan, 'Yara — 50 ml')));
  await runScript(['--record']);
  const pe3 = await one(`select id, suggested_value, status from public.sync_proposals where kind='promo_end' and variant_id=$1 and status='pending'`, [IDS.yara50]);
  ok(!!pe3 && Number(pe3.suggested_value) === 15, 'promo_end toujours pending après un passage sans changement (événement conservé, faits identiques)');
  await q(`update public.sync_proposals set status='accepted', decided_at=now(), decided_by=$2, decided_value=15, decision_note='retour au prix de base' where id=$1`, [pe3.id, IDS.admin]);
  const ackRow = await one(`select id from public.sync_proposals where status='pending' and kind='supplier_out_of_stock' and product_id=$1`, [IDS.amber]);
  await q(`update public.sync_proposals set status='accepted', decided_at=now(), decided_by=$2, decision_note='vu, brouillon laissé inactif' where id=$1`, [ackRow.id, IDS.admin]);
  const flags2 = await snapshotFlags();
  mark = backend.writes.length;
  const ap2 = await runScript(['--apply']);
  const w3 = writesSince(mark);
  ok(ap2.manifest.applied.length === 2 && ap2.manifest.refused.length === 0, 'manifeste : 2 appliquées (prix variante + prise en compte manuelle)', ap2.manifest.refused);
  ok(Number((await one('select price from public.product_variants where id=$1', [IDS.yara50])).price) === 15, 'Yara 50 ml : 15 € écrit');
  ok(Number((await one('select price_value from public.products where id=$1', [IDS.yara])).price_value) === 15, 'Yara : price_value recalculé = min(15, 19) = 15');
  const flags3 = await snapshotFlags();
  ok(flags2.every((f, i) => f.active === flags3[i].active && f.coming_soon === flags3[i].coming_soon), 'active / coming_soon inchangés sur tous les produits');
  ok(!w3.some(w => JSON.stringify(w.body).includes('"active"') || JSON.stringify(w.body).includes('"coming_soon"')), 'aucun corps de requête --apply ne contient active / coming_soon');
  ok(w3.filter(w => w.table === 'products').every(w => Object.keys(w.body).join() === 'price_value') && w3.filter(w => w.table === 'product_variants').every(w => Object.keys(w.body).join() === 'price'), 'products : seule price_value ; product_variants : seule price');
  const ackAfter = await one('select applied_at, applied_payload from public.sync_proposals where id=$1', [ackRow.id]);
  ok(ackAfter.applied_at && ackAfter.applied_payload?.after?.manual === true, 'proposition « ne pas activer » acceptée : marquée appliquée, aucune écriture produit (manual: true)');
  ok(Number((await one('select active::int a from public.products where id=$1', [IDS.amber])).a) === 0, 'Amber d’Or toujours inactif');
  const ver = await runScript(['--verify', ap2.work]);
  ok(/contrôles réussis/.test(ver.out) && !/✖/.test(ver.out), '--verify : tous les contrôles réussis');
  const recAfterApply = await runScript(['--record']);
  ok(!kinds(det(recAfterApply.plan, 'Yara — 50 ml')).includes('dn_below_supplier'), 'après application : dn_below_supplier levé (15 € ≥ 14,90 €)');

  section('Prix parent = minimum des variantes ACTIVES, jamais une copie de la variante modifiée');
  // Injecte une proposition acceptée « prix variante » dont l'empreinte correspond aux faits courants
  // (même calcul que le script), puis applique. Yara : 50 ml 15 € / 100 ml 19 € → parent 15 €.
  const yaraTriple = async () => { const r = await q(`select p.price_value, (select price from public.product_variants where id=$2) as v50, (select price from public.product_variants where id=$3) as v100 from public.products p where p.id=$1`, [IDS.yara, IDS.yara50, IDS.yara100]); return { parent: Number(r[0].price_value), v50: Number(r[0].v50), v100: Number(r[0].v100) }; };
  ok(JSON.stringify(await yaraTriple()) === JSON.stringify({ parent: 15, v50: 15, v100: 19 }), 'état initial : 50 ml 15 €, 100 ml 19 €, parent 15 €', await yaraTriple());
  async function injectVariantDecision(variantId, value, kind) {
    const s = await one('select * from public.product_sources where variant_id=$1', [variantId]);
    const v = await one('select price from public.product_variants where id=$1', [variantId]);
    const sup = await one('select stock_mode from public.product_supply where product_id=$1 and variant_id is null', [IDS.yara]);
    const base = await one('select base_price from public.product_supply where product_id=$1 and variant_id=$2', [IDS.yara, variantId]);
    const fp = sync.fingerprintOf({ regular_price: s.supplier_regular_price, price: s.supplier_price, on_sale: s.supplier_on_sale, in_stock: s.supplier_in_stock }, Number(v.price), { stock_mode: sup?.stock_mode ?? null, base_price: base?.base_price ?? null }, s.purchase_price);
    await q(`insert into public.sync_proposals (run_id, product_id, variant_id, source_id, kind, level, target, suggested_action, suggested_value, fingerprint, status, decided_at, decided_by, decided_value)
             values ('test', $1, $2, $3, $4, 'info', 'variant_price', 'test', $5, $6, 'accepted', now(), $7, $5)`, [IDS.yara, variantId, s.id, kind, value, fp, IDS.admin]);
  }
  await injectVariantDecision(IDS.yara50, 25, 'test_min_1');
  const apMin1 = await runScript(['--apply']);
  ok(apMin1.manifest.applied.length === 1 && apMin1.manifest.refused.length === 0, 'proposition 50 ml → 25 € appliquée', apMin1.manifest.refused);
  ok(JSON.stringify(await yaraTriple()) === JSON.stringify({ parent: 19, v50: 25, v100: 19 }), '50 ml 25 € → parent 19 € (= 100 ml, le minimum), pas 25 €', await yaraTriple());
  ok(apMin1.manifest.applied[0].after.price_value === 19 && apMin1.manifest.applied[0].before.price_value === 15, 'manifeste : price_value 15 → 19');
  await injectVariantDecision(IDS.yara50, 12, 'test_min_2');
  await runScript(['--apply']);
  ok(JSON.stringify(await yaraTriple()) === JSON.stringify({ parent: 12, v50: 12, v100: 19 }), '50 ml 12 € → parent 12 €', await yaraTriple());
  await injectVariantDecision(IDS.yara100, 17, 'test_min_3');
  await runScript(['--apply']);
  ok(JSON.stringify(await yaraTriple()) === JSON.stringify({ parent: 12, v50: 12, v100: 17 }), '100 ml 17 € → parent reste 12 € (products non écrit : déjà au minimum)', await yaraTriple());
  // Variante inactive exclue du minimum : 50 ml désactivée (geste admin simulé dans la fixture), 100 ml 17 → 16.
  await q(`update public.product_variants set active = false where id=$1`, [IDS.yara50]);
  await injectVariantDecision(IDS.yara100, 16, 'test_min_4');
  const apMin4 = await runScript(['--apply']);
  ok(JSON.stringify(await yaraTriple()) === JSON.stringify({ parent: 16, v50: 12, v100: 16 }), '50 ml inactive (12 €) ignorée : parent = 16 € (seule variante active)', await yaraTriple());
  ok(apMin4.manifest.writes.filter(w => w.table === 'product_variants').every(w => !('active' in w.body)), 'le script n’a pas touché product_variants.active');
  await q(`update public.product_variants set active = true where id=$1`, [IDS.yara50]);
  await injectVariantDecision(IDS.yara50, 15, 'test_min_5');
  await injectVariantDecision(IDS.yara100, 19, 'test_min_6');
  await runScript(['--apply']);
  ok(JSON.stringify(await yaraTriple()) === JSON.stringify({ parent: 15, v50: 15, v100: 19 }), 'retour : 50 ml 15 €, 100 ml 19 €, parent 15 €', await yaraTriple());

  section('Refus à l’application : valeur non entière, valeur absente');
  await runScript(['--record']);
  const y100 = await one(`select id from public.sync_proposals where status='pending' and kind='base_price_missing' and variant_id=$1`, [IDS.yara100]);
  await q(`update public.sync_proposals set target='base_price', status='accepted', decided_at=now(), decided_by=$2, decided_value=28.5 where id=$1`, [y100.id, IDS.admin]);
  const ap3 = await runScript(['--apply']);
  ok(ap3.manifest.refused.length === 1 && /non arrondie/.test(ap3.manifest.refused[0].reason), 'base_price 28,50 € refusé (requireWholeEuros)', ap3.manifest.refused);
  await q(`update public.sync_proposals set decided_value=29 where id=$1`, [y100.id]);
  const ap4 = await runScript(['--apply']);
  ok(ap4.manifest.applied.length === 1 && Number((await one('select base_price from public.product_supply where variant_id=$1', [IDS.yara100])).base_price) === 29, 'base_price 29 € écrit dans product_supply (ligne créée)');
  const y100Price = await one('select price from public.product_variants where id=$1', [IDS.yara100]);
  ok(Number(y100Price.price) === 19, 'cible base_price : le prix public de la variante reste 19 €');

  section('Prix d’achat réel connu : la lecture change');
  await runScript(['--record']);
  const khSrc = await one('select id from public.product_sources where product_id=$1', [IDS.khamrah]);
  await q(`update public.product_sources set purchase_price=20, purchase_price_at='2026-09-01', purchase_price_origin='facture' where id=$1`, [khSrc.id]);
  const rec5 = await runScript(['--record']);
  const khb = det(rec5.plan, 'Khamrah');
  ok(kinds(khb).includes('dn_below_regular') && khb.detections.find(d => d.kind === 'dn_below_regular').level === 'info', 'Khamrah 29 € ≥ achat 20 € : dn_below_regular rétrogradé en info (signal, plus une alerte)', khb.detections.map(d => d.kind + ':' + d.level));
  ok(/prix d’achat renseigné 20,00 €/.test(JSON.stringify(khb.detections)), 'évidence : « prix d’achat renseigné 20,00 € (facture, 2026-09-01) »');
  await q(`update public.product_sources set purchase_price=35, purchase_price_at='2026-09-01', purchase_price_origin='facture' where id=$1`, [khSrc.id]);
  const rec6 = await runScript(['--record']);
  const khc = det(rec6.plan, 'Khamrah');
  const dbp = khc.detections.find(d => d.kind === 'dn_below_purchase');
  ok(dbp && dbp.level === 'bloquant' && /vente à perte/.test(dbp.suggested_action), 'Khamrah 29 € < achat 35 € : dn_below_purchase BLOQUANT (seul cas où « perte » est affirmé : prix d’achat réel connu)', dbp);
  await q(`update public.product_sources set purchase_price=null, purchase_price_at=null, purchase_price_origin=null where id=$1`, [khSrc.id]);

  section('Fournisseur injoignable, puis de retour');
  supplier.state.down = true;
  const before = await one('select last_synced_at, last_error from public.product_sources where id=$1', [src.id]);
  mark = backend.writes.length;
  const r7 = await runScript(['--record']);
  const after1 = await one('select last_synced_at, last_attempt_at, last_error from public.product_sources where id=$1', [src.id]);
  ok(String(after1.last_synced_at) === String(before.last_synced_at) && after1.last_error && after1.last_attempt_at > after1.last_synced_at, 'panne #1 : last_error renseigné, last_synced_at inchangé');
  ok(!writesSince(mark).some(w => w.table === 'product_source_observations' || (w.table === 'sync_proposals' && w.method === 'POST')), 'panne #1 : aucune observation, aucune proposition (première tentative)');
  ok(r7.plan.results.every(r => r.error), 'toutes les sources en erreur');
  await runScript(['--record']);
  ok((await one(`select count(*)::int n from public.sync_proposals where status='pending' and kind='unreachable'`)).n === 11, 'panne #2 : proposition unreachable par source');
  ok((await one(`select count(*)::int n from public.sync_proposals where status='pending' and kind not in ('unreachable')`)).n > 0, 'les autres propositions en attente sont conservées telles quelles');
  supplier.state.down = false;
  await runScript(['--record']);
  ok((await one(`select count(*)::int n from public.sync_proposals where status='pending' and kind='unreachable'`)).n === 0, 'retour : unreachable rendues obsolètes');
  const back = await one('select last_error from public.product_sources where id=$1', [src.id]);
  ok(back.last_error === null, 'retour : last_error NULL');

  section('Amber d’Or de retour en stock ; hausse et baisse du prix régulier');
  supplier.set(1007, { inStock: true, qty: 4 });
  supplier.set(1006, { regular: 55, price: 55 });      // Jade Giallo : hausse
  supplier.set(1005, { regular: 30, price: 30 });      // Libbra : baisse durable (DN 35 €)
  const rec8 = await runScript(['--record']);
  ok(JSON.stringify(kinds(det(rec8.plan, 'Amber d’Or'))) === JSON.stringify(['base_price_missing', 'stock_mode_missing', 'supplier_back_in_stock']), 'Amber d’Or : supplier_back_in_stock (info), out_of_stock levé', kinds(det(rec8.plan, 'Amber d’Or')));
  const jd = det(rec8.plan, 'Jade Giallo').detections.find(d => d.kind === 'regular_up');
  ok(jd && jd.target === 'none', 'Jade Giallo : regular_up, aucune cible de prix');
  const lb = det(rec8.plan, 'Libbra').detections.find(d => d.kind === 'regular_down');
  ok(lb && lb.target === 'product_price' && lb.suggested_value === 30 && lb.evidence.sets_base_price === true, 'Libbra : regular_down, suggestion 30 € (nouveau prix de base si accepté)', lb);
  const lbRow = await one(`select id from public.sync_proposals where status='pending' and kind='regular_down' and product_id=$1`, [IDS.libbra]);
  await q(`update public.sync_proposals set status='accepted', decided_at=now(), decided_by=$2, decided_value=31 where id=$1`, [lbRow.id, IDS.admin]);
  const ap5 = await runScript(['--apply']);
  ok(Number((await one('select price_value from public.products where id=$1', [IDS.libbra])).price_value) === 31 && Number((await one('select base_price from public.product_supply where product_id=$1 and variant_id is null', [IDS.libbra])).base_price) === 31, 'Libbra : 31 € (valeur décidée ≠ suggérée) écrit en prix public ET en prix de base');
  const ver5 = await runScript(['--verify', ap5.work]);
  ok(!/✖/.test(ver5.out), '--verify après Libbra : tous les contrôles réussis');

  section('Plafond d’application');
  await q(`update public.sync_proposals set status='accepted', decided_at=now(), decided_by=$1 where status='pending' and target='none'`, [IDS.admin]);
  const nAcc = (await one(`select count(*)::int n from public.sync_proposals where status='accepted' and applied_at is null`)).n;
  const ap6 = await runScript(['--apply', '--max', '2'], { expectFail: true });
  ok(/plafond 2/.test(ap6.out) && nAcc > 2, `--max 2 avec ${nAcc} acceptées : abandon sans écriture`);
  await runScript(['--apply', '--max', '50']);
  ok((await one(`select count(*)::int n from public.sync_proposals where status='accepted' and applied_at is null`)).n === 0, 'toutes les acceptations « none » marquées appliquées (manuelles) avec --max 50');

  section('Bilan global des écritures');
  const allBodies = backend.writes.map(w => JSON.stringify(w.body)).join('\n');
  ok(!/"active"|"coming_soon"/.test(allBodies), `sur ${backend.writes.length} écritures HTTP du banc, aucune ne contient active ni coming_soon`);
  ok(backend.writes.filter(w => w.table === 'products').every(w => Object.keys(w.body).join() === 'price_value'), 'toutes les écritures products = {price_value} uniquement');
  const finalFlags = await snapshotFlags();
  ok(finalFlags.every((f, i) => f.active === flagsBefore[i].active && f.coming_soon === flagsBefore[i].coming_soon), 'active / coming_soon finaux = initiaux pour les 9 produits');
} catch (e) {
  failed++;
  console.log(`\n✖ Exception dans « ${current} » : ${e.stack || e.message}`);
} finally {
  await supplier.close();
  await backend.close();
  await rm(tmp, { recursive: true, force: true });
}
console.log(`\n${passed} réussi(s) · ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
