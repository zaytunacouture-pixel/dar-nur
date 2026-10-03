// Edge Function order-emails-webhook (étape 11) : statut de remise envoyé par Brevo
// (delivered, hard_bounce, blocked…). Information administration seulement : aucune commande
// n'est modifiée. Authentification : « Authorization: Bearer <BREVO_WEBHOOK_TOKEN> ».
// Déploiement : npx supabase functions deploy order-emails-webhook --no-verify-jwt --project-ref sxlpgcnjerlayitaxxyv
import { handleBrevoWebhook } from '../_shared/order-emails/webhook.ts';

Deno.serve((request: Request) => handleBrevoWebhook(request, (name) => Deno.env.get(name)));
