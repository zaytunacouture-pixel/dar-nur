#!/usr/bin/env node
// Génère une vraie page statique par produit (/{slug}/index.html) à partir de
// Supabase, pour remplacer les URLs fiche produit en ancre (#slug) par de
// vraies URLs indexables (/slug/).
//
// Chaque page générée est une copie de index.html (le moteur SPA lit son
// catalogue produits depuis Supabase au chargement, quel que soit le chemin
// d'où elle est servie — <base href="/"> + routage par location.pathname
// s'en chargent), avec uniquement les balises <head> statiques (title,
// description, canonical, OG, Twitter) réécrites pour ce produit précis —
// nécessaire pour que les aperçus de lien WhatsApp/Facebook (qui n'exécutent
// jamais de JS) affichent la bonne fiche, pas la page d'accueil.
//
// Source des identifiants Supabase : js/config.js (clé anon publique, déjà
// commitée — cf. commentaire du fichier : lecture seule, produits actifs
// uniquement, RLS).
//
// Aucune dépendance npm : fetch natif de Node (>=18).

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const INDEX_PATH = new URL('index.html', ROOT);
const CONFIG_PATH = new URL('js/config.js', ROOT);
const MANIFEST_PATH = new URL('scripts/.generated-product-slugs.json', ROOT);
const SITEMAP_PATH = new URL('sitemap.xml', ROOT);

function log(msg) { console.log(msg); }
function fail(msg) {
  console.error(`::error::${msg}`);
  process.exitCode = 1;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadSupabaseCreds() {
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const urlMatch = raw.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
  const keyMatch = raw.match(/SUPABASE_ANON\s*=\s*'([^']+)'/);
  if (!urlMatch || !keyMatch) {
    throw new Error("Impossible de lire SUPABASE_URL/SUPABASE_ANON depuis js/config.js");
  }
  return { url: urlMatch[1], key: keyMatch[1] };
}

