-- =====================================================================
--  DAR NŪR — Rollback de la migration « Idées cadeaux »
--  Annule supabase/sql/gift_ideas_migration.sql.
--
--  À n'exécuter que si l'on souhaite retirer complètement la
--  fonctionnalité côté base. Supprimer les colonnes ne casse rien côté
--  front : index.html, generate-category-pages.mjs et
--  generate-gift-page.mjs traitent une colonne absente exactement comme
--  la valeur false (comparaison stricte à true, jamais de coercition).
--
--  Aucune politique RLS n'est touchée.
-- =====================================================================

begin;

drop index if exists public.idx_products_gift_idea;

alter table public.products
  drop column if exists gift_idea,
  drop column if exists gift_for_him,
  drop column if exists gift_for_her;

commit;

-- Variante non destructive : conserver les colonnes et seulement
-- dépublier la sélection (rien n'est perdu, tout est réactivable
-- depuis admin.html) —
--   update public.products
--      set gift_idea = false, gift_for_him = false, gift_for_her = false
--    where gift_idea = true;
