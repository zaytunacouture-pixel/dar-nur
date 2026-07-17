# PLAN-P0-P16 — Implémentation de la migration des URLs produit

**Identifiant** : `PLAN-P0-P16`
**Version** : `1.1`
**Statut** : `Validé`
**Date de création** : `2026-07-16`
**Dernière révision** : `2026-07-17`

**Historique**

* `v1.0 — 2026-07-16` — Version initiale validée.
* `v1.1 — 2026-07-17` — Ajout de la section « Décisions opérationnelles actées » de P0 (six paramètres tranchés).

---

## Principes d'exécution

* Une seule phase est active à la fois.
* Aucun passage à la phase suivante sans validation explicite de la phase en cours.
* Toute phase possède :
  * un objectif ;
  * des prérequis ;
  * des fichiers concernés ;
  * des risques ;
  * des tests fonctionnels ;
  * des tests de non-régression ;
  * des critères Go/No-Go ;
  * une stratégie de rollback ;
  * une classification d'impact production.
* Les modifications visibles en production sont repoussées le plus tard possible.
* Toute régression, même mineure, bloque la phase.
* Aucun changement architectural ne peut être introduit sans revue explicite.
* Aucun code produit ne doit être modifié avant validation documentaire de P0.

---

# P0 — Socle documentaire et arbitrages opérationnels

## Objectif

Créer et valider le socle documentaire officiel du chantier avant toute modification fonctionnelle.

## Fichiers concernés

```text
docs/adr/ADR-001-product-urls-static-generation.md
docs/architecture/PLAN-P0-P16-implementation.md
docs/architecture/CHARTE-GOUVERNANCE.md
docs/architecture/CHECKLIST-ARCHITECTURE-REVIEW.md
docs/ARCHITECTURE_DAR_NUR.md
```

## Actions

1. Créer les répertoires documentaires.
2. Persister les quatre documents validés.
3. Ajouter leurs en-têtes de version.
4. Les référencer depuis `docs/ARCHITECTURE_DAR_NUR.md`.
5. Comparer les brouillons existants au corpus canonique.
6. Corriger les divergences.
7. Trancher les paramètres opérationnels ouverts :
   * limite `db-max-rows` Supabase ;
   * mécanisme d'historique des slugs ;
   * politique produit retiré ;
   * seuil G6 ;
   * tests navigateur manuels ou headless ;
   * seuil d'alerte WhatsApp.

## Impact production

**Sans impact production**

## Risques

* documentation incomplète ;
* divergence entre documents ;
* décisions opérationnelles laissées implicites ;
* création de dettes documentaires dès le départ.

## Tests fonctionnels

* vérifier que les quatre documents existent ;
* vérifier les identifiants, versions, dates et statuts ;
* vérifier les références croisées ;
* vérifier que les six arbitrages sont explicitement documentés.

## Tests de non-régression

* aucun fichier fonctionnel modifié ;
* aucun changement HTML/CSS/JS ;
* aucun commit hors périmètre.

## Go

* documents complets et cohérents ;
* aucun identifiant en collision ;
* six arbitrages tranchés ;
* `git diff --check` propre ;
* aucune modification fonctionnelle.

## No-Go

* documents encore partiels ;
* divergence avec le corpus ;
* arbitrage opérationnel non résolu ;
* modification fonctionnelle détectée.

## Rollback

Supprimer uniquement les fichiers documentaires créés ou revenir au commit précédent. Aucun impact sur les données ni sur le site.

## Décisions opérationnelles actées (2026-07-17)

1. **Lecture Supabase** — pagination systématique, indépendante de la valeur de `db-max-rows` ; comptage exact quand l'API le permet ; aucune page vide prématurée ou erreur intermédiaire tolérée sans détection ; aucun résultat partiel accepté comme catalogue complet. G1, G2, G6, G14 restent applicables. Référence initiale G6 : 230 produits actifs (constatée le 2026-07-17), à reconfirmer au premier run officiel du générateur.

