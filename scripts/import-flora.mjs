#!/usr/bin/env node
// scripts/import-flora.mjs — prototype d'import fournisseur Flora → Dar Nūr.
//
// Périmètre volontairement limité : une liste explicite d'identifiants Flora
// (`--ids`), jamais le catalogue entier. Sans `--apply`, le script est un
// DRY-RUN complet : il lit Flora et Supabase, calcule le plan (créations,
// rapprochements, champs modifiés, prix avant/après, variantes, marques,
// images optimisées, lignes product_sources) et l'écrit dans un dossier de
// travail — sans écrire un seul octet dans Supabase ni dans assets/.
//
// Usage :
//   node scripts/import-flora.mjs --ids 65197,65693,64945 [--work <dossier>] [--exclude-images <url,url>]
//   node scripts/import-flora.mjs --ids ... --apply [--auth cli]   # après validation du dry-run
//   node scripts/import-flora.mjs --verify <dossier-d-application>   # contrôle post-import
//   node scripts/import-flora.mjs --rollback <dossier-de-sauvegarde>
//
// Écriture (`--apply` / `--rollback`) : session administrateur Supabase par
// e-mail + mot de passe lus dans DN_ADMIN_EMAIL / DN_ADMIN_PASSWORD (jamais
// écrits dans le dépôt). L'écriture est refusée sans la table
// `product_sources` (supabase/sql/product_sources.sql) : la provenance
// privée fait partie du contrat, un produit importé sans sa source n'existe pas.
//
// Source Flora : WooCommerce Store API publique (/wp-json/wc/store/v1/products),
// complétée par le JSON-LD Product de la page (seule source du GTIN/EAN).
// Requêtes espacées (DELAY_MS), un seul passage par produit, aucune protection
// contournée.
//
// Règles métier (validées en Phase A/B de la mission) :
//   - Dar Nūr reste prioritaire : un produit existant n'est jamais écrasé, seuls
//     ses champs VIDES sont complétés ; ni nom, ni slug, ni catégorie, ni marque,
//     ni images existantes, ni coming_soon ne sont touchés.
//   - Prix : prix public Flora effectif (promo incluse) arrondi à l'euro le plus
//     proche. Nouveau produit = ce prix. Produit existant = aligné seulement si
//     Flora arrondi est INFÉRIEUR au prix Dar Nūr, jamais augmenté.
//   - Nouveaux produits créés `active = false` : invisibles sur le site tant
//     qu'un administrateur ne les active pas depuis admin.html.
//   - Matching : GTIN (product_sources), puis identifiant fournisseur déjà
//     connu, puis marque identique + nom « cœur » identique. Deux marques
//     différentes ne sont JAMAIS fusionnées, même à nom identique.
//   - Le nom du fournisseur n'apparaît nulle part publiquement : tout texte
//     contenant « Flora » (mot entier) est refusé, les formulations « senteur /
//     inspiration <marque tierce> » sont exclues.
//   - Aucune donnée inventée : un champ absent chez Flora reste vide.
//   - purchase_price reste NULL (« prix d'achat à renseigner »).
//
// Zéro dépendance npm (fetch natif, Node ≥ 18). L'optimisation d'image est
// déléguée à scripts/import-flora-images.py (Pillow).

