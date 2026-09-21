#!/usr/bin/env node
// scripts/sync-supplier.mjs — synchroniseur fournisseur V1 :
//   observer → comparer → détecter → proposer → (validation humaine) → appliquer.
//
// LE FOURNISSEUR N'EST JAMAIS NOMMÉ DANS LE DÉPÔT : code, URL de son API et
// tout ce qui l'identifie vivent dans `supplier.config.local.json` (ignoré par
// Git, même fichier que scripts/import-supplier.mjs). Les seuils de la
// politique Dar Nūr, eux, sont versionnés dans scripts/sync-policy.json.
//
// CE QUE CE SCRIPT NE FAIT JAMAIS, PAR CONSTRUCTION :
//   - écrire products.active ou products.coming_soon (colonnes interdites à
//     toute écriture, vérifiées dans l'unique fonction d'écriture, quel que
//     soit le mode) ;
//   - écrire un prix public (products.price_value, product_variants.price)
//     ou product_supply.base_price sans une proposition explicitement
//     acceptée par un administrateur, dont les faits n'ont pas changé depuis ;
//   - assimiler le prix public du fournisseur au prix d'achat réel : si
//     purchase_price est NULL, la rentabilité est « inconnue », jamais un
//     chiffre.
//
// Modes (un seul par exécution) :
//   node scripts/sync-supplier.mjs [--ids 123,456] [--work <dossier>] [--auth cli]
//       DRY-RUN (défaut) : lit le fournisseur et Supabase, calcule
//       observations, détections et propositions, écrit le rapport dans le
//       dossier de travail — sans écrire un seul octet dans Supabase.
//   node scripts/sync-supplier.mjs --record [--ids …] [--auth cli]
//       Idem + écrit les FAITS fournisseur (product_sources,
//       product_source_observations) et les PROPOSITIONS (sync_proposals :
//       création, obsolescence). Ne touche ni products, ni product_variants,
//       ni product_supply.
//   node scripts/sync-supplier.mjs --apply [--work <dossier>] [--auth cli]
//       Applique les propositions `accepted` non encore appliquées, après
//       re-vérification de leur empreinte contre les faits actuels. Cibles
//       autorisées : products.price_value, product_variants.price,
//       product_supply.base_price. Aucun appel au fournisseur.
//   node scripts/sync-supplier.mjs --verify <dossier-d-application> [--auth cli]
//       Contrôle post-application : chaque écriture correspond à une
//       proposition acceptée, rien d'autre n'a bougé (active / coming_soon /
//       prix de tous les produits comparés au cliché pris avant), anon ne lit
//       aucune table privée ni aucun brouillon.
//
// Écriture : `--auth cli` (clé secrète en mémoire via la CLI Supabase
// authentifiée par `supabase login`) ou session admin par DN_ADMIN_EMAIL /
// DN_ADMIN_PASSWORD. Lecture de product_sources = admin aussi (table privée) :
// le dry-run a donc lui aussi besoin de `--auth`.
//
// Tests hors ligne (scripts/test/sync-supplier/) : DN_SUPABASE_URL +
// DN_SUPABASE_KEY pointent un faux PostgREST local, --supplier-config un faux
// fournisseur local. Aucun de ces réglages n'existe en production.
//
// Zéro dépendance npm (fetch natif, Node ≥ 18).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONFIG_PATH = path.join(ROOT, 'js', 'config.js');
const POLICY_PATH = path.join(ROOT, 'scripts', 'sync-policy.json');
const DEFAULT_SUPPLIER_CONFIG_PATH = path.join(ROOT, 'supplier.config.local.json');
const USER_AGENT = 'Mozilla/5.0 (compatible; DarNur-sync/1.0)';
const DELAY_MS = Number(process.env.DN_SYNC_DELAY_MS ?? 900); // DN_SYNC_DELAY_MS : tests hors ligne uniquement

// ---------------------------------------------------------------------------
// Garde-fous d'écriture — LA règle de ce script.
// ---------------------------------------------------------------------------

// Colonnes qu'aucun chemin du code ne peut écrire, dans aucune table, dans
// aucun mode. Publier ou dépublier un produit n'est pas une décision de
// synchronisation : cela reste un geste manuel dans l'administration.
const FORBIDDEN_COLUMNS = new Set(['active', 'coming_soon']);

// Colonnes écrivables par table et par mode. Tout ce qui n'est pas listé est
// refusé (exception, exécution interrompue avant l'envoi).
const WRITABLE = {
  record: {
    product_sources: ['supplier_regular_price', 'supplier_price', 'supplier_on_sale', 'supplier_in_stock',
      'supplier_stock_qty', 'supplier_stock_text', 'raw', 'last_synced_at', 'last_attempt_at', 'last_error'],
    product_source_observations: ['source_id', 'observed_at', 'run_id', 'regular_price', 'price', 'on_sale', 'in_stock', 'stock_qty'],
    sync_proposals: ['run_id', 'product_id', 'variant_id', 'source_id', 'kind', 'level', 'target', 'evidence',
      'suggested_action', 'suggested_value', 'fingerprint', 'status', 'obsolete_reason'],
  },
  apply: {
    products: ['price_value'],
    product_variants: ['price'],
    product_supply: ['product_id', 'variant_id', 'base_price'],
    sync_proposals: ['status', 'obsolete_reason', 'applied_at', 'applied_payload'],
  },
};

