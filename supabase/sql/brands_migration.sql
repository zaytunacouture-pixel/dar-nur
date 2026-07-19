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
--
-- v2 : la v1 supposait que product.brand_slug ne contenait déjà que des
-- slugs connus. En pratique au moins une ligne hors category_id='parfums'
-- portait une valeur résiduelle ("Dar Nūr") qui a fait échouer la contrainte
-- FK. Cette version nettoie automatiquement ce genre de donnée et auto-crée
-- toute marque encore manquante avant de poser la contrainte — aucune
-- intervention manuelle sur les données n'est nécessaire.
-- ============================================================================

begin;

-- 0) Extension nécessaire pour normaliser les accents lors de l'auto-création
--    de marques (étape 4) — sans effet si déjà activée.
create extension if not exists unaccent with schema extensions;

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

-- 3) Nettoyage automatique : brand/brand_slug n'ont de sens que pour
--    category_id='parfums' (voir schema.sql et docs/ARCHITECTURE_DAR_NUR.md).
--    Toute valeur trouvée sur un produit d'une autre catégorie est une
--    donnée résiduelle jamais lue par aucun code (generate-parfums.mjs ne
--    regroupe que category_id='parfums') — réinitialisée automatiquement,
--    sans perte d'information réelle.
update public.products
set brand = null, brand_slug = null
where category_id <> 'parfums'
  and (brand is not null or brand_slug is not null);

-- 4) Auto-guérison : pour tout brand_slug de category_id='parfums' qui ne
--    correspond encore à aucune marque connue (marque jamais migrée),
--    crée automatiquement une marque de secours au lieu d'abandonner.
--    Slug dérivé du texte brut (minuscules, accents supprimés, tout
--    caractère non alphanumérique remplacé par un tiret). Cette marque
--    apparaîtra dans admin.html > Marques et pourra y être renommée/fusionnée
--    si besoin — aucune modification SQL manuelle requise pour que le site
--    reste cohérent dès maintenant.
insert into public.brands (id, name, sort_order)
select derived.id, derived.name,
       (select coalesce(max(sort_order), -1) from public.brands) + 1
from (
  select distinct
    nullif(trim(both '-' from regexp_replace(lower(extensions.unaccent(p.brand_slug)), '[^a-z0-9]+', '-', 'g')), '') as id,
    coalesce(p.brand, p.brand_slug) as name
  from public.products p
  where p.category_id = 'parfums'
    and p.brand_slug is not null
    and p.brand_slug not in (select id from public.brands)
) derived
where derived.id is not null
on conflict (id) do nothing;

-- 5) Garde-fou final : après nettoyage + auto-création, plus aucun
--    brand_slug ne doit être orphelin. S'il en reste (cas limite : le slug
--    dérivé à l'étape 4 était vide, ex. valeur uniquement ponctuation),
--    on abandonne plutôt que de poser une contrainte qui échouerait.
do $$
declare
  orphan_count int;
  orphan_sample text;
begin
  select count(*), string_agg(distinct p.brand_slug, ', ')
    into orphan_count, orphan_sample
  from public.products p
  where p.category_id = 'parfums'
    and p.brand_slug is not null
    and p.brand_slug not in (select id from public.brands);

  if orphan_count > 0 then
    raise exception 'Abandon : % produit(s) parfums avec un brand_slug encore orphelin après auto-création (ex: %) — valeur vide ou invalide une fois normalisée, à corriger dans admin.html.', orphan_count, orphan_sample;
  end if;
end $$;

-- 6) Contrainte FK products.brand_slug -> brands.id ---------------------------
--    NULL toujours autorisé (tout produit hors category_id='parfums', déjà
--    nettoyé à l'étape 3).
alter table public.products
  drop constraint if exists fk_products_brand_slug;

alter table public.products
  add constraint fk_products_brand_slug
  foreign key (brand_slug) references public.brands(id)
  on update cascade;

-- 7) RLS (même logique que categories : lecture publique = actives seulement,
--    admin connecté = tout) --------------------------------------------------
alter table public.brands enable row level security;

drop policy if exists "public_read_active_brands" on public.brands;
create policy "public_read_active_brands"
  on public.brands for select to anon, authenticated using (active = true);

drop policy if exists "admin_all_brands" on public.brands;
create policy "admin_all_brands"
  on public.brands for all to authenticated using (true) with check (true);

commit;

-- Vérification immédiate : liste toutes les marques après migration
-- (attendu : lecode, khair, khamraha, + toute marque auto-créée à l'étape 4).
select id, name, sort_order, active from public.brands order by sort_order;

-- ============================================================================
-- Rollback (si besoin, à exécuter en une fois) :
--   alter table public.products drop constraint if exists fk_products_brand_slug;
--   drop table if exists public.brands;
-- (products.brand / products.brand_slug ne sont pas touchés par ce rollback —
-- sauf les valeurs déjà nettoyées par l'étape 3, qui ne reviennent pas)
--
-- Quand supprimer products.brand (texte libre, devenu redondant) ?
-- Uniquement après avoir confirmé que plus AUCUN code ne le lit :
--   - scripts/generate-parfums.mjs doit lire le nom depuis brands.name (déjà
--     fait), pas depuis products.brand ;
--   - admin.html doit afficher/éditer la marque via un select sur brands,
--     plus jamais via le champ texte libre "Marque" (déjà fait).
-- Tant que ces deux points ne sont pas vérifiés en production, product.brand
-- reste une donnée de secours sans danger (colonne nullable, jamais lue par
-- une contrainte) — la garder coûte un champ inutilisé, la supprimer trop tôt
-- casserait silencieusement tout code qui s'appuierait encore dessus.
-- ============================================================================
