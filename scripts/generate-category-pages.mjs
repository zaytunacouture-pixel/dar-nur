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
function lineSourceValue(p, cfg) {
  const field = cfg.lineSource || 'slug';
  const raw = p[field];
  return raw === null || raw === undefined ? '' : String(raw).trim();
}

function resolveLine(p, cfg) {
  if (!cfg.lines) return null;
  // Valeur vide = non classable. On ne teste surtout pas les regex contre une
  // chaine vide : "" matcherait n'importe quel motif non ancre, et le produit
  // serait range dans un groupe arbitraire au lieu d'etre signale.
  const value = lineSourceValue(p, cfg);
  if (!value) return null;
  for (const line of cfg.lines) {
    if (line.match.test(value)) return line;
  }
  return null;
}

function resolveLineId(p, cfg) {
  const line = resolveLine(p, cfg);
  return line ? line.id : null;
}

// Un produit a-t-il de vraies déclinaisons (taille, format...) ? Sert au mode
// cfg.pricePrefixOnlyWithVariants. On exige à la fois un axe déclaré et au moins
// une variante active : un axe sans variante ne produit aucun choix réel.
function hasActiveVariants(p) {
  const axes = Array.isArray(p.variant_axes) ? p.variant_axes : [];
  const variants = Array.isArray(p.product_variants) ? p.product_variants : [];
  return axes.length > 0 && variants.some(v => v.active !== false);
}

