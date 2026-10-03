#!/usr/bin/env node
/**
 * Contrôles de DONNÉES des fiches produit (étape 8), après `astro build`.
 *
 * Comme verify-catalog : recalcule INDÉPENDAMMENT (requêtes et logique propres, sans
 * réutiliser src/lib) ce que chaque fiche devrait contenir d'après Supabase (lecture publique),
 * puis le compare au HTML de dist/. Échoue (code 1) au moindre écart.
 *
 *  1. Une fiche par produit publié, aucune autre (un brouillon n'a pas de page).
 *  2. Canonical /{slug}/ sans paramètre ; un seul H1 = nom réel ; fil d'Ariane = collection
 *     principale et ses ancêtres (HTML et BreadcrumbList).
 *  3. Prix affiché (« À partir de » seulement si plusieurs prix actifs différents), variantes :
 *     options = valeurs réelles, aucune combinaison en double, prix / disponibilité exacts,
 *     prix au kg / litre seulement depuis une quantité + unité certaines.
 *  4. JSON-LD Product / ProductGroup parseable, prix et disponibilité exacts, marque seulement
 *     si elle existe, aucun avis / note / GTIN / SKU / état inventé.
 *  5. Images : uniquement des médias du produit lui-même, hébergés sur dar-nur.fr ou le
 *     stockage Supabase ; aucune image distante non transformée dans le HTML.
 *  6. Disponibilité : NULL → « Bientôt disponible », jamais commandable.
 *  7. Contenu : aucune mention « À compléter », « thérapeutique », « livraison offerte », ni (étape 9)
 *     « paiement à la réception » ou zone Île-de-France, message WhatsApp compris.
 *  Étape 10 : bouton « Ajouter au panier » seulement si commandable (disponible / sur commande, prix
 *  existant), identifiants produit / variantes et prix en centimes du panier = base, prix d'une
 *  promotion produit PROUVÉE (même règle que le serveur de commande), aucun CTA « Commander sur
 *  WhatsApp » ni message de commande prérempli (WhatsApp = « Une question ? »).
 *  8. Produits similaires : publiés, hors produit courant et hors autres fiches du même
 *     futur modèle sûr ; lastmod = date réelle de modification.
 *  9. Liens produit de TOUTES les pages (cartes de l'étape 7 comprises) → une page générée.
 * 10. LAB /lab/regroupements/ : noindex, hors sitemap, aucun lien public, aperçus des
 *     regroupements sûrs, aucun conflit d'URL.
 * 11. Produits témoins (miel à 3 formats, abaya à anciennes couleurs, qamis, parfum,
 *     produit bientôt disponible, image unique, sans image).
 * 12. Sitemap (build de production seulement) : fiches avec <lastmod>, ni LAB ni query string.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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
if (!SUPABASE_URL || !KEY?.startsWith('sb_publishable_')) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY (publishable) requis pour les contrôles des fiches.');
  process.exit(1);
}
if (!existsSync(dist)) {
  console.error('dist/ absent : lancer `npm run build` avant `npm run verify:products`.');
  process.exit(1);
}

async function rest(table, params) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!response.ok) throw new Error(`${table} : HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

/* ── Données de référence (Supabase) ─────────────────────────────────────── */
const [products, collections, offers] = await Promise.all([
  rest('products', {
    select:
      'id,slug,name,status,availability,price_value,brand,brand_slug,images,updated_at,' +
      'product_variants(id,price,active,sort_order,updated_at,' +
      'product_variant_options(option_type_id,option_values(code,label,numeric_value,unit))),' +
      'product_collections(role,collections(slug)),product_media(url,variant_id,sort_order)',
    status: 'eq.published',
  }),
  rest('collections', { select: 'id,slug,path,parent_id,name', status: 'eq.published' }),
  rest('offers', {
    select: 'id,type,promo_price,normal_price,starts_at,ends_at,offer_products(product_slug)',
    active: 'eq.true',
  }),
]);
/**
 * Promotion produit PROUVÉE (étape 10) : product_promo active et en cours, produit sans variante dont
 * le prix réel = prix de référence ; la moins chère. Réimplémentée ici indépendamment du site.
 */
