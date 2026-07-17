# ADR-001 — Migration des fiches produit vers des URLs statiques indexables

**Identifiant** : `ADR-001`
**Version** : `1.0`
**Statut** : `Validé`
**Date de création** : `2026-07-16`
**Dernière révision** : `2026-07-16`

**Historique**

* `v1.0 — 2026-07-16` — Version initiale validée.

## Contexte

Dar Nūr est un site e-commerce statique en HTML/CSS/JavaScript vanilla, hébergé sur GitHub Pages, avec Supabase comme source de données.

Les pages catégories disposent déjà de vraies URLs HTTP. Les fiches produit, en revanche, sont actuellement rendues dans `index.html` par JavaScript via `showProduct()` et adressées avec des fragments :

```text
https://dar-nur.fr/#miel-du-yemen
```

Le fragment n'est jamais transmis au serveur. Toutes les fiches produit reposent donc techniquement sur la même ressource HTTP : la page d'accueil.

Les métadonnées produit (`title`, description, canonical, Open Graph et JSON-LD) sont actuellement injectées au runtime par JavaScript via `updatePageMetadata()`.

## Problème initial

L'architecture actuelle présente plusieurs limites SEO et techniques :

* aucune URL HTTP distincte par fiche produit ;
* aucune fiche produit présente comme ressource autonome dans `sitemap.xml` ;
* canonical actuel fondé sur une URL à fragment ;
* contenu produit absent du HTML initial ;
* métadonnées dépendantes de l'exécution JavaScript ;
* prévisualisations sociales non garanties pour les robots qui n'exécutent pas JavaScript ;
* accès direct, partage et indexation dépendants du comportement de la SPA.

L'objectif est d'obtenir de vraies URLs produit de la forme :

```text
https://dar-nur.fr/{slug}/
```

Exemples :

```text
https://dar-nur.fr/miel-du-yemen/
https://dar-nur.fr/huile-de-nigelle-premium/
```

Les formats suivants ne sont pas retenus :

```text
/produit/{slug}/
/{categorie}/{slug}/
```

## Contraintes techniques

* Hébergement conservé sur GitHub Pages.
* Aucune exécution serveur.
* Aucune règle de réécriture serveur configurable.
* Architecture actuelle sans framework ni système de build général.
* Le projet possède déjà un précédent de génération statique avec :

```text
scripts/generate-parfums.mjs
```

* Le slug produit est déjà stocké dans Supabase et porte une contrainte d'unicité.
* Les pages doivent fonctionner en accès direct, après rafraîchissement et sans dépendre de JavaScript pour afficher le contenu essentiel.
* Le projet reste sans cron : la génération doit être déclenchée par événement ou manuellement.
* Aucun framework SSG n'est introduit dans ce premier chantier.
* Les anciennes URLs à fragment doivent rester utilisables.
* Les règles métier ne doivent pas être dupliquées entre la SPA et le générateur.
* Les performances, le SEO, le responsive et l'identité premium de Dar Nūr doivent être préservés.

## Notions distinguées

**Vraie URL produit**
Résout le problème d'adressage. Chaque fiche devient une ressource HTTP distincte, partageable et indexable.

**HTML pré-rendu**
Résout le problème de rendu. Le contenu, les métadonnées et les données structurées sont présents sans exécution JavaScript.

**Génération statique**
Est le moyen technique retenu pour obtenir simultanément de vraies URLs et du HTML pré-rendu tout en conservant GitHub Pages.

La génération statique n'est donc pas une obligation SEO universelle. Elle découle des contraintes spécifiques du projet.

## Options étudiées

### Option A — SPA avec History API et fallback `404.html`

Le site conserverait un rendu intégralement côté client. Les clics seraient interceptés avec `history.pushState()` et les accès directs passeraient par un `404.html` réorientant vers la SPA.

**Avantages**

* faible changement conceptuel ;
* navigation interne sans rechargement ;
* conservation du modèle SPA.

**Inconvénients**

* contenu produit toujours absent du HTML initial ;
* dépendance complète à JavaScript ;
* robots sociaux et outils sans rendu JavaScript non couverts ;
* gestion du fallback GitHub Pages fragile ;
* risque de réponse HTTP 404 sur les accès directs ;
* ne résout pas pleinement le problème SEO.