function assertWritable(mode, table, body) {
  const allowed = WRITABLE[mode]?.[table];
  if (!allowed) throw new Error(`Écriture refusée : table « ${table} » non autorisée en mode ${mode}.`);
  const rows = Array.isArray(body) ? body : [body];
  for (const row of rows) {
    for (const col of Object.keys(row)) {
      if (FORBIDDEN_COLUMNS.has(col)) throw new Error(`Écriture refusée : la colonne « ${col} » est interdite au synchroniseur (${table}).`);
      if (!allowed.includes(col)) throw new Error(`Écriture refusée : colonne « ${col} » non autorisée sur ${table} en mode ${mode}.`);
    }
  }
  return allowed;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function log(msg) { console.log(msg); }
function fail(msg) { console.error(`\n✖ ${msg}`); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = v => (v == null ? '—' : `${Number(v).toFixed(2).replace('.', ',')} €`);
const num = v => (v == null || v === '' ? null : Number(v));
function roundEuro(v) { return v == null ? null : Math.round(Number(v) + Number.EPSILON); }
function isoNow() { return new Date().toISOString(); }
function runId() { return `sync-${isoNow().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`; }

function parseArgs(argv) {
  const args = { ids: [], mode: 'dry-run', verify: null, work: null, auth: 'admin', supplierConfig: null, max: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ids') args.ids = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--record') args.mode = 'record';
    else if (a === '--apply') args.mode = 'apply';
    else if (a === '--verify') { args.mode = 'verify'; args.verify = argv[++i]; }
    else if (a === '--work') args.work = argv[++i];
    else if (a === '--max') args.max = Number(argv[++i]);
    else if (a === '--auth') { args.auth = argv[++i]; if (!['admin', 'cli'].includes(args.auth)) fail('--auth admin | cli'); }
    else if (a === '--supplier-config') args.supplierConfig = argv[++i];
    else fail(`Argument inconnu : ${a}`);
  }
  return args;
}

function loadPolicy() {
  const p = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
  for (const k of ['strongPromoPct', 'strongPromoEuro', 'staleDays', 'unreachableAttempts', 'maxAppliedPerRun']) {
    if (typeof p[k] !== 'number' || !(p[k] >= 0)) fail(`sync-policy.json : « ${k} » doit être un nombre ≥ 0.`);
  }
  return p;
}

function loadSupplierConfig(customPath) {
  const file = customPath ? path.resolve(customPath) : DEFAULT_SUPPLIER_CONFIG_PATH;
  if (!existsSync(file)) fail(`Configuration fournisseur absente : ${file} (fichier local, ignoré par Git — voir scripts/import-supplier.mjs).`);
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  for (const k of ['code', 'baseUrl', 'storeApiPath']) if (!cfg[k]) fail(`Configuration fournisseur : clé « ${k} » manquante.`);
  if (!/^[a-z0-9-]+$/.test(cfg.code)) fail('Configuration fournisseur : « code » doit être un identifiant kebab-case.');
  return cfg;
}

// ---------------------------------------------------------------------------
// Supabase (PostgREST) — lecture ; écriture via writeRow() uniquement
// ---------------------------------------------------------------------------

function loadCreds() {
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  const urlMatch = raw.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
  const keyMatch = raw.match(/SUPABASE_ANON\s*=\s*'([^']+)'/);
  if (!urlMatch || !keyMatch) fail('Impossible de lire SUPABASE_URL/SUPABASE_ANON depuis js/config.js');
  return { url: process.env.DN_SUPABASE_URL || urlMatch[1], key: keyMatch[1], token: keyMatch[1], anonKey: keyMatch[1] };
}

function sbHeaders(creds, extra = {}) {
  return { apikey: creds.key, Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json', ...extra };
}

async function sbGet(creds, pathAndQuery) {
  const res = await fetch(`${creds.url}/rest/v1/${pathAndQuery}`, { headers: sbHeaders(creds, { Range: '0-9999' }) });
  if (!res.ok) throw new Error(`Supabase GET ${res.status} — ${pathAndQuery}: ${await res.text()}`);
  return res.json();
}

// L'UNIQUE point d'écriture du script. `columns=` est envoyé à PostgREST en
// plus du contrôle local : même si une clé inattendue survivait, PostgREST
// l'ignorerait.
async function writeRow(ctx, method, table, filter, body) {
  const allowed = assertWritable(ctx.mode, table, body);
  const cols = [...new Set((Array.isArray(body) ? body : [body]).flatMap(r => Object.keys(r)))].filter(c => allowed.includes(c));
  const qs = [filter, `columns=${cols.join(',')}`].filter(Boolean).join('&');
  const res = await fetch(`${ctx.creds.url}/rest/v1/${table}?${qs}`, {
    method,
    headers: sbHeaders(ctx.creds, { Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${res.status} — ${table}?${qs}: ${text}`);
  ctx.writes.push({ method, table, filter, body });
  return text ? JSON.parse(text) : null;
}

async function adminLogin(creds, mode = 'admin') {
  if (process.env.DN_SUPABASE_KEY) return { ...creds, key: process.env.DN_SUPABASE_KEY, token: process.env.DN_SUPABASE_KEY, viaTest: true };
  if (mode === 'cli') return cliServiceLogin(creds);
  const email = process.env.DN_ADMIN_EMAIL;
  const password = process.env.DN_ADMIN_PASSWORD;
  if (!email || !password) fail('DN_ADMIN_EMAIL et DN_ADMIN_PASSWORD sont requis (session admin, jamais dans le dépôt) — ou utiliser --auth cli.');
  const res = await fetch(`${creds.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: creds.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  if (!res.ok) fail(`Connexion admin refusée (${res.status}) : ${await res.text()}`);
  const data = await res.json();
  return { ...creds, token: data.access_token };
}

async function cliServiceLogin(creds) {
  const m = String(creds.url).match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!m) fail(`URL Supabase inattendue : ${creds.url}`);
  const out = await new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'supabase@latest', 'projects', 'api-keys', '--project-ref', m[1], '--reveal', '-o', 'json'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '', e = '';
    child.stdout.on('data', d => { o += d; });
    child.stderr.on('data', d => { e += d; });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve(o) : reject(new Error(`supabase projects api-keys a échoué (${code}) : ${e.replace(/sb_[a-z]+_[A-Za-z0-9_-]+/g, 'sb_***')}`))));
  });
  let keys;
  try { keys = JSON.parse(out); } catch { fail('Réponse de la CLI Supabase illisible (êtes-vous connecté ? `npx supabase login`).'); }
  const secret = (keys || []).find(k => k.type === 'secret' || k.name === 'service_role' || /^sb_secret_/.test(k.api_key || ''));
  if (!secret || !secret.api_key) fail('Aucune clé secrète retournée par la CLI Supabase.');
  return { ...creds, key: secret.api_key, token: secret.api_key, viaCli: true };
}

// ---------------------------------------------------------------------------
// Lecture Dar Nūr : sources du fournisseur + contexte produit
// ---------------------------------------------------------------------------

const inList = ids => `in.(${ids.join(',')})`;

async function loadContext(creds, supplierCode, ids) {
  let sources;
  try {
    sources = await sbGet(creds, `product_sources?select=*&supplier=eq.${encodeURIComponent(supplierCode)}&order=supplier_product_id.asc,supplier_variant_id.asc.nullsfirst`);
  } catch (e) {
    fail(`product_sources illisible : ${e.message}\n  (migration product_sources.sql + sync_supplier.sql exécutées ? session admin ?)`);
  }
  if (!('last_attempt_at' in (sources[0] || { last_attempt_at: null }))) fail('product_sources ne porte pas les colonnes de sync_supplier.sql — migration non exécutée.');
  if (ids.length) sources = sources.filter(s => ids.includes(String(s.supplier_product_id)));
  const productIds = [...new Set(sources.map(s => s.product_id))];
  if (!productIds.length) return { sources, products: [], variants: [], supply: [], proposals: [], lastObs: new Map() };
  const [products, variants, supply, proposals, observations] = await Promise.all([
    sbGet(creds, `products?select=id,slug,name,price_value,active,coming_soon,variant_axes&id=${inList(productIds)}`),
    sbGet(creds, `product_variants?select=id,product_id,name,price,active&product_id=${inList(productIds)}`),
    sbGet(creds, `product_supply?select=*&product_id=${inList(productIds)}`),
    sbGet(creds, `sync_proposals?select=*&product_id=${inList(productIds)}&status=in.(pending,accepted)&applied_at=is.null`), // les propositions appliquées sont closes : jamais rapprochées
    sbGet(creds, `product_source_observations?select=source_id,observed_at,regular_price,price,on_sale,in_stock,stock_qty&source_id=${inList(sources.map(s => s.id))}&order=observed_at.desc`),
  ]);
  const lastObs = new Map();
  for (const o of observations) if (!lastObs.has(o.source_id)) lastObs.set(o.source_id, o);
  return { sources, products, variants, supply, proposals, lastObs };
}

// ---------------------------------------------------------------------------
// Fournisseur (Store API WooCommerce) → faits neutres
// ---------------------------------------------------------------------------

async function supplierFetch(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(DELAY_MS * 3 * attempt); continue; }
    throw new Error(`Le fournisseur a répondu ${res.status} ${res.statusText}`);
  }
  throw new Error('Fournisseur indisponible après 3 essais');
}