2. **Historique des slugs** — table Supabase dédiée `product_slug_history` (`id`, `product_id`, `old_slug`, `new_slug`, `changed_at`, `changed_by`/`change_source`). Un `old_slug` ne peut jamais être réattribué à un autre produit. Chaque changement est rattaché au produit par son identifiant stable. Aucune modification de slug n'est autorisée tant que cette table n'est pas opérationnelle. Aucune table créée à ce stade — l'absence actuelle d'accès DDL est un prérequis opérationnel à résoudre, pas une justification pour une solution de contournement durable (fichier versionné rejeté : créerait une seconde source de vérité, fragiliserait N1).

3. **Produit retiré** — génération d'une page d'indisponibilité statique conservant l'URL et un canonical cohérent avec l'URL historique ; aucun prix/disponibilité trompeur ; retour au catalogue ou produits apparentés proposés si pertinent. La redirection vers une autre ressource reste possible uniquement en exception validée au cas par cas (jamais une redirection générique par défaut vers la homepage/une catégorie). Durée de conservation et traitement SEO détaillé spécifiés en P13.

4. **Seuil G6** — abandon du run si, par rapport au dernier run **officiel réussi** (jamais un run échoué) : baisse strictement supérieure à 5 % **et** perte d'au moins 5 produits actifs. Avec la référence actuelle de 230 produits, cela bloque à partir d'une perte de 12 produits. Premier run : enregistrement de la référence, sans comparaison historique. Une désactivation groupée volontaire doit être confirmée manuellement, sans jamais désactiver G6. Seuil réévalué en P15 à partir des variations réellement observées.

5. **Tests navigateur** — manuels pour P0 à P8. Revue formelle obligatoire à l'entrée de P9 pour statuer sur l'introduction d'un navigateur headless, examinant au minimum : C4 (erreurs JS critiques), C8 (compatibilité des anciennes URLs à fragment), accès direct et rafraîchissement, liens internes critiques, volume réel des scénarios, coût de maintenance et dépendances transitives. Jusqu'à cette revue, les scénarios manuels sont listés et leurs résultats consignés.

6. **Seuil d'alerte WhatsApp** — Niveau 1 (applicable immédiatement) : tolérance zéro pour un CTA WhatsApp cassé sur un parcours critique, rollback si défaillance systémique constatée, blocage si le lien est absent/mal formé/associé au mauvais produit/inutilisable, contrôle manuel sur échantillon représentatif à chaque phase concernée. Niveau 2 (différé) : une décision distincte sur un outil de mesure analytics doit être prise **avant P11** (pas P9 ni P14, pour disposer d'une baseline avant la migration des liens internes) ; cette décision sera une évolution séparée soumise à la Checklist, à N10 et aux exigences de confidentialité — aucun outil sélectionné ni installé en P0.

---

# P1 — Audit technique ciblé de l'existant

## Objectif

Cartographier précisément les points d'intégration avant toute extraction de logique.

## Fichiers concernés

Principalement :

```text
index.html
admin.html
scripts/generate-parfums.mjs
js/config.js
sitemap.xml
docs/ARCHITECTURE_DAR_NUR.md
```

## Actions

* inventorier `showProduct()` ;
* inventorier `updatePageMetadata()` ;
* inventorier `priceLabel()` ;
* inventorier `waLink()` ;
* inventorier les règles de catégorie ;
* inventorier les liens `#<slug>` ;
* inventorier les dépendances DOM ;
* inventorier les données produit réellement utilisées ;
* vérifier les variantes et relations Supabase ;
* confirmer la limite PostgREST ;
* confirmer le nombre réel de produits actifs.

## Impact production

**Sans impact production**

## Risques

* oublier une règle métier cachée ;
* confondre rendu et logique ;
* sous-estimer les dépendances au DOM ;
* baser la suite sur un inventaire incomplet.

## Tests fonctionnels

* produire une cartographie exhaustive ;
* associer chaque règle à son propriétaire actuel ;
* produire la liste des fonctions à extraire.

## Tests de non-régression

