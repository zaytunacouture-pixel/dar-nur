-- ============================================================================
-- Rollback de sync_supplier.sql — supprime l'infrastructure du synchroniseur.
--
-- ATTENTION : supprime l'historique des observations, les déclarations
-- Dar Nūr (stock_mode, base_price), les propositions/décisions, ET les
-- colonnes purchase_price_at / purchase_price_origin de product_sources
-- (la valeur purchase_price elle-même est conservée, mais sa contrainte de
-- qualification est retirée). Exporter ces tables avant si elles ont servi.
--
-- Ne touche ni products, ni product_variants, ni les autres colonnes de
-- product_sources.
-- ============================================================================

begin;

drop trigger if exists trg_pso_readonly on public.product_source_observations;
drop function if exists public.product_source_observations_readonly();

drop policy if exists "admin_only_sync_proposals"              on public.sync_proposals;
drop policy if exists "admin_only_product_supply"              on public.product_supply;
drop policy if exists "admin_only_product_source_observations" on public.product_source_observations;

drop trigger if exists trg_product_supply_updated_at on public.product_supply;

drop table if exists public.sync_proposals;
drop table if exists public.product_supply;
drop table if exists public.product_source_observations;

alter table public.product_sources
  drop constraint if exists chk_product_sources_purchase_price_qualified,
  drop constraint if exists chk_product_sources_purchase_price_origin;

alter table public.product_sources
  drop column if exists last_attempt_at,
  drop column if exists last_error,
  drop column if exists purchase_price_at,
  drop column if exists purchase_price_origin;

commit;
