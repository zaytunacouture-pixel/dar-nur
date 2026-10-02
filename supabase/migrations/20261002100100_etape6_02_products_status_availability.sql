-- ============================================================================
-- Refonte — étape 6 · 02 · Produits : statut éditorial ≠ disponibilité commerciale
--
-- Deux notions aujourd'hui confondues dans active / coming_soon sont séparées :
--
--   status        visibilité ÉDITORIALE   draft | published | archived
--   availability  disponibilité COMMERCIALE available | on_demand | coming_soon | out_of_stock
--                 (NULL = à arbitrer : donnée historique ambiguë, jamais devinée)
--
-- Colonnes ajoutées (toutes additives) :
--   status, availability, replaced_by_product_id, net_quantity, net_unit,
--   seo_title, seo_description.
-- Rien n'est supprimé ni renommé : active, coming_soon, category_id, weight,
-- volume restent la source de l'ancien site, de l'admin, des générateurs,
-- du panier, de check_promo_code, des imports et du synchroniseur.
--
-- REMPLISSAGE (règles vérifiées sur les données réelles le 2026-10-02) :
--   status       : active = true → published (245) ; active = false → draft (6).
--                  Aucun produit n'est mis en archived : aucune donnée ne le permet.
--   availability : coming_soon = false → available (229).
--                  coming_soon = true  → NULL (22 : 16 huiles, 4 Khamrah,
--                  mg-mangue, dn-lecode-la-cavale) — cas « à arbitrer » de
--                  l'étape 2, NON convertis.
--   net_quantity / net_unit : uniquement quand weight OU volume (pas les deux)
--                  contient UN nombre ET une unité explicite, et que le produit
--                  n'a pas de variantes de format/contenance. Le reste reste NULL
--                  (« 200 », « 100 », « 50 g, 200 g, 300 g », miel-printemps
--                  200g + 200ml…) et figure au rapport d'étape.
--   Le remplissage s'exécute triggers de régénération et updated_at DÉSACTIVÉS
--   le temps de l'UPDATE : sans cela, 251 + 44 appels GitHub repository_dispatch
--   partiraient et updated_at (date de dernière modification réelle) serait
--   écrasé sur tout le catalogue. L'ordre physique des lignes est ensuite restauré
--   (CLUSTER) : rien de ce que lisent les générateurs ne change.
--   Historique : la version appliquée en production le 2026-10-02 ne restaurait pas
--   encore cet ordre ; il l'a été par supabase/maintenance/20261002_etape6_restaurer_ordre_products.sql.
--   État final identique.
--
-- TRIGGER DE TRANSITION trg_products_legacy_flags (BEFORE, sur la ligne elle-même,
-- aucune requête supplémentaire donc aucune boucle possible) :
--   Règle unique : « le champ qui change l'emporte, l'autre est recalculé ».
--     active change seul        → status = published si active, sinon draft
--     status change seul        → active = (status = 'published')
--     coming_soon change seul   → availability = coming_soon si vrai, sinon available
--     availability change seule → coming_soon = availability ∈ {coming_soon, out_of_stock}
--                                 (availability remise à NULL : coming_soon inchangé)
--     les deux changent         → acceptés s'ils concordent, sinon erreur explicite
--     INSERT sans status / availability (admin actuel, import fournisseur) → dérivés
--     de active / coming_soon ; INSERT avec status / availability → ils l'emportent.
--   Un champ que personne ne modifie n'est jamais recalculé : la valeur NULL d'un
--   produit à arbitrer survit à toutes les éditions de l'admin actuel (qui renvoie
--   coming_soon inchangé) jusqu'à ce qu'un humain coche ou décoche « Bientôt disponible ».
--   Deux contraintes CHECK verrouillent la cohérence pour tout écrivain.
--
-- Idempotente. Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.products') is null then
    raise exception 'Abandon : table products introuvable.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1) Colonnes (facultatives : aucun écrivain actuel n'a à les connaître)
-- ----------------------------------------------------------------------------
alter table public.products
  add column if not exists status                 text,
  add column if not exists availability           text,
  add column if not exists replaced_by_product_id uuid references public.products(id) on delete set null,
  add column if not exists net_quantity           numeric,
  add column if not exists net_unit               text,
  add column if not exists seo_title              text,
  add column if not exists seo_description        text;