Aucune modification fonctionnelle.

## Go

* toutes les règles sont identifiées ;
* aucun point critique non compris ;
* le périmètre du module partagé est clair.

## No-Go

* logique métier non cartographiée ;
* dépendance DOM non isolée ;
* schéma de données incomplet.

## Rollback

Aucun rollback nécessaire si phase purement analytique.

---

# P2 — Extraction du module de règles métier partagé

## Objectif

Créer une source unique de vérité pour les règles de transformation produit → contenu dérivé.

## Fichiers concernés

Nouveau module, emplacement à confirmer, par exemple :

```text
js/product-rules.js
```

Éventuellement :

```text
index.html
```

uniquement après validation locale.

## Actions

Extraire sous forme de fonctions pures :

* catégorisation produit ;
* textes par défaut ;
* précautions ;
* entretien ;
* usage ;
* formatage des prix ;
* canonical ;
* title ;
* meta description ;
* données Open Graph ;
* données JSON-LD ;
* sélection des produits apparentés ;
* construction des données nécessaires au rendu.

## Impact production

**Sans impact production** tant que non branché à `index.html`.

## Risques

* extraction incomplète ;
* comportement différent de l'existant ;
* introduction de dépendances DOM ou Node ;
* perte de cas particuliers.

## Tests fonctionnels

* comparer les sorties du module aux sorties actuelles sur un échantillon de catégories ;
* tester produits avec variantes ;
* tester produits sans précautions ;
* tester produits mode, consommables, brumes, parfums, accessoires.

## Tests de non-régression

* aucun changement visuel ;
* aucun changement de texte ;
* aucun changement de prix ;
* aucun changement de lien WhatsApp.

## Go

* fonctions pures ;
* sorties identiques à l'existant ;
* tous les cas métier couverts ;
* aucune dépendance environnementale.

## No-Go

* divergence avec l'existant ;
* logique encore dupliquée ;
* dépendance au DOM ou à Node.

## Rollback

Supprimer le module tant qu'il n'est pas connecté.

---

# P3 — Branchement contrôlé du module partagé dans la SPA

## Objectif

Faire consommer le module partagé par l'existant sans modifier le comportement utilisateur.

## Fichiers concernés

```text
index.html
js/product-rules.js
```

## Impact production

**Impact faible**

## Risques

* erreur JavaScript bloquante ;
* mauvaise importation du module ;
* divergence de rendu ;
* régression sur les anciennes ancres.

## Tests fonctionnels

* ouverture de plusieurs produits ;
* métadonnées dynamiques inchangées ;
* prix et variantes corrects ;
* liens WhatsApp corrects ;
* produits apparentés identiques.

## Tests de non-régression

* filtres ;
* recherche ;
* catégories ;
* responsive ;
* navigation ;
* retour arrière ;
* console JavaScript ;
* performances.

## Go

* rendu strictement équivalent ;
* zéro erreur console ;
* aucun changement perceptible ;
* ancien système toujours fonctionnel.

## No-Go

* divergence visuelle ou fonctionnelle ;
* erreur console ;
* problème de navigation.

## Rollback

Revenir au commit précédent et restaurer la logique inline.

---

# P4 — Création du gabarit produit statique

## Objectif

Créer un gabarit HTML complet, non encore publié, destiné aux pages produit.

## Fichiers concernés

Par exemple :

```text
templates/product-page.html
```

ou autre emplacement validé.

## Impact production

**Sans impact production**

## Risques

* duplication de structure ;
* HTML non sémantique ;
* métadonnées incomplètes ;
* incompatibilité responsive.

## Tests fonctionnels

* présence des zones nécessaires ;
* structure SEO complète ;
* navigation ;
* produit ;
* prix ;
* variantes ;
* CTA WhatsApp ;
* données structurées ;
* footer/header.

## Tests de non-régression

Aucun fichier produit existant modifié.

## Go

* gabarit complet ;
* aucun placeholder ambigu ;
* structure conforme au design system ;
* compatible avec le module partagé.

