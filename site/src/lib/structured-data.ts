/**
 * Données structurées (JSON-LD) des pages catalogue : CollectionPage, ItemList, BreadcrumbList.
 * Le JSON-LD Product des fiches viendra avec leur migration (étape 8).
 * Les URL sont absolues sur `site` (SITE_URL = domaine final, voir docs/REFONTE_ASTRO.md).
 */
import { siteName } from '@/config/site';
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

/** Sérialisation sûre dans une balise <script> (aucun « </script> » possible). */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
