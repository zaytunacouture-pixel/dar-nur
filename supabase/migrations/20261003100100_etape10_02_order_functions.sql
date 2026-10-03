-- =====================================================================
--  ÉTAPE 10 — 02 / 02 : COMMANDES — fonctions (seuls points d'écriture)
--
--  Public (anon) :
--    check_cart(items)              recalcule un panier (prix, disponibilité) — lecture seule
--    create_order_request(payload)  enregistre une DEMANDE de commande (aucun paiement)
--    get_order_tracking(token)      suivi client par jeton imprévisible
--  Administration (is_admin) :
--    admin_update_order(id, action, data)   toutes les transitions, contrôlées
--    admin_order_tracking_token(id)         lien de suivi à renvoyer au client
--
--  Le navigateur ne fournit que des identifiants, des quantités et le prix qu'il
--  AFFICHE : le prix est relu ici depuis le catalogue ; un écart bloque la demande.
--  Fonctions SECURITY DEFINER (propriétaire : postgres) : la RLS des tables de
--  commande reste fermée à anon. Aucune clé secrète n'est nécessaire côté site.
--  Transactionnel, réexécutable. Rollback : supabase/rollback/20261003_etape10_rollback.sql
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Pays : ISO 3166-1 alpha-2, territoires sans population civile exclus
-- (AQ, BV, GS, HM, UM). Doit rester identique à site/src/config/countries.ts
-- (contrôlé par scripts/test/schema/orders.mjs). Accepter un pays ne promet
-- pas sa desserte : Dar Nūr confirme la livraison et ses frais avant paiement.
-- ---------------------------------------------------------------------
create or replace function public.order_country_codes()
returns text[] language sql immutable set search_path = pg_catalog as $$
  select array[
    'AD','AE','AF','AG','AI','AL','AM','AO','AR','AS','AT','AU','AW','AX','AZ',
    'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BW','BY','BZ',
    'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
    'DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR',
    'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GT','GU','GW','GY',
    'HK','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP',
    'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
    'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
    'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM',
    'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW',
    'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
    'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
    'UA','UG','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW'
  ]::text[];
$$;

-- ---------------------------------------------------------------------
-- Outils privés
-- ---------------------------------------------------------------------

/** Réponses personnelles : jamais mises en cache (en-tête HTTP posé par PostgREST). */
create or replace function orders_private.no_store()
returns void language sql volatile set search_path = pg_catalog as $$
  select set_config('response.headers', '[{"Cache-Control": "no-store, private"}]', true);
$$;

/** En-têtes HTTP transmis par l'API (PostgREST) ; NULL hors requête HTTP. */
create or replace function orders_private.request_headers()
returns json language plpgsql stable set search_path = pg_catalog as $$
begin
  return nullif(current_setting('request.headers', true), '')::json;
exception when others then
  return null;
end $$;

/** Empreinte salée de l'IP du client (jamais l'IP en clair). */
create or replace function orders_private.client_ip_hash()
returns bytea language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  h json := orders_private.request_headers();
  ip text;
begin
  if h is null then return null; end if;
  ip := coalesce(nullif(btrim(h->>'cf-connecting-ip'), ''),
                 nullif(btrim(split_part(h->>'x-forwarded-for', ',', 1)), ''),
                 nullif(btrim(h->>'x-real-ip'), ''));
  if ip is null then return null; end if;
  return (select sha256(c.ip_salt || convert_to(ip, 'UTF8')) from orders_private.config c);
end $$;

/** Jeton de suivi d'une commande : dérivé (rejouable pour l'idempotence), jamais stocké. */
create or replace function orders_private.order_token(p_order_id uuid)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select rtrim(translate(encode(sha256(c.token_secret || uuid_send(p_order_id)), 'base64'), '+/', '-_'), '=')
    from orders_private.config c;
$$;

create or replace function orders_private.token_hash(p_token text)
returns bytea language sql immutable set search_path = pg_catalog as $$
  select sha256(convert_to(p_token, 'UTF8'));
$$;

/** Texte saisi : rogné ; NULL si vide. Les caractères de contrôle sont refusés par l'appelant. */
create or replace function orders_private.clean(p_value jsonb)
returns text language sql immutable set search_path = pg_catalog as $$
  select case when jsonb_typeof(p_value) = 'string' then nullif(btrim(p_value #>> '{}'), '') end;
$$;

create or replace function orders_private.has_control_chars(p_text text, p_multiline boolean default false)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select case when p_text is null then false
              when p_multiline then p_text ~ '[\x01-\x09\x0B\x0C\x0E-\x1F\x7F]'
              else p_text ~ '[\x01-\x1F\x7F]' end;
$$;

/** URL https valable pour un lien de paiement ou de suivi (hôtes de paiement éventuellement restreints). */
create or replace function orders_private.valid_admin_url(p_url text, p_kind text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_host text;
  v_allowed text[];
begin
  if p_url is null then return true; end if;
  if char_length(p_url) > 2000 or p_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
    return false;
  end if;
  v_host := lower(substring(p_url from '^https://([A-Za-z0-9.-]+)'));
  if v_host !~ '\.' or v_host ~ '(^|\.)(localhost|local|internal)$' or v_host ~ '^[0-9.]+$' then
    return false;
  end if;
  if p_kind = 'payment' then
    select payment_allowed_hosts into v_allowed from orders_private.config;
    if cardinality(v_allowed) > 0
       and not exists (select 1 from unnest(v_allowed) a where v_host = lower(a) or v_host like '%.' || lower(a)) then
      return false;
    end if;
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Résolution d'un panier contre le catalogue ACTUEL
--   entrée : [{ product_id, variant_id|null, quantity, unit_price_cents }]
--   sortie : une entrée par ligne, avec `issue` NULL si la ligne est commandable telle quelle.
--   issues : invalid_line, invalid_quantity, not_found, unavailable, variant_required,
--            variant_mismatch, variant_unavailable, no_price, price_changed, duplicate_line
-- ---------------------------------------------------------------------
create or replace function orders_private.resolve_lines(p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_item      jsonb;
  v_out       jsonb := '[]';
  v_index     int := 0;
  v_pid       uuid;
  v_vid       uuid;
  v_qty       int;
  v_expected  int;
  v_issue     text;
  v_seen      text[] := '{}';
  v_key       text;
  v_found     boolean;
  v_slug      text;
  v_name      text;
  v_status    text;
  v_active    boolean;
  v_avail     text;
  v_base      numeric;
  v_has_var   boolean;
  v_var_found boolean;
  v_var_prod  uuid;
  v_var_name  text;
  v_var_price numeric;
  v_var_act   boolean;
  v_list      int;
  v_unit      int;
  v_offer_id  uuid;
  v_offer_t   text;
  v_offer_p   int;
  v_options   jsonb;
  v_label     text;
begin
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    v_issue := null; v_pid := null; v_vid := null; v_qty := null; v_expected := null;
    v_slug := null; v_name := null; v_avail := null; v_has_var := false;
    v_list := null; v_unit := null; v_offer_id := null; v_offer_t := null; v_offer_p := null;
    v_options := '[]'; v_label := null;

    if jsonb_typeof(v_item) <> 'object' then
      v_issue := 'invalid_line';
    else
      begin
        v_pid := (v_item->>'product_id')::uuid;
        v_vid := nullif(v_item->>'variant_id', '')::uuid;
      exception when others then
        v_issue := 'invalid_line';
      end;
      if v_pid is null then v_issue := coalesce(v_issue, 'invalid_line'); end if;
      -- Quantité : entier JSON strictement positif (ni 0, ni négatif, ni décimal, ni texte).
      if jsonb_typeof(v_item->'quantity') = 'number' and (v_item->>'quantity') ~ '^[0-9]{1,6}$' then
        v_qty := (v_item->>'quantity')::int;
      end if;
      if v_qty is null or v_qty < 1 or v_qty > 99 then v_issue := coalesce(v_issue, 'invalid_quantity'); end if;
      if jsonb_typeof(v_item->'unit_price_cents') = 'number' and (v_item->>'unit_price_cents') ~ '^[0-9]{1,8}$' then
        v_expected := (v_item->>'unit_price_cents')::int;
      end if;
    end if;

    if v_issue is null then
      v_key := v_pid::text || '/' || coalesce(v_vid::text, '-');
      if v_key = any(v_seen) then v_issue := 'duplicate_line'; end if;
      v_seen := v_seen || v_key;
    end if;

    if v_issue is null then
      select true, pr.slug, pr.name, pr.status, pr.active, pr.availability, pr.price_value
        into v_found, v_slug, v_name, v_status, v_active, v_avail, v_base
        from public.products pr where pr.id = v_pid;
      if v_found is not true or v_status <> 'published' or v_active is not true then
        v_issue := 'not_found';
        v_slug := null; v_name := null; v_avail := null;
      elsif v_avail is null or v_avail not in ('available', 'on_demand') then
        v_issue := 'unavailable';
      end if;
      v_found := null;
    end if;

    if v_issue is null then
      v_has_var := exists (select 1 from public.product_variants pv where pv.product_id = v_pid);
      if v_has_var and v_vid is null then
        v_issue := 'variant_required';
      elsif v_vid is not null then
        v_var_found := null;
        select true, pv.product_id, pv.name, pv.price, pv.active
          into v_var_found, v_var_prod, v_var_name, v_var_price, v_var_act
          from public.product_variants pv where pv.id = v_vid;
        if v_var_found is not true or v_var_prod <> v_pid then
          v_issue := 'variant_mismatch';
        elsif v_var_act is not true then
          v_issue := 'variant_unavailable';
        end if;
      end if;
    end if;

    if v_issue is null then
      v_list := round(coalesce(case when v_vid is not null then v_var_price end, v_base) * 100)::int;
      if v_list is null or v_list <= 0 then v_issue := 'no_price'; end if;
    end if;

    if v_issue is null then
      v_unit := v_list;
      -- Promotion produit (table offers) appliquée seulement si elle est PROUVÉE, même règle
      -- que l'étape 7 : offre product_promo active et en cours, produit sans variante dont le
      -- prix réel est exactement le prix de référence de l'offre. Jamais pour un pack.
      if not v_has_var then
        select o.id, o.title, round(o.promo_price * 100)::int into v_offer_id, v_offer_t, v_offer_p
          from public.offers o join public.offer_products op on op.offer_id = o.id
         where o.type = 'product_promo' and o.active
           and (o.starts_at is null or o.starts_at <= now()) and (o.ends_at is null or o.ends_at > now())
           and o.promo_price > 0 and o.normal_price is not null and o.promo_price < o.normal_price
           and round(o.normal_price * 100)::int = v_list and op.product_id = v_pid
         order by o.promo_price, o.sort_order, o.id
         limit 1;
        if v_offer_id is not null then v_unit := v_offer_p; end if;
      end if;
      if v_vid is not null then
        select coalesce(jsonb_agg(jsonb_build_object('axis', ot.id, 'axis_label', ot.name, 'value', ov.label)
                                  order by ot.sort_order, ot.id), '[]'),
               string_agg(ov.label, ' · ' order by ot.sort_order, ot.id)
          into v_options, v_label
          from public.product_variant_options pvo
          join public.option_types ot on ot.id = pvo.option_type_id
          join public.option_values ov on ov.id = pvo.option_value_id
         where pvo.variant_id = v_vid;
        v_label := coalesce(v_label, nullif(btrim(v_var_name), ''));
      end if;
      if v_expected is distinct from v_unit then v_issue := 'price_changed'; end if;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'product_id', v_pid, 'variant_id', v_vid, 'quantity', v_qty,
      'issue', v_issue,
      'product_slug', v_slug, 'product_name', v_name,
      'variant_label', v_label, 'options', v_options,
      'availability', v_avail,
      'list_unit_price_cents', v_list,
      'unit_price_cents', v_unit,
      'expected_unit_price_cents', v_expected,
      'offer_id', v_offer_id, 'offer_title', v_offer_t));
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- Vue client d'une commande (confirmation, suivi) : AUCUNE adresse, aucun
-- e-mail, aucun téléphone, aucune note interne, aucune référence privée.
-- Montants de livraison / remise / total montrés seulement une fois confirmés.
-- ---------------------------------------------------------------------
create or replace function orders_private.public_view(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'number', o.public_number,
    'status', o.status,
    'payment_status', o.payment_status,
    'environment', o.environment,
    'created_at', o.created_at,
    'country_code', o.ship_country_code,
    'currency', o.currency,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                 'name', i.product_name, 'slug', i.product_slug, 'variant', i.variant_label,
                 'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents,
                 'list_unit_price_cents', i.list_unit_price_cents, 'offer', i.offer_title,
                 'line_total_cents', i.line_total_cents,
                 'on_demand', i.availability_at_order = 'on_demand',
                 'unavailable', i.availability_confirmed is false) order by i.position)
               from public.order_items i where i.order_id = o.id), '[]'),
    'subtotal_cents', o.subtotal_cents,
    'total_confirmed', o.total_confirmed_at is not null,
    'shipping_cents', case when o.total_confirmed_at is not null then o.shipping_cents end,
    'discount_cents', case when o.total_confirmed_at is not null then o.discount_cents end,
    'total_cents', case when o.total_confirmed_at is not null then o.total_cents end,
    'shipping_estimate', case when o.total_confirmed_at is not null then o.shipping_estimate end,
    'payment_url', case when o.status = 'awaiting_payment' then o.payment_url end,
    'payment_provider', case when o.status = 'awaiting_payment' then o.payment_provider end,
    'paid_at', o.paid_at,
    'shipment', case when o.status in ('shipped', 'completed') then jsonb_build_object(
                  'carrier', o.shipping_carrier, 'service', o.shipping_service,
                  'tracking_number', o.tracking_number, 'tracking_url', o.tracking_url,
                  'shipped_at', o.shipped_at) end,
    'completed_at', o.completed_at,
    'cancelled_at', o.cancelled_at)
  from public.orders o where o.id = p_order_id;
