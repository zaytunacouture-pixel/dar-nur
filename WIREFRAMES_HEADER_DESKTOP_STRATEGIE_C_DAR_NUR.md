# Phase D3c — Wireframes (compositions) du header desktop, stratégie C

**Statut** : document de conception, lecture seule. Descriptions de composition — **aucun CSS, aucune largeur, aucune hauteur, aucune valeur de `gap`, aucune taille de police**. Le wireframe reste un document de composition, pas d'implémentation.

**Référence** : `D3B1_LARGEUR_REFERENCE_HEADER_DAR_NUR.md`, `D3B2_ARCHITECTURE_GENERALE_HEADER_DAR_NUR.md`, `D3B3_HIERARCHIE_VISUELLE_HEADER_DAR_NUR.md` (les trois décisions architecturales que chaque wireframe doit exprimer), `CAHIER_CONTRAINTES_HEADER_DESKTOP_DAR_NUR.md` (D1).

---

## Critères de sortie de D3c (Definition of Done)

Les wireframes ne seront considérés comme suffisamment mûrs pour passer au prototype HTML (D4) que si tous les points suivants sont validés :

1. **Les décisions D3b sont visibles** — chaque wireframe exprime concrètement le système de composition propre (D3b-1), les deux rangées (D3b-2), la hiérarchie « identité d'abord » (D3b-3). Aucune ne reste théorique.
2. **Les contraintes D1 sont respectées** — identité visuelle, navigation complète (9 entrées, 2 dropdowns), comportements inchangés, accessibilité, évolutivité, sobriété.
3. **Plusieurs variantes ont réellement été explorées** — pas une seule idée affinée : chaque wireframe représente une composition différente de la même architecture.
4. **Une variante s'impose naturellement** — la comparaison permet d'en écarter d'autres sur des critères objectifs, pas de produire « trois beaux dessins ».
5. **Aucune valeur d'implémentation n'est figée** — pas de CSS, largeur, hauteur, `gap`, taille de police.
6. **Le prototype HTML devient une conséquence** — à la fin de D3c, on doit savoir exactement quoi construire ; D4 vérifie que l'architecture fonctionne, il ne la cherche plus.

---

## Rappel du cadre fixé (non renégociable dans ce document)

Système de composition propre au header (D3b-1) · deux rangées, identité puis navigation (D3b-2) · hiérarchie exprimée par la composition — respiration, alignement, contraste, rythme, proportions — pas uniquement par la taille (D3b-3) · 9 entrées, 2 dropdowns, logo bilingue, Cinzel, palette Émeraude & Or, burger mobile et pipeline inchangés (D1).

---

## Wireframe 1 — « Bande jumelle »

**Composition** : les deux rangées ont un traitement visuel proche l'une de l'autre (même registre de fond, séparation discrète entre elles). Rangée identité : logo aligné au bord gauche, comme aujourd'hui. Rangée navigation : les 9 entrées alignées au bord droit, réparties de façon régulière — reprise du positionnement actuel, simplement déplacée sur sa propre ligne.

**Ce qu'elle exprime** : la continuité la plus forte avec l'existant — un visiteur habitué au site retrouve immédiatement ses repères (logo à gauche, nav à droite), seule la séparation en deux lignes change.

**Risque** : c'est la variante la plus proche d'un simple « étirement vertical » de l'existant — elle applique la structure à deux rangées sans vraiment exploiter la hiérarchie « identité d'abord » au-delà de la position. Si rien d'autre ne la distingue, la première rangée risque de passer inaperçue plutôt que d'être perçue comme un vrai temps de lecture.

## Wireframe 2 — « Rangée signature centrée »

