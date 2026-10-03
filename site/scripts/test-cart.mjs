#!/usr/bin/env node
/**
 * Tests unitaires du panier local (src/scripts/cart-store.ts), sans navigateur : localStorage et
 * document simulés. `node --experimental-strip-types scripts/test-cart.mjs` (Node ≥ 22.6).
 * Couvre : quantités (0, négatif, décimal, texte, énorme), plafond de lignes, fusion d'une même
 * variante, données altérées dans localStorage (prix, identifiants, liens javascript:, image http),
 * stockage indisponible.
 */
import assert from 'node:assert/strict';

const store = new Map();
let throwing = false;
globalThis.localStorage = {
  getItem: (k) => {
    if (throwing) throw new Error('bloqué');
    return store.has(k) ? store.get(k) : null;
  },
  setItem: (k, v) => {
    if (throwing) throw new Error('bloqué');
    store.set(k, String(v));
  },
  removeItem: (k) => store.delete(k),
};
const events = [];
globalThis.document = { dispatchEvent: (e) => events.push(e), addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.CustomEvent = class extends Event {
  constructor(type, init) {
    super(type);
    this.detail = init?.detail;
  }
};

const cart = await import('../src/scripts/cart-store.ts');
const P = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const base = {
  productId: P,
  variantId: V,
  slug: 'miel',
  name: 'Miel',
  variant: 'Contenance : 200 g',
  unitPriceCents: 2499,
  listPriceCents: null,
  image: '/_astro/x.webp',
  href: '/miel/',
  onDemand: false,
};
let passed = 0;
const test = (label, fn) => {
  store.clear();
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
};

test('quantités ramenées à un entier entre 1 et 99', () => {
  for (const [input, expected] of [
    [0, 1],
    [-3, 1],
    [2.7, 2],
    ['5', 5],
    ['abc', 1],
    [NaN, 1],
    [1e9, 99],
    [99, 99],
  ])
    assert.equal(cart.clampQuantity(input), expected, String(input));
});
test('ajout puis fusion de la même variante (quantité cumulée, plafonnée)', () => {
  assert.equal(cart.addToCart(base, 1), 'added');
  assert.equal(cart.addToCart(base, 2), 'increased');
  assert.equal(cart.readCart()[0].quantity, 3);
  cart.setQuantity(cart.lineKey(base), 500);
  assert.equal(cart.readCart()[0].quantity, 99);
  assert.equal(cart.addToCart(base, 1), 'capped');
});
test('deux variantes du même produit = deux lignes', () => {
  cart.addToCart(base);
  cart.addToCart({
    ...base,
    variantId: '33333333-3333-4333-8333-333333333333',
    variant: 'Contenance : 300 g',
  });
  assert.equal(cart.readCart().length, 2);
  assert.equal(cart.cartCount(), 2);
});
test('sous-total et retrait', () => {
  cart.addToCart(base, 2);
  assert.equal(cart.cartSubtotal(), 4998);
  cart.removeLine(cart.lineKey(base));
  assert.deepEqual(cart.readCart(), []);
});
test('30 lignes au maximum', () => {
  for (let i = 0; i < 30; i++)
    cart.addToCart({ ...base, variantId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` });
  assert.equal(cart.addToCart({ ...base, variantId: null }), 'full');
  assert.equal(cart.readCart().length, 30);
});
test('localStorage altéré : lignes invalides écartées, champs dangereux neutralisés', () => {
  store.set(
    'dn-cart-v1',
    JSON.stringify([
      { ...base, unitPriceCents: -1 },
      { ...base, unitPriceCents: 12.5 },
      { ...base, productId: 'pas-un-uuid' },
      { ...base, variantId: '1; drop table' },
      {
        ...base,
        quantity: -4,
        href: 'javascript:alert(1)',
        image: 'http://pistage.example/x.gif',
        listPriceCents: 100,
      },
      { ...base },
      'texte',
      null,
    ]),
  );
  const lines = cart.readCart();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 1);
  assert.equal(lines[0].href, '/');
  assert.equal(lines[0].image, null);
  assert.equal(lines[0].listPriceCents, null);
});
test('JSON corrompu ou stockage bloqué : panier vide, aucune exception', () => {
  store.set('dn-cart-v1', '{pas du json');
  assert.deepEqual(cart.readCart(), []);
  throwing = true;
  assert.deepEqual(cart.readCart(), []);
  assert.doesNotThrow(() => cart.addToCart(base));
  throwing = false;
});
test('vider le panier', () => {
  cart.addToCart(base);
  cart.clearCart();
  assert.equal(store.has('dn-cart-v1'), false);
});
console.log(`\n✓ Panier local : ${passed} tests réussis.`);
