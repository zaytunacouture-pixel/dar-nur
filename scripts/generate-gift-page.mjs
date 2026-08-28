#!/usr/bin/env node
// Régénère les blocs marqués de idees-cadeaux/index.html depuis Supabase.
//
// Même contrat que scripts/generate-category-pages.mjs : le fichier committé
// est à la fois la SOURCE (nav, hero, texte éditorial, CSS, CTA WhatsApp,
// footer) et la SORTIE — seuls les blocs délimités par les marqueurs
// <!-- AUTO:GIFT_*:START/END --> sont réécrits. Tout le reste n'est jamais
// touché.
//
// Source de vérité de la sélection : les colonnes products.gift_idea /
// gift_for_him / gift_for_her, administrables depuis admin.html
// (cf. supabase/sql/gift_ideas_migration.sql). Aucune liste de slugs n'est
// codée ici : ajouter ou retirer une idée cadeau ne demande jamais de
// toucher au code.
//
// Les tranches de budget ne sont PAS stockées : elles sont dérivées de
// products.price_value, la même valeur que celle affichée sur la carte.
//
// Aucune dépendance npm : fetch natif de Node (>=18).

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const PAGE_PATH = new URL('idees-cadeaux/index.html', ROOT);
const PAGE_URL = 'https://dar-nur.fr/idees-cadeaux/';

// Tranches de budget — bornes basses incluses, bornes hautes exclues.
// L'ordre est celui d'affichage des pilules.
export const BUDGETS = [
  { id: 'moins-20', label: 'Moins de 20 €', min: 0,  max: 20 },
  { id: '20-50',    label: '20 € à 50 €',   min: 20, max: 50 },
  { id: '50-plus',  label: '50 € et +',     min: 50, max: Infinity },
];

export const AUDIENCES = [
  { id: 'lui',  label: 'Pour lui',  field: 'gift_for_him' },
  { id: 'elle', label: 'Pour elle', field: 'gift_for_her' },
];

function log(msg) { console.log(msg); }
function warn(msg) { console.warn(`⚠ ${msg}`); }

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Le prix affiché sur une carte est products.price_value — pour un produit à
// variantes, c'est déjà le prix mini (cf. commentaire de la colonne dans
// supabase/schema.sql). Même formatage que generate-category-pages.mjs.
export function formatPriceLabel(priceValue) {
  if (priceValue === null || priceValue === undefined) return 'Prix à compléter';
  return `${Number(priceValue).toFixed(2).replace('.', ',')} €`;
}

export function hasActiveVariants(p) {
  return (p.product_variants || []).some(v => v.active !== false);
}

// Tranche de budget d'un produit, dérivée du seul price_value. Un produit sans
// prix n'appartient à aucune tranche : il reste visible sous « Toutes les
// idées » mais ne peut pas être classé sous un budget qu'on ne connaît pas.
export function budgetOf(p) {
  if (p.price_value === null || p.price_value === undefined) return null;
  const v = Number(p.price_value);
  return (BUDGETS.find(b => v >= b.min && v < b.max) || null)?.id ?? null;
}

// Chemins d'images : la page vit à /idees-cadeaux/, mais les images du dépôt
// sont référencées depuis la racine du site. Une URL Storage déjà absolue ou un
// chemin déjà absolu ne sont jamais préfixés (même règle que les autres
// générateurs).
export function resolveImagePath(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return path;
  return `/${path}`;
}

export function audiencesOf(p) {
  return AUDIENCES.filter(a => p[a.field] === true);
}

