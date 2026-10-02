/**
 * Modèle du catalogue pour les pages univers / collections / marques (étape 7).
 *
 * - Lu UNE fois par build (mémoïsé), en 5 requêtes : collections publiées, produits publiés,
 *   marques, offres actives, paramètres publics.
 * - Classement : `collections` + `product_collections` (nouveau schéma) font foi.
 *   `products.category_id` n'est jamais lu ici.
 * - Une page affiche les produits rattachés (principale OU secondaire) à la collection ou à
 *   l'une de ses descendantes : /miels/ contient donc aussi les Miels gourmands, /mode-homme/
 *   les qamis, sandales et accessoires.
 * - Incohérence de données (chemin en double, produit sans principale, règle de type ambiguë)
 *   → le build ÉCHOUE : une page fausse est pire qu'un déploiement retardé.
 */
import { facetConfigOf, type TypeRule } from '@/config/catalog-pages';
import type { ProductSummary } from '@/types/catalog';
import { productFacetData, productImageUrls, resolveMediaUrl, toProductSummary } from './catalog';
import {
  fetchActiveOffers,
  fetchBrandPages,
  fetchCollectionPages,
  fetchPublicSettings,
  fetchPublishedCatalog,
  isSupabaseConfigured,
  type SupabaseCatalogProductRow,
  type SupabaseCollectionPageRow,
  type SupabaseOfferRow,
} from './supabase';

export interface CatalogCollection {
  id: string;
  slug: string;
  path: string;
  type: SupabaseCollectionPageRow['type'];
  name: string;
  navLabel: string | null;
  h1: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  imageUrl: string | null;
  isIndexable: boolean;
  parent: CatalogCollection | undefined;
  children: CatalogCollection[];
  /** Rang en parcours en profondeur de l'arbre (univers, puis ses collections dans l'ordre). */
  treeIndex: number;
}

export interface CatalogProduct {
  slug: string;
  name: string;
  tagline: string;
  summary: ProductSummary;
  primary: CatalogCollection;
  /** Slugs des collections d'appartenance (principale + secondaires publiées). */
  memberships: Set<string>;
  brand: { slug: string; name: string } | undefined;
  contenance: { code: string; label: string }[];
  taille: { code: string; label: string }[];
  minPrice: number | null;
  /** Rang dans l'ordre admin (sort_order, puis slug). */
  order: number;
  /** AAAAMMJJ : date d'ajout au catalogue Supabase. */
  added: string;
  featured: boolean;
  /** Images vérifiées (URL absolues), dans l'ordre. */
  images: string[];
}

export interface CatalogBrand {
  slug: string;
  name: string;
  description: string | null;
  /** Page marque : /parfums/{slug}/ (chemin de la collection Parfums + slug de marque). */
  path: string;
  products: CatalogProduct[];
  indexable: boolean;
}

export interface CatalogOffer {
  id: string;
  type: 'pack' | 'product_promo' | string;
  title: string;
  description: string | null;
  image: string | undefined;
  price: number | null;
  /** Prix de référence, uniquement s'il est PROUVÉ par les prix réels des produits. */
  provenCompareAt: number | null;
  items: { product: CatalogProduct | undefined; slug: string; quantity: number }[];
}

export interface Catalog {
  configured: boolean;
  collections: CatalogCollection[];
  bySlug: Map<string, CatalogCollection>;
  products: CatalogProduct[];
  brands: CatalogBrand[];
  offers: CatalogOffer[];
  settings: Map<string, unknown>;
  /** Images écartées (inaccessibles) : signalées au build, jamais affichées cassées. */
  droppedImages: string[];
}

/** Chemins déjà pris par des pages statiques du socle : une collection ne peut pas les occuper. */
const RESERVED_PATHS = ['/', '/demo/', '/design-system/', '/lab/supabase/', '/404/'];

const PARFUMS_SLUG = 'parfums';

let cache: Promise<Catalog> | undefined;

export function getCatalog(): Promise<Catalog> {
  cache ??= load();
  return cache;
}

function empty(): Catalog {
  return {
    configured: false,
    collections: [],
    bySlug: new Map(),
    products: [],
    brands: [],
    offers: [],
    settings: new Map(),
    droppedImages: [],
  };
}

