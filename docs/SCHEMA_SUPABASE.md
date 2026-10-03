# Schéma Supabase — état après les étapes 6 (2026-10-02) et 10 (2026-10-03) ; étape 11 préparée

> Référence courte pour reprendre le travail. Le **SQL fait foi** : `supabase/migrations/20261002*_etape6_*.sql`
> (commentés). Appliqué en production le 2026-10-02 ; l'ancien site, l'admin, les générateurs, le panier,
> les imports et le synchroniseur lisent et écrivent **exactement comme avant**.

## Principe

Deux modèles coexistent. L'**ancien** (`category_id`, `active`, `coming_soon`, `weight`/`volume`,
`variant_axes`, `product_variants.options`, `images[]`, `offer_products.product_slug`) reste la source
de l'ancien site et de l'admin. Le **nouveau** est rempli à partir de l'ancien et maintenu par des
triggers de transition. Rien d'ancien n'a été supprimé, renommé ou modifié.

## Nouvelles structures

| Table / colonne | Rôle | Lecture publique (anon) |
|---|---|---|
| `collections` | Arbre univers → collection → sous-collection (→ filtre/regroupement). `path` = URL stockée, **indépendante de `parent_id`**. `type`, `status`, `h1`, `seo_*`, `is_indexable`. | `status = 'published'` |
| `product_collections` | Produit ↔ collections. **Au plus une `primary`** (index unique partiel) ; `source` = `legacy_category` / `legacy_gift_idea` / `migration` / `admin`. | produit actif + collection publiée |
| `legacy_category_collections` | Catégorie historique → collection principale par défaut (transition). | oui |
| `products.status` | Éditorial : `draft` / `published` / `archived`. | (colonne de `products`) |
| `products.availability` | Commercial : `available` / `on_demand` / `coming_soon` / `out_of_stock`. **NULL = à arbitrer**. | idem |
| `products.replaced_by_product_id`, `net_quantity`/`net_unit`, `seo_title`/`seo_description`, `size_guide_id` | Fusion future, quantité nette normalisée, SEO, guide des tailles. | idem |
| `option_types`, `option_values` | Dictionnaire des axes (couleur, motif, senteur, contenance, taille, pointure) et valeurs (code d'URL, libellé, quantité + unité). `format` et `contenance` = un seul axe `contenance`. | oui |
| `product_variant_options` | Une valeur par axe et par variante ; combinaison unique par produit (contrainte différée). | variante et produit actifs |
| `product_media` | Médias ordonnés ; principale = 1ᵉʳ `sort_order` sans variante ; `variant_id`, `option_value_id`, `role`, `alt_text`, dimensions, cadrage. | produit (et variante) actifs |
| `size_guides`, `size_guide_rows` | Guides des tailles (vides). | guide publié |
| `product_apparel_details` | Matière, composition, opacité, épaisseur, coupe, entretien (vide). | produit actif |
| `product_food_details` | Type, dénomination, ingrédients, origine (vide ; aucune allégation). | produit actif |
| `settings` | Paramètres typés (`value_type` vérifié). | `is_public = true` seulement |
| `redirects` | 301/302/410, source unique **si active**, jamais vers elle-même ; on désactive, on ne supprime pas. **Vide.** | `active = true` |
| `offer_products.product_id` / `variant_id` / `quantity` | Vraie référence produit (déduite du slug). | (politique existante) |
| `product_relations` | « À associer » (`complementary` seul). Vide. | les deux produits actifs |
| `product_groupings`, `product_grouping_members` | Fusions Mode et doublons **proposés**, avec décision (`safe` / `needs_review`…). | **non (admin seul)** |

Écriture de toutes les nouvelles tables : `public.is_admin()` uniquement (même modèle que le catalogue).
Aucune nouvelle table publique ne contient de donnée fournisseur (contrôlé par `supabase/checks/etape6_invariants.sql`).

## Triggers de transition (tous de l'ancien vers le nouveau, sauf le premier)

| Trigger | Direction | Règle |
|---|---|---|
| `trg_products_legacy_flags` (BEFORE, `products`) | ancien ↔ nouveau, sur la même ligne | **Le champ modifié l'emporte** : `active` → `status` (published/draft), `status` → `active` ; `coming_soon` → `availability`, `availability` → `coming_soon`. Les deux modifiés : acceptés s'ils concordent, sinon erreur. Une `availability` NULL n'est jamais recalculée tant que personne ne touche à `coming_soon`. Deux CHECK verrouillent la cohérence. |
| `trg_products_sync_collections` (AFTER) | ancien → nouveau | `category_id` → principale **seulement si sa source est `legacy_category`** ; `gift_idea` → Idées cadeaux (lignes `legacy_gift_idea`). |
| `trg_products_sync_media`, `trg_product_variants_sync_media` | ancien → nouveau | `images[]` → lignes `product_media` de source `legacy` (les lignes `admin` ne sont jamais touchées). |
| `trg_product_variants_sync_options` | ancien → nouveau | `options` jsonb → `product_variant_options` (source `legacy`), correspondance **exacte** de libellé ; valeur inconnue ou combinaison en double → variante laissée non normalisée, jamais bloquée. |
| `trg_offer_products_resolve_product` | ancien → nouveau | `product_slug` → `product_id` ; slug inconnu → NULL (comme avant). |

Aucun trigger ne fait de requête sur la ligne qui l'a déclenché : pas de boucle. Le futur admin v2
écrira les champs nouveaux (sources `admin`) ; à la bascule, on inversera puis retirera ces triggers.

## Remplissage (déterministe, refait à l'identique par les migrations)

- `status` : 245 `published`, 6 `draft` (= `active`). Aucun `archived`.
- `availability` : 229 `available` ; **22 NULL** (coming_soon historiques : 16 huiles, 4 Khamrah, `mg-mangue`, `dn-lecode-la-cavale`).
- `net_quantity` : 110 produits (38 g, 60 ml, 12 gélules) ; 16 laissés NULL (listes de formats, « 200 », « 100 » sans unité, `miel-printemps` 200g + 200ml).
- Collections : 20 (3 univers, 15 collections/sous-collections, 2 transverses), noms/titles/metas de l'étape 3. 251 principales (dont 33 reclassements documentés), 36 Idées cadeaux, 6 Offres & packs.
- Options : 117 lignes ; `2XL` et `XXL` restent **deux valeurs** (non unifiées). Médias : 424 (388 produit, 36 variante).
- Offres : 32/32 lignes résolues. Regroupements : 15 sûrs (72 fiches) + 7 à valider (Nilla, Sultan Saphir, Comera 6/8, Musc Tahara, Farasha, 2 doublons).
- Les UPDATE de remplissage s'exécutent **triggers de régénération et `updated_at` suspendus**, puis l'ordre physique de `products` est restauré (`CLUSTER`) : l'ancien site trie par `sort_order` seul et les ex-aequo suivent l'ordre des lignes.

## Exploitation

| Action | Commande |
|---|---|
| Appliquer (une migration) | `npx supabase db query --linked --project-ref sxlpgcnjerlayitaxxyv -f <fichier>` (CLI authentifiée) |
| Contrôler (lecture seule) | même commande avec `supabase/checks/etape6_invariants.sql` → 23 lignes `ok = true` |
| Tester hors production | `cd scripts/test/schema && npm ci && node run.mjs --live` (catalogue public) ou `--data <sauvegarde>` ; CI : `.github/workflows/schema-ci.yml` |
| Rafraîchir le schéma figé du banc | `node scripts/test/schema/dump-baseline.mjs` (seulement pour préparer une future migration) |
| Rollback | `supabase/rollback/20261002_etape6_rollback.sql` (retire tout l'ajout ; données historiques intactes) |

Les fichiers sont appliqués par l'API de gestion (pas de `supabase db push` : la table d'historique
des migrations de la CLI n'est pas utilisée). Ils sont idempotents.
`supabase/maintenance/20261002_etape6_restaurer_ordre_products.sql` : correctif ponctuel déjà appliqué, à ne pas rejouer.

## Encore hérité (à retirer seulement après la bascule)

`category_id` + `categories`, `active`, `coming_soon`, `weight`, `volume`, `variant_axes`,
`product_variants.options`, `images[]`, `offer_products.product_slug`, `brand` (texte), `gift_idea`,
`promo_codes.rules` par catégorie et `check_promo_code` (lisent `category_id`/`active`/`coming_soon`).

## Langues (préparé, non créé)

Codes stables dans toutes les contraintes, libellés en colonnes texte : les traductions iront dans des
tables `*_translations (id, locale, …)` (collections, option_values, produits) sans toucher aux tables actuelles.

## Commandes (étape 10, 2026-10-03)

> Migrations `supabase/migrations/20261003*_etape10_*.sql`, **appliquées en production le 2026-10-03**
> (sauvegarde préalable hors dépôt : `C:\Users\youcef\dar-nur-backups\etape10-supabase-2026-10-03\`).
> Additives : aucune table existante n'est modifiée. Rollback : `supabase/rollback/20261003_etape10_rollback.sql`
> (⚠ détruit les commandes : les exporter avant). Contrôles : `supabase/checks/etape10_invariants.sql`
> (14 lignes `ok = true`). Banc : `scripts/test/schema/orders.mjs` (142 contrôles, en CI `schema-ci`).
> Purge explicite des commandes de test (non exécutée) : `supabase/maintenance/20261003_etape10_purger_commandes_test.sql`.

**Parcours.** DEMANDE de commande (aucun paiement) → vérification par Dar Nūr (disponibilités, frais de
livraison, remise éventuelle) → total confirmé et paiement demandé → paiement confirmé → préparation →
expédition → livraison. Annulation possible avant expédition.

| Table | Rôle | anon | admin (`is_admin()`) |
|---|---|---|---|
| `orders` | Demande + client + adresse + montants (centimes, EUR) + paiement + expédition. `public_number` `DN-AAAA-XXXXXX` (aléatoire, non séquentiel) ; `token_hash` = sha256 du jeton de suivi (jamais stocké) ; `idempotency_key` unique ; `environment` (`development`/`preprod`/`production`) et `is_test`. | aucun droit | lecture |
| `order_items` | **Snapshot** : `product_slug`, `product_name`, `variant_label`, `options` (axe, libellé, valeur), `availability_at_order`, `quantity`, `list_unit_price_cents`, `unit_price_cents` (offre produit prouvée), `offer_id`/`offer_title`, `line_total_cents` ; `product_id`/`variant_id` indicatifs (`on delete set null`). `availability_confirmed` : NULL à vérifier, false = indisponible (exclue du sous-total). | aucun droit | lecture |
| `order_events` | Journal append-only (création, statuts, paiement, devis de livraison, lien de paiement, suivi, disponibilités, note) avec acteur (`customer`/`admin`/`provider`/`system`) ; `notify_customer` + `notified_at` = file des notifications client (aucun envoi automatique). Aucune donnée personnelle. | aucun droit | lecture |
| `orders_private.config` | Schéma NON exposé par l'API : secret de dérivation des jetons, sel des IP, hôtes de paiement autorisés (vide = tout hôte https), version des CGV enregistrée, `production_ordering_open` (**false** tant que les CGV ne sont pas révisées). | — | — (SQL Editor / CLI) |
| `orders_private.submissions` | Empreintes salées des IP des demandes enregistrées (limitation de débit), purgées après 2 jours. | — | — |

**Statuts.** `status` : `submitted` → `reviewing` → `awaiting_payment` → `paid` → `preparing_shipment` →
`shipped` → `completed` ; `cancelled` depuis tout statut avant `shipped` ; `awaiting_payment` → `reviewing`
(correction, total à reconfirmer). `payment_status` : `not_requested` → `pending` → `paid` ; `failed`
(réservé à un futur prestataire) ; à l'annulation `pending`/`failed` → `cancelled`, `paid` → `refund_due` →
`refunded` (manuel). Toute autre transition est refusée par `trg_orders_guard` (valable pour **tous** les
rôles, superutilisateur compris).

**Invariants en base** (CHECK + trigger) : `shipped`/`completed` ⇒ `payment_status = 'paid'`, `paid_at` et
`shipped_at` renseignés ; `awaiting_payment` et au-delà ⇒ livraison fixée, total > 0, `total_confirmed_at` ;
`paid` ⇒ `paid_at` + `payment_confirmation_source` (`admin_manual` ou `provider_webhook`) ; montants figés hors
vérification ; coordonnées, adresse, numéro et lignes immuables ; aucune suppression (commande, ligne,
événement) ; URL de paiement / suivi en `https://` sans identifiants (et hors `localhost`/IP).

**Fonctions** (SECURITY DEFINER, seuls points d'écriture) :

| Fonction | Rôle | Exécution |
|---|---|---|
| `create_order_request(payload)` | Valide coordonnées (e-mail, téléphone 6–15 chiffres sans format national, pays ISO, code postal 5 chiffres en France seulement, caractères de contrôle refusés), relit chaque ligne en base (publié, `available`/`on_demand`, variante du bon produit et active, prix = variante sinon produit, offre produit prouvée), refuse tout écart (`cart_changed` + lignes), idempotence (même clé + même contenu = même commande, contenu différent = refus), pot de miel, 16 Ko max, 30 lignes, quantités entières 1–99, limitation 5/10 min et 20/24 h par IP (`cf-connecting-ip`, non falsifiable : vérifié) + 100/h au total. « production » seulement depuis l'origine dar-nur.fr **et** si `production_ordering_open`. Rend numéro + jeton + vue client. Réponse `Cache-Control: no-store, private`. | anon, authenticated |
| `check_cart(items)` | Même résolution, sans écriture (affichage des écarts). | anon, authenticated |
| `get_order_tracking(token)` | Vue client : numéro, statuts, articles, montants **une fois confirmés**, lien de paiement si `awaiting_payment`, suivi du colis si expédiée. Jamais adresse, e-mail, téléphone, note, motif d'annulation, référence. | anon, authenticated |
| `admin_update_order(id, action, data)` | `start_review`, `set_item_availability`, `set_shipping`, `set_discount` (motif obligatoire), `request_payment`, `set_payment_link`, `reopen_review`, `confirm_payment` (manuel, auteur tracé), `start_preparation`, `set_tracking`, `mark_shipped`, `mark_completed`, `cancel` (motif), `mark_refunded`, `set_note`, `mark_notified`. `expected_status` = concurrence optimiste. | authenticated (refus si non admin) |
| `admin_order_tracking_token(id)` | Lien de suivi à renvoyer au client. | authenticated (admin) |

**Vérifié en production après application** : 14/14 invariants ; `products?select=*,product_variants(*)`
(ancien site) inchangé ; `orders`/`order_items`/`order_events` → 42501 pour anon ; fonctions d'admin → 42501
pour anon ; `orders_private` non exposé (PGRST106) ; en-tête `Cache-Control: no-store, private`.

## E-mails transactionnels (étape 11, préparée le 2026-10-03 — NON appliquée)

> Migrations `supabase/migrations/20261003120000_etape11_01_order_emails.sql` (outbox, trigger, fonctions) et
> `20261003120100_etape11_02_order_emails_cron.sql` (pg_cron, tâche `dar-nur-order-emails` toutes les 5 min).
> Additives : aucune table existante modifiée ; un trigger AJOUTÉ sur `order_events`. Rollback :
> `supabase/rollback/20261003_etape11_rollback.sql` (ne touche à aucune commande). Contrôles :
> `supabase/checks/etape11_invariants.sql`. Banc : `scripts/test/schema/emails.mjs` (124 contrôles, `schema-ci`).
> En production : `pg_net` et `supabase_vault` déjà installés, `pg_cron` disponible mais pas encore activé
> (relevé du 2026-10-03).

| Objet | Rôle | Droits |
|---|---|---|
| `orders_private.email_config` | Singleton : `sending_enabled` (faux), `production_sending_enabled` (faux), `test_recipients` (vide, minuscules, 10 max), `site_url_production` (`https://dar-nur.fr`), `site_url_test` (NULL), `worker_url` (NULL, projet Supabase seulement). Aucun secret. | aucun (SQL / CLI) |
| `orders_private.order_emails` | Outbox : `order_id`, `event_id` (unique), `email_type` (4 valeurs), `occurrence` (>1 seulement pour `payment_requested`), `environment`, `status` (`pending`/`sending`/`sent`/`failed`/`skipped`), `attempts` (≤ 4), `next_attempt_at`, `queued_at` (expiration 48 h), `claim_id` + `locked_until` (bail 5 min), `provider_message_id`, `delivery_status`, `last_error` (≤ 300, nettoyé). Ni adresse ni contenu. `on delete cascade` (purge des tests). | aucun |
| trigger `trg_order_events_enqueue_email` | AFTER INSERT sur `order_events` : crée la ligne (même transaction), remplace une demande de paiement non partie, réveille le worker (pg_net). Exception capturée : n'échoue jamais. | — |
| `orders_private.kick_order_email_worker(reason, only_if_due)` | `net.http_post` vers `worker_url` avec le jeton Vault `order_emails_worker_secret` ; rien si interrupteur coupé, URL/jeton/pg_net absents, ou (cron) rien de dû. | definer, aucun rôle API |
| `public.order_emails_claim(limit)` / `order_emails_report(id, claim_id, outcome, message_id, error)` | Worker : réclamation (garde-fous environnement / liste de test / URL / obsolescence / expiration) et compte rendu (tentatives 5 min / 30 min / 2 h puis `failed` ; `sent` → `notified_at` + `customer_notified`). | `service_role` seul |
| `public.order_emails_delivery_event(message_id, event, at)` | Webhook Brevo → `delivery_status` (incident définitif prioritaire). Aucune commande modifiée. | `service_role` seul |
| `public.admin_order_emails(order_id)` / `admin_order_email_alerts()` / `admin_retry_order_email(id)` | Bloc admin, alertes de la liste, « Réessayer » (même ligne ; refusé si déjà envoyé, en cours, remplacé ou sans objet). | authenticated (refus si non admin) |

Le contrôle `etape10_invariants.sql` / `triggers_present` vise désormais nommément les 6 triggers de l'étape 10.
