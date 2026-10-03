-- =====================================================================
--  ÉTAPE 10 — 01 / 02 : COMMANDES — tables, invariants, triggers, RLS
--
--  Parcours Dar Nūr : DEMANDE de commande → vérification / préparation →
--  total final confirmé (livraison comprise) → PAIEMENT → expédition.
--  Une commande ne peut JAMAIS être expédiée avant confirmation du paiement :
--  garanti ici par une contrainte CHECK et par un trigger de transitions,
--  qui s'appliquent à TOUS les rôles (postgres et service_role compris).
--
--  Additif : aucune table existante n'est modifiée. Transactionnel, réexécutable.
--  Rollback : supabase/rollback/20261003_etape10_rollback.sql
--  Référence : docs/SCHEMA_SUPABASE.md, section « Commandes (étape 10) ».
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0) Schéma privé (non exposé par l'API) : secrets et journal anti-abus.
-- ---------------------------------------------------------------------
create schema if not exists orders_private;
revoke all on schema orders_private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema orders_private from anon, authenticated';
  end if;
end $$;

create table if not exists orders_private.config (
  id                         boolean primary key default true check (id),
  -- Dérivation des jetons de suivi : jeton = base64url(sha256(secret ‖ id de commande)).
  token_secret               bytea not null check (octet_length(token_secret) = 32),
  -- Hachage des adresses IP du journal anti-abus (jamais d'IP en clair).
  ip_salt                    bytea not null check (octet_length(ip_salt) = 32),
  -- Hôtes autorisés pour une URL de paiement (vide = tout hôte https).
  payment_allowed_hosts      text[] not null default '{}',
  -- Version des conditions acceptées, enregistrée sur chaque commande.
  terms_version              text not null default 'cgv-dar-nur-fr-ancienne-version-a-reviser',
  -- Garde-fou : tant que les CGV ne sont pas révisées, AUCUNE commande « production ».
  production_ordering_open   boolean not null default false,
  created_at                 timestamptz not null default now()
);
insert into orders_private.config (token_secret, ip_salt)
select decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'),
       decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex')
on conflict (id) do nothing;

create table if not exists orders_private.submissions (
  id          bigint generated always as identity primary key,
  ip_hash     bytea,
  created_at  timestamptz not null default now()
);
create index if not exists idx_order_submissions_ip on orders_private.submissions (ip_hash, created_at);
create index if not exists idx_order_submissions_at on orders_private.submissions (created_at);

-- ---------------------------------------------------------------------
-- 1) Commandes
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                       uuid primary key default gen_random_uuid(),
  public_number            text not null,
  token_hash               bytea not null,
  idempotency_key          uuid not null,
  request_hash             bytea not null,
  environment              text not null,
  is_test                  boolean not null,

  status                   text not null default 'submitted',
  payment_status           text not null default 'not_requested',

  currency                 text not null default 'EUR',
  subtotal_cents           integer not null,
  shipping_cents           integer,
  discount_cents           integer not null default 0,
  discount_reason          text,
  total_cents              integer generated always as (
                             case when shipping_cents is null then null
                                  else subtotal_cents + shipping_cents - discount_cents end) stored,
  total_confirmed_at       timestamptz,

  customer_first_name      text not null,
  customer_last_name       text not null,
  customer_email           text not null,
  customer_phone           text not null,
  ship_address_line1       text not null,
  ship_address_line2       text,
  ship_postal_code         text,
  ship_city                text not null,
  ship_region              text,
  ship_country_code        text not null,
  delivery_instructions    text,
  terms_accepted_at        timestamptz not null,
  terms_version            text not null,

  payment_provider         text,
  payment_url              text,
  payment_reference        text,
  payment_requested_at     timestamptz,
  paid_at                  timestamptz,
  payment_confirmed_by     uuid,
  payment_confirmation_source text,

  shipping_carrier         text,
  shipping_service         text,
  shipping_estimate        text,
  tracking_number          text,
  tracking_url             text,
  shipped_at               timestamptz,
  completed_at             timestamptz,

  cancelled_at             timestamptz,
  cancel_reason            text,
  refunded_at              timestamptz,
  admin_note               text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint uq_orders_public_number   unique (public_number),
  constraint uq_orders_token_hash      unique (token_hash),
  constraint uq_orders_idempotency     unique (idempotency_key),
  constraint chk_orders_number         check (public_number ~ '^DN-[0-9]{4}-[A-HJ-NP-Z2-9]{6}$'),
  constraint chk_orders_environment    check (environment in ('development', 'preprod', 'production')),
  constraint chk_orders_test           check (is_test = (environment <> 'production')),
  constraint chk_orders_status         check (status in ('submitted', 'reviewing', 'awaiting_payment', 'paid',
                                                         'preparing_shipment', 'shipped', 'completed', 'cancelled')),
  constraint chk_orders_payment_status check (payment_status in ('not_requested', 'pending', 'paid', 'failed',
                                                                 'cancelled', 'refund_due', 'refunded')),
  constraint chk_orders_currency       check (currency = 'EUR'),
  constraint chk_orders_amounts        check (subtotal_cents >= 0 and (shipping_cents is null or shipping_cents >= 0)
                                              and discount_cents >= 0 and discount_cents <= subtotal_cents),
  constraint chk_orders_discount_reason check (discount_cents = 0 or char_length(btrim(coalesce(discount_reason, ''))) between 3 and 300),

  -- ── Cohérence statut de commande ↔ statut de paiement ──────────────────
  constraint chk_orders_status_payment check (
       (status in ('submitted', 'reviewing') and payment_status = 'not_requested')
    or (status = 'awaiting_payment' and payment_status in ('pending', 'failed'))
    or (status in ('paid', 'preparing_shipment', 'shipped', 'completed') and payment_status = 'paid')
    or (status = 'cancelled' and payment_status in ('not_requested', 'cancelled', 'refund_due', 'refunded'))),
  -- ── INVARIANT CRITIQUE : rien n'est expédié sans paiement confirmé ─────
  constraint chk_orders_shipped_requires_paid check (
    status not in ('shipped', 'completed') or (payment_status = 'paid' and paid_at is not null and shipped_at is not null)),
  -- Le paiement n'est demandé que sur un total confirmé par Dar Nūr (livraison comprise).
  constraint chk_orders_total_confirmed check (
    status not in ('awaiting_payment', 'paid', 'preparing_shipment', 'shipped', 'completed')
    or (shipping_cents is not null and total_confirmed_at is not null and total_cents > 0 and payment_requested_at is not null)),
  constraint chk_orders_paid_fields check (
    (payment_status in ('paid', 'refund_due', 'refunded')) = (paid_at is not null and payment_confirmation_source is not null)),
  constraint chk_orders_confirmation_source check (
    payment_confirmation_source is null or payment_confirmation_source in ('admin_manual', 'provider_webhook')),
  constraint chk_orders_refunded check ((payment_status = 'refunded') = (refunded_at is not null)),
  constraint chk_orders_cancelled check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint chk_orders_completed check ((status = 'completed') = (completed_at is not null)),

  -- ── URL saisies par l'administration : https, sans identifiants, sans espace ──
  constraint chk_orders_payment_url  check (payment_url is null
    or (char_length(payment_url) <= 2000 and payment_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')),
  constraint chk_orders_tracking_url check (tracking_url is null
    or (char_length(tracking_url) <= 2000 and tracking_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')),

  -- ── Coordonnées (revalidées par create_order_request ; filet de sécurité) ──
  constraint chk_orders_customer check (
        char_length(customer_first_name) between 1 and 80
    and char_length(customer_last_name) between 1 and 80
    and char_length(customer_email) between 6 and 254
    and customer_email ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
    and char_length(customer_phone) between 6 and 25
    and char_length(ship_address_line1) between 1 and 200
    and char_length(coalesce(ship_address_line2, '')) <= 200
    and char_length(coalesce(ship_postal_code, '')) <= 16
    and char_length(ship_city) between 1 and 100
    and char_length(coalesce(ship_region, '')) <= 100
    and ship_country_code ~ '^[A-Z]{2}$'
    and char_length(coalesce(delivery_instructions, '')) <= 500),
  constraint chk_orders_admin_text check (
        char_length(coalesce(payment_provider, '')) <= 40
    and char_length(coalesce(payment_reference, '')) <= 200
    and char_length(coalesce(shipping_carrier, '')) <= 80
    and char_length(coalesce(shipping_service, '')) <= 80
    and char_length(coalesce(shipping_estimate, '')) <= 120
    and char_length(coalesce(tracking_number, '')) <= 100
    and char_length(coalesce(cancel_reason, '')) <= 500
    and char_length(coalesce(admin_note, '')) <= 2000)
);
create index if not exists idx_orders_created on public.orders (created_at desc);
create index if not exists idx_orders_status on public.orders (status, created_at desc);
create index if not exists idx_orders_environment on public.orders (environment, created_at desc);

comment on table public.orders is
  'Étape 10 — demandes de commande. Écriture UNIQUEMENT par les fonctions create_order_request / admin_update_order. '
  'Aucune lecture anonyme ; admin (is_admin) en lecture ; client via get_order_tracking(jeton).';

-- ---------------------------------------------------------------------
-- 2) Lignes : SNAPSHOT du produit au moment de la demande
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references public.orders(id) on delete restrict,
  position                 smallint not null,
  -- Références indicatives : la suppression d'un produit ou d'une variante ne bloque rien
  -- et ne modifie pas la commande (le snapshot ci-dessous fait foi).
  product_id               uuid references public.products(id) on delete set null,
  variant_id               uuid references public.product_variants(id) on delete set null,
  product_slug             text not null,
  product_name             text not null,
  variant_label            text,
  options                  jsonb not null default '[]',
  availability_at_order    text not null,
  quantity                 integer not null,
  list_unit_price_cents    integer not null,
  unit_price_cents         integer not null,
  offer_id                 uuid,
  offer_title              text,
  line_total_cents         integer generated always as (unit_price_cents * quantity) stored,
  -- NULL = à vérifier ; false = indisponible (ligne exclue du sous-total) ; true = confirmée.
  availability_confirmed   boolean,
  created_at               timestamptz not null default now(),
  constraint uq_order_items_position unique (order_id, position),
  constraint chk_order_items_position check (position between 1 and 30),
  constraint chk_order_items_quantity check (quantity between 1 and 99),
  constraint chk_order_items_prices check (list_unit_price_cents > 0 and unit_price_cents > 0
                                           and unit_price_cents <= list_unit_price_cents),
  constraint chk_order_items_offer check ((offer_id is null) = (unit_price_cents = list_unit_price_cents)),
  constraint chk_order_items_availability check (availability_at_order in ('available', 'on_demand')),
  constraint chk_order_items_options check (jsonb_typeof(options) = 'array'),
  constraint chk_order_items_text check (char_length(product_slug) between 1 and 200
                                         and char_length(product_name) between 1 and 300
                                         and char_length(coalesce(variant_label, '')) <= 200)
);
create index if not exists idx_order_items_order on public.order_items (order_id, position);
create index if not exists idx_order_items_product on public.order_items (product_id);
create index if not exists idx_order_items_variant on public.order_items (variant_id);

-- ---------------------------------------------------------------------
-- 3) Journal d'événements (traçabilité + file des notifications client)
-- ---------------------------------------------------------------------
create table if not exists public.order_events (
  id                  bigint generated always as identity primary key,
  order_id            uuid not null references public.orders(id) on delete restrict,
  type                text not null,
  from_status         text,
  to_status           text,
  from_payment_status text,
  to_payment_status   text,
  actor               text not null,
  actor_id            uuid,
  details             jsonb not null default '{}',
  -- Événement à signaler au client (commande reçue, paiement demandé, paiement reçu,
  -- expédiée, annulée). Aucun envoi automatique n'existe encore : notified_at reste NULL
  -- jusqu'à ce que l'administration le marque « prévenu » (ou qu'un futur envoi d'e-mails le fasse).
  notify_customer     boolean not null default false,
  notified_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint chk_order_events_type check (type in ('created', 'status_changed', 'payment_status_changed',
    'shipping_quote_set', 'discount_set', 'payment_link_set', 'tracking_set', 'item_availability_set',
    'note_set', 'customer_notified')),
  constraint chk_order_events_actor check (actor in ('customer', 'admin', 'provider', 'system')),
  constraint chk_order_events_details check (jsonb_typeof(details) = 'object'),
  constraint chk_order_events_notified check (notified_at is null or notify_customer)
);
create index if not exists idx_order_events_order on public.order_events (order_id, id);
create index if not exists idx_order_events_pending on public.order_events (created_at) where notify_customer and notified_at is null;

-- ---------------------------------------------------------------------
-- 4) Garde-fous (triggers) — valables pour TOUS les rôles
-- ---------------------------------------------------------------------

