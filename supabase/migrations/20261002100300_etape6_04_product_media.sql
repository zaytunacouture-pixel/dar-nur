-- ============================================================================
-- Refonte — étape 6 · 04 · Médias produit normalisés
--
-- product_media : une ligne par image (ou vidéo) d'un produit, ordonnée.
--   - image principale = la première par sort_order parmi les médias du produit
--     sans variante (même convention que products.images[0] aujourd'hui) ;
--   - variant_id       : image propre à une variante (photos par format des miels) ;
--   - option_value_id  : image propre à une valeur d'option (une couleur, toutes
--                        tailles confondues) — prévu pour les futures fusions Mode ;
--   - role, alt_text, width/height, focal_x/focal_y (cadrage) : métadonnées utiles
--     au pipeline d'images Astro (CatalogPicture), toutes facultatives.
-- Les fichiers ne bougent pas : url reprend exactement la référence existante
-- (chemin relatif « assets/… » servi par dar-nur.fr, ou URL du stockage public).
--
-- REMPLISSAGE (copie exacte, rien d'inventé) :
--   products.images[]         → lignes sans variante, sort_order = position ;
--   product_variants.images[] → lignes rattachées à la variante.
--   alt_text, role, dimensions et cadrage restent NULL : aucune donnée fiable.
--
-- TRIGGER DE TRANSITION (sens unique : ancien → nouveau) : toute écriture de
-- products.images ou product_variants.images (admin actuel) remplace les lignes
-- source = 'legacy' correspondantes. Les lignes source = 'admin' (futur admin)
-- ne sont jamais touchées. Supprimer une référence ne supprime jamais un fichier.
--
-- Idempotente. Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

create table if not exists public.product_media (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_id      uuid references public.product_variants(id) on delete cascade,
  option_value_id uuid references public.option_values(id) on delete restrict,
  url             text not null,
  media_type      text not null default 'image',
  role            text,                       -- packshot | worn | detail | ambiance | label
  sort_order      int  not null default 0,
  alt_text        text,
  width           int,
  height          int,
  focal_x         numeric,                    -- point d'intérêt (0 = gauche, 1 = droite)
  focal_y         numeric,                    -- (0 = haut, 1 = bas)
  source          text not null default 'admin',   -- legacy (recopié de images[]) | admin
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint chk_product_media_url    check (btrim(url) <> ''),
  constraint chk_product_media_type   check (media_type in ('image', 'video')),
  constraint chk_product_media_role   check (role is null or role in ('packshot', 'worn', 'detail', 'ambiance', 'label')),
  constraint chk_product_media_dims   check ((width is null or width > 0) and (height is null or height > 0)),
  constraint chk_product_media_focal  check ((focal_x is null or focal_x between 0 and 1) and (focal_y is null or focal_y between 0 and 1)),
  constraint chk_product_media_source check (source in ('legacy', 'admin'))
);

create index if not exists idx_product_media_product on public.product_media (product_id, variant_id, sort_order);
create index if not exists idx_product_media_variant on public.product_media (variant_id) where variant_id is not null;

comment on table public.product_media is
  'Médias produit ordonnés. Principale = premier sort_order sans variante. source=legacy : recopiée de images[] par trigger (transition).';

drop trigger if exists trg_product_media_updated_at on public.product_media;
create trigger trg_product_media_updated_at
  before update on public.product_media
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Transition : images[] (ancien) → product_media (nouveau)
-- ----------------------------------------------------------------------------
create or replace function public.sync_legacy_product_media()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.images is not distinct from old.images then
    return null;
  end if;

  if tg_table_name = 'products' then
    delete from public.product_media
     where product_id = new.id and variant_id is null and source = 'legacy';
    insert into public.product_media (product_id, url, sort_order, source)
    select new.id, btrim(u), (o - 1)::int, 'legacy'
      from unnest(new.images) with ordinality as t(u, o)
     where btrim(coalesce(u, '')) <> '';
  else
    delete from public.product_media
     where variant_id = new.id and source = 'legacy';
    insert into public.product_media (product_id, variant_id, url, sort_order, source)
    select new.product_id, new.id, btrim(u), (o - 1)::int, 'legacy'
      from unnest(new.images) with ordinality as t(u, o)
     where btrim(coalesce(u, '')) <> '';
  end if;
  return null;
end;
$$;

-- Remplissage (une seule fois : seulement si aucune ligne legacy n'existe encore).
insert into public.product_media (product_id, url, sort_order, source)
select p.id, btrim(t.u), (t.o - 1)::int, 'legacy'
  from public.products p
 cross join lateral unnest(p.images) with ordinality as t(u, o)
 where btrim(coalesce(t.u, '')) <> ''
   and not exists (select 1 from public.product_media m where m.source = 'legacy');

insert into public.product_media (product_id, variant_id, url, sort_order, source)
select v.product_id, v.id, btrim(t.u), (t.o - 1)::int, 'legacy'
  from public.product_variants v
 cross join lateral unnest(v.images) with ordinality as t(u, o)
 where btrim(coalesce(t.u, '')) <> ''
   and not exists (select 1 from public.product_media m where m.source = 'legacy' and m.variant_id is not null);

drop trigger if exists trg_products_sync_media on public.products;
create trigger trg_products_sync_media
  after insert or update of images on public.products
  for each row execute function public.sync_legacy_product_media();

drop trigger if exists trg_product_variants_sync_media on public.product_variants;
create trigger trg_product_variants_sync_media
  after insert or update of images on public.product_variants
  for each row execute function public.sync_legacy_product_media();

-- ----------------------------------------------------------------------------
-- Droits et RLS — lisible si le produit (et la variante éventuelle) l'est
-- ----------------------------------------------------------------------------
revoke all on public.product_media from anon, authenticated;
grant select on public.product_media to anon, authenticated;
grant insert, update, delete on public.product_media to authenticated;
alter table public.product_media enable row level security;

drop policy if exists public_read_product_media on public.product_media;
create policy public_read_product_media on public.product_media
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.active = true)
    and (variant_id is null or exists (select 1 from public.product_variants v where v.id = variant_id and v.active = true))
  );
drop policy if exists admin_only_product_media on public.product_media;
create policy admin_only_product_media on public.product_media
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

commit;
