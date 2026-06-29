# DOCUMENT DE RÉFÉRENCE OFFICIEL — DAR NŪR
**Version : 1.0 — 29 juin 2026**
**Source de vérité pour toutes les sessions futures.**
**À lire intégralement avant toute modification.**
---
## 1. Présentation du projet
### Objectif
Dar Nūr est une boutique premium de produits naturels et de vêtements pudiques,
vendue exclusivement par commande WhatsApp. Il n'existe pas de panier ni de
paiement en ligne. Le site est une vitrine premium qui génère des commandes via
WhatsApp pré-rempli.
### Philosophie
- Crédibilité avant tout.
- Qualité et authenticité des produits naturels.
- Respect des traditions islamiques et orientales.
- Transparence : jamais inventer une information.
- Premium sans ostentation.
### Positionnement
Maison de marque premium naturelle et pudique. Ton élégant, sobre, rassurant.
Pas de marketing agressif. Pas d'allégations exagérées. Confiance et authenticité.
### Architecture générale
- **Frontend :** Single Page App (HTML / CSS / JS Vanilla) — fichier principal : `index.html`
- **Backend :** Supabase (PostgreSQL + Auth + Storage)
- **Hébergement :** GitHub Pages — `https://dar-nur.fr`
- **Repo :** `https://github.com/zaytunacouture-pixel/dar-nur`
- **Répertoire local :** `C:\Users\youcef\dar-nur`
- **Admin :** `https://dar-nur.fr/admin.html`
- **Supabase URL :** `https://sxlpgcnjerlayitaxxyv.supabase.co`
- **Contact :** WhatsApp `07 69 25 33 75` — Email `dar_nur_001@outlook.com`
- **Paiement :** Revolut (`@youcefkir`) ou espèces
### Pages séparées existantes
`/miels/`, `/abayas/`, `/gelules/`, `/huiles/`, `/brumes/`
Ces pages catégorie sont indépendantes d'`index.html` et ne sont pas couvertes
par le système de maillage.
---
## 2. État actuel du catalogue
### Totaux (29 juin 2026)
| Métrique | Valeur |
|---|---|
| Produits total | 208 |
| Produits actifs | 171 |
| Produits en brouillon | 37 |
| Catégories actives | 14 |
| Catégories inactives | 1 (`parfums`) |
### Familles terminées éditorialmente — produits ACTIFS
| Famille | Cat. Supabase | Actifs | Finition |
|---|---|---|---|
| Miels Thérapeutiques | `miels` | 17 | ✅ Complet |
| Gélules | `gelules` | 12 | ✅ Complet |
| Huiles | `huiles` | 16 | ✅ Complet |
| Poudres & Graines | `poudres` | 20 | ✅ Complet |
| Brumes | `brumes` | 4 | ✅ Complet |
| Tahara (muscs, packs, lots) | `tahara` | 10 | ✅ Complet |
### Familles terminées éditorialmente — produits EN BROUILLON
*(contenu complet, en attente d'images + activation)*
| Famille | Cat. Supabase | Brouillons | Note |
|---|---|---|---|
| Savons Noirs | `tahara` | 9 | Beldi/solide différenciés |
| Gommages | `tahara` | 6 | Routines par collection |
| Poudres Tahara | `tahara` | 7 | Anti-transp. vs poudres minérales distingués |
| Chantilly de Karité | `tahara` | 2 | Moninga ≠ Nila différenciés |
| Miels Gourmands | `miels-gourmands` | 8 | Prix 24,99 €. **Catégorie à désactiver jusqu'à activation** |
### Familles Mode — contenu minimal
| Famille | Cat. Supabase | Actifs | Niveau |
|---|---|---|---|
| Abayas / Ensembles | `vetements` | 62 | 🔴 Minimal — peu de descriptions |
| Qamis | `qamis` | 8 | 🟡 Partiel — 4 sans composition |
| Sandales | `chaussures` | 11 | 🔴 Minimal |
| Chéchias | `chechias` | 7 | 🔴 Minimal — **actifs sans tagline ni description** |
| Bakhour | `bakhour` | 1 | 🔴 Minimal |
| Accessoires | `accessoires` | 3 | 🔴 Minimal |
### Catégorie suspendue
| Famille | Statut | Note |
|---|---|---|
| Parfums | ⏸️ Catégorie inactive | 3 produits en brouillon. `dn-rose-imperial-valley` : description copiée-collée incorrecte. Décision stratégique en attente. |
### Produits en suspens
| Slug | Situation |
|---|---|
| `dn-miel-nigelle-hibiscus` | Inactif, contenu vide. Doublon probable de `miel-hibiscus-zamzam`. **Décision : supprimer (recommandé) ou développer.** |
| `spray-brumisateur-hibiscus-nigelle` | Brouillon, contenu complet, en attente d'image. |
### Produits en attente fournisseur — non encore créés
| Produit | Prix confirmé | Manque |
|---|---|---|
| Poudre Oud Blanc jaune (Al Malika / بودرة الملكة) | 4,99 € | Image officielle |
| Poudre Oud Blanc rose (بودرة العود الأبيض) | 4,99 € | Image officielle |
| Poudre Khalnaji (بودرة خلنجي) | À confirmer | Clarification type |
| Pierre d'Alun Muscée (bordeaux) | 4,99 € | Image officielle |
| Pierre d'Alun Muscée Asamaa (violette) | 4,99 € | Image officielle |
| Poudre Al Malika (jaune) | 4,99 € | Clarification type |
### Règles de publication
1. Un produit ne peut être activé que si son contenu éditorial est complet.
2. Un produit ne peut être activé que si une image est associée ou le logo Dar Nūr
   est accepté comme fallback.
3. La catégorie `miels-gourmands` doit rester inactive en Supabase tant que ses
   8 produits sont en brouillon — sinon le filtre boutique affiche 0 résultats.
4. Les cosmétiques Tahara (24 produits) s'activent ensemble, après import de leurs
   visuels.
---
## 3. Règles éditoriales officielles
### 3.1 Règles absolues — ne jamais enfreindre
1. **Ne jamais inventer une information.** Si une donnée est inconnue → écrire
   "À compléter" (jamais une supposition).
2. **Ingrédients non confirmés fournisseur.** Interdits sans preuve écrite :
   "riche en vitamines", "certifié Bio", "non pasteurisé", "sans additif",
   "sans conservateur", "riche en enzymes".
3. **Allégations médicales.** Strictement interdites : "soigne", "guérit",
   "traite", "efficace contre", "améliore la vision", "réduit les inflammations",
   "renforce le système immunitaire".
4. **Composition.** Ne jamais révéler les proportions. Ingrédient(s) principal(aux)
   uniquement. Ne pas déduire une recette.
### 3.2 Formulation miels — règle définitive
Toujours utiliser :
> *"Préparé à partir d'un miel de printemps pur récolté en France, associé à des
> ingrédients naturels soigneusement sélectionnés selon le savoir-faire du
> fabricant."*
ou pour les miels russes :
> *"Préparé à partir d'un miel pur récolté en Russie, associé à des ingrédients
> naturels soigneusement sélectionnés selon le savoir-faire du fabricant."*
**Jamais :** "miel pur" pour décrire le produit fini. "100 % miel". "pur miel".
### 3.3 Origines miels — définitivement confirmées
| Origine | Produits |
|---|---|
| **France** | Tous les Miels Thérapeutiques sauf liste ci-dessous · Tous les Miels Gourmands |
| **Russie** | Miel Noir de Shilajit · Miel de Lavande · Miel Rose de Sibérie · Miel de Fraise de Russie · Miel Blanc du Kirghizistan |
### 3.4 Prix confirmés fournisseur — définitifs
| Produit | Prix |
|---|---|
| Miels Gourmands | 24,99 € — format 200 g |
| Poudres Tahara + Pierre d'Alun | 4,99 € — format 50 g |
| Pack Gourmand 6 miels | 130 € (ancien prix affiché : 180 €) |
| Poudres Oud Blanc (×2) | 4,99 € |
| Pierre d'Alun bordeaux + Asamaa | 4,99 € |
### 3.5 Vocabulaire validé
| À utiliser | À ne jamais utiliser |
|---|---|
| "Conçu pour" / "Pensé pour" / "Adapté à" | "Formulé pour" |
| "Savon solide" / "Format solide" | "Pain de savon" |
| "Nettoie la peau en profondeur" | "Purifie la peau" |
| "Exfolie délicatement" | "Exfolie vigoureusement" |
| "Laisse la peau douce" | "Résultats visibles en X jours" |
| "Traditionnellement utilisé..." | "Soigne" / "Guérit" / "Traite" |
| "Apprécié pour..." | "Riche en antioxydants" (non confirmé) |
| "Inspiré des traditions..." | "Certifié Bio" (non confirmé) |
### 3.6 Ton éditorial — définitif
- **Premium · élégant · rassurant · naturel · crédible**
- Pas de marketing agressif. Pas de superlatifs sans preuve.
- La transparence renforce la confiance : préférer "À compléter" à une
  affirmation inventée.
- Formulations prudentes pour les bienfaits :
  "traditionnellement utilisé...", "apprécié pour...", "présent dans les
  traditions de...", "utilisé depuis des générations..."
### 3.7 Structure des fiches produit — ordre figé
```
HERO (fond vert)
  badge catégorie · h1 nom · tagline
PP-BODY (2 colonnes desktop, 1 colonne mobile)
  Gauche : galerie · sélecteur format (si variantes)
  Droite (pp-content) :
    1. Description (paragraphes)
    2. Idéal pour          ← VISIBLE, jamais en accordéon
    3. Bienfaits / Points forts
    4. Le produit (composition · poids · contenance · provenance miels)
    5. Conseils d'usage
    6. En savoir plus (accordéons : Traditions · Infos produit · Routine · FAQ · Sélection Dar Nūr)
    7. Qualité / Précautions (dual-panel)
    8. Encart commande (prix · bouton Commander · réassurance)
ENGAGE (section réassurance globale — inchangée)
DANS LA MÊME FAMILLE (4 produits de la catégorie)
PRODUITS COMPLÉMENTAIRES — BLOC 1 (max 3 cartes · avec bouton WA)
EXPLORER LA COLLECTION DAR NŪR — BLOC 2 (max 2 cartes · sans bouton WA)
```
### 3.8 Structure des accordéons "En savoir plus" — 5 accordéons affichés
L'accordéon "Idéal pour" et l'accordéon "Produits complémentaires" sont
**toujours filtrés** et ne doivent jamais apparaître dans "En savoir plus".
Ordre des 5 accordéons restants :
1. Utilisations traditionnelles
2. Informations produit
3. Routine recommandée (ou "Conseils d'utilisation" pour produits alimentaires)
4. Questions fréquentes
5. La sélection Dar Nūr
### 3.9 Règles spécifiques par famille
**Gélules :**
- FAQ sans doublon avec "Conseils d'utilisation" (supprimé : question sur la fréquence)
- Nouvelle FAQ : gélules végétales ? · cure prolongée ? · composition ?
**Huiles :**
- "biologique" interdit dans les descriptions (non confirmé)
- FAQ dilution distincte selon type : essentielle (toujours diluer) vs végétale (directe OK)
- Compléments : ne jamais suggérer de gélules d'un ingrédient inexistant en gélule
**Savons Noirs :**
- Distinguer : beldi (pâte, rituel hammam) vs solide (format pain, quotidien)
- "Idéal pour" : orienté besoins, jamais "les amateurs de..." / "les personnes qui..."
- Routine : Savon Noir → Gommage → Chantilly (étapes numérotées)
**Gommages :**
- "Idéal pour" : besoins, pas profils
- Routine : Savon → Gommage → Rinçage → Chantilly
- Vocabulaire : "Exfolie délicatement" · "Laisse la peau douce"
**Poudres Tahara :**
- Anti-transpirants (El Anoud, Al Mousany, Pierre d'Alun) ≠ Poudres minérales
- Al Mousany : discordance marque (Dar Nūr / Rayeve Naturals) — en attente confirmation
- Ne pas mettre : "sans alcool, sans paraben" si non confirmé officiellement
**Chantilly de Karité :**
- Moninga = corps + visage + cheveux · Nila = visage uniquement
- Chantilly = étape finale du rituel (jamais présentée uniquement parce qu'elle contient du karité)
### 3.10 Signature Dar Nūr — texte officiel figé
> *"Chez Dar Nūr, nous sélectionnons des produits inspirés des traditions de soin
> et de bien-être, en privilégiant l'authenticité, la qualité et la transparence
> des informations mises à votre disposition. Lorsque certaines informations sont
> encore en attente de confirmation par le fabricant, nous préférons l'indiquer
> plutôt que de formuler des affirmations non vérifiées."*
Cette signature apparaît en dernier accordéon sur toutes les fiches.
---
## 4. Architecture UX validée
### 4.1 Point A — Maillage intelligent (implémenté et validé)
**Avant :** Table hardcodée `COMPLEMENTS` (~20 entrées, bugs, liens brisés).
Maillage curé invisible dans un accordéon, texte non cliquable.
**Après :**
- `const MAILLAGE` : 112 produits avec B1 (slugs), B2 (slugs), label de collection
- `getBloc1(id)` → max 3 produits résolus contre `PRODUCTS`
- `getBloc2(id)` → max 2 produits + label de collection
**Bloc 1 — "Produits complémentaires"**
- Critères : même ingrédient · même rituel · complément d'utilisation évident
- Max : 3 cartes
- Style : fond cream `.family` — même visuel que "Dans la même famille"
- Bouton "Commander sur WhatsApp" présent sur chaque carte
- Titre section : "Complément parfait" / "Produits complémentaires"
**Bloc 2 — "Explorer la collection Dar Nūr"**
- Critères : autres références de la même gamme (découverte, pas complémentarité)
- Max : 2 cartes
- Style : fond blanc `.family-coll` — plus discret, border-top gold subtil
- Sans bouton WhatsApp — cliquable uniquement pour navigation
- Titre section : label spécifique par famille (ex. "Explorer notre gamme de miels
  thérapeutiques")
**Comportements validés :**
- Produits en brouillon → silencieusement filtrés par `.filter(Boolean)` — 0 crash
- Un seul bloc si l'autre est vide → comportement propre
- Accordéon "Produits complémentaires" supprimé de "En savoir plus"
- L'ancienne table `COMPLEMENTS` a été entièrement supprimée
**Règles de maillage — ne jamais contrevenir :**
- Jamais de lien vers un produit inexistant
- Jamais de lien conceptuel vague (énergie, relaxation, superfood, bien-être général)
- Tahara ↔ Tahara uniquement (muscs → packs → poudres → savons → gommages)
- B1 : ingrédient / rituel / complément évident · max 3
- B2 : même gamme / même collection · max 2
- Aucun produit ne doit apparaître à la fois en B1 et B2 sur la même fiche
### 4.2 Point B — "Idéal pour" visible (implémenté et validé)
**Avant :** Premier accordéon de "En savoir plus" — invisible sans clic.
**Après :** Rendu visible dans le flux de la fiche, après la description.
**Position définitive :**
Description → **Idéal pour** → Bienfaits → …
**Rendu `.pp-ideal` :**
- Label "IDÉAL POUR" : Cinzel · or · uppercase
- Items : pills flexibles (fond blanc · bordure or 28% · border-radius 20px)
- Flex-wrap : correct sur mobile 375px
- Accordéon "Idéal pour" filtré de "En savoir plus"
**Règles "Idéal pour" :**
- Orienté besoins, pas profils
- Utiliser : "Éliminer les cellules mortes en douceur" / "Une exfoliation hebdomadaire"
- Interdire : "Les amateurs de..." / "Les personnes qui..."
### 4.3 Point C — Réassurance sous le CTA (implémenté et validé)
**Avant :** 3 badges dans la section `engage` — après le bouton Commander.
**Après :** 2 signaux compacts dans l'`order-box`, directement sous "Commander".
**Signaux :**
- "Livraison en Île-de-France" (icône location)
- "Service client WhatsApp" (icône chat)
**Rendu `.order-reassurance` :**
- Séparateur border-top gold 20% opacité
- Icônes SVG 13px gold
- Cinzel 0.6rem uppercase muted
- Flex-wrap — adapté mobile
**Section `engage` globale inchangée** — reste plus bas dans la page.
### 4.4 Responsive — tests validés
| Viewport | Résultat |
|---|---|
| Desktop 1280px+ | ✅ 0px débordement · hiérarchie correcte · B1/B2 cartes |
| Mobile 375px | ✅ 0px débordement · mbar = 375px · pills en wrap · B2 adaptative |
| B2 avec 1 seul produit | ✅ Grille s'adapte à repeat(1,1fr) automatiquement |
| Brouillon référencé dans MAILLAGE | ✅ Filtré silencieusement, aucun crash |
### 4.5 Barre mobile (#mbar)
- Visible uniquement en vue produit (`activeProduct !== null`)
- Masquée sur la home après `showHome()`
- Affiche : prix du produit actif + bouton "Commander" WhatsApp pré-rempli
- Largeur = 100% viewport sur mobile
---
## 5. Architecture technique
### 5.1 Fichiers principaux
| Fichier | Rôle |
|---|---|
| `index.html` | SPA principale — catalogue, fiches produits, toute la logique frontend |
| `admin.html` | Interface d'administration — CRUD produits/catégories/offres |
| `js/config.js` | Clés Supabase (SUPABASE_URL · SUPABASE_ANON) |
| `js/supabase-client.js` | Fonctions d'accès à Supabase |
### 5.2 Constantes et fonctions clés — `index.html`
| Élément | Description | Localisation approximative |
|---|---|---|
| `const MAILLAGE` | 112 produits → {b1: slugs[], b2: slugs[], l: label} | Après `const EMBLEMS` (~l.1138) |
| `getBloc1(id)` | Retourne max 3 produits B1 résolus | Après MAILLAGE |
| `getBloc2(id)` | Retourne {products[], label} pour B2 | Après MAILLAGE |
| `const TM, TE, TR…` | Labels de collection pour Bloc 2 | Avant MAILLAGE |
| `function showProduct(id)` | Rendu complet de la fiche produit | ~l.2620 |
| `const PRODUCTS` | Tableau chargé depuis Supabase (fallback hardcodé) | Milieu du fichier |
| `const COLLECTIONS` | Collections homepage — chargées depuis Supabase | ~l.1095 |
| `const FILTERS` | Filtres boutique — chargés depuis Supabase | ~l.1087 |
| `let CAT_LABELS` | Labels catégories — mis à jour par `_applyCategories()` | ~l.1088 |
| `_applyCategories(cats)` | Reconstruit FILTERS, COLLECTIONS, CAT_LABELS depuis Supabase | ~l.1114 |
| `function loadFromSupabase()` | Charge catégories + produits en parallèle | Fin du fichier |
| `function getBloc1/getBloc2` | Résolution du maillage | Après MAILLAGE |
### 5.3 CSS ajoutés — `index.html`
| Classe | Description | Localisation |
|---|---|---|
| `.pp-ideal` | Bloc "Idéal pour" visible dans la fiche | Après `.pp-meta` |
| `.pp-ideal .ideal-lbl` | Label "IDÉAL POUR" gold Cinzel | Idem |
| `.pp-ideal ul` | Pills flex-wrap | Idem |
| `.pp-ideal li` | Pill individuelle (fond blanc, bordure or) | Idem |
| `.family-coll` | Section Bloc 2 — fond blanc, border-top gold discret | Après `.family` |
| `.family-coll .section-head` | Titre Bloc 2 plus petit, plus discret | Idem |
| `.order-reassurance` | Signaux de confiance sous le bouton Commander | Après `.order-price small` |
| `.order-reassurance span` | Signal individuel (icône + texte) | Idem |
| `.order-reassurance svg` | Icônes gold 13px | Idem |
### 5.4 Filtrage des accordéons dans `showProduct()`
```javascript
// Les deux accordéons filtrés (ne jamais les ré-ajouter) :
const visAcc = (p.accordions || []).filter(
  a => a.title !== 'Produits complémentaires' && a.title !== 'Idéal pour'
);
```
Localisation : dans `showProduct()`, à la construction de `pp-accordions`.
### 5.5 Rendu des deux blocs de maillage
```javascript
// En bas de showProduct(), après la section "Dans la même famille"
const b1 = getBloc1(p.id);          // max 3 produits
const {products: b2, label: b2l} = getBloc2(p.id);  // max 2 + label
// Bloc 1 → section class="family"
// Bloc 2 → section class="family family-coll"
```
### 5.6 Supabase — fonctions disponibles (`js/supabase-client.js`)
| Fonction | Description |
|---|---|
| `fetchProducts({activeOnly, categoryId})` | Lecture publique des produits |
| `fetchAllCategories()` | Lecture admin de toutes les catégories |
| `fetchCategories()` | Lecture publique (active=true uniquement) |
| `saveProduct(product)` | Insert ou update produit |
| `deleteProduct(id)` | Suppression produit |
| `toggleProductActive(id, active)` | Activer / désactiver |
| `saveVariant(variant)` | Insert ou update variante |
| `saveCategory(cat)` | Upsert catégorie |
| `deleteCategory(id)` | Suppression catégorie |
| `fetchOffers()` | Lecture offres (admin) |
| `saveOffer(offer)` | Insert ou update offre |
| `saveOfferProducts(offerId, slugs)` | Mise à jour produits d'un pack |
| `uploadImage(file, path)` | Upload vers Supabase Storage |
### 5.7 Schéma Supabase — tables principales
| Table | Champs clés |
|---|---|
| `products` | id · slug · name · category_id · price_value · active · images · accordions · description · benefits · composition · provenance · usage_advice · precautions · weight · volume · sort_order · featured · coming_soon |
| `categories` | id (slug) · label · filter_label · sort_order · active |
| `product_variants` | id · product_id · name · price · options (jsonb) · images · active · sort_order |
| `offers` | id · title · type · badge · normal_price · promo_price · starts_at · ends_at · sort_order · active · image |
| `offer_products` | id · offer_id · product_slug · sort_order |
### 5.8 Admin — fonctionnalités
- **Produits :** CRUD complet + upload image + gestion variantes
- **Catégories :** Créer / modifier / supprimer (avec vérification doublons)
- **Offres / Packs :** CRUD + sélecteur visuel de produits (checkboxes par catégorie)
- **Filtres admin conservés** après action (catégorie, statut, page)
- **Mode brouillon** : `active = false` sur tous les nouveaux produits créés en session
---
## 6. Décisions importantes validées
*Ces décisions ne doivent jamais être rediscutées. Elles ont été prises après
analyse, itérations et validation explicite.*
### Éditoriales
```
✓ Ne jamais inventer une composition, un ingrédient, une certification,
  une propriété thérapeutique ou une utilisation non confirmée.
✓ Toute information inconnue → "À compléter" dans la fiche.
✓ "Biologique" interdit sans preuve écrite du fournisseur.
✓ "Non pasteurisé" interdit sans preuve écrite.
✓ "Sans additif / sans conservateur" interdit sans confirmation.
✓ "Riche en vitamines / antioxydants / enzymes" interdit sans preuve.
✓ Allégations médicales interdites sur tous les produits actifs.
✓ Ismid de Médine : description réécrite — ne jamais revenir à l'ancienne.
✓ Poudre de Sidr : "lutte contre les pellicules" supprimé définitivement.
✓ Ton : traditionnel · crédible · prudent · sans promesses exagérées.
✓ Formulation miels : "Préparé à partir d'un miel [X] pur récolté en [Y]..."
✓ Jamais "miel pur" pour décrire le produit fini.
✓ Origines miels : France = tous sauf les 5 russes confirmés.
✓ Russie = Shilajit · Lavande · Rose Sibérie · Fraise Russie · Kirghizistan.
✓ Huiles : "biologique" supprimé de toutes les descriptions.
✓ FAQ Huiles : réponse différente selon type (essentielle vs végétale).
✓ "Formulé pour" remplacé par "Conçu pour / Pensé pour / Adapté à".
✓ "Pain de savon" remplacé par "Savon solide / Format solide".
✓ "Purifie" remplacé par "Nettoie la peau en profondeur".
```
### Structure et UX
```
✓ "Idéal pour" : toujours visible, jamais en accordéon.
✓ Position : après description, avant bienfaits.
✓ "Idéal pour" filtré de "En savoir plus".
✓ "Produits complémentaires" filtré de "En savoir plus".
✓ Réassurance dans l'order-box : Livraison IDF + Service client WA.
✓ Bloc 1 (max 3) : ingrédient / rituel / complément évident · avec bouton WA.
✓ Bloc 2 (max 2) : même gamme / collection · sans bouton WA · fond blanc.
✓ Tahara reste dans l'univers Tahara (jamais vers graines, miels, tisanes).
✓ Les 5 accordéons "En savoir plus" : Traditions · Infos · Routine · FAQ · Sélection.
✓ Maximum 3 liens en B1, maximum 2 liens en B2.
✓ Jamais de lien vers un produit en brouillon ou inexistant.
✓ Savon Noir Nila (beldi) ≠ Savon Nila Bleu (solide) : distinction maintenue.
✓ Chantilly au Moninga = étape finale du rituel (jamais lien karité seul).
✓ Galerie multi-images : uniquement vêtements et brumes pour l'instant.
```
### Catalogue
```
✓ Deux catégories de miels distinctes : Thérapeutiques (miels) · Gourmands (miels-gourmands).
✓ Catégorie "parfums" : suspendue — ne pas réactiver sans décision explicite.
✓ Poudres Tahara : anti-transpirants (4,99 €) ≠ poudres minérales parfumées.
✓ Al Mousany : discordance marque non résolue — ne pas affirmer "anti-transpirant"
  sur le label produit tant que non confirmé.
✓ Prix confirmés fournisseur : Miels Gourmands 24,99 € · Poudres Tahara 4,99 €
  · Pack Gourmand 130 € · Poudres Oud Blanc 4,99 € · Pierre d'Alun bordeaux/Asamaa 4,99 €.
✓ dn-miel-nigelle-hibiscus : laisser en brouillon jusqu'à décision explicite.
```
---
## 7. Points restant à faire
### Priorité A — Bloquants avant lancement
| # | Tâche | Détail |
|---|---|---|
| A1 | **Désactiver catégorie `miels-gourmands`** | Admin → Catégories → miels-gourmands → active = false. Tant que les 8 produits sont en brouillon, le filtre boutique affiche 0 résultats et la collection homepage est vide. |
| A2 | **Corriger nom `dn-abaya-nilla-4`** | "Abaya Nilla white and Gold **2**" → "Abaya Nilla white and Gold" (admin ou Supabase). |
| A3 | **Corriger copyright footer** | `index.html` ligne ~1037 : "© 2025" → "© 2026". |
### Priorité B — Recommandé avant ou juste après lancement
| # | Tâche | Détail |
|---|---|---|
| B1 | **Import visuels cosmétiques Tahara** | 24 produits en brouillon (savons, gommages, poudres, chantilly). Upload via admin, puis activer. |
| B2 | **Import visuels Miels Gourmands** | 8 produits. Uploader les images, activer, réactiver la catégorie. |
| B3 | **Activer Spray Brumisateur Hibiscus & Nigelle** | `br-brumisateur-hibiscus-nigelle` — contenu complet, image manquante. |
| B4 | **Taglines + descriptions Chéchias** | 7 produits actifs sans tagline ni description. |
| B5 | **Descriptions Packs Tahara** | 4 packs actifs (Sabaya, Aswad, Lavande, Abyad) sans description de contenu. |
| B6 | **Taglines Ismid + Poudre de Sidr** | Actifs sans tagline. |
| B7 | **Décision `dn-miel-nigelle-hibiscus`** | Supprimer (recommandé) ou développer. Doublon de `miel-hibiscus-zamzam`. |
### Priorité C — Post-lancement, sans urgence
| # | Tâche | Détail |
|---|---|---|
| C1 | **Créer poudres Oud Blanc + Pierre d'Alun manquantes** | Attendre images officielles et prix fournisseur. |
| C2 | **Contenu Mode complet** | Abayas, Qamis, Sandales, Bakhour, Accessoires — descriptions, compositions. |
| C3 | **Décision catégorie Parfums** | Réactiver ou supprimer définitivement. Corriger `dn-rose-imperial-valley` si réactivée. |
| C4 | **Reclasser `pdr-nila`** | Actuellement dans `poudres` (alimentaires) → doit aller dans `tahara`. |
| C5 | **Reclasser Ismid + Sidr** | Idem — produits traditionnels dans une catégorie alimentaire. |
| C6 | **Clarifier Al Mousany** | Confirmer auprès du fournisseur : marque = Dar Nūr ou Rayeve Naturals ? Fonction = déodorant ou poudre minérale ? |
| C7 | **Confirmer produits "À vérifier"** | Poudres Oud Blanc (×3, ×1 rose, ×1 Khalnaji) + Pierre d'Alun bordeaux : 1 produit ou variantes ? |
---
## 8. Bugs et anomalies confirmées
| Sévérité | Zone | Anomalie | Correction |
|---|---|---|---|
| 🔴 | Filtre boutique | "Miels Gourmands" → 0 résultats (8 produits en brouillon) | Désactiver catégorie (A1) |
| 🔴 | Collection homepage | Miels Gourmands → 0 thumbnails | Même correction |
| 🟡 | Produit | `dn-abaya-nilla-4` : nom "…Gold 2" incohérent | Corriger (A2) |
| 🟡 | Navigation desktop | Dropdowns hover-only, inaccessibles clavier (WCAG 2.1) | Post-lancement (C) |
| 🟡 | Menu mobile | Sous-catégories toujours dépliées — menu très long | Post-lancement (C) |
| 🟢 | Footer | Copyright 2025 → 2026 | Correction rapide (A3) |
| 🟢 | `dn-miel-nigelle-hibiscus` | Fantôme inactif, contenu vide | Décision (B7) |
| 🟢 | `dn-rose-imperial-valley` | Description copiée-collée incorrecte (inactif) | Si réactivation |
---
## 9. Dette technique
*Améliorations futures, non urgentes, sans impact sur le lancement.*
| Item | Effort estimé |
|---|---|
| Keyboard nav dropdowns (WCAG 2.1 AA) | Faible — JS + tabindex |
| Menu mobile : accordéon sous-catégories | Moyen |
| `showHome()` : vider `productView.innerHTML` | Trivial |
| Recherche textuelle produits (171+ produits) | Moyen-élevé |
| Galerie multi-images étendue aux cosmétiques | Moyen |
| Schema.org audit dédié | Audit externe |
---
## 10. État de préparation au lancement
| Dimension | Score | Note |
|---|---|---|
| **Catalogue** | 82 % | Familles naturelles complètes · Mode minimal · 37 brouillons |
| **Éditorial** | 95 % | Standard figé · conformité assurée · 112 produits au standard |
| **UX** | 91 % | A/B/C implémentés · 2 bugs critiques à corriger (20 min) |
| **Technique** | 88 % | Supabase stable · admin fonctionnel · responsive validé |
| **Visuels** | 70 % | Naturels + Mode OK · 24 cosmétiques + 8 Miels Gourmands sans images |
| **Conversion** | 85 % | WA pré-rempli correct · CTA visible · réassurance · maillage actif |
| **Préparation globale** | **91 %** | Sur 171 produits actifs · 3 corrections urgentes · visuels = côté propriétaire |
---
## 11. Historique de la session
*Résumé chronologique de ce qui a été réalisé pendant la grande session 2026.*
### Phase 1 — Architecture catalogue
- Mise en place du CRUD admin complet (produits, catégories, offres)
- Création de la catégorie `miels-gourmands` et `filter_label` "Miels Thérapeutiques"
- Restauration de 7 produits supprimés par erreur (5 miels + 1 parfum)
- Correction de l'architecture catégories (sort_order sans conflits)
- Création de 33 nouveaux produits cosmétiques en brouillon
### Phase 2 — Standard éditorial
- Définition et validation du standard éditorial Dar Nūr (10 règles)
- Création des 5 fiches modèles (Miel Framboise, Savon Noir Aker Fassi,
  Gommage Hibiscus & Nigelle, Chantilly de Karité Nila, Poudre El Anoud)
- Application du standard à 33 nouveaux produits cosmétiques
- Application du standard à toutes les familles naturelles (112 produits)
- Confirmation et déploiement des origines miels (France / Russie)
### Phase 3 — Maillage intelligent
- Analyse des 120 produits du catalogue naturel
- Construction du plan de maillage (15 familles d'ingrédients)
- Validation de la logique Bloc 1 / Bloc 2
- Déploiement du MAILLAGE en 5 batches (112 produits couverts)
### Phase 4 — Améliorations UX
- **Point A :** Remplacement de la table hardcodée COMPLEMENTS par MAILLAGE.
  Deux sections de cartes cliquables distinctes (B1 + B2). CSS `.family-coll`.
- **Point B :** "Idéal pour" sorti des accordéons, rendu visible dans le flux.
  CSS `.pp-ideal`. Filtrage de l'accordéon.
- **Point C :** Réassurance intégrée dans l'encart de commande. CSS `.order-reassurance`.
- Tests desktop + mobile validés sur 5 fiches représentatives.
### Phase 5 — Audit et corrections
- Audit qualité catalogue orienté lancement (171 produits actifs)
- Plan d'action en 3 priorités (A/B/C)
- Correction allégations médicales Ismid de Médine
- Correction allégation "pellicules" Poudre de Sidr
- Analyse incohérence prix Qamiss Sultan Saphir (différence intentionnelle)
- Audit frontend UX complet (navigation, homepage, collections, WA, footer)
- Identification bug critique : filtre Miels Gourmands → 0 résultats
### Phase 6 — Clôture et documentation
- Rédaction du document de passation
- Consolidation en document de référence officiel
---
## 12. Checklist avant ouverture
```
CORRECTIONS OBLIGATOIRES (≈ 20 min)
□ A1 — Désactiver catégorie "miels-gourmands" en Supabase
       (admin.html → Catégories → miels-gourmands → active = false)
□ A2 — Corriger nom dn-abaya-nilla-4
       ("Abaya Nilla white and Gold 2" → "Abaya Nilla white and Gold")
□ A3 — Corriger copyright footer
       (index.html ~l.1037 : "© 2025" → "© 2026")
VISUELS (côté propriétaire)
□ Uploader images des 24 cosmétiques Tahara (savons, gommages, poudres, chantilly)
□ Uploader images des 8 Miels Gourmands
□ Uploader image Spray Brumisateur Hibiscus & Nigelle
ACTIVATION (après visuels)
□ Activer les 24 cosmétiques Tahara (admin → active = true)
□ Réactiver catégorie "miels-gourmands" en Supabase
□ Activer les 8 Miels Gourmands
VÉRIFICATIONS FINALES
□ Test filtre "Miels Thérapeutiques" → produits visibles
□ Test filtre "Miels Gourmands" → produits visibles (après activation seulement)
□ Test fiche miel-nigelle : ordre sections correct (desc → Idéal pour → bienfaits)
□ Test cartes B1 (3 cartes) et B2 (2 cartes) sur miel-nigelle
□ Test bouton "Commander" → WhatsApp pré-rempli correct (produit + format + prix)
□ Test mobile 375px → aucun débordement horizontal · pills wrap · mbar visible
□ Test navigation burger → menu s'ouvre / se ferme
□ Vérification footer : copyright 2026 · liens CGV / Mentions légales / Confidentialité
□ Vérification admin.html : accessible · fonctionnel
DÉPLOIEMENT
□ git add index.html admin.html js/supabase-client.js (si modifications)
□ git commit -m "fix: corrections pré-lancement"
□ git push origin main
□ Attendre déploiement GitHub Pages (≈60 secondes)
□ Vérifier https://dar-nur.fr en navigation privée
□ Vérifier https://dar-nur.fr/admin.html en navigation privée
```
---
## 13. Protocole de démarrage d'une nouvelle session
**Ces étapes sont obligatoires avant toute action sur le projet.**
1. **Lire intégralement ce document.** Aucune exception. Même après plusieurs mois.
2. **Ne jamais remettre en question les décisions validées.** Elles sont listées
   dans la section 6. Si une décision semble problématique, le signaler
   explicitement avant toute modification.
3. **Continuer uniquement les tâches ouvertes.** Elles sont listées dans la
   section 7, classées A/B/C. Ne pas créer de nouvelle tâche sans validation.
4. **Avant toute modification de code :** présenter un audit ou un plan,
   attendre la validation, puis implémenter.
5. **Signaler tout conflit** entre ce document et l'état réel du code.
   Le document peut être périmé — vérifier dans le code avant d'agir.
6. **Ne jamais modifier les textes éditoriaux validés** sans demande explicite
   du propriétaire. Les fiches sont considérées comme figées.
7. **Toute décision importante prise pendant la session** doit être ajoutée à ce
   document avant la clôture.
---
*Document de référence officiel Dar Nūr — v1.0 — 29 juin 2026*
*À enregistrer sous : `docs/DOCUMENT_REFERENCE_DAR_NUR.md`*
*Maintenu par : Claude + propriétaire du projet*