-- Transitions autorisées. Toute autre transition est refusée (ex. awaiting_payment → shipped).
create or replace function public.order_status_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_from = p_to or (p_from, p_to) in (
    ('submitted', 'reviewing'), ('submitted', 'cancelled'),
    ('reviewing', 'awaiting_payment'), ('reviewing', 'cancelled'),
    ('awaiting_payment', 'reviewing'), ('awaiting_payment', 'paid'), ('awaiting_payment', 'cancelled'),
    ('paid', 'preparing_shipment'), ('paid', 'cancelled'),
    ('preparing_shipment', 'shipped'), ('preparing_shipment', 'cancelled'),
    ('shipped', 'completed'));
$$;

create or replace function public.order_payment_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_from = p_to or (p_from, p_to) in (
    ('not_requested', 'pending'), ('not_requested', 'cancelled'),
    ('pending', 'paid'), ('pending', 'failed'), ('pending', 'not_requested'), ('pending', 'cancelled'),
    ('failed', 'pending'), ('failed', 'paid'), ('failed', 'not_requested'), ('failed', 'cancelled'),
    ('paid', 'refund_due'),
    ('refund_due', 'refunded'));
$$;

create or replace function public.orders_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'dn:order_delete_forbidden' using detail = 'Une commande ne se supprime pas : elle s''annule.';
  end if;

  -- Identité, client, adresse et acceptation : figés à la création.
  if (new.id, new.public_number, new.token_hash, new.idempotency_key, new.request_hash, new.environment, new.is_test,
      new.currency, new.created_at, new.customer_first_name, new.customer_last_name, new.customer_email,
      new.customer_phone, new.ship_address_line1, new.ship_address_line2, new.ship_postal_code, new.ship_city,
      new.ship_region, new.ship_country_code, new.delivery_instructions, new.terms_accepted_at, new.terms_version)
     is distinct from
     (old.id, old.public_number, old.token_hash, old.idempotency_key, old.request_hash, old.environment, old.is_test,
      old.currency, old.created_at, old.customer_first_name, old.customer_last_name, old.customer_email,
      old.customer_phone, old.ship_address_line1, old.ship_address_line2, old.ship_postal_code, old.ship_city,
      old.ship_region, old.ship_country_code, old.delivery_instructions, old.terms_accepted_at, old.terms_version) then
    raise exception 'dn:order_field_immutable';
  end if;

  if not public.order_status_transition_allowed(old.status, new.status) then
    raise exception 'dn:invalid_transition' using detail = format('%s → %s', old.status, new.status);
  end if;
  if not public.order_payment_transition_allowed(old.payment_status, new.payment_status) then
    raise exception 'dn:invalid_payment_transition' using detail = format('%s → %s', old.payment_status, new.payment_status);
  end if;

  -- Montants : modifiables seulement pendant la vérification (avant la demande de paiement).
  if (new.subtotal_cents, new.shipping_cents, new.discount_cents, new.discount_reason)
     is distinct from (old.subtotal_cents, old.shipping_cents, old.discount_cents, old.discount_reason)
     and not (old.status in ('submitted', 'reviewing') and new.status in ('submitted', 'reviewing', 'awaiting_payment', 'cancelled')) then
    raise exception 'dn:amounts_locked' using detail = 'Montants figés une fois le paiement demandé (repasser en vérification).';
  end if;

  -- Lien de paiement : seulement quand le paiement est (ou devient) demandé.
  if (new.payment_provider, new.payment_url) is distinct from (old.payment_provider, old.payment_url)
     and not (new.status = 'awaiting_payment' or (old.status = 'awaiting_payment' and new.status in ('reviewing', 'cancelled'))) then
    raise exception 'dn:payment_link_locked';
  end if;

  -- Expédition : transporteur et suivi seulement après paiement.
  if (new.shipping_carrier, new.shipping_service, new.tracking_number, new.tracking_url, new.shipped_at)
     is distinct from (old.shipping_carrier, old.shipping_service, old.tracking_number, old.tracking_url, old.shipped_at)
     and new.status not in ('paid', 'preparing_shipment', 'shipped', 'completed') then
    -- Le transporteur pressenti peut être noté avec le devis de livraison, pendant la vérification.
    if (new.tracking_number, new.tracking_url, new.shipped_at) is distinct from (old.tracking_number, old.tracking_url, old.shipped_at)
       or new.status not in ('submitted', 'reviewing') then
      raise exception 'dn:shipping_locked' using detail = 'Suivi et expédition seulement après paiement confirmé.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_orders_guard on public.orders;
