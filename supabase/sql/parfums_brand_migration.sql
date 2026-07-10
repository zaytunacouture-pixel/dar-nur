-- ============================================================================
-- Ajout de la notion de marque aux parfums (architecture multi-marques)
--
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor.
--
-- Ce script :
--   1. Ajoute deux colonnes NULLABLES à `products` : `brand`, `brand_slug`.
--      Non destructif : aucune donnée existante n'est supprimée ni modifiée
--      pour les 205 produits hors catégorie `parfums`. Ces colonnes resteront
--      NULL pour toutes les autres catégories — c'est attendu, la marque n'a
--      de sens que pour les parfums.
--   2. Rétro-remplit les 24 produits `parfums` déjà actifs (21 LeCode Paris,
--      3 Khair by Ameerate), identifiés sans ambiguïté par le préfixe de leur
--      slug (vérifié en lecture le 10 juillet 2026 : tous les slugs LeCode
--      commencent par "dn-lecode-", tous les slugs Khair par "dn-khair-").
--
-- Convention brand_slug : kebab-case, ASCII, stable après création (au même
-- titre que le slug produit — ne jamais le renommer une fois publié, car il
-- devient un segment d'URL : /parfums/<brand_slug>/).
-- ============================================================================

-- 1. Colonnes (idempotent : ne fait rien si déjà présentes)
alter table public.products
  add column if not exists brand text,
  add column if not exists brand_slug text;

-- 2. Rétro-remplissage des 24 produits parfums existants
update public.products
set brand = 'LeCode Paris', brand_slug = 'lecode-paris'
where category_id = 'parfums' and slug like 'dn-lecode-%';

update public.products
set brand = 'Khair by Ameerate', brand_slug = 'khair-by-ameerate'
where category_id = 'parfums' and slug like 'dn-khair-%';

-- 3. Vérification (à lire après exécution — doit renvoyer 24 lignes, 0 "brand" NULL)
-- select slug, brand, brand_slug from public.products where category_id = 'parfums' order by brand_slug, slug;

-- 4. Garde-fou pour la suite : tout nouveau produit `parfums` créé sans brand_slug
--    ne sera pas rejeté par la base (colonnes nullables, comme demandé — aucune
--    contrainte destructive), mais le générateur statique (scripts/generate-parfums.mjs)
--    refusera de régénérer les pages tant qu'un produit actif de category_id='parfums'
--    n'a pas de brand_slug renseigné, pour ne jamais publier une fiche mal classée.
--    Penser à toujours renseigner Marque + Slug marque dans admin.html pour tout
--    nouveau parfum, quelle que soit la marque.
