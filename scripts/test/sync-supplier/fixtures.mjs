// Fixture reproduisant l'état réel du catalogue au 2026-09-21 (mêmes prix,
// mêmes statuts, mêmes faits fournisseur), avec des identifiants de test et un
// fournisseur anonyme « fournisseur-a ». Rien ici n'identifie le fournisseur.

import { build } from './mock-supplier.mjs';

const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const IDS = {
  yara: U(1), yara50: U(101), yara100: U(102),
  khamrah: U(2), qahwa: U(3), ansaam: U(4), libbra: U(5), jade: U(6), amber: U(7), liquid: U(8),
  orderable: U(9), // produit synthétique : actif, commandable, à la commande, sous le prix fournisseur
  admin: '11111111-1111-4111-8111-111111111111',
};

export const SUPPLIER_CODE = 'fournisseur-a';

// Produits Dar Nūr (prix, statut) — cf. lecture Supabase du 2026-09-21.
export const PRODUCTS = [
  { id: IDS.yara, slug: 'yara', name: 'Yara', price_value: 5, active: false, coming_soon: false, variant_axes: ['contenance'], brand_slug: 'lattafa',
    variants: [{ id: IDS.yara50, name: '50 ml', price: 5, sku: 'SKU-YARA-50' }, { id: IDS.yara100, name: '100 ml', price: 19, sku: 'SKU-YARA-100' }] },
  { id: IDS.khamrah, slug: 'khamrah', name: 'Khamrah', price_value: 29, active: true, coming_soon: true, variant_axes: [], brand_slug: 'lattafa' },
  { id: IDS.qahwa, slug: 'khamrah-qahwa', name: 'Khamrah Qahwa', price_value: 30, active: true, coming_soon: true, variant_axes: [], brand_slug: 'lattafa' },
  { id: IDS.ansaam, slug: 'ansaam-gold', name: 'Ansaam Gold', price_value: 29, active: false, coming_soon: false, variant_axes: [], brand_slug: 'lattafa' },
  { id: IDS.libbra, slug: 'libbra', name: 'Libbra', price_value: 35, active: false, coming_soon: false, variant_axes: [], brand_slug: 'maison-alhambra' },
  { id: IDS.jade, slug: 'jade-giallo', name: 'Jade Giallo', price_value: 49, active: false, coming_soon: false, variant_axes: [], brand_slug: 'french-avenue' },
  { id: IDS.amber, slug: 'amber-d-or', name: 'Amber d’Or', price_value: 39, active: false, coming_soon: false, variant_axes: [], brand_slug: 'french-avenue' },
  { id: IDS.liquid, slug: 'liquid-brun-french-avenue', name: 'Liquid Brun', price_value: 39, active: false, coming_soon: false, variant_axes: [], brand_slug: 'french-avenue' },
  { id: IDS.orderable, slug: 'test-commandable', name: 'Test commandable', price_value: 20, active: true, coming_soon: false, variant_axes: [], brand_slug: 'lattafa' },
];

// Faits fournisseur tels qu'importés (product_sources avant toute synchronisation).
export const SOURCES = [
  { product_id: IDS.yara, variant_id: null, supplier_product_id: '1001', supplier_variant_id: null, supplier_sku: 'SKU-YARA', regular: 14.9, price: 4.9, on_sale: true, in_stock: true, qty: null },
  { product_id: IDS.yara, variant_id: IDS.yara50, supplier_product_id: '1001', supplier_variant_id: '1051', supplier_sku: 'SKU-YARA-50', regular: 14.9, price: 4.9, on_sale: true, in_stock: true, qty: 207 },
  { product_id: IDS.yara, variant_id: IDS.yara100, supplier_product_id: '1001', supplier_variant_id: '1052', supplier_sku: 'SKU-YARA-100', regular: 29, price: 19, on_sale: true, in_stock: true, qty: 31 },
  { product_id: IDS.khamrah, variant_id: null, supplier_product_id: '1002', supplier_variant_id: null, supplier_sku: 'SKU-KHAMRAH', regular: 45, price: 29, on_sale: true, in_stock: true, qty: 15 },
  { product_id: IDS.qahwa, variant_id: null, supplier_product_id: '1003', supplier_variant_id: null, supplier_sku: 'SKU-QAHWA', regular: 45, price: 34.9, on_sale: true, in_stock: true, qty: 18 },
  { product_id: IDS.ansaam, variant_id: null, supplier_product_id: '1004', supplier_variant_id: null, supplier_sku: 'SKU-ANSAAM', regular: 49, price: 29, on_sale: true, in_stock: true, qty: 10 },
  { product_id: IDS.libbra, variant_id: null, supplier_product_id: '1005', supplier_variant_id: null, supplier_sku: 'SKU-LIBBRA', regular: 34.9, price: 34.9, on_sale: false, in_stock: true, qty: 28 },
  { product_id: IDS.jade, variant_id: null, supplier_product_id: '1006', supplier_variant_id: null, supplier_sku: 'SKU-JADE', regular: 49, price: 49, on_sale: false, in_stock: true, qty: 24 },
  { product_id: IDS.amber, variant_id: null, supplier_product_id: '1007', supplier_variant_id: null, supplier_sku: 'SKU-AMBER', regular: 39, price: 39, on_sale: false, in_stock: false, qty: null },
  { product_id: IDS.liquid, variant_id: null, supplier_product_id: '1008', supplier_variant_id: null, supplier_sku: 'SKU-LIQUID', regular: 44, price: 39, on_sale: true, in_stock: false, qty: null },
  { product_id: IDS.orderable, variant_id: null, supplier_product_id: '1009', supplier_variant_id: null, supplier_sku: 'SKU-TEST', regular: 25, price: 25, on_sale: false, in_stock: true, qty: 5 },
];