**Décision**
Option rejetée.

### Option B — Génération statique d'un fichier HTML par produit

Chaque produit actif génère :

```text
{slug}/index.html
```

La page contient directement :

* le contenu produit ;
* le `<title>` ;
* la meta description ;
* le canonical ;
* les Open Graph ;
* le JSON-LD ;
* le `<h1>` ;
* les liens internes.

**Avantages**

* vraie URL HTTP ;
* contenu disponible au premier octet ;
* fonctionnement natif sur GitHub Pages ;
* compatibilité avec les robots sans JavaScript ;
* robustesse en cas d'échec Supabase ou JavaScript côté visiteur ;
* modèle déjà partiellement éprouvé avec le générateur parfums ;
* aucune dépendance lourde obligatoire.

**Inconvénients**

* nouveau pipeline à maintenir ;
* risque de désynchronisation entre Supabase et les fichiers générés ;
* génération complète potentiellement coûteuse à grande échelle ;
* perte initiale possible de navigation sans rechargement ;
* nécessité de formaliser les garde-fous et la validation.

**Décision**
Option retenue.

### Option C — Architecture hybride

Les pages HTML statiques existent réellement, mais les clics internes peuvent être interceptés par JavaScript pour conserver une navigation fluide sans rechargement.

**Avantages**

* SEO et robustesse de l'option B ;
* fluidité de navigation proche de la SPA actuelle.

**Inconvénients**

* complexité plus élevée ;
* coexistence de deux chemins de rendu ;
* risque accru de divergence ;
* tests plus lourds.

**Décision**
Option différée. Elle pourra être évaluée après stabilisation de l'option B en production.

### Option D — Framework SSG externe

Solutions étudiées :

* Astro ;
* Eleventy ;
* Next.js avec export statique ;
* Vite SSG ;
* autre moteur SSG comparable.

**Avantages**

* écosystème mature ;
* templating structuré ;
* fonctionnalités de build éprouvées ;
* meilleure extensibilité pour un projet plus large.

**Inconvénients**

* migration importante d'un projet actuellement sans dépendance ;
* ajout d'une chaîne npm et de dépendances transitives ;
* surface de maintenance et de supply chain plus grande ;
* aucun gain SEO intrinsèque par rapport à un HTML statique correctement généré ;
* coût disproportionné pour le périmètre immédiat.

**Décision**
Option différée. Elle devra être réévaluée si des critères objectifs de volume, d'équipe ou de complexité sont atteints.

## Décision retenue

Dar Nūr adopte une génération statique d'une page HTML réelle par produit actif.

Format de sortie :

```text
{slug}/index.html
```

URL canonique :

```text
https://dar-nur.fr/{slug}/
```

Le générateur sera écrit en Node.js, sans dépendance lourde, en s'inspirant du modèle existant de `scripts/generate-parfums.mjs`.

## Architecture des responsabilités

**Source de vérité des données**
Supabase.

Supabase reste responsable des données produit :

* nom ;
* slug ;
* catégorie ;
* description ;
* prix ;
* images ;
* statut actif ;
* variantes ;
* autres attributs métier.

**Source de vérité des règles métier**
Un module partagé de fonctions pures.

Ce module doit :

* ne dépendre ni du DOM ni d'API Node spécifiques ;
* produire les données dérivées nécessaires au rendu ;
* centraliser les règles de catégorie ;
* centraliser les textes par défaut ;
* centraliser les formats de prix ;
* centraliser les métadonnées ;
* centraliser les canonicals ;
* centraliser les produits apparentés ;
* être consommé à la fois par la SPA et le générateur.

Aucune règle métier ne doit être recopiée indépendamment dans `index.html` et dans le générateur.

**Source de vérité du rendu HTML statique**
Le générateur et ses gabarits.

Les fichiers produit générés sont des artefacts de build et ne doivent jamais être édités à la main.

## Compatibilité avec les anciennes URLs

Le mécanisme d'ancres existant est conservé comme couche de compatibilité.

Une URL telle que :

```text
https://dar-nur.fr/#miel-du-yemen
```

doit rediriger côté navigateur vers :

```text
https://dar-nur.fr/miel-du-yemen/
```

La redirection utilise :

```text
location.replace()
```

