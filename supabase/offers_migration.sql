-- ═══════════════════════════════════════════════════════════════════════════════
-- Dar Nūr — Module Offres & Packs
-- Migration séparée, n'affecte pas les tables products/categories/product_variants
-- À exécuter dans Supabase SQL Editor après schema.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Table principale : offres ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text          NOT NULL CHECK (type IN ('product_promo','pack','banner')),
  title         text          NOT NULL,
  description   text,
  image         text,
  normal_price  numeric(10,2),
  promo_price   numeric(10,2),
  badge         text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  active        boolean       NOT NULL DEFAULT true,
  sort_order    integer       NOT NULL DEFAULT 0,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

-- ── Table de jointure : produits inclus dans un pack ─────────────────────────
CREATE TABLE IF NOT EXISTS offer_products (
  offer_id      uuid    NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  product_slug  text    NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (offer_id, product_slug)
);

-- ── Trigger updated_at (réutilise la fonction déjà définie dans schema.sql) ──
CREATE TRIGGER set_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE offers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_products ENABLE ROW LEVEL SECURITY;

-- Anon : lecture des offres actives dans leur fenêtre de dates
CREATE POLICY public_read_active_offers ON offers
  FOR SELECT TO anon
  USING (
    active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >  now())
  );

-- Anon : lecture des produits liés aux offres visibles
CREATE POLICY public_read_offer_products ON offer_products
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_id
        AND o.active = true
        AND (o.starts_at IS NULL OR o.starts_at <= now())
        AND (o.ends_at   IS NULL OR o.ends_at   >  now())
    )
  );

-- Authenticated (admin) : accès complet
CREATE POLICY admin_all_offers ON offers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY admin_all_offer_products ON offer_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Index pour les requêtes fréquentes ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_offers_active_sort ON offers (active, sort_order);