function minorToEuro(prices, key) {
  const v = prices?.[key];
  if (v === null || v === undefined || v === '') return null;
  return Number(v) / Math.pow(10, Number(prices.currency_minor_unit ?? 2));
}
function stockQty(p) {
  const m = String(p.stock_availability?.text || '').match(/(\d+)\s+en stock/i);
  return m ? Number(m[1]) : null;
}
function trimRaw(p) {
  const { description, short_description, price_html, add_to_cart, _links, extensions, ...rest } = p;
  return rest;
}
function factsOf(p) {
  return {
    regular_price: minorToEuro(p.prices, 'regular_price'),
    price: minorToEuro(p.prices, 'price'),
    on_sale: !!p.on_sale,
    in_stock: !!p.is_in_stock,
    stock_qty: stockQty(p),
    stock_text: p.stock_availability?.text || null,
    raw: trimRaw(p),
  };
}

// Une requête par produit fournisseur, une par variation ; les sources d'un
// même produit partagent la réponse. Une erreur marque toutes ses sources.
async function observeSupplier(supplier, sources) {
  const byProduct = new Map();
  for (const s of sources) {
    if (!byProduct.has(s.supplier_product_id)) byProduct.set(s.supplier_product_id, []);
    byProduct.get(s.supplier_product_id).push(s);
  }
  const storeApi = `${supplier.baseUrl.replace(/\/$/, '')}${supplier.storeApiPath}`;
  const observed = new Map(); // source.id → { facts } | { error }
  for (const [pid, group] of byProduct) {
    log(`Fournisseur ${pid}…`);
    try {
      const p = await supplierFetch(`${storeApi}/products/${pid}`);
      await sleep(DELAY_MS);
      const parent = factsOf(p);
      const variationIds = new Set(group.map(s => s.supplier_variant_id).filter(Boolean));
      const variations = new Map();
      for (const vid of variationIds) {
        variations.set(vid, factsOf(await supplierFetch(`${storeApi}/products/${vid}`)));
        await sleep(DELAY_MS);
      }
      for (const s of group) {
        const f = s.supplier_variant_id ? variations.get(s.supplier_variant_id) : parent;
        observed.set(s.id, f ? { facts: f } : { error: `variation ${s.supplier_variant_id} absente de la réponse` });
      }
      log(`  ${p.name || pid} · ${fmt(parent.price)}${parent.on_sale ? ' (promo, régulier ' + fmt(parent.regular_price) + ')' : ''} · ${parent.in_stock ? 'dispo' : 'RUPTURE'}`);
    } catch (e) {
      log(`  ! ${e.message}`);
      for (const s of group) observed.set(s.id, { error: e.message });
    }
  }
  return observed;
}

// ---------------------------------------------------------------------------
// Comparaison et détections
// ---------------------------------------------------------------------------

const NIL = '00000000-0000-0000-0000-000000000000';

function dnPriceOf(source, ctx) {
  if (source.variant_id) {
    const v = ctx.variants.find(x => x.id === source.variant_id);
    return v ? num(v.price) : null;
  }
  const p = ctx.products.find(x => x.id === source.product_id);
  return p ? num(p.price_value) : null;
}

function supplyOf(source, ctx) {
  const exact = ctx.supply.find(s => s.product_id === source.product_id && (s.variant_id || NIL) === (source.variant_id || NIL));
  const productLevel = ctx.supply.find(s => s.product_id === source.product_id && !s.variant_id);
  return {
    stock_mode: exact?.stock_mode ?? productLevel?.stock_mode ?? null, // le mode de stock se déclare au produit, une variante peut le préciser
    base_price: exact?.base_price ?? null,                            // le prix de base est propre à l'entité tarifée
  };
}

function isVariable(product, ctx) {
  return (product.variant_axes || []).length > 0 || ctx.variants.some(v => v.product_id === product.id);
}

// Empreinte des faits qui fondent une proposition. Elle est la même pour
// toutes les propositions d'une source : si l'un de ces faits change, toutes
// deviennent obsolètes et sont recalculées.
function fingerprintOf(facts, dnPrice, supply, purchasePrice) {
  const canon = JSON.stringify({
    reg: num(facts.regular_price), price: num(facts.price), sale: !!facts.on_sale, stock: !!facts.in_stock,
    dn: dnPrice, base: num(supply.base_price), mode: supply.stock_mode, buy: num(purchasePrice),
  });
  return createHash('sha256').update(canon).digest('hex').slice(0, 32);
}

// Valeur comparable : booléen tel quel, nombre (PostgREST renvoie numeric en nombre, parfois en chaîne), sinon null.
function canon(v) { return typeof v === 'boolean' ? v : (v == null || v === '' ? null : Number(v)); }

function pct(a, b) { return a && b ? Math.round((1 - a / b) * 1000) / 10 : null; }

function purchaseText(source) {
  return source.purchase_price == null
    ? 'prix d’achat non renseigné : rentabilité inconnue'
    : `prix d’achat renseigné ${fmt(source.purchase_price)} (${source.purchase_price_origin}, ${String(source.purchase_price_at).slice(0, 10)})`;
}