// Le faux fournisseur, aujourd'hui : identique aux faits importés.
export function supplierProducts() {
  return [
    build({ id: 1001, name: 'Yara', type: 'variable', sku: 'SKU-YARA', regular: 14.9, price: 4.9, inStock: true, variations: [{ id: 1051, contenance: '50 ml' }, { id: 1052, contenance: '100 ml' }] }),
    build({ id: 1051, name: 'Yara - 50 ml', type: 'variation', sku: 'SKU-YARA-50', regular: 14.9, price: 4.9, inStock: true, qty: 207 }),
    build({ id: 1052, name: 'Yara - 100 ml', type: 'variation', sku: 'SKU-YARA-100', regular: 29, price: 19, inStock: true, qty: 31 }),
    build({ id: 1002, name: 'Khamrah', sku: 'SKU-KHAMRAH', regular: 45, price: 29, inStock: true, qty: 15 }),
    build({ id: 1003, name: 'Khamrah Qahwa', sku: 'SKU-QAHWA', regular: 45, price: 34.9, inStock: true, qty: 18 }),
    build({ id: 1004, name: 'Ansaam Gold', sku: 'SKU-ANSAAM', regular: 49, price: 29, inStock: true, qty: 10 }),
    build({ id: 1005, name: 'Libbra', sku: 'SKU-LIBBRA', regular: 34.9, price: 34.9, inStock: true, qty: 28 }),
    build({ id: 1006, name: 'Jade Giallo', sku: 'SKU-JADE', regular: 49, price: 49, inStock: true, qty: 24 }),
    build({ id: 1007, name: 'Amber d’Or', sku: 'SKU-AMBER', regular: 39, price: 39, inStock: false }),
    build({ id: 1008, name: 'Liquid Brun', sku: 'SKU-LIQUID', regular: 44, price: 39, inStock: false }),
    build({ id: 1009, name: 'Test commandable', sku: 'SKU-TEST', regular: 25, price: 25, inStock: true, qty: 5 }),
  ];
}

export async function seed(db) {
  await db.exec(`
    insert into public.categories (id, label, filter_label) values ('parfums', 'Parfum', 'Parfums');
    insert into public.brands (id, name) values ('lattafa', 'Lattafa'), ('french-avenue', 'French Avenue'), ('maison-alhambra', 'Maison Alhambra');
    insert into public.admins (user_id, email) values ('${IDS.admin}', 'admin@test.invalid');
  `);
  for (const p of PRODUCTS) {
    await db.query(`insert into public.products (id, slug, category_id, name, price_value, active, coming_soon, variant_axes, brand_slug, brand) values ($1,$2,'parfums',$3,$4,$5,$6,$7,$8,$8)`,
      [p.id, p.slug, p.name, p.price_value, p.active, p.coming_soon, p.variant_axes, p.brand_slug]);
    for (const [i, v] of (p.variants || []).entries()) {
      await db.query(`insert into public.product_variants (id, product_id, name, options, price, sku, sort_order) values ($1,$2,$3,$4::jsonb,$5,$6,$7)`,
        [v.id, p.id, v.name, JSON.stringify({ contenance: v.name }), v.price, v.sku, i]);
    }
  }
  for (const s of SOURCES) {
    await db.query(`insert into public.product_sources (product_id, variant_id, supplier, supplier_product_id, supplier_variant_id, supplier_url, supplier_sku,
      supplier_regular_price, supplier_price, supplier_on_sale, supplier_in_stock, supplier_stock_qty, purchase_price, last_synced_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,null,'2026-09-20T15:49:00Z')`,
      [s.product_id, s.variant_id, SUPPLIER_CODE, s.supplier_product_id, s.supplier_variant_id, `http://supplier.invalid/produit/${s.supplier_product_id}/`, s.supplier_sku,
        s.regular, s.price, s.on_sale, s.in_stock, s.qty]);
  }
}
