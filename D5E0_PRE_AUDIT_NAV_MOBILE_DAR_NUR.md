# Phase D5e.0 — Pré-audit navigation mobile

**Statut** : document de conception, lecture seule. Aucune ligne de code modifiée. Aucun prototype produit.

**Note sur les captures** : les captures jointes à la consigne d'ouverture de ce chantier montrent la **homepage** (`index.html`), pas le composant audité ici. La homepage a sa propre implémentation mobile, distincte et non mutualisée (overlay dédié, croix animée, logique inline — voir `nav.css` lignes 6-8 et `js/nav.js` lignes 6-7, qui documentent tous deux cette séparation), et appartient à **D5d**, pas à D5e. Ces captures ne constituent donc ni une preuve ni une réfutation du comportement du composant mutualisé décrit ci-dessous — voir §8 (Réconciliation avec les captures) pour le détail. Tous les constats de ce document reposent sur une inspection directe et en direct du composant mutualisé réellement déployé (DOM, CSS calculée, hit-testing par coordonnées, navigation clavier réelle) sur deux pages représentatives du périmètre D5e.

**Périmètre** : le composant de navigation mobile **mutualisé** (`nav.css`, bloc `@media(max-width:768px)`, + `js/nav.js`). Utilisé à l'identique sur **18 pages servies** : les 15 pages catégories (`abayas/`, `accessoires/`, `bakhour/`, `bijoux/`, `brumes/`, `chaussures/`, `chechias/`, `gelules/`, `huiles/`, `miels/`, `miels-gourmands/`, `miels-terroir/`, `poudres/`, `qamis/`, `tahara/`) et les 3 pages parfums générées (`parfums/index.html`, `parfums/khair/index.html`, `parfums/lecode/index.html`). Deux fichiers supplémentaires partagent la même structure sans être des pages servies : `parfums/_brand_template.html` et `parfums/_hub_template.html` sont des gabarits sources consommés par `scripts/generate-parfums.mjs` pour produire 3 des 18 pages ci-dessus — ils ne sont jamais livrés tels quels à un visiteur, donc comptés séparément. **La homepage (`index.html`) n'utilise pas ce composant et est explicitement hors périmètre.**

**Les conclusions de ce document concernent exclusivement le composant mobile mutualisé. Elles ne doivent pas être extrapolées au header desktop (périmètre D5c/D5f, déjà clos et stable) ni à l'implémentation spécifique de `index.html` (périmètre D5d, non ouvert).**

---

## 1. État actuel

### Structure

Sur les 18 pages du périmètre, le DOM du header (partagé avec le desktop, issu de D5c) est :

```
<header>                              position:sticky, backdrop-filter:blur(8px)
  <div class="row-identity">          neutralisé en mobile (background:none, padding:0)
    <a class="brand">...</a>
  </div>
  <div class="row-nav">               neutralisé en mobile (background:none, padding:0)
    <nav>
      <div class="nav-portal">        position:fixed, inset:0, overflow:clip
        <ul class="nav-links" id="navLinks">
          22 éléments interactifs (9 entrées de premier niveau, dont 2
          déclencheurs de groupe ; 13 sous-entrées : 8 sous "Bien-être",
          5 sous "Mode & Accessoires")
        </ul>
      </div>
      <button class="burger" id="burger">...</button>
    </nav>
  </div>
</header>
```

Le panneau glissant (`.nav-links`) est positionné en `position:fixed;top:81px;right:0;width:74%;max-width:320px;height:calc(100vh - 81px)`, translaté hors écran (`translateX(100%)`) à l'état fermé, ramené à `translateX(0)` par la classe `.open` (transition `.35s ease`). Les sous-menus (`Bien-être`, `Mode & Accessoires`) ne sont **pas repliables** en mobile : `.nav-dropdown-menu` y est forcé en `display:flex` permanent (`position:static`), toutes les sous-entrées apparaissent à plat, à la suite de leur groupe, distinguées uniquement par une indentation visuelle.

