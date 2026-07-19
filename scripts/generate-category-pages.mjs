#!/usr/bin/env node
// Régénère, pour chaque page catégorie statique listée dans CATEGORY_PAGES,
// les 3 blocs marqués <!-- AUTO:CATEGORY_*:START/END --> (grille produits,
// compteur de résultats, JSON-LD) depuis Supabase — le reste du fichier
// (nav, hero, texte éditorial, footer, CSS) n'est jamais touché, exactement
// comme <!-- AUTO:NAV:START/END --> déjà géré par scripts/build-nav.mjs.
//
// Contrairement à generate-parfums.mjs / generate-product-pages.mjs, il n'y
// a pas de gabarit séparé : le fichier <dir>/index.html committé EST à la
// fois la source (contenu éditorial + markup) et la sortie (blocs marqués
// réécrits en place). Ajouter une nouvelle catégorie à ce pipeline = ajouter
// une entrée à CATEGORY_PAGES + poser les 3 marqueurs une fois dans le
// fichier existant — jamais de refonte du fichier.
//
// Ne dépend pas de js/config.js pour rester cohérent avec le style des
// autres scripts generate-*, mais lit la même clé anon publique (déjà
// commitée, lecture seule RLS) — pas de secret nécessaire.
//
// Aucune dépendance npm : fetch natif de Node (>=18).

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);

function log(msg) { console.log(msg); }
function fail(msg) { console.error(`::error::${msg}`); process.exitCode = 1; }

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escJson(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\u003C');
}

// Une image peut être un chemin relatif au dépôt OU une URL Supabase Storage
// déjà absolue (upload admin.html) — ne jamais préfixer une URL déjà absolue
// (même bug/même correctif que scripts/generate-parfums.mjs et
// scripts/generate-product-pages.mjs).
function resolveImagePath(prefix, path) {
  return /^https?:\/\//i.test(path) ? path : `${prefix}${path}`;
}

function formatPriceLabel(priceValue) {
  if (priceValue === null || priceValue === undefined) return 'Prix à compléter';
  return `${Number(priceValue).toFixed(2).replace('.', ',')} €`;
}

async function loadSupabaseCreds() {
  const raw = await readFile(new URL('js/config.js', ROOT), 'utf8');
  const urlMatch = raw.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
  const keyMatch = raw.match(/SUPABASE_ANON\s*=\s*'([^']+)'/);
  if (!urlMatch || !keyMatch) {
    throw new Error("Impossible de lire SUPABASE_URL/SUPABASE_ANON depuis js/config.js");
  }
  return { url: urlMatch[1], key: keyMatch[1] };
}

async function fetchJson(url, creds) {
  const res = await fetch(url, { headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` } });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status} ${res.statusText} (${url})`);
  return res.json();
}

// Extraction/remplacement par marqueurs exacts — même principe que
// scripts/build-nav.mjs / scripts/generate-parfums.mjs, réimplémenté
// localement plutôt qu'importé (aucun couplage de code entre générateurs).
function replaceMarkedBlock(html, name, newInner, label) {
  const startMarker = `<!-- AUTO:${name}:START`;
  const endMarker = `<!-- AUTO:${name}:END -->`;
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1) throw new Error(`Marqueur "${startMarker}" introuvable (${label})`);
  if (endIdx === -1) throw new Error(`Marqueur "${endMarker}" introuvable (${label})`);
  if (endIdx < startIdx) throw new Error(`Marqueur "${endMarker}" trouvé avant son START (${label})`);

  const startLineEnd = html.indexOf('\n', startIdx);
  const before = html.slice(0, startLineEnd + 1);
  const after = html.slice(endIdx);
  return `${before}${newInner}\n    ${after}`;
}

function buildCardHtml(p, tagLabel, isFirst) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const img = images[0] || null;
  const imgSrc = img ? resolveImagePath('../', img) : '../logo-dar-nur.png';
  const loading = isFirst ? 'eager' : 'lazy';
  const priceLabel = formatPriceLabel(p.price_value);

  return `    <a href="https://dar-nur.fr/${esc(p.slug)}/" class="card">
      <div class="card-image"><img src="${esc(imgSrc)}" alt="${esc(p.name)} — Dar Nūr" loading="${loading}" width="400" height="400"/></div>
      <div class="card-body">
        <div class="cat-tag">${esc(tagLabel)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="card-tagline">${esc(p.tagline || '')}</p>
        <div class="card-footer">
          <div class="card-price">${esc(priceLabel)}</div>
          <span class="card-cta">Voir la fiche</span>
        </div>
      </div>
    </a>`;
}

