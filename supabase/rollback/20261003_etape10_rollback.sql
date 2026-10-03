-- =====================================================================
--  ROLLBACK ÉTAPE 10 — retire TOUT l'ajout des migrations 20261003*_etape10_*.
--
--  ⚠ DÉTRUIT LES COMMANDES ENREGISTRÉES (orders, order_items, order_events).
--  Avant de l'exécuter sur une base contenant de vraies commandes, les exporter
--  (hors dépôt : données personnelles) :
--    select json_agg(o) from public.orders o;  (idem order_items, order_events)
--
--  N'affecte aucune table antérieure (catalogue, offres, admins…) : l'étape 10
--  n'en modifie aucune. Transactionnel, réexécutable.
--  npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f supabase/rollback/20261003_etape10_rollback.sql
-- =====================================================================
begin;

drop function if exists public.admin_order_tracking_token(uuid);
drop function if exists public.admin_update_order(uuid, text, jsonb);
drop function if exists public.get_order_tracking(text);
drop function if exists public.create_order_request(jsonb);
drop function if exists public.check_cart(jsonb);
drop function if exists public.order_country_codes();

drop table if exists public.order_events;
drop table if exists public.order_items;
drop table if exists public.orders;

drop function if exists public.orders_guard();
drop function if exists public.order_items_guard();
drop function if exists public.order_items_recompute_subtotal();
drop function if exists public.orders_log_events();
drop function if exists public.order_items_log_events();
drop function if exists public.order_events_guard();
drop function if exists public.order_status_transition_allowed(text, text);
drop function if exists public.order_payment_transition_allowed(text, text);

drop schema if exists orders_private cascade;

commit;
