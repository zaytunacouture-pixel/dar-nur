-- ============================================================================
-- Refonte — étape 6 · 05 · Guides des tailles, informations Mode, fiche alimentaire
--
-- Structures VIDES : aucune mesure, matière ou dénomination n'existe de façon
-- fiable dans les données (les « compositions » Mode actuelles sont des formules
-- éditoriales — « Tissu léger sélectionné » — et non des matières). Rien n'est
-- inventé ; ces tables seront remplies à la main, données fournisseur ou
-- mesures réelles à l'appui.
--
--   size_guides           un guide (famille de produits ou produit), unité,
--                         instructions de mesure ; brouillon tant que non publié
--   size_guide_rows       une mesure d'une taille : taille commerciale,
--                         mesure (stature, poitrine, longueur…), valeur min/max
--   products.size_guide_id  guide associé à un produit (facultatif)
--   product_apparel_details matière, composition, opacité, épaisseur, coupe, entretien
--   product_food_details    produits alimentaires (miels et préparations, poudres,
--                         gélules) : type, dénomination, ingrédients, origine.
--                         La quantité nette vit dans products.net_quantity / net_unit.
--                         Aucune allégation : ce n'est pas un champ marketing.
--
-- Idempotente. Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Guides des tailles
-- ----------------------------------------------------------------------------
create table if not exists public.size_guides (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  collection_id          uuid references public.collections(id) on delete set null,  -- famille (ex. qamis)
  unit                   text not null default 'cm',
  measuring_instructions text,
  status                 text not null default 'draft',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint chk_size_guides_slug   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint chk_size_guides_unit   check (unit in ('cm', 'in', 'eu')),
  constraint chk_size_guides_status check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.size_guide_rows (
  id              uuid primary key default gen_random_uuid(),
  size_guide_id   uuid not null references public.size_guides(id) on delete cascade,
  size_label      text not null,                       -- taille commerciale : M, 2XL, 42
  option_value_id uuid references public.option_values(id) on delete set null,
  measure         text not null,                       -- stature | poitrine | longueur | manche | pointure_cm …
  value_min       numeric not null,
  value_max       numeric,
  sort_order      int not null default 0,
  constraint uq_size_guide_rows unique (size_guide_id, size_label, measure),
  constraint chk_size_guide_rows_measure check (measure ~ '^[a-z]+(_[a-z]+)*$'),
  constraint chk_size_guide_rows_values  check (value_min > 0 and (value_max is null or value_max >= value_min))
);

alter table public.products
  add column if not exists size_guide_id uuid references public.size_guides(id) on delete set null;

drop trigger if exists trg_size_guides_updated_at on public.size_guides;
create trigger trg_size_guides_updated_at
  before update on public.size_guides
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Informations Mode
-- ----------------------------------------------------------------------------
create table if not exists public.product_apparel_details (
  product_id        uuid primary key references public.products(id) on delete cascade,
  material          text,     -- matière principale (crêpe, jazz, médina…)
  composition       text,     -- composition textile réelle (ex. 100 % polyester)
  opacity           text,     -- opaque | semi_opaque | transparent
  thickness         text,     -- fine | medium | thick
  fit               text,     -- coupe / tombé
  care_instructions text,
  updated_at        timestamptz not null default now(),
  constraint chk_apparel_opacity   check (opacity is null or opacity in ('opaque', 'semi_opaque', 'transparent')),
  constraint chk_apparel_thickness check (thickness is null or thickness in ('fine', 'medium', 'thick'))
);

-- ----------------------------------------------------------------------------
-- 3) Fiche d'identité des produits alimentaires
-- ----------------------------------------------------------------------------
create table if not exists public.product_food_details (
  product_id  uuid primary key references public.products(id) on delete cascade,
  food_type   text,     -- honey | honey_preparation | powder | seeds | capsules | other
  legal_name  text,     -- dénomination de vente (ex. « Préparation à base de miel et de … »)
  ingredients text,     -- liste d'ingrédients, dans l'ordre réglementaire
  origin      text,     -- origine (pays, région)
  notes       text,     -- précisions de composition (pourcentages, etc.)
  updated_at  timestamptz not null default now(),
  constraint chk_food_type check (food_type is null or food_type in ('honey', 'honey_preparation', 'powder', 'seeds', 'capsules', 'other'))
);

drop trigger if exists trg_apparel_details_updated_at on public.product_apparel_details;
create trigger trg_apparel_details_updated_at
  before update on public.product_apparel_details
  for each row execute function public.set_updated_at();
drop trigger if exists trg_food_details_updated_at on public.product_food_details;
create trigger trg_food_details_updated_at
  before update on public.product_food_details
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Droits et RLS
-- ----------------------------------------------------------------------------
revoke all on public.size_guides, public.size_guide_rows, public.product_apparel_details, public.product_food_details from anon, authenticated;
grant select on public.size_guides, public.size_guide_rows, public.product_apparel_details, public.product_food_details to anon, authenticated;
grant insert, update, delete on public.size_guides, public.size_guide_rows, public.product_apparel_details, public.product_food_details to authenticated;

alter table public.size_guides enable row level security;
alter table public.size_guide_rows enable row level security;
alter table public.product_apparel_details enable row level security;
alter table public.product_food_details enable row level security;

drop policy if exists public_read_size_guides on public.size_guides;
create policy public_read_size_guides on public.size_guides
  for select to anon, authenticated using (status = 'published');
drop policy if exists admin_only_size_guides on public.size_guides;
create policy admin_only_size_guides on public.size_guides
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_size_guide_rows on public.size_guide_rows;
create policy public_read_size_guide_rows on public.size_guide_rows
  for select to anon, authenticated using (
    exists (select 1 from public.size_guides g where g.id = size_guide_id and g.status = 'published')
  );
drop policy if exists admin_only_size_guide_rows on public.size_guide_rows;
create policy admin_only_size_guide_rows on public.size_guide_rows
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_product_apparel_details on public.product_apparel_details;
create policy public_read_product_apparel_details on public.product_apparel_details
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.active = true)
  );
drop policy if exists admin_only_product_apparel_details on public.product_apparel_details;
create policy admin_only_product_apparel_details on public.product_apparel_details
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_product_food_details on public.product_food_details;
create policy public_read_product_food_details on public.product_food_details
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.active = true)
  );
drop policy if exists admin_only_product_food_details on public.product_food_details;
create policy admin_only_product_food_details on public.product_food_details
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

commit;
