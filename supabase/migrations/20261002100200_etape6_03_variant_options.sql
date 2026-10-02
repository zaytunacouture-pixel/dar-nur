-- ============================================================================
-- Refonte — étape 6 · 03 · Options de variantes normalisées
--
--   option_types             dictionnaire des axes : couleur, motif, senteur,
--                            contenance (« format » et « contenance » fusionnés :
--                            même notion de quantité nette), taille, pointure
--   option_values            valeurs d'un axe (code stable pour ?couleur=…,
--                            libellé, quantité + unité pour la contenance)
--   product_variant_options  une valeur par axe et par variante
--                            → un produit, plusieurs variantes, plusieurs options
--                              par variante (ex. Noir / M, Noir / L, Beige / M)
--
-- product_variants n'est pas modifiée : options (jsonb) et products.variant_axes
-- restent la source de l'ancien site, du panier, de check_promo_code et de l'admin.
-- Les axes d'un produit se déduisent des options de ses variantes, dans l'ordre
-- option_types.sort_order (couleur avant taille).
--
-- REMPLISSAGE : seules les valeurs RÉELLEMENT présentes en base, sans aucune
-- correction. En particulier « 2XL » (12 variantes) et « XXL » (4 qamis) restent
-- DEUX valeurs distinctes : leur unification affecterait l'affichage client et
-- doit être validée séparément. Aucune couleur n'est créée : aucune variante
-- n'en porte (les couleurs Mode sont encore des fiches séparées).
--
-- TRIGGER DE TRANSITION (sens unique : ancien → nouveau) :
--   toute écriture de product_variants.options (admin actuel, import) recalcule
--   les lignes source = 'legacy' des variantes du même produit. Correspondance
--   EXACTE par libellé ; une valeur inconnue n'est jamais créée automatiquement :
--   la variante reste « non normalisée » (repérable : variante sans ligne) et
--   l'admin actuel n'est jamais bloqué. Les lignes source = 'admin' (futur admin)
--   ne sont jamais touchées par ce trigger.
-- Unicité d'une combinaison d'options par produit : contrainte différée.
--
-- Idempotente. Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Dictionnaire
-- ----------------------------------------------------------------------------
create table if not exists public.option_types (
  id          text primary key,                 -- code stable, sert de nom de paramètre d'URL
  name        text not null,                    -- libellé FR
  value_kind  text not null default 'label',    -- label | quantity
  legacy_keys text[] not null default '{}',     -- clés historiques de product_variants.options
  sort_order  int  not null default 0,
  constraint chk_option_types_id   check (id ~ '^[a-z]+(_[a-z]+)*$'),
  constraint chk_option_types_kind check (value_kind in ('label', 'quantity'))
);

create table if not exists public.option_values (
  id             uuid primary key default gen_random_uuid(),
  option_type_id text not null references public.option_types(id) on delete restrict,
  code           text not null,                 -- noir, 2xl, 200-g
  label          text not null,                 -- Noir, 2XL, 200 g
  numeric_value  numeric,                       -- quantité (contenance)
  unit           text,                          -- g | kg | ml | l | capsule | piece
  color_hex      text,                          -- pastille, seulement si connue
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  constraint uq_option_values_code  unique (option_type_id, code),
  constraint uq_option_values_label unique (option_type_id, label),
  constraint uq_option_values_id_type unique (id, option_type_id),   -- cible de la FK composite
  constraint chk_option_values_code check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint chk_option_values_quantity check ((numeric_value is null) = (unit is null) and (numeric_value is null or numeric_value > 0)),
  constraint chk_option_values_unit check (unit is null or unit in ('g', 'kg', 'ml', 'l', 'capsule', 'piece')),
  constraint chk_option_values_hex  check (color_hex is null or color_hex ~ '^#[0-9a-f]{6}$')
);

