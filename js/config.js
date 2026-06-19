// Configuration Supabase — clé anon/public uniquement (sûr à commiter)
// La clé anon est publique par conception : elle ne peut lire que les produits actifs
// (RLS configuré dans schema.sql). L'écriture nécessite une session admin authentifiée.

const SUPABASE_URL  = 'https://sxlpgcnjerlayitaxxyv.supabase.co';
const SUPABASE_ANON = 'sb_publishable_3J_jC58tHskgwggDRahQCg_q8xM_xAY';