export function buildCard(p, catLabel, isFirst) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const imgSrc = images.length ? resolveImagePath(images[0]) : '/logo-dar-nur.png';
  const loading = isFirst ? 'eager' : 'lazy';

  const hasPrice = p.price_value !== null && p.price_value !== undefined;
  const priceLabel = formatPriceLabel(p.price_value);
  // « À partir de » uniquement quand le produit a réellement des déclinaisons
  // actives — annoncer un prix d'appel sur un prix unique serait faux
  // (même règle que cfg.pricePrefixOnlyWithVariants côté catégories).
  const priceHtml = (hasPrice && hasActiveVariants(p))
    ? `<small>À partir de</small>${esc(priceLabel)}`
    : esc(priceLabel);

  const budget = budgetOf(p);
  const auds = audiencesOf(p);

  // Attributs lus par le script de filtre de la page (destinataire + budget).
  const attrs =
    ` data-him="${p.gift_for_him === true ? '1' : '0'}"` +
    ` data-her="${p.gift_for_her === true ? '1' : '0'}"` +
    ` data-budget="${budget || ''}"` +
    (hasPrice ? ` data-price="${Number(p.price_value).toFixed(2)}"` : '');

  // Pastille destinataire : reprend l'information réellement portée par le
  // produit, jamais un texte générique. Un produit qui convient aux deux
  // l'affiche tel quel plutôt que de choisir à sa place.
  const audHtml = auds.length
    ? `\n        <div class="card-gift-for">${esc(auds.map(a => a.label).join(' · '))}</div>`
    : '';

  const tagline = (p.tagline || '').trim();
  const taglineBlock = tagline
    ? `\n        <p class="card-tagline">${esc(tagline)}</p>`
    : '\n        <p class="card-tagline">&nbsp;</p>';

  return `    <a href="https://dar-nur.fr/${esc(p.slug)}/" class="card"${attrs}>
      <div class="card-image"><img src="${esc(imgSrc)}" alt="${esc(p.name)} — Dar Nūr" loading="${loading}" width="400" height="400"/></div>
      <div class="card-body">
        <div class="cat-tag">${esc(catLabel || p.category_id)}</div>
        <h3>${esc(p.name)}</h3>${audHtml}${taglineBlock}
        <div class="card-footer">
          <div class="card-price">${priceHtml}</div>
          <span class="card-cta">Voir la fiche</span>
        </div>
      </div>
    </a>`;
}

// Pilules de filtre. Les effectifs sont dérivés des produits réels : ils ne
// peuvent pas diverger de la grille, puisque c'est le même passage qui produit
// les deux (même principe que cfg.lineCountsInLabels côté catégories).
export function buildFiltersHtml(products) {
  const countHim = products.filter(p => p.gift_for_him === true).length;
  const countHer = products.filter(p => p.gift_for_her === true).length;
  const budgetCounts = Object.fromEntries(
    BUDGETS.map(b => [b.id, products.filter(p => budgetOf(p) === b.id).length])
  );

  const audienceBtns = [
    `      <button class="active" data-for="all">Tous les destinataires (${products.length})</button>`,
    `      <button data-for="lui">Pour lui (${countHim})</button>`,
    `      <button data-for="elle">Pour elle (${countHer})</button>`,
  ].join('\n');

  const budgetBtns = [
    `      <button class="active" data-budget="all">Tous les budgets</button>`,
    ...BUDGETS.map(b => `      <button data-budget="${b.id}">${esc(b.label)} (${budgetCounts[b.id]})</button>`),
  ].join('\n');

  return `    <div class="filter-group">
      <span class="filter-legend" id="giftForLegend">Pour qui&nbsp;?</span>
      <div class="filters" id="filtersFor" role="group" aria-labelledby="giftForLegend">
${audienceBtns}
      </div>
    </div>
    <div class="filter-group">
      <span class="filter-legend" id="giftBudgetLegend">Budget</span>
      <div class="filters" id="filtersBudget" role="group" aria-labelledby="giftBudgetLegend">
${budgetBtns}
      </div>
    </div>`;
}

export function buildCountHtml(products) {
  const n = products.length;
  const unit = n > 1 ? 'idées cadeaux' : 'idée cadeau';
  return `  <p class="results-count" id="products-heading"><span id="resultsCount">${n}</span> ${unit}</p>`;
}

export function buildJsonLdHtml(products) {
  const items = products.map((p, i) =>
    `      {"@type": "ListItem", "position": ${i + 1}, "url": "https://dar-nur.fr/${p.slug}/", "name": ${JSON.stringify(p.name)}}`
  ).join(',\n');

  return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Idées cadeaux — Dar Nūr",
  "description": "Une sélection de produits Dar Nūr à offrir, classés par destinataire et par budget.",
  "url": "${PAGE_URL}",
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type": "ListItem", "position": 1, "name": "Dar Nūr", "item": "https://dar-nur.fr"},
      {"@type": "ListItem", "position": 2, "name": "Idées cadeaux", "item": "${PAGE_URL}"}
    ]
  },
  "mainEntity": {
    "@type": "ItemList",
    "name": "Nos idées cadeaux",
    "numberOfItems": ${products.length},
    "itemListElement": [
${items}
    ]
  }
}
</script>`;
}

// Remplacement strictement borné aux marqueurs — échoue bruyamment plutôt que
// d'écrire une page partielle si un marqueur a disparu.
export function replaceBlock(html, name, inner) {
  const start = `<!-- AUTO:${name}:START`;
  const end = `<!-- AUTO:${name}:END -->`;
  const si = html.indexOf(start);
  if (si === -1) throw new Error(`Marqueur ${start} introuvable dans idees-cadeaux/index.html`);
  const sEnd = html.indexOf('-->', si);
  if (sEnd === -1) throw new Error(`Marqueur ${start} non refermé`);
  const ei = html.indexOf(end, sEnd);
  if (ei === -1) throw new Error(`Marqueur ${end} introuvable (ou placé avant son START)`);
  return html.slice(0, sEnd + 3) + '\n' + inner + '\n' + html.slice(ei);
}

export function renderBlocks(html, products, catLabels) {
  const cards = products.map((p, i) => buildCard(p, catLabels.get(p.category_id), i === 0)).join('\n\n');
  let out = html;
  out = replaceBlock(out, 'GIFT_FILTERS', buildFiltersHtml(products));
  out = replaceBlock(out, 'GIFT_COUNT', buildCountHtml(products));
  out = replaceBlock(out, 'GIFT_PRODUCTS', cards);
  out = replaceBlock(out, 'GIFT_JSONLD', buildJsonLdHtml(products));
  return out;
}

// ── Supabase ──────────────────────────────────────────────────────────────
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
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`Supabase a répondu ${res.status} ${res.statusText} (${url})\n${body}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return JSON.parse(body);
}

