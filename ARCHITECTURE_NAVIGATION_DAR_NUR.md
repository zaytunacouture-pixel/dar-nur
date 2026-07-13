# Architecture du système de navigation — Dar Nūr
## Audit d'architecture et stratégie de refactorisation (aucun code, aucune modification)

**Date** : 2026-07-13
**Prérequis** : `AUDIT_MENU_NAVIGATION_DAR_NUR.md` (audit fonctionnel/UX/a11y du 2026-07-13, tous constats vérifiés en production).
**Base** : uniquement le code réel du repo (`C:\Users\youcef\dar-nur`) et les mesures déjà faites en production. Les faits sont marqués comme tels ; les hypothèses sont explicitement signalées.

---

# 1. Résumé exécutif

Le site n'a pas un menu dupliqué en 15 exemplaires : il a **trois implémentations distinctes** du même menu, copiées puis divergées — la SPA (`index.html`), le gabarit « Sceau & Ligne » des 14 pages catégories, et les gabarits générés des pages parfums (`_hub_template.html`/`_brand_template.html`). Chaque copie embarque son propre HTML, son propre CSS (avec des valeurs différentes : offsets 69/81px, rayons 2/4px, resets incomplets) et son propre JS (complet sur la SPA, réduit à un toggle ailleurs). Aucun fichier partagé n'existe pour la nav (`js/` ne contient que la config Supabase). La cause racine est un mode de production par **copier-coller de gabarit sans source canonique**, alors que le repo possède déjà le remède : un pipeline de génération par marqueurs (`AUTO:PARFUMS` dans `sitemap.xml`, `generate-parfums.mjs` zéro dépendance). La stratégie recommandée : **un partial HTML canonique + un `nav.css` + un `nav.js` partagés, estampillés dans chaque page par un script de build à marqueurs `AUTO:NAV`**, avec la liste des catégories dans un unique fichier de configuration. C'est la seule option qui supprime la duplication **sans** sacrifier le HTML statique (SEO), sans framework et sans changer l'identité visuelle. Effort total estimé : 6 phases, chacune vérifiable indépendamment, avec page canari avant rollout (pattern déjà éprouvé sur `abayas/` en juillet).

---

# 2. Diagnostic de l'architecture actuelle

## 2.1 Comment le menu est construit aujourd'hui (faits)

Trois familles, toutes autonomes (HTML + CSS + JS inline dans chaque fichier, zéro asset partagé) :

| Famille | Fichiers | HTML nav | CSS nav | JS nav |
|---|---|---|---|---|
| **A. SPA homepage** | `index.html` | `<header><nav>` avec brand `<div onclick>`, 5 `<a>` sans `href` pilotés par `onclick` (`goCat`, `showHome`+`scrollIntoView`), 2 dropdowns, entrée Parfums, wrapper `.nav-portal` | lignes ~117–169 + **second** bloc `@media 768px` lignes ~760–798 ; panneau mobile `top:69px`, **pas** d'`overflow-y`, overlay `body.menu-open::after` | `toggleMenu()`/`closeMenu()` (3 classes), listener `document.click` (clic extérieur), fermeture après navigation via `closeMenu()` dans `goCat`/`showHome` |
| **B. Pages catégories** | `abayas/`, `miels/`, `huiles/`, `poudres/`, `gelules/`, `brumes/`, `qamis/`, `bakhour/`, `tahara/`, `bijoux/`, `chaussures/`, `chechias/`, `accessoires/`, `miels-gourmands/`, `miels-terroir/` (15 fichiers `index.html`) | brand en vrai `<a href>`, liens réels vers `https://dar-nur.fr/#...`, 2 dropdowns **sans entrée Parfums** | copie proche de A mais : `top:81px`, `overflow-y:auto`, **pas d'overlay**, reset `button,select{font-family:inherit;cursor:pointer}` **sans** `border:none;background:none` (→ burger gris) | un seul listener : toggle de `.open` sur `#navLinks`. Ni clic extérieur, ni animation X, ni classe `menu-open` |
| **C. Pages parfums générées** | `parfums/_hub_template.html`, `parfums/_brand_template.html` → `parfums/index.html`, `parfums/lecode/`, `parfums/khair/` | comme B + dropdown « Parfums » **auto-généré** par `scripts/generate-parfums.mjs` (hub + marques, entrée courante `.active`) | 3ᵉ variante : `border-radius:4px` (vs 2px), items `.7rem` (vs .72), padding `9px 20px` (vs 12px 20px), `top:81px` | même toggle minimal que B (vérifié dans les 2 templates et les 3 pages générées) |

