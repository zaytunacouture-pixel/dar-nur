-- ============================================================================
-- Refonte — étape 6 · 08 · Remplissage des collections et triggers de transition
--
-- Arbre enregistré (noms, H1, titles et metas : étape 3, « définitif ») :
--
--   Miels & Herboristerie   /miels-herboristerie/
--     Miels                 /miels/              (H1 « Miels & préparations au miel »)
--       Miels gourmands     /miels-gourmands/    (sous-collection)
--     Poudres & graines     /poudres/
--     Gélules               /gelules/
--   Parfums & Soins         /parfums-soins/
--     Parfums               /parfums/
--     Parfums d'intérieur   /parfums-interieur/  (remplacera /bakhour/ à la bascule)
--     Muscs & Tahara        /tahara/
--     Soins & beauté        /soins/
--       Brumes & eaux florales /brumes/          (sous-collection)
--     Huiles                /huiles/
--   Mode                    /mode/               (H1 « Mode modeste »)
--     Abayas & ensembles    /abayas/
--     Mode homme            /mode-homme/
--       Qamis               /qamis/              (indexable par exception, étape 3)
--       Sandales            /chaussures/         (URL conservée, libellé « Sandales »)
--       Accessoires         /accessoires/
--   Transverses : Idées cadeaux /idees-cadeaux/ · Offres & packs /offres/
--
-- Les filtres internes (Miel & plantes, Hammam, Chéchias…) ne sont PAS créés :
-- leur liste et leurs libellés relèvent des pages de l'étape 7 ; la structure
-- (type = 'filter') les accepte sans migration supplémentaire.
--
-- Collection principale de chaque produit (251, exactement une chacun) :
--   - par défaut, d'après la catégorie historique (legacy_category_collections),
--     source = 'legacy_category' — dont les fusions validées miels-terroir → Miels
--     et chechias → Accessoires ;
--   - reclassements documentés, source = 'migration' :
--       24 soins de « tahara » → Soins & beauté (étape 2),
--       5 sprays LeCode « parfums » → Parfums d'intérieur (étape 2),
--       3 poudres cosmétiques « poudres » → Soins & beauté (étape 2),
--       miel-fraise-russie « miels » → Miels gourmands (étape 3, définition
--       « préparation au miel dont tous les ingrédients ajoutés sont des fruits »).
-- Collections secondaires :
--   - Idées cadeaux pour les 36 produits gift_idea = true (source legacy_gift_idea) ;
--   - Offres & packs pour les 6 produits « pack » / « lot » (étape 2, source migration).
-- Aucun autre reclassement. category_id n'est pas modifié.
--
-- TRIGGERS DE TRANSITION (sens unique : products → product_collections) :
--   - category_id posé ou modifié → la principale suit, SEULEMENT si elle est
--     encore de source legacy_category (jamais une principale 'migration'/'admin') ;
--     un produit créé sans principale en reçoit une ;
--   - gift_idea modifié → appartenance à Idées cadeaux ajoutée / retirée
--     (seules les lignes legacy_gift_idea sont retirées).
--
-- Idempotente. Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Arbre des collections
-- ----------------------------------------------------------------------------
-- Niveau 1 : univers et transverses (racines).
insert into public.collections (slug, path, type, status, name, nav_label, h1, seo_title, seo_description, sort_order, is_indexable)
select slug, path, type, 'published', name, nav_label, h1, seo_title, seo_description, sort_order, true
  from (values
  ('miels-herboristerie', '/miels-herboristerie/', 'universe', 'Miels & Herboristerie', null, null,
   'Miels, graines, poudres & gélules de plantes | Dar Nūr',
   'Miels, préparations au miel, graines, poudres et gélules de plantes : toute la sélection Miels & Herboristerie de Dar Nūr.', 10),
  ('parfums-soins', '/parfums-soins/', 'universe', 'Parfums & Soins', null, null,
   'Parfums, muscs, soins & huiles | Dar Nūr',
   'Parfums, parfums d''intérieur, musc Tahara, soins du hammam et huiles : l''univers Parfums & Soins de Dar Nūr.', 20),
  ('mode', '/mode/', 'universe', 'Mode', null, 'Mode modeste',
   'Mode modeste femme & homme : abayas, qamis | Dar Nūr',
   'Abayas et ensembles pour femme, qamis, sandales, chéchias et shemaghs pour homme : la mode modeste Dar Nūr.', 30),
  ('idees-cadeaux', '/idees-cadeaux/', 'transverse', 'Idées cadeaux', null, null,
   'Idées cadeaux pour elle et pour lui | Dar Nūr',
   'Une sélection à offrir, pour elle ou pour lui et par budget : parfums, miels, soins, coffrets.', 40),
  ('offres', '/offres/', 'transverse', 'Offres & packs', null, null,
   'Packs & coffrets : miels, soins, Tahara | Dar Nūr',
   'Packs et coffrets Dar Nūr : routine Nila, rituel Louban, coffrets Tahara, assortiments de miels…', 50)
  ) as d(slug, path, type, name, nav_label, h1, seo_title, seo_description, sort_order)
