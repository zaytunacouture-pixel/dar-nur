-- =====================================================================
--  ÉTAPE 11 — PURGE EXPLICITE DES COMMANDES DE TEST DE L'ÉTAPE 11B
--
--  Même modèle que supabase/maintenance/20261003_etape10_purger_commandes_test.sql, étendu aux
--  données de l'étape 11. Supprime les commandes de test LISTÉES ci-dessous, et rien d'autre :
--    - refus si un numéro listé est introuvable ou n'est pas une commande de test
--      (is_test, hors production) ;
--    - journal Brevo (orders_private.email_delivery_events) : seulement les événements dont
--      l'identifiant de message appartient à un e-mail de ces commandes ;
--    - outbox (orders_private.order_emails), journal (order_events), lignes, commandes ;
--    - triggers de garde suspendus le temps de la transaction, puis réactivés ;
--    - contrôle final : plus aucune ligne pour ces numéros, aucune autre commande touchée,
--      triggers actifs.
--  Ne touche ni au schéma, ni à la configuration (email_config, config), ni aux secrets, ni à
--  pg_cron. Transactionnel : une erreur annule tout.
--
--  npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f supabase/maintenance/20261006_etape11_purger_commandes_test.sql
-- =====================================================================
begin;

create temporary table purge_numbers on commit drop as
select unnest(array['DN-2026-GA58EZ', 'DN-2026-LB2P84', 'DN-2026-VBBHLT']::text[]) as public_number;

do $$
begin
  if exists (select 1 from purge_numbers n left join public.orders o using (public_number)
              where o.id is null or not o.is_test or o.environment = 'production') then
    raise exception 'purge refusée : un numéro listé est introuvable ou n''est pas une commande de test';
  end if;
end $$;

create temporary table purge_orders on commit drop as
select o.id from public.orders o join purge_numbers using (public_number);
create temporary table purge_kept on commit drop as
select id from public.orders where id not in (select id from purge_orders);

delete from orders_private.email_delivery_events
 where message_id in (select m.provider_message_id from orders_private.order_emails m
                       where m.order_id in (select id from purge_orders) and m.provider_message_id is not null);
delete from orders_private.order_emails where order_id in (select id from purge_orders);

alter table public.order_events disable trigger trg_order_events_guard;
alter table public.order_items disable trigger trg_order_items_guard;
alter table public.orders disable trigger trg_orders_guard;

delete from public.order_events where order_id in (select id from purge_orders);
delete from public.order_items where order_id in (select id from purge_orders);
delete from public.orders where id in (select id from purge_orders);

alter table public.order_events enable trigger trg_order_events_guard;
alter table public.order_items enable trigger trg_order_items_guard;
alter table public.orders enable trigger trg_orders_guard;

do $$
begin
  if exists (select 1 from public.orders o join purge_numbers using (public_number))
     or exists (select 1 from orders_private.order_emails where order_id in (select id from purge_orders))
     or exists (select 1 from public.order_events where order_id in (select id from purge_orders)) then
    raise exception 'purge incomplète';
  end if;
  if exists (select 1 from purge_kept k left join public.orders o on o.id = k.id where o.id is null) then
    raise exception 'purge refusée : une commande non listée aurait été supprimée';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('trg_orders_guard', 'trg_order_items_guard', 'trg_order_events_guard')
              and tgenabled = 'D') then
    raise exception 'trigger de garde resté désactivé';
  end if;
end $$;

commit;
