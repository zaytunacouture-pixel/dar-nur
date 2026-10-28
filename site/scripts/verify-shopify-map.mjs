#!/usr/bin/env node
/** Hors ligne : fichiers versionnés uniquement. */
import { readFile } from 'node:fs/promises';
import { resolveCommerceMode } from '../src/lib/commerce/mode.ts';
import { validateProductMap } from '../src/lib/commerce/product-map.ts';

try {
  const mode = resolveCommerceMode(process.env.DAR_NUR_COMMERCE_MODE);
  const folder = new URL('../src/data/shopify/', import.meta.url);
  const map = JSON.parse(await readFile(new URL('product-map.json', folder), 'utf8'));
  const catalog = JSON.parse(await readFile(new URL('shopify-catalog.json', folder), 'utf8'));
  const result = validateProductMap(map, catalog);
  for (const error of result.structuralErrors) console.error(`Structure : ${error}`);
  for (const a of result.anomalies)
    console.log(`[${a.severity}] ${a.slug || '(catalogue)'} / ${a.code} : ${a.detail}`);
  const strict = process.argv.includes('--strict') || mode === 'shopify';
  console.log(
    `Shopify map : mode=${mode}, strict=${strict}, erreurs structurelles=${result.structuralErrors.length}, anomalies bloquantes=${result.blockingCount}.`,
  );
  if (result.structuralErrors.length || (strict && result.blockingCount)) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
