-- ============================================================================
-- LOT 0 — Fermer l'écriture Supabase à tout compte qui n'est pas administrateur.
--
-- PROBLÈME CORRIGÉ (constaté le 2026-08-25) :
--   Toutes les politiques d'écriture du catalogue étaient de la forme
--     for all to authenticated using (true) with check (true)
--   c'est-à-dire « n'importe quel compte connecté peut tout écrire ». Le
--   commentaire de supabase/schema.sql supposait que l'inscription publique
--   serait désactivée dans Auth > Providers ; elle ne l'a jamais été
--   (`GET /auth/v1/settings` renvoyait `"disable_signup": false`). Toute
--   personne connaissant la clé anon — publique par conception, lisible dans
--   js/config.js — pouvait donc créer un compte avec sa propre adresse e-mail
--   et obtenir exactement les mêmes droits que l'administrateur : créer,
--   modifier ou supprimer n'importe quel produit, catégorie, marque ou offre,
--   et téléverser ou effacer n'importe quel fichier du bucket. Les triggers
--   Postgres auraient publié le résultat sur le site en ligne automatiquement.
--
-- CE QUE FAIT CE SCRIPT :
--   1. Crée une table `public.admins` listant explicitement les comptes
--      administrateurs (une ligne = un `auth.users.id`).
--   2. Crée la fonction `public.is_admin()`, seule autorité de la question
--      « le compte courant est-il administrateur ? ».
--   3. Remplace les 7 politiques d'écriture `to authenticated using (true)`
--      (6 tables + bucket storage) par des politiques conditionnées à
--      `public.is_admin()`.
--   Après exécution, un compte créé par un visiteur est authentifié mais
--   n'a AUCUN droit d'écriture : il voit exactement ce que voit un visiteur
--   anonyme, ni plus, ni moins.
--
-- CE QUE CE SCRIPT NE TOUCHE PAS :
--   - Aucune donnée du catalogue. Aucun produit, prix, image ou texte n'est
--     lu, modifié ou supprimé par ce script.
--   - Aucune politique de LECTURE publique. Le site public (clé anon) continue
--     de lire les produits, catégories, marques et offres actifs à l'identique.
--   - Aucun compte utilisateur n'est créé ni supprimé.
--
-- PRÉ-REQUIS :
--   Exécuter d'abord supabase/sql/admin_rls_diagnostic.sql (lecture seule)
--   pour relever l'adresse e-mail exacte de votre compte administrateur.
--
-- SÉCURITÉ D'EXÉCUTION :
--   Tout est dans UNE SEULE transaction, et trois garde-fous la font échouer
--   AVANT toute modification de politique si quelque chose ne colle pas :
--     - l'adresse renseignée ne correspond à aucun compte existant ;
--     - cette adresse n'a jamais confirmé son e-mail (elle ne pourrait pas
--       se connecter, donc vous seriez verrouillé dehors) ;
--     - la table `admins` serait vide à l'arrivée.
--   En cas d'échec, RIEN n'est appliqué : la base reste exactement dans son
--   état actuel. Vous pouvez corriger l'adresse et relancer.
--
--   Idempotent : relançable sans effet une fois en place.
--
-- ROLLBACK : supabase/sql/admin_rls_rollback.sql
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- ►►► LA SEULE LIGNE À MODIFIER ◄◄◄
--
-- ⚠ AUCUNE ADRESSE RÉELLE NE DOIT ÊTRE ÉCRITE DANS CE FICHIER. Vérifié le
--   2026-08-29 : GitHub Pages sert les fichiers du dépôt tels quels —
--   https://dar-nur.fr/supabase/sql/brands_migration.sql répond HTTP 200.
--   Une adresse committée ici serait donc publiquement lisible, et
--   désignerait nommément le compte administrateur du projet.
--   Remplacez le jeton ci-dessous dans le SQL Editor, au moment d'exécuter,
--   et ne recommittez jamais le fichier avec l'adresse en clair.
--
--   Le compte qui ouvre admin.html est un utilisateur de
--   `auth.users` (Authentication > Users) — ce n'est PAS forcément le même
--   que le compte propriétaire du Dashboard Supabase. Relevez l'adresse
--   exacte dans la requête 1 de supabase/sql/admin_rls_diagnostic.sql et
--   recopiez-la à la place du jeton, dans l'éditeur SQL uniquement.
--
--   Si l'adresse ne correspond à aucun compte, le script s'arrête sans rien
--   modifier et vous le dit : aucune conséquence, corrigez et relancez.
--
-- Pour déclarer plusieurs administrateurs, ajoutez une ligne par adresse :
--   insert into _admin_input values ('premier@exemple.fr'), ('second@exemple.fr');
-- ────────────────────────────────────────────────────────────────────────────
create temporary table _admin_input (email text not null) on commit drop;
insert into _admin_input values ('REMPLACER_PAR_L_ADRESSE_ADMIN');