import { readFile, writeFile, mkdir, copyFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONFIG_PATH = path.join(ROOT, 'js', 'config.js');
const OPTIMIZER = path.join(ROOT, 'scripts', 'import-flora-images.py');
const WATERMARK_DETECTOR = path.join(ROOT, 'scripts', 'import-flora-watermark.py');
// Gabarits du filigrane fournisseur (deux mises en page observées : médaillon
// doré « FLORA / PARFUMS » et médaillon noir « FLORA PARFUMS » sur une ligne).
const WATERMARK_TEMPLATES = [
  path.join(ROOT, 'scripts', 'import-flora-watermark-template.png'),
  path.join(ROOT, 'scripts', 'import-flora-watermark-template-2.png'),
];
// Mesuré sur 34 images de l'échantillon : filigranées ≥ 0,516, propres ≤ 0,397.
const WATERMARK_THRESHOLD = 0.45;
const WATERMARK_SUSPECT = 0.40;   // entre les deux : image gardée mais marquée « ? » sur la planche-contact
const ASSETS_DIR = path.join(ROOT, 'assets', 'produits-fournisseur');

const SUPPLIER = 'flora';
const FLORA_BASE = 'https://flora-parfums.com';
const STORE_API = `${FLORA_BASE}/wp-json/wc/store/v1`;
const USER_AGENT = 'Mozilla/5.0 (compatible; DarNur-import-prototype/1.0)';
const DELAY_MS = 900;
const MAX_IMAGES_PER_PRODUCT = 6;
const IMAGE_MAX_SIDE = 1200;
const IMAGE_QUALITY = 82;

// Catégorie Flora (slug) → catégorie Dar Nūr. Seul le périmètre parfums est
// pris en charge par ce prototype ; toute autre catégorie fait abandonner le
// produit (garde-fou : rien n'est classé « par défaut »).
const CATEGORY_MAP = {
  'parfum-oriental': 'parfums',
  'parfum-de-niche': 'parfums',
  'collection-privee': 'parfums',
  'collection-cp': 'parfums',
  'grands-classiques': 'parfums',
  'eau-de-milky': 'parfums',
};
// Catégories Flora purement commerciales (jamais une catégorie produit).
const CATEGORY_IGNORE = new Set(['destockage']);

// Mots retirés du nom pour obtenir le « cœur » comparable entre Flora et Dar Nūr
// (ex. « Khamrah – Eau de Parfum Unisexe 100 mL – Lattafa » ↔ « Khamrah »).
const GENERIC_NAME_TOKENS = new Set([
  'eau', 'de', 'parfum', 'parfums', 'edp', 'edt', 'extrait', 'elixir', 'unisexe', 'mixte',
  'pour', 'homme', 'femme', 'hommes', 'femmes', 'ml', 'edition', 'spray', 'vaporisateur', 'flacon',
]);

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function log(msg) { console.log(msg); }
function fail(msg) { console.error(`\n✖ ${msg}`); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const args = { ids: [], apply: false, rollback: null, verify: null, work: null, excludeImages: [], auth: 'admin' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ids') args.ids = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--apply') args.apply = true;
    else if (a === '--rollback') args.rollback = argv[++i];
    else if (a === '--verify') args.verify = argv[++i];
    else if (a === '--auth') { args.auth = argv[++i]; if (!['admin', 'cli'].includes(args.auth)) fail('--auth admin | cli'); }
    else if (a === '--work') args.work = argv[++i];
    else if (a === '--exclude-images') args.excludeImages.push(...String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean));
    else fail(`Argument inconnu : ${a}`);
  }
  return args;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&lsquo;|&#8216;/g, '‘').replace(/&ndash;|&#8211;/g, '–').replace(/&mdash;|&#8212;/g, '—')
    .replace(/&hellip;|&#8230;/g, '…').replace(/&euro;/g, '€').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

// Même normalisation que js/search.js / generate-search-index.mjs : ligatures,
// NFD sans diacritiques, minuscules, tout non-alphanumérique → espace.
function normalize(s) {
  return decodeEntities(s)
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/Œ/g, 'oe').replace(/Æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(s) { return normalize(s).replace(/\s+/g, '-').slice(0, 60).replace(/-+$/, ''); } // même règle que admin.html

// Cœur du nom : tokens normalisés, sans les mots génériques, sans les mots de
// la marque, sans les contenances (« 100 ml », « 100ml »).
function coreName(name, brandNames) {
  const brandTokens = new Set(brandNames.flatMap(b => normalize(b).split(' ')).filter(Boolean));
  const tokens = normalize(name).replace(/\b(\d+(?:[.,]\d+)?)\s*ml\b/g, ' ').split(' ').filter(Boolean);
  return tokens.filter(t => !GENERIC_NAME_TOKENS.has(t) && !brandTokens.has(t) && !/^\d+$/.test(t)).join(' ');
}

function roundEuro(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
  return Math.round(Number(v) + Number.EPSILON); // arrondi à l'euro le plus proche (,50 → supérieur)
}
function fmt(v) { return v == null ? '—' : `${Number(v).toFixed(2).replace('.', ',')} €`; }

function normalizeVolume(v) {
  if (!v) return null;
  const s = decodeEntities(v).trim();
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*ml$/i);
  return m ? `${m[1].replace(',', '.')} ml` : s;
}
function volumeNumber(v) {
  const m = String(v || '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : Infinity;
}

function isEmpty(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// ---------------------------------------------------------------------------
// Nettoyage des textes Flora
// ---------------------------------------------------------------------------

const SUPPLIER_NAME_RE = /\bflora\b/i;                      // mot entier : « floral » n'est pas concerné
const DUPE_RE = /\b(senteur|inspiration|inspir[ée]e?s?|dupe|[ée]quivalent|alternative|similaire|clone|version)\b\s*(?:de\s+|du\s+|des\s+|d[’']|à\s+|au\s+|aux\s+)?[A-ZÀ-Ý]/;
const BOILERPLATE_RE = /^(visionner|voir aussi|découvrez (aussi|également)|commandez|livraison|exp[ée]di|ajouter au panier|description|notes? olfactives?)\b/i;
const KEY_VALUE_RE = /^(famille olfactive|familles olfactives|profil olfactif|concentration|genre|contenance|marque|format|notes? de t[êe]te|notes? de c[œo]e?ur|notes? de fond)\s*:\s*(.+)$/i;

// HTML WooCommerce (avec balisage collé depuis un éditeur tiers) → paragraphes texte.
function htmlToParagraphs(html) {
  let h = String(html || '');
  h = h.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // `<br data-start="…" />` : les <br> portent des attributs collés depuis un éditeur tiers.
  h = h.replace(/<\/(p|div|li|h[1-6]|section|tr|blockquote)>/gi, '\n').replace(/<br\b[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, '');
  return decodeEntities(h).split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Ligne-titre commerciale de Flora (« Eau de Parfum pour Femme – X – 100ml – Marque »).
function isTitleLine(p, name, brandNames) {
  const n = normalize(p);
  const hasBrand = brandNames.some(b => n.includes(normalize(b)));
  const hasName = n.includes(normalize(name));
  return p.length < 200 && (p.includes('–') || p.includes(' - ') || /\d+\s*ml/i.test(p)) && (hasBrand || hasName)
    && /^(eau|extrait|parfum|encens|bakhoor|brume|huile)/i.test(p);
}
function isHeadingLike(p) { return p.length < 70 && !/[.!?…:]$/.test(p) && p.split(' ').length <= 9; }

// Retourne { paragraphs, composition, keyValues, dropped } — tout ce qui est
// écarté est journalisé, rien n'est réécrit.
function cleanDescription(html, name, brandNames) {
  const raw = htmlToParagraphs(html);
  const paragraphs = [];
  const dropped = [];
  const notes = { tete: null, coeur: null, fond: null };
  const keyValues = {};
  for (const p of raw) {
    const kv = p.match(KEY_VALUE_RE);
    if (kv) {
      const key = normalize(kv[1]);
      const val = kv[2].trim();
      if (/^notes? de tete$/.test(key)) notes.tete = val;
      else if (/^notes? de c(oe|o)?e?ur$/.test(key)) notes.coeur = val;
      else if (/^notes? de fond$/.test(key)) notes.fond = val;
      else keyValues[key] = val;
      continue;
    }
    if (SUPPLIER_NAME_RE.test(p)) { dropped.push({ reason: 'mention fournisseur', text: p }); continue; }
    if (DUPE_RE.test(p)) { dropped.push({ reason: 'formulation dupe / marque tierce', text: p }); continue; }
    if (BOILERPLATE_RE.test(p)) { dropped.push({ reason: 'en-tête ou texte commercial', text: p }); continue; }
    if (isTitleLine(p, name, brandNames)) { dropped.push({ reason: 'ligne-titre commerciale', text: p }); continue; }
    if (isHeadingLike(p)) { dropped.push({ reason: 'sous-titre', text: p }); continue; }
    paragraphs.push(p);
  }
  // Même convention que les parfums déjà en base : « Notes de tête : … Notes de cœur : … Notes de fond : … »
  const parts = [];
  if (notes.tete) parts.push(`Notes de tête : ${notes.tete}`);
  if (notes.coeur) parts.push(`Notes de cœur : ${notes.coeur}`);
  if (notes.fond) parts.push(`Notes de fond : ${notes.fond}`);
  const composition = parts.length ? parts.join('  ') : null;
  return { paragraphs, composition, keyValues, dropped };
}

// Garde-fou final : aucun texte écrit ne doit contenir le nom du fournisseur.
function assertNoSupplierMention(obj, where) {
  const s = JSON.stringify(obj);
  if (SUPPLIER_NAME_RE.test(s)) fail(`Garde-fou : « Flora » détecté dans ${where} — import refusé.`);
}

// ---------------------------------------------------------------------------
// Flora (WooCommerce Store API + JSON-LD)
// ---------------------------------------------------------------------------

async function floraFetch(url, { json = true } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: json ? 'application/json' : 'text/html' } });
    if (res.ok) return json ? res.json() : res.text();
    if (res.status === 429 || res.status >= 500) { await sleep(DELAY_MS * 3 * attempt); continue; }
    throw new Error(`Flora a répondu ${res.status} ${res.statusText} (${url})`);
  }
  throw new Error(`Flora indisponible après 3 essais (${url})`);
}

function extractJsonLd(html) {
  const out = { gtin: null, dateModified: null };
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
    for (const n of nodes) {
      if (n && n['@type'] === 'Product' && n.gtin && /^\d{8,14}$/.test(String(n.gtin))) out.gtin = String(n.gtin);
      if (n && (n['@type'] === 'ItemPage' || n['@type'] === 'WebPage') && n.dateModified) out.dateModified = n.dateModified;
    }
  }
  return out;
}

function attrTerms(p, taxonomy) {
  const a = (p.attributes || []).find(x => x.taxonomy === taxonomy);
  return a ? a.terms.map(t => decodeEntities(t.name).trim()) : [];
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
// Charge utile conservée dans product_sources.raw : sans les blocs HTML et
// sans les liens techniques, pour rester lisible et compacte.
function trimRaw(p) {
  const { description, short_description, price_html, add_to_cart, _links, extensions, ...rest } = p;
  return rest;
}

async function fetchFloraProduct(id) {
  const p = await floraFetch(`${STORE_API}/products/${id}`);
  await sleep(DELAY_MS);
  const variations = [];
  for (const v of p.variations || []) {
    variations.push(await floraFetch(`${STORE_API}/products/${v.id}`));
    await sleep(DELAY_MS);
  }
  let ld = { gtin: null, dateModified: null };
  try {
    ld = extractJsonLd(await floraFetch(p.permalink, { json: false }));
  } catch (e) {
    log(`  ! page produit illisible (${e.message}) — GTIN inconnu`);
  }
  await sleep(DELAY_MS);
  return { product: p, variations, ld };
}

// ---------------------------------------------------------------------------
// Supabase (lecture anon ; écriture avec session admin)
// ---------------------------------------------------------------------------

async function loadSupabaseCreds() {
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const urlMatch = raw.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
  const keyMatch = raw.match(/SUPABASE_ANON\s*=\s*'([^']+)'/);
  if (!urlMatch || !keyMatch) throw new Error('Impossible de lire SUPABASE_URL/SUPABASE_ANON depuis js/config.js');
  // DN_SUPABASE_URL : uniquement pour les tests hors ligne (faux PostgREST local).
  return { url: process.env.DN_SUPABASE_URL || urlMatch[1], key: keyMatch[1], token: keyMatch[1] };
}

function sbHeaders(creds, extra = {}) {
  return { apikey: creds.key, Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json', ...extra };
}

async function sbGet(creds, pathAndQuery) {
  const res = await fetch(`${creds.url}/rest/v1/${pathAndQuery}`, { headers: sbHeaders(creds, { Range: '0-4999' }) });
  if (!res.ok) throw new Error(`Supabase GET ${res.status} ${res.statusText} — ${pathAndQuery}: ${await res.text()}`);
  return res.json();
}
async function sbWrite(creds, method, pathAndQuery, body) {
  const res = await fetch(`${creds.url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: sbHeaders(creds, { Prefer: 'return=representation' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${res.status} — ${pathAndQuery}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// Deux façons d'obtenir le droit d'écrire, au choix (`--auth`) :
//   - `admin` (défaut) : session Supabase Auth d'un compte listé dans public.admins,
//     e-mail + mot de passe lus dans DN_ADMIN_EMAIL / DN_ADMIN_PASSWORD ;
//   - `cli`   : clé secrète du projet récupérée EN MÉMOIRE auprès de la CLI Supabase
//     (`supabase projects api-keys --reveal`), elle-même authentifiée par
//     `supabase login` (navigateur, jeton dans le coffre d'identifiants de l'OS).
//     Rien n'est affiché ni écrit : la clé ne vit que dans ce processus.
async function adminLogin(creds, mode = 'admin') {
  if (mode === 'cli') return cliServiceLogin(creds);
  const email = process.env.DN_ADMIN_EMAIL;
  const password = process.env.DN_ADMIN_PASSWORD;
  if (!email || !password) fail('DN_ADMIN_EMAIL et DN_ADMIN_PASSWORD sont requis pour --apply / --rollback (session admin, jamais dans le dépôt) — ou utiliser --auth cli.');
  const res = await fetch(`${creds.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: creds.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) fail(`Connexion admin refusée (${res.status}) : ${await res.text()}`);
  const data = await res.json();
  return { ...creds, token: data.access_token };
}

function projectRef(url) {
  const m = String(url).match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!m) fail(`URL Supabase inattendue : ${url}`);
  return m[1];
}

async function cliServiceLogin(creds) {
  const ref = projectRef(creds.url);
  const out = await new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'supabase@latest', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
  // La clé secrète est utilisée comme apikey ET comme Bearer : PostgREST la
  // reconnaît comme rôle service_role (contourne la RLS — réservé à ce script).
  return { ...creds, key: secret.api_key, token: secret.api_key, viaCli: true };
}

async function loadDarNur(creds) {
  const [categories, brands, products] = await Promise.all([
    sbGet(creds, 'categories?select=id,label,filter_label,active'),
    sbGet(creds, 'brands?select=id,name,active,sort_order'),
    sbGet(creds, 'products?select=*,product_variants(*)&order=slug.asc'),
  ]);
  let sources = [];
  let sourcesAvailable = true;
  try {
    sources = await sbGet(creds, `product_sources?select=*&supplier=eq.${SUPPLIER}`);
  } catch (e) {
    sourcesAvailable = false; // table absente (migration non exécutée) ou lecture anon (attendu en dry-run)
  }
  return { categories, brands, products, sources, sourcesAvailable };
}

// ---------------------------------------------------------------------------
// Extraction Flora → structure neutre
// ---------------------------------------------------------------------------

function extract({ product: p, variations, ld }) {
  const brandNames = (p.brands || []).map(b => decodeEntities(b.name).trim());
  const name = decodeEntities(p.name).trim();
  const desc = cleanDescription(p.description, name, brandNames);
  const short = cleanDescription(p.short_description, name, brandNames);
  const concentration = attrTerms(p, 'pa_concentration')[0] || null;
  const contenances = attrTerms(p, 'pa_contenances').map(normalizeVolume);
  const familles = attrTerms(p, 'pa_famillesolfactives');
  const genres = attrTerms(p, 'pa_genre');
  const cats = (p.categories || []).map(c => ({ slug: c.slug, name: decodeEntities(c.name) }));
  const primaryCat = cats.find(c => !CATEGORY_IGNORE.has(c.slug)) || null;

  const vars = variations.map(v => {
    const cont = normalizeVolume((v.attributes || []).flatMap(a => a.terms || []).map(t => t.name)[0]
      || (p.variations.find(x => x.id === v.id)?.attributes || []).map(a => a.value)[0]);
    return {
      supplier_variant_id: String(v.id),
      contenance: cont,
      sku: v.sku || null,
      regular_price: minorToEuro(v.prices, 'regular_price'),
      price: minorToEuro(v.prices, 'price'),
      on_sale: !!v.on_sale,
      in_stock: !!v.is_in_stock,
      stock_qty: stockQty(v),
      stock_text: v.stock_availability?.text || null,
      raw: trimRaw(v),
    };
  }).sort((a, b) => volumeNumber(a.contenance) - volumeNumber(b.contenance));

  return {
    supplier_product_id: String(p.id),
    supplier_slug: p.slug,
    supplier_url: p.permalink,
    supplier_sku: p.sku || null,
    gtin: ld.gtin,
    supplier_modified_at: ld.dateModified,
    name,
    brandNames,
    brandSlug: p.brands?.[0]?.slug || null,
    type: p.type,
    category: primaryCat,
    allCategories: cats,
    tags: (p.tags || []).map(t => decodeEntities(t.name)),
    concentration,
    contenances,
    familles,
    genres,
    regular_price: minorToEuro(p.prices, 'regular_price'),
    price: minorToEuro(p.prices, 'price'),
    on_sale: !!p.on_sale,
    in_stock: !!p.is_in_stock,
    stock_qty: stockQty(p),
    stock_text: p.stock_availability?.text || null,
    description: desc,
    short: short,
    images: (p.images || []).map(i => ({ id: i.id, src: i.src, alt: decodeEntities(i.alt || '') })),
    variations: vars,
    raw: trimRaw(p),
  };
}

// Tagline dérivée uniquement d'attributs réels (concentration, genre, contenance).
function buildTagline(x) {
  if (!x.concentration) return null;
  let genre = '';
  const g = x.genres.map(normalize);
  if (g.includes('mixte') || (g.includes('femme') && g.includes('homme'))) genre = ' mixte';
  else if (g.includes('femme')) genre = ' pour femme';
  else if (g.includes('homme')) genre = ' pour homme';
  const vols = x.variations.length ? x.variations.map(v => v.contenance).filter(Boolean) : x.contenances;
  const volTxt = vols.length ? ` · ${vols.join(' et ')}` : '';
  return `${x.concentration}${genre}${volTxt}`;
}

function buildCharacteristicsAccordion(x) {
  const rows = [];
  if (x.concentration) rows.push(['Concentration', x.concentration]);
  const vols = x.variations.length ? x.variations.map(v => v.contenance).filter(Boolean) : x.contenances;
  if (vols.length) rows.push([vols.length > 1 ? 'Contenances' : 'Contenance', vols.join(', ')]);
  if (x.familles.length) rows.push(['Familles olfactives', x.familles.join(', ')]);
  if (x.genres.length) rows.push(['Genre', x.genres.join(', ')]);
  if (!rows.length) return null;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return { title: 'Caractéristiques', html: `<ul>${rows.map(([k, v]) => `<li><b>${esc(k)} :</b> ${esc(v)}</li>`).join('')}</ul>` };
}

// ---------------------------------------------------------------------------
// Matching et plan
// ---------------------------------------------------------------------------

function resolveBrand(x, dn) {
  if (!x.brandNames.length) return { brand: null, create: null, reason: 'aucune marque chez le fournisseur' };
  const wanted = normalize(x.brandNames[0]);
  const found = dn.brands.find(b => b.id === x.brandSlug || normalize(b.name) === wanted || normalize(b.id) === wanted);
  if (found) return { brand: found, create: null, reason: `marque existante « ${found.name} » (${found.id})` };
  const id = x.brandSlug || slugify(x.brandNames[0]);
  return {
    brand: { id, name: x.brandNames[0] },
    create: { id, name: x.brandNames[0], sort_order: Math.max(-1, ...dn.brands.map(b => b.sort_order ?? 0)) + 1, active: true },
    reason: `marque absente de Dar Nūr → création « ${x.brandNames[0]} » (${id})`,
  };
}

function matchProduct(x, brandId, dn) {
  const src = dn.sources || [];
  if (x.gtin) {
    const s = src.find(r => r.gtin === x.gtin && !r.variant_id);
    if (s) { const p = dn.products.find(q => q.id === s.product_id); if (p) return { product: p, reason: `GTIN ${x.gtin} déjà rattaché (product_sources)` }; }
  }
  const s2 = src.find(r => r.supplier_product_id === x.supplier_product_id && !r.variant_id);
  if (s2) { const p = dn.products.find(q => q.id === s2.product_id); if (p) return { product: p, reason: `identifiant fournisseur ${x.supplier_product_id} déjà rattaché (product_sources)` }; }

  const core = coreName(x.name, x.brandNames);
  const homonyms = [];
  for (const p of dn.products) {
    const pc = coreName(p.name, [p.brand || '', ...x.brandNames]);
    if (pc !== core || !core) continue;
    if (brandId && p.brand_slug === brandId) return { product: p, reason: `marque identique (${brandId}) + nom cœur identique « ${core} » (Dar Nūr : « ${p.name} »)`, homonyms };
    homonyms.push(p);
  }
  return { product: null, reason: 'aucun produit Dar Nūr de même marque avec ce nom', core, homonyms };
}

function chooseSlug(x, brandId, dn, plannedSlugs) {
  const taken = new Set(dn.products.map(p => p.slug));
  for (const s of plannedSlugs) taken.add(s);
  const base = slugify(x.name);
  const candidates = [base, brandId ? `${base}-${brandId}` : null].filter(Boolean);
  for (const c of candidates) {
    const dirExists = existsSync(path.join(ROOT, c));
    if (!taken.has(c) && !dirExists) return { slug: c, note: c === base ? null : `« ${base} » déjà pris (${taken.has(base) ? 'produit Dar Nūr' : 'dossier du dépôt'}) → suffixe marque` };
  }
  return { slug: null, note: `aucun slug libre parmi ${candidates.join(', ')}` };
}

function buildSourceRow(x, extra = {}) {
  return {
    supplier: SUPPLIER,
    supplier_product_id: x.supplier_product_id,
    supplier_url: x.supplier_url,
    supplier_sku: x.supplier_sku,
    gtin: x.gtin,
    supplier_regular_price: x.regular_price,
    supplier_price: x.price,
    supplier_on_sale: x.on_sale,
    supplier_in_stock: x.in_stock,
    supplier_stock_qty: x.stock_qty,
    supplier_stock_text: x.stock_text,
    purchase_price: null, // « prix d'achat à renseigner »
    supplier_modified_at: x.supplier_modified_at,
    last_synced_at: new Date().toISOString(),
    raw: x.raw,
    ...extra,
  };
}

function planProduct(x, dn, plannedSlugs, plannedBrands) {
  const item = { flora: x, warnings: [], decision: null };

  if (!x.category || !CATEGORY_MAP[x.category.slug]) {
    item.decision = 'ABANDON';
    item.warnings.push(`catégorie Flora « ${x.category?.name || '?'} » non prise en charge par le prototype`);
    return item;
  }
  item.category_id = CATEGORY_MAP[x.category.slug];

  const br = resolveBrand(x, dn);
  item.brand = br;
  if (br.create && !plannedBrands.some(b => b.id === br.create.id)) {
    br.create.sort_order += plannedBrands.length; // deux marques créées dans la même exécution → rangs distincts
    plannedBrands.push(br.create);
  }
  const brandId = br.brand ? br.brand.id : null;
  const brandName = br.brand ? br.brand.name : null;

  const m = matchProduct(x, brandId, dn);
  item.match = m;
  const floraPrice = x.variations.length ? Math.min(...x.variations.map(v => v.price).filter(v => v != null)) : x.price;
  item.floraPriceRounded = roundEuro(floraPrice);
  const tagline = buildTagline(x);
  const accordion = buildCharacteristicsAccordion(x);

  if (m.homonyms?.length) {
    for (const h of m.homonyms) item.warnings.push(`HOMONYME non fusionné : « ${h.name} » (${h.slug}, marque ${h.brand_slug || '—'}) ≠ ${brandId || 'sans marque'}`);
  }

  if (m.product) {
    const p = m.product;
    item.decision = 'PRODUIT EXISTANT';
    item.existing = { id: p.id, slug: p.slug, name: p.name, price_value: p.price_value, active: p.active, coming_soon: p.coming_soon, variants: (p.product_variants || []).length };
    const patch = {};
    const fills = [];
    const fillable = {
      tagline, description: x.description.paragraphs, composition: x.description.composition,
      volume: x.variations.length ? null : (x.contenances[0] || null),
    };
    for (const [k, v] of Object.entries(fillable)) {
      if (isEmpty(p[k]) && !isEmpty(v)) { patch[k] = v; fills.push(k); }
    }
    // Prix : alignement uniquement à la baisse.
    let priceNote;
    if ((p.product_variants || []).length || x.variations.length) {
      priceNote = 'produit à variantes d’un côté — prix non touché automatiquement';
      item.warnings.push(priceNote);
    } else if (item.floraPriceRounded != null && p.price_value != null && item.floraPriceRounded < Number(p.price_value)) {
      patch.price_value = item.floraPriceRounded;
      priceNote = `baisse ${fmt(p.price_value)} → ${fmt(item.floraPriceRounded)} (Flora ${fmt(floraPrice)} arrondi)`;
    } else if (item.floraPriceRounded != null && p.price_value != null) {
      priceNote = `Flora ${fmt(floraPrice)} → arrondi ${fmt(item.floraPriceRounded)} ≥ Dar Nūr ${fmt(p.price_value)} — prix Dar Nūr conservé`;
    } else {
      priceNote = 'prix Dar Nūr absent ou prix Flora inconnu — non touché';
    }
    item.priceNote = priceNote;
    item.patch = patch;
    item.fills = fills;
    item.imagesNote = isEmpty(p.images) ? 'aucune image Dar Nūr — les images Flora seraient ajoutées' : `${p.images.length} image(s) Dar Nūr conservée(s), images Flora non importées`;
    item.needImages = isEmpty(p.images);
    item.source = buildSourceRow(x, { product_id: p.id, variant_id: null });
    if (dn.sourcesAvailable) {
      const prev = dn.sources.find(r => r.product_id === p.id && !r.variant_id);
      item.sourceMode = prev ? 'mise à jour' : 'création';
    } else item.sourceMode = 'création (table non lisible en dry-run)';
    return item;
  }

  // Nouveau produit
  item.decision = 'NOUVEAU PRODUIT';
  const s = chooseSlug(x, brandId, dn, plannedSlugs);
  if (!s.slug) { item.decision = 'ABANDON'; item.warnings.push(s.note); return item; }
  if (s.note) item.warnings.push(s.note);
  plannedSlugs.push(s.slug);
  item.slug = s.slug;

  const row = {
    slug: s.slug,
    category_id: item.category_id,
    name: x.name,
    tagline,
    description: x.description.paragraphs,
    benefits: [],
    benefits_label: null,
    composition: x.description.composition,
    provenance: null,
    usage_advice: null,
    precautions: [],
    weight: null,
    volume: x.variations.length ? null : (x.contenances[0] || null),
    price_value: item.floraPriceRounded,
    variant_axes: x.variations.length ? ['contenance'] : [],
    images: [], // rempli après optimisation
    accordions: accordion ? [accordion] : [],
    active: false,       // brouillon : invisible tant qu'un administrateur ne l'active pas
    featured: false,
    sort_order: 0,
    brand: brandName,
    brand_slug: brandId,
  };
  item.row = row;
  item.variants = x.variations.map((v, i) => ({
    name: v.contenance || `Format ${i + 1}`,
    options: { contenance: v.contenance || `Format ${i + 1}` },
    price: roundEuro(v.price),
    sku: v.sku,
    sort_order: i,
    active: true,
    _flora: v,
  }));
  if (item.variants.length) row.price_value = Math.min(...item.variants.map(v => v.price));
  item.needImages = true;
  item.source = buildSourceRow(x, { variant_id: null });
  item.variantSources = x.variations.map(v => buildSourceRow(x, {
    variant_id: null, supplier_variant_id: v.supplier_variant_id, supplier_sku: v.sku,
    supplier_regular_price: v.regular_price, supplier_price: v.price, supplier_on_sale: v.on_sale,
    supplier_in_stock: v.in_stock, supplier_stock_qty: v.stock_qty, supplier_stock_text: v.stock_text, raw: v.raw,
  }));
  item.sourceMode = 'création';
  return item;
}

// ---------------------------------------------------------------------------
// Images : téléchargement, dédoublonnage, optimisation (Pillow)
// ---------------------------------------------------------------------------

async function downloadImages(item, workDir, excludedUrls) {
  const slug = item.slug || item.existing.slug;
  const dir = path.join(workDir, 'images', slug);
  const origDir = path.join(dir, 'orig');
  await mkdir(origDir, { recursive: true });
  const seenUrl = new Set();
  const seenHash = new Set();
  const downloaded = [];
  const skipped = [];
  // 1) Téléchargement de toutes les images distinctes (dédoublonnage par URL puis par contenu).
  for (const im of item.flora.images) {
    if (seenUrl.has(im.src)) { skipped.push({ src: im.src, reason: 'URL dupliquée' }); continue; }
    seenUrl.add(im.src);
    if (excludedUrls.has(im.src)) { skipped.push({ src: im.src, reason: 'exclue manuellement (--exclude-images)' }); continue; }
    if (/flora|logo/i.test(path.basename(im.src))) { skipped.push({ src: im.src, reason: 'nom de fichier fournisseur/logo' }); continue; }
    const res = await fetch(im.src, { headers: { 'User-Agent': USER_AGENT } });
    await sleep(Math.round(DELAY_MS / 2));
    if (!res.ok) { skipped.push({ src: im.src, reason: `HTTP ${res.status}` }); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = createHash('sha1').update(buf).digest('hex');
    if (seenHash.has(hash)) { skipped.push({ src: im.src, reason: 'contenu identique à une image déjà téléchargée' }); continue; }
    seenHash.add(hash);
    const ext = (path.extname(new URL(im.src).pathname) || '.img').toLowerCase();
    const origPath = path.join(origDir, `${downloaded.length + 1}${ext}`);
    await writeFile(origPath, buf);
    downloaded.push({ url: im.src, orig: origPath, bytes_in: buf.length });
  }
  // 2) Filigrane fournisseur : détection sur les originaux, exclusion automatique.
  const wm = downloaded.length ? await runWatermarkDetector(downloaded.map(d => d.orig)) : [];
  const clean = [];
  downloaded.forEach((d, i) => {
    const r = wm[i] || {};
    d.watermarkScore = r.score ?? null;
    if (r.error) { skipped.push({ src: d.url, reason: `détection filigrane impossible (${r.error})` }); return; }
    if (r.watermarked) { skipped.push({ src: d.url, reason: `filigrane fournisseur détecté (score ${r.score})` }); return; }
    if (r.score >= WATERMARK_SUSPECT) d.suspect = true;
    clean.push(d);
  });
  // 3) Sélection des premières images propres, dans l'ordre du fournisseur.
  const kept = clean.slice(0, MAX_IMAGES_PER_PRODUCT);
  for (const d of clean.slice(MAX_IMAGES_PER_PRODUCT)) skipped.push({ src: d.url, reason: `au-delà de ${MAX_IMAGES_PER_PRODUCT} images` });
  const jobs = kept.map((k, i) => ({ src: k.orig, dst: path.join(dir, `${slug}-${i + 1}.webp`), max_side: IMAGE_MAX_SIDE, quality: IMAGE_QUALITY }));
  const { results } = jobs.length ? await runOptimizer(jobs) : { results: [] };
  const images = results.map((r, i) => ({ ...kept[i], ...r, repoPath: `assets/produits-fournisseur/${slug}/${slug}-${i + 1}.webp` }));
  const failed = images.filter(r => !r.ok);
  if (failed.length) throw new Error(`Optimisation échouée pour ${slug} : ${failed.map(f => f.error).join(' | ')}`);
  return { images, skipped, dir };
}

function runPython(script, payload, label) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [script], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`${label} a échoué (${code}) : ${err}`));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`sortie de ${label} illisible : ${out} ${err}`)); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
const runOptimizer = (jobs, sheet) => runPython(OPTIMIZER, { jobs, sheet }, 'import-flora-images.py');
const runWatermarkDetector = files => runPython(WATERMARK_DETECTOR, { templates: WATERMARK_TEMPLATES, files, threshold: WATERMARK_THRESHOLD }, 'import-flora-watermark.py').then(r => r.results);

