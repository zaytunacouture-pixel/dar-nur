// Faux fournisseur : Store API WooCommerce minimale (`/wp-json/wc/store/v1/
// products/:id`), état mutable entre deux exécutions du synchroniseur
// (promo, fin de promo, hausse, rupture, panne). Aucune donnée réelle : les
// identifiants, prix et libellés sont ceux de la fixture de test.

import http from 'node:http';

export function storeProduct({ id, name, type = 'simple', sku, regular, price, inStock = true, qty = null, variations = [] }) {
  const minor = v => (v == null ? '' : String(Math.round(v * 100)));
  return {
    id, name, slug: name.toLowerCase().replace(/\s+/g, '-'), permalink: `http://supplier.invalid/produit/${id}/`, type, sku,
    prices: { currency_code: 'EUR', currency_minor_unit: 2, price: minor(price), regular_price: minor(regular), sale_price: minor(price) },
    on_sale: price != null && regular != null && price < regular,
    is_in_stock: inStock,
    stock_availability: { text: inStock ? (qty != null ? `${qty} en stock` : 'En stock') : 'En rupture de stock', class: inStock ? 'in-stock' : 'out-of-stock' },
    variations: variations.map(v => ({ id: v.id, attributes: [{ name: 'Contenance', value: v.contenance }] })),
    attributes: [], categories: [{ id: 1, name: 'Parfums', slug: 'parfums' }], brands: [], images: [], description: '', short_description: '',
  };
}

export async function startMockSupplier({ port = 0, products }) {
  const state = { products: new Map(products.map(p => [String(p.id), p])), down: false, failIds: new Set(), requests: [] };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    state.requests.push(url.pathname);
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (state.down) return send(503, { message: 'maintenance' });
    const m = url.pathname.match(/^\/wp-json\/wc\/store\/v1\/products\/(\d+)$/);
    if (!m) return send(404, { message: 'not found' });
    if (state.failIds.has(m[1])) return send(500, { message: 'erreur simulée' });
    const p = state.products.get(m[1]);
    return p ? send(200, { ...p, _spec: undefined }) : send(404, { code: 'woocommerce_rest_product_invalid_id', message: 'Invalid product ID.' });
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl, state,
    set(id, patch) { // patch : { regular, price, inStock, qty }
      const cur = state.products.get(String(id));
      const rebuilt = storeProduct({ ...cur._spec, ...patch });
      rebuilt._spec = { ...cur._spec, ...patch };
      state.products.set(String(id), rebuilt);
    },
    close: () => new Promise(r => server.close(r)),
  };
}

export function build(spec) { const p = storeProduct(spec); p._spec = spec; return p; }
