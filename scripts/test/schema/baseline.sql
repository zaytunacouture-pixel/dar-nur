-- Schéma public de PRODUCTION figé par dump-baseline.mjs (ne pas modifier à la main).
-- Généré le 2026-10-02T06:49:20.047Z — aucune donnée.

-- Socle Supabase émulé : rôles, auth.uid(), auth.users, droits par défaut.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
create schema if not exists test;
create table test.notify_log (id serial primary key, event text, tbl text, op text, at timestamptz default clock_timestamp());

create table public.admins (
  "user_id" uuid not null,
  "email" text,
  "note" text,
  "created_at" timestamp with time zone default now() not null
);
create table public.brands (
  "id" text not null,
  "name" text not null,
  "description" text,
  "image_url" text,
  "sort_order" integer default 0 not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.categories (
  "id" text not null,
  "label" text not null,
  "filter_label" text not null,
  "sort_order" integer default 0 not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.offer_products (
  "offer_id" uuid not null,
  "product_slug" text not null,
  "sort_order" integer default 0 not null
);
create table public.offers (
  "id" uuid default gen_random_uuid() not null,
  "type" text not null,
  "title" text not null,
  "description" text,
  "image" text,
  "normal_price" numeric(10,2),
  "promo_price" numeric(10,2),
  "badge" text,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.product_source_observations (
  "id" bigint generated always as identity not null,
  "source_id" uuid not null,
  "observed_at" timestamp with time zone default now() not null,
  "run_id" text,
  "regular_price" numeric(10,2),
  "price" numeric(10,2),
  "on_sale" boolean,
  "in_stock" boolean,
  "stock_qty" integer
);
create table public.product_sources (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "variant_id" uuid,
  "supplier" text not null,
  "supplier_product_id" text,
  "supplier_variant_id" text,
  "supplier_url" text,
  "supplier_sku" text,
  "gtin" text,
  "supplier_regular_price" numeric(10,2),
  "supplier_price" numeric(10,2),
  "supplier_on_sale" boolean,
  "supplier_in_stock" boolean,
  "supplier_stock_qty" integer,
  "supplier_stock_text" text,
  "purchase_price" numeric(10,2),
  "purchase_currency" text default 'EUR'::text not null,
  "last_synced_at" timestamp with time zone default now() not null,
  "supplier_modified_at" timestamp with time zone,
  "raw" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "last_attempt_at" timestamp with time zone,
  "last_error" text,
  "purchase_price_at" timestamp with time zone,
  "purchase_price_origin" text
);
create table public.product_supply (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "variant_id" uuid,
  "stock_mode" text,
  "base_price" numeric(10,2),
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.product_variants (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "name" text,
  "options" jsonb default '{}'::jsonb not null,
  "price" numeric(10,2),
  "images" text[] default '{}'::text[] not null,
  "sku" text,
  "active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.products (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "category_id" text not null,
  "name" text not null,
  "tagline" text,
  "description" text[] default '{}'::text[] not null,
  "benefits" text[] default '{}'::text[] not null,
  "benefits_label" text,
  "composition" text,
  "provenance" text,
  "usage_advice" text,
  "precautions" text[] default '{}'::text[] not null,
  "weight" text,
  "volume" text,
  "price_value" numeric(10,2),
  "variant_axes" text[] default '{}'::text[] not null,
  "images" text[] default '{}'::text[] not null,
  "accordions" jsonb default '[]'::jsonb not null,
  "active" boolean default true not null,
  "featured" boolean default false not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "coming_soon" boolean default false not null,
  "brand" text,
  "brand_slug" text,
  "gift_idea" boolean default false not null,
  "gift_for_him" boolean default false not null,
  "gift_for_her" boolean default false not null
);
create table public.promo_codes (
  "id" uuid default gen_random_uuid() not null,
  "code" text not null,
  "label" text,
  "active" boolean default true not null,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "min_total_after_discount" numeric(10,2) default 0 not null,
  "rules" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.sync_proposals (
  "id" uuid default gen_random_uuid() not null,
  "run_id" text not null,
  "product_id" uuid not null,
  "variant_id" uuid,
  "source_id" uuid,
  "kind" text not null,
  "level" text not null,
  "target" text default 'none'::text not null,
  "evidence" jsonb default '{}'::jsonb not null,
  "suggested_action" text not null,
  "suggested_value" numeric(10,2),
  "fingerprint" text not null,
  "status" text default 'pending'::text not null,
  "obsolete_reason" text,
  "created_at" timestamp with time zone default now() not null,
  "decided_at" timestamp with time zone,
  "decided_by" uuid,
  "decided_value" numeric(10,2),
  "decision_note" text,
  "applied_at" timestamp with time zone,
  "applied_payload" jsonb
);

alter table admins add constraint admins_pkey PRIMARY KEY (user_id);
alter table brands add constraint brands_pkey PRIMARY KEY (id);
alter table categories add constraint categories_pkey PRIMARY KEY (id);
alter table offer_products add constraint offer_products_pkey PRIMARY KEY (offer_id, product_slug);
alter table offers add constraint offers_pkey PRIMARY KEY (id);
alter table product_source_observations add constraint product_source_observations_pkey PRIMARY KEY (id);
alter table product_sources add constraint product_sources_pkey PRIMARY KEY (id);
alter table product_supply add constraint product_supply_pkey PRIMARY KEY (id);
alter table product_variants add constraint product_variants_pkey PRIMARY KEY (id);
alter table products add constraint products_pkey PRIMARY KEY (id);
alter table promo_codes add constraint promo_codes_pkey PRIMARY KEY (id);
alter table sync_proposals add constraint sync_proposals_pkey PRIMARY KEY (id);
alter table products add constraint products_slug_key UNIQUE (slug);
alter table offers add constraint offers_type_check CHECK ((type = ANY (ARRAY['product_promo'::text, 'pack'::text, 'banner'::text])));
alter table product_sources add constraint chk_product_sources_purchase_price_origin CHECK (((purchase_price_origin IS NULL) OR (purchase_price_origin = ANY (ARRAY['facture'::text, 'tarif_pro'::text, 'autre'::text]))));
alter table product_sources add constraint chk_product_sources_purchase_price_qualified CHECK (((purchase_price IS NULL) OR ((purchase_price > (0)::numeric) AND (purchase_price_at IS NOT NULL) AND (purchase_price_origin IS NOT NULL))));
alter table product_supply add constraint chk_product_supply_base_price CHECK (((base_price IS NULL) OR (base_price > (0)::numeric)));
alter table product_supply add constraint chk_product_supply_stock_mode CHECK (((stock_mode IS NULL) OR (stock_mode = ANY (ARRAY['own_stock'::text, 'on_demand'::text]))));
alter table sync_proposals add constraint chk_sync_proposals_applied CHECK (((applied_at IS NULL) OR (status = 'accepted'::text)));
alter table sync_proposals add constraint chk_sync_proposals_decided CHECK (((status <> ALL (ARRAY['accepted'::text, 'rejected'::text])) OR (decided_at IS NOT NULL)));
alter table sync_proposals add constraint chk_sync_proposals_level CHECK ((level = ANY (ARRAY['info'::text, 'attention'::text, 'bloquant'::text])));
alter table sync_proposals add constraint chk_sync_proposals_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'obsolete'::text])));
alter table sync_proposals add constraint chk_sync_proposals_target CHECK ((target = ANY (ARRAY['none'::text, 'product_price'::text, 'variant_price'::text, 'base_price'::text])));
alter table sync_proposals add constraint chk_sync_proposals_value CHECK (((decided_value IS NULL) OR (decided_value > (0)::numeric)));
alter table admins add constraint admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table offer_products add constraint offer_products_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;
alter table product_source_observations add constraint product_source_observations_source_id_fkey FOREIGN KEY (source_id) REFERENCES product_sources(id) ON DELETE CASCADE;
alter table product_sources add constraint product_sources_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table product_sources add constraint product_sources_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
alter table product_supply add constraint product_supply_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table product_supply add constraint product_supply_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
alter table product_variants add constraint product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table products add constraint fk_products_brand_slug FOREIGN KEY (brand_slug) REFERENCES brands(id) ON UPDATE CASCADE;
alter table products add constraint products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE;
alter table sync_proposals add constraint sync_proposals_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table sync_proposals add constraint sync_proposals_source_id_fkey FOREIGN KEY (source_id) REFERENCES product_sources(id) ON DELETE SET NULL;
alter table sync_proposals add constraint sync_proposals_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;

CREATE INDEX idx_offers_active_sort ON public.offers USING btree (active, sort_order);
CREATE INDEX idx_product_sources_gtin ON public.product_sources USING btree (gtin) WHERE (gtin IS NOT NULL);
CREATE INDEX idx_product_sources_product ON public.product_sources USING btree (product_id);
CREATE INDEX idx_product_sources_supplier_ext ON public.product_sources USING btree (supplier, supplier_product_id);
CREATE INDEX idx_products_active ON public.products USING btree (active);
CREATE INDEX idx_products_category ON public.products USING btree (category_id);
CREATE INDEX idx_products_gift_idea ON public.products USING btree (gift_idea) WHERE (gift_idea = true);
CREATE INDEX idx_products_sort ON public.products USING btree (sort_order);
CREATE INDEX idx_pso_source_time ON public.product_source_observations USING btree (source_id, observed_at DESC);
CREATE INDEX idx_sync_proposals_product ON public.sync_proposals USING btree (product_id);
CREATE INDEX idx_sync_proposals_status_level ON public.sync_proposals USING btree (status, level);
CREATE INDEX idx_variants_active ON public.product_variants USING btree (active);
CREATE INDEX idx_variants_product ON public.product_variants USING btree (product_id);
CREATE UNIQUE INDEX promo_codes_code_norm_uidx ON public.promo_codes USING btree (upper(btrim(code)));
CREATE UNIQUE INDEX uq_product_sources_supplier_product_variant ON public.product_sources USING btree (supplier, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX uq_product_supply_product_variant ON public.product_supply USING btree (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX uq_sync_proposals_pending ON public.sync_proposals USING btree (COALESCE(source_id, product_id), kind) WHERE (status = 'pending'::text);

CREATE OR REPLACE FUNCTION public.check_promo_code(p_code text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_promo    public.promo_codes%rowtype;
  v_now      timestamptz := now();
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_total    numeric(12,2) := 0;
begin
  if v_code = '' then
    return jsonb_build_object('valid', false, 'reason', 'invalid_code');
  end if;

  select * into v_promo
    from public.promo_codes
   where upper(btrim(code)) = v_code
   limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'invalid_code');
  end if;

  if v_promo.active is not true then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;

  if v_promo.starts_at is not null and v_now < v_promo.starts_at then
    return jsonb_build_object('valid', false, 'reason', 'not_started');
  end if;

  -- Expiration évaluée sur l'horloge du serveur, pas sur celle du client.
  if v_promo.ends_at is not null and v_now > v_promo.ends_at then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  with req as (
    select
      nullif(btrim(item->>'slug'), '')                            as slug,
      nullif(btrim(coalesce(item->>'variant', '')), '')           as variant,
      greatest(1, least(99, coalesce((item->>'qty')::int, 1)))    as qty
    -- Le test de type protège d'un p_items mal formé (objet, chaîne, null) :
    -- jsonb_array_elements() lèverait sinon une exception au lieu de renvoyer
    -- un verdict exploitable par le panier.
    from jsonb_array_elements(
           case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
         ) as t(item)
  ),
  priced as (
    select
      p.category_id,
      r.qty,
      coalesce(v.price, p.price_value) as unit
    from req r
    join public.products p
      on p.slug = r.slug
     and p.active is true
     and coalesce(p.coming_soon, false) is false
    left join public.product_variants v
      on v.product_id = p.id
     and v.active is not false
     and v.name = r.variant
    where r.slug is not null
      and (r.variant is null or v.id is not null)
  ),
  cart_lines as (
    select
      category_id,
      round(unit * qty, 2) as line_total
    from priced
    where unit is not null
  ),
  applied as (
    select
      l.line_total,
      -- Taux applicable à la ligne : le plus élevé des taux dont la liste de
      -- catégories contient celle du produit. Aucune règle ne correspond =>
      -- 0 %, donc aucune remise. Jamais cumulatif.
      coalesce((
        select max((r->>'percent')::numeric)
        from jsonb_array_elements(
               case when jsonb_typeof(v_promo.rules) = 'array'
                    then v_promo.rules else '[]'::jsonb end
             ) as rules_t(r)
        where exists (
          select 1
          from jsonb_array_elements_text(
                 case when jsonb_typeof(r->'categories') = 'array'
                      then r->'categories' else '[]'::jsonb end
               ) as c(cat)
          where c.cat = l.category_id
        )
      ), 0) as percent
    from cart_lines l
  )
  select
    coalesce(sum(line_total), 0),
    coalesce(sum(round(line_total * percent / 100, 2)), 0)
    into v_subtotal, v_discount
  from applied;

  if v_subtotal <= 0 then
    return jsonb_build_object('valid', false, 'reason', 'empty_cart');
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  if v_total < coalesce(v_promo.min_total_after_discount, 0) then
    return jsonb_build_object(
      'valid',     false,
      'reason',    'min_not_reached',
      'subtotal',  v_subtotal,
      'discount',  v_discount,
      'total',     v_total,
      'min_total', v_promo.min_total_after_discount
    );
  end if;

  return jsonb_build_object(
    'valid',     true,
    'code',      v_promo.code,
    'label',     v_promo.label,
    'subtotal',  v_subtotal,
    'discount',  v_discount,
    'total',     v_total,
    'min_total', v_promo.min_total_after_discount
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$function$;
CREATE OR REPLACE FUNCTION public.notify_github_regenerate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  -- BOUCHON DE TEST : en production, appel HTTP repository_dispatch vers GitHub.
  insert into test.notify_log (event, tbl, op) values (coalesce(TG_ARGV[0], 'regenerate-parfums'), TG_TABLE_NAME, TG_OP);
  return coalesce(new, old);
end;
$function$;
CREATE OR REPLACE FUNCTION public.product_source_observations_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'product_source_observations est append-only : % refusé', tg_op;
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE TRIGGER trg_notify_github_regenerate_brands AFTER INSERT OR DELETE OR UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION notify_github_regenerate('regenerate-parfums');
CREATE TRIGGER trg_notify_github_regenerate_categories AFTER INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION notify_github_regenerate('regenerate-product-pages');
CREATE TRIGGER set_offers_updated_at BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pso_readonly BEFORE DELETE OR UPDATE ON public.product_source_observations FOR EACH ROW EXECUTE FUNCTION product_source_observations_readonly();
CREATE TRIGGER trg_product_sources_updated_at BEFORE UPDATE ON public.product_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_product_supply_updated_at BEFORE UPDATE ON public.product_supply FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notify_github_regenerate_parfums_del AFTER DELETE ON public.products FOR EACH ROW WHEN ((old.category_id = 'parfums'::text)) EXECUTE FUNCTION notify_github_regenerate('regenerate-parfums');
CREATE TRIGGER trg_notify_github_regenerate_parfums_ins AFTER INSERT ON public.products FOR EACH ROW WHEN ((new.category_id = 'parfums'::text)) EXECUTE FUNCTION notify_github_regenerate('regenerate-parfums');
CREATE TRIGGER trg_notify_github_regenerate_parfums_upd AFTER UPDATE ON public.products FOR EACH ROW WHEN (((new.category_id = 'parfums'::text) OR (old.category_id = 'parfums'::text))) EXECUTE FUNCTION notify_github_regenerate('regenerate-parfums');
CREATE TRIGGER trg_notify_github_regenerate_product_pages AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION notify_github_regenerate('regenerate-product-pages');
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

alter table public.admins enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.offer_products enable row level security;
alter table public.offers enable row level security;
alter table public.product_source_observations enable row level security;
alter table public.product_sources enable row level security;
alter table public.product_supply enable row level security;
alter table public.product_variants enable row level security;
alter table public.products enable row level security;
alter table public.promo_codes enable row level security;
alter table public.sync_proposals enable row level security;
create policy "admins_read_self" on public.admins as permissive for select to authenticated using ((user_id = auth.uid()));
create policy "admin_only_brands" on public.brands as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "public_read_active_brands" on public.brands as permissive for select to anon, authenticated using ((active = true));
create policy "admin_only_categories" on public.categories as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "public_read_active_categories" on public.categories as permissive for select to anon, authenticated using ((active = true));
create policy "admin_only_offer_products" on public.offer_products as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "public_read_offer_products" on public.offer_products as permissive for select to anon using ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_products.offer_id) AND (o.active = true) AND ((o.starts_at IS NULL) OR (o.starts_at <= now())) AND ((o.ends_at IS NULL) OR (o.ends_at > now()))))));
create policy "admin_only_offers" on public.offers as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "public_read_active_offers" on public.offers as permissive for select to anon using (((active = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at > now()))));
create policy "admin_only_product_source_observations" on public.product_source_observations as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin_only_product_sources" on public.product_sources as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin_only_product_supply" on public.product_supply as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin_only_variants" on public.product_variants as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "public_read_active_variants" on public.product_variants as permissive for select to anon, authenticated using ((active = true));
create policy "admin_only_products" on public.products as permissive for all to authenticated using (is_admin()) with check (is_admin());
create policy "public_read_active_products" on public.products as permissive for select to anon, authenticated using ((active = true));
create policy "admin_only_sync_proposals" on public.sync_proposals as permissive for all to authenticated using (is_admin()) with check (is_admin());