-- ----------------------------------------------------------------------------
-- 2) Options d'une variante
-- ----------------------------------------------------------------------------
create table if not exists public.product_variant_options (
  variant_id      uuid not null references public.product_variants(id) on delete cascade,
  option_type_id  text not null references public.option_types(id) on delete restrict,
  option_value_id uuid not null,
  source          text not null default 'admin',   -- legacy (recopié de options jsonb) | admin
  primary key (variant_id, option_type_id),
  -- La valeur appartient forcément à l'axe déclaré.
  constraint fk_pvo_value_of_type foreign key (option_value_id, option_type_id)
    references public.option_values (id, option_type_id) on delete restrict,
  constraint chk_pvo_source check (source in ('legacy', 'admin'))
);
create index if not exists idx_pvo_value on public.product_variant_options (option_value_id);

comment on table public.product_variant_options is
  'Une valeur par axe et par variante. source=legacy : recopiée de product_variants.options par trigger (transition).';

-- Signature d'une variante : combinaison triée de ses options ('' si aucune).
create or replace function public.variant_option_signature(p_variant_id uuid)
returns text language sql stable as $$
  select coalesce(string_agg(option_type_id || '=' || option_value_id::text, '|' order by option_type_id), '')
    from public.product_variant_options
   where variant_id = p_variant_id
$$;

-- Contrainte : deux variantes d'un même produit n'ont jamais la même combinaison.
create or replace function public.product_variant_options_check_unique()
returns trigger language plpgsql as $$
declare
  v_product uuid;
  v_sig     text;
begin
  select product_id into v_product from public.product_variants where id = new.variant_id;
  if v_product is null then
    return null;   -- variante supprimée entre-temps (cascade)
  end if;
  v_sig := public.variant_option_signature(new.variant_id);
  if v_sig <> '' and exists (
    select 1 from public.product_variants pv
     where pv.product_id = v_product
       and pv.id <> new.variant_id
       and public.variant_option_signature(pv.id) = v_sig
  ) then
    raise exception 'product_variant_options : combinaison d''options déjà utilisée par une autre variante du produit %.', v_product;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_pvo_unique_combination on public.product_variant_options;
create constraint trigger trg_pvo_unique_combination
  after insert or update on public.product_variant_options
  deferrable initially deferred
  for each row execute function public.product_variant_options_check_unique();

-- ----------------------------------------------------------------------------
-- 3) Transition : options jsonb (ancien) → product_variant_options (nouveau)
-- ----------------------------------------------------------------------------
create or replace function public.sync_legacy_variant_options(p_product_id uuid)
returns void language plpgsql as $$
declare
  v_variant record;
  v_kv      record;
  v_type    text;
  v_value   uuid;
begin
  delete from public.product_variant_options pvo
   using public.product_variants pv
   where pvo.variant_id = pv.id
     and pv.product_id = p_product_id
     and pvo.source = 'legacy';

  for v_variant in
    select id, options from public.product_variants
     where product_id = p_product_id
     order by sort_order, created_at, id
  loop
    for v_kv in select key, btrim(value) as value from jsonb_each_text(coalesce(v_variant.options, '{}'::jsonb)) loop
      select ot.id into v_type from public.option_types ot where v_kv.key = any (ot.legacy_keys);
      if v_type is null then continue; end if;
      select ov.id into v_value from public.option_values ov where ov.option_type_id = v_type and ov.label = v_kv.value;
      if v_value is null then continue; end if;      -- valeur inconnue : jamais créée automatiquement
      insert into public.product_variant_options (variant_id, option_type_id, option_value_id, source)
      values (v_variant.id, v_type, v_value, 'legacy')
      on conflict (variant_id, option_type_id) do nothing;   -- une ligne 'admin' l'emporte
    end loop;

    -- Combinaison identique à une variante déjà traitée : la variante reste non
    -- normalisée plutôt que de bloquer l'enregistrement dans l'admin actuel.
    if public.variant_option_signature(v_variant.id) <> '' and exists (
      select 1 from public.product_variants pv
       where pv.product_id = p_product_id and pv.id <> v_variant.id
         and public.variant_option_signature(pv.id) = public.variant_option_signature(v_variant.id)
    ) then
      delete from public.product_variant_options where variant_id = v_variant.id and source = 'legacy';
    end if;
  end loop;