const cents = (n) => Math.round(Number(n) * 100);
const promoOf = (p) => {
  if (p.product_variants.length > 0 || typeof p.price_value !== 'number') return null;
  const now = new Date();
  const prices = offers
    .filter(
      (o) =>
        o.type === 'product_promo' &&
        (!o.starts_at || new Date(o.starts_at) <= now) &&
        (!o.ends_at || new Date(o.ends_at) > now) &&
        o.promo_price > 0 &&
        o.normal_price !== null &&
        cents(o.promo_price) < cents(o.normal_price) &&
        cents(o.normal_price) === cents(p.price_value) &&
        o.offer_products.some((op) => op.product_slug === p.slug),
    )
    .map((o) => o.promo_price);
  return prices.length ? Math.min(...prices) : null;
};
const bySlug = new Map(products.map((p) => [p.slug, p]));
const collectionBySlug = new Map(collections.map((c) => [c.slug, c]));
const collectionById = new Map(collections.map((c) => [c.id, c]));
const snapshot = JSON.parse(readFileSync(join(root, 'src/data/lab/product-groupings.json'), 'utf8'));

/* ── Outils ─────────────────────────────────────────────────────────────── */
const posix = (p) => p.split(sep).join('/');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
const routeOf = (file) => {
  const rel = posix(relative(dist, file));
  return rel === 'index.html'
    ? '/'
    : rel.endsWith('/index.html')
      ? `/${rel.slice(0, -'index.html'.length)}`
      : `/${rel}`;
};
const routes = new Set(htmlFiles.map(routeOf));
const decode = (text) =>
  text
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const norm = (text) => text.replace(/[  ]/g, ' ');
const euro = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
const jsonLdOf = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
const attr = (html, name) => new RegExp(`${name}="([^"]*)"`).exec(html)?.[1];
const resolveMedia = (url) =>
  /^https?:\/\//.test(url) ? url : new URL(url.replace(/^\/+/, ''), 'https://dar-nur.fr/').toString();
const ALLOWED_HOSTS = [/^dar-nur\.fr$/, /\.supabase\.co$/];
const SCHEMA = {
  available: 'https://schema.org/InStock',
  on_demand: 'https://schema.org/BackOrder',
  coming_soon: 'https://schema.org/OutOfStock',
  out_of_stock: 'https://schema.org/OutOfStock',
};
/** Bouton d'ajout au panier (étape 10) : attribut d'un <button> (pas le sélecteur du script). */
const ORDER_RE = /<button [^>]*data-dn-add-to-cart/;
const availabilityOf = (p) => p.availability ?? 'coming_soon'; // NULL → coming_soon, jamais available
const AVAILABILITY_TEXT = {
  available: 'Disponible',
  on_demand: 'Sur commande',
  coming_soon: 'Bientôt disponible',
  out_of_stock: 'Épuisé',
};
const UNIT = { g: [1000, 'kg'], kg: [1, 'kg'], ml: [1000, 'L'], l: [1, 'L'] };
const unitPrice = (price, quantity, unit) => {
  const base = UNIT[unit?.toLowerCase()];
  if (!base || !(Number(quantity) > 0) || typeof price !== 'number') return null;
  return `${euro((price * base[0]) / Number(quantity))} / ${base[1]}`;
};
const primaryOf = (p) => {
  const primaries = p.product_collections.filter((pc) => pc.role === 'primary' && pc.collections);
  return primaries.length === 1 ? collectionBySlug.get(primaries[0].collections.slug) : undefined;
};
const ancestors = (c) => {
  const chain = [];
  for (let node = c; node; node = node.parent_id ? collectionById.get(node.parent_id) : undefined)
    chain.unshift(node);
  return chain;
};
const deepKeys = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      deepKeys(v, out);
    }
  return out;
};

/* ── 1. Une fiche par produit publié, aucune autre ──────────────────────── */
const productPages = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  if (/data-dn-page="product"/.test(html)) productPages.set(attr(html, 'data-dn-slug'), { file, html });
}
for (const slug of bySlug.keys())
  if (!productPages.has(slug)) fail(`fiche absente pour le produit publié « ${slug} »`);
