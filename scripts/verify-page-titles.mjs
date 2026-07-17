#!/usr/bin/env node
// Contrôle léger et centralisé des <title> sur toutes les pages indexables du
// site (accueil, 14 pages catégories, hub + pages marque parfums, 230 fiches
// produit, pages légales) : présence d'un seul <title>, longueur signalée
// hors 25–65 caractères, cohérence de base title/h1, absence de noindex,
// canonical présent et cohérent, doublons de <title> signalés (avec mention
// des doublons déjà connus et documentés dans docs/ARCHITECTURE_DAR_NUR.md,
// faute de donnée produit distinctive — pas une régression de ce contrôle).
//
// Usage : node scripts/verify-page-titles.mjs
// Aucune dépendance npm.

import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const SITE = 'https://dar-nur.fr';

function fail(scope, msg) { console.error(`  ✘ [${scope}] ${msg}`); }
function warn(scope, msg) { console.warn(`  ⚠ [${scope}] ${msg}`); }

const CATEGORY_DIRS = [
  'miels', 'huiles', 'poudres', 'gelules', 'brumes', 'qamis', 'abayas',
  'bakhour', 'tahara', 'chaussures', 'chechias', 'accessoires',
  'miels-gourmands', 'miels-terroir',
];

// Doublons de <title> déjà identifiés lors de l'audit (2026-07-17) : produits
// dont le nom ET la tagline sont strictement identiques entre variantes —
// aucune donnée distinctive disponible en base sans modifier Supabase (hors
// périmètre de cette tâche). Voir docs/ARCHITECTURE_DAR_NUR.md.
const KNOWN_DUPLICATE_TITLES = new Set([
  'Abaya Nilla white and Gold | Dar Nūr',
  'Abaya Iltihad | Dar Nūr',
]);

const STOPWORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'au', 'aux', 'dar', 'nūr', 'nos', 'un', 'une', "l'", '&']);

function significantWords(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[|–—,.'’()]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

async function loadPage(relPath) {
  try {
    return await readFile(new URL(relPath, ROOT), 'utf8');
  } catch {
    return null;
  }
}

// Les fiches produit sont des copies complètes d'index.html : le premier
// <h1> du document est celui (masqué) de l'accueil ("L'authenticité a une
// maison."), pas le h1 réel du produit. Sur ces pages, le h1 pertinent est
// celui injecté dans #productView (voir buildProductSSR() dans
// scripts/generate-product-pages.mjs) — on le cible spécifiquement s'il
// existe et n'est pas vide, sinon on retombe sur le premier h1 du document
// (cas des pages catégories/accueil/légales, qui n'ont qu'une seule vue).
function extractH1(html) {
  const pv = html.match(/<div id="productView"[^>]*>([\s\S]*?)<\/div>\s*\n\s*<!-- ============ MOBILE BAR/);
  const scope = pv && pv[1].trim() ? pv[1] : html;
  const h1Match = scope.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';
}

// L'accueil est structurellement à part : son h1 est une accroche de marque
// ("L'authenticité a une maison."), pas un nom de produit/catégorie répété
// dans le title — les deux sont volontairement formulés différemment, ce
// n'est pas une incohérence à signaler comme sur les autres pages.
const H1_COHERENCE_EXEMPT = new Set(['accueil (index.html)']);

function checkPage(id, html, expectedCanonical) {
  const errors = [];
  const infos = [];

  const titleMatches = html.match(/<title>[^<]*<\/title>/g) || [];
  if (titleMatches.length === 0) errors.push('aucun <title> trouvé');
  else if (titleMatches.length > 1) errors.push(`${titleMatches.length} balises <title> trouvées (une seule attendue)`);

  const title = titleMatches[0] ? titleMatches[0].replace(/<\/?title>/g, '').trim() : '';
  if (titleMatches.length && !title) errors.push('<title> vide');

  if (title) {
    if (title.length > 65) infos.push(`title long (${title.length} caractères) : "${title}"`);
    else if (title.length < 25) infos.push(`title court (${title.length} caractères) : "${title}"`);
  }

  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)) {
    errors.push('meta robots noindex présent sur une page traitée comme indexable');
  }

  const h1 = extractH1(html);
  if (!h1) infos.push('aucun <h1> trouvé (cohérence title/h1 non vérifiable)');
  else if (title && !H1_COHERENCE_EXEMPT.has(id)) {
    const titleWords = new Set(significantWords(title));
    const h1Words = significantWords(h1);
    const overlap = h1Words.some(w => titleWords.has(w));
    if (!overlap) errors.push(`title incohérent avec le h1 réel ("${title}" vs h1 "${h1}")`);
  }

  const canonicalMatch = html.match(/rel="canonical" href="([^"]*)"/);
  if (!canonicalMatch) infos.push('canonical absent (hors périmètre title, signalé)');
  else if (expectedCanonical && canonicalMatch[1] !== expectedCanonical) {
    errors.push(`canonical incohérent : ${canonicalMatch[1]} (attendu ${expectedCanonical})`);
  }

  return { title, errors, infos };
}