end;
$$;

create or replace function public.product_variants_sync_options()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.options is not distinct from old.options then
    return null;
  end if;
  perform public.sync_legacy_variant_options(coalesce(new.product_id, old.product_id));
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Droits et RLS — dictionnaire public ; options lisibles si la variante l'est
-- ----------------------------------------------------------------------------
revoke all on public.option_types, public.option_values, public.product_variant_options from anon, authenticated;
grant select on public.option_types, public.option_values, public.product_variant_options to anon, authenticated;
grant insert, update, delete on public.option_types, public.option_values, public.product_variant_options to authenticated;

alter table public.option_types enable row level security;
alter table public.option_values enable row level security;
alter table public.product_variant_options enable row level security;

drop policy if exists public_read_option_types on public.option_types;
create policy public_read_option_types on public.option_types for select to anon, authenticated using (true);
drop policy if exists admin_only_option_types on public.option_types;
create policy admin_only_option_types on public.option_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_option_values on public.option_values;
create policy public_read_option_values on public.option_values for select to anon, authenticated using (true);
drop policy if exists admin_only_option_values on public.option_values;
create policy admin_only_option_values on public.option_values
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- La politique de product_variants (active = true) et celle de products s'appliquent dans la sous-requête.
drop policy if exists public_read_product_variant_options on public.product_variant_options;
create policy public_read_product_variant_options on public.product_variant_options
  for select to anon, authenticated using (
    exists (
      select 1 from public.product_variants pv join public.products p on p.id = pv.product_id
       where pv.id = variant_id and pv.active = true and p.active = true
    )
  );
drop policy if exists admin_only_product_variant_options on public.product_variant_options;
create policy admin_only_product_variant_options on public.product_variant_options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5) Dictionnaire initial et valeurs réellement présentes
-- ----------------------------------------------------------------------------
insert into public.option_types (id, name, value_kind, legacy_keys, sort_order) values
  ('couleur',    'Couleur',    'label',    '{couleur}',           10),
  ('motif',      'Motif',      'label',    '{motif}',             20),
  ('senteur',    'Senteur',    'label',    '{senteur}',           30),
  ('contenance', 'Contenance', 'quantity', '{format,contenance}', 40),
  ('taille',     'Taille',     'label',    '{taille}',            50),
  ('pointure',   'Pointure',   'label',    '{pointure}',          60)
on conflict (id) do nothing;

insert into public.option_values (option_type_id, code, label, numeric_value, unit, sort_order) values
  ('contenance', '50-g',   '50 g',   50,  'g',  10),
  ('contenance', '200-g',  '200 g',  200, 'g',  20),
  ('contenance', '300-g',  '300 g',  300, 'g',  30),
  ('contenance', '50-ml',  '50 ml',  50,  'ml', 110),
  ('contenance', '100-ml', '100 ml', 100, 'ml', 120),
  ('taille',     'm',      'M',      null, null, 10),
  ('taille',     'l',      'L',      null, null, 20),
  ('taille',     'xl',     'XL',     null, null, 30),
  ('taille',     '2xl',    '2XL',    null, null, 40),   -- 12 variantes (abayas, ensembles)
  ('taille',     'xxl',    'XXL',    null, null, 41)    -- 4 variantes (qamis) — doublon de 2XL NON unifié (à valider)
on conflict (option_type_id, code) do nothing;

-- Remplissage : recopie des options existantes, produit par produit.
do $$
declare
  v_product uuid;
begin
  for v_product in select distinct product_id from public.product_variants loop
    perform public.sync_legacy_variant_options(v_product);
  end loop;
end $$;

drop trigger if exists trg_product_variants_sync_options on public.product_variants;
create trigger trg_product_variants_sync_options
  after insert or update of options or delete on public.product_variants
  for each row execute function public.product_variants_sync_options();

-- Contrôle d'unicité évalué tout de suite (et non au COMMIT) : vérifie le remplissage.
set constraints public.trg_pvo_unique_combination immediate;

notify pgrst, 'reload schema';

commit;
