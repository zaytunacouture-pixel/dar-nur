-- Lecture seule, à exécuter comme propriétaire ; aucun secret affiché.
select 'config : singleton et état autorisé' as check_name,
       count(*) = 1 and bool_and(legacy_ordering_state in ('open', 'closed')) as ok,
       string_agg(legacy_ordering_state, ', ') as detail
  from orders_private.config
union all
select 'config : état NOT NULL, défaut open, contrainte validée',
       exists (select 1 from information_schema.columns where table_schema = 'orders_private'
         and table_name = 'config' and column_name = 'legacy_ordering_state'
         and is_nullable = 'NO' and column_default = '''open''::text')
       and exists (select 1 from pg_constraint where conrelid = 'orders_private.config'::regclass
         and conname = 'chk_legacy_ordering_state' and convalidated), null
union all
select 'config : fermeture horodatée et motivée',
       count(*) = 1 and bool_and(legacy_ordering_state <> 'closed' or
         (legacy_ordering_changed_at is not null and nullif(btrim(legacy_ordering_reason), '') is not null)), null
  from orders_private.config
union all
select 'triggers : deux BEFORE INSERT actifs ALWAYS',
       count(*) = 2 and bool_and(tgenabled = 'A' and tgtype = 7
         and tgfoid = 'orders_private.legacy_ordering_insert_guard()'::regprocedure), null
  from pg_trigger where tgname = 'trg_00_legacy_ordering_gate'
    and tgrelid in ('public.orders'::regclass, 'public.order_items'::regclass)
union all
select 'anon/authenticated : aucun accès schéma, config ou fonctions de verrou',
       bool_and(not has_schema_privilege(r, 'orders_private', 'USAGE')
         and not has_table_privilege(r, 'orders_private.config', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         and not has_any_column_privilege(r, 'orders_private.config', 'SELECT,INSERT,UPDATE,REFERENCES')
         and not has_function_privilege(r, 'orders_private.legacy_ordering_open()', 'EXECUTE')
         and not has_function_privilege(r, 'orders_private.legacy_ordering_insert_guard()', 'EXECUTE')), null
  from unnest(array['anon', 'authenticated']) r
union all
select 'fonctions du verrou : privées, SECURITY DEFINER, chemin fixé',
       count(*) = 2 and bool_and(p.prosecdef and p.proconfig = array['search_path=pg_catalog']
         and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                          where a.grantee = 0 and a.privilege_type = 'EXECUTE')), null
  from pg_proc p where p.oid in ('orders_private.legacy_ordering_open()'::regprocedure,
                               'orders_private.legacy_ordering_insert_guard()'::regprocedure)
union all
select 'tables historiques : RLS active et aucune écriture publique',
       count(*) = 6 and bool_and(c.relrowsecurity and
         not has_table_privilege(r, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')), null
  from pg_class c cross join unnest(array['anon', 'authenticated']) r
 where c.oid in ('public.orders'::regclass, 'public.order_items'::regclass, 'public.order_events'::regclass);
