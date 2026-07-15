# Phase D5a — Pré-audit d'implémentation

**Statut** : document de conception, lecture seule. Aucune ligne de code de production modifiée. Objectif unique : répondre à « quels fichiers devront réellement changer pour reproduire fidèlement le prototype D4, et lesquels doivent rester intouchables ? »

**Référence** : `design_handoff_header_desktop/` (D4, prototype validé), `D4C_REVUE_PROTOTYPE_HEADER_DAR_NUR.md` (verdict final), `D3B1/D3B2/D3B3` (décisions architecturales), `CAHIER_CONTRAINTES_HEADER_DESKTOP_DAR_NUR.md` (D1).

**Méthode** : chaque affirmation ci-dessous a été vérifiée dans le dépôt réel (grep, lecture de fichier, historique Git) — aucune ne repose sur la documentation seule, conformément à la règle « le code réel du dépôt fait foi ».

---

## 1. Inventaire des propriétaires de code

| Fichier / mécanisme | Rôle réel vérifié |
|---|---|
| `data/nav.config.json` | Source de vérité des **entrées** (labels, hrefs, ordre, groupes). Hors périmètre D5 — aucune entrée ne change. |
| `partials/nav.html` | Gabarit canonique du **squelette HTML** (header/nav/brand/burger) + gabarits d'entrée (lien/groupe). Vérifié en phase avec les pages réelles (chemin du logo `{{LOGO_SRC}}` → `/logo-dar-nur.png` identique à `tahara/index.html:226`) — fiable comme point de départ à éditer. |
| `scripts/build-nav.mjs` | Génère le rendu HTML en mémoire (`buildNavHtml()`) depuis `nav.config.json` + `partials/nav.html`, et écrit isolément `partials/nav-common.generated.html`. Possède aussi un mécanisme d'injection par marqueurs (`injectIntoPage`/`prepareInjection`, marqueurs `<!-- AUTO:NAV:START/END -->`). **Fait vérifié, important pour la suite : ce mécanisme d'injection n'a jamais été exercé dans ce projet** — `grep "injectIntoPage\|prepareInjection"` ne trouve aucun appel en dehors de sa propre définition dans `build-nav.mjs`. |
| `partials/nav-common.generated.html` | Artefact généré, ne contient **que** les `<li>` d'entrées de nav (pas le squelette header/nav/brand), coupé en 2 fragments autour de l'entrée « parfums ». Consommé exclusivement par `generate-parfums.mjs`. |
| `scripts/generate-parfums.mjs` | Régénère réellement les 3 pages parfums (pipeline **effectivement exercé**, vérifié idempotent lors du chantier ARIA burger) depuis `_hub_template.html`/`_brand_template.html` + les fragments ci-dessus. |
| `parfums/_hub_template.html`, `parfums/_brand_template.html` | Possèdent **chacun leur propre copie** du squelette header/nav/brand (pas de réutilisation de `partials/nav.html`) — vérifié par grep (`^header{` présent dans les deux). |
| 14 pages catégories (`abayas/index.html`, `tahara/index.html`, etc.) + `parfums/index.html` (généré) | Possèdent **chacune leur propre copie** du squelette header/nav/brand, écrite lors du rollout `e9b6a73` (« rollout canonical navigation to 14 category pages »). **Aucun marqueur `AUTO:NAV`** dans ces fichiers (vérifié par grep sur `tahara/index.html`) — pas de mécanisme de régénération automatique aujourd'hui, malgré la référence au pipeline dans le message de commit. |
| `index.html` (homepage) | Possède des marqueurs `AUTO:NAV:START/END` (lignes 815/927) — mais comme ci-dessus, ce mécanisme n'a jamais été exercé (contenu aligné manuellement, commit `b54c8ad`). CSS totalement séparée, jamais `nav.css`. |
| `nav.css` | Ne contient **que** `.nav-portal`/`.nav-links`/`.nav-dropdown*`/`.burger*` (chantier N1-N5). **`header{}`/`nav{}`/`.brand{}` n'y sont pas** — vérifié par grep, absents de `nav.css`, présents en 16 occurrences dupliquées (`*/index.html`) + confirmés dans les 2 templates parfums et la homepage. |

**Conséquence directe pour D5** : contrairement à ce qu'on pourrait supposer du pipeline documenté, il n'existe **aucun mécanisme de régénération automatique et déjà exercé** pour le squelette header/nav/brand des 15 pages non-parfums (14 catégories + homepage). Seule la génération des 3 pages parfums est un pipeline réellement vivant. Toute modification du squelette sur ces 15 pages sera, comme lors du rollout initial, une édition directe (à la main ou via un script one-off), pas une régénération automatique.

---

## 2. Cartographie des deux familles — décision de périmètre à trancher avant D5b

