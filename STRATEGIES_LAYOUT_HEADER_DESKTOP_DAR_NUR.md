# Phase D2 — Stratégies de layout du header desktop

**Statut** : document de conception, lecture seule. Aucun wireframe, aucun CSS, aucun HTML. Trois stratégies (l'idée, pas le dessin), à évaluer et dont **une seule** sera retenue avant d'ouvrir la Phase D3 (wireframes de la seule direction choisie).

**Référence** : `CAHIER_CONTRAINTES_HEADER_DESKTOP_DAR_NUR.md` (Phase D1, committé) — toute variante est confrontée à ce cahier en fin de fiche.

---

## Variante A — Continuité

### 1. Principe
Le header garde sa philosophie actuelle : une rangée horizontale unique, logo à gauche, navigation à droite, burger en dessous du seuil desktop. On ne change pas la nature du composant, on redistribue mieux l'espace et la hiérarchie visuelle entre les éléments déjà en place. L'utilisateur ne perçoit presque aucune différence — le site garde ses repères immédiats.

**Positionnement en une phrase** : privilégie la continuité et minimise le risque d'implémentation, mais apporte peu de marge d'évolution.

### 2. Organisation de la navigation
Les 9 entrées restent dans une seule rangée, dans le même ordre qu'aujourd'hui. Les deux dropdowns (Bien-être, Mode & Accessoires) restent des déclencheurs discrets, visuellement équivalents aux liens simples — aucune mise en avant particulière des groupes par rapport aux liens directs. La perception reste celle d'une liste homogène de 9 éléments de même poids.

### 3. Évaluation
- **Lisibilité** : gain marginal seulement (meilleure répartition de l'espace), la hiérarchie visuelle reste inchangée par nature.
- **Scalabilité** : faible. Le principe reste celui d'une rangée à budget fixe, le même qui a produit le déficit mesuré en D1 (7→9 entrées) — une évolution future de contenu comparable redemanderait le même type d'ajustement.
- **Identité premium** : neutre. Ne change pas la perception actuelle du header, ni en bien ni en mal.
- **Coût d'implémentation** : **faible**. C'est la variante la plus proche du code existant ; pas de restructuration du HTML ni du pipeline, ajustements CSS ciblés.

### 4. Risques
Si la navigation continue de croître (nouvelle entrée, renommage plus long), le même ajustement devra probablement être reconduit — cette variante ne change pas la nature du compromis entre contenu et gabarit, elle le repousse à la prochaine évolution.

### 5. Compatibilité avec D1
Respecte trivialement toutes les contraintes non négociables (§2.1-2.3) — rien ne change structurellement. Point de vigilance : c'est la variante qui répond **le moins bien** à la contrainte d'évolutivité (§2.4), par construction.

---

## Variante B — Hiérarchie

### 1. Principe
La navigation n'est pas une liste plate de 9 éléments égaux : c'est un petit nombre de familles de contenu (catégories produits, liens de repère, zone éditoriale) qui méritent d'être perçues comme telles. Le header assume et donne à voir cette structure plutôt que de l'aplatir.

### 2. Organisation de la navigation
Séparation visuelle plus marquée entre la zone « catalogue » (Bien-être, Parfums, Mode & Accessoires, Tahara & Hygiène, Accessoires) et la zone éditoriale (Notre histoire, FAQ, Avis), Boutique restant le point d'entrée unique en tête. Les deux dropdowns sont traités comme le cœur de la navigation plutôt que comme un élément parmi d'autres — leur poids visuel peut être plus affirmé que celui des liens simples.

**Objectif premier** : la compréhension — comment l'utilisateur perçoit et retrouve la structure de l'offre. Un éventuel gain d'image de marque serait un effet secondaire de cette clarté, pas l'objectif recherché.

### 3. Évaluation
- **Lisibilité** : meilleure. La hiérarchie explicite aide à repérer rapidement « où chercher », réduit la compétition visuelle entre 9 éléments de même poids.
- **Scalabilité** : bonne. Une nouvelle catégorie s'ajoute naturellement dans la zone catalogue, un nouveau contenu éditorial dans l'autre zone — la séparation en familles absorbe mieux la croissance qu'une liste plate.
- **Identité premium** : positive, mais modérée. Une navigation plus claire renforce la perception de sérieux et d'organisation, sans être à elle seule un geste de marque fort.
- **Coût d'implémentation** : **moyen**. Nécessite de revoir la structure visuelle du groupe de liens (pas seulement des réglages d'espacement), mais reste le même type de composant — une rangée, pas un changement de paradigme.

### 4. Risques
Introduit une notion de sous-groupes visuels qui n'existe pas aujourd'hui dans le design system — à calibrer avec soin pour ne pas complexifier le composant (le cahier D1 exclut toute complexification qui romprait avec la sobriété déjà pratiquée par la marque). Mal dosée, la séparation peut créer une nouvelle confusion plutôt que la résoudre.

### 5. Compatibilité avec D1
Respecte les contraintes fonctionnelles (9 entrées, 2 dropdowns, liens identiques) et visuelles — la hiérarchisation peut s'appuyer sur les tokens déjà existants (espacement, opacité, taille) sans nouvelle couleur ni police. Répond bien à la contrainte d'évolutivité (§2.4).

---

## Variante C — Signature

### 1. Principe
Le header cesse d'être une barre technique qui subit la croissance de la navigation : il devient une pièce d'identité à part entière, pensée avec sa propre respiration, au même niveau d'exigence que la fiche produit ou la homepage. Dar Nūr affirme son header autant que le reste du site affirme déjà sa marque.

### 2. Organisation de la navigation
Le principe n'est plus de faire tenir 9 entrées dans l'espace résiduel laissé par le logo, mais de concevoir logo et navigation comme deux zones ayant chacune leur espace dédié, dans un header pouvant être plus haut et plus aéré. Les groupes peuvent porter plus de présence visuelle. Aucune disposition précise n'est arrêtée à ce stade (c'est l'objet de la Phase D3 si cette variante est retenue) — l'idée fondatrice est de partir d'une toile plus large plutôt que de contraindre la nav à un gabarit hérité de 7 entrées.

**Objectif premier** : l'identité de marque — faire du header un signal fort et cohérent avec le reste du site (fiche produit, homepage). Un éventuel gain de lisibilité serait un effet secondaire de l'espace supplémentaire, pas l'objectif recherché.

### 3. Évaluation
- **Lisibilité** : potentiellement la meilleure des trois — plus d'espace veut dire plus de respiration entre les entrées.
- **Scalabilité** : la meilleure des trois par construction — un header pensé large dès le départ n'est plus contraint par un gabarit hérité, il absorbe plus naturellement une croissance future de contenu.
- **Identité premium** : la plus forte — la seule variante qui traite explicitement le header comme un signal de marque, cohérent avec le positionnement déjà assumé ailleurs sur le site (fiche produit, homepage).
- **Coût d'implémentation** : **élevé**. Impact visuel plus large, potentiellement sur la hauteur du header des deux familles de pages ; à coordonner avec le sticky, avec l'overlay/clic-extérieur de la SPA homepage, et avec le pipeline de génération (templates parfums/catégories partagés) — la variante qui demande le plus de vérification de non-régression.

### 4. Risques
Le risque principal est l'ampleur même du changement : un header plus haut consomme de l'espace vertical utile, notable en particulier sur les pages catégories dont le contenu démarre juste sous le header. Doit être répliqué à l'identique sur les 2 familles de pages sans introduire de nouvelles divergences (la homepage a déjà un header distinct — un risque réel de désynchronisation existe). Risque de disproportion si le header devient trop présent par rapport au reste du site.

### 5. Compatibilité avec D1
Respecte les contraintes fonctionnelles et les exclusions (pas de nouveau logo, pas de nouvelle police/palette — le « plus riche » se fait avec les tokens existants). La Variante C est la seule dont les principes de conception pourraient conduire à réévaluer les hypothèses de dimensionnement du header (dont la largeur de référence). Cette éventuelle réévaluation resterait conforme au cahier D1 et ne serait étudiée qu'après validation de cette stratégie. Tant que le changement reste un habillage visuel des mêmes fragments générés, le pipeline reste inchangé.

---

## Critère de sortie de D2

À l'issue de cette phase, **une seule stratégie est retenue**. La Phase D3 (wireframes) ne sert qu'à matérialiser la direction choisie — elle n'explore pas plusieurs pistes en parallèle. Aucun wireframe, CSS ou HTML n'est produit tant qu'un choix explicite n'a pas été validé.