on conflict (slug) do nothing;

-- Niveau 2 : collections (parent = univers).
with data (slug, path, parent_slug, type, name, nav_label, h1, seo_title, seo_description, sort_order) as (
  values
  ('miels', '/miels/', 'miels-herboristerie', 'collection', 'Miels', null, 'Miels & préparations au miel',
   'Miels & préparations au miel | Dar Nūr',
   'Miels nature, préparations au miel et aux plantes — nigelle, sidr, gingembre, shilajit — et miels gourmands aux fruits.', 10),
  ('poudres', '/poudres/', 'miels-herboristerie', 'collection', 'Poudres & graines', null, null,
   'Poudres & graines de plantes | Dar Nūr',
   'Graines et poudres de plantes à usage alimentaire : nigelle, moringa, costus, psyllium, chia, gomme arabique, oliban…', 20),
  ('gelules', '/gelules/', 'miels-herboristerie', 'collection', 'Gélules', null, 'Gélules de plantes',
   'Gélules de plantes | Dar Nūr',
   'Gélules de nigelle, ashwagandha, moringa, spiruline, fenugrec, chardon-marie, valériane et d''autres plantes.', 30),
  ('parfums', '/parfums/', 'parfums-soins', 'collection', 'Parfums', null, null,
   'Parfums : extraits & eaux de parfum | Dar Nūr',
   'Extraits et eaux de parfum LeCode Paris, Lattafa, Gulf Collection… : notes gourmandes, boisées, ambrées ou florales.', 10),
  ('parfums-interieur', '/parfums-interieur/', 'parfums-soins', 'collection', 'Parfums d''intérieur', null, 'Parfums d''intérieur & encens',
   'Parfums d''intérieur, bakhour & encens | Dar Nūr',
   'Sprays d''ambiance et bakhour pour parfumer la maison : Brise de Coton, Jardin Persan, Mystère d''Orient, Bakhur Mukhalat…', 20),
  ('tahara', '/tahara/', 'parfums-soins', 'collection', 'Muscs & Tahara', null, null,
   'Musc Tahara, packs & coffrets Tahara | Dar Nūr',
   'Musc Tahara en plusieurs senteurs, packs et coffrets Tahara : l''essentiel du rituel de pureté.', 30),
  ('soins', '/soins/', 'parfums-soins', 'collection', 'Soins & beauté', null, null,
   'Soins & beauté : savon noir, gommages, khôl | Dar Nūr',
   'Savons noirs, gommages, déodorants, karité, khôl Ismid, poudres de Nila et de Sidr : soins du hammam et beauté traditionnelle.', 40),
  ('huiles', '/huiles/', 'parfums-soins', 'collection', 'Huiles', null, 'Huiles de soin',
   'Huiles de soin : nigelle, rose, figue de barbarie | Dar Nūr',
   'Huiles de nigelle, rose, figue de barbarie, oliban, lavande… à usage externe, pour le corps, les cheveux ou la diffusion.', 50),
  ('abayas', '/abayas/', 'mode', 'collection', 'Abayas & ensembles', null, null,
   'Abayas & ensembles femme | Dar Nūr',
   'Abayas et ensembles : coupes fluides, broderies, kimonos et ensembles assortis, dans de nombreux coloris.', 10),
  ('mode-homme', '/mode-homme/', 'mode', 'collection', 'Mode homme', 'Homme', null,
   'Mode homme : qamis, sandales, chéchias | Dar Nūr',
   'Qamis, sandales, chéchias et shemaghs : la sélection homme de Dar Nūr.', 20)
)
insert into public.collections (slug, path, parent_id, type, status, name, nav_label, h1, seo_title, seo_description, sort_order, is_indexable)
select d.slug, d.path, parent.id, d.type, 'published', d.name, d.nav_label, d.h1, d.seo_title, d.seo_description, d.sort_order, true
  from data d join public.collections parent on parent.slug = d.parent_slug
on conflict (slug) do nothing;

