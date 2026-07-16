# Phase D3a — Description structurée du wireframe (Stratégie C — Signature)

**Statut** : document de conception, lecture seule. Description textuelle de la disposition envisagée — aucun CSS, aucun HTML, aucune valeur de pixel figée. Objectif : valider le concept de layout avant de produire un prototype HTML/CSS statique (Phase D3b).

**Référence** : `CAHIER_CONTRAINTES_HEADER_DESKTOP_DAR_NUR.md` (D1), `STRATEGIES_LAYOUT_HEADER_DESKTOP_DAR_NUR.md` (D2), `REVUE_COMPARATIVE_HEADER_DESKTOP_DAR_NUR.md` (D2.5 — stratégie C retenue).

---

## Contraintes héritées de D1 (rappel — non renégociables dans ce document)

- Identité Dar Nūr conservée (palette Émeraude & Or, tokens `:root` existants).
- Logo bilingue FR/AR conservé (image, proportions, présence des deux lignes de texte).
- Typographie Cinzel conservée pour la navigation.
- Comportements fonctionnels inchangés : dropdowns (hover/focus), burger mobile, logique SPA homepage, générateur parfums (`buildParfumsNavBlock`), pipeline `nav.config.json`/`build-nav.mjs`/`generate-parfums.mjs`.

Ce rappel évite d'avoir à revenir à D1 pour se rappeler du périmètre — il ne remplace pas D1, qui reste la référence complète (`CAHIER_CONTRAINTES_HEADER_DESKTOP_DAR_NUR.md`).

---

## 1. Rappel du principe retenu

Le header cesse de faire tenir 9 entrées dans l'espace résiduel laissé par le logo. Logo et navigation deviennent deux zones ayant chacune leur espace dédié, dans un header plus haut et plus aéré, conçu pour affirmer l'identité Dar Nūr plutôt que pour subir la croissance du contenu.

---

## 2. Zones du header

- **Zone Logo** : logo + texte bilingue FR/AR, avec sa propre respiration — ne partage plus son espace en simple « reste » après calcul de la navigation.
- **Zone Navigation** : la stratégie C recherche une organisation offrant davantage d'espace et de respiration à la navigation, sans contrainte de faire tenir 9 entrées dans un budget hérité de 7. **La disposition exacte** (une ou plusieurs rangées, hiérarchisation éventuelle des entrées, positionnement relatif des deux zones) **reste ouverte** et sera décidée lors des arbitrages du §7 — ce document ne présume d'aucune de ces options.

---

## 3. Disposition par famille de page (rappel D1 §3)

| Famille | Porteurs | Ce qui change | Ce qui ne change pas |
|---|---|---|---|
| **Famille A — Homepage** | `index.html` (CSS inline propre) | Nouvelle hauteur/respiration du header, cohérente avec Famille B | Logique SPA (`goCat`, `showHome`, overlay, clic extérieur, croix burger) — non touchée, seul l'habillage visuel |
| **Famille B — 18 pages** | 14 catégories + `bakhour` + 3 pages parfums, via `/nav.css` partagé | Même évolution de hauteur/respiration | Structure HTML générée par le pipeline (`build-nav.mjs`/`generate-parfums.mjs`), dropdown Parfums par marque sur les pages parfums |

Les deux familles reçoivent le **même langage visuel**, mais via deux implémentations distinctes maintenues en parallèle (comme c'est déjà le cas aujourd'hui pour `nav.css` vs le CSS inline homepage) — pas de fusion des deux, ce serait hors périmètre (D1 §2.1).

---

## 4. Budget horizontal visé (indicatif, à confirmer en D3b)

Rappel des chiffres réels (D1 §4) : budget actuel ~1007px à ≥1240px, besoin actuel des 9 entrées ~1098px (gap 34px), déficit ~91px.

La stratégie C part du principe que le header n'a plus à rester contraint dans le conteneur `.wrap`/1240px partagé avec le reste du site (voir question ouverte §7). Quel que soit l'arbitrage retenu en §7 sur la disposition, le budget élargi doit se traduire par une **marge d'évolutivité explicite** : le layout doit visiblement pouvoir absorber une 10ᵉ entrée courte ou un intitulé plus long sans revenir à un déficit, conformément à D1 §2.4.

