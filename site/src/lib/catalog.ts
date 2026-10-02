/**
 * Traduction lignes Supabase → types d'affichage. C'est le SEUL endroit qui connaît
 * le schéma de la base.
 *
 * Étape 6 : lecture du NOUVEAU schéma (status, availability, collection principale,
 * product_media, options normalisées), avec repli explicite sur les champs historiques
 * quand la donnée nouvelle est absente — jamais l'inverse.
 */
import type {
  Availability,
  BadgeKind,
  CollectionNode,
  CollectionRef,
  FacetOption,
  MediaImage,
  PriceInfo,
  ProductSummary,
  VariantOption,
} from '@/types/catalog';
import {
  LEGACY_MEDIA_ORIGIN,
  type ProductAvailability,
  type SupabaseCollectionRow,
  type SupabaseProductRow,
  type SupabaseVariantRow,
} from './supabase';

/** Chemin relatif historique (`assets/...`) → URL absolue servie par le site actuel. */
export function resolveMediaUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path.replace(/^\/+/, ''), `${LEGACY_MEDIA_ORIGIN}/`).toString();
}

function activeVariants(row: SupabaseProductRow): SupabaseVariantRow[] {
  return [...row.product_variants]
    .filter((variant) => variant.active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function priceOf(row: SupabaseProductRow, variants: SupabaseVariantRow[]): PriceInfo {
  const prices = variants.map((v) => v.price).filter((p): p is number => typeof p === 'number');
  if (prices.length > 1 && new Set(prices).size > 1) return { kind: 'from', amount: Math.min(...prices) };
  const amount = prices[0] ?? row.price_value;
  return typeof amount === 'number' ? { kind: 'fixed', amount } : { kind: 'on-request' };
}

/** Axe principal d'un produit : option normalisée d'abord, ancien variant_axes à défaut. */
function axisOf(row: SupabaseProductRow): string | undefined {
  const normalized = row.product_variants
    .flatMap((v) => v.product_variant_options)
    .map((o) => o.option_type_id);
  const legacy = row.variant_axes?.[0];
  return normalized[0] ?? (legacy === 'format' ? 'contenance' : legacy);
}

/** Libellé d'une variante sur un axe : valeur normalisée, sinon jsonb historique, sinon nom. */
function optionLabel(variant: SupabaseVariantRow, axis: string | undefined): string {
  const normalized = variant.product_variant_options.find((o) => o.option_type_id === axis)?.option_values
    ?.label;
  const legacy =
    axis === 'contenance'
      ? (variant.options?.['contenance'] ?? variant.options?.['format'])
      : axis
        ? variant.options?.[axis]
        : undefined;
  return normalized ?? legacy ?? variant.name;
}

/** Une ligne utile, dérivée des données réelles uniquement. */
function metaLineOf(row: SupabaseProductRow, variants: SupabaseVariantRow[]): string | undefined {
  const axis = axisOf(row);
  if (variants.length > 1 && axis) {
    const labels = variants.map((v) => optionLabel(v, axis));
    if (axis === 'taille') return `${labels[0]} à ${labels[labels.length - 1]}`;
    if (axis === 'contenance') return `${labels.length} formats`;
    return `${labels.length} options`;
  }
  // Tagline courte seulement (ex. « Eau de parfum · 100 ml ») ; sinon rien plutôt qu'un pavé.
  const tagline = row.tagline?.trim();
  return tagline && tagline.length <= 40 && tagline !== row.name ? tagline : undefined;
}

/**
 * Disponibilité commerciale à 4 états (≠ statut éditorial). availability NULL = « à arbitrer » :
 * repli sur `coming_soon` (non commandable), JAMAIS sur `available`. Au 2 octobre 2026, les
 * 22 NULL ont tous `coming_soon = true` : le repli reproduit exactement l'ancien site.
 */
export function commercialAvailability(row: SupabaseProductRow): ProductAvailability {
  return row.availability ?? 'coming_soon';
}

function availabilityOf(row: SupabaseProductRow): Availability {
  const value = commercialAvailability(row);
  if (value === 'coming_soon') return 'coming-soon';
  if (value === 'out_of_stock') return 'unavailable';
  if (row.product_variants.length > 0 && row.product_variants.every((v) => !v.active)) return 'unavailable';
  return 'available'; // available et on_demand sont commandables
}

/** Contexte facultatif d'une carte : faits calculés hors de la ligne produit. */
export interface SummaryContext {
  /** Le produit fait partie d'une offre `product_promo` active, dans sa fenêtre de dates (§G.2). */
  onOffer?: boolean;
}

function badgeOf(row: SupabaseProductRow, context: SummaryContext): BadgeKind | undefined {
  const availability = availabilityOf(row);
  if (availability === 'coming-soon') return 'coming-soon';
  if (availability === 'unavailable') return 'sold-out';
  if (context.onOffer) return 'offer';
  // « Nouveau » exige une fenêtre de nouveauté validée (§G.2, à confirmer) : non calculé.
  return undefined;
}

function imageOf(path: string | undefined, alt: string): MediaImage | undefined {
  return path ? { src: resolveMediaUrl(path), alt } : undefined;
}

/** Images du produit (hors images propres à une variante) : product_media, sinon images[]. */
function productImages(row: SupabaseProductRow): string[] {
  const media = row.product_media
    .filter((m) => m.variant_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => m.url);
  return media.length > 0 ? media : (row.images ?? []);
}

/** Collection principale (fil d'Ariane, classement) ; le canonical produit reste /{slug}/. */
export function primaryCollectionOf(row: SupabaseProductRow): CollectionRef | undefined {
  const primary = row.product_collections.find((pc) => pc.role === 'primary')?.collections;
  return primary?.path ? { slug: primary.slug, name: primary.name, href: primary.path } : undefined;
}

export function toProductSummary(row: SupabaseProductRow, context: SummaryContext = {}): ProductSummary {
  const variants = activeVariants(row);
  const badge = badgeOf(row, context);
  const price = priceOf(row, variants);
  const images = productImages(row);
  const primaryCollection = primaryCollectionOf(row);
  return {
    slug: row.slug,
    name: row.name,
    // URL provisoire = slug actuel ; le nommage définitif est appliqué à la migration SEO.
    href: `/${row.slug}/`,
    ...(row.brand && row.brand_slug ? { brand: { slug: row.brand_slug, name: row.brand } } : {}),
    ...(images[0] ? { image: imageOf(images[0], row.name)! } : {}),
    ...(images[1] ? { hoverImage: imageOf(images[1], `${row.name}, autre vue`)! } : {}),
    price,
    ...(metaLineOf(row, variants) ? { metaLine: metaLineOf(row, variants)! } : {}),
    ...(badge ? { badge } : {}),
    availability: availabilityOf(row),
    ...(primaryCollection ? { primaryCollection } : {}),
    variantCount: variants.length,
  };
}

/** Images du produit dans l'ordre (product_media d'abord, images[] à défaut), URL absolues. */
export function productImageUrls(row: SupabaseProductRow): string[] {
  return productImages(row).map(resolveMediaUrl);
}

const UNIT_LABELS: Record<string, [singular: string, plural: string]> = {
  g: ['g', 'g'],
  kg: ['kg', 'kg'],
  ml: ['ml', 'ml'],
  l: ['L', 'L'],
  capsule: ['gélule', 'gélules'],
};

/** Quantité nette normalisée (étape 6) en libellé (« 200 g », « 60 gélules ») ; null si absente. */
export function netQuantityLabel(row: SupabaseProductRow): string | null {
  if (row.net_quantity === null || !row.net_unit) return null;
  const quantity = Number(row.net_quantity);
  const unit = UNIT_LABELS[row.net_unit];
  return unit ? `${quantity} ${quantity > 1 ? unit[1] : unit[0]}` : `${quantity} ${row.net_unit}`;
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Valeurs d'un axe sur les variantes ACTIVES : option normalisée, sinon jsonb historique. */
function axisValues(row: SupabaseProductRow, axis: 'contenance' | 'taille'): FacetOption[] {
  const values = new Map<string, string>();
  for (const variant of activeVariants(row)) {
    const normalized = variant.product_variant_options.find((o) => o.option_type_id === axis)?.option_values;
    if (normalized) {
      values.set(normalized.code, normalized.label);
      continue;
    }
    const legacy =
      axis === 'contenance'
        ? (variant.options?.['contenance'] ?? variant.options?.['format'])
        : variant.options?.[axis];
    if (legacy) values.set(slugify(legacy), legacy);
  }
  return [...values].map(([code, label]) => ({ code, label }));
}

/**
 * Attributs filtrables d'un produit, tous issus de colonnes réelles :
 * - contenance : variantes actives (axe contenance), sinon quantité nette normalisée (étape 6) ;
 * - taille : variantes actives (axe taille) ; « 2XL » et « XXL » restent deux valeurs (étape 6) ;
 * - minPrice : prix le plus bas réellement proposé, null = prix sur demande.
 */
export function productFacetData(row: SupabaseProductRow): {
  contenance: FacetOption[];
  taille: FacetOption[];
  minPrice: number | null;
} {
  let contenance = axisValues(row, 'contenance');
  const net = netQuantityLabel(row);
  if (contenance.length === 0 && net) {
    contenance = [{ code: slugify(`${Number(row.net_quantity)} ${row.net_unit}`), label: net }];
  }
  const price = priceOf(row, activeVariants(row));
  return {
    contenance,
    taille: axisValues(row, 'taille'),
    minPrice: price.kind === 'on-request' ? null : price.amount,
  };
}

/** Variantes réelles d'un produit → options du sélecteur (toutes, y compris inactives = épuisées). */
export function toVariantOptions(row: SupabaseProductRow): VariantOption[] {
  const axis = axisOf(row);
  return [...row.product_variants]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((variant, index) => {
      const label = optionLabel(variant, axis);
      const code = variant.product_variant_options.find((o) => o.option_type_id === axis)?.option_values
        ?.code;
      return {
        // Code normalisé (ex. 200-g) quand il existe : c'est lui qui servira au paramètre d'URL.
        id: code ?? `${index}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label,
        ...(typeof variant.price === 'number' ? { price: variant.price } : {}),
        available: variant.active,
      };
    });
}

/** Arbre des collections : enfants triés par sort_order ; l'URL est `path`, jamais recalculée. */
export function toCollectionTree(rows: SupabaseCollectionRow[]): CollectionNode[] {
  const nodes = new Map<string, CollectionNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      slug: row.slug,
      name: row.name,
      ...(row.path ? { href: row.path } : {}),
      type: row.type,
      indexable: row.is_indexable,
      children: [],
    });
  }
  const roots: CollectionNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    const parent = row.parent_id ? nodes.get(row.parent_id) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}