**Composition** : rangée identité avec le logo **centré** (pas aligné à gauche), entouré d'une respiration large et symétrique de part et d'autre — la rangée devient un vrai bandeau de signature plutôt qu'un coin occupé par un élément parmi d'autres. Rangée navigation : les 9 entrées réparties sur toute la largeur disponible, avec un espacement régulier (plutôt qu'un simple alignement à droite) — la navigation occupe pleinement sa propre rangée.

**Ce qu'elle exprime** : le centrage de la rangée identité renforce fortement la lecture « signature » (D3b-3) par l'alignement et la respiration, pas par la taille — cohérent avec la précision ajoutée en D3b-3. La navigation, répartie sur toute la largeur plutôt que collée à un bord, gagne en présence propre.

**Risque** : rupture la plus nette avec les repères actuels (le logo n'est plus « à gauche ») — demande de vérifier que cela reste cohérent avec la homepage (qui garde son logo cliquable comme retour à l'accueil) et les habitudes de navigation web générales (logo à gauche = convention quasi universelle).

## Wireframe 3 — « Rangée identité discrète, rangée navigation affirmée »

**Composition** : rangée identité volontairement fine et sobre (juste le logo, peu de respiration verticale) mais nettement isolée par un contraste ou un filet de séparation — elle reste le premier élément rencontré par le regard (en haut, distinct), sans dominer par sa taille. Rangée navigation : la plus généreuse en respiration des trois wireframes, avec un traitement légèrement différencié entre les liens simples et les deux dropdowns (inspiré de la Famille 3 « hybride » conservée comme réservoir d'idées en D3b-2 — sans reprendre la Variante B dans son ensemble, seulement un poids visuel légèrement plus affirmé pour les déclencheurs de groupe).

**Ce qu'elle exprime** : la démonstration la plus directe de la précision de D3b-3 — l'identité vient en premier dans l'ordre de lecture (position, isolation visuelle) sans être l'élément le plus grand ni le plus habillé. C'est la navigation qui reçoit le plus de respiration, cohérent avec la contrainte transversale (« la navigation ne doit jamais perdre en découvrabilité »).

**Risque** : demande le dosage le plus fin des trois — si le contraste de la rangée identité est trop faible, elle risque de se fondre plutôt que d'être « isolée » ; si le traitement différencié des dropdowns est trop marqué, on se rapproche de la Variante B écartée en D2.5.

---

## Comparaison face aux critères de sortie

| Critère | Wireframe 1 | Wireframe 2 | Wireframe 3 |
|---|---|---|---|
| Décisions D3b visibles | Partiellement — la structure est là, la hiérarchie D3b-3 est faible | Oui — centrage + répartition expriment nettement D3b-3 | Oui — exprime le plus précisément la nuance « composition, pas taille » de D3b-3 |
| Respect D1 | Oui | Oui, sous réserve de vérifier la convention logo-à-gauche | Oui, sous réserve de ne pas dériver vers la Variante B écartée |
| Composition distincte des deux autres | Faible différenciation (proche de l'existant étiré) | Forte différenciation | Forte différenciation |
| Risque principal | Hiérarchie theorique, pas réellement perçue | Rupture de convention (logo centré) | Dosage fin requis (contraste/différenciation dropdowns) |

## Recommandation

Le Wireframe 1 sert surtout de **point de comparaison** (il montre ce que donnerait la structure D3b-2 sans vraiment exploiter D3b-3) plutôt qu'une direction candidate à retenir telle quelle — le critère de sortie n°4 (« une variante s'impose naturellement, pas trois beaux dessins ») joue plutôt en sa défaveur.

Entre les Wireframes 2 et 3, les deux expriment bien la hiérarchie retenue en D3b-3, par des moyens différents : le 2 mise sur la **position** (centrage), le 3 mise sur le **contraste/l'isolation** plutôt que sur la taille ou la position. Je n'ai pas de préférence tranchée à imposer ici — c'est exactement le type de choix qui relève de la sensibilité de conception, pas d'un critère mesurable.

Quelle direction retiens-tu — Wireframe 1, 2, 3, ou une combinaison des idées (ex. le centrage du 2 avec le traitement différencié des dropdowns du 3) ?
