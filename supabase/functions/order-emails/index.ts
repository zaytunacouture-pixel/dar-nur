// Edge Function order-emails (étape 11) : envoie les e-mails transactionnels dus de l'outbox.
// Appelée uniquement par la base (pg_net : réveil immédiat + pg_cron toutes les 5 min) avec
// « Authorization: Bearer <ORDER_EMAILS_WORKER_SECRET> ». Le corps de la requête est ignoré :
// aucun appelant ne peut choisir un destinataire ni un contenu.
// Déploiement : npx supabase functions deploy order-emails --no-verify-jwt --project-ref sxlpgcnjerlayitaxxyv
import { handleWorkerRequest } from '../_shared/order-emails/worker.ts';

Deno.serve((request: Request) => handleWorkerRequest(request, (name) => Deno.env.get(name)));