for (const slug of productPages.keys())
  if (!bySlug.has(slug)) fail(`fiche générée pour « ${slug} », qui n'est pas publié`);
for (const [slug, { file }] of productPages)
  if (routeOf(file) !== `/${slug}/`)
    fail(`« ${slug} » : fiche servie à ${routeOf(file)} au lieu de /${slug}/`);
notes.push(`${productPages.size} fiches produit générées pour ${bySlug.size} produits publiés`);

/* ── 2 à 8. Contenu de chaque fiche ─────────────────────────────────────── */
const safeGroupOf = new Map(
  snapshot.groupings
    .filter((g) => g.decision === 'safe' && g.kind === 'model')
    .flatMap((g) => g.members.map((m) => [m.slug, g.code])),
);
const siteOrigin = process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : null;
let variantPages = 0;
const offerTherapeutic = [];

for (const [slug, { html }] of productPages) {
  const p = bySlug.get(slug);
  if (!p) continue;
  const where = `/${slug}/`;

  // Canonical, H1.
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? '';
  const canonicalUrl = canonical ? new URL(canonical) : null;
  if (!canonicalUrl || canonicalUrl.pathname !== where || canonicalUrl.search)
    fail(`${where} : canonical ${canonical}`);
  if (siteOrigin && canonicalUrl && canonicalUrl.origin !== siteOrigin)
    fail(`${where} : canonical hors ${siteOrigin}`);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => decode(m[1]));
  if (h1s.length !== 1 || h1s[0] !== p.name.trim())
    fail(`${where} : H1 « ${h1s.join(' | ')} » ≠ « ${p.name} »`);

  // Fil d'Ariane (collection principale + ancêtres).
  const primary = primaryOf(p);
  if (!primary) {
    fail(`${where} : collection principale absente ou multiple`);
    continue;
  }
  const expectedCrumbs = ['Accueil', ...ancestors(primary).map((c) => c.name), p.name.trim()];
  const jsonLd = jsonLdOf(html);
  const crumbLd = jsonLd.find((d) => d['@type'] === 'BreadcrumbList');
  const ldNames = crumbLd?.itemListElement?.map((i) => i.name) ?? [];
  if (ldNames.join(' › ') !== expectedCrumbs.join(' › '))
    fail(`${where} : BreadcrumbList « ${ldNames.join(' › ')} » ≠ « ${expectedCrumbs.join(' › ')} »`);
  const crumbHtml = /<nav class="dn-crumbs[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
  const htmlCrumbs = [...crumbHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => decode(m[1]));
  if (htmlCrumbs.join(' › ') !== expectedCrumbs.join(' › ')) fail(`${where} : fil d'Ariane HTML incohérent`);

  // Variantes réelles.
  const variants = [...p.product_variants].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const active = variants.filter((v) => v.active);
  const prices = active.map((v) => v.price).filter((x) => typeof x === 'number');
  const promo = promoOf(p);
  const expectedPrice =
    promo !== null
      ? euro(promo)
      : prices.length > 1 && new Set(prices).size > 1
        ? `À partir de ${euro(Math.min(...prices))}`
        : typeof (prices[0] ?? p.price_value) === 'number'
          ? euro(prices[0] ?? p.price_value)
          : 'Prix sur demande';
  const compare = /data-dn-purchase-price[\s\S]*?class="dn-price__compare"[^>]*>([\s\S]*?)<\/s>/.exec(
    html.slice(0, html.indexOf('data-dn-purchase-unit')),
  )?.[1];
  if (
    (promo !== null) !== Boolean(compare) ||
    (compare && norm(decode(compare)) !== norm(`Prix habituel : ${euro(p.price_value)}`))
  )
    fail(`${where} : prix barré « ${compare ? decode(compare) : '∅'} » incohérent avec l'offre produit`);
  const purchase =
    /data-dn-purchase-price[^>]*>[\s\S]*?class="dn-price__current"[^>]*>([\s\S]*?)<\/span>/.exec(html)?.[1];
  if (!purchase || norm(decode(purchase)) !== norm(expectedPrice))
    fail(`${where} : prix affiché « ${purchase ? decode(purchase) : '∅'} », attendu « ${expectedPrice} »`);

  const dataJson = /<script type="application\/json" id="dn-product-data">([\s\S]*?)<\/script>/.exec(
    html,
  )?.[1];
  const data = dataJson ? JSON.parse(dataJson) : null;
  if (!data) fail(`${where} : données de variantes absentes`);
  const axesOf = (v) =>
    Object.fromEntries(
      v.product_variant_options
        .filter((o) => o.option_values)
        .map((o) => [o.option_type_id, o.option_values]),
    );
  if (data) {
    if (data.variants.length !== variants.length)
      fail(`${where} : ${data.variants.length} variantes rendues, ${variants.length} en base`);
    const combos = new Set(data.variants.map((v) => JSON.stringify(Object.entries(v.o).sort())));
    if (combos.size !== data.variants.length) fail(`${where} : combinaison de variantes en double`);
    variants.forEach((v, i) => {
      const rendered = data.variants[i];
      if (!rendered) return;
      const options = axesOf(v);
      for (const [axis, value] of Object.entries(options))
        if (rendered.o[axis] !== value.code)
          fail(`${where} : variante ${i + 1}, ${axis} « ${rendered.o[axis]} » ≠ « ${value.code} »`);
      if (
        (rendered.p === null ? null : norm(rendered.p)) !==
        (typeof v.price === 'number' ? norm(euro(v.price)) : null)
      )
        fail(`${where} : variante ${i + 1}, prix ${rendered.p} ≠ ${v.price}`);
      if (rendered.a !== v.active)
        fail(`${where} : variante ${i + 1}, disponibilité ${rendered.a} ≠ ${v.active}`);
      const c = options.contenance;
      const expectedUnit = c ? unitPrice(v.price, c.numeric_value, c.unit) : null;
      if ((rendered.u ? norm(rendered.u) : null) !== (expectedUnit ? norm(expectedUnit) : null))
        fail(`${where} : variante ${i + 1}, prix unitaire « ${rendered.u} » ≠ « ${expectedUnit} »`);
    });
    if (variants.length) variantPages += 1;
    // Radios : une option par valeur réelle, désactivée seulement si toutes ses variantes sont inactives.
    for (const axis of data.axes) {
      const codes = [...new Set(variants.map((v) => axesOf(v)[axis.id]?.code).filter(Boolean))];
      if (codes.length < 2) continue;
      const radios = [...html.matchAll(new RegExp(`<input[^>]*name="${axis.id}"[^>]*>`, 'g'))].map(
        (m) => m[0],
      );
      const values = radios.map((r) => attr(r, 'value'));
      if (values.join('|') !== codes.join('|'))
        fail(`${where} : options ${axis.id} « ${values} » ≠ « ${codes} »`);
      for (const radio of radios) {
        const code = attr(radio, 'value');
        const anyActive = variants.some((v) => v.active && axesOf(v)[axis.id]?.code === code);
        if (/\sdisabled/.test(radio) === anyActive)
          fail(`${where} : option ${axis.id}=${code} mal désactivée`);
        if (/\schecked/.test(radio)) fail(`${where} : option ${axis.id}=${code} présélectionnée`);
      }
    }
  }

  // Disponibilité et commande.
  const availability = availabilityOf(p);
  const availabilityText = /data-dn-availability[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1];
  if (!availabilityText || decode(availabilityText) !== AVAILABILITY_TEXT[availability])
    fail(
      `${where} : disponibilité « ${availabilityText ? decode(availabilityText) : '∅'} », attendu « ${AVAILABILITY_TEXT[availability]} »`,
    );
  const hasPrice = variants.length
    ? variants.some((v) => Number(v.price ?? p.price_value) > 0)
    : Number(p.price_value) > 0;
  const orderable = (availability === 'available' || availability === 'on_demand') && hasPrice;
  if (ORDER_RE.test(html) !== orderable)
    fail(`${where} : bouton « Ajouter au panier » ${orderable ? 'absent' : 'présent à tort'}`);
  // Panier (étape 10) : identifiants et prix en centimes = base ; le serveur revérifie de toute façon.
  if (data) {
    if (orderable) {
      if (data.cart?.productId !== p.id)
        fail(`${where} : identifiant produit du panier ${data.cart?.productId}`);
      if (!variants.length && data.cart?.priceCents !== cents(promo ?? p.price_value))
        fail(`${where} : prix du panier ${data.cart?.priceCents} ≠ ${cents(promo ?? p.price_value)}`);
      if (data.cart?.image && !/^\/_astro\/[^"]+\.webp$/.test(data.cart.image))
        fail(`${where} : vignette du panier « ${data.cart.image} »`);
      variants.forEach((v, i) => {
        const r = data.variants[i];
        const expected = Number(v.price ?? p.price_value) > 0 ? cents(v.price ?? p.price_value) : null;
        if (r && (r.i !== v.id || r.c !== expected))
          fail(`${where} : variante ${i + 1}, panier ${r.i}/${r.c} ≠ ${v.id}/${expected}`);
      });
    } else if (data.cart) fail(`${where} : données de panier sur un produit non commandable`);
  }
  if (/Commander sur WhatsApp|souhaite%20commander|souhaite commander/i.test(html))
    fail(`${where} : commande WhatsApp encore proposée`);
  if (!/<a [^>]*href="https:\/\/wa\.me\/[^"]*"[^>]*>[\s\S]{0,400}?Une question/.test(html))
    fail(`${where} : lien « Une question ? » absent`);

  // JSON-LD Product / ProductGroup.
  const product = jsonLd.find((d) => d['@type'] === 'Product' || d['@type'] === 'ProductGroup');
  if (!product) {
    fail(`${where} : JSON-LD Product absent`);
  } else {
    const keys = deepKeys(product);
    for (const banned of [
      'aggregateRating',
      'review',
      'reviews',
      'gtin',
      'gtin13',
      'gtin8',
      'sku',
      'mpn',
      'itemCondition',
      'inventoryLevel',
    ])
      if (keys.has(banned)) fail(`${where} : JSON-LD contient « ${banned} » (donnée inexistante)`);
    if (Boolean(product.brand) !== Boolean(p.brand)) fail(`${where} : marque JSON-LD incohérente`);
    if (product.brand && product.brand.name !== p.brand)
      fail(`${where} : marque « ${product.brand.name} » ≠ « ${p.brand} »`);
    const ownMedia = new Set([
      ...p.product_media.map((m) => resolveMedia(m.url)),
      ...(p.images ?? []).map(resolveMedia),
    ]);
    for (const image of product.image ?? []) {
      if (!ownMedia.has(image)) fail(`${where} : image JSON-LD étrangère au produit ${image}`);
      if (!ALLOWED_HOSTS.some((re) => re.test(new URL(image).hostname)))
        fail(`${where} : image hors hôtes autorisés ${image}`);
    }
    if (variants.length > 1) {
      if (product['@type'] !== 'ProductGroup')
        fail(`${where} : ProductGroup attendu (${variants.length} variantes)`);
      const hasVariant = product.hasVariant ?? [];
      if (hasVariant.length !== variants.length)
        fail(`${where} : hasVariant ${hasVariant.length} ≠ ${variants.length}`);
      variants.forEach((v, i) => {
        const offer = hasVariant[i]?.offers;
        if (typeof v.price === 'number' && offer?.price !== Number(v.price).toFixed(2))
          fail(`${where} : hasVariant ${i + 1} prix ${offer?.price} ≠ ${v.price}`);
        const expected = SCHEMA[v.active ? availability : 'out_of_stock'];
        if (offer && offer.availability !== expected)
          fail(`${where} : hasVariant ${i + 1} disponibilité ${offer.availability}`);
        if (hasVariant[i] && new URL(hasVariant[i].url).pathname !== where)
          fail(`${where} : URL de variante hors fiche`);
      });
    } else {
      if (product['@type'] !== 'Product') fail(`${where} : Product attendu`);
      const amount = promo ?? variants[0]?.price ?? p.price_value;
      if (typeof amount === 'number') {
        if (product.offers?.price !== Number(amount).toFixed(2))
          fail(`${where} : prix JSON-LD ${product.offers?.price} ≠ ${amount}`);
        if (product.offers?.availability !== SCHEMA[availability])
          fail(`${where} : disponibilité JSON-LD ${product.offers?.availability}`);
      } else if (product.offers) fail(`${where} : Offer JSON-LD sans prix en base`);
    }
  }

  // Images rendues : toutes transformées localement (aucune image distante brute).
  for (const [, src] of html.matchAll(/<(?:img|source)[^>]+(?:src|srcset)="([^"]+)"/g))
    for (const candidate of src.split(',').map((s) => s.trim().split(/\s+/)[0]))
      if (candidate && !candidate.startsWith('/_astro/'))
        fail(`${where} : image non transformée ${candidate}`);
  const slides = (html.split('<template')[0].match(/class="dn-gallery__slide"/g) ?? []).length;
  const productMedia = p.product_media.filter((m) => !m.variant_id).length || (p.images ?? []).length;
  if (slides > productMedia)
    fail(`${where} : ${slides} images rendues pour ${productMedia} en base (image inventée ?)`);
  if (slides < productMedia)
    notes.push(`${where} : ${productMedia - slides} image(s) inaccessible(s) écartée(s)`);
  if (productMedia === 0 && !/Photo à venir/.test(html))
    fail(`${where} : produit sans image sans emplacement « Photo à venir »`);

  // Contenu : aucune mention de gabarit non rempli ni de promesse absente des CGV.
  // Les titres d'offres (table offers, point ouvert de l'étape 7 : « Pack Thérapeutiques ») sont
  // repris tels quels dans « Disponible aussi dans » : exclus de ce contrôle, comptés à part.
  const main = /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
  const offersBlock = /data-dn-product-offers[\s\S]*?<\/section>/.exec(main)?.[0] ?? '';
  if (/th[ée]rapeut/i.test(offersBlock)) offerTherapeutic.push(slug);
  const text = decode(
    main
      .replace(offersBlock, '')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<template[\s\S]*?<\/template>/g, ''),
  );
  for (const [re, label] of [
    [/[àa] compl[ée]ter/i, '« À compléter »'],
    [/th[ée]rapeut/i, '« thérapeutique »'],
    [/livraison offerte/i, '« livraison offerte »'],
    [/\bavis\b|★/i, 'avis / étoiles'],
  ])
    if (re.test(text)) fail(`${where} : ${label} présent dans la page`);
  // Décisions du 3 octobre 2026 : plus de paiement à la réception, aucune zone de livraison fixée.
  // Tout le HTML, y compris le message WhatsApp prérempli (encodé dans le lien de commande).
  const raw = html
    .replace(/%20/g, ' ')
    .replace(/%C3%A0/gi, 'à')
    .replace(/%C3%A9/gi, 'é');
  if (/paiement (?:à|a) la (?:r[ée]ception|livraison)|payez à la r[ée]ception/i.test(raw))
    fail(`${where} : « paiement à la réception » présent`);
  if (/[ÎI]le-de-France|%C3%8Ele-de-France|Chelles|Lognes/i.test(raw))
    fail(`${where} : zone de livraison Île-de-France présente`);

  // Produits similaires.
  const similar = /aria-labelledby="dn-similar-title"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  const similarSlugs = [...similar.matchAll(/class="dn-card__link[^"]*" href="\/([^"/]+)\/"/g)].map(
    (m) => m[1],
  );
  if (similarSlugs.length > 4) fail(`${where} : ${similarSlugs.length} produits similaires (4 max)`);
  for (const s of similarSlugs) {
    if (!bySlug.has(s)) fail(`${where} : similaire « ${s} » non publié`);
    if (s === slug) fail(`${where} : le produit se recommande lui-même`);
    if (safeGroupOf.has(slug) && safeGroupOf.get(s) === safeGroupOf.get(slug))
      fail(`${where} : similaire « ${s} » = même futur modèle (${safeGroupOf.get(slug)})`);
  }

  // lastmod réel.
  const lastmod = [p.updated_at, ...p.product_variants.map((v) => v.updated_at)].sort().at(-1).slice(0, 10);
  if (attr(html, 'data-dn-lastmod') !== lastmod)
    fail(`${where} : lastmod ${attr(html, 'data-dn-lastmod')} ≠ ${lastmod}`);
}
notes.push(`${variantPages} fiches à variantes réelles contrôlées variante par variante`);
if (offerTherapeutic.length)
  notes.push(
    `titre d'offre « Pack Thérapeutiques » (point ouvert étape 7) repris sur ${offerTherapeutic.length} fiches : ${offerTherapeutic.join(', ')}`,
  );

/* ── 9. Liens produit de toutes les pages → une page générée ────────────── */
let productLinks = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const [, href] of html.matchAll(/<a [^>]*href="(\/[a-z0-9-]+\/)"/g)) {
    const slug = href.slice(1, -1);
    if (!bySlug.has(slug)) continue;
    productLinks += 1;
    if (!routes.has(href)) fail(`${routeOf(file)} : lien produit ${href} sans page (404)`);
  }
}
notes.push(`${productLinks} liens vers des fiches produit, tous servis par une page générée`);

