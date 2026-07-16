# Audit de Pré-Implémentation — Refonte du Système de Navigation Dar Nūr
## Dossier de validation technique (cartographie, régressions, migration, rollback, tests)

**Date** : 2026-07-13
**Prérequis** : `AUDIT_MENU_NAVIGATION_DAR_NUR.md` (bugs et a11y) et `ARCHITECTURE_NAVIGATION_DAR_NUR.md` (cible « option C » : partial canonique + `nav.css`/`nav.js` partagés + estampillage `AUTO:NAV`).
**Méthode** : balayage scripté des 21 fichiers porteurs de nav (extraction du bloc nav complet par fichier), lectures ciblées, mesures production déjà réalisées le 2026-07-13. Aucun fichier du site modifié.

**Correction d'une affirmation de l'audit précédent** (établie par le balayage exhaustif de ce jour) : les 3 pages parfums générées **ont** un dropdown « Parfums » complet (Tous les parfums / Khair by Ameerate / LeCode Paris), injecté par `generate-parfums.mjs` via le marqueur `{{PARFUMS_NAV_BLOCK}}` des templates. L'entrée « Parfums » manque donc dans la nav des **15 pages catégories** (pas « 18 pages sur 19 »). Le reste des constats antérieurs est confirmé par le balayage.

---

# 1. Résumé exécutif

