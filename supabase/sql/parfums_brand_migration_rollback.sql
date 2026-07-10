-- ============================================================================
-- Rollback de parfums_brand_migration.sql
--
-- ⚠️ CE FICHIER NE FAIT QU'UN ROLLBACK SUPABASE (données/colonnes). Il ne
-- suffit PAS à annuler complètement l'architecture multi-marques si le
-- pipeline a déjà tourné pour de vrai (hub + /parfums/lecode/ + /parfums/khair/
-- générés, commités, déployés sur GitHub Pages). Après cette étape SQL, ces
-- pages resteraient en ligne mais orphelines (plus aucune donnée de marque en
-- base pour les justifier), et le générateur refuserait de les régénérer
-- (garde-fou "produit sans brand_slug").
--
-- Un ROLLBACK COMPLET nécessite donc TOUJOURS les 3 étapes, dans cet ordre :
--   1. Rollback Supabase — exécuter l'Option A ou B ci-dessous dans SQL Editor.
--   2. Revert Git des pages générées — `git revert` (ou retrait manuel) des
--      commits ayant produit `parfums/index.html` (version hub),
--      `parfums/lecode/`, `parfums/khair/`, et le bloc `AUTO:PARFUMS` de
--      `sitemap.xml` — pour retrouver soit l'ancienne page unique figée, soit
--      un état cohérent avec l'étape 1.
--   3. Redéploiement GitHub Pages — pousser ce revert sur `main` (GitHub Pages
--      sert directement la branche, aucune étape de build à relancer) et
--      attendre la propagation avant de vérifier `https://dar-nur.fr/parfums/`.
--
-- Exécuter seulement l'étape 1 laisse le site et la base dans des états
-- incohérents l'un par rapport à l'autre — ne jamais s'arrêter là si un
-- rollback complet est l'objectif.
--
-- Deux options pour l'étape 1, à exécuter selon le besoin réel. Aucune des
-- deux ne touche aux 205 produits hors catégorie `parfums`, ni à
-- `active`/`price_value`/`images`/etc. — seules les colonnes brand/brand_slug
-- sont concernées.
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