## No-Go

* contenu manquant ;
* structure non responsive ;
* dépendance JS pour le contenu essentiel.

## Rollback

Supprimer le gabarit.

---

# P5 — Création du générateur statique

## Objectif

Créer le générateur Node sans encore publier l'ensemble du catalogue.

## Fichiers concernés

Par exemple :

```text
scripts/generate-products.mjs
```

Éventuellement :

```text
scripts/lib/
```

## Impact production

**Sans impact production**

## Risques

* lecture Supabase tronquée ;
* génération non déterministe ;
* duplication de règles ;
* écriture hors périmètre ;
* absence de garde-fous.

## Actions

* lire tous les produits actifs ;
* paginer si nécessaire ;
* appliquer le module partagé ;
* rendre le gabarit ;
* produire en mémoire ;
* valider avant écriture ;
* intégrer les garde-fous G1–G17 ;
* produire un résumé de run ;
* ne rien publier automatiquement à ce stade.

## Tests fonctionnels

* générer un petit sous-ensemble local ;
* vérifier canonical ;
* vérifier JSON-LD ;
* vérifier Open Graph ;
* vérifier liens internes ;
* vérifier fichiers attendus.

## Tests de non-régression

* aucun changement de fichiers existants non ciblés ;
* aucun commit automatique ;
* aucune publication.

## Go

* génération déterministe ;
* garde-fous actifs ;
* erreurs explicites ;
* aucune duplication de logique.

## No-Go

* sortie non reproductible ;
* données incomplètes ;
* absence de validation catalogue ;
* erreur silencieuse.

## Rollback

Supprimer le générateur et les fichiers de test.

---

# P6 — Preuve de concept locale

## Objectif

Valider localement une fiche produit complète avant toute publication.

## Fichiers concernés

* générateur ;
* gabarit ;
* module partagé ;
* un répertoire produit de test local.

## Impact production

**Sans impact production**

## Tests fonctionnels

* génération d'une page produit réelle ;
* service local via `http://localhost:3000` ;
* accès direct ;
* rafraîchissement ;
* canonical ;
* title ;
* meta description ;
* Open Graph ;
* JSON-LD ;
* CTA WhatsApp ;
* responsive ;
* contenu sans JavaScript.

## Tests de non-régression

* homepage ;
* catégories ;
* filtres ;
* recherche ;
* anciennes ancres ;
* performance locale ;
* absence d'erreur console.

## Go

* page fonctionnelle en accès direct ;
* HTML initial complet ;
* Lighthouse dans la plage de référence ;
* aucun lien cassé ;
* aucune régression locale.

## No-Go

* dépendance au JavaScript pour afficher le contenu essentiel ;
* problème de responsive ;
* metadata incorrecte ;
* performance dégradée.

## Rollback

Supprimer la page de test générée.

---

# P7 — Validation automatisée du HTML et du catalogue

## Objectif

Formaliser et exécuter les contrôles automatisés avant toute publication.

## Impact production

**Sans impact production**

## Contrôles

* une page par produit actif ;
* aucune page pour produit inactif ;
* aucun slug dupliqué ;
* aucun canonical dupliqué ;
* exactly one `<h1>` ;
* `<title>` non vide ;
* meta description non vide ;
* OG obligatoires présents ;
* JSON-LD syntaxiquement valide ;
* placeholders absents ;
* liens internes valides ;
* cohérence sitemap/page ;
* fichiers orphelins détectés.

## Tests fonctionnels

Exécution complète des garde-fous G1–G17.

## Tests de non-régression

* aucune écriture si validation échoue ;
* version précédente intacte ;
* résumé d'erreur explicite.

## Go

* 100 % des contrôles bloquants passent ;
* seules les alertes non bloquantes restent ;
* aucun échec silencieux.

## No-Go

* garde-fou bloquant déclenché ;
* catalogue incomplet ;
* canonical dupliqué ;
* fichier manquant non expliqué.

## Rollback

Aucun rollback nécessaire si aucune publication.