| | Famille A — Homepage | Famille B — 18 pages |
|---|---|---|
| Fichiers | `index.html` (1) | 14 catégories + 2 templates parfums (16 fichiers sources) |
| CSS nav actuelle | Inline propre, jamais `nav.css` | `nav.css` partagé pour `.nav-links`/`.nav-dropdown`/`.burger` **uniquement** ; `header{}`/`nav{}`/`.brand{}` dupliqués dans chacun des 16 fichiers |
| Squelette HTML | Marqueurs `AUTO:NAV` présents (jamais exercés) | Aucun marqueur, snapshot statique par fichier |
| Logique additionnelle | SPA (`goCat`, `showHome`, overlay, clic extérieur, croix burger) | Aucune (HTML/CSS statique) |

**Décision à trancher avant d'écrire le moindre CSS** : la restructuration en deux rangées touche `header{}`/`nav{}`/`.brand{}`, qui n'ont **jamais été mutualisés** (contrairement à `.nav-links`/`.burger`). Deux options possibles, aux conséquences très différentes sur le nombre de fichiers à toucher :
- **Option 1** : continuer à dupliquer — éditer individuellement les 14 pages catégories + 2 templates parfums (16 fichiers), comme c'est déjà l'habitude pour `header{}`/`nav{}`/`.brand{}`.
- **Option 2** : profiter de D5 pour enfin extraire `header{}`/`nav{}`/`.brand{}` dans `nav.css` (mutualisation jamais faite jusqu'ici) — 1 seul fichier à éditer pour les 16, au prix d'un chantier de mutualisation supplémentaire non prévu par D1-D4.

Cette question n'a pas été tranchée par les phases précédentes (D1-D4 portaient sur la composition, pas sur la stratégie d'édition des fichiers) — **je recommande de la trancher explicitement avant D5b**, faute de quoi le découpage en sous-phases proposé plus bas ne peut pas être chiffré correctement.

### Décision validée

**Option 2 retenue : mutualisation de `header`/`nav`/`.brand` dans `nav.css` avant toute implémentation du nouveau header.** Justification : la prochaine évolution touche la structure même du header (pas seulement le burger ou les liens comme lors de N1-N5) ; dupliquer sur 16 fichiers ferait porter chaque itération de composition (D5c, corrections futures) 16 fois, et réintroduirait exactement la dette que N1-N5 avait commencé à résorber.

**Condition posée** : cette mutualisation est **strictement non fonctionnelle** — un rendu pixel-identique à aujourd'hui, séparée dans sa propre sous-phase (D5b.0), avant toute application de la nouvelle structure à deux rangées (D5b.1+). Objectif : qu'une éventuelle régression soit immédiatement attribuable (mutualisation ou nouveau design), jamais ambiguë. Voir §7 pour le découpage détaillé.

---

## 3. Inventaire CSS

| Bloc | État actuel | Action D5 |
|---|---|---|
| Structure générale (`header{}`, `nav{}`) | Dupliqué dans 16+1 fichiers (voir §2) | À restructurer en 2 rangées — périmètre dépend de la décision §2 |
| Identité (`.brand`, logo, filet vertical, séparateur de rangée) | N'existe pas encore (nouveau, issu du prototype D4b.2) | À créer |
| Navigation (`.nav-links`, `.nav-item`) | Dans `nav.css`, partagé (18 pages) ; inline sur homepage | À adapter au nouveau contexte (rangée dédiée) sans changer son comportement |
| Dropdown (`.nav-dropdown*`) | Dans `nav.css`, partagé | Allègement du soulignement testé en D4b.2 à reporter ici |
| Sticky | `header{position:sticky;top:0}`, fonctionnel aujourd'hui | À revérifier avec la nouvelle hauteur totale (2 rangées) — pas de token unique, valeurs codées en dur par fichier |
| Responsive / burger | `@media(max-width:768px)` dans `nav.css` (18 pages) + bloc séparé dans `index.html` (homepage, 2 blocs distincts déjà documentés en D3a) | Offsets du panneau mobile (`top:81px` etc.) à recalculer selon la nouvelle hauteur — par fichier, aucun token `--header-h` réel n'existe (déjà noté dans `docs/ARCHITECTURE_DAR_NUR.md`) |

---

## 4. Inventaire HTML

- **Nouveaux wrappers** : deux conteneurs de rangée (`.row-identity`/`.row-nav` ou équivalent) à l'intérieur de `<header>`, remplaçant la structure actuelle à rangée unique.
- **Ordre DOM** : le logo (`.brand`) et la navigation (`.nav-portal`/`.nav-links`) sont aujourd'hui côte à côte dans un seul `<nav>` ; ils doivent devenir deux blocs verticalement empilés.
- **Position du logo** : reste dans sa propre rangée, structure interne enrichie (filet vertical entre logo et texte, validé en D4b.2).
- **Séparateur** : nouvel élément purement visuel (`::after` ou bordure), pas de contenu.
- **Dropdowns** : structure de liste interne inchangée (`<li class="nav-item nav-dropdown">`, `<ul class="nav-dropdown-menu">`) — seul le contexte parent (rangée navigation au lieu de rangée unique) change.
- **Burger** : reste dans la rangée navigation (jamais dans la rangée identité — non spécifié autrement par D4).

