-- ============================================================================
-- Diagnostic en lecture seule — ne modifie AUCUNE donnée.
-- Explique pourquoi aucune régénération automatique n'a encore atteint
-- GitHub malgré les écritures récentes sur `brands` (migration + images) :
-- preuve empirique (historique des runs GitHub Actions) = 0 déclenchement
-- automatique reçu à ce jour, seulement 2 déclenchements manuels.
--
-- À exécuter dans Supabase > SQL Editor, à coller et lancer tel quel.
-- Copiez-moi le résultat des 3 requêtes ci-dessous.
-- ============================================================================

-- 1) Les triggers existent-ils et sont-ils actifs ?
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_name like 'trg_notify_github%'
order by event_object_table;

-- 2) Le secret GitHub PAT a-t-il bien été créé dans Vault (nom seulement,
--    jamais la valeur) ?
select name, created_at
from vault.secrets
where name = 'github_pat_parfums';

-- 3) Historique des appels HTTP sortants effectués par pg_net — montre le
--    code de statut réel renvoyé par GitHub pour chaque tentative (401 =
--    jeton invalide/placeholder jamais remplacé, 404 = mauvais dépôt,
--    200/204 = succès réel). S'il n'y a AUCUNE ligne ici alors que des
--    marques ont été créées/modifiées récemment, le trigger ne s'est même
--    pas déclenché.
select id, created, status_code, content::text as response_body
from net._http_response
order by created desc
limit 10;
