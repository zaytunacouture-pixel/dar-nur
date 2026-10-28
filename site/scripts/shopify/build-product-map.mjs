#!/usr/bin/env node
/** Supabase en lecture publique seulement ; aucune lecture automatique de .env. */
import { readFile, writeFile } from 'node:fs/promises';
import { assertCatalog, buildProductMap, validateProductMap } from '../../src/lib/commerce/product-map.ts';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY?.startsWith('sb_publishable_')) {
  throw new Error(
    'SUPABASE_URL et SUPABASE_ANON_KEY (sb_publishable_…) requis ; toute autre clé est refusée.',
  );
}
const origin = new URL(SUPABASE_URL);
if (origin.protocol !== 'https:' || origin.username || origin.password)
  throw new Error('SUPABASE_URL doit être une URL HTTPS sans identifiants.');
const folder = new URL('../../src/data/shopify/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('shopify-catalog.json', folder), 'utf8'));
assertCatalog(catalog);
if (catalog.needsGeneration) throw new Error('Générer d’abord le catalogue Shopify.');
const products = [];
const pageSize = 500;
for (let offset = 0; ; offset += pageSize) {
  const url = new URL('/rest/v1/products', origin);
  url.searchParams.set(
    'select',
    'id,slug,status,availability,price_value,variant_axes,product_variants(id,price,active,options,product_variant_options(option_type_id,option_values(code,label)))',
  );
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('order', 'slug.asc,id.asc');
  url.searchParams.set('limit', String(pageSize));
  url.searchParams.set('offset', String(offset));
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Catalogue Supabase : HTTP ${response.status}.`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Réponse Supabase invalide.');
  if (!rows.length) break;
  products.push(...rows);
}
const map = buildProductMap(products, catalog, new Date().toISOString());
const validation = validateProductMap(map, catalog);
if (validation.structuralErrors.length) throw new Error(validation.structuralErrors.join('\n'));
// Rapport texte sans HTML interprété ; les anomalies métier restent visibles dans la table.
const line = (s) => String(s).replace(/[\r\n]/g, ' ');
const report = [
  '# Correspondance Astro → Shopify',
  '',
  `Généré : ${map.generatedAt}. Instantané Shopify : ${map.catalogFetchedAt}.`,
  '',
  `${map.sourceProducts.length} produits Supabase publiés ; ${catalog.products.length} produits Shopify publics ; ${validation.blockingCount} anomalies bloquantes.`,
  '',
  'Supabase : GET PostgREST avec clé publishable. Aucun statut privé Shopify ne peut être déduit du catalogue public.',
  '',
  ...map.entries.flatMap((e) => [
    `## ${line(e.slug)}`,
    '',
    `Correspondance : ${e.matchStatus}. Supabase : ${e.status.supabase}. Shopify : ${e.status.shopify}.`,
    '',
    ...e.anomalies.map((a) => `- ${a.severity} / ${a.code} : ${line(a.detail)}`),
    '',
  ]),
];
await writeFile(new URL('product-map.json', folder), `${JSON.stringify(map, null, 2)}\n`);
await writeFile(new URL('product-map-report.md', folder), `${report.join('\n')}\n`);
console.log(
  `Table écrite : ${validation.blockingCount} anomalies bloquantes, ${validation.anomalies.length} anomalies au total.`,
);
