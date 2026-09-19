-- ============================================================================
-- Rotation du jeton GitHub du webhook Supabase → GitHub Actions, avec test réel.
--
-- POURQUOI CE SCRIPT (constat du 2026-09-18) :
--   Les triggers Postgres de webhook_automation.sql appellent net.http_post()
--   avec le PAT stocké dans Vault ("github_pat_parfums"). pg_net est
--   asynchrone et silencieux : si GitHub répond 401 (jeton expiré ou révoqué),
--   AUCUNE erreur ne remonte à l'admin — l'écriture Supabase réussit, mais la
--   régénération n'est jamais déclenchée. Preuve : dernier repository_dispatch
--   reçu par GitHub le 2026-08-12 ; les 10 parfums Gulf Collection créés les
--   17–18/09 (et la marque elle-même le 17/09) n'ont produit aucun run.
--   Un PAT fine-grained créé mi-juillet avec la durée par défaut (30 jours)
--   expire exactement dans cette fenêtre.
--
-- CE QUE FAIT CE SCRIPT : remplace la valeur du secret Vault (le nom reste
--   "github_pat_parfums", la fonction notify_github_regenerate() n'a pas à
--   changer), puis envoie UN appel de test à GitHub pour vérifier que le
--   nouveau jeton est accepté. Il ne touche à aucune donnée du catalogue.
--
-- MODE D'EMPLOI :
--   1. GitHub > Settings > Developer settings > Personal access tokens >
--      Fine-grained tokens > Generate new token.
--        - Repository access : "Only select repositories" → dar-nur.
--        - Permissions > Repository permissions > Contents : Read and write
--          (c'est la seule permission requise par POST /dispatches).
--        - Expiration : choisir la durée MAXIMALE proposée (366 jours) et
--          noter la date d'expiration dans votre agenda. Un jeton qui expire
--          sans rappel reproduit exactement la panne d'août 2026.
--   2. Remplacer <NOUVEAU_PAT_GITHUB> ci-dessous par la valeur du jeton.
--   3. Exécuter ce script dans Supabase > SQL Editor (compte propriétaire,
--      connexion e-mail + mot de passe — jamais "Sign in with GitHub").
--   4. Attendre ~10 secondes, puis exécuter la requête de CONTRÔLE tout en
--      bas (séparément — pg_net n'envoie la requête qu'après la fin de la
--      transaction, la réponse n'est donc jamais visible dans le même run).
--      Attendu : status_code = 204. Un 401 = jeton refusé, un 404 = jeton
--      sans accès au dépôt.
--   5. Vérifier sur GitHub > Actions qu'un run "Régénère la page Parfums"
--      de type repository_dispatch vient d'apparaître : c'est la preuve de
--      bout en bout que le webhook fonctionne à nouveau.
--
-- FILET DE SÉCURITÉ INDÉPENDANT : depuis le 2026-09-18, les deux workflows
--   GitHub tournent aussi sur un cron (4×/jour). Même si ce jeton expire à
--   nouveau, le site converge en quelques heures, et le commit de rattrapage
--   porte la mention « webhook manqué » — c'est le signal pour revenir ici.
-- ============================================================================

-- 1) Garde-fou : refuse de continuer si le placeholder n'a pas été remplacé.
do $$
begin
  if '<NOUVEAU_PAT_GITHUB>' like '<%>' then
    raise exception 'Remplacez <NOUVEAU_PAT_GITHUB> par le nouveau jeton GitHub avant d''exécuter ce script.';
  end if;
end $$;

-- 2) Remplacement de la valeur du secret (même nom, même consommateur).
--    vault.update_secret(id, secret, name, description).
select vault.update_secret(
  (select id from vault.secrets where name = 'github_pat_parfums'),
  '<NOUVEAU_PAT_GITHUB>',
  'github_pat_parfums',
  'PAT GitHub (Contents: read/write sur dar-nur) — renouvelé le ' || to_char(now(), 'YYYY-MM-DD')
);

-- 3) Test réel de bout en bout : même appel que notify_github_regenerate(),
--    event_type "regenerate-parfums". S'il est accepté (204), GitHub ouvre
--    un run ; les générateurs étant idempotents, ce run ne commit rien si le
--    site est déjà à jour.
select net.http_post(
  url := 'https://api.github.com/repos/zaytunacouture-pixel/dar-nur/dispatches',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_pat_parfums'),
    'Accept', 'application/vnd.github+json',
    'Content-Type', 'application/json',
    'User-Agent', 'dar-nur-supabase-webhook'
  ),
  body := jsonb_build_object('event_type', 'regenerate-parfums')
) as request_id;

-- ============================================================================
-- CONTRÔLE — à exécuter SÉPARÉMENT, ~10 s après le script ci-dessus.
-- (net._http_response ne conserve les réponses que quelques heures : c'est
-- pour cela qu'un diagnostic tardif ne montre jamais les 401 d'août.)
-- ============================================================================
-- select id, created, status_code, left(content::text, 200) as response_body
-- from net._http_response
-- order by created desc
-- limit 5;
