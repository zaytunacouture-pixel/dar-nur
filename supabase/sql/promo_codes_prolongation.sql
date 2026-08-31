-- =====================================================================
--  DAR NŪR — Prolongation de la fenêtre de validité d'un code promotionnel
--
--  À exécuter dans : Supabase → SQL Editor → New query → Run
--  (compte propriétaire du projet — voir docs/ARCHITECTURE_DAR_NUR.md).
--
--  CE QUE FAIT CE SCRIPT, ET RIEN D'AUTRE :
--    il remplace la seule colonne public.promo_codes.ends_at du code visé.
--    La remise (rules), le minimum de commande (min_total_after_discount),
--    l'activation (active), le début de validité (starts_at) et le libellé
--    ne sont ni lus pour décision, ni écrits. Aucune autre ligne de la table
--    n'est touchée : le UPDATE porte sur le code substitué ci-dessous, et un
--    garde-fou annule tout si le nombre de lignes modifiées n'est pas 1.
--
--  NOUVELLE EXPIRATION :
--    31 août 2026 à 00 h 30 min 59,999 s, heure de Paris
--    (= 30 août 2026 22 h 30 min 59,999 s UTC — Paris est à UTC+2 en août).
--    La seconde .999 de la minute 00 h 30 est incluse volontairement : la
--    demande est « valable jusqu'à 00 h 30 incluse », donc toute la minute
--    00 h 30 est acceptée, et le refus commence à 00 h 31 min 00 s.
--    check_promo_code() refuse dès que now() > ends_at.
--
--  ⚠ LE CODE LUI-MÊME N'EST PAS ÉCRIT DANS CE FICHIER, ET NE DOIT JAMAIS
--    L'ÊTRE : GitHub Pages sert supabase/ tel quel (HTTP 200), un code écrit
--    ici serait public. Même motif que supabase/sql/promo_codes.sql :
--    jeton de substitution + garde-fou sur le préfixe.
-- =====================================================================

-- =====================================================================
--  ÉTAPE 1 / 3 — PROLONGATION (transactionnelle)
--
--  Sélectionnez tout le bloc, de « begin; » à « commit; » inclus.
--  Une SEULE valeur à remplacer : le jeton de la ligne « v_code text := ... ».
--  Si la substitution est oubliée, si le code est introuvable, ou si le UPDATE
--  ne touche pas exactement une ligne, la transaction est annulée en bloc.
-- =====================================================================
begin;

do $$
declare
  -- ↓↓↓ LA SEULE VALEUR À REMPLACER DANS TOUT LE FICHIER ↓↓↓
  v_code text := 'REMPLACER_PAR_LE_CODE';
  -- ↑↑↑ ------------------------------------------------- ↑↑↑

  -- Nouvelle borne de fin, exprimée en heure locale de Paris puis convertie
  -- en timestamptz par Postgres : aucun décalage horaire codé en dur, le
  -- passage heure d'été / heure d'hiver reste géré par la base.
  v_ends_at timestamptz :=
    (timestamp '2026-08-31 00:30:59.999') at time zone 'Europe/Paris';

  v_rows int;
begin
  -- Garde-fou de substitution : porte sur le préfixe, jamais sur le jeton
  -- entier, pour qu'un « Remplacer tout » dans l'éditeur ne le neutralise pas.
  if btrim(v_code) = '' or upper(btrim(v_code)) like 'REMPLACER%' then
    raise exception
      'Le jeton de la ligne « v_code text := ... » n''a pas été remplacé par le code réel. Rien n''a été modifié.';
  end if;

  update public.promo_codes
     set ends_at = v_ends_at
   where upper(btrim(code)) = upper(btrim(v_code));

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception
      'Aucun code ne correspond à la valeur substituée. Rien n''a été modifié.';
  end if;

  if v_rows > 1 then
    raise exception
      'Le UPDATE a touché % lignes au lieu d''une seule. Transaction annulée.', v_rows;
  end if;
end
$$;

commit;
-- ↑ FIN DE L'ÉTAPE 1. Tout ce qui suit se lance séparément, après coup.


