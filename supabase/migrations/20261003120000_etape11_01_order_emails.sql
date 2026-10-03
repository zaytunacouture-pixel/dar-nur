-- =====================================================================
--  ÉTAPE 11 — 01 / 02 : E-MAILS TRANSACTIONNELS — outbox, déclenchement, envoi contrôlé
--
--  Quatre e-mails, et seulement eux : commande reçue, paiement demandé, paiement
--  confirmé, commande expédiée. Prestataire : Brevo (API transactionnelle), appelé
--  UNIQUEMENT par l'Edge Function order-emails, qui détient la clé (secret Edge).
--
--  public.order_events (journal de l'étape 10)
--      └─ trigger AFTER INSERT ─▶ orders_private.order_emails (outbox, même transaction)
--                                   └─ pg_net (après COMMIT) ─▶ Edge Function ─▶ Brevo
--      pg_cron (migration 02) rattrape toutes les 5 min ce qui reste dû.
--
--  Les e-mails sont une CONSÉQUENCE du workflow, jamais sa source de vérité :
--    - aucune fonction de ce fichier ne modifie orders.status ni orders.payment_status ;
--    - une erreur d'outbox ou d'appel réseau n'annule jamais la transaction métier
--      (exception capturée, avertissement journalisé) ;
--    - le contenu n'est pas stocké : il est reconstruit depuis la commande à l'envoi.
--
--  Idempotence (protection principale, en base) :
--    - unique (event_id) : un événement métier → au plus un e-mail ;
--    - unique (order_id, email_type, occurrence) avec occurrence = 1 pour trois types.
--      Seul « paiement demandé » peut se répéter : repasser en vérification puis
--      redemander le paiement fixe un NOUVEAU total, que le client doit recevoir
--      (l'ancien, s'il n'est pas parti, est abandonné « superseded »).
--    - « Réessayer » réutilise la même ligne (jamais de doublon).
--  Brevo reçoit en plus idempotencyKey = id de la ligne (protection secondaire, 30 min).
--
--  Préproduction : une commande de TEST n'est envoyée qu'à une adresse de la liste
--  test_recipients (vide par défaut = aucun envoi). Production : interrupteur séparé
--  production_sending_enabled (faux par défaut). Interrupteur général sending_enabled
--  (faux par défaut) : tant qu'il est faux, rien n'est réclamé ni envoyé.
--
--  Additif : aucune table existante n'est modifiée (un trigger AJOUTÉ sur order_events).
--  Transactionnel, réexécutable. Rollback : supabase/rollback/20261003_etape11_rollback.sql
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) Configuration (singleton privé, aucun secret : le jeton du worker est dans Vault)
-- ---------------------------------------------------------------------
create table if not exists orders_private.email_config (
  id                          boolean primary key default true check (id),
  sending_enabled             boolean not null default false,
  production_sending_enabled  boolean not null default false,
  -- Adresses autorisées pour les commandes de TEST (minuscules). Vide = aucun envoi de test.
  test_recipients             text[] not null default '{}',
  -- Base des liens de suivi (/suivi/#jeton) selon l'environnement de la commande.
  site_url_production         text not null default 'https://dar-nur.fr',
  site_url_test               text,
  -- URL de l'Edge Function order-emails (NULL = aucun appel immédiat ni rattrapage).
  worker_url                  text,
  installed_at                timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint chk_email_config_site_prod check (site_url_production ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  constraint chk_email_config_site_test check (site_url_test is null or site_url_test ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  constraint chk_email_config_worker check (worker_url is null
    or worker_url ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/[a-z0-9-]{1,63}$'),
  constraint chk_email_config_recipients check (
    cardinality(test_recipients) <= 10
    and array_to_string(test_recipients, ',') = lower(array_to_string(test_recipients, ','))
    and array_to_string(test_recipients, ',') !~ '[[:space:]]')
);
insert into orders_private.email_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2) Outbox : une ligne par e-mail à envoyer. Aucun contenu, aucune adresse stockés :
--    destinataire et contenu sont relus depuis la commande au moment de l'envoi.
-- ---------------------------------------------------------------------
create table if not exists orders_private.order_emails (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  event_id             bigint not null references public.order_events(id) on delete cascade,
  email_type           text not null,
  occurrence           smallint not null default 1,
  locale               text not null default 'fr',
  environment          text not null,
  status               text not null default 'pending',
  attempts             smallint not null default 0,
  next_attempt_at      timestamptz not null default now(),
  -- Remis à now() par « Réessayer » : point de départ de l'expiration.
  queued_at            timestamptz not null default now(),
  claim_id             uuid,
  locked_until         timestamptz,
  provider             text not null default 'brevo',
  provider_message_id  text,
  delivery_status      text,
  delivery_event_at    timestamptz,
  last_error           text,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz,
  updated_at           timestamptz not null default now(),
  constraint uq_order_emails_event      unique (event_id),
  constraint uq_order_emails_occurrence unique (order_id, email_type, occurrence),
  constraint chk_order_emails_type      check (email_type in ('order_received', 'payment_requested', 'payment_confirmed', 'order_shipped')),
  constraint chk_order_emails_occ       check (occurrence between 1 and 50 and (occurrence = 1 or email_type = 'payment_requested')),
  constraint chk_order_emails_locale    check (locale in ('fr')),
  constraint chk_order_emails_env       check (environment in ('development', 'preprod', 'production')),
  constraint chk_order_emails_status    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  constraint chk_order_emails_attempts  check (attempts between 0 and 10),
  constraint chk_order_emails_claim     check ((status = 'sending') = (claim_id is not null and locked_until is not null)),
  constraint chk_order_emails_sent      check ((status = 'sent') = (sent_at is not null)),
  constraint chk_order_emails_provider  check (provider = 'brevo'),
  constraint chk_order_emails_msgid     check (provider_message_id is null
    or (status = 'sent' and char_length(provider_message_id) <= 200 and provider_message_id ~ '^[\x21-\x7E]+$')),
  constraint chk_order_emails_delivery  check (delivery_status is null
    or (status = 'sent' and delivery_status in ('deferred', 'delivered', 'soft_bounce', 'hard_bounce', 'blocked',
                                                'invalid_email', 'spam', 'error'))),
  constraint chk_order_emails_error     check (char_length(coalesce(last_error, '')) <= 300)
);
create index if not exists idx_order_emails_due on orders_private.order_emails (next_attempt_at) where status = 'pending';
create index if not exists idx_order_emails_lease on orders_private.order_emails (locked_until) where status = 'sending';
create index if not exists idx_order_emails_order on orders_private.order_emails (order_id, created_at);
create index if not exists idx_order_emails_msgid on orders_private.order_emails (provider_message_id) where provider_message_id is not null;

comment on table orders_private.order_emails is
  'Étape 11 — outbox des e-mails transactionnels (Brevo). Écrite par trigger et par les fonctions '
  'order_emails_* (service_role) / admin_*order_email* (is_admin). Ne pilote jamais le statut d''une commande.';

-- Paramètres : délai avant la tentative n+1 (après n échecs), nombre maximal de tentatives, expiration.
create or replace function orders_private.email_retry_delay(p_attempts int)
returns interval language sql immutable set search_path = pg_catalog as $$
  select case p_attempts when 1 then interval '5 minutes' when 2 then interval '30 minutes'
                         when 3 then interval '2 hours' else null end;
$$;
create or replace function orders_private.email_max_attempts()
returns int language sql immutable set search_path = pg_catalog as $$ select 4 $$;
-- Une notification restée en file plus de 48 h (interrupteur coupé, panne prolongée) n'est plus
-- envoyée automatiquement : elle est abandonnée « expired », l'administration peut la relancer.
create or replace function orders_private.email_expiry()
returns interval language sql immutable set search_path = pg_catalog as $$ select interval '48 hours' $$;

/** Message d'erreur technique minimal : jamais de clé, d'adresse e-mail ni de réponse brute. */
create or replace function orders_private.email_clean_error(p_error text)
returns text language sql immutable set search_path = pg_catalog as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p_error, ''),
           '(xkeysib|xsmtpsib|sb_secret|eyJ)[A-Za-z0-9._-]*', '[secret]', 'g'),
           '[^[:space:]@<>"'']+@[^[:space:]@<>"'']+', '[email]', 'g'),
           '[[:space:][:cntrl:]]+', ' ', 'g')), 300), '');
