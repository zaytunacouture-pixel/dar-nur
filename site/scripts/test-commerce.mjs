#!/usr/bin/env node
/** Données entièrement FICTIVES, aucun accès réseau ni fichier métier externe. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  assertCommerceBuild,
  resolveCommerceMode,
  isLegacyCartEnabled,
  isOrderSubmissionEnabled,
  purchaseActionFor,
  SHOPIFY_CATALOG_SOURCE,
  shopifyProductionApproved,
} from '../src/lib/commerce/mode.ts';
import {
  buildProductMap,
  validateProductMap,
  normalizeOption,
  EXCLUDED_SLUGS,
} from '../src/lib/commerce/product-map.ts';
import { shopifyPurchaseLink } from '../src/lib/commerce/purchase.ts';

const date = '2026-01-01T00:00:00.000Z';
const uuid = '11111111-1111-4111-8111-111111111111';
const source = (patch = {}) => ({
  id: uuid,
  slug: 'produit-fictif',
  status: 'published',
  availability: 'available',
  price_value: 30,
  variant_axes: [],
  product_variants: [],
  ...patch,
});
const sv = (patch = {}) => ({
  id: 101,
  title: 'Default Title',
  options: ['Default Title'],
  price: '30.00',
  available: true,
  ...patch,
});
const shop = (patch = {}) => ({
  id: 10,
  handle: 'produit-fictif',
  title: 'Produit fictif',
  variants: [sv()],
  ...patch,
});
const catalog = (products = [shop()]) => ({
  schemaVersion: 1,
  needsGeneration: false,
  fetchedAt: date,
  source: SHOPIFY_CATALOG_SOURCE,
  products,
});
const sourceVariant = (id, options, price = 30) => ({
  id,
  active: true,
  price,
  options,
  product_variant_options: [],
});
const make = (sources = [source()], c = catalog()) => ({
  map: buildProductMap(sources, c, date),
  catalog: c,
});
const link = (data, variant = null, qty, mode = 'shopify', slug = 'produit-fictif') =>
  shopifyPurchaseLink(mode, data.map, data.catalog, slug, variant, qty);
const codes = (data) => validateProductMap(data.map, data.catalog).anomalies.map((a) => a.code);
let passed = 0;
const test = (label, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
};

test('égalité exacte slug/handle, variante unique et IDs exclusivement issus du catalogue', () => {
  const data = make();
  assert.equal(data.map.entries[0].matchStatus, 'matched');
  assert.equal(data.map.entries[0].variants[0].shopifyVariantId, 101);
  assert.deepEqual(validateProductMap(data.map, data.catalog).structuralErrors, []);
  assert.equal(validateProductMap(data.map, data.catalog).blockingCount, 0);
  const other = make([source()], catalog([shop({ handle: 'autre-fictif' })]));
  assert.deepEqual(new Set(codes(other)), new Set(['supabase-only', 'shopify-only']));
  assert.equal(link(other).ok, false); // même titre/prix : aucun rapprochement
});
test('correspondances multiples côté Shopify ou Supabase : aucun choix', () => {
  for (const data of [
    make([source()], catalog([shop(), shop({ id: 11, variants: [sv({ id: 102 })] })])),
    make([source(), source({ id: '22222222-2222-4222-8222-222222222222' })]),
  ]) {
    assert.ok(codes(data).includes('multiple-products'));
    assert.equal(data.map.entries[0].matchStatus, 'ambiguous');
    assert.equal(link(data).ok, false);
  }
});
test('les cinq exclusions sont bloquantes de chaque côté, titre exact aussi', () => {
  for (const slug of EXCLUDED_SLUGS) {
    for (const data of [make([source({ slug })], catalog([])), make([], catalog([shop({ handle: slug })]))]) {
      assert.ok(codes(data).includes('excluded-present'));
      assert.equal(link(data, null, undefined, 'shopify', slug).reason, 'excluded');
    }
  }
  const renamed = make([source()], catalog([shop({ title: 'Miel de Lavande' })]));
  assert.ok(codes(renamed).includes('excluded-present'));
  assert.equal(link(renamed).reason, 'excluded');
});
test('sans variante Supabase : exige exactement une variante Shopify valide', () => {
  for (const variants of [[], [sv(), sv({ id: 102 })]]) {
    const data = make([source()], catalog([shop({ variants })]));
    assert.ok(codes(data).includes('supabase-variant-only'));
    assert.equal(link(data).reason, 'variant-unmapped');
  }
  const inactive = make([
    source({
      product_variants: [sourceVariant('var-inactive', {}, 30)].map((v) => ({ ...v, active: false })),
    }),
  ]);
  assert.ok(codes(inactive).includes('no-active-variant'));
});
test('normalisation import, options normalisées, ordre des variantes sans effet', () => {
  assert.equal(normalizeOption(' ÉTÉ —  200-g '), 'ete 200 g');
  const data = make(
    [
      source({
        variant_axes: ['format'],
        product_variants: [
          sourceVariant('var-fictive-1', { format: 'Été 200-g' }),
          {
            ...sourceVariant('var-fictive-2', null),
            product_variant_options: [
              { option_type_id: 'contenance', option_values: { label: '300 g', code: '300-g' } },
            ],
          },
        ],
      }),
    ],
    catalog([shop({ variants: [sv({ id: 102, options: ['300 g'] }), sv({ options: ['ete 200 g'] })] })]),
  );
  assert.equal(data.map.entries[0].variants[0].shopifyVariantId, 101);
  assert.equal(data.map.entries[0].variants[1].shopifyVariantId, 102);
  assert.equal(codes(data).length, 0);
  assert.equal(link(data).reason, 'variant-required');
  assert.equal(link(data, 'var-inconnue').reason, 'variant-unmapped');
  assert.equal(
    link(data, 'var-fictive-1').url,
    'https://shop.dar-nur.fr/products/produit-fictif?variant=101',
  );
});
test('ambiguïté des options de chaque côté, options absentes et variantes orphelines', () => {
  const p = source({
    variant_axes: ['format'],
    product_variants: [sourceVariant('var-1', { format: '200 g' })],
  });
  const s = shop({ variants: [sv({ options: ['200 g'] }), sv({ id: 102, options: ['200-g'] })] });
  assert.ok(codes(make([p], catalog([s]))).includes('ambiguous-variant'));
  const duplicated = {
    ...p,
    product_variants: [...p.product_variants, sourceVariant('var-2', { format: '200-g' })],
  };
  const data = make([duplicated], catalog([shop({ variants: [sv({ options: ['200 g'] })] })]));
  assert.ok(codes(data).includes('ambiguous-variant'));
  assert.equal(data.map.entries[0].variants[0].shopifyVariantId, null);
  const missing = make([p]);
  assert.ok(codes(missing).includes('supabase-variant-only'));
  assert.ok(codes(missing).includes('shopify-variant-only'));
  assert.equal(link(missing, 'var-1').ok, false);
  assert.ok(
    codes(make([{ ...p, product_variants: [sourceVariant('var-1', {})] }])).includes('supabase-variant-only'),
  );
});
test('prix absents/écarts bloquants ; disponibilité divergente signalée et achat refusé', () => {
  for (const price_value of [null, 0, -1])
    assert.ok(codes(make([source({ price_value })])).includes('missing-price'));
  assert.ok(
    codes(make([source()], catalog([shop({ variants: [sv({ price: null })] })]))).includes('missing-price'),
  );
  const price = make([source({ price_value: 29.99 })]);
  assert.ok(codes(price).includes('price-difference'));
  assert.equal(link(price).ok, false);
  for (const data of [
    make([source({ availability: 'out_of_stock' })]),
    make([source({ availability: null })]),
    make([source()], catalog([shop({ variants: [sv({ available: false })] })])),
  ]) {
    assert.ok(codes(data).includes('availability-difference'));
    assert.equal(link(data).reason, 'unavailable');
  }
});
test('liens produit sans variante et permaliens panier, quantité entière 1–99', () => {
  const data = make();
  assert.equal(link(data).url, 'https://shop.dar-nur.fr/products/produit-fictif');
  assert.equal(link(data, null, 2).url, 'https://shop.dar-nur.fr/cart/101:2');
  for (const qty of [1, 99]) assert.equal(link(data, null, qty).ok, true);
  for (const qty of [0, -1, 1.5, 100, NaN, '2'])
    assert.equal(link(data, null, qty).reason, 'invalid-quantity');
  assert.equal(link(data, uuid).reason, 'variant-unmapped');
  assert.equal(link(data, null, undefined, 'shopify', 'inconnu').reason, 'product-unmapped');
});
test('UUID, ID inconnu, doublons, données altérées et omission : incohérences structurelles refusées', () => {
  for (const id of [uuid, '101', 999, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const data = make();
    data.map.entries[0].variants[0].shopifyVariantId = id;
    assert.ok(validateProductMap(data.map, data.catalog).structuralErrors.length);
    assert.equal(link(data).reason, 'invalid-map');
  }
  for (const mutate of [
    (d) => d.map.entries.splice(0),
    (d) => d.map.entries.push(structuredClone(d.map.entries[0])),
    (d) => (d.map.entries[0].shopifyProductId = 999),
    (d) => (d.map.entries[0].shopifyHandle = 'inconnu'),
    (d) => (d.map.entries[0].variants[0].available = false),
    (d) => d.catalog.products[0].variants.push(sv()),
    (d) => (d.catalog.products[0].id = uuid),
    (d) => (d.map.sourceProducts[0].status = 'draft'),
    (d) => (d.map.entries[0].excluded = true),
    (d) => (d.map.catalogFetchedAt = 'date-inconnue'),
  ]) {
    const data = make();
    mutate(data);
    assert.ok(validateProductMap(data.map, data.catalog).structuralErrors.length);
  }
  assert.ok(validateProductMap({}, {}).structuralErrors.length);
});
test('modes explicites et valeurs invalides sans repli silencieux', () => {
  assert.equal(resolveCommerceMode(), 'legacy');
  for (const mode of ['legacy', 'shopify', 'disabled']) {
    assert.equal(resolveCommerceMode(mode), mode);
    assert.equal(isLegacyCartEnabled(mode), mode === 'legacy');
    assert.equal(isOrderSubmissionEnabled(mode, 'preprod', false), mode === 'legacy');
    assert.equal(isOrderSubmissionEnabled(mode, 'production', true), mode === 'legacy');
    assert.equal(isOrderSubmissionEnabled(mode, 'production', false), false);
    assert.equal(
      purchaseActionFor(mode),
      { legacy: 'legacy-cart', shopify: 'shopify-link', disabled: 'none' }[mode],
    );
    if (mode !== 'shopify') assert.equal(link(make(), null, undefined, mode).reason, 'mode-not-shopify');
  }
  for (const invalid of ['', 'SHOPIFY', 'shopify ', null, false, 0])
    assert.throws(() => resolveCommerceMode(invalid), /DAR_NUR_COMMERCE_MODE/);
});
test('garde-fou production : approbation versionnée ET table valide requises', () => {
  const data = make();
  const good = validateProductMap(data.map, data.catalog);
  assert.equal(shopifyProductionApproved, false);
  assert.throws(() => assertCommerceBuild('shopify', 'production', false, good), /shopifyProductionApproved/);
  assert.doesNotThrow(() => assertCommerceBuild('shopify', 'production', true, good));
  assert.doesNotThrow(() => assertCommerceBuild('shopify', 'preprod', false, good));
  for (const environment of ['preprod', 'production'])
    for (const bad of [
      { ...good, ready: false },
      { ...good, blockingCount: 1 },
      { ...good, structuralErrors: ['ID inconnu'] },
    ])
      assert.throws(() => assertCommerceBuild('shopify', environment, true, bad), /table/);
  for (const mode of ['legacy', 'disabled'])
    assert.doesNotThrow(() =>
      assertCommerceBuild(mode, 'production', false, {
        ready: false,
        structuralErrors: ['inconnue'],
        blockingCount: 1,
      }),
    );
});
// Vérification CLI hors ligne : utilise uniquement les fichiers versionnés, initialement vides.
const runVerify = (args = [], mode = 'legacy') =>
  spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--no-warnings',
      fileURLToPath(new URL('./verify-shopify-map.mjs', import.meta.url)),
      ...args,
    ],
    { encoding: 'utf8', env: { ...process.env, DAR_NUR_COMMERCE_MODE: mode } },
  );
const folder = new URL('../src/data/shopify/', import.meta.url);
const persistedMap = JSON.parse(await readFile(new URL('product-map.json', folder), 'utf8'));
const persistedCatalog = JSON.parse(await readFile(new URL('shopify-catalog.json', folder), 'utf8'));
test('vérificateur CLI : legacy tolère les blocages métier, strict/shopify les refusent', () => {
  const validation = validateProductMap(persistedMap, persistedCatalog);
  assert.deepEqual(validation.structuralErrors, []);
  const result = runVerify();
  assert.equal(result.status, 0, result.stderr);
  const expected = validation.blockingCount ? 1 : 0;
  assert.equal(runVerify(['--strict']).status, expected);
  assert.equal(runVerify([], 'shopify').status, expected);
  assert.equal(runVerify([], 'invalid').status, 1);
});
console.log(`\n✓ Commerce : ${passed} tests réussis (données fictives, hors ligne).`);
