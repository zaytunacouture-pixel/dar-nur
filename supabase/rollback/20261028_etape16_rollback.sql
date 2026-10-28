-- Rollback étape 16 uniquement ; aucune commande ni donnée historique touchée.
-- Retire la fermeture : coordonner avec Astro avant exécution. Corps étape 10 exact.
begin;
create or replace function public.create_order_request(p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cfg        orders_private.config%rowtype;
  v_key        uuid;
  v_hash       bytea;
  v_existing   public.orders%rowtype;
  v_ip         bytea;
  v_errors     jsonb := '{}';
  v_c          jsonb;
  v_s          jsonb;
  v_first      text; v_last text; v_email text; v_phone text;
  v_line1      text; v_line2 text; v_postal text; v_city text; v_region text; v_country text; v_instr text;
  v_digits     int;
  v_lines      jsonb;
  v_env        text;
  v_origin     text;
  v_id         uuid := gen_random_uuid();
  v_number     text;
  v_alphabet   constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_rand       bytea;
  v_try        int := 0;
  v_subtotal   int;
  v_line       jsonb;
  v_pos        int := 0;
begin
  perform orders_private.no_store();
  -- 1. Forme et taille (une requête légitime pèse quelques Ko).
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'payload_invalid');
  end if;
  if octet_length(p_payload::text) > 16000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_large');
  end if;
  -- 2. Pot de miel : champ invisible pour un humain, rempli par les robots.
  if coalesce(p_payload->>'website', '') <> '' then
    return jsonb_build_object('ok', false, 'error', 'rejected');
  end if;
  begin
    v_key := (p_payload->>'idempotency_key')::uuid;
  exception when others then
    v_key := null;
  end;
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'payload_invalid');
  end if;
  v_hash := sha256(convert_to((p_payload - 'idempotency_key' - 'website')::text, 'UTF8'));

  -- 3. Idempotence : la même demande renvoyée (double clic, réseau coupé) rend la même commande.
  select * into v_existing from public.orders where idempotency_key = v_key;
  if found then
    if v_existing.request_hash <> v_hash then
      return jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'token', orders_private.order_token(v_existing.id),
                              'order', orders_private.public_view(v_existing.id));
  end if;

  select * into v_cfg from orders_private.config;

  -- 4. Environnement : « production » seulement depuis l'origine dar-nur.fr ET si la
  --    commande en ligne est ouverte (CGV révisées). Tout le reste est une commande de TEST.
  v_origin := lower(coalesce(orders_private.request_headers()->>'origin', ''));
  v_env := case
    when p_payload->>'environment' = 'production' and v_origin in ('https://dar-nur.fr', 'https://www.dar-nur.fr') then 'production'
    when p_payload->>'environment' = 'development' then 'development'
    else 'preprod' end;
  if v_env = 'production' and not v_cfg.production_ordering_open then
    return jsonb_build_object('ok', false, 'error', 'ordering_closed');
  end if;

  -- 5. Limitation de débit (demandes ENREGISTRÉES) : 5 / 10 min et 20 / 24 h par IP, 100 / h au total.
  v_ip := orders_private.client_ip_hash();
  if (select count(*) from orders_private.submissions where created_at > now() - interval '1 hour') >= 100
     or (v_ip is not null and (
          (select count(*) from orders_private.submissions where ip_hash = v_ip and created_at > now() - interval '10 minutes') >= 5
       or (select count(*) from orders_private.submissions where ip_hash = v_ip and created_at > now() - interval '24 hours') >= 20)) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- 6. Coordonnées et adresse (revalidées ici : la validation du navigateur ne suffit pas).
  v_c := case when jsonb_typeof(p_payload->'customer') = 'object' then p_payload->'customer' else '{}' end;
  v_s := case when jsonb_typeof(p_payload->'shipping') = 'object' then p_payload->'shipping' else '{}' end;
  v_first  := orders_private.clean(v_c->'first_name');
  v_last   := orders_private.clean(v_c->'last_name');
  v_email  := orders_private.clean(v_c->'email');
  v_phone  := orders_private.clean(v_c->'phone');
  v_line1  := orders_private.clean(v_s->'address_line1');
  v_line2  := orders_private.clean(v_s->'address_line2');
  v_postal := upper(orders_private.clean(v_s->'postal_code'));
  v_city   := orders_private.clean(v_s->'city');
  v_region := orders_private.clean(v_s->'region');
  v_country := upper(orders_private.clean(v_s->'country_code'));
  v_instr  := orders_private.clean(v_s->'instructions');

  if v_first is null then v_errors := v_errors || '{"first_name":"required"}';
  elsif char_length(v_first) > 80 or orders_private.has_control_chars(v_first) then v_errors := v_errors || '{"first_name":"invalid"}'; end if;
  if v_last is null then v_errors := v_errors || '{"last_name":"required"}';
  elsif char_length(v_last) > 80 or orders_private.has_control_chars(v_last) then v_errors := v_errors || '{"last_name":"invalid"}'; end if;
  if v_email is null then v_errors := v_errors || '{"email":"required"}';
  elsif char_length(v_email) > 254
     or v_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
     or v_email ~ '\.\.' then v_errors := v_errors || '{"email":"invalid"}'; end if;
  if v_phone is null then v_errors := v_errors || '{"phone":"required"}';
  else
    v_digits := char_length(regexp_replace(v_phone, '[^0-9]', '', 'g'));
    if v_phone !~ '^\+?[0-9 ().-]{6,25}$' or v_digits < 6 or v_digits > 15 then v_errors := v_errors || '{"phone":"invalid"}'; end if;
  end if;
  if v_line1 is null then v_errors := v_errors || '{"address_line1":"required"}';
  elsif char_length(v_line1) > 200 or orders_private.has_control_chars(v_line1) then v_errors := v_errors || '{"address_line1":"invalid"}'; end if;
  if char_length(coalesce(v_line2, '')) > 200 or orders_private.has_control_chars(v_line2) then v_errors := v_errors || '{"address_line2":"invalid"}'; end if;
  if v_city is null then v_errors := v_errors || '{"city":"required"}';
  elsif char_length(v_city) > 100 or orders_private.has_control_chars(v_city) then v_errors := v_errors || '{"city":"invalid"}'; end if;
  if char_length(coalesce(v_region, '')) > 100 or orders_private.has_control_chars(v_region) then v_errors := v_errors || '{"region":"invalid"}'; end if;
  if v_country is null then v_errors := v_errors || '{"country_code":"required"}';
  elsif not (v_country = any (public.order_country_codes())) then v_errors := v_errors || '{"country_code":"invalid"}'; end if;
  -- Code postal : obligatoire et à 5 chiffres pour la France seulement ; ailleurs, facultatif
  -- (certains pays n'en ont pas) mais au format alphanumérique court.
  if v_country = 'FR' and (v_postal is null or v_postal !~ '^[0-9]{5}$') then
    v_errors := v_errors || jsonb_build_object('postal_code', case when v_postal is null then 'required' else 'invalid' end);
  elsif v_postal is not null and v_postal !~ '^[A-Z0-9][A-Z0-9 -]{1,14}[A-Z0-9]$' then
    v_errors := v_errors || '{"postal_code":"invalid"}';
  end if;
  if char_length(coalesce(v_instr, '')) > 500 or orders_private.has_control_chars(v_instr, true) then
    v_errors := v_errors || '{"instructions":"invalid"}';
  end if;
  if (p_payload->'terms_accepted') is distinct from 'true'::jsonb then
    v_errors := v_errors || '{"terms_accepted":"required"}';
  end if;
  if v_errors <> '{}' then
    return jsonb_build_object('ok', false, 'error', 'invalid_fields', 'fields', v_errors);
  end if;

  -- 7. Panier : relu et revalidé contre le catalogue actuel. Le moindre écart → aucune commande.
  if jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') = 0 then
    return jsonb_build_object('ok', false, 'error', 'cart_empty');
  end if;
  if jsonb_array_length(p_payload->'items') > 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many_lines');
  end if;
  v_lines := orders_private.resolve_lines(p_payload->'items');
  if exists (select 1 from jsonb_array_elements(v_lines) l where l->>'issue' is not null) then
    return jsonb_build_object('ok', false, 'error', 'cart_changed', 'lines', v_lines);
  end if;
  select sum((l->>'unit_price_cents')::int * (l->>'quantity')::int) into v_subtotal from jsonb_array_elements(v_lines) l;

  -- 8. Numéro public lisible et non séquentiel (DN-AAAA-XXXXXX, alphabet sans 0/O/1/I).
  loop
    v_try := v_try + 1;
    v_rand := uuid_send(gen_random_uuid());
    v_number := 'DN-' || to_char(now() at time zone 'Europe/Paris', 'YYYY') || '-';
    for i in 0..5 loop
      v_number := v_number || substr(v_alphabet, (get_byte(v_rand, i) & 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.orders where public_number = v_number);
    if v_try >= 8 then raise exception 'dn:number_generation_failed'; end if;
  end loop;

  perform set_config('dn.order_actor', 'customer', true);
  begin
    insert into public.orders (id, public_number, token_hash, idempotency_key, request_hash, environment, is_test,
      subtotal_cents, customer_first_name, customer_last_name, customer_email, customer_phone,
      ship_address_line1, ship_address_line2, ship_postal_code, ship_city, ship_region, ship_country_code,
      delivery_instructions, terms_accepted_at, terms_version)
    values (v_id, v_number, orders_private.token_hash(orders_private.order_token(v_id)), v_key, v_hash, v_env,
      v_env <> 'production', v_subtotal, v_first, v_last, v_email, v_phone,
      v_line1, v_line2, v_postal, v_city, v_region, v_country, v_instr, now(), v_cfg.terms_version);
  exception when unique_violation then
    -- Double soumission simultanée : la première a gagné, on renvoie la même commande.
    select * into v_existing from public.orders where idempotency_key = v_key;
    if found and v_existing.request_hash = v_hash then
      return jsonb_build_object('ok', true, 'replayed', true, 'token', orders_private.order_token(v_existing.id),
                                'order', orders_private.public_view(v_existing.id));
    end if;
    raise;
  end;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_pos := v_pos + 1;
    insert into public.order_items (order_id, position, product_id, variant_id, product_slug, product_name,
      variant_label, options, availability_at_order, quantity, list_unit_price_cents, unit_price_cents,
      offer_id, offer_title)
    values (v_id, v_pos, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid,
      v_line->>'product_slug', v_line->>'product_name', v_line->>'variant_label', v_line->'options',
      v_line->>'availability', (v_line->>'quantity')::int, (v_line->>'list_unit_price_cents')::int,
      (v_line->>'unit_price_cents')::int, nullif(v_line->>'offer_id', '')::uuid, v_line->>'offer_title');
  end loop;

  insert into orders_private.submissions (ip_hash) values (v_ip);
  delete from orders_private.submissions where created_at < now() - interval '2 days';

  return jsonb_build_object('ok', true, 'replayed', false, 'token', orders_private.order_token(v_id),
                            'order', orders_private.public_view(v_id));
end $$;

drop trigger if exists trg_00_legacy_ordering_gate on public.orders;
drop trigger if exists trg_00_legacy_ordering_gate on public.order_items;
drop function if exists orders_private.legacy_ordering_insert_guard();
drop function if exists orders_private.legacy_ordering_open();
alter table orders_private.config
  drop column if exists legacy_ordering_state,
  drop column if exists legacy_ordering_changed_at,
  drop column if exists legacy_ordering_reason;
commit;