comment on column public.products.status is
  'Visibilité éditoriale : draft | published | archived. Synchronisé avec active (trg_products_legacy_flags) tant que l''ancien site vit.';
comment on column public.products.availability is
  'Disponibilité commerciale : available | on_demand | coming_soon | out_of_stock. NULL = à arbitrer (coming_soon historique ambigu). Synchronisé avec coming_soon.';
comment on column public.products.replaced_by_product_id is
  'Produit survivant d''une fusion ou d''un doublon (redirections, panier, imports). NULL tant qu''aucune fusion n''est validée.';
comment on column public.products.net_quantity is
  'Quantité nette d''un produit SANS variantes de contenance (50, 100, 60). Rempli seulement quand weight/volume est sans ambiguïté.';

-- ----------------------------------------------------------------------------
-- 2) Remplissage — triggers de régénération et updated_at suspendus
-- ----------------------------------------------------------------------------
-- Ordre physique des lignes AVANT remplissage. Un UPDATE réécrit chaque ligne ailleurs
-- dans la table ; or l'ancien site trie par sort_order seul, et 48 produits partagent
-- sort_order = 0 : leur ordre d'affichage dépend de l'ordre physique. Il est restauré
-- à l'identique en fin de remplissage (CLUSTER, voir plus bas).
create temp table _etape6_products_order on commit drop as
  select id, row_number() over (order by ctid) as pos from public.products;

alter table public.products
  disable trigger trg_products_updated_at,
  disable trigger trg_notify_github_regenerate_product_pages,
  disable trigger trg_notify_github_regenerate_parfums_upd;

update public.products
   set status = case when active then 'published' else 'draft' end
 where status is null;

update public.products
   set availability = 'available'
 where availability is null
   and coming_soon = false;
-- coming_soon = true : availability laissée NULL (à arbitrer).

with parsed as (
  select p.id,
         case
           when p.weight is not null and p.volume is not null then null   -- double contenance : ambigu
           when p.weight ~* '^\s*\d+([.,]\d+)?\s*(g|kg)\s*$'
             then substring(p.weight from '(?i)^\s*(\d+(?:[.,]\d+)?)')
           when p.volume ~* '^\s*\d+([.,]\d+)?\s*(ml|l)\s*$'
             then substring(p.volume from '(?i)^\s*(\d+(?:[.,]\d+)?)')
           when p.volume ~* '^\s*\d+\s*g[ée]lules?\s*$'
             then substring(p.volume from '^\s*(\d+)')
         end as qty,
         case
           when p.weight is not null and p.volume is not null then null
           when p.weight ~* '^\s*\d+([.,]\d+)?\s*(g|kg)\s*$'      then lower(substring(p.weight from '(?i)(kg|g)\s*$'))
           when p.volume ~* '^\s*\d+([.,]\d+)?\s*(ml|l)\s*$'      then lower(substring(p.volume from '(?i)(ml|l)\s*$'))
           when p.volume ~* '^\s*\d+\s*g[ée]lules?\s*$'           then 'capsule'
         end as unit
    from public.products p
   where p.net_quantity is null
     and not (p.variant_axes && array['format', 'contenance'])
)
update public.products p
   set net_quantity = replace(parsed.qty, ',', '.')::numeric,
       net_unit     = parsed.unit
  from parsed
 where parsed.id = p.id
   and parsed.qty is not null
   and parsed.unit is not null;

alter table public.products
  enable trigger trg_products_updated_at,
  enable trigger trg_notify_github_regenerate_product_pages,
  enable trigger trg_notify_github_regenerate_parfums_upd;

