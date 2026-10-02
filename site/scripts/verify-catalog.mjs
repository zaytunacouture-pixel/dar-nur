#!/usr/bin/env node
/**
 * Contrôles de DONNÉES des pages catalogue (étape 7), après `astro build`.
 *
 * Recalcule INDÉPENDAMMENT (requêtes et logique propres, sans réutiliser src/lib) ce que
 * chaque page devrait contenir d'après Supabase (lecture publique), puis le compare au
 * HTML de dist/. Échoue (code 1) au moindre écart.
 *
 *  1. Chaque collection publiée a un chemin unique et une page générée.
 *  2. Chaque produit publié a exactement une collection principale, publiée.
 *  3. Aucun brouillon : toute carte rendue est un produit `published`.
 *  4. Aucun orphelin : chaque produit publié figure sur la page de sa collection principale.
 *  5. Nombre et liste des produits de chaque page = Supabase (collection + descendantes).
 *  6. Pages marque : présence et indexabilité conformes à la règle (≥ N modèles + description).
 *  7. Liens internes (menu, footer, fil d'Ariane, puces, cartes de collection, maillage) :
 *     chacun mène à une page de dist/ ; les liens produit visent un produit publié.
 *  8. Aucune page indexable vide ; JSON-LD présent et cohérent (BreadcrumbList, ItemList).
 *
 * Réseau : lecture publique Supabase (clé « publishable »), comme le build.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const errors = [];
const notes = [];
const fail = (message) => errors.push(message);

/* ── Configuration (variables d'environnement, sinon site/.env) ─────────── */
function env(name) {
  if (process.env[name]) return process.env[name];
  const file = join(root, '.env');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}
const SUPABASE_URL = env('SUPABASE_URL');
const KEY = env('SUPABASE_ANON_KEY');
if (!SUPABASE_URL || !KEY?.startsWith('sb_publishable_')) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY (publishable) requis pour les contrôles catalogue.');
  process.exit(1);
}
if (!existsSync(dist)) {
  console.error('dist/ absent : lancer `npm run build` avant `npm run verify:catalog`.');
  process.exit(1);
}

async function rest(table, params) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!response.ok) throw new Error(`${table} : HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

/* ── Données de référence ────────────────────────────────────────────────── */
const [collections, products, memberships, brands, settings] = await Promise.all([
  rest('collections', { select: 'id,slug,path,parent_id,type,is_indexable', status: 'eq.published' }),
  rest('products', { select: 'slug,status,brand_slug', status: 'eq.published' }),
  rest('product_collections', { select: 'role,products!inner(slug,status),collections!inner(slug,status)' }),
  rest('brands', { select: 'id,name,description', active: 'eq.true' }),
  rest('settings', { select: 'key,value' }),
]);

const published = new Set(products.map((p) => p.slug));
const pages = collections.filter((c) => c.path && !['filter', 'group'].includes(c.type));
const byId = new Map(collections.map((c) => [c.id, c]));

// 1. Chemins uniques.
const seenPaths = new Map();
for (const c of pages) {
  if (seenPaths.has(c.path)) fail(`chemin ${c.path} partagé par ${seenPaths.get(c.path)} et ${c.slug}`);
  seenPaths.set(c.path, c.slug);
}

// 2. Une principale publiée par produit publié.
const links = memberships.filter(
  (m) => m.products.status === 'published' && m.collections.status === 'published',
);
const primaryOf = new Map();
for (const m of links.filter((m) => m.role === 'primary')) {
  if (primaryOf.has(m.products.slug)) fail(`${m.products.slug} : plusieurs collections principales`);
  primaryOf.set(m.products.slug, m.collections.slug);
}
for (const slug of published)
  if (!primaryOf.has(slug)) fail(`${slug} : aucune collection principale publiée`);

// Descendance (logique propre : parent_id, sans passer par src/lib).
const descendants = (collection) => {
  const out = [collection.slug];
  for (const child of collections.filter((c) => c.parent_id === collection.id))
    out.push(...descendants(child));
  return out;
};
const membersOf = (collection) => {
  const scope = new Set(descendants(collection));
  return new Set(links.filter((m) => scope.has(m.collections.slug)).map((m) => m.products.slug));
};

/* ── Lecture du HTML généré ──────────────────────────────────────────────── */
const posix = (p) => p.split(sep).join('/');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
const routeOf = (file) => {
  const rel = posix(relative(dist, file));
  return rel === 'index.html'
    ? '/'
    : rel.endsWith('/index.html')
      ? `/${rel.slice(0, -'index.html'.length)}`
      : `/${rel}`;
};
const routes = new Set(htmlFiles.map(routeOf));
const read = (path) => {
  const file = join(dist, path, 'index.html');
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};
const cardSlugs = (html) =>
  [...html.matchAll(/class="dn-card__link[^"]*" href="\/([^"/]+)\/"/g)].map((m) => m[1]);
const attr = (html, name) => new RegExp(`${name}="([^"]*)"`).exec(html)?.[1];

