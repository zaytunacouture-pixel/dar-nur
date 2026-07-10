-- ============================================================================
-- Migration — Ajout de la notion de marque aux parfums (architecture multi-marques)
--
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor.
-- Rollback : voir supabase/sql/parfums_brand_migration_rollback.sql (rollback
-- Supabase seul — un rollback complet demande aussi un revert Git des pages
-- générées et un redéploiement GitHub Pages, voir ce fichier).
--
-- Ce script :
--   0. GARDE-FOU ANTI-ÉCRASEMENT (nouveau) : si les colonnes brand/brand_slug
--      existent déjà ET qu'au moins une ligne a une valeur non NULL, la
--      migration s'arrête IMMÉDIATEMENT, avant toute autre instruction, sans
--      rien modifier. Protège contre une double exécution accidentelle qui
--      écraserait des données déjà en place (ex. une marque ajoutée
--      manuellement entre-temps).
--   1. Ajoute deux colonnes NULLABLES à `products` : `brand`, `brand_slug`.
--      Non destructif : aucune donnée existante n'est supprimée ni modifiée
--      pour les 205 produits hors catégorie `parfums`. Ces colonnes resteront
--      NULL pour toutes les autres catégories — c'est attendu, la marque n'a
--      de sens que pour les parfums. Idempotent (`if not exists`) : peut être
--      relancé sans risque si déjà exécuté partiellement (et bloqué par le
--      garde-fou 0 s'il a déjà réellement écrit des données).
--   2. Rétro-remplit les 24 produits `parfums` déjà actifs (21 LeCode Paris,
--      3 Khair by Ameerate), identifiés sans ambiguïté par le préfixe de leur
--      slug (vérifié en lecture le 10 juillet 2026 : tous les slugs LeCode
--      commencent par "dn-lecode-", tous les slugs Khair par "dn-khair-").
--   3. Vérifie le résultat avant de valider — RAISE EXCEPTION (donc ROLLBACK
--      automatique de toute la transaction) si l'un de ces contrôles échoue :
--        - exactement 21 produits actifs brand_slug='lecode' ;
--        - exactement 3 produits actifs brand_slug='khair' ;
--        - aucun produit actif category_id='parfums' sans brand_slug ;
--        - aucun brand_slug vide/blanc parmi les produits parfums actifs ;
--        - aucune incohérence brand ↔ brand_slug (une marque ne doit
--          correspondre qu'à un seul brand_slug, et réciproquement).
--
-- Convention brand_slug (décidée explicitement le 2026-07-10, remplace la
-- convention "lecode-paris"/"khair-by-ameerate" évoquée dans un brouillon
-- antérieur, jamais exécutée) : court, kebab-case, ASCII, stable après
-- création — devient un segment d'URL (/parfums/<brand_slug>/), ne jamais le
-- renommer une fois des pages publiées avec cette valeur.
--   - LeCode Paris      → brand_slug = 'lecode'
--   - Khair by Ameerate → brand_slug = 'khair'
-- ============================================================================

begin;

-- 0. Garde-fou anti-écrasement — DOIT s'exécuter en tout premier, avant tout
--    ALTER/UPDATE. Vérifie l'existence des colonnes via information_schema
--    (sans jamais référencer brand/brand_slug directement tant qu'on n'a pas
--    confirmé qu'elles existent, pour ne pas provoquer une erreur "colonne
--    inconnue" sur une base qui n'a encore rien).
do $$
declare
  brand_col_exists boolean;
  brand_slug_col_exists boolean;
  brand_has_data boolean := false;
  brand_slug_has_data boolean := false;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'brand'
  ) into brand_col_exists;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'brand_slug'
  ) into brand_slug_col_exists;

  if brand_col_exists then
    execute 'select exists(select 1 from public.products where brand is not null)' into brand_has_data;
  end if;
  if brand_slug_col_exists then
    execute 'select exists(select 1 from public.products where brand_slug is not null)' into brand_slug_has_data;
  end if;

  if brand_has_data or brand_slug_has_data then
    raise exception E'Migration aborted:\nbrand data already exists.\nRefusing to overwrite existing values.';
  end if;
end $$;

-- 1. Colonnes (idempotent : ne fait rien si déjà présentes — et on sait grâce
--    au garde-fou 0 qu'elles sont forcément vides si elles existent déjà)
alter table public.products
  add column if not exists brand text,
  add column if not exists brand_slug text;

-- 2. Rétro-remplissage des 24 produits parfums existants
update public.products
set brand = 'LeCode Paris', brand_slug = 'lecode'
where category_id = 'parfums' and slug like 'dn-lecode-%';

update public.products
set brand = 'Khair by Ameerate', brand_slug = 'khair'
where category_id = 'parfums' and slug like 'dn-khair-%';

-- 3. Garde-fous avant COMMIT : si l'un échoue, RAISE EXCEPTION annule toute
--    la transaction (ROLLBACK automatique) plutôt que de committer un état
--    partiel ou incohérent.
do $$
declare
  lecode_count int;
  khair_count int;
  unbranded_count int;
  blank_slug_count int;
  inconsistent_slug_count int;
  inconsistent_brand_count int;
begin
  select count(*) into lecode_count from public.products
    where category_id = 'parfums' and active = true and brand_slug = 'lecode';
  select count(*) into khair_count from public.products
    where category_id = 'parfums' and active = true and brand_slug = 'khair';
  select count(*) into unbranded_count from public.products
    where category_id = 'parfums' and active = true and brand_slug is null;
  select count(*) into blank_slug_count from public.products
    where category_id = 'parfums' and active = true and brand_slug is not null and trim(brand_slug) = '';

  -- Cohérence brand ↔ brand_slug : une marque = un seul brand_slug, et
  -- réciproquement un brand_slug = une seule marque. Détecte par exemple
  -- deux orthographes différentes de "LeCode Paris" pointant vers le même
  -- brand_slug, ou l'inverse.
  select count(*) into inconsistent_slug_count from (
    select brand from public.products
    where category_id = 'parfums' and active = true and brand is not null
    group by brand having count(distinct brand_slug) > 1
  ) x;
  select count(*) into inconsistent_brand_count from (
    select brand_slug from public.products
    where category_id = 'parfums' and active = true and brand_slug is not null
    group by brand_slug having count(distinct brand) > 1
  ) x;

  if lecode_count != 21 then
    raise exception 'Migration annulée : % produits LeCode Paris actifs trouvés, 21 attendus.', lecode_count;
  end if;
  if khair_count != 3 then
    raise exception 'Migration annulée : % produits Khair by Ameerate actifs trouvés, 3 attendus.', khair_count;
  end if;
  if unbranded_count != 0 then
    raise exception 'Migration annulée : % produits parfums actifs restent sans brand_slug.', unbranded_count;
  end if;
  if blank_slug_count != 0 then
    raise exception 'Migration annulée : % produits parfums actifs ont un brand_slug vide/blanc.', blank_slug_count;
  end if;
  if inconsistent_slug_count != 0 then
    raise exception 'Migration annulée : % marque(s) associée(s) à plusieurs brand_slug différents.', inconsistent_slug_count;
  end if;
  if inconsistent_brand_count != 0 then
    raise exception 'Migration annulée : % brand_slug associé(s) à plusieurs noms de marque différents.', inconsistent_brand_count;
  end if;

  raise notice 'OK : % LeCode Paris, % Khair by Ameerate, 0 produit parfums actif sans marque, 0 brand_slug vide, 0 incohérence brand/brand_slug.', lecode_count, khair_count;
end $$;

commit;

-- 4. Vérification manuelle optionnelle après exécution :
-- select slug, brand, brand_slug from public.products where category_id = 'parfums' order by brand_slug, slug;

-- 5. Garde-fou côté pipeline (déjà en place, aucune action requise) : tout
--    nouveau produit `parfums` créé sans brand_slug ne sera pas rejeté par la
--    base (colonnes nullables, comme demandé — aucune contrainte destructive),
--    mais le générateur statique (scripts/generate-parfums.mjs) refusera de
--    régénérer quoi que ce soit tant qu'un produit actif de category_id='parfums'
--    n'a pas de brand_slug renseigné, pour ne jamais publier une fiche mal
--    classée. Toujours renseigner Marque + Slug marque dans admin.html pour
--    tout nouveau parfum, quelle que soit la marque.
