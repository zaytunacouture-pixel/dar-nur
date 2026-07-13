# Spécification Fonctionnelle Finale — Système de Navigation Dar Nūr
## Document de référence unique pour l'implémentation

**Date** : 2026-07-13
**Statut** : Référence officielle jusqu'à mise en production.
**Fondée sur** : `AUDIT_MENU_NAVIGATION_DAR_NUR.md` (constats UX/UI/technique), `ARCHITECTURE_NAVIGATION_DAR_NUR.md` (architecture cible « option C »), `AUDIT_PRE_IMPLEMENTATION_NAVIGATION.md` (cartographie exhaustive, 21 fichiers porteurs, plan en 12 commits).
**Portée** : ce document tranche les décisions fonctionnelles. Il ne contient aucun code. Un développeur doit pouvoir l'exécuter sans arbitrer de nouvelles décisions de comportement, de contenu ou de responsive ; seules des décisions d'implémentation pure (nommage interne de variables, etc.) restent à sa main.

---

# 1. Objectifs

**Rôle du menu** : point d'entrée unique vers l'intégralité du catalogue (14 catégories) et les pages éditoriales/support, identique en apparence et en comportement quel que soit le point d'entrée du site (homepage SPA, page catégorie statique, page marque parfums).

- **Objectif UX** : toute destination du site atteignable en 2 clics maximum depuis n'importe quelle page, sans ambiguïté sur ce qui est cliquable, avec un comportement mobile/desktop 100 % prévisible.
- **Objectif business** : aucune catégorie invisible dans le menu — le constat vérifié de l'audit (6 catégories + 2 pages miels dérivées absentes de toute nav) est un manque à gagner direct, à corriger sans exception.
- **Objectif SEO** : maillage interne complet et identique sur les 19 pages servies, HTML de nav 100 % statique (aucune dépendance JS pour l'existence des liens), cohérent avec la politique déjà en place (pages catégories « SEO-first »).
- **Objectif accessibilité** : conformité WCAG 2.2 AA sur l'intégralité du composant — c'est la lacune la plus grave identifiée (note 2,5/10 dans l'audit), traitée ici comme un objectif de premier rang, pas une amélioration optionnelle.
- **Objectif premium** : la matière visuelle existante (palette Émeraude & Or, Cinzel, bilinguisme FR/arabe) est déjà au niveau du benchmark (Aesop, Diptyque) et n'est **pas** remise en cause ; l'objectif est de faire disparaître tout ce qui trahit un site non fini (burger gris, menu tronqué, comportements divergents).

---

# 2. Architecture de navigation — rôle de chaque élément

| Élément | Rôle | Présence |
|---|---|---|
| **Header sticky** | Ancre visuelle et fonctionnelle permanente ; contient brand + nav + burger | Toutes les pages servies (hors pages légales, cf. §17) |
| **Navigation desktop** (`.nav-links` en ligne) | Accès direct à toutes les entrées de premier niveau + déclenchement des groupes par survol/focus | ≥ breakpoint desktop (§6) |
| **Burger** | Seul déclencheur du menu mobile ; bascule un état binaire ouvert/fermé | < breakpoint desktop |
| **Dropdown** (groupe de catégories) | Regroupe les catégories apparentées sous un intitulé de groupe, réduit la charge cognitive du premier niveau | Desktop : survol + focus. Mobile : le groupe s'affiche en liste dépliée en continu (pas de sous-accordéon — voir §8, choix explicite pour limiter le nombre d'interactions) |
| **Overlay** | Signale visuellement l'état modal du menu mobile, offre une zone de fermeture par clic | Mobile uniquement, menu ouvert |
| **Footer** | Deuxième maillage, complémentaire du menu (peut rester plus sélectif : best-sellers, liens support) — **hors périmètre de cette spécification**, non modifié |
| **Liens internes** | Toutes les entrées de nav sont de **vrais** `<a href>` résolvant une URL réelle, sur toutes les pages sans exception (y compris la homepage) | Partout |
| **Ancres** (`#histoire`, `#faq`, `#avis-clients`, `#qui-sommes-nous`, `#boutique`) | Cibles de scroll interne à la homepage, avec compensation de la hauteur du header | Liens éditoriaux de la homepage uniquement |
| **Hash SPA** (`/#<id-produit>`) | Mécanisme existant de routage vers une fiche produit, **non modifié par cette spécification** — hors périmètre nav | Conservé tel quel |

---

# 3. Arborescence définitive

```
Boutique                         → /#boutique (ancre, vue "tous produits")
Bien-être
  ├── Miels                      → /miels/
  ├── Miels Gourmands            → /miels-gourmands/
  ├── Miels du Terroir           → /miels-terroir/
  ├── Gélules                    → /gelules/
  ├── Poudres & Graines          → /poudres/
  ├── Huiles                     → /huiles/
  ├── Brumes                     → /brumes/
  └── Bakhour & Encens           → /bakhour/
Parfums                          → /parfums/   (lien unique, voir §5 — décision tranchée)
Mode & Accessoires
  ├── Qamis                      → /qamis/
  ├── Abayas & Ensembles         → /abayas/
  ├── Bagues & Bijoux            → /bijoux/
  ├── Sandales                   → /chaussures/
  └── Chéchias                   → /chechias/
Tahara & Hygiène                 → /tahara/    (lien direct, voir §4)
Accessoires                      → /accessoires/ (lien direct, voir §4)
Notre histoire                   → /#histoire  (homepage uniquement)
FAQ                              → /#faq       (homepage uniquement)
Avis                             → /#avis-clients (homepage uniquement)
```

**Ordre exact de premier niveau** (identique sur les 19 pages) :
`Boutique → Bien-être → Parfums → Mode & Accessoires → Tahara & Hygiène → Accessoires → Notre histoire → FAQ → Avis`

**Justifications** :
- **« Boutique » en tête** : accès direct à l'intégralité du catalogue sans naviguer un groupe — conserve l'usage actuel validé (le lien existe déjà et fonctionne).
- **« Bien-être » regroupe 8 entrées** (vs 6 avant) : Bakhour & Encens y est ajouté (parenté d'usage avec les brumes/huiles — parfum d'intérieur, rituel), Miels Gourmands et Miels du Terroir y apparaissent en sous-entrées de Miels plutôt qu'en 2 lignes séparées au même niveau que « Miels », pour ne pas saturer le groupe avec 3 lignes « Miels* » consécutives qui se ressembleraient visuellement. *Alternative rejetée* : fusionner les 3 miels en une seule entrée « Miels » menant à un sélecteur — rejetée car ce sont 3 pages distinctes avec un contenu SEO propre, un sous-regroupement visuel suffit.
- **« Parfums » en lien direct de premier niveau, hors « Bien-être »** : la catégorie a une identité de marque forte (hub multimarques LeCode/Khair), une page hub dédiée déjà construite, et un volume qui justifie une entrée autonome plutôt que d'être noyée dans un groupe de 8. Voir §5 pour la comparaison complète des options.
- **« Mode & Accessoires » regroupe 5 entrées** : Qamis, Abayas, Bijoux, Sandales, Chéchias — toutes des catégories vestimentaires/accessoires personnels, cohérence sémantique claire. Le libellé remplace « Mode » (trop restrictif pour inclure Bijoux/Sandales/Chéchias).
- **« Tahara & Hygiène » et « Accessoires » en liens directs, hors groupe** : deux catégories qui ne s'intègrent naturellement dans aucun des deux groupes ci-dessus (Tahara = rituel/hygiène, pas bien-être cosmétique ; « Accessoires » est un fourre-tout générique qui perdrait son identité s'il était noyé sous « Mode »). Les exposer en direct les rend immédiatement visibles au lieu de les enterrer dans un 3ᵉ groupe artificiel. *Alternative rejetée* : créer un 3ᵉ dropdown « Autres » — rejetée, un groupe nommé « Autres » est anti-premium et n'aide pas la découvrabilité.
- **Entrées éditoriales en fin de liste, réduites à 3** (Notre histoire, FAQ, Avis) : « Qui sommes-nous ? » est **supprimé du menu** (fusionné avec « Notre histoire », qui mène à la même section narrative — l'audit avait identifié ces deux entrées comme quasi-synonymes ; leur ancre HTML `#qui-sommes-nous` reste dans le code de la page mais n'est plus liée depuis le menu). Elles n'apparaissent que sur la homepage (voir §17, elles n'ont pas de sens sur une page catégorie qui n'a pas ces sections).

