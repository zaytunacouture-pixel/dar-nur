# Refonte Dar Nūr — nouveau socle Astro (`site/`)

> Statut au 2 octobre 2026 : **étape 6 terminée — schéma Supabase migré (additif), lu par le socle.**
> Les pages catalogue ne sont **pas** migrées. La production reste **dar-nur.fr** (GitHub Pages,
> racine du dépôt), que rien dans `site/` ne modifie.

## Architecture

| Élément | Choix |
|---|---|
| Emplacement | Sous-dossier autonome `site/` (son `package.json`, sa sortie `site/dist/`). L'ancien site, l'admin, les générateurs et leurs workflows restent à la racine, inchangés. |
| Framework | Astro 7, sortie **statique** (aucun SSR à l'exécution), TypeScript `strictest`. |
| JavaScript client | Aucun framework. Petits `<script>` par composant (bundlés, dédupliqués par Astro) seulement là où il faut de l'interaction : menu mobile, méga-menu, panneaux, recherche, sélecteur de variantes. Header, footer, cartes : HTML statique. |
| CSS | Variables CSS (`src/styles/tokens.css`) + base globale (`base.css`) + CSS scopé dans chaque composant. Pas de Tailwind ni de bibliothèque d'UI : aucun bénéfice pour ~40 composants, et du poids en plus. |
| Données | Supabase **en lecture seule, au build** (`src/lib/supabase.ts`, `fetch` natif, colonnes listées explicitement). Traduction vers les types d'affichage dans `src/lib/catalog.ts`, seul fichier qui connaît le schéma. Depuis l'étape 6 : `status = published`, collection principale, `availability` (NULL = à arbitrer → repli sur `coming_soon`), `product_media`, options normalisées, arbre `collections`, `settings` publics. Schéma : `docs/SCHEMA_SUPABASE.md`. |
| Images | `src/components/ui/CatalogPicture.astro`, point d'entrée unique : AVIF + WebP, `srcset`/`sizes`, dimensions déclarées, recadrage au ratio, chargement différé sauf l'image prioritaire (LCP). Images distantes autorisées : `dar-nur.fr` et le stockage public Supabase. |
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
| `npm run ci` | Tout, dans l'ordre de la CI |

## Variables d'environnement

Copier `site/.env.example` en `site/.env` (ignoré par Git).

| Variable | Valeurs | Rôle |
|---|---|---|
| `DAR_NUR_ENV` | `development` (défaut) · `preprod` · `production` | **Seule `production` autorise l'indexation.** Toute autre valeur : meta `noindex, nofollow`, `robots.txt` « Disallow: / », en-tête `X-Robots-Tag`. |
| `SITE_URL` | URL absolue | Canonical et Open Graph. À défaut : `DEPLOY_PRIME_URL` / `URL` (Netlify), puis `http://localhost:4321`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | URL du projet, clé `sb_publishable_…` | Lecture publique sous RLS (valeurs déjà publiques sur l'ancien site). Toute autre clé est refusée par le code. Sans elles, le build passe et les pages l'indiquent. |

## Préproduction Netlify

`site/netlify.toml` : publication de `dist/`, build `npm ci && npm run build && npm run verify`, Node 22,
`DAR_NUR_ENV = "preprod"` forcé pour **tous** les contextes Netlify (le contexte « production » de Netlify
est notre préproduction), `X-Robots-Tag: noindex` sur tout, cache d'un an sur `/_astro/*`.

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
| Socle, tokens, polices, logo, header, méga-menu, menu mobile 2 niveaux, bandeau, recherche (visuelle), mini-panier (visuel), footer, réassurance, ProductCard, UniverseCard, CollectionCard, VariantSelector, guide des tailles (repli), primitives UI, pages `/demo/`, `/design-system/`, `/lab/supabase/`, Netlify, CI | Étape 7 : pages univers et collections. Puis fiches, panier métier, recherche, SEO (301 depuis `redirects`, sitemap, JSON-LD), shooting photo, bascule. |
| **Étape 6** (2026-10-02) : migration additive Supabase (9 migrations, `docs/SCHEMA_SUPABASE.md`), lecture du nouveau schéma dans `catalog.ts`, `/lab/supabase/` affiche l'arbre des collections, banc `scripts/test/schema` + CI `schema-ci.yml` | |