create trigger trg_orders_guard before update or delete on public.orders
  for each row execute function public.orders_guard();

-- Lignes : créées avec la commande (même transaction), puis seule la disponibilité
-- confirmée évolue, et seulement pendant la vérification. Jamais supprimées.
create or replace function public.order_items_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'dn:order_item_delete_forbidden';
  end if;
  select * into v_order from public.orders where id = new.order_id;
  if tg_op = 'INSERT' then
    if v_order.status is distinct from 'submitted' or v_order.created_at <> now() then
      raise exception 'dn:order_items_locked' using detail = 'Lignes créées uniquement avec la demande de commande.';
    end if;
    return new;
  end if;
  -- Seul changement toléré hors disponibilité : product_id / variant_id passés à NULL par le
  -- ON DELETE SET NULL d'une suppression dans l'admin catalogue (le snapshot reste intact).
  -- La colonne générée est exclue : elle vaut NULL dans un trigger BEFORE.
  if (new.product_id is not null and new.product_id is distinct from old.product_id)
     or (new.variant_id is not null and new.variant_id is distinct from old.variant_id)
     or (to_jsonb(new) - array['availability_confirmed', 'line_total_cents', 'product_id', 'variant_id'])
        is distinct from (to_jsonb(old) - array['availability_confirmed', 'line_total_cents', 'product_id', 'variant_id']) then
    raise exception 'dn:order_item_immutable';
  end if;
  if new.availability_confirmed is distinct from old.availability_confirmed
     and v_order.status not in ('submitted', 'reviewing') then
    raise exception 'dn:order_items_locked' using detail = 'Disponibilités figées une fois le paiement demandé.';
  end if;
  return new;
