/**
 * Traduction lignes Supabase → types d'affichage. C'est le SEUL endroit qui connaît
 * le schéma actuel : à l'étape 6 (migration additive), seul ce fichier change.
 */
import type { BadgeKind, MediaImage, PriceInfo, ProductSummary, VariantOption } from '@/types/catalog';
import { LEGACY_MEDIA_ORIGIN, type SupabaseProductRow, type SupabaseVariantRow } from './supabase';

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

/** Une ligne utile, dérivée des données réelles uniquement. */
function metaLineOf(row: SupabaseProductRow, variants: SupabaseVariantRow[]): string | undefined {
  const axis = row.variant_axes?.[0];
  if (variants.length > 1 && axis) {
    const labels = variants.map((v) => v.options?.[axis] ?? v.name);
    if (axis === 'taille') return `${labels[0]} à ${labels[labels.length - 1]}`;
    if (axis === 'format' || axis === 'contenance') return `${labels.length} formats`;
    return `${labels.length} options`;
  }
  // Tagline courte seulement (ex. « Eau de parfum · 100 ml ») ; sinon rien plutôt qu'un pavé.
  const tagline = row.tagline?.trim();
  return tagline && tagline.length <= 40 && tagline !== row.name ? tagline : undefined;
}

function badgeOf(row: SupabaseProductRow): BadgeKind | undefined {
  if (row.coming_soon) return 'coming-soon';
  if (row.product_variants.length > 0 && row.product_variants.every((v) => !v.active)) return 'sold-out';
  // « Offre » et « Nouveau » exigent des règles validées (offres actives, fenêtre de
  // nouveauté) : non calculés dans le socle plutôt qu'approximés.
  return undefined;
}

function imageOf(path: string | undefined, alt: string): MediaImage | undefined {
  return path ? { src: resolveMediaUrl(path), alt } : undefined;
}

export function toProductSummary(row: SupabaseProductRow): ProductSummary {
  const variants = activeVariants(row);
  const badge = badgeOf(row);
  const price = priceOf(row, variants);
  const images = row.images ?? [];
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
    availability:
      badge === 'coming-soon' ? 'coming-soon' : badge === 'sold-out' ? 'unavailable' : 'available',
    variantCount: variants.length,
  };
}

/** Variantes réelles d'un produit → options du sélecteur (toutes, y compris inactives = épuisées). */
export function toVariantOptions(row: SupabaseProductRow): VariantOption[] {
  const axis = row.variant_axes?.[0];
  return [...row.product_variants]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((variant, index) => {
      const label = (axis && variant.options?.[axis]) || variant.name;
      return {
        id: `${index}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label,
        ...(typeof variant.price === 'number' ? { price: variant.price } : {}),
        available: variant.active,
      };
    });
}
