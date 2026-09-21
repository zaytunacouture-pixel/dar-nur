-- ============================================================================
-- Synchroniseur fournisseur V1 — infrastructure de données.
--
-- Trois natures de données, volontairement séparées :
--   A. Faits FOURNISSEUR (observés, écrits par le synchroniseur) :
--        product_sources (existante, +4 colonnes) et product_source_observations
--        (historique, une ligne par changement observé, jamais modifiée).
--   B. Faits DAR NŪR (déclarés par un humain, jamais écrits par le synchroniseur) :
--        product_supply (stock_mode, base_price) et
--        product_sources.purchase_price (+ date + origine).
--   C. Propositions du synchroniseur (calculs horodatés, jamais des faits) :
--        sync_proposals — de la détection à la décision humaine et à
--        l'application, une seule ligne garde toute la trace.
--
-- Ce que le synchroniseur ne fait JAMAIS, par construction (voir
-- scripts/sync-supplier.mjs) : écrire products.active, products.coming_soon,
-- ni aucun prix public sans une proposition explicitement acceptée.
--
-- Le prix public du fournisseur n'est jamais assimilé au prix d'achat réel :
-- purchase_price NULL = « prix d'achat à renseigner », rentabilité inconnue.
--
-- CONFIDENTIALITÉ : aucune de ces tables n'est lisible par le rôle `anon`.
-- Seul un administrateur (public.is_admin()) peut les lire ou les écrire.
--
-- À exécuter une seule fois dans Supabase > SQL Editor, avec le compte
-- propriétaire. Idempotent. Rollback : sync_supplier_rollback.sql.
-- Pré-requis : admin_rls.sql et product_sources.sql déjà exécutés.
-- ============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_proc where oid = 'public.is_admin()'::regprocedure) then
    raise exception 'Abandon : public.is_admin() est introuvable — exécuter supabase/sql/admin_rls.sql avant cette migration.';
  end if;
  if to_regclass('public.product_sources') is null then
    raise exception 'Abandon : la table product_sources est introuvable — exécuter supabase/sql/product_sources.sql avant cette migration.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1) product_sources : état de la dernière tentative + qualification du prix
--    d'achat réel. Un prix d'achat sans date ni origine ne vaut rien : la
--    contrainte l'impose.
-- ----------------------------------------------------------------------------
alter table public.product_sources
  add column if not exists last_attempt_at       timestamptz,   -- dernière tentative (réussie ou non)
  add column if not exists last_error            text,          -- NULL = dernière tentative réussie
  add column if not exists purchase_price_at     timestamptz,   -- date du prix d'achat réel
  add column if not exists purchase_price_origin text;          -- 'facture' | 'tarif_pro' | 'autre'

comment on column public.product_sources.last_synced_at is
  'Dernière OBSERVATION RÉUSSIE du fournisseur. Ne recule jamais ; comparer à last_attempt_at pour détecter un fournisseur injoignable.';
comment on column public.product_sources.last_error is
  'Erreur de la dernière tentative, NULL si elle a réussi.';
comment on column public.product_sources.purchase_price_origin is
  'Origine du prix d''achat réel : facture, tarif_pro ou autre. Obligatoire dès que purchase_price est renseigné.';

alter table public.product_sources
  drop constraint if exists chk_product_sources_purchase_price_qualified;
alter table public.product_sources
  add constraint chk_product_sources_purchase_price_qualified
  check (
    purchase_price is null
    or (purchase_price > 0 and purchase_price_at is not null and purchase_price_origin is not null)
  );

alter table public.product_sources
  drop constraint if exists chk_product_sources_purchase_price_origin;
alter table public.product_sources
  add constraint chk_product_sources_purchase_price_origin
  check (purchase_price_origin is null or purchase_price_origin in ('facture', 'tarif_pro', 'autre'));

-- ----------------------------------------------------------------------------
-- 2) product_source_observations : historique des faits fournisseur.
--    Une ligne à la première observation d'une source, puis à chaque
--    changement de l'un des cinq champs observés. Table append-only : ni
--    mise à jour ni suppression, pour personne (trigger), afin que « depuis
--    quand cette promo dure-t-elle ? » ait toujours une réponse fiable.
-- ----------------------------------------------------------------------------
create table if not exists public.product_source_observations (
  id            bigint generated always as identity primary key,
  source_id     uuid not null references public.product_sources(id) on delete cascade,
  observed_at   timestamptz not null default now(),
  run_id        text,                                   -- identifiant de l'exécution du synchroniseur
  regular_price numeric(10,2),                          -- prix public fournisseur hors promotion
  price         numeric(10,2),                          -- prix public fournisseur effectif (promo incluse)
  on_sale       boolean,
  in_stock      boolean,
  stock_qty     int
);

comment on table public.product_source_observations is
  'Historique append-only des prix/disponibilités observés chez le fournisseur. Une ligne par changement.';

create index if not exists idx_pso_source_time
  on public.product_source_observations (source_id, observed_at desc);

create or replace function public.product_source_observations_readonly()
returns trigger language plpgsql as $$
begin
  raise exception 'product_source_observations est append-only : % refusé', tg_op;
end;
$$;

drop trigger if exists trg_pso_readonly on public.product_source_observations;
create trigger trg_pso_readonly
  before update or delete on public.product_source_observations
  for each row execute function public.product_source_observations_readonly();

