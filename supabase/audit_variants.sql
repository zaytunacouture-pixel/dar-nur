-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit des variantes — Dar Nūr
-- À exécuter dans Supabase SQL Editor pour vérifier les formats réels
-- ═══════════════════════════════════════════════════════════════════════════════

-- Vue 1 : Variantes de tous les miels
SELECT
  p.slug,
  p.name AS product_name,
  pv.id AS variant_id,
  pv.name AS variant_name,
  pv.options,
  pv.price,
  pv.active
FROM products p
JOIN product_variants pv ON p.id = pv.product_id
WHERE p.category_id = 'miels'
ORDER BY p.sort_order, pv.sort_order;

-- Vue 2 : Variantes de toutes les huiles
SELECT
  p.slug,
  p.name AS product_name,
  pv.id AS variant_id,
  pv.name AS variant_name,
  pv.options,
  pv.price,
  pv.active
FROM products p
JOIN product_variants pv ON p.id = pv.product_id
WHERE p.category_id = 'huiles'
ORDER BY p.sort_order, pv.sort_order;

-- Vue 3 : Produits sans variantes (prix unique)
SELECT
  p.slug,
  p.name,
  p.category_id,
  p.price_value,
  COUNT(pv.id) AS variant_count
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
GROUP BY p.id
HAVING COUNT(pv.id) = 0
ORDER BY p.category_id, p.sort_order;

-- Vue 4 : Offres actuelles et produits liés
SELECT
  o.id,
  o.title,
  o.type,
  o.normal_price,
  o.promo_price,
  o.badge,
  ARRAY_AGG(op.product_slug ORDER BY op.sort_order) AS product_slugs
FROM offers o
LEFT JOIN offer_products op ON o.id = op.offer_id
GROUP BY o.id
ORDER BY o.sort_order;