Le périmètre nav est désormais cartographié à 100 % côté code : **21 fichiers porteurs** (1 SPA + 15 pages catégories + 3 pages parfums générées + 2 templates), **zéro asset partagé** (aucun `.css` dans le repo, `js/` = Supabase uniquement), **6 sources de données concurrentes** pour la liste des catégories, et **un seul système externe couplé** (le générateur parfums + workflow GitHub Actions, qui écrit déjà le dropdown Parfums dans la nav des pages qu'il génère). Les pages hors périmètre sont identifiées (légales : mini-header « Retour » volontairement distinct ; `admin.html` : pas de nav ; 5 prototypes `v_*.html`/`index_9817.html` à la racine : porteurs de nav mais **non commités**, donc non servis — risque d'hygiène à purger). Les dépendances critiques de la refonte sont au nombre de trois : le couplage SPA (`goCat`/`showHome`/`closeMenu`/hash produits au chargement), le générateur parfums (double écriture dans `parfums/*`), et la géométrie du header (offsets codés en dur). Le point le plus dangereux est `index.html` (nav + SPA + overlay + hash entremêlés dans un fichier de 3301 lignes). Le plan de migration proposé tient en **12 commits** indépendants et réversibles, avec canari et `index.html` en dernier. **Recommandation : GO**, confiance ~85 %, sous réserve des deux décisions produit (regroupement des catégories, breakpoint) et des points non testables listés (Safari iOS réel, lecteur d'écran).

---

# 2. Cartographie complète du système actuel

## 2.1 Inventaire des fichiers (exhaustif, vérifié)

### Porteurs du composant nav (21)

| Fichier | Rôle | Utilisé en prod | Particularités vérifiées |
|---|---|---|---|
| `index.html` | SPA homepage — nav de référence la plus riche | ✅ | overlay `menu-open`, clic extérieur, X animé, entrée Parfums, `top:69px` (faux, header 85px), **pas** d'`overflow-y:auto`, reset bouton complet, 5 liens sans `href`, deux blocs `@media 768px`, JS nav complet inline (`toggleMenu`/`closeMenu`/listener document) |
| `abayas/`, `accessoires/`, `bakhour/`, `bijoux/`, `brumes/`, `chaussures/`, `chechias/`, `gelules/`, `huiles/`, `miels/`, `miels-gourmands/`, `miels-terroir/`, `parfums/` (hub généré), `poudres/`, `qamis/`, `tahara/` — `index.html` ×15 + hub | pages catégories statiques SEO | ✅ | tous : `top:81px`, `overflow-y:auto`, **pas** d'overlay, **pas** de clic extérieur, **pas** d'X, reset bouton incomplet (burger gris), pas d'entrée Parfums (sauf les 3 pages générées), JS = toggle nu ; brand en vrai `<a>`, liens à vrais `href` |
| `parfums/lecode/index.html`, `parfums/khair/index.html` | pages marques **générées** | ✅ | comme ci-dessus + dropdown Parfums auto-généré avec `.active` ; leur handler `Escape` (vérifié) concerne le **modal produit**, pas le menu |
| `parfums/_hub_template.html`, `parfums/_brand_template.html` | gabarits du générateur | ⚙️ build | 3ᵉ variante CSS nav (`border-radius:4px` vs 2px, items `.7rem`, padding `9px 20px`) ; marqueur `{{PARFUMS_NAV_BLOCK}}` |

### Systèmes couplés

| Fichier | Rôle nav | Vérifié |
|---|---|---|
| `scripts/generate-parfums.mjs` | construit le dropdown Parfums (`buildParfumsNavBlock`, lignes 269/333) et **écrit** `parfums/*/index.html` | ✅ |
| `.github/workflows/regenerate-parfums.yml` | ré-exécute le générateur (dispatch manuel/webhook) → **peut écraser** toute modification de nav faite dans `parfums/*` hors templates | ✅ existe |
| `sitemap.xml` | précédent des marqueurs (`AUTO:PARFUMS:START/END`, lignes 66/85) | ✅ |

### Hors périmètre nav (vérifié, à ne pas toucher)

| Fichier | Constat |
|---|---|
| `cgv.html`, `confidentialite.html`, `mentions-legales.html` | header minimal « ← Retour à Dar Nūr », **aucun** composant nav — pattern distinct volontaire. Décision à acter en Phase 1 : les rallier ou non à la nav commune (recommandation : non, garder le mini-header, c'est un pattern légitime de page légale) |
| `admin.html` | pas de header nav (l'occurrence « burger » est hors composant) ; derrière auth |
| `js/config.js`, `js/supabase-client.js` | zéro lien avec la nav |
| `index_9817.html`, `v_0cb72ee.html`, `v_48b12a4.html`, `v_97bae2b.html`, `v_a0f58f1.html` (racine) | **contiennent une nav** mais sont *untracked* (git status) → non servis par GitHub Pages. ⚠️ Hygiène : à archiver/supprimer avant la refonte pour ne pas être embarqués par un `git add .` et devenir 5 copies de plus |
| `.claude/worktrees/**` | copies de sessions passées, non servies — **à exclure explicitement** de tout script de rollout |
| `design_handoff_*/`, `mockups/` | prototypes, non servis depuis la racine du domaine en tant que nav du site |

## 2.2 Fonctionnement actuel (flux)

```
ÉDITION MANUELLE (21 endroits)              GÉNÉRATEUR (3 pages)
   │                                            │
   ▼                                            ▼
index.html ──── CSS nav inline ×2 blocs    _hub/_brand_template.html
15 catégories ─ CSS nav inline (variante)      │ {{PARFUMS_NAV_BLOCK}} ← Supabase (brands)
   │            JS nav inline (2 variantes)    ▼
   │                                        parfums/{index,lecode,khair}/index.html
   ▼                                            ▲ réécrits à chaque dispatch du workflow
UTILISATEUR : 3 comportements différents selon la page
```

## 2.3 Fonctionnement cible (rappel, détail dans ARCHITECTURE_NAVIGATION_DAR_NUR.md)

```
data/nav.config ─┐
partials/nav.html ─┤→ scripts/build-nav.mjs → bloc AUTO:NAV estampillé dans 19 pages
                   │       (ordre : APRÈS generate-parfums.mjs pour parfums/*)
css/nav.css ───────┴→ référencés par toutes les pages (1 exemplaire en cache)
js/nav.js ─────────┘
```

---

# 3. Inventaire détaillé

## 3.1 HTML (structures, divergences, dette)

Structure commune aux 21 porteurs : `<header><nav> [brand] <div.nav-portal><div.nav-links#navLinks> …liens + 2 dropdowns… </div></div> <button.burger#burger> </nav></header>`.

Divergences vérifiées :
- **Brand** : `<div onclick="showHome()">` (SPA, non focusable) vs `<a href="https://dar-nur.fr">` (toutes les autres).
- **Liens de premier niveau** : SPA = 5 `<a>` sans `href` (`onclick` + `setTimeout(60)`) ; autres pages = vrais `href` absolus `https://dar-nur.fr/#boutique|#histoire|#faq|#avis-clients` (noter : la SPA n'a pas « Qui sommes-nous ? » en `href` ailleurs — cette entrée n'existe **que** sur la homepage ; les autres pages ont 4 entrées éditoriales, la homepage 5).
- **Dropdowns** : partout des `<div.nav-dropdown-title>` non sémantiques (ni button, ni ARIA) ; « Bien-être » : 6 entrées sur la SPA (avec Parfums), 5 ailleurs ; « Parfums » : dropdown complet uniquement sur les 3 pages générées.
- **Burger** : `onclick="toggleMenu()"` inline (SPA) vs `addEventListener` (toutes les autres, y compris templates — vérifié sur les 5 occurrences `getElementById('burger')` de `parfums/`).
- **IDs** : `navLinks`/`burger` identiques partout (bonne nouvelle pour un `nav.js` commun) ; `well-being`/`mode` (SPA uniquement) : jamais référencés — morts.
- ARIA : uniquement `aria-label="Menu"` sur le burger, partout ; rien d'autre (aucun `aria-expanded` nav sur les 21 fichiers — l'occurrence d'`index.html` est l'accordéon FAQ, celles des pages parfums le modal).

## 3.2 CSS (règles, doublons, incohérences)

Trois variantes du même bloc (~60 lignes), toutes inline dans `<style>` :

| Propriété | SPA | Catégories | Templates parfums |
|---|---|---|---|
| Panneau mobile `top` | 69px (**faux** — header 85px) | 81px (= header 81px, correct) | 81px |
| `overflow-y` panneau | absent (**bug : menu coupé**) | `auto` | `auto` |
| Overlay `body.menu-open::after` | présent (z-95) | absent | absent |
| Reset `button` | `border:none;background:none` ✅ | incomplet (**burger gris**) | incomplet |
| Dropdown : rayon / taille item / padding | 2px / .72rem / 12px 20px | 2px / .72rem / 12px 20px | **4px / .7rem / 9px 20px** |
| Blocs `@media 768px` du menu | **2 blocs séparés** + `!important` fossiles (`display/visibility/opacity`) | 1 bloc | 1 bloc |
| `.nav-portal` (Option A) | présent | présent | présent |
| Burger : barres | 24px or, padding 8px | 22px crème, padding 4px | 22px crème, padding 4px |

Transversal : 4 durées de transition différentes (.2/.25/.3/.35s), `transition:all` sur les items de dropdown, accolade orpheline (`index.html`, 469 `{` / 470 `}`), z-index nav ad hoc mais sans conflit constaté (90/95/96/100/101 vs modals 1000), `scroll-margin-top:80px` sur 3 ancres seulement (header réel 85px ; `#histoire`/`#boutique` sans rien). Code mort : `position:relative` des liens sans `::after` associé.

## 3.3 JavaScript (fonctions, événements, code mort)

| Fonction / listener | Fichier(s) | Appelée par | Effets secondaires | État |
|---|---|---|---|---|
| `toggleMenu()` | SPA | burger `onclick` | 3 classes (`open`/`x`/`menu-open`) | ✅ utilisée |
| `closeMenu()` | SPA | `showHome()`, `goCat()`, listener clic extérieur | idem en retrait | ✅ utilisée — **couplage clé** : la SPA ferme le menu lors des navigations internes |
| listener `document.click` (clic extérieur) | SPA seule | — | ferme si clic hors `#navLinks`/`#burger` | ✅ |
| `goCat(f)` | SPA | nav, hero, footer, cartes | `showHome()` + `setFilter` + `scrollIntoView(#boutique)` + `closeMenu()` | ✅ — dépend de l'élément `#boutique` |
| `showHome()` | SPA | brand, liens éditoriaux, `goCat` | reset vues + `closeMenu()` + `scrollTo(0,0)` | ✅ |
| toggle nu du burger | 18 pages + 2 templates | listener click | une seule classe `open` (pas d'X, pas d'overlay) | ✅ mais incomplet |
| `const _origShowProduct/_origShowHome` | SPA (l. 3116) | personne | aucun | ❌ **mort** |
| Routage hash produits | SPA (l. ~3261, dans le `finally` du chargement Supabase) | chargement initial uniquement | `showProduct(id)` si le hash = id produit | ✅ — **pas de listener `hashchange`** : le routage ne rejoue pas après chargement |
| `Escape` → `closeProductModal()` | 3 pages parfums | keydown document | modal produit uniquement (pas le menu) | ✅ hors nav |
| `resize` → `syncBar` | SPA | — | barre mobile produit (hors nav) | ✅ hors nav |

Pas de double-binding ni de fuite détectés (bindings uniques au chargement, pages statiques). Fragilités : `setTimeout(...,60)` avant `scrollIntoView` (5 occurrences nav + 5 footer), navigation SPA sans `pushState` (Back quitte le site depuis les vues internes).

## 3.4 Données (sources de la navigation)

**Six sources concurrentes vérifiées** :
1. HTML des dropdowns — ×21 fichiers (8 entrées catégories sur la SPA, 7 ailleurs).
2. `FILTERS` (SPA, l. ~1300) — 15 entrées (14 catégories + `all`), pilote les pilules boutique.
3. `COLLECTIONS` (SPA, l. ~1313) — cartes « Nos collections » homepage, avec `_CAT_SLUG_OVERRIDES` (`vetements→abayas`).
4. Table Supabase `categories` — source du catalogue réel (14 id actifs), jamais lue par la nav.
5. Footer homepage — 5 liens catégories seulement (Miels, Huiles, Parfums & Muscs, Bakhour & Encens, Qamis & Abayas) + 5 liens `onclick` sans `href` — encore une autre sélection.
6. `buildParfumsNavBlock()` du générateur — marques depuis Supabase `brand_slug`.

**Source unique de vérité recommandée** : `data/nav.config` (fichier statique versionné) pour la structure du menu, contrôlé en cohérence avec Supabase `categories` par le script de build (warning si divergence) — la nav ne doit dépendre ni d'un fetch runtime ni de la disponibilité de la base au build. `FILTERS`/`COLLECTIONS`/footer pourront converger vers cette config dans un second temps (hors périmètre de la refonte nav, à ne pas embarquer — scope discipline).

---

# 4. Matrice des différences (synthèse vérifiée)

| Élément | Homepage (SPA) | 15 catégories | 3 parfums générées | 2 templates |
|---|---|---|---|---|
| HTML brand | div onclick | `<a href>` | `<a href>` | `<a href>` |
| Liens 1er niveau | 5 sans href | 4 vrais href | 4 vrais href | 4 vrais href |
| Entrée Parfums | ✅ (dans Bien-être) | ❌ | ✅ dropdown dédié + `.active` | marqueur `{{PARFUMS_NAV_BLOCK}}` |
| Burger visuel | ✅ or, X animé | ❌ **rectangle gris**, pas d'X | ❌ idem | ❌ idem |
| Overlay | ✅ z-95 | ❌ | ❌ | ❌ |
| Clic extérieur | ✅ | ❌ | ❌ | ❌ |
| Escape menu | ❌ | ❌ | ❌ (Escape = modal) | ❌ |
| Scroll-lock fond | ❌ | ❌ | ❌ | ❌ |
| Panneau top / header réel | 69px / **85px** ⚠️ | 81px / 81px ✅ | 81px / 81px ✅ | 81px |
| Défilement panneau | ❌ (**menu coupé**) | ✅ auto | ✅ auto | ✅ |
| Sticky header | ✅ (mesuré) | ✅ (mesuré sur miels) | non re-mesuré (même pattern — hypothèse forte) | — |
| Breakpoint burger | 768px | 768px | 768px | 768px |
| Zone cassée 769–1000px | ✅ mesurée | probable (mêmes 7 items + gaps — hypothèse, non mesurée par page) | probable | — |
| ARIA | `aria-label` burger seul | idem | idem | idem |
| Focus clavier | ❌ rien d'atteignable | partiel (href réels, dropdowns inaccessibles) | partiel | — |
| Fermeture après clic lien | ✅ (`closeMenu`) | s.o. (navigation pleine page) | s.o. | — |

---

# 5. Cartographie des dépendances (qui dépend du menu)

- **SPA** : `goCat`/`showHome` appellent `closeMenu()` → le futur `nav.js` doit exposer une fermeture appelable (ou écouter les clics de liens) sans que la SPA casse. `goCat` dépend de `#boutique` ; les liens éditoriaux dépendent de `#histoire`, `#qui-sommes-nous`, `#faq`, `#avis-clients` (tous vérifiés existants).
- **Hash routing** : uniquement au chargement (`finally` Supabase) et uniquement pour les **ids produits** ; les ancres de section sont du scroll natif. Pas de `hashchange` → passer les liens nav en `/#...` sur la homepage exige soit une interception de clic, soit un handler `hashchange` (décision Phase 4 — risque R1).
- **Ancres/scroll** : `scroll-margin-top` incomplet + `html{scroll-behavior:smooth}` global.
- **Sticky header** : dépend de l'absence d'ancêtre `overflow` (Option A `.nav-portal` déployée partout — vérifié sur les 21 fichiers).
- **Overlay** : `body.menu-open::after` (SPA seule), z-index sous le header — le futur overlay commun doit préserver cet empilement (mbar 90 < overlay < portal 96 < header 100 < dropdown 101 < modals 1000).
- **Footer** : indépendant du composant nav (liens propres) mais partage `showHome`/`goCat` sur la SPA — hors périmètre, ne pas toucher.
- **Recherche / analytics / lazy-loading / historique** : vérifié — pas de recherche, pas d'analytics (aucun gtag/plausible), pas de lazy-loading lié à la nav, pas de `pushState` (le Back actuel n'a rien à préserver de plus que l'existant).
- **Générateur parfums + workflow** : écrit la nav des 3 pages générées ; **toute modification de nav dans `parfums/*` hors templates sera écrasée au prochain dispatch** — dépendance d'ordre critique du rollout.
- **GitHub Pages** : déploiement direct de `main` — chaque commit est mis en prod ; le plan de migration doit donc être « chaque commit est publiable seul ».

---

# 6. Analyse des risques de régression

| # | Régression potentielle | Cause | Probabilité | Impact | Détectabilité |
|---|---|---|---|---|---|
| G1 | Vues SPA cassées (Boutique/histoire/FAQ/Avis ne réagissent plus, ou double scroll) | passage `onclick`→`href /#...` interceptés | **Élevée** si `index.html` traité comme les autres | Élevé | Facile (test manuel des 5 entrées + footer) |
| G2 | Nav des pages parfums écrasée ou dupliquée | ordre `build-nav` vs `generate-parfums`, ou marqueurs posés dans les pages générées au lieu des templates | Moyenne | Élevé | Moyenne (n'apparaît qu'au prochain dispatch du workflow — peut être des semaines après) |
| G3 | Fiche produit par hash cassée (`/#dn-...` depuis pages catégories) | toucher au bloc `finally` du chargement ou au format des ancres | Faible (ne pas y toucher) | Élevé | Moyenne (tester 1 lien « Voir la fiche » par catégorie) |
| G4 | Ancres de section sous le header ou scroll cassé | refonte du `scroll-margin-top`/`--header-h` | Moyenne | Moyen | Facile |
| G5 | Régression visuelle subtile (burger, espacements, dropdown) sur une des 19 pages | consolidation des 3 variantes CSS en une | Moyenne | Moyen | **Difficile** (19 pages × 3 largeurs — d'où le diff systématique du plan de tests) |
| G6 | Menu mobile qui ne s'ouvre plus sur une page | id renommé / double init / script non chargé | Faible | **Critique** | Facile |
| G7 | SEO : perte de maillage ou contenu dupliqué mal formé | bloc AUTO mal injecté (HTML invalide, liens absolus/relatifs mélangés) | Faible | Élevé | Moyenne (validation HTML + crawl local) |
| G8 | CLS/flash du header | CSS nav externalisé chargé tard | Faible (petit `<link>` dans le head) | Faible | Facile (mesure au canari) |
| G9 | Overlay/empilement cassé (menu sous le header, modals sous l'overlay) | refonte des z-index | Faible (échelle documentée §5) | Moyen | Facile |
| G10 | Pages oubliées ou en trop (worktrees, prototypes racine) | glob récursif naïf dans le script | Moyenne | Moyen | Moyenne |
| G11 | Comportement Safari iOS (100vh/barre d'URL) | non testable dans cet environnement | Inconnue | Moyen | **Difficile sans appareil réel** — reste le principal angle mort |

---

# 7. Plan de migration par commits (12 commits, chacun publiable seul)

> GitHub Pages déploie `main` en continu : chaque commit ci-dessous laisse la production dans un état correct. Ordre pensé pour que les correctifs urgents sortent d'abord et que `index.html` (le plus risqué) arrive en dernier.

**C1 — chore : purge des prototypes racine** (`index_9817.html`, `v_*.html` → suppression ou déplacement hors racine). Risque nul (untracked aujourd'hui : commit de .gitignore ou simple suppression disque). Validation : `git status` propre.
**C2 — fix : reset bouton burger sur les 16 fichiers catégories/templates** (Phase 0 de la stratégie ; 15 pages + 2 templates partagent la même ligne fautive). Validation : burger or sur `/miels/` mobile en prod, aucune autre diff.
**C3 — fix : menu mobile homepage** (`top` aligné sur le header réel + `overflow-y:auto` + scroll-lock simple). Fichier : `index.html` seul. Validation : « Avis » atteignable à 390×844 et 360×640 ; sticky et overlay inchangés.
**C4 — fix : entrée Parfums dans les dropdowns des 15 pages catégories + 2 templates**. Validation : lien présent et correct sur chaque page ; regénération parfums idempotente.
**C5 — feat : `data/nav.config` + `partials/nav.html` + `css/nav.css` + `js/nav.js`** (fichiers nouveaux, **référencés par personne**). Risque prod : nul. Validation : revue + page de démo locale hors repo servi.
**C6 — feat : `scripts/build-nav.mjs`** (liste explicite de pages, échec bruyant si marqueur absent, exclusion `worktrees`/`design_handoff`/`mockups`, idempotent). Toujours aucun effet en prod. Validation : dry-run sur copies temporaires.
**C7 — feat : canari** — marqueurs + `<link>`/`<script>` sur **une** page catégorie (précédent : `abayas/`), build exécuté, ancien CSS/JS nav inline retiré de cette page. Validation : batterie complète (§9) sur le canari ; diff HTML relu intégralement.
**C8 — feat : rollout des 14 autres pages catégories** (même mécanique, en un ou deux commits selon confort de relecture). Validation : script de comparaison (le balayage de cet audit est réutilisable) = zéro divergence entre les 15.
**C9 — feat : templates parfums** — marqueurs dans `_hub_template.html`/`_brand_template.html`, intégration de `{{PARFUMS_NAV_BLOCK}}` dans le partial ou la config, **ordre workflow : generate-parfums puis build-nav** (ou build-nav appelé par le générateur). Validation : régénération réelle → 3 pages conformes, idempotence croisée (parfums→nav→parfums = zéro diff).
**C10 — feat : `index.html`** — marqueurs + bascule des liens `onclick` en vrais `href` + branchement SPA (interception ou `hashchange`) + suppression des deux blocs CSS nav et du JS nav inline (dont `_origShowProduct` mort et l'accolade orpheline). Le plus gros commit ; à relire fichier entier (règle projet : une édition peut tronquer une fin de fichier silencieusement). Validation : les 10 liens `onclick` (5 nav + 5 footer restants), `goCat`, hash produit, overlay, X, clic extérieur, Escape, scroll-lock.
**C11 — feat : accessibilité finale** (si non incluse dans C5) : focus-visible, ordre de tab, `aria-current` par page, skip-link. Validation : parcours clavier complet sur 3 gabarits.
**C12 — chore : breakpoint 1024px + `scroll-margin-top` global + docs** (`docs/ARCHITECTURE_DAR_NUR.md` : section nav de référence, procédure « ne jamais éditer le bloc AUTO:NAV »). Validation : 360/390/768/820/1024/1280/1920 + paysage.

Dépendances : C5→C6→C7→C8/C9→C10. C1–C4 indépendants (à faire d'abord). C11/C12 après le rollout.

---

# 8. Plan de rollback

Principe : chaque commit étant autonome, le rollback est `git revert` (jamais `reset --hard` sur `main` publié), du **plus récent au plus ancien** si plusieurs sont en cause.

| Régression constatée | Quoi restaurer | Ordre / commande | Vérifications post-rollback |
|---|---|---|---|
| Sur une page catégorie après C7/C8 | le(s) commit(s) de rollout de cette page | `git revert <sha>` (le HTML inline redevient la source ; `nav.css`/`nav.js` restent en place sans consommateur — inoffensifs) | page en 200, menu mobile s'ouvre, diff HTML vs état antérieur nul |
| Sur les pages parfums après C9 | revert du commit templates **puis** re-dispatch du workflow (les pages générées ne se corrigent pas par revert seul si le générateur a retourné depuis) | `git revert` + `workflow_dispatch regenerate-parfums` | 3 pages régénérées conformes, sitemap intact |
| Sur la SPA après C10 | revert du commit C10 uniquement | `git revert <sha-C10>` | les 4 vues SPA, hash produit, filtres, overlay |
| Build-nav produit un HTML corrompu | aucun revert de code nécessaire si détecté avant commit (`git diff` avant chaque commit de build est obligatoire) ; sinon revert du commit d'estampillage | — | validation HTML + crawl local |
| Régression diffuse non localisée | revert séquentiel C12→C10→C9→C8→C7 jusqu'à disparition | binaire possible (`git bisect` sur les commits de rollout) | batterie §9 à chaque étape |

Cas particulier GitHub Pages : le déploiement suit `main` avec un délai de quelques minutes — après tout revert, vérifier la prod réelle (pas seulement le repo) avant de conclure. Garder l'habitude projet existante : jamais d'édition manuelle dans `parfums/*` générés (écrasée au prochain dispatch).

---

# 9. Checklist de validation (à dérouler au canari, puis par lot de rollout, puis en final)

**Fonctionnel menu** (par gabarit : SPA / catégorie / parfums) : ouverture, fermeture, double-clic rapide, X animé, overlay présent et cliquable, clic extérieur, clic sur lien (fermeture + navigation), Escape, scroll-lock du fond, réouverture après fermeture, resize desktop↔mobile menu ouvert (pas d'état résiduel), rotation portrait↔paysage.
**SPA** (`index.html` uniquement) : Boutique→filtre all, Notre histoire/Qui sommes-nous/FAQ/Avis→scroll correct sous le header, brand→home, `goCat` depuis footer et cartes, hash produit `/#dn-...` depuis une page catégorie, refresh sur chaque vue, Back.
**Responsive** : 360, 390, 768, 820 (iPad portrait — zone anciennement cassée), 1024, 1280, 1920, paysage mobile ; aucun scroll horizontal (`scrollWidth == clientWidth`), aucun lien nav sur 2 lignes, dernier item du menu mobile atteignable partout.
**Accessibilité** : Tab atteint toutes les entrées (dropdowns inclus) dans l'ordre visuel, focus visible sur chaque état, `aria-expanded` reflète l'état réel (burger + dropdowns), lecteur d'écran (NVDA minimum) annonce « navigation », les listes et l'état courant ; cibles tactiles ≥44px ; contrastes déjà conformes à re-vérifier après consolidation CSS.
**Sticky/ancres** : header collé au scroll sur les 3 gabarits, ancres non masquées (`scroll-margin-top` = hauteur réelle), `#qui-sommes-nous`/`#faq`/`#avis-clients`/`#histoire`/`#boutique` testés depuis une page externe.
**SEO** : `curl` de chaque page → liens nav présents dans le HTML source (sans JS), HTML valide (parser), title/meta/JSON-LD/sitemap/robots inchangés (diff), aucun lien 404 (crawl des href de nav), pas de contenu `{{...}}` résiduel.
**Technique** : console vierge sur les 19 pages, `git diff` de chaque exécution du build relu, double exécution du build = zéro diff, exécution generate-parfums puis build-nav puis generate-parfums = zéro diff, Lighthouse avant/après sur homepage + 1 catégorie (perf, a11y, SEO — non exécuté dans cette session : à faire lors de l'implémentation), poids `nav.css`+`nav.js` < ~8 Ko total.
**Cross-browser** : Chromium (fait dans cette session pour l'état actuel), Firefox, Safari desktop, **Safari iOS réel** (angle mort actuel — obligatoire avant clôture), Android Chrome.

---

# 10. Conclusion — validation finale et Go / No Go

**Le périmètre est-il complètement cartographié ?** Oui côté repo : 21 porteurs identifiés par balayage scripté (pas par échantillonnage), systèmes couplés inclus (générateur, workflow, sitemap), pages hors périmètre listées avec justification, prototypes non servis repérés.

**Zones encore inconnues ?** Trois, toutes déclarées : (1) comportement Safari iOS réel (100vh, barre d'URL) — non testable ici ; (2) rendu lecteur d'écran réel — non testé ; (3) la zone 769–1000px n'a été **mesurée** que sur la homepage (les autres pages partagent les mêmes 7 items/gaps — hypothèse forte, à confirmer au canari). Aucune de ces zones ne bloque le démarrage : elles sont couvertes par la checklist §9.

**Risques sous-estimés ?** Le plus sournois est G2 (générateur parfums) parce qu'il est **différé** : une nav modifiée dans `parfums/*` peut sembler correcte pendant des semaines puis être écrasée au premier dispatch. Le plan le neutralise en ne touchant que les templates (C9) et en testant l'idempotence croisée. Deuxième risque discret : G5 (régression visuelle diffuse lors de la fusion des 3 variantes CSS) — mitigé par le diff systématique et le canari.

**Point le plus dangereux ?** Le commit C10 (`index.html`) : nav, SPA, overlay et hash s'entremêlent dans un fichier de 3301 lignes, avec le précédent documenté d'éditions ayant tronqué des fins de fichier. D'où : dernier de la série, relecture intégrale du fichier, batterie SPA dédiée.

**Meilleur ordre d'exécution ?** C1→C4 (hygiène + correctifs prod urgents, valeur immédiate, risque minime) → C5/C6 (fondations sans effet prod) → C7 (canari) → C8 (catégories) → C9 (parfums, avec le workflow) → C10 (SPA) → C11/C12 (a11y, responsive, docs).

**Niveau de confiance : 85 %.** Décomposé : ~95 % sur les pages catégories et parfums (patterns simples, canari, précédents éprouvés) ; ~75 % sur `index.html` (couplage SPA — ramené à ce niveau uniquement grâce au traitement en dernier et à la checklist dédiée) ; les 15 points manquants sont pour l'essentiel les angles morts environnementaux (Safari iOS, lecteur d'écran) et le caractère différé de G2.

## Recommandation : **GO**, conditionné à trois préalables
1. Trancher les deux décisions produit de la Phase 1 (regroupement des 14 catégories dans le menu ; breakpoint burger 1024px) — sans elles, C5 ne peut pas être écrit.
2. Purger/écarter les 5 prototypes nav de la racine (C1) avant tout `git add`.
3. Accepter que la clôture définitive (C12) exige un test sur iPhone réel — sinon, dégrader la confiance annoncée et le noter dans la doc.

Aucun élément découvert dans cette cartographie n'invalide l'architecture cible ; deux éléments la **renforcent** : les ids `navLinks`/`burger` sont déjà uniformes sur les 21 fichiers (un `nav.js` unique se branche sans renommage), et le générateur parfums fournit à la fois le précédent technique et le seul vrai point d'intégration à orchestrer.
