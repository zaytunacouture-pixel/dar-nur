// Configuration Supabase — clé anon/public uniquement (sûr à commiter)
// La clé anon est publique par conception : elle ne peut lire que les produits actifs
// (RLS configuré dans schema.sql). L'écriture nécessite une session admin authentifiée.

const SUPABASE_URL  = 'https://sxlpgcnjerlayitaxxyv.supabase.co';
const SUPABASE_ANON = 'sb_publishable_3J_jC58tHskgwggDRahQCg_q8xM_xAY';

// Numéro WhatsApp de commande — déjà utilisé partout sur le site.
// Centralisé ici pour que js/cart.js n'en réintroduise pas une copie de plus.
const WHATSAPP_NUMBER = '33769253375';
