// Étape 16 — PGlite uniquement, données fictives, aucun fetch ni secret.
// npm run test:legacy-gate
// node legacy-gate.mjs --fixtures <dossier> : JSON fictifs pour orders/emails --data.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const DIR = 'supabase/migrations';
const GATE = read(`${DIR}/20261028100000_etape16_01_legacy_ordering_gate.sql`);
const ROLLBACK = read('supabase/rollback/20261028_etape16_rollback.sql');
const maintenance = (state) => read(`supabase/maintenance/20261028_etape16_${state === 'closed' ? 'fermer' : 'rouvrir'}_commandes_historiques.sql`);
const ADMIN = '00000000-0000-4000-8000-00000000ad00';
const USER = '00000000-0000-4000-8000-0000000000b0';
const EMAIL = 'test.commande@example.com';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Aucun catalogue réel : même le slug exigé par orders.mjs représente ici un produit fictif.
function fixtures(historicalReferences = false) {
  const product = (n, slug, category_id, extra = {}) => ({ id: id(n), slug, category_id,
    name: `Produit fictif ${n}`, price_value: 10, active: true, ...extra });
  const data = {
    categories: ['miels', 'qamis', 'parfums'].map((id) => ({ id, label: `Catégorie fictive ${id}`, filter_label: id })),
    brands: [], offers: [], offer_products: [],
    products: [product(1, 'test-simple-a', 'parfums'), product(2, 'test-simple-b', 'parfums'),
      product(3, 'miel-nigelle', 'miels', { variant_axes: ['contenance'] }),
      product(4, 'test-qamis', 'qamis', { variant_axes: ['taille'] }),
      product(5, 'test-bientot', 'parfums', { coming_soon: true })],
    product_variants: [
      { id: id(31), product_id: id(3), name: '200 g', options: { contenance: '200 g' }, price: 10, active: true },
      { id: id(41), product_id: id(4), name: 'M', options: { taille: 'M' }, price: 10, active: true },
    ],
  };
  if (historicalReferences) {
    // Identifiants exigés par les assertions de migration 6_09, exclusivement dans
    // les JSON temporaires de test : aucun produit commercial n'est restauré.
    const sql = read(`${DIR}/20261002100800_etape6_09_product_groupings.sql`);
    const members = sql.slice(sql.indexOf('as g(code'), sql.indexOf(') as m(code'));
    const slugs = [...new Set([...members.matchAll(/\('(G\d+\w*|FARASHA|DUP-[A-Z-]+)', '([^']+)'/g)].map((m) => m[2]))];
    data.products.push(...slugs.map((slug,i) => product(100+i,slug,'parfums')));
  }
  return data;
}

const rows = async (db, sql, args) => (await db.query(sql, args)).rows;
const one = async (db, sql, args) => (await rows(db, sql, args))[0];
let passes = 0;
function check(cond, label) {
  if (!cond) throw new Error(`ÉCHEC : ${label}`);
  console.log(`  ✓ ${++passes}. ${label}`);
}
async function denied(fn, pattern = /permission denied/) {
  try { await fn(); return false; } catch (e) { if (!pattern.test(e.message)) throw e; return true; }
}
async function as(db, who, fn, headers = {}) {
  const role = { anon: 'anon', user: 'authenticated', admin: 'authenticated', service: 'service_role' }[who];
  if (role) await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.headers', $2, false)`,
    [who === 'admin' ? ADMIN : who === 'user' ? USER : '', JSON.stringify(headers)]);
  try { return await fn(); } finally {
    await db.exec('reset role');
    await db.exec(`select set_config('request.jwt.claim.sub', '', false), set_config('request.headers', '', false)`);
  }
}
let ip = 0;
const payload = (extra = {}) => ({ idempotency_key: crypto.randomUUID(), environment: 'preprod',
  customer: { first_name: 'Test', last_name: 'Fictif', email: EMAIL, phone: '+33 6 12 34 56 78' },
  shipping: { address_line1: '1 rue Fictive', postal_code: '75001', city: 'Paris', country_code: 'FR' },
  items: [{ product_id: id(1), variant_id: null, quantity: 1, unit_price_cents: 1000 }],
  terms_accepted: true, website: '', ...extra });
const create = (db, body = payload(), who = 'anon', headers = {}) => as(db, who,
  async () => (await one(db, 'select public.create_order_request($1::jsonb) r', [JSON.stringify(body)])).r,
  { 'x-forwarded-for': `203.0.113.${++ip}`, ...headers });
const admin = (db, order, action, data = {}) => as(db, 'admin', async () =>
  (await one(db, 'select public.admin_update_order($1,$2,$3::jsonb) r', [order, action, JSON.stringify(data)])).r);
async function toggle(db, state) {
  // Seul le motif à remplir est substitué : le script administratif réel est exécuté entier.
  const results = await db.exec(maintenance(state).replace("v_reason text := '';", "v_reason text := 'Banc fictif étape 16';"));
  check(results[1].rows[0].controle === 'avant' && results.at(-2).rows[0].controle === 'après', `${state} : contrôles avant/après du script réel`);
  const cfg = await one(db, `select legacy_ordering_state s, legacy_ordering_changed_at t, legacy_ordering_reason r from orders_private.config`);
  check(cfg.s === state && cfg.t && cfg.r === 'Banc fictif étape 16', `${state} : état, horodatage et motif enregistrés`);
}
const totals = async (db) => JSON.stringify(await rows(db, `select
  (select count(*) from public.orders) orders, (select count(*) from public.order_items) items,
  (select count(*) from public.order_events) events, (select count(*) from orders_private.submissions) submissions,
  (select count(*) from orders_private.order_emails) outbox,
  (select count(*) from orders_private.order_emails where email_type = 'order_received') received,
  (select count(*) from net.calls) kicks`));
// ACL explicites et effectives (tables/colonnes/schémas/séquences/fonctions), RLS et politiques.
async function permissions(db) {
  const result = [];
  for (const sql of [
    `select nspname, nspacl::text from pg_namespace where nspname in ('public','orders_private') order by 1`,
    `select n.nspname,c.relname,c.relkind,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname in ('public','orders_private') order by 1,2`,
    `select n.nspname,c.relname,a.attname,a.attacl::text from pg_attribute a
       join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
       where n.nspname in ('public','orders_private') and a.attnum>0 and not a.attisdropped
         and a.attname not like 'legacy_ordering_%' order by 1,2,3`,
    `select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl::text
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname in ('public','orders_private') and p.proname not like 'legacy_ordering_%' order by 1,2,3`,
    `select * from pg_policies where schemaname in ('public','orders_private') order by schemaname,tablename,policyname`,
    `select r, n.nspname, c.relname, priv, has_table_privilege(r,c.oid,priv) allowed
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       cross join unnest(array['anon','authenticated']) r
       cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv
       where n.nspname in ('public','orders_private') and c.relkind in ('r','S','v') order by 1,2,3,4`,
    `select r,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,has_function_privilege(r,p.oid,'EXECUTE') allowed
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join unnest(array['anon','authenticated']) r
       where n.nspname in ('public','orders_private') and p.proname not like 'legacy_ordering_%' order by 1,2,3,4`,
  ]) result.push(await rows(db, sql));
  return JSON.stringify(result);
}
async function shape(db) {
  const result = [];
  for (const sql of [
    `select table_schema,table_name,column_name,data_type,is_nullable,column_default from information_schema.columns
      where table_schema in ('public','orders_private') order by 1,2,ordinal_position`,
    `select n.nspname,c.relname,con.conname,pg_get_constraintdef(con.oid) def from pg_constraint con
      join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','orders_private') order by 1,2,3`,
    `select n.nspname,p.proname,pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','orders_private') order by 1,2,def`,
    `select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) def from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where not t.tgisinternal order by 1,2`,
  ]) result.push(await rows(db, sql));
  return JSON.stringify(result);
}

async function main() {
  const fi = process.argv.indexOf('--fixtures');
  if (fi >= 0) {
    const dir = path.resolve(process.argv[fi + 1]);
    mkdirSync(dir, { recursive: true });
    const fixtureDb = new PGlite();
    try {
      await fixtureDb.exec(read('scripts/test/schema/baseline.sql'));
      await seed(fixtureDb,fixtures(true));
      for (const t of Object.keys(fixtures())) writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(await rows(fixtureDb,`select * from public.${t}`)));
    } finally { await fixtureDb.close(); }
    console.log('Fixtures fictives écrites : 5 témoins + références exigées par étape 6, 2 variantes.');
    return;
  }
  const db = new PGlite();
  try {
    await db.exec(read('scripts/test/schema/baseline.sql'));
    await db.exec('create role service_role nologin bypassrls; grant usage on schema public to service_role;');
    await db.query('insert into auth.users(id) values ($1),($2)', [ADMIN, USER]);
    await db.query('insert into public.admins(user_id) values ($1)', [ADMIN]);
    for (const file of readdirSync(path.join(ROOT, DIR)).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort()) {
      if (file.includes('_etape16_')) continue;
      await db.exec(read(`${DIR}/${file}`));
    }
    await seed(db);
    await db.exec("update public.products set status='published', availability=case when coming_soon then 'coming_soon' else 'available' end");
    // Capacité privilégiée modélisée explicitement AVANT la comparaison ; aucun grant en migration 16.
    await db.exec('grant select,insert,update,delete on public.orders,public.order_items,public.order_events to service_role; grant execute on function public.create_order_request(jsonb) to service_role;');
    const expectedHashes = {
      'public.create_order_request(jsonb)': '6da0b45e5c85d0af26686b45e3e4d74c',
      'public.check_cart(jsonb)': '29335123f01554e5d94b2de74c4f70ab',
      'public.get_order_tracking(text)': 'a78185112ca3a914ecae85a5814c3fa9',
      'public.admin_update_order(uuid,text,jsonb)': 'd1977f1f98963d068b56073692ad3ccd',
      'public.orders_guard()': '45828e584b26badd4ce1a9361efcf6f2',
      'public.order_items_guard()': 'ea16144af0dba601058827afbe062dbf',
      'orders_private.order_events_enqueue_email()': '28b88047713361c4c716568efcfac92a',
      'public.is_admin()': 'f56ccd71d257c73f4ea8d9e2f01e50f5',
    };
    const sources = await rows(db, `select oid::regprocedure::text signature,prosrc,md5(prosrc) md5,
      md5(replace(prosrc, E'\r\n', E'\n')) md5_lf from pg_proc where oid = any($1::regprocedure[]) order by 1`, [Object.keys(expectedHashes)]);
    for (const s of sources) console.log(`EMPREINTE ${s.signature}: ${s.md5} ; LF=${s.md5_lf} ; production=${expectedHashes[s.signature] ?? expectedHashes['public.'+s.signature]}`);
    // PGlite ne dispose ni de pg_net ni de Vault : bouchon SQL strictement local.
    await db.exec(`create schema net; create schema vault;
      create table net.calls(reason jsonb);
      create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds int default 5000)
      returns bigint language plpgsql as $$ begin insert into net.calls values(body); return 1; end $$;
      create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz default now());
      insert into vault.decrypted_secrets(name,decrypted_secret) values ('order_emails_worker_secret',repeat('f',48));
      update orders_private.email_config set sending_enabled=true,test_recipients=array['${EMAIL}'],
        site_url_test='https://preprod.example.net',worker_url='https://abcdefghijklmnopqrst.supabase.co/functions/v1/order-emails';`);
    const permsBefore = await permissions(db);
    const shapeBefore = await shape(db);
    const publicSources = () => rows(db, `select p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosrc
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname<>'create_order_request' order by 1,2`);
    const apiBefore = JSON.stringify(await publicSources());
    const originalHash = (await one(db, `select md5(prosrc) h from pg_proc where oid='public.create_order_request(jsonb)'::regprocedure`)).h;
    const missingEnv = payload(); delete missingEnv.environment;
    const pre = await create(db, missingEnv);
    check(pre.ok && pre.order.environment === 'preprod', 'avant 16 : environnement omis crée une commande test malgré production fermée');
    const replayBody = payload();
    await db.exec(GATE);
    const createSource = (await one(db, `select prosrc from pg_proc where oid='public.create_order_request(jsonb)'::regprocedure`)).prosrc;
    check(createSource.replace(/  -- Étape 16 : fermeture globale[\s\S]*?  end if;\r?\n/, '') ===
      sources.find((s) => s.signature.includes('create_order_request')).prosrc, 'create_order_request : seul ajout au corps historique = contrôle initial');
    check(JSON.stringify(await publicSources()) === apiBefore, 'aucune autre fonction publique ajoutée ou modifiée');
    check(await permissions(db) === permsBefore, 'ACL explicites/effectives, colonnes, RLS, politiques inchangées');
    check((await one(db, 'select legacy_ordering_state s from orders_private.config')).s === 'open', 'migration : LEGACY_OPEN par défaut');
    const first = await create(db, replayBody);
    check(first.ok && !first.replayed, 'OPEN : création anon et outbox conservées');
    check((await create(db, replayBody)).replayed === true, 'OPEN : idempotence conservée');
    check((await create(db, payload(), 'user')).ok, 'OPEN : création authenticated conservée');
    check((await create(db, payload({ environment: 'production' }), 'anon', { origin: 'https://dar-nur.fr' })).error === 'ordering_closed', 'OPEN : garde-fou juridique production conservé');
    await db.exec('update orders_private.config set production_ordering_open=true');
    const order = await one(db, 'select id from public.orders where public_number=$1', [first.order.number]);
    check((await one(db, `select count(*)::int n from orders_private.order_emails where order_id=$1 and email_type='order_received'`, [order.id])).n === 1, 'OPEN : exactement un e-mail commande reçue');
    for (const state of ['closed','open']) {
      check(await denied(() => db.exec(maintenance(state)), /dn:reason_required/), `${state} : motif vide refusé`);
      await db.exec('rollback');
    }
    await toggle(db, 'closed');
    check((await one(db,'select production_ordering_open p from orders_private.config')).p === true,
      'script de fermeture : garde-fou production indépendant conservé (true fictif)');
    const cfgClosed = await one(db, 'select * from orders_private.config');
    await db.exec(GATE); await db.exec(GATE);
    check(JSON.stringify(await one(db,'select * from orders_private.config')) === JSON.stringify(cfgClosed), 'migration rejouée deux fois : fermeture et secrets conservés');
    const before = await totals(db);
    for (const env of [undefined, 'production','preprod','development']) for (const pirate of [false,true]) {
      const body = payload();
      if (env === undefined) delete body.environment; else body.environment = env;
      if (pirate) Object.assign(body, { legacy_ordering_state: 'open', production_ordering_open: true,
        is_admin: true, is_test: false, config: { legacy_ordering_state: 'open' } });
      const r = await create(db, body, 'anon', pirate ? { origin: 'https://dar-nur.fr', legacy_ordering_state: 'open', 'x-legacy-ordering-state': 'open' } : {});
      check(r.ok === false && r.error === 'ordering_closed', `CLOSED : ${env ?? 'omis'}, champs/en-têtes pirates=${pirate}`);
      check(await totals(db) === before, 'aucune écriture orders/items/events/submissions/outbox ni réveil Edge');
    }
    check((await create(db, replayBody)).error === 'ordering_closed', 'CLOSED : rejeu existant refusé avant idempotence');
    for (const who of ['user','admin','service','owner']) {
      check((await create(db,payload(),who)).error === 'ordering_closed', `CLOSED : RPC ${who} refusée aussi`);
    }
    check(await totals(db) === before, 'tous les refus : aucun e-mail commande reçue ajouté');
    for (const who of ['anon','user','admin','service','owner']) for (const table of ['orders','order_items']) {
      check(await as(db,who,() => denied(() => db.exec(`insert into public.${table} default values`),
        who === 'service' || who === 'owner' ? /dn:ordering_closed/ : /permission denied/)), `INSERT direct ${table} : ${who} refusé`);
    }
    await db.exec("set session_replication_role='replica'");
    try { check(await denied(() => db.exec('insert into public.orders default values'), /dn:ordering_closed/), 'trigger ALWAYS actif en mode replica (propriétaire)'); }
    finally { await db.exec("set session_replication_role='origin'"); }
    for (const who of ['anon','user','admin']) {
      for (const sql of ['select * from orders_private.config', "update orders_private.config set legacy_ordering_state='open'",
        'select orders_private.legacy_ordering_open()', "select orders_private.legacy_ordering_insert_guard()"])
        check(await as(db,who,() => denied(() => db.exec(sql))), `${who} : ${sql} interdit`);
      if (who !== 'admin') check(await as(db,who,() => denied(() => db.query("select public.admin_update_order($1,'set_note','{}')", [order.id]), /permission denied|dn:forbidden/)), `${who} : garde admin conservée`);
    }
    // La liste des fonctions publiques et leurs sources est inchangée, hors le seul ajout de contrôle à create.
    const unchanged = sources.filter((s) => !s.signature.includes('create_order_request'));
    for (const s of unchanged) check((await one(db, `select md5(prosrc) h from pg_proc where oid=$1::regprocedure`,[s.signature])).h === s.md5, `${s.signature} inchangée`);
    check(await permissions(db) === permsBefore, 'CLOSED : mêmes fonctions exposées et mêmes droits, aucune RPC de bascule');
    await admin(db,order.id,'set_note',{ note:'Historique fictif',legacy_ordering_state:'open',production_ordering_open:true });
    check((await one(db,'select legacy_ordering_state s from orders_private.config')).s === 'closed', 'admin_update_order ignore aussi les champs pirates de bascule');
    check((await as(db,'anon',async () => (await one(db,'select public.check_cart($1::jsonb) r',[JSON.stringify(payload().items)])).r)).valid,
      'CLOSED : check_cart reste disponible en lecture');
    const tracked = await as(db,'anon',async () => (await one(db,'select public.get_order_tracking($1) r',[first.token])).r);
    check(tracked.found && tracked.order.number === first.order.number, 'historique présent et suivi anon disponible après fermeture');
    check((await as(db,'user',() => one(db,'select count(*)::int n from public.orders'))).n === 0, 'RLS : non admin ne voit aucune commande');
    check((await as(db,'admin',() => one(db,'select count(*)::int n from public.orders'))).n > 0, 'RLS : admin lit les commandes');
    await admin(db,order.id,'start_review');
    const item = await one(db,'select id from public.order_items where order_id=$1',[order.id]);
    await admin(db,order.id,'set_item_availability',{ item_id:item.id,available:true });
    await admin(db,order.id,'set_shipping',{ shipping_cents:0 });
    await admin(db,order.id,'request_payment');
    await admin(db,order.id,'confirm_payment');
    await admin(db,order.id,'start_preparation');
    await admin(db,order.id,'mark_shipped');
    const emailTypes = (await rows(db,'select email_type from orders_private.order_emails where order_id=$1 order by email_type',[order.id])).map((r) => r.email_type);
    check(emailTypes.join() === 'order_received,order_shipped,payment_confirmed,payment_requested', 'historique : transitions admin et quatre types e-mails fonctionnent en CLOSED');
    const { runOrderEmails } = await import(pathToFileURL(path.join(ROOT,'supabase/functions/_shared/order-emails/worker.ts')).href);
    const sent = [];
    const result = await runOrderEmails({
      rpc: (fn,args) => as(db,'service',async () => (await one(db,`select public.${fn}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) r`,Object.values(args))).r),
      send: async (email) => { sent.push(email); return { outcome:'sent',messageId:`<fictif-${sent.length}@example.com>`,note:null }; },
      testRecipients:[EMAIL], log:()=>{},
    });
    check(result.sent > 0 && result.report_errors === 0, 'vrai worker, vraies RPC service_role : historique traité en CLOSED, transport fictif');
    for (const row of await rows(db,read('supabase/checks/etape16_invariants.sql'))) check(row.ok === true, `invariant 16 : ${row.check_name}`);
    // Purges réelles contre victimes fictives uniquement, pendant CLOSED.
    for (const file of ['20261003_etape10_purger_commandes_test.sql','20261006_etape11_purger_commandes_test.sql']) {
      const victim = await createAfterReopen(db);
      await toggle(db,'closed');
      const purge = read(`supabase/maintenance/${file}`).replace(/array\[[^\]]*\]::text\[\]/,`array['${victim.order.number}']::text[]`);
      const orderCount = (await one(db,'select count(*)::int n from public.orders')).n;
      await db.exec(purge);
      check(!(await one(db,'select id from public.orders where public_number=$1',[victim.order.number])) &&
        (await one(db,'select count(*)::int n from public.orders')).n === orderCount-1,
        `${file} : compatible CLOSED ; seule victime fictive supprimée`);
    }
    await toggle(db,'open');
    check((await create(db)).ok, 'réouverture réelle : création possible à nouveau');
    const dataBeforeRollback = await totals(db);
    await db.exec(ROLLBACK);
    check(await totals(db) === dataBeforeRollback, 'rollback 16 : aucune donnée historique modifiée');
    check((await one(db,`select md5(prosrc) h from pg_proc where oid='public.create_order_request(jsonb)'::regprocedure`)).h === originalHash, 'rollback 16 : empreinte exacte du corps étape 10');
    check(await shape(db) === shapeBefore, 'rollback 16 : colonnes, contraintes, fonctions et triggers identiques à avant 16');
    check(await permissions(db) === permsBefore, 'rollback 16 : ACL et RLS identiques à avant 16');
    await db.exec(GATE); await db.exec(GATE);
    check((await create(db)).ok, 'réapplication après rollback et deuxième exécution : OPEN fonctionnel');
    // Ordre des rollbacks antérieurs : 16 puis 11 puis 10 (sur une seconde base vide).
    const old = new PGlite();
    try {
      await old.exec(read('scripts/test/schema/baseline.sql'));
      await old.exec('create role service_role nologin;');
      for (const file of readdirSync(path.join(ROOT,DIR)).filter((f)=>/^\d{14}_.*\.sql$/.test(f)).sort()) await old.exec(read(`${DIR}/${file}`));
      await old.exec(ROLLBACK);
      await old.exec(read('supabase/rollback/20261003_etape11_rollback.sql'));
      await old.exec(read('supabase/rollback/20261003_etape10_rollback.sql'));
      check((await one(old,"select to_regclass('public.orders') t")).t === null, 'rollbacks 16 → 11 → 10 compatibles sur base fictive');
    } finally { await old.close(); }
    console.log(`\n✅ ${passes} contrôle(s) réussi(s), 0 échec(s).`);
  } finally { await db.close(); }
}
async function createAfterReopen(db) { await toggle(db,'open'); return create(db); }
async function seed(db, data = fixtures()) {
  // jsonb_populate_record ne prend pas les defaults : insertion colonne par colonne.
  for (const [table, records] of Object.entries(data)) for (const record of records) {
    const keys = Object.keys(record);
    const values = Object.values(record).map((v) => v && !Array.isArray(v) && typeof v === 'object' ? JSON.stringify(v) : v);
    await db.query(`insert into public.${table}(${keys.join(',')}) values (${keys.map((_,i) => `$${i+1}`).join(',')})`, values);
  }
}
main().catch((e) => { console.error(e); process.exitCode=1; });
