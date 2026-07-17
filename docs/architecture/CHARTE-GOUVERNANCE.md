# CHARTE-GOUVERNANCE — Gouvernance architecturale Dar Nūr

**Identifiant** : `CHARTE-GOV-001`
**Version** : `1.0`
**Statut** : `Validé`
**Date de création** : `2026-07-16`
**Dernière révision** : `2026-07-16`

**Historique**

* `v1.0 — 2026-07-16` — Version initiale validée.

## Objet

Cette charte définit les règles de gouvernance applicables à l'architecture Dar Nūr.

Elle s'applique :

* au chantier de migration des URLs produit ;
* à toute évolution future jugée Majeure ou Structurante ;
* aux générateurs ;
* aux sources de données ;
* aux règles métier ;
* aux artefacts HTML produits ;
* aux pipelines de déploiement ;
* aux documents d'architecture ;
* aux garde-fous et contrôles de qualité.

Son objectif est d'empêcher :

* la duplication progressive des règles ;
* la multiplication des sources de vérité ;
* les modifications silencieuses de comportement ;
* l'accumulation de dette technique non documentée ;
* les changements architecturaux introduits dans de simples commits de fonctionnalité ;
* les régressions acceptées au nom de la rapidité.

## Règles non négociables N1–N11

## N1 — Une seule source de vérité par responsabilité

Chaque type d'information doit avoir un propriétaire unique.

Pour les fiches produit :

* Supabase est la source de vérité des données ;
* le module partagé est la source de vérité des règles métier ;
* le générateur et ses gabarits sont la source de vérité du HTML statique produit.

Une donnée ou une règle ne doit jamais être maintenue manuellement dans plusieurs emplacements.

**Interdit**

* recopier des prix dans des fichiers HTML générés ;
* maintenir deux listes de catégories indépendantes ;
* calculer les canonicals dans deux modules distincts ;
* conserver des règles métier équivalentes dans `index.html` et dans le générateur.

**Exigence**
Toute nouvelle information doit être rattachée explicitement à une source de vérité avant implémentation.

## N2 — Aucune logique métier dupliquée

Une règle métier ne doit exister qu'une seule fois dans le code.

Les règles suivantes doivent être centralisées :

* catégories ;
* contenu conditionnel ;
* formats de prix ;
* textes par défaut ;
* métadonnées ;
* produits apparentés ;
* canonicals ;
* JSON-LD ;
* règles d'affichage par type de produit.

**Dérogation**
Une duplication ciblée n'est acceptable que si :

1. le partage est techniquement impossible pour une raison démontrée ;
2. l'impossibilité est documentée ;
3. la duplication est limitée au strict minimum ;
4. les deux implémentations possèdent des tests de cohérence ;
5. une dette technique explicite est créée ;
6. le décideur valide la dérogation.

Une duplication introduite uniquement « pour aller plus vite » est interdite.

## N3 — Aucun contenu produit généré ne doit être édité à la main

Les pages produit statiques sont des artefacts de build.

Elles doivent être :

* générées ;
* reproductibles ;
* remplaçables ;
* supprimables puis recréables à l'identique depuis les sources.

**Interdit**

* corriger directement un fichier `{slug}/index.html` ;
* modifier manuellement un canonical dans une page générée ;
* ajouter un produit statique sans passer par Supabase et le générateur ;
* conserver une correction locale non répercutée dans le gabarit ou les règles métier.

Toute correction doit être appliquée à la source appropriée, puis régénérée.

## N4 — Génération déterministe et reproductible

À données, règles et gabarits identiques, le générateur doit produire la même sortie.

Le build ne doit pas dépendre :

* de l'ordre aléatoire des données ;
* de l'heure locale non maîtrisée ;
* d'une variable implicite ;
* d'un état non versionné ;
* d'un comportement environnemental non documenté.

Les sorties doivent être stables afin de :

* éviter les diffs inutiles ;
* faciliter les revues ;
* permettre le rollback ;
* garantir la reproductibilité.

## N5 — Séparation stricte données / règles / rendu / déploiement

Les responsabilités doivent rester séparées.

**Données**
Supabase et les éventuelles sources éditoriales validées.

**Règles**
Fonctions pures, testables, indépendantes du DOM et de Node lorsque le partage l'exige.

**Rendu**
Gabarits et générateur.

**Déploiement**
GitHub Actions et GitHub Pages.

Une couche ne doit pas absorber silencieusement la responsabilité d'une autre.

Exemples interdits :

* un gabarit contenant une logique métier complexe ;
* un workflow GitHub Actions corrigeant les données ;
* `admin.html` générant lui-même le HTML final ;
* le navigateur décidant seul du canonical d'une page statique.