async function load(): Promise<Catalog> {
  if (!isSupabaseConfigured()) return empty();
  const [collectionRows, productRows, brandRows, offerRows, settingRows] = await Promise.all([
    fetchCollectionPages(),
    fetchPublishedCatalog(),
    fetchBrandPages(),
    fetchActiveOffers(),
    fetchPublicSettings(),
  ]);

  const settings = new Map(settingRows.map((s) => [s.key, s.value]));
  const { collections, bySlug } = buildTree(collectionRows);
  const promoSlugs = activePromoSlugs(offerRows);
  const droppedImages: string[] = [];
  const reachable = await checkImages(
    [
      ...productRows.flatMap((row) => productImageUrls(row).slice(0, 3)),
      ...offerRows.flatMap((offer) => (offer.image ? [resolveMediaUrl(offer.image)] : [])),
    ],
    droppedImages,
  );

  const products = productRows.map((row, order) =>
    toCatalogProduct(row, order, bySlug, promoSlugs, reachable),
  );
  assertProducts(products, productRows);
  assertTypeRules(collections, products);

  const brands = buildBrands(brandRows, products, bySlug, settings);
  const offers = buildOffers(offerRows, products, reachable);
  if (droppedImages.length) {
    console.warn(`[catalogue] ${droppedImages.length} image(s) inaccessible(s) écartée(s) :`, droppedImages);
  }
  return { configured: true, collections, bySlug, products, brands, offers, settings, droppedImages };
}

/* ── Arbre des collections ──────────────────────────────────────────────── */

function buildTree(rows: SupabaseCollectionPageRow[]) {
  const byId = new Map<string, CatalogCollection>();
  const paths = new Set<string>();
  for (const row of rows) {
    // Les filtres / regroupements internes n'ont pas d'URL : pas de page (étape 6).
    if (row.type === 'filter' || row.type === 'group' || !row.path) continue;
    if (paths.has(row.path)) throw new Error(`[catalogue] chemin de collection en double : ${row.path}`);
    if (RESERVED_PATHS.includes(row.path))
      throw new Error(`[catalogue] la collection « ${row.slug} » occupe le chemin réservé ${row.path}`);
    paths.add(row.path);
    byId.set(row.id, {
      id: row.id,
      slug: row.slug,
      path: row.path,
      type: row.type,
      name: row.name,
      navLabel: row.nav_label,
      h1: row.h1,
      description: row.description,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      imageUrl: row.image_url,
      isIndexable: row.is_indexable,
      parent: undefined,
      children: [],
      treeIndex: 0,
    });
  }
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node || !row.parent_id) continue;
    const parent = byId.get(row.parent_id);
    // Parent non publié : la collection n'est rattachée à rien → refus explicite.
    if (!parent) throw new Error(`[catalogue] « ${row.slug} » : collection parente absente ou non publiée`);
    node.parent = parent;
    parent.children.push(node); // les lignes arrivent triées par sort_order
  }
  // Ordre de l'arbre : chaque racine suivie de ses descendantes (sort_order à chaque niveau).
  const collections = [...byId.values()].filter((c) => !c.parent).flatMap(subtreeOf);
  collections.forEach((c, index) => (c.treeIndex = index));
  return { collections, bySlug: new Map(collections.map((c) => [c.slug, c])) };
}

/** Racine d'une collection (univers ou transverse). */
export function rootOf(collection: CatalogCollection): CatalogCollection {
  let node = collection;
  while (node.parent) node = node.parent;
  return node;
}

/** Collection + toutes ses descendantes. */
export function subtreeOf(collection: CatalogCollection): CatalogCollection[] {
  return [collection, ...collection.children.flatMap(subtreeOf)];
}

/** Ancêtres, de la racine au parent direct. */
export function ancestorsOf(collection: CatalogCollection): CatalogCollection[] {
  const chain: CatalogCollection[] = [];
  for (let node = collection.parent; node; node = node.parent) chain.unshift(node);
  return chain;
}

/**
 * Produits rattachés à la collection ou à une descendante, dans l'ordre « Sélection » :
 * ordre de l'arbre de leur collection principale (la collection elle-même avant ses
 * sous-collections), puis ordre admin (sort_order, slug).
 */
