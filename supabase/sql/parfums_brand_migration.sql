-- ============================================================================
-- Migration — Ajout de la notion de marque aux parfums (architecture multi-marques)
--
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor.
-- Rollback : voir supabase/sql/parfums_brand_migration_rollback.sql
--
-- Ce script :
--   1. Ajoute deux colonnes NULLABLES à `products` : `brand`, `brand_slug`.
--      Non destructif : aucune donnée existante n'est supprimée ni modifiée
--      pour les 205 produits hors catégorie `parfums`. Ces colonnes resteront
--      NULL pour toutes les autres catégories — c'est attendu, la marque n'a
--      de sens que pour les parfums. Idempotent (`if not exists`) : peut être
--      relancé sans risque si déjà exécuté partiellement.
--   2. Rétro-remplit les 24 produits `parfums` déjà actifs (21 LeCode Paris,
--      3 Khair by Ameerate), identifiés sans ambiguïté par le préfixe de leur
--      slug (vérifié en lecture le 10 juillet 2026 : tous les slugs LeCode
--      commencent par "dn-lecode-", tous les slugs Khair par "dn-khair-").
--   3. Vérifie le résultat (RAISE EXCEPTION si le compte attendu ne correspond
--      pas) avant de valider — toute la migration est annulée (ROLLBACK
--      automatique de la transaction) si quelque chose ne va pas, plutôt que
--      de laisser une rétro-écriture partielle.
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

-- 1. Colonnes (idempotent : ne fait rien si déjà présentes)
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

-- 3. Garde-fou transactionnel : si les comptes ne correspondent pas à ce qui
--    a été vérifié en lecture avant migration, on annule tout plutôt que de
--    committer un état partiel ou incohérent.
do $$
declare
  lecode_count int;
  khair_count int;
  unbranded_count int;
begin
  select count(*) into lecode_count from public.products
    where category_id = 'parfums' and active = true and brand_slug = 'lecode';
  select count(*) into khair_count from public.products
    where category_id = 'parfums' and active = true and brand_slug = 'khair';
  select count(*) into unbranded_count from public.products
    where category_id = 'parfums' and active = true and brand_slug is null;

  if lecode_count != 21 then
    raise exception 'Migration annulée : % produits LeCode Paris actifs trouvés, 21 attendus.', lecode_count;
  end if;
  if khair_count != 3 then
    raise exception 'Migration annulée : % produits Khair by Ameerate actifs trouvés, 3 attendus.', khair_count;
  end if;
  if unbranded_count != 0 then
    raise exception 'Migration annulée : % produits parfums actifs restent sans brand_slug.', unbranded_count;
  end if;

  raise notice 'OK : % LeCode Paris, % Khair by Ameerate, 0 produit parfums actif sans marque.', lecode_count, khair_count;
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
