# Phase D4a — Pré-audit du prototype (avant toute ligne de HTML/CSS)

**Statut** : document de conception, lecture seule. Aucun fichier HTML/CSS créé à ce stade — objet de D4b une fois ce pré-audit validé.

**Référence** : `D3C5_SELECTION_WIREFRAME_HEADER_DAR_NUR.md` (Wireframe 3 retenu), `D3B1/D3B2/D3B3` (décisions architecturales), `CAHIER_CONTRAINTES_HEADER_DESKTOP_DAR_NUR.md` (D1).

**Question unique de D4** : la composition retenue (Wireframe 3) fonctionne-t-elle réellement une fois matérialisée ?

---

## 1. Inventaire des éléments réellement nécessaires

Pour juger honnêtement « la lecture, les proportions, le rythme, la hiérarchie, l'impression générale » (et pas une approximation), le prototype doit utiliser du contenu réel, pas des placeholders génériques :

- **Le vrai logo** (`logo-dar-nur.png`, déjà dans `assets/`) et le vrai texte bilingue (« DAR NŪR » / « دار النور ») — un logo de substitution fausserait le jugement de la rangée identité.
- **Les 9 vrais libellés de navigation**, dans leur ordre réel (`Boutique, Bien-être, Parfums, Mode & Accessoires, Tahara & Hygiène, Accessoires, Notre histoire, FAQ, Avis`) — en particulier les deux libellés les plus longs (« Tahara & Hygiène », « Mode & Accessoires ») sont précisément ceux qui ont motivé tout ce chantier ; les tester avec un texte factice plus court n'aurait aucune valeur de preuve.
- **Les 2 dropdowns représentés visuellement**, au moins à l'état fermé, avec un aperçu figé de l'état ouvert (pour juger la composition du panneau déroulant, pas son mécanisme).
- **Un fragment de contenu de page en dessous du header** (un bloc de substitution suffisant pour donner un sens à la hauteur relative et à un test de scroll) — nécessaire pour juger le risque déjà identifié en D2/D3a (impact vertical sur les pages catégories dont le contenu démarre juste sous le header).
- **Les tokens visuels réels** (palette Émeraude & Or, Cinzel) — juger « l'impression générale » avec une palette de substitution n'aurait aucun sens, mais les valeurs exactes (nuances, tailles) restent volontairement approximatives (voir §4).

## 2. Ce qui est volontairement simulé

- **Logo** : le vrai fichier image, simplement copié/référencé dans le dossier du prototype — jamais chargé depuis le site réel.
- **Dropdown** : deux états statiques (fermé / ouvert) figés dans le HTML, sans JavaScript de bascule réel — suffisant pour juger la composition du panneau, pas son comportement.
- **Sticky** : un `position:sticky` simplifié pour donner une impression du comportement au scroll, sans reproduire la mécanique de compensation de hauteur (`--header-h`, ancres) utilisée sur le vrai site.
- **Contenu sous le header** : un bloc de substitution (pas le vrai contenu d'une page), juste assez consistant pour juger la hauteur relative et tester un scroll.

## 3. Ce qui est explicitement exclu de D4

- Logique SPA homepage (`goCat`, `showHome`, routage hash, interception liens éditoriaux) — aucune simulation, sans objet pour juger une composition statique.
- Burger mobile et responsive final — D4 ne teste que le rendu **desktop**, seul objet de ce chantier depuis son ouverture.
- JavaScript de toggle réel des dropdowns (voir §2 — états figés uniquement).
- Le pipeline (`nav.config.json`, `build-nav.mjs`, `generate-parfums.mjs`) — non exécuté, non modifié, non consulté par le prototype. Le HTML du prototype est écrit à la main, une seule fois, pour cette démonstration.
- Accessibilité dynamique complète (piégeage de focus, régions `aria-live`, etc.) — hors de portée d'un prototype de composition ; les attributs statiques de base (`aria-label`, structure sémantique) peuvent être présents par bonne pratique, sans être l'objet du test.
- La coordination entre les 2 familles de pages (homepage vs 18 pages `nav.css`) — D4 matérialise **une seule** version de référence (la Famille B, pages catégories — la plus représentative, la plus nombreuse). La déclinaison pour la homepage sera un sujet de D5, pas de ce prototype.
- Toute valeur CSS définitive (couleurs exactes, espacements, tailles de police, animations) — voir critère de jugement en §5.

## 4. Contraintes d'isolement

- Le prototype ne modifie **aucun fichier existant** du site (`nav.css`, `index.html`, aucun template, aucun script de génération).
- Il ne touche ni `build-nav.mjs` ni `generate-parfums.mjs`.
- Il vit dans un dossier dédié, sur le modèle déjà établi par le projet pour ce type d'exercice : **`design_handoff_header_desktop/`** — même convention que `design_handoff_accueil/` et `design_handoff_collections/` (prototype HTML autonome à haute fidélité + `README.md` décrivant sections/tokens/état, pattern déjà documenté dans `docs/ARCHITECTURE_DAR_NUR.md`). Aucune ambiguïté possible avec du code de production.

**Le prototype n'a pas vocation à produire du code réutilisable.** Aucun extrait HTML/CSS de D4 ne sera copié dans le projet réel. D5 repartira du code existant (`nav.css`, templates, pipeline) et l'adaptera à la composition retenue — jamais l'inverse. Cette règle évite le piège du prototype qui devient une implémentation « par glissement » : la méthode suivie depuis D1 est *Conception → Validation → Implémentation*, jamais *Prototype → « on le garde finalement »*.

## 5. Critère de jugement — composition uniquement

Le prototype est jugé **uniquement** sur : la lecture, les proportions, le rythme, la hiérarchie, l'impression générale. Ne sont **pas** évalués à ce stade : les couleurs définitives, les espacements définitifs, les tailles définitives, les animations — ces valeurs relèveront de D5 si D4 conclut positivement.

## 6. Critère de réussite de D4 (binaire, pas de demi-mesure)

À l'issue de D4, une seule réponse est possible :
- **« Oui, cette composition mérite d'être implémentée »** → ouverture de D5 (adaptation au code réel du site).
- **« Non »** → retour en D3 (le wireframe retenu perd, une fois matérialisé, ce qui faisait sa force sur le papier — mieux vaut revenir sur la composition que forcer le prototype à fonctionner).

Aucune tentative de « sauver » un prototype décevant en modifiant les valeurs CSS ne doit se substituer à cette décision binaire — ce serait mélanger le jugement de composition (D4) avec un chantier d'ajustement (D5).

---

## Prochaine étape

Une fois ce pré-audit validé, D4b produit le prototype HTML/CSS statique lui-même dans `design_handoff_header_desktop/`.