$$;

-- ---------------------------------------------------------------------
-- 3) Réveil immédiat de l'Edge Function (pg_net, envoyé APRÈS le commit).
--    Sans pg_net, Vault, URL ou interrupteur : ne fait rien (le cron rattrapera).
--    Ne lève JAMAIS d'erreur : la transaction métier ne dépend pas du réseau.
-- ---------------------------------------------------------------------
create or replace function orders_private.kick_order_email_worker(p_reason text default 'event', p_only_if_due boolean default false)
returns boolean language plpgsql volatile security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_url    text;
  v_secret text;
begin
  select c.worker_url into v_url from orders_private.email_config c where c.sending_enabled;
  if v_url is null then return false; end if;
  if p_only_if_due and not exists (
       select 1 from orders_private.order_emails e
        where (e.status = 'pending' and e.next_attempt_at <= now())
           or (e.status = 'sending' and e.locked_until < now())) then
    return false;
  end if;
  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
     into v_secret using 'order_emails_worker_secret';
  if v_secret is null or char_length(v_secret) < 32 then return false; end if;
  execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := $3, timeout_milliseconds := 5000)'
    using v_url, jsonb_build_object('reason', left(coalesce(p_reason, 'event'), 20)),
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret);
  return true;
exception when others then
  raise warning 'order emails: réveil du worker impossible (%)', sqlstate;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 4) Déclenchement : chaque événement métier notifiable crée sa ligne d'outbox,