// Calcule les détections d'une source à partir : des faits observés (ou de
// l'erreur), des faits précédents (ligne product_sources avant écriture), du
// contexte Dar Nūr. Renvoie { facts, prev, changed, detections[], fingerprint }.
function analyse(source, obs, ctx, policy, now) {
  const product = ctx.products.find(p => p.id === source.product_id);
  const variant = source.variant_id ? ctx.variants.find(v => v.id === source.variant_id) : null;
  const label = variant ? `${product.name} — ${variant.name}` : product.name;
  const dnPrice = dnPriceOf(source, ctx);
  const supply = supplyOf(source, ctx);
  const variable = isVariable(product, ctx);
  const priced = variable ? !!variant : true;          // l'entité tarifée : variante d'un produit variable, sinon le produit
  const priceTarget = variant ? 'variant_price' : 'product_price';
  const active = product.active === true;
  const orderable = active && product.coming_soon !== true;
  const notOwnStock = supply.stock_mode !== 'own_stock';  // 'on_demand' ou non déclaré : prudence
  const exposure = orderable && notOwnStock ? 'bloquant' : active && notOwnStock ? 'attention' : 'info';

  const prev = {
    regular_price: num(source.supplier_regular_price), price: num(source.supplier_price),
    on_sale: source.supplier_on_sale, in_stock: source.supplier_in_stock, stock_qty: source.supplier_stock_qty,
  };
  const det = [];
  const base = { label, product_id: source.product_id, variant_id: source.variant_id || null, source_id: source.id };
  const add = (kind, level, target, suggested_action, suggested_value, extra = {}) =>
    det.push({ ...base, kind, level, target, suggested_action, suggested_value: suggested_value ?? null, evidence: {
      dn_price: dnPrice, stock_mode: supply.stock_mode, base_price: num(supply.base_price),
      purchase_price: num(source.purchase_price), purchase_price_origin: source.purchase_price_origin || null,
      dn_status: !active ? 'brouillon' : orderable ? 'actif' : 'actif_bientot', ...extra,
    } });

  // --- Fournisseur injoignable : pas de faits, pas de comparaison ------------
  if (obs.error) {
    const attemptsFailed = (source.last_error ? 1 : 0) + 1; // V1 : seule la tentative précédente est mémorisée (last_error) — seuil utile : 1 ou 2
    const lastOk = source.last_synced_at ? new Date(source.last_synced_at) : null;
    const staleDays = lastOk ? Math.floor((now - lastOk) / 86400000) : null;
    if (attemptsFailed >= policy.unreachableAttempts) {
      add('unreachable', 'attention', 'none', `Fournisseur injoignable (${attemptsFailed} tentatives) : aucune donnée fraîche, aucune écriture. Relancer plus tard.`, null,
        { error: obs.error, attempts_failed: attemptsFailed });
    }
    if (staleDays != null && staleDays >= policy.staleDays) {
      add('stale', exposure === 'bloquant' ? 'bloquant' : 'attention', 'none',
        `Données fournisseur périmées (${staleDays} j sans observation réussie) : le prix Dar Nūr repose sur des faits anciens.`, null, { stale_days: staleDays });
    }
    return { facts: null, prev, changed: false, detections: det, fingerprint: fingerprintOf(prev, dnPrice, supply, source.purchase_price), label, dnPrice, supply, error: obs.error };
  }

  const f = obs.facts;
  const first = !ctx.lastObs.has(source.id);
  const changed = first || ['regular_price', 'price', 'on_sale', 'in_stock', 'stock_qty'].some(k => canon(f[k]) !== canon(prev[k]));
  const hadPrev = prev.price != null;
  const depth = f.on_sale ? pct(f.price, f.regular_price) : null;
  const gap = f.on_sale && f.regular_price != null && f.price != null ? Math.round((f.regular_price - f.price) * 100) / 100 : null;
  const fp = fingerprintOf(f, dnPrice, supply, source.purchase_price);
  const ev = { supplier_regular_price: f.regular_price, supplier_price: f.price, supplier_on_sale: f.on_sale, supplier_in_stock: f.in_stock,
    supplier_stock_qty: f.stock_qty, prev_regular_price: prev.regular_price, prev_price: prev.price, prev_on_sale: prev.on_sale, prev_in_stock: prev.in_stock,
    promo_depth_pct: depth, promo_gap_eur: gap, purchase: purchaseText(source) };

  // --- Déclarations Dar Nūr manquantes ---------------------------------------
  if (!variant && supply.stock_mode == null) {
    add('stock_mode_missing', 'info', 'none', 'Déclarer dans l’administration si Dar Nūr détient ce produit en stock propre ou l’achète à la commande.', null, ev);
  }
  // Produit à variantes : les prix et disponibilités qui comptent sont ceux des
  // variantes ; la ligne parent (prix minimal, promo « au moins une variante »)
  // ne porte aucune autre détection, sinon chaque alerte serait triplée.
  if (variable && !variant) {
    return { facts: f, prev, changed, detections: det, fingerprint: fp, label, dnPrice, supply, error: null };
  }
  if (priced && supply.base_price == null) {
    add('base_price_missing', 'info', 'none',
      `Déclarer le prix de base Dar Nūr (hors promotion). Repère dérivé du prix public fournisseur hors promo : ${fmt(f.regular_price != null ? roundEuro(f.regular_price) : null)} — ce n’est pas un coût.`,
      null, ev);
  }

  // --- Promotions ------------------------------------------------------------
  const strong = f.on_sale && f.regular_price != null && f.price != null
    && ((depth != null && depth >= policy.strongPromoPct) || (gap != null && gap >= policy.strongPromoEuro));
  if (strong) {
    add('promo_strong', 'attention', 'none',
      `Promotion forte chez le fournisseur : ${fmt(f.regular_price)} → ${fmt(f.price)} (−${depth} %, −${fmt(gap)}). Acheter du stock à ce prix (puis renseigner le prix d’achat réel) ? Ou ignorer.`,
      null, ev);
  } else if (f.on_sale && hadPrev && prev.on_sale === false) {
    add('promo_start', 'info', 'none', `Promotion fournisseur : ${fmt(f.regular_price)} → ${fmt(f.price)} (−${depth} %).`, null, ev);
  }
  if (!f.on_sale && hadPrev && prev.on_sale === true) {
    const canRevert = priced && supply.base_price != null && dnPrice != null && num(supply.base_price) !== dnPrice;
    add('promo_end', exposure === 'info' ? 'info' : 'attention', canRevert ? priceTarget : 'none',
      canRevert
        ? `Fin de promotion fournisseur (${fmt(prev.price)} → ${fmt(f.price)}). Revenir au prix de base Dar Nūr ${fmt(supply.base_price)} ?`
        : `Fin de promotion fournisseur (${fmt(prev.price)} → ${fmt(f.price)}).${supply.base_price == null ? ' Aucun prix de base déclaré : déclarer un prix de base, puis décider du prix.' : ' Le prix Dar Nūr est déjà au prix de base.'}`,
      canRevert ? num(supply.base_price) : null, ev);
  }

  // --- Variations du prix régulier ------------------------------------------
  if (hadPrev && prev.regular_price != null && f.regular_price != null && f.regular_price !== prev.regular_price) {
    if (f.regular_price > prev.regular_price) {
      add('regular_up', notOwnStock && active ? 'attention' : 'info', 'none',
        `Hausse du prix public fournisseur hors promo : ${fmt(prev.regular_price)} → ${fmt(f.regular_price)}. Vérifier le prix Dar Nūr et le prix d’achat réel.`, null, ev);
    } else {
      const suggestion = roundEuro(f.price);
      const canAlign = priced && dnPrice != null && suggestion != null && suggestion < dnPrice;
      add('regular_down', 'info', canAlign ? priceTarget : 'none',
        `Baisse durable du prix public fournisseur : ${fmt(prev.regular_price)} → ${fmt(f.regular_price)}.${canAlign ? ` Aligner le prix Dar Nūr sur ${fmt(suggestion)} (et en faire le nouveau prix de base) ?` : ''}`,
        canAlign ? suggestion : null, { ...ev, sets_base_price: canAlign });
    }
  }

  // --- Prix Dar Nūr comparé aux prix connus ----------------------------------
  if (priced && dnPrice != null && source.purchase_price != null && dnPrice < num(source.purchase_price)) {
    add('dn_below_purchase', active ? 'bloquant' : 'attention', 'none',
      `Prix Dar Nūr ${fmt(dnPrice)} INFÉRIEUR au prix d’achat réel renseigné ${fmt(source.purchase_price)} : vente à perte. Relever le prix ou corriger le prix d’achat.`, null, ev);
  }
  if (priced && dnPrice != null && f.price != null && dnPrice < f.price) {
    const known = source.purchase_price != null;
    const canRaise = supply.base_price != null && num(supply.base_price) >= f.price && num(supply.base_price) !== dnPrice;
    add('dn_below_supplier', known ? 'info' : exposure, canRaise ? priceTarget : 'none',
      `Prix Dar Nūr ${fmt(dnPrice)} inférieur au prix public fournisseur ${fmt(f.price)} — ${purchaseText(source)}.` +
      (known ? '' : ` Sans stock propre, un réapprovisionnement se ferait au-dessus du prix de vente.${canRaise ? ` Relever au prix de base ${fmt(supply.base_price)} ?` : ' Relever le prix, passer en « Demander le prix » (manuellement) ou renseigner le prix d’achat réel.'}`),
      canRaise ? num(supply.base_price) : null, ev);
  } else if (priced && dnPrice != null && f.on_sale && f.regular_price != null && dnPrice < f.regular_price) {
    // Prix d'achat réel connu et couvert : simple signal. Inconnu : prudence.
    add('dn_below_regular', source.purchase_price == null && notOwnStock && active ? 'attention' : 'info', 'none',
      `Le prix Dar Nūr ${fmt(dnPrice)} dépend d’une promotion fournisseur en cours (${fmt(f.regular_price)} → ${fmt(f.price)}) — ${purchaseText(source)}. À la fin de la promotion, un réapprovisionnement se ferait au-dessus du prix de vente.`, null, ev);
  }

  // --- Disponibilité fournisseur ---------------------------------------------
  if (!f.in_stock) {
    add('supplier_out_of_stock', exposure, 'none',
      active ? 'Rupture chez le fournisseur : passer le produit en « Disponible prochainement » (coming_soon) manuellement dans l’administration.'
             : 'Rupture chez le fournisseur : ne pas activer ce brouillon tant que le fournisseur est en rupture.', null, ev);
  } else if (hadPrev && prev.in_stock === false) {
    add('supplier_back_in_stock', 'info', 'none', 'Produit de nouveau disponible chez le fournisseur : rouvrir manuellement (coming_soon) si nécessaire.', null, ev);
  }

  return { facts: f, prev, changed, detections: det, fingerprint: fp, label, dnPrice, supply, error: null };
}

