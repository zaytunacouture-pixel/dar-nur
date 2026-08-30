-- =====================================================================
--  DAR NŪR — Codes promotionnels (table confidentielle + RPC de validation)
--
--  À exécuter UNE FOIS dans : Supabase → SQL Editor → New query → Run
--  (compte propriétaire du projet, organisation « Dar Nur » — connexion par
--  e-mail et mot de passe, jamais par GitHub : voir docs/ARCHITECTURE_DAR_NUR.md).
--
--  Rollback : supabase/sql/promo_codes_rollback.sql
--
--  ---------------------------------------------------------------------
--  POURQUOI CE SCRIPT EXISTE
--
--  Le site est 100 % statique : tout JavaScript publié est lisible par
--  n'importe quel visiteur. Un code promotionnel écrit dans js/cart.js —
--  même haché — serait donc public de fait. La confidentialité du code
--  n'est possible que si le code, ses règles, sa date d'expiration et son
--  minimum de commande vivent UNIQUEMENT côté serveur.
--
--  Le dispositif retenu :
--    1. La table public.promo_codes a RLS activé et AUCUNE politique.
--       Aucun rôle exposé à PostgREST (anon, authenticated) ne peut la
--       lire, l'écrire ni même en deviner le contenu. Les codes ne sont
--       donc pas énumérables depuis le navigateur.
--    2. La fonction public.check_promo_code() est SECURITY DEFINER : elle
--       s'exécute avec les droits de son propriétaire, contourne donc RLS,
--       et est le SEUL point d'accès. Elle prend un code et un panier, et
--       ne renvoie qu'un verdict + des montants — jamais la liste.
--    3. Elle recalcule TOUT à partir du catalogue réel (public.products,
--       public.product_variants) : le panier envoyé par le navigateur ne
--       fournit que des slugs, des variantes et des quantités. Un prix
--       modifié dans le localStorage du client n'a aucun effet.
--    4. La date d'expiration est comparée à now() côté serveur, en heure
--       de Paris : une horloge de téléphone faussée ne prolonge rien.
--
--  Limite connue et assumée : quelqu'un peut appeler la RPC en boucle pour
--  tenter de deviner un code. Le plan Free n'offre pas de limitation de
--  débit applicative. Il ne peut en revanche pas LISTER les codes, ce qui
--  est la vraie fuite. Et la validation finale d'une commande reste
--  manuelle, sur WhatsApp.
--
--  ADMINISTRATION : la table n'étant lisible par aucun rôle exposé, la
--  gestion des codes se fait dans le SQL Editor (qui s'exécute en tant que
--  propriétaire et contourne RLS), jamais depuis admin.html. C'est
--  volontaire, et cohérent avec public.admins (supabase/sql/admin_rls.sql).
-- =====================================================================

-- =====================================================================
--  ÉTAPE 1 / 3 — INSTALLATION (transactionnelle)
--
--  Sélectionnez tout ce bloc, de « begin; » jusqu'à « commit; » inclus,
--  et cliquez Run. Une SEULE valeur est à remplacer avant : le jeton
--  jeton de la ligne « v_code text := ... » de la section 4.
--
--  ATOMICITÉ : les onze instructions ci-dessous (création de table, index,
--  RLS, révocations, fonction, grants, insertion du code) sont encadrées
--  par begin/commit. PostgreSQL sait annuler le DDL : si l'une d'elles
--  échoue — jeton non remplacé, rôle absent, erreur de syntaxe — la
--  transaction est annulée en bloc et la base revient exactement à son état
--  d'avant. Aucune installation partielle n'est possible.
--
--  Si l'éditeur SQL affiche « WARNING: there is already a transaction in
--  progress », c'est sans conséquence : cela signifie qu'il encadrait déjà
--  le script dans sa propre transaction, et l'atomicité est acquise deux fois.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) TABLE
-- ---------------------------------------------------------------------
create table if not exists public.promo_codes (
  id                       uuid primary key default gen_random_uuid(),

  code                     text not null,                 -- jamais écrit dans ce dépôt
  label                    text,                          -- libellé interne
  active                   boolean not null default true,

  starts_at                timestamptz,                   -- null = actif tout de suite
  ends_at                  timestamptz,                   -- null = pas d'expiration

  -- Minimum de commande, évalué APRÈS application de la réduction.
  -- Tous les produits du panier comptent, y compris les non remisés.
  -- Les frais de livraison n'entrent jamais dans ce calcul : ils ne sont
  -- pas dans le panier et ne sont pas transmis à cette fonction.
  min_total_after_discount numeric(10,2) not null default 0,

  -- Règles de remise, par catégorie Supabase (products.category_id) :
  --   [{"categories":["parfums"],"percent":30},
  --    {"categories":["miels","miels-gourmands"],"percent":20}]
  -- Une catégorie absente de toutes les règles n'est pas remisée.
  -- Si une catégorie apparaît dans plusieurs règles, le taux le plus
  -- élevé s'applique (comportement déterministe, jamais cumulatif).
  rules                    jsonb not null default '[]'::jsonb,

  created_at               timestamptz not null default now()
);

