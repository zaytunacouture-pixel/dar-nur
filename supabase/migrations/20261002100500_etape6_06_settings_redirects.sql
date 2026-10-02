-- ============================================================================
-- Refonte — étape 6 · 06 · Paramètres globaux et table des redirections
--
-- settings : paramètres typés (clé → valeur jsonb). Lecture publique UNIQUEMENT
--   des clés is_public = true. Jamais de code promo ici (promo_codes reste non
--   énumérable).
--   Valeurs initiales :
--     national_shipping_enabled = false  (public) — la livraison nationale
--       N'EXISTE PAS aujourd'hui (livraison Île-de-France seule) ;
--     free_shipping_threshold   = 50 €   (PRIVÉ) — seuil envisagé, sans effet tant
--       que national_shipping_enabled = false ; non lisible par le site public ;
--     collection_min_models_indexable = 4, brand_min_models_indexable = 4
--       (règles d'indexation validées à l'étape 3, appliquées au build) ;
--     default_locale = 'fr'.
--   L'ancien site ne lit pas cette table : aucun comportement public ne change.
--
-- redirects : redirections futures (fichier _redirects Netlify généré au build).
--   VIDE à cette étape : les 78+ redirections de l'étape 3 ne sont PAS chargées.
--   Une redirection n'est jamais supprimée : on la désactive (historique).
--
-- Idempotente. Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) settings
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  value_type  text not null,            -- boolean | number | money | text | json
  is_public   boolean not null default false,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  constraint chk_settings_key  check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint chk_settings_type check (value_type in ('boolean', 'number', 'money', 'text', 'json')),
  -- La valeur respecte son type déclaré.
  constraint chk_settings_value check (
    case value_type
      when 'boolean' then jsonb_typeof(value) = 'boolean'
      when 'number'  then jsonb_typeof(value) = 'number'
      when 'text'    then jsonb_typeof(value) = 'string'
      when 'money'   then jsonb_typeof(value) = 'object'
                      and jsonb_typeof(value -> 'amount') = 'number'
                      and (value ->> 'amount')::numeric >= 0
                      and jsonb_typeof(value -> 'currency') = 'string'
      else true
    end
  )
);

drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (key, value, value_type, is_public, description) values
  ('national_shipping_enabled', 'false', 'boolean', true,
   'Livraison en France métropolitaine proposée. FAUX aujourd''hui : livraison Île-de-France uniquement (CGV). Aucun texte public ne doit promettre une livraison nationale tant que ce paramètre est faux.'),
  ('free_shipping_threshold', '{"amount": 50, "currency": "EUR"}', 'money', false,
   'Seuil de livraison offerte ENVISAGÉ. Non actif : sans effet tant que national_shipping_enabled est faux ; non public.'),
  ('collection_min_models_indexable', '4', 'number', true,
   'Une collection est indexable à partir de ce nombre de modèles publiés, sauf exception décidée (étape 3).'),
  ('brand_min_models_indexable', '4', 'number', true,
   'Une page marque est indexable à partir de ce nombre de modèles publiés ET avec une description (étape 3).'),
  ('default_locale', '"fr"', 'text', true,
   'Langue par défaut du site (racine sans préfixe).')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2) redirects
-- ----------------------------------------------------------------------------
create table if not exists public.redirects (
  id             uuid primary key default gen_random_uuid(),
  source_path    text not null,             -- /vt-aicha-noir/ (minuscules, sans paramètre ni fragment)
  target_path    text,                      -- /ensemble-aicha/?couleur=noir ; NULL seulement pour un 410
  status_code    smallint not null default 301,
  reason         text not null,
  product_id     uuid references public.products(id) on delete set null,      -- cible vivante éventuelle
  collection_id  uuid references public.collections(id) on delete set null,
  active         boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  deactivated_at timestamptz,
  constraint chk_redirects_status check (status_code in (301, 302, 410)),
  constraint chk_redirects_reason check (reason in ('product_merge', 'product_rename', 'product_archived',
                                                    'collection_merge', 'collection_rename', 'legacy_recovery', 'manual')),
  constraint chk_redirects_source check (source_path ~ '^/[^?#[:space:]]*$' and source_path = lower(source_path)),
  constraint chk_redirects_target check (
    (status_code = 410 and target_path is null)
    or (status_code <> 410 and target_path is not null and target_path ~ '^(/|https://)[^[:space:]]*$')
  ),
  -- Jamais vers elle-même (même chemin, paramètres et barre finale ignorés).
  constraint chk_redirects_not_self check (
    target_path is null
    or rtrim(source_path, '/') <> rtrim(split_part(split_part(target_path, '#', 1), '?', 1), '/')
  ),
  constraint chk_redirects_deactivation check (active = (deactivated_at is null))
);

-- Une seule redirection ACTIVE par source ; l'historique (inactives) est conservé.
create unique index if not exists uq_redirects_active_source on public.redirects (source_path) where active;
create index if not exists idx_redirects_product on public.redirects (product_id) where product_id is not null;

comment on table public.redirects is
  'Redirections (301/302/410) générées vers _redirects au build. Désactiver plutôt que supprimer. Vide à l''étape 6.';

-- ----------------------------------------------------------------------------
-- 3) Droits et RLS
-- ----------------------------------------------------------------------------
revoke all on public.settings, public.redirects from anon, authenticated;
grant select on public.settings, public.redirects to anon, authenticated;
grant insert, update, delete on public.settings, public.redirects to authenticated;

alter table public.settings enable row level security;
alter table public.redirects enable row level security;

drop policy if exists public_read_settings on public.settings;
create policy public_read_settings on public.settings
  for select to anon, authenticated using (is_public = true);
drop policy if exists admin_only_settings on public.settings;
create policy admin_only_settings on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_redirects on public.redirects;
create policy public_read_redirects on public.redirects
  for select to anon, authenticated using (active = true);
drop policy if exists admin_only_redirects on public.redirects;
create policy admin_only_redirects on public.redirects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

commit;
