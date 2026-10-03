/**
 * Modèle de vue des FICHES PRODUIT (étape 8).
 *
 * Tout est dérivé des données réelles (catalog-store → ligne Supabase complète). Nouveau
 * schéma d'abord, ancien champ seulement s'il est vide — chaque repli est signalé « REPLI » :
 *   - médias : product_media, sinon images[] ;
 *   - options : product_variant_options, sinon options jsonb, sinon nom de variante ;
 *   - composition / origine : product_food_details / product_apparel_details (vides
 *     aujourd'hui), sinon products.composition / products.provenance ;
 *   - quantité : net_quantity + net_unit (normalisés), jamais weight/volume bruts ;
 *   - disponibilité : availability, NULL → coming_soon (jamais available).
 * Le champ historique `accordions` (HTML libre) n'est jamais rendu : il contient des
 * mentions « À compléter », l'ancien mot « thérapeutiques », des styles en ligne et des
 * liens texte non cliquables (voir docs/REFONTE_ASTRO.md).
 */
import {
  AVAILABILITY_LABELS,
  AXES,
  AXIS_ORDER,
  BENEFITS_FAMILIES,
  MODE_UNIVERSE,
  PERFUME_COLLECTIONS,
  PERFUME_TYPES,
  SIMILAR_COUNT,
  TITLE_TYPE_FALLBACK,
  UNIT_BASES,
  type ProductFamily,
} from '@/config/product-pages';
import { cgvUrl, contact, currentShipping, orderingSteps } from '@/config/commerce';
import { siteName } from '@/config/site';
import groupingsSnapshot from '@/data/lab/product-groupings.json';
import type {
  BreadcrumbItem,
  MediaImage,
  PriceInfo,
  ProductSummary,
  SizeGuide,
  VariantOption,
  VariantPresentation,
} from '@/types/catalog';
import { commercialAvailability, netQuantityLabel, resolveMediaUrl } from './catalog';
import {
  ancestorsOf,
  getCatalog,
  productsOf,
  rootOf,
  type Catalog,
  type CatalogCollection,
  type CatalogOffer,
  type CatalogProduct,
  type ProductPromo,
} from './catalog-store';
import { formatPrice } from './format';
import type {
  ProductAvailability,
  SupabaseCatalogProductRow,
  SupabaseCatalogVariantRow,
  SupabaseSizeGuideRow,
} from './supabase';

/* ── Types de vue ───────────────────────────────────────────────────────── */

export interface ProductAxisView {
  /** option_type_id (contenance, taille, couleur…). */
  id: string;
  legend: string;
  /** Paramètre d'URL (?contenance=200-g). */
  param: string;
  presentation: VariantPresentation;
  /** Formule de l'aide « Choisissez une contenance pour continuer. » */
  verb: string;
  options: VariantOption[];
}

/** Variante sérialisée pour le script de la fiche (combinaison → prix, dispo, médias). */
export interface ProductVariantData {
  /** Codes d'options par axe : { contenance: '200-g' }. */
  options: Record<string, string>;
  /** Libellé lisible : « 200 g », « Noir · L ». */
  label: string;
  price: number | null;
  available: boolean;
  /** Prix au kg / litre de CETTE variante, si calculable proprement. */
  unitPrice: string | null;
  /** Jeu de médias propre (clé de `mediaSets`) ; absent = galerie du produit. */
  media?: string;
  /** Étape 10 — identifiant de la variante (panier) ; absent dans un aperçu LAB. */
  id?: string;
  /** Prix unitaire facturé en centimes (prix de la variante, sinon du produit) ; null = non commandable. */
  priceCents?: number | null;
}

/**
 * Données du panier d'une fiche (étape 10). Le navigateur les recopie dans le panier local, puis
 * le serveur de commande relit TOUT en base : un prix modifié ici est refusé, jamais facturé.
 */
export interface ProductCartView {
  productId: string;
  slug: string;
  name: string;
  href: string;
  /** Commandable : disponible ou sur commande, et un prix existe. */
  orderable: boolean;
  onDemand: boolean;
  /** Produit sans variante : prix facturé en centimes (offre prouvée comprise). */
  priceCents: number | null;
  /** Prix catalogue en centimes si une offre produit s'applique. */
  listPriceCents: number | null;
  offerTitle: string | null;
}