// Rapproche les détections des propositions existantes (pending / accepted) :
// renvoie ce qu'il faudrait créer et ce qu'il faudrait rendre obsolète.
// Détections d'ÉVÉNEMENT (transition entre deux observations) : elles ne se
// reproduisent pas au passage suivant, la proposition reste donc valable tant
// que les faits n'ont pas changé. Les autres décrivent un ÉTAT : si l'état
// n'est plus constaté, la proposition est levée.
const TRANSITION_KINDS = new Set(['promo_start', 'promo_end', 'regular_up', 'regular_down', 'supplier_back_in_stock']);

function reconcile(source, analysis, existing) {
  const mine = existing.filter(p => p.source_id === source.id);
  const toCreate = [], toObsolete = [], unchanged = [];
  const detected = new Map(analysis.detections.map(d => [d.kind, d]));
  if (analysis.error) {
    // Faits inconnus : les propositions existantes restent telles quelles ;
    // seules les détections d'injoignabilité sont ajoutées si elles manquent.
    for (const p of mine) { unchanged.push(p); detected.delete(p.kind); }
    for (const d of detected.values()) toCreate.push(d);
    return { toCreate, toObsolete, unchanged };
  }
  for (const p of mine) {
    const d = detected.get(p.kind);
    if (!d && !TRANSITION_KINDS.has(p.kind)) { toObsolete.push({ id: p.id, reason: 'détection levée : les faits ne la justifient plus' }); continue; }
    if (p.fingerprint !== analysis.fingerprint) {
      toObsolete.push({ id: p.id, reason: p.status === 'accepted' ? 'faits modifiés après acceptation — à revalider' : 'faits modifiés' });
      continue;
    }
    unchanged.push(p);
    detected.delete(p.kind);
  }
  for (const d of detected.values()) toCreate.push(d);
  return { toCreate, toObsolete, unchanged };
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const LEVEL_ICON = { bloquant: '🔴', attention: '🟠', info: '🔵' };
const ORDER = { bloquant: 0, attention: 1, info: 2 };

function tableRow(source, a, ctx, pending) {
  const product = ctx.products.find(p => p.id === source.product_id);
  const status = product.active ? (product.coming_soon ? 'actif · bientôt' : 'actif') : 'brouillon';
  const f = a.facts;
  const purchase = source.purchase_price == null ? 'non renseigné' : `${fmt(source.purchase_price)} (${source.purchase_price_origin}, ${String(source.purchase_price_at).slice(0, 10)})`;
  const stockDn = a.supply.stock_mode === 'own_stock' ? 'stock propre' : a.supply.stock_mode === 'on_demand' ? 'à la commande' : 'à déclarer';
  const alerts = pending.sort((x, y) => ORDER[x.level] - ORDER[y.level]).map(p => `${LEVEL_ICON[p.level]} ${p.kind}`).join(' · ') || '—';
  const actions = pending.map(p => p.suggested_action).join(' / ') || '—';
  return `| ${a.label} (${status}) | ${fmt(a.dnPrice)} | ${fmt(a.prev.price)} | ${f ? fmt(f.price) : `injoignable`} | ${f?.on_sale ? `oui (régulier ${fmt(f.regular_price)})` : f ? 'non' : '?'} | ${f ? (f.in_stock ? (f.stock_qty ?? 'oui') : 'RUPTURE') : '?'} | ${stockDn} | ${purchase} | ${alerts} | ${actions} |`;
}

function buildReport(ctx, results, mode, workDir, id) {
  const L = [];
  L.push(`# Synchronisation fournisseur — ${mode === 'record' ? 'ENREGISTREMENT' : 'DRY-RUN'} ${id}`, '');
  L.push(`Sources : ${results.length} · faits changés : ${results.filter(r => r.a.changed).length} · injoignables : ${results.filter(r => r.a.error).length}`);
  const allNew = results.flatMap(r => r.rec.toCreate);
  const allObs = results.flatMap(r => r.rec.toObsolete);
  const counts = lvl => allNew.filter(d => d.level === lvl).length + results.flatMap(r => r.rec.unchanged).filter(p => p.status === 'pending' && p.level === lvl).length;
  L.push(`Propositions en attente après ce passage : 🔴 ${counts('bloquant')} bloquant(es) · 🟠 ${counts('attention')} · 🔵 ${counts('info')} — nouvelles : ${allNew.length} · rendues obsolètes : ${allObs.length}`);
  L.push(`Dossier : ${workDir}`, '');
  L.push(mode === 'record' ? 'Écritures : faits fournisseur (product_sources, observations) et propositions. **Aucun prix, aucun `active`, aucun `coming_soon` n’est modifié par ce script.**'
                           : 'Dry-run : **rien n’a été écrit dans Supabase.**', '');
  L.push('| Produit | Prix Dar Nūr | Fourn. avant | Fourn. actuel | Promo | Stock fourn. | Stock Dar Nūr | Prix d’achat | Alerte | Action proposée |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  const sorted = [...results].sort((x, y) => Math.min(...x.pendingAfter.map(p => ORDER[p.level]), 9) - Math.min(...y.pendingAfter.map(p => ORDER[p.level]), 9));
  for (const r of sorted) L.push(tableRow(r.source, r.a, ctx, r.pendingAfter));
  L.push('');
  if (allObs.length) {
    L.push('## Propositions rendues obsolètes', '');
    for (const r of results) for (const o of r.rec.toObsolete) L.push(`- ${r.a.label} · ${o.id} — ${o.reason}`);
    L.push('');
  }
  L.push('## Détail des propositions en attente', '');
  for (const r of sorted) for (const p of r.pendingAfter) {
    L.push(`- ${LEVEL_ICON[p.level]} **${r.a.label}** · \`${p.kind}\` · cible ${p.target}${p.suggested_value != null ? ` · valeur suggérée ${fmt(p.suggested_value)}` : ''}${p.id ? ` · ${p.id}` : ' · (nouvelle)'}`);
    L.push(`  ${p.suggested_action}`);
  }
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Mode dry-run / record
// ---------------------------------------------------------------------------

async function runSync(args) {
  const policy = loadPolicy();
  const supplier = loadSupplierConfig(args.supplierConfig);
  const id = runId();
  const workDir = path.resolve(args.work || path.join(ROOT, 'backups', 'supplier-sync', id));
  await mkdir(workDir, { recursive: true });
  const creds = await adminLogin(loadCreds(), args.auth);
  const ctx = { mode: args.mode, creds, writes: [] };
  log(`Mode : ${args.mode === 'record' ? 'ENREGISTREMENT (faits + propositions)' : 'DRY-RUN (aucune écriture)'} · dossier : ${workDir}`);

  const dn = await loadContext(creds, supplier.code, args.ids);
  log(`Dar Nūr : ${dn.sources.length} source(s) · ${dn.products.length} produit(s) · ${dn.proposals.length} proposition(s) en attente/acceptée(s)`);
  if (!dn.sources.length) fail('Aucune source pour ce fournisseur (ou --ids sans correspondance).');

  const observed = await observeSupplier(supplier, dn.sources);
  const now = new Date();
  const results = [];
  for (const source of dn.sources) {
    const a = analyse(source, observed.get(source.id), dn, policy, now);
    const rec = reconcile(source, a, dn.proposals);
    const pendingAfter = [...rec.unchanged.filter(p => p.status === 'pending'), ...rec.toCreate];
    results.push({ source, a, rec, pendingAfter });
  }

  if (args.mode === 'record') {
    for (const r of results) {
      const { source, a, rec } = r;
      const nowIso = isoNow();
      if (a.error) {
        await writeRow(ctx, 'PATCH', 'product_sources', `id=eq.${source.id}`, { last_attempt_at: nowIso, last_error: String(a.error).slice(0, 500) });
      } else {
        const f = a.facts;
        await writeRow(ctx, 'PATCH', 'product_sources', `id=eq.${source.id}`, {
          supplier_regular_price: f.regular_price, supplier_price: f.price, supplier_on_sale: f.on_sale, supplier_in_stock: f.in_stock,
          supplier_stock_qty: f.stock_qty, supplier_stock_text: f.stock_text, raw: f.raw, last_synced_at: nowIso, last_attempt_at: nowIso, last_error: null,
        });
        if (a.changed) {
          await writeRow(ctx, 'POST', 'product_source_observations', '', {
            source_id: source.id, observed_at: nowIso, run_id: id, regular_price: f.regular_price, price: f.price, on_sale: f.on_sale, in_stock: f.in_stock, stock_qty: f.stock_qty,
          });
        }
      }
      for (const o of rec.toObsolete) {
        await writeRow(ctx, 'PATCH', 'sync_proposals', `id=eq.${o.id}`, { status: 'obsolete', obsolete_reason: o.reason });
      }
      if (rec.toCreate.length) {
        const rows = rec.toCreate.map(d => ({
          run_id: id, product_id: d.product_id, variant_id: d.variant_id, source_id: d.source_id, kind: d.kind, level: d.level, target: d.target,
          evidence: d.evidence, suggested_action: d.suggested_action, suggested_value: d.suggested_value, fingerprint: a.fingerprint, status: 'pending',
        }));
        const created = await writeRow(ctx, 'POST', 'sync_proposals', '', rows);
        (created || []).forEach((c, i) => { rec.toCreate[i].id = c.id; });
      }
    }
    log(`Écritures Supabase : ${ctx.writes.length} (tables : ${[...new Set(ctx.writes.map(w => w.table))].join(', ')})`);
  }

  const report = buildReport(dn, results, args.mode, workDir, id);
  await writeFile(path.join(workDir, 'report.md'), report, 'utf8');
  await writeFile(path.join(workDir, 'plan.json'), JSON.stringify({
    run_id: id, mode: args.mode, supplier: supplier.code, policy,
    results: results.map(r => ({ source_id: r.source.id, label: r.a.label, error: r.a.error, changed: r.a.changed, fingerprint: r.a.fingerprint, facts: r.a.facts && { ...r.a.facts, raw: undefined },
      prev: r.a.prev, dn_price: r.a.dnPrice, supply: r.a.supply, detections: r.a.detections, toCreate: r.rec.toCreate.map(d => d.kind), toObsolete: r.rec.toObsolete, unchanged: r.rec.unchanged.map(p => ({ id: p.id, kind: p.kind, status: p.status })) })),
    writes: ctx.writes.map(w => ({ ...w, body: Array.isArray(w.body) ? w.body.map(b => ({ ...b, raw: undefined })) : { ...w.body, raw: undefined } })),
  }, null, 2), 'utf8');
  log('\n' + report);
}

// ---------------------------------------------------------------------------
// Mode apply
// ---------------------------------------------------------------------------

async function runApply(args) {
  const policy = loadPolicy();
  const id = runId();
  const workDir = path.resolve(args.work || path.join(ROOT, 'backups', 'supplier-sync', `${id}-apply`));
  await mkdir(workDir, { recursive: true });
  const creds = await adminLogin(loadCreds(), args.auth);
  const ctx = { mode: 'apply', creds, writes: [] };
  log(`Mode : APPLICATION des propositions acceptées · dossier : ${workDir}`);

  const accepted = await sbGet(creds, 'sync_proposals?select=*&status=eq.accepted&applied_at=is.null&order=decided_at.asc');
  log(`Propositions acceptées non appliquées : ${accepted.length}`);
  const max = args.max ?? policy.maxAppliedPerRun;
  if (accepted.length > max) fail(`${accepted.length} propositions acceptées > plafond ${max} (sync-policy.json maxAppliedPerRun, ou --max N) : abandon, probable erreur ou décision de masse à confirmer.`);
  if (!accepted.length) { log('Rien à appliquer.'); return; }

  // Cliché intégral AVANT toute écriture : sert à --verify pour prouver que
  // rien d'autre n'a bougé (en particulier active / coming_soon partout).
  const snapshot = await sbGet(creds, 'products?select=id,slug,price_value,active,coming_soon&order=slug.asc');
  const snapshotVariants = await sbGet(creds, 'product_variants?select=id,product_id,price,active&order=id.asc');
  const manifest = { run_id: id, started_at: isoNow(), applied: [], refused: [], snapshot, snapshotVariants };

  for (const p of accepted) {
    const [source] = p.source_id ? await sbGet(creds, `product_sources?select=*&id=eq.${p.source_id}`) : [null];
    const [product] = await sbGet(creds, `products?select=id,slug,name,price_value,active,coming_soon,variant_axes&id=eq.${p.product_id}`);
    const variants = await sbGet(creds, `product_variants?select=id,product_id,name,price,active&product_id=eq.${p.product_id}`);
    const supply = await sbGet(creds, `product_supply?select=*&product_id=eq.${p.product_id}`);
    if (!product) { manifest.refused.push({ id: p.id, reason: 'produit introuvable' }); continue; }
    const ctxMini = { products: [product], variants, supply, lastObs: new Map() };
    const pseudoSource = source || { id: null, product_id: p.product_id, variant_id: p.variant_id, purchase_price: null };
    const facts = source ? { regular_price: source.supplier_regular_price, price: source.supplier_price, on_sale: source.supplier_on_sale, in_stock: source.supplier_in_stock } : { regular_price: null, price: null, on_sale: null, in_stock: null };
    const fp = fingerprintOf(facts, dnPriceOf(pseudoSource, ctxMini), supplyOf(pseudoSource, ctxMini), pseudoSource.purchase_price);
    const label = `${product.name}${p.variant_id ? ' — ' + (variants.find(v => v.id === p.variant_id)?.name || p.variant_id) : ''} · ${p.kind}`;

    if (fp !== p.fingerprint) {
      await writeRow(ctx, 'PATCH', 'sync_proposals', `id=eq.${p.id}`, { status: 'obsolete', obsolete_reason: 'faits modifiés entre l’acceptation et l’application — à revalider' });
      manifest.refused.push({ id: p.id, label, reason: 'empreinte des faits différente : proposition rendue obsolète' });
      log(`✖ ${label} : faits modifiés depuis l’acceptation → obsolète, non appliquée`);
      continue;
    }

    const value = p.decided_value != null ? num(p.decided_value) : num(p.suggested_value);
    const before = {}, after = {};
    try {
      if (p.target === 'none') {
        after.manual = true;
      } else {
        if (value == null || !(value > 0)) throw new Error('valeur décidée absente ou invalide');
        if (policy.requireWholeEuros && !Number.isInteger(value)) throw new Error(`valeur ${fmt(value)} non arrondie à l’euro (sync-policy.json requireWholeEuros)`);
        if (p.target === 'product_price') {
          before.price_value = num(product.price_value);
          await writeRow(ctx, 'PATCH', 'products', `id=eq.${product.id}`, { price_value: value });
          after.price_value = value;
        } else if (p.target === 'variant_price') {
          const v = variants.find(x => x.id === p.variant_id);
          if (!v) throw new Error('variante introuvable');
          before.variant_price = num(v.price);
          await writeRow(ctx, 'PATCH', 'product_variants', `id=eq.${v.id}`, { price: value });
          after.variant_price = value;
          // products.price_value d'un produit à variantes = prix minimal des variantes actives (convention du site).
          const minPrice = Math.min(...variants.filter(x => x.active !== false).map(x => (x.id === v.id ? value : num(x.price))).filter(x => x != null));
          if (Number.isFinite(minPrice) && minPrice !== num(product.price_value)) {
            before.price_value = num(product.price_value);
            await writeRow(ctx, 'PATCH', 'products', `id=eq.${product.id}`, { price_value: minPrice });
            after.price_value = minPrice;
          }
        }
        if (p.target === 'base_price' || p.evidence?.sets_base_price === true) {
          const row = supply.find(s => s.product_id === p.product_id && (s.variant_id || NIL) === (p.variant_id || NIL));
          before.base_price = row ? num(row.base_price) : null;
          if (row) await writeRow(ctx, 'PATCH', 'product_supply', `id=eq.${row.id}`, { base_price: value });
          else await writeRow(ctx, 'POST', 'product_supply', '', { product_id: p.product_id, variant_id: p.variant_id, base_price: value });
          after.base_price = value;
        }
      }
      await writeRow(ctx, 'PATCH', 'sync_proposals', `id=eq.${p.id}`, { applied_at: isoNow(), applied_payload: { before, after, run_id: id } });
      manifest.applied.push({ id: p.id, label, target: p.target, product_id: p.product_id, variant_id: p.variant_id, before, after });
      log(`✔ ${label} : ${p.target === 'none' ? 'action manuelle prise en compte' : JSON.stringify(after)}`);
    } catch (e) {
      manifest.refused.push({ id: p.id, label, reason: e.message });
      log(`✖ ${label} : ${e.message}`);
    }
  }
  manifest.finished_at = isoNow();
  manifest.writes = ctx.writes;
  await writeFile(path.join(workDir, 'apply-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  log(`\nAppliquées : ${manifest.applied.length} · refusées : ${manifest.refused.length} · manifeste : ${path.join(workDir, 'apply-manifest.json')}`);
  log(`Vérifier : node scripts/sync-supplier.mjs --verify "${workDir}"`);
}

// ---------------------------------------------------------------------------
// Mode verify
// ---------------------------------------------------------------------------

async function runVerify(args) {
  const workDir = path.resolve(args.verify);
  const manifest = JSON.parse(await readFile(path.join(workDir, 'apply-manifest.json'), 'utf8'));
  const base = loadCreds();
  const creds = await adminLogin(base, args.auth);
  const checks = [];
  const check = (ok, label, detail) => { checks.push({ ok, label, detail }); log(`${ok ? '✔' : '✖'} ${label}${detail && !ok ? ` — ${detail}` : ''}`); };

  const products = await sbGet(creds, 'products?select=id,slug,price_value,active,coming_soon&order=slug.asc');
  const variants = await sbGet(creds, 'product_variants?select=id,product_id,price,active&order=id.asc');
  const touchedProducts = new Set(manifest.applied.flatMap(a => (a.after.price_value !== undefined ? [a.product_id] : [])));
  const touchedVariants = new Set(manifest.applied.flatMap(a => (a.after.variant_price !== undefined ? [a.variant_id] : [])));

  // 1) active / coming_soon identiques PARTOUT au cliché pris avant l'application.
  let flagDiff = 0;
  for (const s of manifest.snapshot) {
    const p = products.find(x => x.id === s.id);
    if (!p || p.active !== s.active || p.coming_soon !== s.coming_soon) flagDiff++;
  }
  check(flagDiff === 0 && products.length === manifest.snapshot.length, `active / coming_soon inchangés sur ${manifest.snapshot.length} produits`, `${flagDiff} écart(s), ${products.length} produits maintenant`);

  // 2) Aucun prix modifié hors des produits/variantes couverts par une proposition appliquée.
  const priceDiff = manifest.snapshot.filter(s => { const p = products.find(x => x.id === s.id); return p && num(p.price_value) !== num(s.price_value) && !touchedProducts.has(s.id); }).map(s => s.slug);
  check(priceDiff.length === 0, 'aucun prix produit modifié hors propositions appliquées', priceDiff.join(', '));
  const vDiff = manifest.snapshotVariants.filter(s => { const v = variants.find(x => x.id === s.id); return v && num(v.price) !== num(s.price) && !touchedVariants.has(s.id); }).map(s => s.id);
  check(vDiff.length === 0, 'aucun prix variante modifié hors propositions appliquées', vDiff.join(', '));

  // 3) Chaque application correspond à la valeur décidée, et la proposition porte applied_at.
  for (const a of manifest.applied) {
    const [prop] = await sbGet(creds, `sync_proposals?select=id,status,applied_at,decided_value,suggested_value&id=eq.${a.id}`);
    check(prop && prop.status === 'accepted' && prop.applied_at, `${a.label} : proposition acceptée et marquée appliquée`);
    if (a.after.price_value !== undefined) { const p = products.find(x => x.id === a.product_id); check(num(p?.price_value) === a.after.price_value, `${a.label} : products.price_value = ${fmt(a.after.price_value)}`, fmt(p?.price_value)); }
    if (a.after.variant_price !== undefined) { const v = variants.find(x => x.id === a.variant_id); check(num(v?.price) === a.after.variant_price, `${a.label} : product_variants.price = ${fmt(a.after.variant_price)}`, fmt(v?.price)); }
    if (a.after.base_price !== undefined) {
      const rows = await sbGet(creds, `product_supply?select=base_price&product_id=eq.${a.product_id}&variant_id=${a.variant_id ? 'eq.' + a.variant_id : 'is.null'}`);
      check(rows.length === 1 && num(rows[0].base_price) === a.after.base_price, `${a.label} : product_supply.base_price = ${fmt(a.after.base_price)}`);
    }
  }

  // 4) Les propositions refusées à l'application sont obsolètes (ou toujours acceptées si l'erreur était locale), jamais appliquées.
  for (const r of manifest.refused) {
    if (!r.id) continue;
    const [prop] = await sbGet(creds, `sync_proposals?select=id,status,applied_at&id=eq.${r.id}`);
    check(prop && !prop.applied_at, `${r.label || r.id} : refusée, non appliquée (statut ${prop?.status})`);
  }

  // 5) Confidentialité : anon ne lit ni tables privées, ni brouillons.
  const anon = { url: base.url, key: base.anonKey, token: base.anonKey };
  for (const t of ['product_sources', 'product_source_observations', 'product_supply', 'sync_proposals']) {
    const res = await fetch(`${anon.url}/rest/v1/${t}?select=id&limit=1`, { headers: sbHeaders(anon) });
    const body = await res.text();
    check(!res.ok || body.trim() === '[]', `anon → ${t} : ${res.status} ${body.slice(0, 40)}`);
  }
  const inactive = await fetch(`${anon.url}/rest/v1/products?select=slug&active=eq.false`, { headers: sbHeaders(anon) });
  const inactiveBody = await inactive.text();
  check(inactive.status === 200 && inactiveBody.trim() === '[]', `anon → produits inactifs : ${inactiveBody.slice(0, 40)} (attendu [])`);

  const okCount = checks.filter(c => c.ok).length;
  const md = [`# Vérification post-application — ${manifest.run_id}`, '', `${okCount}/${checks.length} contrôles réussis`, '', ...checks.map(c => `- ${c.ok ? '✔' : '✖'} ${c.label}${c.detail && !c.ok ? ` — ${c.detail}` : ''}`)].join('\n');
  await writeFile(path.join(workDir, 'verify-report.md'), md, 'utf8');
  log(`\n${okCount}/${checks.length} contrôles réussis · ${path.join(workDir, 'verify-report.md')}`);
  if (okCount !== checks.length) process.exit(2);
}

// ---------------------------------------------------------------------------

// Exporté pour les tests (scripts/test/sync-supplier/run.mjs) : les garde-fous
// d'écriture sont vérifiés directement, table par table, mode par mode.
export { FORBIDDEN_COLUMNS, WRITABLE, assertWritable, fingerprintOf };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (args.mode === 'verify') await runVerify(args);
    else if (args.mode === 'apply') await runApply(args);
    else await runSync(args);
  } catch (e) {
    fail(e.stack || e.message);
  }
}