**Fait** : `js/` ne contient que `config.js` et `supabase-client.js`. Il n'existe **aucun** fichier CSS du tout dans le repo (zéro `*.css`) et aucun JS de navigation partagé. Chaque page est un monde clos.

## 2.2 Où le code est dupliqué

- **HTML du menu** : ~40 lignes recopiées dans 19 fichiers servis (1 SPA + 15 catégories + 3 parfums générés) + 2 templates parfums = **21 occurrences** à maintenir.
- **CSS du menu** : ~60 lignes recopiées avec variantes dans les mêmes fichiers ; sur `index.html`, en plus, le CSS du menu mobile est lui-même **éclaté en deux blocs** `@media(max-width:768px)` distincts dans le même fichier.
- **JS du menu** : 3 variantes (complète / toggle nu / toggle nu).
- **Liste des catégories** : au moins **4 sources concurrentes** — le HTML des dropdowns (21 copies), le tableau `FILTERS`/fallback de la SPA, la table Supabase `categories`, et la section « Collections » de la homepage. Aucune n'alimente les autres pour la nav.

## 2.3 Responsabilités mélangées

- La **donnée** (quelles catégories, quels libellés, quels liens) est incrustée dans la **présentation** (HTML de chaque page) au lieu d'être une configuration.
- Le **comportement** (ouverture, fermeture, overlay) est réécrit par page au lieu d'être un module.
- La **géométrie du header** (85px SPA / 81px catégories / 101px en zone tablette) est codée en dur dans des offsets (`top:69px`, `top:81px`, `scroll-margin-top:80px`) au lieu d'être un token unique — c'est pour ça que le panneau mobile de la homepage est décalé de 16px.

## 2.4 Ce qui devrait être mutualisé

Le header complet (brand + liens + dropdowns + burger), l'overlay, le CSS du composant, le JS du composant, la liste des catégories, le token de hauteur de header. **Ne doit pas être mutualisé** : le breadcrumb (spécifique par page), le hero, la logique SPA (`goCat`/`showHome`) qui reste propre à `index.html`.

---

# 3. Causes racines

1. **Pas de mécanisme d'inclusion** : site statique sans build (choix assumé et sain à l'origine), donc le seul moyen de partager le header a été le copier-coller. La divergence n'est pas un accident, c'est la conséquence mécanique de ce mode : chaque session de travail a modifié la copie qu'elle avait sous les yeux.
   - *Le burger gris* : le reset `button{border:none;background:none}` a été écrit dans `index.html` ; le gabarit « Sceau & Ligne » (commit `4861ceb`) a réécrit son propre reset en omettant ces deux propriétés. Personne n'a « cassé » le burger — il n'a jamais été stylé dans cette copie.
   - *Les catégories qui disparaissent* : « Parfums » a été ajouté au dropdown de `index.html` (récemment) mais dans aucune des 20 autres copies ; `miels-gourmands`/`miels-terroir`/`tahara`/`bakhour`/`bijoux`/`chaussures`/`chechias`/`accessoires` n'ont jamais été ajoutés nulle part. Ajouter une entrée = 21 éditions ; le coût a dissuadé, donc le menu a gelé pendant que le catalogue grandissait.
   - *Les comportements JS divergents* : le JS complet (overlay, clic extérieur, X) vit dans le gros `<script>` SPA de `index.html`, inextricable du reste ; les gabarits ont réécrit un minimum viable (toggle) plutôt que d'extraire le module.
2. **Pas de token de géométrie** : la hauteur du header n'existe nulle part comme variable ; chaque offset a été mesuré à la main à un instant T puis a survécu aux évolutions du header (d'où 69 vs 85).
3. **Pas de checklist transversale** : les correctifs nav (Option A `.nav-portal`, entrée Parfums, reset bouton) ont été déployés sur *certaines* copies seulement — il n'existe aucun mécanisme qui force la parité.
4. **Précédent positif ignoré pour la nav** : le repo a déjà résolu exactement ce problème pour les pages parfums et le sitemap (génération par marqueurs, source Supabase) — la nav n'a simplement jamais été raccordée à ce pattern.

