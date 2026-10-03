-- =====================================================================
--  ÉTAPE 10 — PURGE EXPLICITE DES COMMANDES DE TEST (NON EXÉCUTÉE)
--
--  Les commandes ne se suppriment jamais en temps normal (triggers orders_guard,
--  order_items_guard, order_events_guard). Ce script, à lancer SEULEMENT sur décision
--  du propriétaire, supprime les commandes de test LISTÉES ci-dessous, et rien d'autre :
--    - refus si un numéro listé n'est pas une commande de test (is_test, hors production) ;
--    - triggers de garde suspendus le temps de la transaction, puis réactivés ;
--    - contrôle final : plus aucune ligne pour ces numéros, triggers actifs.
--  Transactionnel : une erreur annule tout.
--
--  npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f supabase/maintenance/20261003_etape10_purger_commandes_test.sql
-- =====================================================================
begin;

create temporary table purge_numbers on commit drop as
select unnest(array['DN-2026-9EKMFK', 'DN-2026-LLZJXB', 'DN-2026-F6CLJT', 'DN-2026-6R7JG9']::text[]) as public_number;

do $$
begin
  if exists (select 1 from purge_numbers n left join public.orders o using (public_number)
              where o.id is null or not o.is_test or o.environment = 'production') then
    raise exception 'purge refusée : un numéro listé est introuvable ou n''est pas une commande de test';
  end if;
end $$;

alter table public.order_events disable trigger trg_order_events_guard;
alter table public.order_items disable trigger trg_order_items_guard;
alter table public.orders disable trigger trg_orders_guard;

delete from public.order_events where order_id in (select o.id from public.orders o join purge_numbers using (public_number));
delete from public.order_items where order_id in (select o.id from public.orders o join purge_numbers using (public_number));
delete from public.orders where public_number in (select public_number from purge_numbers);

alter table public.order_events enable trigger trg_order_events_guard;
alter table public.order_items enable trigger trg_order_items_guard;
alter table public.orders enable trigger trg_orders_guard;

do $$
begin
  if exists (select 1 from public.orders o join purge_numbers using (public_number)) then
    raise exception 'purge incomplète';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('trg_orders_guard', 'trg_order_items_guard', 'trg_order_events_guard')
              and tgenabled = 'D') then
    raise exception 'trigger de garde resté désactivé';
  end if;
end $$;

commit;