function pluralize(n, singular, plural) {
  return `${n} ${n > 1 ? plural : singular}`;
}

function buildJsonLd(cfg, products) {
  const items = products
    .map((p, i) => `      {"@type": "ListItem", "position": ${i + 1}, "url": "https://dar-nur.fr/${escJson(p.slug)}/", "name": "${escJson(p.name)}"}`)
    .join(',\n');

  return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "${escJson(cfg.jsonLdName)}",
  "description": "${escJson(cfg.jsonLdDescription)}",
  "url": "${cfg.canonicalUrl}",
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type": "ListItem", "position": 1, "name": "Dar Nūr", "item": "https://dar-nur.fr"},
      {"@type": "ListItem", "position": 2, "name": "${escJson(cfg.breadcrumbName)}", "item": "${cfg.canonicalUrl}"}
    ]
  },
  "mainEntity": {
    "@type": "ItemList",
    "name": "${escJson(cfg.itemListName)}",
    "numberOfItems": ${products.length},
    "itemListElement": [
${items}
    ]
  }
}
</script>`;
}

// ============================================================================
// Configuration des pages catégories couvertes par ce pipeline. Une seule
// entrée pour l'instant (Miels Gourmands) — chantier ouvert explicitement
// limité à cette collection le temps de la vérifier de bout en bout ; les
// autres catégories seront ajoutées ici une à une, jamais en bloc.
// ============================================================================
const CATEGORY_PAGES = [
  {
    categoryId: 'miels-gourmands',
    dir: 'miels-gourmands',
    canonicalUrl: 'https://dar-nur.fr/miels-gourmands/',
    jsonLdName: 'Miels Gourmands — Dar Nūr',
    jsonLdDescription: 'Collection de miels gourmands aux fruits — préparations à base de miel pur récolté en France.',
    breadcrumbName: 'Miels Gourmands',
    itemListName: 'Nos Miels Gourmands',
    unitSingular: 'miel gourmand',
    unitPlural: 'miels gourmands',
  },
];

async function generateCategoryPage(cfg, creds) {
  const pagePath = new URL(`${cfg.dir}/index.html`, ROOT);
  let html = await readFile(pagePath, 'utf8');

  const [products, categoryRows] = await Promise.all([
    fetchJson(`${creds.url}/rest/v1/products?select=*&category_id=eq.${cfg.categoryId}&active=eq.true&order=sort_order.asc`, creds),
    fetchJson(`${creds.url}/rest/v1/categories?select=label&id=eq.${cfg.categoryId}`, creds),
  ]);

  if (!products.length) {
    fail(`${cfg.dir}/ : 0 produit actif pour category_id=${cfg.categoryId} — abandon pour ne pas publier une collection vide.`);
    return false;
  }

  const tagLabel = categoryRows[0]?.label || cfg.breadcrumbName;

  const cardsHtml = products.map((p, i) => buildCardHtml(p, tagLabel, i === 0)).join('\n');
  const countHtml = `    <p class="results-count" style="padding:0">${esc(pluralize(products.length, cfg.unitSingular, cfg.unitPlural))} disponible${products.length > 1 ? 's' : ''}</p>`;
  const jsonLdHtml = buildJsonLd(cfg, products);

  html = replaceMarkedBlock(html, 'CATEGORY_PRODUCTS', cardsHtml, `${cfg.dir}/index.html`);
  html = replaceMarkedBlock(html, 'CATEGORY_COUNT', countHtml, `${cfg.dir}/index.html`);
  html = replaceMarkedBlock(html, 'CATEGORY_JSONLD', jsonLdHtml, `${cfg.dir}/index.html`);

  await writeFile(pagePath, html, 'utf8');
  log(`  ${cfg.dir}/ : ${products.length} produit(s) actif(s) régénéré(s).`);
  return true;
}

async function main() {
  log('▶ Génération des pages catégories (blocs marqués) depuis Supabase');
  const creds = await loadSupabaseCreds();

  let anyFailure = false;
  for (const cfg of CATEGORY_PAGES) {
    try {
      const ok = await generateCategoryPage(cfg, creds);
      if (!ok) anyFailure = true;
    } catch (e) {
      fail(`${cfg.dir}/ : ${e.message}`);
      anyFailure = true;
    }
  }

  if (anyFailure) {
    process.exitCode = 1;
    return;
  }
  log('✔ Pages catégories régénérées.');
}

main().catch(e => {
  fail(`Erreur inattendue : ${e.stack || e.message}`);
});
