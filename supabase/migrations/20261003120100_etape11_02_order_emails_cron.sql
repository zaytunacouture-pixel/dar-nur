-- =====================================================================
--  ÉTAPE 11 — 02 / 02 : E-MAILS — rattrapage périodique (pg_cron)
--
--  Toutes les 5 minutes : si au moins un e-mail est dû (nouvelle tentative, bail
--  expiré, réveil immédiat perdu), réveille l'Edge Function order-emails par pg_net.
--  Aucun appel tant que email_config.sending_enabled est faux ou worker_url NULL,
--  ni quand rien n'est dû (orders_private.kick_order_email_worker(..., true)).
--
--  pg_cron est activé ici s'il est disponible (Supabase : oui ; banc PGlite : non,
--  la migration ne fait alors rien). Le cron existant n'est remplacé que s'il porte
--  le même nom. Transactionnel, réexécutable.
--  Rollback : supabase/rollback/20261003_etape11_rollback.sql (désinscrit la tâche,
--  laisse l'extension installée).
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponible : rattrapage non planifié (seul le réveil immédiat fonctionne)';
    return;
  end if;
  create extension if not exists pg_cron;
  -- SQL dynamique : le schéma cron n'existe qu'une fois l'extension créée.
  execute 'select cron.unschedule(jobid) from cron.job where jobname = $1' using 'dar-nur-order-emails';
  execute 'select cron.schedule($1, $2, $3)'
    using 'dar-nur-order-emails', '*/5 * * * *', 'select orders_private.kick_order_email_worker(''cron'', true)';
end $$;

commit;