export function productsOf(catalog: Catalog, collection: CatalogCollection): CatalogProduct[] {
  const slugs = new Set(subtreeOf(collection).map((c) => c.slug));
  return catalog.products
    .filter((p) => [...p.memberships].some((m) => slugs.has(m)))
    .sort((a, b) => a.primary.treeIndex - b.primary.treeIndex || a.order - b.order);
}

/* ── Produits ───────────────────────────────────────────────────────────── */

function toCatalogProduct(
  row: SupabaseCatalogProductRow,
  order: number,
  bySlug: Map<string, CatalogCollection>,
  promoSlugs: Set<string>,
  reachable: Set<string>,
): CatalogProduct {
  const primaries = row.product_collections.filter((pc) => pc.role === 'primary');
  const primarySlug = primaries[0]?.collections?.slug;
  const primary = primarySlug ? bySlug.get(primarySlug) : undefined;
  if (primaries.length !== 1 || !primary) {
    throw new Error(`[catalogue] « ${row.slug} » : collection principale absente, multiple ou non publiée`);
  }
  const images = productImageUrls(row).filter((url) => reachable.has(url));
  // Les images vérifiées remplacent celles de la ligne : une image inaccessible n'est jamais rendue.
  const summary = toProductSummary(
    { ...row, product_media: [], images: images.slice(0, 2) },
    { onOffer: promoSlugs.has(row.slug) },
  );
  const facets = productFacetData(row);
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? '',
    summary,
    primary,
    memberships: new Set(
      row.product_collections
        .map((pc) => pc.collections?.slug)
        .filter((slug): slug is string => Boolean(slug && bySlug.has(slug))),
    ),
    brand: row.brand && row.brand_slug ? { slug: row.brand_slug, name: row.brand } : undefined,
    contenance: facets.contenance,
    taille: facets.taille,
    minPrice: facets.minPrice,
    order,
    added: row.created_at.slice(0, 10).replaceAll('-', ''),
    featured: row.featured,
    images,
  };
}

function assertProducts(products: CatalogProduct[], rows: SupabaseCatalogProductRow[]) {
  const drafts = rows.filter((r) => r.status !== 'published');
  if (drafts.length)
    throw new Error(`[catalogue] produit(s) non publié(s) reçu(s) : ${drafts.map((d) => d.slug)}`);
  const slugs = new Set<string>();
  for (const product of products) {
    if (slugs.has(product.slug)) throw new Error(`[catalogue] slug produit en double : ${product.slug}`);
    slugs.add(product.slug);
  }
}

/** Règles lexicales de type : chacune trouve au moins un produit, aucun produit n'en a deux. */
function assertTypeRules(collections: CatalogCollection[], products: CatalogProduct[]) {
  for (const collection of collections) {
    const rules = facetConfigOf(collection.slug).types;
    if (!rules) continue;
    const slugs = new Set(subtreeOf(collection).map((c) => c.slug));
    const scope = products.filter((p) => [...p.memberships].some((m) => slugs.has(m)));
    for (const rule of rules) {
      if (!scope.some((p) => matchesRule(p, rule)))
        throw new Error(`[catalogue] règle de type « ${rule.code} » (${collection.slug}) : aucun produit`);
    }
    for (const product of scope) {
      const matched = rules.filter((rule) => matchesRule(product, rule));
      if (matched.length > 1)
        throw new Error(
          `[catalogue] « ${product.slug} » correspond à ${matched.length} types (${collection.slug})`,
        );
    }
  }
}

/**
 * Règle lexicale : motif testé sur « nom · accroche » (^ ne vise donc que le début du nom).
 * Règle d'appartenance : le produit est rattaché à la collection indiquée.
 */
export function matchesRule(product: CatalogProduct, rule: TypeRule): boolean {
  if ('collection' in rule) return product.memberships.has(rule.collection);
  return rule.pattern.test(`${product.name} · ${product.tagline}`);
}

/* ── Images ─────────────────────────────────────────────────────────────── */

/**
 * Vérifie (HEAD, 16 en parallèle) les images susceptibles d'être rendues : les trois premières
 * de chaque produit et celles des offres. Une image inaccessible est écartée et signalée ; le produit passe à
 * l'image suivante ou au repli « Photo à venir ». Sans cette étape, une seule image
 * supprimée côté stockage ferait échouer tout le build d'images.
 */