--    dans la MÊME transaction que l'événement (pas de perte si le réseau tombe).
-- ---------------------------------------------------------------------
create or replace function orders_private.order_events_enqueue_email()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type text;
  v_occ  smallint := 1;
  v_env  text;
begin
  v_type := case
    when new.type = 'created' then 'order_received'
    when new.type = 'status_changed' and new.to_status = 'awaiting_payment' then 'payment_requested'
    when new.type = 'status_changed' and new.to_status = 'shipped' then 'order_shipped'
    -- Paiement confirmé : quelle que soit la source (admin aujourd'hui, prestataire demain).
    when new.type in ('status_changed', 'payment_status_changed') and new.to_payment_status = 'paid'
         and new.from_payment_status is distinct from 'paid' then 'payment_confirmed'
  end;
  if v_type is null then return null; end if;

  begin
    select o.environment into v_env from public.orders o where o.id = new.order_id;
    if v_type = 'payment_requested' then
      -- Une nouvelle demande de paiement remplace la précédente si celle-ci n'est pas partie.
      update orders_private.order_emails
         set status = 'skipped', last_error = 'superseded', updated_at = now()
       where order_id = new.order_id and email_type = 'payment_requested' and status = 'pending';
      select coalesce(max(occurrence), 0) + 1 into v_occ
        from orders_private.order_emails where order_id = new.order_id and email_type = 'payment_requested';
    end if;
    insert into orders_private.order_emails (order_id, event_id, email_type, occurrence, environment)
    values (new.order_id, new.id, v_type, v_occ, v_env)
    on conflict do nothing;
    if found then
      perform orders_private.kick_order_email_worker('event');
    end if;
  exception when others then
    -- Jamais d'échec de la transaction métier à cause d'un e-mail. Le contrôle
    -- supabase/checks/etape11_invariants.sql signale tout événement sans ligne d'outbox.
    raise warning 'order emails: mise en file impossible (%)', sqlstate;
  end;
  return null;
end $$;

drop trigger if exists trg_order_events_enqueue_email on public.order_events;
create trigger trg_order_events_enqueue_email after insert on public.order_events
  for each row execute function orders_private.order_events_enqueue_email();

-- ---------------------------------------------------------------------
-- 5) Données d'un e-mail (pour le worker uniquement) : le strict nécessaire.
--    Ni adresse postale, ni téléphone, ni note interne, ni référence de paiement,
--    ni identifiant interne ; le prénom pour la salutation, l'e-mail pour l'envoi.
-- ---------------------------------------------------------------------
create or replace function orders_private.order_email_payload(p_email orders_private.order_emails, p_site_url text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p_email.id,
    'claim_id', p_email.claim_id,
    'email_type', p_email.email_type,
    'locale', p_email.locale,
    'environment', p_email.environment,
    'attempt', p_email.attempts,
    'recipient', jsonb_build_object('email', o.customer_email, 'first_name', o.customer_first_name),
    'tracking_url', p_site_url || '/suivi/#' || orders_private.order_token(o.id),
    'order', jsonb_build_object(
      'number', o.public_number,
      'created_at', o.created_at,
      'country_code', o.ship_country_code,
      'currency', o.currency,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
                   'name', i.product_name, 'variant', i.variant_label, 'quantity', i.quantity,
                   'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents,
                   'on_demand', i.availability_at_order = 'on_demand',
                   'unavailable', i.availability_confirmed is false) order by i.position)
                 from public.order_items i where i.order_id = o.id), '[]'),
      'subtotal_cents', o.subtotal_cents,
      'total_confirmed', o.total_confirmed_at is not null,
      'shipping_cents', case when o.total_confirmed_at is not null then o.shipping_cents end,
      'discount_cents', case when o.total_confirmed_at is not null then o.discount_cents end,
      'total_cents', case when o.total_confirmed_at is not null then o.total_cents end,
      'has_payment_link', o.status = 'awaiting_payment' and o.payment_url is not null,
      'paid_at', o.paid_at,
      'shipment', case when o.status in ('shipped', 'completed') then jsonb_build_object(
                    'carrier', o.shipping_carrier, 'service', o.shipping_service,
                    'tracking_number', o.tracking_number, 'tracking_url', o.tracking_url,
                    'shipped_at', o.shipped_at) end))
  from public.orders o where o.id = p_email.order_id;
