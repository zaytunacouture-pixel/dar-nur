-- ============================================================================
-- Table `product_sources` — provenance fournisseur PRIVÉE d'un produit.
--
-- Une ligne = « ce produit (ou cette variante) est disponible chez tel
-- fournisseur, sous tel identifiant, à tel prix public, avec tel stock ».
-- Générique dès le départ : la colonne `supplier` est un code libre
-- ('flora', ...), et l'unicité porte sur (supplier, product_id, variant_id)
-- — un même produit pourra donc avoir plusieurs fournisseurs plus tard sans
-- changer le schéma. Aucune colonne « flora » n'est ajoutée à `products` :
-- l'identité publique du produit ne connaît pas ses fournisseurs.
--
-- CONFIDENTIALITÉ : cette table n'est JAMAIS lisible par le rôle `anon`.
-- Pas de politique de lecture publique, privilèges révoqués — seul un
-- administrateur (public.is_admin(), voir admin_rls.sql) peut la lire et
-- l'écrire. Rien de ce qu'elle contient n'atteint les pages générées.
--
-- `purchase_price` (prix d'achat professionnel) reste NULL tant que la vraie
-- valeur n'est pas connue : NULL signifie « prix d'achat à renseigner »,
-- jamais « zéro », et aucune marge ne doit être calculée dessus tant qu'il
-- est NULL.
--
-- À exécuter une seule fois dans Supabase > SQL Editor, avec le compte
-- propriétaire. Idempotent. Rollback : product_sources_rollback.sql.
-- Pré-requis : admin_rls.sql déjà exécuté (public.is_admin() doit exister).
-- ============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_proc where oid = 'public.is_admin()'::regprocedure) then
    raise exception 'Abandon : public.is_admin() est introuvable — exécuter supabase/sql/admin_rls.sql avant cette migration.';
  end if;
end $$;

create table if not exists public.product_sources (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references public.products(id) on delete cascade,
  variant_id             uuid references public.product_variants(id) on delete cascade,

  supplier               text not null,                 -- code fournisseur, ex. 'flora'
  supplier_product_id    text,                          -- identifiant chez le fournisseur (id WooCommerce...)
  supplier_variant_id    text,                          -- identifiant de la variation chez le fournisseur
  supplier_url           text,                          -- URL de la fiche fournisseur
  supplier_sku           text,
  gtin                   text,                          -- EAN / code-barres, uniquement s'il est réellement fourni

  supplier_regular_price numeric(10,2),                 -- prix public fournisseur hors promotion (jamais affiché)
  supplier_price         numeric(10,2),                 -- prix public fournisseur effectif (promo incluse)
  supplier_on_sale       boolean,
  supplier_in_stock      boolean,                       -- disponibilité chez le fournisseur — n'est PAS le stock Dar Nūr
  supplier_stock_qty     int,                           -- quantité annoncée par le fournisseur, si publiée
  supplier_stock_text    text,                          -- libellé brut ("13 en stock", "En rupture de stock")

  purchase_price         numeric(10,2),                 -- prix d'achat professionnel — NULL = « à renseigner »
  purchase_currency      text not null default 'EUR',

  last_synced_at         timestamptz not null default now(),
  supplier_modified_at   timestamptz,                   -- dateModified publiée par le fournisseur, si connue
  raw                    jsonb not null default '{}',   -- charge utile brute (audit, re-synchronisation)

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.product_sources is
  'Provenance fournisseur privée d''un produit ou d''une variante. Jamais lisible publiquement. purchase_price NULL = prix d''achat à renseigner.';

-- Un seul enregistrement par (fournisseur, produit, variante). Les lignes
-- « produit » (variant_id NULL) et « variante » cohabitent pour un produit à
-- déclinaisons : coalesce() rend NULL comparable dans l'index unique.
create unique index if not exists uq_product_sources_supplier_product_variant
  on public.product_sources (supplier, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_product_sources_product on public.product_sources(product_id);
create index if not exists idx_product_sources_supplier_ext on public.product_sources(supplier, supplier_product_id);
create index if not exists idx_product_sources_gtin on public.product_sources(gtin) where gtin is not null;

-- updated_at automatique (même fonction que products / product_variants)
drop trigger if exists trg_product_sources_updated_at on public.product_sources;
create trigger trg_product_sources_updated_at
  before update on public.product_sources
  for each row execute function public.set_updated_at();

-- RLS : aucune lecture publique, admin seulement --------------------------------
alter table public.product_sources enable row level security;

revoke all on public.product_sources from anon, authenticated;
grant select, insert, update, delete on public.product_sources to authenticated;

drop policy if exists "admin_only_product_sources" on public.product_sources;
create policy "admin_only_product_sources"
  on public.product_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Garde-fou : la table ne doit avoir aucune politique ouverte au rôle anon.
do $$
declare
  open_count int;
begin
  select count(*) into open_count
  from pg_policies
  where schemaname = 'public' and tablename = 'product_sources'
    and 'anon' = any(roles);
  if open_count > 0 then
    raise exception 'Abandon : une politique product_sources est ouverte au rôle anon.';
  end if;
end $$;

commit;
