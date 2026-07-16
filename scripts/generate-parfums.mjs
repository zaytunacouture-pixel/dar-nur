#!/usr/bin/env node
// Génère la collection Parfums (multi-marques) depuis Supabase :
//   - parfums/index.html               → hub (une carte par marque)
//   - parfums/<brand_slug>/index.html  → une page par marque
//
// Source de vérité : table `products`, category_id = 'parfums', active = true,
// groupés dynamiquement par `brand_slug`. AUCUNE marque n'est codée en dur —
// ajouter une marque = créer des produits dans Supabase avec brand/brand_slug
// renseignés (voir admin.html), rien d'autre.
//
// Ne dépend PAS de js/config.js — utilise des variables d'environnement dédiées
// au pipeline (PARFUMS_SUPABASE_URL / PARFUMS_SUPABASE_KEY).
//
// Aucune dépendance npm : utilise le fetch natif de Node (>=18).

import { readFile, writeFile, mkdir, rm, appendFile } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const BRAND_TEMPLATE_PATH = new URL('parfums/_brand_template.html', ROOT);
const HUB_TEMPLATE_PATH = new URL('parfums/_hub_template.html', ROOT);
const HUB_OUTPUT_PATH = new URL('parfums/index.html', ROOT);
const SITEMAP_PATH = new URL('sitemap.xml', ROOT);
// Artefact généré par scripts/build-nav.mjs (Phase 3.6.1) — lu ici comme une
// entrée de plus, au même titre que Supabase ou les templates. Jamais écrit
// par ce script, jamais interprété autrement qu'en extrayant ses deux
// fragments nommés par marqueurs exacts — aucune connaissance du contenu de
// nav.config.json ou de build-nav.mjs, aucun couplage de code entre les deux
// générateurs (décision d'architecture Phase 3.6).
const COMMON_NAV_ARTIFACT_PATH = new URL('partials/nav-common.generated.html', ROOT);

const SUPABASE_URL = process.env.PARFUMS_SUPABASE_URL;
const SUPABASE_KEY = process.env.PARFUMS_SUPABASE_KEY;

function log(msg) { console.log(msg); }
function fail(msg) {
  console.error(`::error::${msg}`);
  process.exitCode = 1;
}

async function writeSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

// Échappement HTML — pour tout texte inséré dans du markup ou un attribut.
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Échappement JSON — pour tout texte inséré à l'intérieur d'une chaîne JSON-LD
// (ne pas confondre avec l'échappement HTML : "&quot;" n'est pas un échappement
// JSON valide, il produirait du texte affiché corrompu au lieu d'une chaîne
// correctement échappée).
function escJson(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\u003C');
}

// Échappement JS — pour tout texte inséré dans une chaîne littérale à l'intérieur
// d'un bloc <script> (protège contre un brand/brand_slug qui contiendrait par
// erreur des backticks ou guillemets).
function escJs(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/</g, '\\x3C');
}

// Extraction stricte par marqueurs exacts — jamais de correspondance
// approximative (même principe que build-nav.mjs, réimplémenté ici
// localement plutôt qu'importé, pour ne créer aucun couplage de code entre
// les deux générateurs — décision d'architecture Phase 3.6).
function extractNamedFragment(source, name, label) {
  const startMarker = `<!-- ${name} -->`;
  const endMarker = `<!-- /${name} -->`;
  const startIdx = source.indexOf(startMarker);
  const endIdx = source.indexOf(endMarker);

  if (startIdx === -1) throw new Error(`Marqueur "${startMarker}" introuvable (${label})`);
  if (endIdx === -1) throw new Error(`Marqueur "${endMarker}" introuvable (${label})`);
  if (source.indexOf(startMarker, startIdx + 1) !== -1) {
    throw new Error(`Marqueur "${startMarker}" dupliqué (${label})`);
  }
  if (source.indexOf(endMarker, endIdx + 1) !== -1) {
    throw new Error(`Marqueur "${endMarker}" dupliqué (${label})`);
  }
  if (endIdx < startIdx) throw new Error(`Marqueur "${endMarker}" trouvé avant "${startMarker}" (${label})`);

  return source.slice(startIdx + startMarker.length, endIdx).trim();
}