## N6 — Les URLs publiées sont des contrats durables

Une URL produit publique ne doit quasiment jamais changer.

Le slug publié est quasi immuable.

Tout changement doit être traité comme une migration d'URL, avec :

* historique ;
* redirection ou mécanisme de compatibilité ;
* canonical cohérent ;
* contrôle des liens internes ;
* documentation ;
* validation explicite.

**Interdit**

* modifier un slug publié sans traitement de l'ancienne URL ;
* supprimer silencieusement une page indexée ;
* réutiliser l'ancien slug pour un autre produit ;
* casser un lien partagé sans mécanisme de continuité.

## N7 — Aucun échec silencieux

Toute anomalie significative doit :

* être détectée ;
* être classée ;
* produire un message explicite ;
* bloquer ou alerter selon sa gravité ;
* préserver l'état publié précédent si nécessaire.

Les garde-fous sont répartis en trois classes :

* Classe A : erreur systémique, abandon total du run ;
* Classe B : erreur locale à un produit, exclusion contrôlée du produit ;
* Classe C : incohérence globale du catalogue, blocage ou alerte selon la règle définie.

**Interdit**

* publier un catalogue tronqué sans alerte ;
* ignorer une erreur réseau ;
* convertir une erreur en valeur vide ;
* supprimer des pages valides après un échec de génération ;
* considérer un run comme réussi alors que des contrôles bloquants ont échoué.

## N8 — Toute modification doit être testable et réversible

Une modification ne doit pas être déployée si :

* elle ne possède pas de critères de validation ;
* elle ne possède pas de tests fonctionnels ;
* elle ne possède pas de tests de non-régression ;
* son rollback n'est pas compris ;
* ses effets irréversibles ne sont pas identifiés.

Le rollback doit être prévu avant l'implémentation, pas après un incident.

## N9 — Les migrations doivent préserver la compatibilité

Lorsqu'un comportement public est remplacé, une stratégie de compatibilité doit être définie.

Pour les URLs produit :

* les anciennes URLs `#<slug>` restent utilisables ;
* les nouveaux liens internes utilisent les vraies URLs ;
* aucune ancienne URL connue ne doit être supprimée sans traitement ;
* les redirections ou pages de compatibilité doivent être conservées aussi longtemps que nécessaire.

La suppression d'une compatibilité historique est une décision architecturale, pas une simple opération de nettoyage.

## N10 — Aucune nouvelle dépendance sans justification forte

Le projet reste volontairement léger.

Toute nouvelle dépendance doit répondre à un besoin structurel que l'existant ne peut pas couvrir proprement.

Avant ajout, évaluer :

* utilité réelle ;
* surface fonctionnelle utilisée ;
* maintenance ;
* sécurité ;
* dépendances transitives ;
* stabilité ;
* poids ;
* impact build ;
* impact navigateur ;
* alternatives internes ;
* stratégie de retrait.

**Interdit**

* ajouter un framework pour une seule fonction ;
* ajouter une dépendance par préférence personnelle ;
* introduire un package non maintenu ;
* ajouter un outil sans documenter son rôle ;
* accepter une chaîne de dépendances disproportionnée au besoin.

Une dépendance Structurante impose une ADR.

## N11 — Toute décision architecturale doit être documentée et versionnée

Les décisions structurantes ne doivent pas rester dans une conversation, un souvenir ou un commit isolé.

Elles doivent être documentées dans :

* une ADR ;
* le plan d'exécution ;
* la charte ;
* la checklist ;
* ou `docs/ARCHITECTURE_DAR_NUR.md`, selon leur nature.

Les documents d'architecture sont versionnés.

Toute modification doit ajouter une entrée d'historique.

L'historique existant ne doit jamais être réécrit ou effacé.

## Classification officielle des modifications

### Modification Mineure

**Définition**
Modification locale qui ne change aucun principe architectural.

**Exemples**

* correction typographique ;
* ajustement CSS local ;
* correction d'un texte ;
* ajout d'un test ;
* amélioration d'un message d'erreur ;
* correction d'un bug sans changement de responsabilité.

**Validation requise**

* revue standard ;
* tests ciblés ;
* tests de non-régression proportionnés ;
* aucun ADR nécessaire.

**Documentation**
Une entrée dans le journal du projet peut suffire si la modification mérite une trace.

### Modification Majeure

**Définition**
Modification fonctionnelle significative qui affecte une couche de l'architecture sans remettre en cause les principes N1–N11.

**Exemples**