-- ----------------------------------------------------------------------------
-- 3) product_supply : faits Dar Nūr, déclarés à la main.
--    stock_mode NULL = « à déclarer » (jamais deviné). base_price = prix Dar
--    Nūr hors promotion, mémorisé ; toute baisse promotionnelle acceptée est
--    une dérogation temporaire à ce prix.
-- ----------------------------------------------------------------------------
create table if not exists public.product_supply (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  variant_id  uuid references public.product_variants(id) on delete cascade,
  stock_mode  text,                                     -- 'own_stock' | 'on_demand' | NULL = à déclarer
  base_price  numeric(10,2),                            -- prix Dar Nūr hors promotion
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_product_supply_stock_mode check (stock_mode is null or stock_mode in ('own_stock', 'on_demand')),
  constraint chk_product_supply_base_price check (base_price is null or base_price > 0)
);

comment on table public.product_supply is
  'Faits Dar Nūr par produit/variante : stock propre ou achat à la commande, prix de base hors promo. Jamais écrit par le synchroniseur (sauf base_price sur décision acceptée).';

create unique index if not exists uq_product_supply_product_variant
  on public.product_supply (product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists trg_product_supply_updated_at on public.product_supply;
create trigger trg_product_supply_updated_at
  before update on public.product_supply
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) sync_proposals : propositions du synchroniseur et trace des décisions.
--    `target` dit ce que --apply aurait le droit d'écrire si la proposition
--    est acceptée : rien ('none' : action manuelle dans l'administration),
--    products.price_value, product_variants.price ou product_supply.base_price.
--    Aucune autre cible n'existe : publier/dépublier n'est pas une cible.
--    `fingerprint` résume les faits au moment de la proposition ; s'ils
--    changent avant l'application, la proposition devient 'obsolete'.
-- ----------------------------------------------------------------------------
create table if not exists public.sync_proposals (
  id               uuid primary key default gen_random_uuid(),
  run_id           text not null,
  product_id       uuid not null references public.products(id) on delete cascade,
  variant_id       uuid references public.product_variants(id) on delete cascade,
  source_id        uuid references public.product_sources(id) on delete set null,
  kind             text not null,
  level            text not null,
  target           text not null default 'none',
  evidence         jsonb not null default '{}',         -- faits au moment T (prix DN, fournisseur, stock, achat…)
  suggested_action text not null,
  suggested_value  numeric(10,2),
  fingerprint      text not null,
  status           text not null default 'pending',
  obsolete_reason  text,
  created_at       timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       uuid,                                -- auth.uid() de l'administrateur
  decided_value    numeric(10,2),                       -- valeur choisie (peut différer de la suggestion)
  decision_note    text,
  applied_at       timestamptz,
  applied_payload  jsonb,                               -- avant/après effectifs
  constraint chk_sync_proposals_level    check (level in ('info', 'attention', 'bloquant')),
  constraint chk_sync_proposals_target   check (target in ('none', 'product_price', 'variant_price', 'base_price')),
  constraint chk_sync_proposals_status   check (status in ('pending', 'accepted', 'rejected', 'obsolete')),
  constraint chk_sync_proposals_decided  check (status not in ('accepted', 'rejected') or decided_at is not null),
  constraint chk_sync_proposals_applied  check (applied_at is null or status = 'accepted'),
  constraint chk_sync_proposals_value    check (decided_value is null or decided_value > 0)
);

comment on table public.sync_proposals is
  'Propositions du synchroniseur fournisseur et trace des décisions humaines. Rien n''est supprimé : une proposition refusée ou obsolète reste lisible.';

create index if not exists idx_sync_proposals_status_level on public.sync_proposals (status, level);
create index if not exists idx_sync_proposals_product      on public.sync_proposals (product_id);

-- Une seule proposition en attente par (source ou produit, type de détection) :
-- le dédoublonnage est garanti par la base, pas seulement par le script.
create unique index if not exists uq_sync_proposals_pending
  on public.sync_proposals (coalesce(source_id, product_id), kind)
  where status = 'pending';

-- ----------------------------------------------------------------------------
-- 5) RLS : aucune lecture publique, administrateur seulement.
-- ----------------------------------------------------------------------------
alter table public.product_source_observations enable row level security;
alter table public.product_supply              enable row level security;
alter table public.sync_proposals              enable row level security;

revoke all on public.product_source_observations from anon, authenticated;
revoke all on public.product_supply              from anon, authenticated;
revoke all on public.sync_proposals              from anon, authenticated;

grant select, insert                 on public.product_source_observations to authenticated; -- append-only
grant select, insert, update, delete on public.product_supply              to authenticated;
grant select, insert, update         on public.sync_proposals              to authenticated; -- jamais de suppression

drop policy if exists "admin_only_product_source_observations" on public.product_source_observations;
create policy "admin_only_product_source_observations"
  on public.product_source_observations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_only_product_supply" on public.product_supply;
create policy "admin_only_product_supply"
  on public.product_supply for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_only_sync_proposals" on public.sync_proposals;
create policy "admin_only_sync_proposals"
  on public.sync_proposals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Garde-fou : aucune de ces tables ne doit avoir de politique ouverte à anon.
do $$
declare
  open_count int;
begin
  select count(*) into open_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('product_source_observations', 'product_supply', 'sync_proposals', 'product_sources')
    and 'anon' = any(roles);
  if open_count > 0 then
    raise exception 'Abandon : une politique de table privée est ouverte au rôle anon.';
  end if;
end $$;

commit;