// Lit l'artefact commun produit par build-nav.mjs et en extrait les deux
// fragments nommés. N'écrit jamais ce fichier, ne connaît aucune marque.
async function loadCommonNavFragments() {
  let raw;
  try {
    raw = await readFile(COMMON_NAV_ARTIFACT_PATH, 'utf8');
  } catch (e) {
    throw new Error(
      `Impossible de lire partials/nav-common.generated.html (${e.message}) — ` +
      `exécutez d'abord "node scripts/build-nav.mjs" pour produire cet artefact.`
    );
  }
  const label = 'partials/nav-common.generated.html';
  return {
    before: extractNamedFragment(raw, 'COMMON_NAV_BEFORE_PARFUMS', label),
    after: extractNamedFragment(raw, 'COMMON_NAV_AFTER_PARFUMS', label),
  };
}

// Garde-fou générique, indépendant du nom des jetons : protège aussi bien
// les deux nouveaux jetons que les ~24 jetons déjà existants, et tout futur
// jeton qui serait ajouté sans son remplacement correspondant. Si un jeton
// {{...}} subsiste dans le HTML final, la page correspondante n'est jamais
// écrite (l'erreur est levée avant l'appel à writeFile).
function assertNoLeftoverTokens(html, label) {
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(`Jeton(s) non substitué(s) dans ${label} : ${[...new Set(leftover)].join(', ')}`);
  }
}

// Première phrase d'une description — teaser court sur la carte, dérivé
// automatiquement (pas de champ "tagline courte" séparé à ressaisir).
function firstSentence(text) {
  if (!text) return '';
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

function formatPriceLabel(priceValue) {
  if (priceValue === null || priceValue === undefined) return 'Prix à compléter';
  return `${Number(priceValue).toFixed(2).replace('.', ',')} €`;
}

function pluralize(n, singular, plural = `${singular}s`) {
  return `${n} ${n > 1 ? plural : singular}`;
}

function slugifyVolume(volume) {
  return String(volume || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'format';
}

function parseVolumeNumber(volume) {
  const m = String(volume || '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : Infinity;
}

// Liste humaine ("A", "A et B", "A, B et C") — utilisée pour les formats et les
// noms de marques dans les textes générés, jamais de liste codée en dur.
function humanList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

async function fetchParfumsProducts() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Variables PARFUMS_SUPABASE_URL / PARFUMS_SUPABASE_KEY manquantes (secrets GitHub Action non configurés).');
  }
  const url = `${SUPABASE_URL}/rest/v1/products?select=*&category_id=eq.parfums&active=eq.true&order=sort_order.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase a répondu ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Garde-fou central de l'architecture multi-marques : on ne publie jamais une
// fiche sans savoir à quelle marque elle appartient. Voir
// supabase/sql/parfums_brand_migration.sql pour le rétro-remplissage initial.
function assertAllProductsHaveBrand(products) {
  const missing = products.filter(p => !p.brand_slug || !p.brand);
  if (missing.length) {
    const sample = missing.slice(0, 5).map(p => p.slug).join(', ');
    throw new Error(
      `${missing.length} produit(s) actif(s) de category_id=parfums sans brand/brand_slug renseigné ` +
      `(ex: ${sample}). Exécutez supabase/sql/parfums_brand_migration.sql si ce n'est pas déjà fait, ` +
      `et renseignez Marque + Slug marque dans admin.html pour tout nouveau parfum.`
    );
  }
}

// Regroupement dynamique par marque — aucune liste de marques codée en dur.
// L'ordre des groupes (et donc des pages/menus) suit l'ordre alphabétique du
// nom de marque, pour un résultat stable et prévisible.
function groupByBrand(products) {
  const groups = new Map();
  for (const p of products) {
    if (!groups.has(p.brand_slug)) {
      groups.set(p.brand_slug, { brandSlug: p.brand_slug, brandName: p.brand, products: [] });
    }
    groups.get(p.brand_slug).products.push(p);
  }
  return [...groups.values()].sort((a, b) => a.brandName.localeCompare(b.brandName, 'fr'));
}

function computeVolumeGroups(products) {
  const map = new Map();
  for (const p of products) {
    const vol = p.volume || 'Format non précisé';
    if (!map.has(vol)) map.set(vol, []);
    map.get(vol).push(p);
  }
  return map;
}

function sortedVolumes(volumeGroups) {
  return [...volumeGroups.keys()].sort((a, b) => parseVolumeNumber(a) - parseVolumeNumber(b));
}

