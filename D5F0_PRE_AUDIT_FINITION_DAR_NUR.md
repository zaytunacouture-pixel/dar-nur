# Phase D5f.0 — Pré-audit de finition du header desktop

**Statut** : document de conception, lecture seule. Aucune ligne de code de production modifiée.

**Contexte de numérotation** : D5C0_PRE_AUDIT_CSS_DESKTOP_DAR_NUR.md avait réservé D5d (homepage `index.html`, hors périmètre D5c) et D5e (redesign mobile, `@media(max-width:768px)`, également hors périmètre D5c). Cette phase de finition — comparer D4 et la production maintenant que le rollout D5c est terminé, inventorier les réserves ouvertes, décider ce qui reste à faire avant de considérer le header desktop définitivement clos — n'avait pas de créneau réservé. Elle prend donc le prochain identifiant libre : **D5f**.

**Objectif unique** : faire l'inventaire de ce qui sépare encore la production du prototype D4b.2 validé, et de ce qui a toujours été hors périmètre de D4/D5c (donc pas une régression, mais un choix jamais fait). Rien n'est corrigé ici — ce document sert à décider, en D5f.1, ce qui vaut la peine d'être traité et ce qui ne l'est pas.

**Principe de D5f** : aucune nouvelle fonctionnalité, aucune modification d'architecture. D5f est exclusivement une phase de finition visuelle et ergonomique sur l'architecture validée et déployée en D5c.

**Périmètre** : le header desktop tel que déployé en D5c (14 pages catégories + 2 templates parfums + 3 pages parfums régénérées + le canari abayas/). La homepage (`index.html`, nav inline distincte) reste hors périmètre — c'est D5d. Le redesign mobile reste hors périmètre — c'est D5e. Ce document ne traite que ce qui est déjà en ligne sur le périmètre D5c.

---

## 1. Comparaison D4 ↔ production — écarts réellement visibles

