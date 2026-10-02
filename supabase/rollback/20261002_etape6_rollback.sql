-- ============================================================================
-- Rollback de l'étape 6 (migrations supabase/migrations/20261002100000 → 100800).
--
-- Retire TOUT ce que l'étape 6 a ajouté, et rien d'autre :
--   triggers et fonctions de transition, nouvelles tables, nouvelles colonnes de
--   products et offer_products (leurs contraintes et index partent avec elles).
-- Les colonnes et données historiques (active, coming_soon, category_id, options,
-- images, product_slug…) n'ont jamais été modifiées par l'étape 6 : elles restent
-- telles quelles. Les données propres aux nouvelles tables sont perdues (elles
-- sont reproductibles en réexécutant les migrations).
--
-- Aucun trigger de régénération n'est déclenché (DDL uniquement).
-- À exécuter : npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f <ce fichier>
-- Idempotent.
-- ============================================================================

begin;

-- 1) Triggers de transition posés sur des tables existantes
drop trigger if exists trg_products_legacy_flags        on public.products;
drop trigger if exists trg_products_sync_media          on public.products;
drop trigger if exists trg_products_sync_collections    on public.products;
drop trigger if exists trg_product_variants_sync_options on public.product_variants;
drop trigger if exists trg_product_variants_sync_media  on public.product_variants;
drop trigger if exists trg_offer_products_resolve_product on public.offer_products;

-- 2) Nouvelles tables (ordre des dépendances)
drop table if exists public.product_grouping_members;
drop table if exists public.product_groupings;
drop table if exists public.product_relations;
drop table if exists public.redirects;
drop table if exists public.settings;
drop table if exists public.product_food_details;
drop table if exists public.product_apparel_details;
alter table public.products drop column if exists size_guide_id;
drop table if exists public.size_guide_rows;
drop table if exists public.size_guides;
drop table if exists public.product_media;
drop table if exists public.product_variant_options;
drop table if exists public.option_values;
drop table if exists public.option_types;
drop table if exists public.product_collections;
drop table if exists public.legacy_category_collections;
drop table if exists public.collections;

-- 3) Nouvelles colonnes des tables existantes
alter table public.offer_products
  drop column if exists product_id,
  drop column if exists variant_id,
  drop column if exists quantity;

alter table public.products
  drop column if exists status,
  drop column if exists availability,
  drop column if exists replaced_by_product_id,
  drop column if exists net_quantity,
  drop column if exists net_unit,
  drop column if exists seo_title,
  drop column if exists seo_description;

-- 4) Fonctions
drop function if exists public.products_sync_legacy_flags();
drop function if exists public.products_sync_collections();
drop function if exists public.sync_legacy_product_media();
drop function if exists public.product_variants_sync_options();
drop function if exists public.sync_legacy_variant_options(uuid);
drop function if exists public.product_variant_options_check_unique();
drop function if exists public.variant_option_signature(uuid);
drop function if exists public.offer_products_resolve_product();
drop function if exists public.collections_check_hierarchy();

-- 5) Contrôle : l'état antérieur est retrouvé
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'products'
                and column_name in ('status', 'availability', 'replaced_by_product_id', 'net_quantity', 'net_unit',
                                    'seo_title', 'seo_description', 'size_guide_id'))
     or exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'offer_products'
                   and column_name in ('product_id', 'variant_id', 'quantity'))
     or to_regclass('public.collections') is not null then
    raise exception 'Rollback incomplet.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
