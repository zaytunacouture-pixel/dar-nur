-- ============================================================================
-- Maintenance ponctuelle — étape 6 : restaurer l'ordre physique de products.
--
-- Pourquoi : la première exécution en production de la migration 02 (2026-10-02)
-- a réécrit les 251 lignes (remplissage de status/availability/net_quantity).
-- Leurs VALEURS historiques sont intactes (empreintes vérifiées), mais leur ORDRE
-- PHYSIQUE a changé. Or l'ancien site trie par sort_order seul et 48 produits
-- partagent sort_order = 0 : l'ordre de ces ex-aequo sur l'accueil, les pages
-- catégories, Idées cadeaux et les pages marque en dépend. Ce script remet les
-- lignes dans l'ordre exact relevé dans la sauvegarde prise juste avant
-- (export sans tri = ordre physique d'origine).
--
-- CLUSTER réécrit la table dans l'ordre d'un index temporaire : aucune valeur
-- modifiée, aucun trigger déclenché (ni updated_at, ni régénération GitHub).
-- La migration 02 fait désormais elle-même cette restauration : ce script ne
-- concerne que l'application du 2026-10-02 et n'a pas à être rejoué.
-- ============================================================================

begin;

do $$
declare
  v_order text[] := array[
    'grn-baraka', 'pdr-nigelle', 'dn-abaya-papillon-0', 'dn-lecode-galaxie',
    'dn-lecode-jardin-persan', 'dn-lecode-douceur-iles', 'dn-lecode-grand-manege', 'dn-lecode-flamenco',
    'gommage-hibiscus-nigelle', 'miel-costus-nigelle', 'miel-moringa-nigelle', 'dn-lecode-blood-crystal',
    'dn-lecode-vanille-bomb', 'dn-pack-tahara-2', 'poudre-sultan', 'dn-lecode-blue-addict',
    'vt-layali-blanc', 'khamrah-karaz', 'dn-lecode-rose-velours', 'dn-miel-nigelle-hibiscus',
    'vt-nissah-bordeaux', 'dn-lecode-parade-nocturne', 'miel-printemps', 'savon-noir-hibiscus-nigelle',
    'vt-abaya-nouha-gris-argente', 'vt-nissah-vert', 'dn-chechia-cairo-0', 'mg-mangue-fraise',
    'gommage-khamare-citron', 'dn-chechia-cairo-1', 'dn-lecode-eclipse', 'gommage-nila',
    'vt-aicha-kaki', 'dn-sheymagh-2', 'grn-kirikou', 'dn-poudre-de-sidr-50g',
    'vt-nissah-noir', 'br-nila', 'br-sublimante', 'dn-abaya-nilla-0',
    'grn-fenouil', 'vt-layali-beige', 'poudre-el-anoud', 'hl-menthe-pouliot',
    'savon-noir-karite', 'hl-eucalyptus', 'vt-layali-noir', 'vt-layali-doree',
    'dn-khair-fusion', 'chantilly-karite-moninga', 'poudre-nesaim', 'vt-nissah-kaki',
    'mg-passion', 'miel-cactus', 'miel-gingembre-curcuma', 'miel-gingembre-fenugrec',
    'khamrah-qahwa', 'dn-lecode-mirage', 'gel-chardon', 'dn-lecode-hybrid',
    'gel-nigelle', 'gommage-louban', 'dn-lecode-horizon', 'dn-lecode-brise-coton',
    'dn-lecode-mystere-orient', 'hl-pepins-raisin', 'dn-khair-confection', 'miel-aubepine',
    'hl-lavande', 'hl-oliban', 'dn-pack-tahara-0', 'dn-khair-pistachio',
    'pdr-gingembre-curcuma', 'savon-noir-nila', 'pierre-alun-khaliji', 'poudre-arawar',
    'grn-lavande', 'poudre-arnousha', 'spray-brumisateur-hibiscus-nigelle', 'miel-shilajit',
    'khamrah-dukhan', 'dn-ismid-medine', 'gommage-louban-lavande', 'savon-noir-ekhan',
    'mg-fraise', 'dn-pack-tahara-1', 'double-creme', 'gommage-aker-fassi',
    'miel-blanc-kirghizistan', 'vanille-voyage', 'dn-pack-tahara-abyad', 'poudre-al-mousany',
    'dn-lot-nissah-0', 'dn-musc-tahara-2', 'dn-musc-tahara-0', 'chantilly-karite-nila',
    'dn-sandale-homme-3', 'dn-sandale-homme-4', 'miel-fraise-russie', 'pdr-nila',
    'miel-hibiscus-zamzam', 'savon-nila-bleu', 'dn-qamiss-sultan-saphir-0', 'dn-qamiss-sultan-saphir-1',
    'dn-qamiss-sultan-saphir-2', 'miel-aphrodisiaque', 'dn-lot-nissah-1', 'vt-aicha-noir',
    'miel-lavande', 'santal-elixir', 'gel-costus', 'cocktail-marakuja',
    'gel-gingembre-curcuma', 'dn-musc-tahara-1', 'miel-myrtille', 'miel-sidr-jujubier',
    'pdr-clou-girofle', 'miel-gingembre-citron', 'dn-abaya-demi-papillon-2', 'savon-noir-aker-fassi',
    'khamrah-eau-de-parfum-unisexe-100ml-lattafa', 'coco-powdery', 'miel-spiruline', 'miel-nigelle',
    'savon-noir-lavande', 'liquid-rouge', 'miel-rose-siberie', 'mg-framboise-passion',
    'gel-fenugrec', 'gel-valeriane', 'gel-spiruline', 'gel-termis',
    'gel-macca', 'vt-aicha-orange', 'mg-framboise', 'gel-aphrodisiaque',
    'gel-ashwaganda', 'gel-moringa', 'savon-oliban', 'savon-noir-aloes-pinere',
    'liquid-brun', 'pdr-costus', 'dn-abaya-papillon-1', 'pdr-psyllium',
    'imagine-toi', 'pdr-moringa', 'pdr-termis', 'pdr-romarin',
    'grn-chardon', 'grn-gomme-arabique', 'grn-nigelle-baraka', 'grn-chia',
    'grn-oliban', 'br-apaisante', 'dn-abaya-papillon-2', 'qms-gris',
    'br-eau-rose', 'qms-marron', 'qms-bleu-ciel', 'qms-blanc',
    'vt-abaya-nouha-rose-marrone', 'vt-aicha-vert-sapin', 'vt-aicha-violet', 'vt-aicha-bordeaux',
    'vt-aicha-blanc', 'vt-abaya-nouha-noir-dentelle', 'vt-abaya-nouha-bleu-ciel', 'dn-abaya-papillon-3',
    'vt-nissah-blanc', 'vt-nissah-bleu', 'dn-bakhour-0', 'dn-chechia-cairo-2',
    'dn-chechia-cairo-3', 'dn-chechia-cairo-4', 'dn-chechia-cairo-5', 'dn-chechia-cairo-6',
    'dn-abaya-demi-papillon-0', 'dn-abaya-demi-papillon-1', 'vt-nissah-violet', 'dn-abaya-papillon-4',
    'dn-abaya-saoudienne-0', 'dn-abaya-saoudienne-1', 'dn-abaya-saoudienne-2', 'dn-abaya-saoudienne-3',
    'dn-abaya-saoudienne-4', 'dn-abaya-saoudienne-5', 'dn-abaya-saoudienne-6', 'dn-abaya-saoudienne-7',
    'dn-abaya-saoudienne-8', 'dn-abaya-saoudienne-9', 'dn-abaya-iltihad-0', 'dn-abaya-iltihad-1',
    'dn-abaya-iltihad-2', 'dn-abaya-mme-dn-0', 'dn-abaya-mme-dn-1', 'dn-abaya-mme-dn-2',
    'dn-abaya-mme-dn-3', 'dn-abaya-chita-0', 'dn-abaya-chita-1', 'dn-abaya-chita-2',
    'dn-abaya-chita-3', 'dn-abaya-chita-4', 'dn-abaya-chita-5', 'dn-abaya-kimono-seyra-0',
    'dn-abaya-kimono-seyra-1', 'dn-abaya-kimono-seyra-2', 'dn-abaya-nilla-1', 'dn-abaya-nilla-2',
    'dn-abaya-nilla-3', 'dn-abaya-nilla-5', 'dn-sandale-homme-0', 'dn-sandale-homme-1',
    'dn-sandale-homme-2', 'dn-sandale-homme-5', 'dn-sandale-homme-6', 'dn-sandale-homme-8',
    'dn-sandale-homme-10', 'dn-sandale-homme-11', 'dn-abaya-nilla-4', 'dn-sandale-homme-7',
    'dn-qamiss-sultan-saphir-3', 'mg-mangue', 'dn-musc-tahara-grenade', 'vulcania',
    'dn-sheymagh-1', 'yara', 'dn-sheymagh-0', 'hl-menthe-poivree',
    'dn-lecode-galion', 'hl-fenugrec', 'hl-costus', 'hl-gingembre',
    'hl-arthrose', 'hl-figue-barbarie', 'hl-citron', 'dn-lecode-esprit-purple',
    'hl-rose-blanc', 'hl-clou-girofle', 'hl-rose', 'mg-ananas',
    'dn-lecode-reve-folie', 'hl-nigelle', 'dn-lecode-souffle-etoiles', 'mg-papaye',
    'ambre-nomade', 'dn-lecode-la-cavale', 'ansaam-gold', 'libbra',
    'jade-giallo', 'amber-d-or', 'liquid-brun-french-avenue'
  ];
  v_ids text;
begin
  if (select count(*) from public.products) <> 251
     or exists (select 1 from public.products where not (slug = any (v_order))) then
    raise exception 'Abandon : le catalogue a changé depuis la sauvegarde ; ordre non restauré.';
  end if;
  select string_agg(quote_literal(p.id::text), ',' order by array_position(v_order, p.slug)) into v_ids from public.products p;
  -- Liste portée par une fonction (corps non limité en taille) : une expression d'index
  -- de 251 UUID dépasse la taille maximale d'une ligne du catalogue système.
  execute format('create function public._etape6_products_order_pos(uuid) returns int language sql immutable as %L',
                 'select array_position(array[' || v_ids || ']::uuid[], $1)');
  create index _etape6_products_order_idx on public.products ((public._etape6_products_order_pos(id)));
  cluster public.products using _etape6_products_order_idx;
  drop index public._etape6_products_order_idx;
  drop function public._etape6_products_order_pos(uuid);
end $$;

commit;
