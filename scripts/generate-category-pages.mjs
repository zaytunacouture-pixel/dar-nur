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
  if (/^https?:\/\//i.test(path)) return path;          // URL Storage deja absolue
  if (path.startsWith('/')) return path;                 // deja absolu depuis la racine du site
  return `${prefix}${path}`;
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

// Résout la "ligne" (famille de produits) d'un produit à partir de cfg.lines,
// utilisée à la fois pour l'attribut data-line des cartes et pour les pilules de
// filtre. Retourne null si aucune règle ne correspond — le garde-fou de
// generateCategoryPage() abandonne alors sans rien écrire (même philosophie que
// le garde-fou "produit sans marque" de scripts/generate-parfums.mjs).
function resolveLine(p, cfg) {
  if (!cfg.lines) return null;
  for (const line of cfg.lines) {
    if (line.match.test(p.slug)) return line.id;
  }
  return null;
}

// Un produit a-t-il de vraies déclinaisons (taille, format...) ? Sert au mode
// cfg.pricePrefixOnlyWithVariants. On exige à la fois un axe déclaré et au moins
// une variante active : un axe sans variante ne produit aucun choix réel.
function hasActiveVariants(p) {
  const axes = Array.isArray(p.variant_axes) ? p.variant_axes : [];
  const variants = Array.isArray(p.product_variants) ? p.product_variants : [];
  return axes.length > 0 && variants.some(v => v.active !== false);
}

function buildCardHtml(p, tagLabel, isFirst, cfg) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const img = images[0] || null;
  // Prefixe d'image propre a la page : tahara/ et miels-gourmands/ ecrivent des
  // chemins relatifs (`../`), qamis/ des chemins absolus depuis la racine (`/`).
  // Les deux resolvent vers la meme cible depuis /<categorie>/ ; on suit le
  // gabarit deja en place sur chaque page plutot que d'en imposer un.
  const imagePrefix = cfg.imagePrefix || '../';
  const imgSrc = img ? resolveImagePath(imagePrefix, img) : `${imagePrefix}logo-dar-nur.png`;
  const loading = isFirst ? 'eager' : 'lazy';
  const hasPrice = p.price_value !== null && p.price_value !== undefined;
  const priceLabel = formatPriceLabel(p.price_value);

  // Préfixe "À partir de" : choix de gabarit propre à certaines pages (tahara),
  // jamais appliqué quand le prix est absent (sinon "À partir de Prix à compléter").
  // Avec cfg.pricePrefixOnlyWithVariants, le préfixe n'est posé que sur les
  // produits qui ont réellement plusieurs déclinaisons (qamis/ : les Qamis
  // Saoudiens ont des tailles, les Qamiss Sultan Saphir non — annoncer "à partir
  // de" sur un prix unique serait faux). Sans cette option, comportement
  // inchangé : préfixe systématique dès qu'il y a un prix.
  const showPrefix = cfg.pricePrefix && hasPrice
    && (!cfg.pricePrefixOnlyWithVariants || hasActiveVariants(p));
  const priceHtml = showPrefix
    ? `<small>${esc(cfg.pricePrefix)}</small>${esc(priceLabel)}`
    : esc(priceLabel);

  // Attributs de filtre/tri client-side. N'existent que sur les pages qui les
  // utilisent déjà — aucune page n'en reçoit qui n'en avait pas.
  let attrs = '';
  if (cfg.lines) attrs += ` data-line="${esc(resolveLine(p, cfg))}"`;
  if (cfg.emitDataPrice && hasPrice) attrs += ` data-price="${Number(p.price_value).toFixed(2)}"`;

  // Tagline vide → espace insécable, pour que la carte garde la même hauteur que
  // ses voisines dans la grille (comportement déjà en place à la main sur tahara/).
  const tagline = (p.tagline || '').trim();
  const taglineHtml = tagline ? esc(tagline) : '&nbsp;';

  return `    <a href="https://dar-nur.fr/${esc(p.slug)}/" class="card"${attrs}>
      <div class="card-image"><img src="${esc(imgSrc)}" alt="${esc(p.name)} — Dar Nūr" loading="${loading}" width="400" height="400"/></div>
      <div class="card-body">
        <div class="cat-tag">${esc(tagLabel)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="card-tagline">${taglineHtml}</p>
        <div class="card-footer">
          <div class="card-price">${priceHtml}</div>
          <span class="card-cta">Voir la fiche</span>
        </div>
      </div>
    </a>`;
}