-- =====================================================================
--  ÉTAPE 2 / 3 — VÉRIFICATION
--
--  Aucune substitution : rien à modifier ici. Une seule ligne de résultat.
--  Les colonnes nomment leur valeur attendue.
-- =====================================================================
select
  (select ends_at at time zone 'Europe/Paris'
     from public.promo_codes
    where code <> 'ZZ-TEST-EXPIRE'
    order by created_at desc limit 1)
    as expiration_paris__attendu_2026_08_31_00_30_59_999,

  (select ends_at at time zone 'UTC'
     from public.promo_codes
    where code <> 'ZZ-TEST-EXPIRE'
    order by created_at desc limit 1)
    as expiration_utc__attendu_2026_08_30_22_30_59_999,

  (select ends_at > now()
     from public.promo_codes
    where code <> 'ZZ-TEST-EXPIRE'
    order by created_at desc limit 1)
    as encore_valide_maintenant,

  -- Les trois colonnes suivantes prouvent la frontière sans attendre l'heure :
  -- elles comparent ends_at à trois instants précis, exactement comme le fera
  -- check_promo_code() avec now().
  (select ((timestamp '2026-08-31 00:29:59') at time zone 'Europe/Paris') <= ends_at
     from public.promo_codes
    where code <> 'ZZ-TEST-EXPIRE'
    order by created_at desc limit 1)
    as accepte_a_00h29m59__attendu_true,

  (select ((timestamp '2026-08-31 00:30:59.999') at time zone 'Europe/Paris') <= ends_at
     from public.promo_codes
    where code <> 'ZZ-TEST-EXPIRE'
    order by created_at desc limit 1)
    as accepte_a_00h30m59_999__attendu_true,

  (select ((timestamp '2026-08-31 00:31:00') at time zone 'Europe/Paris') > ends_at
     from public.promo_codes
    where code <> 'ZZ-TEST-EXPIRE'
    order by created_at desc limit 1)
    as refuse_a_00h31m00__attendu_true,

  -- Contrôle de non-régression : ces deux valeurs ne doivent PAS avoir bougé.
  (select min_total_after_discount
     from public.promo_codes
    where code <> 'ZZ-TEST-EXPIRE'
    order by created_at desc limit 1)
    as minimum__attendu_40_00,

  (select rules
     from public.promo_codes
    where code <> 'ZZ-TEST-EXPIRE'
    order by created_at desc limit 1)
    as regles__attendu_parfums_30_et_miels_20;


-- =====================================================================
--  ÉTAPE 3 / 3 — BANC DE TEST DE BOUT EN BOUT
--
--  AUCUNE SUBSTITUTION : les cas lisent le code directement en base (l'éditeur
--  SQL s'exécute en tant que propriétaire et contourne RLS). C'est volontaire —
--  un banc de test contenant le code en clair finirait committé un jour.
--
--  Trois Run successifs, dans cet ordre.
-- =====================================================================

-- ÉTAPE 3a — code jetable, déjà expiré, pour prouver le refus après échéance.
--            Supprimé à l'étape 3c.
insert into public.promo_codes
  (code, label, active, ends_at, min_total_after_discount, rules)
values
  ('ZZ-TEST-EXPIRE', 'jetable - banc de test', true,
   now() - interval '1 second', 0,
   '[{"categories":["parfums"],"percent":30}]'::jsonb)
on conflict do nothing;


-- ÉTAPE 3b — les deux verdicts qui comptent, en une requête.
--   Prix de référence : Galaxie (parfums) 45,00 EUR — 2 exemplaires = 90,00,
--   remise 27,00, total 63,00, donc au-dessus du minimum de 40 EUR.
--   Si un prix change en base, l'attendu change : la fonction lit le catalogue.
with le_code as (
  select code
    from public.promo_codes
   where code <> 'ZZ-TEST-EXPIRE'
   order by created_at desc
   limit 1
),
cas (ordre, intitule, code_force, panier, attendu) as (
  values
    (1, 'Avant echeance - le vrai code, panier qualifiant',
        null::text,
        '[{"slug":"dn-lecode-galaxie","qty":2}]'::jsonb,
        'valid=true - sous-total 90.00, remise 27.00, total 63.00'),
    (2, 'Apres echeance - code jetable expire (meme mecanisme)',
        'ZZ-TEST-EXPIRE',
        '[{"slug":"dn-lecode-galaxie","qty":2}]'::jsonb,
        'valid=false, expired')
)
select
  c.ordre,
  c.intitule,
  c.attendu,
  public.check_promo_code(
    coalesce(c.code_force, (select code from le_code)),
    c.panier
  ) as obtenu
from cas c
order by c.ordre;


-- ÉTAPE 3c — retire le code jetable. À ne pas oublier.
delete from public.promo_codes where code = 'ZZ-TEST-EXPIRE';


-- =====================================================================
--  ROLLBACK — revenir à l'échéance précédente
--
--  Même mode d'emploi que l'étape 1 : remplacer le jeton, puis Run.
--
--    begin;
--    do $$
--    declare
--      v_code text := 'REMPLACER_PAR_LE_CODE';
--      v_rows int;
--    begin
--      if btrim(v_code) = '' or upper(btrim(v_code)) like 'REMPLACER%' then
--        raise exception 'Jeton non remplacé. Rien n''a été modifié.';
--      end if;
--      update public.promo_codes
--         set ends_at = (timestamp '2026-08-30 23:59:59.999') at time zone 'Europe/Paris'
--       where upper(btrim(code)) = upper(btrim(v_code));
--      get diagnostics v_rows = row_count;
--      if v_rows <> 1 then
--        raise exception 'UPDATE sur % ligne(s) au lieu d''une. Annulé.', v_rows;
--      end if;
--    end
--    $$;
--    commit;
--
--  Le rollback complet du dispositif (table + RPC) reste
--  supabase/sql/promo_codes_rollback.sql — sans rapport avec cette échéance.
-- =====================================================================