export type AccordionBlock =
  | { kind: 'paragraphs'; items: string[] }
  | { kind: 'list'; title?: string; items: string[] }
  | { kind: 'facts'; items: [term: string, value: string][] }
  | { kind: 'links'; items: { label: string; href: string; external?: boolean }[] };

export interface ProductAccordion {
  id: string;
  title: string;
  open?: boolean;
  blocks: AccordionBlock[];
}

export interface ProductOrder {
  /** Commande possible (available / on_demand) ? Sinon : simple lien de question. */
  orderable: boolean;
  /**
   * Lien WhatsApp SECONDAIRE « Une question ? » (étape 10 : la commande passe par le panier).
   * Message prérempli : nom et lien du produit seulement, aucune donnée client.
   */
  href: string;
  /** Hérité de l'étape 8 (commande WhatsApp) : vide depuis l'étape 10. */
  messageHead: string;
  messageTail: string;
}

export interface ProductPageView {
  kind: 'product' | 'preview';
  slug: string;
  path: string;
  name: string;
  seoTitle: string;
  seoDescription: string;
  breadcrumb: BreadcrumbItem[];
  family: ProductFamily;
  brand?: { name: string; href?: string };
  /** Ligne de faits : « Extrait de parfum · 50 ml ». */
  facts: string[];
  tagline?: string;
  price: PriceInfo;
  /** Prix au kg / litre d'un produit à format unique, si calculable proprement. */
  unitPrice: string | null;
  availability: ProductAvailability;
  availabilityLabel: string;
  axes: ProductAxisView[];
  variants: ProductVariantData[];
  gallery: MediaImage[];
  /** Galeries propres à une variante (insérées seulement à la sélection). */
  mediaSets: Record<string, MediaImage[]>;
  sizeGuide: SizeGuide | null;
  hasSizeAxis: boolean;
  accordions: ProductAccordion[];
  order: ProductOrder;
  /** Étape 10 : ajout au panier ; absent pour un aperçu LAB (aucune commande possible). */
  cart?: ProductCartView;
  delivery: string;
  similar: ProductSummary[];
  similarTitle: string;
  related: ProductSummary[];
  offers: CatalogOffer[];
  /** Date de dernière modification réelle (AAAA-MM-JJ) : produit ou variante. */
  lastmod: string;
  indexable: boolean;
  /** Données JSON-LD (Product ou ProductGroup) ; absent pour un aperçu LAB. */
  structured?: ProductStructured;
}

export interface ProductStructured {
  name: string;
  description: string;
  images: string[];
  brand?: string;
  /** Produit simple. */
  offer?: { price: number; availability: ProductAvailability };
  /** Produit à variantes réelles. */
  group?: {
    variesBy: string[];
    variants: { name: string; query: string; price: number | null; available: boolean; size: string }[];
  };
}

/* ── Routes ─────────────────────────────────────────────────────────────── */

/** Slugs des fiches à générer : TOUS les produits publiés (le store refuse tout brouillon). */
export async function productSlugs(): Promise<string[]> {
  const catalog = await getCatalog();
  return catalog.products.map((p) => p.slug);
}

export async function productView(slug: string): Promise<ProductPageView> {
  const catalog = await getCatalog();
  const product = catalog.products.find((p) => p.slug === slug);
  if (!product) throw new Error(`[fiche] produit inconnu ou non publié : ${slug}`);
  return buildView(catalog, product);
}

/* ── Construction ───────────────────────────────────────────────────────── */

const HOME: BreadcrumbItem = { name: 'Accueil', href: '/' };

export function familyOf(collection: CatalogCollection): ProductFamily {
  if (PERFUME_COLLECTIONS.includes(collection.slug)) return 'parfum';
  return rootOf(collection).slug === MODE_UNIVERSE ? 'mode' : 'bien-etre';
}

export function breadcrumbOf(product: CatalogProduct): BreadcrumbItem[] {
  return [
    HOME,
    ...[...ancestorsOf(product.primary), product.primary].map((c) => ({ name: c.name, href: c.path })),
    { name: product.name, href: `/${product.slug}/` },
  ];
}

