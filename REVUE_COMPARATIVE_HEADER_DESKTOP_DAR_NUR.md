# Phase D2.5 — Revue comparative des stratégies de layout

**Statut** : document de conception, lecture seule. Aucun wireframe, aucun CSS, aucun HTML. Objectif unique : comparer A, B, C selon une grille pondérée, éliminer deux variantes, justifier la stratégie retenue.

**Référence** : `STRATEGIES_LAYOUT_HEADER_DESKTOP_DAR_NUR.md` (Phase D2, committé).

---

## Avertissement méthodologique

Contrairement aux audits précédents (D1, mesures de largeur), les scores ci-dessous **ne sont pas mesurés** — ce sont des évaluations qualitatives, notées de 1 à 5, tirées directement des formulations du document D2. Elles portent un jugement, pas un fait. La grille de pondération proposée par l'utilisateur est reprise telle quelle ; les scores restent ouverts à révision — ce document est un outil pour aiguiser la décision, pas un verdict automatique qui se substituerait à la vision produit.

## Grille de pondération retenue

| Critère | Poids |
|---|--:|
| Cohérence avec l'image premium | 35 % |
| Lisibilité | 25 % |
| Scalabilité | 20 % |
| Coût / complexité (favorabilité — faible coût = score haut) | 20 % |

## Notation (1 à 5), justifiée par le texte de D2

| Critère | A — Continuité | B — Hiérarchie | C — Signature |
|---|--:|--:|--:|
| Cohérence premium | **2** — « neutre : ne change pas la perception actuelle, ni en bien ni en mal » | **3** — « positive, mais modérée » | **5** — « la plus forte... signal fort et cohérent » |
| Lisibilité | **2** — « gain marginal seulement » | **4** — « meilleure... réduit la compétition visuelle » | **4** — « potentiellement la meilleure » (formulation prudente : effet secondaire de l'espace, pas l'objectif recherché) |
| Scalabilité | **1** — « faible... le même type d'ajustement » | **4** — « bonne... absorbe mieux la croissance » | **5** — « la meilleure des trois par construction » |
| Coût/complexité (favorabilité) | **5** — « faible... la plus proche du code existant » | **3** — « moyen » | **1** — « élevé... la plus de vérification de non-régression » |

## Score pondéré

| Variante | Calcul | **Total /5** |
|---|---|--:|
| A — Continuité | 2×0,35 + 2×0,25 + 1×0,20 + 5×0,20 | **2,40** |
| B — Hiérarchie | 3×0,35 + 4×0,25 + 4×0,20 + 3×0,20 | **3,45** |
| C — Signature | 5×0,35 + 4×0,25 + 5×0,20 + 1×0,20 | **3,95** |

---

## Constat à signaler avant toute conclusion

Avec cette grille et ces scores, **C arrive en tête, devant B** — ce qui contredit l'hypothèse de lecture formulée avant cette revue (qui plaçait B comme meilleur compromis). Ce n'est pas anodin : le poids de 35 % sur la cohérence premium — le critère où C domine le plus nettement (5 contre 3 pour B) — l'emporte sur la pénalité de son coût élevé (poids 20 %, écart de seulement 2 points face à B).

**Test de sensibilité** : si le poids « Coût/complexité » était porté à 30 % (au détriment de la cohérence premium ramenée à 25 %), le résultat s'inverse :
- A : 2×0,25+2×0,25+1×0,20+5×0,30 = 2,50
- B : 3×0,25+4×0,25+4×0,20+3×0,30 = 3,45
- C : 5×0,25+4×0,25+5×0,20+1×0,30 = 3,55

L'écart C/B devient marginal (3,55 vs 3,45) — **le classement est sensible à l'importance réelle qu'on accorde au coût d'implémentation**, une question qui relève de la vision produit, pas de ce document.

---

## Ce que cette grille élimine avec confiance

**Variante A** peut être écartée sans ambiguïté : elle termine dernière sur les deux pondérations testées, et son seul avantage (coût faible) ne compense pas un déficit structurel sur les trois autres critères — y compris celui, le plus documenté par D1, de la scalabilité (elle reproduit la cause du problème plutôt que de la traiter).

## Ce qui reste une vraie décision produit, pas un résultat automatique

Entre **B** et **C**, l'écart est faible et son sens dépend de l'importance relative donnée au coût d'implémentation face à l'ambition de marque — exactement le point que l'hypothèse de lecture initiale (favorable à B) et la grille pondérée (favorable à C) ne tranchent pas de la même façon.

---

## Conclusion

La revue comparative ne désigne pas une stratégie uniquement par son score pondéré. Elle met en évidence que les variantes B et C répondent toutes deux au cahier des contraintes. Le choix final relève donc d'une décision produit.

Compte tenu de l'état de maturité atteint par le projet (architecture de navigation stabilisée sur `checkpoint-nav-v3`, pipeline `nav.config.json`/`build-nav.mjs`/`generate-parfums.mjs` robuste et documenté, navigation homogène sur 19 pages, dettes techniques soldées ou requalifiées), le projet n'est plus en phase de stabilisation mais entre dans une phase de construction de son identité. Dans ce contexte, la **stratégie C — Signature** est retenue comme direction de conception : c'est la seule des trois qui exploite réellement l'investissement déjà réalisé sur les fondations, plutôt que de continuer à optimiser un gabarit hérité.

La **variante B — Hiérarchie** est conservée comme solution de repli documentée (à réévaluer si le coût ou les risques de coordination de C s'avéraient, en Phase D3, plus lourds que prévu). La **variante A — Continuité** est écartée : elle termine dernière sur les 4 critères pondérés, y compris sur la sensibilité testée, et ne traite pas la cause structurelle identifiée en D1.

**Décision** : Phase D3 ouverte, avec pour unique objectif la production de wireframes pour la stratégie C.
