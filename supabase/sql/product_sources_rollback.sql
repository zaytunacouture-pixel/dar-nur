-- ============================================================================
-- Rollback de product_sources.sql — supprime la table de provenance privée.
--
-- Ne touche ni `products`, ni `product_variants`, ni `brands` : les produits
-- créés par un import (scripts/import-flora.mjs) ne sont PAS supprimés ici,
-- c'est le rôle de `node scripts/import-flora.mjs --rollback <dossier>`,
-- à exécuter AVANT ce script si l'on veut aussi retirer les produits importés
-- (il a besoin de la table pour retrouver ses propres lignes).
-- ============================================================================

begin;

drop trigger if exists trg_product_sources_updated_at on public.product_sources;
drop policy if exists "admin_only_product_sources" on public.product_sources;
drop table if exists public.product_sources;

commit;