---

# P8 — Publication d'une page produit pilote orpheline

## Objectif

Publier une seule page produit réelle, sans modifier les liens internes existants.

## Impact production

**Impact faible**

## Risques

* comportement GitHub Pages différent du local ;
* problème `.nojekyll` ;
* canonical incorrect en production ;
* HTTP différent de 200.

## Tests fonctionnels

* accès direct production ;
* rafraîchissement ;
* statut 200 ;
* canonical ;
* OG ;
* JSON-LD ;
* affichage mobile/desktop ;
* CTA WhatsApp ;
* Rich Results Test manuel ;
* Lighthouse production.

## Tests de non-régression

* aucun lien interne actuel modifié ;
* homepage inchangée ;
* catégories inchangées ;
* SPA inchangée.

## Go

* page pilote stable ;
* 200 réel ;
* aucune régression ;
* métadonnées correctes ;
* performance acceptable.

## No-Go

* 404 ;
* canonical erroné ;
* régression globale ;
* comportement GitHub Pages non conforme.

## Rollback

Supprimer le répertoire de la page pilote et revenir au commit précédent.

---

# P9 — Génération complète du catalogue en production, sans migration des liens

## Objectif

Publier toutes les pages produit statiques sans encore modifier les liens internes.

## Impact production

**Impact moyen**

## Risques

* volume de fichiers ;
* désynchronisation ;
* page invalide ;
* erreurs massives ;
* temps de build.

## Tests fonctionnels

* toutes les pages accessibles ;
* toutes en 200 ;
* canonicals uniques ;
* sitemap cohérent ;
* échantillons par catégorie ;
* tests mobile/desktop ;
* CTA WhatsApp.

## Tests de non-régression

* ancienne SPA toujours fonctionnelle ;
* liens `#` toujours en place ;
* catégories inchangées ;
* performances globales inchangées ;
* console sans erreur.

## Go

* 100 % des produits actifs ont une page ;
* 0 page produit inactive ;
* 0 canonical dupliqué ;
* 0 erreur bloquante ;
* monitoring initial stable.

## No-Go

* écart catalogue ;
* erreurs 404 ;
* performance dégradée ;
* erreur console globale.

## Rollback

Supprimer les répertoires générés et revenir au commit précédent.

---

# P10 — Ajout de `.nojekyll` et stabilisation GitHub Pages

## Objectif

Rendre explicite le comportement de publication statique.

## Fichiers concernés

```text
.nojekyll
```

## Impact production

**Impact faible**

## Risques

* changement implicite du traitement Jekyll ;
* exposition de fichiers précédemment ignorés ;
* comportement inattendu de dossiers préfixés `_`.

## Tests fonctionnels

* pages produit toujours servies ;
* assets toujours accessibles ;
* aucune ressource indésirable publiée.

## Tests de non-régression

* homepage ;
* catégories ;
* parfums ;
* assets ;
* sitemap.

## Go

* comportement GitHub Pages stable ;
* aucune ressource cassée ;
* aucun artefact sensible exposé.

## No-Go

* ressource cassée ;
* comportement inattendu ;
* fichier interne exposé.

## Rollback

Supprimer `.nojekyll` et revenir au commit précédent.

---

# P11 — Migration des liens internes vers les vraies URLs

## Objectif

Remplacer tous les liens produit internes à fragment par des URLs réelles.

## Impact production

**Impact élevé**

## Fichiers concernés

Toutes les pages et scripts contenant des liens produit.

## Actions

* remplacer `#<slug>` par `/<slug>/` ;
* remplacer les URLs absolues avec fragment ;
* préserver les ancres éditoriales légitimes ;
* vérifier les 18 fichiers identifiés ;
* contrôler automatiquement l'absence de fragments produit résiduels.

## Tests fonctionnels

* clic produit depuis homepage ;
* clic depuis catégorie ;
* clic depuis produits liés ;
* lien WhatsApp ;
* retour arrière ;
* ouverture nouvel onglet ;
* partage URL.

