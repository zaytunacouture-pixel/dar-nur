-- =====================================================================
--  DAR NŪR — Rollback des codes promotionnels
--
--  Annule intégralement supabase/sql/promo_codes.sql.
--  À exécuter dans : Supabase → SQL Editor → New query → Run
--
--  ATTENTION : la suppression de la table efface définitivement tous les
--  codes enregistrés, sans exception. Si l'objectif est seulement de
--  désactiver un code sans rien perdre, préférer la section 0 ci-dessous
--  et NE PAS exécuter les sections 1 et 2.
--
--  CE FICHIER NE CONNAÎT AUCUN CODE, et n'a aucune raison d'en connaître un :
--  supprimer la table et la fonction ne demande pas de savoir ce qu'elles
--  contiennent. Aucune valeur de code ne doit jamais être écrite ici — le
--  dépôt est servi publiquement par GitHub Pages (voir promo_codes.sql §4).
--
--  Ce script ne touche à aucune autre table : products, product_variants,
--  categories, offers, offer_products, brands et admins sont inchangées.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) ALTERNATIVE NON DESTRUCTIVE — désactiver un code sans le supprimer
-- ---------------------------------------------------------------------
-- Désigné par sa date de création, jamais par sa valeur : le code n'a pas
-- à apparaître, même dans une requête commentée.
--
-- a) Voir ce qui existe, sans afficher les codes :
-- select id, label, active, ends_at, created_at
--   from public.promo_codes order by created_at desc;
--
-- b) Désactiver le dernier code créé :
-- update public.promo_codes set active = false
--  where id = (select id from public.promo_codes order by created_at desc limit 1);
--
-- c) Tout désactiver d'un coup :
-- update public.promo_codes set active = false;

-- ---------------------------------------------------------------------
-- 1) RETRAIT DE LA RPC
-- ---------------------------------------------------------------------
-- Les GRANT sur la fonction disparaissent avec elle.
drop function if exists public.check_promo_code(text, jsonb);

-- ---------------------------------------------------------------------
-- 2) RETRAIT DE LA TABLE
-- ---------------------------------------------------------------------
-- L'index unique promo_codes_code_norm_uidx est supprimé avec la table.
drop table if exists public.promo_codes;

-- ---------------------------------------------------------------------
-- 3) VÉRIFICATION — une seule requête, exécutable APRÈS les DROP
-- ---------------------------------------------------------------------
-- Ces deux fonctions interrogent le catalogue, jamais les objets eux-mêmes :
-- to_regclass() et to_regprocedure() renvoient NULL quand l'objet n'existe
-- pas, sans lever d'erreur. Le script peut donc être exécuté intégralement,
-- du début à la fin, sans jamais échouer — y compris sur une base où rien
-- n'avait été installé.
select
  to_regclass('public.promo_codes')                       as table_restante__attendu_null,
  to_regprocedure('public.check_promo_code(text,jsonb)')  as fonction_restante__attendu_null;

-- ---------------------------------------------------------------------
-- 4) CÔTÉ SITE
-- ---------------------------------------------------------------------
-- Aucune modification de fichier n'est nécessaire après ce rollback :
-- js/cart.js ne contient aucun code ni aucune règle. La RPC disparue,
-- toute saisie de code affichera « Vérification impossible pour le
-- moment. » et le panier continuera de fonctionner sans réduction.