async function main() {
  const creds = await loadSupabaseCreds();

  let products;
  try {
    products = await fetchJson(
      `${creds.url}/rest/v1/products?select=*,product_variants(*)&active=eq.true&gift_idea=is.true&order=sort_order.asc`,
      creds
    );
  } catch (e) {
    // 42703 = colonne inexistante : la migration gift_ideas_migration.sql n'a
    // pas encore été exécutée. Ce n'est pas une panne — on ne touche pas la
    // page (elle garde sa sélection publiée) et on sort proprement, pour ne
    // pas faire échouer le workflow des autres générateurs.
    if (e.status === 400 && /42703|gift_idea/.test(e.body || '')) {
      log('::notice::Colonnes « idées cadeaux » absentes en base — page laissée telle quelle. Exécuter supabase/sql/gift_ideas_migration.sql pour activer la synchronisation.');
      return;
    }
    throw e;
  }

  // Garde-fou : ne jamais publier un univers cadeau vide — la page garde sa
  // sélection précédente plutôt que de se vider d'un coup.
  //
  // Sortie en code 0, et non une erreur : ce générateur partage son workflow
  // avec generate-product-pages.mjs et generate-category-pages.mjs, et l'étape
  // de commit vient APRÈS lui. Échouer ici empêcherait de committer les 237
  // fiches et les 14 pages catégories déjà régénérées — un rayon d'action sans
  // rapport avec la page cadeaux. L'avertissement reste visible dans le journal
  // du workflow, et aucun octet n'est écrit.
  if (!products.length) {
    log('::warning::Aucun produit actif avec gift_idea = true — page cadeaux laissée telle quelle (sélection précédente conservée). Cocher au moins une « Idée cadeau » dans admin.html pour la resynchroniser.');
    return;
  }

  const seen = new Set();
  for (const p of products) {
    if (seen.has(p.slug)) throw new Error(`Deux produits actifs partagent le slug "${p.slug}"`);
    seen.add(p.slug);
  }

  const catRows = await fetchJson(`${creds.url}/rest/v1/categories?select=id,label`, creds);
  const catLabels = new Map(catRows.map(c => [c.id, c.label]));

  // Avertissements non bloquants : une donnée à corriger côté admin n'est pas
  // une raison de refuser de publier (même arbitrage que les homonymes dans
  // generate-category-pages.mjs).
  const orphans = products.filter(p => !audiencesOf(p).length);
  if (orphans.length) {
    warn(`${orphans.length} idée(s) cadeau sans destinataire (ni « Pour lui » ni « Pour elle ») — visibles seulement sous « Tous les destinataires » : ${orphans.map(p => p.slug).join(', ')}`);
  }
  const priceless = products.filter(p => budgetOf(p) === null);
  if (priceless.length) {
    warn(`${priceless.length} idée(s) cadeau sans prix — non classables par budget : ${priceless.map(p => p.slug).join(', ')}`);
  }

  const html = await readFile(PAGE_PATH, 'utf8');
  const out = renderBlocks(html, products, catLabels);

  if (out === html) {
    log('✓ idees-cadeaux/index.html déjà à jour — aucun octet réécrit.');
    return;
  }
  await writeFile(PAGE_PATH, out, 'utf8');
  log(`✓ idees-cadeaux/index.html régénéré — ${products.length} idées cadeaux.`);
}

// Exécuté seulement en ligne de commande : les fonctions ci-dessus restent
// importables pour vérification hors ligne.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
