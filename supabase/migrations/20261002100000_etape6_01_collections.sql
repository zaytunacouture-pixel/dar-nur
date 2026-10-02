-- ============================================================================
-- Refonte — étape 6 · 01 · Collections hiérarchiques (structure seule)
--
-- Crée, À CÔTÉ de `categories` (qui reste lue par l'ancien site), la nouvelle
-- classification :
--   collections                  arbre univers → collection → sous-collection
--                                (→ filtre / regroupement interne si besoin)
--   product_collections          appartenance plusieurs-à-plusieurs, AU PLUS une
--                                collection principale par produit
--   legacy_category_collections  correspondance catégorie historique → collection
--                                par défaut (sert au trigger de transition, 08)
--
-- `path` est l'URL publique, stockée explicitement : elle ne se déduit PAS de la
-- hiérarchie. Changer le parent d'une collection ne change donc jamais son URL.
-- Le canonical d'un produit reste /{slug}/ quelle que soit sa collection.
--
-- Additive : aucune table existante n'est modifiée. Idempotente.
-- Remplissage : 20261002100700_etape6_08_collections_backfill.sql.
-- Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_proc where oid = 'public.is_admin()'::regprocedure) then
    raise exception 'Abandon : public.is_admin() est introuvable (supabase/sql/admin_rls.sql).';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.set_updated_at()'::regprocedure) then
    raise exception 'Abandon : public.set_updated_at() est introuvable.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1) collections