## Tests de non-régression

* ancres éditoriales ;
* filtres ;
* recherche ;
* catégories ;
* navigation ;
* responsive ;
* console ;
* performance.

## Go

* 0 lien produit interne en fragment ;
* 0 lien mort ;
* toutes les pages ciblées existent ;
* aucune ancre légitime supprimée.

## No-Go

* fragment produit résiduel ;
* lien mort ;
* ancre éditoriale cassée ;
* régression navigation.

## Rollback

Restaurer les anciens liens via revert du commit.

---

# P12 — Compatibilité durable avec les anciennes URLs à fragment

## Objectif

Maintenir le fonctionnement des anciens liens partagés.

## Fichiers concernés

```text
index.html
```

## Actions

* adapter le bloc de lecture de `location.hash` ;
* vérifier que le hash correspond à un slug produit valide ;
* rediriger via `location.replace('/<slug>/')` ;
* préserver les ancres éditoriales légitimes ;
* éviter toute boucle de redirection.

## Impact production

**Impact moyen**

## Tests fonctionnels

* URL directe `/#slug` ;
* ancien lien WhatsApp ;
* favori navigateur ;
* lien externe ;
* slug invalide ;
* ancre éditoriale ;
* historique navigateur.

## Tests de non-régression

* homepage ;
* SPA ;
* ancres internes ;
* retour arrière ;
* console ;
* mobile.

## Go

* anciens liens redirigent correctement ;
* aucune boucle ;
* aucune ancre légitime affectée ;
* aucune entrée d'historique inutile.

## No-Go

* boucle ;
* redirection incorrecte ;
* homepage inaccessible ;
* ancre éditoriale cassée.

## Rollback

Restaurer le bloc hash précédent.

---

# P13 — Gestion des changements de slug et produits retirés

## Objectif

Mettre en œuvre la politique validée en P0.

## Impact production

**Impact moyen**

## Actions

* verrouiller le slug après publication ;
* enregistrer l'historique ;
* générer les redirections statiques ou pages d'indisponibilité ;
* détecter les fichiers orphelins ;
* traiter les suppressions.

## Tests fonctionnels

* changement de slug contrôlé ;
* ancienne URL accessible ;
* canonical de la nouvelle page ;
* page retirée selon politique ;
* historique cohérent.

## Tests de non-régression

* aucun slug existant modifié sans mécanisme ;
* aucune URL active cassée ;
* aucun doublon.

## Go

* politique P0 appliquée ;
* ancien slug préservé ;
* aucun renommage silencieux ;
* orphelins détectés.

## No-Go

* perte d'URL ;
* conflit de slug ;
* redirection incohérente ;
* suppression silencieuse.

## Rollback

Restaurer l'ancien slug et les pages précédentes.

---

# P14 — Finalisation du pipeline événementiel

## Objectif

Automatiser la régénération après modification Supabase, avec déclenchement manuel de secours.

## Impact production

**Impact moyen**

## Actions

* workflow GitHub Actions ;
* dispatch Supabase ;
* gestion des secrets ;
* résumé de génération ;
* prévention des commits vides ;
* maintien de l'état précédent en cas d'échec ;
* absence de cron.

## Tests fonctionnels

* modification produit ;
* déclenchement workflow ;
* génération ;
* commit ;
* déploiement ;
* déclenchement manuel ;
* échec simulé.

## Tests de non-régression

* aucun secret exposé ;
* aucun commit vide ;
* aucun run en boucle ;
* aucune suppression de pages valides sur erreur.

## Go

* pipeline stable ;
* échec sûr ;
* fallback manuel opérationnel ;
* logs lisibles ;
* aucun secret en repo.

## No-Go

* webhook instable ;
* secret exposé ;
* état publié supprimé sur erreur ;
* boucle de déclenchement.

## Rollback

Désactiver le trigger et le workflow, puis revenir au mode manuel.

---

# P15 — Observabilité post-déploiement

## Objectif

Surveiller la migration après publication complète.

## Durée

