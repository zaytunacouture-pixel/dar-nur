-- Socle minimal reproduisant, dans PGlite, ce que les migrations réelles
-- supposent déjà présent en production : rôles anon/authenticated, auth.uid(),
-- public.admins + public.is_admin() (copie de admin_rls.sql), set_updated_at(),
-- products / product_variants / categories / brands / offers (colonnes réelles
-- utilisées par le synchroniseur et par admin.html), politiques de lecture
-- publique des produits actifs. Les migrations testées ensuite sont les VRAIS
-- fichiers du dépôt : product_sources.sql puis sync_supplier.sql.

create role anon nologin;
create role authenticated nologin;

create schema if not exists auth;
-- auth.uid() de Supabase lit le JWT ; ici, un réglage de session simule l'utilisateur courant.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists public.admins (
  user_id    uuid primary key,
  email      text,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.categories (
  id text primary key, label text not null, filter_label text not null,
  sort_order int not null default 0, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.brands (
  id text primary key, name text not null, image text, sort_order int not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category_id text not null references public.categories(id) on update cascade,
  name text not null, tagline text, description text[] not null default '{}', benefits text[] not null default '{}', benefits_label text,
  composition text, provenance text, usage_advice text, precautions text[] not null default '{}', weight text, volume text,
  price_value numeric(10,2), variant_axes text[] not null default '{}', images text[] not null default '{}', accordions jsonb not null default '[]',
  active boolean not null default true, featured boolean not null default false, sort_order int not null default 0,
  coming_soon boolean not null default false, brand text, brand_slug text references public.brands(id),
  gift_idea boolean not null default false, gift_for_him boolean not null default false, gift_for_her boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text, options jsonb not null default '{}', price numeric(10,2), images text[] not null default '{}', sku text,
  active boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(), type text not null, title text not null, description text, image text,
  normal_price numeric(10,2), promo_price numeric(10,2), badge text, starts_at timestamptz, ends_at timestamptz,
  active boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.offer_products (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.offers(id) on delete cascade,
  product_slug text not null, sort_order int not null default 0
);

create trigger trg_products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger trg_variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
grant select on public.categories, public.products, public.product_variants, public.brands to anon, authenticated;
create policy "public_read_active_categories" on public.categories for select to anon, authenticated using (active = true);
create policy "public_read_active_products" on public.products for select to anon, authenticated using (active = true);
create policy "public_read_active_variants" on public.product_variants for select to anon, authenticated using (active = true);
grant select, insert, update, delete on public.products, public.product_variants, public.categories, public.brands to authenticated;
create policy "admin_all_products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_variants" on public.product_variants for all to authenticated using (public.is_admin()) with check (public.is_admin());
alter table public.offers enable row level security;
alter table public.offer_products enable row level security;
grant select on public.offers, public.offer_products to anon, authenticated;
grant insert, update, delete on public.offers, public.offer_products, public.brands to authenticated;
create policy "public_read_active_offers" on public.offers for select to anon, authenticated using (active = true);
create policy "public_read_offer_products" on public.offer_products for select to anon, authenticated using (true);
create policy "admin_all_offers" on public.offers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_offer_products" on public.offer_products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_brands" on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
