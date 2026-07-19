-- ============================================================================
-- Automatisation complète de la régénération du site depuis Supabase.
--
-- Remplace/consolide parfums_webhook_trigger.sql + brands_webhook_trigger.sql
-- (jamais exécutés avec succès — diagnostic confirmé : ni le trigger, ni le
-- secret Vault n'existaient). Ce script unique met en place tout ce qui est
-- nécessaire, en un seul passage, dans Supabase > SQL Editor.
--
-- Couverture :
--   - products  (n'importe quelle catégorie) -> régénère les fiches produit
--                statiques (/{slug}/) via "regenerate-product-pages"
--   - products  (category_id = 'parfums' uniquement, avant OU après le
--                changement) -> régénère en plus /parfums/ via
--                "regenerate-parfums"
--   - brands    -> régénère /parfums/ via "regenerate-parfums" (nom, image,
--                description, ordre, statut actif/inactif d'une marque)
--   - categories -> régénère les fiches produit via "regenerate-product-pages"
--                (le label d'une catégorie est affiché sur chaque fiche)
--   - offers    -> AUCUN trigger nécessaire. Contrairement aux autres tables,
--                les offres ne sont jamais figées en HTML statique : la page
--                d'accueil les lit en direct depuis Supabase à chaque
--                affichage (voir js/supabase-client.js > fetchActiveOffers).
--                Elles sont donc déjà toujours à jour, sans aucune
--                régénération possible ni nécessaire.
--
-- Pré-requis AVANT d'exécuter (une seule fois, si pas déjà fait) :
--   1. GitHub > Settings > Developer settings > Personal access tokens >
--      Fine-grained tokens > "Generate new token".
--      - Nom : parfums-webhook
--      - Repository access : "Only select repositories" -> dar-nur
--      - Permissions > Repository permissions > "Contents" -> "Read and write"
--        (si introuvable : un token classique avec le scope "repo" fonctionne
--        aussi, voir la conversation pour les deux méthodes).
--      - Generate token, copier la valeur.
--   2. Remplacer <VOTRE_PAT_GITHUB> à l'étape 2 ci-dessous par ce jeton AVANT
--      d'exécuter ce script.
--
-- Idempotent : peut être relancé sans effet une fois en place (DROP ... IF
-- EXISTS avant chaque CREATE, ON CONFLICT DO NOTHING pour le secret).
--
-- v2 : la v1 posait un seul trigger AFTER INSERT OR UPDATE OR DELETE avec une
-- clause WHEN référençant à la fois NEW et OLD — invalide pour DELETE (NEW
-- n'existe pas) et rejeté par Postgres (42P17) dès l'exécution. Corrigé en
-- 3 triggers distincts, un par type d'événement, chacun ne référençant que
-- les valeurs qui existent réellement pour cet événement. Comportement
-- fonctionnel strictement identique à l'intention d'origine (couvre la
-- création, la modification — y compris un produit qui change DE ou VERS
-- category_id='parfums' — et la suppression d'un produit parfums).
-- ============================================================================

-- 1) Extension pg_net (appels HTTP sortants depuis Postgres) — sans effet si
--    déjà activée.
create extension if not exists pg_net with schema extensions;

-- 2) Stockage sécurisé du jeton GitHub via Supabase Vault (jamais en clair
--    dans le code du site, jamais visible du navigateur).
--    /!\ Remplacez <VOTRE_PAT_GITHUB> ci-dessous avant d'exécuter. /!\
select vault.create_secret('<VOTRE_PAT_GITHUB>', 'github_pat_parfums')
where not exists (select 1 from vault.secrets where name = 'github_pat_parfums');

-- Garde-fou : abandonne bruyamment si le jeton n'a jamais été renseigné (ou
-- est resté au texte par défaut) — c'est précisément ce qui a empêché toute
-- automatisation de fonctionner jusqu'ici, sans qu'aucune erreur ne le signale.
do $$
declare
  stored_pat text;
begin
  select decrypted_secret into stored_pat
  from vault.decrypted_secrets
  where name = 'github_pat_parfums';

  if stored_pat is null then
    raise exception 'Le secret "github_pat_parfums" n''existe pas — vérifiez l''étape 2 ci-dessus.';
  elsif stored_pat = '<VOTRE_PAT_GITHUB>' then
    raise exception 'Le jeton GitHub est resté à sa valeur par défaut "<VOTRE_PAT_GITHUB>" — remplacez-le à l''étape 2 par un vrai Personal Access Token (voir les instructions en haut de ce fichier) avant de relancer ce script.';
  end if;
end $$;

-- 3) Fonction déclencheur générique — un seul event_type par appel, passé en
--    argument du trigger (TG_ARGV[0]), pour réutiliser la même fonction pour
--    toutes les tables/tous les workflows au lieu d'en dupliquer une par cas.
create or replace function public.notify_github_regenerate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  github_pat text;
  evt text := coalesce(TG_ARGV[0], 'regenerate-parfums');
begin
  select decrypted_secret into github_pat
  from vault.decrypted_secrets
  where name = 'github_pat_parfums';

  perform net.http_post(
    url := 'https://api.github.com/repos/zaytunacouture-pixel/dar-nur/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || github_pat,
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'dar-nur-supabase-webhook'
    ),
    body := jsonb_build_object('event_type', evt)
  );

  return coalesce(new, old);
end;
$$;

-- 4) products -> regenerate-parfums, filtré sur category_id='parfums'.
--    3 triggers séparés (au lieu d'un seul INSERT OR UPDATE OR DELETE) car
--    une clause WHEN ne peut référencer NEW que si l'événement peut en
--    produire un (INSERT/UPDATE), et OLD que si l'événement peut en produire
--    un (UPDATE/DELETE) — jamais les deux à la fois pour un trigger combiné.

-- 4a) INSERT : seul NEW existe.
drop trigger if exists trg_notify_github_regenerate_parfums_ins on public.products;
create trigger trg_notify_github_regenerate_parfums_ins
after insert on public.products
for each row
when (new.category_id = 'parfums')
execute function public.notify_github_regenerate('regenerate-parfums');