### Comportement actuel

Une seule interaction est câblée (`js/nav.js`, 4 lignes utiles) : le clic sur `#burger` bascule la classe `.open` sur `#navLinks`. C'est tout — aucune autre logique JS n'existe pour ce composant.

### Deux défauts, deux natures différentes — à ne jamais mélanger

Le composant présente deux problèmes bloquants, de nature distincte, avec des conséquences et des corrections distinctes. Le premier empêche l'usage ; le second empêche un usage *accessible*. Ce sont deux chantiers différents, traités dans deux sous-phases séparées.

> **Bloc A — Bug fonctionnel**
> - Panneau non visible à l'ouverture
> - Navigation inutilisable (pour tout utilisateur, souris ou tactile)
> - Priorité absolue
> - Traité en **D5e.1**

> **Bloc B — Bug d'accessibilité**
> - Éléments du panneau focusables au clavier alors qu'invisibles/hors-écran
> - Ordre de tabulation incohérent avec ce qui est perceptible à l'écran
> - Traité en **D5e.2**

Le détail de chaque défaut, avec les preuves associées, suit ci-dessous.

### Défaut n°1 (bloquant, Bloc A) — le panneau ouvert n'est jamais visible ni cliquable

**Classification : bug fonctionnel bloquant.** Ce n'est pas une piste de redesign ni une préférence esthétique — le composant, tel qu'il existe, ne remplit pas sa fonction la plus basique (afficher un menu quand on l'ouvre).

**Reconfirmé indépendamment sur deux pages du périmètre**, chacune avec URL, viewport, boîtes englobantes et résultat de `elementFromPoint` :

| | `miels/` (page catégorie réelle) | `parfums/` (hub parfums) |
|---|---|---|
| URL | `http://localhost:3000/miels/` | `http://localhost:3000/parfums/` |
| Viewport | 390×844 | 390×844 |
| `.nav-portal` (rect, panneau ouvert) | `{top:0, bottom:80, height:80}` | `{top:0, bottom:80, height:80}` |
| `.nav-links` (rect, panneau ouvert) | `{top:81, bottom:844, left:101.5, right:390.4}` — **correctement positionné** | `{top:81, bottom:844, left:101.5, right:390.4}` — **correctement positionné** |
| `header{backdrop-filter}` | `blur(8px)` | `blur(8px)` |
| `elementFromPoint(200, 200)` | `SECTION.cat-hero` (le hero de la page, pas le menu) | idem — élément de page sous le header, pas le menu |

Point important, précisé par rapport à un premier constat trop rapide : **la position horizontale/verticale du panneau (`transform`, `top`, `left`) est correctement calculée** — le mécanisme d'ouverture (`translateX(100%)` → `translateX(0)`) fonctionne comme prévu. Le défaut ne vient pas de là. Il vient uniquement de `.nav-portal`, le conteneur parent, dont la hauteur réelle (80px) ne couvre que le header lui-même, pas l'écran.

**Observation expérimentale — sur les deux mêmes pages** : désactiver temporairement `backdrop-filter` sur `header` (aucune autre règle touchée) rétablit immédiatement le panneau, panneau déjà ouvert :

| | `miels/` — avant correction | `miels/` — après correction | `parfums/` — avant correction | `parfums/` — après correction |
|---|---|---|---|---|
| `.nav-portal` height | 80 | **844** | 80 | **844** |
| `elementFromPoint(200,200)` | `SECTION` (page) | `A#nav-miels-gourmands` — **texte "Miels Gourmands"** | `SECTION` (page) | `A#nav-miels-gourmands` — **texte "Miels Gourmands"** |
| Élément trouvé dans `#navLinks` ? | non | **oui** (`hitIsInsideNavLinks: true`) | non | **oui** (`hitIsInsideNavLinks: true`) |
| `.nav-links` rect | correcte déjà avant | inchangée, toujours correcte | correcte déjà avant | inchangée, toujours correcte |

Sur les deux pages, cette seule désactivation suffit à rendre le panneau **visible** (hauteur du conteneur restaurée), **cliquable** (`elementFromPoint` trouve un vrai lien à l'intérieur) et **correctement positionné** (la géométrie ne change pas — elle était déjà juste, seule la visibilité était en cause). Capture d'écran prise dans cet état de correction temporaire (jamais commitée) sur `miels/` : panneau vert plein, 74 % de largeur, liste à plat des 9 entrées + 13 sous-entrées, entrée active ("Miels") en or avec filet gauche, aucun assombrissement du contenu visible en arrière-plan à gauche du panneau. **Ceci est un fait expérimental, observé et reproduit à l'identique sur les deux pages** — indépendant de toute explication de mécanisme.

**Hypothèse de cause (fortement étayée)**, distincte du fait ci-dessus : ce comportement est cohérent avec l'effet de `backdrop-filter` sur le contexte de rendu des descendants positionnés — comme `transform`, cette propriété crée un nouveau *containing block* pour les descendants en `position:fixed`. Si cette hypothèse est correcte, `.nav-portal` (écrit pour couvrir tout le viewport via `position:fixed;inset:0`) se retrouverait contraint à la boîte du `<header>` lui-même, avec `overflow:clip` rognant tout ce qui dépasse ses 80px de hauteur — ce qui correspondrait exactement aux valeurs mesurées (80px avant, 844px après suppression de `backdrop-filter`). Cette hypothèse n'a pas besoin d'être confirmée pour agir : l'observation expérimentale à elle seule suffit à identifier `backdrop-filter` comme le levier de correction, quelle que soit l'explication exacte du mécanisme sous-jacent — une précaution utile si un comportement de navigateur évoluait ou si un autre facteur était découvert plus tard.

Cette règle `backdrop-filter` n'a été touchée par aucun commit de D5c ou D5f (uniquement `.row-identity`, `.row-nav`, `.brand*`, `.nav-links`, `.nav-dropdown*` ont été modifiés) — **ce défaut est antérieur à l'ensemble du chantier header**, probablement présent depuis la mutualisation N2/N3 ou avant.

### Défaut n°2 (bloquant, Bloc B) — le panneau reste tabulable au clavier même fermé

**Classification : bug d'accessibilité bloquant**, indépendant du défaut n°1 (il persisterait même une fois le panneau rendu visible, si rien n'est fait).

Vérifié : `transform` et `overflow:clip` ne retirent pas un élément du parcours de tabulation, contrairement à `display:none`. Résultat, sur `tahara/` : après le lien logo, 2 tabulations mènent au lien "Boutique" — dont la position réelle (`left:418px` pour un viewport de 390px) est **hors écran**, panneau fermé. Les 22 éléments interactifs de `#navLinks` (`document.querySelectorAll('#navLinks a, #navLinks button').length === 22`) sont **tous** dans l'ordre de tabulation en permanence, qu'ils soient hors-écran (fermé) ou clippés-invisibles (ouvert, défaut n°1). **22 arrêts de tabulation invisibles séparent systématiquement le logo du bouton burger**, sur chacune des 18 pages du périmètre.

### Points forts

- Mécanisme d'ouverture/fermeture minimal et lisible (une seule ligne de logique JS).
- CSS de neutralisation desktop→mobile déjà rigoureux (chaque nouveauté D5c/D5f explicitement réinitialisée dans le media query — aucune dette de ce type ici).
- Largeur de panneau (74 %, plafonnée à 320px) : choix raisonnable, laisse deviner qu'on est encore sur la page (dans son intention, même si actuellement invisible).
- Un seul point d'entrée technique (`#burger` / `#navLinks`), facilement adressable pour une correction.
- La géométrie d'ouverture (`transform`, positionnement) fonctionne correctement — seul l'affichage final est cassé par un défaut isolé et bien circonscrit (§ ci-dessus).

### Points faibles

- **Défaut n°1 — panneau invisible/non cliquable** (bloquant, voir ci-dessus).
- **Défaut n°2 — 22 éléments tabulables hors-écran en permanence** (bloquant, voir ci-dessus).
- Aucun verrouillage du scroll de la page derrière le panneau (vérifié : `window.scrollBy()` fonctionne normalement, `.open` actif ou non, `body`/`html` restent en `overflow:visible`).
- Aucun assombrissement (scrim/overlay) du contenu de page derrière le panneau.
- Aucune fermeture autre que re-cliquer le burger : pas de bouton de fermeture dédié, pas de clic extérieur, pas de touche Échap (confirmé dans le code source, commenté comme volontaire dans `js/nav.js`).
- L'icône burger reste 3 barres statiques, ne se transforme jamais en croix — aucun signal visuel que l'état a changé, en plus du défaut n°1.
- `aria-expanded="false"` codé en dur sur `#burger`, jamais mis à jour par `js/nav.js`.
- Les déclencheurs de groupe ("Bien-être", "Mode & Accessoires") restent des `<button>` avec `cursor:pointer` et un style de focus, mais n'ont aucune action au tap en mobile (les sous-menus sont toujours dépliés, jamais repliables) — affordance trompeuse.
- Au-delà de 768px de large (nombreux téléphones récents en orientation paysage), le header bascule intégralement sur la mise en page desktop : burger caché, dropdowns qui ne s'ouvrent qu'au survol/focus — deux mécanismes peu adaptés au tactile pur.

---

## 2. Inventaire des interactions

| Interaction | État réel |
|---|---|
| **Ouverture** | Un seul déclencheur : clic/tap sur `#burger`, bascule `.open`. Pas de geste (swipe), pas d'ouverture automatique. |
| **Fermeture** | Uniquement en re-cliquant `#burger` (toggle). |
| **Overlay / assombrissement** | Inexistant. `.nav-portal` n'a aucune couleur de fond ; le contenu de page reste pleinement visible (et, actuellement, seul visible — défaut n°1) autour du panneau. |
| **Scroll (page)** | Non verrouillé. La page défile librement derrière/sous le panneau, ouvert ou fermé. |
| **Scroll (panneau)** | `.nav-links{overflow-y:auto}` — le panneau lui-même est scrollable si son contenu dépasse `calc(100vh - 81px)`, indépendamment du défaut n°1. |
| **Focus (au clic burger)** | Aucune gestion — le focus clavier ne se déplace pas automatiquement vers le panneau à l'ouverture, ni ne revient sur le burger à la fermeture. |
| **Clavier (Tab)** | Voir défaut n°2 : 22 arrêts de tabulation toujours présents, hors-écran ou invisibles selon l'état. |
| **Échap** | Aucune gestion. |
| **Tactile (tap)** | Le burger répond au tap (toggle `.open`). Les déclencheurs de groupe répondent au tap uniquement comme n'importe quel bouton focusable (pas d'action fonctionnelle, cf. affordance trompeuse en §1). |
| **Orientation / largeur** | Au-delà de 768px (breakpoint unique, pas de palier intermédiaire), le header repasse intégralement en mise en page desktop — burger caché, `.nav-links` en flux normal, dropdowns pilotés par `:hover`/`:focus-within` (ajouté en D5f.2, pensé pour souris/clavier, pas pour le tactile). |
| **Retour arrière (navigateur)** | L'état `.open` est un simple attribut de classe DOM, jamais reflété dans l'URL ou l'historique (pas de `history.pushState`). Une navigation arrière recharge ou restaure la page sans lien avec cet état. |
| **Liens** | Tous les liens de premier niveau et de sous-menu sont de vrais `<a href>` (navigation classique, pas de gestion JS d'interception). |
| **Sous-menus** | Non repliables en mobile (toujours dépliés) — comportement différent du desktop, où ils ne s'affichent qu'au survol/focus. |

---

## 3. Analyse UX

*Les réponses ci-dessous s'appuient sur l'inspection directe du composant mutualisé décrite en §1 (dont une capture de référence obtenue en désactivant temporairement le `backdrop-filter` fautif, jamais un état réellement livré) — pas sur les captures jointes à la consigne, qui montrent la homepage, hors périmètre de ce document (voir §8).*

**La navigation devient-elle réellement l'élément principal lorsque le menu est ouvert ?**
Non — elle ne devient rien du tout. Le défaut n°1 fait qu'aucune tentative d'ouverture ne produit de changement visible : l'utilisateur tape le burger, l'écran reste identique. Ce n'est pas une question de hiérarchie visuelle mal réglée, c'est une absence totale de retour. Sur la base de la capture de référence (diagnostic, hors production), même une fois rendu visible, le panneau ne domine qu'une partie de l'écran (74 %, max 320px) : le reste de la page (environ 26 % à gauche sur un écran de 390px) demeure visible à côté, sans assombrissement — la navigation partage l'écran avec le contenu, elle ne le remplace pas.

**Le hero reste-t-il visuellement trop présent ?**
Par construction, oui, actuellement de façon absolue (rien ne le masque jamais, le panneau étant invisible). Même dans l'état de référence corrigé, le hero (et tout le reste de la page) reste partiellement visible à gauche du panneau, sans traitement (pas d'assombrissement, pas de flou) — il continue à capter l'attention en périphérie pendant que l'utilisateur est censé se concentrer sur la navigation.