---

# 4. Les 14 catégories — décisions

| Catégorie | Traitement | Justification |
|---|---|---|
| Miels | sous-entrée de Bien-être | catalogue historique, fort volume |
| Miels Gourmands | sous-entrée de Bien-être | univers Supabase distinct mais parenté évidente avec Miels |
| Miels du Terroir | sous-entrée de Bien-être | idem |
| Gélules | sous-entrée de Bien-être | — |
| Poudres & Graines | sous-entrée de Bien-être | — |
| Huiles | sous-entrée de Bien-être | — |
| Brumes | sous-entrée de Bien-être | — |
| Bakhour & Encens | sous-entrée de Bien-être | actuellement absent de la nav (bug corrigé ici) ; 1 seul produit réel actuellement, mais le regroupement n'est pas remis en cause si le catalogue grandit |
| Parfums | **lien direct** de premier niveau | volume + identité de marque + hub dédié (voir §5) |
| Qamis | sous-entrée de Mode & Accessoires | — |
| Abayas & Ensembles | sous-entrée de Mode & Accessoires | — |
| Bagues & Bijoux | sous-entrée de Mode & Accessoires | actuellement absent de la nav catégories (corrigé) |
| Sandales | sous-entrée de Mode & Accessoires | libellé aligné sur `FILTERS`/`COLLECTIONS` réels (« Sandales », pas « Chaussures » — fait vérifié dans `index.html:1303,1318`) |
| Chéchias | sous-entrée de Mode & Accessoires | actuellement absent de la nav catégories (corrigé) |
| Tahara & Hygiène | **lien direct** de premier niveau | ne s'intègre naturellement dans aucun groupe (§3) |
| Accessoires | **lien direct** de premier niveau | idem |