-- ----------------------------------------------------------------------------
create table if not exists public.collections (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,             -- clé stable (admin, imports, filtres) ; jamais affichée
  path            text,                      -- URL publique complète, ex. /miels-gourmands/ ; NULL pour un filtre
  parent_id       uuid references public.collections(id) on delete restrict,
  type            text not null,             -- universe | collection | subcollection | filter | group | transverse
  status          text not null default 'draft',  -- draft | published | archived (même vocabulaire que products.status)
  name            text not null,             -- nom affiché (cartes, fil d'Ariane)
  nav_label       text,                      -- libellé court de menu, si différent du nom
  h1              text,                      -- titre de page, si différent du nom
  description     text,                      -- texte d'introduction (éditorial)
  seo_title       text,
  seo_description text,
  image_url       text,                      -- visuel de tête / Open Graph
  sort_order      int  not null default 0,   -- ordre entre sœurs
  is_indexable    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint collections_slug_key unique (slug),
  constraint chk_collections_slug   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint chk_collections_path   check (path is null or path ~ '^/([a-z0-9]+(-[a-z0-9]+)*/)+$'),
  constraint chk_collections_type   check (type in ('universe', 'collection', 'subcollection', 'filter', 'group', 'transverse')),
  constraint chk_collections_status check (status in ('draft', 'published', 'archived')),
  -- Une page a une URL ; un filtre ou un regroupement interne n'en a pas et n'est jamais indexé.
  constraint chk_collections_page_has_path check (type in ('filter', 'group') or path is not null),
  constraint chk_collections_filter_noindex check (type not in ('filter', 'group') or (path is null and is_indexable = false)),
  -- Seuls les univers et les transverses sont à la racine.
  constraint chk_collections_root check ((type in ('universe', 'transverse')) = (parent_id is null)),
  constraint chk_collections_not_own_parent check (parent_id is null or parent_id <> id)
);

create unique index if not exists uq_collections_path on public.collections (path) where path is not null;
create index if not exists idx_collections_parent_sort on public.collections (parent_id, sort_order);

comment on table public.collections is
  'Classification de la refonte (étape 6), à côté de categories. path = URL publique stockée, indépendante de parent_id.';
comment on column public.collections.path is
  'URL publique (/miels/). Découplée de la hiérarchie : déplacer une collection ne change pas son URL.';

-- Hiérarchie : ni cycle, ni plus de 4 niveaux (univers > collection > sous-collection > filtre).
create or replace function public.collections_check_hierarchy()
returns trigger language plpgsql as $$
declare
  v_cursor uuid := new.parent_id;
  v_depth  int  := 1;
begin
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'collections : cycle détecté sur « % ».', new.slug;
    end if;
    v_depth := v_depth + 1;
    if v_depth > 4 then
      raise exception 'collections : « % » dépasse 4 niveaux.', new.slug;
    end if;
    select parent_id into v_cursor from public.collections where id = v_cursor;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_collections_hierarchy on public.collections;
create trigger trg_collections_hierarchy
  before insert or update of parent_id on public.collections
  for each row execute function public.collections_check_hierarchy();

drop trigger if exists trg_collections_updated_at on public.collections;
create trigger trg_collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) product_collections
-- ----------------------------------------------------------------------------
create table if not exists public.product_collections (
  product_id    uuid not null references public.products(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete restrict,
  role          text not null default 'secondary',   -- primary | secondary
  position      int,                                  -- ordre manuel dans la collection (NULL = tri par défaut)
  -- Origine de la ligne, pour que les triggers de transition ne touchent QUE ce
  -- qu'ils ont eux-mêmes posé (jamais une décision humaine) :
  --   legacy_category  : déduite de products.category_id, suit ses changements
  --   legacy_gift_idea : déduite de products.gift_idea, suit ses changements
  --   migration        : reclassement documenté (étapes 2 et 3), fixe
  --   admin            : saisie humaine (futur admin), jamais modifiée par un trigger
  source        text not null default 'admin',
  created_at    timestamptz not null default now(),

  primary key (product_id, collection_id),
  constraint chk_product_collections_role   check (role in ('primary', 'secondary')),
  constraint chk_product_collections_source check (source in ('legacy_category', 'legacy_gift_idea', 'migration', 'admin'))
);

-- Au plus UNE collection principale par produit (fil d'Ariane, maillage, classement).
create unique index if not exists uq_product_collections_primary
  on public.product_collections (product_id) where role = 'primary';
create index if not exists idx_product_collections_collection
  on public.product_collections (collection_id, role, position);

comment on table public.product_collections is
  'Appartenance produit ↔ collection. Une seule principale (index unique partiel). Le canonical produit reste /{slug}/.';

-- ----------------------------------------------------------------------------
-- 3) legacy_category_collections — correspondance de transition
-- ----------------------------------------------------------------------------
create table if not exists public.legacy_category_collections (
  category_id   text primary key references public.categories(id) on update cascade on delete cascade,
  collection_id uuid not null references public.collections(id) on delete restrict
);

comment on table public.legacy_category_collections is
  'Transition : collection principale par défaut d''un produit selon sa catégorie historique. À supprimer avec category_id.';

-- ----------------------------------------------------------------------------
-- 4) Droits et RLS — lecture publique de ce qui est publié, écriture admin
-- ----------------------------------------------------------------------------
revoke all on public.collections, public.product_collections, public.legacy_category_collections from anon, authenticated;
grant select on public.collections, public.product_collections, public.legacy_category_collections to anon, authenticated;
grant insert, update, delete on public.collections, public.product_collections, public.legacy_category_collections to authenticated;

alter table public.collections enable row level security;
alter table public.product_collections enable row level security;
alter table public.legacy_category_collections enable row level security;

drop policy if exists public_read_collections on public.collections;
create policy public_read_collections on public.collections
  for select to anon, authenticated using (status = 'published');
drop policy if exists admin_only_collections on public.collections;
create policy admin_only_collections on public.collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Une appartenance n'est publique que si le produit ET la collection le sont.
-- (La politique de products filtre déjà active = true pour anon.)
drop policy if exists public_read_product_collections on public.product_collections;
create policy public_read_product_collections on public.product_collections
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.active = true)
    and exists (select 1 from public.collections c where c.id = collection_id and c.status = 'published')
  );
drop policy if exists admin_only_product_collections on public.product_collections;
create policy admin_only_product_collections on public.product_collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_legacy_category_collections on public.legacy_category_collections;
create policy public_read_legacy_category_collections on public.legacy_category_collections
  for select to anon, authenticated using (true);
drop policy if exists admin_only_legacy_category_collections on public.legacy_category_collections;
create policy admin_only_legacy_category_collections on public.legacy_category_collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

commit;