function buildCardHtml(p, pageTagLabel, isFirst, cfg) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  const img = images[0] || null;
  // Prefixe d'image propre a la page : tahara/ et miels-gourmands/ ecrivent des
  // chemins relatifs (`../`), qamis/ des chemins absolus depuis la racine (`/`).
  // Les deux resolvent vers la meme cible depuis /<categorie>/ ; on suit le
  // gabarit deja en place sur chaque page plutot que d'en imposer un.
  const imagePrefix = cfg.imagePrefix || '../';
  const imgSrc = img ? resolveImagePath(imagePrefix, img) : `${imagePrefix}logo-dar-nur.png`;

  // Dimensions intrinseques annoncees sur <img>. Defaut 400x400 : le ratio 1/1
  // impose par .card-image sur toutes les pages passees au pipeline jusqu'ici.
  // Une page dont la grille n'est pas carree doit annoncer SON ratio, sinon le
  // navigateur reserve une boite au mauvais rapport avant le decodage de
  // l'image (saut de mise en page). Opt-in : sans cfg.imageWidth/imageHeight la
  // sortie reste 400x400, strictement inchangee pour les pages deja generees.
  // Validation stricte, dans le meme esprit que la liste fermee de cfg.priceTag :
  // une faute de config ne doit pas ecrire "NaN" ou un attribut vide dans
  // chaque carte de la page.
  const imageWidth = cfg.imageWidth ?? 400;
  const imageHeight = cfg.imageHeight ?? 400;
  for (const [key, value] of [['imageWidth', imageWidth], ['imageHeight', imageHeight]]) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`cfg.${key}=${JSON.stringify(value)} invalide — entier strictement positif attendu.`);
    }
  }

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

  // Balise portant .card-price. Les pages écrites à la main n'ont pas toutes
  // choisi le même élément (huiles/ utilise <span>, les autres <div>) ; le
  // rendu est identique — .card-price est un sélecteur de classe pur et le nœud
  // est un item flex de .card-footer, donc blockifié dans les deux cas — mais
  // normaliser silencieusement le markup existant reviendrait à réécrire des
  // lignes que ce pipeline n'a pas vocation à toucher. Option opt-in : sans
  // cfg.priceTag, la sortie reste <div>, inchangée pour toutes les pages déjà
  // générées. Liste fermée : cfg.priceTag n'est pas interpolé tel quel, sinon
  // une faute de config injecterait du markup arbitraire dans chaque carte.
  const PRICE_TAGS = ['div', 'span'];
  const priceTag = cfg.priceTag || 'div';
  if (!PRICE_TAGS.includes(priceTag)) {
    throw new Error(`cfg.priceTag="${priceTag}" invalide — valeurs acceptées : ${PRICE_TAGS.join(', ')}`);
  }

  // Attributs de filtre/tri client-side. N'existent que sur les pages qui les
  // utilisent déjà — aucune page n'en reçoit qui n'en avait pas.
  let attrs = '';
  // Nom d'attribut configurable : data-line (tahara/) ou data-prov (miels/) —
  // c'est le script de filtre deja present sur la page qui impose le nom.
  if (cfg.lines) attrs += ` data-${esc(cfg.lineAttribute || 'line')}="${esc(resolveLineId(p, cfg))}"`;
  if (cfg.emitDataPrice && hasPrice) attrs += ` data-price="${Number(p.price_value).toFixed(2)}"`;

  // Tagline vide → espace insécable par défaut, pour que la carte garde la même
  // hauteur que ses voisines dans la grille (comportement déjà en place à la main
  // sur tahara/). Avec cfg.omitEmptyTagline, le paragraphe est omis entièrement :
  // utile quand AUCUN produit de la catégorie n'a de tagline (chechias/), où un
  // espace insécable ajouterait une hauteur de ligne vide sur chaque carte sans
  // rien aligner.
  const tagline = (p.tagline || '').trim();
  const taglineBlock = tagline
    ? `\n        <p class="card-tagline">${esc(tagline)}</p>`
    : (cfg.omitEmptyTagline ? '' : '\n        <p class="card-tagline">&nbsp;</p>');

  // Pastille de provenance. Le libelle ne vient pas brut de Supabase : il est
  // porte par la regle de groupe qui a classe le produit (cfg.lines[].chip),
  // parce que plusieurs valeurs de provenance partagent le meme libelle affiche
  // (miels/ : "France" et "Preparation artisanale" -> "Prepare en France").
  const line = cfg.lines ? resolveLine(p, cfg) : null;
  const chipHtml = (line && line.chip)
    ? `\n        <div class="meta-chip">${esc(line.chip)}</div>`
    : '';

  // Libelle de la pastille .cat-tag. Trois niveaux, du plus specifique au plus
  // general : la ligne qui a classe le produit (cfg.lines[].tagLabel), puis le
  // libelle de page (cfg.tagLabel), puis categories.label — c'est ce dernier
  // qui est passe ici dans pageTagLabel. Necessaire pour poudres/, dont les
  // cartes n'affichent pas toutes la meme pastille : "Poudre naturelle" sur la
  // ligne poudre, "Graine naturelle" sur la ligne graine. Opt-in : aucune page
  // existante ne declare lines[].tagLabel, leur sortie est donc inchangee.
  const cardTagLabel = (line && line.tagLabel) || pageTagLabel;

  // Etat "Disponible prochainement", pilote uniquement par products.coming_soon.
  // Donnee metier generique : aucune categorie, aucun slug, aucune liste n'est
  // traite a part — la carte se marque des que le champ vaut true, pour
  // n'importe quel produit, aujourd'hui ou demain. Comparaison stricte a true
  // et non coercition, meme defensive que index.html (`p.coming_soon || false`)
  // : une valeur absente ou null vaut donc false.
  // La carte reste un lien vers la fiche et garde son prix — c'est la fiche qui
  // neutralise le bouton de commande (cf. index.html, `p.coming_soon===true`).
  const comingSoonBlock = p.coming_soon === true
    ? '\n        <div class="card-soon">Disponible prochainement</div>'
    : '';

  // Badge "Idée cadeau", pilote uniquement par products.gift_idea. Meme
  // arbitrage que coming_soon ci-dessus : donnee metier generique, aucune
  // categorie ni aucun slug traite a part, comparaison stricte a true (une
  // colonne absente en base — migration gift_ideas_migration.sql non encore
  // executee — vaut donc false, et aucune carte n'est marquee).
  const giftBlock = p.gift_idea === true
    ? '\n        <div class="card-gift">&#127873; Idée cadeau</div>'
    : '';

  return `    <a href="https://dar-nur.fr/${esc(p.slug)}/" class="card"${attrs}>
      <div class="card-image"><img src="${esc(imgSrc)}" alt="${esc(p.name)} — Dar Nūr" loading="${loading}" width="${imageWidth}" height="${imageHeight}"/></div>
      <div class="card-body">
        <div class="cat-tag">${esc(cardTagLabel)}</div>
        <h3>${esc(p.name)}</h3>${chipHtml}${taglineBlock}${giftBlock}${comingSoonBlock}
        <div class="card-footer">
          <${priceTag} class="card-price">${priceHtml}</${priceTag}>
          <span class="card-cta">Voir la fiche</span>
        </div>
      </div>
    </a>`;
}