function buildView(catalog: Catalog, product: CatalogProduct): ProductPageView {
  const row = product.row;
  const family = familyOf(product.primary);
  const concentration = perfumeType(row);
  const { axes, variants, mediaSets } = variantModel(catalog, row);
  const gallery = productGallery(catalog, row);
  const availability = commercialAvailability(row);
  // Étape 10 : une promotion produit PROUVÉE fixe le prix affiché ET facturé (même règle que le
  // serveur de commande) ; le prix catalogue apparaît barré.
  const promo = catalog.promos.get(product.slug);
  const price: PriceInfo = promo
    ? { kind: 'fixed', amount: promo.price, compareAt: promo.compareAt }
    : product.summary.price;
  const quantity = axes.some((a) => a.id === 'contenance') ? null : netQuantityLabel(row);
  const facts = [concentration, quantity].filter((f): f is string => Boolean(f));
  const tagline = taglineOf(row, concentration);
  const brand = brandOf(catalog, product);
  const path = `/${product.slug}/`;
  const sizeGuide = sizeGuideOf(catalog.sizeGuides, row.size_guide_id);
  const description = metaDescription(row, tagline);
  return {
    kind: 'product',
    slug: product.slug,
    path,
    name: row.name,
    seoTitle: seoTitleOf(row, product.primary, concentration),
    seoDescription: description,
    breadcrumb: breadcrumbOf(product),
    family,
    ...(brand ? { brand } : {}),
    facts,
    ...(tagline ? { tagline } : {}),
    price,
    unitPrice:
      price.kind === 'fixed' && axes.length === 0
        ? unitPriceOf(price.amount, row.net_quantity, row.net_unit)
        : null,
    availability,
    availabilityLabel: AVAILABILITY_LABELS[availability],
    axes,
    variants,
    gallery,
    mediaSets,
    sizeGuide,
    hasSizeAxis: axes.some((a) => a.id === 'taille'),
    accordions: accordionsOf(row, family),
    order: orderOf(row.name, path, availability, axes),
    cart: cartOf(row, path, availability, variants, promo),
    delivery: currentShipping.summary,
    ...similarOf(catalog, product),
    related: relatedOf(catalog, product),
    offers: catalog.offers.filter((offer) => offer.items.some((item) => item.slug === product.slug)),
    lastmod: lastmodOf(row),
    indexable: true,
    structured: structuredOf(row, gallery, brand?.name, price, availability, axes, variants, description),
  };
}

/* ── SEO ────────────────────────────────────────────────────────────────── */

/** Minuscules sans accents ni ponctuation, pour tester « le nom contient déjà… ». */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const contains = (haystack: string, needle: string) => ` ${fold(haystack)} `.includes(` ${fold(needle)} `);

/**
 * Concentration / type de parfum, uniquement depuis le vocabulaire fermé (config) :
 * début de l'accroche, élément de `benefits` strictement égal, ou nom qui le contient déjà.
 */
export function perfumeType(row: SupabaseCatalogProductRow): string | null {
  const tagline = fold(row.tagline ?? '');
  for (const type of PERFUME_TYPES) {
    const key = fold(type);
    if (tagline === key || tagline.startsWith(`${key} `)) return type;
    if ((row.benefits ?? []).some((b) => fold(b) === key)) return type;
    if (contains(row.name, type)) return type;
  }
  return null;
}

/**
 * Title (règle de l'étape 3) : `seo_title` s'il existe ; sinon
 *   parfum   : {Nom} – {concentration} {marque} | Dar Nūr (chaque terme omis s'il est déjà
 *              dans le nom ou inconnu) ;
 *   autre    : {Nom} – {type} | Dar Nūr seulement si un type de repli est configuré ;
 * « | Dar Nūr » n'est pas ajouté si le nom contient déjà la marque du site.
 */
export function seoTitleOf(
  row: SupabaseCatalogProductRow,
  primary: CatalogCollection,
  concentration: string | null,
): string {
  if (row.seo_title?.trim()) return row.seo_title.trim();
  const name = row.name.trim();
  let suffix = '';
  if (PERFUME_COLLECTIONS.includes(primary.slug)) {
    const type = concentration ?? TITLE_TYPE_FALLBACK[primary.slug] ?? null;
    suffix = [
      type && !contains(name, type) ? type : null,
      row.brand && !contains(name, row.brand) ? row.brand : null,
    ]
      .filter(Boolean)
      .join(' ');
  } else {
    const type = TITLE_TYPE_FALLBACK[primary.slug];
    if (type && !contains(name, type)) suffix = type;
  }
  const base = suffix ? `${name} – ${suffix}` : name;
  return contains(base, siteName) ? base : `${base} | ${siteName}`;
}