---

# 4. Architecture cible recommandée

## 4.1 Options envisagées et arbitrage

| Option | Principe | Verdict |
|---|---|---|
| **A. Injection runtime** (un `nav.js` qui construit le header au chargement) | 1 seul fichier, zéro build | ❌ Rejetée : le maillage interne sortirait du HTML statique (les pages catégories sont « SEO-first » par décision d'architecture documentée) ; flash de rendu du header sur chaque page ; nav morte si JS échoue |
| **B. Web Component** (`<dar-nav>`) | Standard, vanilla | ❌ Rejetée : mêmes défauts SEO/flash que A + complexité supérieure, contraire à l'esprit du code existant |
| **C. Estampillage build-time par marqueurs** (partial canonique injecté entre `<!-- AUTO:NAV:START/END -->` par un script Node zéro dépendance) + **CSS/JS du composant en vrais fichiers partagés** | Le HTML reste 100 % statique ; une modification = 1 fichier + 1 exécution de script | ✅ **Recommandée** — c'est l'extension directe du pattern déjà en production (`AUTO:PARFUMS` dans `sitemap.xml`, `generate-parfums.mjs`), donc cohérente avec les conventions du repo et déjà comprise de son mainteneur |
| **D. Statu quo + checklist manuelle de parité** | Zéro chantier | ❌ Rejetée : c'est le système actuel, et la dérive constatée prouve qu'il échoue |

## 4.2 Description de la cible (option C)

**Quatre artefacts, un seul propriétaire par responsabilité :**

1. **`partials/nav.html`** — le HTML canonique du header (un seul, plus de variantes). Version de référence : celle de la homepage, **corrigée** (vrais `href` partout, `<ul>/<li>`, déclencheurs de dropdown en `<button aria-expanded>`, burger avec `aria-expanded`/`aria-controls`, brand en `<a href="/">`, skip-link). Les liens SPA deviennent de vrais liens (`/#boutique`, `/#histoire`, `/#faq`, `/#avis-clients`) : fonctionnels tels quels depuis n'importe quelle page, et interceptés par le JS SPA uniquement sur la homepage (amélioration progressive au lieu d'`onclick` obligatoire).
2. **`data/nav.config` (JSON ou module JS)** — la liste unique des entrées : groupes, libellés, slugs, ordre. Les 14 catégories y figurent toutes (l'audit UX tranchera le regroupement — ex. « Bien-être / Parfums & Senteurs / Mode & Accessoires »). C'est le **seul endroit** à éditer pour ajouter/retirer/renommer une entrée. *Note d'arbitrage* : la table Supabase `categories` existe déjà, mais la nav ne doit pas dépendre d'un fetch runtime (SEO + robustesse) ni exiger la base pour un build ; le fichier de config est la source pour la nav, et peut être trivialement contrôlé en cohérence avec Supabase par le script de build (avertissement si divergence — même philosophie que le garde-fou du générateur parfums).
3. **`css/nav.css`** — tout le CSS du composant (desktop, mobile, dropdowns, overlay, burger, focus), consolidé en un bloc unique, avec un token `--header-h` unique référencé par le panneau (`top:var(--header-h)`), le `scroll-margin-top` global et le calcul de hauteur du panneau. Les corrections de l'audit y sont intégrées d'office (`overflow-y:auto`, reset bouton complet, transitions homogènes, styles `:focus-visible`, suppression des `!important` fossiles et du double bloc media-query).
4. **`js/nav.js`** — le module de comportement unique (defer) : toggle, overlay, clic extérieur, **Escape, verrouillage du scroll, synchronisation `aria-expanded`, ouverture des dropdowns au focus/clavier, restitution du focus à la fermeture**. Une seule initialisation par `id` — identique sur les 19 pages.

**Le script d'assemblage** : `scripts/build-nav.mjs` (Node, zéro dépendance, même style que `generate-parfums.mjs`) lit `nav.config` + `partials/nav.html`, génère le bloc final (avec `aria-current`/`.active` calculé par page cible), et le substitue entre les marqueurs `AUTO:NAV` de chaque page servie. Idempotent (deux exécutions → fichiers identiques, propriété déjà exigée du générateur parfums). Chaque page ajoute deux `<link>`/`<script>` vers `nav.css`/`nav.js` — un seul exemplaire en cache navigateur pour tout le site.

**Articulation avec le générateur parfums (point d'attention réel)** : les templates parfums reçoivent aussi les marqueurs `AUTO:NAV`. Deux générateurs écrivant dans les mêmes fichiers doivent être ordonnés : le plus simple est que `generate-parfums.mjs` appelle (ou inclue) l'estampillage nav après avoir produit ses pages, ou que le workflow exécute `build-nav` après `generate-parfums`. Le dropdown « Parfums » par marque peut être conservé comme enrichissement généré, ou simplifié en une entrée « Parfums » vers le hub — à trancher avant la Phase 1 (recommandation : entrée simple vers le hub dans la nav commune ; le hub liste déjà les marques).

## 4.3 Ce que la cible garantit

- Une modification de menu = **1 fichier édité** (`nav.config` ou le partial) + 1 commande.
- Parité de comportement mécaniquement garantie (même `nav.js` octet pour octet partout).
- HTML statique intact (SEO), identité visuelle intacte (mêmes tokens, le CSS consolidé reprend l'existant corrigé), aucun framework, aucun runtime supplémentaire.
- Dette actuelle purgée au passage (bugs P1–P3 de l'audit corrigés une fois, dans la source canonique).

---

# 5. Schéma logique du futur système

```
                    ┌────────────────────────────┐
                    │  data/nav.config           │  ← LA source (groupes, libellés, liens, ordre)
                    └──────────────┬─────────────┘
                                   │ lu par
                    ┌──────────────▼─────────────┐
 partials/nav.html →│  scripts/build-nav.mjs     │← garde-fous : idempotence,
 (structure/ARIA)   │  (Node, zéro dépendance)   │  cohérence Supabase (warning),
                    └──────────────┬─────────────┘  abandon si marqueurs absents
              écrit entre <!-- AUTO:NAV:START/END --> dans :
      ┌──────────────┬─────────────┴──────────────┬──────────────────┐
      ▼              ▼                            ▼                  ▼
 index.html    15 pages catégories      parfums/* (via/ après   futures pages
 (SPA)         (abayas … miels-terroir)  generate-parfums.mjs)  (marqueurs = contrat)
      │              │                            │                  │
      └──────┬───────┴────────────┬───────────────┴──────────────────┘
             ▼ référencent        ▼
        css/nav.css          js/nav.js
   (composant + --header-h)  (toggle, overlay, Escape,
                              clavier, scroll-lock, ARIA)
```

Runtime : `nav.js` s'initialise pareil partout ; sur `index.html` uniquement, le code SPA existant intercepte les liens `/#...` pour ses vues (amélioration progressive — sans JS, les liens restent de vraies ancres).

---

# 6. Plan de refactorisation par phases

Chaque phase est livrable, testable et réversible indépendamment. Ordre pensé pour que les corrections urgentes de l'audit ne soient **pas** otages du chantier complet.

### Phase 0 — Correctifs d'urgence hors refonte (optionnelle mais recommandée)
Les 3 bugs critiques de l'audit (menu homepage coupé, burger gris ×15, entrée Parfums manquante ×20) peuvent être corrigés **avant** la refonte par éditions ciblées — ils sont en production et coûtent des clients aujourd'hui. Risque faible, valeur immédiate ; la refonte les rendra ensuite non-régressables.

### Phase 1 — Architecture (décisions, zéro code de prod touché)
Trancher : regroupement des 14 catégories dans le menu (décision produit, pas technique) ; sort du dropdown Parfums par marque ; breakpoint burger (recommandation : 1024px) ; emplacement des marqueurs. Livrable : mini-plan validé (pattern `assets/plan-template.md` de la compétence dar-nur-architect).

### Phase 2 — HTML canonique
Écrire `partials/nav.html` à partir de la version homepage corrigée (sémantique `<ul>/<li>`, `<button>` de dropdown, ARIA complet, vrais `href`, skip-link). Revue à froid avant toute intégration.

### Phase 3 — CSS consolidé
Écrire `css/nav.css` : fusion des trois variantes en une (arbitrages visuels documentés : rayon 2px, paddings homepage), token `--header-h`, corrections d'audit intégrées, purge des fossiles. Aucune page ne le référence encore — testable sur une page de démonstration locale.

### Phase 4 — JavaScript unique
Écrire `js/nav.js` (comportements complets listés en §4.2). Contrainte : ne rien casser de la SPA — `nav.js` ne connaît ni `goCat` ni `showHome` ; c'est `index.html` qui écoute les clics sur les liens `/#...` (inversion de dépendance : le module commun ignore la SPA).

### Phase 5 — Build + canari + rollout
Écrire `scripts/build-nav.mjs`, poser les marqueurs sur **une** page canari (précédent éprouvé : `abayas/` avait servi de canari pour l'Option A), batterie complète dessus, puis rollout : 14 catégories → templates parfums (+ ordre d'exécution avec `generate-parfums.mjs` dans le workflow) → `index.html` en dernier (page la plus complexe : SPA + suppression des deux blocs CSS et du JS nav inline devenus morts).

### Phase 6 — Accessibilité et responsive (validation dédiée)
Parcours clavier complet sur 3 gabarits (SPA, catégorie, parfums), lecteur d'écran (au minimum NVDA), cibles tactiles ≥44px, breakpoint 1024px vérifié à 360/390/768/820/1024/1280/1920 + paysage, Safari iOS réel si disponible (le `100vh` est une hypothèse de risque non testée à ce jour).

### Phase 7 — Tests de non-régression et clôture
Checklist par page servie : rendu identique hors nav (diff visuel), liens tous en 200, JSON-LD/SEO intacts, aucune erreur console, idempotence du build (2 runs → zéro diff), `docs/ARCHITECTURE_DAR_NUR.md` mis à jour (le composant nav y devient une section de référence), suppression des blocs nav morts résiduels.

---

# 7. Matrice Impact / Effort

| Chantier | Impact | Effort | Ratio |
|---|---|---|---|
| Phase 0 — correctifs urgents (3 bugs prod) | **Très fort** (clients réels, image) | Faible | ★★★★★ à faire d'abord |
| Config catégories + menu complet (14/14) | Fort (ventes, SEO) | Faible (une fois la cible en place) | ★★★★★ |
| `nav.js` unique (comportements + a11y) | Fort (conformité EAA, UX) | Moyen | ★★★★ |
| `nav.css` consolidé + token `--header-h` | Fort (fin des offsets faux) | Moyen | ★★★★ |
| Build par marqueurs + rollout 19 pages | **Structurant** (fin de la duplication) | Moyen-élevé (surtout la vérification) | ★★★★ |
| Breakpoint 1024px | Moyen (tablette) | Faible | ★★★★ |
| Intégration générateur parfums | Moyen | Faible-moyen | ★★★ |
| Micro-transitions premium (dropdowns, hover) | Moyen (perception) | Faible | ★★★ |
| Purge dette (code mort, `!important`, accolade) | Faible seul, gratuit dans la consolidation | Nul (inclus Phase 3/4) | ★★★ |

---

# 8. Risques et précautions

| # | Risque | Phase | Impact | Précaution |
|---|---|---|---|---|
| R1 | Régression SPA (liens `onclick` → `href` interceptés) : double navigation ou vue cassée | 4–5 | Élevé | `index.html` traité en **dernier** ; tests dédiés des 4 entrées éditoriales + `goCat` ; fallback trivial (les `href` restent de vraies ancres) |
| R2 | Conflit entre `build-nav.mjs` et `generate-parfums.mjs` (écritures croisées dans `parfums/`) | 5 | Moyen | Ordre d'exécution explicite dans le workflow ; marqueurs `AUTO:NAV` distincts d'`AUTO:PARFUMS` ; test d'idempotence croisé (parfums puis nav puis parfums → zéro diff) |
| R3 | Écrasement d'une spécificité de page par l'estampillage (ex. `.active` local, offsets propres) | 5 | Moyen | Inventaire préalable des différences **volontaires** vs accidentelles (ce document en liste déjà l'essentiel) ; canari + diff HTML avant/après sur chaque page |
| R4 | CSS externe → bref flash du header au premier chargement (le CSS nav était inline) | 3 | Faible | `nav.css` minuscule et en `<link>` dans le `<head>` (render-blocking assumé pour ~2-3 Ko) — pas de FOUC réel ; mesurer au canari |
| R5 | Oubli d'une page servie (les worktrees `.claude/worktrees/` contiennent des copies — à exclure) | 5 | Moyen | Le script échoue bruyamment si une page listée n'a pas de marqueurs, et travaille sur une liste explicite de pages, pas un glob récursif |
| R6 | SEO : refonte des ancres/liens du menu sur tout le site simultanément | 5 | Faible | Les URL de destination ne changent pas (mêmes `/slug/`) ; seul le maillage s'enrichit — vérifier `sitemap.xml`/`robots.txt` inchangés |
| R7 | Le build devient un prérequis oublié (« j'édite la page, le build écrase ») | post-refonte | Moyen | Bandeau commentaire dans le bloc généré (« NE PAS ÉDITER — généré par build-nav ») , même convention que le bloc sitemap ; documenter dans `docs/ARCHITECTURE_DAR_NUR.md` |
| R8 | Safari iOS / appareils réels non testés (hypothèse `100vh`) | 6 | Moyen | Utiliser des unités viewport modernes avec repli documenté, et exiger un test sur iPhone réel avant clôture |

**Dépendances d'ordre** : Phase 1 → 2/3/4 (parallélisables entre elles) → 5 (canari avant rollout, `index.html` en dernier) → 6 → 7. La Phase 0 est indépendante de tout.

---

# 9. Validation (réponses aux questions posées)

- **La duplication sera-t-elle définitivement supprimée ?** Oui au sens opérationnel : le HTML reste physiquement présent dans chaque page (nécessaire pour le SEO statique), mais il n'est plus **éditable** qu'à un endroit — toute divergence est écrasée au build suivant. C'est la même garantie que le bloc sitemap actuel, qui n'a jamais divergé depuis sa mise en place.
- **Une nouvelle catégorie = un seul endroit ?** Oui : une entrée dans `nav.config` + une exécution du script. (La page catégorie elle-même reste à créer, comme aujourd'hui — hors périmètre nav.)
- **Desktop et mobile toujours synchronisés ?** Oui : même HTML, même CSS, même JS partout ; desktop et mobile sont deux états du même composant, plus deux implémentations.
- **Plus simple à maintenir dans 2 ans ?** Oui, à une condition de discipline : le build doit rester dans le chemin de publication (workflow ou habitude documentée). Le risque résiduel n° 1 est humain (R7), pas technique.
- **Existe-t-il une solution encore plus élégante ?** Plus élégante *sur le papier* : migrer vers un générateur de site statique (Eleventy…) qui donnerait includes, layouts et data files nativement. Rejetée ici car elle contredit deux contraintes réelles du projet : « pas de framework/build system » comme identité technique, et un coût de migration (19 pages, SEO, pipeline parfums) sans commune mesure avec le besoin. L'option C obtient 90 % du bénéfice avec un outil de 200 lignes dans le style exact de ce que le repo pratique déjà. Dans le périmètre vanilla-sans-build-runtime, je n'identifie pas de solution à la fois plus simple et plus sûre.

---

# Conclusion — recommandation finale

Adopter l'**option C** : partial canonique + config des catégories + `nav.css`/`nav.js` partagés + estampillage build-time par marqueurs `AUTO:NAV`, en étendant le pattern de génération déjà éprouvé dans ce repo. Exécuter d'abord la **Phase 0** (les trois bugs critiques en production ne doivent pas attendre la refonte), puis dérouler les phases 1→7 avec canari sur une page catégorie et `index.html` en dernier. Ne pas démarrer avant d'avoir tranché les deux décisions produit de la Phase 1 (regroupement des 14 catégories ; sort du dropdown Parfums par marque). Aucune de ces recommandations ne touche l'identité visuelle : la cible consolide les tokens « Émeraude & Or » existants, elle n'en crée pas.
