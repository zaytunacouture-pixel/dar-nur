#!/usr/bin/env node
// Génère l'index de la recherche publique (data/search-index.json) à partir de
// Supabase — un seul fichier statique, compact, servi par GitHub Pages et lu
// par js/search.js au premier usage de la recherche (jamais au chargement).
//
// Pourquoi un fichier généré plutôt qu'une requête Supabase à chaque frappe :
//   - la recherche doit tolérer les fautes (« latafa » → Lattafa), ce qui exige
//     un rapprochement approximatif que PostgREST ne sait pas faire sans
//     extension (pg_trgm) ni migration — hors périmètre ;
//   - l'index est produit par le même workflow que les fiches /{slug}/ : un
//     résultat de recherche pointe donc toujours vers une page qui existe,
//     jamais vers un produit publié en base mais pas encore généré ;
//   - zéro requête réseau à la frappe, un seul fichier mis en cache HTTP.
//
// Contenu par produit : slug, nom, marque, catégorie, tagline, contenance,
// prix, image principale, et un « sac de mots » normalisé (description,
// atouts, composition/notes, provenance, noms de variantes) dédoublonné pour
// rester léger. Aucune donnée inventée : un champ vide en base est absent ici.
//
// Idempotent et déterministe : aucune date, tri stable (sort_order puis slug).
// Deux exécutions sans changement de données produisent un fichier identique,
// ce qui permet au workflow de ne committer que si le contenu a réellement
// changé.
//
// Garde-fous (aucun octet écrit dans ces cas) : Supabase injoignable ou en
// erreur, 0 produit actif, deux produits actifs partageant un slug.
//
// Source des identifiants : js/config.js (clé anon publique, lecture seule).
// Aucune dépendance npm : fetch natif de Node (>=18).

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const CONFIG_PATH = new URL('js/config.js', ROOT);
const OUTPUT_PATH = new URL('data/search-index.json', ROOT);
const PAGE_SIZE = 1000; // limite de lignes par réponse PostgREST (max_rows Supabase)

function log(msg) { console.log(msg); }

async function loadSupabaseCreds() {
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const urlMatch = raw.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
  const keyMatch = raw.match(/SUPABASE_ANON\s*=\s*'([^']+)'/);
  if (!urlMatch || !keyMatch) {
    throw new Error('Impossible de lire SUPABASE_URL/SUPABASE_ANON depuis js/config.js');
  }
  return { url: urlMatch[1], key: keyMatch[1] };
}

