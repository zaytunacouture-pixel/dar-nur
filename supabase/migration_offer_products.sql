-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration : Amélioration du système de Packs et Offres
-- Dar Nūr — Supabase
--
-- AVANT D'EXÉCUTER :
-- 1. Sauvegarder les données actuelles de offer_products (backup)
-- 2. Tester en environnement de dev/staging
-- 3. Vérifier que tous les produits/variantes existent
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN TRANSACTION;

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 : Recréer la table offer_products avec la nouvelle structure
-- ─────────────────────────────────────────────────────────────────────────────

-- Sauvegarder les données actuelles (au cas où)
CREATE TEMP TABLE offer_products_backup AS
  SELECT * FROM offer_products;

-- Supprimer la table avec ses dépendances (RLS, index, etc.)
DROP TABLE IF EXISTS offer_products CASCADE;

-- Créer la nouvelle table avec colonnes enrichies
CREATE TABLE IF NOT EXISTS public.offer_products (
  offer_id       uuid    NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  product_slug   text    NOT NULL,

  -- Colonnes NOUVELLES : permettent d'override la variante par défaut
  variant_id     uuid    REFERENCES product_variants(id) ON DELETE SET NULL,
  variant_name   text,                              -- cache du nom de variante
  quantity       integer NOT NULL DEFAULT 1,        -- quantité dans le pack

  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Clé primaire : un même produit peut apparaître plusieurs fois avec différentes variantes
  PRIMARY KEY (offer_id, product_slug, COALESCE(variant_id, ''::uuid))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 : Restaurer les données avec la nouvelle structure
-- ─────────────────────────────────────────────────────────────────────────────

-- Pour chaque ligne backup, restaurer SANS variant_id (puisque les anciens packs
-- utilisaient juste le prix par défaut/50g)
INSERT INTO offer_products (offer_id, product_slug, sort_order)
  SELECT offer_id, product_slug, sort_order FROM offer_products_backup;

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 : Réappliquer Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE offer_products ENABLE ROW LEVEL SECURITY;

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
CREATE POLICY admin_all_offer_products ON offer_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4 : Trigger updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER set_offer_products_updated_at
  BEFORE UPDATE ON offer_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 5 : Index pour la performance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_offer_products_offer ON offer_products(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_products_variant ON offer_products(variant_id);

COMMIT;