function buildFilterButtonsHtml(volumeGroups) {
  const all = `    <button class="active" data-line="all">Tous</button>`;
  const volumes = sortedVolumes(volumeGroups);
  if (volumes.length <= 1) return all;
  const buttons = volumes.map(v => {
    const count = volumeGroups.get(v).length;
    return `    <button data-line="${esc(slugifyVolume(v))}">${esc(v)} (${count})</button>`;
  });
  return [all, ...buttons].join('\n');
}

function buildInfoNoteBlock(volumeGroups) {
  const volumes = sortedVolumes(volumeGroups);
  if (volumes.length <= 1) return '';
  return `  <p class="info-note"><b>Bon à savoir —</b> formats disponibles : ${esc(humanList(volumes))}.</p>`;
}

function buildCardHtml(p, brandName, imgPrefix) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const img1 = images[0] ? `${imgPrefix}${images[0]}` : `${imgPrefix}logo-dar-nur.png`;
  const img2 = images[1] ? `${imgPrefix}${images[1]}` : null;
  const line = slugifyVolume(p.volume);
  const priceLabel = formatPriceLabel(p.price_value);
  const priceAttr = p.price_value != null ? String(p.price_value) : '';
  const format = p.volume || 'Format non précisé';
  const fullDesc = (p.description && p.description[0]) || '';
  const teaser = firstSentence(fullDesc);
  const img2Attr = img2 ? `\n         data-img2="${esc(img2)}"` : '';

  return `    <div class="card product-card" id="${esc(p.slug)}" data-line="${esc(line)}" data-price="${priceAttr}"
         data-name="${esc(p.name)}" data-format="${esc(format)}" data-price-label="${esc(priceLabel)}"
         data-desc="${esc(fullDesc)}"
         data-img1="${esc(img1)}"${img2Attr}
         tabindex="0" role="button" aria-label="Voir la fiche de ${esc(p.name)}" onclick="openProductModal(this)" onkeydown="if(event.key==='Enter')openProductModal(this)">
      <div class="card-image"><img src="${esc(img1)}" alt="${esc(p.name)} — Parfum ${esc(brandName)}, ${esc(format)}" loading="lazy" width="400" height="400"/></div>
      <div class="card-body">
        <div class="cat-tag">Parfum ${esc(brandName)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="card-tagline">${esc(teaser)}</p>
        <div class="card-footer">
          <div class="card-price">${esc(priceLabel)}</div>
          <span class="card-cta">Voir la fiche</span>
        </div>
      </div>
    </div>`;
}

function buildJsonLdItem(p, index, brandName) {
  return `      {"@type": "ListItem", "position": ${index + 1}, "url": "https://dar-nur.fr/parfums/${p.brand_slug}/#${p.slug}", "name": "${escJson(p.name)} — ${escJson(brandName)}"}`;
}

function buildParfumsNavBlock(groups, currentBrandSlug) {
  const hubActive = currentBrandSlug == null ? ' class="active"' : '';
  const lines = [`          <a href="/parfums/"${hubActive}>Tous les parfums</a>`];
  for (const g of groups) {
    const active = g.brandSlug === currentBrandSlug ? ' class="active"' : '';
    lines.push(`          <a href="/parfums/${esc(g.brandSlug)}/"${active}>${esc(g.brandName)}</a>`);
  }
  return lines.join('\n');
}