-- Niveau 3 : sous-collections (parent = collection).
with data (slug, path, parent_slug, type, name, nav_label, h1, seo_title, seo_description, sort_order) as (
  values
  ('miels-gourmands', '/miels-gourmands/', 'miels', 'subcollection', 'Miels gourmands', null, 'Miels gourmands aux fruits',
   'Miels gourmands aux fruits | Dar Nūr',
   'Préparations au miel et aux fruits : fraise, framboise, mangue, passion, ananas, papaye… À déguster ou à offrir.', 10),
  ('brumes', '/brumes/', 'soins', 'subcollection', 'Brumes & eaux florales', null, null,
   'Brumes visage & corps, eau de rose | Dar Nūr',
   'Brumes visage et corps et eau de rose, à vaporiser pour rafraîchir la peau.', 10),
  ('qamis', '/qamis/', 'mode-homme', 'subcollection', 'Qamis', null, null,
   'Qamis pour homme | Dar Nūr',
   'Qamis pour homme en plusieurs couleurs et tailles, avec guide des tailles.', 10),
  ('chaussures', '/chaussures/', 'mode-homme', 'subcollection', 'Sandales', null, 'Sandales homme',
   'Sandales homme | Dar Nūr',
   'Sandales pour homme — Comera, Chujara, Hayat, Étique — à porter avec un qamis ou au quotidien.', 20),
  ('accessoires', '/accessoires/', 'mode-homme', 'subcollection', 'Accessoires', null, 'Accessoires homme',
   'Chéchias & shemaghs pour homme | Dar Nūr',
   'Chéchias et shemaghs pour homme : couvre-chefs traditionnels en plusieurs couleurs et motifs.', 30)
)
insert into public.collections (slug, path, parent_id, type, status, name, nav_label, h1, seo_title, seo_description, sort_order, is_indexable)
select d.slug, d.path, parent.id, d.type, 'published', d.name, d.nav_label, d.h1, d.seo_title, d.seo_description, d.sort_order, true
  from data d join public.collections parent on parent.slug = d.parent_slug
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Correspondance catégorie historique → collection principale par défaut
-- ----------------------------------------------------------------------------
insert into public.legacy_category_collections (category_id, collection_id)
select m.category_id, c.id
  from (values
    ('miels', 'miels'), ('miels-terroir', 'miels'), ('miels-gourmands', 'miels-gourmands'),
    ('poudres', 'poudres'), ('gelules', 'gelules'),
    ('parfums', 'parfums'), ('bakhour', 'parfums-interieur'), ('tahara', 'tahara'),
    ('brumes', 'brumes'), ('huiles', 'huiles'),
    ('vetements', 'abayas'), ('qamis', 'qamis'), ('chaussures', 'chaussures'),
    ('chechias', 'accessoires'), ('accessoires', 'accessoires')
  ) as m(category_id, collection_slug)
  join public.collections c on c.slug = m.collection_slug
  join public.categories k on k.id = m.category_id
on conflict (category_id) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Collections principales
-- ----------------------------------------------------------------------------
-- 3a) Reclassements documentés (étapes 2 et 3), fixes.
insert into public.product_collections (product_id, collection_id, role, source)
select p.id, c.id, 'primary', 'migration'
  from (values
    -- Tahara → Soins & beauté (24, étape 2 : soins du corps, pas des muscs)
    ('poudre-el-anoud', 'soins'), ('poudre-al-mousany', 'soins'), ('poudre-arawar', 'soins'),
    ('poudre-sultan', 'soins'), ('poudre-arnousha', 'soins'), ('poudre-nesaim', 'soins'),
    ('pierre-alun-khaliji', 'soins'), ('savon-noir-aker-fassi', 'soins'), ('savon-noir-nila', 'soins'),
    ('savon-noir-ekhan', 'soins'), ('savon-noir-lavande', 'soins'), ('savon-noir-aloes-pinere', 'soins'),
    ('savon-noir-karite', 'soins'), ('savon-noir-hibiscus-nigelle', 'soins'), ('gommage-aker-fassi', 'soins'),
    ('gommage-louban', 'soins'), ('gommage-louban-lavande', 'soins'), ('gommage-hibiscus-nigelle', 'soins'),
    ('gommage-khamare-citron', 'soins'), ('gommage-nila', 'soins'), ('chantilly-karite-moninga', 'soins'),
    ('chantilly-karite-nila', 'soins'), ('savon-nila-bleu', 'soins'), ('savon-oliban', 'soins'),
    -- Poudres cosmétiques → Soins & beauté (3, étape 2 : usage non alimentaire)
    ('pdr-nila', 'soins'), ('dn-ismid-medine', 'soins'), ('dn-poudre-de-sidr-50g', 'soins'),
    -- Sprays d'ambiance LeCode → Parfums d'intérieur (5, étape 2)
    ('dn-lecode-brise-coton', 'parfums-interieur'), ('dn-lecode-douceur-iles', 'parfums-interieur'),
    ('dn-lecode-horizon', 'parfums-interieur'), ('dn-lecode-jardin-persan', 'parfums-interieur'),
    ('dn-lecode-mystere-orient', 'parfums-interieur'),
    -- Miel + fruit uniquement → Miels gourmands (étape 3)
    ('miel-fraise-russie', 'miels-gourmands')
  ) as r(product_slug, collection_slug)
  join public.products p on p.slug = r.product_slug
  join public.collections c on c.slug = r.collection_slug
 where not exists (select 1 from public.product_collections x where x.product_id = p.id and x.role = 'primary')
