# Audit Complet du Menu de Navigation — Dar Nūr

**Date** : 2026-07-13
**Périmètre** : header/nav de `index.html` (homepage SPA) + composant nav des 14 pages catégories statiques (vérifié en détail sur `miels/index.html`, structure partagée par gabarit).
**Méthode** : lecture intégrale du code (HTML/CSS/JS du menu), mesures empiriques en production (https://dar-nur.fr) via navigateur Chromium piloté (DOM réel, styles calculés, géométrie, simulation d'événements) à 390×844, 800×800, 1024×800 et 1280×800.
**Aucune modification implémentée** — audit strictement en lecture seule.

## Limites de vérification (à déclarer honnêtement)

- **Captures d'écran** : le renderer du navigateur intégré de cette session n'a pas pu produire de screenshots (timeouts systématiques). Tous les constats visuels reposent sur des **mesures DOM/styles calculés réelles en production**, pas sur des images. Les mesures géométriques (hauteurs, positions, découpes) sont des faits ; les jugements purement esthétiques (harmonie, « luxe ressenti ») restent des appréciations d'expert sur la base des tokens et de la géométrie.
- **Navigateurs réels** : mesures faites dans Chromium uniquement. Safari iOS (barre d'URL dynamique + `100vh`), Firefox et Android réels **non testés** — les risques associés sont signalés comme hypothèses.
- **Test tactile physique** (une main, gestes) : non réalisable dans cette session.

---

# 1. Audit Visuel

**Faits vérifiés (tokens et géométrie réels)** :
- Header sticky vert forêt `rgba(13,31,22,.97)` + `backdrop-filter:blur(8px)`, filet or `rgba(200,168,75,.22)`. Hauteur mesurée : **85px** (homepage, ≥1024px), **81px** (pages catégories) — deux hauteurs différentes pour « le même » composant.
- Logo 52×52px, cadre or, bloc marque « DAR NŪR » (Cinzel 1.35rem, letter-spacing .18em) + « دار النور » (Cormorant, or). Hiérarchie logo/liens claire.
- Liens : Cinzel .74rem (**≈11,8px**) uppercase, letter-spacing .16em, crème opacité .82, hover or. C'est un choix typographique premium classique (petites capitales espacées), mais 11,8px est sous le plancher de confort de lecture de 12px.
- Contraste : or `#c8a84b` sur vert `#0d1f16` ≈ **7,4:1**, crème sur vert bien au-delà — excellent (calculé, non supposé).
- Dropdowns « Bien-être »/« Mode » : **aucun indicateur visuel** (pas de chevron, pas de caret, aucune règle `::after`) — rien ne distingue un déclencheur de dropdown d'un lien simple.
- `padding:4px 0;position:relative` sur les liens suggère un soulignement animé jamais implémenté (aucun `::after` n'existe) — échafaudage abandonné.

**Verdict** : sur desktop ≥1024px, le header inspire confiance et paraît réellement sur mesure (pas un template : tokens propres, bilinguisme FR/arabe assumé, cohérence émeraude/or). Ce qui trahit un site non finalisé : l'absence d'affordance des dropdowns, l'absence d'animation d'ouverture, et surtout l'état du menu mobile des pages catégories (voir §5).

# 2. Audit Branding

- Cohérence couleurs/typo/logo : **forte**. Le header est l'endroit du site où l'identité « Émeraude & Or » est la plus aboutie. Le bloc marque bilingue est un vrai différenciateur.
- Ce qui réduit la valeur perçue, par ordre de gravité :
  1. Le **burger en rectangle gris standard** (`background:#f0f0f0`, `border:2px outset`) sur les 14 pages catégories mobile — mesuré en production sur `/miels/`. C'est l'anti-premium absolu, sur des pages d'entrée SEO.
  2. Le menu qui **change de comportement selon la page** (overlay et animation X sur la homepage, rien sur les catégories) — une marque premium a UN menu.
  3. L'entrée « Qui sommes-nous ? » à côté de « Notre histoire » : deux entrées quasi synonymes qui diluent le menu (une maison premium raconte une histoire, elle ne fait pas deux rubriques pour ça).

# 3. Audit UX

- **Ordre** : Boutique → Bien-être → Mode → Notre histoire → Qui sommes-nous ? → FAQ → Avis. Le commerce d'abord : bon. Mais 4 entrées éditoriales sur 7 : le menu parle plus de la marque que du catalogue.
- **Couverture catalogue (fait vérifié)** : le méga-menu homepage n'expose que **8 des 14 catégories réelles**. Absents de toute navigation : Tahara & Hygiène, Bakhour & Encens, Bijoux, Chaussures, Chechias, Accessoires, Miels Gourmands, Miels du terroir. Ces catégories n'existent que via la section « Collections » ou le footer — un visiteur qui cherche du bakhour depuis le menu ne le trouvera jamais.
- **Nav des pages catégories** : n'a même pas l'entrée « Parfums » (vérifié par script sur les 18 pages : seule la homepage l'a). Un client sur `/miels/` ne peut pas naviguer vers les parfums via le menu.
- **Charge cognitive** : dropdowns sans indicateur → l'utilisateur découvre par accident que « Bien-être » s'ouvre. « Boutique » (tout) vs « Bien-être/Mode » (sous-ensembles) vs « Collections » (section homepage) : trois logiques d'accès au même catalogue.
- Après clic, le menu mobile se ferme correctement (vérifié : `goCat()` et `showHome()` appellent `closeMenu()`).

# 4. Audit Desktop

Vérifié en production à 1280×800 et 1024×800 :
- **Sticky : fonctionne** (header reste à `top:0` après scroll — le chantier `nav-portal`/retrait d'`overflow-x:hidden` est bien déployé sur `index.html`, contrairement à ce que dit encore `docs/ARCHITECTURE_DAR_NUR.md`).
- Alignements/équilibre corrects à ≥1024px, aucun débordement horizontal (scrollWidth = clientWidth).
- **Hover dropdown : ouverture/fermeture instantanée** (`display:none` ↔ `flex`) — aucune transition possible sur `display`. Aucun délai de tolérance à la sortie du hover : un écart de trajectoire de souris ferme le menu instantanément (le `padding-bottom:12px` du parent fait pont, mais uniquement verticalement).
- **Focus : rien** — voir §12, c'est le point noir.
- Ancres : seuls `#qui-sommes-nous`, `#faq`, `#avis-clients` ont `scroll-margin-top:80px` — pour un header de **85px** (5px de titre mangés). `#histoire` et `#boutique` n'en ont **pas** : arrivée d'une page catégorie via `https://dar-nur.fr/#histoire`, le haut de section atterrit sous le header sticky.

# 5. Audit Mobile

Mesuré en production à 390×844 (iPhone 12–14) :

**Homepage** :
- Burger 40×32px (**sous les 44×44 WCAG/Apple**), mais correctement stylé (3 barres or, animation X au clic — vérifié).
- **Bug critique mesuré** : panneau `top:69px` alors que le header fait **85px** → les 16 premiers px du panneau passent sous le header. Et surtout : contenu du menu = **850px** pour un panneau de **775px**, avec `overflow-y:visible` et un parent `overflow:clip` → **« FAQ » est coupé à moitié et « Avis » est totalement inatteignable** (bottom mesuré à 919px pour un viewport de 844px). À 360×640 ou en paysage, c'est la moitié du menu qui disparaît. Les pages catégories, elles, ont `overflow-y:auto` — la homepage ne l'a pas.
- Overlay sombre ✓ (z-index 95), fermeture au clic extérieur ✓ (vérifié par simulation), fermeture après clic sur lien ✓.
- **Pas de fermeture Escape** (vérifié : l'événement ne ferme rien), **pas de verrouillage du scroll d'arrière-plan** (body reste scrollable menu ouvert), pas de focus trap.
- Liens 55px de haut : bonnes zones tactiles ✓.

**Pages catégories (mesuré sur `/miels/` en production)** :
- **Burger = rectangle gris à bordure `outset` noire** (`rgb(240,240,240)` mesuré). Cause : le reset `button,select{font-family:inherit;cursor:pointer}` de ces pages omet `border:none;background:none` (présents sur la homepage). Bug documenté depuis le 2026-07-07, toujours en production.
- **Pas d'overlay** (`::after` content:none), **pas de fermeture au clic extérieur** (vérifié : le menu reste ouvert), **pas d'animation X** du burger. Ici `top:81px` = hauteur réelle du header (correct) et `overflow-y:auto` présent (correct).

**Verdict** : le menu mobile n'est pas digne d'une marque premium en l'état — non pas par son design (le panneau vert/or est réussi) mais par ses bugs (menu coupé homepage, burger gris catégories) et l'écart de comportement entre pages.

# 6. Audit Responsive

| Largeur | Constat mesuré |
|---|---|
| 360px | Même structure que 390px, découpe du menu mobile homepage encore pire (hypothèse géométrique directe, non re-mesurée) |
| 390px | Menu mobile homepage coupé (FAQ/Avis inaccessibles) — **mesuré** |
| 768px | Bascule burger (breakpoint) — cohérent sur toutes les pages |
| **769–~1000px** | **Zone cassée mesurée à 800px** : « Qui sommes-nous ? » sur 3 lignes, « Bien-être »/« Notre histoire » sur 2 lignes, header gonflé à 101px, baselines décalées (y de 16 à 36px). L'iPad portrait (768–834px) tombe en plein dedans |
| 1024px | Une ligne, header 85px — **mesuré, correct** |
| 1280px | Correct — **mesuré** |
| 1920px | Non mesuré ; `nav{max-width:1240px}` centré, pas de risque identifié dans le code |

Cause de la zone 769–1000px : 7 items desktop + `gap:34px` + brand ≈ nécessitent ~1000px, mais le breakpoint mobile est à 768px. Conflit classique de menu trop chargé pour son breakpoint.

# 7. Audit HTML

Faits vérifiés sur `index.html` :
- Bon : `<header>` + `<nav>` + `<button class="burger">` (vrai bouton) + `aria-label="Menu"`.
- **5 `<a>` sans `href`** (Boutique, Notre histoire, Qui sommes-nous ?, FAQ, Avis) pilotés par `onclick` → non focusables, non annoncés « lien » par les lecteurs d'écran, pas de clic-molette/nouvel onglet, invisibles au crawl en tant que liens.
- **Pas de `<ul>/<li>`** : la nav est une suite de `<div>`/`<a>` — les lecteurs d'écran perdent le dénombrement des items.
- Déclencheurs de dropdown = `<div class="nav-dropdown-title">` : ni `<button>`, ni `role`, ni `tabindex`, ni `aria-expanded`, ni `aria-haspopup`.
- Burger : pas d'`aria-expanded` ni d'`aria-controls="navLinks"` (le seul `aria-expanded` du fichier est sur l'accordéon FAQ).
- Logo : `<div class="brand" onclick="showHome()">` — pas un lien, pas focusable. Sur les pages catégories c'est un vrai `<a href>` : la homepage est ici moins bien que ses copies.
- `id="well-being"` et `id="mode"` : jamais référencés (ni CSS, ni JS, ni ancre) — attributs morts.
- Pas de skip-link « Aller au contenu ».
- En passant (hors menu) : `<meta name="google-site-verification" content="REMPLACER_PAR_VOTRE_VALEUR_EXISTANTE">` — un placeholder est en production.

# 8. Audit CSS

- **Accolade orpheline** : le `<style>` de `index.html` contient 469 `{` pour 470 `}` (le `}` excédentaire est ligne 810, juste avant `</style>`). Sans effet fonctionnel (fin de feuille) mais témoin d'éditions non relues.
- **Styles du menu mobile éclatés en deux blocs `@media(max-width:768px)`** distincts (lignes ~162–169 pour les dropdowns, ~760–798 pour le panneau) — la compréhension du composant exige de lire deux endroits.
- **`!important` défensifs** : `position:static !important;display:flex !important;visibility:visible !important;opacity:1 !important` (ligne 165) — verrouillages contre des règles qui n'existent plus (aucune règle `visibility`/`opacity` sur `.nav-dropdown-menu` desktop) ; reliquat d'une version animée abandonnée.
- **Transitions incohérentes** : liens nav `.25s opacity,color` ; items dropdown `all .2s` (anti-pattern `all`) ; panneau mobile `.35s` ; burger `.3s`. Quatre durées pour un même composant.
- z-index du menu : 90 (mbar) / 95 (overlay) / 96 (portal) / 100 (header) / 101 (dropdown) / 1000 (modals) — hiérarchie fonctionnelle mais ad hoc, sans échelle documentée.
- Duplication inter-pages : le CSS du menu est **copié-collé dans 15+ fichiers** avec des divergences réelles (reset bouton, `top` du panneau, `overflow-y`, présence de l'overlay). C'est la cause racine de la dérive constatée.

# 9. Audit JavaScript

- Logique minimale et globalement saine : `toggleMenu()`/`closeMenu()` (3 classList), un seul listener `document.click` pour le clic extérieur, pas de listener `resize`/`scroll` attaché au menu (le `resize`→`syncBar` concerne la barre produit mobile). Pas de fuite mémoire ni de double-binding détectable (bindings uniques au chargement).
- **Code mort vérifié** : `const _origShowProduct=showProduct, _origShowHome=showHome;` (ligne 3116) — jamais utilisés.
- **Manques** : aucun handler `Escape` ; pas de gestion du focus (ouverture burger ne déplace pas le focus, fermeture ne le restitue pas) ; pas d'`aria-expanded` synchronisé ; pas de fermeture du menu si on repasse en desktop menu ouvert (resize 768→1024 : la classe `open` reste posée — sans effet visible car le CSS desktop reprend la main, mais état incohérent).
- Pages catégories : le JS menu se réduit à un toggle de classe — ni fermeture extérieure, ni Escape, ni animation, ni overlay. Divergence de comportement pur (le HTML/CSS serait prêt à faire mieux).
- Fragilité : la navigation homepage repose sur `onclick` inline + `setTimeout(...,60)` pour scroller après `showHome()` — dépendance à un délai magique ; si le rendu prend >60ms le scroll part avant la mise en page (risque faible mais réel sur mobile bas de gamme).

# 10. Audit Fonctionnel

| Cas | Homepage | Pages catégories |
|---|---|---|
| Ouverture / fermeture burger | ✓ vérifié | ✓ vérifié |
| Animation burger → X | ✓ | ✗ (aucune) |
| Clic extérieur ferme | ✓ vérifié | ✗ **vérifié : reste ouvert** |
| Clic sur lien ferme | ✓ (`closeMenu()` dans `goCat`/`showHome`) | s.o. (navigation réelle) |
| Escape ferme | ✗ **vérifié : non** | ✗ |
| Double-clic rapide | ✓ (toggle idempotent) | ✓ |
| Navigation clavier | ✗ **rien d'atteignable** (desktop) | partielle (liens `href` réels focusables, dropdowns inaccessibles) |
| Tous les liens atteignables au doigt | ✗ **FAQ/Avis coupés à 390×844** | ✓ (`overflow-y:auto`) |
| Scroll d'arrière-plan verrouillé menu ouvert | ✗ | ✗ |
| Retour arrière navigateur | Les vues SPA ne poussent pas d'état d'URL (pas de changement de hash constaté au clic nav) → Back quitte le site depuis la homepage. Non testé exhaustivement | ✓ (vraies pages) |
| Changement d'orientation | Non testable ici ; risque réel : en paysage (~390px de haut), le menu homepage non scrollable perd la majorité de ses items (géométrie certaine) | ✓ (scrollable) |
| Safari iOS `100vh` | Hypothèse non testée : `height:calc(100vh - 69px)` sous-estime la zone utile quand la barre d'URL Safari est déployée — aggrave la découpe | idem |

# 11. Audit Performance

- Le menu lui-même est **léger** : ~60 lignes de CSS utiles, ~20 lignes de JS, aucun listener coûteux, animations en `transform`/`opacity` (compositables, pas de reflow). `backdrop-filter:blur(8px)` sur header + dropdown : coût GPU modéré, standard.
- Aucune erreur console en production (vérifié).
- **CLS/FOUT** : la nav dépend de Cinzel (Google Fonts, `display=swap`, CSS distant render-blocking). Au premier chargement, les libellés s'affichent en serif système puis basculent — léger shift dans le header, zone la plus visible du site. Non mesuré (pas de run Lighthouse dans cette session), mécanisme certain.
- Logo `logo-dar-nur.png` 1024×1024 affiché à 52px (21 Ko — acceptable, optimisable en 128px WebP + `fetchpriority`).
- Le vrai coût de perf du header n'est pas d'exécution mais de **maintenance** : 15+ copies divergentes.

# 12. Audit Accessibilité — le point le plus grave

Faits tous vérifiés en production :
1. **Desktop : navigation 100% inaccessible au clavier.** Les 5 entrées de premier niveau sont des `<a>` sans `href` (non focusables) ; les 8 liens catégories vivent dans des menus `display:none` ouverts uniquement par `:hover` (un élément `display:none` n'est pas focusable ; aucune règle `:focus-within` n'existe dans tout le fichier). Un utilisateur clavier ou de lecteur d'écran **ne peut atteindre aucune destination depuis le menu**. Échec WCAG 2.1.1 (Keyboard), 2.4.7 (Focus Visible — une seule règle `:focus-visible` dans tout le site, hors nav), 4.1.2 (Name/Role/Value des dropdowns).
2. Burger sans `aria-expanded`/`aria-controls` ; état ouvert/fermé invisible aux technologies d'assistance.
3. Zone tactile burger 40×32px < 44×44 (WCAG 2.5.8 / HIG).
4. Pas de liste `<ul>`, pas d'`aria-label` sur le `<nav>` principal (celui du breadcrumb catégorie en a un, lui), pas de skip-link, pas d'`aria-current` sur la page courante.
5. Pas de gestion Escape ni de focus trap dans le panneau mobile.
6. Contraste : conforme (7,4:1 minimum mesurable sur les états or/vert) — seul point pleinement acquis.

# 13. Audit SEO

- Les 8 liens catégories du méga-menu homepage sont de vrais `href` ✓ (bon maillage vers les pages statiques SEO).
- **6 catégories + 2 pages miels dérivées sans aucun lien de menu** (cf. §3) : profondeur de crawl et PageRank interne affaiblis pour `/tahara/`, `/bakhour/`, `/bijoux/`, `/chaussures/`, `/chechias/`, `/accessoires/`, `/miels-gourmands/`, `/miels-terroir/`.
- `/parfums/` n'est lié par la nav **que** depuis la homepage (vérifié sur les 18 autres pages) — le hub multimarques fraîchement publié est quasi orphelin dans le maillage de navigation.
- Les 5 entrées `onclick` sans `href` n'apportent aucun signal (Boutique, histoire, FAQ, Avis) alors que `#faq`/`#avis-clients` existent comme ancres réelles.
- Header homepage vs catégories : structure différente — pas pénalisant en soi, mais le bloc marque non-lien sur la homepage prive d'un lien retour standard.

# 14. Benchmark Premium (Aesop, Diptyque, Buly, SMN, Frama, Apple, Hermès)

Ce que ces maisons ont et que Dar Nūr n'a pas encore :
- **Un seul menu, identique partout** (Dar Nūr : 2 implémentations divergentes + variantes).
- **Micro-transitions soignées** : fondu/glissement à l'ouverture des dropdowns (Dar Nūr : apparition brute `display:flex`), délai de tolérance au hover, easing travaillé.
- **Affordance** : chevrons ou soulignements animés signalant l'interactif.
- **Accessibilité irréprochable** — chez Apple ou Aesop, tout le menu se parcourt au clavier avec focus visible ; c'est devenu un marqueur de qualité perçue autant que légal.
- **Fiabilité absolue du geste mobile** : jamais un item coupé, jamais un bouton système gris.
Là où Dar Nūr est au niveau : la matière (palette émeraude/or, Cinzel espacé, bilinguisme, filet or, blur) est une vraie direction artistique, pas un template.

# 15. Dette Technique

1. **Duplication 15× du composant nav** avec divergences accumulées (reset bouton, offsets, overlay, entrées de menu) — chaque évolution du menu exige 15 éditions manuelles ; la dérive constatée prouve que ce process échoue déjà.
2. Deux blocs media-query pour un même composant + `!important` fossiles.
3. Code mort : `_origShowProduct`/`_origShowHome`, ids `well-being`/`mode`, `position:relative` sans `::after`, accolade orpheline.
4. Offsets magiques codés en dur (`top:69px`, `top:81px`, `scroll-margin-top:80px`) désynchronisés des hauteurs réelles (85px/81px/101px selon page et largeur).
5. Navigation homepage par `onclick`+`setTimeout(60)` : fragile, non testable, non crawlable.
6. `docs/ARCHITECTURE_DAR_NUR.md` en retard sur la réalité (dit que l'Option A n'est pas déployée sur `index.html`, que le footer lie Parfums→/tahara/, qu'il n'y a pas d'entrée Parfums au méga-menu — les trois sont désormais faux, vérifiés).

---

# 16. Rapport Final — problèmes détaillés

### P1 — Menu mobile homepage : items terminaux inaccessibles
- **Observation** : à 390×844, le contenu du panneau (850px) dépasse sa hauteur (775px) sans défilement (`overflow-y:visible`, parent `overflow:clip`). « FAQ » est tronqué, « Avis » est hors écran (bottom 919px > 844px). Panneau positionné à `top:69px` sous un header de 85px.
- **Cause** : offset codé en dur jamais recalé après évolution du header ; `overflow-y:auto` présent sur les pages catégories mais oublié sur la homepage.
- **Impact** : fonctionnalité perdue (2 entrées inatteignables), pire sur petits écrans/paysage ; crédibilité.
- **Gravité** : Critique. **Priorité** : Haute.
- **Recommandation** : aligner l'offset sur la hauteur réelle du header (ou la calculer), ajouter le défilement interne du panneau, verrouiller le scroll d'arrière-plan menu ouvert. Tester à 360/390/paysage/Safari iOS.

### P2 — Navigation desktop inaccessible au clavier (WCAG)
- **Observation** : aucun élément du menu homepage n'est focalisable au Tab (liens sans `href`, dropdowns `display:none` hover-only, aucun `:focus-within`, un seul style `:focus-visible` sur tout le site).
- **Cause** : nav construite pour la souris/SPA (`onclick`), dropdowns CSS hover purs.
- **Impact** : exclusion des utilisateurs clavier/lecteur d'écran ; risque de non-conformité (RGAA/EAA — l'European Accessibility Act s'applique au e-commerce depuis juin 2025) ; marqueur de qualité pour un site premium.
- **Gravité** : Critique. **Priorité** : Haute.
- **Recommandation** : donner de vrais `href` à toutes les entrées (les ancres existent), transformer les titres de dropdown en boutons avec `aria-expanded`/`aria-haspopup`, ouvrir aussi au focus, définir un style de focus visible cohérent avec l'or de la marque.

### P3 — Burger « rectangle gris » sur les 14 pages catégories
- **Observation** : en production sur `/miels/` (mobile), le bouton burger affiche `background:rgb(240,240,240)` et `border:2px outset` (styles navigateur par défaut).
- **Cause** : reset `button{border:none;background:none}` présent sur la homepage, absent du gabarit des pages catégories. Connu depuis 2026-07-07, jamais corrigé.
- **Impact** : premier contact mobile avec toutes les pages d'atterrissage SEO = un bouton d'apparence Windows 95. Le défaut le plus visible de tout le site.
- **Gravité** : Critique (image). **Priorité** : Haute.
- **Recommandation** : compléter le reset bouton dans le gabarit des pages catégories (14 fichiers).

### P4 — Zone morte responsive 769–~1000px
- **Observation** : à 800px, liens sur 2–3 lignes, header à 101px, baselines décalées. iPad portrait concerné.
- **Cause** : 7 items desktop nécessitent ~1000px ; breakpoint burger fixé à 768px.
- **Impact** : rendu cassé sur tablette, format courant en consultation e-commerce du soir.
- **Gravité** : Élevée. **Priorité** : Haute.
- **Recommandation** : remonter le breakpoint burger à ~1024px, ou alléger le menu desktop (fusionner les entrées éditoriales) pour qu'il tienne à 768px.

### P5 — Deux menus différents pour un même site
- **Observation** : homepage (overlay, clic extérieur, X animé, entrée Parfums) vs pages catégories (rien de tout cela, pas d'entrée Parfums) ; hauteurs de header 85 vs 81px ; `overflow-y` géré sur l'un, pas l'autre.
- **Cause** : composant copié-collé dans 15+ fichiers sans source unique.
- **Impact** : incohérence perceptible en navigation croisée ; chaque correction devient 15 corrections ; les bugs P1/P3 sont des conséquences directes.
- **Gravité** : Élevée. **Priorité** : Haute (cause racine).
- **Recommandation** : unifier le composant (même HTML/CSS/JS partout — au minimum par convention stricte de gabarit, idéalement par extension du pipeline de génération déjà existant pour les parfums).

### P6 — Couverture catalogue incomplète dans le menu
- **Observation** : 6 catégories réelles + 2 pages miels dérivées sans aucune entrée de navigation ; « Parfums » absent de la nav de 18 pages sur 19.
- **Cause** : le menu n'a pas suivi l'expansion du catalogue (14 catégories, hub parfums).
- **Impact** : ventes (découvrabilité nulle au menu), SEO (maillage), image (catalogue paraissant plus petit qu'il n'est).
- **Gravité** : Élevée. **Priorité** : Haute.
- **Recommandation** : redéfinir l'architecture du menu (ex. « Bien-être », « Parfums & Senteurs », « Mode & Accessoires ») couvrant les 14 catégories, et la déployer uniformément.

### P7 — Comportements d'usage manquants (Escape, scroll-lock, focus)
- **Observation** : Escape ne ferme pas le menu ; l'arrière-plan défile menu ouvert ; le focus n'est ni déplacé ni restitué ; `aria-expanded` absent.
- **Gravité** : Élevée. **Priorité** : Moyenne.
- **Recommandation** : compléter le JS du menu (une dizaine de lignes) et le déployer partout.

### P8 — Dropdowns sans affordance ni transition
- **Observation** : aucun chevron ; apparition/disparition instantanées ; fermeture au moindre écart de souris.
- **Gravité** : Moyenne. **Priorité** : Moyenne.
- **Recommandation** : chevron fin (cohérent avec l'accordéon FAQ qui en a déjà un), transition opacity/translate 150–200ms, délai de fermeture ~150ms.

### P9 — Ancres sous le header sticky
- **Observation** : `#histoire`/`#boutique` sans `scroll-margin-top` ; les trois autres à 80px pour un header de 85px.
- **Gravité** : Moyenne. **Priorité** : Moyenne.
- **Recommandation** : `scroll-margin-top` global aligné sur la hauteur réelle du header pour toutes les cibles d'ancre.

### P10 — Burger 40×32px
- **Observation** : sous le minimum tactile 44×44.
- **Gravité** : Moyenne. **Priorité** : Moyenne.
- **Recommandation** : augmenter le padding du bouton (cible ≥44px) sans changer le dessin.

### P11 — Sémantique HTML du menu
- **Observation** : pas de `<ul>/<li>`, déclencheurs `<div>`, logo homepage non-lien, ids morts, pas de skip-link, pas d'`aria-label` sur le nav principal.
- **Gravité** : Moyenne. **Priorité** : Basse (traiter avec P2).

### P12 — Dette CSS/JS du composant
- **Observation** : accolade orpheline (469 `{`/470 `}`), deux blocs `@media 768px`, `!important` fossiles, `transition:all`, 4 durées différentes, code mort JS, `position:relative` sans usage.
- **Gravité** : Faible. **Priorité** : Basse.
- **Recommandation** : passe de nettoyage unique lors de l'unification P5.

### P13 — FOUT/CLS typographique du header
- **Observation (mécanisme certain, ampleur non mesurée)** : Cinzel chargé via CSS Google Fonts render-blocking avec `display=swap` → bascule visible des libellés nav au premier chargement.
- **Gravité** : Faible. **Priorité** : Basse.
- **Recommandation** : préchargement des 2 fichiers woff2 critiques (Cinzel 600, Lora 400) et/ou auto-hébergement ; `size-adjust` sur les fallbacks si besoin.

### P14 — (hors menu, signalé en passant) Placeholder en production
- **Observation** : `google-site-verification` contient « REMPLACER_PAR_VOTRE_VALEUR_EXISTANTE ».
- **Gravité** : Faible (la Search Console a d'autres moyens de vérification) mais négligé et visible dans la source.

---

# 17. Classements

### Top 10 améliorations les plus importantes
1. Réparer le menu mobile homepage (offset 69→85px, défilement du panneau, scroll-lock) — P1
2. Corriger le burger gris des 14 pages catégories — P3
3. Rendre toute la nav accessible au clavier avec focus visible — P2
4. Unifier le composant nav sur les 19 pages (source unique) — P5
5. Couvrir les 14 catégories dans le menu (dont Parfums partout) — P6
6. Résorber la zone cassée 769–1000px — P4
7. Compléter les comportements (Escape, clic extérieur partout, aria-expanded) — P7
8. Affordance + micro-transitions des dropdowns — P8
9. Corriger les `scroll-margin-top` — P9
10. Nettoyage CSS/JS du composant (code mort, !important, durées) — P12

### Top 5 bugs potentiels (au-delà des bugs avérés ci-dessus)
1. Safari iOS : `calc(100vh - 69px)` + barre d'URL dynamique → découpe aggravée du menu (non testé, mécanisme connu)
2. Orientation paysage mobile : la majorité du menu homepage devient inatteignable (géométrie certaine, non testée sur appareil)
3. Resize desktop→mobile→desktop avec menu ouvert : classes `open`/`menu-open` résiduelles (état incohérent silencieux)
4. `setTimeout(...,60)` avant `scrollIntoView` : scroll raté si le rendu dépasse 60ms sur appareil lent
5. Back button depuis les vues SPA : sortie du site au lieu d'un retour de vue (pas de pushState)

### Top 5 UX
1. Toutes les catégories accessibles depuis le menu, partout
2. Un seul comportement de menu sur tout le site
3. Chevrons sur les dropdowns
4. Fusionner « Notre histoire »/« Qui sommes-nous ? »
5. Fermeture Escape + scroll-lock + clic extérieur uniformes

### Top 5 visuel
1. Burger gris → burger or (14 pages)
2. Zone tablette : nav sur une seule ligne quelle que soit la largeur
3. Transitions d'ouverture des dropdowns (fondu 150–200ms)
4. Panneau mobile affleurant exactement le bas du header (85px)
5. Soulignement animé or au hover (l'échafaudage CSS existe déjà)

### Top 5 technique
1. Source unique du composant nav (gabarit ou génération)
2. Vrais `href` partout + suppression des `onclick` inline
3. ARIA complet (expanded/controls/current) + `<ul>`
4. Suppression du code mort et des `!important` fossiles
5. Préchargement des polices critiques du header

# 18. Conclusion — notes /10

| Axe | Note | Justification courte |
|---|---|---|
| Image premium | 6/10 | Desktop ≥1024px : 8/10 (vraie DA). Mobile catégories : 4/10 (burger gris) |
| Crédibilité | 6/10 | Les bugs visibles (burger, menu coupé) contredisent la promesse premium |
| UX | 5,5/10 | Parcours souris desktop bon ; couverture catalogue et mobile défaillants |
| UI | 7/10 | Tokens, contrastes et hiérarchie solides ; affordances et micro-animations manquantes |
| Responsive | 5/10 | Trou 769–1000px + menu mobile homepage coupé |
| Accessibilité | 2,5/10 | Nav desktop inaccessible au clavier ; ARIA quasi absent ; seul le contraste est acquis |
| Performance | 7,5/10 | Menu léger, animations compositables, zéro erreur console ; FOUT header |
| Qualité du code | 5,5/10 | JS simple et sain mais incomplet ; CSS avec fossiles et duplications internes |
| Architecture front-end | 4,5/10 | 15+ copies divergentes d'un même composant, offsets magiques |
| Maintenabilité | 4,5/10 | Toute évolution du menu = 15 éditions ; la dérive est déjà constatée |

## Réponse à la question finale

> *Si Dar Nūr était auditée par une agence spécialisée dans les marques premium et le développement front-end haut de gamme, quels seraient les défauts les plus importants du menu avant toute mise en production ?*

Une agence haut de gamme bloquerait la mise en production sur quatre points, dans cet ordre :

1. **Le menu mobile ne remplit pas son contrat fonctionnel.** Sur la homepage, deux entrées (« FAQ », « Avis ») sont physiquement inatteignables sur un iPhone standard — un menu dont on ne peut pas atteindre la fin n'est pas fini. Sur les 14 pages catégories, le bouton qui ouvre le menu est un rectangle gris de navigateur, sur les pages mêmes qui reçoivent le trafic SEO. Ce sont les deux défauts qu'un client remarque en dix secondes.
2. **L'accessibilité clavier est inexistante sur desktop** — zéro destination atteignable au Tab. Pour une agence, c'est un critère de non-livraison en 2026 (EAA en vigueur pour le e-commerce), avant même d'être un argument éthique.
3. **Il n'y a pas un menu, il y en a deux** — comportements, contenus et cotes divergents entre homepage et pages catégories, parce que le composant est copié-collé dans 15+ fichiers. Tant que cette cause racine n'est pas traitée, toute correction re-divergera.
4. **Le menu ne vend pas le catalogue** : 6 des 14 catégories (et le hub Parfums, sauf sur la homepage) n'existent nulle part dans la navigation. Pour une boutique, c'est le défaut le plus coûteux commercialement, même s'il est le moins visible techniquement.

Le fond est sain : la direction artistique du header est réellement sur mesure et crédible en benchmark premium, la palette est conforme aux contrastes, le JS est simple et sans dette lourde, le sticky fonctionne, et la géométrie desktop ≥1024px est propre. C'est un composant à **finir et unifier**, pas à refaire.