-- Restauration de l'ordre physique d'avant le remplissage (ex-aequo de sort_order
-- affichés dans le même ordre qu'avant). CLUSTER ne modifie aucune valeur et ne
-- déclenche aucun trigger. Sur un rejeu, la table est réécrite dans l'ordre où elle est déjà.
do $$
declare
  v_ids text;
begin
  if exists (select 1 from _etape6_products_order) then
    select string_agg(quote_literal(id::text), ',' order by pos) into v_ids from _etape6_products_order;
    -- Liste portée par une fonction (corps non limité en taille) : une expression d'index
    -- de 251 UUID dépasse la taille maximale d'une ligne du catalogue système.
    execute format('create function public._etape6_products_order_pos(uuid) returns int language sql immutable as %L',
                   'select array_position(array[' || v_ids || ']::uuid[], $1)');
    create index _etape6_products_order_idx on public.products ((public._etape6_products_order_pos(id)));
    cluster public.products using _etape6_products_order_idx;
    drop index public._etape6_products_order_idx;
    drop function public._etape6_products_order_pos(uuid);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Contraintes (après remplissage)
-- ----------------------------------------------------------------------------
alter table public.products alter column status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_products_status' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint chk_products_status
      check (status in ('draft', 'published', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_products_availability' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint chk_products_availability
      check (availability is null or availability in ('available', 'on_demand', 'coming_soon', 'out_of_stock'));
  end if;
  -- Cohérence avec l'ancien modèle, pour tout écrivain (trigger contourné compris).
  if not exists (select 1 from pg_constraint where conname = 'chk_products_status_matches_active' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint chk_products_status_matches_active
      check (active = (status = 'published'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_products_availability_matches_coming_soon' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint chk_products_availability_matches_coming_soon
      check (availability is null or coming_soon = (availability in ('coming_soon', 'out_of_stock')));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_products_net_quantity' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint chk_products_net_quantity
      check ((net_quantity is null) = (net_unit is null) and (net_quantity is null or net_quantity > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_products_net_unit' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint chk_products_net_unit
      check (net_unit is null or net_unit in ('g', 'kg', 'ml', 'l', 'capsule', 'piece'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_products_not_replaced_by_self' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint chk_products_not_replaced_by_self
      check (replaced_by_product_id is null or replaced_by_product_id <> id);
  end if;
end $$;

create index if not exists idx_products_status on public.products (status);
create index if not exists idx_products_replaced_by on public.products (replaced_by_product_id) where replaced_by_product_id is not null;

-- ----------------------------------------------------------------------------
-- 4) Trigger de transition ancien ↔ nouveau modèle (voir l'en-tête)
-- ----------------------------------------------------------------------------
create or replace function public.products_sync_legacy_flags()
returns trigger language plpgsql as $$
declare
  v_active_changed boolean;
  v_status_changed boolean;
  v_cs_changed     boolean;
  v_avail_changed  boolean;
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := case when new.active then 'published' else 'draft' end;
    else
      new.active := (new.status = 'published');
    end if;
    if new.availability is null then
      new.availability := case when new.coming_soon then 'coming_soon' else 'available' end;
    else
      new.coming_soon := new.availability in ('coming_soon', 'out_of_stock');
    end if;
    return new;
  end if;

  -- UPDATE
  v_active_changed := new.active is distinct from old.active;
  v_status_changed := new.status is distinct from old.status;
  if v_active_changed and not v_status_changed then
    new.status := case when new.active then 'published' else 'draft' end;
  elsif v_status_changed and not v_active_changed then
    new.active := (new.status = 'published');
  elsif v_active_changed and v_status_changed and new.active <> (new.status = 'published') then
    raise exception 'products %: active (%) et status (%) modifiés ensemble mais incohérents.', new.slug, new.active, new.status;
  end if;

  v_cs_changed    := new.coming_soon is distinct from old.coming_soon;
  v_avail_changed := new.availability is distinct from old.availability;
  if v_cs_changed and not v_avail_changed then
    new.availability := case when new.coming_soon then 'coming_soon' else 'available' end;
  elsif v_avail_changed and not v_cs_changed then
    if new.availability is not null then
      new.coming_soon := new.availability in ('coming_soon', 'out_of_stock');
    end if;
  elsif v_cs_changed and v_avail_changed and new.availability is not null
        and new.coming_soon <> (new.availability in ('coming_soon', 'out_of_stock')) then
    raise exception 'products %: coming_soon (%) et availability (%) modifiés ensemble mais incohérents.', new.slug, new.coming_soon, new.availability;
  end if;

  return new;
end;
$$;

comment on function public.products_sync_legacy_flags() is
  'Transition étape 6 : active ↔ status, coming_soon ↔ availability. Le champ modifié l''emporte ; à retirer avec active/coming_soon.';

drop trigger if exists trg_products_legacy_flags on public.products;
create trigger trg_products_legacy_flags
  before insert or update of active, status, coming_soon, availability on public.products
  for each row execute function public.products_sync_legacy_flags();

notify pgrst, 'reload schema';

commit;