-- Unicité insensible à la casse et aux espaces : un code saisi en minuscules,
-- en majuscules ou entouré d'espaces désigne toujours la même ligne.
create unique index if not exists promo_codes_code_norm_uidx
  on public.promo_codes (upper(btrim(code)));

-- ---------------------------------------------------------------------
-- 2) VERROUILLAGE — aucun accès depuis le navigateur
-- ---------------------------------------------------------------------
-- RLS activé SANS aucune politique : sous PostgREST, anon et authenticated
-- ne peuvent rien lire ni écrire. On retire aussi les privilèges de table,
-- pour que la protection ne repose pas sur RLS seul.
--
-- NOTE : volontairement PAS de « force row level security ». Le propriétaire
-- de la table doit conserver son contournement de RLS, sinon la fonction
-- SECURITY DEFINER ci-dessous ne pourrait plus lire la table non plus.
alter table public.promo_codes enable row level security;

revoke all on table public.promo_codes from public;
revoke all on table public.promo_codes from anon;
revoke all on table public.promo_codes from authenticated;

-- ---------------------------------------------------------------------
-- 3) RPC DE VALIDATION — seul point d'accès public
-- ---------------------------------------------------------------------
-- Entrée :
--   p_code  : le code saisi par le client (casse et espaces indifférents)
--   p_items : [{"slug":"miel-nigelle","variant":"200 g","qty":2}, ...]
--             variant = null pour un produit sans déclinaison
--
-- Sortie (jsonb) :
--   { "valid": true,  "code", "label", "subtotal", "discount", "total", "min_total" }
--   { "valid": false, "reason": "invalid_code" | "inactive" | "not_started"
--                               | "expired" | "empty_cart" | "min_not_reached", ... }
--
-- Règles de calcul, strictement identiques à celles appliquées à
-- l'affichage du panier (js/cart.js) :
--   - un produit inactif, en coming_soon, ou sans prix est ignoré ;
--   - une variante demandée mais introuvable ou inactive écarte la ligne ;
--   - prix unitaire = prix de la variante, sinon products.price_value ;
--   - total de ligne = round(prix unitaire × quantité, 2) ;
--   - remise de ligne = round(total de ligne × taux / 100, 2) ;
--   - sous-total et remise = sommes des lignes ; total = sous-total − remise.
create or replace function public.check_promo_code(p_code text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_promo    public.promo_codes%rowtype;
  v_now      timestamptz := now();
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_total    numeric(12,2) := 0;
begin
  if v_code = '' then
    return jsonb_build_object('valid', false, 'reason', 'invalid_code');
  end if;

  select * into v_promo
    from public.promo_codes
   where upper(btrim(code)) = v_code
   limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'invalid_code');
  end if;

  if v_promo.active is not true then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;

  if v_promo.starts_at is not null and v_now < v_promo.starts_at then
    return jsonb_build_object('valid', false, 'reason', 'not_started');
  end if;

  -- Expiration évaluée sur l'horloge du serveur, pas sur celle du client.
  if v_promo.ends_at is not null and v_now > v_promo.ends_at then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  with req as (
    select
      nullif(btrim(item->>'slug'), '')                            as slug,
      nullif(btrim(coalesce(item->>'variant', '')), '')           as variant,
      greatest(1, least(99, coalesce((item->>'qty')::int, 1)))    as qty
    -- Le test de type protège d'un p_items mal formé (objet, chaîne, null) :
    -- jsonb_array_elements() lèverait sinon une exception au lieu de renvoyer
    -- un verdict exploitable par le panier.
    from jsonb_array_elements(
           case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
         ) as t(item)
  ),
  priced as (
    select
      p.category_id,
      r.qty,
      coalesce(v.price, p.price_value) as unit
    from req r
    join public.products p
      on p.slug = r.slug
     and p.active is true
     and coalesce(p.coming_soon, false) is false
    left join public.product_variants v
      on v.product_id = p.id
     and v.active is not false
     and v.name = r.variant
    where r.slug is not null
      and (r.variant is null or v.id is not null)
  ),
  cart_lines as (
    select
      category_id,
      round(unit * qty, 2) as line_total
    from priced
    where unit is not null
  ),
  applied as (
    select
      l.line_total,
      -- Taux applicable à la ligne : le plus élevé des taux dont la liste de
      -- catégories contient celle du produit. Aucune règle ne correspond =>
      -- 0 %, donc aucune remise. Jamais cumulatif.
      coalesce((
        select max((r->>'percent')::numeric)
        from jsonb_array_elements(
               case when jsonb_typeof(v_promo.rules) = 'array'
                    then v_promo.rules else '[]'::jsonb end
             ) as rules_t(r)
        where exists (
          select 1
          from jsonb_array_elements_text(
                 case when jsonb_typeof(r->'categories') = 'array'
                      then r->'categories' else '[]'::jsonb end
               ) as c(cat)
          where c.cat = l.category_id
        )
      ), 0) as percent
    from cart_lines l
  )
  select
    coalesce(sum(line_total), 0),
    coalesce(sum(round(line_total * percent / 100, 2)), 0)
    into v_subtotal, v_discount
  from applied;

  if v_subtotal <= 0 then
    return jsonb_build_object('valid', false, 'reason', 'empty_cart');
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  if v_total < coalesce(v_promo.min_total_after_discount, 0) then
    return jsonb_build_object(
      'valid',     false,
      'reason',    'min_not_reached',
      'subtotal',  v_subtotal,
      'discount',  v_discount,
      'total',     v_total,
      'min_total', v_promo.min_total_after_discount
    );
  end if;

  return jsonb_build_object(
    'valid',     true,
    'code',      v_promo.code,
    'label',     v_promo.label,
    'subtotal',  v_subtotal,
    'discount',  v_discount,
    'total',     v_total,
    'min_total', v_promo.min_total_after_discount
  );