// Pilules de filtre, générées depuis cfg.lines pour qu'elles ne puissent pas
// diverger des attributs data-line des cartes (c'est précisément ce type de
// dérive main/base que ce pipeline supprime).
function buildFiltersHtml(cfg, products) {
  const attr = cfg.lineAttribute || 'line';
  // cfg.lineCountsInLabels : certaines pages affichent le nombre dans la pilule
  // ("Tous (18)"). Ce compte est alors derive des produits reellement generes,
  // il ne peut donc pas diverger de la grille.
  const count = (id) => products.filter(p => resolveLineId(p, cfg) === id).length;
  const suffix = (n) => cfg.lineCountsInLabels ? ` (${n})` : '';
  const buttons = [`      <button class="active" data-${attr}="all">${esc(cfg.allLinesLabel || 'Toutes')}${suffix(products.length)}</button>`]
    .concat(cfg.lines.map(l => `      <button data-${attr}="${esc(l.id)}">${esc(l.label)}${suffix(count(l.id))}</button>`));
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
  {
    // Canari n°4. Premier cas ou le regroupement ne se fait pas sur le slug mais
    // sur un champ editorial de Supabase : products.provenance. Trois nouveautes
    // par rapport aux pages precedentes :
    //   - attribut de filtre data-prov (et non data-line)  -> lineAttribute
    //   - pastille .meta-chip sous le titre                -> lines[].chip
    //   - compteur affiche dans le libelle des pilules     -> lineCountsInLabels
    //
    // La correspondance provenance -> groupe n'est PAS un passe-plat : plusieurs
    // valeurs distinctes partagent un meme libelle affiche. Le garde-fou refuse
    // de generer si une valeur de provenance ne correspond a aucune regle (ou si
    // elle est vide), plutot que de ranger le produit dans un groupe arbitraire.
    categoryId: 'miels',
    dir: 'miels',
    canonicalUrl: 'https://dar-nur.fr/miels/',
    jsonLdName: 'Miels Artisanaux — Dar Nūr',
    jsonLdDescription: "Collection de miels artisanaux premium — Nigelle, Sidr, Aphrodisiaque, Spiruline, Costus, Shilajit et bien d'autres.",
    breadcrumbName: 'Miels Artisanaux',
    itemListName: 'Nos Miels Artisanaux',
    unitSingular: 'miel',
    unitPlural: 'miels',

    // categories.label vaut "Miel thérapeutique" en base, mais toute la page est
    // construite sur "artisanal" (badge du hero, <h1>, <title>, JSON-LD). On garde
    // le libellé déjà affiché plutôt que d'introduire une incohérence visuelle
    // entre la pastille d'une carte et le badge juste au-dessus.
    tagLabel: 'Miel artisanal',

    pricePrefix: 'À partir de',
    pricePrefixOnlyWithVariants: true,
    emitDataPrice: true,
    cardSeparator: '\n\n',
    buildCountHtml: (n) => `  <p class="results-count" id="products-heading"><span id="resultsCount">${n}</span> miel${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</p>`,

    // Groupes de provenance : liste fermee, appliquee sur products.provenance.
    lineSource: 'provenance',
    lineAttribute: 'prov',
    lineCountsInLabels: true,
    allLinesLabel: 'Tous',
    lines: [
      // "Preparation artisanale" designe les preparations faites en France a
      // partir du miel de printemps : meme pastille que "France", conformement
      // a ce qui etait deja affiche a la main sur la page.
      { id: 'fr',   label: 'Préparé en France',        chip: 'Préparé en France',
        match: /^(France|Préparation artisanale)$/ },
      // Sourcing international selectionne par Dar Nur.
      { id: 'intl', label: 'Sélection internationale', chip: 'Sélectionné par Dar Nūr',
        match: /^(Russie|Kirghizistan)$/ },
    ],
  },

  // ==========================================================================
  // Lot 1 — quatre pages sans filtres ni tri, deja a jour (aucun orphelin).
  // Objectif : sortie strictement identique au contenu ecrit a la main.
  // Aucune de ces pages n'introduit de type de carte inedit ; les seuls ecarts
  // sont couverts par des options deja existantes, sauf omitEmptyTagline
  // (chechias/), ajoutee generiquement pour ce lot.
  // ==========================================================================
  {
    categoryId: 'bakhour',
    dir: 'bakhour',
    canonicalUrl: 'https://dar-nur.fr/bakhour/',
    jsonLdName: 'Bakhour & Encens — Dar Nūr',
    jsonLdDescription: "L'encens traditionnel arabe pour parfumer vos intérieurs. Le Bakhur Mukhalat, composé de bois d'oud, de rose et de musc.",
    breadcrumbName: 'Bakhour & Encens',
    itemListName: 'Nos Bakhour & Encens',
    unitSingular: 'produit',
    unitPlural: 'produits',
    // data-price present sur la carte alors que la page n'a ni filtre ni tri :
    // reliquat du gabarit d'origine, conserve tel quel.
    emitDataPrice: true,
    buildCountHtml: (n) => `  <p class="results-count" id="products-heading">${n} produit${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</p>`,
  },
  {
    categoryId: 'miels-terroir',
    dir: 'miels-terroir',
    canonicalUrl: 'https://dar-nur.fr/miels-terroir/',
    jsonLdName: 'Miels de terroir — Dar Nūr',
    jsonLdDescription: 'Collection de miels de terroir — miel pur et naturel, récolté en France.',
    breadcrumbName: 'Miels de terroir',
    itemListName: 'Nos Miels de terroir',
    unitSingular: 'miel de terroir',
    unitPlural: 'miels de terroir',
    // categories.label vaut "Miel pur et naturel" en base ; la page affiche
    // "Miel de terroir", coherent avec son <h1> et son titre.
    tagLabel: 'Miel de terroir',
    emitDataPrice: true,
    buildCountHtml: (n) => `  <p class="results-count" id="products-heading">${n} miel${n > 1 ? 's' : ''} de terroir disponible${n > 1 ? 's' : ''}</p>`,
  },
  {
    categoryId: 'accessoires',
    dir: 'accessoires',
    canonicalUrl: 'https://dar-nur.fr/accessoires/',
    jsonLdName: 'Accessoires — Dar Nūr',
    jsonLdDescription: "Collection de 3 shemaghs yéménites Dar Nūr — motif saoudien, imprimé, brodé. Pièces d'exception, tissage délicat et motifs uniques.",
    breadcrumbName: 'Accessoires',
    itemListName: 'Nos Accessoires',
    unitSingular: 'pièce',
    unitPlural: 'pièces',
    cardSeparator: '\n\n',
  },
  {
    categoryId: 'chechias',
    dir: 'chechias',
    canonicalUrl: 'https://dar-nur.fr/chechias/',
    jsonLdName: 'Chéchias — Dar Nūr',
    jsonLdDescription: "Collection de 7 chéchias du Caire — Blanc, Noir, Marron, Bleu, Vert, Gris Clair, Beige. L'authenticité à porter.",
    breadcrumbName: 'Chéchias',
    itemListName: 'Nos Chéchias',
    unitSingular: 'chéchia',
    unitPlural: 'chéchias',
    cardSeparator: '\n\n',
    // Aucun des 7 produits n'a de tagline en base : la page ecrite a la main
    // omet le paragraphe plutot que d'afficher un espace insecable, qui
    // ajouterait une hauteur de ligne vide sur chaque carte sans rien aligner.
    omitEmptyTagline: true,
  },

  // ==========================================================================
  // Lot 2 — trois pages sans filtres ni tri, deja a jour (aucun orphelin).
  // L'audit contenu prealable (39 produits, champ par champ : slug, nom, prix,
  // tagline, image, alt, ordre, JSON-LD) n'a releve aucune divergence entre le
  // HTML ecrit a la main et Supabase : contrairement au Lot 1, aucune donnee
  // n'a eu besoin d'etre ressaisie en base avant generation.
  // Un seul ecart de gabarit inedit : huiles/ porte le prix dans un <span> la
  // ou les autres pages utilisent un <div> -> nouvelle option cfg.priceTag.
  // ==========================================================================
  {
    categoryId: 'gelules',
    dir: 'gelules',
    canonicalUrl: 'https://dar-nur.fr/gelules/',
    jsonLdName: 'Gélules Naturelles — Dar Nūr',
    jsonLdDescription: 'Collection de 12 gélules végétales premium — Nigelle, Valériane, Termis, Maca, Spiruline, Fenugrec, Chardon Marie, Ashwagandha, Gingembre Curcuma, Moringa, Costus, Aphrodisiaque.',
    breadcrumbName: 'Gélules naturelles',
    itemListName: 'Nos Gélules Naturelles',
    unitSingular: 'gélule',
    unitPlural: 'gélules',
    // categories.label vaut "Gélules végétales" (pluriel) en base ; la pastille
    // de carte est au singulier, comme le badge du hero juste au-dessus.
    tagLabel: 'Gélule végétale',
    cardSeparator: '\n\n',
    buildCountHtml: (n) => `  <p class="results-count" id="products-heading">${n} gélule${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</p>`,
  },
  {
    categoryId: 'chaussures',
    dir: 'chaussures',
    canonicalUrl: 'https://dar-nur.fr/chaussures/',
    jsonLdName: 'Sandales — Dar Nūr',
    jsonLdDescription: 'Sandales de Médine pour homme, confort et style. 11 modèles Comera, Étique, Chujara et Hayat, prix unique 29,90 €.',
    breadcrumbName: 'Sandales',
    itemListName: 'Nos Sandales',
    unitSingular: 'paire',
    unitPlural: 'paires',
    // Pas de tagLabel : categories.label vaut deja "Sandales", exactement le
    // libelle affiche sur les 11 cartes.
    // data-price present sur les cartes alors que la page n'a ni filtre ni tri —
    // meme reliquat de gabarit que bakhour/, conserve tel quel.
    emitDataPrice: true,
    cardSeparator: '\n\n',
    // Le <span id="resultsCount"> est dormant (la page ne charge que nav.js,
    // aucun script ne le lit) mais il est dans le HTML publie : on le reproduit
    // plutot que de le supprimer au passage.
    buildCountHtml: (n) => `  <p class="results-count" id="products-heading"><span id="resultsCount">${n}</span> paire${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</p>`,
  },
  {
    categoryId: 'huiles',
    dir: 'huiles',
    canonicalUrl: 'https://dar-nur.fr/huiles/',
    jsonLdName: 'Huiles Naturelles — Dar Nūr',
    jsonLdDescription: "Collection de 16 huiles essentielles et végétales premium — Nigelle, Oliban, Rose, Lavande, Figue de Barbarie, Gingembre, Costus et bien d'autres.",
    breadcrumbName: 'Huiles naturelles',
    itemListName: 'Nos Huiles Naturelles',
    unitSingular: 'huile',
    unitPlural: 'huiles',
    // categories.label vaut "Huile pure" en base ; la page affiche "Huile
    // naturelle", coherent avec son badge de hero, son <h1> et son <title>.
    tagLabel: 'Huile naturelle',
    // Seule page du site dont le prix est porte par un <span> (cf. cfg.priceTag).
    priceTag: 'span',
    cardSeparator: '\n\n',
    // Compteur imbrique dans .filter-bar > .filter-bar-inner : 4 espaces
    // d'indentation, et un padding-top annule en style inline.
    buildCountHtml: (n) => `    <p class="results-count" id="products-heading" style="padding-top:0">${n} huile${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</p>`,
  },

  // ==========================================================================
  // Lot 3 — les deux dernieres pages porteuses d'orphelins. Contrairement aux
  // Lots 1 et 2, la generation change ici du contenu visible : l'audit prealable
  // a releve sept divergences entre le HTML ecrit a la main et Supabase, toutes
  // arbitrees en faveur de la base (qui est ce que paie le client sur la fiche
  // produit) :
  //   brumes/  5 prix faux sur 5, dont -10 EUR sur br-nila et br-apaisante ;
  //            "A partir de" affiche alors qu'aucune brume n'a de variante.
  //   poudres/ pdr-nila affiche 7,00 EUR pour 5,00 EUR en base ; grn-baraka
  //            porte "Graine Noir" (faute d'accord) et une affiche marketing
  //            au lieu de sa photo produit.
  // Aucune donnee Supabase n'a ete modifiee : ce sont les pages qui s'alignent.
  // ==========================================================================
  {
    categoryId: 'brumes',
    dir: 'brumes',
    canonicalUrl: 'https://dar-nur.fr/brumes/',
    jsonLdName: 'Brumes Naturelles — Dar Nūr',
    jsonLdDescription: 'Collection de brumes naturelles premium — eaux florales, brumes sublimantes et sprays apaisants inspirés des traditions orientales.',
    breadcrumbName: 'Brumes naturelles',
    itemListName: 'Nos Brumes Naturelles',
    unitSingular: 'brume',
    unitPlural: 'brumes',
    // Pas de tagLabel : categories.label vaut deja "Brume & soin", exactement le
    // libelle affiche sur les cartes.
    // Chemins d'image absolus depuis la racine, comme qamis/.
    imagePrefix: '/',
    // Le gabarit ecrit a la main preffixait les 5 prix de "A partir de" alors
    // qu'aucune brume n'a de variante active en base : le prefixe annoncait un
    // prix d'appel qui n'existe nulle part. Avec cette option il ne s'affichera
    // que le jour ou une brume aura de vraies declinaisons.
    pricePrefix: 'À partir de',
    pricePrefixOnlyWithVariants: true,
    cardSeparator: '\n\n',
    // Compteur au format par defaut du generateur (.filter-bar-inner,
    // style="padding:0") : aucun buildCountHtml necessaire.
  },
  {
    categoryId: 'poudres',
    dir: 'poudres',
    canonicalUrl: 'https://dar-nur.fr/poudres/',
    jsonLdName: 'Poudres & Graines Naturelles — Dar Nūr',
    jsonLdDescription: 'Collection de poudres et graines naturelles premium — Nigelle, Costus, Moringa, Gingembre, Chia, Oliban, Baraka, Psyllium, Gomme Arabique et bien d\'autres.',
    breadcrumbName: 'Poudres & Graines',
    itemListName: 'Nos Poudres & Graines Naturelles',
    unitSingular: 'poudre',
    unitPlural: 'poudres',

    emitDataPrice: true,
    cardSeparator: '\n\n',
    // <span id="resultsCount"> reellement pilote par le script de filtre de la
    // page (contrairement a chaussures/, ou il est dormant) : le supprimer
    // casserait la mise a jour du compteur au clic sur une pilule.
    buildCountHtml: (n) => `  <p class="results-count" id="products-heading"><span id="resultsCount">${n}</span> poudre${n > 1 ? 's' : ''} &amp; graine${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</p>`,

    // Deux familles reelles, deja materialisees par data-line dans le gabarit
    // d'origine. Elles portent chacune leur propre pastille : la page n'affiche
    // pas le meme .cat-tag sur une poudre et sur une graine.
    //
    // La regle de la ligne "poudre" combine le prefixe historique ^pdr- et les
    // deux slugs qui n'ont jamais suivi cette convention, ancres explicitement.
    // Pas de motif large type ^dn- : il classerait n'importe quel futur produit
    // sans qu'on l'ait decide. Tout slug inconnu reste non classable, et le
    // garde-fou abandonne la generation en le nommant.
    lines: [
      { id: 'poudre', label: 'Poudres', tagLabel: 'Poudre naturelle',
        match: /^(pdr-|dn-ismid-medine$|dn-poudre-de-sidr-50g$)/ },
      { id: 'graine', label: 'Graines', tagLabel: 'Graine naturelle',
        match: /^grn-/ },
    ],
  },

  // ==========================================================================
  // Lot 4 — abayas/, la derniere grosse page categorie et la plus lourde du
  // site : 62 produits actifs, 12 groupes, 13 pilules. L'audit prealable a
  // confirme la parite (62 cartes = 62 produits actifs, meme ordre que
  // sort_order, memes prix, memes images, memes taglines) : contrairement aux
  // Lots 1 a 3, il n'y avait ni orphelin ni donnee fausse a arbitrer.
  //
  // Deux ecarts seulement entre le HTML ecrit a la main et cette configuration :
  //   - vt-layali-beige portait "A partir de" alors qu'aucune des 61 autres
  //     cartes ne l'affichait. Les 12 produits a variantes ont exactement le
  //     meme prix sur leurs 4 tailles : le prefixe annoncait un prix d'appel qui
  //     n'existe pas. Choix : pas de pricePrefix ici, les 62 cartes affichent
  //     leur prix nu. (Les fiches produit, elles, continuent d'afficher leur
  //     propre libelle — chantier separe, hors de ce pipeline.)
  //   - c'est la seule grille du site en aspect-ratio 3/4 (vetements
  //     photographies en pied) au lieu de 1/1 -> cfg.imageHeight.
  // ==========================================================================
  {
    categoryId: 'vetements',
    dir: 'abayas',
    canonicalUrl: 'https://dar-nur.fr/abayas/',
    jsonLdName: 'Abayas & Ensembles — Dar Nūr',
    jsonLdDescription: "Collection d'abayas et d'ensembles islamiques pour femme — coupes fluides et pudiques, coloris intemporels ou lumineux, livrés en France.",
    breadcrumbName: 'Abayas & Ensembles',
    itemListName: 'Nos Abayas & Ensembles',
    unitSingular: 'pièce',
    unitPlural: 'pièces',

    // Grille portrait : .card-image est en aspect-ratio:3/4 sur cette page (et
    // sur elle seule). 400 x 4/3 = 533. Annoncer 400x400 ferait reserver au
    // navigateur une boite carree avant le decodage, donc un saut de mise en
    // page sur les 62 cartes.
    imageWidth: 400,
    imageHeight: 533,

    // Le tri par prix de la page lit data-price : sans cette option, le
    // <select> deviendrait inoperant.
    emitDataPrice: true,
    cardSeparator: '\n\n',

    // Pilules avec effectif affiche ("Toutes (62)", "Abaya Nouha (4)"...),
    // comme miels/. Les comptes sont derives des produits reellement generes.
    lineCountsInLabels: true,
    allLinesLabel: 'Toutes',

    buildCountHtml: (n) => `  <p class="results-count" id="products-heading"><span id="resultsCount">${n}</span> pièce${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</p>`,

    // 12 familles reelles, deja materialisees par data-line dans le gabarit
    // ecrit a la main. Chacune porte sa propre pastille : la page n'affiche pas
    // le meme .cat-tag sur une abaya et sur un ensemble (et aucune n'affiche
    // categories.label, qui vaut "Couture femme").
    //
    // Toutes les regles sont ancrees sur ^ et sur le prefixe complet. Deux
    // pieges que cela neutralise :
    //   - "demi-papillon" contient "papillon" : une regle non ancree pour
    //     farasha capterait les 3 abayas demi-papillon. L'ancrage les rend
    //     disjointes, et l'ordre (demi-papillon avant farasha) ajoute une
    //     seconde barriere puisque resolveLine() retourne la 1re correspondance.
    //   - ^vt- seul capterait Nouha, Aicha, Layali et Nissah indifferemment.
    // Le catalogue porte deux conventions de slug (vt- historique, dn-abaya-
    // fournisseur) : un futur produit qui n'entre dans aucune des 12 regles
    // reste non classable, et le garde-fou abandonne la generation en le
    // nommant — c'est exactement le comportement voulu.
    lines: [
      { id: 'nouha',         label: 'Abaya Nouha',         tagLabel: 'Abaya femme',    match: /^vt-abaya-nouha-/ },
      { id: 'aicha',         label: 'Ensemble Aïcha',      tagLabel: 'Ensemble femme', match: /^vt-aicha-/ },
      { id: 'layali',        label: 'Ensemble Layali',     tagLabel: 'Ensemble femme', match: /^vt-layali-/ },
      { id: 'nissah',        label: 'Nissah Mastoura',     tagLabel: 'Ensemble femme', match: /^vt-nissah-/ },
      { id: 'demi-papillon', label: 'Abaya Demi-Papillon', tagLabel: 'Abaya femme',    match: /^dn-abaya-demi-papillon-/ },
      { id: 'farasha',       label: 'Abaya Farasha',       tagLabel: 'Abaya femme',    match: /^dn-abaya-papillon-/ },
      { id: 'roumeyssa',     label: 'Abaya Roumeyssa',     tagLabel: 'Abaya femme',    match: /^dn-abaya-saoudienne-/ },
      { id: 'iltihad',       label: 'Abaya Iltihad',       tagLabel: 'Abaya femme',    match: /^dn-abaya-iltihad-/ },
      { id: 'mme-dar-nur',   label: 'Abaya Mme Dar Nūr',   tagLabel: 'Abaya femme',    match: /^dn-abaya-mme-dn-/ },
      { id: 'chita',         label: 'Abaya Chita',         tagLabel: 'Abaya femme',    match: /^dn-abaya-chita-/ },
      { id: 'seyra',         label: 'Abaya Kimono Seyra',  tagLabel: 'Abaya femme',    match: /^dn-abaya-kimono-seyra-/ },
      { id: 'nilla',         label: 'Abaya Nilla',         tagLabel: 'Abaya femme',    match: /^dn-abaya-nilla-/ },
    ],
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
  // categories.label vaut "Qamis saoudien"). Une ligne peut encore le surcharger
  // carte par carte via cfg.lines[].tagLabel (cf. buildCardHtml).
  const pageTagLabel = cfg.tagLabel || categoryRows[0]?.label || cfg.breadcrumbName;

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
    const unclassified = products.filter(p => resolveLineId(p, cfg) === null);
    if (unclassified.length) {
      // On nomme la valeur du champ source, pas seulement le slug : quand le
      // classement se fait sur un champ editorial (provenance), c'est la valeur
      // inconnue — ou vide — qu'il faut voir pour corriger.
      const field = cfg.lineSource || 'slug';
      const details = unclassified
        .map(p => `${p.slug} (${field}=${JSON.stringify(lineSourceValue(p, cfg)) || '""'})`)
        .join(', ');
      fail(`${cfg.dir}/ : ${unclassified.length} produit(s) actif(s) ne correspondent à aucune ligne de cfg.lines — abandon, aucun fichier touché. ${details}`);
      return false;
    }
  }

  const cardsHtml = products.map((p, i) => buildCardHtml(p, pageTagLabel, i === 0, cfg)).join(cfg.cardSeparator || '\n');
  const countHtml = cfg.buildCountHtml
    ? cfg.buildCountHtml(products.length)
    : `    <p class="results-count" style="padding:0">${esc(pluralize(products.length, cfg.unitSingular, cfg.unitPlural))} disponible${products.length > 1 ? 's' : ''}</p>`;
  const jsonLdHtml = buildJsonLd(cfg, products);

  html = replaceMarkedBlock(html, 'CATEGORY_PRODUCTS', cardsHtml, `${cfg.dir}/index.html`);
  html = replaceMarkedBlock(html, 'CATEGORY_COUNT', countHtml, `${cfg.dir}/index.html`);
  html = replaceMarkedBlock(html, 'CATEGORY_JSONLD', jsonLdHtml, `${cfg.dir}/index.html`);
  if (cfg.lines) {
    html = replaceMarkedBlock(html, 'CATEGORY_FILTERS', buildFiltersHtml(cfg, products), `${cfg.dir}/index.html`);
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
