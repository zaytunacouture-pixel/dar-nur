-- ============================================================================
-- Refonte — étape 6 · 09 · Regroupements futurs (modèles Mode, doublons)
--
-- Prépare, SANS AUCUN EFFET sur les fiches publiques, les fusions qui ne
-- pourront être exécutées qu'à la bascule Netlify (redirections 301) :
--   product_groupings         un regroupement proposé (modèle cible ou doublon)
--   product_grouping_members  les fiches concernées et la valeur d'option
--                             proposée pour chacune (couleur, motif, senteur)
-- Aucune fiche n'est supprimée, renommée, dépubliée ni modifiée ;
-- products.replaced_by_product_id reste NULL partout.
--
-- Données : Livrable 2 de l'étape 2 et décisions de l'étape 3.
--   decision = 'safe'          : 15 regroupements sûrs (72 fiches → 15 modèles) ;
--   decision = 'needs_review'  : validation humaine requise avant toute fusion —
--     Nilla (5 broderies, motifs à nommer), Sultan Saphir, Comera 6 et 8,
--     Musc Tahara (senteurs), Farasha + Farasha brodée (fusion des deux modèles),
--     et les 2 doublons (dn-miel-nigelle-hibiscus, dn-abaya-nilla-5).
--   label_source : product_name (lu dans le nom de la fiche), photo (lu sur la
--     photo seulement), interpreted (déduit et marqué « à confirmer »),
--     unknown (aucun libellé : à nommer).
-- Pack Tahara (4 fiches) n'est pas enregistré : l'étape 2 conclut « garder séparés ».
--
-- Tables INTERNES : aucune lecture publique (travail éditorial non validé).
-- Idempotente. Rollback : supabase/rollback/20261002_etape6_rollback.sql.
-- ============================================================================

begin;