* ajout d'un nouveau gabarit généré ;
* ajout d'une nouvelle catégorie ;
* ajout d'un nouveau garde-fou ;
* modification importante du module de règles métier ;
* évolution du pipeline sans changement de paradigme ;
* ajout d'un nouveau type de contenu dans le générateur existant.

**Validation requise**

* Architecture Review Checklist remplie ;
* analyse d'impact ;
* tests fonctionnels complets ;
* tests de non-régression étendus ;
* rollback documenté ;
* revue explicite avant déploiement.

**Documentation**

* mise à jour de `docs/ARCHITECTURE_DAR_NUR.md` ;
* mise à jour des documents concernés ;
* ADR si la modification introduit une exception durable ou un choix non évident.

### Modification Structurante

**Définition**
Modification qui remet en cause une règle N1–N11, modifie plusieurs couches ou change un paradigme technique.

**Exemples**

* introduction d'un framework SSG ;
* changement d'hébergement ;
* introduction d'un backend applicatif ;
* nouvelle source de vérité ;
* changement du format canonique des URLs ;
* suppression de la compatibilité avec les anciennes ancres ;
* remplacement de Supabase ;
* introduction d'un moteur de recherche externe ;
* ajout d'une logique personnalisée par utilisateur ;
* abandon du générateur maison ;
* modification des classes de garde-fous.

**Validation requise**

* arrêt de l'implémentation ;
* audit architectural ;
* options comparées ;
* ADR complète ;
* validation du décideur ;
* plan de migration ;
* plan de rollback ;
* plan de tests et d'observabilité.

Aucun développement ne doit commencer avant validation de l'ADR.

## Procédure de dérogation

Une dérogation à une règle non négociable est exceptionnelle.

Elle doit contenir :

1. la règle concernée ;
2. le besoin concret ;
3. les alternatives étudiées ;
4. la raison pour laquelle elles sont insuffisantes ;
5. le périmètre exact de l'exception ;
6. les risques ;
7. les garde-fous ;
8. la durée de validité ;
9. la condition de suppression ;
10. le décideur ayant validé.

Une dérogation permanente à N1, N2, N6, N7, N9 ou N11 doit faire l'objet d'une ADR.

Une dérogation non documentée est considérée comme invalide.

## Seuil imposant une nouvelle ADR

Une nouvelle ADR est obligatoire lorsqu'au moins une des situations suivantes se produit :

* une règle N1–N11 est modifiée ;
* une règle N1–N11 nécessite une dérogation durable ;
* une nouvelle source de vérité est introduite ;
* plusieurs couches sont modifiées simultanément de manière non triviale ;
* une nouvelle dépendance structurante est ajoutée ;
* le format d'URL public change ;
* le mécanisme de génération change de paradigme ;
* l'hébergement change ;
* une logique serveur est introduite ;
* une compatibilité historique est supprimée ;
* une dette technique structurante est volontairement acceptée ;
* une décision existante de l'ADR-001 est remise en cause.

## Dette technique

### Dette technique acceptée volontairement

Une dette est acceptable uniquement si :

* elle est connue avant l'implémentation ;
* elle résulte d'un compromis explicite ;
* elle est documentée ;
* son impact est limité ;
* son remboursement possède une condition déclenchante ;
* elle ne viole pas une règle interdite.

**Format obligatoire**

```text
Identifiant :
Description :
Pourquoi elle est acceptée :
Impact :
Périmètre :
Condition de remboursement :
Événement déclencheur :
Responsable :
Date de revue :
```

### Dettes actuellement acceptées pour ADR-001

**DT-001 — Régénération complète initiale**

Pourquoi acceptée
Le catalogue actuel reste compatible avec un rebuild complet et le pattern existe déjà pour les parfums.

Condition de remboursement
Lorsque le temps de génération ou la file d'attente devient incompatible avec les besoins métier.

Événement déclencheur

* dérive durable du temps de build ;
* accumulation des runs ;
* hausse importante de la fréquence d'édition ;
* passage à un volume de catalogue significativement supérieur.

**DT-002 — Navigation avec rechargement au premier palier**

Pourquoi acceptée
Elle réduit la complexité initiale et évite de maintenir deux chemins de navigation avant stabilisation.

Condition de remboursement
Si les mesures ou retours utilisateurs montrent une dégradation réelle de l'expérience.

Événement déclencheur

* baisse mesurable de conversion ;
* frustration UX constatée ;
* besoin explicite de navigation hybride.

**DT-003 — Absence de redirection HTTP 301 native**

Pourquoi acceptée
GitHub Pages ne fournit pas de moteur de réécriture serveur.

