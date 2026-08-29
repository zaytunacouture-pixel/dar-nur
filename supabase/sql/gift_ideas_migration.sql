-- =====================================================================
--  DAR NŪR — Migration « Idées cadeaux » (Phase 1)
--
--  Ajoute trois attributs administrables sur les produits :
--    gift_idea     : ce produit est mis en avant comme idée cadeau
--    gift_for_him  : destinataire « Pour lui »
--    gift_for_her  : destinataire « Pour elle »
--
--  Les tranches de budget (< 20 €, 20–50 €, 50 € et +) NE SONT PAS
--  stockées : elles sont dérivées de products.price_value, exactement
--  comme le prix affiché sur les cartes. Rien à saisir à la main.
--
--  À exécuter une fois dans : Supabase → SQL Editor → New query → Run
--  (compte propriétaire du projet, connexion par e-mail et mot de passe —
--  jamais par GitHub : voir docs/ARCHITECTURE_DAR_NUR.md).
--
--  Rollback : supabase/sql/gift_ideas_migration_rollback.sql
--
--  AUCUNE politique RLS n'est touchée. Les policies existantes
--  (public_read_active_products / admin_all_products) couvrent déjà ces
--  colonnes : elles portent sur la ligne entière, pas colonne par colonne.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Colonnes — idempotent, réexécutable sans effet de bord
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists gift_idea    boolean not null default false,
  add column if not exists gift_for_him boolean not null default false,
  add column if not exists gift_for_her boolean not null default false;

comment on column public.products.gift_idea    is 'Mis en avant dans l''univers /idees-cadeaux/ et badge « Idée cadeau » sur les cartes.';
comment on column public.products.gift_for_him is 'Destinataire « Pour lui » sur /idees-cadeaux/. N''a de sens que si gift_idea = true.';
comment on column public.products.gift_for_her is 'Destinataire « Pour elle » sur /idees-cadeaux/. N''a de sens que si gift_idea = true.';

-- Index partiel : la page cadeaux ne lit qu'un petit sous-ensemble du catalogue.
create index if not exists idx_products_gift_idea
  on public.products(gift_idea) where gift_idea = true;

-- ---------------------------------------------------------------------
-- 2) Sélection initiale — 26 produits existants, déjà au catalogue
--
--    Cette sélection est le miroir exact de celle publiée dans
--    idees-cadeaux/index.html par la première version de la page.
--    Une fois exécutée, la sélection devient pilotable depuis admin.html
--    et plus aucune modification de code n'est nécessaire.
--
--    Aucun produit n'est créé, aucun prix, stock, description ou variante
--    n'est modifié ici.
-- ---------------------------------------------------------------------

-- Pour lui uniquement
update public.products set gift_idea = true, gift_for_him = true
 where slug in (
   'dn-sheymagh-0',              -- Sheymaghs yéménite motif saoudien — 29,99 €
   'dn-sheymagh-2',              -- Sheymagh yéménite brodé — 29,99 €
   'dn-chechia-cairo-0',         -- Chechia Cairo Blanc — 7,99 €
   'dn-chechia-cairo-1',         -- Chechia Cairo Noir — 7,99 €
   'dn-sandale-homme-7',         -- Sandale Étique (Homme) — 29,90 €
   'qms-blanc',                  -- Qamis Saoudien Blanc — dès 69,99 €
   'dn-qamiss-sultan-saphir-0',  -- Qamiss Sultan saphir — 64,90 €
   'dn-lecode-galion',           -- Galion — 45,00 €
   'dn-lecode-eclipse'           -- L'Éclipse — 45,00 €
 );

-- Pour elle uniquement
update public.products set gift_idea = true, gift_for_her = true
 where slug in (
   'vt-layali-doree',            -- Ensemble Layali Dorée — 124,99 €
   'vt-aicha-noir',              -- Ensemble Aïcha Noir — 64,99 €
   'dn-abaya-nilla-0',           -- Abaya Nilla white and Gold — 39,90 €
   'br-sublimante',              -- Brume Sublimante Rose & Argan — 19,99 €
   'br-nila',                    -- Spray Nila — 19,99 €
   'dn-musc-tahara-0',           -- Musc Tahara Lavande 6 mL — dès 8,99 €
   'dn-pack-tahara-0',           -- Pack Tahara Sabaya — dès 19,99 €
   'dn-lot-nissah-1',            -- Coffret Tahara (El Makhmariya) — dès 15,00 €
   'hl-rose',                    -- Huile de Rose — 9,99 €
   'gommage-aker-fassi',         -- Gommage Aker Fassi — dès 14,99 €
   'dn-lecode-rose-velours'      -- Rose Velours — 45,00 €
 );

-- Convient aux deux (produits réellement mixtes : miels, encens, parfums unisexes)
update public.products set gift_idea = true, gift_for_him = true, gift_for_her = true
 where slug in (
   'dn-bakhour-0',               -- Bakhur Mukhalat — 24,99 €
   'dn-khair-pistachio',         -- Khair Pistachio — 20,00 €
   'khamrah-eau-de-parfum-unisexe-100ml-lattafa', -- Khamrah EDP unisexe — 30,00 €
   'miel-sidr-jujubier',         -- Miel Sidr de Jujubier — dès 9,99 €
   'miel-shilajit',              -- Miel Noir de Shilajit — dès 14,99 €
   'mg-framboise-passion'        -- Miel Framboise & Passion — 24,99 €
 );

-- ---------------------------------------------------------------------
-- 3) Contrôle — à lire avant de valider
--    Attendu : 26 produits, dont 15 « lui » et 17 « elle »
--    (6 produits mixtes sont comptés dans les deux colonnes).
-- ---------------------------------------------------------------------
select count(*) filter (where gift_idea)                     as idees_cadeaux,
       count(*) filter (where gift_idea and gift_for_him)    as pour_lui,
       count(*) filter (where gift_idea and gift_for_her)    as pour_elle,
       count(*) filter (where gift_idea and price_value is null) as sans_prix
  from public.products
 where active = true;

commit;

-- Après COMMIT : lancer une fois le workflow GitHub Actions
-- « Régénère les fiches produit (Supabase → HTML statique) » (bouton
-- Run workflow) pour propager badges et page cadeaux dans le HTML publié.