et non `location.href`, afin de ne pas conserver l'ancienne URL comme entrée supplémentaire dans l'historique du navigateur.

Ce mécanisme couvre :

* anciens liens WhatsApp ;
* anciens favoris ;
* liens externes ;
* URLs partagées avant la migration.

Il ne constitue pas une redirection HTTP 301, impossible nativement sur GitHub Pages, mais garantit la continuité fonctionnelle pour les utilisateurs exécutant JavaScript.

Le mécanisme de compatibilité ne doit pas être supprimé ultérieurement sans nouvelle décision d'architecture.

## Gouvernance des slugs

Le slug publié devient quasi immuable.

Après publication :

* il ne doit pas être modifié librement dans `admin.html` ;
* une modification doit être traitée comme un changement d'URL ;
* une ancienne URL ne doit jamais disparaître silencieusement ;
* tout changement doit passer par un mécanisme de redirection documenté.

La contrainte d'unicité en base reste une première protection, mais ne remplace pas la politique d'immuabilité.

## Canonical

Chaque page générée contient un canonical statique :

```html
<link rel="canonical" href="https://dar-nur.fr/{slug}/">
```

Le canonical est calculé au moment de la génération.

Il doit correspondre strictement au chemin de sortie du fichier.

Toute divergence entre :

```text
{slug}/index.html
```

et :

```text
https://dar-nur.fr/{slug}/
```

est une erreur bloquante ou une exclusion contrôlée selon la classe de garde-fou applicable.

L'unicité des canonicals doit être contrôlée automatiquement sur l'ensemble du catalogue.

## Sitemap

Le générateur met à jour un bloc auto-délimité dans `sitemap.xml`.

Le sitemap doit contenir :

* une URL par produit actif ;
* aucune URL pour un produit inactif ;
* aucun doublon ;
* aucune URL ne pointant vers une page inexistante.

La génération du sitemap et celle des pages produit font partie du même pipeline afin de réduire les risques de désynchronisation.

## GitHub Pages et Jekyll

Un fichier `.nojekyll` doit être ajouté explicitement.

Objectifs :

* désactiver le traitement implicite de Jekyll ;
* empêcher l'exclusion automatique de fichiers ou dossiers préfixés par `_` ;
* rendre le comportement de publication explicite et reproductible ;
* éviter de dépendre d'un comportement implicite de la plateforme.

## Déclenchement de la génération

La génération reste événementielle.

Le pipeline peut être déclenché :

* par modification d'un produit dans Supabase via un mécanisme de dispatch ;
* manuellement via GitHub Actions ;
* lors d'un changement global de gabarit ou de règles métier.

Aucun cron n'est introduit.

Le premier palier peut utiliser une régénération complète du catalogue, tant que les seuils opérationnels restent acceptables.

La génération incrémentale est différée, mais devra être réévaluée si :

* le temps de build dérive ;
* la file d'attente GitHub Actions s'allonge ;
* le catalogue ou la fréquence d'édition augmente fortement.

## Conséquences positives

* chaque produit devient une ressource HTTP autonome ;
* indexation Google rendue possible ;
* canonical corrigé ;
* intégration dans le sitemap ;
* métadonnées disponibles sans JavaScript ;
* Open Graph lisibles par les robots sociaux ;
* JSON-LD présent dans le HTML initial ;
* meilleure résilience en cas d'indisponibilité Supabase ;
* meilleure compatibilité avec les outils SEO ;
* partage d'URL fiable ;
* accès direct et rafraîchissement fonctionnels ;
* continuité avec les anciens liens à fragment.

## Compromis acceptés

* pipeline de génération supplémentaire à maintenir ;
* absence initiale de navigation sans rechargement entre fiches ;
* régénération complète du catalogue au premier palier ;
* absence de vraie redirection HTTP 301 sur GitHub Pages ;
* redirections statiques ou client-side nécessaires en cas de changement de slug ;
* dépendance opérationnelle à GitHub Actions pour la publication des mises à jour ;
* nécessité de surveiller la synchronisation entre Supabase et les fichiers générés.

## Risques connus

**Désynchronisation Supabase / pages générées**
Un produit peut être modifié en base sans que la page publiée soit régénérée si le déclenchement échoue.

Mitigations :