end;
$$;

-- Seule la fonction est exposée — jamais la table.
revoke all on function public.check_promo_code(text, jsonb) from public;
grant execute on function public.check_promo_code(text, jsonb) to anon;
grant execute on function public.check_promo_code(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4) CRÉATION DU PREMIER CODE
-- ---------------------------------------------------------------------
--  ⚠ LE CODE LUI-MÊME N'EST PAS ÉCRIT DANS CE FICHIER, ET NE DOIT JAMAIS
--    L'ÊTRE. Vérifié empiriquement le 2026-08-28 : GitHub Pages sert les
--    fichiers du dépôt tels quels, y compris ceux-ci —
--    https://dar-nur.fr/supabase/sql/brands_migration.sql répond HTTP 200.
--    Un code écrit ici serait donc aussi public qu'un code écrit dans le
--    JavaScript, ce qui annulerait tout l'intérêt du dispositif.
--
--  MODE D'EMPLOI : remplacez le jeton de la ligne « v_code » ci-dessous par le code
--  réel, dans le SQL Editor, juste avant d'exécuter. Ne recommittez jamais
--  le fichier avec le code en clair. Le garde-fou refuse l'exécution si la
--  substitution a été oubliée.
--
--  Règles appliquées au code créé ici :
--    −30 % sur la catégorie « parfums »
--    −20 % sur « miels », « miels-gourmands » et « miels-terroir »
--    aucune remise sur les autres catégories
--    minimum 40 € APRÈS réduction, tous produits confondus
--    valable jusqu'au 31 août 2026 à 00 h 30, heure de Paris
--      (prolongé depuis le 30 août 23 h 59 — voir
--       supabase/sql/promo_codes_prolongation.sql, qui est le script à
--       exécuter sur une base DÉJÀ installée : l'insertion ci-dessous est
--       idempotente et ne modifie jamais un code existant)
--
--  L'écriture « at time zone 'Europe/Paris' » convertit un horodatage local
--  de Paris en timestamptz : le passage heure d'été / heure d'hiver est géré
--  par Postgres, sans décalage codé en dur.
do $$
declare
  -- ↓↓↓ LA SEULE VALEUR À REMPLACER DANS TOUT LE FICHIER ↓↓↓
  --     Remplacez le jeton par le code réel, ici, dans l'éditeur SQL.
  --     Ne jamais enregistrer le fichier avec le code en clair.
  v_code  text := 'REMPLACER_PAR_LE_CODE';
  -- ↑↑↑ ------------------------------------------------- ↑↑↑

  -- Libellé interne, facultatif : la valeur par défaut convient telle quelle.
  -- Si vous la changez, n'y mettez ni le code, ni un mot qui le laisse deviner
  -- une fois associé aux taux ci-dessous.
  v_label text := 'Remise catégorielle — parfums et miels';
