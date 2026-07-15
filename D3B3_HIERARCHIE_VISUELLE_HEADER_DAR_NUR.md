# Phase D3b-3 — Décision : hiérarchie visuelle / parcours de lecture (§7.3)

**Statut** : décision d'architecture validée. Document de conception, lecture seule — aucun CSS, aucun HTML, aucune valeur figée.

**Référence** : `D3B1_LARGEUR_REFERENCE_HEADER_DAR_NUR.md` (D3b-1), `D3B2_ARCHITECTURE_GENERALE_HEADER_DAR_NUR.md` (D3b-2), `WIREFRAME_HEADER_DESKTOP_STRATEGIE_C_DAR_NUR.md` (D3a, §7 point 3).

**Question cadre** : Quel est le parcours visuel que l'utilisateur doit naturellement suivre lors des 2 à 3 premières secondes ?

**Réserve méthodologique** : cette question n'est pas mesurable avant mise en production réelle (aucune donnée d'usage — eye-tracking, heatmap — n'existe pour ce site) ; la décision ci-dessous est une hypothèse de conception raisonnée, pas un fait vérifié.

**Contrainte transversale retenue** : la hiérarchie visuelle ne doit jamais diminuer la découvrabilité de la navigation. Le header reste d'abord un outil d'orientation ; la marque s'exprime *en plus*, pas *à la place*.

---

## 1. Options examinées et verdict

| Option | Verdict | Justification |
|---|---|---|
| **A — L'identité d'abord** | ✅ **Retenue** | Voir §2. |
| **B — Navigation d'abord** | ❌ Écartée | Rapprocherait le rendu de l'esprit de la Variante B (Hiérarchie), écartée au profit de C en D2.5 précisément pour son gain d'identité. Retenir cette option ici reviendrait à réintroduire la logique de B par un autre chemin, rendant D2.5 et cette décision difficiles à concilier. |
| **C — Équilibre** | ❌ Écartée comme principe directeur | « Équilibre » n'est pas vérifiable objectivement (contrairement à une largeur en pixels) — ce n'est pas une décision, c'est une absence de décision. Aucun moyen de savoir, au moment des wireframes, si l'équilibre est atteint. Conservée uniquement comme inspiration pour la composition interne de l'option retenue. |
| **D — Signature** | 🔶 Conservée comme piste d'exploration en D3c, pas comme décision architecturale | Seule option qui introduirait potentiellement un **nouvel élément de contenu** (devise, motif, symbole) — or aucune décision de ce chantier ne crée de nouveau contenu pour résoudre un problème de composition. Un motif graphique déjà existant (ex. glyphe نور déjà utilisé en hero-ring sur `bakhour/`) pourra enrichir un wireframe plus tard, mais décider maintenant qu'il faut un élément supplémentaire reviendrait à commencer à concevoir du contenu, prématurément. |

## 2. Pourquoi l'Option A est retenue

Il y a une différence importante entre *« la marque attire d'abord le regard »* et *« la navigation devient secondaire »*. La contrainte transversale ci-dessus évite précisément cette dérive : elle ne dit pas « on cache la navigation », elle dit « la première impression est la marque, puis immédiatement la navigation ». Avec l'architecture à deux rangées retenue en D3b-2, ce parcours devient naturel : *j'identifie Dar Nūr → je comprends immédiatement où aller*. C'est cohérent avec le positionnement d'une maison premium, et c'est la seule option qui reste alignée avec l'ensemble de la chaîne de décisions déjà validée (D2.5 → D3b-1 → D3b-2), plutôt qu'une préférence esthétique isolée.

## 3. Précision importante pour D3c

**La hiérarchie visuelle ne doit pas dépendre uniquement des dimensions.** Le regard peut être guidé par la respiration, le vide, l'alignement, le contraste, le rythme, les proportions — pas uniquement par un logo agrandi. Cette précision évite que « l'identité d'abord » ne se transforme, en D3c, en un simple exercice d'agrandissement du logo, ce qui appauvrirait la décision prise ici.

## 4. Réponse à la question de sortie

La hiérarchie retenue reste vérifiable de façon concrète (position des éléments dans les deux rangées, ordre de tabulation, poids visuel relatif exprimé par des moyens autres que la seule taille) plutôt que purement subjective, et respecte la contrainte transversale : l'identité vient en premier temps de lecture, la navigation reste immédiatement découvrable en second temps, jamais reléguée.

## 5. Bilan des trois décisions architecturales fondamentales

- **D3b-1** : le header possède son propre système de composition, indépendant du conteneur `.wrap`/1240px.
- **D3b-2** : architecture à deux rangées (identité / navigation).
- **D3b-3** : la marque constitue le premier point d'entrée visuel, sans sacrifier la fonction d'orientation — exprimé par la composition (respiration, alignement, contraste), pas uniquement par la taille.

## 6. Point à clarifier avant D3c

Le découpage initial de D3a (§7) prévoyait 5 points à trancher : largeur de référence (traité en D3b-1), architecture générale (D3b-2), hiérarchie visuelle (ce document), **évolutivité (§7.4)** et **critères de sortie de D3 (§7.5)**. Le §7.4 a en pratique déjà été traité de façon transversale dans chacune des trois décisions ci-dessus (une ligne « impact évolutivité » figure dans chacune). Le §7.5, en revanche, n'a pas encore fait l'objet d'un document dédié. Avant d'ouvrir D3c, il reste à confirmer si ces deux points sont considérés comme couverts par ce qui précède, ou s'ils méritent chacun leur propre décision documentée avant de passer aux wireframes.