async function main() {
  console.log('▶ Vérification des <title> sur les pages indexables');

  const pages = [];

  const home = await loadPage('index.html');
  if (home) pages.push({ id: 'accueil (index.html)', html: home, canonical: SITE });

  for (const dir of CATEGORY_DIRS) {
    const html = await loadPage(`${dir}/index.html`);
    if (html) pages.push({ id: `catégorie ${dir}`, html, canonical: `${SITE}/${dir}/` });
    else warn(dir, 'page catégorie introuvable');
  }

  const parfumsHub = await loadPage('parfums/index.html');
  if (parfumsHub) pages.push({ id: 'parfums (hub)', html: parfumsHub, canonical: `${SITE}/parfums/` });
  for (const brand of ['khair', 'lecode']) {
    const html = await loadPage(`parfums/${brand}/index.html`);
    if (html) pages.push({ id: `parfums/${brand}`, html, canonical: `${SITE}/parfums/${brand}/` });
  }

  for (const legal of ['cgv.html', 'confidentialite.html', 'mentions-legales.html']) {
    const html = await loadPage(legal);
    if (html) pages.push({ id: legal, html, canonical: null });
  }

  let manifest = [];
  try {
    manifest = JSON.parse(await readFile(new URL('scripts/.generated-product-slugs.json', ROOT), 'utf8'));
  } catch {
    warn('produits', 'scripts/.generated-product-slugs.json introuvable — fiches produit non vérifiées');
  }
  for (const slug of manifest) {
    const html = await loadPage(`${slug}/index.html`);
    if (html) pages.push({ id: `produit ${slug}`, html, canonical: `${SITE}/${slug}/` });
    else warn(slug, 'fiche produit listée dans le manifeste mais introuvable sur disque');
  }

  console.log(`  ${pages.length} page(s) indexable(s) à vérifier.`);

  let errorCount = 0;
  let infoCount = 0;
  const titleOwners = new Map();

  for (const { id, html, canonical } of pages) {
    const { title, errors, infos } = checkPage(id, html, canonical);
    for (const e of errors) { fail(id, e); errorCount++; }
    for (const i of infos) { warn(id, i); infoCount++; }
    if (title) {
      if (!titleOwners.has(title)) titleOwners.set(title, []);
      titleOwners.get(title).push(id);
    }
  }

  console.log(`  ${infoCount} information(s) de longueur/canonical (non bloquant) — voir avertissements ci-dessus si besoin.`);

  let unknownDuplicates = 0;
  let knownDuplicates = 0;
  for (const [title, owners] of titleOwners) {
    if (owners.length < 2) continue;
    if (KNOWN_DUPLICATE_TITLES.has(title)) {
      knownDuplicates++;
      warn('doublon connu', `"${title}" partagé par ${owners.length} pages (anomalie documentée, données produit identiques — voir docs/ARCHITECTURE_DAR_NUR.md) : ${owners.join(', ')}`);
    } else {
      unknownDuplicates++;
      fail('doublon', `"${title}" partagé par ${owners.length} pages non justifiées : ${owners.join(', ')}`);
      errorCount++;
    }
  }

  console.log(`\n▶ Résumé : ${pages.length} pages vérifiées, ${errorCount} erreur(s), ${knownDuplicates} doublon(s) connu(s)/documenté(s), ${unknownDuplicates} doublon(s) non justifié(s).`);

  if (errorCount) process.exitCode = 1;
}

main().catch(e => {
  console.error(`::error:: ${e.stack || e.message}`);
  process.exitCode = 1;
});