async function checkImages(candidates: string[], dropped: string[]): Promise<Set<string>> {
  const urls = [...new Set(candidates)];
  const ok = new Set<string>();
  let next = 0;
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (next < urls.length) {
        const url = urls[next++]!;
        try {
          const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
          if (response.ok) ok.add(url);
          else dropped.push(`${response.status} ${url}`);
        } catch {
          dropped.push(`erreur réseau ${url}`);
        }
      }
    }),
  );
  return ok;
}

/* ── Marques de parfum ──────────────────────────────────────────────────── */

function buildBrands(
  rows: Awaited<ReturnType<typeof fetchBrandPages>>,
  products: CatalogProduct[],
  bySlug: Map<string, CatalogCollection>,
  settings: Map<string, unknown>,
): CatalogBrand[] {
  const parfums = bySlug.get(PARFUMS_SLUG);
  if (!parfums) return [];
  const inParfums = productsOfSubtree(parfums, products);
  const minModels = numberSetting(settings, 'brand_min_models_indexable', 4);
  return rows
    .map((row) => {
      const brandProducts = inParfums.filter((p) => p.brand?.slug === row.id);
      const description = row.description?.trim() || null;
      return {
        slug: row.id,
        name: row.name,
        description,
        path: `${parfums.path}${row.id}/`,
        products: brandProducts,
        // Règle de l'étape 3 : ≥ N modèles publiés ET une description de marque.
        indexable: parfums.isIndexable && brandProducts.length >= minModels && description !== null,
      };
    })
    .filter((brand) => brand.products.length > 0); // marque sans parfum publié : pas de page
}

function productsOfSubtree(collection: CatalogCollection, products: CatalogProduct[]) {
  const slugs = new Set(subtreeOf(collection).map((c) => c.slug));
  return products.filter((p) => slugs.has(p.primary.slug));
}

function numberSetting(settings: Map<string, unknown>, key: string, fallback: number): number {
  const value = settings.get(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/* ── Offres ─────────────────────────────────────────────────────────────── */

function isLive(offer: SupabaseOfferRow, now = new Date()): boolean {
  const started = !offer.starts_at || new Date(offer.starts_at) <= now;
  const notExpired = !offer.ends_at || new Date(offer.ends_at) > now;
  return started && notExpired;
}

/** Produits d'une offre « product_promo » active et dans sa fenêtre : badge « Offre » (§G.2). */
function activePromoSlugs(rows: SupabaseOfferRow[]): Set<string> {
  return new Set(
    rows
      .filter((offer) => offer.type === 'product_promo' && isLive(offer))
      .flatMap((offer) => offer.offer_products.map((item) => item.product_slug))
      .filter((slug): slug is string => Boolean(slug)),
  );
}

function buildOffers(rows: SupabaseOfferRow[], products: CatalogProduct[], reachable: Set<string>) {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return rows
    .filter((offer) => isLive(offer))
    .map((offer): CatalogOffer => {
      const items = [...offer.offer_products]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((item) => ({
          slug: item.product_slug ?? '',
          product: item.product_slug ? bySlug.get(item.product_slug) : undefined,
          quantity: item.quantity ?? 1,
        }));
      return {
        id: offer.id,
        type: offer.type,
        title: offer.title,
        description: offer.description,
        image:
          offer.image && reachable.has(resolveMediaUrl(offer.image))
            ? resolveMediaUrl(offer.image)
            : undefined,
        price: offer.promo_price,
        provenCompareAt: provenCompareAt(offer, items),
        items,
      };
    });
}

/**
 * Une économie n'est affichée que si elle est PROUVÉE : promotion produit dont le prix de
 * référence est exactement le prix fixe réel de chacun des produits concernés. Un pack dont
 * les formats inclus ne sont pas renseignés (variant_id NULL) ne prouve rien : aucun prix barré.
 */
function provenCompareAt(offer: SupabaseOfferRow, items: CatalogOffer['items']): number | null {
  if (offer.type !== 'product_promo' || offer.normal_price === null || offer.promo_price === null)
    return null;
  if (offer.promo_price >= offer.normal_price || items.length === 0) return null;
  const allMatch = items.every(
    (item) =>
      item.product &&
      item.product.summary.price.kind === 'fixed' &&
      item.product.summary.price.amount === offer.normal_price,
  );
  return allMatch ? offer.normal_price : null;
}