async function renderBrandPage(group, allGroups, commonNav) {
  const { brandSlug, brandName, products } = group;
  const imgPrefix = '../../';
  const volumeGroups = computeVolumeGroups(products);
  const formatsText = humanList(sortedVolumes(volumeGroups));
  const prices = products.map(p => p.price_value).filter(v => v !== null && v !== undefined);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const canonicalUrl = `https://dar-nur.fr/parfums/${brandSlug}/`;

  const heroProduct = products[0];
  const heroImages = Array.isArray(heroProduct.images) ? heroProduct.images.filter(Boolean) : [];
  const heroImageRelative = heroImages[0] ? `${imgPrefix}${heroImages[0]}` : `${imgPrefix}logo-dar-nur.png`;
  const heroImageAbsolute = heroImages[0] ? `https://dar-nur.fr/${heroImages[0]}` : 'https://dar-nur.fr/logo-dar-nur.png';
  const heroImageAlt = `${heroProduct.name} — Parfum ${brandName}`;

  const countLabel = pluralize(products.length, 'parfum');
  const metaDescription = `Découvrez les ${products.length} parfums ${brandName}${formatsText ? ` : disponibles en ${formatsText}` : ''}${minPrice != null ? `, à partir de ${minPrice.toFixed(0)} €` : ''}. Commandez sur WhatsApp.`;
  const heroSubtitle = `${countLabel}, disponible${products.length > 1 ? 's' : ''} en ${formatsText}.`;
  const introText = `La collection Parfum ${brandName} — disponible en ${formatsText}.`;

  const template = await readFile(BRAND_TEMPLATE_PATH, 'utf8');
  const cardsHtml = products.map(p => buildCardHtml(p, brandName, imgPrefix)).join('\n\n');
  const jsonLdItems = products.map((p, i) => buildJsonLdItem(p, i, brandName)).join(',\n');

  const html = template
    .replaceAll('{{TITLE}}', esc(`Parfum ${brandName} — ${countLabel} | Dar Nūr`))
    .replaceAll('{{OG_TITLE}}', esc(`Parfum ${brandName} — Dar Nūr`))
    .replaceAll('{{META_DESCRIPTION}}', esc(metaDescription))
    .replaceAll('{{CANONICAL_URL}}', esc(canonicalUrl))
    .replaceAll('{{HERO_IMAGE_URL}}', esc(heroImageRelative))
    .replaceAll('{{HERO_IMAGE_ABSOLUTE_URL}}', esc(heroImageAbsolute))
    .replaceAll('{{HERO_IMAGE_ALT}}', esc(heroImageAlt))
    .replaceAll('{{JSONLD_NAME}}', escJson(`Parfum ${brandName} — Dar Nūr`))
    .replaceAll('{{JSONLD_DESCRIPTION}}', escJson(`La collection Parfum ${brandName} — disponible en ${formatsText}.`))
    .replaceAll('{{BRAND_NAME_JSON}}', escJson(brandName))
    .replaceAll('{{BRAND_NAME_JS}}', escJs(brandName))
    .replaceAll('{{BRAND_SLUG_JS}}', escJs(brandSlug))
    .replaceAll('{{BRAND_SLUG}}', esc(brandSlug))
    .replaceAll('{{BRAND_NAME}}', esc(brandName))
    .replaceAll('{{PRODUCT_COUNT}}', String(products.length))
    .replaceAll('{{HERO_SUBTITLE}}', esc(heroSubtitle))
    .replaceAll('{{INTRO_TEXT}}', esc(introText))
    .replace('{{INFO_NOTE_BLOCK}}', buildInfoNoteBlock(volumeGroups))
    .replace('{{FILTER_BUTTONS}}', buildFilterButtonsHtml(volumeGroups))
    .replace('{{COMMON_NAV_BEFORE_PARFUMS}}', commonNav.before)
    .replace('{{PARFUMS_NAV_BLOCK}}', buildParfumsNavBlock(allGroups, brandSlug))
    .replace('{{COMMON_NAV_AFTER_PARFUMS}}', commonNav.after)
    .replace('{{JSONLD_ITEMS}}', jsonLdItems)
    .replace('{{PRODUCT_CARDS}}', cardsHtml);

  assertNoLeftoverTokens(html, `parfums/${brandSlug}/index.html`);

  await mkdir(new URL(`parfums/${brandSlug}/`, ROOT), { recursive: true });
  await writeFile(new URL(`parfums/${brandSlug}/index.html`, ROOT), html, 'utf8');
}

function buildBrandCardHtml(group) {
  const { brandName, brandSlug, products } = group;
  const imgPrefix = '../';
  const prices = products.map(p => p.price_value).filter(v => v !== null && v !== undefined);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const images = Array.isArray(products[0].images) ? products[0].images.filter(Boolean) : [];
  const img = images[0] ? `${imgPrefix}${images[0]}` : `${imgPrefix}logo-dar-nur.png`;
  const priceLabel = minPrice != null ? `à partir de ${formatPriceLabel(minPrice)}` : 'Prix à compléter';
  const countLabel = pluralize(products.length, 'parfum');

  return `    <a class="card" href="/parfums/${esc(brandSlug)}/">
      <div class="card-image"><img src="${esc(img)}" alt="${esc(brandName)} — Parfum Dar Nūr" loading="lazy" width="400" height="400"/></div>
      <div class="card-body">
        <div class="cat-tag">Marque</div>
        <h3>${esc(brandName)}</h3>
        <p class="card-tagline">${esc(countLabel)} · ${esc(priceLabel)}</p>
        <div class="card-footer">
          <span class="card-cta">Découvrir la collection</span>
        </div>
      </div>
    </a>`;
}