async function fetchJson(url, creds, range) {
  const headers = { apikey: creds.key, Authorization: `Bearer ${creds.key}` };
  if (range) headers.Range = range;
  const res = await fetch(url, { headers });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Supabase a répondu ${res.status} ${res.statusText} (${url})`);
  }
  return res.json();
}

// Pagination par en-tête Range : les autres générateurs lisent tout d'un coup,
// ce qui plafonne silencieusement à 1000 lignes. L'index doit suivre un
// catalogue de plusieurs milliers de produits, donc on boucle jusqu'à une
// page incomplète.
async function fetchActiveProducts(creds) {
  const select = [
    'slug', 'name', 'brand', 'brand_slug', 'category_id', 'tagline', 'description',
    'benefits', 'composition', 'provenance', 'weight', 'volume', 'price_value',
    'images', 'coming_soon', 'sort_order', 'product_variants(name,active)',
  ].join(',');
  const base = `${creds.url}/rest/v1/products?select=${select}&active=eq.true&order=sort_order.asc,slug.asc`;
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await fetchJson(base, creds, `${from}-${from + PAGE_SIZE - 1}`);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}

async function fetchCategories(creds) {
  const url = `${creds.url}/rest/v1/categories?select=id,label,filter_label&active=eq.true&order=sort_order.asc`;
  return fetchJson(url, creds);
}

// Normalisation partagée avec js/search.js (même contrat, dupliqué
// volontairement — aucun import entre le runtime navigateur et ce script) :
// minuscules, accents retirés, tout ce qui n'est pas lettre/chiffre devient
// un espace.
function normalize(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Mots vides du français : ils n'aident jamais à retrouver un produit et
// représenteraient une part notable du sac de mots.
const STOPWORDS = new Set(`
  le la les un une des du de d l et ou en au aux a à ce cet cette ces se sa son
  ses sur sous dans par pour avec sans est sont ete été etre être il elle ils
  elles on nous vous ne pas plus tres très tout tous toute toutes qui que quoi
  dont ou où mais donc car ni ainsi aussi comme afin entre vers chez leur leurs
  notre nos votre vos mon ma mes ton ta tes lui eux y
`.split(/\s+/).filter(Boolean));

function bagOfWords(parts) {
  const seen = new Set();
  for (const part of parts) {
    for (const tok of normalize(part).split(' ')) {
      if (tok.length < 2 || STOPWORDS.has(tok)) continue;
      seen.add(tok);
    }
  }
  return Array.from(seen).join(' ');
}

// Même convention que imgUrl() de js/cart.js : URL absolue conservée, chemin
// relatif au dépôt ("assets/...") rendu absolu depuis la racine. Une image du
// bucket Supabase est stockée relative à `imgBase` pour ne pas répéter ~80
// caractères par produit.
function compactImage(src, imgBase) {
  if (!src) return undefined;
  if (src.startsWith(imgBase)) return src.slice(imgBase.length);
  if (/^https?:\/\//i.test(src) || src.charAt(0) === '/') return src;
  return '/' + src.replace(/^\.\//, '').replace(/^\.\.\//, '');
}

function buildItem(p, imgBase) {
  const variantNames = (p.product_variants || [])
    .filter(v => v.active !== false && v.name)
    .map(v => v.name);

  const item = { s: p.slug, n: p.name, c: p.category_id };
  if (p.brand) item.b = p.brand;
  if (p.tagline) item.t = p.tagline;
  const contenance = p.volume || p.weight;
  if (contenance) item.v = contenance;
  if (p.price_value != null && Number.isFinite(Number(p.price_value))) item.p = Number(p.price_value);
  const image = compactImage((p.images || [])[0], imgBase);
  if (image) item.i = image;
  if (p.coming_soon === true) item.o = 1;

  const words = bagOfWords([
    ...(p.description || []),
    ...(p.benefits || []),
    p.composition,
    p.provenance,
    p.brand_slug,
    ...variantNames,
  ]);
  if (words) item.k = words;
  return item;
}

function serialize(index) {
  // Un produit par ligne : diffs Git lisibles, fichier compact malgré tout.
  const head = JSON.stringify({ v: index.v, imgBase: index.imgBase, cats: index.cats });
  const items = index.items.map(it => '  ' + JSON.stringify(it)).join(',\n');
  return head.slice(0, -1) + ',"items":[\n' + items + '\n]}\n';
}

async function main() {
  const creds = await loadSupabaseCreds();
  const imgBase = `${creds.url}/storage/v1/object/public/product-images/`;

  const [products, categories] = await Promise.all([
    fetchActiveProducts(creds),
    fetchCategories(creds),
  ]);

  if (!products.length) {
    throw new Error('0 produit actif retourné par Supabase — refus de publier un index vide.');
  }
  const seen = new Set();
  for (const p of products) {
    if (seen.has(p.slug)) throw new Error(`Deux produits actifs partagent le slug « ${p.slug} ».`);
    seen.add(p.slug);
  }

  const cats = {};
  for (const c of categories) cats[c.id] = { l: c.label, f: c.filter_label };

  const index = {
    v: 1,
    imgBase,
    cats,
    items: products.map(p => buildItem(p, imgBase)),
  };

  const next = serialize(index);
  let previous = null;
  try { previous = await readFile(OUTPUT_PATH, 'utf8'); } catch { /* première génération */ }

  if (previous === next) {
    log(`✓ data/search-index.json inchangé (${products.length} produits, ${Buffer.byteLength(next)} octets).`);
    return;
  }
  await writeFile(OUTPUT_PATH, next, 'utf8');
  log(`✓ data/search-index.json écrit : ${products.length} produits, ${Object.keys(cats).length} catégories, ${Buffer.byteLength(next)} octets.`);
}

main().catch(err => {
  console.error(`::error::${err.message}`);
  process.exitCode = 1;
});
