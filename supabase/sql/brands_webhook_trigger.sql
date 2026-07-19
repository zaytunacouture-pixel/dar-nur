-- ============================================================================
-- REMPLACÉ par supabase/sql/webhook_automation.sql (2026-07-19) — n'exécutez
-- plus ce fichier seul : utilisez webhook_automation.sql, qui couvre ce même
-- cas (brands -> parfums) en plus du reste. Conservé pour archive.
-- ============================================================================

-- ============================================================================
-- Étend le déclenchement automatique de régénération de /parfums/ (voir
-- parfums_webhook_trigger.sql) aux changements sur la table `brands` :
-- créer, modifier, réordonner, activer/désactiver ou supprimer une marque
-- régénère désormais aussi les pages, pas seulement un changement de produit.
--
-- Réutilise la fonction public.notify_github_regenerate_parfums() déjà créée
-- par parfums_webhook_trigger.sql — aucune duplication de logique.
--
-- Pré-requis (dans cet ordre) :
--   1. parfums_webhook_trigger.sql déjà exécuté (fonction + secret Vault).
--   2. brands_migration.sql déjà exécuté (table brands existe).
--
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- ============================================================================

drop trigger if exists trg_notify_github_regenerate_brands on public.brands;

create trigger trg_notify_github_regenerate_brands
after insert or update or delete on public.brands
for each row
execute function public.notify_github_regenerate_parfums();

-- ============================================================================
-- Rollback :
--   drop trigger if exists trg_notify_github_regenerate_brands on public.brands;
-- ============================================================================
