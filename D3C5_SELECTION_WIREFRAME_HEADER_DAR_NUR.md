# Phase D3c.5 — Sélection du wireframe retenu pour D4

**Statut** : décision de conception validée. Document de sélection, lecture seule — aucun CSS, aucun HTML, aucune valeur figée.

**Référence** : `WIREFRAMES_HEADER_DESKTOP_STRATEGIE_C_DAR_NUR.md` (D3c, les 3 wireframes comparés ici), `D3B1/D3B2/D3B3` (décisions architecturales), `REVUE_COMPARATIVE_HEADER_DESKTOP_DAR_NUR.md` (D2.5, même méthode de grille comparative).

---

## Grille comparative

| Critère | WF1 — Bande jumelle | WF2 — Rangée signature centrée | WF3 — Identité discrète / navigation affirmée |
|---|---|---|---|
| Exprime D3b-1 (composition propre) | ✓ | ✓ | ✓ |
| Exprime D3b-2 (deux rangées) | ✓ | ✓ | ✓ |
| Exprime D3b-3 (hiérarchie par composition, pas taille) | △ | ✓ | ✓✓ |
| Lisibilité navigation | ✓✓ | ✓ | ✓✓ |
| Évolutivité | ✓ | ✓✓ | ✓✓ |
| Fidélité à la stratégie C (identité d'abord, sans excès) | △ | ✓ | ✓✓ |
| Risque d'implémentation | Faible | Moyen | Moyen |

## Lecture de la grille

**Wireframe 1** remplit les contraintes mais n'exploite pas réellement les décisions D3b — en particulier D3b-3, qui reste théorique plutôt que perçue. Risque identifié : donner l'impression d'un header « mieux, mais encore proche de l'ancien », alors que toute la conception depuis D1 visait à dépasser le simple agrandissement.

**Wireframe 2** exprime nettement la signature, mais pousse la logique vers son extrême : le centrage du logo risque de faire du header une affiche de marque (« regardez notre marque ») avant un point d'entrée vers la navigation (« voici comment entrer dans notre univers »). La stratégie C retenue en D2.5 était « identité d'abord, sans diminuer la découvrabilité » — pas « logo monumental ». Wireframe 2 déplace le curseur plus loin que cette décision ne l'exigeait.

**Wireframe 3** applique le plus fidèlement la précision de D3b-3 : guider le regard par la respiration, l'isolement, le contraste, les proportions — pas par la taille. Il transforme le header en composition plutôt qu'en affiche, ce qui est exactement ce que recherchait la stratégie C.

## Décision

- ❌ **Wireframe 1** : conservé comme référence historique / baseline de comparaison, non retenu.
- 🔶 **Wireframe 2** : conservé comme variante expressive documentée, non retenu — pourrait être reconsidéré si la direction retenue s'avérait, en D4, insuffisamment affirmée.
- ✅ **Wireframe 3** : **retenu pour D4**.

## Prochaine étape

D4 — premier prototype HTML/CSS statique du Wireframe 3, pour vérifier que la composition fonctionne réellement en rendu (pas pour rechercher une nouvelle architecture — celle-ci est désormais fixée par D3b-1/2/3 et ce choix).