async function fetchJson(url, creds) {
  const res = await fetch(url, {
    headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status} ${res.statusText} (${url})`);
  return res.json();
}

async function fetchActiveProducts(creds) {
  const url = `${creds.url}/rest/v1/products?select=*,product_variants(*)&active=eq.true&order=sort_order.asc`;
  return fetchJson(url, creds);
}

async function fetchCategoryLabels(creds) {
  const url = `${creds.url}/rest/v1/categories?select=id,label`;
  const rows = await fetchJson(url, creds);
  return new Map(rows.map(c => [c.id, c.label]));
}

// Même logique que adaptPrice() dans index.html — dupliquée volontairement
// (pas d'import partagé) pour ne créer aucun couplage de code entre le
// runtime navigateur et ce script de génération, comme scripts/generate-parfums.mjs.
function adaptPrice(p) {
  const axes = p.variant_axes || [];
  const variants = (p.product_variants || [])
    .filter(v => v.active !== false)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (!variants.length) return { type: 'fixed', value: p.price_value };
  if (axes.includes('format') || axes.includes('contenance'))
    return { type: 'format', options: variants.map(v => [v.name, v.price]) };
  if (axes.includes('taille'))
    return { type: 'size', options: variants.map(v => [v.name, v.price]) };
  return { type: 'fixed', value: p.price_value };
}

// Même override que _CAT_SLUG_OVERRIDES dans index.html (catégorie Supabase
// "vetements" affichée sous l'URL /abayas/) — dupliqué pour la même raison
// que adaptPrice() ci-dessus.
const CAT_SLUG_OVERRIDES = { vetements: 'abayas' };

// Réplique updatePageMetadata() côté serveur — mêmes règles de format de
// titre/description que le JS runtime, pour que le <head> statique et le
// <head> mis à jour au chargement disent la même chose.
function computeMeta(product, catLabel) {
  const title = `${product.name} — Dar Nūr | ${catLabel || product.category_id}`;

  const price = adaptPrice(product);
  let priceStr = '';
  if ((price.type === 'format' || price.type === 'size') && price.options && price.options.length > 0) {
    priceStr = `À partir de ${price.options[0][1]} €`;
  } else if (price.type === 'fixed' && price.value) {
    priceStr = `${price.value} €`;
  }

  let description = `${product.name} — Dar Nūr. ${product.tagline || ''}`;
  if (priceStr) description += `. ${priceStr}`;
  description += `. Commandez sur WhatsApp.`;
  if (description.length > 160) description = description.substring(0, 157) + '...';

  const images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  const img = images[0] || null;
  const imageUrl = img ? `https://dar-nur.fr/${img}` : 'https://dar-nur.fr/logo-dar-nur.png';
  const canonicalUrl = `https://dar-nur.fr/${product.slug}/`;

  return {
    title,
    description,
    imageUrl,
    canonicalUrl,
    ogImageWidth: img ? '1200' : '512',
    ogImageHeight: img ? '630' : '512',
  };
}

// Remplace une ligne exacte du <head> par défaut — échoue bruyamment (au lieu
// d'écrire silencieusement une page avec les mauvaises métadonnées) si la
// ligne attendue n'existe plus, pour détecter tout de suite une dérive entre
// ce script et index.html.
function replaceLine(html, oldLine, newLine, label) {
  if (!html.includes(oldLine)) {
    throw new Error(`Ligne <head> introuvable pour "${label}" — index.html a changé, mettre à jour scripts/generate-product-pages.mjs.\nAttendu : ${oldLine}`);
  }
  return html.replace(oldLine, newLine);
}

// Contenu minimal mais réel du produit, injecté directement dans le HTML
// statique (#productView), pour que toute fiche soit indexable sans
// exécution JS : le moteur SPA (showProduct(), voir index.html) écrase ce
// bloc au chargement avec le rendu riche habituel (famille de produits,
// accordéons...) — ceci n'est qu'un filet de contenu réel pour les robots
// et les visiteurs avant que le JS/Supabase n'ait fini de charger.
function buildProductSSR(product, catLabel, meta, price) {
  const name = esc(product.name);
  const tagline = esc(product.tagline || '');
  const label = esc(catLabel || product.category_id);
  const catSlug = CAT_SLUG_OVERRIDES[product.category_id] || product.category_id;
  const description = Array.isArray(product.description) ? product.description : [];
  const descHtml = description.map(d => `<p>${esc(d)}</p>`).join('\n        ');

  let priceHtml = '';
  if ((price.type === 'format' || price.type === 'size') && price.options && price.options.length) {
    priceHtml = `<div class="order-price"><span>dès ${esc(String(price.options[0][1]))}€</span></div>`;
  } else if (price.type === 'fixed' && price.value) {
    priceHtml = `<div class="order-price"><span>${esc(String(price.value))}€</span></div>`;
  }

  const images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  const img = images[0];
  const imgHtml = img
    ? `<img src="${esc(img)}" alt="${name}" class="pp-product-img" loading="eager"/>`
    : `<img src="logo-dar-nur.png" alt="Dar Nūr" class="pp-logo-ph"/>`;

  const waText = encodeURIComponent(`As-salâm 'alaykoum, je suis intéressé(e) par : ${product.name}`);

  return `
    <div class="pp-breadcrumb-bar">
      <div class="pp-breadcrumb-bar-inner breadcrumb">
        <a href="/">Dar Nūr</a><span>›</span>
        <a href="/${esc(catSlug)}/">${label}</a><span>›</span>
        <span style="color:var(--ink);font-weight:500">${name}</span>
      </div>
    </div>
    <section class="pp-hero">
      <div class="pp-hero-inner">
        <div class="pp-badge">${label}</div>
        <h1>${name}</h1>
        <div class="tagline">${tagline}</div>
      </div>
    </section>
    <div class="pp-body">
      <div class="pp-gallery">
        <div class="pp-visual${img ? ' has-photo' : ''}">${imgHtml}</div>
      </div>
      <div class="pp-content">
        ${descHtml}
        <div class="order-box">
          ${priceHtml}
          <a class="btn-wa dark" href="https://wa.me/33769253375?text=${waText}" target="_blank" rel="noopener">Commander sur WhatsApp</a>
        </div>
      </div>
    </div>
  `;
}

function injectProductHead(html, product, meta, catLabel, price) {
  const escName = esc(product.name);
  const escTagline = esc(product.tagline || '');
  let out = html;

  out = replaceLine(out,
    '<title>Dar Nūr — Produits Naturels Premium | Miels, Huiles, Gélules</title>',
    `<title>${esc(meta.title)}</title>`,
    'title');

  out = replaceLine(out,
    '<meta name="description" content="Dar Nūr propose des produits naturels 100% purs : miels artisanaux, huiles essentielles, gélules de plantes. Commandez via WhatsApp." />',
    `<meta name="description" content="${esc(meta.description)}" />`,
    'meta description');

  out = replaceLine(out,
    '<meta property="og:title" content="Dar Nūr — Produits Naturels Premium" />',
    `<meta property="og:title" content="${escName} — Dar Nūr" />`,
    'og:title');

  out = replaceLine(out,
    '<meta property="og:description" content="Miels artisanaux, huiles essentielles, gélules de plantes. Commandez sur WhatsApp." />',
    `<meta property="og:description" content="${escTagline}" />`,
    'og:description');

  out = replaceLine(out,
    '<meta property="og:url" content="https://dar-nur.fr" />',
    `<meta property="og:url" content="${meta.canonicalUrl}" />`,
    'og:url');

  out = replaceLine(out,
    '<meta property="og:image" content="https://dar-nur.fr/logo-dar-nur.png" />',
    `<meta property="og:image" content="${meta.imageUrl}" />`,
    'og:image');

  out = replaceLine(out,
    '<meta property="og:image:width" content="512" />',
    `<meta property="og:image:width" content="${meta.ogImageWidth}" />`,
    'og:image:width');

  out = replaceLine(out,
    '<meta property="og:image:height" content="512" />',
    `<meta property="og:image:height" content="${meta.ogImageHeight}" />`,
    'og:image:height');

  out = replaceLine(out,
    '<meta property="og:image:alt" content="Dar Nūr — Produits Naturels Premium" />',
    `<meta property="og:image:alt" content="${escName}" />`,
    'og:image:alt');

  out = replaceLine(out,
    '<meta name="twitter:title" content="Dar Nūr — Produits Naturels Premium" />',
    `<meta name="twitter:title" content="${escName} — Dar Nūr" />`,
    'twitter:title');

  out = replaceLine(out,
    '<meta name="twitter:description" content="Miels artisanaux, huiles essentielles, gélules de plantes. Commandez sur WhatsApp." />',
    `<meta name="twitter:description" content="${escTagline}" />`,
    'twitter:description');

  out = replaceLine(out,
    '<meta name="twitter:image" content="https://dar-nur.fr/logo-dar-nur.png" />',
    `<meta name="twitter:image" content="${meta.imageUrl}" />`,
    'twitter:image');

  out = replaceLine(out,
    '<meta name="twitter:url" content="https://dar-nur.fr" />',
    `<meta name="twitter:url" content="${meta.canonicalUrl}" />`,
    'twitter:url');

  out = replaceLine(out,
    '<link rel="canonical" href="https://dar-nur.fr" id="canonicalLink" />',
    `<link rel="canonical" href="${meta.canonicalUrl}" id="canonicalLink" />`,
    'canonical');

  out = out.replace(
    '<!DOCTYPE html>',
    `<!DOCTYPE html>\n<!-- GENERATED:PRODUCT-PAGE:${product.slug} — généré par scripts/generate-product-pages.mjs, ne pas éditer à la main -->`
  );

  // Rend la fiche produit visible par défaut (et masque la vue accueil) —
  // le JS (showHome()/showProduct()) réécrit de toute façon ces styles via
  // affectation directe au chargement, donc ceci ne change rien une fois le
  // JS exécuté ; ça évite en revanche qu'un robot sans JS (ou un visiteur
  // avant la fin du chargement) ne voie que la page d'accueil sur une URL
  // produit.
  out = replaceLine(out,
    '<main id="homeView">',
    '<main id="homeView" style="display:none">',
    'homeView display');

  out = replaceLine(out,
    '<div id="productView"></div>',
    `<div id="productView" style="display:block">${buildProductSSR(product, catLabel, meta, price)}</div>`,
    'productView content');

  return out;
}

// Garde-fou final avant écriture : parcourt CHAQUE <url> du sitemap complet
// (pas seulement le bloc généré ici) et fait échouer la génération — sans
// toucher au fichier sur disque — si une entrée a un <loc> absent/vide, un
// <loc> non absolu (hors https://dar-nur.fr/...), ou si un <loc> est dupliqué.
// Réimplémentée à l'identique dans scripts/generate-parfums.mjs plutôt
// qu'importée, même logique de découplage que le reste du fichier.
function validateSitemapXml(xml) {
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  const locs = [];
  for (const block of urlBlocks) {
    const locMatches = block.match(/<loc>[\s\S]*?<\/loc>/g) || [];
    if (locMatches.length !== 1) {
      throw new Error(`sitemap.xml invalide : une entrée <url> doit contenir exactement une balise <loc> (${locMatches.length} trouvée(s)) :\n${block}`);
    }
    const loc = locMatches[0].replace(/<\/?loc>/g, '').trim();
    if (!loc) {
      throw new Error(`sitemap.xml invalide : <loc> vide dans une entrée <url> :\n${block}`);
    }
    if (!loc.startsWith('https://dar-nur.fr')) {
      throw new Error(`sitemap.xml invalide : <loc> non absolue (doit commencer par https://dar-nur.fr) : "${loc}"`);
    }
    locs.push(loc);
  }
  const seen = new Set();
  for (const loc of locs) {
    if (seen.has(loc)) {
      throw new Error(`sitemap.xml invalide : <loc> dupliquée : "${loc}"`);
    }
    seen.add(loc);
  }
}

// Retire les anciennes entrées produit en ancre (<loc>https://dar-nur.fr#slug</loc>,
// une par produit, jamais regroupées dans un bloc délimité jusqu'ici) et les
// remplace par un bloc délimité unique — même principe que le bloc
// AUTO:PARFUMS de scripts/generate-parfums.mjs, régénéré intégralement à
// chaque run, sans jamais toucher au reste du fichier (homepage, catégories).
async function updateSitemap(products) {
  let sitemap = await readFile(SITEMAP_PATH, 'utf8');
  const lastmod = new Date().toISOString().slice(0, 10);

  const legacyEntryRegex = /[ \t]*<url>\s*<loc>https:\/\/dar-nur\.fr#[^<]*<\/loc>[\s\S]*?<\/url>\n?/g;
  const legacyMatches = sitemap.match(legacyEntryRegex) || [];
  sitemap = sitemap.replace(legacyEntryRegex, '');

  const markerRegex = /<!-- AUTO:PRODUCTS:START[\s\S]*?AUTO:PRODUCTS:END -->\n?/;
  sitemap = sitemap.replace(markerRegex, '');

  const entries = products
    .filter(p => p.slug)
    .map(p => `  <url>\n    <loc>https://dar-nur.fr/${p.slug}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`)
    .join('\n');
  const block = `<!-- AUTO:PRODUCTS:START — géré automatiquement par scripts/generate-product-pages.mjs, ne pas éditer à la main -->\n${entries}\n  <!-- AUTO:PRODUCTS:END -->\n`;

  if (!sitemap.includes('</urlset>')) {
    throw new Error('Balise </urlset> introuvable dans sitemap.xml — abandon pour ne pas corrompre le fichier.');
  }
  sitemap = sitemap.replace('</urlset>', `${block}</urlset>`);

  validateSitemapXml(sitemap);

  await writeFile(SITEMAP_PATH, sitemap, 'utf8');
  return legacyMatches.length;
}

async function loadManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf8');
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function getReservedNames(manifestSlugs) {
  const entries = await readdir(ROOT, { withFileTypes: true });
  return new Set(entries.map(e => e.name).filter(name => !manifestSlugs.has(name)));
}

async function main() {
  const start = Date.now();
  log('▶ Génération des pages produit statiques (/{slug}/) depuis Supabase');

  const creds = await loadSupabaseCreds();

  let products, catLabels;
  try {
    [products, catLabels] = await Promise.all([
      fetchActiveProducts(creds),
      fetchCategoryLabels(creds),
    ]);
  } catch (e) {
    fail(`Échec de la récupération Supabase : ${e.message}`);
    return;
  }

  log(`  ${products.length} produit(s) actif(s) trouvé(s).`);
  if (!products.length) {
    fail('Aucun produit actif retourné par Supabase — abandon pour ne pas supprimer les pages existantes.');
    return;
  }

  const indexTemplate = await readFile(INDEX_PATH, 'utf8');
  const manifestSlugs = await loadManifest();
  const reserved = await getReservedNames(manifestSlugs);

  const written = [];
  const skipped = [];

  for (const p of products) {
    const slug = p.slug;
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      skipped.push({ slug, reason: 'slug manquant ou invalide' });
      continue;
    }
    if (reserved.has(slug)) {
      skipped.push({ slug, reason: `collision avec un fichier/dossier existant du repo (${slug})` });
      continue;
    }

    const catLabel = catLabels.get(p.category_id);
    const meta = computeMeta(p, catLabel);
    let html;
    try {
      html = injectProductHead(indexTemplate, p, meta, catLabel, adaptPrice(p));
    } catch (e) {
      skipped.push({ slug, reason: e.message });
      continue;
    }

    await mkdir(new URL(`${slug}/`, ROOT), { recursive: true });
    await writeFile(new URL(`${slug}/index.html`, ROOT), html, 'utf8');
    written.push(slug);
  }

  // Nettoyage : supprime les dossiers générés lors d'un run précédent pour un
  // produit qui n'est plus actif/existant — jamais un dossier hors manifeste.
  const currentSet = new Set(written);
  let removed = 0;
  for (const oldSlug of manifestSlugs) {
    if (!currentSet.has(oldSlug)) {
      await rm(new URL(`${oldSlug}/`, ROOT), { recursive: true, force: true });
      log(`  Dossier obsolète supprimé : ${oldSlug}/ (produit désactivé/renommé/supprimé)`);
      removed++;
    }
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(written.sort(), null, 2) + '\n', 'utf8');

  const writtenProducts = products.filter(p => currentSet.has(p.slug));
  const legacyRemoved = await updateSitemap(writtenProducts);
  log(`  sitemap.xml : ${legacyRemoved} ancienne(s) entrée(s) en ancre retirée(s), ${writtenProducts.length} URL(s) produit à jour dans le bloc AUTO:PRODUCTS.`);

  if (skipped.length) {
    log(`  ${skipped.length} produit(s) ignoré(s) :`);
    for (const s of skipped) log(`    - ${s.slug || '(slug vide)'} : ${s.reason}`);
  }

  const durationMs = Date.now() - start;
  log(`✔ ${written.length} page(s) produit générée(s), ${removed} supprimée(s), ${skipped.length} ignorée(s) en ${durationMs} ms.`);

  if (skipped.length) process.exitCode = 1;
}

main().catch(e => {
  fail(`Erreur inattendue : ${e.stack || e.message}`);
});