create table if not exists public.product_groupings (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- G01…, DUP-…
  kind            text not null,                   -- model | duplicate
  decision        text not null,                   -- safe | needs_review | validated | rejected | applied
  proposed_name   text,
  proposed_slug   text,                            -- slug futur du modèle (étape 3) ; NULL si non arrêté
  option_type_id  text references public.option_types(id) on delete restrict,   -- axe qui distingue les fiches
  base_product_id uuid references public.products(id) on delete set null,       -- fiche de base / survivante proposée
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint chk_groupings_kind     check (kind in ('model', 'duplicate')),
  constraint chk_groupings_decision check (decision in ('safe', 'needs_review', 'validated', 'rejected', 'applied')),
  constraint chk_groupings_slug     check (proposed_slug is null or proposed_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table if not exists public.product_grouping_members (
  grouping_id          uuid not null references public.product_groupings(id) on delete cascade,
  product_id           uuid not null references public.products(id) on delete cascade,
  proposed_value_label text,                       -- Noir, Vert sapin… ; NULL = à nommer
  label_source         text not null default 'unknown',
  primary key (grouping_id, product_id),
  constraint chk_grouping_members_source check (label_source in ('product_name', 'photo', 'interpreted', 'unknown'))
);
create index if not exists idx_grouping_members_product on public.product_grouping_members (product_id);

drop trigger if exists trg_product_groupings_updated_at on public.product_groupings;
create trigger trg_product_groupings_updated_at
  before update on public.product_groupings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Regroupements
-- ----------------------------------------------------------------------------
insert into public.product_groupings (code, kind, decision, proposed_name, proposed_slug, option_type_id, base_product_id, note)
select g.code, g.kind, g.decision, g.name, g.slug, g.axis, p.id, g.note
  from (values
    ('G01', 'model', 'safe', 'Abaya Nouha', 'abaya-nouha', 'couleur', 'vt-abaya-nouha-gris-argente', 'Axes couleur × taille.'),
    ('G02', 'model', 'safe', 'Ensemble Aïcha', 'ensemble-aicha', 'couleur', 'vt-aicha-noir', 'Axes couleur × taille.'),
    ('G03', 'model', 'safe', 'Ensemble Layali', 'ensemble-layali', 'couleur', 'vt-layali-beige', 'Tailles en base sur Beige seulement : à compléter pour les 3 autres couleurs.'),
    ('G04', 'model', 'safe', 'Ensemble Nissah Mastoura', 'ensemble-nissah-mastoura', 'couleur', 'vt-nissah-bleu', 'Aucune taille en base.'),
    ('G05', 'model', 'safe', 'Abaya Demi-Papillon', 'abaya-demi-papillon', 'couleur', 'dn-abaya-demi-papillon-0', 'Couleurs des fiches 0 et 1 lues sur photo : à confirmer.'),
    ('G06', 'model', 'safe', 'Abaya Farasha', 'abaya-farasha', 'couleur', 'dn-abaya-papillon-0', 'Fusion éventuelle avec G07 à arbitrer (voir FARASHA).'),
    ('G07', 'model', 'safe', 'Abaya Farasha brodée', 'abaya-farasha-brodee', 'couleur', 'dn-abaya-papillon-3', 'Slug PROVISOIRE : à figer après l''arbitrage Farasha (étape 3).'),
    ('G08', 'model', 'safe', 'Abaya Roumeyssa', 'abaya-roumeyssa', 'couleur', 'dn-abaya-saoudienne-0', null),
    ('G09', 'model', 'safe', 'Abaya Iltihad', 'abaya-iltihad', 'couleur', 'dn-abaya-iltihad-0', 'Modèle sûr ; libellés de coloris lus sur photo, à valider.'),
    ('G10', 'model', 'safe', 'Abaya Mme Dar Nūr 4 pièces', 'abaya-mme-dar-nur-4-pieces', 'couleur', 'dn-abaya-mme-dn-0', 'Nom PROVISOIRE (« Mme » ou « Madame ») ; dn-abaya-mme-dn-3 est un autre modèle.'),
    ('G11', 'model', 'safe', 'Abaya Chita', 'abaya-chita', 'couleur', 'dn-abaya-chita-0', null),
    ('G12', 'model', 'safe', 'Abaya kimono Seyra', 'abaya-kimono-seyra', 'couleur', 'dn-abaya-kimono-seyra-0', null),
    ('G14', 'model', 'safe', 'Qamis saoudien', 'qamis-saoudien', 'couleur', 'qms-blanc', 'Axes couleur × taille (XXL en base, 2XL ailleurs : non unifié).'),
    ('G16', 'model', 'safe', 'Sandale Comera', 'sandale-comera', 'couleur', 'dn-sandale-homme-0', 'Aucune pointure en base.'),
    ('G17', 'model', 'safe', 'Chéchia Cairo', 'chechia-cairo', 'couleur', 'dn-chechia-cairo-0', null),
    ('G13', 'model', 'needs_review', 'Abaya Nilla', 'abaya-nilla', 'motif', 'dn-abaya-nilla-0',
     'À VALIDER : 5 broderies différentes (pas des couleurs) ; regrouper exige de nommer les motifs. dn-abaya-nilla-5 = doublon de -3.'),
    ('G15', 'model', 'needs_review', 'Qamis Sultan Saphir', null, 'couleur', 'dn-qamiss-sultan-saphir-0',
     'À VALIDER : prix différents selon la couleur ; la fiche -0 montre une pièce bicolore à cape.'),
    ('G16b', 'model', 'needs_review', 'Sandale Comera (dessin différent)', null, 'couleur', 'dn-sandale-homme-6',
     'À VALIDER : rattacher à G16 ou garder séparées (tige de dessin différent sur la photo).'),
    ('G18', 'model', 'needs_review', 'Musc Tahara 6 ml', null, 'senteur', 'dn-musc-tahara-0',
     'À VALIDER : une fiche avec choix de senteur, ou 4 fiches ? Choix commercial.'),
    ('FARASHA', 'model', 'needs_review', 'Abaya Farasha (avec la version brodée ?)', null, 'couleur', 'dn-abaya-papillon-0',
     'À VALIDER : réunir G06 et G07 en un seul modèle (même prix, finition différente) ou les garder distincts.'),
    ('DUP-MIEL-HIBISCUS', 'duplicate', 'needs_review', 'Miel Hibiscus, Nigelle & Zamzam', null, null, 'miel-hibiscus-zamzam',
     'À VALIDER : dn-miel-nigelle-hibiscus doublon probable (étiquette photo identique) ; prix 25 € contre 24,99 €. Ne pas supprimer sans accord.'),
    ('DUP-ABAYA-NILLA', 'duplicate', 'needs_review', 'Abaya Nilla (broderie D)', null, null, 'dn-abaya-nilla-3',
     'À VALIDER : dn-abaya-nilla-5 a la même photo que dn-abaya-nilla-3. Ne pas supprimer sans accord.')
  ) as g(code, kind, decision, name, slug, axis, base_slug, note)
  join public.products p on p.slug = g.base_slug
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Membres et valeur proposée
-- ----------------------------------------------------------------------------
insert into public.product_grouping_members (grouping_id, product_id, proposed_value_label, label_source)
select g.id, p.id, m.label, m.source
  from (values
    ('G01', 'vt-abaya-nouha-gris-argente', 'Gris argenté', 'product_name'),
    ('G01', 'vt-abaya-nouha-noir-dentelle', 'Noir dentelle', 'product_name'),
    ('G01', 'vt-abaya-nouha-bleu-ciel', 'Bleu ciel', 'product_name'),
    ('G01', 'vt-abaya-nouha-rose-marrone', 'Rose marron', 'product_name'),
    ('G02', 'vt-aicha-vert-sapin', 'Vert sapin', 'product_name'),
    ('G02', 'vt-aicha-orange', 'Orange', 'product_name'),
    ('G02', 'vt-aicha-violet', 'Violet', 'product_name'),
    ('G02', 'vt-aicha-bordeaux', 'Bordeaux', 'product_name'),
    ('G02', 'vt-aicha-blanc', 'Blanc', 'product_name'),
    ('G02', 'vt-aicha-noir', 'Noir', 'product_name'),
    ('G02', 'vt-aicha-kaki', 'Kaki', 'product_name'),
    ('G03', 'vt-layali-beige', 'Beige', 'product_name'),
    ('G03', 'vt-layali-blanc', 'Blanc', 'product_name'),
    ('G03', 'vt-layali-doree', 'Doré', 'product_name'),
    ('G03', 'vt-layali-noir', 'Noir', 'product_name'),
    ('G04', 'vt-nissah-blanc', 'Blanc', 'product_name'),
    ('G04', 'vt-nissah-bleu', 'Bleu', 'product_name'),
    ('G04', 'vt-nissah-bordeaux', 'Bordeaux', 'product_name'),
    ('G04', 'vt-nissah-noir', 'Noir', 'product_name'),
    ('G04', 'vt-nissah-vert', 'Vert sapin', 'product_name'),
    ('G04', 'vt-nissah-violet', 'Violet', 'product_name'),
    ('G04', 'vt-nissah-kaki', 'Kaki', 'product_name'),
    ('G05', 'dn-abaya-demi-papillon-0', 'Noir', 'photo'),
    ('G05', 'dn-abaya-demi-papillon-1', 'Caramel & noir', 'photo'),
    ('G05', 'dn-abaya-demi-papillon-2', 'Brique satiné', 'product_name'),
    ('G06', 'dn-abaya-papillon-0', 'Taupe & noir', 'product_name'),
    ('G06', 'dn-abaya-papillon-1', 'Noir', 'product_name'),
    ('G06', 'dn-abaya-papillon-2', 'Bleu marine', 'photo'),
    ('G07', 'dn-abaya-papillon-3', 'Taupe brodé', 'interpreted'),
    ('G07', 'dn-abaya-papillon-4', 'Noir brodé', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-0', 'Marron caramel', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-1', 'Taupe & or', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-2', 'Bleu anthracite', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-3', 'Aubergine & or', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-4', 'Beige poudré', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-5', 'Vert d’eau', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-6', 'Blanc & or', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-7', 'Gris souris', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-8', 'Bleu marine', 'product_name'),
    ('G08', 'dn-abaya-saoudienne-9', 'Beige clair', 'product_name'),
    ('G09', 'dn-abaya-iltihad-0', 'Beige & marron à pois', 'photo'),
    ('G09', 'dn-abaya-iltihad-1', 'Noir fleuri', 'photo'),
    ('G09', 'dn-abaya-iltihad-2', 'Noir & gris', 'photo'),
    ('G10', 'dn-abaya-mme-dn-0', 'Noir & vert', 'product_name'),
    ('G10', 'dn-abaya-mme-dn-1', 'Blanc & noir', 'product_name'),
    ('G10', 'dn-abaya-mme-dn-2', 'Noir & rouge', 'interpreted'),
    ('G11', 'dn-abaya-chita-0', 'Rose', 'product_name'),
    ('G11', 'dn-abaya-chita-1', 'Marron', 'product_name'),
    ('G11', 'dn-abaya-chita-2', 'Rouge', 'product_name'),
    ('G11', 'dn-abaya-chita-3', 'Bleu roi', 'product_name'),
    ('G11', 'dn-abaya-chita-4', 'Vert d’eau', 'product_name'),
    ('G11', 'dn-abaya-chita-5', 'Aubergine', 'product_name'),
    ('G12', 'dn-abaya-kimono-seyra-0', 'Noir & gris', 'product_name'),
    ('G12', 'dn-abaya-kimono-seyra-1', 'Noir & marron', 'product_name'),
    ('G12', 'dn-abaya-kimono-seyra-2', 'Noir', 'product_name'),
    ('G14', 'qms-blanc', 'Blanc', 'product_name'),
    ('G14', 'qms-bleu-ciel', 'Bleu ciel', 'product_name'),
    ('G14', 'qms-gris', 'Gris foncé', 'product_name'),
    ('G14', 'qms-marron', 'Marron', 'product_name'),
    ('G16', 'dn-sandale-homme-0', 'Blanc', 'product_name'),
    ('G16', 'dn-sandale-homme-1', 'Beige', 'product_name'),
    ('G16', 'dn-sandale-homme-2', 'Beige tressé', 'interpreted'),
    ('G16', 'dn-sandale-homme-3', 'Vert militaire', 'product_name'),
    ('G16', 'dn-sandale-homme-4', 'Noir', 'product_name'),
    ('G16', 'dn-sandale-homme-5', 'Marron', 'product_name'),
    ('G17', 'dn-chechia-cairo-0', 'Blanc', 'product_name'),
    ('G17', 'dn-chechia-cairo-1', 'Noir', 'product_name'),
    ('G17', 'dn-chechia-cairo-2', 'Marron', 'product_name'),
    ('G17', 'dn-chechia-cairo-3', 'Bleu', 'product_name'),
    ('G17', 'dn-chechia-cairo-4', 'Vert', 'product_name'),
    ('G17', 'dn-chechia-cairo-5', 'Gris clair', 'product_name'),
    ('G17', 'dn-chechia-cairo-6', 'Beige', 'product_name'),
    -- Incertains
    ('G13', 'dn-abaya-nilla-0', null, 'unknown'),
    ('G13', 'dn-abaya-nilla-1', null, 'unknown'),
    ('G13', 'dn-abaya-nilla-2', null, 'unknown'),
    ('G13', 'dn-abaya-nilla-3', null, 'unknown'),
    ('G13', 'dn-abaya-nilla-4', null, 'unknown'),
    ('G15', 'dn-qamiss-sultan-saphir-0', 'Noir & moutarde', 'product_name'),
    ('G15', 'dn-qamiss-sultan-saphir-1', 'Bleu ciel', 'product_name'),
    ('G15', 'dn-qamiss-sultan-saphir-2', 'Beige', 'product_name'),
    ('G15', 'dn-qamiss-sultan-saphir-3', 'Noir satiné', 'product_name'),
    ('G16b', 'dn-sandale-homme-6', 'Noir & blanc', 'product_name'),
    ('G16b', 'dn-sandale-homme-8', 'Bleu marine', 'product_name'),
    ('G18', 'dn-musc-tahara-0', 'Lavande', 'product_name'),
    ('G18', 'dn-musc-tahara-1', 'Blanc', 'product_name'),
    ('G18', 'dn-musc-tahara-2', 'Myrtille', 'product_name'),
    ('G18', 'dn-musc-tahara-grenade', 'Grenade', 'product_name'),
    ('FARASHA', 'dn-abaya-papillon-0', null, 'unknown'),
    ('FARASHA', 'dn-abaya-papillon-1', null, 'unknown'),
    ('FARASHA', 'dn-abaya-papillon-2', null, 'unknown'),
    ('FARASHA', 'dn-abaya-papillon-3', null, 'unknown'),
    ('FARASHA', 'dn-abaya-papillon-4', null, 'unknown'),
    ('DUP-MIEL-HIBISCUS', 'miel-hibiscus-zamzam', null, 'unknown'),
    ('DUP-MIEL-HIBISCUS', 'dn-miel-nigelle-hibiscus', null, 'unknown'),
    ('DUP-ABAYA-NILLA', 'dn-abaya-nilla-3', null, 'unknown'),
    ('DUP-ABAYA-NILLA', 'dn-abaya-nilla-5', null, 'unknown')
  ) as m(code, product_slug, label, source)
  join public.product_groupings g on g.code = m.code
  join public.products p on p.slug = m.product_slug
on conflict (grouping_id, product_id) do nothing;

-- Contrôle : 72 fiches dans les 15 regroupements sûrs ; aucune fiche ne manque.
do $$
declare
  v_safe_groups  int;
  v_safe_members int;
  v_all_members  int;
begin
  select count(*) into v_safe_groups from public.product_groupings where decision = 'safe' and kind = 'model';
  select count(*) into v_safe_members
    from public.product_grouping_members m join public.product_groupings g on g.id = m.grouping_id
   where g.decision = 'safe' and g.kind = 'model';
  select count(*) into v_all_members from public.product_grouping_members;
  -- Base vide (base locale neuve) : rien à vérifier. Sinon, toute fiche introuvable
  -- (slug mal saisi, produit supprimé) fait échouer la migration au lieu d'être ignorée.
  if not exists (select 1 from public.products) then
    return;
  end if;
  if v_safe_groups <> 15 or v_safe_members <> 72 or v_all_members <> 96 then
    raise exception 'Abandon : regroupements inattendus (% sûrs / 15, % fiches / 72, % lignes / 96).',
      v_safe_groups, v_safe_members, v_all_members;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Droits et RLS : INTERNE (admin uniquement, aucune lecture publique)
-- ----------------------------------------------------------------------------
revoke all on public.product_groupings, public.product_grouping_members from anon, authenticated;
grant select, insert, update, delete on public.product_groupings, public.product_grouping_members to authenticated;
alter table public.product_groupings enable row level security;
alter table public.product_grouping_members enable row level security;

drop policy if exists admin_only_product_groupings on public.product_groupings;
create policy admin_only_product_groupings on public.product_groupings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_only_product_grouping_members on public.product_grouping_members;
create policy admin_only_product_grouping_members on public.product_grouping_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

commit;