/* ── 10. LAB ────────────────────────────────────────────────────────────── */
const lab = join(dist, 'lab/regroupements/index.html');
if (!existsSync(lab)) fail('/lab/regroupements/ absent');
else {
  const html = readFileSync(lab, 'utf8');
  if (!/<meta name="robots" content="noindex/.test(html)) fail('/lab/regroupements/ : noindex absent');
  if (/data-dn-indexable/.test(html)) fail('/lab/regroupements/ : marqué indexable (sitemap)');
  const safe = snapshot.groupings.filter((g) => g.decision === 'safe' && g.kind === 'model');
  const members = safe.flatMap((g) => g.members);
  for (const g of safe) {
    const preview = join(dist, `lab/regroupements/${g.code.toLowerCase()}/index.html`);
    if (!existsSync(preview)) fail(`aperçu ${g.code} absent`);
    else if (!/<meta name="robots" content="noindex/.test(readFileSync(preview, 'utf8')))
      fail(`aperçu ${g.code} : noindex absent`);
    if (g.proposedSlug && (routes.has(`/${g.proposedSlug}/`) || bySlug.has(g.proposedSlug)))
      fail(`futur slug /${g.proposedSlug}/ (${g.code}) : déjà une page actuelle`);
    if (!new RegExp(`data-dn-group="${g.code}"`).test(html))
      fail(`/lab/regroupements/ : groupe ${g.code} absent`);
  }
  for (const m of members)
    if (!bySlug.has(m.slug)) notes.push(`LAB : membre ${m.slug} non publié (signalé sur la page)`);
  for (const g of snapshot.groupings.filter((g) => g.decision !== 'safe'))
    if (existsSync(join(dist, `lab/regroupements/${g.code.toLowerCase()}/index.html`)))
      fail(`aperçu fusionné généré pour ${g.code}, à valider`);
  notes.push(
    `LAB : ${safe.length} regroupements sûrs (${members.length} fiches) + ${snapshot.groupings.length - safe.length} à valider`,
  );
}
for (const file of htmlFiles) {
  if (routeOf(file).startsWith('/lab/')) continue;
  if (/href="\/lab\/regroupements/.test(readFileSync(file, 'utf8')))
    fail(`${routeOf(file)} : lien public vers le LAB`);
}
if (existsSync(join(dist, 'khamrah/index.html')))
  fail('/khamrah/ généré : la migration SEO n’est pas activée');

/* ── 11. Produits témoins ───────────────────────────────────────────────── */
const page = (slug) => {
  const entry = productPages.get(slug);
  if (!entry) fail(`produit témoin « ${slug} » absent (mettre à jour le témoin)`);
  return entry?.html ?? '';
};
const ld = (html) =>
  jsonLdOf(html).find((d) => d['@type'] === 'Product' || d['@type'] === 'ProductGroup') ?? {};
{
  const html = page('miel-nigelle');
  const radios = [...html.matchAll(/<input[^>]*name="contenance"[^>]*value="([^"]+)"/g)].map((m) => m[1]);
  if (radios.join() !== '50-g,200-g,300-g') fail(`témoin miel-nigelle : contenances ${radios}`);
  const units = [...html.matchAll(/class="dn-variant__unit-price"[^>]*>([^<]+)</g)].map((m) =>
    norm(decode(m[1])),
  );
  if (units.join(' | ') !== '199,80 € / kg | 124,95 € / kg | 116,63 € / kg')
    fail(`témoin miel-nigelle : prix au kg ${units}`);
  if (ld(html)['@type'] !== 'ProductGroup') fail('témoin miel-nigelle : ProductGroup attendu');
}
{
  const html = page('dn-abaya-chita-0');
  if (/name="couleur"/.test(html))
    fail('témoin dn-abaya-chita-0 : sélecteur de couleur public (fusion non validée)');
  if (
    /href="\/dn-abaya-chita-[1-5]\/"/.test(
      /aria-labelledby="dn-similar-title"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '',
    )
  )
    fail('témoin dn-abaya-chita-0 : autre coloris Chita dans les similaires');
}
{
  const html = page('qms-blanc');
  const sizes = [...html.matchAll(/<input[^>]*name="taille"[^>]*value="([^"]+)"/g)].map((m) => m[1]);
  if (sizes.join() !== 'm,l,xl,xxl') fail(`témoin qms-blanc : tailles ${sizes}`);
  if (!/Besoin d’aide pour choisir votre taille/.test(html))
    fail('témoin qms-blanc : aide aux tailles absente');
}
{
  const html = page('dn-lecode-galaxie');
  if (!/href="\/parfums\/lecode\/"/.test(html)) fail('témoin dn-lecode-galaxie : lien marque absent');
  if (!/<title>Galaxie – Extrait de parfum LeCode Paris \| Dar Nūr<\/title>/.test(html))
    fail('témoin dn-lecode-galaxie : title');
  if (ld(html).brand?.name !== 'LeCode Paris') fail('témoin dn-lecode-galaxie : marque JSON-LD');
}
{
  const html = page('khamrah-eau-de-parfum-unisexe-100ml-lattafa');
  if (!/Bientôt disponible/.test(html) || ORDER_RE.test(html))
    fail('témoin Khamrah : bientôt disponible / commande');
  if (ld(html).offers?.availability !== SCHEMA.coming_soon) fail('témoin Khamrah : disponibilité JSON-LD');
}
{
  const html = page('dn-abaya-chita-0'); // une seule photo
  if (!/data-dn-gallery-thumbs[^>]*hidden|hidden[^>]*data-dn-gallery-thumbs/.test(html))
    fail('témoin image unique : miniatures affichées');
}
{
  const html = page('savon-oliban');
  if (!/Photo à venir/.test(html) || ld(html).image)
    fail('témoin savon-oliban (sans image) : emplacement / JSON-LD');
}

/* ── 12. Sitemap (build de production) ───────────────────────────────────── */
const sitemap = join(dist, 'sitemap.xml');
if (existsSync(sitemap)) {
  const xml = readFileSync(sitemap, 'utf8');
  const entries = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)];
  for (const [, loc] of entries) if (/\/lab\/|\?/.test(loc)) fail(`sitemap : URL interdite ${loc}`);
  for (const [slug, { html }] of productPages) {
    const entry = entries.find(([, loc]) => new URL(loc).pathname === `/${slug}/`);
    if (!entry) fail(`sitemap : fiche /${slug}/ absente`);
    else if (entry[2] !== attr(html, 'data-dn-lastmod')) fail(`sitemap : lastmod de /${slug}/`);
  }
  notes.push(`sitemap : ${entries.length} URL, dont ${productPages.size} fiches avec lastmod`);
} else notes.push('sitemap : non écrit (build hors production) — contrôlé au build de production');

for (const note of notes) console.log(`• ${note}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} problème(s) :`);
  for (const error of errors.slice(0, 200)) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('\n✓ Contrôles des fiches produit réussis.');