| Aspect | Prototype D4b.2 | Production (nav.css, après D5c.3) | Écart | Origine |
|---|---|---|---|---|
| Layout rangée identité | `.row-identity` dégradé, filet or, logo 58px, lockup avec filet vertical | Identique | Aucun | Reproduit fidèlement en D5c.1 |
| Layout rangée navigation | `gap:46px`, `max-width:1520px`, padding 40px | `gap:44px`, `max-width:1520px`, padding 18px | Gap et padding ajustés | **Corrections documentées** — D5c.2 (padding, débordement réel à 1280px) et D5c.3 (gap, marge de sécurité à 1240px). Écart assumé et tracé, pas une dette. |
| Lien actif (nav) | `opacity:.95`, `color:gold-light` | Identique | Aucun | Reproduit fidèlement en D5c.2 |
| Déclencheur dropdown (soulignement + chevron) | `border-bottom` fin + chevron 4px | Identique | Aucun | Reproduit fidèlement en D5c.2 |
| Fond du header | `box-shadow:var(--shadow)` (ombre portée diffuse) | `border-bottom:1px solid rgba(200,168,75,.22)` (filet, pas d'ombre) | **Réel** | Antérieur à D5c — choix de production déjà en place avant le chantier (mutualisation N2/N3), jamais remis en cause par D4 dont le périmètre était la composition, pas le traitement de fond du header. |
| Panneau dropdown (position, style) | Centré sous le déclencheur (`left:50%;transform:translateX(-50%)`), `margin-top:14px`, `border-radius:3px`, item padding 10px 22px, hover = bordure gauche 2px | Aligné à gauche (`left:0`), pas de marge (`margin-top:0`), `border-radius:4px`, item padding 9px 20px, hover = bordure gauche 3px + fond `rgba(200,168,75,.06)` | **Réel, mais délibérément hors périmètre** | D5C0_PRE_AUDIT §1 : *"Ne pas toucher — hors périmètre D4/D5c"*. Le prototype n'a jamais eu vocation à dicter ce composant. |
| Burger / nav mobile | Absent du prototype (D4 est desktop uniquement) | Composant existant, neutralisé pour ne pas casser | N/A | D4 n'a jamais couvert le mobile — c'est le périmètre de D5e. |

**Conclusion §1** : hormis le traitement de fond du header (ombre vs filet, pré-existant) et le panneau dropdown (délibérément hors périmètre depuis D5C0), la production reproduit fidèlement D4b.2. Les deux écarts de valeurs pixel identifiés en cours de route (padding, gap) sont documentés et assumés, pas des divergences accidentelles.

## 2. Inventaire des réserves ouvertes

| # | Réserve | Détail | Détecté en |
|---|---|---|---|
| R1 | `.nav-dropdown-title` — fond natif du bouton | `appearance:auto`, aucun reset de `background`/`border` sur les déclencheurs `<button>` ("Bien-être", "Mode & Accessoires") ; fond gris UA (`rgb(240,240,240)`) au lieu de transparent. Confirmé via `getComputedStyle`. Antérieur à tout le chantier D5 (présent dès la première version de la règle dans `nav.css`, avant même D5b). | D5c (rollout), commit `8604a2d` |
| R2 | États `:focus` / `:focus-visible` | Aucune règle de focus clavier explicite nulle part dans `nav.css` ni dans le prototype D4. Navigation clavier dépend entièrement du contour par défaut du navigateur (jamais personnalisé, jamais supprimé). | D5f.0 (ce document) |
| R3 | Hover sur `.brand` (logo + nom) | Aucun état hover défini, ni dans D4 ni en production — le lien retour accueil ne donne aucun retour visuel au survol. | D5f.0 (ce document) |
| R4 | Panneau dropdown — écart de style avec D4 | Voir §1 : position (centré vs aligné à gauche), rayon de bordure, padding, traitement du hover. Explicitement hors périmètre D4/D5c depuis D5C0 §1, jamais réévalué depuis. | D5C0 (déjà connu), reconfirmé D5f.0 |
| R5 | Traitement de fond du header (ombre vs filet) | Voir §1. Écart avec D4, mais antérieur au chantier — pas une régression D5c. | D5f.0 (ce document) |
| R6 | Mécanisme sticky | `position:sticky` fonctionne, mais aucun effet de transition au scroll (pas de rétrécissement, pas d'apparition d'ombre) n'a jamais été spécifié ni par D4 ni en production. Explicitement exclu du périmètre D5c dès son pré-audit (D5C0 : *"sticky (mécanisme)"* dans la liste des exclusions). | D5C0 (déjà exclu), reconfirmé D5f.0 |
| R7 | Burger — absence d'animation d'icône, de synchronisation `aria-expanded`, de fermeture au clic extérieur / Échap | Le burger reste visuellement 3 barres statiques (pas de transformation en croix), `aria-expanded="false"` codé en dur jamais mis à jour par `js/nav.js`, aucune fermeture au clic extérieur ni à la touche Échap. Comportement documenté comme volontairement non étendu dans `js/nav.js` lui-même (*"Aucun comportement nouveau [...] aucun des trois n'existe dans le code d'origine"*). Antérieur à D5c, périmètre naturel de D5e (redesign mobile). | D5f.0 (ce document), origine antérieure |

## 3. Classement

Proposition de classement — à valider ou amender :

**Bloquant avant clôture de D5f** (aucun) :
- Rien dans cet inventaire n'empêche le header desktop de fonctionner correctement aujourd'hui. Aucune réserve ci-dessus n'a été identifiée comme cassant le layout, l'accessibilité de base ou une fonctionnalité existante.

**Souhaitable** (améliore la qualité perçue, risque faible, périmètre desktop) :
- R1 — fond natif de `.nav-dropdown-title` (déjà un ticket dédié ouvert, `task_ae11de59`)
- R2 — état `:focus-visible` sur les liens/déclencheurs de nav (accessibilité clavier)
- R3 — hover sur `.brand`

**Hors périmètre de D5f** (appartient à une autre phase déjà réservée, ou a été explicitement exclu dès D5C0) :
- R4 — panneau dropdown (exclu depuis D5C0 §1, jamais dans le périmètre D4)
- R5 — traitement de fond du header (pré-existant, jamais remis en cause par D4)
- R6 — mécanisme sticky (exclu depuis D5C0, ligne 5)
- R7 — burger / comportement mobile (périmètre D5e)

## 4. Risque

| Catégorie de retouche | Risque mobile | Risque dropdowns | Nature |
|---|---|---|---|
| R1 (fond `.nav-dropdown-title`) | Faible — la règle existe déjà en desktop uniquement (`border-bottom` D5c.2 déjà neutralisé en mobile) ; un reset `background`/`appearance` suit le même schéma et doit recevoir le même neutralisation explicite en `@media(max-width:768px)`, par prudence (même si le bouton n'a pas de fond gris visible en mobile aujourd'hui puisqu'il n'a pas de fond du tout dans ce contexte — à vérifier avant de conclure "aucun risque"). | Aucun — ne touche ni au mécanisme `:hover`, ni au JS. | Purement cosmétique |
| R2 (`:focus-visible`) | Aucun si la règle est ajoutée sans media query (le focus clavier n'a pas de comportement différent mobile/desktop à neutraliser). | Aucun si limité à `outline`/`box-shadow` sans toucher `display`/`position`. | Cosmétique + accessibilité |
| R3 (hover `.brand`) | Aucun — hover n'existe pas sur mobile (tactile), donc rien à neutraliser. | Aucun — `.brand` n'est pas un dropdown. | Purement cosmétique |
| R4/R5/R6/R7 | Non applicable — hors périmètre de cette phase par décision, pas par prudence technique. | — | — |

**Constat général** : les trois réserves classées "souhaitable" (R1, R2, R3) touchent des sélecteurs déjà isolés du mobile par les resets explicites établis en D5c.1/D5c.2 (même discipline : toute nouvelle règle desktop doit recevoir sa neutralisation dans `@media(max-width:768px)` si elle a un effet visuel qui n'existait pas avant). Aucune des trois ne touche à `nav-portal`, `.nav-dropdown:hover`, ou au JS du burger — le risque de casser un mécanisme existant est donc faible, à condition de suivre le même protocole canari (abayas/) → validation → rollout déjà éprouvé trois fois de suite sur ce chantier.

## 5. Critère de sortie

Proposition — le header desktop du périmètre D5c (catégories + parfums) peut être considéré **définitivement terminé** quand :

1. R1, R2 et R3 sont traités (corrigés + vérifiés) **ou** explicitement acceptés comme dette assumée par décision consciente — pas laissés ouverts par défaut.
2. Aucune nouvelle réserve n'est découverte lors de la vérification qui suivra R1/R2/R3 (même protocole que D5c.3 : rejouer les largeurs 1240-1920px, mobile, dropdowns, console).
3. Les réserves R4, R5, R6, R7 restent explicitement documentées comme hors périmètre plutôt que comme oublis — ce qui est déjà le cas ici.

À ce moment-là, D5f est clos et le chantier "Refonte du header desktop" peut passer la main à D5d (homepage) ou D5e (mobile) sans dette cachée sur le périmètre déjà livré.