/** Retire les phrases / éléments contenant « À compléter » (gabarits non remplis en base). */
const PLACEHOLDER = /[àa] compl[ée]ter/i;
function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !PLACEHOLDER.test(sentence))
    .join(' ')
    .trim();
  return kept || null;
}
function cleanList(items: string[] | null | undefined): string[] {
  return (items ?? []).map((item) => item.trim()).filter((item) => item && !PLACEHOLDER.test(item));
}

/** Accroche affichée sous le H1, sauf si elle ne fait que répéter le type de parfum. */
function taglineOf(row: SupabaseCatalogProductRow, concentration: string | null): string | null {
  const tagline = cleanText(row.tagline);
  if (!tagline || fold(tagline) === fold(row.name)) return null;
  if (concentration && fold(tagline).startsWith(fold(concentration))) return null;
  return tagline;
}

/** Coupe sur un mot entier. */
function clip(text: string, max = 158): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/**
 * Meta description : seo_description ; sinon accroche (complétée par le début de la
 * description si elle est courte) ; sinon description. Jamais de prix, de promesse de
 * livraison, de WhatsApp ni de qualificatif ajouté.
 */
export function metaDescription(row: SupabaseCatalogProductRow, tagline: string | null): string {
  if (row.seo_description?.trim()) return row.seo_description.trim();
  const paragraphs = cleanList(row.description)
    .map((p) => cleanText(p))
    .filter((p): p is string => !!p);
  const parts = [tagline, ...paragraphs].filter((p): p is string => Boolean(p));
  let text = '';
  for (const part of parts) {
    const sentence = /[.!?…]$/.test(part) ? part : `${part}.`;
    if (text && text.length >= 110) break;
    text = text ? `${text} ${sentence}` : sentence;
  }
  // Dernier recours factuel : le nom seul (aucune phrase inventée).
  return clip(text || row.name);
}

/* ── Marque ─────────────────────────────────────────────────────────────── */

function brandOf(catalog: Catalog, product: CatalogProduct) {
  if (!product.brand) return undefined;
  const page = catalog.brands.find((b) => b.slug === product.brand!.slug);
  return { name: product.brand.name, ...(page ? { href: page.path } : {}) };
}

/* ── Prix au kg / litre ─────────────────────────────────────────────────── */

/**
 * Prix unitaire uniquement si la quantité est NUMÉRIQUE, l'unité CERTAINE (g, kg, ml, l
 * normalisés en base) et le prix connu. « 100 » ou « 200 » sans unité → rien.
 */
export function unitPriceOf(
  price: number | null | undefined,
  quantity: number | string | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (typeof price !== 'number' || quantity === null || quantity === undefined || !unit) return null;
  const value = Number(quantity);
  const base = UNIT_BASES[unit.toLowerCase()];
  if (!base || !Number.isFinite(value) || value <= 0) return null;
  return `${formatPrice((price * base.factor) / value)} / ${base.per}`;
}

/* ── Variantes ──────────────────────────────────────────────────────────── */

const byOrder = (a: SupabaseCatalogVariantRow, b: SupabaseCatalogVariantRow) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0);

/**
 * Axes et variantes RÉELS. Une variante est rattachée à ses options normalisées
 * (product_variant_options). REPLI : options jsonb historiques, sinon le nom de la variante
 * sur l'axe déclaré par `variant_axes` (aucun cas au 2 octobre 2026 : 115/115 normalisées).
 * Le build échoue si deux variantes portent la même combinaison.
 */