$$;

/** Raison pour laquelle un e-mail ne doit plus partir (NULL = toujours d'actualité). */
create or replace function orders_private.order_email_obsolete(p_email orders_private.order_emails)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_email.queued_at < now() - orders_private.email_expiry() then 'expired'
    when p_email.email_type = 'order_received' and o.status = 'cancelled' then 'obsolete'
    when p_email.email_type = 'payment_requested' and (o.status <> 'awaiting_payment'
         or p_email.occurrence < (select max(e.occurrence) from orders_private.order_emails e
                                   where e.order_id = o.id and e.email_type = 'payment_requested')) then 'obsolete'
    when p_email.email_type = 'payment_confirmed' and (o.payment_status <> 'paid' or o.status = 'cancelled') then 'obsolete'
    when p_email.email_type = 'order_shipped' and o.status not in ('shipped', 'completed') then 'obsolete'
  end
  from public.orders o where o.id = p_email.order_id;
$$;

-- ---------------------------------------------------------------------
-- 6) WORKER (service_role seulement) — réclamer, puis rendre compte.
-- ---------------------------------------------------------------------

/**
 * Réclame jusqu'à p_limit e-mails dus (ou dont le bail a expiré) et les passe « sending »
 * avec un claim_id neuf et un bail de 5 min (FOR UPDATE SKIP LOCKED : deux workers
 * simultanés ne reçoivent jamais la même ligne). Les lignes non envoyables sont
 * abandonnées ici (« skipped ») avec leur raison. Rend les données de rendu.
 */
