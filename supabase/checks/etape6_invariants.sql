-- ============================================================================
-- Invariants du schéma de l'étape 6 — LECTURE SEULE.
-- Une ligne par contrôle : (check, ok, detail). Tout ok = true attendu.
-- Utilisé par le banc PGlite (scripts/test/schema/run.mjs) et en production :
--   npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f supabase/checks/etape6_invariants.sql
-- ============================================================================

with
-- Ancien schéma toujours présent (lu par l'ancien site, l'admin, les imports).
legacy_cols(tbl, col) as (
  values ('products', 'category_id'), ('products', 'active'), ('products', 'coming_soon'),
         ('products', 'weight'), ('products', 'volume'), ('products', 'variant_axes'),
         ('products', 'images'), ('products', 'gift_idea'), ('products', 'brand_slug'),
         ('product_variants', 'options'), ('product_variants', 'images'),
         ('offer_products', 'product_slug'), ('categories', 'label')
),
-- Tables qui ne doivent JAMAIS être lisibles par anon.
private_tables(t) as (
  values ('admins'), ('product_sources'), ('product_supply'), ('product_source_observations'),
         ('sync_proposals'), ('promo_codes'), ('product_groupings'), ('product_grouping_members')
),
anon_readable as (
  select distinct table_name as t
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'
),
media_expected as (
  select p.id as product_id, null::uuid as variant_id, t.o - 1 as pos, btrim(t.u) as url
    from public.products p cross join lateral unnest(p.images) with ordinality t(u, o)
   where btrim(coalesce(t.u, '')) <> ''
  union all
  select v.product_id, v.id, t.o - 1, btrim(t.u)
    from public.product_variants v cross join lateral unnest(v.images) with ordinality t(u, o)
   where btrim(coalesce(t.u, '')) <> ''
),
media_actual as (
  select product_id, variant_id, sort_order as pos, url from public.product_media where source = 'legacy'
),
variant_keys as (   -- options historiques dont l'axe ET la valeur existent au dictionnaire
  select v.id as variant_id, ot.id as option_type_id, ov.id as option_value_id
    from public.product_variants v
   cross join lateral jsonb_each_text(v.options) kv
    join public.option_types ot on kv.key = any (ot.legacy_keys)
    join public.option_values ov on ov.option_type_id = ot.id and ov.label = btrim(kv.value)
),
redirect_paths as (
  select source_path, rtrim(split_part(split_part(target_path, '#', 1), '?', 1), '/') || '/' as target_base
    from public.redirects where active
),
collection_depth as (
  with recursive walk(id, root_id, depth) as (
    select id, id, 1 from public.collections where parent_id is null
    union all
    select c.id, w.root_id, w.depth + 1 from public.collections c join walk w on c.parent_id = w.id where w.depth < 10
  )
  select (select count(*) from public.collections) as total, count(*) as reached, max(depth) as max_depth from walk
)
select * from (
  select 'products : exactement une collection principale' as check_name,
         count(*) = 0 as ok,
         count(*) || ' produit(s) sans principale' as detail
    from public.products p
   where not exists (select 1 from public.product_collections x where x.product_id = p.id and x.role = 'primary')
  union all
  select 'principale = page de collection (ni univers, ni transverse, ni filtre)',
         count(*) = 0, count(*) || ' ligne(s) fautive(s)'
    from public.product_collections pc join public.collections c on c.id = pc.collection_id
   where pc.role = 'primary' and c.type not in ('collection', 'subcollection')
  union all
  select 'collections : arbre sans cycle, profondeur ≤ 4',
         reached = total and coalesce(max_depth, 0) <= 4,
         reached || '/' || total || ' atteintes depuis les racines, profondeur max ' || coalesce(max_depth, 0)
    from collection_depth
  union all
  select 'collections : chemins uniques et pages avec URL',
         count(*) = 0, count(*) || ' page(s) sans path'
    from public.collections where type not in ('filter', 'group') and path is null
  union all
  select 'products.status cohérent avec active',
         count(*) = 0, count(*) || ' écart(s)'
    from public.products where active is distinct from (status = 'published')
  union all
  select 'products.availability cohérente avec coming_soon (NULL = à arbitrer)',
         count(*) = 0, count(*) || ' écart(s)'
    from public.products
   where availability is not null and coming_soon is distinct from (availability in ('coming_soon', 'out_of_stock'))
  union all
  select 'products.availability NULL uniquement pour des coming_soon historiques',
         count(*) = 0, count(*) || ' NULL hors coming_soon'
    from public.products where availability is null and coming_soon = false
  union all
  select 'products : aucun archived ni replaced_by inventé',
         count(*) = 0, count(*) || ' ligne(s)'
    from public.products where status = 'archived' or replaced_by_product_id is not null
  union all
  select 'offer_products.product_id résolu et conforme au slug',
         count(*) = 0, count(*) || ' ligne(s) non résolue(s) ou incohérente(s)'
    from public.offer_products op left join public.products p on p.id = op.product_id
   where p.id is null or p.slug <> op.product_slug
  union all
  select 'variantes : combinaison d''options unique par produit',
         count(*) = 0, count(*) || ' doublon(s)'
    from (select v.product_id, public.variant_option_signature(v.id) as sig
            from public.product_variants v) s
   where sig <> ''
   group by product_id, sig having count(*) > 1
  union all
  select 'variantes : options historiques reconnues toutes recopiées',
         count(*) = 0, count(*) || ' option(s) non recopiée(s)'
    from variant_keys k
   where not exists (select 1 from public.product_variant_options pvo
                      where pvo.variant_id = k.variant_id and pvo.option_type_id = k.option_type_id
                        and pvo.option_value_id = k.option_value_id)
  union all
  select 'product_media (legacy) = images[] historiques, même ordre',
         (select count(*) from (select * from media_expected except all select * from media_actual) a) = 0
         and (select count(*) from (select * from media_actual except all select * from media_expected) b) = 0,
         (select count(*) from media_expected) || ' attendues / ' || (select count(*) from media_actual) || ' recopiées'
  union all
  select 'Idées cadeaux (legacy) = produits gift_idea',
         count(*) = 0, count(*) || ' écart(s)'
    from (
      (select id from public.products where gift_idea
       except
       select pc.product_id from public.product_collections pc join public.collections c on c.id = pc.collection_id
        where c.slug = 'idees-cadeaux')
      union all
      (select pc.product_id from public.product_collections pc join public.collections c on c.id = pc.collection_id
        where c.slug = 'idees-cadeaux' and pc.source = 'legacy_gift_idea'
       except
       select id from public.products where gift_idea)
    ) d
  union all
  select 'principale legacy_category = correspondance de la catégorie actuelle',
         count(*) = 0, count(*) || ' écart(s)'
    from public.product_collections pc join public.products p on p.id = pc.product_id
    left join public.legacy_category_collections m on m.category_id = p.category_id
   where pc.role = 'primary' and pc.source = 'legacy_category' and m.collection_id is distinct from pc.collection_id
  union all
  select 'redirects : aucune redirection vers elle-même',
         count(*) = 0, count(*) || ' ligne(s)'
    from redirect_paths where rtrim(source_path, '/') || '/' = target_base
  union all
  select 'redirects : aucune chaîne (cible active = source active)',
         count(*) = 0, count(*) || ' chaîne(s)'
    from redirect_paths a join redirect_paths b on b.source_path = a.target_base
  union all
  select 'settings : livraison nationale inactive, seuil 50 € non public',
         bool_and(case key when 'national_shipping_enabled' then value = 'false'::jsonb and is_public
                           when 'free_shipping_threshold'   then not is_public
                           else true end) and count(*) filter (where key in ('national_shipping_enabled', 'free_shipping_threshold')) = 2,
         string_agg(key || '=' || value::text || case when is_public then ' (public)' else ' (privé)' end, ', ' order by key)
    from public.settings
  union all
  select 'regroupements : 15 sûrs (72 fiches), aucune fiche fusionnée',
         (select count(*) from public.product_groupings where decision = 'safe') = 15
         and (select count(*) from public.product_grouping_members m join public.product_groupings g on g.id = m.grouping_id
               where g.decision = 'safe') = 72
         and (select count(*) from public.product_groupings where decision in ('validated', 'applied')) = 0,
         (select count(*) from public.product_groupings where decision = 'needs_review') || ' regroupement(s) à valider'
  union all
  select 'ancien schéma intact (colonnes historiques présentes)',
         count(c.column_name) = (select count(*) from legacy_cols),
         count(c.column_name) || '/' || (select count(*) from legacy_cols) || ' colonnes'
    from legacy_cols l left join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = l.tbl and c.column_name = l.col
  union all
  select 'RLS active sur toutes les tables public',
         count(*) = 0, coalesce(string_agg(relname, ', '), 'aucune exception')
    from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity
  union all
  select 'tables privées illisibles par anon (droits)',
         count(*) = 0, coalesce(string_agg(t, ', '), 'aucune')
    from private_tables where t in (select t from anon_readable)
  union all
  select 'aucune politique ouverte à anon sur une table privée',
         count(*) = 0, coalesce(string_agg(tablename || '.' || policyname, ', '), 'aucune')
    from pg_policies
   where schemaname = 'public' and tablename in (select t from private_tables)
     and ('anon' = any (roles) or 'public' = any (roles))
  union all
  select 'aucune colonne fournisseur/achat dans une table lisible par anon',
         count(*) = 0, coalesce(string_agg(table_name || '.' || column_name, ', '), 'aucune')
    from information_schema.columns
   where table_schema = 'public' and table_name in (select t from anon_readable)
     and column_name ~ '(supplier|purchase|cost|gtin|stock_mode|base_price)'
  union all
  select 'écriture des nouvelles tables réservée à is_admin()',
         count(*) = 0, coalesce(string_agg(tablename || '.' || policyname, ', '), 'aucune')
    from pg_policies
   where schemaname = 'public'
     and tablename in ('collections', 'product_collections', 'legacy_category_collections', 'option_types', 'option_values',
                       'product_variant_options', 'product_media', 'size_guides', 'size_guide_rows',
                       'product_apparel_details', 'product_food_details', 'settings', 'redirects',
                       'product_relations', 'product_groupings', 'product_grouping_members')
     and cmd <> 'SELECT'
     and (coalesce(qual, '') !~ 'is_admin\(\)' or coalesce(with_check, '') !~ 'is_admin\(\)')
) checks;