-- ────────────────────────────────────────────────────────────────────────────
-- 1) Table des administrateurs
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Liste explicite des comptes administrateurs. Seule source de vérité de public.is_admin(). '
  'Non exposée à PostgREST (droits révoqués) : ne se modifie que depuis le SQL Editor '
  'ou avec la clé service_role — jamais depuis le navigateur, jamais depuis admin.html.';

-- RLS active + AUCUNE politique d'écriture : même un administrateur ne peut
-- pas s'auto-promouvoir ni promouvoir quelqu'un d'autre via l'API REST.
-- Ajouter un administrateur reste un geste délibéré, fait ici, dans le SQL Editor.
alter table public.admins enable row level security;

drop policy if exists "admins_read_self" on public.admins;
create policy "admins_read_self"
  on public.admins for select to authenticated
  using (user_id = auth.uid());

-- Défense en profondeur : PostgREST vérifie AUSSI les droits de table, pas
-- seulement les politiques RLS. Sans ces droits, la table est invisible de
-- l'extérieur quoi qu'il arrive.
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) Garde-fous — échouent AVANT toute modification de politique
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  saisies        int;
  trouves        int;
  non_confirmes  text;
  manquants      text;
begin
  -- Garde-fou 0 : le jeton de substitution n'a pas été remplacé.
  -- Le test porte sur le préfixe, jamais sur le jeton entier : un
  -- « Remplacer tout » dans l'éditeur ne peut pas désactiver ce contrôle.
  if exists (select 1 from _admin_input
              where upper(btrim(email)) like 'REMPLACER%' or btrim(email) = '') then
    raise exception E'Le jeton de la ligne « insert into _admin_input » n''a pas été remplacé par l''adresse réelle de l''administrateur.
Rien n''a été modifié. Relevez l''adresse exacte avec supabase/sql/admin_rls_diagnostic.sql, remplacez le jeton, puis relancez.';
  end if;

  select count(*) into saisies from _admin_input;
  if saisies = 0 then
    raise exception E'Aucune adresse renseignée.\nRenseignez au moins une adresse dans _admin_input en haut de ce fichier.';
  end if;

  -- Garde-fou 1 : chaque adresse saisie doit correspondre à un compte réel.
  select string_agg(i.email, ', ') into manquants
  from _admin_input i
  where not exists (select 1 from auth.users u where lower(u.email) = lower(i.email));

  if manquants is not null then
    raise exception E'Adresse(s) introuvable(s) dans auth.users : %\nAucune modification appliquée. Vérifiez l''orthographe avec la requête 1 de admin_rls_diagnostic.sql, puis relancez.', manquants;
  end if;

  -- Garde-fou 2 : un compte jamais confirmé ne peut pas se connecter — le
  -- déclarer administrateur reviendrait à se verrouiller dehors.
  select string_agg(u.email, ', ') into non_confirmes
  from auth.users u
  join _admin_input i on lower(u.email) = lower(i.email)
  where u.email_confirmed_at is null;

  if non_confirmes is not null then
    raise exception E'Compte(s) non confirmé(s) : %\nCe compte ne peut pas se connecter : le déclarer administrateur vous laisserait sans aucun accès en écriture. Aucune modification appliquée.', non_confirmes;
  end if;

  select count(*) into trouves
  from auth.users u join _admin_input i on lower(u.email) = lower(i.email);

  raise notice 'Garde-fous franchis : % compte(s) administrateur(s) identifié(s).', trouves;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3) Enregistrement des administrateurs
-- ────────────────────────────────────────────────────────────────────────────
insert into public.admins (user_id, email, note)
select u.id, u.email, 'Déclaré par supabase/sql/admin_rls.sql'
from auth.users u
join _admin_input i on lower(u.email) = lower(i.email)
on conflict (user_id) do nothing;

-- Garde-fou 3 : la table ne doit pas être vide, sinon plus personne n'écrit.
do $$
declare n int;
begin
  select count(*) into n from public.admins;
  if n = 0 then
    raise exception 'La table public.admins est vide — application des politiques annulée pour ne pas vous verrouiller dehors.';
  end if;
  raise notice 'public.admins contient % ligne(s).', n;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) La fonction d'autorité
--
--    `security definer` : elle lit public.admins en passant outre la RLS de
--    cette table — indispensable, puisque personne n'a le droit de la lire
--    librement. `search_path` verrouillé : une table de même nom créée
--    ailleurs ne peut pas détourner la fonction.
--    `auth.uid()` vaut NULL pour un visiteur anonyme : la fonction renvoie
--    alors `false`, jamais NULL (une politique NULL bloque, mais autant être
--    explicite).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

comment on function public.is_admin() is
  'true si le compte courant figure dans public.admins. Seule condition admise '
  'dans une politique d''écriture du catalogue — ne jamais revenir à `to authenticated using (true)`.';

