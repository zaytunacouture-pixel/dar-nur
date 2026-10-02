/**
 * Données structurées (JSON-LD) : CollectionPage, ItemList, BreadcrumbList (pages catalogue,
 * étape 7) et Product / ProductGroup (fiches produit, étape 8).
 * Les URL sont absolues sur `site` (SITE_URL = domaine final, voir docs/REFONTE_ASTRO.md).
 */
import { siteName } from '@/config/site';
import type { ProductStructured } from '@/lib/product-page';
import type { ProductAvailability } from '@/lib/supabase';
import type { BreadcrumbItem } from '@/types/catalog';

type JsonLd = Record<string, unknown>;

const absolute = (path: string, site: URL) => new URL(path, site).toString();

export function breadcrumbJsonLd(items: BreadcrumbItem[], site: URL): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(item.href, site),
    })),
  };
}

export function collectionPageJsonLd(options: {
  path: string;
  name: string;
  description: string;
  breadcrumb: BreadcrumbItem[];
  /** Éléments listés sur la page (produits, ou collections pour un univers). */
  items: { name: string; href: string }[];
  brand?: string;
  site: URL;
}): JsonLd {
  const { path, name, description, breadcrumb, items, brand, site } = options;
  const url = absolute(path, site);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#page`,
    url,
    name,
    description,
    inLanguage: 'fr-FR',
    isPartOf: { '@type': 'WebSite', name: siteName, url: absolute('/', site) },
    ...(brand ? { about: { '@type': 'Brand', name: brand } } : {}),
    breadcrumb: breadcrumbJsonLd(breadcrumb, site),
    ...(items.length
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: items.length,
            itemListElement: items.map((item, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: absolute(item.href, site),
              name: item.name,
            })),
          },
        }
      : {}),
  };
}

/**
 * Disponibilité schema.org, depuis `products.availability` (4 états) — aucune donnée de stock :
 *   available → InStock (commandable) · on_demand → BackOrder (commandable, préparée ensuite) ·
 *   coming_soon → OutOfStock (pas encore commandable) · out_of_stock → OutOfStock.
 */
const SCHEMA_AVAILABILITY: Record<ProductAvailability, string> = {
  available: 'https://schema.org/InStock',
  on_demand: 'https://schema.org/BackOrder',
  coming_soon: 'https://schema.org/OutOfStock',
  out_of_stock: 'https://schema.org/OutOfStock',
};

function offerJsonLd(price: number, availability: ProductAvailability, url: string): JsonLd {
  return {
    '@type': 'Offer',
    url,
    price: price.toFixed(2),
    priceCurrency: 'EUR',
    availability: SCHEMA_AVAILABILITY[availability],
  };
}

/**
 * Product (produit simple) ou ProductGroup + hasVariant (variantes réelles). Volontairement
 * ABSENTS faute de donnée : avis, note, GTIN/SKU, état (condition), stock chiffré, livraison,
 * retours. `brand` seulement si la marque existe en base.
 */
export function productJsonLd(options: {
  path: string;
  slug: string;
  data: ProductStructured;
  availability: ProductAvailability;
  site: URL;
}): JsonLd {
  const { path, slug, data, availability, site } = options;
  const url = absolute(path, site);
  const common = {
    name: data.name,
    description: data.description,
    ...(data.images.length ? { image: data.images } : {}),
    ...(data.brand ? { brand: { '@type': 'Brand', name: data.brand } } : {}),
  };
  if (data.group) {
    return {
      '@context': 'https://schema.org',
      '@type': 'ProductGroup',
      '@id': `${url}#product`,
      url,
      productGroupID: slug,
      ...common,
      variesBy: data.group.variesBy,
      hasVariant: data.group.variants.map((variant) => {
        const variantUrl = `${url}?${variant.query}`;
        return {
          '@type': 'Product',
          name: variant.name,
          url: variantUrl,
          size: variant.size,
          inProductGroupWithID: slug,
          ...(variant.price !== null
            ? {
                offers: offerJsonLd(
                  variant.price,
                  variant.available ? availability : 'out_of_stock',
                  variantUrl,
                ),
              }
            : {}),
        };
      }),
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    url,
    ...common,
    ...(data.offer ? { offers: offerJsonLd(data.offer.price, data.offer.availability, url) } : {}),
  };
}

/** Fil d'Ariane seul (fiche produit). */
export function breadcrumbPageJsonLd(items: BreadcrumbItem[], site: URL): JsonLd {
  return { '@context': 'https://schema.org', ...breadcrumbJsonLd(items, site) };
}

/** Sérialisation sûre dans une balise <script> (aucun « </script> » possible). */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