-- 4b) UPDATE : NEW et OLD existent tous les deux — couvre aussi un produit
--     qui change DE ou VERS category_id='parfums'.
drop trigger if exists trg_notify_github_regenerate_parfums_upd on public.products;
create trigger trg_notify_github_regenerate_parfums_upd
after update on public.products
for each row
when (new.category_id = 'parfums' or old.category_id = 'parfums')
execute function public.notify_github_regenerate('regenerate-parfums');

-- 4c) DELETE : seul OLD existe.
drop trigger if exists trg_notify_github_regenerate_parfums_del on public.products;
create trigger trg_notify_github_regenerate_parfums_del
after delete on public.products
for each row
when (old.category_id = 'parfums')
execute function public.notify_github_regenerate('regenerate-parfums');

-- 5) products -> regenerate-product-pages, sans filtre (toute catégorie —
--    chaque produit a sa propre fiche statique /{slug}/). Aucune clause WHEN
--    ici, donc aucun souci de NEW/OLD : un seul trigger couvre les 3
--    événements sans problème.
drop trigger if exists trg_notify_github_regenerate_product_pages on public.products;
create trigger trg_notify_github_regenerate_product_pages
after insert or update or delete on public.products
for each row
execute function public.notify_github_regenerate('regenerate-product-pages');

-- 6) brands -> regenerate-parfums (créer/modifier/activer-désactiver/
--    supprimer une marque doit republier /parfums/). Pas de clause WHEN,
--    même remarque qu'à l'étape 5.
drop trigger if exists trg_notify_github_regenerate_brands on public.brands;
create trigger trg_notify_github_regenerate_brands
after insert or update or delete on public.brands
for each row
execute function public.notify_github_regenerate('regenerate-parfums');

-- 7) categories -> regenerate-product-pages (le label d'une catégorie est
--    affiché sur chaque fiche produit de cette catégorie). Pas de clause
--    WHEN, même remarque qu'à l'étape 5.
drop trigger if exists trg_notify_github_regenerate_categories on public.categories;
create trigger trg_notify_github_regenerate_categories
after insert or update or delete on public.categories
for each row
execute function public.notify_github_regenerate('regenerate-product-pages');

-- ============================================================================
-- Vérification immédiate — doit lister 6 triggers :
--   products   | trg_notify_github_regenerate_parfums_ins
--   products   | trg_notify_github_regenerate_parfums_upd
--   products   | trg_notify_github_regenerate_parfums_del
--   products   | trg_notify_github_regenerate_product_pages
--   brands     | trg_notify_github_regenerate_brands
--   categories | trg_notify_github_regenerate_categories
select event_object_table, trigger_name
from information_schema.triggers
where trigger_name like 'trg_notify_github%'
order by event_object_table, trigger_name;

-- ============================================================================
-- Pour désactiver temporairement (sans supprimer) :
--   alter table public.products   disable trigger trg_notify_github_regenerate_parfums_ins;
--   alter table public.products   disable trigger trg_notify_github_regenerate_parfums_upd;
--   alter table public.products   disable trigger trg_notify_github_regenerate_parfums_del;
--   alter table public.products   disable trigger trg_notify_github_regenerate_product_pages;
--   alter table public.brands     disable trigger trg_notify_github_regenerate_brands;
--   alter table public.categories disable trigger trg_notify_github_regenerate_categories;
-- (remplacer "disable" par "enable" pour réactiver)
--
-- Pour tout supprimer :
--   drop trigger if exists trg_notify_github_regenerate_parfums_ins on public.products;
--   drop trigger if exists trg_notify_github_regenerate_parfums_upd on public.products;
--   drop trigger if exists trg_notify_github_regenerate_parfums_del on public.products;
--   drop trigger if exists trg_notify_github_regenerate_product_pages on public.products;
--   drop trigger if exists trg_notify_github_regenerate_brands on public.brands;
--   drop trigger if exists trg_notify_github_regenerate_categories on public.categories;
--   drop function if exists public.notify_github_regenerate();
--   select vault.delete_secret(id) from vault.secrets where name = 'github_pat_parfums';
-- ============================================================================
