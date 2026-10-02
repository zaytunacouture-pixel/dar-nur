# Schéma Supabase — état après l'étape 6 (migration additive, 2026-10-02)

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
