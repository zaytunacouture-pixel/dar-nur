-- =====================================================================
--  ÉTAPE 10 — contrôles en LECTURE SEULE (une ligne par contrôle, ok = true attendu).
--  npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f supabase/checks/etape10_invariants.sql
--  Ne lit aucune donnée personnelle : seulement des comptes et des métadonnées.
-- =====================================================================
with
  tables as (
    select c.relname, c.relrowsecurity as rls
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('orders', 'order_items', 'order_events')),
  anon_table_grants as (
    select table_name, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('orders', 'order_items', 'order_events') and grantee = 'anon'),
  auth_write_grants as (
    select table_name, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('orders', 'order_items', 'order_events') and grantee = 'authenticated'
       and privilege_type <> 'SELECT'),
  policies as (
    select tablename, policyname, roles, cmd, qual from pg_policies
     where schemaname = 'public' and tablename in ('orders', 'order_items', 'order_events')),
  fn as (
    select p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) as args,
           has_function_privilege('anon', p.oid, 'execute') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('check_cart', 'create_order_request', 'get_order_tracking', 'admin_update_order',
                         'admin_order_tracking_token', 'order_country_codes')),
  private_fn as (
    select count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) as anon_exec
      from pg_proc p where p.pronamespace = 'orders_private'::regnamespace)
select 'rls_enabled' as check_name, (select count(*) = 3 and bool_and(rls) from tables) as ok,
       (select string_agg(relname || '=' || rls, ', ') from tables) as detail
union all
select 'anon_no_table_privilege', not exists (select 1 from anon_table_grants),
       (select string_agg(table_name || ':' || privilege_type, ', ') from anon_table_grants)
union all
select 'authenticated_no_direct_write', not exists (select 1 from auth_write_grants),
       (select string_agg(table_name || ':' || privilege_type, ', ') from auth_write_grants)
union all
select 'policies_admin_select_only', (select count(*) = 3 and bool_and(cmd = 'SELECT' and qual like '%is_admin()%') from policies),
       (select string_agg(tablename || ':' || cmd, ', ') from policies)
union all
select 'public_functions_anon', (select bool_and(anon_exec) from fn where proname in ('check_cart', 'create_order_request', 'get_order_tracking', 'order_country_codes')),
       (select string_agg(proname || '=' || anon_exec, ', ') from fn)
union all
select 'admin_functions_not_anon', (select bool_and(not anon_exec and auth_exec) from fn where proname like 'admin_%'),
       (select string_agg(proname || ' anon=' || anon_exec || ' auth=' || auth_exec, ', ') from fn where proname like 'admin_%')
union all
select 'definer_functions', (select bool_and(prosecdef) from fn where proname <> 'order_country_codes'), null
union all
select 'private_schema_closed', (select anon_exec = 0 from private_fn)
       and not has_schema_privilege('anon', 'orders_private', 'usage')
       and not has_schema_privilege('authenticated', 'orders_private', 'usage'), null
union all
select 'config_singleton', (select count(*) = 1 from orders_private.config), null
union all
select 'production_ordering_closed', (select not production_ordering_open from orders_private.config),
       'ouvrir seulement après révision des CGV'
union all
select 'no_shipped_without_payment', not exists (select 1 from public.orders where status in ('shipped', 'completed') and payment_status <> 'paid'),
       (select count(*)::text from public.orders)
union all
select 'items_snapshot_present', not exists (select 1 from public.order_items where product_name is null or product_slug is null), null
union all
select 'subtotal_matches_items', not exists (
         select 1 from public.orders o
          where o.subtotal_cents <> coalesce((select sum(i.line_total_cents) from public.order_items i
                                               where i.order_id = o.id and i.availability_confirmed is distinct from false), 0)), null
union all
select 'triggers_present', (select count(*) = 6 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                             where c.relname in ('orders', 'order_items', 'order_events') and not t.tgisinternal),
       (select string_agg(t.tgname, ', ') from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where c.relname in ('orders', 'order_items', 'order_events') and not t.tgisinternal);
