-- Administration propriétaire uniquement ; aucune RPC de bascule.
-- Remplacer le motif vide ci-dessous après validation métier/juridique et coordination Astro.
-- Ne change ni les commandes existantes, ni production_ordering_open, ni les réglages e-mails.
begin;
select 'avant' as controle, legacy_ordering_state, legacy_ordering_changed_at, legacy_ordering_reason
  from orders_private.config;
do $$
declare
  v_reason text := '';
  v_count integer;
begin
  if current_user <> pg_get_userbyid((select relowner from pg_class where oid = 'orders_private.config'::regclass)) then
    raise exception 'dn:owner_required';
  end if;
  if nullif(btrim(v_reason), '') is null then raise exception 'dn:reason_required'; end if;
  update orders_private.config
     set legacy_ordering_state = 'open', legacy_ordering_changed_at = clock_timestamp(),
         legacy_ordering_reason = btrim(v_reason);
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'dn:config_singleton_required'; end if;
end $$;
select 'après' as controle, legacy_ordering_state, legacy_ordering_changed_at, legacy_ordering_reason
  from orders_private.config;
commit;