function buildJsonLdBrandItem(group, index) {
  return `      {"@type": "ListItem", "position": ${index + 1}, "url": "https://dar-nur.fr/parfums/${group.brandSlug}/", "name": "${escJson(group.brandName)}"}`;
}

async function renderHubPage(groups, allProducts, commonNav) {
  const brandNames = groups.map(g => g.brandName);
  const brandListText = humanList(brandNames);
  const brandCountLabel = pluralize(groups.length, 'marque');
  const productCountLabel = pluralize(allProducts.length, 'parfum');

  const metaDescription = `Découvrez ${brandCountLabel} de parfums chez Dar Nūr : ${brandListText}. ${allProducts.length} références, commande simple via WhatsApp.`;
  const heroSubtitle = `${brandCountLabel}, ${productCountLabel} sélectionnés avec soin.`;

  const heroProduct = allProducts[0];
  const heroImages = heroProduct && Array.isArray(heroProduct.images) ? heroProduct.images.filter(Boolean) : [];
  const heroImageRelative = heroImages[0] ? `../${heroImages[0]}` : '../logo-dar-nur.png';
  const heroImageAbsolute = heroImages[0] ? `https://dar-nur.fr/${heroImages[0]}` : 'https://dar-nur.fr/logo-dar-nur.png';
  const heroImageAlt = heroProduct ? `${heroProduct.name} — Univers Parfums Dar Nūr` : 'Univers Parfums Dar Nūr';

  const template = await readFile(HUB_TEMPLATE_PATH, 'utf8');
  const brandCardsHtml = groups.map(buildBrandCardHtml).join('\n\n');
  const jsonLdBrandItems = groups.map(buildJsonLdBrandItem).join(',\n');

  const html = template
    .replaceAll('{{TITLE}}', esc(`Parfums — ${brandCountLabel}, ${productCountLabel} | Dar Nūr`))
    .replaceAll('{{META_DESCRIPTION}}', esc(metaDescription))
    .replaceAll('{{JSONLD_DESCRIPTION}}', escJson(metaDescription))
    .replaceAll('{{HERO_IMAGE_URL}}', esc(heroImageRelative))
    .replaceAll('{{HERO_IMAGE_ABSOLUTE_URL}}', esc(heroImageAbsolute))
    .replaceAll('{{HERO_IMAGE_ALT}}', esc(heroImageAlt))
    .replaceAll('{{HERO_SUBTITLE}}', esc(heroSubtitle))
    .replaceAll('{{BRAND_COUNT}}', String(groups.length))
    .replaceAll('{{PRODUCT_COUNT}}', String(allProducts.length))
    .replace('{{COMMON_NAV_BEFORE_PARFUMS}}', commonNav.before)
    .replace('{{PARFUMS_NAV_BLOCK}}', buildParfumsNavBlock(groups, null))
    .replace('{{COMMON_NAV_AFTER_PARFUMS}}', commonNav.after)
    .replace('{{JSONLD_BRAND_ITEMS}}', jsonLdBrandItems)
    .replace('{{BRAND_CARDS}}', brandCardsHtml);

  assertNoLeftoverTokens(html, 'parfums/index.html');

  await writeFile(HUB_OUTPUT_PATH, html, 'utf8');
}

