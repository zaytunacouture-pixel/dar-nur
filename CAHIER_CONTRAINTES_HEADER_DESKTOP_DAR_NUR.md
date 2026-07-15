# Cahier des contraintes — Refonte du header desktop adapté à la nouvelle navigation

**Statut** : Phase D1 — document de conception, lecture seule. Aucune ligne de CSS/HTML n'a été modifiée pour produire ce document. Ne contient aucune solution ni variante de layout — c'est l'objet de la Phase D2, ultérieure et distincte, à ouvrir seulement après validation de ce cahier.

**Chantier parent clos** : « Breakpoint navigation 768px→1024px » — voir `docs/ARCHITECTURE_DAR_NUR.md`, journal du 2026-07-15, pour la chaîne de preuves complète ayant mené à sa clôture sans implémentation.

---

## 1. Contexte

Le header desktop actuel (`header`/`nav`/`.brand`/`.nav-links`, partagé — à l'identique ou en variante — par les 19 pages du site) a été conçu et dimensionné à une époque où la navigation de premier niveau comportait **7 entrées** (`Boutique, Bien-être, Mode, Notre histoire, Qui sommes-nous ?, FAQ, Avis`).

La refonte de navigation (Phases 3.1 à 3.7, `SPEC_FONCTIONNELLE_NAVIGATION_DAR_NUR.md`) a fait passer l'arborescence à **9 entrées** (`Boutique, Bien-être, Parfums, Mode & Accessoires, Tahara & Hygiène, Accessoires, Notre histoire, FAQ, Avis`), avec plusieurs intitulés sensiblement plus longs.

**Ce qui a été démontré empiriquement** (et n'est donc plus une hypothèse) :
- Ce n'est **pas** un problème de débordement horizontal (`navLinks.scrollWidth − clientWidth = 0` sur toute la plage 1024–1920px).
- Ce n'est **pas** un problème du breakpoint mobile/desktop (déplacer le seuil ne change rien au repli, qui existe à 1920px comme à 1024px).
- Ce n'est **pas** un problème du `gap` seul, ni résoluble par une combinaison d'ajustements CSS mineurs et individuellement invisibles (5 combinaisons testées, toutes insuffisantes — déficit résiduel de 33 à 68px).
- **C'est une inadéquation entre le contenu et le layout** : l'ancien menu (7 entrées, rejoué dans le conteneur actuel) tient sur une ligne avec une marge confortable (+253px à ≥1240px). Le nouveau menu (9 entrées) dépasse ce même budget d'environ 91px, et ce dès la largeur desktop la plus favorable (≥1240px) — l'écart s'aggrave en dessous.
- Le contenu a gagné +344px net par rapport à l'ancien menu (nouveaux intitulés/entrées, partiellement compensés par la suppression de « Qui sommes-nous ? »).

**Conclusion retenue pour ce chantier** : le header doit être repensé pour accueillir durablement 9 entrées (et plus, voir §2.4), pas ajusté au pixel près pour faire rentrer de force le contenu actuel dans un gabarit conçu pour 7.

---

## 2. Contraintes non négociables

### 2.1 Architecture (pipeline)
- Le pipeline `nav.config.json` → `partials/nav.html` → `build-nav.mjs` → `partials/nav-common.generated.html` → `generate-parfums.mjs` → pages parfums reste **inchangé**. Aucun générateur ne change de responsabilité, aucune écriture croisée n'est introduite.
- `scripts/generate-parfums.mjs` reste seul propriétaire de `parfums/_brand_template.html`, `parfums/_hub_template.html`, `parfums/*/index.html` et du bloc `AUTO:PARFUMS` de `sitemap.xml`.
- `data/nav.config.json` reste l'unique source de vérité de la structure de navigation (entrées, groupes, libellés, ordre). Aucune duplication.
- La homepage (`index.html`) conserve sa logique SPA propre (`goCat`, `showHome`, interception des liens éditoriaux, routage hash produit) **inchangée** — seul l'habillage visuel du header desktop est en jeu, jamais son comportement applicatif.

### 2.2 Fonctionnel
- Les **9 entrées de premier niveau sont conservées telles quelles** (aucune suppression, aucune fusion) — l'arborescence est une décision produit déjà validée (`SPEC_FONCTIONNELLE_NAVIGATION_DAR_NUR.md` §3/§4), non rouverte par ce chantier.
- Les **2 dropdowns** (Bien-être : 8 sous-entrées, Mode & Accessoires : 5 sous-entrées) et leurs comportements (survol + focus desktop, liste dépliée continue en mobile) sont conservés.
- Tous les **liens** (URLs, ordre) restent identiques.
- Le **comportement du burger mobile** (toggle, seuil actuel, animation) n'est pas affecté par ce chantier — il porte exclusivement sur le rendu **desktop**.
- Le **SEO** reste inchangé : HTML de nav 100 % statique, liens `<a href>` réels, aucune régression sur `sitemap.xml`/`robots.txt`/JSON-LD.
- L'**ARIA** existant (ou en cours de mise en conformité — voir dette burger parfums soldée) n'est pas dégradé : `aria-label`, `aria-expanded`, `aria-controls`, `aria-haspopup`, `aria-current` restent au moins au niveau actuel.

### 2.3 Visuel
- L'identité **Dar Nūr** (palette Émeraude & Or, tokens `:root` existants) n'est pas remise en cause.
- Typographie **Cinzel** (nav) conservée — aucun changement de police pour économiser de la largeur.
- **Logo** (bilingue FR/AR, proportions actuelles) conservé — pas de suppression ni de refonte du logo pour gagner de l'espace.
- Niveau de finition **premium** attendu : aucun effet « menu tassé » (espacements resserrés au point d'être perçus, alignement approximatif, hiérarchie visuelle diluée).

### 2.4 Évolutivité (contrainte d'architecture, ajoutée à ce cahier)
Le futur header ne doit pas être dimensionné **au pixel près** pour les 9 entrées actuelles. Il doit être conçu pour **absorber, sans nouvelle refonte complète**, au moins une des évolutions suivantes :
- l'ajout d'une nouvelle entrée courte à moyenne (type "Accessoires"),
- l'allongement modéré d'un intitulé existant (renommage éditorial),
- une légère croissance du nombre de sous-entrées dans un dropdown existant (ce qui n'affecte pas directement la largeur de premier niveau, mais confirme que les dropdowns eux-mêmes doivent rester extensibles).

Chaque variante D2 devra expliciter sa marge d'évolution (croissance de largeur absorbable, ajout d'un ou deux libellés, renommage plus long, etc.) et justifier pourquoi elle ne nécessitera pas une nouvelle refonte au premier changement de navigation. Aucun seuil chiffré n'est imposé ici, avant le choix du layout — la marge sera évaluée relativement à chaque variante proposée, pas contre une cible arbitraire fixée d'avance.

---

## 3. Inventaire des layouts existants (documentation, aucune proposition)

| Porteur | Fichier(s) | CSS nav | Hauteur header | Particularités |
|---|---|---|---|---|
| **Homepage (SPA)** | `index.html` | Inline, propre (non `nav.css`) | 85px (token `--header-h` documenté mais non implémenté en code — valeur codée en dur) | Sélecteurs `.nav-links a` (pas `> li >`), couleurs burger différentes (or vs crème), rayon dropdown 4px, animation croix `.burger.x`, overlay + clic extérieur (absents ailleurs), logique SPA propre |
| **14 pages catégories statiques** (`abayas, miels, huiles, poudres, gelules, brumes, qamis, tahara, bijoux, chaussures, chechias, accessoires, miels-gourmands, miels-terroir`) + `bakhour` | `*/index.html` | `/nav.css` partagé, byte-identique entre elles (vérifié caractère pour caractère lors du chantier N1-N3) | 81px | Aucun JS de rendu, HTML 100% statique, mini-header spécifique (pas de SPA) |
| **3 pages parfums** (générées) | `parfums/index.html`, `parfums/khair/index.html`, `parfums/lecode/index.html`, issues de `parfums/_hub_template.html` / `parfums/_brand_template.html` | `/nav.css` partagé (identique aux catégories, vérifié par mesure directe : mêmes hauteurs de header 91.2/110.6px aux mêmes largeurs) | 81px | Structure « Parfums » spécifique : groupe déroulant (hub + marques), généré par `buildParfumsNavBlock()`, jamais un simple lien direct comme sur les 15 autres pages non-homepage |
| **Pages légales** (CGV, confidentialité, mentions légales) | `cgv.html`, `confidentialite.html`, `mentions-legales.html` | Aucun — mini-header « ← Retour » | — | Hors périmètre (décision déjà actée, `SPEC_FONCTIONNELLE_NAVIGATION_DAR_NUR.md` §17 Q2), non concernées par ce chantier |
| **Admin** | `admin.html` | Aucun | — | Hors périmètre |

**Constat clé pour la Phase D2** : il existe en réalité **2 layouts distincts** à traiter (homepage d'un côté, 18 pages non-homepage de l'autre — ces 18 partagent aujourd'hui un rendu strictement identique), pas 19 cas séparés. Une variante de layout devra donc être pensée pour ces 2 familles, avec une attention particulière à la homepage qui porte des comportements (overlay, clic extérieur, croix burger) qu'aucune autre page n'a.

---

## 4. Budget disponible (conclusions, sans le détail des tableaux de mesure)

| Grandeur | Valeur mesurée |
|---|---|
| Largeur max du conteneur `nav` | 1240px (padding 14px 28px) |
| Largeur `.brand` (logo + texte bilingue) | ~177px à ≥1240px de viewport |
| **Budget réellement disponible pour `.nav-links`** à ≥1240px | **~1007px** |
| Largeur naturelle de l'**ancien** menu (7 entrées, gap 34px) | **754px** — marge de +253px sur le budget ci-dessus |
| Largeur naturelle du **nouveau** menu (9 entrées, gap 34px) | **1098px** — déficit de **~91px** sur ce même budget |
| Gain net de contenu introduit par la refonte | **+344px** (dont +276px de libellés nets, +68px de 2 intervalles de `gap` supplémentaires) |

Le budget disponible se réduit encore en dessous de 1240px (mesuré jusqu'à 863px à 1024px) — toute variante de layout devra donc raisonner sur une **plage** de largeurs desktop, pas sur une seule.

---

## 5. Ce qui est exclu de ce chantier

- Réduire le nombre d'entrées de premier niveau ou les regrouper différemment.
- Revenir sur `SPEC_FONCTIONNELLE_NAVIGATION_DAR_NUR.md` (arborescence, décision Parfums = lien/groupe, breakpoint 1024px déjà spécifié pour la bascule mobile).
- Changer le logo (image, proportions, présence du bilinguisme FR/AR).
- Changer la police Cinzel ou la palette Émeraude & Or.
- Supprimer ou fusionner les dropdowns existants.
- Modifier le fonctionnement de la SPA homepage (`goCat`, `showHome`, routage hash, interception liens éditoriaux).
- Modifier le pipeline `build-nav.mjs`/`generate-parfums.mjs` ou la gouvernance des zones (Phase 3.6, figée).
- Raccourcir les intitulés existants pour gagner de la place (déjà écarté explicitement : reviendrait sur une décision produit validée).
- Toute implémentation CSS/HTML — ce chantier reste 100 % conception jusqu'à validation d'une direction.

---

## 6. Critères de réussite (pour évaluer les variantes en Phase D2)

Une variante de layout n'est recevable que si elle satisfait **tous** les critères suivants :

- [ ] Les 9 entrées de premier niveau tiennent sur une seule ligne, sans repli. **Objectif minimal** : garantir un rendu desktop conforme à partir de la largeur retenue pour le mode desktop (1240px dans l'état actuel des décisions). Cette borne pourra être revalidée lors de la Phase D2 si les variantes de layout le justifient.
- [ ] Aucun `wrap` de texte sur aucun libellé (vérifiable par comptage de lignes réel, pas seulement l'absence de scroll horizontal — leçon tirée de ce chantier).
- [ ] Aucune perte fonctionnelle : dropdowns, hover/focus, liens, ARIA, SEO strictement équivalents ou améliorés.
- [ ] Comportement mobile (burger, panneau, overlay) non affecté — ce chantier ne touche que le rendu desktop.
- [ ] Aucune régression sur les 19 pages servies (homepage + 18 pages partageant `nav.css`).
- [ ] Pipeline `nav.config.json`/`build-nav.mjs`/`generate-parfums.mjs` inchangé dans son fonctionnement.
- [ ] **Marge d'évolution explicitée** (§2.4) : la variante décrit sa capacité d'absorption (largeur, libellé supplémentaire, renommage plus long) et justifie pourquoi elle ne nécessitera pas une nouvelle refonte au premier changement de navigation.
- [ ] Niveau de finition premium préservé (évaluation qualitative, à valider visuellement avec l'utilisateur — pas un critère automatisable).

---

## Phase D2 (à ouvrir seulement après validation de ce cahier)

Produire **2 à 3 variantes maximum**, chacune documentée selon :
1. Principe de layout,
2. Avantages,
3. Inconvénients,
4. Coût d'implémentation,
5. Impact sur les 19 pages.

Aucun CSS, aucun HTML — uniquement des concepts de layout, jusqu'à validation explicite d'une direction par l'utilisateur.
