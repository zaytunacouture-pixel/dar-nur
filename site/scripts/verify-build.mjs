#!/usr/bin/env node
/**
 * Vérifications après `astro build` (lancées en CI et en local par `npm run verify`).
 * Échoue (code 1) au moindre écart. Aucun réseau, aucune écriture.
 *
 *  1. Indexation : hors production, chaque page est noindex, robots.txt interdit tout,
 *     _headers porte X-Robots-Tag, aucun sitemap. Pages internes (dont tout /lab/) noindex dans tous les cas.
 *  2. SEO de base : lang="fr", un seul <h1>, <title>, description, canonical.
 *  3. Aucune police chargée depuis Google Fonts ; aucune clé secrète dans la sortie.
 *  4. Budgets de poids (JS, CSS, polices).
 *  5. Discipline du design system : aucune couleur hexadécimale hors tokens.css,
 *     media queries de largeur limitées à 768 / 1024 px (min-width).
 *  6. Confidentialité fournisseur : si la configuration locale (non versionnée) existe,
 *     aucun de ses identifiants ne doit apparaître dans la sortie. Les valeurs ne sont jamais affichées.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const src = join(root, 'src');
const env = process.env.DAR_NUR_ENV ?? 'development';
const indexable = env === 'production';
const INTERNAL_PAGES = ['design-system/index.html', 'lab/supabase/index.html', '404.html'];
const BUDGET = { jsGzip: 20_000, cssGzip: 30_000, fonts: 50_000 };

const errors = [];
const notes = [];
const fail = (message) => errors.push(message);
/** Chemin relatif en séparateurs « / » (Windows comme Linux). */
const posix = (path) => path.split(sep).join('/');
/** Minuscules sans accents, pour comparer des noms quelle que soit leur graphie. */
const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

if (!existsSync(dist)) {
  console.error('dist/ absent : lancer `npm run build` avant `npm run verify`.');
  process.exit(1);
}
const files = walk(dist);
const html = files.filter((f) => f.endsWith('.html'));

// ── 1 & 2. Indexation et SEO de base, page par page ─────────────────────────
for (const file of html) {
  const page = posix(relative(dist, file));
  const doc = readFileSync(file, 'utf8');
  const robots = /<meta name="robots" content="([^"]+)"/.exec(doc)?.[1];
  if (!robots) fail(`${page} : meta robots absente`);
  const mustNoindex = !indexable || INTERNAL_PAGES.includes(page) || page.startsWith('lab/');
  if (mustNoindex && !robots?.includes('noindex')) fail(`${page} : devrait être noindex (env ${env})`);
  if (!/<html lang="fr"/.test(doc)) fail(`${page} : <html lang="fr"> absent`);
  const h1 = (doc.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) fail(`${page} : ${h1} <h1> (attendu : 1)`);
  if (!/<title>[^<]+<\/title>/.test(doc)) fail(`${page} : <title> absent`);
  if (!/<meta name="description" content="[^"]+"/.test(doc)) fail(`${page} : description absente`);
  if (!/<link rel="canonical" href="https?:\/\/[^"]+"/.test(doc)) fail(`${page} : canonical absente`);
  if (/fonts\.(googleapis|gstatic)\.com/.test(doc)) fail(`${page} : appel à Google Fonts`);
}

const robotsTxt = existsSync(join(dist, 'robots.txt')) ? readFileSync(join(dist, 'robots.txt'), 'utf8') : '';
const headers = existsSync(join(dist, '_headers')) ? readFileSync(join(dist, '_headers'), 'utf8') : '';
if (!indexable) {
  if (!/Disallow: \/\s*$/m.test(robotsTxt)) fail('robots.txt : « Disallow: / » attendu hors production');
  if (!/X-Robots-Tag: noindex/.test(headers)) fail('_headers : X-Robots-Tag noindex attendu hors production');
  if (files.some((f) => /sitemap.*\.xml$/.test(f))) fail('sitemap présent hors production');
}

// ── 3. Secrets ──────────────────────────────────────────────────────────────
const textFiles = files.filter((f) => ['.html', '.js', '.css', '.txt', '.json', ''].includes(extname(f)));

for (const file of textFiles) {
  const content = readFileSync(file, 'utf8');
  if (/sb_secret_|service_role/.test(content))
    fail(`${relative(dist, file)} : clé secrète Supabase détectée`);
}

