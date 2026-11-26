# Fiches premium Dar Nūr (fiches/premium/) : ajouter un parfum

Gabarit généralisé, publié avec Santal Gourmand le 26 novembre 2026. Il coexiste avec le gabarit de Cœur Blanc (`fiches/_data/`, `scripts/lib/fiche-editoriale.mjs`, `/fiche-editoriale.css`), laissé intact. Tous les chemins ci-dessous sont relatifs à `fiches/premium/` ; socle CSS : `/fiche-premium.css` ; module : `scripts/lib/fiche-premium.mjs` ; liste du moteur SPA : `FICHES_PREMIUM` dans `js/nav.js` ; banc : `scripts/test-fiche-premium.mjs`.

```
Supabase            nom, accroche, prix, disponibilité, description, pyramide, conseils, précautions
_data/<slug>.json   textes éditoriaux, images, film, ordre des sections           (contenu)
_art/<slug>.css     palette, polices, compositions, rythme, apparitions, impression (direction artistique)
assets/<slug>/*.css, *.js  facultatifs (data.styles, data.scripts) : ce qui ne sert qu'à l'ordinateur ou à l'impression
_sections/*.html    structure de chaque section, commune à toutes les fiches
_sources/<slug>.json  provenance de chaque visuel : film ou photographie d'origine, seconde, cadre, empreinte
_editorial.html     coquille : référencement, navigation, barre de commande, pied de page, script
../../fiche-premium.css   socle commun (composants, accessibilité)   ../../js/fiche-editoriale.js  commande, galerie, film
../../fiche-impression.css   impression
```

## Étapes

1. Images dans `assets/<slug>/` (WebP 1080 de large, 540 pour la première vue). Nature de chaque image (`kind`) : `photo`, `scene`, `ambiance`, `film` ou `dessin`, affichée sous l'image, ou regroupée dans les crédits.
2. `_data/<slug>.json` : partir d'une fiche existante. Un champ oublié est nommé à la génération, et la fiche standard reste en ligne.
3. `_art/<slug>.css` : redéfinir les rôles dans `:root`, puis composer chaque section.
4. Ajouter le slug à `FICHES_PREMIUM` (`js/nav.js`).
5. `node scripts/generate-product-pages.mjs`
6. `node scripts/test-fiche-premium.mjs <slug>` sous Chromium et WebKit.

Retirer une fiche : supprimer les deux fichiers et le slug, régénérer.

## Ce que chaque parfum choisit

- **Ordre et choix des sections** : `sections`. Défaut : ouverture, reperes, parfum, galerie, film, notes, essentiel, maison, conclusion, meme-maison. `film` et `maison` sont facultatifs.
- **Chapitres libres** : `planche:<clé>` affiche `planches.<clé>` (images, titre, texte), où l'on veut, autant qu'on veut.
- **Structure différente** : `galerie.mosaique` lit `_sections/galerie.mosaique.html` à la place de `galerie.html` ; `ouverture.edition` ajoute la mention « Édition limitée ».
- **Première vue** : une image (`hero.image`) ou plusieurs (`hero.images`, chacune avec `srcset`).
- **Notes** : avec image, ou en toutes lettres (sans `src`, classe `fe-note-mot`). La grille suit le nombre de notes : `fe-step-1`, `fe-step-2`, `fe-step-3`.
- **Crédits regroupés** : `credits.lines` et la section `credits` remplacent les légendes sous les images. Chaque nature utilisée doit y être citée, sinon la génération le signale et garde la fiche standard. L'agrandissement continue d'indiquer la nature de chaque vue.
- **Parfums associés** : `related` remplace, dans cette fiche seulement, le visuel d'un parfum associé (`related.<slug>`). Noms et prix restent ceux de Supabase.
- **Livraison en trio** : `details.delivery: "trio"` met les trois possibilités côte à côte et les précisions dessous. Les phrases viennent toujours d'index.html.
- **Autres détails** : `details.lastingNote` facultatif, `details.sentenceCase` (famille olfactive en casse de phrase).
- **Polices** : `fonts` (préchargées), déclarées dans `_art`.
- **Film** : vertical ou large, selon les dimensions de son affiche (`film.poster`), avec `aspect-ratio` dans `_art`.
- **Ordinateur** : les sections sous l'ouverture peuvent vivre dans une feuille de `data.styles` limitée à `(min-width:861px)` ; `_art` ne garde alors que le téléphone (voir Santal Gourmand).
- **Autres** : `themeColor`, `family` (si absente de Supabase), `details.specs` (lignes libres : concentration, nez), `pyramid.disclaim`, `shopUrl` facultatif, `seo.image`.
- **Contrôles propres au parfum** : `_test.flacons` (place du flacon dans chaque image d'ouverture), `_test.achatPremierEcran` (écrans où prix et bouton doivent être entiers sans défiler), `_test.enteteOpaque`, `_test.enteteCompact` (hauteurs admises de la barre compacte), `_test.texteHorsImage`, `_test.absent`.
- **Textes à valider** : `texts.description` et `texts.tagline` remplacent Supabase tant que le texte remplacé n'a pas changé (empreinte `replaces`).

## Rôles de couleur (`:root` ou une section)

`--page --ink --muted --lead --gold-dark --hair --hair-soft --btn --btn-txt --btn-hover --btn-line --rule --stock --stock-dot --wait --bar --bar-stock --frame --frame-on --serif --sans`

Une section claire dans une page sombre redéfinit ces rôles sur elle-même (voir les strates de Santal Gourmand).

## Règles

- `<h1>` sans balise à l'intérieur ; aucun dégradé finissant par une couleur transparente (PDF d'iOS).
- Classes attendues par le script : `.fe-hero`, `.fe-final`, `[data-add]`, `[data-wa]`, `[data-price]`, `[data-stock]`, `.fe-player`, `[data-shot]`, `#mbar`.
- Jamais de prix, de stock ni de note recopiés dans le JSON.
- Limite : prix unique, sans variantes.

## Poids de la page

La page compressée doit rester sous 14,3 Ko : au-delà de 14,6 Ko, en-têtes compris, elle ne tient plus dans la première fenêtre réseau et le premier affichage recule de 0,2 s sur téléphone (mesuré). `gzip -c <slug>/index.html | wc -c`.
