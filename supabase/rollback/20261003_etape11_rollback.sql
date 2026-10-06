-- =====================================================================
--  ROLLBACK ÉTAPE 11 — retire TOUT l'ajout des migrations 20261003*_etape11_*.
--
--  Supprime l'outbox (historique des notifications : types, statuts, identifiants
--  Brevo — aucun contenu d'e-mail n'y est stocké) et la configuration des e-mails.
--  Ne touche à AUCUNE commande, ligne ou événement : les tables de l'étape 10 restent
--  intactes (le trigger ajouté sur order_events est retiré). Les champs notified_at
--  déjà renseignés par un envoi restent renseignés (journal append-only).
--  pg_cron reste installé (seule la tâche dar-nur-order-emails est désinscrite).
--  Secrets à retirer à la main si l'étape est abandonnée : Vault
--  « order_emails_worker_secret », secrets Edge BREVO_* / ORDER_EMAILS_*.
--  Transactionnel, réexécutable.
--  npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f supabase/rollback/20261003_etape11_rollback.sql
-- =====================================================================
begin;

do $$
begin
  -- SQL dynamique : cron.job n'existe pas sans pg_cron (le bloc doit rester compilable).
  if to_regclass('cron.job') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = $1' using 'dar-nur-order-emails';
  end if;
end $$;

drop trigger if exists trg_order_events_enqueue_email on public.order_events;

drop function if exists public.admin_retry_order_email(uuid);
drop function if exists public.admin_order_email_alerts();
drop function if exists public.admin_order_emails(uuid);
drop function if exists public.order_emails_delivery_event(text, text, timestamptz);
drop function if exists public.order_emails_report(uuid, uuid, text, text, text);
drop function if exists public.order_emails_claim(int);

drop function if exists orders_private.order_email_obsolete(orders_private.order_emails);
drop function if exists orders_private.order_email_payload(orders_private.order_emails, text);
drop function if exists orders_private.order_events_enqueue_email();
drop function if exists orders_private.kick_order_email_worker(text, boolean);
drop function if exists orders_private.email_clean_error(text);
drop function if exists orders_private.email_expiry();
drop function if exists orders_private.email_max_attempts();
drop function if exists orders_private.email_retry_delay(int);

drop table if exists orders_private.email_delivery_events;
drop table if exists orders_private.order_emails;
drop table if exists orders_private.email_config;

commit;
