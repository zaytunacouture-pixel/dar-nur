-- ============================================================================
-- Renseigne une image représentative pour chaque marque existante qui n'en a
-- pas encore (image_url is null) — reprend la photo du premier parfum actif
-- de la marque plutôt que d'inventer un visuel. Purement une donnée de
-- démarrage : remplaçable à tout moment depuis admin.html > Marques (bouton
-- "Changer l'image"), sans repasser par le SQL Editor.
--
-- Ne touche jamais une marque qui a déjà une image_url renseignée.
-- Idempotent : peut être relancé sans effet une fois les images en place.
--
-- À exécuter une seule fois dans Supabase > SQL Editor, après
-- brands_migration.sql.
-- ============================================================================

update public.brands
set image_url = 'assets/produits-fournisseur/dn-lecode-galaxie/dn-lecode-galaxie-1.jpg'
where id = 'lecode' and image_url is null;

update public.brands
set image_url = 'assets/produits-fournisseur/dn-khair-fusion/dn-khair-fusion-1.jpg'
where id = 'khair' and image_url is null;

update public.brands
set image_url = 'https://sxlpgcnjerlayitaxxyv.supabase.co/storage/v1/object/public/product-images/products/khamraha-dukhana-mystical/khamraha-dukhana-mystical-1784476161222.webp'
where id = 'khamraha' and image_url is null;

-- Vérification immédiate
select id, name, image_url from public.brands order by sort_order;
