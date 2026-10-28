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

| Élément           | Choix                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emplacement       | Sous-dossier autonome `site/` (son `package.json`, sa sortie `site/dist/`). L'ancien site, l'admin, les générateurs et leurs workflows restent à la racine, inchangés.                                                                                                                                                                                                                                                                                                |
| Framework         | Astro 7, sortie **statique** (aucun SSR à l'exécution), TypeScript `strictest`.                                                                                                                                                                                                                                                                                                                                                                                       |
| JavaScript client | Aucun framework. Petits `<script>` par composant (bundlés, dédupliqués par Astro) seulement là où il faut de l'interaction : menu mobile, méga-menu, panneaux, recherche, sélecteur de variantes. Header, footer, cartes : HTML statique.                                                                                                                                                                                                                             |
| CSS               | Variables CSS (`src/styles/tokens.css`) + base globale (`base.css`) + CSS scopé dans chaque composant. Pas de Tailwind ni de bibliothèque d'UI : aucun bénéfice pour ~40 composants, et du poids en plus.                                                                                                                                                                                                                                                             |
| Données           | Supabase **en lecture seule, au build** (`src/lib/supabase.ts`, `fetch` natif, colonnes listées explicitement). Traduction vers les types d'affichage dans `src/lib/catalog.ts`, seul fichier qui connaît le schéma. Depuis l'étape 6 : `status = published`, collection principale, `availability` (NULL = à arbitrer → repli sur `coming_soon`), `product_media`, options normalisées, arbre `collections`, `settings` publics. Schéma : `docs/SCHEMA_SUPABASE.md`. |
| Images            | `src/components/ui/CatalogPicture.astro`, point d'entrée unique : AVIF + WebP, `srcset`/`sizes`, dimensions déclarées, recadrage au ratio, chargement différé sauf l'image prioritaire (LCP). Cadres partagés dans `src/config/images.ts` (étape 8B). Images distantes autorisées : `dar-nur.fr` et le stockage public Supabase.                                                                                                                                      |
| Polices           | API Fonts d'Astro, fichiers locaux : Cormorant Garamond 500–600 (29 Ko) + Jost 400–500 (17 Ko), sous-ensemble FR + ū. Générés par `site/scripts/fonts/build-fonts.py` (sources épinglées), versionnés. Polices de repli aux métriques ajustées, préchargement. Aucun appel à Google Fonts.                                                                                                                                                                            |
| Icônes            | Lucide (contour, trait 1,5), inlinées au build depuis `lucide-static` ; jeu fermé dans `src/components/ui/icons.ts`. Logos de réseaux : Simple Icons (CC0), copiés.                                                                                                                                                                                                                                                                                                   |

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

| Commande                          | Rôle                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm ci`                          | Installation (Node ≥ 22.12)                                                               |
| `npm run dev`                     | Serveur de développement (http://localhost:4321)                                          |
| `npm run build`                   | Build statique dans `dist/`                                                               |
| `npm run preview`                 | Sert `dist/` localement                                                                   |
| `npm run check`                   | Types (`astro check`)                                                                     |
| `npm run format` / `format:check` | Prettier                                                                                  |
| `npm run verify`                  | Contrôles de sortie (après build)                                                         |
| `npm run verify:catalog`          | Contrôles de données des pages catalogue contre Supabase (après build, réseau)            |
| `npm run verify:products`         | Contrôles des fiches produit et du LAB contre Supabase (après build, réseau)              |
| `npm run verify:home`             | Contrôles de l'accueil contre Supabase (après build, réseau)                              |
| `npm run verify:orders`           | Contrôles du parcours de commande sur `dist/` (après build, sans réseau)                  |
| `npm run test:cart`               | Tests unitaires du panier local (Node, sans navigateur)                                   |
| `npm run lab:groupings`           | Rafraîchit l'instantané des regroupements Mode (lecture admin, CLI Supabase authentifiée) |
| `npm run ci`                      | Tout, dans l'ordre de la CI                                                               |

## Variables d'environnement

Copier `site/.env.example` en `site/.env` (ignoré par Git).

| Variable                            | Valeurs                                           | Rôle                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DAR_NUR_ENV`                       | `development` (défaut) · `preprod` · `production` | **Seule `production` autorise l'indexation.** Toute autre valeur : meta `noindex, nofollow`, `robots.txt` « Disallow: / », en-tête `X-Robots-Tag`.                                                                                                    |
| `SITE_URL`                          | URL absolue                                       | Canonical, Open Graph, JSON-LD, sitemap. **`https://dar-nur.fr` en préproduction Netlify et en CI** (URL définitives dès maintenant ; la préproduction reste noindex). À défaut : `DEPLOY_PRIME_URL` / `URL` (Netlify), puis `http://localhost:4321`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | URL du projet, clé `sb_publishable_…`             | Lecture publique sous RLS (valeurs déjà publiques sur l'ancien site). Toute autre clé est refusée par le code. Sans elles, le build passe et les pages l'indiquent.                                                                                   |

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

| Fait (étape 5)                                                                                                                                                                                                                                                                                                           | À venir                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Socle, tokens, polices, logo, header, méga-menu, menu mobile 2 niveaux, bandeau, recherche (visuelle), mini-panier (visuel), footer, réassurance, ProductCard, UniverseCard, CollectionCard, VariantSelector, guide des tailles (repli), primitives UI, pages `/demo/`, `/design-system/`, `/lab/supabase/`, Netlify, CI | Puis panier métier, recherche, SEO (301 depuis `redirects`), shooting photo, bascule.                                         |
| **Étape 6** (2026-10-02) : migration additive Supabase (9 migrations, `docs/SCHEMA_SUPABASE.md`), lecture du nouveau schéma dans `catalog.ts`, `/lab/supabase/` affiche l'arbre des collections, banc `scripts/test/schema` + CI `schema-ci.yml`                                                                         |                                                                                                                               |
| **Étape 7** (2026-10-02) : 3 univers, 15 collections, 2 transverses, 4 pages marque, filtres/tri, fil d'Ariane, JSON-LD, sitemap (production), 404, `verify-catalog` — section ci-dessous                                                                                                                                |                                                                                                                               |
| **Étape 8** (2026-10-02) : 245 fiches `/{slug}/`, galerie, variantes réelles, prix au kg/L, disponibilité, commande WhatsApp, accordéons conditionnels, similaires, offres, JSON-LD Product/ProductGroup, sitemap avec `lastmod`, LAB des regroupements Mode, `verify-products` — section ci-dessous                     |                                                                                                                               |
| **Étape 8B** (2026-10-03) : build à froid 21 min 39 s → 6 min 55 s (CI), préréglages d'images, mesure reproductible — section « Build et images »                                                                                                                                                                        |                                                                                                                               |
| **Étape 9** (2026-10-03) : accueil final `/`, configuration éditoriale, `verify-home` — section « Accueil (étape 9) »                                                                                                                                                                                                    |                                                                                                                               |
| **Étape 10** (2026-10-03) : panier, demande de commande, suivi, administration des commandes, tables et fonctions Supabase, `verify-orders`, `test:cart` — section « Commande, paiement, livraison (étape 10) »                                                                                                          | Paiement via Shopify (étape dédiée), CGV et confidentialité révisées (bloquant production), recherche, redirections, shooting |
| **Étape 11, phase 1** (2026-10-03) : e-mails transactionnels Brevo — outbox, Edge Functions, gabarits, bloc admin « Notifications », bancs hors ligne ; **rien de déployé** — section « E-mails transactionnels (étape 11) »                                                                                             | Phase 2 après configuration Brevo par le propriétaire                                                                         |
| **Étape 12** (2026-10-09) : pages internes `/cgv/`, `/confidentialite/`, `/mentions-legales/`, faits juridiques centralisés (`config/legal.ts`), liens repointés, `verify-legal` — section « Pages juridiques (étape 12) »                                                                                               | Informations obligatoires manquantes (SIREN/SIRET, médiateur, téléphones, suivi Brevo) : production fermée                    |
| **Étape 13** (2026-10-28) : synchronisation avec `main` (PR #41–#43), réparation du build (miel archivé sur l'accueil), préproduction mise à jour — section « Synchronisation (étape 13) »                                                                                                                               | Raccordement des achats à Shopify (mission dédiée)                                                                            |
| **Étape 14** (2026-10-28) : préparation technique du raccordement Shopify, modes, correspondance et liens purs, scripts de lecture et tests hors ligne — section « Raccordement Shopify (étape 14) »                                                                                                                     | Générer les données actuelles, résoudre les anomalies, brancher l'interface puis approuver explicitement la production        |
| **Étape 15** (2026-10-28) : interface des modes legacy / shopify / disabled, modèle commercial pur, scripts sélectionnés au build, tests fictifs et rendu Container — section « Interface commerciale (étape 15) »                                                                                                       | Builds, comparaison HTML legacy et captures à exécuter ; activation Shopify toujours bloquée                                  |

## Pages catalogue (étape 7)

**Routes.** Une seule route, `src/pages/[...path].astro`, génère toutes les pages depuis `collections.path`
(jamais recalculé) : univers → `UniverseTemplate`, collection / sous-collection / transverse / marque →
`CollectionTemplate`. Marque de parfum : `{chemin de Parfums}{brands.id}/`, générée seulement si elle a au
moins un parfum publié. Toute autre adresse → `404.html` (statut 404, aucune redirection).

**Données** (`src/lib/catalog-store.ts`, 5 requêtes par build, mémoïsées) :

| Règle               | Source                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Classement          | `collections` + `product_collections`. `category_id` n'est jamais lu. Une page contient les produits rattachés (principale **ou** secondaire) à la collection **et à ses descendantes** (`/miels/` = Miels + Miels gourmands ; `/mode-homme/` = qamis, sandales, accessoires). |
| Ordre « Sélection » | Ordre de l'arbre de la collection principale (la collection avant ses sous-collections), puis `sort_order`, puis slug.                                                                                                                                                         |
| Produits            | `status = published` filtré explicitement (pas seulement par la RLS). Le build échoue si un produit n'a pas exactement une principale publiée.                                                                                                                                 |
| Disponibilité       | `availability` ; NULL → repli sur `coming_soon` (jamais converti en `available`).                                                                                                                                                                                              |
| Images              | `product_media` (hors images de variante), sinon `images[]`. Les 3 premières de chaque produit sont vérifiées (HEAD) : une image inaccessible est écartée et signalée, le produit passe à la suivante ou au repli « Photo à venir ».                                           |
| Prix                | « À partir de X € » seulement si plusieurs prix **différents** existent parmi les variantes actives.                                                                                                                                                                           |
| Badges              | Bientôt disponible · Épuisé · **Offre** (produit d'une offre `product_promo` active, dans sa fenêtre de dates). « Nouveau » non calculé (§G.2 à confirmer).                                                                                                                    |
| Offres (`/offres/`) | Offres actives + produits de la collection Offres & packs. Prix barré **uniquement s'il est prouvé** : promotion produit dont le prix de référence est le prix fixe réel de chaque produit. Aucune économie pour les packs (formats inclus non renseignés).                    |
| Marques             | Indexable si ≥ `settings.brand_min_models_indexable` (4) parfums publiés **et** `brands.description` renseignée.                                                                                                                                                               |
| Intro               | `collections.description`, sinon `seo_description` (validée à l'étape 3). Aucun champ « contenu long » en base : rien après la grille hormis le maillage.                                                                                                                      |

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
`/{slug}/` (décision figée : changer de collection ne change pas l'URL). Un brouillon n'a pas de page → 404. Le build échoue si deux pages visent la même URL ou si un produit occupe `/demo/`, `/lab/`… Les slugs
actuels sont conservés (Khamrah reste à son URL longue ; `/khamrah/` n'existe pas).

**Gabarit unique** `src/components/templates/ProductTemplate.astro` + `components/product/ProductGallery.astro`
et `ProductPurchase.astro`. Le modèle de vue `src/lib/product-page.ts` décide des sections ; les règles par
famille (bien-être / parfum / mode) sont dans `src/config/product-pages.ts`. Mobile : fil d'Ariane compact ·
galerie · marque · H1 · faits · prix · variantes · disponibilité · commande · livraison · accordéons · même
collection · offres. Desktop : 7/12 galerie (rail de miniatures), 5/12 informations, **aucune colonne
collante**.

**Sources et replis** (nouveau schéma d'abord ; ancien champ seulement s'il est vide) :

| Donnée                | Source                                                                 | Repli                                                                            |
| --------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Galerie               | `product_media` sans variante (ordre `sort_order`)                     | `images[]` (aucun cas aujourd'hui) ; aucune image → « Photo à venir »            |
| Médias de variante    | `product_media.variant_id`                                             | format sans photo → photo du format précédent (repli 300 g → 200 g validé, §M.2) |
| Options               | `product_variant_options` → `option_values`                            | `options` jsonb, puis nom de variante (aucun cas : 115/115 normalisées)          |
| Prix au kg / L        | `option_values.numeric_value` + `unit`, ou `net_quantity` + `net_unit` | aucun (« 100 », « 200 » sans unité → rien)                                       |
| Composition / origine | `product_food_details` / `product_apparel_details` (vides)             | `products.composition` / `products.provenance`                                   |
| Disponibilité         | `availability`                                                         | NULL → `coming_soon` (jamais `available`)                                        |
| Title                 | `seo_title` (vide partout)                                             | `{Nom} – {concentration} {marque}` (parfums, vocabulaire fermé) ; nom seul sinon |
| Meta                  | `seo_description` (vide partout)                                       | accroche + début de la description ; jamais prix / livraison / WhatsApp          |
| Alt                   | `alt_text` (vide partout)                                              | nom du produit (+ « – 200 g » pour une image de variante)                        |
| `lastmod`             | max(`products.updated_at`, `product_variants.updated_at`)              | — (`product_media.updated_at` = date du remplissage de l'étape 6, ignorée)       |

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

| Mesure                                                     | Effet                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AVIF `effort: 3` (`astro.config.mjs`, `sharpImageService`) | Encodage 3,6–3,8× plus rapide, poids +1 à +3 %, SSIM −0,001, aucune différence visible agrandie ×2 (banc de 24 vraies sources). Qualités par défaut conservées : AVIF 50, WebP 80. Effort 2 écarté (+10 % de poids).                    |
| Préréglages partagés `src/config/images.ts`                | `GALLERY` 1200×1500 `inside` [480, 800, 1200] · `PRODUCT_CARD` 600×750 [200, 400, 600] · `THUMBNAIL` 128×160 [64, 128] · `COLLECTION_CARD`, `UNIVERSE_CARD`, `OFFER_CARD`, `HERO`. Une même photo dans un même cadre = un seul fichier. |
| Miniature unique                                           | Rail de galerie (64 px), sélecteur de couleur (48 px), recherche (48 px) et LAB (96 px) utilisent `THUMBNAIL` : le LAB n'a presque plus de fichiers propres (814 → 250).                                                                |
| Rail de miniatures seulement à partir de 2 images          | Le rail était masqué mais rendu (4 fichiers par photo) sur 78 % des fiches.                                                                                                                                                             |

Largeurs conservées : la galerie sert 1200 px aux mobiles DPR 2–3 (430 × 2,6) et aux portables Retina ; les
cartes 600 px au DPR 2 desktop (302 px). AVIF conservé partout (−45 % de poids par rapport au WebP).

**Temps mesurés** (`node scripts/measure-build.mjs --cold | --warm` depuis `site/` : `--cold` supprime
`dist/`, `node_modules/.astro` et `node_modules/.vite`, ce qu'efface `npm ci`) :

|                                                              | Avant           | Après           |
| ------------------------------------------------------------ | --------------- | --------------- |
| CI à froid, 4 vCPU (étape « Build statique »)                | 21 min 39 s     | **6 min 55 s**  |
| CI à froid, job complet (install, types, build, 3 contrôles) | 22 min 18 s     | **7 min 34 s**  |
| Local à froid (12 threads)                                   | 12 min 39 s     | 4 min 24 s      |
| Local à chaud (cache valide)                                 | 23 s            | 16 s            |
| Fichiers image                                               | 6 461           | 5 141           |
| CPU AVIF / WebP (CI)                                         | 4 780 s / 359 s | 1 275 s / 331 s |

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

| Texte                                  | Avant                                                                  | Après                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Bandeau (toutes pages)                 | Paiement à la réception · Livraison en Île-de-France                   | Commande et conseil sur WhatsApp                                                                                                 |
| Réassurance (toutes pages)             | 4 faits : commande / paiement à la réception / livraison IDF / conseil | 2 faits : Commande sur WhatsApp (depuis la fiche, message prérempli) · Conseil personnalisé ; colonnes desktop = nombre de faits |
| Meta de l'accueil                      | … paiement à la réception.                                             | … Commande et conseil sur WhatsApp.                                                                                              |
| Fiche : ligne livraison                | Livraison en Île-de-France · paiement à la réception                   | Livraison et paiement : modalités confirmées sur WhatsApp                                                                        |
| Fiche : note sous le bouton            | … vous payez à la réception.                                           | La commande se fait sur WhatsApp : rien n'est à payer sur le site.                                                               |
| Fiche : accordéon Livraison & paiement | paiement à la réception, remise gratuite Chelles / Lognes              | Commande sur WhatsApp · Modalités confirmées sur WhatsApp · lien CGV                                                             |
| Message WhatsApp prérempli             | « Paiement à la réception : Revolut / Espèces »                        | ligne retirée                                                                                                                    |

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
paiement. 6. Il paie. 7. Dar Nūr confirme le paiement. 8. Expédition, **jamais avant le paiement confirmé**. 9. Le client voit le suivi. Aucun tarif, délai, seuil de gratuité ni pays « desservi » n'est annoncé.

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

| Élément        | Fichiers                                                                                                        | Points clés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panier         | `scripts/cart-store.ts`, `cart-view.ts`, `cart-sync.ts`, `components/cart/MiniCart.astro`, `pages/panier.astro` | `localStorage` (`dn-cart-v1`) : produit, variante, libellé d'option, prix affiché (centimes), image, lien, quantité 1–99, 30 lignes. Lecture défensive (prix, UUID, liens `javascript:`, images `http:` écartés). Rendu DOM sans HTML interprété. Revérification `check_cart` au chargement : prix changé → mis à jour ET signalé ; article indisponible → signalé, envoi bloqué. Pas de compte.                                                                                                                                                                                                                                                                                                                     |
| Fiche          | `components/product/ProductPurchase.astro`, `lib/product-page.ts` (`cartOf`)                                    | « Ajouter au panier » si `available` / `on_demand` et prix ; option obligatoire (message + focus). `on_demand` : « disponibilité confirmée après votre demande ». `coming_soon` / `out_of_stock` : aucun ajout. WhatsApp = lien secondaire « Une question ? » (produit seul). Vignette WebP 128 × 160 générée au build (+100 fichiers ≈ 2 Ko).                                                                                                                                                                                                                                                                                                                                                                       |
| Offres         | `lib/catalog-store.ts` (`provenPromos`), SQL `resolve_lines`                                                    | Promotion produit **prouvée** (offre `product_promo` en cours, produit sans variante, prix réel = prix de référence) : appliquée à la fiche (prix barré), au panier ET par le serveur — Nissah 59,99 € → 40 €. Les packs (table `offers`) ne sont pas commandables en ligne. Aucune économie douteuse réintroduite.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Demande        | `pages/commande.astro`                                                                                          | Récapitulatif, Coordonnées (prénom, nom, e-mail, téléphone international), Livraison (pays ISO 3166-1 alpha-2, France en tête, noms par `Intl.DisplayNames` ; adresse 1/2, code postal obligatoire à 5 chiffres pour la France seulement, ville, région, instructions), explication du parcours, CGV, pot de miel. CTA « Envoyer ma demande de commande ». Validation navigateur = serveur ; erreurs reliées aux champs + résumé focalisé ; saisie jamais vidée. Clé d'idempotence par envoi. Panier vidé seulement après la réponse `ok`. Confirmation : numéro `DN-AAAA-XXXXXX`, articles, « Commande reçue », prochaine étape, lien de suivi (mémorisé sur l'appareil), WhatsApp avec le seul numéro de commande. |
| Suivi          | `pages/suivi.astro`                                                                                             | `/suivi/#<jeton>` : jeton de 256 bits dans le **fragment** (jamais envoyé au serveur web ni dans le Referer). Frise Commande reçue → Vérification → Paiement demandé → Paiement reçu → Expédiée. Total montré seulement une fois confirmé. « Payer ma commande » seulement si une vraie URL `https://` existe, sinon « Les instructions de paiement vous seront transmises par Dar Nūr. » ; « paiement en cours de vérification » si déjà réglé. Transporteur et suivi une fois expédiée. Jamais d'adresse, d'e-mail, de téléphone, de note ou de référence interne.                                                                                                                                                 |
| Administration | `pages/admin/commandes.astro`                                                                                   | Connexion par le compte admin existant (Supabase Auth, session `sessionStorage`). Liste filtrée (environnement, statut), détail (client, adresse, lignes, journal), disponibilités par ligne, livraison (montant, transporteur, service, délai indicatif), remise motivée, demande de paiement (prestataire, URL, référence), confirmation manuelle du paiement, préparation, suivi (transporteur, numéro, URL), expédition, livraison, annulation motivée (remboursement dû si payée), remboursement marqué, note interne, notifications « client à prévenir » (copier le lien de suivi, préparer un e-mail). Chaque action envoie le statut affiché (concurrence).                                                 |

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
> **Validé par le propriétaire (2026-10-06)** : rendu correct dans Outlook ; « Suivre ma commande » depuis
> l'e-mail reçu via Brevo ouvre la préproduction avec le `#jeton` intact (le suivi des clics Brevo ne le
> supprime pas), DN-2026-GA58EZ reconnue, statut « Expédiée », transporteur et numéro de test affichés.
> **Webhook Brevo (2026-10-06)** : migration `20261006100000_etape11_03_delivery_events.sql` appliquée
> (sauvegarde `C:\Users\youcef\dar-nur-backups\etape11-03-supabase-2026-10-06\`) — journal
> `orders_private.email_delivery_events` + dédoublonnage ; `BREVO_WEBHOOK_TOKEN` (32 caractères
> alphanumériques, généré et déposé sans affichage, remis au propriétaire par le presse-papiers, aucune copie
> conservée) ; webhook « Dar-Nur-Emails-transactionnels » créé par le propriétaire (type transactionnel,
> authentification **Token** = `Authorization: Bearer`, événements Délivré, Différé, Soft/Hard bounce, Invalid,
> Bloqué, Plainte, Erreur). Premier essai refusé (401) : Brevo envoyait bien `Bearer`, mais une valeur
> différente du secret (le premier jeton, 48 caractères avec `-`/`_`, n'avait pas été correctement transmis via
> le presse-papiers) → jeton régénéré, presse-papiers vérifié par empreinte dans un processus séparé.
> Vérifié en réel : commande de test **DN-2026-VBBHLT** → « Commande reçue » envoyé → événement `delivered`
> reçu ~30 s après, authentifié, rapproché, `delivery_status = delivered` (affiché « remis ») ; rejeu
> identique ×2 → `duplicate`, rien modifié ; commandes jamais modifiées (`updated_at = created_at`) ; requêtes
> sans jeton / faux jeton / faux Basic → 401 ; invariants 14/14 + 14/14. L'événement de DN-2026-LB2P84
> (refusé avant la correction) n'a pas été renvoyé par Brevo : remise inconnue pour cet e-mail.
> **Fin de l'étape 11B** : `sending_enabled = false` (envoi des commandes de test recoupé), production coupée,
> `ORDER_EMAILS_ALLOW_PRODUCTION` non défini. Rebonds réels non provoqués (testés hors ligne). Paiement : inchangé.
> **Nettoyage (2026-10-06)** : les 3 commandes de test de l'étape 11B (DN-2026-GA58EZ, -LB2P84, -VBBHLT, seules
> commandes en base, toutes `is_test`) purgées par `supabase/maintenance/20261006_etape11_purger_commandes_test.sql`
> (testé dans `emails.mjs` ; sauvegarde `C:\Users\youcef\dar-nur-backups\etape11-purge-tests-2026-10-06\`) :
> commandes, lignes, journal, outbox et l'événement Brevo lié. Base sans commande ; invariants 14/14 + 14/14.

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
destinataire ou un contenu. Brevo ne signe pas ses webhooks (pas de HMAC) : jeton (`Authorization: Bearer`,
option « Token » de Brevo ; `Basic` avec le jeton en mot de passe également accepté) comparé à temps constant,
validation stricte ; un refus est journalisé avec un diagnostic sans secret (schéma, longueurs, jeton tronqué,
caractères en plus, espaces, guillemets). Chaque événement authentifié est journalisé une fois
(`email_delivery_events`, sans adresse ni objet, 90 jours) ; un renvoi identique est ignoré. Le webhook ne
modifie qu'une colonne d'information.

**Gabarits** (`supabase/functions/_shared/order-emails/templates.ts`) : HTML généré et versionné (aucun
`templateId` Brevo : un changement manuel dans Brevo ne peut rien casser), version texte équivalente,
tableaux + styles en ligne, 600 px, bouton ≥ 44 px, logo en texte (aucune image), sans police web ni
JavaScript, vert #2C4A23, fond crème, filet doré. Aperçus : `node scripts/test/schema/email-templates.mjs
--preview <dossier>`.

**Administration** (`/admin/commandes/`) : bloc « Notifications » (statut de chaque e-mail, prochaine
tentative, erreur lisible, « Réessayer » sur la même ligne), alerte « Adresse e-mail en erreur » et badge
dans la liste. Base sans migration 11 : bloc neutre « non installés ».

**Tests.** `scripts/test/schema/email-templates.mjs` (118 : 4 types, montants, livraison 0, international,
avec/sans suivi, accents, échappement, client Brevo simulé, configuration, authentification, webhook) ;
`scripts/test/schema/emails.mjs` (131 : le vrai worker contre PGlite + vraies migrations + faux Brevo —
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
7. (Fait le 2026-10-06) Webhook transactionnel Brevo vers
   `https://sxlpgcnjerlayitaxxyv.supabase.co/functions/v1/order-emails-webhook`, authentification « Token »,
   même valeur que le secret `BREVO_WEBHOOK_TOKEN` ; événements de remise seulement (pas Envoyé, Ouvert, Cliqué,
   Désinscrit, proxy). Rotation : générer un jeton alphanumérique, le déposer en secret, le remplacer dans Brevo.

**Ensuite (session de développement)** : sauvegarde, application des 2 migrations, contrôles
`etape10_invariants.sql` + `etape11_invariants.sql`, jeton du worker généré et déposé dans Vault
(`order_emails_worker_secret`) et en secret `ORDER_EMAILS_WORKER_SECRET` sans affichage, déploiement
`npx supabase functions deploy order-emails --no-verify-jwt` (idem `order-emails-webhook`), configuration
`email_config` (adresse de test, URL de préproduction, `worker_url`, puis `sending_enabled`), une commande
de test vers l'adresse validée seulement, vérification du rendu, de l'idempotence et du lien de suivi.

## Pages juridiques (étape 12)

Pages internes de la refonte (l'ancien dar-nur.fr n'est pas modifié ; ses `*.html` et leurs redirections
relèvent de la bascule) :

| Page                 | Fichier                        | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/cgv/`              | `pages/cgv.astro`              | Parcours réel : demande sans obligation de payer → vérification → total final → demande de paiement (48 h) → contrat conclu au paiement → expédition sous 3 à 5 jours ; France + international sans pays ni tarif ; douanes ; rétractation 14 jours (frais de retour client, sauf erreur/défaut/non-conformité ; exceptions L. 221-28 seulement si réellement applicables, signalées avant paiement) ; encadré officiel des garanties (annexe D. 211-2, JO du 30 juin 2022, **ne pas reformuler**) ; médiation ; formulaire de rétractation |
| `/confidentialite/`  | `pages/confidentialite.astro`  | Uniquement les traitements réels : commande (téléphone obligatoire), statuts de remise Brevo (ouvertures/clics jamais enregistrés), empreinte d'IP 48 h, `localStorage` (panier, 10 dernières commandes), lien de suivi ; Supabase (Paris), Brevo (Paris), Netlify (États-Unis, DPF + CCT) ; fidélité future non active ; 3 ans / jusqu'à 10 ans ; droits, CNIL                                                                                                                                                                             |
| `/mentions-legales/` | `pages/mentions-legales.astro` | Éditeur (EI, micro-entreprise), adresse, e-mail, téléphone professionnel, SIREN/SIRET, immatriculation RNE (2 octobre 2026), TVA 293 B, directeur de la publication, hébergeur Netlify (téléphone en attente)                                                                                                                                                                                                                                                                                                                               |

- **Source unique** : `site/src/config/legal.ts`. Toute information inconnue vaut `null` et s'affiche
  « information en attente » ; `legalBlockers()` liste ce qui manque.
- **Garde-fous** : tant que `legalBlockers()` n'est pas vide → bandeau « Document non finalisé » sur les
  3 pages, bandeau de blocage sur `/commande/` (préproduction), `orderingOpen` faux en production
  (`productionOrderingReady` = `termsReviewed` **et** aucun blocage), et `verify-legal` refuse un build de
  production. `termsReviewed`, `production_ordering_open`, `terms_version` (`cgv-dar-nur-fr-ancienne-version-a-reviser`)
  et l'envoi d'e-mails ne sont **pas modifiés**.
- **`verify-legal`** (CI) : anciennes mentions interdites sur toutes les pages publiques (commande/WhatsApp
  obligatoire, paiement à la réception, espèces, Revolut, Île-de-France, Lognes, « Chelles » hors adresse
  légale, GitHub Pages, adresse Outlook, liens `dar-nur.fr/*.html` légaux), contenus obligatoires, aucun
  prestataire de paiement nommé, aucun numéro de téléphone autre que le numéro professionnel officiel (lien
  `tel:`), jamais « WhatsApp uniquement », aucune conservation indéfinie, graphie « Dar Nûr » dans le texte
  juridique, footer et liens « Conditions générales de vente » internes.
- **Graphie** : « Dar Nûr » dans les pages juridiques et les informations officielles ; « Dar Nūr » pour le
  branding (logo, en-tête, footer, titres), inchangé.
- **Résolus (2026-10-09)** : SIREN 130 776 743 / SIRET 130 776 743 00010, RNE depuis le 2 octobre 2026
  (document officiel) ; téléphone professionnel 07 69 25 33 75 (principalement WhatsApp, appelable) ;
  graphie ; conservation des demandes non abouties (3 ans après la dernière) ; textes vérifiés sur Légifrance :
  encadré D. 211-2 (version du 1er octobre 2022) et formulaire R. 221-1 (version du 28 mai 2022) inchangés.
- **Brevo (correction)** : le suivi se règle en libre-service en mode anonyme — Paramètres → Automatisations →
  Emails transactionnels → Suivi → « Suivi anonyme des emails » = Oui (réglage manuel de l'exploitant ;
  `brevoAnonymousTrackingConfirmed` passe à `true` seulement une fois constaté). Brevo propose aussi un
  consentement au suivi par contact (non utilisé). Le webhook de délivrabilité n'est pas concerné.
- **Blocages restants** : médiateur de la consommation ; téléphone de l'hébergeur (aucun numéro public
  officiel Netlify identifié, en attente) ; suivi anonyme Brevo à activer et constater ; **fonctionnalité de
  rétractation en ligne** « renoncer au contrat ici » (art. L. 221-21 en vigueur depuis le 19 juin 2026,
  ordonnance n° 2026-2, décret n° 2026-3 : obligatoire pour les contrats conclus via une interface en ligne,
  absente du site, à développer dans une étape dédiée, avec accusé de réception sur support durable et mention
  dans les CGV) ; finalisation de la version juridique. À la finalisation : `legalVersion.final`, nouvel
  identifiant de version, puis `orders_private.config.terms_version` (sauvegarde préalable).
- **Activité déclarée** : l'intitulé déclaré ne cite pas explicitement les vêtements (univers Mode) ni les
  soins. Ces produits **restent** au catalogue et dans les pages juridiques. L'intitulé sera vérifié au RNE
  (SIREN/SIRET reçus le 2026-10-09) ; si nécessaire, adjonction d'activité via le Guichet unique (décision de
  l'exploitant du 2026-10-09).

## Synchronisation (étape 13)

Branche `refonte/etape-13-synchronisation`, créée depuis `refonte/etape-12-juridique` (`285de08`).

- **Fusion de `origin/main`** (`6f01d3f`, sans conflit) : `main` ne modifie que l'ancien site à la racine
  (`index.html`, `js/cart.js`, fiches générées, `scripts/generate-product-pages.mjs`,
  `scripts/product-redirects.json`, `_config.yml`) et la refonte ne touche que `site/`, `docs/`, `supabase/`,
  `.github/`, `scripts/test/` : ensembles disjoints, `site/` inchangé par la fusion, racine identique à `main`.
  La refonte n'a pas d'équivalent à porter pour PR #42 (catalogue de secours : Astro lit Supabase au build,
  produits `published` seulement) ni PR #43 (GitHub Pages). Les deux redirections Hibiscus de PR #41
  (`/miel-hibiscus-zamzam/`, `/dn-miel-nigelle-hibiscus/` → `/miel-hibiscus-nigelle/`) ne sont **pas**
  actives côté Astro : elles relèvent de la migration SEO (`_redirects`), et la cible n'est pas publiée à ce jour.
- **Build réparé** : `miel-lavande` (archivé le 2026-10-11) était l'image de l'univers Miels & Herboristerie
  dans `config/home.ts` → `npm run build` échouait. Remplacé par `miel-printemps` (seule vraie photo publiée
  de l'univers ; même visuel que le bloc Miels, à remplacer).
- **CI locale** (`DAR_NUR_ENV=preprod`, `SITE_URL=https://dar-nur.fr`, comme Netlify) : `npm run ci` vert ;
  235 fiches pour 235 produits publiés. Avertissement : `dn-lecode-blue-addict` (« À découvrir ») est
  `coming_soon`.
- **Préproduction** : site Netlify `wondrous-rolypoly-c99592` (id `14b3108c-…`, aucun domaine personnalisé
  ni alias, aucune variable dans l'interface : tout vient de `site/netlify.toml`). Depuis le 2026-10-28, sa
  branche de production **et** sa seule branche autorisée sont `refonte/etape-13-synchronisation` (avant :
  `refonte/etape-11-paiement-emails`). Premier build Git de cette branche : déploiement
  `6ae1b624c814c151400233e8` (commit `2529385`). Un commit qui ne touche pas `site/` n'est pas reconstruit
  (« Canceled build due to no content change » : normal, pas une panne).
- **Retour arrière** : Netlify → Deploys → republier un déploiement antérieur (`6ae1b1bcdfba655efa16f7cd` :
  même contenu, envoyé par la CLI ; `6ac4c05e6037fabece39779c` : étape 11) ; pour la branche, Site
  configuration → Build & deploy → Branches → remettre `refonte/etape-11-paiement-emails`.

## Raccordement Shopify (étape 14)

**Périmètre.** Préparation technique uniquement : Astro reste en `legacy`, avec son panier et sa demande
de commande de l'étape 10. Aucun composant, page, script de commande, RPC ou migration Supabase n'est
modifié. Aucun raccordement visible ni paiement n'est activé. Les fichiers du dépôt Shopify voisin
sont périmés : seule leur forme et leur logique d'import ont servi de référence ; aucune donnée réelle
ni aucun identifiant n'en est repris.

**Données générées le 2026-10-28** (`site/src/data/shopify/`, scripts ci-dessous) : instantané public
Shopify de 240 produits / 302 variantes ; 235 produits Supabase publiés ; **228 produits rapprochés
(290 variantes), 0 écart de prix, 0 variante orpheline ou ambiguë, 0 exclu**. 7 anomalies bloquantes
`supabase-only`, toutes des **brouillons Shopify** (contrôle Admin en lecture) : 6 produits à 0,00 €
(`chantilly-karite-moninga`, `chantilly-karite-nila`, `gommage-hibiscus-nigelle`, `gommage-khamare-citron`,
`gommage-louban`, `gommage-louban-lavande`) et `miel-myrtille` (mention de test). 12 avertissements
`shopify-only` : produits venus de SumUp, absents de Supabase (dont les 2 « La Rose Bleue Massimo »).
Échantillon de variantes contrôlé dans l'Admin Shopify : produit, option et prix identiques.

**Architecture et modes.** `src/lib/commerce/mode.ts` centralise `CommerceMode`, la valeur explicitement
configurée `legacy`, la constante `shopifyProductionApproved = false`, le domaine unique de la boutique
et les décisions pures `isLegacyCartEnabled`, `isOrderSubmissionEnabled`, `purchaseActionFor`.
`DAR_NUR_COMMERCE_MODE` remplace la valeur configurée ; seules les valeurs exactes `legacy`, `shopify`,
`disabled` sont acceptées (une chaîne vide est une erreur). Le schéma Astro valide la variable et
`config/commerce.ts` expose le mode résolu avec l'environnement `DAR_NUR_ENV` de `config/site.ts`.
Le hook `astro:build:start` applique aussi le même garde-fou avant génération des pages.

| Mode       | Décision panier Astro | Décision demande Astro                                                     | Décision achat future |
| ---------- | --------------------- | -------------------------------------------------------------------------- | --------------------- |
| `legacy`   | Autorisée             | Autorisée hors production ; en production, exigences juridiques existantes | Panier actuel         |
| `shopify`  | Désactivée            | Désactivée                                                                 | Lien Shopify validé   |
| `disabled` | Désactivée            | Désactivée                                                                 | Aucun achat           |

Ces décisions sont préparées, **pas encore branchées à l'interface** : changer le mode ne constitue
donc pas une bascule commerciale à cette étape. Tout build `shopify` exige une table générée, non vide,
structurellement valide et sans anomalie bloquante. En `DAR_NUR_ENV=production`, il exige en plus
l'approbation versionnée explicite ; une variable d'environnement ne peut pas approuver la production.

**Acquisition en lecture seule.** `scripts/shopify/fetch-shopify-catalog.mjs` parcourt les GET publics
`https://shop.dar-nur.fr/products.json?limit=250&page=N` jusqu'à une page vide. Il conserve les seuls
ID numériques positifs sûrs fournis par Shopify, handles, titres et variantes (options, prix chaîne,
disponibilité booléenne), puis trie produits par handle/ID et variantes par ID. Les doublons d'ID,
réponses invalides et paginations répétées provoquent une erreur avant écriture de l'instantané.
`scripts/shopify/build-product-map.mjs` lit PostgREST avec `SUPABASE_URL` et `SUPABASE_ANON_KEY`
(préfixe `sb_publishable_` obligatoire comme dans `lib/supabase.ts`, toute autre clé refusée).
Colonnes explicitement listées, GET uniquement, filtre `status=published`, pagination jusqu'à une page
vide. Les variantes inactives sont lues uniquement pour distinguer un produit sans variantes d'un
produit dont toutes les variantes sont inactives ; seules les actives sont rapprochées. Aucune donnée
client, clé privée, écriture Supabase ou authentification Shopify n'est nécessaire.

**Correspondance et validation.** `src/lib/commerce/product-map.ts` est pur et importable par Astro
ou Node avec `--experimental-strip-types`. La table contient la projection publique source Supabase,
les dates de génération/instantané, les entrées produit (statuts de publication et présence publique,
exclusion, statut de correspondance), variantes et anomalies. Le rapport Markdown rend les anomalies
lisibles. Les règles sont les suivantes :

- Produit : égalité **exacte** slug Supabase = handle Shopify ; aucun rapprochement par titre ou prix,
  aucune table de remplacement manuelle. Un handle différent reste à résoudre dans les données.
- Variantes : axes `variant_axes`, sinon clés des options historiques comme dans l'import ; valeurs
  jsonb, sinon libellés normalisés `product_variant_options` (alias `format` → `contenance`). La fonction
  `norm` de l'import est reprise : minuscules, NFD, suppression des diacritiques U+0300–U+036F,
  caractères hors a–z/0–9 remplacés par des espaces, trim. La comparaison porte sur le tuple des valeurs
  d'options dans l'ordre des axes, jamais sur la position de la variante, son titre ou son prix.
- Produit Supabase sans variante : exige exactement une variante Shopify. Un produit dont toutes les
  variantes sont inactives n'utilise pas cette règle. Options manquantes ou plusieurs candidats : aucun
  choix, ID de correspondance nul, anomalie bloquante.
- Bloquants : produit Supabase sans Shopify public, plusieurs produits pour le même slug/handle,
  variantes orphelines de chaque côté, ambiguïté, absence de variante active/Shopify, prix absent,
  non positif ou différent au centime, référence exclue présente dans une source.
- Exclusions permanentes : `miel-blanc-kirghizistan`, `miel-rose-siberie`, `miel-fraise-russie`,
  `miel-lavande`, `miel-shilajit`. Les cinq titres exacts de l'import sont également refusés côté Shopify
  pour détecter un éventuel handle renommé. Aucun lien n'est produit pour ces références.
- Avertissements : produit Shopify sans Supabase publié (origine inconnue : SumUp, brouillon ou archive
  possibles), disponibilité divergente. `available` et `on_demand` sont commandables côté Supabase,
  `null`, `coming_soon`, `out_of_stock` ne le sont pas. Un lien exige la disponibilité des deux sources.

`scripts/verify-shopify-map.mjs` relit uniquement les fichiers versionnés. Il recalcule les entrées et
anomalies depuis la projection Supabase et l'instantané Shopify : ID inventé, rattaché au mauvais
produit, UUID à la place d'un ID Shopify, doublon d'ID, entrée omise/dupliquée ou métadonnées divergentes
sont des erreurs structurelles (code 1 dans tous les modes). En `legacy` et `disabled`, les anomalies
métier sont rapportées avec code 0, y compris les structures vides d'attente. `--strict` et le mode
`shopify` retournent 1 pour toute anomalie bloquante. Cette validation vérifie la cohérence des fichiers,
pas la fraîcheur ni la véracité d'une source modifiée conjointement avec la table.

**Liens d'achat préparés.** `src/lib/commerce/purchase.ts` expose `shopifyPurchaseLink` : résultat typé
`ok/url` ou `ok: false/reason`. Il exige le mode Shopify et revalide la table contre l'instantané.
Sans variante Supabase : `/products/<handle>`. Avec variante Supabase sélectionnée :
`/products/<handle>?variant=<ID Shopify>`. Le paramètre facultatif de quantité produit
`/cart/<ID Shopify>:<quantité>` (entier 1–99, aucune correction silencieuse). Aucun ID Shopify n'est
accepté en entrée utilisateur ou calculé depuis un UUID ; une variante Supabase doit être résolue dans
la table. Produit absent, variante requise/non rapprochée, exclusion, incohérence ou indisponibilité :
aucune URL d'achat.

**Commandes (depuis `site/`, Node ≥ 22.12).** Les scripts réseau ne chargent aucun fichier `.env` ;
fournir les variables dans le processus avec les valeurs publiques réelles :

```powershell
$env:SUPABASE_URL = 'https://<projet>.supabase.co'
$env:SUPABASE_ANON_KEY = 'sb_publishable_<cle-publique>'
node --experimental-strip-types scripts/shopify/fetch-shopify-catalog.mjs
node --experimental-strip-types scripts/shopify/build-product-map.mjs
npx prettier --write src/data/shopify/shopify-catalog.json src/data/shopify/product-map.json src/data/shopify/product-map-report.md
npm run verify:shopify-map
npm run verify:shopify-map -- --strict
npm run test:commerce
```

Les tests commerce sont hors ligne, avec des données explicitement fictives ; ils couvrent les
correspondances, refus et URLs, les trois modes et le garde-fou de production. Ils exécutent aussi le
vérificateur sur les fichiers versionnés en legacy/strict/shopify. La CI inclut `test:commerce` après
`test:cart` et `verify:shopify-map` à la fin. Les scripts réseau ne sont jamais exécutés par la CI.

**Avant activation.** Générer les deux fichiers actuels, lire le rapport et résoudre tous les blocages ;
examiner aussi les avertissements et les produits uniquement Shopify. Tester les liens réels, stocks,
prix, taxes, livraison et parcours Shopify. Brancher ensuite les décisions centralisées dans
`ProductPurchase.astro` (sélecteur et lien), `MiniCart.astro`, Header et Footer (accès panier),
`panier.astro`, `commande.astro` et `components/order/ApiConfig.astro` (affichage et autorisation
d'envoi), ainsi que les points d'entrée des scripts panier/commande ; adapter les textes commerciaux.
Préserver le suivi des anciennes commandes et fermer explicitement la soumission côté serveur dans une
mission dédiée avant bascule (une fonction pure côté Astro ne ferme pas une RPC). Valider en
préproduction avant toute approbation versionnée et configuration de production.

**Limites et retour arrière.** Le catalogue public ignore les brouillons Shopify, ne fournit ni
l'historique ni les statuts privés, et les disponibilités peuvent évoluer après l'instantané. Aucun
webhook ni synchronisation continue ; le paiement et le stock définitifs restent du ressort de Shopify :
régénérer l'instantané et la table avant toute activation. Vérifié le 2026-10-28 : `npm run ci` vert
(preprod) ; HTML du build identique à l'étape 13 (288/289 fichiers octet pour octet, seul l'horodatage
de `/lab/supabase/` diffère) ; builds `shopify`+`production`, `shopify`+`preprod` et mode invalide
refusés par le hook avant génération. À cette étape, revenir à `DAR_NUR_COMMERCE_MODE=legacy` (ou retirer l'override) restaure les
décisions initiales ; les fonctions et données de commande existantes restent intactes. Après le futur
branchement de l'interface, revalider les garde-fous juridiques et serveur de l'étape 10 avant toute
réouverture legacy ; `disabled` constituera le mode de fermeture des nouveaux achats.

## Interface commerciale (étape 15)

**Audit ciblé.** À l’étape 14, les modes et `purchase.ts` n’étaient consommés par aucun composant.
`product-page.ts` construisait prix, disponibilité, variantes, panier et données structurées depuis Supabase ;
`ProductPurchase.astro` sérialisait le panier et importait `cart-store`. `VariantSelector.astro` rend les
options reçues et émet `dn:variant-change` ; il n’effectue aucun rapprochement. `ProductCard`, `OfferCard`,
`ProductRow`, l’accueil et `CatalogBrowser` utilisaient les résumés de `catalog.ts` / `catalog-store.ts`
(prix minimum pour le tri). `MiniCart` utilise `Drawer`, `cart-store` et `cart-view` ; `Header` ouvrait
`dn-cart` avec compteur local. Le menu mobile n’avait pas de lien panier propre. `BaseLayout` lisait le
panier dans le head. `/panier/` et `/commande/` chargeaient `ApiConfig`, `cart-store`, `cart-sync`
(`check_cart`), `cart-view` et `order-api` (`create_order_request`). `/suivi/` utilise `get_order_tracking`
et le stockage distinct `dn-orders-v1`. Les textes publics proviennent de `config/commerce.ts` ;
`structured-data.ts` transforme les prix/disponibilités de la vue en Product/Offer ou ProductGroup.

**Décision centralisée.** `lib/commerce/storefront.ts` est pur, sans environnement, réseau ou chargement
de données réelles. `storefrontFlags`, `productCommerceView`, `storefrontSummary`,
`storefrontProductPage` et `storefrontEntries` fournissent les modèles et la sélection des composants.
`config/commerce.ts` lie ces fonctions aux données validées et à l’environnement au build.
Aucun composant n’appelle `product-map` ni `purchase`. Les URL d’achat sont exclusivement celles de
`shopifyPurchaseLink`, pré-calculées pour chaque variante. Le client choisit une correspondance déjà
calculée ; il ne construit ni ID Shopify ni URL d’achat. Les prix, disponibilités, unités et options
sont projetés avant rendu, ainsi que les Offer JSON-LD.

Les alias Vite `@commerce/Purchase`, `CartPage`, `OrderPage`, `MiniCart` sont choisis par
`storefrontEntries` dans `astro.config.mjs`. Les chemins TypeScript pointent vers les contrats legacy ;
Vite choisit l’implémentation selon le mode du build. Ceci évite d’importer les scripts de soumission
legacy en Shopify/disabled et le script de sélection Shopify en legacy. Ne pas remplacer cette sélection
par deux imports statiques conditionnés seulement dans le template : Astro peut collecter leurs scripts.
Les sources historiques ont été déplacées intactes vers `LegacyProductPurchase`, `LegacyCartPage` et
`LegacyOrderPage` ; aucune fonction panier, commande ou suivi n’a été supprimée.

| Mode              | Fiche et cartes                                                                                                                                                                 | Panier et commande                                                                                                                                                    | Suivi                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `legacy` (défaut) | Composants et données historiques, mêmes prix, variantes, textes et actions                                                                                                     | Mini-panier, compteur et formulaires historiques ; production toujours soumise aux blocages juridiques                                                                | Inchangé                          |
| `shopify`         | Liens externes « Acheter sur la boutique (site externe) » ; sélection obligatoire ; correspondance absente, exclue, ambiguë ou indisponible : aucun lien actif, texte explicite | En-tête et menu mobile vers `https://shop.dar-nur.fr/cart`, sans compteur ; aucun tiroir Astro ; pages d’information sans formulaire ni configuration/API de commande | Commandes historiques accessibles |
| `disabled`        | Prix legacy conservés, sans aucune action d’achat ; variantes consultables                                                                                                      | Ni icône panier ni tiroir ; pages d’information neutres, aucun lien boutique ni formulaire                                                                            | Commandes historiques accessibles |

**Autorité commerciale Shopify.** `shopifyPrice` et `available` de l’instantané validé sont les seules
sources affichées en Shopify. Supabase reste la source descriptive. Une entrée non rapprochée n’affiche
aucun prix commercial ; son Offer est retiré (y compris au niveau d’une variante). Aucun repli vers un
prix Supabase ou une promotion Supabase n’est affiché. Les cartes et leur prix de tri suivent cette règle.
Les prix barrés et prix d’offres/packs Supabase ne sont pas présentés en Shopify : aucune correspondance
commerciale de ces offres n’est certifiée. Les liens descriptifs vers leurs produits restent disponibles.
Les prix au kg/L sont retirés en Shopify, pour éviter de conserver un calcul Supabase sans validation de
la quantité commerciale Shopify. En disabled, prix, prix unitaires et JSON-LD historiques sont conservés :
ce mode suspend les actions de l’interface, sans réécrire le catalogue commercial.
Le résolveur de liens conserve sa double exigence de disponibilité Supabase/Shopify de l’étape 14. Une
variante n’est affichée « disponible » que si un lien d’achat validé existe : en cas de divergence, elle
est présentée comme non achetable (jamais « disponible » sans bouton). Aucun cas réel au 2026-10-28.

**UX et textes.** Sans variante, le lien Shopify est utilisable sans JavaScript. Avec variantes, les
liens exacts sont pré-rendus et restent cachés jusqu’à un choix valide ; un état explicite explique
la sélection ou l’indisponibilité. Les options épuisées sont désactivées et annoncées par le sélecteur.
Les états de sélection sont annoncés par `role=status`, les liens conservent les focus du design system,
les destinations externes sont signalées. Aucun nouveau token de couleur. Le bandeau Shopify renvoie
sobrement aux achats sur la boutique ; livraison et paiement sont précisés sur celle-ci, sans promesse
de tarif, délai ou prestataire. La réassurance reste descriptive (catalogue, suivi, conseil). Disabled
présente le catalogue et la suspension des achats. Les étapes de « demande de commande » ne sont
conservées qu’en legacy. Une rédaction commerciale plus détaillée attend la validation des conditions
réelles de Shopify ; aucune promesse de paiement ou livraison n’a été supposée.

**Protection de l’interface, pas fermeture du serveur.** En Shopify/disabled, les pages d’information
n’importent pas les composants historiques de commande, `ApiConfig`, `cart-sync` ou `order-api` ; elles
ne lisent pas le panier local et ne le suppriment pas. `BaseLayout` omet sa lecture anticipée du panier.
Le mini-panier n’est pas dans le graphe choisi. `ApiConfig` utilise aussi
`storefront.orderSubmissionEnabled` (faux hors legacy), mais reste rendu sur `/suivi/` et l’administration
pour leurs fonctions existantes. Le stockage `dn-cart-v1` est conservé ; aucun transfert vers Shopify
n’est effectué. Shopify est l’unique panier de l’interface en mode Shopify.

**Points d’entrée serveur encore actifs, d’après les sources versionnées (aucune inspection du serveur).**
Aucun fichier de `supabase/`, fonction, migration, RLS ou paramètre distant n’est modifié par cette étape.

- Migration `20261003100100_etape10_02_order_functions.sql` : EXECUTE accordé à **anon et authenticated**
  sur `order_country_codes()`, `check_cart(jsonb)`, `create_order_request(jsonb)` et
  `get_order_tracking(text)`. Les appels directs restent possibles indépendamment du mode du site.
  `create_order_request` contrôle `orders_private.config.production_ordering_open` pour les commandes
  déclarées production ; la valeur initiale est **false** dans
  `20261003100000_etape10_01_orders_schema.sql`. Ce contrôle ne ferme pas les demandes preprod.
- **authenticated** : `admin_update_order(uuid,text,jsonb)`, `admin_order_tracking_token(uuid)` ;
  vérifications internes d’administration conservées. Les droits des tables et la RLS existants restent
  applicables. Migration `20261003120000_etape11_01_order_emails.sql` :
  `admin_order_emails(uuid)`, `admin_order_email_alerts()`, `admin_retry_order_email(uuid)` sont accordées
  à authenticated et contrôlées par l’autorisation admin.
- **service_role** : `order_emails_claim(int)`, `order_emails_report(uuid,uuid,text,text,text)` et
  `order_emails_delivery_event(text,text,timestamptz)` (signature actualisée par
  `20261006100000_etape11_03_delivery_events.sql`). Ces fonctions ne sont pas ouvertes à anon/authenticated.
- Edge Functions `order-emails` et `order-emails-webhook` : points d’entrée HTTP toujours présents,
  documentés pour un déploiement `--no-verify-jwt`, protégés respectivement par le Bearer du worker
  et le Bearer du webhook Brevo. Le worker utilise l’outbox existante ; le webhook enregistre les
  événements de livraison. Leur disponibilité réelle, leurs secrets et la configuration distante n’ont
  pas été contrôlés ici. La planification pg_cron/pg_net décrite à l’étape 11 n’est pas désactivée.

Une mission serveur dédiée devra fermer **la création de nouvelles demandes legacy dans tous les
environnements**, revoir les droits EXECUTE de `create_order_request` et le besoin de `check_cart` /
`order_country_codes`, puis auditer config, tâches/outbox et fonctions e-mail. Elle devra préserver le
suivi et les opérations nécessaires aux commandes historiques, ainsi que les contrôles admin. La fermeture
commerciale serveur n’est donc **pas complète**, et le mode statique n’est pas une autorisation serveur.

**Tests et CI.** `test:commerce` utilise uniquement des fixtures fictives (les anciens sous-tests CLI
sur les données réelles sont remplacés par les assertions pures ; la vérification réelle reste une
commande/étape CI séparée). Couverture : legacy, disabled, URL produit/variantes et IDs exacts,
absence/exclusion/ambiguïté, stock, prix, Offer, panier cible, absence de soumission hors legacy, suivi
pour les trois modes, mode invalide, approbation production et anomalies bloquantes. Le Container Astro
est disponible : `test-commerce-render.mjs` compile les composants ciblés avec le compilateur déjà installé
et vérifie le HTML réel de `StorefrontLink` et `CommerceNotice`, avec fixtures. Aucun Vite, `.env`, réseau
ou dépendance ajoutée ; les imports CSS sont omis pour ce test HTML. Le rendu complet des fiches/en-têtes,
les images optimisées, scripts navigateur et le CSS final restent à vérifier par build et captures.
Validation hors ligne : `test:cart` (8 tests), `test:commerce` (18 tests et rendu Container),
`verify:shopify-map` (code 0, 0 erreur structurelle, 7 blocages connus et 12 avertissements),
`format:check` et `check` (0 erreur, 0 avertissement, 0 indication). Les échecs intermédiaires de typage et
d’adaptation du compilateur Container ont été corrigés. Les trois sources legacy déplacées ont aussi été
comparées à leurs sources Git d’origine : contenu identique après normalisation des fins de ligne.
La CI ajoute « Tests commerce » avant le build et « Correspondance Shopify (non stricte) » après les
contrôles existants, dans le même environnement. Aucun contrôle strict sur les données réelles.

`verify:products`, `verify:catalog`, `verify:orders` et certaines attentes de `verify:home` sont des
références **legacy** (prix Supabase, CTA/formulaire, textes). La CI reste en legacy. Ne pas interpréter
leur échec hors legacy comme une permission d’affaiblir les règles ; une vérification des sorties propre
à chaque mode sera nécessaire avant une CI multi-mode. `verify` conserve ses budgets JS ≤ 20 Ko gzip,
CSS ≤ 30 Ko gzip ; aucune hausse autorisée. `verify:shopify-map` est déjà dépendant du mode.

**Anomalies et activation.** Les fichiers réels sont inchangés : 228 produits rapprochés, 7 blocages
`supabase-only` (brouillons Shopify détaillés à l’étape 14), 12 avertissements `shopify-only`.
Un build Shopify complet reste volontairement impossible. Les deux garde-fous (`astro:build:start`
et assertion dans `config/commerce.ts`), le refus des modes inconnus et
`shopifyProductionApproved = false` sont conservés. Avant activation publique : résoudre les 7 blocages,
examiner les 12 avertissements, régénérer/valider les instantanés, faire les contrôles stricts, valider
les conditions commerciales et juridiques, réaliser la mission serveur ci-dessus, puis seulement
approuver explicitement la production et vérifier le parcours Shopify réel.

**Validation effectuée (2026-10-28).** `npm run ci` complet vert en legacy (preprod) ; budgets inchangés
(page la plus lourde : JS 6,8 Ko, CSS 15,1 Ko gzip). HTML legacy comparé à l’étape 14 : 287 pages au
contenu identique après neutralisation des empreintes Astro, des noms `/_astro/*` et des espaces entre
balises (une espace de plus après le bouton panier de l’en-tête, sans effet visuel) ; seule
`/design-system/` (page interne) a ses blocs `<style>` dans un autre ordre, avec les 131 mêmes règles.
Build disabled : 287 pages, `verify` vert ; aucun bouton panier, tiroir, ajout rapide ni lien boutique ;
aucun script contenant `create_order_request` ou `check_cart` ; `/suivi/` garde `get_order_tracking`.
Captures disabled à 1440 px et à 390 px réels (pages en `<iframe>` de 390 px : Edge sans interface impose
≈ 500 px de largeur minimale et rogne la capture). Builds `shopify`+`production`, `shopify`+`preprod`
et mode inconnu refusés ; `verify:shopify-map --strict` = 1 sur les données réelles. Le rendu complet en
mode shopify n’est vérifiable que par les tests Container (build volontairement bloqué).
Corrections de relecture : échappement `\\u003c` du JSON de `StorefrontPurchase` (la forme `'\u003c'`
était sans effet), disponibilité alignée sur l’existence du lien, message en double supprimé en disabled.

**Retour arrière.** reconstruire avec `DAR_NUR_COMMERCE_MODE=legacy` (ou retirer l’override, valeur
configurée legacy), puis redéployer la sortie statique. Les garde-fous juridiques legacy restent actifs
et le panier local conservé redevient lisible. `disabled` est l’option de suspension des achats depuis
l’interface ; aucune de ces options ne ferme les RPC serveur.

## Sécurisation des commandes historiques (étape 16)

**1. Points d’entrée audités.** Audit local du 2026-10-28, rapproché du relevé de production
fourni par Claude ; aucun appel distant. Les modes Astro ne décident jamais de l’ouverture SQL.

| Chemin | Rôles, protection existante, exposition | Risque et traitement étape 16 |
| --- | --- | --- |
| `LegacyOrderPage` → `order-api` → `create_order_request` ; RPC PostgREST directe | Public : clé publishable, anon/authenticated ; SECURITY DEFINER, validation, panier recalculé, quotas, idempotence | Formulaire contournable ; contrôle global avant validation/idempotence, tous environnements |
| Lignes insérées par `create_order_request` | Propriétaire de la fonction ; transaction commande, lignes, événement, submission | Deux triggers BEFORE INSERT protègent commandes et lignes en CLOSED |
| INSERT REST direct `orders` / `order_items` / `order_events` | Anon : aucun droit ; authenticated : SELECT seul, politiques admin via `is_admin()` | Déjà interdit au public ; ACL et RLS inchangées |
| SQL / clé privilégiée | Propriétaire, ou service_role avec les ACL de table nécessaires (BYPASSRLS seul ne les donne pas) | INSERT commandes/lignes bloqué aussi ; UPDATE historiques conservés ; un propriétaire peut toujours changer le schéma |
| `admin_update_order` : disponibilité, montants, notes, statuts, paiement, expédition | RPC authenticated + `is_admin()` ; transitions/contraintes SQL | Maintenue pour l’historique ; ne crée ni commande ni ligne, ignore les champs de bascule injectés |
| `get_order_tracking` / `admin_order_tracking_token` | Suivi public par jeton 256 bits ; restitution du jeton réservée à l’admin | Maintenus ; le jeton reste une capacité de lecture à protéger |
| `LegacyCartPage`, `check_cart`, `check_promo_code`, `order_country_codes`, `is_admin` | Fonctions exécutables avec clé publique ; lecture/calcul | Maintenues ; aucune création de commande par ces fonctions |
| `orders_log_events` → `order_events_enqueue_email` → outbox | Triggers de création/transition, outbox privée | Refus : aucun événement ni `order_received` ; transitions historiques toujours notifiables |
| `admin_order_emails`, `admin_order_email_alerts`, `admin_retry_order_email` | Authenticated + contrôle admin ; lecture ou remise en file d’un e-mail existant | Maintenues ; CLOSED n’est pas un interrupteur des e-mails historiques |
| `order_emails_claim`, `order_emails_report`, `order_emails_delivery_event` | RPC service_role seulement ; clé privilégiée côté Edge | Outbox, compte rendu et journal de remise ; ne créent aucune commande |
| Réveil immédiat / cron `dar-nur-order-emails` toutes les 5 min | `kick_order_email_worker`, pg_net/Vault ; envoi activé, URL et secret requis | Aucun réveil causé par un refus ; cron et backlog historique conservés |
| HTTP `order-emails` / `order-emails-webhook` | Secrets worker/webhook : Bearer, ou Basic pour webhook | Worker : outbox → Brevo → compte rendu ; webhook : remise. Aucun des deux ne crée de commande |
| `notify_github_regenerate` et autres fonctions trigger exécutables du relevé | PostgreSQL interdit leur appel comme fonction ordinaire ; exécutées via leurs tables | Pas de chemin de création de commande identifié ; régénération catalogue distincte, hors verrou |
| `orders_private.config` / scripts administratifs | Aucun accès anon/authenticated au schéma, config ou fonctions du verrou ; propriétaire SQL pour les scripts | Aucune RPC de bascule ; aucun état client ne fait autorité |

`ApiConfig` contient une configuration publique ; masquer le formulaire ou changer le mode ne révoque
pas une clé publique. `/suivi/` et `/admin/commandes/` gardent leurs accès existants. Le front traite déjà
`ordering_closed` via `ORDER_ERRORS` (« La commande en ligne n’est pas encore ouverte. »).
Aucun fichier `site/` ni aucune Edge Function modifié.

**2. Risques identifiés.** Avant 16, `production_ordering_open = false` ne ferme que la production
reconnue ; environnement absent, preprod ou development → commandes de test dans la même base de
production. Confirmé par appel anon fictif sans formulaire. Origin et environnement sont falsifiables
par un client HTTP ; les quotas dépendent aussi des en-têtes IP. Ces faiblesses voisines restent hors
périmètre. Un rôle privilégié peut encore modifier l’historique ou insérer un événement notifiable,
voire écrire l’outbox s’il en a les droits : CLOSED ferme les nouvelles commandes/lignes, pas tous
les effets d’une clé privilégiée compromise. Les droits des fonctions trigger du relevé, le worker
et les tâches historiques ne sont pas modifiés. Hors commandes (relevé Claude, non corrigé) : anon
et authenticated détiennent encore INSERT/UPDATE/DELETE/TRUNCATE sur `products`, `product_variants`,
`brands`, `categories`, `offers`, `offer_products` ; la RLS bloque les écritures REST, et PostgREST
n’expose pas TRUNCATE, mais ces droits hérités sont à révoquer dans une mission catalogue dédiée.

**3. Protections préparées.** `20261028100000_etape16_01_legacy_ordering_gate.sql` ajoute
`legacy_ordering_state` NOT NULL, défaut `open`, contrainte `open|closed`, motif et horodatage.
LEGACY_OPEN conserve les règles existantes, dont le blocage juridique production indépendant.
LEGACY_CLOSED renvoie `{ok:false,error:'ordering_closed'}` avant toute écriture, même pour un rejeu :
réponse de création uniforme, historique consultable par la RPC de suivi dédiée. Le corps de
`create_order_request` est repris exactement, avec ce seul contrôle ajouté.
Deux triggers BEFORE INSERT ALWAYS refusent aussi service_role/propriétaire, sans toucher UPDATE/DELETE.
La lecture privée verrouille config en partage jusqu’à la fin de la transaction : une fermeture attend
les créations déjà admises ; les suivantes lisent closed. Config absente → refus. Rejouer 16 conserve
l’état et ses métadonnées. Aucun grant ajouté aux rôles publics.

**4. Protections réellement testées.** `scripts/test/schema/legacy-gate.mjs` charge baseline puis toutes
les migrations triées sur base vide, avant cinq produits fictifs. Vrais `SET ROLE` anon, authenticated
admin/non admin, service_role et propriétaire. La capacité privilégiée d’INSERT est accordée uniquement
dans le banc, avant comparaison, pour prouver le trigger indépendamment de la RLS.
Comparaison des ACL explicites/effectives (tables, colonnes, schémas, fonctions, séquences), RLS et politiques.
Scripts réels de fermeture/réouverture (seul le motif vide est remplacé), motif obligatoire,
environnements et champs/en-têtes pirates, aucun ajout commandes/lignes/événements/submissions/outbox,
aucun réveil pg_net, aucun nouvel e-mail reçu après refus, rejeu refusé, triggers même en mode replica.
Suivi, administration jusqu’à l’expédition, quatre types d’e-mails et vrai worker avec RPC service_role
et transport fictif ; purges 10 et 11 réelles en CLOSED sur victimes fictives uniquement.
Rollback 16 sans modification de données, schéma et empreinte d’origine restaurés, réapplication,
double rejeu et chaîne des rollbacks 16 → 11 → 10 sur une autre base fictive.
`supabase/checks/etape16_invariants.sql` fournit sept contrôles lisibles sans afficher de secret.

Les suites commandes/e-mails chargeaient explicitement leurs seules étapes : ajout explicite de 16,
et retrait de 16 avant le rollback 10 dans son banc. La base témoin du rollback 11 conserve aussi 16.
CI : `test:legacy-gate` après « Commandes (étape 10) » ; filtre `scripts/test/schema/**` déjà suffisant.
Commandes locales reproductibles :

```powershell
cd scripts/test/schema
npm run test:legacy-gate
node legacy-gate.mjs --fixtures "$env:TEMP/dar-nur-etape16-fixtures"
node orders.mjs --data "$env:TEMP/dar-nur-etape16-fixtures"
npm run test:emails -- --data "$env:TEMP/dar-nur-etape16-fixtures"
```

Les JSON temporaires contiennent des produits fictifs et les identifiants nécessaires aux assertions
de regroupement de l’étape 6, aucun catalogue réel ni restauration commerciale. `emails.mjs` donne
priorité à `--data` sur le `--live` du script npm : aucun fetch. Les scénarios facultatifs d’offre
produit ne sont pas exercés par ces fixtures sans offres. Résultats : verrou **104**, commandes **140**,
gabarits/handlers **118**, outbox/worker **135** contrôles réussis, **0 échec**, typage e-mails réussi
(497 contrôles au total, commandes ci-dessus terminées avec le code 0).

Empreintes `md5(prosrc)` avant 16 dans PGlite, identiques aux huit valeurs du relevé fourni :

| Fonction | MD5 local = relevé production |
| --- | --- |
| `create_order_request` | `6da0b45e5c85d0af26686b45e3e4d74c` |
| `check_cart` | `29335123f01554e5d94b2de74c4f70ab` |
| `get_order_tracking` | `a78185112ca3a914ecae85a5814c3fa9` |
| `admin_update_order` | `d1977f1f98963d068b56073692ad3ccd` |
| `orders_guard` | `45828e584b26badd4ce1a9361efcf6f2` |
| `order_items_guard` | `ea16144af0dba601058827afbe062dbf` |
| `order_events_enqueue_email` | `28b88047713361c4c716568efcfac92a` |
| `is_admin` | `f56ccd71d257c73f4ea8d9e2f01e50f5` |

Les empreintes brutes dépendent des fins de ligne (CRLF des sources locales étapes 10/baseline) ; le
banc affiche aussi la variante LF. Le rollback compare au corps chargé avant 16 dans le même environnement.
Aucun écart de source constaté sur ces huit fonctions ; ce n’est pas un nouvel audit distant.

**5. Tests restant à faire.** Rien n’est appliqué en production : relu en lecture seule par Claude le
2026-10-28 (aucune colonne `legacy_ordering_*`, aucun trigger `trg_00_legacy_ordering_gate`, 0 commande,
0 événement, `production_ordering_open = false`, `sending_enabled = false` ; propriétaire de
`orders_private.config` et rôle de l’éditeur SQL = `postgres`, condition des scripts de bascule).
Revue Claude : `run.mjs --live` (81), `orders.mjs --live` (142), `npm run test:emails` (118 + 135) et
`test:legacy-gate` (104) relancés verts avec le catalogue public réel (lecture seule). PostgREST réel,
ACL/default privileges Supabase, pg_cron, pg_net/Vault et concurrence sur plusieurs connexions restent
à vérifier dans une mission dédiée. Extensions réseau simulées localement ; Edge Functions déployées
et Brevo non retestés. Aucun build Astro, ses fichiers étant inchangés.

**6. Fermeture future.** Mission dédiée : vérifier le projet ciblé et l’état réel, sauvegarder la
configuration utile hors dépôt, appliquer 16 comme propriétaire (reste OPEN), lire les invariants.
Remplir un motif explicite dans `20261028_etape16_fermer_commandes_historiques.sql`, exécuter dans une
connexion propriétaire authentifiée au tableau de bord. Lire les contrôles avant/après, vérifier CLOSED,
les invariants et une RPC publique refusée sans nouvelles lignes/outbox. Préserver suivi et traitement
des éventuelles commandes historiques.

**7. Réouverture.** Revalider parcours legacy et conditions juridiques, coordonner le retour Astro.
Remplir le motif de `20261028_etape16_rouvrir_commandes_historiques.sql`, exécuter comme propriétaire,
contrôler OPEN avant/après et les invariants. `production_ordering_open`, CGV et interrupteurs e-mails
restent indépendants : rouvrir 16 ne les ouvre pas. Tester le parcours autorisé dans la mission dédiée.
Le rollback 16 retire la protection et restaure exactement la fonction 10 ; ce n’est pas la réouverture
habituelle. Pour retirer les anciennes étapes, ordre 16 → 11 → 10 ; les rollbacks 10/11 restent
destructifs selon leur documentation. Rejouer une ancienne migration de fonction peut remplacer le
contrôle RPC : toujours réappliquer 16 en dernier et vérifier ses invariants.

**8. Désynchronisation Astro/Supabase.** Cible : `legacy` = OPEN (sous réserve juridique production),
`shopify` = CLOSED, `disabled` = CLOSED. La compilation Astro ne ferme JAMAIS le serveur ; bascule SQL
distincte. Legacy + CLOSED affiche un formulaire refusé ; Shopify/disabled + OPEN laisse la RPC de
création accessible avec la clé publique. Installer 16 ne change aucun mode et ne ferme rien.

**9. Prérequis Shopify.** Résoudre les sept brouillons bloquants, examiner les douze avertissements,
régénérer/valider instantanés et correspondances ; contrôler variantes, prix, stock, taxes, livraison,
conditions commerciales/juridiques et parcours panier/paiement réel. Conserver les garde-fous
d’approbation existants jusqu’à validation explicite ; coordonner fermeture SQL et mode Astro.

**Checklist de bascule — à ne pas exécuter sans mission dédiée.**

- [ ] Lire le catalogue Shopify en direct et régénérer les instantanés.
- [ ] Résoudre les 7 brouillons bloquants et examiner les avertissements.
- [ ] Vérifier les liens, variantes, disponibilités et prix réels.
- [ ] Tester le panier et le paiement Shopify, taxes et livraison comprises.
- [ ] Appliquer 16 puis fermer de façon contrôlée les nouvelles commandes historiques, motif consigné.
- [ ] Vérifier le refus serveur tous environnements, l’absence d’écriture/outbox et le suivi historique.
- [ ] Approuver/configurer le mode shopify dans Astro après validation des prérequis.
- [ ] Contrôler le site public et les destinations Shopify après déploiement autorisé.
- [ ] Préparer le retour arrière coordonné Astro/SQL ; réouverture après revalidation legacy.
