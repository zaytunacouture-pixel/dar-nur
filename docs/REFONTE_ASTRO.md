# Refonte Dar Nūr — nouveau socle Astro (`site/`)

> Statut au 3 octobre 2026 : **étape 10 terminée en préproduction — commande, validation, paiement
> différé, livraison France + international** : panier réel, demande de commande structurée (aucun paiement à
> l'envoi), vérification et total confirmés par Dar Nūr, paiement confirmé (manuellement, aucun prestataire
> branché), expédition seulement après paiement (garanti par la base), suivi client par jeton,
> administration `/admin/commandes/`. **La commande en ligne reste FERMÉE en production** tant que les CGV
> et la politique de confidentialité ne sont pas révisées. Étape 9 : accueil final ; étapes 8 / 8B : 245
> fiches, build à froid ≈ 7 min. La recherche et les redirections ne sont pas migrées. La production reste
> **dar-nur.fr** (GitHub Pages, racine du dépôt), que rien dans `site/` ne modifie.

## Architecture

| Élément | Choix |
|---|---|
| Emplacement | Sous-dossier autonome `site/` (son `package.json`, sa sortie `site/dist/`). L'ancien site, l'admin, les générateurs et leurs workflows restent à la racine, inchangés. |
| Framework | Astro 7, sortie **statique** (aucun SSR à l'exécution), TypeScript `strictest`. |
| JavaScript client | Aucun framework. Petits `<script>` par composant (bundlés, dédupliqués par Astro) seulement là où il faut de l'interaction : menu mobile, méga-menu, panneaux, recherche, sélecteur de variantes. Header, footer, cartes : HTML statique. |
| CSS | Variables CSS (`src/styles/tokens.css`) + base globale (`base.css`) + CSS scopé dans chaque composant. Pas de Tailwind ni de bibliothèque d'UI : aucun bénéfice pour ~40 composants, et du poids en plus. |
| Données | Supabase **en lecture seule, au build** (`src/lib/supabase.ts`, `fetch` natif, colonnes listées explicitement). Traduction vers les types d'affichage dans `src/lib/catalog.ts`, seul fichier qui connaît le schéma. Depuis l'étape 6 : `status = published`, collection principale, `availability` (NULL = à arbitrer → repli sur `coming_soon`), `product_media`, options normalisées, arbre `collections`, `settings` publics. Schéma : `docs/SCHEMA_SUPABASE.md`. |
| Images | `src/components/ui/CatalogPicture.astro`, point d'entrée unique : AVIF + WebP, `srcset`/`sizes`, dimensions déclarées, recadrage au ratio, chargement différé sauf l'image prioritaire (LCP). Cadres partagés dans `src/config/images.ts` (étape 8B). Images distantes autorisées : `dar-nur.fr` et le stockage public Supabase. |
| Polices | API Fonts d'Astro, fichiers locaux : Cormorant Garamond 500–600 (29 Ko) + Jost 400–500 (17 Ko), sous-ensemble FR + ū. Générés par `site/scripts/fonts/build-fonts.py` (sources épinglées), versionnés. Polices de repli aux métriques ajustées, préchargement. Aucun appel à Google Fonts. |
| Icônes | Lucide (contour, trait 1,5), inlinées au build depuis `lucide-static` ; jeu fermé dans `src/components/ui/icons.ts`. Logos de réseaux : Simple Icons (CC0), copiés. |

```
site/
  astro.config.mjs        environnements, images, polices, en-têtes robots
  scripts/verify-build.mjs contrôles après build (CI)
  scripts/fonts/          génération des polices
  src/
    assets/               logo (rogné, pixels identiques), polices, images de démonstration
    config/               navigation, commerce (livraison, annonce, contact), footer, site
    types/                ProductSummary, Collection, Brand, NavigationItem, VariantOption, SeoMeta…
    config/home.ts        choix éditoriaux de l'accueil (slugs versionnés)
    lib/                  supabase, catalog, catalog-store, catalog-views, product-page, home-page, …
    components/ ui/ layout/ catalog/ cart/ search/ home/ product/ templates/
    layouts/BaseLayout.astro
    pages/                index (accueil), [...path] (catalogue + fiches), demo, design-system, lab/, 404, robots.txt
    data/demo/            panier FICTIF (pages /demo/ et /design-system/ uniquement)
    scripts/              JS client du panier et de la commande (cart-store, cart-view, cart-sync, order-api)
    lib/orders/           libellés des statuts (client / administration), erreurs, format des montants
    pages/                … panier, commande, suivi, admin/commandes (étape 10)
```

## Commandes (depuis `site/`)

| Commande | Rôle |
|---|---|
| `npm ci` | Installation (Node ≥ 22.12) |
| `npm run dev` | Serveur de développement (http://localhost:4321) |
| `npm run build` | Build statique dans `dist/` |
| `npm run preview` | Sert `dist/` localement |
| `npm run check` | Types (`astro check`) |
| `npm run format` / `format:check` | Prettier |
| `npm run verify` | Contrôles de sortie (après build) |
| `npm run verify:catalog` | Contrôles de données des pages catalogue contre Supabase (après build, réseau) |
| `npm run verify:products` | Contrôles des fiches produit et du LAB contre Supabase (après build, réseau) |
| `npm run verify:home` | Contrôles de l'accueil contre Supabase (après build, réseau) |
| `npm run verify:orders` | Contrôles du parcours de commande sur `dist/` (après build, sans réseau) |
| `npm run test:cart` | Tests unitaires du panier local (Node, sans navigateur) |
| `npm run lab:groupings` | Rafraîchit l'instantané des regroupements Mode (lecture admin, CLI Supabase authentifiée) |
| `npm run ci` | Tout, dans l'ordre de la CI |

## Variables d'environnement

Copier `site/.env.example` en `site/.env` (ignoré par Git).

| Variable | Valeurs | Rôle |
|---|---|---|
| `DAR_NUR_ENV` | `development` (défaut) · `preprod` · `production` | **Seule `production` autorise l'indexation.** Toute autre valeur : meta `noindex, nofollow`, `robots.txt` « Disallow: / », en-tête `X-Robots-Tag`. |
| `SITE_URL` | URL absolue | Canonical, Open Graph, JSON-LD, sitemap. **`https://dar-nur.fr` en préproduction Netlify et en CI** (URL définitives dès maintenant ; la préproduction reste noindex). À défaut : `DEPLOY_PRIME_URL` / `URL` (Netlify), puis `http://localhost:4321`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | URL du projet, clé `sb_publishable_…` | Lecture publique sous RLS (valeurs déjà publiques sur l'ancien site). Toute autre clé est refusée par le code. Sans elles, le build passe et les pages l'indiquent. |

## Préproduction Netlify

`site/netlify.toml` : publication de `dist/`, build `npm ci && npm run build && npm run verify`, Node 22,
`DAR_NUR_ENV = "preprod"` forcé pour **tous** les contextes Netlify (le contexte « production » de Netlify
est notre préproduction), `X-Robots-Tag: noindex` sur tout, cache d'un an sur `/_astro/*`.
Build à froid mesuré ≈ 7 min sur 4 vCPU, sous la limite de 15 min de Netlify : voir « Build et images ».

**Pourquoi dans `site/` et non à la racine** : Netlify lit `netlify.toml` dans le « Base directory » du
site. Deux sites Netlify existants (`dar-nur`, `creative-beijinho-14efe6`) prévisualisent déjà l'ancien
site depuis la racine, sans configuration versionnée : un `netlify.toml` racine aurait changé leurs builds.
Placé dans `site/`, il n'est lu que par un site Netlify configuré avec **Base directory = `site`**.

**À faire par le propriétaire** (aucun compte Netlify n'est relié à cette session) : créer un **nouveau**
site Netlify relié au dépôt, Base directory `site`, branche `refonte/etape-5-socle-astro` (ou deploy
previews), **sans aucun domaine `dar-nur.fr`**. Lors de la future bascule : retirer l'en-tête
`X-Robots-Tag` statique de `site/netlify.toml` et passer `DAR_NUR_ENV=production` (`dist/_headers` suit
alors automatiquement).

## Règles du design system (rappel)

Référence complète : `DESIGN_SYSTEM_ETAPE_4.md`. Contrôlé automatiquement par `verify-build.mjs` :

- aucune couleur hexadécimale hors `tokens.css` ; media queries de largeur : `min-width: 768px` et `1024px` uniquement ;
- 2 familles de polices, ≤ 50 Ko ; JS ≤ 20 Ko et CSS ≤ 30 Ko gzip pour la page la plus lourde ;
- un seul `<h1>`, `lang="fr"`, title, description, canonical sur chaque page ;
- aucune clé secrète ; aucun identifiant fournisseur (mot entier, via la configuration locale non versionnée) dans la sortie.

Et par convention : vert = action et sélection ; or = filets uniquement ; footer = seule section sombre ;
aucune promesse (livraison France ou internationale, livraison offerte, retours, paiement à la réception) non
opérationnelle ; aucun avis,
compteur ou « best seller » sans données ; aucune photo générée à la place d'un vrai produit.

## Statut de la migration

| Fait (étape 5) | À venir |
|---|---|
| Socle, tokens, polices, logo, header, méga-menu, menu mobile 2 niveaux, bandeau, recherche (visuelle), mini-panier (visuel), footer, réassurance, ProductCard, UniverseCard, CollectionCard, VariantSelector, guide des tailles (repli), primitives UI, pages `/demo/`, `/design-system/`, `/lab/supabase/`, Netlify, CI | Puis panier métier, recherche, SEO (301 depuis `redirects`), shooting photo, bascule. |
| **Étape 6** (2026-10-02) : migration additive Supabase (9 migrations, `docs/SCHEMA_SUPABASE.md`), lecture du nouveau schéma dans `catalog.ts`, `/lab/supabase/` affiche l'arbre des collections, banc `scripts/test/schema` + CI `schema-ci.yml` | |
| **Étape 7** (2026-10-02) : 3 univers, 15 collections, 2 transverses, 4 pages marque, filtres/tri, fil d'Ariane, JSON-LD, sitemap (production), 404, `verify-catalog` — section ci-dessous | |
| **Étape 8** (2026-10-02) : 245 fiches `/{slug}/`, galerie, variantes réelles, prix au kg/L, disponibilité, commande WhatsApp, accordéons conditionnels, similaires, offres, JSON-LD Product/ProductGroup, sitemap avec `lastmod`, LAB des regroupements Mode, `verify-products` — section ci-dessous | |
| **Étape 8B** (2026-10-03) : build à froid 21 min 39 s → 6 min 55 s (CI), préréglages d'images, mesure reproductible — section « Build et images » | |
| **Étape 9** (2026-10-03) : accueil final `/`, configuration éditoriale, `verify-home` — section « Accueil (étape 9) » | |
| **Étape 10** (2026-10-03) : panier, demande de commande, suivi, administration des commandes, tables et fonctions Supabase, `verify-orders`, `test:cart` — section « Commande, paiement, livraison (étape 10) » | Paiement via Shopify (étape dédiée), CGV et confidentialité révisées (bloquant production), recherche, redirections, shooting |
| **Étape 11, phase 1** (2026-10-03) : e-mails transactionnels Brevo — outbox, Edge Functions, gabarits, bloc admin « Notifications », bancs hors ligne ; **rien de déployé** — section « E-mails transactionnels (étape 11) » | Phase 2 après configuration Brevo par le propriétaire |

## Pages catalogue (étape 7)

**Routes.** Une seule route, `src/pages/[...path].astro`, génère toutes les pages depuis `collections.path`
(jamais recalculé) : univers → `UniverseTemplate`, collection / sous-collection / transverse / marque →
`CollectionTemplate`. Marque de parfum : `{chemin de Parfums}{brands.id}/`, générée seulement si elle a au
moins un parfum publié. Toute autre adresse → `404.html` (statut 404, aucune redirection).

**Données** (`src/lib/catalog-store.ts`, 5 requêtes par build, mémoïsées) :

| Règle | Source |
|---|---|
| Classement | `collections` + `product_collections`. `category_id` n'est jamais lu. Une page contient les produits rattachés (principale **ou** secondaire) à la collection **et à ses descendantes** (`/miels/` = Miels + Miels gourmands ; `/mode-homme/` = qamis, sandales, accessoires). |
| Ordre « Sélection » | Ordre de l'arbre de la collection principale (la collection avant ses sous-collections), puis `sort_order`, puis slug. |
| Produits | `status = published` filtré explicitement (pas seulement par la RLS). Le build échoue si un produit n'a pas exactement une principale publiée. |
| Disponibilité | `availability` ; NULL → repli sur `coming_soon` (jamais converti en `available`). |
| Images | `product_media` (hors images de variante), sinon `images[]`. Les 3 premières de chaque produit sont vérifiées (HEAD) : une image inaccessible est écartée et signalée, le produit passe à la suivante ou au repli « Photo à venir ». |
| Prix | « À partir de X € » seulement si plusieurs prix **différents** existent parmi les variantes actives. |
| Badges | Bientôt disponible · Épuisé · **Offre** (produit d'une offre `product_promo` active, dans sa fenêtre de dates). « Nouveau » non calculé (§G.2 à confirmer). |
| Offres (`/offres/`) | Offres actives + produits de la collection Offres & packs. Prix barré **uniquement s'il est prouvé** : promotion produit dont le prix de référence est le prix fixe réel de chaque produit. Aucune économie pour les packs (formats inclus non renseignés). |
| Marques | Indexable si ≥ `settings.brand_min_models_indexable` (4) parfums publiés **et** `brands.description` renseignée. |
| Intro | `collections.description`, sinon `seo_description` (validée à l'étape 3). Aucun champ « contenu long » en base : rien après la grille hormis le maillage. |

**Indexation.** Préproduction : tout est `noindex, nofollow`. Production : univers / collection / transverse
indexables si `is_indexable` **et** au moins un produit ; une collection vide garde sa page (les liens du menu
ne cassent pas) mais en `noindex, follow` avec un message neutre. Chaque page porte
`data-dn-indexable`, que lisent le sitemap et les tests. Le sitemap (`astro.config.mjs`,
`catalogSitemap`) n'est écrit qu'en production et annoncé dans `robots.txt`.

**Filtres et tri** (`src/config/catalog-pages.ts`, `CatalogBrowser.astro`) — HTML statique, aucun JSON produit
envoyé au client : chaque carte porte `data-f-*` (codes des facettes affichées), `data-price`, `data-added`,
`data-order`. État dans le fragment (`#contenance=200-g&tri=prix-croissant`), remplacé sans entrée
d'historique. Une facette n'est affichée que si ≥ 2 valeurs et ≥ 80 % des produits renseignés. « Types » =
règles lexicales sur le nom réel (« Savon… ») ou appartenance réelle à une sous-collection ; le build échoue
si une règle ne trouve rien ou si un produit en vérifie deux. « Nouveautés » = `products.created_at`
décroissant, proposé seulement si la page compte au moins deux dates d'ajout. Pas de pagination (62 produits
au maximum, 25 Ko gzip de HTML).

**Tests** : `npm run verify:catalog` recalcule indépendamment chaque page depuis Supabase et la compare à
`dist/` (chemins uniques, une principale par produit, aucun brouillon, aucun orphelin, nombres et listes,
pages marque, liens internes, pages indexables vides, JSON-LD). Lancé en CI (`site-ci.yml`).

## Fiches produit (étape 8)

**Route.** La même route `src/pages/[...path].astro` génère une fiche par produit **publié** à l'URL plate
`/{slug}/` (décision figée : changer de collection ne change pas l'URL). Un brouillon n'a pas de page →
404. Le build échoue si deux pages visent la même URL ou si un produit occupe `/demo/`, `/lab/`… Les slugs
actuels sont conservés (Khamrah reste à son URL longue ; `/khamrah/` n'existe pas).

**Gabarit unique** `src/components/templates/ProductTemplate.astro` + `components/product/ProductGallery.astro`
et `ProductPurchase.astro`. Le modèle de vue `src/lib/product-page.ts` décide des sections ; les règles par
famille (bien-être / parfum / mode) sont dans `src/config/product-pages.ts`. Mobile : fil d'Ariane compact ·
galerie · marque · H1 · faits · prix · variantes · disponibilité · commande · livraison · accordéons · même
collection · offres. Desktop : 7/12 galerie (rail de miniatures), 5/12 informations, **aucune colonne
collante**.

**Sources et replis** (nouveau schéma d'abord ; ancien champ seulement s'il est vide) :

| Donnée | Source | Repli |
|---|---|---|
| Galerie | `product_media` sans variante (ordre `sort_order`) | `images[]` (aucun cas aujourd'hui) ; aucune image → « Photo à venir » |
| Médias de variante | `product_media.variant_id` | format sans photo → photo du format précédent (repli 300 g → 200 g validé, §M.2) |
| Options | `product_variant_options` → `option_values` | `options` jsonb, puis nom de variante (aucun cas : 115/115 normalisées) |
| Prix au kg / L | `option_values.numeric_value` + `unit`, ou `net_quantity` + `net_unit` | aucun (« 100 », « 200 » sans unité → rien) |
| Composition / origine | `product_food_details` / `product_apparel_details` (vides) | `products.composition` / `products.provenance` |
| Disponibilité | `availability` | NULL → `coming_soon` (jamais `available`) |
| Title | `seo_title` (vide partout) | `{Nom} – {concentration} {marque}` (parfums, vocabulaire fermé) ; nom seul sinon |
| Meta | `seo_description` (vide partout) | accroche + début de la description ; jamais prix / livraison / WhatsApp |
| Alt | `alt_text` (vide partout) | nom du produit (+ « – 200 g » pour une image de variante) |
| `lastmod` | max(`products.updated_at`, `product_variants.updated_at`) | — (`product_media.updated_at` = date du remplissage de l'étape 6, ignorée) |

**Contenus volontairement non rendus** (aucune modification en base) :

- `products.accordions` (HTML libre, 78 produits) : mentions « À compléter », ancien mot
  « Thérapeutiques », styles en ligne, liens texte non cliquables. Remplacé par des accordéons construits
  depuis les champs structurés (Description, Composition [& origine] / Notes olfactives, Conseils
  d'utilisation, Précautions, Livraison & paiement) ; une section sans donnée n'est pas rendue.
- `products.benefits` pour le bien-être (112 produits sur 115) : allégations de santé (« Renforce
  l'immunité », « Soulage les douleurs dentaires »…). Affiché pour parfums et mode seulement.
- Phrases ou éléments contenant « À compléter » (49 produits : composition, précautions).
- `usage_advice` des fiches mode (« Précisez votre taille lors de la commande ») : la taille se choisit
  dans le sélecteur.

**Variantes.** `VariantSelector` (radios natifs) branché aux vraies variantes : contenance en cartes (valeur,
prix, prix au kg), taille en boutons texte (2XL et XXL restent distincts). Aucune présélection ; option
épuisée barrée et désactivée. Le choix est reporté dans l'URL (`?contenance=200-g`, `history.replaceState`)
et relu au chargement ; le canonical reste `/{slug}/`. Les anciennes fiches couleur restent des produits
distincts (aucun sélecteur couleur public).

**Commande.** Depuis l'étape 10 : bouton « Ajouter au panier » (voir « Commande, paiement, livraison »).
Étape 8 (historique) : lien WhatsApp prérempli, aucun bouton panier ni paiement sur le site. Produit `coming_soon` / `out_of_stock` : simple lien « Une question ? ». Livraison :
texte de `config/commerce.ts`, jamais le seuil de 50 €. Depuis l'étape 9 (décisions du 3 octobre 2026) :
plus de « paiement à la réception » ni de zone Île-de-France dans la note, l'accordéon ou le message
prérempli — voir « Accueil (étape 9) », Règles commerciales.

**Recommandations.** « Dans la même collection » : 4 produits de la collection principale, ordre
« Sélection » en commençant après le produit courant (déterministe), hors autres fiches du même futur modèle
**sûr**, complété par la collection parente. « À associer » : `product_relations` (vide → section absente).
« Disponible aussi dans » : offres actives contenant le produit (`OfferCard`, économie seulement si prouvée).

**JSON-LD.** `Product` + `Offer`, ou `ProductGroup` + `hasVariant` + `variesBy: size` pour les 33 produits à
variantes (URL de variante = query string). Disponibilité : available → InStock, on_demand → BackOrder,
coming_soon / out_of_stock → OutOfStock. Jamais : avis, note, GTIN/SKU, état, stock chiffré ; `brand`
seulement si la marque existe. Plus `BreadcrumbList` (collection principale et ses ancêtres).

**Sitemap.** Fiches indexables en production avec `<lastmod>` réel ; jamais brouillons, LAB, variantes en
query string ni pages noindex. Contrôlé par `verify-products` sur un build `DAR_NUR_ENV=production`.

**LAB `/lab/regroupements/`** (noindex, hors sitemap, sans lien public). Instantané versionné
`src/data/lab/product-groupings.json` (tables `product_groupings*` réservées à l'admin, exportées en lecture
par `npm run lab:groupings`) croisé avec le catalogue public lu au build. « Regroupements sûrs » (15 modèles,
72 fiches, aperçu fusionné `/lab/regroupements/g01/`… sur le même gabarit, commande désactivée, sans
JSON-LD) et « Validation humaine requise » (Nilla, Sultan Saphir, Comera 6/8, Musc Tahara, Farasha,
2 doublons). Écarts calculés : prix, tailles, libellés lus sur photo, photos identiques, conflits de slug.
L'instantané doit être rafraîchi si les propositions changent en base.

**Tests.** `npm run verify:products` (en CI) recalcule chaque fiche depuis Supabase et la compare à `dist/` :
une fiche par produit publié et aucune autre, canonical, H1, fil d'Ariane, prix, variantes, prix au kg,
disponibilité, commande, JSON-LD, images, mentions interdites, similaires, `lastmod`, liens produit de toutes
les pages, LAB, produits témoins, sitemap (build de production). Contrôle négatif fait : fiche non publiée,
faux avis et prix modifié sont détectés.

**Build.** Voir « Build et images (étape 8B) » ci-dessous.

## Build et images (étape 8B)

**Cause du build lent (mesurée, CI 4 vCPU, build à froid de l'étape 8 : 21 min 39 s).** 99 % du temps est la
génération des images (21 min 29 s), et 93 % de celle-ci est l'**encodage AVIF** : 4 780 s CPU pour
3 228 fichiers (≈ 1,5 s chacun, effort 4 = réglage par défaut de sharp), contre 359 s pour les 3 233 WebP.
6 461 fichiers pour 372 photos catalogue : chaque photo affichée en galerie + carte + miniature donne
16 sorties (3 largeurs galerie + 3 largeurs carte + 2 miniatures, × AVIF et WebP).

**Ce qui a été fait.**

| Mesure | Effet |
|---|---|
| AVIF `effort: 3` (`astro.config.mjs`, `sharpImageService`) | Encodage 3,6–3,8× plus rapide, poids +1 à +3 %, SSIM −0,001, aucune différence visible agrandie ×2 (banc de 24 vraies sources). Qualités par défaut conservées : AVIF 50, WebP 80. Effort 2 écarté (+10 % de poids). |
| Préréglages partagés `src/config/images.ts` | `GALLERY` 1200×1500 `inside` [480, 800, 1200] · `PRODUCT_CARD` 600×750 [200, 400, 600] · `THUMBNAIL` 128×160 [64, 128] · `COLLECTION_CARD`, `UNIVERSE_CARD`, `OFFER_CARD`, `HERO`. Une même photo dans un même cadre = un seul fichier. |
| Miniature unique | Rail de galerie (64 px), sélecteur de couleur (48 px), recherche (48 px) et LAB (96 px) utilisent `THUMBNAIL` : le LAB n'a presque plus de fichiers propres (814 → 250). |
| Rail de miniatures seulement à partir de 2 images | Le rail était masqué mais rendu (4 fichiers par photo) sur 78 % des fiches. |

Largeurs conservées : la galerie sert 1200 px aux mobiles DPR 2–3 (430 × 2,6) et aux portables Retina ; les
cartes 600 px au DPR 2 desktop (302 px). AVIF conservé partout (−45 % de poids par rapport au WebP).

**Temps mesurés** (`node scripts/measure-build.mjs --cold | --warm` depuis `site/` : `--cold` supprime
`dist/`, `node_modules/.astro` et `node_modules/.vite`, ce qu'efface `npm ci`) :

| | Avant | Après |
|---|---|---|
| CI à froid, 4 vCPU (étape « Build statique ») | 21 min 39 s | **6 min 55 s** |
| CI à froid, job complet (install, types, build, 3 contrôles) | 22 min 18 s | **7 min 34 s** |
| Local à froid (12 threads) | 12 min 39 s | 4 min 24 s |
| Local à chaud (cache valide) | 23 s | 16 s |
| Fichiers image | 6 461 | 5 141 |
| CPU AVIF / WebP (CI) | 4 780 s / 359 s | 1 275 s / 331 s |

**Cache.** Le cache d'Astro (`node_modules/.astro`) n'accélère que tant que les sources n'ont pas bougé :
les images de `dar-nur.fr` sont servies par GitHub Pages avec `max-age=600` et un `ETag` qui change à
**chaque déploiement** du site actuel (cron de rattrapage Parfums compris) ; la revalidation reçoit alors
200 et tout est réencodé. Un build « chaud » redevient donc froid au moins une fois par jour : seul le temps à
froid compte. La CI garde son cache (clé = OS + empreinte de `astro.config.mjs`, car les réglages
d'encodeur ne changent pas les noms de fichiers) et peut être lancée à la main avec `cold` pour mesurer le
pire cas ; délai du job ramené à 20 min.

**Netlify.** Limite par défaut : 15 min (+ 5 min de post-traitement), extensible par l'API seulement.
Machine Starter annoncée à 4 cœurs / 8 Go, comparable au runner CI : build estimé ≈ 7 min à froid. `npm ci`
reste dans la commande (installations reproductibles ; il efface le cache Astro, ce qui ne change rien
puisque le build à froid tient la limite). Netlify Image CDN étudié et **non retenu** : il exige
l'adaptateur `@astrojs/netlify`, déplace l'encodage vers la première visite (LCP du premier visiteur de
chaque variante), rend les images invérifiables en CI (`verify-products` contrôle `/_astro/`) et lie
l'hébergement à Netlify, sans nécessité une fois le build à froid sous la limite.

**Points de vigilance.** dar-nur.fr peut répondre **429** à un build qui l'interroge en rafale (constaté
après plusieurs builds locaux successifs) : un GET refusé fait échouer le build, un HEAD refusé écarte
l'image (avertissement `[catalogue]`). Les images sources sont lues sur dar-nur.fr tant que le catalogue y
pointe.

## Accueil (étape 9)

**Architecture.** `src/pages/index.astro` ne fait que la mise en page ; `src/lib/home-page.ts` construit la
vue depuis le catalogue déjà lu au build (aucune requête Supabase de plus ; une lecture partielle de la photo
du hero pour connaître sa taille) ; les choix éditoriaux sont dans `src/config/home.ts`. Composants : `Hero`
(étendu : `frame`, légende), `HomeUniverse` (nouveau), `ProductCard`, `EntryCard`, `ReassuranceBar`, header
et footer existants. Aucun univers n'est marqué actif sur `/`.

**Ordre** (hauteur ≈ 4 800 px à 390 px, ≈ 4 450 px à 1 366 px) : hero · « Trois univers » (photo, nom —
« Mode modeste » = `h1` de `/mode/` — et 4 collections avec leur nombre réel de produits) · « À découvrir »
(8 cartes, grille 2 / 4 colonnes, sans carrousel) · bloc Miels (faits confirmés : miel de printemps récolté
en France, base des miels aux fruits) · Idées cadeaux & offres (nombres réels) · réassurance · footer. Seule
zone sombre : le footer. Ni avis, ni compteur, ni newsletter, ni « meilleures ventes », ni faux panier.

**Configuration éditoriale** (`config/home.ts`) : slugs explicites du hero, des photos d'univers, des
collections affichées, des 8 produits et du bloc Miels, plus une liste d'exclusion (`miel-myrtille`). Ce
n'est **pas** un classement commercial. Le build **échoue** si un slug est introuvable, non publié, sans image
vérifiée, exclu ou en double, ou si une collection est vide ou hors de son univers ; un produit qui n'est plus
`available` est seulement signalé (`[accueil]`), son état réel restant affiché.

**Hero.** Photo du Bakhur Mukhalat (`dn-bakhour-0`) : vraie photo, sans texte ni filigrane, accordée au vert
et à l'or ; aucune photo de shooting n'existe encore (§T.3). Source carrée de 1 100 px : `frameForSource`
(`config/images.ts`) ramène le cadre `HERO` à 1 100 × 825 et ses largeurs à [390, 780, 960, 1100] (sharp
n'agrandit pas : « 1280w » et « 1600w » auraient été des copies). Un seul recadrage 4:3, montré en 4:3 à
toutes les largeurs (le 1:1 mobile était prévu pour la photo de shooting). Image LCP : `fetchpriority=high`,
`loading=eager`, dimensions déclarées. H1 « Miels, parfums et mode modeste » ; CTA « Découvrir Parfums &
Soins » (univers du produit photographié) ; lien « Voir les trois univers » ; légende « En photo : Bakhur
Mukhalat » vers la fiche.

**Images.** Aucune image de `assets/produits-ia/` ni affiche promotionnelle d'offre sur l'accueil. Cartes
produit et bloc Miels : préréglage `PRODUCT_CARD` (fichiers partagés avec les collections) ; univers :
`UNIVERSE_CARD`. Fichiers propres à l'accueil : 27 (hero 8, univers 18, logo PNG du JSON-LD 1).

**SEO.** Title « Dar Nūr — Miels, parfums, soins et mode modeste » (aucun wording validé n'existait ; l'ancien
« Produits Naturels & Mode Islamique Premium » / « 100 % purs » n'est pas repris). Meta : les trois univers,
commande et conseil sur WhatsApp. Canonical `https://dar-nur.fr/`. JSON-LD `WebSite` +
`Organization` (logo, Instagram, TikTok, contact WhatsApp) ; ni `Product`, ni avis, ni `SearchAction`
(recherche non branchée). Sitemap de production : `/` ajouté (268 URL), sans `<lastmod>` (aucune date
fiable). `/demo/` passe en `noindex` permanent (il aurait été indexable en production) et rejoint les pages
internes de `verify-build`.

**Règles commerciales (décisions du propriétaire, 3 octobre 2026).** Plus de paiement à la réception : la
commande est préparée, le client paie une fois la commande prête, l'expédition suit le paiement. Livraison
internationale **visée** : exigence de la future étape commande/livraison (pays, tarifs, expédition), rien
n'est encore implémenté. En attendant, aucun texte public ne décrit de zone, de tarif, de délai ni de moyen de
paiement (`config/commerce.ts`) :

| Texte | Avant | Après |
|---|---|---|
| Bandeau (toutes pages) | Paiement à la réception · Livraison en Île-de-France | Commande et conseil sur WhatsApp |
| Réassurance (toutes pages) | 4 faits : commande / paiement à la réception / livraison IDF / conseil | 2 faits : Commande sur WhatsApp (depuis la fiche, message prérempli) · Conseil personnalisé ; colonnes desktop = nombre de faits |
| Meta de l'accueil | … paiement à la réception. | … Commande et conseil sur WhatsApp. |
| Fiche : ligne livraison | Livraison en Île-de-France · paiement à la réception | Livraison et paiement : modalités confirmées sur WhatsApp |
| Fiche : note sous le bouton | … vous payez à la réception. | La commande se fait sur WhatsApp : rien n'est à payer sur le site. |
| Fiche : accordéon Livraison & paiement | paiement à la réception, remise gratuite Chelles / Lognes | Commande sur WhatsApp · Modalités confirmées sur WhatsApp · lien CGV |
| Message WhatsApp prérempli | « Paiement à la réception : Revolut / Espèces » | ligne retirée |

`verify-home` et `verify-products` refusent désormais « paiement à la réception / à la livraison » et toute
zone Île-de-France (Chelles, Lognes) dans tout le HTML, message WhatsApp encodé compris (contrôle négatif fait).
**À faire avant la bascule** : les CGV de dar-nur.fr (liées depuis le footer et les fiches) décrivent encore
l'ancien fonctionnement.

**Mesures** (build local, serveur statique gzip, Lighthouse 12.8 mobile simulé) : préprod 96 / 100 / 100 / 69
(SEO : seul le `noindex`), production 98 / 100 / 100 / 100 ; LCP 2,7 s en préprod (comme `/parfums-soins/` et
les fiches), 2,4 s en production ; CLS 0 ; desktop 100, LCP 0,6 s. HTML 16,3 Ko gzip, CSS 9,4 Ko, JS 3,7 Ko ;
photo LCP 66 Ko (AVIF 780 px). Build à froid local 4 min 37 s (8B : 4 min 24 s), 5 168 images (8B : 5 141).

**Tests.** `npm run verify:home` (CI) : `/`, H1 unique, canonical, robots, sitemap ; tous les liens (internes
dans `dist/`, pages légales absolues présentes dans le site actuel) ; aucune ancre vide, aucun lien LAB ou
demo ; 3 univers + 2 entrées ; produits mis en avant publiés, hors test, hors `produits-ia/` ; mentions
interdites (livraison offerte ou nationale, avis, étoiles, compteurs, meilleures ventes, newsletter,
« Thérapeutiques », « 100 % naturel ») ; JSON-LD limité à WebSite + Organization. Contrôle négatif fait
(9 anomalies injectées, 9 détectées).

**Limites.** Hero provisoire en attendant le shooting (§T.3) ; textes du hero et du bloc Miels à valider par
la maison ; l'intro de `/idees-cadeaux/` promet encore « pour elle, pour lui, par budget » (point ouvert de
l'étape 7, non repris sur l'accueil) ; Miels & Herboristerie n'a qu'un produit dans la sélection (l'affiche du
Miel Mangue & Fraise, seul produit `featured`) : les deux seules photos de miel hors `produits-ia/` et hors
affiche servent déjà au bloc Miels (printemps) et à la carte d'univers (lavande, fiche encore inachevée).

## Commande, paiement, livraison (étape 10)

**Parcours.** 1. Le client ajoute des produits au panier. 2. Il envoie une **demande de commande** (aucun
paiement). 3. Dar Nūr vérifie la disponibilité et prépare. 4. Dar Nūr fixe la livraison (et une remise
éventuelle) : le total final est confirmé. 5. Le client voit le total et le lien / les instructions de
paiement. 6. Il paie. 7. Dar Nūr confirme le paiement. 8. Expédition, **jamais avant le paiement confirmé**.
9. Le client voit le suivi. Aucun tarif, délai, seuil de gratuité ni pays « desservi » n'est annoncé.

**Architecture.** Le site reste 100 % statique (aucun SSR, aucune Netlify Function) : le navigateur appelle,
avec la clé PUBLIQUE, quatre fonctions Postgres `SECURITY DEFINER` (même mécanisme que `check_promo_code`,
déjà en production) : `check_cart`, `create_order_request`, `get_order_tracking`, `order_country_codes`. Les
tables de commande sont fermées à ce rôle. L'administration se connecte avec le compte Supabase existant et
n'écrit que par `admin_update_order`. Pourquoi pas Netlify Functions : aucun site Netlify n'existe encore,
elles exigeraient une clé `service_role` dans l'hébergement, et la validation, la transaction et les invariants
vivent mieux en base (où ils protègent aussi l'admin et la CLI). Schéma, statuts, fonctions et invariants :
`docs/SCHEMA_SUPABASE.md`, « Commandes (étape 10) ». Configuration publique injectée par
`components/order/ApiConfig.astro` (URL + clé `sb_publishable_`, environnement, commande ouverte ou non),
seulement sur les 4 pages qui l'utilisent.

| Élément | Fichiers | Points clés |
|---|---|---|
| Panier | `scripts/cart-store.ts`, `cart-view.ts`, `cart-sync.ts`, `components/cart/MiniCart.astro`, `pages/panier.astro` | `localStorage` (`dn-cart-v1`) : produit, variante, libellé d'option, prix affiché (centimes), image, lien, quantité 1–99, 30 lignes. Lecture défensive (prix, UUID, liens `javascript:`, images `http:` écartés). Rendu DOM sans HTML interprété. Revérification `check_cart` au chargement : prix changé → mis à jour ET signalé ; article indisponible → signalé, envoi bloqué. Pas de compte. |
| Fiche | `components/product/ProductPurchase.astro`, `lib/product-page.ts` (`cartOf`) | « Ajouter au panier » si `available` / `on_demand` et prix ; option obligatoire (message + focus). `on_demand` : « disponibilité confirmée après votre demande ». `coming_soon` / `out_of_stock` : aucun ajout. WhatsApp = lien secondaire « Une question ? » (produit seul). Vignette WebP 128 × 160 générée au build (+100 fichiers ≈ 2 Ko). |
| Offres | `lib/catalog-store.ts` (`provenPromos`), SQL `resolve_lines` | Promotion produit **prouvée** (offre `product_promo` en cours, produit sans variante, prix réel = prix de référence) : appliquée à la fiche (prix barré), au panier ET par le serveur — Nissah 59,99 € → 40 €. Les packs (table `offers`) ne sont pas commandables en ligne. Aucune économie douteuse réintroduite. |
| Demande | `pages/commande.astro` | Récapitulatif, Coordonnées (prénom, nom, e-mail, téléphone international), Livraison (pays ISO 3166-1 alpha-2, France en tête, noms par `Intl.DisplayNames` ; adresse 1/2, code postal obligatoire à 5 chiffres pour la France seulement, ville, région, instructions), explication du parcours, CGV, pot de miel. CTA « Envoyer ma demande de commande ». Validation navigateur = serveur ; erreurs reliées aux champs + résumé focalisé ; saisie jamais vidée. Clé d'idempotence par envoi. Panier vidé seulement après la réponse `ok`. Confirmation : numéro `DN-AAAA-XXXXXX`, articles, « Commande reçue », prochaine étape, lien de suivi (mémorisé sur l'appareil), WhatsApp avec le seul numéro de commande. |
| Suivi | `pages/suivi.astro` | `/suivi/#<jeton>` : jeton de 256 bits dans le **fragment** (jamais envoyé au serveur web ni dans le Referer). Frise Commande reçue → Vérification → Paiement demandé → Paiement reçu → Expédiée. Total montré seulement une fois confirmé. « Payer ma commande » seulement si une vraie URL `https://` existe, sinon « Les instructions de paiement vous seront transmises par Dar Nūr. » ; « paiement en cours de vérification » si déjà réglé. Transporteur et suivi une fois expédiée. Jamais d'adresse, d'e-mail, de téléphone, de note ou de référence interne. |
| Administration | `pages/admin/commandes.astro` | Connexion par le compte admin existant (Supabase Auth, session `sessionStorage`). Liste filtrée (environnement, statut), détail (client, adresse, lignes, journal), disponibilités par ligne, livraison (montant, transporteur, service, délai indicatif), remise motivée, demande de paiement (prestataire, URL, référence), confirmation manuelle du paiement, préparation, suivi (transporteur, numéro, URL), expédition, livraison, annulation motivée (remboursement dû si payée), remboursement marqué, note interne, notifications « client à prévenir » (copier le lien de suivi, préparer un e-mail). Chaque action envoie le statut affiché (concurrence). |

**Garde-fous vérifiés en production (2026-10-03, commande de test DN-2026-6R7JG9).** Demande depuis le
navigateur (adresse belge) → admin : vérification, disponibilités, livraison 12,90 €, demande de paiement
(URL `http://` refusée, URL `https://` de test acceptée), client : « Paiement demandé », 132,87 €, bouton
« Payer ma commande » ; expédition avant paiement refusée **à quatre niveaux** : bouton inactif, fonction
(`payment_not_confirmed`), écriture REST directe (403), écriture superutilisateur via la CLI
(`invalid_transition awaiting_payment → shipped`) ; puis paiement confirmé manuellement, préparation, suivi,
expédiée ; client : « Expédiée », frise complète, transporteur, numéro et lien de suivi. Invariants 14/14.

**Paiement.** Aucun prestataire (Stripe, PayPal, SumUp, Revolut…) n'est configuré : aucune intégration
simulée, aucune page de paiement, aucune donnée de carte. `payment_provider` / `payment_url` /
`payment_reference` attendent un lien de paiement sécurisé ; `orders_private.config.payment_allowed_hosts`
peut restreindre les hôtes. Un paiement n'est `paid` que par validation de l'administration
(`payment_confirmation_source = admin_manual`) — un retour client « ?success=true » ne prouve rien. Pour
brancher un prestataire : créer la session de paiement à `request_payment` (montant = `total_cents`, devise
EUR, référence = `public_number`), enregistrer son URL, et confirmer par un **webhook signé** reçu côté
serveur (Supabase Edge Function avec le secret du prestataire) qui appelle une fonction dédiée posant
`provider_webhook` ; `failed` et les remboursements suivent le même chemin.

**E-mails.** Les événements à notifier (commande reçue, paiement demandé, paiement reçu, expédiée, annulée,
remboursée) sont dans `order_events` (`notify_customer`, `notified_at`) : l'administration prévient le client à
la main puis marque la notification. L'étape 11 automatise quatre de ces e-mails (Brevo) : voir « E-mails
transactionnels (étape 11) » ; tant qu'elle n'est pas en service, rien ne change.

**Production fermée.** `config/commerce.ts` (`ordering.termsReviewed = false`) : un build de production
remplace le formulaire par « La commande en ligne ouvre bientôt » ; le serveur refuse aussi toute commande
« production » (`production_ordering_open = false`). Préproduction : bandeau « commandes de TEST » et blocage
CGV affichés ; toutes les commandes y sont `environment = preprod`, `is_test = true`.

**Textes publics.** Bandeau « Commande en ligne · paiement après confirmation de votre commande » ;
réassurance : Commande en ligne · Paiement après confirmation · Conseil personnalisé ; ligne livraison
« Livraison en France et à l'international : frais confirmés avant paiement » ; accordéon « Livraison &
paiement » = les 4 étapes du parcours + lien CGV ; footer Aide : Mon panier · Suivre une commande · Une
question ? WhatsApp. Hors de France, mention neutre : droits ou taxes d'importation possibles, non calculés
par Dar Nūr.

**SEO et cache.** `/panier/`, `/commande/`, `/suivi/`, `/admin/commandes/` : `noindex` dans tous les
environnements, hors sitemap, interdites dans `robots.txt` de production. Pages statiques sans aucune donnée
client ; réponses des fonctions `Cache-Control: no-store, private`.

**Mesures.** Responsive vérifié à 375 / 390 / 768 / 1366 / 1920 px (fiche, panier, commande, suivi,
administration) : aucun débordement (le panier débordait à 375 px : corrigé par des colonnes `minmax(0, …)`).
Lighthouse 12.8 mobile (serveur gzip, panier rempli) : fiche 99 / 100 / 100, panier 100 / 100 / 100, commande
100 / 100 / 100 (performance / accessibilité / bonnes pratiques), CLS 0 (0,37 et 0,55 avant l'état du panier
connu dès le `<head>`) ; SEO 69 = le seul `noindex`. JS de la page la plus lourde 6,7 Ko gzip.

**Tests.** `scripts/test/schema/orders.mjs` (142 contrôles, `schema-ci`) : métier, paiement, expédition,
RLS, sécurité de l'API, purge des tests, rollback. `npm run test:cart` (8 tests) et `npm run verify:orders`
(`site-ci`). `verify-products` contrôle le bouton panier, les identifiants et prix du panier et l'absence de
commande WhatsApp ; `verify-home` accepte « France et international » mais refuse livraison mondiale,
gratuite ou sans frais de douane.

**Commandes de test en production.** 4 commandes `preprod` (`DN-2026-9EKMFK`, `-LLZJXB`, `-F6CLJT`,
`-6R7JG9`, e-mails `example.com`). La base interdit toute suppression ; une purge explicite, testée,
**non exécutée**, est prête : `supabase/maintenance/20261003_etape10_purger_commandes_test.sql`.

**Limites.** Aucun prestataire de paiement ni e-mail ; clients prévenus à la main ; CGV et confidentialité
obsolètes (production fermée) ; pas de compte client ; pas de modification d'adresse par l'admin (figée,
note interne possible) ; pas de multi-devise, de tarifs transporteur, de droits de douane ni de facture.


## E-mails transactionnels (étape 11)

> **Phase 1 (2026-10-03)** : préparé et testé hors ligne. **Phase 2 (2026-10-06, en cours)** : Brevo configuré
> par le propriétaire (domaine authentifié, expéditeur et Reply-To `contact@dar-nur.fr`, secrets Edge) ;
> sauvegarde `C:\Users\youcef\dar-nur-backups\etape11-supabase-2026-10-06\` ; **migrations appliquées en
> production**, pg_cron activé (tâche `dar-nur-order-emails`), invariants 14/14 + 13/13 ; jeton du worker dans
> Vault et en secret Edge (jamais affiché) ; `order-emails` et `order-emails-webhook` **déployées**
> (`--no-verify-jwt`) ; `email_config` : liste de test `contact@dar-nur.fr`, `worker_url` renseignée,
> **envoi coupé** (`sending_enabled = false`), production coupée. Chaîne réelle vérifiée **sans envoi**
> (commande de test DN-2026-GA58EZ → outbox → pg_net → fonction → abandon `site_url_missing`).
> **Préproduction publique** (créée par le propriétaire le 2026-10-06, branche `refonte/etape-11-paiement-emails`,
> base `site/`) : `https://wondrous-rolypoly-c99592.netlify.app` (noindex, `env: preprod`) = `site_url_test` ;
> `sending_enabled = true`, production toujours coupée. **Parcours réel vers `contact@dar-nur.fr` seulement**
> (DN-2026-GA58EZ, depuis `/admin/commandes/` connecté par le propriétaire) : « Réessayer » → commande reçue,
> vérification + livraison 6,90 € → paiement demandé (sans URL de paiement), paiement confirmé à la main
> (`admin_manual`), préparation, suivi fictif `TEST-ETAPE11-0001`, expédiée → **4 e-mails acceptés par Brevo,
> 1 tentative chacun, `provider_message_id` enregistrés, aucun doublon** (2 appels manuels du worker ensuite :
> `claimed 0`), 4 `customer_notified`, « Client à prévenir » vide, bloc Notifications à jour ; invariants
> 14/14 + 13/13 ; CI vertes (34feae7). Lien `/suivi/#jeton` de la commande vérifié sur la préproduction.
> **Non vérifiable par la session** : rendu dans la boîte contact@ et passage du `#jeton` à travers le suivi
> des clics Brevo (vérification du propriétaire) ; tentatives et rebonds non provoqués en production (testés
> hors ligne) ; webhook Brevo non configuré (`delivery_status` vide). Paiement : inchangé (Shopify plus tard).

**Périmètre.** Quatre e-mails, et seulement eux : commande reçue, paiement demandé, paiement confirmé,
commande expédiée. Brevo est utilisé comme **API transactionnelle seulement** (aucun contact, liste, campagne,
panier abandonné ni suivi marketing). Français seulement (textes regroupés par langue dans `templates.ts`).

**Architecture (outbox).**

```
order_events (journal étape 10) ──trigger, même transaction──▶ orders_private.order_emails (outbox)
                                                                 │ pg_net (après COMMIT) + pg_cron /5 min
                                                                 ▼
                                    Edge Function order-emails ──▶ API Brevo /v3/smtp/email
Brevo ──webhook (jeton bearer)──▶ Edge Function order-emails-webhook ──▶ delivery_status (info admin)
```

- Déclencheurs : `created` → commande reçue ; passage à `awaiting_payment` → paiement demandé ; passage de
  `payment_status` à `paid` (admin aujourd'hui, prestataire demain — même événement, même e-mail) → paiement
  confirmé ; passage à `shipped` → expédiée. Annulation, livraison, remboursement : aucun e-mail (à la main).
- **Les e-mails ne pilotent jamais la commande** : aucune fonction de l'étape 11 n'écrit `status` ni
  `payment_status` (testé) ; une panne d'outbox ou de pg_net n'empêche aucune commande (testé) ; un rebond
  n'annule rien. Seul effet sur l'étape 10 : un envoi réussi renseigne `order_events.notified_at` et ajoute
  un événement `customer_notified` (canal e-mail), ce qui vide la liste « Client à prévenir ».
- Le contenu n'est **pas stocké** : rendu à l'envoi depuis la commande (prénom, numéro, articles, montants,
  transporteur). Jamais d'adresse postale, de téléphone, de note interne, de référence de paiement, d'UUID.
- Lien de suivi `https://<site>/suivi/#<jeton>` : jeton dérivé en base au moment de l'envoi (jamais stocké),
  toujours dans le **fragment** (refusé sinon par le gabarit) : le serveur web ne le reçoit jamais. Brevo, qui
  reçoit le corps de l'e-mail, le voit (comme tout le contenu) ; son suivi des clics réécrit les liens et ne se
  désactive pas pour le transactionnel sans demande au support — à vérifier sur le premier e-mail de test
  (le fragment doit survivre à la redirection).

**Idempotence.** `unique (event_id)` + `unique (order_id, email_type, occurrence)`. Une seule occurrence pour
3 types (les transitions ne se répètent pas). « Paiement demandé » peut se répéter **par choix** : repasser
en vérification puis redemander le paiement fixe un nouveau total que le client doit recevoir ; l'ancienne
demande non partie est abandonnée (`superseded`), et un e-mail devenu sans objet au moment de l'envoi
(commande annulée, déjà payée…) n'est pas envoyé (`obsolete`). Protection secondaire : `idempotencyKey` Brevo
(= id de la ligne, 30 min) — couvre le cas « Brevo a accepté, le worker est mort avant son compte rendu ».

**Envoi et tentatives.** Le worker réclame par bail de 5 min (`FOR UPDATE SKIP LOCKED`, `claim_id` : un compte
rendu périmé est refusé). Tentatives : immédiate, +5 min, +30 min, +2 h, puis `failed` (jamais de boucle).
400 Brevo = échec définitif ; 401/402/403/429/5xx/réseau/délai = nouvelle tentative. En file plus de 48 h →
`expired`. Statuts : `pending`, `sending`, `sent`, `failed`, `skipped` ; remise séparée (`delivery_status` :
delivered, deferred, soft/hard bounce, blocked, invalid_email, spam, error). Erreurs réduites à un code court,
nettoyées en base (clé, JWT, adresse e-mail masqués).

**Garde-fous préproduction (doublés base + fonction).** Interrupteur général `sending_enabled` (faux) ;
production `production_sending_enabled` (faux) **et** secret `ORDER_EMAILS_ALLOW_PRODUCTION=true` (absent) ;
commande de test → destinataire présent dans `test_recipients` (base, vide) **et** dans
`ORDER_EMAILS_TEST_RECIPIENTS` (secret) ; objet préfixé `[TEST]` et bandeau « E-mail de test ». Aucune
adresse n'est choisie par défaut.

**Sécurité.** `BREVO_API_KEY` n'existe que dans les secrets Edge (jamais Git, site, table). Les fonctions
`order_emails_claim/report/delivery_event` ne sont exécutables que par `service_role` ; l'outbox est dans
`orders_private` (non exposé). Edge Functions déployées **sans vérification JWT** mais avec un jeton
bearer comparé à temps constant (`ORDER_EMAILS_WORKER_SECRET`, lu par pg_net dans Vault ;
`BREVO_WEBHOOK_TOKEN`) ; le worker **ignore le corps de la requête** : personne ne peut lui imposer un
destinataire ou un contenu. Brevo ne signe pas ses webhooks (pas de HMAC) : jeton + validation stricte, et
le webhook ne modifie qu'une colonne d'information.

**Gabarits** (`supabase/functions/_shared/order-emails/templates.ts`) : HTML généré et versionné (aucun
`templateId` Brevo : un changement manuel dans Brevo ne peut rien casser), version texte équivalente,
tableaux + styles en ligne, 600 px, bouton ≥ 44 px, logo en texte (aucune image), sans police web ni
JavaScript, vert #2C4A23, fond crème, filet doré. Aperçus : `node scripts/test/schema/email-templates.mjs
--preview <dossier>`.

**Administration** (`/admin/commandes/`) : bloc « Notifications » (statut de chaque e-mail, prochaine
tentative, erreur lisible, « Réessayer » sur la même ligne), alerte « Adresse e-mail en erreur » et badge
dans la liste. Base sans migration 11 : bloc neutre « non installés ».

**Tests.** `scripts/test/schema/email-templates.mjs` (102 : 4 types, montants, livraison 0, international,
avec/sans suivi, accents, échappement, client Brevo simulé, configuration, authentification, webhook) ;
`scripts/test/schema/emails.mjs` (124 : le vrai worker contre PGlite + vraies migrations + faux Brevo —
mise en file, unicité, ordre, tentatives, limite, « Réessayer », deux workers, bail expiré, doublon Brevo,
garde-fous, webhook, droits, pg_net simulé, purge, rollback) ; vérification des types (strict) ;
`npm run test:emails` en `schema-ci`. `verify-orders` : aucune référence Brevo ni fonction du worker dans le
navigateur. Admin vérifié contre un faux back-end local (4 états, relance, 375 → 1920 px).

**Rollback.** `supabase/rollback/20261003_etape11_rollback.sql` : retire outbox, configuration, trigger,
fonctions et tâche cron ; ne touche à aucune commande (testé : schéma identique à l'après-étape 10).

### Mise en service (phase 2, après « Brevo configuré »)

**DNS actuel de dar-nur.fr** (OVH, relevé le 2026-10-03) : MX `mx1/2/3.mail.ovh.net` ; TXT
`v=spf1 include:mx.ovh.com -all` (SPF unique) + `google-site-verification` ; **aucun DMARC** ; aucun DKIM Brevo.

**À faire par le propriétaire** (aucun secret dans la conversation) :
1. Compte Brevo (offre gratuite suffisante : 300 e-mails/jour).
2. Brevo → Paramètres → Expéditeurs, domaines, IP dédiées → **Domaines** → ajouter `dar-nur.fr`,
   configuration manuelle → Brevo affiche ses enregistrements.
3. OVHcloud → Noms de domaine → dar-nur.fr → **Zone DNS** → ajouter, en recopiant exactement Brevo :
   TXT (sous-domaine vide) `brevo-code:…` ; CNAME `brevo1._domainkey` → `b1.….dkim.brevo.com.` ;
   CNAME `brevo2._domainkey` → `b2.….dkim.brevo.com.` ; TXT `_dmarc` →
   `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` (aucun DMARC n'existe : pas de fusion).
   **SPF : ne pas en créer un second.** Brevo n'en exige pas sur IP partagée ; s'il le demande, modifier
   l'entrée existante en `v=spf1 include:mx.ovh.com include:spf.brevo.com -all`. Puis « Authentifier »
   dans Brevo (propagation jusqu'à 48 h).
4. Brevo → SMTP & API → **Clés API** → générer une clé dédiée (« dar-nur-order-emails »). Si Brevo bloque
   les IP inconnues (Sécurité → IP autorisées), l'autoriser pour cette clé : les Edge Functions n'ont pas
   d'IP fixe.
5. Expéditeur `commande@dar-nur.fr`, nom « Dar Nūr » (Brevo → Expéditeurs) ; confirmer que
   `contact@dar-nur.fr` est une vraie boîte OVH avant d'en faire le Reply-To.
6. Supabase → Edge Functions → **Secrets** : `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`,
   `BREVO_REPLY_TO_EMAIL` (si la boîte existe), `ORDER_EMAILS_TEST_RECIPIENTS` (adresse de test validée).
7. Facultatif (alertes de rebond) : après déploiement, webhook transactionnel Brevo vers
   `https://sxlpgcnjerlayitaxxyv.supabase.co/functions/v1/order-emails-webhook`, authentification par jeton,
   même valeur dans le secret `BREVO_WEBHOOK_TOKEN`.

**Ensuite (session de développement)** : sauvegarde, application des 2 migrations, contrôles
`etape10_invariants.sql` + `etape11_invariants.sql`, jeton du worker généré et déposé dans Vault
(`order_emails_worker_secret`) et en secret `ORDER_EMAILS_WORKER_SECRET` sans affichage, déploiement
`npx supabase functions deploy order-emails --no-verify-jwt` (idem `order-emails-webhook`), configuration
`email_config` (adresse de test, URL de préproduction, `worker_url`, puis `sending_enabled`), une commande
de test vers l'adresse validée seulement, vérification du rendu, de l'idempotence et du lien de suivi.
