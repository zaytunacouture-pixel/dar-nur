-- =====================================================================
--  ÉTAPE 11 — contrôles en LECTURE SEULE (une ligne par contrôle, ok = true attendu).
--  npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f supabase/checks/etape11_invariants.sql
--  Ne lit aucune donnée personnelle : seulement des comptes et des métadonnées.
-- =====================================================================
with
  cfg as (select * from orders_private.email_config),
  fn as (
    select p.proname,
           has_function_privilege('anon', p.oid, 'execute') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
           p.prosecdef
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('order_emails_claim', 'order_emails_report', 'order_emails_delivery_event',
                         'admin_order_emails', 'admin_order_email_alerts', 'admin_retry_order_email')),
  notifiable as (
    -- Événements métier qui DOIVENT avoir une ligne d'outbox (depuis l'installation).
    select e.id from public.order_events e, cfg
     where e.created_at >= cfg.installed_at
       and (e.type = 'created'
         or (e.type = 'status_changed' and e.to_status in ('awaiting_payment', 'shipped'))
         or (e.type in ('status_changed', 'payment_status_changed') and e.to_payment_status = 'paid'
             and e.from_payment_status is distinct from 'paid')))
select 'config_singleton' as check_name, (select count(*) = 1 from cfg) as ok, null as detail
union all
select 'worker_functions_not_public', (select bool_and(not anon_exec and not auth_exec) from fn where proname like 'order_emails_%'),
       (select string_agg(proname || ' anon=' || anon_exec || ' auth=' || auth_exec, ', ') from fn where proname like 'order_emails_%')
union all
select 'admin_functions_not_anon', (select bool_and(not anon_exec and auth_exec) from fn where proname like 'admin_%'),
       (select string_agg(proname || ' anon=' || anon_exec, ', ') from fn where proname like 'admin_%')
union all
select 'definer_functions', (select count(*) = 6 and bool_and(prosecdef) from fn), null
union all
select 'outbox_private', not has_table_privilege('anon', 'orders_private.order_emails', 'select')
       and not has_table_privilege('authenticated', 'orders_private.order_emails', 'select'), null
union all
select 'trigger_present', exists (select 1 from pg_trigger where tgname = 'trg_order_events_enqueue_email' and tgenabled <> 'D'), null
union all
select 'every_event_enqueued', not exists (select 1 from notifiable n where not exists (
         select 1 from orders_private.order_emails m where m.event_id = n.id)),
       (select count(*)::text || ' événement(s) notifiable(s)' from notifiable)
union all
select 'one_email_per_event', not exists (select event_id from orders_private.order_emails group by event_id having count(*) > 1), null
union all
select 'single_occurrence_types', not exists (select 1 from orders_private.order_emails
         where email_type <> 'payment_requested' group by order_id, email_type having count(*) > 1), null
union all
select 'no_infinite_retry', not exists (select 1 from orders_private.order_emails where attempts > orders_private.email_max_attempts()), null
union all
select 'no_stuck_lease', not exists (select 1 from orders_private.order_emails
         where status = 'sending' and locked_until < now() - interval '30 minutes'),
       'bail expiré depuis plus de 30 min : le rattrapage (cron) ne tourne pas'
union all
select 'production_sending_state', true,
       (select format('sending_enabled=%s production_sending_enabled=%s test_recipients=%s worker_url=%s',
                      sending_enabled, production_sending_enabled, cardinality(test_recipients), worker_url is not null) from cfg)
union all
select 'outbox_status', true,
       (select coalesce(string_agg(status || '=' || n, ', '), 'vide') from (
          select status, count(*) as n from orders_private.order_emails group by status order by status) s);