create or replace function public.order_emails_claim(p_limit int default 10)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cfg    orders_private.email_config%rowtype;
  v_row    orders_private.order_emails%rowtype;
  v_out    jsonb := '[]';
  v_reason text;
  v_email  text;
  v_site   text;
begin
  select * into v_cfg from orders_private.email_config;
  if not coalesce(v_cfg.sending_enabled, false) then
    return v_out;
  end if;
  for v_row in
    select * from orders_private.order_emails e
     where (e.status = 'pending' and e.next_attempt_at <= now())
        or (e.status = 'sending' and e.locked_until < now())
     order by e.next_attempt_at, e.created_at
     limit greatest(1, least(coalesce(p_limit, 10), 25))
     for update skip locked
  loop
    select lower(o.customer_email) into v_email from public.orders o where o.id = v_row.order_id;
    v_site := case when v_row.environment = 'production' then v_cfg.site_url_production else v_cfg.site_url_test end;
    v_reason := case
      when v_row.environment = 'production' and not v_cfg.production_sending_enabled then 'production_sending_disabled'
      when v_row.environment <> 'production' and not (v_email = any (v_cfg.test_recipients)) then 'recipient_not_allowlisted'
      when v_site is null then 'site_url_missing'
      else orders_private.order_email_obsolete(v_row)
    end;
    -- Bail expiré après la dernière tentative autorisée : abandon (pas de boucle infinie).
    if v_reason is null and v_row.status = 'sending' and v_row.attempts >= orders_private.email_max_attempts() then
      update orders_private.order_emails
         set status = 'failed', claim_id = null, locked_until = null,
             last_error = 'lease_expired_after_last_attempt', updated_at = now()
       where id = v_row.id;
      continue;
    end if;
    if v_reason is not null then
      update orders_private.order_emails
         set status = 'skipped', claim_id = null, locked_until = null, last_error = v_reason, updated_at = now()
       where id = v_row.id;
      continue;
    end if;
    update orders_private.order_emails
       set status = 'sending', claim_id = gen_random_uuid(), locked_until = now() + interval '5 minutes',
           attempts = attempts + 1, updated_at = now()
     where id = v_row.id
     returning * into v_row;
    v_out := v_out || jsonb_build_array(orders_private.order_email_payload(v_row, v_site));
  end loop;
  return v_out;
end $$;

/**
 * Compte rendu d'une tentative. p_outcome :
 *   sent     accepté par Brevo (p_message_id = messageId, NULL si doublon reconnu par Brevo)
 *   retry    erreur temporaire : nouvelle tentative selon email_retry_delay, puis « failed »
 *   failed   erreur définitive (requête refusée par Brevo)
 *   skipped  refus du worker (garde-fou de l'Edge Function)
 * Refusé si la ligne n'est plus réclamée par CE claim_id (bail repris par un autre worker).
 */