-- Droits réels (les droits par défaut ci-dessus valent pour les NOUVELLES tables).
revoke all on public.admins from anon, authenticated;
revoke all on public.brands from anon, authenticated;
revoke all on public.categories from anon, authenticated;
revoke all on public.offer_products from anon, authenticated;
revoke all on public.offers from anon, authenticated;
revoke all on public.product_source_observations from anon, authenticated;
revoke all on public.product_sources from anon, authenticated;
revoke all on public.product_supply from anon, authenticated;
revoke all on public.product_variants from anon, authenticated;
revoke all on public.products from anon, authenticated;
revoke all on public.promo_codes from anon, authenticated;
revoke all on public.sync_proposals from anon, authenticated;
grant select on public.admins to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.brands to anon;
grant delete, insert, references, select, trigger, truncate, update on public.brands to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.categories to anon;
grant delete, insert, references, select, trigger, truncate, update on public.categories to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.offer_products to anon;
grant delete, insert, references, select, trigger, truncate, update on public.offer_products to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.offers to anon;
grant delete, insert, references, select, trigger, truncate, update on public.offers to authenticated;
grant insert, select on public.product_source_observations to authenticated;
grant delete, insert, select, update on public.product_sources to authenticated;
grant delete, insert, select, update on public.product_supply to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.product_variants to anon;
grant delete, insert, references, select, trigger, truncate, update on public.product_variants to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.products to anon;
grant delete, insert, references, select, trigger, truncate, update on public.products to authenticated;
grant insert, select, update on public.sync_proposals to authenticated;
grant usage on schema test to anon, authenticated;
grant select, insert on test.notify_log to anon, authenticated;
grant usage on all sequences in schema test to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;