// Pilules de filtre, générées depuis cfg.lines pour qu'elles ne puissent pas
// diverger des attributs data-line des cartes (c'est précisément ce type de
// dérive main/base que ce pipeline supprime).
function buildFiltersHtml(cfg) {
  const buttons = [`      <button class="active" data-line="all">${esc(cfg.allLinesLabel || 'Toutes')}</button>`]
    .concat(cfg.lines.map(l => `      <button data-line="${esc(l.id)}">${esc(l.label)}</button>`));
  return ['    <div class="filters" id="filters">', ...buttons, '    </div>'].join('\n');
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
  {
    // Canari n°2 du pipeline. Cette page avait 10 cartes écrites à la main pour
    // 34 produits actifs en base — les 24 manquants n'avaient aucun lien entrant.
    // Elle est la première à utiliser lines/pricePrefix/emitDataPrice, parce que
    // son gabarit historique porte des pilules de filtre et un tri par prix qui
    // doivent continuer à fonctionner à l'identique.
    categoryId: 'tahara',
    dir: 'tahara',
    canonicalUrl: 'https://dar-nur.fr/tahara/',
    jsonLdName: 'Tahara & Hygiène — Dar Nūr',
    jsonLdDescription: "Muscs Tahara, packs, coffrets, savons noirs, gommages et poudres de soin pour la pureté. Collection Dar Nūr.",
    breadcrumbName: 'Tahara & Hygiène',
    itemListName: 'Nos produits Tahara & Hygiène',
    unitSingular: 'produit',
    unitPlural: 'produits',

    // Gabarit de carte propre à cette page (déjà en place à la main avant automatisation).
    pricePrefix: 'À partir de',
    emitDataPrice: true,
    cardSeparator: '\n\n',

    // Compteur : structure propre à tahara/ (span ciblé par le script de filtre,
    // + id référencé par l'aria-labelledby de <section class="products-section">).
    buildCountHtml: (n) => `  <p class="results-count" id="products-heading"><span id="resultsCount">${n}</span> produit${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</p>`,

    // Familles réelles, dérivées des préfixes de slug du catalogue — aucune
    // taxonomie inventée, chaque libellé reprend le nom des produits concernés.
    // Les 3 premières existaient déjà à l'identique dans la page.
    // Ordre = ordre d'affichage des pilules.
    lines: [
      { id: 'pack',      label: 'Pack Tahara',         match: /^dn-pack-tahara-/ },
      { id: 'musc',      label: 'Musc Tahara',         match: /^dn-musc-tahara-/ },
      { id: 'coffret',   label: 'Coffret / Lot',       match: /^dn-lot-nissah-/ },
      { id: 'savon',     label: 'Savons',              match: /^savon-/ },
      { id: 'gommage',   label: 'Gommages',            match: /^gommage-/ },
      { id: 'poudre',    label: 'Poudres',             match: /^poudre-/ },
      { id: 'chantilly', label: 'Chantilly de karité', match: /^chantilly-karite-/ },
      { id: 'alun',      label: "Pierre d'alun",       match: /^pierre-alun-/ },
    ],
  },
  {
    // Canari n°3. Page sans pilules ni tri : le gabarit historique n'affiche
    // qu'un compteur de résultats, comme miels-gourmands/. Trois écarts propres
    // à cette page, tous couverts par configuration (aucune logique "qamis"
    // n'entre dans le template générique) :
    //   - images en chemin absolu depuis la racine   -> imagePrefix
    //   - pastille "Mode homme" au lieu du label     -> tagLabel
    //     Supabase "Qamis saoudien"
    //   - "À partir de" seulement sur les references -> pricePrefixOnlyWithVariants
    //     qui ont de vraies tailles
    categoryId: 'qamis',
    dir: 'qamis',
    canonicalUrl: 'https://dar-nur.fr/qamis/',
    jsonLdName: 'Qamis Saoudiens — Dar Nūr',
    jsonLdDescription: "Qamis saoudiens à la coupe artisanale raffinée, disponibles en plusieurs tailles, et ligne Qamiss Sultan Saphir. Collection Dar Nūr.",
    breadcrumbName: 'Qamis saoudiens',
    itemListName: 'Nos Qamis Saoudiens',
    unitSingular: 'qamis',
    unitPlural: 'qamis',

    tagLabel: 'Mode homme',
    imagePrefix: '/',
    pricePrefix: 'À partir de',
    pricePrefixOnlyWithVariants: true,
    cardSeparator: '\n\n',
  },
];

