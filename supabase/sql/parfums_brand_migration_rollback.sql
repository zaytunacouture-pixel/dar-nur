-- ============================================================================
-- Rollback de parfums_brand_migration.sql
--
-- Deux options, à exécuter selon le besoin réel. Aucune des deux ne touche
-- aux 205 produits hors catégorie `parfums`, ni à `active`/`price_value`/
-- `images`/etc. — seules les colonnes brand/brand_slug sont concernées.
-- ============================================================================

begin;

-- ── Option A — Rollback léger (recommandé) ──────────────────────────────────
-- Annule uniquement le rétro-remplissage (remet brand/brand_slug à NULL pour
-- les 24 produits parfums concernés). Conserve les colonnes elles-mêmes —
-- utile si d'autres marques ont déjà été ajoutées entre-temps et ne doivent
-- pas être affectées par ce rollback ciblé sur LeCode/Khair uniquement.
update public.products
set brand = null, brand_slug = null
where category_id = 'parfums'
  and (
    (brand_slug = 'lecode' and slug like 'dn-lecode-%')
    or (brand_slug = 'khair' and slug like 'dn-khair-%')
  );

commit;

-- ── Option B — Rollback complet (à décommenter et exécuter séparément) ─────
-- Supprime entièrement les colonnes brand/brand_slug de `products`. À utiliser
-- uniquement si aucune autre marque n'a été créée depuis la migration (sinon
-- cette option supprime aussi leurs données brand/brand_slug). Vérifier avant
-- exécution :
--   select brand_slug, count(*) from public.products where brand_slug is not null group by brand_slug;
--
-- begin;
-- alter table public.products
--   drop column if exists brand,
--   drop column if exists brand_slug;
-- commit;