// 3, 4, 5. Contenu de chaque page.
let checkedPages = 0;
const shownOnPrimary = new Set();
for (const collection of pages) {
  const html = read(collection.path);
  if (!html) {
    fail(`${collection.path} : page absente de dist/`);
    continue;
  }
  checkedPages += 1;
  const expected = membersOf(collection);
  const productCount = Number(attr(html, 'data-dn-products'));
  if (productCount !== expected.size)
    fail(`${collection.path} : ${productCount} produits annoncés, ${expected.size} dans Supabase`);
  if (collection.type === 'universe') continue; // une page univers oriente : sélection réduite
  const shown = cardSlugs(html.split('id="dn-filters"')[0]);
  const shownSet = new Set(shown);
  if (shown.length !== shownSet.size) fail(`${collection.path} : produit affiché deux fois`);
  for (const slug of shown) {
    if (!published.has(slug)) fail(`${collection.path} : « ${slug} » n'est pas un produit publié`);
    if (!expected.has(slug)) fail(`${collection.path} : « ${slug} » n'appartient pas à cette collection`);
  }
  for (const slug of expected) if (!shownSet.has(slug)) fail(`${collection.path} : « ${slug} » manquant`);
  for (const slug of shown) if (primaryOf.get(slug) === collection.slug) shownOnPrimary.add(slug);
}
for (const slug of published) {
  if (!shownOnPrimary.has(slug)) fail(`orphelin : « ${slug} » absent de sa collection principale`);
}

// 6. Pages marque.
const parfums = pages.find((c) => c.slug === 'parfums');
const minModels = settings.find((s) => s.key === 'brand_min_models_indexable')?.value ?? 4;
if (parfums) {
  const inParfums = membersOf(parfums);
  for (const brand of brands) {
    const count = products.filter((p) => p.brand_slug === brand.id && inParfums.has(p.slug)).length;
    const path = `${parfums.path}${brand.id}/`;
    const html = read(path);
    if (count === 0) {
      if (html) fail(`${path} : page générée pour une marque sans parfum publié`);
      continue;
    }
    if (!html) {
      fail(`${path} : page marque absente (${count} parfums)`);
      continue;
    }
    checkedPages += 1;
    const shown = cardSlugs(html.split('id="dn-filters"')[0]);
    if (shown.length !== count) fail(`${path} : ${shown.length} parfums affichés, ${count} attendus`);
    const indexable = count >= minModels && Boolean(brand.description?.trim()) && parfums.is_indexable;
    if (attr(html, 'data-dn-indexable') !== String(indexable))
      fail(`${path} : indexabilité ${attr(html, 'data-dn-indexable')}, attendu ${indexable}`);
    notes.push(`marque ${brand.id} : ${count} parfums, ${indexable ? 'indexable' : 'noindex'}`);
  }
}

// 7 et 8. Liens internes, pages indexables vides, JSON-LD.
const catalogPages = htmlFiles.filter((f) => /data-dn-page="/.test(readFileSync(f, 'utf8')));
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const route = routeOf(file);
  const isCatalog = catalogPages.includes(file);
  for (const [, href] of html.matchAll(/<a [^>]*href="(\/[^"#?]*)/g)) {
    if (routes.has(href)) continue;
    const slug = /^\/([a-z0-9-]+)\/$/.exec(href)?.[1];
    // Fiche produit non encore migrée (étape 8) : le lien doit viser un produit publié.
    if (isCatalog && slug && published.has(slug)) continue;
    if (!isCatalog && slug && published.has(slug)) continue; // démonstration du socle
    fail(`${route} : lien interne cassé ${href}`);
  }
  if (!isCatalog) continue;
  const indexable = attr(html, 'data-dn-indexable') === 'true';
  const count = Number(attr(html, 'data-dn-products'));
  const offers = (html.match(/class="dn-offer"/g) ?? []).length;
  if (indexable && count === 0 && offers === 0) fail(`${route} : page indexable sans produit`);
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const page = jsonLd.find((d) => d['@type'] === 'CollectionPage');
  if (!page) {
    fail(`${route} : JSON-LD CollectionPage absent`);
    continue;
  }
  if (page.breadcrumb?.['@type'] !== 'BreadcrumbList') fail(`${route} : BreadcrumbList absent`);
  const crumbs = (html.match(/<nav class="dn-crumbs/g) ?? []).length;
  if (crumbs !== 1) fail(`${route} : ${crumbs} fil(s) d'Ariane`);
  const listed = page.mainEntity?.numberOfItems ?? 0;
  const pageKind = attr(html, 'data-dn-page');
  if (pageKind !== 'universe') {
    const cards = cardSlugs(html.split('id="dn-filters"')[0]).length;
    if (listed !== cards) fail(`${route} : ItemList ${listed} éléments, ${cards} cartes`);
  }
}

notes.unshift(
  `${checkedPages} pages catalogue contrôlées contre Supabase (${published.size} produits publiés, ${pages.length} collections)`,
);
const indexablePages = catalogPages.filter((f) => /data-dn-indexable="true"/.test(readFileSync(f, 'utf8')));
notes.push(`pages indexables en production (sitemap) : ${indexablePages.length}/${catalogPages.length}`);
for (const note of notes) console.log(`• ${note}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} problème(s) :`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('\n✓ Contrôles catalogue réussis.');
