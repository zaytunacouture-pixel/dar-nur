-- =====================================================================
--  ÉTAPE 11 — 03 : journal des événements de remise Brevo + dédoublonnage
--
--  Le webhook Brevo (Edge Function order-emails-webhook) appelle
--  public.order_emails_delivery_event(message_id, event, at). Ajout :
--    - orders_private.email_delivery_events : journal minimal de CHAQUE événement
--      authentifié reçu (identifiant de message, type, horodatage Brevo, rapproché ou non) ;
--      ni adresse e-mail, ni objet, ni motif brut ; purgé après 90 jours ;
--    - idempotence : un même événement (message, type, horodatage) reçu plusieurs fois
--      (nouvelles tentatives de Brevo) n'est traité qu'une fois.
--  Information administration UNIQUEMENT : aucune commande n'est modifiée.
--  Additif, transactionnel, réexécutable. Rollback : supabase/rollback/20261003_etape11_rollback.sql
-- =====================================================================
begin;

create table if not exists orders_private.email_delivery_events (
  id           bigint generated always as identity primary key,
  message_id   text not null,
  event        text not null,
  event_at     timestamptz not null,
  received_at  timestamptz not null default now(),
  matched      boolean not null,
  constraint uq_email_delivery_events unique (message_id, event, event_at),
  constraint chk_email_delivery_events_msgid check (char_length(message_id) <= 200 and message_id ~ '^[\x21-\x7E]+$'),
  constraint chk_email_delivery_events_event check (event in ('deferred', 'delivered', 'soft_bounce', 'hard_bounce',
                                                             'blocked', 'invalid_email', 'spam', 'error'))
);
create index if not exists idx_email_delivery_events_received on orders_private.email_delivery_events (received_at);
create index if not exists idx_email_delivery_events_msgid on orders_private.email_delivery_events (message_id);

comment on table orders_private.email_delivery_events is
  'Étape 11 — journal des événements de remise Brevo authentifiés (sans donnée personnelle), 90 jours.';

create or replace function public.order_emails_delivery_event(p_message_id text, p_event text, p_at timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_at    timestamptz := least(coalesce(p_at, now()), now());
  v_id    bigint;
  v_count int;
begin
  if p_event is null or p_event not in ('deferred', 'delivered', 'soft_bounce', 'hard_bounce', 'blocked',
                                         'invalid_email', 'spam', 'error') then
    return jsonb_build_object('ok', false, 'error', 'event_ignored');
  end if;
  if p_message_id is null or char_length(p_message_id) > 200 or p_message_id !~ '^[\x21-\x7E]+$' then
    return jsonb_build_object('ok', false, 'error', 'message_id_invalid');
  end if;

  -- Même événement déjà reçu (nouvelle tentative de Brevo) : rien de plus.
  insert into orders_private.email_delivery_events (message_id, event, event_at, matched)
  values (p_message_id, p_event, v_at, false)
  on conflict on constraint uq_email_delivery_events do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', true, 'matched', 0, 'duplicate', true);
  end if;

  update orders_private.order_emails e
     set delivery_status = p_event,
         delivery_event_at = v_at,
         updated_at = now()
   where e.provider_message_id = p_message_id and e.status = 'sent'
     and case
           when p_event in ('hard_bounce', 'blocked', 'invalid_email', 'spam', 'error') then true
           when p_event = 'delivered' then e.delivery_status is null or e.delivery_status in ('deferred', 'soft_bounce', 'delivered')
           else e.delivery_status is null or e.delivery_status in ('deferred', 'soft_bounce')
         end;
  get diagnostics v_count = row_count;
  update orders_private.email_delivery_events
     set matched = v_count > 0 or exists (select 1 from orders_private.order_emails e where e.provider_message_id = p_message_id)
   where id = v_id;
  delete from orders_private.email_delivery_events where received_at < now() - interval '90 days';
  return jsonb_build_object('ok', true, 'matched', v_count, 'duplicate', false);
end $$;

revoke all on orders_private.email_delivery_events from public;
revoke all on function public.order_emails_delivery_event(text, text, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on orders_private.email_delivery_events from anon, authenticated';
    execute 'revoke all on function public.order_emails_delivery_event(text, text, timestamptz) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on orders_private.email_delivery_events from service_role';
    execute 'grant execute on function public.order_emails_delivery_event(text, text, timestamptz) to service_role';
  end if;
end $$;

commit;
