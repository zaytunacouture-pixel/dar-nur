# Phase D5c.0 — Pré-audit d'implémentation CSS desktop

**Statut** : document de conception, lecture seule. Aucune ligne de code de production modifiée.

**Objectif unique** : reproduire fidèlement le prototype validé (`design_handoff_header_desktop/index.html`, état final D4b.2) dans le code réel des pages de la Famille B (14 catégories + 2 templates parfums), sans modifier les comportements existants. Explicitement exclu de D5c : dropdowns (comportement), animations, sticky (mécanisme), nettoyage CSS non lié, ajustements d'espacement non prévus par le prototype.

---

## 1. Sélecteurs impactés — table de correspondance prototype → production

Le prototype utilise des noms de classes simplifiés pour ses propres besoins de démonstration. La production doit réutiliser les sélecteurs **déjà existants** dans `nav.css`, pas les noms du prototype tels quels.

| Élément | Sélecteur prototype | Sélecteur production à utiliser | Action |
|---|---|---|---|
| Header | `header.proto-header` | `header` | Ajouter `display:flex` (voir §4) |
| Rangée identité | `.row-identity` | `.row-identity` *(nouveau)* | Créer |
| Séparateur | `.row-identity::after` | `.row-identity::after` *(nouveau)* | Créer |
| Logo + lockup | `.brand`, `.brand-logo`, `.brand-text` | `.brand`, `.brand-logo`, `.brand-text` *(existants)* | Modifier valeurs (gap, taille, padding) |
| Nom / sous-titre | `.brand-text .name`, `.brand-text .ar` | **`.brand .name`, `.brand .ar`** *(existants — sélecteur différent du prototype, ne pas introduire `.brand-text .name`)* | Modifier valeurs, garder le sélecteur réel |
| Rangée navigation | `.row-nav` | `.row-nav` *(nouveau)* | Créer |
| Conteneur nav | `nav.proto-nav` | `nav` *(existant)* | Modifier `justify-content`, `gap`, `max-width`, `margin` |
| Lien simple | `.nav-item > a` | **`.nav-links > li > a`** *(existant, garder le sélecteur réel)* | Modifier `opacity`/`color` de l'état actif uniquement |
| Déclencheur dropdown | `.nav-item.has-dropdown > button` | **`.nav-dropdown-title`** *(existant, garder le sélecteur réel)* | Ajouter soulignement + chevron (nouveau visuel) |
| Panneau dropdown | `.dropdown-panel` | `.nav-dropdown-menu` *(existant)* | **Ne pas toucher** — hors périmètre D4/D5c |

## 2. Sélecteurs strictement inchangés

- `.nav-dropdown-menu`, `.nav-dropdown:hover > .nav-dropdown-menu` (ouverture au survol) — comportement et style inchangés.
- `.burger`, `.burger span` — inchangés (mobile hors périmètre D5c, voir §4).
- `js/nav.js` (toggle `#burger`/`#navLinks`) — aucune modification, cible des ID inchangés.
- `@media(max-width:768px)` — bloc entier non modifié par D5c (périmètre D5e).

## 3. Valeurs pixel du prototype — décision validée

Les valeurs du prototype D4b.2 (`gap:46px`, `max-width:1520px` du `nav`, logo `58px`, etc.) sont retenues comme référence de production — D4 a itéré, évalué et validé ces valeurs en D4c ; les rejuger une par une reviendrait à rouvrir D4.

**Réserve explicite** : ces valeurs restent *provisoirement* validées jusqu'à la fin de D5c.3, où elles seront confrontées aux mesures réelles du site (1240 → 1920px). Si un écart apparaît dans le code réel (et non dans le prototype isolé), c'est l'implémentation qui sera corrigée, pas le document D4. Autrement dit : D4 définit la cible visuelle, D5 vérifie que cette cible est atteinte dans le code réel.

## 4. Risque central identifié — comportement mobile pendant la transition

Le prototype ne comporte **aucun burger** (explicitement hors périmètre D4, cf. `D4A_PRE_AUDIT_PROTOTYPE_HEADER_DAR_NUR.md` §3). Introduire `.row-identity`/`.row-nav` comme deux `<div>` réels dans le HTML de production risque de casser le rendu mobile si rien n'est fait : ces deux blocs empileraient logo et burger sur deux lignes en dessous de 768px, alors que D5c doit laisser le mobile strictement inchangé (périmètre = desktop uniquement, mobile = D5e).

**Exigence fonctionnelle (pas une solution technique imposée)** : les nouveaux wrappers desktop (`.row-identity`, `.row-nav`) devront être neutres en mobile, afin que le comportement burger reste strictement identique. La technique retenue (par exemple, mais non limitée à, un mécanisme `display:contents` similaire à celui déjà utilisé par `.nav-portal` depuis le chantier N1) sera choisie et validée lors de D5c.1, pas figée ici — si le DOM final se prête à une solution plus simple une fois D5c.1 entamé, elle reste ouverte.

Ce point doit être vérifié explicitement en D5c.1 (canari) avant tout rollout, quelle que soit la technique retenue.

## 5. Fichiers concernés

- `nav.css` : toutes les nouvelles/modifiées règles (§1), plus l'ajout mobile (§4).
- HTML : squelette à modifier sur les 14 pages catégories (édition directe, pas de pipeline vivant — cf. `D5A_PRE_AUDIT_IMPLEMENTATION_HEADER_DAR_NUR.md` §1) + les 2 templates parfums (régénération réelle après édition).
- Homepage (`index.html`) : **hors périmètre de D5c**, traitée séparément en D5d.

## 6. Critère de sortie

Ce pré-audit est suffisant pour ouvrir D5c.1 si les 2 points ouverts (§3 valeurs pixel, §4 mécanisme mobile) sont confirmés.
