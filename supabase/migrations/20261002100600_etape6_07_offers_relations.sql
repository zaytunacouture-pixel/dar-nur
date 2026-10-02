-- ============================================================================
-- Refonte — étape 6 · 07 · Offres : vraie référence produit ; relations produits
--
-- offer_products : product_slug (texte libre, sans clé étrangère) reste la
--   colonne lue et écrite par l'ancien site et l'admin. Ajouts :
--     product_id  FK products   — déduit de product_slug (trigger)
--     variant_id  FK variantes  — facultatif (un pack peut viser un format)
--     quantity    défaut 1
--   ON DELETE SET NULL (et non RESTRICT) : l'admin actuel peut supprimer un
--   produit présent dans une offre ; il le pouvait avant, il le peut toujours
--   (la ligne garde son slug, comme aujourd'hui).
--   REMPLISSAGE : par jointure exacte sur slug. La migration ABANDONNE si une
--   seule ligne ne se résout pas (vérifié le 2026-10-02 : 32 lignes, 0 orpheline).
--
-- TRIGGER DE TRANSITION (sens unique : ancien → nouveau) : à l'insertion ou au
--   changement de product_slug, product_id est recalculé depuis le slug. Un slug
--   inconnu donne product_id NULL sans bloquer l'admin (comportement actuel).
--
-- product_relations : produits « à associer » choisis à la main. Un seul type
--   aujourd'hui, complementary — « similaires » se calcule depuis la collection
--   principale et le remplacement vit dans products.replaced_by_product_id.
--   VIDE : aucune relation n'est inventée.
--
-- Idempotente. Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) offer_products
-- ----------------------------------------------------------------------------
alter table public.offer_products
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists quantity   int not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_offer_products_quantity' and conrelid = 'public.offer_products'::regclass) then
    alter table public.offer_products add constraint chk_offer_products_quantity check (quantity > 0);
  end if;
end $$;

create index if not exists idx_offer_products_product on public.offer_products (product_id);

comment on column public.offer_products.product_id is
  'Référence réelle du produit, déduite de product_slug par trigger tant que l''admin actuel écrit le slug.';

update public.offer_products op
   set product_id = p.id
  from public.products p
 where p.slug = op.product_slug
   and op.product_id is null;

do $$
declare
  v_orphans int;
begin
  select count(*) into v_orphans from public.offer_products where product_id is null;
  if v_orphans > 0 then
    raise exception 'Abandon : % ligne(s) offer_products sans produit correspondant (slug inconnu). Rien n''est appliqué.', v_orphans;
  end if;
end $$;

create or replace function public.offer_products_resolve_product()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.product_slug is distinct from old.product_slug then
    select p.id into new.product_id from public.products p where p.slug = new.product_slug;
  elsif new.product_id is not null and not exists (
    select 1 from public.products p where p.id = new.product_id and p.slug = new.product_slug
  ) then
    -- Tant que l'ancien site lit product_slug, les deux références doivent désigner le même produit.
    raise exception 'offer_products : product_id ne correspond pas au slug « % ».', new.product_slug;
  end if;
  if new.variant_id is not null and not exists (
    select 1 from public.product_variants v where v.id = new.variant_id and v.product_id = new.product_id
  ) then
    raise exception 'offer_products : la variante % n''appartient pas au produit %.', new.variant_id, new.product_slug;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_offer_products_resolve_product on public.offer_products;
create trigger trg_offer_products_resolve_product
  before insert or update of product_slug, product_id, variant_id on public.offer_products
  for each row execute function public.offer_products_resolve_product();

-- ----------------------------------------------------------------------------
-- 2) product_relations
-- ----------------------------------------------------------------------------
create table if not exists public.product_relations (
  product_id         uuid not null references public.products(id) on delete cascade,
  related_product_id uuid not null references public.products(id) on delete cascade,
  relation_type      text not null default 'complementary',
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now(),
  primary key (product_id, related_product_id, relation_type),
  constraint chk_product_relations_type check (relation_type in ('complementary')),
  constraint chk_product_relations_not_self check (product_id <> related_product_id)
);
create index if not exists idx_product_relations_related on public.product_relations (related_product_id);

revoke all on public.product_relations from anon, authenticated;
grant select on public.product_relations to anon, authenticated;
grant insert, update, delete on public.product_relations to authenticated;
alter table public.product_relations enable row level security;

drop policy if exists public_read_product_relations on public.product_relations;
create policy public_read_product_relations on public.product_relations
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.active = true)
    and exists (select 1 from public.products r where r.id = related_product_id and r.active = true)
  );
drop policy if exists admin_only_product_relations on public.product_relations;
create policy admin_only_product_relations on public.product_relations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

commit;
