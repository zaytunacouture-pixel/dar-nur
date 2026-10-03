# Refonte Dar Nūr — nouveau socle Astro (`site/`)

> Statut au 3 octobre 2026 : **étape 8B terminée — build à froid ramené sous la limite Netlify (6 min 55 s
> en CI au lieu de 21 min 39 s), rendu inchangé.** Étape 8 : 245 fiches produit et leurs variantes réelles
> générées depuis le nouveau schéma, page LAB des futurs regroupements Mode. Le panier métier, l'accueil final et
> les redirections ne sont **pas** migrés ; aucune fusion de fiches n'est publiée. La production reste **dar-nur.fr** (GitHub Pages, racine du dépôt), que rien dans
> `site/` ne modifie.

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
    lib/                  supabase, catalog, sample, format
    components/ ui/ layout/ catalog/ cart/ search/ home/
    layouts/BaseLayout.astro
    pages/                index (préprod), demo, design-system, lab/supabase, 404, robots.txt
    data/demo/            panier FICTIF (démonstration uniquement)
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
aucune promesse (livraison France, livraison offerte, retours) absente des CGV en vigueur ; aucun avis,
compteur ou « best seller » sans données ; aucune photo générée à la place d'un vrai produit.

## Statut de la migration

| Fait (étape 5) | À venir |
|---|---|
| Socle, tokens, polices, logo, header, méga-menu, menu mobile 2 niveaux, bandeau, recherche (visuelle), mini-panier (visuel), footer, réassurance, ProductCard, UniverseCard, CollectionCard, VariantSelector, guide des tailles (repli), primitives UI, pages `/demo/`, `/design-system/`, `/lab/supabase/`, Netlify, CI | Puis panier métier, recherche, SEO (301 depuis `redirects`), shooting photo, bascule. |
| **Étape 6** (2026-10-02) : migration additive Supabase (9 migrations, `docs/SCHEMA_SUPABASE.md`), lecture du nouveau schéma dans `catalog.ts`, `/lab/supabase/` affiche l'arbre des collections, banc `scripts/test/schema` + CI `schema-ci.yml` | |
| **Étape 7** (2026-10-02) : 3 univers, 15 collections, 2 transverses, 4 pages marque, filtres/tri, fil d'Ariane, JSON-LD, sitemap (production), 404, `verify-catalog` — section ci-dessous | |
| **Étape 8** (2026-10-02) : 245 fiches `/{slug}/`, galerie, variantes réelles, prix au kg/L, disponibilité, commande WhatsApp, accordéons conditionnels, similaires, offres, JSON-LD Product/ProductGroup, sitemap avec `lastmod`, LAB des regroupements Mode, `verify-products` — section ci-dessous | Étape 9 : accueil final et blocs éditoriaux |
| **Étape 8B** (2026-10-03) : build à froid 21 min 39 s → 6 min 55 s (CI), préréglages d'images, mesure reproductible — section « Build et images » | |

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

**Commande.** Stratégie actuelle : lien WhatsApp prérempli (produit, option, prix, lien), paiement à la
réception. Aucun bouton panier ni paiement en ligne. Produit `coming_soon` / `out_of_stock` : simple lien
« Une question ? ». Livraison : texte de `config/commerce.ts` (Île-de-France), jamais le seuil de 50 €.

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
