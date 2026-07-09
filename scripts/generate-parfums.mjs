#!/usr/bin/env node
// Génère parfums/index.html (HTML + JSON-LD statiques) depuis Supabase.
//
// Source de vérité : table `products`, category_id = 'parfums', active = true.
// Ne dépend PAS de js/config.js — utilise des variables d'environnement dédiées
// au pipeline (PARFUMS_SUPABASE_URL / PARFUMS_SUPABASE_KEY), pour découpler
// complètement la génération du frontend.
//
// Aucune dépendance npm : utilise le fetch natif de Node (>=18).

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const TEMPLATE_PATH = new URL('parfums/_template.html', ROOT);
const OUTPUT_PATH = new URL('parfums/index.html', ROOT);

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

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Première phrase d'une description — sert de teaser court sur la carte,
// dérivé automatiquement (pas de champ "tagline courte" séparé à ressaisir).
function firstSentence(text) {
  if (!text) return '';
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

function formatPriceLabel(priceValue) {
  if (priceValue === null || priceValue === undefined) return 'Prix à compléter';
  return `${Number(priceValue).toFixed(2).replace('.', ',')} €`;
}

function isSprayFormat(volume) {
  return String(volume || '').includes('250');
}

function buildCardHtml(p) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const img1 = images[0] ? `../${images[0]}` : '../logo-dar-nur.png';
  const img2 = images[1] ? `../${images[1]}` : null;
  const spray = isSprayFormat(p.volume);
  const line = spray ? 'lecode-spray' : 'lecode-extrait';
  const priceLabel = formatPriceLabel(p.price_value);
  const priceAttr = p.price_value != null ? String(p.price_value) : '';
  const format = `${spray ? 'Spray parfumé' : 'Extrait de parfum'} · ${p.volume || ''}`.trim();
  const fullDesc = (p.description && p.description[0]) || '';
  const teaser = firstSentence(fullDesc);
  const img2Attr = img2 ? `\n         data-img2="${esc(img2)}"` : '';

  return `    <div class="card lecode-card" id="${esc(p.slug)}" data-line="${line}" data-price="${priceAttr}"
         data-name="${esc(p.name)}" data-format="${esc(format)}" data-price-label="${esc(priceLabel)}"
         data-desc="${esc(fullDesc)}"
         data-img1="${esc(img1)}"${img2Attr}
         tabindex="0" role="button" aria-label="Voir la fiche de ${esc(p.name)}" onclick="openLecodeModal(this)" onkeydown="if(event.key==='Enter')openLecodeModal(this)">
      <div class="card-image"><img src="${esc(img1)}" alt="${esc(p.name)} — Parfum LeCode Paris, ${esc(format)}" loading="lazy" width="400" height="400"/></div>
      <div class="card-body">
        <div class="cat-tag">Parfum LeCode Paris</div>
        <h3>${esc(p.name)}</h3>
        <p class="card-tagline">${esc(teaser)}</p>
        <div class="card-footer">
          <div class="card-price">${esc(priceLabel)}</div>
          <span class="card-cta">Voir la fiche</span>
        </div>
      </div>
    </div>`;
}

function buildJsonLdItem(p, index) {
  const spray = isSprayFormat(p.volume);
  const label = spray ? 'Spray LeCode Paris' : 'Parfum LeCode Paris';
  return `      {"@type": "ListItem", "position": ${index + 1}, "url": "https://dar-nur.fr/parfums/#${p.slug}", "name": "${esc(p.name)} — ${label}"}`;
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

async function main() {
  const start = Date.now();
  log('▶ Génération de parfums/index.html depuis Supabase (category_id=parfums, active=true)');

  let products;
  try {
    products = await fetchParfumsProducts();
  } catch (e) {
    fail(`Échec de la récupération Supabase : ${e.message}`);
    await writeSummary([
      '## Régénération /parfums/ — ÉCHEC',
      '',
      `- Raison : impossible de contacter Supabase (${e.message})`,
      '- Aucun fichier modifié — la version précédente reste en ligne.',
    ]);
    return;
  }

  log(`  ${products.length} produit(s) actif(s) trouvé(s) pour category_id=parfums.`);

  // Garde-fou "catégorie vide" : on n'écrase jamais une page fonctionnelle
  // par une grille vide (ex. désactivation en masse accidentelle).
  if (!products.length) {
    fail('Aucun produit actif trouvé pour category_id=parfums — abandon pour ne pas publier une page vide.');
    await writeSummary([
      '## Régénération /parfums/ — ABANDONNÉE',
      '',
      '- Raison : 0 produit actif retourné par Supabase pour category_id=parfums.',
      '- Aucun fichier modifié — la version précédente reste en ligne.',
      '- Vérifiez qu\'aucune désactivation en masse involontaire n\'a eu lieu dans admin.html.',
    ]);
    return;
  }

  const extraits = products.filter(p => !isSprayFormat(p.volume));
  const sprays = products.filter(p => isSprayFormat(p.volume));
  const prices = products.map(p => p.price_value).filter(v => v !== null && v !== undefined);
  const minPrice = prices.length ? Math.min(...prices) : null;

  const metaDescription = `Découvrez les ${products.length} parfums LeCode Paris : ${extraits.length} extraits de parfum 50 ml${minPrice != null ? ` à partir de ${minPrice.toFixed(0)} €` : ''} et ${sprays.length} sprays parfumés d'intérieur 250 ml. Commandez sur WhatsApp.`;

  const heroProduct = products[0];
  const heroImages = Array.isArray(heroProduct.images) ? heroProduct.images.filter(Boolean) : [];
  // Image manquante : repli sur le logo, comme le fait déjà la boutique principale (getProductCardImage).
  const heroImageRelative = heroImages[0] ? `../${heroImages[0]}` : '../logo-dar-nur.png';
  const heroImageAbsolute = heroImages[0] ? `https://dar-nur.fr/${heroImages[0]}` : 'https://dar-nur.fr/logo-dar-nur.png';
  const heroImageAlt = `${heroProduct.name} — Parfum LeCode Paris`;

  const template = await readFile(TEMPLATE_PATH, 'utf8');

  const cardsHtml = products.map(buildCardHtml).join('\n\n');
  const jsonLdItems = products.map(buildJsonLdItem).join(',\n');

  const html = template
    .replaceAll('{{PRODUCT_COUNT}}', String(products.length))
    .replaceAll('{{META_DESCRIPTION}}', esc(metaDescription))
    .replaceAll('{{HERO_IMAGE_URL}}', esc(heroImageRelative))
    .replaceAll('{{HERO_IMAGE_ABSOLUTE_URL}}', esc(heroImageAbsolute))
    .replaceAll('{{HERO_IMAGE_ALT}}', esc(heroImageAlt))
    .replace('{{JSONLD_ITEMS}}', jsonLdItems)
    .replace('{{PRODUCT_CARDS}}', cardsHtml);

  await writeFile(OUTPUT_PATH, html, 'utf8');

  const durationMs = Date.now() - start;
  log(`✔ parfums/index.html régénéré (${products.length} produits : ${extraits.length} extraits, ${sprays.length} sprays) en ${durationMs} ms.`);

  await writeSummary([
    '## Régénération /parfums/ — succès',
    '',
    `- Produits actifs : **${products.length}** (${extraits.length} extraits, ${sprays.length} sprays)`,
    `- Durée de génération : ${durationMs} ms`,
    '- Le commit ne sera créé que si le fichier a réellement changé (vérifié à l\'étape suivante du workflow).',
  ]);
}

main().catch(e => {
  fail(`Erreur inattendue : ${e.stack || e.message}`);
});