---

## 5. Compatibilité pipeline

- **`nav.config.json` / `build-nav.mjs`** : `buildNavHtml()` reste valable si `partials/nav.html` est mis à jour — mais comme noté en §1, ce n'est pas un mécanisme actuellement exercé automatiquement ; le mettre à jour est une bonne pratique de cohérence documentaire, pas une condition de non-régression réelle sur les pages actuelles.
- **`partials/nav-common.generated.html` / `generate-parfums.mjs`** : **c'est le seul mécanisme réellement vivant.** Il ne contient que les `<li>` d'entrées, jamais le squelette. La restructuration en 2 rangées touche le squelette des 2 templates parfums (`_hub_template.html`/`_brand_template.html`), **pas** ce fragment généré — donc la restructuration ne casse pas ce pipeline, **à condition de ne jamais toucher aux marqueurs `{{COMMON_NAV_BEFORE_PARFUMS}}`/`{{COMMON_NAV_AFTER_PARFUMS}}`** ni à la structure `<ul class="nav-links">` qui accueille les `<li>` insérés tels quels.
- **Risque identifié** : si l'implémentation déplace les entrées hors d'une liste plate unique (par exemple pour créer une hiérarchie visuelle différente entre liens et groupes), cela casserait l'hypothèse implicite du fragment généré (une liste de `<li>` insérée telle quelle). Le prototype D4 ne fait rien de tel — la structure de liste reste inchangée, seul son conteneur parent change de rangée — donc pas de conflit à ce stade, mais à surveiller si D5c s'écarte du prototype validé.

---

## 6. Risques classés

| Niveau | Élément | Détail |
|---|---|---|
| **Faible** | Ajustements CSS (couleurs, tokens, dégradé, filet) | Reproduction directe des valeurs validées en D4b.2 |
| **Moyen** | Nouvelle structure HTML (2 rangées) sur 16 fichiers sources | Mécaniquement répétitif (même schéma partout), pas complexe individuellement — risque principal : oublier un fichier, pas se tromper sur le motif |
| **Moyen** | Décision de périmètre §2 (mutualiser `header`/`nav`/`.brand` ou non) | Change le nombre de fichiers touchés, pas la difficulté technique |
| **Élevé** | Homepage | Seul fichier avec logique SPA + CSS propre + marqueurs `AUTO:NAV` jamais exercés — risque de divergence silencieuse si le squelette de référence (`partials/nav.html`) est mis à jour sans répercuter manuellement sur `index.html` |
| **Élevé** | Sticky | Nouvelle hauteur totale (2 rangées) à revérifier par fichier, aucun token `--header-h` réel n'existe aujourd'hui |
| **Élevé** | Responsive / burger | Offsets du panneau mobile codés en dur par fichier, à recalculer selon la nouvelle hauteur de chaque famille |
| **Élevé** | Génération parfums | Seul pipeline réellement vivant à ne pas casser — régénération réelle + vérification d'idempotence obligatoires après tout changement des 2 templates (même protocole que le chantier ARIA burger) |

---

## 7. Stratégie d'implémentation — sous-phases validées

Décision de périmètre (§2) tranchée : Option 2 (mutualisation), dans une sous-phase dédiée et strictement non fonctionnelle avant toute implémentation visuelle.

- **D5b.0 — Mutualisation structurelle (non fonctionnelle)** : extraire `header{}`/`nav{}`/`.brand{}` vers `nav.css` pour les 16 fichiers concernés (14 catégories + 2 templates parfums), en suivant le protocole déjà éprouvé N1-N3 (vérification d'identité stricte caractère pour caractère avant extraction, canari, rollout, régénération réelle + idempotence pour les templates parfums). **Rendu pixel-identique à aujourd'hui — aucun changement visuel.** Un commit isolé, avant toute autre sous-phase.
- **D5b.1** — application de la structure à deux rangées (D4) sur la base désormais mutualisée, canari sur 1 page catégorie avant rollout.
- **D5c** — CSS desktop (identité, navigation, dropdown allégés) — reproduction fidèle de D4b.2.
- **D5d** — homepage (structure + CSS propre, jamais `nav.css`) — traitée en dernier, comme pour tous les chantiers précédents (N1-N5).
- **D5e** — responsive / burger (recalcul des offsets par famille).
- **D5f** — pipeline + régénération parfums + qualification finale (idempotence, non-régression sur les 19 pages, protocole déjà éprouvé N4/ARIA burger).

Un commit atomique par sous-phase, validation avant la suivante — même discipline que N1 à N5. La séparation D5b.0/D5b.1 garantit qu'une éventuelle régression soit immédiatement attribuable à la mutualisation ou au nouveau design, jamais ambiguë.
