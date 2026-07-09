-- ============================================================================
-- Déclenchement automatique de la régénération de /parfums/index.html
-- UNIQUEMENT quand un produit dont category_id = 'parfums' est créé, modifié,
-- désactivé/réactivé ou supprimé.
--
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor.
-- Ne modifie aucune donnée existante — crée uniquement une fonction et un
-- trigger sur la table products.
--
-- Avant d'exécuter :
--   1. Créez un jeton GitHub (PAT) dans GitHub > Settings > Developer settings
--      > Personal access tokens > Fine-grained tokens, restreint au dépôt
--      zaytunacouture-pixel/dar-nur, avec la permission "Contents: Read and write".
--   2. Remplacez <VOTRE_PAT_GITHUB> ci-dessous par ce jeton avant d'exécuter.
-- ============================================================================

-- 1. Extension pg_net (appels HTTP sortants depuis Postgres) — sans effet si déjà activée
create extension if not exists pg_net with schema extensions;

-- 2. Stockage sécurisé du jeton GitHub via Supabase Vault
--    (jamais en clair dans le code du site, jamais visible du navigateur)
select vault.create_secret('<VOTRE_PAT_GITHUB>', 'github_pat_parfums');

-- 3. Fonction déclencheur : notifie GitHub (repository_dispatch) uniquement
--    si le produit concerné appartient (avant ou après le changement) à
--    category_id = 'parfums'.
create or replace function public.notify_github_regenerate_parfums()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  github_pat text;
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
    body := jsonb_build_object('event_type', 'regenerate-parfums')
  );

  return coalesce(new, old);
end;
$$;

-- 4. Trigger filtré (clause WHEN) : ne se déclenche QUE pour category_id = 'parfums',
--    que ce soit l'ancienne ligne (avant update/delete) ou la nouvelle (après insert/update)
--    qui correspond — couvre aussi le cas d'un produit qui change DE ou VERS cette catégorie.
drop trigger if exists trg_notify_github_regenerate_parfums on public.products;

create trigger trg_notify_github_regenerate_parfums
after insert or update or delete on public.products
for each row
when (
  (new.category_id = 'parfums') or (old.category_id = 'parfums')
)
execute function public.notify_github_regenerate_parfums();

-- ============================================================================
-- Pour désactiver temporairement (rollback) sans tout supprimer :
--   alter table public.products disable trigger trg_notify_github_regenerate_parfums;
-- Pour réactiver :
--   alter table public.products enable trigger trg_notify_github_regenerate_parfums;
-- Pour tout supprimer :
--   drop trigger if exists trg_notify_github_regenerate_parfums on public.products;
--   drop function if exists public.notify_github_regenerate_parfums();
--   select vault.delete_secret('github_pat_parfums' -- id retourné à l'étape 2, pas le nom);
-- ============================================================================