**Résultat** : 14/14 catégories couvertes par le menu, sur les 19 pages, sans exception — objectif business de l'audit rempli. Aucune catégorie « mise en avant » par un traitement visuel spécial (pas de badge, pas de couleur différente) : la mise en avant commerciale (nouveautés, best-sellers) reste du ressort de la homepage (bandeau, section Collections), pas du menu — garde la nav sobre et stable dans le temps.

---

# 5. Parfums — comparaison des options et décision

| Critère | Option A — lien unique vers le Hub | Option B — dropdown par marque | Option C — sous-entrée dans « Bien-être » |
|---|---|---|---|
| UX | 1 clic vers une page qui présente déjà les 2 marques clairement (fait vérifié : le hub liste LeCode Paris et Khair by Ameerate) | 2 clics pour atteindre une marque précise, mais évite un détour par le hub si l'utilisateur sait déjà ce qu'il cherche | Noie une catégorie à forte identité dans un groupe générique |
| SEO | Un seul lien de nav à maintenir, cohérent avec le maillage déjà en place vers `/parfums/` (footer, homepage) ; les pages marques restent atteignables depuis le hub (maillage à 2 niveaux, standard) | Ajoute un lien direct par marque — meilleur maillage vers les pages marques individuellement, mais le générateur produit déjà ce dropdown pour les pages parfums elles-mêmes (`buildParfumsNavBlock`), donc redondant si répliqué dans la nav commune | Dilue le signal thématique « parfums » dans un groupe non spécifique |
| Maintenance | **Zéro maintenance** : le nombre de marques peut passer de 2 à 20 sans toucher la nav commune (le hub liste les marques, pas le menu) — cohérent avec le principe déjà en place du générateur (« aucune marque codée en dur ») | Chaque nouvelle marque exigerait une entrée supplémentaire dans la config nav commune, dupliquant une logique que le générateur gère déjà seul pour les pages parfums | Zéro maintenance mais mauvais classement sémantique |
| Conversion | Le hub est conçu comme page de sélection (fait vérifié : « aucune fiche produit dessus pour éviter toute duplication de contenu », une carte par marque) — c'est sa fonction, un lien direct dessus est cohérent avec ce design | Court-circuite le hub, dont l'existence perdrait sa justification | — |
| Simplicité | Maximale : 1 ligne dans la config nav | Complexité inutile en doublon du générateur | Fausse simplicité (déplace le problème) |

**Décision : Option A — lien unique vers `/parfums/`.**
**Justification de fond** : le hub a été conçu et construit précisément pour être ce point d'entrée unique (fait vérifié dans `docs/ARCHITECTURE_DAR_NUR.md` : « hub éditorial, une carte par marque, aucune fiche produit dessus pour éviter toute duplication de contenu »). Répliquer un dropdown par marque dans la nav commune créerait une **deuxième source de vérité des marques**, concurrente de `buildParfumsNavBlock()` qui lit déjà Supabase — violation directe du principe « source unique » de cette refonte (§14). Le dropdown par marque continue d'exister, mais **seulement** sur les pages parfums elles-mêmes (hub + pages marques), généré automatiquement, exactement comme aujourd'hui — il n'est pas dupliqué dans la nav des 15 autres pages.

---

# 6. Breakpoints — définition définitive

| Nom | Plage | Justification |
|---|---|---|
| **Mobile** | < 1024px | Le menu bascule en burger. **Changement par rapport à l'existant (768px)** : l'audit a mesuré une zone cassée entre 769 et ~1000px (liens sur 2-3 lignes, header gonflé à 101px, mesuré à 800px) — 9 entrées de premier niveau (après réduction du groupe éditorial, §3) ne tiennent pas nativement en dessous de ~1024px sur ce jeu de polices/espacements. Remonter le seuil supprime la zone cassée sans qu'aucune mesure corrective supplémentaire soit nécessaire. |
| **Tablette** | 768–1023px | Traité comme **mobile** (burger) — décision explicite, voir ci-dessus. Ce n'est pas un état intermédiaire séparé : la tablette portrait (768–834px, iPad) utilise le menu burger, pas une nav condensée hybride (qui ajouterait un 3ᵉ comportement à maintenir, contraire à l'objectif d'unification). |
| **Desktop** | 1024–1439px | Nav en ligne complète, dropdowns au survol + focus |
| **Desktop large** | ≥ 1440px | Même comportement que desktop ; le conteneur `.wrap`/`nav` reste plafonné à sa largeur maximale existante (1240px, fait vérifié) et centré — aucun changement de comportement, seulement plus de marge latérale |

**Hypothèse à vérifier au canari** (non testée dans cette session) : à 1024px exact, confirmer que les 9 entrées (Boutique, Bien-être, Parfums, Mode & Accessoires, Tahara & Hygiène, Accessoires, Notre histoire, FAQ, Avis) tiennent sur une ligne avec le brand, avec la même famille de police/tailles qu'aujourd'hui. Si ce n'est pas le cas, la seule action autorisée sans revenir sur cette spec est d'ajuster l'espacement (`gap`) — pas de retoucher l'arborescence ni le breakpoint sans repasser par une décision explicite.

---

# 7. Comportement Desktop (≥ 1024px) — sans ambiguïté