create or replace function public.order_emails_report(p_id uuid, p_claim_id uuid, p_outcome text,
                                                      p_message_id text default null, p_error text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_row   orders_private.order_emails%rowtype;
  v_msgid text := nullif(btrim(coalesce(p_message_id, '')), '');
  v_err   text := orders_private.email_clean_error(p_error);
  v_delay interval;
begin
  if p_outcome is null or p_outcome not in ('sent', 'retry', 'failed', 'skipped') then
    raise exception 'dn:invalid_outcome';
  end if;
  select * into v_row from orders_private.order_emails where id = p_id for update;
  if not found or v_row.status <> 'sending' or v_row.claim_id is distinct from p_claim_id then
    return jsonb_build_object('ok', false, 'error', 'stale_claim');
  end if;
  if v_msgid is not null and (char_length(v_msgid) > 200 or v_msgid !~ '^[\x21-\x7E]+$') then
    v_msgid := null;
    v_err := coalesce(v_err, 'message_id_invalid');
  end if;

  if p_outcome = 'sent' then
    update orders_private.order_emails
       set status = 'sent', sent_at = now(), provider_message_id = v_msgid, last_error = v_err,
           claim_id = null, locked_until = null, updated_at = now()
     where id = p_id;
    -- Le client est prévenu : l'événement du journal est marqué (la liste « à prévenir » se vide).
    update public.order_events set notified_at = now()
     where id = v_row.event_id and notify_customer and notified_at is null;
    if found then
      insert into public.order_events (order_id, type, actor, details)
      values (v_row.order_id, 'customer_notified', 'system',
              jsonb_build_object('event_id', v_row.event_id, 'channel', 'email', 'email_type', v_row.email_type));
    end if;
  elsif p_outcome = 'retry' then
    v_delay := orders_private.email_retry_delay(v_row.attempts);
    update orders_private.order_emails
       set status = case when v_delay is null or v_row.attempts >= orders_private.email_max_attempts() then 'failed' else 'pending' end,
           next_attempt_at = case when v_delay is null then next_attempt_at else now() + v_delay end,
           last_error = coalesce(v_err, 'temporary_error'),
           claim_id = null, locked_until = null, updated_at = now()
     where id = p_id;
  else
    update orders_private.order_emails
       set status = p_outcome, last_error = coalesce(v_err, p_outcome),
           claim_id = null, locked_until = null, updated_at = now()
     where id = p_id;
  end if;
  select * into v_row from orders_private.order_emails where id = p_id;
  return jsonb_build_object('ok', true, 'status', v_row.status, 'attempts', v_row.attempts,
                            'next_attempt_at', v_row.next_attempt_at);
end $$;

/**
 * Statut de remise transmis par le webhook Brevo (information admin UNIQUEMENT :
 * aucune commande n'est modifiée). Les incidents définitifs priment ; « delivered »
 * remplace un report temporaire ; un report n'écrase jamais un état plus avancé.
 */
create or replace function public.order_emails_delivery_event(p_message_id text, p_event text, p_at timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_count int;
begin
  if p_event is null or p_event not in ('deferred', 'delivered', 'soft_bounce', 'hard_bounce', 'blocked',
                                         'invalid_email', 'spam', 'error') then
    return jsonb_build_object('ok', false, 'error', 'event_ignored');
  end if;
  if p_message_id is null or char_length(p_message_id) > 200 or p_message_id !~ '^[\x21-\x7E]+$' then
    return jsonb_build_object('ok', false, 'error', 'message_id_invalid');
  end if;
  update orders_private.order_emails e
     set delivery_status = p_event,
         delivery_event_at = least(coalesce(p_at, now()), now()),
         updated_at = now()
   where e.provider_message_id = p_message_id and e.status = 'sent'
     and case
           when p_event in ('hard_bounce', 'blocked', 'invalid_email', 'spam', 'error') then true
           when p_event = 'delivered' then e.delivery_status is null or e.delivery_status in ('deferred', 'soft_bounce', 'delivered')
           else e.delivery_status is null or e.delivery_status in ('deferred', 'soft_bounce')
         end;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'matched', v_count);
end $$;

-- ---------------------------------------------------------------------
-- 7) ADMINISTRATION (is_admin) — lecture du bloc « Notifications » et « Réessayer ».
-- ---------------------------------------------------------------------
create or replace function public.admin_order_emails(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cfg orders_private.email_config%rowtype;
  v_env text;
begin
  if not public.is_admin() then
    raise exception 'dn:forbidden' using errcode = '42501';
  end if;
  select environment into v_env from public.orders where id = p_order_id;
  if v_env is null then raise exception 'dn:order_not_found'; end if;
  select * into v_cfg from orders_private.email_config;
  return jsonb_build_object(
    'sending_enabled', v_cfg.sending_enabled,
    'environment_enabled', case when v_env = 'production' then v_cfg.production_sending_enabled
                                else cardinality(v_cfg.test_recipients) > 0 end,
    'emails', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'email_type', e.email_type, 'occurrence', e.occurrence, 'status', e.status,
        'attempts', e.attempts, 'max_attempts', orders_private.email_max_attempts(),
        'next_attempt_at', case when e.status = 'pending' then e.next_attempt_at end,
        'sent_at', e.sent_at, 'delivery_status', e.delivery_status, 'delivery_event_at', e.delivery_event_at,
        'last_error', e.last_error, 'created_at', e.created_at,
        'can_retry', e.status in ('failed', 'skipped') and coalesce(e.last_error, '') not in ('superseded'))
        order by e.created_at, e.occurrence)
      from orders_private.order_emails e where e.order_id = p_order_id), '[]'));