**La hiérarchie est-elle correcte ?**
Dans l'état de référence, la hiérarchie visuelle est plate : les 9 entrées de premier niveau et les 13 sous-entrées partagent la même taille de police, la même couleur ; seule l'indentation distingue un parent d'un enfant. L'entrée active ressort correctement en or avec un filet gauche, mais rien ne distingue visuellement "ceci est un groupe" de "ceci est un lien terminal" au premier regard, en dehors du décalage horizontal.

**L'utilisateur comprend-il immédiatement où aller ?**
Non, pour deux raisons cumulées : (1) le tap sur le burger ne produit aujourd'hui aucun changement perceptible (défaut n°1), donc aucune orientation n'est même proposée ; (2) même corrigé, une liste plate de 22 éléments sans séparation visuelle forte entre groupes ni bouton de fermeture explicite demande un effort de lecture pour s'orienter.

**Le menu ressemble-t-il à une véritable navigation ou à un simple panneau superposé ?**
Aujourd'hui, à un rien du tout — il n'existe pas visuellement. Dans son état de référence, il se rapproche d'un simple panneau superposé plutôt que d'une navigation pensée comme telle : liste continue sans séparateurs marqués entre sections, pas d'en-tête de panneau, pas de bouton de fermeture dédié, pas de zone de respiration avant/après les groupes autre que l'indentation.