- **Hover** sur une entrée de premier niveau simple (Boutique, Parfums, Tahara & Hygiène, Accessoires, Notre histoire, FAQ, Avis) : changement de couleur (crème → or), transition `opacity/color .25s ease`. Pas de soulignement animé dans cette version (l'échafaudage CSS existant sans effet n'est pas ressuscité sans une décision de design dédiée — hors périmètre fonctionnel).
- **Hover** sur un déclencheur de dropdown (Bien-être, Mode & Accessoires) : ouvre le panneau du groupe après un **délai d'entrée de 0ms** (ouverture immédiate, comme aujourd'hui) et le referme après un **délai de sortie de 150ms** une fois le curseur hors de la zone combinée déclencheur+panneau (pour éviter la fermeture par écart de trajectoire, défaut identifié dans l'audit). Transition d'apparition : `opacity 0→1` + `translateY(-4px→0)` sur 180ms, easing `ease-out`.
- **Focus clavier** sur un déclencheur de dropdown (Tab) : ouvre le panneau de façon identique au hover (même transition), le referme si le focus quitte le groupe entier (déclencheur + tous les liens du panneau) — pas seulement le déclencheur, pour permettre de tabuler dans le panneau sans le fermer.
- **Dropdown ouvert** : chaque lien est focalisable au Tab dans l'ordre visuel (haut en bas) ; `Escape` referme le dropdown et rend le focus au déclencheur ; `Enter`/clic sur un lien navigue normalement.
- **Scroll** : le header reste sticky (`position:sticky;top:0`), déjà fonctionnel (vérifié en production) — aucun changement de ce comportement.
- **Clic** sur une entrée simple ou un lien de dropdown : navigation normale (changement de page ou d'ancre) ; aucun `preventDefault` sauf sur la homepage pour les 3 entrées éditoriales qui déclenchent un scroll interne au lieu d'une navigation externe (§17, cas SPA).
- **Aucune ambiguïté résiduelle** : à aucun moment un élément de premier niveau n'est à la fois un déclencheur de groupe et un lien direct (chaque entrée est strictement l'un ou l'autre).

---

# 8. Comportement Mobile (< 1024px) — sans ambiguïté

- **Ouverture** : clic/tap sur le burger → le panneau glisse depuis la droite (`transform:translateX(100%)→0`, transition `.35s ease`), l'overlay sombre apparaît en fondu (`opacity 0→1`, `.35s`), le burger anime ses 3 barres en croix (`.3s`).
- **Structure du panneau** : liste verticale unique, **pas d'accordéon** pour les groupes — Bien-être et Mode & Accessoires affichent leur titre de groupe (non cliquable, simple séparateur visuel en majuscules atténuées) suivi immédiatement de leurs sous-entrées, toutes visibles sans interaction supplémentaire. *Justification du choix explicite* : un menu mobile premium ne doit pas imposer une 2ᵉ couche d'interaction (déplier/replier) pour atteindre un lien — la liste complète (9 premiers niveaux + 13 sous-entrées de groupe + 3 liens directs = ~22 lignes) reste défilable en une seule colonne, ce qui est le choix déjà fait par le pattern actuel des dropdowns mobiles (`position:static` en cascade, fait vérifié dans le CSS existant) : cette spec le confirme et le corrige (défilement), elle ne l'invente pas.
- **Défilement du panneau** : `overflow-y:auto` sur le conteneur du panneau, **obligatoire sur toutes les pages sans exception** (bug critique de l'audit : absent sur la homepage). Le panneau ne doit jamais dépasser `100vh` moins la hauteur réelle du header.
- **Position du panneau** : `top` = hauteur réelle du header de la page courante (via le token `--header-h`, §13) — jamais une valeur codée en dur indépendante.
- **Overlay** : présent et cliquable sur **toutes** les pages sans exception (bug de l'audit : absent sur les 15 pages catégories) ; z-index entre le contenu de page et le panneau (échelle définie §13).
- **Verrouillage du scroll d'arrière-plan** : `body` passe en `overflow:hidden` tant que le menu est ouvert, sur toutes les pages.
- **Fermeture** — quatre déclencheurs, tous actifs sur toutes les pages sans exception :
  1. Clic/tap sur le burger (toggle).
  2. Clic/tap sur l'overlay.
  3. Touche `Escape`.
  4. Clic/tap sur n'importe quel lien du panneau (fermeture puis navigation — sur les pages à navigation réelle, la fermeture n'a pas d'effet visible puisque la page change, mais le comportement doit rester défini pour la cohérence du composant et pour le cas SPA de la homepage où la fermeture précède un scroll interne).
- **Restitution du focus** : à la fermeture par Escape ou clic sur l'overlay, le focus revient au burger. À la fermeture par clic sur un lien, le focus suit la navigation normale du navigateur.
- **Ordre des éléments** : identique à l'ordre desktop (§3), sans réorganisation propre au mobile.
- **Zone tactile du burger** : 44×44px minimum (correction du défaut mesuré à 40×32px).
- **Resize pendant que le menu est ouvert** : si le viewport franchit le breakpoint desktop (1024px) alors que le menu mobile est ouvert, l'état ouvert est réinitialisé (classes retirées, scroll-lock levé) pour éviter tout état résiduel incohérent (bug latent identifié dans l'audit).

---

# 9. Accessibilité — exigences WCAG 2.2 AA

- **ARIA** :
  - Burger : `aria-label="Menu"`, `aria-expanded="true|false"` synchronisé sur l'état réel, `aria-controls="navLinks"`.
  - Déclencheur de dropdown : élément `<button>` (pas un `<div>`), `aria-expanded="true|false"`, `aria-haspopup="true"`.
  - `<nav>` principal : `aria-label="Navigation principale"`.
  - Entrée correspondant à la page courante : `aria-current="page"` (calculé par page lors du build, §14).
- **Focus** : chaque état interactif (lien, bouton, déclencheur) a un style de focus visible distinct du hover, cohérent avec la palette (contour or `2px solid var(--gold)` ou équivalent, `outline-offset:2px`) — actuellement quasi absent du site (une seule règle `:focus-visible`, hors nav), à généraliser au composant nav entier.
- **Navigation clavier** : Tab atteint, dans l'ordre visuel, chaque entrée de premier niveau puis (si un dropdown est ouvert par focus) chaque lien du groupe, sans jamais sauter un élément visible ni s'arrêter sur un élément masqué. Shift+Tab inverse l'ordre symétriquement.
- **Lecteurs d'écran** : la structure HTML doit permettre l'annonce du rôle « navigation », du nombre d'éléments de la liste, et de l'état ouvert/fermé des dropdowns/du menu mobile via les attributs ARIA ci-dessus — pas de test réel effectué dans le cadre de cette spécification (à faire en phase de validation, cf. audit pré-implémentation).
- **Zones tactiles** : 44×44px minimum pour tout élément interactif du menu mobile (burger inclus, corrigé — §8).
- **Ordre de tabulation** : strictement l'ordre du DOM visuel, aucun `tabindex` positif (valeurs 0/-1 uniquement si nécessaire pour un état masqué).
- **Messages d'état** : aucun changement d'état du menu ne nécessite une région `aria-live` (l'ouverture/fermeture est déjà portée par `aria-expanded`, suffisant selon les pratiques WCAG pour ce type de composant) — pas de sur-ingénierie ici.
- **Contrastes** : déjà conformes (or sur vert ≈ 7,4:1, mesuré) — à revérifier uniquement si une couleur change lors de la consolidation CSS, sans quoi aucune action requise.

---

# 10. Responsive — comportements par contexte

- **Tablette** (768–1023px, portrait et paysage) : traitée comme mobile (§6) — menu burger, pas de comportement intermédiaire.
- **Paysage mobile** (hauteur réduite, ex. 390×844 pivoté en ~844×390) : le panneau conserve son `overflow-y:auto` (§8) — c'est le mécanisme qui garantit qu'aucune entrée ne devient inatteignable, quelle que soit la hauteur disponible. Aucun comportement spécifique au paysage au-delà de cette garantie générale.
- **Très petits écrans** (320–359px) : aucune règle spécifique distincte de « mobile » — le panneau (largeur `74%, max 320px` conservée de l'existant, fait à valider au canari sur un écran de 320px réel) et le défilement interne couvrent ce cas par construction.
- **Grands écrans** (≥ 1440px) : voir §6 — aucun changement de comportement, largeur du conteneur nav plafonnée à 1240px et centrée comme le reste du site.

---

# 11. Animations — durées, easing, propriétés

Toutes les animations du composant utilisent exclusivement `opacity` et `transform` (jamais `width`/`height`/`top` animés en continu — seule la position initiale du panneau mobile utilise `transform:translateX`, ce qui est conforme) pour rester compositables et sans reflow, cohérent avec l'objectif performance.

| Interaction | Propriétés | Durée | Easing |
|---|---|---|---|
| Hover lien simple (couleur) | `opacity, color` | 250ms | ease |
| Ouverture dropdown desktop | `opacity, transform:translateY` | 180ms | ease-out |
| Fermeture dropdown desktop (après délai de sortie 150ms) | idem, inverse | 150ms | ease-in |
| Ouverture panneau mobile | `transform:translateX` | 350ms | ease |
| Overlay mobile (apparition/disparition) | `opacity` | 350ms | ease |
| Burger → croix | `transform` (barres) | 300ms | ease |
| Focus (apparition de l'anneau) | aucune transition (apparition instantanée, standard d'accessibilité — ne jamais retarder un indicateur de focus) | 0ms | — |

**Principe directeur** : ces valeurs sont la consolidation des durées déjà présentes dans le code (250/300/350ms), purgées des incohérences relevées par l'audit (quatre durées différentes dont `.2s`/`transition:all`) — aucune nouvelle valeur exotique n'est introduite, pour rester fidèle à la sobriété déjà pratiquée par la marque.

---

# 12. États

| État | Déclencheur | Rendu |
|---|---|---|
| **Normal** | par défaut | couleur crème, opacité .82 |
| **Hover** | souris sur un lien/déclencheur (desktop uniquement) | couleur or, opacité 1 |
| **Focus** | clavier (Tab) sur tout élément interactif | anneau de focus visible + comportement identique au hover pour les dropdowns |
| **Active** (lien cliqué, avant navigation) | `:active` CSS natif | pas de style spécifique additionnel (le navigateur gère le retour visuel natif ; pas de sur-ingénierie) |
| **Ouvert** | dropdown en survol/focus, ou menu mobile après tap burger | panneau/liste visible, `aria-expanded="true"` |
| **Fermé** | état par défaut ou après un des 4 déclencheurs de fermeture (§8) | panneau/liste masqué, `aria-expanded="false"` |
| **Page courante** | l'URL de la page correspond à une entrée de nav | `aria-current="page"` + traitement visuel discret (ex. couleur or fixe au lieu de crème, sans autre décoration) |
| **Loading** | non applicable | le menu est 100 % HTML statique, aucun état de chargement n'existe |
| **Erreur** | non applicable | aucune donnée dynamique n'est lue au runtime par le composant nav (voir §14) ; pas d'état d'erreur possible côté client |

---

# 13. Cohérence graphique — valeurs figées

Toutes les valeurs ci-dessous sont des **reprises** des tokens existants (identité « Émeraude & Or »), pas des créations — aucune n'introduit une nouvelle couleur, police ou échelle.

- **Couleurs** : fond header `rgba(13,31,22,.97)` + `backdrop-filter:blur(8px)` ; texte `var(--cream)` opacité .82 (repos) / 1 (hover/focus/actif) ; accent `var(--gold)` ; filet `rgba(200,168,75,.22)` ; overlay `rgba(0,0,0,.4)`.
- **Typographie** : Cinzel, `.74rem` (~11.8px) pour les entrées de premier niveau, `.72rem` pour les liens de dropdown, uppercase, `letter-spacing:.16em`/`.1em`. **Décision de correction** : la taille de police des liens de dropdown passe de `.72rem`/`.7rem` (deux valeurs différentes selon la copie, cf. audit) à **`.74rem` uniforme**, pour rester au-dessus du seuil de confort de lecture 12px identifié comme point faible (11,8px reste sous 12px mais c'est la valeur de la marque déjà choisie pour le premier niveau — l'unifier au lieu de descendre plus bas est le compromis retenu, pas d'invention d'une nouvelle taille).
- **Hauteur du header** : **token unique `--header-h`**, calculé une fois par gabarit (SPA : 85px : pages catégories/parfums : 81px — les deux valeurs réelles mesurées sont conservées telles quelles, ce ne sont pas des bugs en soi, seul leur **usage incohérent dans les offsets** l'était). Toute règle qui a besoin de la hauteur du header (position du panneau mobile, `scroll-margin-top` des ancres) référence ce token, jamais une valeur recopiée à la main.
- **Rayon de bordure du dropdown** : **2px uniforme** (valeur SPA/catégories retenue ; la variante 4px des templates parfums est abandonnée au profit de l'uniformité).
- **Padding des liens de dropdown** : **12px 20px uniforme** (valeur SPA/catégories retenue ; la variante `9px 20px` des templates parfums abandonnée).
- **Ombres** : `box-shadow:0 12px 32px -12px rgba(0,0,0,.4)` sur les dropdowns desktop — reprise telle quelle.
- **Icônes** : burger = 3 barres `2px` de haut, `var(--gold)`, sans remplacement par une icône SVG (cohérence avec l'existant, pas de nouvelle dépendance visuelle).
- **Zone tactile burger** : 44×44px (voir §8/§9), obtenu par ajustement du `padding` du bouton, le dessin des 3 barres ne change pas.

---

# 14. Règles de maintenance

1. **Une seule source de vérité pour la structure du menu** : un fichier de configuration unique (liste des entrées, groupes, libellés, URLs, ordre) alimente les 19 pages servies. Aucune page n'a de HTML de nav écrit à la main en dehors de ce mécanisme.
2. **Aucune duplication** : le HTML canonique, le CSS et le JS du composant existent chacun en un seul exemplaire source ; leur présence physique dans chaque page (nécessaire pour le HTML — SEO statique) est une **sortie de build**, jamais une source éditable indépendamment.
3. **Une catégorie ajoutée/retirée/renommée = une seule modification** dans le fichier de configuration, jamais une édition répétée par page.
4. **Comportement strictement identique sur toutes les pages** : même JS, mêmes durées d'animation, mêmes déclencheurs de fermeture, sans exception ni « variante allégée » pour telle ou telle famille de page.
5. **Le dropdown Parfums par marque reste géré exclusivement par le générateur existant** (`buildParfumsNavBlock`) sur les seules pages parfums — il ne doit jamais être répliqué dans la configuration commune (cf. §5, pour ne pas créer une deuxième source de vérité des marques).
6. **Aucun style inline nouveau** : toute règle visuelle du composant vit dans le CSS partagé, jamais dans un attribut `style` ou un `<style>` local à une page.
7. **Aucun JavaScript spécifique à une seule page** pour le comportement du menu (ouverture/fermeture/overlay/clavier) ; seule l'interception des 3 liens éditoriaux de la homepage (§17) constitue une extension **additive**, qui ne modifie pas le comportement commun mais s'y branche.

---

# 15. Critères d'acceptation

Le menu n'est considéré terminé que si **chacun** des critères suivants est vérifié sur les 19 pages servies (ou explicitement sans objet pour une page donnée) :

**Desktop (≥1024px)**
- [ ] 9 entrées de premier niveau visibles sur une seule ligne, aucun retour à la ligne, à 1024, 1280 et 1920px.
- [ ] Les 2 dropdowns s'ouvrent au survol et au focus, se ferment après 150ms hors zone, contiennent respectivement 8 et 5 sous-entrées dans l'ordre défini (§3/§4).
- [ ] Sticky header fonctionnel (vérifié au scroll).
- [ ] Aucune régression visuelle par rapport aux tokens figés (§13).

**Mobile (<1024px)**
- [ ] Toutes les entrées (9 premier niveau + 13 sous-entrées + séparateurs de groupe) atteignables par défilement à 320, 360, 390px portrait ET en paysage (hauteur réduite).
- [ ] Overlay présent et cliquable sur les 19 pages.
- [ ] Burger 44×44px minimum, anime en croix à l'ouverture.
- [ ] Fermeture par les 4 déclencheurs (burger, overlay, Escape, clic lien) fonctionnelle sur les 19 pages.
- [ ] Scroll d'arrière-plan verrouillé menu ouvert.
- [ ] Resize traversant 1024px avec menu ouvert : état réinitialisé proprement.

**Responsive**
- [ ] Aucun scroll horizontal (`scrollWidth === clientWidth`) sur les 19 pages, à toutes les largeurs listées en §10.
- [ ] Comportement identique entre 768 et 1023px (aucun état intermédiaire imprévu).

**Accessibilité**
- [ ] Tab atteint 100 % des entrées et sous-entrées dans l'ordre visuel, sur desktop et mobile.
- [ ] `aria-expanded`, `aria-haspopup`, `aria-controls`, `aria-current`, `aria-label` présents et corrects (§9).
- [ ] Focus visible sur chaque état interactif.
- [ ] Test lecteur d'écran effectué (au moins NVDA ou VoiceOver) sans blocage constaté.
- [ ] Aucune régression de contraste.

**SEO**
- [ ] Les 14 catégories + Parfums ont un lien `<a href>` réel présent dans le HTML source (sans exécution JS) de chaque page servie.
- [ ] `sitemap.xml`/`robots.txt`/JSON-LD inchangés (diff vide) sauf effet attendu documenté.
- [ ] Aucun lien de nav en 404 (crawl complet des 19 pages).

**Performance**
- [ ] Zéro erreur console sur les 19 pages.
- [ ] Poids CSS + JS du composant nav < 8 Ko cumulés.
- [ ] Aucune régression Lighthouse (Performance, Accessibilité, SEO) mesurée avant/après sur homepage + 1 page catégorie témoin.

**Navigation / SPA**
- [ ] Les 3 entrées éditoriales de la homepage (Notre histoire, FAQ, Avis) scrollent à la bonne position (compensation `--header-h`) sans navigation de page.
- [ ] `goCat`/filtres boutique non régressés.
- [ ] Hash produit (`/#dn-...`) non régressé depuis une page catégorie.

**Catégories**
- [ ] Les 14 catégories présentes dans le menu des 19 pages, sans exception, avec les libellés définis en §3/§4.

**Parfums**
- [ ] Lien unique vers `/parfums/` présent partout sauf sur les pages parfums elles-mêmes, où le dropdown par marque généré reste inchangé.

**Footer**
- [ ] Non modifié par cette refonte (hors périmètre, §2) — vérification de non-régression uniquement.

**Console / Cross-browser**
- [ ] Testé sans erreur sur Chromium, Firefox, Safari desktop, Safari iOS réel, Android Chrome.

---

# 16. Ce qui est interdit

- Dupliquer le HTML du menu en l'écrivant à la main dans une page individuelle plutôt que via la configuration commune.
- Dupliquer les règles CSS du composant dans le `<style>` local d'une page.
- Écrire du JavaScript de comportement de menu propre à une seule page (toggle, fermeture, overlay) en dehors du module commun.
- Utiliser des styles inline (`style="..."`) sur un élément du composant nav.
- Faire diverger le comportement d'une page par rapport aux autres (ex. « cette page n'a pas d'Escape » ne doit plus jamais exister).
- Ajouter une catégorie dans le HTML d'une seule page sans passer par la configuration commune.
- Répliquer la logique de marques Parfums (actuellement propre au générateur) dans la configuration nav commune.
- Introduire une nouvelle couleur, police, taille ou courbe d'animation non listée en §11/§13 sans repasser par une décision explicite.
- Coder en dur une hauteur de header ou un offset de panneau indépendamment du token `--header-h`.
- Ajouter un état de chargement ou de gestion d'erreur au composant nav (il n'y en a pas besoin, §12 — ce serait de la sur-ingénierie).
- Toucher au footer, au hash routing produit, ou à la logique `FILTERS`/`COLLECTIONS`/Supabase dans le cadre de cette refonte (hors périmètre explicite).

---

# 17. Questions en attente

### Q1 — Le mécanisme d'interception des liens éditoriaux de la homepage
**Enjeu** : les 3 entrées « Notre histoire »/« FAQ »/« Avis » doivent scroller en interne sur la homepage sans provoquer une navigation de page complète, tout en restant de **vrais** `<a href="/#...">` fonctionnels si on y accède depuis l'extérieur (une autre page, un signet). Deux mécanismes existent : (a) interception du clic en JavaScript (comme aujourd'hui via `onclick`, mais en amélioration progressive sur un vrai `href`), ou (b) écouteur `hashchange` qui scrolle après navigation, sans interception de clic.
**Recommandation** : (a), interception de clic — comportement identique à l'existant (déjà éprouvé en production), pas de nouveau mécanisme d'écoute à faire cohabiter avec le routage hash produit déjà en place (qui, lui, n'écoute que le chargement initial — un `hashchange` global créerait un risque de collision avec cette logique existante, hors périmètre de cette refonte).
**Conséquence si (b) était choisi à la place** : nécessiterait de vérifier qu'un hash produit et un hash de section ne s'interfèrent jamais, complexité non justifiée par le besoin.

### Q2 — Faut-il un mini-header de nav sur les pages légales (CGV, Confidentialité, Mentions légales) ?
**Enjeu** : ces pages ont aujourd'hui un header minimal « ← Retour à Dar Nūr », volontairement distinct du composant nav complet.
**Recommandation** : **ne pas** les intégrer à cette refonte — le pattern actuel (retour simple) est adapté au contexte (pages de contenu réglementaire, pas de navigation catalogue attendue) et leur ajout élargirait le périmètre sans bénéfice UX identifié.
**Conséquence si intégrées** : 3 pages supplémentaires dans le rollout, sans gain business mesurable, pour un composant dont l'usage y est marginal.

### Q3 — Faut-il afficher `aria-current="page"` sur l'entrée de groupe (ex. « Bien-être ») quand une sous-page du groupe est active, en plus du lien exact ?
**Enjeu** : accessibilité fine — certains standards recommandent de marquer aussi le parent d'une hiérarchie active.
**Recommandation** : oui, marquer également le déclencheur du groupe parent (valeur `aria-current="true"`, pas `"page"`, réservée au lien exact) — coût d'implémentation négligeable, bénéfice réel pour un utilisateur de lecteur d'écran qui explorerait uniquement le premier niveau.
**Conséquence si non fait** : dégradation mineure de l'orientation pour un utilisateur non-voyant naviguant uniquement au premier niveau — acceptable en dernier recours si le temps de développement est contraint, mais à documenter comme dette explicite si écarté.

---

# 18. Validation finale

## Décisions validées
- Arborescence complète à 14 catégories réparties en 2 groupes (Bien-être : 8, Mode & Accessoires : 5) + 2 liens directs (Tahara & Hygiène, Accessoires) + 1 lien direct Parfums + 3 entrées éditoriales homepage-only.
- Parfums = lien unique vers le hub (option A), dropdown par marque conservé uniquement sur les pages parfums, généré par le mécanisme existant.
- Breakpoint unique à 1024px (mobile/tablette confondus sous ce seuil).
- Comportements desktop et mobile intégralement spécifiés (§7/§8), sans variante par page.
- Accessibilité WCAG 2.2 AA comme exigence de premier rang, ARIA complet spécifié.
- Tokens visuels figés par reprise de l'existant, deux incohérences corrigées par unification (rayon dropdown 2px, padding liens 12px 20px, taille police liens .74rem).
- Règles de maintenance et interdictions explicites (§14/§16).
- Périmètre exclu explicitement : footer, hash routing produit, `FILTERS`/`COLLECTIONS`/Supabase, pages légales.

## Décisions restant à prendre
- **Aucune décision fonctionnelle.** Les deux points ouverts (§17, Q1/Q2/Q3) sont accompagnés d'une recommandation exploitable telle quelle ; un développeur peut les exécuter sans arbitrage supplémentaire sauf s'il souhaite explicitement s'écarter des recommandations, auquel cas cela redevient une décision produit à faire remonter.
- Décisions d'implémentation pure non couvertes par une spécification fonctionnelle (nommage des fichiers/variables internes, format exact du fichier de configuration — JSON vs module JS, détail du script de build) : laissées au développeur, hors périmètre d'un document fonctionnel.

## Risques résiduels (non supprimables avant développement)
- **Comportement Safari iOS réel non vérifié** (barre d'URL dynamique affectant `100vh`) — ne peut être éliminé que par un test sur appareil physique en cours d'implémentation, pas par une décision documentaire.
- **Rendu réel en lecteur d'écran** (NVDA/VoiceOver) non testé — la spécification ARIA est correcte sur le papier (conforme aux pratiques WCAG documentées) mais seul un test réel élimine ce risque.
- **Tenue exacte des 9 entrées sur une ligne à 1024px** avec la typographie figée — dépend du rendu réel des polices Google Fonts chargées, à confirmer au premier assemblage (ajustement de `gap` autorisé sans re-décision, §6).
- **Dépendance au workflow GitHub Actions existant** pour les pages parfums (le dropdown par marque est régénéré par un processus externe à cette spécification) — risque déjà documenté dans l'audit de pré-implémentation, non ré-ouvert ici.

## Niveau de confiance avant lancement du développement : **90 %**
Supérieur au 85 % de l'audit de pré-implémentation parce que les deux décisions produit qui y étaient identifiées comme bloquantes (regroupement des catégories, breakpoint) sont désormais tranchées et justifiées dans ce document — il ne reste plus de zone d'ambiguïté fonctionnelle, seulement les risques résiduels listés ci-dessus, qui sont par nature des risques de vérification (testables) et non des risques de décision.