end $$;

drop trigger if exists trg_order_items_guard on public.order_items;
create trigger trg_order_items_guard before insert or update or delete on public.order_items
  for each row execute function public.order_items_guard();

-- Sous-total = lignes non déclarées indisponibles (recalculé à chaque confirmation de disponibilité).
create or replace function public.order_items_recompute_subtotal()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  update public.orders o
     set subtotal_cents = coalesce((select sum(i.line_total_cents) from public.order_items i
                                     where i.order_id = o.id and i.availability_confirmed is distinct from false), 0),
         discount_cents = least(o.discount_cents, coalesce((select sum(i.line_total_cents) from public.order_items i
                                     where i.order_id = o.id and i.availability_confirmed is distinct from false), 0))
   where o.id = new.order_id;
  return null;
end $$;

drop trigger if exists trg_order_items_subtotal on public.order_items;
create trigger trg_order_items_subtotal after update of availability_confirmed on public.order_items
  for each row when (old.availability_confirmed is distinct from new.availability_confirmed)
  execute function public.order_items_recompute_subtotal();

-- Journal : chaque changement significatif devient un événement (sans donnée personnelle).
create or replace function public.orders_log_events()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_actor text := coalesce(nullif(current_setting('dn.order_actor', true), ''), 'system');
  v_actor_id uuid := auth.uid();