---

## 4. Contraintes techniques

### Fichiers concernés

| Fichier | Rôle |
|---|---|
| `nav.css` | Bloc `@media(max-width:768px)` : toute la logique visuelle mobile. Règle `header{backdrop-filter:blur(8px)}` (hors media query) — **cause du défaut n°1**, partagée avec le desktop, à traiter avec prudence. |
| `js/nav.js` | Toggle `.open` sur clic burger — unique comportement JS du composant. |
| 15 pages catégories + 3 pages parfums générées (18 pages servies) | Structure HTML du header, strictement identique depuis le rollout D5c (`8604a2d`) — aucune divergence structurelle entre elles à ce jour. |
| `parfums/_brand_template.html`, `parfums/_hub_template.html` | Gabarits sources (pas des pages servies) qui génèrent 3 des 18 pages ci-dessus via `scripts/generate-parfums.mjs`. |
| `partials/nav.html`, `partials/nav-common.generated.html`, `scripts/build-nav.mjs` | Pipeline de génération du *contenu* de nav (liens, groupes) pour les pages parfums — **pas la structure du panneau mobile lui-même**, qui reste hors de ce pipeline (édition directe des templates, comme établi en D5c). |

### JS concerné

`js/nav.js` uniquement, pour le périmètre D5e. Aucun autre script ne référence `#burger`, `#navLinks`, ou `.nav-dropdown*`.

