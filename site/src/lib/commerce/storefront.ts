/** Décisions de présentation pures, exécutées au build. Aucun accès à l’environnement. */
import { SHOPIFY_ORIGIN, isOrderSubmissionEnabled, type CommerceMode } from './mode.ts';
import { validateProductMap, type ProductMap, type ShopifyCatalog } from './product-map.ts';
import { shopifyPurchaseLink } from './purchase.ts';
import type { PriceInfo, ProductSummary } from '../../types/catalog.ts';
import type { ProductAvailability } from '../supabase.ts';
import type { ProductPageView } from '../product-page.ts';

export function storefrontFlags(mode: CommerceMode, environment = 'preprod', productionReady = false) {
  const legacy = mode === 'legacy';
  const shopify = mode === 'shopify';
  return {
    cartEnabled: legacy,
    orderSubmissionEnabled: isOrderSubmissionEnabled(mode, environment, productionReady),
    legacyInterface: legacy,
    headerCart: legacy ? ('legacy-drawer' as const) : shopify ? ('shopify-link' as const) : ('none' as const),
    cartHref: legacy ? '/panier/' : shopify ? `${SHOPIFY_ORIGIN}/cart` : null,
    cartLabel: shopify ? 'Panier de la boutique Shopify (site externe)' : 'Mon panier',
    shopHref: shopify ? SHOPIFY_ORIGIN : null,
    trackingEnabled: true,
    trackingHref: '/suivi/',
    closedMessage: shopify
      ? 'Les achats et le panier sont disponibles sur la boutique Dar Nūr. Votre ancien panier reste conservé sur cet appareil.'
      : 'Les achats en ligne sont momentanément indisponibles. Le catalogue et le suivi de vos commandes restent accessibles.',
    showLegacyOfferPrices: !shopify,
  };
}
export type StorefrontFlags = ReturnType<typeof storefrontFlags>;
export interface CommercialChoice {
  action: 'legacy-cart' | 'shopify-link' | 'unavailable' | 'none';
  url: string | null;
  price: PriceInfo | null;
  availability: ProductAvailability;
  message: string;
}
export interface ProductCommerceView extends CommercialChoice {
  legacyInterface: boolean;
  unavailableSelectionMessage: string;
  variants: Record<string, CommercialChoice>;
}
interface CommercialProduct {
  slug: string;
  price: PriceInfo;
  availability: ProductAvailability;
  variants?: { id?: string; price: number | null; priceCents?: number | null; available: boolean }[];
  cart?: { orderable: boolean };
}
const pending = 'Pas encore disponible à la vente en ligne';
const unavailable = 'Achat indisponible pour cette correspondance.';

export function productCommerceView(
  mode: CommerceMode,
  map: ProductMap,
  catalog: ShopifyCatalog,
  product: CommercialProduct,
): ProductCommerceView {
  const unavailableSelectionMessage = 'Cette combinaison n’est pas disponible à la vente en ligne.';
  if (mode !== 'shopify') {
    const available = product.availability === 'available' || product.availability === 'on_demand';
    const hasPrice = product.price.kind !== 'on-request' && product.price.amount > 0;
    const purchasable = product.variants?.length
      ? product.variants.some(
          (v) => v.available && (v.priceCents ? v.priceCents > 0 : v.price !== null && v.price > 0),
        )
      : hasPrice;
    const orderable = product.cart?.orderable ?? (available && purchasable);
    const choice: CommercialChoice = {
      action: mode === 'legacy' ? (orderable ? 'legacy-cart' : 'unavailable') : 'none',
      url: null,
      price: product.price,
      availability: product.availability,
      message: mode === 'disabled' ? 'Les achats en ligne sont momentanément indisponibles.' : '',
    };
    return {
      ...choice,
      unavailableSelectionMessage,
      legacyInterface: mode === 'legacy',
      variants: Object.fromEntries(
        (product.variants ?? [])
          .filter((v) => v.id)
          .map((v) => [
            v.id!,
            {
              ...choice,
              action:
                mode === 'disabled'
                  ? 'none'
                  : orderable && v.available && (v.priceCents || (v.price !== null && v.price > 0))
                    ? 'legacy-cart'
                    : 'unavailable',
              price: v.price === null ? product.price : { kind: 'fixed', amount: v.price },
              availability: v.available ? product.availability : 'out_of_stock',
            },
          ]),
      ),
    };
  }
  const validation = validateProductMap(map, catalog);
  const entries = map.entries.filter((e) => e.slug === product.slug);
  const entry = entries.length === 1 ? entries[0] : undefined;
  // Prix/disponibilité : instantané Shopify uniquement, même si l’achat est refusé.
  const verified =
    validation.ready &&
    !validation.structuralErrors.length &&
    entry?.matchStatus === 'matched' &&
    !entry.excluded &&
    entry.status.supabase === 'published';
  const choice = (id: string | null): CommercialChoice => {
    const matches = verified ? entry.variants.filter((v) => v.supabaseVariantId === id) : [];
    const match = matches.length === 1 ? matches[0] : undefined;
    const amount = match?.shopifyVariantId && match.shopifyPrice !== null ? Number(match.shopifyPrice) : null;
    const price: PriceInfo | null =
      amount !== null && Number.isFinite(amount) && amount > 0 ? { kind: 'fixed', amount } : null;
    const link = shopifyPurchaseLink(mode, map, catalog, product.slug, id);
    return {
      action: link.ok ? 'shopify-link' : 'unavailable',
      url: link.ok ? link.url : null,
      price,
      // « Disponible » seulement si un lien d'achat validé existe (sinon libellé et bouton divergent).
      availability: link.ok ? 'available' : 'out_of_stock',
      message: link.ok ? 'Acheter sur la boutique (site externe)' : match && price ? unavailable : pending,
    };
  };
  const variants = Object.fromEntries(
    (product.variants ?? []).filter((v) => v.id).map((v) => [v.id!, choice(v.id!)]),
  );
  if (!entry?.requiresVariant)
    return { ...choice(null), variants, unavailableSelectionMessage, legacyInterface: false };
  const choices = Object.values(variants);
  const amounts = choices.flatMap((v) => (v.price && v.price.kind !== 'on-request' ? [v.price.amount] : []));
  const price: PriceInfo | null = amounts.length
    ? {
        kind: new Set(amounts).size > 1 ? 'from' : 'fixed',
        amount: Math.min(...amounts),
      }
    : null;
  return {
    action: 'unavailable',
    url: null,
    price,
    variants,
    unavailableSelectionMessage,
    legacyInterface: false,
    availability: choices.some((v) => v.availability === 'available') ? 'available' : 'out_of_stock',
    message: choices.some((v) => v.url) ? 'Choisissez vos options pour acheter sur la boutique.' : pending,
  };
}

