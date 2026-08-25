-- ============================================================================
-- Retour en arrière sur supabase/sql/admin_rls.sql
--
-- Ce fichier contient DEUX choses, dans cet ordre :
--   1. La réparation — à utiliser dans 99 % des cas. Sûre, non destructive,
--      ne rouvre rien. C'est presque toujours la bonne réponse.
--   2. La réouverture complète — dangereuse, commentée, à n'utiliser qu'en
--      dernier recours.
--
-- Le symptôme qui amène ici est presque toujours le même : « je ne peux plus
-- rien enregistrer depuis admin.html ». La cause est presque toujours la même
-- aussi : la table public.admins ne contient pas le compte avec lequel vous
-- êtes connecté. Ce n'est pas une raison de rouvrir l'écriture à tout le monde.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) RÉPARATION — diagnostic puis correction, sans rien rouvrir
-- ────────────────────────────────────────────────────────────────────────────

-- 1a) Qui est déclaré administrateur ?
select a.user_id, a.email, a.created_at from public.admins a order by a.created_at;

-- 1b) Quels comptes existent réellement, et lequel est le vôtre ?
select u.id, u.email, u.email_confirmed_at, u.last_sign_in_at
from auth.users u
order by u.last_sign_in_at desc nulls last;

-- 1c) Le compte le plus récemment connecté est presque toujours le vôtre.
--     Comparez son `id` avec la liste de 1a. S'il n'y figure pas, ajoutez-le :
--     remplacez l'adresse ci-dessous, puis exécutez ce seul bloc.
--
-- insert into public.admins (user_id, email, note)
-- select id, email, 'ajout de réparation'
-- from auth.users
-- where lower(email) = lower('votre@adresse.fr')
-- on conflict (user_id) do nothing;
--
-- select * from public.admins;   -- vérifiez que la ligne est bien là

-- 1d) Si la liste 1a est correcte et que l'écriture reste refusée, vérifiez que
--     la fonction peut lire la table : elle doit appartenir au même rôle
--     qu'elle (sinon la RLS de public.admins la bloque et is_admin() renvoie
--     false pour tout le monde). Les deux lignes doivent afficher le même rôle.
select 'table    ' as objet, pg_get_userbyid(relowner) as proprietaire
from pg_class where oid = 'public.admins'::regclass
union all
select 'fonction ', pg_get_userbyid(proowner)
from pg_proc where oid = 'public.is_admin()'::regprocedure;


-- ============================================================================
-- 2) RÉOUVERTURE COMPLÈTE — ⚠ DANGEREUX ⚠
--
-- Ce bloc restaure très exactement la faille corrigée par admin_rls.sql :
-- n'importe quelle personne capable de créer un compte sur ce projet
-- retrouve les pleins droits sur le catalogue et sur le bucket de photos.
-- Si l'inscription publique est restée désactivée dans Auth > Providers, le
-- risque est moindre, mais il ne reste plus qu'un seul verrou au lieu de deux.
--
-- À n'exécuter que si la section 1 n'a rien donné et que le service doit être
-- rétabli immédiatement. Décommentez, exécutez, rétablissez l'accès, puis
-- relancez admin_rls.sql au plus vite.
--
-- Les tables brands / offers / offer_products sont traitées conditionnellement,
-- comme dans admin_rls.sql : une table absente ne fait pas échouer le script.
-- ============================================================================

-- begin;
--
-- drop policy if exists "admin_only_products" on public.products;
-- create policy "admin_all_products"
--   on public.products for all to authenticated using (true) with check (true);
--
-- drop policy if exists "admin_only_variants" on public.product_variants;
-- create policy "admin_all_variants"
--   on public.product_variants for all to authenticated using (true) with check (true);
--
-- drop policy if exists "admin_only_categories" on public.categories;
-- create policy "admin_all_categories"
--   on public.categories for all to authenticated using (true) with check (true);
--
-- do $$
-- begin
--   if to_regclass('public.brands') is not null then
--     execute 'drop policy if exists "admin_only_brands" on public.brands';
--     execute 'create policy "admin_all_brands" on public.brands for all to authenticated using (true) with check (true)';
--   end if;
--   if to_regclass('public.offers') is not null then
--     execute 'drop policy if exists "admin_only_offers" on public.offers';
--     execute 'create policy "admin_all_offers" on public.offers for all to authenticated using (true) with check (true)';
--   end if;
--   if to_regclass('public.offer_products') is not null then
--     execute 'drop policy if exists "admin_only_offer_products" on public.offer_products';
--     execute 'create policy "admin_all_offer_products" on public.offer_products for all to authenticated using (true) with check (true)';
--   end if;
-- end $$;
--
-- do $$
-- begin
--   execute 'drop policy if exists "admin_only_product_images" on storage.objects';
--   execute $p$create policy "admin_write_product_images" on storage.objects for all to authenticated using (bucket_id = 'product-images') with check (bucket_id = 'product-images')$p$;
-- exception when insufficient_privilege or undefined_table then
--   raise warning 'Politiques storage inchangées (droits insuffisants) — à traiter depuis Dashboard > Storage > Policies.';
-- end $$;
--
-- commit;


-- ----------------------------------------------------------------------------
-- public.admins et public.is_admin() ne sont PAS supprimées par ce fichier :
-- elles ne gênent rien tant qu'aucune politique ne les utilise, et les
-- conserver rend la re-sécurisation immédiate.
--
-- Pour les retirer malgré tout — uniquement APRÈS avoir rouvert les politiques
-- ci-dessus, sinon plus personne ne peut écrire :
--
--   drop function if exists public.is_admin();
--   drop table if exists public.admins;
-- ----------------------------------------------------------------------------