* génération déclenchée par événement ;
* exécution manuelle de secours ;
* contrôles de cohérence catalogue ;
* résumé GitHub Actions ;
* vérifications post-déploiement.

**Troncature silencieuse PostgREST**
Une limite `db-max-rows` peut tronquer la réponse sans erreur visible.

Mitigations :

* vérifier la configuration Supabase en P0 ;
* paginer les requêtes si nécessaire ;
* comparer l'ensemble des slugs attendus avec l'ensemble généré.

**Blocage global du catalogue**
Un produit invalide pourrait bloquer tout le build.

Mitigation retenue :

* distinguer les garde-fous systémiques, par produit et de cohérence globale ;
* permettre l'exclusion contrôlée d'un produit invalide lorsque l'erreur est locale ;
* abandonner totalement le run uniquement pour les erreurs systémiques ou incohérences globales.

**Pages orphelines**
Un produit retiré ou renommé peut laisser un ancien fichier sur disque.

Mitigations :

* historique des slugs ;
* détection automatique des fichiers orphelins ;
* politique explicite de suppression, indisponibilité ou redirection.

**Perte de fluidité**
Le passage initial à des liens HTML classiques entraîne un rechargement complet.

Mitigation :

* accepter ce compromis au premier palier ;
* mesurer l'impact réel ;
* réévaluer l'option hybride ultérieurement.

**Dépendance au pipeline**
Une panne du webhook, du token ou de GitHub Actions peut retarder la publication.

Mitigations :

* déclenchement manuel ;
* journalisation ;
* observabilité ;
* absence de suppression de l'état publié précédent en cas d'échec.

## Rollback

La migration doit rester réversible au niveau du code.

En cas de problème majeur :

1. revenir au commit précédent ;
2. restaurer les anciens liens à fragment ;
3. rétablir le comportement actuel de `index.html` ;
4. republier la branche stable ;
5. conserver les données Supabase inchangées.

Les données produit ne sont pas migrées ni transformées de manière irréversible.

Les fichiers générés peuvent être supprimés ou ignorés au rollback.

Les mécanismes réellement irréversibles sont limités aux URLs déjà partagées ou indexées après publication. C'est pourquoi les pages de compatibilité et l'historique des slugs doivent être conservés.

## Conditions de remise en question

Cette décision doit être réévaluée si l'un des événements suivants se produit :

* plusieurs milliers de produits rendent le pipeline complet trop lent ;
* la file d'attente GitHub Actions croît durablement ;
* le délai édition → publication devient incompatible avec les besoins métier ;
* le générateur maison devient difficile à maintenir ;
* le projet passe à plusieurs langues avec workflow éditorial complexe ;
* un blog ou CMS éditorial impose une chaîne de contenu plus sophistiquée ;
* une recherche avancée nécessite un moteur externe ;
* des comptes clients, un panier serveur ou une personnalisation imposent une logique backend ;
* l'équipe s'agrandit et justifie un framework SSG standardisé ;
* le module partagé ne peut plus rester composé de fonctions pures sans contorsion excessive.

Ces signaux peuvent conduire :

* d'abord à une génération incrémentale ;
* ensuite à l'introduction d'un SSG ;
* ou, pour les besoins dynamiques par utilisateur, à un changement d'hébergement et d'architecture serveur.

## Portée de la décision

Cette ADR couvre :

* les fiches produit ;
* leurs URLs ;
* leur génération ;
* leurs métadonnées ;
* leur intégration au sitemap ;
* la compatibilité avec les anciennes ancres.

Elle ne couvre pas directement :

* une refonte générale du site ;
* un changement d'hébergement ;
* l'introduction d'un checkout ;
* les comptes clients ;
* une refonte du catalogue ;
* une migration vers un framework.

Toute évolution remettant en cause cette décision doit faire l'objet d'une nouvelle ADR.

## Décision finale

L'option B est validée :
Générer une page HTML statique réelle par produit actif à l'URL `https://dar-nur.fr/{slug}/`, depuis Supabase, via un générateur Node sans dépendance lourde, avec règles métier partagées, métadonnées statiques, sitemap automatique et compatibilité durable avec les anciennes URLs à fragment.

Aucune implémentation ne doit commencer avant validation du plan P0–P16 et des documents de gouvernance associés.