Fenêtre minimale recommandée :

* surveillance intensive : 48 heures ;
* surveillance quotidienne : 7 jours ;
* revue finale : après 14 jours.

## Indicateurs

* erreurs 404 produit ;
* URLs sitemap non 200 ;
* erreurs console ;
* indexation Search Console ;
* canonicals détectés ;
* Rich Results ;
* temps de chargement ;
* Lighthouse ;
* volume de clics WhatsApp ;
* échec de génération ;
* écart catalogue/page.

## Impact production

**Sans modification fonctionnelle**, mais surveillance active.

## Seuils de rollback

* erreur 404 massive ;
* baisse significative des clics WhatsApp selon seuil P0 ;
* erreurs JavaScript critiques ;
* canonical incorrect sur un lot ;
* sitemap incohérent ;
* pages produit inaccessibles ;
* performance fortement dégradée ;
* boucle de redirection.

## Go

* aucun seuil critique franchi ;
* indexation progresse normalement ;
* conversion stable ;
* aucune régression.

## No-Go

* seuil de rollback atteint ;
* anomalie non comprise ;
* échec récurrent du pipeline.

## Rollback

Revenir au dernier commit stable, restaurer les liens à fragment si nécessaire, conserver les données Supabase.

---

# P16 — Clôture du chantier

## Objectif

Valider formellement que la migration est terminée et documentée.

## Actions

* vérifier C1 à C11 ;
* mettre à jour les documents d'architecture ;
* documenter les compromis réellement observés ;
* enregistrer les dettes techniques acceptées ;
* clôturer les alertes ;
* produire le rapport final ;
* taguer ou référencer le commit stable.

## Impact production

**Sans impact production**

## Critères de réussite mesurables

### C1

100 % des produits actifs disposent d'une vraie URL.

### C2

100 % des canonicals sont corrects et uniques.

### C3

0 lien produit interne en fragment.

### C4

0 erreur JavaScript critique.

### C5

Sitemap complet, sans doublon, URLs en 200.

### C6

JSON-LD syntaxiquement valide sur toutes les pages et sémantiquement validé sur échantillon.

### C7

Performance dans la plage de référence validée.

### C8

Anciens liens `#<slug>` toujours utilisables.

### C9

Aucune régression fonctionnelle.

### C10

Fenêtre de surveillance terminée sans rollback.

### C11

Documentation complète et à jour.

## Go

Tous les critères C1–C11 sont validés.

## No-Go

Un seul critère non validé suffit à empêcher la clôture.

## Rollback

Non applicable à la documentation de clôture. Toute régression détectée rouvre la phase concernée.

---

# Carte des dépendances

```text
P0
└── P1
    └── P2
        └── P3
            └── P4
                └── P5
                    └── P6
                        └── P7
                            └── P8
                                └── P9
                                    ├── P10
                                    └── P11
                                        └── P12
                                            └── P13
                                                └── P14
                                                    └── P15
                                                        └── P16
```

Certaines préparations documentaires peuvent être réalisées en parallèle à l'intérieur d'une phase, mais aucune phase suivante ne doit être considérée active avant validation de la précédente.

---

# Classification d'impact production

| Phase | Impact       |
| ----- | ------------ |
| P0    | Sans impact  |
| P1    | Sans impact  |
| P2    | Sans impact  |
| P3    | Faible       |
| P4    | Sans impact  |
| P5    | Sans impact  |
| P6    | Sans impact  |
| P7    | Sans impact  |
| P8    | Faible       |
| P9    | Moyen        |
| P10   | Faible       |
| P11   | Élevé        |
| P12   | Moyen        |
| P13   | Moyen        |
| P14   | Moyen        |
| P15   | Surveillance |
| P16   | Sans impact  |

---

# Règle finale

Aucune phase ne doit être fusionnée avec la suivante pour gagner du temps.

Toute déviation par rapport à ce plan doit être :

1. identifiée ;
2. justifiée ;
3. évaluée architecturalement ;
4. documentée ;
5. validée avant exécution.