### CSS concerné

Le bloc `@media(max-width:768px)` de `nav.css` dans son intégralité, plus la règle `header{backdrop-filter:blur(8px)}` (hors media query — **partagée avec le desktop**, donc toute correction doit soit rester compatible avec le rendu desktop du header, soit être neutralisée spécifiquement en mobile sans toucher au desktop, selon la même discipline que D5c.1/D5c.2 : *tout nouveau comportement propre à un mode doit neutraliser explicitement l'autre mode*).

### HTML concerné

La structure `<header><div class="row-identity">...</div><div class="row-nav"><nav>...<div class="nav-portal"><ul class="nav-links">...</ul></div><button class="burger">...</button></nav></div></header>`, identique sur les 18 pages servies du périmètre, plus les 2 gabarits parfums qui en génèrent 3.

### Interactions desktop à ne surtout pas casser

Issues de D5c/D5f, à valider explicitement sur l'échantillon fixe (`abayas/` + hub parfums) avant toute clôture de D5e, comme pour les phases précédentes :
- `.row-identity` / `.row-nav` (D5c.1/D5c.2) : centrage, gap, padding.
- Dropdowns desktop au survol **et** au focus clavier (`:hover`, `:focus-within` — ajouté en D5f.2).
- États `:focus-visible` sur `.brand`, les liens, les déclencheurs, les liens de panneau (D5f.2).
- Micro-interaction hover/focus du lockup `.brand` (D5f.3).
- Fond transparent des déclencheurs de dropdown, `appearance:none` (D5f.1).
- `header{backdrop-filter:blur(8px)}` lui-même : **l'effet de flou visuel sur le fond du header en desktop est probablement voulu et ne doit pas disparaître** — seul son effet de bord sur le containing block des descendants `position:fixed` mobiles pose problème. Ce sont deux aspects distincts de la même déclaration CSS, à ne pas confondre lors d'une future correction.

---

## 5. Risques

| Risque | Détail |
|---|---|
| **Régression desktop** | `header{backdrop-filter:blur(8px)}` est partagée entre desktop et mobile. Toute correction du défaut n°1 qui toucherait cette déclaration doit être vérifiée sur l'échantillon fixe desktop (`abayas/`, hub parfums) en plus du mobile — risque direct de casser un rendu déjà validé sur 10 commits (D5c.1 à D5f.4). |
| **Accessibilité** | Les défauts n°1 et n°2 combinés créent aujourd'hui la pire situation possible : des éléments focusables ET invisibles. Toute correction doit décider explicitement du sort de ces éléments quand le panneau est fermé (les retirer du parcours tabulable, ou les y laisser une fois le panneau réellement visible). |
| **Scroll lock** | Inexistant aujourd'hui. L'introduire est un changement de comportement (pas seulement visuel) — à traiter comme une décision explicite (cf. discipline déjà appliquée en D5f.2 pour `:focus-within`), pas une correction silencieuse. |
| **Focus management** | Aucune gestion aujourd'hui (pas de déplacement de focus à l'ouverture/fermeture). Un futur ajout de piège de focus (focus trap) dans le panneau ouvert est une interaction nouvelle avec risque de régression clavier si mal implémentée (focus qui se perd, boucle infinie, etc.). |
| **Performance** | Risque faible a priori — le composant est déjà minimal (CSS + une ligne de JS). Un ajout de logique JS pour scroll-lock/focus-trap reste local, sans dépendance externe visible dans le projet. |
| **Overlay** | Introduire un scrim change la perception de profondeur de toute la page (z-index, opacité) — à tester sur l'ensemble des 18 pages si le assombrissement est implémenté comme un élément partagé (risque de recouvrir un contenu de page qui aurait un z-index inhabituel ailleurs — aucun cas de ce type identifié à ce jour dans le CSS inspecté, mais non exhaustivement vérifié pour chacune des 18 pages). |
| **z-index** | La pile actuelle (`header` z-index:100, `.nav-portal` z-index:96, `.nav-links` z-index:auto au sein du contexte d'empilement de `.nav-portal`) fonctionne par construction de contexte d'empilement imbriqué, pas par comparaison numérique directe — fragile à toute modification qui ajouterait un `position`/`z-index`/`transform`/`filter` sur un élément intermédiaire (`.row-nav`, `<nav>`), qui pourrait recréer un nouveau containing block et reproduire un défaut similaire au n°1 ailleurs dans la chaîne. |
| **Animation** | Transition actuelle (`transform .35s ease` sur `.nav-links`) fonctionne indépendamment du défaut n°1 (elle anime une propriété qui, elle, est correctement calculée — seul l'affichage final est rogné). Toute nouvelle animation (icône burger, fondu d'overlay) doit être vérifiée pour ne pas dépendre implicitement du même mécanisme de containing block fautif. |

---

## 6. Critères de sortie

Proposition — D5e pourra être considéré comme terminé quand :

1. Le panneau de navigation mobile s'affiche réellement à l'écran à l'ouverture, sur les 18 pages servies du périmètre (vérifié par capture ET par `elementFromPoint`/hit-testing, pas seulement par lecture de classe CSS).
2. Le comportement de fermeture est explicite et documenté (burger seul, ou étendu — décision à prendre en phase de cadrage, pas dans ce document).
3. Le parcours clavier ne comporte plus d'arrêt sur un élément invisible : soit les éléments du panneau sont retirés du parcours tabulable quand il est fermé, soit le panneau est réellement visible dès qu'ils sont atteignables.
4. Décision explicite prise (et appliquée ou consciemment refusée) sur : scroll lock, overlay/assombrissement, focus management à l'ouverture/fermeture — chacun de ces trois points doit être une décision actée, pas un oubli.
5. Aucune régression sur l'échantillon fixe desktop (`abayas/`, hub parfums) : `.row-identity`/`.row-nav`, dropdowns hover/focus, `:focus-visible`, micro-interaction `.brand` — les dix commits de D5c/D5f restent intacts.
6. Vérifié sur un échantillon représentatif des 18 pages (catégories + parfums, à définir en phase de cadrage suivant le même principe que l'échantillon fixe utilisé en D5f) qu'aucune n'a de comportement divergent.
7. Console propre sur l'ensemble des vérifications.

---

## 7. Découpage proposé

Par analogie avec D5c (canari → validation → rollout → clôture), sachant que `nav.css`/`js/nav.js` sont déjà mutualisés (donc pas de mécanique de rollout fichier par fichier nécessaire — une correction dans `nav.css` s'applique aux 18 pages servies simultanément, comme établi pour D5f). **Principe directeur du découpage : restaurer le fonctionnement et l'accessibilité de l'existant d'abord (D5e.1-2), toute question de conception/redesign visuel ensuite et séparément (D5e.5) — jamais mélanger correction fonctionnelle et refonte UX dans un même commit.**

**D5e.1 — Correction du défaut n°1 : rendre le panneau visible et cliquable**
Objectif unique, strictement correctif : que le panneau existant s'affiche réellement à l'écran à l'ouverture et redevienne cliquable, sans casser le rendu desktop du `backdrop-filter`. Ceci est une **correction de bug**, pas un redesign — aucune nouvelle décision visuelle (pas d'overlay, pas de scroll lock, pas de nouvelle hiérarchie) ne doit se glisser dans ce commit. Vérifié par hit-testing réel (`elementFromPoint`), pas seulement visuellement, sur l'échantillon fixe mobile + confirmation que le desktop (`abayas/`, hub parfums) est intact.

**D5e.2 — Correction du défaut n°2 : parcours clavier**
Objectif unique, strictement correctif : que les 22 éléments du panneau ne soient plus tabulables quand celui-ci est fermé (ou toute solution équivalente empêchant un arrêt de tabulation sur un élément non perceptible). Dépend de D5e.1 : une fois le panneau réellement visible à l'ouverture, la question devient "doit-il être tabulable dès qu'il est ouvert" plutôt que "pourquoi est-il tabulable alors qu'invisible". Toujours une correction, pas une conception nouvelle.

**— Fin du socle fonctionnel/accessibilité. Ce qui suit relève de décisions de conception, à cadrer séparément avant tout code. —**

**D5e.3 — Fermeture et fond (overlay, scroll lock, clic extérieur/Échap)**
Regroupe les décisions comportementales majeures : assombrissement du fond, verrouillage du scroll, moyens de fermeture supplémentaires. Chacune est une décision de conception à valider séparément avant code, comme pour R2/D5f.2 — pas une extension automatique de D5e.1/D5e.2.

**D5e.4 — Icône burger et retour visuel d'état**
Transformation de l'icône (statique → animée), synchronisation `aria-expanded`. Périmètre volontairement restreint, comparable à D5f.1/D5f.3 en ampleur.

**D5e.5 — Hiérarchie visuelle du panneau (groupes vs liens terminaux)**
Uniquement si les phases précédentes laissent ce point encore ouvert et jugé nécessaire — à recadrer explicitement en fonction de ce qui reste après D5e.1-4, plutôt que présupposé ici. C'est ici, et seulement ici, qu'une véritable refonte visuelle du panneau serait envisagée.

**D5e.6 — Validation finale et clôture**
Même rôle que D5f.4 : constat, pas de code, vérification des 7 critères de sortie de la section 6 sur l'ensemble du périmètre.

Ce découpage est une proposition de structure, pas un engagement — chaque sous-phase devrait, comme celles de D5f, être cadrée individuellement (objectif, périmètre exclu, critères de sortie) avant d'être ouverte.

---

## 8. Réconciliation avec les captures

Les captures jointes à la consigne d'ouverture montrent l'état fermé puis ouvert du menu mobile de la **homepage** (`index.html`), pas du composant mutualisé audité dans ce document. Trois points factuels établissent cette séparation :

1. `nav.css` (lignes 6-8) documente explicitement que la homepage *"garde son propre CSS nav inline (comportement SPA spécifique : croix animée, overlay, sélecteurs différents)"*.
2. `js/nav.js` (lignes 6-7) documente symétriquement que *"index.html (homepage) garde sa propre logique (overlay, clic extérieur, vues SPA) dans son script inline"*.
3. La homepage possède un **overlay** et une **icône burger animée en croix** d'après ces mêmes commentaires — deux caractéristiques que le composant mutualisé audité ici n'a pas (confirmé : aucun overlay, icône statique 3 barres, §1/§2).

**Conséquence** : les captures ne sont ni une preuve ni une réfutation du comportement décrit dans ce document — elles documentent une implémentation différente, qui relève de **D5d** (homepage), pas de D5e. Si les captures montrent un menu mobile qui s'affiche et fonctionne correctement sur la homepage, cela n'entre pas en contradiction avec le défaut n°1 constaté ici : les deux implémentations partagent des noms de classes voisins (`nav-links`, `burger`) mais pas le même CSS ni le même mécanisme d'affichage, et rien n'indique à ce stade que l'implémentation homepage utilise `backdrop-filter` sur un ancêtre `position:fixed` de la même manière. Ce point n'a pas été vérifié ici — la homepage restant hors périmètre — et devra faire l'objet de son propre pré-audit lors de l'ouverture de D5d, sans présumer que les choix de D5e s'y appliquent automatiquement.