on conflict do nothing;

-- 3b) Tous les autres : d'après la catégorie historique.
insert into public.product_collections (product_id, collection_id, role, source)
select p.id, m.collection_id, 'primary', 'legacy_category'
  from public.products p
  join public.legacy_category_collections m on m.category_id = p.category_id
 where not exists (select 1 from public.product_collections x where x.product_id = p.id and x.role = 'primary')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 4) Collections secondaires
-- ----------------------------------------------------------------------------
insert into public.product_collections (product_id, collection_id, role, source)
select p.id, c.id, 'secondary', 'legacy_gift_idea'
  from public.products p
  join public.collections c on c.slug = 'idees-cadeaux'
 where p.gift_idea = true
on conflict do nothing;

insert into public.product_collections (product_id, collection_id, role, source)
select p.id, c.id, 'secondary', 'migration'
  from public.products p
  join public.collections c on c.slug = 'offres'
 where p.slug in ('dn-pack-tahara-0', 'dn-pack-tahara-1', 'dn-pack-tahara-2', 'dn-pack-tahara-abyad',
                  'dn-lot-nissah-0', 'dn-lot-nissah-1')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 5) Contrôle : chaque produit a exactement une collection principale
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing int;
begin
  select count(*) into v_missing
    from public.products p
   where not exists (select 1 from public.product_collections x where x.product_id = p.id and x.role = 'primary');
  if v_missing > 0 then
    raise exception 'Abandon : % produit(s) sans collection principale.', v_missing;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6) Triggers de transition products → product_collections
-- ----------------------------------------------------------------------------
create or replace function public.products_sync_collections()
returns trigger language plpgsql as $$
declare
  v_target uuid;
  v_gift   uuid;
begin
  -- Collection principale par défaut, d'après la catégorie historique.
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    select collection_id into v_target from public.legacy_category_collections where category_id = new.category_id;
    if v_target is not null then
      if not exists (select 1 from public.product_collections where product_id = new.id and role = 'primary') then
        delete from public.product_collections where product_id = new.id and collection_id = v_target;
        insert into public.product_collections (product_id, collection_id, role, source)
        values (new.id, v_target, 'primary', 'legacy_category');
      elsif exists (select 1 from public.product_collections
                     where product_id = new.id and role = 'primary' and source = 'legacy_category'
                       and collection_id <> v_target) then
        delete from public.product_collections where product_id = new.id and collection_id = v_target and role = 'secondary';
        update public.product_collections set collection_id = v_target
         where product_id = new.id and role = 'primary' and source = 'legacy_category';
      end if;
      -- Principale 'migration' ou 'admin' : décision documentée ou humaine, jamais écrasée.
    end if;
  end if;

  -- Idées cadeaux, d'après gift_idea.
  if tg_op = 'INSERT' or new.gift_idea is distinct from old.gift_idea then
    select id into v_gift from public.collections where slug = 'idees-cadeaux';
    if v_gift is not null then
      if new.gift_idea then
        insert into public.product_collections (product_id, collection_id, role, source)
        values (new.id, v_gift, 'secondary', 'legacy_gift_idea')
        on conflict do nothing;
      else
        delete from public.product_collections
         where product_id = new.id and collection_id = v_gift and source = 'legacy_gift_idea';
      end if;
    end if;
  end if;

  return null;
end;
$$;

comment on function public.products_sync_collections() is
  'Transition étape 6 : category_id → principale (si source legacy_category), gift_idea → Idées cadeaux. À retirer avec category_id.';

drop trigger if exists trg_products_sync_collections on public.products;
create trigger trg_products_sync_collections
  after insert or update of category_id, gift_idea on public.products
  for each row execute function public.products_sync_collections();

notify pgrst, 'reload schema';

commit;
