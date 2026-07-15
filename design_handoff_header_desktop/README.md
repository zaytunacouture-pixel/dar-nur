# Handoff : Header desktop — Prototype D4 (Wireframe 3)

## Overview
Prototype de composition pour la refonte du header desktop de **Dar Nūr**, matérialisant le **Wireframe 3** (« identité discrète, navigation affirmée ») retenu en `D3C5_SELECTION_WIREFRAME_HEADER_DAR_NUR.md`. Ambiance reprise telle quelle du site réel : **« Émeraude & Or »**.

## About the Design Files
Le fichier `index.html` est un **prototype de composition, pas du code de production**. Conformément à `D4A_PRE_AUDIT_PROTOTYPE_HEADER_DAR_NUR.md`, **aucun extrait de ce fichier ne sera copié tel quel dans le site réel** — D5 repartira du code existant (`nav.css`, templates, pipeline) et l'adaptera à la composition validée ici, pas l'inverse.

Ouvrir `index.html` directement dans un navigateur (aucune dépendance, aucun build requis — seule connexion externe : Google Fonts pour Cinzel/Cormorant Garamond/Lora, déjà utilisées par le site réel).

## Fidelity
**Fidélité de composition, pas d'implémentation.** Contenu réel (logo, 9 intitulés de navigation, tokens couleur/typo) pour permettre un jugement honnête de la lecture et des proportions. **Couleurs, espacements, tailles et animations restent volontairement approximatifs** — seuls la structure, la hiérarchie et le rythme sont à évaluer (voir D4a §5, critère de jugement).

## Screens / Views

### Écran unique : Header desktop, composition à deux rangées

1. **Rangée identité** (fine, isolée par contraste de fond + filet or)
   - Logo Dar Nūr (réduit, ~34px) + texte bilingue « DAR NŪR » / « دار النور », alignés à gauche.
   - Fond légèrement distinct de la rangée navigation (`--green-soft` vs `--green`), séparé par un filet `1px solid var(--line)`.
   - Volontairement compacte en hauteur — la hiérarchie « identité d'abord » (D3b-3) s'exprime par la position (première rangée) et l'isolement visuel, pas par la taille.

2. **Rangée navigation** (la plus généreuse en respiration des deux)
   - Les 9 entrées réelles de `data/nav.config.json`, centrées, espacement large entre chaque entrée.
   - Les 2 déclencheurs de dropdown (« Bien-être », « Mode & Accessoires ») portent un soulignement discret + un chevron — poids visuel légèrement plus affirmé que les liens simples, inspiration de la Famille 3 « hybride » conservée en réservoir (D3b-2), sans reproduire la Variante B dans son ensemble.

3. **Dropdowns — 2 états statiques, sans JavaScript** (voir D4a §2)
   - « Bien-être » : état fermé (par défaut).
   - « Mode & Accessoires » : état ouvert figé en dur dans le HTML (`.demo-open`), avec une étiquette « état "ouvert" figé (démo) » pour ne pas laisser croire à une interaction réelle.

4. **Contenu de substitution sous le header**
   - Bloc hero + grille de 4 cartes factices + zone de défilement, uniquement pour juger la hauteur relative du header et tester le comportement sticky simplifié au scroll.

## Interactions & Behavior
- Aucun JavaScript. Le header est `position:sticky` (simplifié, sans la mécanique de compensation `--header-h` du site réel).
- Les dropdowns n'ont pas de survol/focus fonctionnel — un seul est figé ouvert pour montrer l'aperçu du panneau.
- Tous les liens pointent vers `#` (aucune navigation réelle) — hors périmètre de ce prototype.

## State Management
Aucun. Prototype statique.

## Design Tokens (repris tels quels du site réel, non finaux — voir Fidelity)
- Palette : `--green:#0d1f16`, `--green-soft:#16301f`, `--gold:#c8a84b`, `--cream:#f4efe4`, `--line:rgba(200,168,75,.28)` (identiques à `index.html`/`nav.css` du site réel).
- Typographie : Cinzel (navigation, marque), Cormorant Garamond (sous-titre arabe), Lora (contenu de substitution).

## Assets
- `logo-dar-nur.png` — copie du logo officiel du site réel (`/logo-dar-nur.png`), non modifié.

## Files
- `index.html` — le prototype complet, HTML/CSS autonome (ouvrable directement dans un navigateur).
- `logo-dar-nur.png` — logo.

## Périmètre explicitement hors de ce prototype
Voir `D4A_PRE_AUDIT_PROTOTYPE_HEADER_DAR_NUR.md` §3 : logique SPA homepage, burger mobile/responsive, JavaScript réel des dropdowns, pipeline de génération, accessibilité dynamique complète, déclinaison homepage (reportée à D5).