/** Projection des cartes : aucune autorité commerciale Supabase en mode Shopify. */
export function storefrontSummary(
  mode: CommerceMode,
  map: ProductMap,
  catalog: ShopifyCatalog,
  summary: ProductSummary,
): ProductSummary {
  if (mode !== 'shopify') return summary;
  const entry = map.entries.find((e) => e.slug === summary.slug);
  const commerce = productCommerceView(mode, map, catalog, {
    ...summary,
    availability: 'coming_soon',
    variants: (entry?.variants ?? [])
      .filter((v) => v.supabaseVariantId !== null)
      .map((v) => ({ id: v.supabaseVariantId!, price: null, available: false })),
  });
  const { badge: _badge, ...rest } = summary;
  return {
    ...rest,
    commerce,
    price: commerce.price ?? { kind: 'on-request' },
    availability: commerce.availability === 'available' ? 'available' : 'unavailable',
    ...(commerce.availability !== 'available' && commerce.price ? { badge: 'sold-out' as const } : {}),
  };
}

/** Le modèle historique est conservé tel quel en legacy ; les champs supplémentaires ne sont pas sérialisés. */
export function storefrontProductPage(
  mode: CommerceMode,
  map: ProductMap,
  catalog: ShopifyCatalog,
  view: ProductPageView,
): ProductPageView {
  const commerce = productCommerceView(mode, map, catalog, view);
  if (mode !== 'shopify') return { ...view, commerce };
  const variants = view.variants.map((v) => {
    const c = v.id ? commerce.variants[v.id] : undefined;
    return {
      ...v,
      price: c?.price && c.price.kind !== 'on-request' ? c.price.amount : null,
      available: c?.availability === 'available',
      priceCents: null,
      unitPrice: null,
    };
  });
  const axes = view.axes.map((axis) => ({
    ...axis,
    options: axis.options.map((option) => {
      const compatible = variants.filter((v) => v.options[axis.id] === option.id);
      const { price: _price, ...rest } = option;
      return {
        ...rest,
        unitPrice: null,
        available: compatible.some((v) => v.available),
        ...(view.axes.length === 1 && compatible.length === 1 && compatible[0]!.price !== null
          ? { price: compatible[0]!.price! }
          : {}),
      };
    }),
  }));
  const structured = view.structured ? { ...view.structured } : undefined;
  if (structured) {
    delete structured.offer;
    if (structured.group)
      structured.group = {
        ...structured.group,
        variants: structured.group.variants.map((v, i) => ({
          ...v,
          price: variants[i]?.price ?? null,
          available: variants[i]?.available ?? false,
        })),
      };
    else if (commerce.price?.kind === 'fixed')
      structured.offer = { price: commerce.price.amount, availability: commerce.availability };
  }
  const { cart: _cart, structured: _structured, ...rest } = view;
  return {
    ...rest,
    commerce,
    price: commerce.price ?? { kind: 'on-request' },
    availability: commerce.availability,
    availabilityLabel:
      commerce.availability === 'available' ? 'Disponible sur la boutique' : commerce.message,
    variants,
    axes,
    unitPrice: null,
    ...(structured ? { structured } : {}),
  };
}

/** Sélection du graphe de composants : les scripts inactifs ne sont même pas importés. */
export function storefrontEntries(mode: CommerceMode) {
  const legacy = storefrontFlags(mode).legacyInterface;
  return {
    Purchase: legacy ? 'product/LegacyProductPurchase.astro' : 'product/StorefrontPurchase.astro',
    CartPage: legacy ? 'order/LegacyCartPage.astro' : 'order/StorefrontCartPage.astro',
    OrderPage: legacy ? 'order/LegacyOrderPage.astro' : 'order/StorefrontOrderPage.astro',
    MiniCart: legacy ? 'cart/MiniCart.astro' : 'cart/InactiveMiniCart.astro',
  };
}
export const previewCommerce: ProductCommerceView = {
  action: 'none',
  url: null,
  price: null,
  availability: 'coming_soon',
  legacyInterface: false,
  message: 'Aperçu de validation : aucun achat possible ici.',
  unavailableSelectionMessage: 'Aperçu de validation',
  variants: {},
};
