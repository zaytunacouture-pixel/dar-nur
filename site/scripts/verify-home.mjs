#!/usr/bin/env node
/**
 * Contrôles de l'ACCUEIL (étape 9), après `astro build`. Recalcule indépendamment depuis
 * Supabase (lecture publique, sans réutiliser src/lib) et compare au HTML de dist/index.html.
 * Échoue (code 1) au moindre écart.
 *
 *  1. `/` existe ; un seul <h1> ; canonical = SITE_URL + « / » ; robots selon l'environnement ;
 *     marquée indexable pour le sitemap de production (présente une fois, sans <lastmod>).
 *  2. Liens : chaque lien interne mène à une page de dist/ ; aucune ancre vide, aucun
 *     `javascript:`, aucun lien vers /lab/ ou /demo/ ; ancres internes présentes.
 *  3. Entrées principales : les 3 univers, Idées cadeaux, Offres & packs ; libellé « Mode modeste ».
 *  4. Produits mis en avant (cartes, hero) : publiés dans Supabase, aucun brouillon, aucun produit
 *     de test (miel-myrtille, « test » dans le nom), image hors `assets/produits-ia/` ; 6 à 8 cartes.
 *  5. Honnêteté : aucun avis, note, étoile, compteur de clients, « meilleures ventes », promesse
 *     de livraison offerte ou nationale, newsletter, « Thérapeutiques », « 100 % naturel ».
 *  6. JSON-LD : WebSite + Organization uniquement (ni Product, ni avis, ni note).
 *
 * Réseau : lecture publique Supabase (clé « publishable »), comme le build.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const errors = [];
const notes = [];
const fail = (message) => errors.push(message);

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
const SITE_URL = process.env.SITE_URL ?? 'https://dar-nur.fr';
const indexable = (process.env.DAR_NUR_ENV ?? 'development') === 'production';
if (!SUPABASE_URL || !KEY?.startsWith('sb_publishable_')) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY (publishable) requis pour les contrôles de l’accueil.');
  process.exit(1);
}
const homeFile = join(dist, 'index.html');
if (!existsSync(homeFile)) {
  console.error('dist/index.html absent : lancer `npm run build` avant `npm run verify:home`.');
  process.exit(1);
}
const html = readFileSync(homeFile, 'utf8');
const text = html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#39;|&#x27;/g, "'")
  .replace(/\s+/g, ' ');
const main = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? '';

async function rest(table, params) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!response.ok) throw new Error(`${table} : HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

// ── 1. Page, SEO de base, indexation ─────────────────────────────────────────
const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
if (h1 !== 1) fail(`${h1} <h1> (attendu : 1)`);
const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
const expected = new URL('/', SITE_URL).toString();
if (canonical !== expected) fail(`canonical ${canonical} (attendu : ${expected})`);
const robots = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1] ?? '';
if (indexable ? robots !== 'index, follow' : !robots.includes('noindex'))
  fail(`meta robots « ${robots} » incohérente (production : ${indexable})`);
if (!/data-dn-page="home"[^>]*data-dn-indexable="true"/.test(html))
  fail('accueil non marqué indexable (data-dn-indexable) : absent du sitemap de production');
const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? '';
if (title.length > 65) fail(`title trop long (${title.length} caractères)`);
const sitemap = join(dist, 'sitemap.xml');
if (existsSync(sitemap)) {
  const entries = [...readFileSync(sitemap, 'utf8').matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const home = entries.filter((e) => e.includes(`<loc>${expected}</loc>`));
  if (home.length !== 1) fail(`sitemap : accueil présent ${home.length} fois`);
  else if (/<lastmod>/.test(home[0])) fail('sitemap : <lastmod> sur l’accueil sans source fiable');
  notes.push(`sitemap : ${entries.length} URL, accueil présent une fois, sans lastmod`);
} else notes.push('sitemap : non écrit (build hors production)');

// ── 2. Liens ─────────────────────────────────────────────────────────────────
const hrefs = [...new Set([...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]))];
let internal = 0;
let legacy = 0;
for (const href of hrefs) {
  if (href === '' || href === '#' || /^javascript:/i.test(href)) {
    fail(`lien vide ou factice : « ${href} »`);
    continue;
  }
  if (href.startsWith('#')) {
    if (!html.includes(`id="${href.slice(1)}"`)) fail(`ancre ${href} sans cible`);
    continue;
  }
  if (/^(https?:|mailto:|tel:)/.test(href) && !href.startsWith(expected)) continue;
  const path = href.startsWith(expected) ? `/${href.slice(expected.length)}` : href;
  if (/^\/(lab|demo|design-system)\//.test(path)) fail(`lien public vers une page interne : ${path}`);
  const clean = path.split(/[?#]/)[0];
  const file = join(dist, clean, clean.endsWith('/') ? 'index.html' : '');
  if (existsSync(file)) internal += 1;
  // Pages légales absolues (footer) : encore servies par le site actuel, à la racine du dépôt.
  else if (href.startsWith(expected) && existsSync(join(root, '..', clean))) legacy += 1;
  else fail(`lien mort : ${href}`);
}
notes.push(
  `${hrefs.length} liens uniques : ${internal} internes vérifiés dans dist/, ${legacy} vers des pages du site actuel`,
);

// ── 3. Entrées principales ───────────────────────────────────────────────────
for (const path of ['/miels-herboristerie/', '/parfums-soins/', '/mode/', '/idees-cadeaux/', '/offres/']) {
  if (!main.includes(`href="${path}"`)) fail(`entrée principale absente du contenu : ${path}`);
}
if (!/Mode modeste/.test(text)) fail('libellé « Mode modeste » absent');

// ── 4. Produits mis en avant ─────────────────────────────────────────────────
const grid = /<ul class="dn-home-grid[\s\S]*?<\/ul>/.exec(html)?.[0] ?? '';
const cardSlugs = [
  ...grid.matchAll(
    /class="dn-card__link"[^>]*href="\/([^"/]+)\/"|href="\/([^"/]+)\/"[^>]*class="dn-card__link"/g,
  ),
].map((m) => m[1] ?? m[2]);
if (cardSlugs.length < 6 || cardSlugs.length > 8)
  fail(`${cardSlugs.length} produits « À découvrir » (attendu : 6 à 8)`);
const heroSlug = /class="dn-hero__caption[\s\S]*?href="\/([^"/]+)\/"/.exec(html)?.[1];
if (!heroSlug) fail('produit du hero non nommé (légende « En photo »)');
const featured = [...new Set([...cardSlugs, ...(heroSlug ? [heroSlug] : [])])];
const rows = featured.length
  ? await rest('products', {
      select: 'slug,name,tagline,status,availability,images,product_media(url,sort_order,variant_id)',
      slug: `in.(${featured.join(',')})`,
    })
  : [];
const bySlug = new Map(rows.map((r) => [r.slug, r]));
for (const slug of featured) {
  const row = bySlug.get(slug);
  if (!row) {
    fail(`produit mis en avant introuvable dans Supabase : ${slug}`);
    continue;
  }
  if (row.status !== 'published') fail(`produit mis en avant non publié (${row.status}) : ${slug}`);
  if (slug === 'miel-myrtille' || /\btest\b/i.test(`${row.name} ${row.tagline ?? ''}`))
    fail(`produit de test mis en avant : ${slug}`);
  const first =
    row.product_media.filter((m) => !m.variant_id).sort((a, b) => a.sort_order - b.sort_order)[0]?.url ??
    row.images?.[0];
  if (!first) fail(`produit mis en avant sans image : ${slug}`);
  else if (/produits-ia\//.test(first)) fail(`image générée (produits-ia/) mise en avant : ${slug}`);
  if (row.availability !== 'available') notes.push(`⚠ ${slug} : disponibilité « ${row.availability} »`);
}
notes.push(`${cardSlugs.length} produits « À découvrir » + hero contrôlés : ${featured.join(', ')}`);

// ── 5. Honnêteté du contenu ──────────────────────────────────────────────────
const FORBIDDEN = [
  [/livraison offerte/i, 'livraison offerte'],
  [/livraison (?:en|dans toute la|partout en) France|partout en France/i, 'livraison nationale'],
  [/meilleures? ventes?|best[- ]?sellers?|favoris clients|les plus vendus/i, 'classement de ventes'],
  [/\bavis\b|★|☆|\bnote moyenne\b|\/5\b/i, 'avis ou note'],
  [
    /[+]?\s?\d[\d\s]*\s?(?:clients|commandes)\b|\d+\s?%\s?(?:de\s)?(?:clients\s)?satisfaits/i,
    'compteur client',
  ],
  [/newsletter|inscrivez-vous|abonnez-vous/i, 'newsletter'],
  [/th[ée]rapeutique/i, '« Thérapeutiques »'],
  [/100\s?%\s?naturel/i, '« 100 % naturel »'],
  [/num[ée]ro 1|n°\s?1\b|meilleure qualit[ée]/i, 'superlatif non prouvé'],
];
for (const [pattern, label] of FORBIDDEN) {
  const match = pattern.exec(text);
  if (match) fail(`mention interdite (${label}) : « ${match[0]} »`);
}

// ── 6. Données structurées ───────────────────────────────────────────────────
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
  JSON.parse(m[1]),
);
const types = blocks.flatMap((b) => (b['@graph'] ?? [b]).map((n) => n['@type']));
for (const type of ['WebSite', 'Organization']) if (!types.includes(type)) fail(`JSON-LD : ${type} absent`);
for (const type of types)
  if (!['WebSite', 'Organization'].includes(type)) fail(`JSON-LD : type inattendu sur l’accueil (${type})`);
if (/aggregateRating|"review"|ratingValue/i.test(JSON.stringify(blocks))) fail('JSON-LD : avis ou note');

// ── Bilan ────────────────────────────────────────────────────────────────────
for (const note of notes) console.log(`• ${note}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} problème(s) sur l’accueil :`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('\n✓ Accueil vérifié.');