Condition de remboursement
Si l'hébergement évolue ou si un mécanisme fiable de redirection HTTP devient disponible.

Événement déclencheur

* changement d'hébergement ;
* mise en place d'un CDN ou edge layer ;
* besoin SEO critique sur des changements de slug.

**DT-004 — Tests navigateur partiellement manuels**

Pourquoi acceptée
Le projet ne possède pas encore d'infrastructure E2E et l'ajout immédiat d'une dépendance lourde doit être justifié.

Condition de remboursement
Lorsque le volume des scénarios ou la fréquence des régressions rend les tests manuels insuffisants.

Événement déclencheur

* régressions répétées ;
* nombre de pages ou scénarios trop élevé ;
* introduction de navigation hybride ;
* besoin de validation automatique des redirections.

### Dette technique interdite

Les éléments suivants ne peuvent pas être acceptés comme dette temporaire :

* duplication non documentée d'une règle métier ;
* modification manuelle d'un artefact généré ;
* perte silencieuse d'une URL publiée ;
* publication malgré un garde-fou bloquant ;
* secret committé dans le dépôt ;
* canonical incorrect accepté temporairement ;
* catalogue tronqué sans détection ;
* page active sans source de données valide ;
* régression fonctionnelle connue déployée ;
* suppression d'un test bloquant pour faire passer le pipeline ;
* dépendance ajoutée sans évaluation ;
* décision architecturale non documentée ;
* absence de rollback sur une phase à impact production ;
* modification simultanée de plusieurs phases pour gagner du temps.

Une dette interdite doit être corrigée avant déploiement.

## Évaluation d'impact architectural d'une nouvelle fonctionnalité

Avant toute évolution Majeure ou Structurante, vérifier :

1. quelle source de vérité est concernée ;
2. quelle couche est modifiée ;
3. si une logique existante est dupliquée ;
4. si un slug ou une URL publique change ;
5. si un garde-fou devient obsolète ;
6. si une dépendance est ajoutée ;
7. si la génération reste déterministe ;
8. si le rollback reste possible ;
9. si les tests actuels couvrent le nouveau périmètre ;
10. si une dette est créée ;
11. si une ADR est obligatoire.

Cette évaluation est formalisée dans `CHECKLIST-ARCHITECTURE-REVIEW.md`.

## Gouvernance des garde-fous

Les garde-fous G1–G17 font partie de l'architecture officielle.

Toute modification doit :

* conserver leur identifiant ;
* conserver leur classe sauf décision documentée ;
* préserver le principe d'absence d'échec silencieux ;
* documenter tout changement de sévérité ;
* ajouter un nouveau garde-fou avec un identifiant stable ;
* éviter la réutilisation d'un identifiant existant pour une autre notion.

Les sections A–H de la checklist d'Architecture Review ne doivent pas utiliser les identifiants G1–G17.

## Gouvernance documentaire

Les documents suivants sont officiels :

```text
ADR-001
PLAN-P0-P16
CHARTE-GOV-001
CHECKLIST-AR-001
```

Chaque document doit contenir :

* identifiant ;
* version ;
* statut ;
* date de création ;
* dernière révision ;
* historique.

**Version majeure**
Modification Structurante du document ou de ses principes.

Exemple :

```text
1.0 → 2.0
```

**Version mineure**
Ajout ou clarification Majeure sans remise en cause du principe principal.

Exemple :

```text
1.0 → 1.1
```

**Correction Mineure**
Correction typographique ou clarification sans changement de sens.

Le numéro peut rester identique, mais la date de révision et l'historique doivent être mis à jour.

## Autorité de validation

Le décideur final est Youcef, propriétaire de Dar Nūr.

Claude Code peut :

* analyser ;
* proposer ;
* implémenter après validation ;
* signaler les incohérences ;
* refuser une instruction techniquement dangereuse en l'expliquant.

Claude Code ne peut pas :

* modifier un principe validé sans autorisation ;
* fusionner des phases ;
* considérer une dette interdite comme acceptable ;
* contourner un garde-fou bloquant ;
* valider seul une ADR structurante ;
* déployer une régression connue.

## Règle de clôture

Une évolution n'est terminée que lorsque :

* ses critères Go sont validés ;
* ses tests fonctionnels passent ;
* ses tests de non-régression passent ;
* ses garde-fous passent ;
* sa documentation est à jour ;
* ses dettes acceptées sont enregistrées ;
* son rollback est connu ;
* son impact post-déploiement a été surveillé selon le plan applicable.

La vitesse d'exécution ne justifie jamais de contourner cette charte.
