import { SHOPIFY_ORIGIN, type CommerceMode } from './mode.ts';
import {
  isExcluded,
  isShopifyId,
  validateProductMap,
  type ProductMap,
  type ShopifyCatalog,
} from './product-map.ts';

export type PurchaseFailure =
  | 'mode-not-shopify'
  | 'excluded'
  | 'invalid-map'
  | 'product-unmapped'
  | 'variant-required'
  | 'variant-unmapped'
  | 'unavailable'
  | 'invalid-quantity';
export type PurchaseResult =
  | { ok: true; url: string; shopifyProductId: number; shopifyVariantId: number }
  | { ok: false; reason: PurchaseFailure };

/** Aucun ID fourni par l'appelant : résolution exclusive depuis une table revalidée. */
export function shopifyPurchaseLink(
  mode: CommerceMode,
  map: ProductMap,
  catalog: ShopifyCatalog,
  slug: string,
  supabaseVariantId: string | null = null,
  cartQuantity?: number,
): PurchaseResult {
  if (mode !== 'shopify') return { ok: false, reason: 'mode-not-shopify' };
  if (isExcluded(slug) || map.entries.some((e) => e.slug === slug && e.excluded))
    return { ok: false, reason: 'excluded' };
  const validation = validateProductMap(map, catalog);
  if (!validation.ready || validation.structuralErrors.length) return { ok: false, reason: 'invalid-map' };
  const entries = map.entries.filter((e) => e.slug === slug);
  const entry = entries.length === 1 ? entries[0] : undefined;
  if (
    !entry ||
    entry.status.supabase !== 'published' ||
    !isShopifyId(entry.shopifyProductId) ||
    !entry.shopifyHandle
  )
    return { ok: false, reason: 'product-unmapped' };
  if (entry.requiresVariant && supabaseVariantId === null) return { ok: false, reason: 'variant-required' };
  const variants = entry.variants.filter((v) => v.supabaseVariantId === supabaseVariantId);
  const variant = variants.length === 1 ? variants[0] : undefined;
  if (!variant || !isShopifyId(variant.shopifyVariantId)) return { ok: false, reason: 'variant-unmapped' };
  if (entry.matchStatus !== 'matched' || entry.anomalies.some((a) => a.severity === 'blocking'))
    return { ok: false, reason: 'product-unmapped' };
  if (!variant.available || !variant.supabaseAvailable) return { ok: false, reason: 'unavailable' };
  if (
    cartQuantity !== undefined &&
    (!Number.isInteger(cartQuantity) || cartQuantity < 1 || cartQuantity > 99)
  )
    return { ok: false, reason: 'invalid-quantity' };
  const url =
    cartQuantity === undefined
      ? new URL(`/products/${entry.shopifyHandle}`, SHOPIFY_ORIGIN)
      : new URL(`/cart/${variant.shopifyVariantId}:${cartQuantity}`, SHOPIFY_ORIGIN);
  if (cartQuantity === undefined && supabaseVariantId !== null)
    url.searchParams.set('variant', String(variant.shopifyVariantId));
  return {
    ok: true,
    url: url.toString(),
    shopifyProductId: entry.shopifyProductId,
    shopifyVariantId: variant.shopifyVariantId,
  };
}