begin
  -- Le test porte sur le préfixe, jamais sur le jeton entier : un
  -- « Remplacer tout » dans l'éditeur ne peut pas neutraliser ce garde-fou.
  if btrim(v_code) = '' or upper(btrim(v_code)) like 'REMPLACER%' then
    raise exception
      'Le jeton de la ligne « v_code text := ... » n''a pas été remplacé par le code réel. Rien n''a été installé.';
  end if;

  insert into public.promo_codes
    (code, label, active, starts_at, ends_at, min_total_after_discount, rules)
  select
    upper(btrim(v_code)),
    v_label,
    true,
    null,
    (timestamp '2026-08-31 00:30:59.999') at time zone 'Europe/Paris',
    40.00,
    '[{"categories":["parfums"],"percent":30},
      {"categories":["miels","miels-gourmands","miels-terroir"],"percent":20}]'::jsonb
  where not exists (
    select 1 from public.promo_codes
     where upper(btrim(code)) = upper(btrim(v_code))
  );
end
$$;

commit;
-- ↑ FIN DE L'ÉTAPE 1. Tout ce qui suit se lance séparément, après coup.


-- =====================================================================
--  ÉTAPE 2 / 3 — VÉRIFICATION DE L'INSTALLATION
--
--  Une seule requête, un seul Run, une seule ligne de résultat.
--  Aucune substitution : rien à modifier ici.
-- =====================================================================
select
  (select relrowsecurity from pg_class where oid = 'public.promo_codes'::regclass)
    as rls_actif__attendu_true,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'promo_codes')
    as nb_politiques__attendu_0,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'promo_codes'
      and grantee in ('anon', 'authenticated'))
    as privileges_anon__attendu_0,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'check_promo_code')
    as rpc_installee__attendu_1,
  (select count(*) from public.promo_codes)
    as nb_codes__attendu_1,
  (select min_total_after_discount from public.promo_codes order by created_at desc limit 1)
    as minimum__attendu_40_00,
  (select rules from public.promo_codes order by created_at desc limit 1)
    as regles,
  -- Les deux colonnes suivantes lèvent toute ambiguïté UTC / heure locale.
  (select ends_at at time zone 'Europe/Paris' from public.promo_codes order by created_at desc limit 1)
    as expiration_paris__attendu_2026_08_31_00_30_59_999,
  (select ends_at at time zone 'UTC' from public.promo_codes order by created_at desc limit 1)
    as expiration_utc__attendu_2026_08_30_22_30_59_999,
  (select ends_at > now() from public.promo_codes order by created_at desc limit 1)
    as encore_valide_maintenant;


-- =====================================================================
--  ÉTAPE 3 / 3 — BANC DE TEST
--
--  AUCUNE SUBSTITUTION. Les cas de test lisent le code directement en base
--  (l'éditeur SQL s'exécute en tant que propriétaire, il contourne donc RLS).
--  C'est volontaire : un banc de test contenant le code en clair finirait
--  committé un jour, et le dépôt est servi publiquement.
--
--  Trois Run successifs, dans cet ordre.
-- =====================================================================

-- ÉTAPE 3a — crée un code jetable, expiré hier, pour tester le refus d'un
--            code périmé. Il est supprimé à l'étape 3c.
insert into public.promo_codes
  (code, label, active, ends_at, min_total_after_discount, rules)