// Planche-contact de toutes les images retenues (contrôle visuel avant --apply).
async function buildContactSheet(plan, workDir) {
  const files = [], labels = [];
  for (const it of plan.items) for (const im of it.images?.images || []) { files.push(im.dst); labels.push(`${path.basename(im.dst)}${im.suspect ? ' ?' : ''} (${im.watermarkScore})`); }
  if (!files.length) return null;
  const { sheet } = await runOptimizer([], { files, labels, dst: path.join(workDir, 'contact-sheet.jpg') });
  return sheet;
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

function kb(n) { return `${(n / 1024).toFixed(0)} Ko`; }

function renderReport(plan, mode) {
  const L = [];
  L.push(`# Import Flora — ${mode} du ${new Date().toISOString()}`);
  L.push('');
  L.push(`Produits demandés : ${plan.items.length} · nouveaux : ${plan.items.filter(i => i.decision === 'NOUVEAU PRODUIT').length} · existants : ${plan.items.filter(i => i.decision === 'PRODUIT EXISTANT').length} · abandons : ${plan.items.filter(i => i.decision === 'ABANDON').length}`);
  L.push(`Table product_sources lisible : ${plan.sourcesAvailable ? 'oui' : 'non (migration non exécutée ou lecture anonyme — attendu en dry-run)'}`);
  if (plan.contactSheet) L.push(`Planche-contact des images retenues (à contrôler visuellement avant --apply) : ${plan.contactSheet}`);
  if (plan.brandsToCreate.length) L.push(`Marques à créer : ${plan.brandsToCreate.map(b => `${b.name} (${b.id})`).join(', ')}`);
  else L.push('Marques à créer : aucune');
  L.push('');
  let totalIn = 0, totalOut = 0;
  for (const it of plan.items) {
    const x = it.flora;
    L.push(`## ${x.name} — ${it.decision}`);
    L.push(`- Flora : ${x.supplier_url} · id ${x.supplier_product_id} · SKU ${x.supplier_sku || '—'} · GTIN ${x.gtin || '—'} · marque ${x.brandNames.join(', ') || '—'} · type ${x.type}`);
    L.push(`- Prix Flora : régulier ${fmt(x.regular_price)} · effectif ${fmt(x.price)}${x.on_sale ? ' (promo)' : ''} → arrondi ${fmt(it.floraPriceRounded)} · dispo ${x.in_stock ? 'oui' : 'NON'}${x.stock_text ? ` (${x.stock_text})` : ''}`);
    if (it.brand) L.push(`- Marque : ${it.brand.reason}`);
    if (it.match) L.push(`- Matching : ${it.match.reason}`);
    for (const w of it.warnings) L.push(`- ⚠ ${w}`);
    if (it.decision === 'PRODUIT EXISTANT') {
      const e = it.existing;
      L.push(`- Dar Nūr : \`${e.slug}\` (${e.id}) · prix ${fmt(e.price_value)} · active ${e.active} · coming_soon ${e.coming_soon} · ${e.variants} variante(s)`);
      L.push(`- Prix : ${it.priceNote}`);
      const keys = Object.keys(it.patch);
      if (keys.length) {
        L.push(`- **Champs qui seraient écrits (PATCH)** :`);
        for (const k of keys) L.push(`  - \`${k}\` : ${JSON.stringify(it.patch[k]).slice(0, 300)}`);
      } else L.push('- Aucun champ Dar Nūr modifié.');
      L.push(`- Images : ${it.imagesNote}`);
      L.push(`- Champs Dar Nūr non vides donc préservés : ${['name', 'tagline', 'description', 'composition', 'volume', 'images', 'benefits', 'usage_advice', 'precautions', 'coming_soon', 'brand'].filter(k => !isEmpty(it.match.product[k])).join(', ')}`);
    } else if (it.decision === 'NOUVEAU PRODUIT') {
      const r = it.row;
      L.push(`- Ligne \`products\` : slug \`${r.slug}\` · catégorie ${r.category_id} · marque ${r.brand} (${r.brand_slug}) · **active = ${r.active}** · prix ${fmt(r.price_value)} · volume ${r.volume || '—'} · axes ${JSON.stringify(r.variant_axes)}`);
      L.push(`  - tagline : ${r.tagline || '—'}`);
      L.push(`  - description : ${r.description.length} paragraphe(s) — « ${(r.description[0] || '').slice(0, 140)}… »`);
      L.push(`  - composition : ${r.composition || '—'}`);
      L.push(`  - accordéon : ${r.accordions.length ? r.accordions[0].html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '—'}`);
      L.push(`  - vides (non inventés) : benefits, provenance, usage_advice, precautions, weight`);
      if (it.variants.length) {
        L.push(`- Variantes (${it.variants.length}) :`);
        for (const v of it.variants) L.push(`  - ${v.name} · ${fmt(v.price)} (Flora ${fmt(v._flora.regular_price)} → ${fmt(v._flora.price)}${v._flora.on_sale ? ' promo' : ''}) · SKU ${v.sku || '—'} · dispo ${v._flora.in_stock ? 'oui' : 'NON'}${v._flora.stock_text ? ` (${v._flora.stock_text})` : ''}`);
      }
    }
    if (it.decision !== 'ABANDON') {
      const s = it.source;
      L.push(`- product_sources (${it.sourceMode}) : supplier=${s.supplier} · id=${s.supplier_product_id} · sku=${s.supplier_sku || '—'} · gtin=${s.gtin || '—'} · régulier ${fmt(s.supplier_regular_price)} · effectif ${fmt(s.supplier_price)} · promo ${s.supplier_on_sale} · dispo ${s.supplier_in_stock} · qté ${s.supplier_stock_qty ?? '—'} · purchase_price = NULL (à renseigner) · modifié chez Flora ${s.supplier_modified_at || '—'}${it.variantSources?.length ? ` · + ${it.variantSources.length} ligne(s) variante` : ''}`);
    }
    if (it.images) {
      const tin = it.images.images.reduce((a, b) => a + b.bytes_in, 0);
      const tout = it.images.images.reduce((a, b) => a + b.bytes_out, 0);
      totalIn += tin; totalOut += tout;
      L.push(`- Images retenues : ${it.images.images.length} (${kb(tin)} → ${kb(tout)})`);
      for (const im of it.images.images) L.push(`  - ${im.repoPath} : ${im.orig_width}×${im.orig_height} ${kb(im.bytes_in)} → ${im.width}×${im.height} ${kb(im.bytes_out)} · filigrane ${im.watermarkScore}${im.suspect ? ' (à vérifier)' : ''} ← ${path.basename(im.url)}`);
      for (const sk of it.images.skipped) L.push(`  - ignorée : ${path.basename(sk.src)} (${sk.reason})`);
    }
    const dropped = [...it.flora.description.dropped, ...it.flora.short.dropped];
    if (dropped.length) {
      L.push(`- Textes Flora écartés (${dropped.length}) :`);
      for (const d of dropped) L.push(`  - [${d.reason}] ${d.text.slice(0, 160)}`);
    }
    L.push('');
  }
  if (totalIn) L.push(`**Images, total : ${kb(totalIn)} → ${kb(totalOut)} (−${Math.round(100 - (totalOut / totalIn) * 100)} %)**`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Application et rollback
// ---------------------------------------------------------------------------

async function applyPlan(plan, creds, workDir) {
  const manifest = { createdBrands: [], createdProducts: [], createdVariants: [], createdSources: [], updatedSources: [], patchedProducts: [], copiedImageDirs: [], startedAt: new Date().toISOString() };
  const manifestPath = path.join(workDir, 'apply-manifest.json');
  const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // Sauvegarde des lignes existantes concernées (produits + variantes + sources).
  const existingIds = plan.items.filter(i => i.decision === 'PRODUIT EXISTANT').map(i => i.existing.id);
  const backup = { products: [], sources: [] };
  if (existingIds.length) {
    backup.products = await sbGet(creds, `products?select=*,product_variants(*)&id=in.(${existingIds.join(',')})`);
    backup.sources = await sbGet(creds, `product_sources?select=*&product_id=in.(${existingIds.join(',')})`);
  }
  await writeFile(path.join(workDir, 'backup-before-apply.json'), JSON.stringify(backup, null, 2));
  // Instantané (id, slug, updated_at) de TOUS les produits : permet de prouver
  // après coup qu'aucune ligne hors périmètre n'a été touchée (--verify).
  const snapshot = await sbGet(creds, 'products?select=id,slug,updated_at&order=slug.asc');
  await writeFile(path.join(workDir, 'snapshot-all-products-before.json'), JSON.stringify(snapshot, null, 2));
  log(`Sauvegarde écrite : ${existingIds.length} produit(s) existant(s), ${backup.sources.length} source(s).`);

  try {
    for (const b of plan.brandsToCreate) {
      const [row] = await sbWrite(creds, 'POST', 'brands', b);
      manifest.createdBrands.push(row.id); await save();
      log(`+ marque ${row.name} (${row.id})`);
    }
    for (const it of plan.items) {
      if (it.decision === 'NOUVEAU PRODUIT') {
        const row = { ...it.row, images: it.images.images.map(im => im.repoPath) };
        assertNoSupplierMention(row, `produit ${row.slug}`);
        const [created] = await sbWrite(creds, 'POST', 'products', row);
        manifest.createdProducts.push({ id: created.id, slug: created.slug }); await save();
        log(`+ produit ${created.slug} (${created.id}) active=${created.active}`);
        const variantIds = [];
        for (const v of it.variants) {
          const { _flora, ...vrow } = v;
          const [cv] = await sbWrite(creds, 'POST', 'product_variants', { ...vrow, product_id: created.id });
          variantIds.push(cv.id); manifest.createdVariants.push(cv.id); await save();
          log(`  + variante ${cv.name} (${cv.id})`);
        }
        const [cs] = await sbWrite(creds, 'POST', 'product_sources', { ...it.source, product_id: created.id });
        manifest.createdSources.push(cs.id); await save();
        for (let i = 0; i < it.variantSources.length; i++) {
          const [cvs] = await sbWrite(creds, 'POST', 'product_sources', { ...it.variantSources[i], product_id: created.id, variant_id: variantIds[i] });
          manifest.createdSources.push(cvs.id); await save();
        }
        const dst = path.join(ASSETS_DIR, created.slug);
        if (existsSync(dst)) throw new Error(`Le dossier ${dst} existe déjà — arrêt pour ne rien écraser.`);
        await mkdir(dst, { recursive: true });
        for (const im of it.images.images) await copyFile(im.dst, path.join(dst, path.basename(im.dst)));
        manifest.copiedImageDirs.push(dst); await save();
        log(`  + ${it.images.images.length} image(s) copiée(s) dans assets/produits-fournisseur/${created.slug}/`);
      } else if (it.decision === 'PRODUIT EXISTANT') {
        const patch = { ...it.patch };
        if (it.needImages && it.images) {
          patch.images = it.images.images.map(im => im.repoPath);
          const dst = path.join(ASSETS_DIR, it.existing.slug);
          if (existsSync(dst)) throw new Error(`Le dossier ${dst} existe déjà — arrêt pour ne rien écraser.`);
          await mkdir(dst, { recursive: true });
          for (const im of it.images.images) await copyFile(im.dst, path.join(dst, path.basename(im.dst)));
          manifest.copiedImageDirs.push(dst); await save();
        }
        if (Object.keys(patch).length) {
          assertNoSupplierMention(patch, `PATCH ${it.existing.slug}`);
          await sbWrite(creds, 'PATCH', `products?id=eq.${it.existing.id}`, patch);
          manifest.patchedProducts.push({ id: it.existing.id, slug: it.existing.slug, fields: Object.keys(patch) }); await save();
          log(`~ produit ${it.existing.slug} : ${Object.keys(patch).join(', ')}`);
        } else log(`= produit ${it.existing.slug} : aucun champ modifié`);
        const prev = backup.sources.find(r => r.product_id === it.existing.id && !r.variant_id && r.supplier === SUPPLIER);
        const src = { ...it.source, product_id: it.existing.id };
        if (prev) {
          await sbWrite(creds, 'PATCH', `product_sources?id=eq.${prev.id}`, src);
          manifest.updatedSources.push(prev.id); await save();
        } else {
          const [cs] = await sbWrite(creds, 'POST', 'product_sources', src);
          manifest.createdSources.push(cs.id); await save();
        }
      }
    }
    manifest.finishedAt = new Date().toISOString();
    await save();
    log(`\n✔ Application terminée. Manifeste : ${manifestPath}`);
    log(`  Rollback possible : node scripts/import-flora.mjs --rollback "${workDir}"`);
  } catch (e) {
    manifest.error = e.message; await save();
    fail(`Application interrompue : ${e.message}\n  Ce qui a déjà été écrit est listé dans ${manifestPath} — rollback : node scripts/import-flora.mjs --rollback "${workDir}"`);
  }
}

async function rollback(workDir, creds) {
  const manifest = JSON.parse(await readFile(path.join(workDir, 'apply-manifest.json'), 'utf8'));
  const backup = JSON.parse(await readFile(path.join(workDir, 'backup-before-apply.json'), 'utf8'));
  // Sources créées, puis variantes, puis produits (les FK cascade couvrent le reste), puis marques.
  for (const id of manifest.createdSources) { await sbWrite(creds, 'DELETE', `product_sources?id=eq.${id}`); log(`- source ${id}`); }
  for (const id of manifest.createdVariants) { await sbWrite(creds, 'DELETE', `product_variants?id=eq.${id}`); log(`- variante ${id}`); }
  for (const p of manifest.createdProducts) { await sbWrite(creds, 'DELETE', `products?id=eq.${p.id}`); log(`- produit ${p.slug}`); }
  for (const id of manifest.createdBrands) { await sbWrite(creds, 'DELETE', `brands?id=eq.${id}`); log(`- marque ${id}`); }
  // Lignes existantes : restauration exacte des champs modifiés depuis la sauvegarde.
  for (const p of manifest.patchedProducts) {
    const before = backup.products.find(b => b.id === p.id);
    if (!before) { log(`! pas de sauvegarde pour ${p.slug}, champs ${p.fields.join(', ')} non restaurés`); continue; }
    const restore = {};
    for (const f of p.fields) restore[f] = before[f];
    await sbWrite(creds, 'PATCH', `products?id=eq.${p.id}`, restore);
    log(`~ produit ${p.slug} restauré : ${p.fields.join(', ')}`);
  }
  for (const id of manifest.updatedSources) {
    const before = backup.sources.find(s => s.id === id);
    if (before) { const { id: _i, created_at, updated_at, ...rest } = before; await sbWrite(creds, 'PATCH', `product_sources?id=eq.${id}`, rest); log(`~ source ${id} restaurée`); }
  }
  for (const dir of manifest.copiedImageDirs) { await rm(dir, { recursive: true, force: true }); log(`- dossier ${path.relative(ROOT, dir)}`); }
  log('\n✔ Rollback terminé.');
}

// ---------------------------------------------------------------------------
// Vérification post-import (--verify <dossier d'application>)
// ---------------------------------------------------------------------------
// Relit Supabase avec la session admin et compare l'état réel au plan du
// dry-run et au manifeste : prix, brouillons inactifs, variantes, marques,
// product_sources (purchase_price NULL), coming_soon intact, aucune autre ligne
// modifiée (instantané pris juste avant l'écriture), aucune mention « Flora »
// dans les champs publics, table product_sources illisible en anonyme.
// Écrit <dossier>/verify-report.md ; n'affiche jamais de secret.

async function verifyApply(workDir, creds, anonCreds) {
  const plan = JSON.parse(await readFile(path.join(workDir, 'plan.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(workDir, 'apply-manifest.json'), 'utf8'));
  const snapshot = JSON.parse(await readFile(path.join(workDir, 'snapshot-all-products-before.json'), 'utf8'));
  const L = [];
  let ok = 0, ko = 0;
  const check = (cond, label, detail = '') => { (cond ? ok++ : ko++); L.push(`- ${cond ? '✔' : '✖'} ${label}${detail ? ` — ${detail}` : ''}`); };

  const all = await sbGet(creds, 'products?select=id,slug,name,price_value,active,coming_soon,brand,brand_slug,updated_at,volume,images,tagline,description,composition,benefits,accordions,variant_axes,product_variants(*)&order=slug.asc');
  const bySlug = new Map(all.map(p => [p.slug, p]));
  const brands = await sbGet(creds, 'brands?select=*');
  const sources = await sbGet(creds, `product_sources?select=*&supplier=eq.${SUPPLIER}`);

  L.push(`# Vérification post-import — ${new Date().toISOString()}`, '', `Dossier : ${workDir}`, '');
  L.push('## Produits existants');
  for (const it of plan.items.filter(i => i.decision === 'PRODUIT EXISTANT')) {
    const p = bySlug.get(it.existing.slug);
    const expected = it.patch?.price_value ?? it.existing.price_value;
    check(p && Number(p.price_value) === Number(expected), `${it.existing.slug} : prix ${fmt(p?.price_value)}`, `attendu ${fmt(expected)}`);
    check(p && p.coming_soon === it.existing.coming_soon, `${it.existing.slug} : coming_soon inchangé (${p?.coming_soon})`);
    check(p && p.active === it.existing.active, `${it.existing.slug} : active inchangé (${p?.active})`);
    const before = snapshot.find(s => s.id === it.existing.id);
    const fields = Object.keys(it.patch || {});
    check(fields.length === 0 || (p && p.updated_at !== before?.updated_at), `${it.existing.slug} : champs écrits = ${fields.length ? fields.join(', ') : 'aucun'}`);
    if (fields.length === 0) check(p && p.updated_at === before?.updated_at, `${it.existing.slug} : updated_at identique à l'instantané (aucune écriture)`);
  }
  L.push('', '## Nouveaux produits (brouillons)');
  for (const it of plan.items.filter(i => i.decision === 'NOUVEAU PRODUIT')) {
    const p = bySlug.get(it.slug);
    check(!!p, `${it.slug} existe`);
    if (!p) continue;
    check(p.active === false, `${it.slug} : active = ${p.active}`);
    check(Number(p.price_value) === Number(it.row.price_value), `${it.slug} : prix ${fmt(p.price_value)}`, `attendu ${fmt(it.row.price_value)}`);
    check(p.brand_slug === it.row.brand_slug && p.brand === it.row.brand, `${it.slug} : marque ${p.brand} (${p.brand_slug})`);
    check(p.coming_soon === false, `${it.slug} : coming_soon = ${p.coming_soon} (non piloté par le stock fournisseur)`);
    const imgs = it.images?.images?.map(i => i.repoPath) || [];
    check(JSON.stringify(p.images) === JSON.stringify(imgs), `${it.slug} : ${p.images.length} image(s)`, `attendu ${imgs.length}`);
    for (const rp of p.images) check(existsSync(path.join(ROOT, rp)), `${it.slug} : fichier ${rp} présent`);
    const vars = (p.product_variants || []).sort((a, b) => a.sort_order - b.sort_order);
    check(vars.length === (it.variants || []).length, `${it.slug} : ${vars.length} variante(s)`, `attendu ${(it.variants || []).length}`);
    (it.variants || []).forEach((v, i) => {
      const r = vars[i];
      check(r && r.name === v.name && Number(r.price) === Number(v.price) && r.sku === v.sku && JSON.stringify(r.options) === JSON.stringify(v.options) && r.active === true,
        `${it.slug} · variante ${v.name}`, r ? `${fmt(r.price)} · SKU ${r.sku} · options ${JSON.stringify(r.options)}` : 'absente');
    });
    check(!SUPPLIER_NAME_RE.test(JSON.stringify({ n: p.name, t: p.tagline, d: p.description, c: p.composition, a: p.accordions, b: p.benefits, i: p.images })), `${it.slug} : aucune mention « Flora » dans les champs publics`);
  }
  L.push('', '## Marques');
  for (const b of plan.brandsToCreate) {
    const rows = brands.filter(x => x.id === b.id || normalize(x.name) === normalize(b.name));
    check(rows.length === 1, `${b.name} : ${rows.length} ligne(s)`, rows.map(r => `${r.id} active=${r.active} sort_order=${r.sort_order}`).join(' ; '));
  }
  const lb = all.filter(p => normalize(p.name) === 'liquid brun');
  check(lb.length === 2 && new Set(lb.map(p => p.brand_slug)).size === 2 && new Set(lb.map(p => p.slug)).size === 2, `Liquid Brun : ${lb.length} produits distincts`, lb.map(p => `${p.slug} (${p.brand_slug}, ${p.id})`).join(' ; '));

  L.push('', '## product_sources');
  for (const it of plan.items.filter(i => i.decision !== 'ABANDON')) {
    const slug = it.slug || it.existing.slug;
    const p = bySlug.get(slug);
    const rows = sources.filter(s => s.product_id === p?.id);
    const prod = rows.find(s => !s.variant_id);
    check(!!prod && prod.supplier_product_id === it.flora.supplier_product_id, `${slug} : ligne produit (id fournisseur ${prod?.supplier_product_id})`);
    if (prod) {
      check(prod.purchase_price === null, `${slug} : purchase_price = ${prod.purchase_price} (à renseigner)`);
      check(Number(prod.supplier_price) === Number(it.flora.price) && Number(prod.supplier_regular_price) === Number(it.flora.regular_price), `${slug} : prix fournisseur ${fmt(prod.supplier_price)} (régulier ${fmt(prod.supplier_regular_price)})`);
      check(prod.supplier_in_stock === it.flora.in_stock && (prod.supplier_stock_qty ?? null) === (it.flora.stock_qty ?? null), `${slug} : dispo ${prod.supplier_in_stock}, qté ${prod.supplier_stock_qty ?? '—'}`);
      check((prod.gtin ?? null) === (it.flora.gtin ?? null), `${slug} : gtin ${prod.gtin ?? '—'}`);
    }
    const vrows = rows.filter(s => s.variant_id);
    check(vrows.length === (it.variantSources || []).length, `${slug} : ${vrows.length} ligne(s) variante`, `attendu ${(it.variantSources || []).length}`);
    for (const vr of vrows) check(vr.purchase_price === null && (p.product_variants || []).some(v => v.id === vr.variant_id), `${slug} · source variante ${vr.supplier_variant_id} → variante ${vr.variant_id} · purchase_price NULL`);
  }
  check(sources.length === manifest.createdSources.length + manifest.updatedSources.length, `product_sources : ${sources.length} ligne(s) au total`, `manifeste : ${manifest.createdSources.length} créées + ${manifest.updatedSources.length} mises à jour`);

  L.push('', '## Aucune autre ligne modifiée');
  const touched = new Set([...manifest.createdProducts.map(p => p.id), ...manifest.patchedProducts.map(p => p.id)]);
  const changed = all.filter(p => !touched.has(p.id)).filter(p => { const s = snapshot.find(x => x.id === p.id); return !s || s.updated_at !== p.updated_at; });
  check(changed.length === 0, `produits hors périmètre avec updated_at modifié : ${changed.length}`, changed.map(p => p.slug).join(', '));
  check(all.length === snapshot.length + manifest.createdProducts.length, `nombre de produits : ${all.length}`, `instantané ${snapshot.length} + ${manifest.createdProducts.length} créés`);

  L.push('', '## Confidentialité (lecture anonyme)');
  const anonRes = await fetch(`${anonCreds.url}/rest/v1/product_sources?select=*&limit=1`, { headers: { apikey: anonCreds.key, Authorization: `Bearer ${anonCreds.key}` } });
  const anonBody = await anonRes.text();
  check(anonRes.status === 401 || anonRes.status === 403 || (anonRes.status === 200 && anonBody.trim() === '[]'), `anon → product_sources : HTTP ${anonRes.status}`, anonBody.slice(0, 120));
  check(anonRes.status !== 404 && !/PGRST205/.test(anonBody), 'la table existe (pas de PGRST205)');
  const anonInactive = await fetch(`${anonCreds.url}/rest/v1/products?select=slug&active=eq.false`, { headers: { apikey: anonCreds.key, Authorization: `Bearer ${anonCreds.key}` } });
  const inactiveBody = await anonInactive.text();
  check(anonInactive.status === 200 && inactiveBody.trim() === '[]', `anon → produits inactifs : ${inactiveBody.slice(0, 80)} (attendu [])`);

  L.push('', `**${ok} vérification(s) réussie(s), ${ko} en échec.**`);
  const report = L.join('\n');
  await writeFile(path.join(workDir, 'verify-report.md'), report);
  log(report);
  if (ko) fail(`${ko} vérification(s) en échec — voir ${path.join(workDir, 'verify-report.md')}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const creds0 = await loadSupabaseCreds();

  if (args.rollback) {
    const creds = await adminLogin(creds0, args.auth);
    await rollback(path.resolve(args.rollback), creds);
    return;
  }
  if (args.verify) {
    const creds = await adminLogin(creds0, args.auth);
    await verifyApply(path.resolve(args.verify), creds, creds0);
    return;
  }
  if (!args.ids.length) fail('Aucun identifiant : --ids 65197,65693,…  (jamais le catalogue entier)');
  if (args.ids.length > 20) fail(`${args.ids.length} identifiants : ce prototype refuse plus de 20 produits par exécution.`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const workDir = path.resolve(args.work || path.join(ROOT, 'backups', 'flora-import', `${args.apply ? 'apply' : 'dry-run'}-${stamp}`));
  await mkdir(workDir, { recursive: true });
  log(`Mode : ${args.apply ? 'APPLICATION (écriture Supabase + assets/)' : 'DRY-RUN (aucune écriture)'} · dossier : ${workDir}`);

  let creds = creds0;
  if (args.apply) {
    creds = await adminLogin(creds0, args.auth);
    try { await sbGet(creds, 'product_sources?select=id&limit=1'); }
    catch (e) { fail(`product_sources inaccessible avec la session admin — exécuter supabase/sql/product_sources.sql d'abord. (${e.message})`); }
  }

  log('Lecture Dar Nūr (Supabase)…');
  const dn = await loadDarNur(creds);
  log(`  ${dn.products.length} produits lisibles, ${dn.brands.length} marques, ${dn.categories.length} catégories, sources ${dn.sourcesAvailable ? dn.sources.length : 'non lisibles'}`);
  if (!args.apply) log('  (lecture anonyme : seuls les produits actifs sont visibles — les brouillons inactifs seront revérifiés à l’application)');

  const plan = { items: [], brandsToCreate: [], sourcesAvailable: dn.sourcesAvailable, ids: args.ids };
  const plannedSlugs = [];
  for (const id of args.ids) {
    log(`Flora ${id}…`);
    const fetched = await fetchFloraProduct(id);
    const x = extract(fetched);
    log(`  ${x.name} · ${x.brandNames.join(', ') || 'sans marque'} · ${x.type} · ${fmt(x.price)} · ${x.in_stock ? 'dispo' : 'RUPTURE'}`);
    const item = planProduct(x, dn, plannedSlugs, plan.brandsToCreate);
    if (item.needImages && item.decision !== 'ABANDON') {
      log('  images…');
      item.images = await downloadImages(item, workDir, new Set(args.excludeImages));
    }
    plan.items.push(item);
  }

  plan.contactSheet = await buildContactSheet(plan, workDir);
  const report = renderReport(plan, args.apply ? 'application' : 'dry-run');
  await writeFile(path.join(workDir, 'report.md'), report);
  await writeFile(path.join(workDir, 'plan.json'), JSON.stringify(plan, (k, v) => (k === 'raw' ? undefined : v), 2));
  log('\n' + report);
  log(`\nRapport : ${path.join(workDir, 'report.md')}`);

  // Garde-fous avant écriture : jamais « Flora » dans un champ écrit, nouveaux produits inactifs.
  for (const it of plan.items) {
    if (it.row) { assertNoSupplierMention({ ...it.row, images: [] }, `produit ${it.row.slug}`); if (it.row.active !== false) fail(`${it.row.slug} ne serait pas créé inactif.`); }
    if (it.patch) assertNoSupplierMention(it.patch, `PATCH ${it.existing.slug}`);
  }
  log(`✔ Garde-fous : aucune mention fournisseur dans les champs publics ; ${plan.items.filter(i => i.row).length} nouveau(x) produit(s) tous active=false.`);

  if (!args.apply) { log('\nDry-run terminé : rien n’a été écrit dans Supabase ni dans assets/.'); return; }
  await applyPlan(plan, creds, workDir);
}

main().catch(e => fail(e.stack || e.message));