async function generateCategoryPage(cfg, creds) {
  const pagePath = new URL(`${cfg.dir}/index.html`, ROOT);
  let html = await readFile(pagePath, 'utf8');

  const [products, categoryRows] = await Promise.all([
    fetchJson(`${creds.url}/rest/v1/products?select=*,product_variants(*)&category_id=eq.${cfg.categoryId}&active=eq.true&order=sort_order.asc`, creds),
    fetchJson(`${creds.url}/rest/v1/categories?select=label&id=eq.${cfg.categoryId}`, creds),
  ]);

  if (!products.length) {
    fail(`${cfg.dir}/ : 0 produit actif pour category_id=${cfg.categoryId} — abandon pour ne pas publier une collection vide.`);
    return false;
  }

  // Libellé de la pastille .cat-tag. Par défaut le label Supabase de la
  // catégorie ; cfg.tagLabel permet de conserver le libellé déjà affiché sur une
  // page quand il diffère volontairement (qamis/ affiche "Mode homme" alors que
  // categories.label vaut "Qamis saoudien").
  const tagLabel = cfg.tagLabel || categoryRows[0]?.label || cfg.breadcrumbName;

  // Garde-fou : deux produits actifs ne peuvent pas partager un slug — cela
  // produirait deux cartes vers la même URL et deux ListItem identiques.
  const slugCounts = new Map();
  for (const prod of products) slugCounts.set(prod.slug, (slugCounts.get(prod.slug) || 0) + 1);
  const dupSlugs = [...slugCounts.entries()].filter(([, n]) => n > 1).map(([slug]) => slug);
  if (dupSlugs.length) {
    fail(`${cfg.dir}/ : slug(s) dupliqué(s) parmi les produits actifs — abandon, aucun fichier touché : ${dupSlugs.join(', ')}`);
    return false;
  }

  // Avertissement non bloquant : des produits homonymes donnent des cartes
  // visuellement indiscernables (seule la tagline les distingue). C'est une
  // donnée à corriger côté admin, pas une raison de refuser de publier.
  const nameCounts = new Map();
  for (const prod of products) nameCounts.set(prod.name, (nameCounts.get(prod.name) || 0) + 1);
  const dupNames = [...nameCounts.entries()].filter(([, n]) => n > 1);
  for (const [name, n] of dupNames) {
    log(`  ⚠ ${cfg.dir}/ : ${n} produits actifs portent le même nom « ${name} » — cartes indiscernables hors tagline.`);
  }

  // Garde-fou : sur une page à pilules de filtre, un produit actif qu'aucune ligne
  // ne classe serait publié avec data-line="null" et deviendrait invisible dès
  // qu'un filtre est cliqué. On abandonne sans rien écrire, en nommant les coupables
  // (même philosophie que le garde-fou "produit sans marque" de generate-parfums.mjs).
  if (cfg.lines) {
    const unclassified = products.filter(p => resolveLine(p, cfg) === null);
    if (unclassified.length) {
      fail(`${cfg.dir}/ : ${unclassified.length} produit(s) actif(s) ne correspondent à aucune ligne de cfg.lines — abandon, aucun fichier touché. Slugs : ${unclassified.map(p => p.slug).join(', ')}`);
      return false;
    }
  }

  const cardsHtml = products.map((p, i) => buildCardHtml(p, tagLabel, i === 0, cfg)).join(cfg.cardSeparator || '\n');
  const countHtml = cfg.buildCountHtml
    ? cfg.buildCountHtml(products.length)
    : `    <p class="results-count" style="padding:0">${esc(pluralize(products.length, cfg.unitSingular, cfg.unitPlural))} disponible${products.length > 1 ? 's' : ''}</p>`;
  const jsonLdHtml = buildJsonLd(cfg, products);

  html = replaceMarkedBlock(html, 'CATEGORY_PRODUCTS', cardsHtml, `${cfg.dir}/index.html`);
  html = replaceMarkedBlock(html, 'CATEGORY_COUNT', countHtml, `${cfg.dir}/index.html`);
  html = replaceMarkedBlock(html, 'CATEGORY_JSONLD', jsonLdHtml, `${cfg.dir}/index.html`);
  if (cfg.lines) {
    html = replaceMarkedBlock(html, 'CATEGORY_FILTERS', buildFiltersHtml(cfg), `${cfg.dir}/index.html`);
  }

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