values
  ('ZZ-TEST-EXPIRE', 'jetable - banc de test', true,
   now() - interval '1 day', 0,
   '[{"categories":["parfums"],"percent":30}]'::jsonb)
on conflict do nothing;


-- ÉTAPE 3b — les 11 cas en une seule requête, un seul tableau de résultats.
--
--  Prix réels en base au 2026-08-28, base des attendus :
--    Galaxie (parfums)                           45,00 EUR
--    Miel de Nigelle 200 g (miels)               24,99 EUR
--    Gélules Chardon Marie (gelules, NON remisé) 14,99 EUR
--  Si un prix change en base, l'attendu change : la fonction lit toujours le
--  catalogue réel, elle ne recopie aucun prix.
with le_code as (
  -- Le vrai code : le dernier créé, hors code jetable.
  select code
    from public.promo_codes
   where code <> 'ZZ-TEST-EXPIRE'
   order by created_at desc
   limit 1
),
cas (ordre, intitule, code_force, panier, attendu) as (
  values
    (1, 'A - 1 parfum, sous le minimum',
        null::text,
        '[{"slug":"dn-lecode-galaxie","qty":1}]'::jsonb,
        'valid=false, min_not_reached - sous-total 45.00, remise 13.50, total 31.50'),
    (2, 'B - 2 parfums, au-dessus du minimum',
        null::text,
        '[{"slug":"dn-lecode-galaxie","qty":2}]'::jsonb,
        'valid=true - sous-total 90.00, remise 27.00, total 63.00'),
    (3, 'C - 2 miels 200 g, 2 centimes sous le minimum',
        null::text,
        '[{"slug":"miel-nigelle","variant":"200 g","qty":2}]'::jsonb,
        'valid=false, min_not_reached - sous-total 49.98, remise 10.00, total 39.98'),
    (4, 'D - 3 miels 200 g, au-dessus du minimum',
        null::text,
        '[{"slug":"miel-nigelle","variant":"200 g","qty":3}]'::jsonb,
        'valid=true - sous-total 74.97, remise 14.99, total 59.98'),
    (5, 'E - parfum + miel, chaque taux sur sa categorie',
        null::text,
        '[{"slug":"dn-lecode-galaxie","qty":1},{"slug":"miel-nigelle","variant":"200 g","qty":2}]'::jsonb,
        'valid=true - sous-total 94.98, remise 23.50, total 71.48'),
    (6, 'F - parfum remise + produit NON remise comptant pour les 40 EUR',
        null::text,
        '[{"slug":"dn-lecode-galaxie","qty":1},{"slug":"gel-chardon","qty":1}]'::jsonb,
        'valid=true - sous-total 59.99, remise 13.50, total 46.49'),
    (7, 'G - code inconnu',
        'CODE-QUI-N-EXISTE-PAS',
        '[{"slug":"dn-lecode-galaxie","qty":2}]'::jsonb,
        'valid=false, invalid_code'),
    (8, 'H - produit coming_soon seul : ligne ignoree',
        null::text,
        '[{"slug":"hl-nigelle","qty":1}]'::jsonb,
        'valid=false, empty_cart'),
    (9, 'I - variante inexistante : ligne ecartee',
        null::text,
        '[{"slug":"miel-nigelle","variant":"999 g","qty":1}]'::jsonb,
        'valid=false, empty_cart'),
    (10, 'J - panier vide',
        null::text,
        '[]'::jsonb,
        'valid=false, empty_cart'),
    (11, 'K - code expire (jetable, cree a l etape 3a)',
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
--  CONFIDENTIALITÉ — contrôle à faire HORS du SQL Editor
--
--  L'éditeur SQL s'exécute en tant que propriétaire et contourne RLS : il ne
--  prouve donc rien sur ce que voit un visiteur. Le vrai contrôle se fait
--  depuis un terminal, avec la clé anon publique de js/config.js :
--
--    curl -s -o /dev/null -w "%{http_code}\n" \
--      "https://sxlpgcnjerlayitaxxyv.supabase.co/rest/v1/promo_codes?select=*" \
--      -H "apikey: <cle anon publique>"
--
--  Attendu : 401, 403 ou 404 — jamais 200 accompagne de lignes.
-- =====================================================================