end $$;

/** Commandes à signaler dans la liste : e-mail en échec ou adresse en erreur (rebond, blocage…). */
create or replace function public.admin_order_email_alerts()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'dn:forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(distinct e.order_id) from orders_private.order_emails e
                    where e.status = 'failed'
                       or e.delivery_status in ('hard_bounce', 'blocked', 'invalid_email', 'spam', 'error')), '[]');
end $$;

/** « Réessayer » : la MÊME notification repart (aucune nouvelle ligne, aucun nouveau type). */
create or replace function public.admin_retry_order_email(p_email_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_row orders_private.order_emails%rowtype;
begin
  if not public.is_admin() then
    raise exception 'dn:forbidden' using errcode = '42501';
  end if;
  select * into v_row from orders_private.order_emails where id = p_email_id for update;
  if not found then raise exception 'dn:email_not_found'; end if;
  if v_row.status = 'sent' then raise exception 'dn:email_already_sent'; end if;
  if v_row.status in ('pending', 'sending') then raise exception 'dn:email_in_progress'; end if;
  if v_row.last_error = 'superseded' then raise exception 'dn:email_superseded'; end if;
  update orders_private.order_emails
     set status = 'pending', attempts = 0, next_attempt_at = now(), queued_at = now(),
         last_error = null, updated_at = now()
   where id = p_email_id;
  perform orders_private.kick_order_email_worker('admin_retry');
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;

-- ---------------------------------------------------------------------
-- 8) Droits : rien pour anon ; admin (authenticated + is_admin) pour la lecture et
--    « Réessayer » ; service_role pour le worker et le webhook. Schéma privé fermé.
-- ---------------------------------------------------------------------
revoke all on orders_private.email_config, orders_private.order_emails from public;
revoke all on function orders_private.email_retry_delay(int), orders_private.email_max_attempts(),
  orders_private.email_expiry(), orders_private.email_clean_error(text),
  orders_private.kick_order_email_worker(text, boolean), orders_private.order_events_enqueue_email(),
  orders_private.order_email_payload(orders_private.order_emails, text),
  orders_private.order_email_obsolete(orders_private.order_emails) from public;
revoke all on function public.order_emails_claim(int), public.order_emails_report(uuid, uuid, text, text, text),
  public.order_emails_delivery_event(text, text, timestamptz), public.admin_order_emails(uuid),
  public.admin_order_email_alerts(), public.admin_retry_order_email(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on orders_private.email_config, orders_private.order_emails from anon, authenticated';
    execute 'revoke all on function public.order_emails_claim(int), public.order_emails_report(uuid, uuid, text, text, text), '
            'public.order_emails_delivery_event(text, text, timestamptz), public.admin_order_emails(uuid), '
            'public.admin_order_email_alerts(), public.admin_retry_order_email(uuid) from anon, authenticated';
    execute 'grant execute on function public.admin_order_emails(uuid), public.admin_order_email_alerts(), '
            'public.admin_retry_order_email(uuid) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on orders_private.email_config, orders_private.order_emails from service_role';
    execute 'grant execute on function public.order_emails_claim(int), public.order_emails_report(uuid, uuid, text, text, text), '
            'public.order_emails_delivery_event(text, text, timestamptz) to service_role';
    execute 'revoke all on function public.admin_order_emails(uuid), public.admin_order_email_alerts(), '
            'public.admin_retry_order_email(uuid) from service_role';
  end if;
end $$;

commit;