// Bloc délimité dans sitemap.xml — n'affecte jamais les autres catégories.
// Premier passage après migration : remplace l'ancienne entrée statique unique
// /parfums/. Passages suivants : remplace uniquement le bloc marqué.
async function updateSitemap(groups) {
  const sitemap = await readFile(SITEMAP_PATH, 'utf8');
  const lastmod = new Date().toISOString().slice(0, 10);

  const hubEntry = `  <url>\n    <loc>https://dar-nur.fr/parfums/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`;
  const brandEntries = groups.map(g =>
    `  <url>\n    <loc>https://dar-nur.fr/parfums/${g.brandSlug}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
  ).join('\n');
  const block = `<!-- AUTO:PARFUMS:START — géré automatiquement par scripts/generate-parfums.mjs, ne pas éditer à la main -->\n${hubEntry}\n${brandEntries}\n  <!-- AUTO:PARFUMS:END -->`;

  const markerRegex = /<!-- AUTO:PARFUMS:START[\s\S]*?AUTO:PARFUMS:END -->/;
  const oldSingleEntryRegex = /  <url>\s*\n\s*<loc>https:\/\/dar-nur\.fr\/parfums\/<\/loc>[\s\S]*?<\/url>/;

  let updated;
  if (markerRegex.test(sitemap)) {
    updated = sitemap.replace(markerRegex, block);
  } else if (oldSingleEntryRegex.test(sitemap)) {
    updated = sitemap.replace(oldSingleEntryRegex, block);
  } else {
    throw new Error("Impossible de localiser l'entrée /parfums/ dans sitemap.xml pour la remplacer — abandon plutôt que de corrompre le fichier.");
  }

  // Nettoyage des anciens dossiers de marque qui n'existent plus (marque
  // renommée ou retirée) — comparé à ce que le PRÉCÉDENT bloc sitemap listait,
  // jamais à autre chose que ce périmètre.
  const previousBlockMatch = sitemap.match(markerRegex);
  if (previousBlockMatch) {
    const previousSlugs = [...previousBlockMatch[0].matchAll(/\/parfums\/([a-z0-9-]+)\//g)].map(m => m[1]);
    const currentSlugs = new Set(groups.map(g => g.brandSlug));
    for (const oldSlug of new Set(previousSlugs)) {
      if (!currentSlugs.has(oldSlug)) {
        await rm(new URL(`parfums/${oldSlug}/`, ROOT), { recursive: true, force: true });
        log(`  Dossier obsolète supprimé : parfums/${oldSlug}/ (marque n'ayant plus de produit actif)`);
      }
    }
  }

  await writeFile(SITEMAP_PATH, updated, 'utf8');
}

async function main() {
  const start = Date.now();
  log('▶ Génération de la collection Parfums (multi-marques) depuis Supabase');

  let products;
  try {
    products = await fetchParfumsProducts();
  } catch (e) {
    fail(`Échec de la récupération Supabase : ${e.message}`);
    await writeSummary([
      '## Régénération Parfums — ÉCHEC',
      '',
      `- Raison : impossible de contacter Supabase (${e.message})`,
      '- Aucun fichier modifié — la version précédente reste en ligne.',
    ]);
    return;
  }

  log(`  ${products.length} produit(s) actif(s) trouvé(s) pour category_id=parfums.`);

  if (!products.length) {
    fail('Aucun produit actif trouvé pour category_id=parfums — abandon pour ne pas publier une page vide.');
    await writeSummary([
      '## Régénération Parfums — ABANDONNÉE',
      '',
      '- Raison : 0 produit actif retourné par Supabase pour category_id=parfums.',
      '- Aucun fichier modifié — la version précédente reste en ligne.',
      '- Vérifiez qu\'aucune désactivation en masse involontaire n\'a eu lieu dans admin.html.',
    ]);
    return;
  }

  try {
    assertAllProductsHaveBrand(products);
  } catch (e) {
    fail(e.message);
    await writeSummary([
      '## Régénération Parfums — ABANDONNÉE',
      '',
      `- Raison : ${e.message}`,
      '- Aucun fichier modifié — la version précédente reste en ligne.',
    ]);
    return;
  }

  const groups = groupByBrand(products);
  log(`  ${groups.length} marque(s) détectée(s) : ${groups.map(g => `${g.brandName} (${g.products.length})`).join(', ')}`);

  let commonNav;
  try {
    commonNav = await loadCommonNavFragments();
  } catch (e) {
    fail(e.message);
    await writeSummary([
      '## Régénération Parfums — ABANDONNÉE',
      '',
      `- Raison : ${e.message}`,
      '- Aucun fichier modifié — la version précédente reste en ligne.',
    ]);
    return;
  }

  for (const group of groups) {
    await renderBrandPage(group, groups, commonNav);
  }
  await renderHubPage(groups, products, commonNav);
  await updateSitemap(groups);

  const durationMs = Date.now() - start;
  log(`✔ Collection Parfums régénérée (${groups.length} marques, ${products.length} produits) en ${durationMs} ms.`);

  await writeSummary([
    '## Régénération Parfums — succès',
    '',
    `- Marques : **${groups.length}** (${groups.map(g => `${g.brandName} : ${g.products.length}`).join(', ')})`,
    `- Produits actifs au total : **${products.length}**`,
    `- Durée de génération : ${durationMs} ms`,
    '- Le commit ne sera créé que si le contenu a réellement changé (vérifié à l\'étape suivante du workflow).',
  ]);
}

main().catch(e => {
  fail(`Erreur inattendue : ${e.stack || e.message}`);
});
