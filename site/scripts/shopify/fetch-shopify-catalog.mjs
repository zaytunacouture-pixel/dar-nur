#!/usr/bin/env node
/** Réseau, GET publics uniquement. Ne pas exécuter pendant les tests hors ligne. */
import { mkdir, writeFile } from 'node:fs/promises';
import { SHOPIFY_ORIGIN, SHOPIFY_CATALOG_SOURCE } from '../../src/lib/commerce/mode.ts';
import { assertCatalog } from '../../src/lib/commerce/product-map.ts';

const products = [];
for (let page = 1; ; page++) {
  const url = new URL('/products.json', SHOPIFY_ORIGIN);
  url.searchParams.set('limit', '250');
  url.searchParams.set('page', String(page));
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Catalogue Shopify : HTTP ${response.status}, page ${page}.`);
  const body = await response.json();
  if (!Array.isArray(body.products)) throw new Error('Réponse Shopify invalide.');
  if (!body.products.length) break;
  for (const p of body.products) {
    if (!Array.isArray(p.variants)) throw new Error('Variantes Shopify absentes.');
    products.push({
      id: p.id,
      handle: p.handle,
      title: p.title,
      variants: p.variants
        .map((v) => {
          if (v.product_id !== p.id) throw new Error('Variante rattachée à un autre produit.');
          return {
            id: v.id,
            title: v.title,
            options: [v.option1, v.option2, v.option3].filter((o) => o !== null && o !== undefined),
            price: v.price,
            available: v.available,
          };
        })
        .sort((a, b) => a.id - b.id),
    });
  }
  // Détecte aussi une pagination ignorée ; ne publie jamais un fichier partiel.
  assertCatalog({
    schemaVersion: 1,
    needsGeneration: false,
    fetchedAt: new Date().toISOString(),
    source: SHOPIFY_CATALOG_SOURCE,
    products,
  });
}
const catalog = {
  schemaVersion: 1,
  needsGeneration: false,
  fetchedAt: new Date().toISOString(),
  source: SHOPIFY_CATALOG_SOURCE,
  products: products.sort((a, b) => a.handle.localeCompare(b.handle) || a.id - b.id),
};
assertCatalog(catalog);
const folder = new URL('../../src/data/shopify/', import.meta.url);
await mkdir(folder, { recursive: true });
await writeFile(new URL('shopify-catalog.json', folder), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Shopify : ${products.length} produits publics, instantané écrit.`);