grant execute on function public.is_admin() to anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 5) Remplacement des politiques d'écriture
--
--    Un seul changement par table : la condition passe de « connecté » à
--    « administrateur ». Le nom de la politique change aussi (admin_all_* ->
--    admin_only_*) pour qu'un simple coup d'œil à pg_policies suffise à
--    distinguer une base corrigée d'une base qui ne l'est pas.
--
--    Les politiques de LECTURE publique (public_read_active_*) ne sont ni
--    supprimées ni modifiées : le site public continue de fonctionner
--    exactement comme avant.
-- ────────────────────────────────────────────────────────────────────────────

-- products
drop policy if exists "admin_all_products" on public.products;
drop policy if exists "admin_only_products" on public.products;
create policy "admin_only_products"
  on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- product_variants
drop policy if exists "admin_all_variants" on public.product_variants;
drop policy if exists "admin_only_variants" on public.product_variants;
create policy "admin_only_variants"
  on public.product_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- categories
drop policy if exists "admin_all_categories" on public.categories;
drop policy if exists "admin_only_categories" on public.categories;
create policy "admin_only_categories"
  on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- brands (créée par brands_migration.sql ; ignorée si absente)
do $$
begin
  if to_regclass('public.brands') is not null then
    execute 'drop policy if exists "admin_all_brands" on public.brands';
    execute 'drop policy if exists "admin_only_brands" on public.brands';
    execute 'create policy "admin_only_brands" on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  else
    raise notice 'Table public.brands absente — politique ignorée.';
  end if;
end $$;

-- offers / offer_products (créées par offers_migration.sql ; ignorées si absentes)
do $$
begin
  if to_regclass('public.offers') is not null then
    execute 'drop policy if exists "admin_all_offers" on public.offers';
    execute 'drop policy if exists "admin_only_offers" on public.offers';
    execute 'create policy "admin_only_offers" on public.offers for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  else
    raise notice 'Table public.offers absente — politique ignorée.';
  end if;

  if to_regclass('public.offer_products') is not null then
    execute 'drop policy if exists "admin_all_offer_products" on public.offer_products';
    execute 'drop policy if exists "admin_only_offer_products" on public.offer_products';
    execute 'create policy "admin_only_offer_products" on public.offer_products for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  else
    raise notice 'Table public.offer_products absente — politique ignorée.';
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6) Bucket de photos — même règle
--
--    La lecture publique des images reste ouverte (public_read_product_images) :
--    le bucket est public, les fichiers doivent rester servis au visiteur.
--    Seule l'écriture (upload, remplacement, suppression) devient réservée.
--
--    Si cette section échoue avec « must be owner of table objects », votre
--    rôle n'a pas les droits sur les politiques de storage : appliquez la même
--    règle depuis Dashboard > Storage > Policies (voir la note en bas).
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists "admin_write_product_images" on storage.objects;
drop policy if exists "admin_only_product_images" on storage.objects;
create policy "admin_only_product_images"
  on storage.objects for all to authenticated
  using      (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

commit;


-- ============================================================================
-- VÉRIFICATION — à lire après exécution. Aucune ligne ne doit contenir
-- « true » seul en condition pour une commande autre que SELECT.
-- ============================================================================
select
  schemaname || '.' || tablename as objet,
  policyname,
  cmd            as commande,
  roles::text    as roles,
  coalesce(qual, '—')       as condition_using,
  coalesce(with_check, '—') as condition_with_check
from pg_policies
where (schemaname = 'public'
       and tablename in ('products','product_variants','categories','brands','offers','offer_products','admins'))
   or (schemaname = 'storage' and tablename = 'objects')
order by objet, policyname;

-- Qui est administrateur ?
select a.email, a.user_id, a.created_at from public.admins a order by a.created_at;

-- Quels comptes existent SANS être administrateurs ? (doit idéalement être vide)
select u.email, u.created_at, u.last_sign_in_at
from auth.users u
where not exists (select 1 from public.admins a where a.user_id = u.id)
order by u.created_at;

-- ============================================================================
-- SI LA SECTION 6 A ÉCHOUÉ (droits insuffisants sur storage.objects)
-- ----------------------------------------------------------------------------
-- Dashboard > Storage > product-images > Policies :
--   - Supprimer la politique « admin_write_product_images ».
--   - New policy > For full customization :
--       Policy name : admin_only_product_images
--       Allowed operation : SELECT, INSERT, UPDATE, DELETE (les 4)
--       Target roles : authenticated
--       USING expression      : bucket_id = 'product-images' AND public.is_admin()
--       WITH CHECK expression : bucket_id = 'product-images' AND public.is_admin()
--   - NE PAS toucher à « public_read_product_images » : c'est elle qui sert
--     les images aux visiteurs.
-- ============================================================================
