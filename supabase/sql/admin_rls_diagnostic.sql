-- ============================================================================
-- DIAGNOSTIC EN LECTURE SEULE — ne modifie AUCUNE donnée, ne crée rien.
--
-- À exécuter dans Supabase > SQL Editor AVANT `admin_rls.sql`.
-- Objectif : savoir exactement qui peut écrire aujourd'hui, et avec quelle
-- adresse e-mail vous devrez renseigner la table `admins` à l'étape suivante.
--
-- Copiez-moi le résultat des 4 requêtes si vous voulez que je le relise.
-- ============================================================================

-- 1) QUI a un compte sur ce projet ?
--    Aujourd'hui, à cause des politiques `to authenticated using (true)`,
--    CHAQUE ligne de ce tableau a les pleins droits d'écriture sur tout le
--    catalogue. Il ne devrait y avoir que vous.
--
--    Repérez ici l'adresse exacte de VOTRE compte : c'est elle qu'il faudra
--    recopier dans admin_rls.sql. Si une ligne inconnue apparaît, NE LA
--    SUPPRIMEZ PAS tout de suite — signalez-la, la suppression d'un compte
--    est irréversible et se fait dans Authentication > Users.
select
  id                                     as user_id,
  email,
  created_at,
  last_sign_in_at,
  email_confirmed_at,
  case when email_confirmed_at is null
       then 'NON confirmé — ne peut pas encore écrire'
       else 'confirmé — peut écrire aujourd''hui' end as etat
from auth.users
order by created_at;

-- 2) Combien de comptes au total ?
select count(*) as nb_comptes from auth.users;

-- 3) Politiques d'écriture actuellement en place sur le catalogue.
--    Toute ligne dont `roles` contient `authenticated` et dont la condition
--    `using`/`with check` vaut `true` est une porte ouverte.
select
  tablename,
  policyname,
  cmd            as commande,
  roles::text    as roles,
  qual           as condition_using,
  with_check     as condition_with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('products','product_variants','categories','brands','offers','offer_products','admins')
order by tablename, policyname;

-- 4) Politiques du bucket de photos (storage.objects).
select
  policyname,
  cmd         as commande,
  roles::text as roles,
  qual        as condition_using,
  with_check  as condition_with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