// ── 4. Budgets (par page : la page la plus lourde fait foi) ────────────────
const gz = (buffer) => gzipSync(buffer).length;
const assetSize = (url) => {
  const path = join(dist, url.split('?')[0].replace(/^\//, ''));
  return existsSync(path) ? gz(readFileSync(path)) : 0;
};
let heaviest = { page: '', jsGzip: 0, cssGzip: 0 };
for (const file of html) {
  const doc = readFileSync(file, 'utf8');
  const external = (re) => [...doc.matchAll(re)].reduce((t, m) => t + assetSize(m[1]), 0);
  const inline = (re) => [...doc.matchAll(re)].reduce((t, m) => t + gz(Buffer.from(m[1] ?? '')), 0);
  const jsGzip =
    external(/<script[^>]+src="([^"]+)"/g) +
    // JSON et JSON-LD (données structurées) ne sont pas du JavaScript exécuté : hors budget.
    inline(/<script(?![^>]*application\/(?:ld\+)?json)(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g);
  const cssGzip =
    external(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g) + inline(/<style[^>]*>([\s\S]*?)<\/style>/g);
  if (jsGzip + cssGzip > heaviest.jsGzip + heaviest.cssGzip) {
    heaviest = { page: posix(relative(dist, file)), jsGzip, cssGzip };
  }
}
const fonts = files.filter((f) => f.endsWith('.woff2'));
const measures = {
  jsGzip: heaviest.jsGzip,
  cssGzip: heaviest.cssGzip,
  fonts: fonts.reduce((t, f) => t + statSync(f).size, 0),
};
for (const [key, value] of Object.entries(measures)) {
  if (value > BUDGET[key]) fail(`budget ${key} dépassé : ${value} o > ${BUDGET[key]} o`);
}
notes.push(
  `page la plus lourde (${heaviest.page}) : JS ${(measures.jsGzip / 1024).toFixed(1)} Ko gzip · CSS ${(measures.cssGzip / 1024).toFixed(1)} Ko gzip`,
  `polices : ${(measures.fonts / 1024).toFixed(1)} Ko au total (${fonts.length} fichiers)`,
);

// ── 5. Discipline des tokens dans les sources ───────────────────────────────
const HEX_ALLOWED = new Set(['styles/tokens.css', 'config/site.ts']);
const HEX = /(?<![\w&/])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![\w-])/gi;
for (const file of walk(src).filter((f) => /\.(astro|css|ts)$/.test(f))) {
  const rel = posix(relative(src, file));
  const content = readFileSync(file, 'utf8');
  if (!HEX_ALLOWED.has(rel)) {
    for (const m of content.matchAll(HEX)) fail(`${rel} : couleur ${m[0]} hors tokens.css`);
  }
  for (const m of content.matchAll(/@media[^{]*\((min|max)-width:\s*([\d.]+)px\)/g)) {
    if (m[1] === 'max' || !['768', '1024'].includes(m[2])) {
      fail(`${rel} : media query non autorisée « ${m[0].trim()} »`);
    }
  }
}

// ── 6. Confidentialité fournisseur (configuration locale, jamais versionnée) ──
const supplierConfig = join(root, '..', 'supplier.config.local.json');
if (existsSync(supplierConfig)) {
  const config = JSON.parse(readFileSync(supplierConfig, 'utf8'));
  const terms = [
    ...(Array.isArray(config.forbiddenNames) ? config.forbiddenNames : []),
    ...(typeof config.code === 'string' && config.code.length >= 4 ? [config.code] : []),
    ...(typeof config.baseUrl === 'string' ? [new URL(config.baseUrl).hostname.replace(/^www\./, '')] : []),
  ]
    .filter((t) => typeof t === 'string' && t.trim().length >= 4)
    .map((t) => fold(t));
  // Mot entier uniquement : un nom court peut être contenu dans un mot courant
  // (faux positif constaté le 01/10/2026 dans le libellé validé « Brumes & eaux florales »).
  const patterns = terms.map(
    (t) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u'),
  );
  let hits = 0;
  for (const file of textFiles) {
    const content = fold(readFileSync(file, 'utf8'));
    for (const pattern of patterns) if (pattern.test(content)) hits += 1;
  }
  if (hits)
    fail(`confidentialité fournisseur : ${hits} occurrence(s) d'un identifiant fournisseur dans dist/`);
  else notes.push(`confidentialité fournisseur : ${terms.length} identifiants contrôlés, 0 occurrence`);
} else {
  notes.push('confidentialité fournisseur : configuration locale absente (CI) — contrôle ignoré');
}

// ── Bilan ───────────────────────────────────────────────────────────────────
notes.unshift(`${html.length} pages HTML vérifiées (DAR_NUR_ENV=${env}, indexable=${indexable})`);
for (const note of notes) console.log(`• ${note}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} problème(s) :`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('\n✓ Vérifications réussies.');