begin
  if v_actor not in ('customer', 'admin', 'provider', 'system') then v_actor := 'system'; end if;
  if v_actor <> 'admin' then v_actor_id := null; end if;

  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, type, to_status, to_payment_status, actor, details, notify_customer)
    values (new.id, 'created', new.status, new.payment_status, v_actor,
            jsonb_build_object('environment', new.environment, 'country', new.ship_country_code,
                               'subtotal_cents', new.subtotal_cents), true);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events (order_id, type, from_status, to_status, from_payment_status, to_payment_status,
                                     actor, actor_id, notify_customer)
    values (new.id, 'status_changed', old.status, new.status, old.payment_status, new.payment_status, v_actor, v_actor_id,
            new.status in ('awaiting_payment', 'paid', 'shipped', 'cancelled'));
  elsif new.payment_status is distinct from old.payment_status then
    insert into public.order_events (order_id, type, from_payment_status, to_payment_status, actor, actor_id, notify_customer)
    values (new.id, 'payment_status_changed', old.payment_status, new.payment_status, v_actor, v_actor_id,
            new.payment_status = 'refunded');
  end if;
  if (new.shipping_cents, new.shipping_carrier, new.shipping_service, new.shipping_estimate)
     is distinct from (old.shipping_cents, old.shipping_carrier, old.shipping_service, old.shipping_estimate)
     and new.status in ('submitted', 'reviewing') then
    insert into public.order_events (order_id, type, actor, actor_id, details)
    values (new.id, 'shipping_quote_set', v_actor, v_actor_id,
            jsonb_build_object('shipping_cents', new.shipping_cents, 'carrier', new.shipping_carrier));
  end if;
  if (new.discount_cents, new.discount_reason) is distinct from (old.discount_cents, old.discount_reason) then
    insert into public.order_events (order_id, type, actor, actor_id, details)
    values (new.id, 'discount_set', v_actor, v_actor_id, jsonb_build_object('discount_cents', new.discount_cents));
  end if;
  if (new.payment_provider, new.payment_url, new.payment_reference)
     is distinct from (old.payment_provider, old.payment_url, old.payment_reference) then
    insert into public.order_events (order_id, type, actor, actor_id, details)
    values (new.id, 'payment_link_set', v_actor, v_actor_id,
            jsonb_build_object('provider', new.payment_provider, 'has_url', new.payment_url is not null));
  end if;
  if (new.tracking_number, new.tracking_url) is distinct from (old.tracking_number, old.tracking_url)
     or (new.shipping_carrier is distinct from old.shipping_carrier and new.status not in ('submitted', 'reviewing')) then
    insert into public.order_events (order_id, type, actor, actor_id, details)
    values (new.id, 'tracking_set', v_actor, v_actor_id,
            jsonb_build_object('carrier', new.shipping_carrier, 'has_tracking', new.tracking_number is not null));
  end if;
  if new.admin_note is distinct from old.admin_note then
    insert into public.order_events (order_id, type, actor, actor_id) values (new.id, 'note_set', v_actor, v_actor_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_orders_log_events on public.orders;
create trigger trg_orders_log_events after insert or update on public.orders
  for each row execute function public.orders_log_events();

create or replace function public.order_items_log_events()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.order_events (order_id, type, actor, actor_id, details)
  values (new.order_id, 'item_availability_set',
          case when current_setting('dn.order_actor', true) = 'admin' then 'admin' else 'system' end,
          case when current_setting('dn.order_actor', true) = 'admin'
               then auth.uid() end,
          jsonb_build_object('position', new.position, 'available', new.availability_confirmed));
  return null;
end $$;

drop trigger if exists trg_order_items_log_events on public.order_items;
create trigger trg_order_items_log_events after update of availability_confirmed on public.order_items
  for each row when (old.availability_confirmed is distinct from new.availability_confirmed)
  execute function public.order_items_log_events();

-- Journal : append-only (seul notified_at peut être renseigné, une fois).
create or replace function public.order_events_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'dn:order_event_delete_forbidden'; end if;
  if (to_jsonb(new) - 'notified_at') is distinct from (to_jsonb(old) - 'notified_at')
     or old.notified_at is not null or not old.notify_customer then
    raise exception 'dn:order_event_immutable';
  end if;
  return new;
end $$;

drop trigger if exists trg_order_events_guard on public.order_events;
create trigger trg_order_events_guard before update or delete on public.order_events
  for each row execute function public.order_events_guard();

-- ---------------------------------------------------------------------
-- 5) RLS et droits : aucune lecture anonyme ; lecture admin ; aucune
--    écriture directe (tout passe par les fonctions de l'étape 10 / 02).
-- ---------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

drop policy if exists "admin_read_orders" on public.orders;
create policy "admin_read_orders" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "admin_read_order_items" on public.order_items;
create policy "admin_read_order_items" on public.order_items for select to authenticated using (public.is_admin());
drop policy if exists "admin_read_order_events" on public.order_events;
create policy "admin_read_order_events" on public.order_events for select to authenticated using (public.is_admin());

revoke all on public.orders, public.order_items, public.order_events from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.orders, public.order_items, public.order_events from anon, authenticated';
    execute 'grant select on public.orders, public.order_items, public.order_events to authenticated';
    execute 'revoke all on all tables in schema orders_private from anon, authenticated';
  end if;
end $$;

revoke all on function public.orders_guard(), public.order_items_guard(), public.order_items_recompute_subtotal(),
  public.orders_log_events(), public.order_items_log_events(), public.order_events_guard() from public;

commit;