$$;

-- ---------------------------------------------------------------------
-- PUBLIC — recalcul d'un panier (affichage des écarts avant la demande)
-- ---------------------------------------------------------------------
create or replace function public.check_cart(p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_lines jsonb;
begin
  perform orders_private.no_store();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or octet_length(p_items::text) > 8000
     or jsonb_array_length(p_items) > 30 then
    return jsonb_build_object('ok', false, 'error', 'payload_invalid');
  end if;
  v_lines := orders_private.resolve_lines(p_items);
  return jsonb_build_object(
    'ok', true,
    'lines', v_lines,
    'valid', not exists (select 1 from jsonb_array_elements(v_lines) l where l->>'issue' is not null),
    'subtotal_cents', coalesce((select sum((l->>'unit_price_cents')::int * (l->>'quantity')::int)
                                  from jsonb_array_elements(v_lines) l
                                 where l->>'issue' is null or l->>'issue' = 'price_changed'), 0));
end $$;

-- ---------------------------------------------------------------------
-- PUBLIC — création d'une DEMANDE de commande (aucun paiement)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- PUBLIC — suivi par jeton (43 caractères base64url, 256 bits)
-- ---------------------------------------------------------------------
create or replace function public.get_order_tracking(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  perform orders_private.no_store();
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('found', false);
  end if;
  select id into v_id from public.orders where token_hash = orders_private.token_hash(p_token);
  if v_id is null then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true, 'order', orders_private.public_view(v_id));
end $$;

-- ---------------------------------------------------------------------
-- ADMINISTRATION — actions contrôlées sur une commande
-- ---------------------------------------------------------------------
create or replace function orders_private.int_field(p_data jsonb, p_key text, p_min int, p_max int)
returns int language plpgsql immutable set search_path = pg_catalog as $$
declare
  v int;
begin
  if jsonb_typeof(p_data->p_key) <> 'number' or (p_data->>p_key) !~ '^[0-9]{1,9}$' then
    raise exception 'dn:invalid_amount' using detail = p_key;
  end if;
  v := (p_data->>p_key)::int;
  if v < p_min or v > p_max then raise exception 'dn:invalid_amount' using detail = p_key; end if;
  return v;
end $$;

create or replace function orders_private.text_field(p_data jsonb, p_key text, p_max int)
returns text language plpgsql immutable set search_path = pg_catalog as $$
declare
  v text := orders_private.clean(p_data->p_key);
begin
  if v is not null and (char_length(v) > p_max or orders_private.has_control_chars(v, true)) then
    raise exception 'dn:invalid_text' using detail = p_key;
  end if;
  return v;
end $$;

create or replace function public.admin_update_order(p_order_id uuid, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o        public.orders%rowtype;
  d        jsonb := coalesce(p_data, '{}');
  v_url    text;
  v_text   text;
  v_bool   boolean;
  v_count  int;
begin
  if not public.is_admin() then
    raise exception 'dn:forbidden' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'dn:order_not_found'; end if;
  -- Concurrence optimiste : l'écran envoie le statut qu'il affiche.
  if d ? 'expected_status' and d->>'expected_status' is distinct from o.status then
    raise exception 'dn:stale_order' using detail = o.status;
  end if;
  perform set_config('dn.order_actor', 'admin', true);

  case p_action
  when 'start_review' then
    update public.orders set status = 'reviewing' where id = o.id;

  when 'set_item_availability' then
    if not (d ? 'available') or jsonb_typeof(d->'available') not in ('boolean', 'null') then raise exception 'dn:invalid_value'; end if;
    v_bool := (d->>'available')::boolean;
    update public.order_items set availability_confirmed = v_bool
     where id = (d->>'item_id')::uuid and order_id = o.id;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'dn:order_item_not_found'; end if;

  when 'set_shipping' then
    if o.status <> 'reviewing' then raise exception 'dn:invalid_transition' using detail = 'devis de livraison : en vérification seulement'; end if;
    update public.orders set
      shipping_cents = orders_private.int_field(d, 'shipping_cents', 0, 1000000),
      shipping_carrier = orders_private.text_field(d, 'carrier', 80),
      shipping_service = orders_private.text_field(d, 'service', 80),
      shipping_estimate = orders_private.text_field(d, 'estimate', 120)
     where id = o.id;

  when 'set_discount' then
    if o.status <> 'reviewing' then raise exception 'dn:invalid_transition' using detail = 'remise : en vérification seulement'; end if;
    update public.orders set
      discount_cents = orders_private.int_field(d, 'discount_cents', 0, o.subtotal_cents),
      discount_reason = orders_private.text_field(d, 'reason', 300)
     where id = o.id;

  when 'request_payment' then
    if o.status <> 'reviewing' then raise exception 'dn:invalid_transition' using detail = o.status || ' → awaiting_payment'; end if;
    if exists (select 1 from public.order_items where order_id = o.id and availability_confirmed is null) then
      raise exception 'dn:availability_unchecked';
    end if;
    if not exists (select 1 from public.order_items where order_id = o.id and availability_confirmed) then
      raise exception 'dn:no_available_item';
    end if;
    if o.shipping_cents is null then raise exception 'dn:shipping_missing'; end if;
    v_url := orders_private.text_field(d, 'payment_url', 2000);
    if not orders_private.valid_admin_url(v_url, 'payment') then raise exception 'dn:invalid_payment_url'; end if;
    v_text := orders_private.text_field(d, 'payment_provider', 40);
    update public.orders set
      status = 'awaiting_payment', payment_status = 'pending',
      total_confirmed_at = now(), payment_requested_at = now(),
      payment_provider = v_text, payment_url = v_url,
      payment_reference = orders_private.text_field(d, 'payment_reference', 200)
     where id = o.id;

  when 'set_payment_link' then
    if o.status <> 'awaiting_payment' then raise exception 'dn:payment_link_locked'; end if;
    v_url := orders_private.text_field(d, 'payment_url', 2000);
    if not orders_private.valid_admin_url(v_url, 'payment') then raise exception 'dn:invalid_payment_url'; end if;
    update public.orders set
      payment_provider = orders_private.text_field(d, 'payment_provider', 40), payment_url = v_url,
      payment_reference = orders_private.text_field(d, 'payment_reference', 200)
     where id = o.id;

  when 'reopen_review' then
    if o.status <> 'awaiting_payment' then raise exception 'dn:invalid_transition' using detail = o.status || ' → reviewing'; end if;
    update public.orders set status = 'reviewing', payment_status = 'not_requested',
      total_confirmed_at = null, payment_requested_at = null, payment_provider = null, payment_url = null
     where id = o.id;

  -- Paiement traité HORS prestataire (virement, lien envoyé à la main…) : seule une validation
  -- explicite de l'administration le confirme. Un retour client « ?success=true » ne prouve rien.
  when 'confirm_payment' then
    if o.status <> 'awaiting_payment' then raise exception 'dn:invalid_transition' using detail = o.status || ' → paid'; end if;
    update public.orders set status = 'paid', payment_status = 'paid', paid_at = now(),
      payment_confirmed_by = auth.uid(), payment_confirmation_source = 'admin_manual',
      payment_reference = coalesce(orders_private.text_field(d, 'payment_reference', 200), payment_reference)
     where id = o.id;

  when 'start_preparation' then
    update public.orders set status = 'preparing_shipment' where id = o.id;

  when 'set_tracking' then
    if o.status not in ('paid', 'preparing_shipment', 'shipped') then raise exception 'dn:shipping_locked'; end if;
    v_url := orders_private.text_field(d, 'tracking_url', 2000);
    if not orders_private.valid_admin_url(v_url, 'tracking') then raise exception 'dn:invalid_tracking_url'; end if;
    update public.orders set
      shipping_carrier = coalesce(orders_private.text_field(d, 'carrier', 80), shipping_carrier),
      shipping_service = coalesce(orders_private.text_field(d, 'service', 80), shipping_service),
      tracking_number = orders_private.text_field(d, 'tracking_number', 100),
      tracking_url = v_url
     where id = o.id;

  when 'mark_shipped' then
    -- Le garde-fou réel est en base (trigger + CHECK) ; ce message n'est qu'une explication.
    if o.payment_status <> 'paid' then raise exception 'dn:payment_not_confirmed'; end if;
    update public.orders set status = 'shipped', shipped_at = now() where id = o.id;

  when 'mark_completed' then
    update public.orders set status = 'completed', completed_at = now() where id = o.id;

  when 'cancel' then
    v_text := orders_private.text_field(d, 'reason', 500);
    if v_text is null or char_length(v_text) < 3 then raise exception 'dn:reason_required'; end if;
    -- Payée puis annulée : remboursement DÛ (workflow manuel, aucun prestataire branché).
    update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = v_text,
      payment_status = case payment_status when 'paid' then 'refund_due'
                                           when 'not_requested' then 'not_requested'
                                           else 'cancelled' end
     where id = o.id;

  when 'mark_refunded' then
    if o.payment_status <> 'refund_due' then raise exception 'dn:invalid_payment_transition'; end if;
    update public.orders set payment_status = 'refunded', refunded_at = now(),
      payment_reference = coalesce(orders_private.text_field(d, 'payment_reference', 200), payment_reference)
     where id = o.id;

  when 'set_note' then
    update public.orders set admin_note = orders_private.text_field(d, 'note', 2000) where id = o.id;

  when 'mark_notified' then
    update public.order_events set notified_at = now()
     where id = (d->>'event_id')::bigint and order_id = o.id and notify_customer and notified_at is null;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'dn:event_not_found'; end if;
    insert into public.order_events (order_id, type, actor, actor_id, details)
    values (o.id, 'customer_notified', 'admin', auth.uid(), jsonb_build_object('event_id', (d->>'event_id')::bigint));

  else
    raise exception 'dn:unknown_action' using detail = coalesce(p_action, '∅');
  end case;

  select * into o from public.orders where id = p_order_id;
  return jsonb_build_object('ok', true, 'status', o.status, 'payment_status', o.payment_status,
                            'updated_at', o.updated_at);
end $$;

create or replace function public.admin_order_tracking_token(p_order_id uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'dn:forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then raise exception 'dn:order_not_found'; end if;
  return orders_private.order_token(p_order_id);
end $$;

-- ---------------------------------------------------------------------
-- Droits : PUBLIC n'exécute rien par défaut ; trois fonctions publiques,
-- deux fonctions d'administration (qui vérifient elles-mêmes is_admin()).
-- ---------------------------------------------------------------------
revoke all on all functions in schema orders_private from public;
revoke all on function public.order_country_codes(), public.check_cart(jsonb), public.create_order_request(jsonb),
  public.get_order_tracking(text), public.admin_update_order(uuid, text, jsonb), public.admin_order_tracking_token(uuid),
  public.order_status_transition_allowed(text, text), public.order_payment_transition_allowed(text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema orders_private from anon, authenticated';
    execute 'revoke all on function public.order_status_transition_allowed(text, text), public.order_payment_transition_allowed(text, text) from anon, authenticated';
    execute 'grant execute on function public.order_country_codes(), public.check_cart(jsonb), public.create_order_request(jsonb), public.get_order_tracking(text) to anon, authenticated';
    execute 'revoke all on function public.admin_update_order(uuid, text, jsonb), public.admin_order_tracking_token(uuid) from anon';
    execute 'grant execute on function public.admin_update_order(uuid, text, jsonb), public.admin_order_tracking_token(uuid) to authenticated';
  end if;
end $$;

commit;