Aucune valeur précise ni aucun mécanisme (espacement, disposition en rangées) n'est arrêté à ce stade — c'est l'objet du prototype (D3b), une fois les questions de largeur de référence et de disposition (§7) tranchées.

---

## 5. Comportements explicitement inchangés (D1 §2.1/2.2)

- Pipeline `nav.config.json` → `build-nav.mjs` → `partials/nav-common.generated.html` → `generate-parfums.mjs` : inchangé.
- 9 entrées, 2 dropdowns (Bien-être/Mode & Accessoires), tous les liens : inchangés.
- Hover + focus desktop sur les dropdowns : comportement inchangé, seul l'habillage visuel évolue.
- Le seuil de bascule desktop/mobile ne fait pas partie du périmètre de D3. La valeur actuellement implémentée (768px) est conservée à titre de référence tant qu'une décision spécifique n'est pas prise dans un chantier distinct (à ne pas confondre avec la valeur 1024px de la SPEC, reclassée puis close sans implémentation — voir journal du 2026-07-15). Toggle et animation du burger : inchangés, ce chantier ne touche que le rendu desktop.
- Sticky header : comportement inchangé (fonctionnel aujourd'hui, à revérifier après toute modification de hauteur).
- SEO/ARIA : inchangés (HTML de nav toujours statique, attributs existants conservés).

---

## 6. Vérification conceptuelle face aux critères D1 (§6)

| Critère D1 | Statut à ce stade |
|---|---|
| Une seule ligne desktop, aucun wrap | Objectif du concept — à démontrer chiffré en D3b, pas garanti par la seule description |
| Aucune perte fonctionnelle | Respecté par construction (§5) |
| Mobile non affecté | Respecté par construction (§5) |
| Aucune régression sur les 19 pages | Dépend de la coordination Famille A / Famille B (§3) — point de vigilance identifié dès D2 |
| Pipeline inchangé | Respecté par construction (§5) |
| Marge d'évolution explicitée | À chiffrer en D3b une fois une disposition concrète posée |
| Finition premium | Évaluation qualitative réservée à la relecture visuelle du prototype (D3b) |

**Note documentaire** : le critère « une seule ligne desktop, aucun wrap » est repris de D1 à titre historique. La question de savoir si la navigation doit rester organisée sur une seule rangée fait désormais partie des arbitrages du §7.2. Si une architecture différente est retenue en D3, D1 sera mis à jour lors de la clôture de cette phase afin de maintenir la cohérence documentaire.

---

## 7. Points à trancher avant le prototype HTML (D3b)

1. **Largeur de référence** : le header reste-t-il aligné sur le conteneur `.wrap`/1240px partagé avec le reste du site, ou est-il autorisé à occuper une largeur propre (potentiellement différente du contenu en dessous) ? C'est la question que D1 anticipait explicitement comme pouvant être rouverte par cette stratégie.
2. **Disposition de la navigation** : une rangée horizontale unique (repositionnée à droite, centrée, ou autrement) — ou une disposition sur plusieurs rangées/niveaux (ex. logo seul sur une ligne, navigation complète sur une autre) ? D2 n'a jamais figé cette question pour la stratégie C ; elle doit être tranchée ici, explicitement, avant toute esquisse.
3. **Hauteur cible** : quelle fourchette de hauteur de header viser (actuellement 81-85px selon la famille) ? Sans figer un chiffre, faut-il une fourchette basse (respiration modérée) ou clairement assumée comme plus haute ?
4. **Hiérarchie visuelle des entrées** : la stratégie C, telle que définie en D2, ne repose pas sur un regroupement visuel marqué (c'était le principe de B). Faut-il rester strictement sur « plus d'espace, même présentation plate », ou emprunter un léger traitement différencié aux dropdowns (sans reproduire B dans son ensemble) ? À trancher explicitement, pas à hybrider par défaut.
5. **Impact vertical sur les pages catégories** : un header plus haut réduit l'espace visible avant le contenu, en particulier sur les pages catégories où celui-ci démarre juste sous le header (risque déjà noté en D2 §4 de la Variante C) — accepté tel quel, ou à contenir dans une fourchette précise ?

Ces 5 points doivent être tranchés avant de produire le prototype HTML (D3b), pour que celui-ci matérialise une décision claire plutôt que d'arbitrer silencieusement à la place de l'utilisateur.
