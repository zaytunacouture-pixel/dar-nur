# Phase D3b-2 — Décision : architecture générale du header (§7.2)

**Statut** : décision d'architecture validée. Document de conception, lecture seule — aucun CSS, aucun HTML, aucune valeur figée.

**Référence** : `D3B1_LARGEUR_REFERENCE_HEADER_DAR_NUR.md` (D3b-1), `WIREFRAME_HEADER_DESKTOP_STRATEGIE_C_DAR_NUR.md` (D3a, §7 point 2).

**Question cadre** : Quelle structure spatiale permet le mieux d'exprimer la stratégie C tout en respectant le cahier D1 ?

---

## 1. Familles examinées et verdict

| Famille | Verdict | Justification |
|---|---|---|
| **1 — Une seule rangée** | ❌ Écartée | Reviendrait à garder la même architecture qu'aujourd'hui en espérant qu'un budget plus large suffise — contredit la conclusion de D1/D2.5 : le problème n'est pas un réglage insuffisant, c'est un changement d'arborescence que la structure actuelle ne peut pas absorber par construction. Sa capacité d'évolution reste dépendante d'une largeur négociée au cas par cas, jamais garantie structurellement. |
| **2 — Deux rangées** | ✅ **Retenue** | Voir §2. |
| **3 — Disposition hybride** | 🔶 Conservée comme réservoir d'idées | Ne décrit pas encore un véritable parti pris d'architecture, mais une collection de variantes de composition — plus proche de la matière d'un wireframe (D3c) que d'une famille structurelle autonome. Réintégrée comme source d'inspiration pour enrichir la composition à l'intérieur de la Famille 2, pas comme architecture concurrente. |
| **4 — Architecture libre** | ❌ Écartée | N'apporte aucun cadre décisionnel (« on verra ») — va à l'encontre du processus suivi depuis plusieurs semaines, qui consiste précisément à réduire progressivement l'espace des possibles avant de dessiner quoi que ce soit. |

## 2. Pourquoi la Famille 2 est retenue

La Famille 2 possède une propriété que les trois autres n'ont pas : elle **transforme une contrainte quantitative en séparation fonctionnelle**. Aujourd'hui, logo et navigation se disputent le même espace horizontal — c'est cette concurrence qui produit le déficit mesuré en D1. Avec deux rangées, le logo obtient son propre territoire, la navigation obtient le sien : le problème ne se résout pas en optimisant l'espace partagé, il disparaît parce que la concurrence pour cet espace disparaît elle-même. C'est une solution d'architecture, pas une optimisation.

## 3. Ce que cette décision fixe — et ce qu'elle laisse ouvert

**Fixé** : le header se compose de deux zones verticalement distinctes — une rangée dédiée à l'identité (logo, éventuellement une signature), une rangée dédiée à la navigation complète.

**Explicitement laissé ouvert pour D3c** (aucune de ces questions n'est tranchée ici) :
- hauteur de la première rangée,
- importance visuelle donnée au logo,
- présence ou non d'une signature/tagline,
- respiration verticale globale,
- traitement du comportement sticky,
- proportions relatives entre les deux bandes,
- toute composition inspirée de la Famille 3 (hybride) à l'intérieur de ce cadre à deux rangées.

## 4. Réponse à la question de sortie

*La structure retenue laisse-t-elle suffisamment de liberté pour que les futurs wireframes explorent plusieurs compositions, ou enferme-t-elle déjà le projet dans une solution implicite ?*

Non — elle fixe uniquement la structure générale (deux zones distinctes), sans imposer la composition détaillée. Tous les points listés en §3 restent à explorer en D3c.

## 5. Note sur le critère D1 « une seule ligne desktop »

Comme anticipé dans la note documentaire de D3a, ce critère ne doit plus être lu comme « une seule bande physique du header », mais comme **« aucun élément de navigation ne se replie lui-même sur plusieurs lignes »**. Cette lecture reste fidèle à l'intention originelle de D1 (éviter le wrap de texte, le problème réellement démontré par tous les audits) et demeure pleinement compatible avec la Famille 2. **D1 n'est pas modifié maintenant** — cette clarification sera reportée dans D1 à la clôture définitive de la conception (D3), pour ne pas réécrire un document déjà committé pendant que l'architecture est encore en mouvement.

## 6. Prochaine étape

Cette décision ouvre D3b-3 (§7.3 — quelle hiérarchie visuelle : quel élément attire le regard entre logo, navigation, respiration, signature).
