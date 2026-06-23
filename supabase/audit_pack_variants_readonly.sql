-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit en LECTURE SEULE : Variantes de tous les produits des packs
-- Dar Nūr — Supabase
--
-- À exécuter dans Supabase SQL Editor pour voir TOUTES les variantes
-- aucune modification de données
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Identifier TOUS les produits inclus dans les packs
-- ─────────────────────────────────────────────────────────────────────────────

WITH pack_products AS (
  SELECT DISTINCT
    o.id AS offer_id,
    o.title AS pack_name,
    op.product_slug,
    op.sort_order AS pack_item_order
  FROM offers o
  JOIN offer_products op ON o.id = op.offer_id
  WHERE o.type = 'pack'
    AND o.active = true
  ORDER BY o.sort_order, op.sort_order
)

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Pour CHAQUE produit, afficher TOUTES ses variantes
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  pp.pack_name,
  pp.product_slug,
  p.id AS product_id,
  p.name AS product_name,
  p.variant_axes,
  p.price_value AS product_base_price,
  pv.id AS variant_id,
  pv.name AS variant_name,
  pv.options AS variant_options,
  pv.price AS variant_price,
  pv.images[1] AS variant_image_first,
  pv.sort_order AS variant_sort_order,
  pv.active AS variant_active,
  CASE
    WHEN pv.name ILIKE '%200%' OR pv.name ILIKE '%200g%' THEN '✅ 200G TROUVÉ'
    WHEN pv.name ILIKE '%50%' OR pv.name ILIKE '%50g%' THEN '⚠️ 50G (pas 200g)'
    ELSE '❓ AUTRE FORMAT'
  END AS format_check
FROM pack_products pp
JOIN products p ON p.slug = pp.product_slug
LEFT JOIN product_variants pv ON p.id = pv.product_id
ORDER BY
  pp.pack_name,
  pp.pack_item_order,
  CASE
    WHEN pv.name ILIKE '%200%' THEN 0  -- 200g en premier
    WHEN pv.name ILIKE '%50%' THEN 1   -- 50g en second
    ELSE 2
  END,
  pv.sort_order;

-- ─────────────────────────────────────────────────────────────────────────────
-- RAPPORT SYNTHÉTIQUE : Produits sans variante 200g
-- ─────────────────────────────────────────────────────────────────────────────

WITH pack_products AS (
  SELECT DISTINCT
    o.id AS offer_id,
    o.title AS pack_name,
    op.product_slug
  FROM offers o
  JOIN offer_products op ON o.id = op.offer_id
  WHERE o.type = 'pack'
    AND o.active = true
)

SELECT
  pp.pack_name,
  pp.product_slug,
  p.name AS product_name,
  COUNT(DISTINCT pv.id) AS total_variants,
  STRING_AGG(DISTINCT pv.name, ', ' ORDER BY pv.name) AS available_variants,
  CASE
    WHEN COUNT(DISTINCT CASE WHEN pv.name ILIKE '%200%' THEN pv.id END) > 0 THEN '✅ OK'
    ELSE '❌ MANQUE 200G'
  END AS status
FROM pack_products pp
JOIN products p ON p.slug = pp.product_slug
LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.active = true
GROUP BY pp.pack_name, pp.product_slug, p.name
ORDER BY pp.pack_name, pp.product_slug;
