-- =====================================================================
--  DAR NŪR — Schéma de base de données Supabase (catalogue complet)
--  Couvre TOUTES les catégories + un système de VARIANTES
--  (couleurs, tailles, formats, contenances, images par variante).
--
--  À exécuter une fois dans : Supabase → SQL Editor → New query → Run
-- =====================================================================

-- gen_random_uuid() est disponible nativement sur Supabase (pgcrypto).

-- ---------------------------------------------------------------------
-- 1) CATÉGORIES
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id           text primary key,            -- ex: "miels"
  label        text not null,               -- ex: "Miel artisanal" (badge fiche)
  filter_label text not null,               -- ex: "Miels" (filtre boutique)
  sort_order   int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) PRODUITS (le "modèle" — ex: "Abaya Roumeyssa")
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,                 -- ex: "miel-nigelle" (URL/ancre, référence WhatsApp)
  category_id    text not null references public.categories(id) on update cascade,

  -- Contenu éditorial
  name           text not null,
  tagline        text,
  description    text[]  not null default '{}',        -- paragraphes
  benefits       text[]  not null default '{}',        -- liste "Bienfaits" / "Points forts"
  benefits_label text,                                 -- titre personnalisé (ex: "Ce qui le distingue")
  composition    text,
  provenance     text,
  usage_advice   text,                                 -- "Conseils d'usage"
  precautions    text[]  not null default '{}',

  -- Caractéristiques physiques (selon catégorie)
  weight         text,                                 -- "poids" (miels, poudres)
  volume         text,                                 -- "contenance" (huiles, gélules, brumes)

  -- Prix de base / prix "à partir de"
  price_value    numeric(10,2),                        -- produit simple = ce prix ; produit à variantes = prix mini

  -- VARIANTES : axes sur lesquels ce produit varie.
  --   [] (vide)            -> produit simple (pas de sélecteur)
  --   ['couleur']          -> bagues, sandales (1 photo par couleur)
  --   ['taille']           -> qamis
  --   ['format']           -> miels (50/200/300 g)
  --   ['contenance']       -> parfums/huiles (6/12/100 mL)
  --   ['couleur','taille'] -> abayas (couleur ET taille)
  variant_axes   text[]  not null default '{}',

  -- Médias (galerie générale du produit)
  images         text[]  not null default '{}',        -- URLs ordonnées (1re = principale)

  -- Contenu enrichi optionnel ("En savoir plus")
  accordions     jsonb   not null default '[]',        -- [{"title":"...","html":"..."}]

  -- Gestion / publication
  active         boolean not null default true,        -- activer / désactiver sans supprimer
  featured       boolean not null default false,       -- mise en avant (optionnel)
  sort_order     int     not null default 0,           -- ordre d'affichage

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_active   on public.products(active);
create index if not exists idx_products_sort     on public.products(sort_order);

-- ---------------------------------------------------------------------
-- 3) VARIANTES (chaque déclinaison achetable d'un produit)
-- ---------------------------------------------------------------------
create table if not exists public.product_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,

  name         text,                                   -- libellé court ex: "Noir Dentelle", "200 g", "M"
  -- Valeurs des axes, ex: {"couleur":"Noir","taille":"L"} ou {"format":"200 g"}
  options      jsonb   not null default '{}',
  price        numeric(10,2),                          -- prix de cette variante (sinon hérite de products.price_value)
  images       text[]  not null default '{}',          -- photos propres à la variante (ex: la couleur)
  sku          text,                                   -- référence interne optionnelle

  active       boolean not null default true,          -- activer/désactiver une déclinaison
  sort_order   int     not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_variants_product on public.product_variants(product_id);
create index if not exists idx_variants_active  on public.product_variants(active);

-- ---------------------------------------------------------------------
-- 4) MISE À JOUR AUTOMATIQUE DE updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_variants_updated_at on public.product_variants;
create trigger trg_variants_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5) SÉCURITÉ (Row Level Security)
--    Public  : lecture des éléments ACTIFS uniquement.
--    Admin   : tout (lecture + écriture) une fois connecté.
-- ---------------------------------------------------------------------
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;

-- Lecture publique (anon + connecté) : actifs seulement
drop policy if exists "public_read_active_categories" on public.categories;
create policy "public_read_active_categories"
  on public.categories for select to anon, authenticated using (active = true);

drop policy if exists "public_read_active_products" on public.products;
create policy "public_read_active_products"
  on public.products for select to anon, authenticated using (active = true);

drop policy if exists "public_read_active_variants" on public.product_variants;
create policy "public_read_active_variants"
  on public.product_variants for select to anon, authenticated using (active = true);

-- Admin connecté : voit TOUT (y compris désactivés) et peut tout modifier
drop policy if exists "admin_all_categories" on public.categories;
create policy "admin_all_categories"
  on public.categories for all to authenticated using (true) with check (true);

drop policy if exists "admin_all_products" on public.products;
create policy "admin_all_products"
  on public.products for all to authenticated using (true) with check (true);

drop policy if exists "admin_all_variants" on public.product_variants;
create policy "admin_all_variants"
  on public.product_variants for all to authenticated using (true) with check (true);

-- NB : "authenticated" = toute personne connectée via Supabase Auth.
-- Comme tu crées UN SEUL compte admin (et que l'inscription publique
-- sera désactivée dans Auth → Providers), seul toi peux écrire.

-- ---------------------------------------------------------------------
-- 6) STOCKAGE DES PHOTOS
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public_read_product_images" on storage.objects;
create policy "public_read_product_images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "admin_write_product_images" on storage.objects;
create policy "admin_write_product_images"
  on storage.objects for all to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');