function variantModel(catalog: Catalog, row: SupabaseCatalogProductRow) {
  const variants = [...row.product_variants].sort(byOrder);
  const axisIds = new Set<string>();
  const perVariant = variants.map((variant) => {
    const options: Record<
      string,
      { code: string; label: string; quantity: number | null; unit: string | null }
    > = {};
    for (const option of variant.product_variant_options) {
      if (!option.option_values) continue;
      options[option.option_type_id] = {
        code: option.option_values.code,
        label: option.option_values.label,
        quantity: option.option_values.numeric_value,
        unit: option.option_values.unit,
      };
    }
    if (Object.keys(options).length === 0) {
      // REPLI : ancien modèle (jsonb), puis nom de variante sur l'axe historique.
      const legacyAxis = row.variant_axes?.[0] === 'format' ? 'contenance' : row.variant_axes?.[0];
      const legacy = Object.entries(variant.options ?? {});
      for (const [key, value] of legacy) {
        const axis = key === 'format' ? 'contenance' : key;
        options[axis] = { code: slug(value), label: value, quantity: null, unit: null };
      }
      if (legacy.length === 0 && legacyAxis)
        options[legacyAxis] = { code: slug(variant.name), label: variant.name, quantity: null, unit: null };
    }
    for (const axis of Object.keys(options)) axisIds.add(axis);
    return { variant, options };
  });

  if (variants.length === 0 || axisIds.size === 0) return { axes: [], variants: [], mediaSets: {} };

  const unknown = [...axisIds].filter((id) => !AXES[id]);
  if (unknown.length) throw new Error(`[fiche] ${row.slug} : axe de variante non géré ${unknown.join(', ')}`);
  const orderedAxes = [...axisIds].sort((a, b) => AXIS_ORDER.indexOf(a) - AXIS_ORDER.indexOf(b));

  const combos = new Set<string>();
  for (const { options } of perVariant) {
    const key = orderedAxes.map((axis) => options[axis]?.code ?? '∅').join('|');
    if (combos.has(key)) throw new Error(`[fiche] ${row.slug} : combinaison de variantes en double (${key})`);
    combos.add(key);
  }

  // Médias propres aux variantes (product_media.variant_id), vérifiés accessibles.
  const mediaSets: Record<string, MediaImage[]> = {};
  const productImages = productGallery(catalog, row);
  let previous: string | undefined;
  const data: ProductVariantData[] = perVariant.map(({ variant, options }) => {
    const label = orderedAxes
      .map((axis) => options[axis]?.label)
      .filter(Boolean)
      .join(' · ');
    const own = row.product_media
      .filter((m) => m.variant_id === variant.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => resolveMediaUrl(m.url))
      .filter((url) => catalog.reachable.has(url));
    let media: string | undefined;
    if (own.length) {
      media = variant.id;
      // La photo de la variante d'abord, puis le reste de la galerie produit (sans doublon).
      mediaSets[media] = dedupe([
        ...own.map((src) => ({ src, alt: `${row.name} – ${label}` })),
        ...productImages,
      ]);
      previous = media;
    } else if (options['contenance'] && previous) {
      // Repli VALIDÉ (§M.2 de l'étape 4, ancien site) : un format sans photo propre montre
      // celle du format précédent (300 g → pot 200 g).
      media = previous;
    }
    const contenance = options['contenance'];
    const effective = typeof variant.price === 'number' ? Number(variant.price) : row.price_value;
    return {
      id: variant.id,
      priceCents: typeof effective === 'number' && effective > 0 ? Math.round(effective * 100) : null,
      options: Object.fromEntries(
        orderedAxes.flatMap((axis) => (options[axis] ? [[axis, options[axis].code]] : [])),
      ),
      label,
      price: typeof variant.price === 'number' ? Number(variant.price) : null,
      available: variant.active,
      unitPrice: contenance ? unitPriceOf(variant.price, contenance.quantity, contenance.unit) : null,
      ...(media ? { media } : {}),
    };
  });

  const axes: ProductAxisView[] = orderedAxes.map((axisId) => {
    const config = AXES[axisId]!;
    const seen = new Map<string, VariantOption>();
    perVariant.forEach(({ options }, index) => {
      const option = options[axisId];
      if (!option) return;
      const variant = data[index]!;
      const existing = seen.get(option.code);
      const single = orderedAxes.length === 1;
      seen.set(option.code, {
        id: option.code,
        label: option.label,
        // Prix et prix unitaire par option seulement sur un axe unique (sinon ils dépendent
        // de la combinaison) ; une option est disponible si l'une de ses variantes l'est.
        ...(single && variant.price !== null ? { price: variant.price } : {}),
        ...(single ? { unitPrice: variant.unitPrice } : {}),
        available: (existing?.available ?? false) || variant.available,
      });
    });
    return {
      id: axisId,
      legend: config.legend,
      param: config.param,
      presentation: config.presentation,
      verb: config.verb,
      options: [...seen.values()],
    };
  });

  return { axes, variants: data, mediaSets };
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ── Galerie ────────────────────────────────────────────────────────────── */

function dedupe(images: MediaImage[]): MediaImage[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = String(image.src);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Galerie du produit : product_media sans variante (ordre sort_order) ; REPLI images[] si
 * product_media est vide. Seules les images vérifiées accessibles sont rendues ; aucune
 * image n'est inventée (galerie vide → emplacement « Photo à venir »).
 * Alt : alt_text s'il existe, sinon le nom du produit (descriptif, sans mot-clé ajouté).
 */
export function productGallery(catalog: Catalog, row: SupabaseCatalogProductRow): MediaImage[] {
  const media = row.product_media
    .filter((m) => m.variant_id === null)
    .sort((a, b) => a.sort_order - b.sort_order);
  const sources =
    media.length > 0
      ? media.map((m) => ({ url: m.url, alt: m.alt_text }))
      : (row.images ?? []).map((url) => ({ url, alt: null }));
  return dedupe(
    sources
      .map(({ url, alt }) => ({ src: resolveMediaUrl(url), alt: alt?.trim() || row.name }))
      .filter((image) => catalog.reachable.has(image.src)),
  );
}

/* ── Guide des tailles ──────────────────────────────────────────────────── */

const MEASURE_LABELS: Record<string, string> = {
  stature: 'Stature',
  poitrine: 'Tour de poitrine',
  longueur: 'Longueur',
  longueur_dos: 'Longueur dos',
  manche: 'Manche',
  pointure_cm: 'Longueur du pied',
};

/** Tableau du guide publié rattaché au produit ; null si aucun (cas de tous les produits). */
function sizeGuideOf(guides: Map<string, SupabaseSizeGuideRow>, id: string | null): SizeGuide | null {
  const guide = id ? guides.get(id) : undefined;
  if (!guide || guide.size_guide_rows.length === 0) return null;
  const rows = [...guide.size_guide_rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const measures = [...new Set(rows.map((r) => r.measure))];
  const sizes = [...new Set(rows.map((r) => r.size_label))];
  const unit = guide.unit === 'eu' ? '' : ` (${guide.unit})`;
  return {
    title: guide.name,
    columns: ['Taille', ...measures.map((m) => `${MEASURE_LABELS[m] ?? m}${unit}`)],
    rows: sizes.map((size) => [
      size,
      ...measures.map((measure) => {
        const cell = rows.find((r) => r.size_label === size && r.measure === measure);
        if (!cell) return '—';
        return cell.value_max !== null ? `${cell.value_min} – ${cell.value_max}` : String(cell.value_min);
      }),
    ]),
    ...(guide.measuring_instructions ? { howToMeasure: guide.measuring_instructions.split(/\n+/) } : {}),
  };
}

/* ── Accordéons ─────────────────────────────────────────────────────────── */

/** Paragraphes d'un texte libre (lignes vides = nouveaux paragraphes). */
const paragraphsOf = (text: string | null) =>
  (text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

/**
 * Accordéons (§L.5) : seulement les sections dont la donnée existe, Description ouverte.
 * Aucun accordéon « information à venir ».
 */
export function accordionsOf(row: SupabaseCatalogProductRow, family: ProductFamily): ProductAccordion[] {
  const accordions: ProductAccordion[] = [];

  // Description : paragraphes réels (+ points forts pour parfums et mode).
  const description = cleanList(row.description)
    .map((p) => cleanText(p))
    .filter((p): p is string => Boolean(p));
  const benefits = BENEFITS_FAMILIES.includes(family) ? cleanList(row.benefits) : [];
  const descriptionBlocks: AccordionBlock[] = [];
  if (description.length) descriptionBlocks.push({ kind: 'paragraphs', items: description });
  if (benefits.length)
    descriptionBlocks.push({
      kind: 'list',
      ...(row.benefits_label?.trim() ? { title: row.benefits_label.trim() } : {}),
      items: benefits,
    });
  if (descriptionBlocks.length)
    accordions.push({ id: 'description', title: 'Description', open: true, blocks: descriptionBlocks });

  // Composition / origine. Nouveau schéma d'abord (vide aujourd'hui), REPLI anciens champs.
  const food = row.product_food_details;
  const apparel = row.product_apparel_details;
  const composition = cleanText(
    (family === 'mode' ? apparel?.composition : food?.ingredients) ?? row.composition,
  );
  const origin = cleanText(food?.origin ?? row.provenance);
  const compositionBlocks: AccordionBlock[] = [];
  if (composition) compositionBlocks.push({ kind: 'paragraphs', items: paragraphsOf(composition) });
  if (origin) compositionBlocks.push({ kind: 'facts', items: [['Origine', origin]] });
  if (compositionBlocks.length) {
    const isNotes = family === 'parfum' && /notes? de (t[eê]te|c[oœ]ur|fond)/i.test(composition ?? '');
    accordions.push({
      id: 'composition',
      title: isNotes ? 'Notes olfactives' : origin ? 'Composition & origine' : 'Composition',
      blocks: compositionBlocks,
    });
  }

  // Matière & entretien (mode) : uniquement product_apparel_details — vide au 2 octobre 2026.
  if (family === 'mode' && apparel) {
    const facts: [string, string][] = (
      [
        ['Matière', apparel.material],
        ['Opacité', apparel.opacity],
        ['Épaisseur', apparel.thickness],
        ['Coupe', apparel.fit],
        ['Entretien', apparel.care_instructions],
      ] as [string, string | null][]
    ).flatMap(([term, value]) => (value?.trim() ? [[term, value.trim()] as [string, string]] : []));
    if (facts.length)
      accordions.push({
        id: 'matiere',
        title: 'Matière & entretien',
        blocks: [{ kind: 'facts', items: facts }],
      });
  }

  // Utilisation. Mode : « Précisez votre taille lors de la commande » n'est pas un conseil
  // d'utilisation (la taille se choisit dans le sélecteur) → non repris.
  const usage = family === 'mode' ? null : cleanText(row.usage_advice);
  if (usage)
    accordions.push({
      id: 'utilisation',
      title: 'Conseils d’utilisation',
      blocks: [{ kind: 'paragraphs', items: paragraphsOf(usage) }],
    });

  const precautions = cleanList(row.precautions);
  if (precautions.length)
    accordions.push({
      id: 'precautions',
      title: 'Précautions',
      blocks: [{ kind: 'list', items: precautions }],
    });

  // Livraison & paiement : parcours de l'étape 10 (config/commerce.ts) — demande de commande,
  // vérification, frais confirmés, paiement, puis expédition. Aucun tarif ni délai inventé.
  accordions.push({
    id: 'livraison',
    title: 'Livraison & paiement',
    blocks: [
      { kind: 'list', items: [...orderingSteps] },
      { kind: 'links', items: [{ label: 'Conditions générales de vente', href: cgvUrl, external: true }] },
    ],
  });
  return accordions;
}

/* ── Commande (étape 10 : panier ; WhatsApp = question, en secondaire) ───── */

export function orderOf(
  name: string,
  path: string,
  availability: ProductAvailability,
  _axes: ProductAxisView[],
): ProductOrder {
  const url = new URL(path, 'https://dar-nur.fr').toString();
  const orderable = availability === 'available' || availability === 'on_demand';
  // Aucune donnée client dans l'URL : seulement le produit concerné.
  const text = `Salam alaykoum, j’ai une question au sujet de : ${name}
${url}`;
  return {
    orderable,
    href: `${contact.whatsappUrl}?text=${encodeURIComponent(text)}`,
    messageHead: '',
    messageTail: '',
  };
}

/** Données d'ajout au panier (étape 10). */
export function cartOf(
  row: SupabaseCatalogProductRow,
  path: string,
  availability: ProductAvailability,
  variants: ProductVariantData[],
  promo: ProductPromo | undefined,
): ProductCartView {
  const hasVariants = row.product_variants.length > 0;
  const cents = (n: number | null) => (typeof n === 'number' && n > 0 ? Math.round(n * 100) : null);
  const priceCents = hasVariants ? null : promo ? cents(promo.price) : cents(row.price_value);
  // Un produit à variantes n'est commandable que si ses variantes sont sélectionnables (axes).
  const purchasable = hasVariants ? variants.some((v) => v.id && v.priceCents) : priceCents !== null;
  return {
    productId: row.id,
    slug: row.slug,
    name: row.name,
    href: path,
    orderable: (availability === 'available' || availability === 'on_demand') && purchasable,
    onDemand: availability === 'on_demand',
    priceCents,
    listPriceCents: promo && !hasVariants ? cents(promo.compareAt) : null,
    offerTitle: promo && !hasVariants ? promo.title : null,
  };
}

/* ── Recommandations ────────────────────────────────────────────────────── */

/** Slugs des membres d'un regroupement Mode SÛR (instantané LAB) : slug → code du groupe. */
const SAFE_GROUP_OF = new Map(
  groupingsSnapshot.groupings
    .filter((g) => g.decision === 'safe' && g.kind === 'model')
    .flatMap((g) => g.members.map((m) => [m.slug, g.code] as const)),
);

/**
 * « Dans la même collection » : collection principale, ordre « Sélection », en commençant
 * juste après le produit courant (rotation déterministe : chaque fiche montre des voisins
 * différents). Exclus : le produit, les autres fiches du même futur modèle SÛR (instantané
 * LAB). Complété par la collection parente si la principale ne suffit pas.
 */
function similarOf(catalog: Catalog, product: CatalogProduct) {
  const group = SAFE_GROUP_OF.get(product.slug);
  const eligible = (p: CatalogProduct) => p !== product && !(group && SAFE_GROUP_OF.get(p.slug) === group);
  const picked: CatalogProduct[] = [];
  const scopes = [product.primary, ...ancestorsOf(product.primary).reverse()];
  for (const scope of scopes) {
    const list = productsOf(catalog, scope);
    const start = Math.max(0, list.indexOf(product) + 1);
    const rotated = [...list.slice(start), ...list.slice(0, start)];
    for (const candidate of rotated) {
      if (picked.length >= SIMILAR_COUNT) break;
      if (eligible(candidate) && !picked.includes(candidate)) picked.push(candidate);
    }
    if (picked.length >= SIMILAR_COUNT) break;
  }
  return {
    similar: picked.map((p) => p.summary),
    similarTitle: `Dans la même collection : ${product.primary.name}`,
  };
}

/** « À associer » : product_relations uniquement (vide aujourd'hui → section absente). */
function relatedOf(catalog: Catalog, product: CatalogProduct): ProductSummary[] {
  const slugs = catalog.relations.get(product.slug) ?? [];
  return slugs
    .map((s) => catalog.products.find((p) => p.slug === s))
    .filter((p): p is CatalogProduct => Boolean(p))
    .map((p) => p.summary);
}

/* ── Dates ──────────────────────────────────────────────────────────────── */

/**
 * Dernière modification réelle : max(products.updated_at, product_variants.updated_at).
 * product_media.updated_at est exclu : toutes ses lignes portent la date du remplissage
 * de l'étape 6 (2026-10-02), pas une modification de contenu.
 */
export function lastmodOf(row: SupabaseCatalogProductRow): string {
  const dates = [row.updated_at, ...row.product_variants.map((v) => v.updated_at)].filter(Boolean);
  return dates.sort().at(-1)!.slice(0, 10);
}

/* ── Données structurées ────────────────────────────────────────────────── */

function structuredOf(
  row: SupabaseCatalogProductRow,
  gallery: MediaImage[],
  brand: string | undefined,
  price: PriceInfo,
  availability: ProductAvailability,
  axes: ProductAxisView[],
  variants: ProductVariantData[],
  description: string,
): ProductStructured {
  const base = {
    name: row.name,
    description,
    images: gallery.map((g) => String(g.src)),
    ...(brand ? { brand } : {}),
  };
  if (variants.length > 1 && axes.length > 0) {
    return {
      ...base,
      group: {
        // Contenance et taille sont des tailles au sens schema.org (« size »).
        variesBy: ['https://schema.org/size'],
        variants: variants.map((v) => ({
          name: `${row.name} – ${v.label}`,
          query: axes.map((a) => `${a.param}=${encodeURIComponent(v.options[a.id] ?? '')}`).join('&'),
          price: v.price,
          // Une variante inactive est épuisée ; sinon la disponibilité du produit.
          available: v.available,
          size: v.label,
        })),
      },
    };
  }
  const amount = price.kind === 'on-request' ? null : price.amount;
  return { ...base, ...(amount !== null ? { offer: { price: amount, availability } } : {}) };
}
