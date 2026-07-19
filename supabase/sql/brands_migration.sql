-- ============================================================================
-- Table `brands` — gestion des marques de parfums depuis l'admin.
--
-- Remplace les colonnes libres products.brand / products.brand_slug comme
-- source de vérité du nom/image/description/ordre/statut d'une marque.
-- products.brand_slug devient une clé étrangère vers brands.id (même
-- convention que categories : id = slug, pas de colonne séparée).
--
-- products.brand (texte libre) N'EST PAS supprimé par cette migration —
-- conservé temporairement en lecture seule pour compatibilité, voir la note
-- en bas de fichier pour savoir quand il pourra être supprimé sans risque.
--
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Idempotent : peut être relancé sans effet si déjà exécuté (ON CONFLICT DO
-- NOTHING, IF NOT EXISTS, DROP ... IF EXISTS avant chaque CREATE).
-- ============================================================================

begin;

-- 1) Table brands -------------------------------------------------------------
create table if not exists public.brands (
  id           text primary key,            -- ex: "khamraha" (= slug)
  name         text not null,                -- ex: "Khamraha" (nom affiché)
  description  text,
  image_url    text,
  sort_order   int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- 2) Backfill des 3 marques déjà en production (no-op si déjà présentes) -----
insert into public.brands (id, name, sort_order)
values
  ('lecode',   'LeCode Paris',      0),
  ('khair',    'Khair by Ameerate', 1),
  ('khamraha', 'Khamraha',          2)
on conflict (id) do nothing;

-- 3) Garde-fou : abandonne la migration si un produit parfums (actif OU
--    inactif — cette requête tourne avec vos droits complets d'éditeur SQL,
--    pas la clé anon publique restreinte par RLS) a un brand_slug qui ne
--    correspond à aucune marque connue. Empêche d'ajouter une contrainte FK
--    sur des données orphelines.
do $$
declare
  orphan_count int;
  orphan_sample text;
begin
  select count(*), string_agg(distinct slug, ', ')
    into orphan_count, orphan_sample
  from public.products
  where category_id = 'parfums'
    and brand_slug is not null
    and brand_slug not in (select id from public.brands);

  if orphan_count > 0 then
    raise exception 'Abandon : % produit(s) parfums avec un brand_slug orphelin (ex: %). Ajoutez la marque correspondante dans brands avant de relancer cette migration.', orphan_count, orphan_sample;
  end if;
end $$;

-- 4) Contrainte FK products.brand_slug -> brands.id ---------------------------
--    NULL toujours autorisé (tout produit hors category_id='parfums').
alter table public.products
  drop constraint if exists fk_products_brand_slug;

alter table public.products
  add constraint fk_products_brand_slug
  foreign key (brand_slug) references public.brands(id)
  on update cascade;

-- 5) RLS (même logique que categories : lecture publique = actives seulement,
--    admin connecté = tout) --------------------------------------------------
alter table public.brands enable row level security;

drop policy if exists "public_read_active_brands" on public.brands;
create policy "public_read_active_brands"
  on public.brands for select to anon, authenticated using (active = true);

drop policy if exists "admin_all_brands" on public.brands;
create policy "admin_all_brands"
  on public.brands for all to authenticated using (true) with check (true);

commit;

-- ============================================================================
-- Rollback (si besoin, à exécuter en une fois) :
--   alter table public.products drop constraint if exists fk_products_brand_slug;
--   drop table if exists public.brands;
-- (products.brand / products.brand_slug ne sont pas touchés par ce rollback)
--
-- Quand supprimer products.brand (texte libre, devenu redondant) ?
-- Uniquement après avoir confirmé que plus AUCUN code ne le lit :
--   - scripts/generate-parfums.mjs doit lire le nom depuis brands.name (voir
--     Phase 3), pas depuis products.brand ;
--   - admin.html doit afficher/éditer la marque via un select sur brands,
--     plus jamais via le champ texte libre "Marque".
-- Tant que ces deux points ne sont pas vérifiés en production, product.brand
-- reste une donnée de secours sans danger (colonne nullable, jamais lue par
-- une contrainte) — la garder coûte un champ inutilisé, la supprimer trop tôt
-- casserait silencieusement tout code qui s'appuierait encore dessus.
-- ============================================================================
