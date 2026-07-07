# Architecture Dar Nūr — mémoire vivante du projet

> Ce fichier est la mémoire vivante du projet, à lire en premier avant toute tâche de développement ou de design sur Dar Nūr (voir la compétence `dar-nur-architect`). Il doit être tenu à jour à la fin de chaque session qui découvre un fait durable sur l'architecture.

## Vue d'ensemble

- **Type de site** : e-commerce, multi-pages HTML statiques (un fichier `.html` par page). Pas de framework JS, pas d'outil de build.
- **Homepage** (`index.html`, ~3100+ lignes) : Single Page App maison — une seule page qui bascule entre plusieurs "vues" (accueil, boutique filtrée, fiche produit) via JS (`showHome()`, `goCat()`, `showProduct()`), sans changement d'URL réelle (ancres `#`).
- **Pages catégories statiques** : `abayas/`, `miels/`, `huiles/`, `poudres/`, `gelules/`, `brumes/`, `qamis/` — chacune un `index.html` autonome, SEO-first, avec un sous-ensemble de produits **hardcodés en HTML** (pas de JS de rendu), qui renvoient vers la homepage via des ancres (`https://dar-nur.fr/#vt-abaya-nouha-gris-argente`) pour la fiche produit détaillée.
- **Backend** : Supabase (catégories dynamiques ; produits actuellement hardcodés dans `index.html`, voir section Supabase ci-dessous).
- **Hébergement** : GitHub Pages, domaine `dar-nur.fr` (fichier `CNAME` à la racine).
- **Design** : pas de charte graphique séparée pour le site — les variables CSS `:root` de `index.html` sont la seule source de vérité du design "Émeraude & Or" (refonte homepage validée et déployée, PR #2 mergée).

## Pages connues

| Page | Fichier | Spécifique |
|---|---|---|
| Accueil (SPA) | `index.html` | Nav + hero + trust-bar + boutique filtrée + fiche produit + footer, tout en une page |
| Abayas & Ensembles | `abayas/index.html` | 22 produits hardcodés, header/footer **différents** de la homepage (mini-nav propre à la page) |
| Miels | `miels/index.html` | 16 produits hardcodés |
| Huiles | `huiles/index.html` | idem |
| Poudres & Graines | `poudres/index.html` | idem |
| Gélules | `gelules/index.html` | idem |
| Brumes | `brumes/index.html` | idem |
| Qamis | `qamis/index.html` | idem |
| Bakhour & Encens | `bakhour/index.html` | **1 seul produit réel** (Bakhur Mukhalat) — première page catégorie construite sur le gabarit `design_handoff_collections/dar-nur-collection-reference.html` (nav méga-menu + footer 3 colonnes homepage, pas la mini-nav legacy des autres pages ci-dessus). Pas de barre de filtres/tri (non pertinent à 1 article), grille `.grid--single` centrée/contrainte pour éviter l'effet de grille cassée. |
| Admin | `admin.html` | Interface de gestion produits/catégories/offres (écrit dans Supabase) |
| CGV / Confidentialité / Mentions légales | `cgv.html`, `confidentialite.html`, `mentions-legales.html` | Statiques |

**Constat important pour tout travail sur les pages catégories** : leur header/footer/hero ne reprennent PAS le composant de nav riche de la homepage (méga-menu déroulant "Bien-être"/"Mode", burger mobile, footer 3 colonnes). Elles utilisent une nav minimaliste propre (`abayas/index.html` a son propre `<style>` avec ses propres tokens locaux `--green/--green2/--gold/--gold2/--cream/--cream2/--text/--muted`, proches mais pas identiques à ceux de la homepage). C'est un écart de cohérence identifié lors de l'analyse pour la refonte des pages collections (juillet 2026).

## Identité visuelle "Émeraude & Or" (tokens réels, `index.html` `:root`)

```css
--green:#0d1f16;        /* vert forêt profond — fond principal, nav, footer, CTA texte */
--green-soft:#16301f;   /* vert secondaire — hover, dégradé hero */
--gold:#c8a84b;         /* or métallique — accent principal, bordures, CTA */
--gold-light:#dcc079;   /* or clair — hover CTA */
--gold-dark:#8a6a26;    /* or foncé — texte secondaire */
--cream:#f4efe4;        /* fond clair chaud */
--offwhite:#faf8f3;     /* fond body */
--ink:#1a1a1a;          /* texte principal */
--muted:#6b6256;        /* texte secondaire/caption */
--line:rgba(200,168,75,.28); /* filet or */
--shadow:0 18px 50px -22px rgba(13,31,22,.45);
```

**Typographie** (Google Fonts, tout serif sauf Jost) :
- **Cinzel** (400–700) — h1/h2/h3, nav, boutons, eyebrows, uppercase, letter-spacing large
- **Cormorant Garamond** (400–600 + italique) — hero h1 italique, citations, accents
- **Lora** (400–600) — corps de texte, `body` par défaut
- **Jost** (300–600) — sous-titres hero, footer, labels fins

**Rythme/espacements** : grille de base 8px. `section{padding:15px 28px}` desktop / `12px 22px` ≤768px. Container `max-width:1240px` (`.wrap`). Grilles produits `repeat(4,1fr)` desktop → `repeat(3,1fr)` ≤1024px → `repeat(2,1fr)` ≤768px → `1fr` ≤480px.

**Composants clés** (sélecteurs réels dans `index.html`) : `header/nav` (sticky, `rgba(13,31,22,.97)` + `backdrop-filter:blur(8px)`), `.hero`, `.trust-bar`/`.trust-grid`, `.filters`/`.filters button.active`, `.grid`/`.card` (produits, avec `.card-image`, `.cat-tag`, `.price`, `.card-actions`, `.btn-product-wa`), `.btn-wa`/`.btn-wa.dark` (CTA WhatsApp), `footer`/`.foot-cols`/`.foot-contact`/`.foot-channels`/`.foot-blessing`.

**Breakpoints** : `1024px`, `768px` (majeur : nav devient sidebar mobile, grilles passent à 2 colonnes), `480px`.

**Documents de référence associés** :
- `.design-brief.md` — ground truth post-refonte homepage (tokens, page structure, risques identifiés)
- `DAR-NUR-BRAND-GUIDELINES.md` — spec packaging/étiquettes (pas la charte du site, mais mêmes tokens couleur/typo)
- `design_handoff_accueil/` — dossier de handoff de la refonte homepage (README + prototype HTML `dar-nur-accueil.html`), **le patron du workflow** design → validation → implémentation à répliquer pour les collections.
- `docs/DESIGN_HANDOFF_COLLECTIONS/` *(à créer/consulter selon l'avancement)* — équivalent pour la Phase 1 "pages collections".

## Catégories réelles (14, source `index.html` fallback + Supabase `categories`)

`miels, gelules, poudres, huiles, brumes, qamis, vetements (Abayas & Ensembles), parfums, tahara (Tahara & Hygiène, packs/coffrets), bakhour (Bakhour & Encens), bijoux, chaussures, chechias, accessoires` — plus l'entrée virtuelle `all` ("Tous les Produits").

Chaque catégorie a : `id`, `label` (badge fiche produit/breadcrumb/SEO), `filter_label` (bouton de filtre boutique), `sort_order`. Descriptions éditoriales des collections actuellement **hardcodées côté front** (`_COLLECTION_DESCS`), pas en base — à ne pas réinventer, à reprendre telles quelles.

## Supabase

- **Tables confirmées** : `products` (avec relation `product_variants`), `product_variants`, `categories`, `offers` (avec relation `offer_products`), `offer_products`.
- **Client** : `js/supabase-client.js` (dépend de `js/config.js` pour `SUPABASE_URL`/`SUPABASE_ANON`), fonctions `fetchProducts`, `fetchProduct`, `fetchCategories`, `fetchAllCategories`, `saveProduct`, `saveVariant`, `fetchActiveOffers`, etc. Storage : bucket `product-images` (`uploadImage`).
- **Auth** : Supabase Auth email/mot de passe (`signIn`/`signOut`/`getSession`), utilisé pour `admin.html` uniquement (pas de compte client public identifié à ce jour).
- **Point d'attention architecture** : sur la homepage, **les catégories sont dynamiques** (fetch Supabase → `_applyCategories(cats)` reconstruit `CAT_LABELS`/`FILTERS`/`COLLECTIONS`, avec fallback statique identique si Supabase indisponible), **mais le catalogue produit (`PRODUCTS`) est un tableau JS hardcodé dans `index.html`**, pas un fetch live à chaque visite. Les pages catégories statiques (`abayas/`, `miels/`...) sont elles-mêmes des instantanés HTML de ce même catalogue, synchronisés manuellement (source de risque de désynchronisation déjà documentée dans les audits `AUDIT_COMPLET_ABAYAS_DAR_NUR.md`, `AUDIT_PREMIUM_ABAYAS_DAR_NUR.md`).
- Avant toute modification de schéma : traiter comme changement structurant (voir SKILL.md étape 3), car les pages catégories ET la homepage lisent potentiellement les mêmes données.

## Filtres — logique métier réelle à préserver

Système de filtre par pastilles (pills), implémenté uniquement sur la homepage aujourd'hui :
- `FILTERS` = tableau `[id, filter_label]` par catégorie + `["all","Tous"]`.
- `renderFilters()` génère les boutons `.filters button` (état `.active`).
- `setFilter(f)` met à jour `currentFilter` et ré-affiche via `renderGrid()`.
- `renderGrid()` filtre `PRODUCTS` par `p.cat === currentFilter` (ou tout si `all`) et injecte les cartes `.card[data-cat=...]`.
- `goCat(f)` = raccourci nav/footer : bascule sur la vue boutique + applique le filtre + scroll.

Les pages catégories statiques n'ont **pas** ce système de pilules — elles affichent une liste fixe pré-filtrée d'une seule catégorie. C'est un choix pertinent pour le SEO (une URL par catégorie, contenu indexable sans JS), mais rien n'empêche d'ajouter des sous-filtres (couleur/taille/prix) côté page catégorie sans casser ce modèle — à condition de garder le rendu initial en HTML statique (pas de contenu qui n'existe qu'après exécution JS, pour le SEO).

## SEO — éléments à préserver sur toute page catégorie

- `<title>` et `<meta name="description">` spécifiques par catégorie, avec nombre de produits + prix d'appel + mention WhatsApp.
- Open Graph + Twitter Cards complets.
- `<link rel="canonical">` auto-référent.
- JSON-LD : `CollectionPage` (name, description, url, breadcrumb, mainEntity), `BreadcrumbList` (Accueil → Catégorie), `ItemList` (chaque produit avec position/url/name).
- Toutes les pages catégories sont dans `sitemap.xml`, autorisées par `robots.txt`, aucun `noindex`.

## Hébergement et déploiement

- GitHub Pages, branche `main`, déploiement direct des fichiers statiques (pas de pipeline de build détecté). `CNAME` pointe vers `dar-nur.fr`.
- Chemins d'assets : mélange d'absolus (`/dar-nur-abaya-....jpg`, `/favicon.ico`) et de relatifs à la racine — cohérent avec un hébergement à la racine du domaine custom (pas de sous-dossier `username.github.io/dar-nur`).

## Conventions observées

- **CSS** : pas de framework, variables `:root` custom properties, nommage utilitaire court (`.card`, `.hero`, `.foot-col`...), pas de BEM strict.
- **JS** : essentiellement inline dans `index.html` (un seul gros `<script>` en fin de fichier : données produits + logique SPA). Pages catégories : aucun JS de rendu (tout est HTML statique écrit à la main).
- **Convention de contenu** : toute copy éditoriale (descriptions collections, taglines produits) vit dans le code (pas de CMS de contenu séparé) — à traiter comme donnée réelle à préserver, jamais à réinventer.
- **Workflow de refonte design** (établi lors de la refonte homepage, à répliquer) :
  1. Analyser l'existant en profondeur (comme ce document).
  2. Créer un prototype HTML autonome à haute fidélité dans un dossier `design_handoff_<zone>/`, avec un `README.md` décrivant sections/tokens/interactions/état.
  3. Itérer via des variantes (`v_*.html`) si besoin.
  4. Attendre validation utilisateur explicite.
  5. Implémenter dans le projet réel seulement après validation, en respectant logique métier/filtres/données réelles/SEO/perf existants.

## Journal des mises à jour

- **2026-07-05** — Création du fichier à partir du gabarit de la compétence `dar-nur-architect`, enrichi par exploration réelle du repo (index.html, abayas/index.html, js/supabase-client.js, design_handoff_accueil/README.md, IMPLEMENTATION_HUB_COLLECTIONS.md) dans le cadre de la mission "Phase 1 — pages collections".
- **2026-07-05** — Création de `bakhour/index.html` (branche `feature/collections-premium-redesign`), première page catégorie implémentant le gabarit validé `design_handoff_collections/dar-nur-collection-reference.html` (tokens/nav/hero/card/footer homepage) au lieu du pattern legacy mini-nav des pages catégories précédentes. Catégorie à un seul produit réel (Bakhur Mukhalat, 24,99 €) : pas de filtres/tri, grille à une carte centrée via `.grid--single`, JSON-LD `ItemList numberOfItems:1`. Pattern SEO (head) repris de `abayas/index.html`.
- **2026-07-07** — Merge du Design Handoff externe "Sceau & Ligne" (`D:\youcef\Dar Nūr – Pages Collections\export`) dans les 14 pages catégories (`abayas, miels, huiles, poudres, gelules, brumes, qamis, bakhour, parfums, tahara, bijoux, chaussures, chechias, accessoires`). Remplacement direct de chaque `*/index.html` par la version du handoff (copie fidèle, aucune réécriture). Ajouts : anneau-sceau hero (`.hero-ring`, photo produit ou glyphe نور selon catégorie), bandeau de confiance (`.value-strip`, copy identique homepage), note "Bon à savoir" (`.info-note`, uniquement où un fait réel existe), barre de filtres retravaillée en onglets soulignés avec compteurs réels, correctif `.cat-badge{white-space:nowrap}`, suppression de "À partir de" sur prix fixes (conservé sur miels où 3 formats/prix réels). Vérifié avant merge : données produit (URLs, prix, nombre de cartes), SEO (head, JSON-LD), `index.html`, `sitemap.xml`, `robots.txt`, `js/` strictement identiques entre le handoff et la prod — aucun asset manquant (tous les visuels du hero-ring existaient déjà dans `assets/`). Bug pré-existant repéré en vérifiant (non introduit par ce merge, hérité du commit `4861ceb`) : sur les pages catégories, le reset global `button,select{...}` omet `border:none;background:none` (présent uniquement sur `index.html` homepage) — le bouton `.burger` du menu mobile affiche donc un rectangle gris au lieu d'une icône propre sur les 14 pages catégories. Signalé à l'utilisateur, non corrigé dans cette tâche (hors scope du handoff).
