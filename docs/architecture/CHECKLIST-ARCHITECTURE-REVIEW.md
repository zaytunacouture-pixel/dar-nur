# CHECKLIST-ARCHITECTURE-REVIEW — Revue architecturale Dar Nūr

**Identifiant** : `CHECKLIST-AR-001`
**Version** : `1.1`
**Statut** : `Validé`
**Date de création** : `2026-07-16`
**Dernière révision** : `2026-07-17`

**Historique**

* `v1.0 — 2026-07-16` — Version initiale validée.
* `v1.1 — 2026-07-17` — Seuil du garde-fou G6 précisé (décision opérationnelle P0 : baisse > 5 % et perte ≥ 5 produits, référence 230 produits actifs).

---

## Objet

Cette checklist constitue le point d'entrée obligatoire de toute évolution Dar Nūr classée au moins **Majeure**.

Elle doit être remplie avant implémentation afin de vérifier :

* la conformité aux règles N1–N11 ;
* l'absence de duplication ;
* l'impact sur les sources de vérité ;
* l'impact sur les URLs ;
* l'impact sur les garde-fous ;
* la création éventuelle de dette technique ;
* la suffisance des tests et critères Go/No-Go ;
* la nécessité éventuelle d'une nouvelle ADR.

Elle doit être utilisée comme document de travail concret, pas comme simple référence passive.

---

# Architecture Review Checklist

**Fonctionnalité ou évolution évaluée** : ____________________
**Date** : ____________________
**Évaluateur** : ____________________
**Référence** : ____________________

---

## A — Sources de vérité

Références : N1, N5, N11.

| Question | Oui / Non | Action si Oui |
| --- | --- | --- |
| L'évolution introduit-elle une nouvelle source de vérité pour une donnée déjà gérée ailleurs ? | | Identifier la couche concernée et revoir la conception avant de continuer |
| Une même information sera-t-elle maintenue à plusieurs endroits après cette évolution ? | | Bloquant — redesign requis |
| La responsabilité de la donnée, de la règle ou du rendu est-elle ambiguë ? | | Clarifier le propriétaire unique avant implémentation |
| Une couche absorbe-t-elle une responsabilité appartenant à une autre ? | | Revoir la séparation données / règles / rendu / déploiement |
| Une décision architecturale risque-t-elle de rester uniquement dans le code ou dans une conversation ? | | Documenter et versionner avant développement |

---

## B — Duplication

Références : N2, N3.

| Question | Oui / Non | Action si Oui |
| --- | --- | --- |
| L'évolution duplique-t-elle une logique métier existante ? | | Extraire ou réutiliser la source existante |
| Un même calcul sera-t-il présent dans la SPA et dans le générateur ? | | Bloquant — centraliser dans le module partagé |
| Introduit-elle du HTML produit ou contenu généré édité manuellement ? | | Violation de N3 — corriger avant validation |
| Une correction devra-t-elle être appliquée à plusieurs fichiers pour rester cohérente ? | | Rechercher la source unique appropriée |
| Une dérogation à N2 est-elle envisagée ? | | Produire la dérogation formelle avant implémentation |

---

## C — Dépendances

Référence : N10.

| Question | Oui / Non | Action si Oui |
| --- | --- | --- |
| L'évolution introduit-elle une nouvelle dépendance externe ? | | Appliquer la grille d'évaluation complète |
| Cette dépendance répond-elle à un besoin structurel non couvert par l'existant ? | | Si Non, rejeter l'ajout |
| La dépendance apporte-t-elle des paquets transitifs importants ? | | Évaluer surface supply chain et maintenance |
| Son impact build, navigateur ou déploiement est-il documenté ? | | Documenter avant validation |
| Une stratégie de retrait existe-t-elle ? | | La définir avant adoption |
| Cette dépendance change-t-elle le paradigme technique du projet ? | | Nouvelle ADR obligatoire |

---

## D — Portée architecturale

| Question | Oui / Non | Action si Oui |
| --- | --- | --- |
| L'évolution modifie-t-elle plusieurs couches simultanément ? | | Signal fort vers classification Structurante |
| Affecte-t-elle le module de règles métier partagé ? | | Étendre les tests à toutes les fiches produit |
| Affecte-t-elle le générateur et la SPA en même temps ? | | Vérifier l'absence de divergence |
| Affecte-t-elle le pipeline de déploiement ? | | Revoir rollback et observabilité |
| Modifie-t-elle le comportement au-delà du périmètre annoncé ? | | Élargir l'analyse d'impact |
| Introduit-elle une nouvelle classe de comportement ou un nouveau paradigme ? | | ADR obligatoire |

---

## E — Slugs et URLs

Références : N6, N9.

| Question | Oui / Non | Action si Oui |
| --- | --- | --- |
| L'évolution modifie-t-elle un slug déjà publié ? | | Traiter comme migration d'URL |
| Supprime-t-elle une URL existante ? | | Prévoir redirection, compatibilité ou page d'indisponibilité |
| Réutilise-t-elle un ancien slug ? | | Interdit |
| Modifie-t-elle le format canonique des URLs ? | | Nouvelle ADR obligatoire |
| Supprime-t-elle une compatibilité historique ? | | Décision structurante, ADR obligatoire |
| Le canonical reste-t-il cohérent avec le chemin de sortie réel ? | | Contrôle bloquant requis |
| Le sitemap et les liens internes restent-ils alignés ? | | Ajouter contrôles automatiques |

---

## F — Impact sur les garde-fous

Référence : N7.

| Question | Oui / Non | Action si Oui |
| --- | --- | --- |
| L'évolution modifie-t-elle un garde-fou existant G1–G17 ? | | Documenter identifiant, classe et nouvelle sévérité |
| Supprime-t-elle ou affaiblit-elle un garde-fou bloquant ? | | Rejet par défaut |
| Nécessite-t-elle un nouveau garde-fou ? | | Lui attribuer un identifiant stable et une classe A, B ou C |
| Peut-elle créer un nouvel échec silencieux ? | | Bloquant — ajouter détection et message explicite |
| Change-t-elle la frontière entre skip produit et abandon global ? | | Revue architecturale obligatoire |
| L'état publié précédent reste-t-il préservé en cas d'échec ? | | Si Non, redesign requis |

---

## G — Dette technique

| Question | Oui / Non | Action si Oui |
| --- | --- | --- |
| L'évolution crée-t-elle une dette technique volontaire ? | | Documenter selon le format officiel |
| Cette dette possède-t-elle une condition de remboursement ? | | Si Non, dette interdite |
| Un événement déclencheur est-il défini ? | | Si Non, compléter avant validation |
| La dette figure-t-elle dans la liste des dettes interdites ? | | Rejet automatique |
| La dette modifie-t-elle une règle N1–N11 ? | | ADR ou dérogation formelle obligatoire |
| Le compromis temporaire risque-t-il de devenir permanent par oubli ? | | Ajouter date de revue et responsable |

---

## H — Tests et validation

Référence : N8.

| Question | Oui / Non | Action si Oui / Non |
| --- | --- | --- |
| Les critères Go/No-Go existants couvrent-ils cette évolution ? | | Si Non, les redéfinir avant implémentation |
| Les tests fonctionnels couvrent-ils le nouveau comportement ? | | Si Non, compléter le plan de tests |
| Les tests de non-régression couvrent-ils les comportements inchangés ? | | Si Non, étendre le périmètre |
| Le rollback est-il compris et documenté ? | | Si Non, No-Go |
| Les effets irréversibles sont-ils identifiés ? | | Si Non, No-Go |
| Les contrôles automatisables sont-ils réellement automatisés ? | | Si Non, justifier |
| Les contrôles manuels sont-ils explicitement listés ? | | Si Non, compléter |
| L'observabilité post-déploiement est-elle suffisante ? | | Si Non, définir indicateurs et seuils |
| Une seule phase est-elle active ? | | Si Non, arrêter et resynchroniser le chantier |

---

# Verdict — Classification et routage

## Mineure

Conditions :

* aucune violation N1–N11 ;
* une seule zone locale concernée ;
* aucune nouvelle dépendance ;
* aucune URL publique modifiée ;
* aucune source de vérité modifiée ;
* aucun garde-fou affaibli.

Validation :

* revue standard ;
* tests ciblés ;
* non-régression proportionnée ;
* aucun ADR requis.

---

## Majeure

Conditions :

* évolution fonctionnelle significative ;
* une couche principalement touchée ;
* pas de changement de paradigme ;
* respect de N1–N11 ;
* aucune nouvelle source de vérité.

Validation :

* checklist complète ;
* analyse d'impact ;
* tests fonctionnels complets ;
* tests de non-régression étendus ;
* rollback documenté ;
* mise à jour de la documentation.

---

## Structurante

Conditions possibles :

* modification de plusieurs couches ;
* nouvelle source de vérité ;
* nouvelle dépendance structurante ;
* changement d'hébergement ;
* modification du format d'URL ;
* suppression de compatibilité historique ;
* modification des règles N1–N11 ;
* changement du paradigme de génération ;
* logique serveur introduite ;
* modification substantielle des classes de garde-fous.

Validation :

* arrêt obligatoire ;
* aucune implémentation ;
* audit architectural ;
* options comparées ;
* nouvelle ADR ;
* validation du décideur ;
* plan de migration ;
* rollback ;
* observabilité.

---

**Classification retenue** :
☐ Mineure
☐ Majeure
☐ Structurante

**Décision** :
☐ Validée
☐ À revoir
☐ Rejetée

**Signature / validation** : ____________________
**Date** : ____________________

---

# Critères de réussite du chantier C1–C11

## C1 — Vraies URLs produit

100 % des produits actifs disposent d'une page réelle :

```text
https://dar-nur.fr/{slug}/
```

### Automatique

* présence du fichier attendu ;
* correspondance produit actif ↔ fichier généré ;
* statut HTTP 200 post-déploiement.

### Manuel

* pertinence éditoriale du contenu sur échantillon.

### Sévérité

* pré-publication : bloquant ;
* post-déploiement : alerte avec rollback selon seuil.

---

## C2 — Canonicals corrects

100 % des pages possèdent un canonical :

* présent ;
* unique ;
* sans fragment ;
* strictement égal à l'URL de sortie attendue.

### Automatique

Contrôle total avant écriture.

### Manuel

Aucun contrôle manuel obligatoire hors échantillonnage.

### Sévérité

Bloquant.

---

## C3 — Aucun lien produit interne en fragment

Aucun lien produit interne ne doit conserver :

```text
#<slug>
```

Les ancres éditoriales légitimes restent autorisées via liste blanche.

### Automatique

Recherche regex sur tous les fichiers concernés.

### Manuel

Validation initiale de la liste blanche.

### Sévérité

Bloquant pour P11.

---

## C4 — Aucune erreur JavaScript critique

### Automatique

Possible via navigateur headless, non obligatoire au premier palier.

### Manuel

Console navigateur sur échantillons représentatifs.

### Sévérité

Bloquant pour la phase concernée.

---

## C5 — Sitemap complet

Le sitemap doit :

* contenir tous les produits actifs ;
* ne contenir aucun produit inactif ;
* ne contenir aucun doublon ;
* référencer uniquement des URLs en 200.

### Automatique

* diff slugs actifs / URLs sitemap ;
* détection de doublons ;
* check HTTP post-déploiement.

### Manuel

Aucun contrôle manuel nécessaire hors Search Console.

### Sévérité

Bloquant avant publication.

---

## C6 — JSON-LD valide

### Automatique

* JSON syntaxiquement valide ;
* champs obligatoires présents ;
* type `Product` correct ;
* URL cohérente.

### Manuel

Validation sémantique sur échantillon avec un outil externe.

### Sévérité

* syntaxe : bloquant ;
* validation sémantique : bloquant pour le Go/No-Go des phases pilote et production.

---

## C7 — Performance dans la plage de référence

### Automatique

Possible via Lighthouse CI, non obligatoire au premier palier.

### Manuel

Lighthouse local et production sur échantillons.

### Sévérité

Bloquant si dégradation significative.

---

## C8 — Anciennes URLs à fragment toujours utilisables

### Automatique

Nécessite un navigateur headless pour exercer la redirection JavaScript.

### Manuel

Tests navigateur :

* ancien lien ;
* favori ;
* WhatsApp ;
* lien externe ;
* slug invalide ;
* ancre éditoriale.

### Sévérité

Bloquant pour P12.

---

## C9 — Aucune régression fonctionnelle

Couvre notamment :

* homepage ;
* catégories ;
* filtres ;
* recherche ;
* CTA WhatsApp ;
* navigation ;
* responsive ;
* produits apparentés ;
* console ;
* performances.

### Automatique

Partiellement :

* comptages ;
* cohérence catalogue ;
* liens ;
* fichiers attendus.

### Manuel

Interactions, rendu visuel, responsive et parcours utilisateur.

### Sévérité

Bloquant sans tolérance.

---

## C10 — Surveillance terminée sans rollback

### Automatique

* check HTTP ;
* contrôle sitemap ;
* suivi des runs ;
* détection des échecs.

### Manuel

* Search Console ;
* Rich Results ;
* signal métier WhatsApp ;
* revue de performance.

### Sévérité

Alerte puis rollback selon les seuils P15.

---

## C11 — Documentation à jour

Doivent être à jour :

* ADR ;
* plan ;
* charte ;
* checklist ;
* journal d'architecture ;
* dettes acceptées ;
* compromis observés ;
* rapport final.

### Automatique

Présence des fichiers et métadonnées de version vérifiables.

### Manuel

Relecture éditoriale.

### Sévérité

Bloquant pour la clôture P16.

---

# Garde-fous officiels G1–G17

Les garde-fous sont classés en trois catégories.

---

# Classe A — Garde-fous systémiques

Ils abandonnent le run complet.

Aucun fichier généré ne doit être écrit ou commité si l'un de ces garde-fous échoue.

---

## G1 — Supabase inaccessible

### Vérification

* erreur réseau ;
* erreur HTTP ;
* erreur d'authentification ;
* réponse inexploitable.

### Pourquoi

Ne jamais générer sur une lecture incomplète ou absente.

### Sévérité

Bloquant global.

### Message attendu

```text
Échec de la récupération Supabase : <détail>.
Aucun fichier modifié — la version précédente reste en ligne.
```

---

## G2 — Aucun produit actif retourné

### Vérification

La requête retourne zéro produit actif.

### Pourquoi

Éviter de publier un catalogue vide suite à une erreur de filtre ou une désactivation massive involontaire.

### Sévérité

Bloquant global.

### Message attendu

```text
Aucun produit actif trouvé.
Génération abandonnée afin de ne pas publier un catalogue vide.
```

---

## G3 — Gabarit produit introuvable

### Vérification

Le gabarit produit est absent ou illisible.

### Pourquoi

Aucun rendu fiable n'est possible sans gabarit.

### Sévérité

Bloquant global.

### Message attendu

```text
Impossible de lire le gabarit produit : <détail>.
Génération abandonnée.
```

---

## G4 — Module de règles métier inutilisable

### Vérification

* import impossible ;
* erreur d'exécution ;
* export attendu absent ;
* fonction critique invalide.

### Pourquoi

Le module est la source de vérité des règles métier.

### Sévérité

Bloquant global.

### Message attendu

```text
Erreur dans le module de règles métier partagé : <détail>.
Génération abandonnée.
```

---

## G5 — Fragment commun indispensable introuvable

### Vérification

Un fragment requis, comme la navigation commune, est absent ou illisible.

### Pourquoi

Éviter de publier des pages structurellement incomplètes.

### Sévérité

Bloquant global.

### Message attendu

```text
Fragment commun introuvable : <chemin>.
Exécutez la génération du fragment requis avant de relancer.
```

---

## G6 — Chute anormale du nombre de produits actifs

### Vérification

Comparer le nombre de produits actifs du run courant au dernier run **officiel réussi** (jamais un run échoué).

Seuil retenu (décision opérationnelle P0, 2026-07-17) : abandon si les deux conditions sont réunies :
* baisse strictement supérieure à 5 % ;
* et perte d'au moins 5 produits actifs.

Référence initiale : 230 produits actifs (constatée le 2026-07-17), à reconfirmer au premier run officiel. Premier run : enregistrement de la référence, sans comparaison historique. Seuil réévalué en P15 à partir des variations réellement observées.

### Pourquoi

Détecter une troncature, une erreur de filtre ou une désactivation massive involontaire.

### Sévérité

Bloquant global jusqu'à confirmation manuelle.

### Message attendu

```text
Variation anormale du nombre de produits actifs :
<ancien> → <nouveau> (<pourcentage>%).
Génération abandonnée par précaution.
```

---

# Classe B — Garde-fous par produit

Ils excluent uniquement le produit concerné.

Le run continue, mais l'exclusion doit apparaître explicitement dans le résumé.

---

## G7 — Slug invalide

### Vérification

* slug absent ;
* slug vide ;
* format interdit ;
* caractères incompatibles ;
* chemin dangereux.

### Pourquoi

Éviter de produire un chemin invalide ou ambigu.

### Sévérité

Exclusion du produit.

### Message attendu

```text
Produit <identifiant ou nom> ignoré :
slug manquant ou invalide.
```

---

## G8 — Champ obligatoire manquant

### Vérification

Selon le type de produit :

* nom ;
* catégorie ;
* prix ;
* image principale ;
* description ;
* autres champs définis comme obligatoires.

### Pourquoi

Éviter de publier une fiche visiblement incomplète.

### Sévérité

Exclusion du produit.

### Message attendu

```text
Produit <slug> ignoré :
champ obligatoire manquant (<champ>).
```

---

## G9 — Canonical incohérent avec le chemin de sortie

### Vérification

Comparer :

```text
{slug}/index.html
```

avec :

```text
https://dar-nur.fr/{slug}/
```

### Pourquoi

Détecter un bug de calcul ou une incohérence d'URL.

### Sévérité

Exclusion du produit.

### Message attendu

```text
Produit <slug> ignoré :
incohérence canonical / chemin de sortie.
```

---

## G10 — Placeholder non remplacé

### Vérification

Présence de jetons du type :

```text
{{...}}
```

dans le HTML final.

### Pourquoi

Empêcher la publication d'un gabarit incomplet.

### Sévérité

Exclusion du produit.

### Message attendu

```text
Produit <slug> ignoré :
placeholder(s) non remplacé(s) : <liste>.
```

---

## G11 — Catégorie inconnue

### Vérification

La catégorie du produit n'est pas reconnue par le module de règles métier.

### Pourquoi

Éviter l'application d'un rendu ou de textes par défaut incorrects.

### Sévérité

Exclusion du produit.

### Message attendu

```text
Produit <slug> ignoré :
catégorie <identifiant> non reconnue.
```

---

## G12 — Nombre de `<h1>` incorrect

### Vérification

Le HTML produit contient :

* zéro `<h1>` ;
* ou plus d'un `<h1>`.

### Pourquoi

Garantir la structure SEO principale.

### Sévérité

Exclusion du produit.

### Message attendu

```text
Produit <slug> ignoré :
<n> balise(s) h1 détectée(s), exactement une attendue.
```

---

## G13 — Lien interne cassé dans la page produit

### Vérification

Les liens internes produits par :

* breadcrumb ;
* produits apparentés ;
* navigation ;
* CTA interne ;

pointent vers une cible connue.

### Pourquoi

Éviter de publier une fiche contenant un lien mort.

### Sévérité

Exclusion du produit.

### Message attendu

```text
Produit <slug> ignoré :
lien interne cassé vers <cible>.
```

---

# Classe C — Garde-fous de cohérence catalogue

Ils s'exécutent après génération complète en mémoire et avant tout commit.

---

## G14 — Écart inexpliqué entre produits actifs et pages générées

### Vérification

Comparer l'ensemble exact :

* des slugs actifs Supabase ;
* des fichiers générés ;
* des exclusions G7–G13 explicitement rapportées.

### Pourquoi

Détecter tout produit manquant sans cause connue.

### Sévérité

Bloquant global.

### Message attendu

```text
Incohérence catalogue :
<n> produit(s) actif(s) sans fichier généré et sans exclusion expliquée.
Commit abandonné.
```

---

## G15 — Canonical dupliqué

### Vérification

Extraire tous les canonicals générés et vérifier leur unicité.

### Pourquoi

Détecter un bug du générateur indépendant de l'unicité des slugs source.

### Sévérité

Bloquant global.

### Message attendu

```text
Canonical dupliqué détecté entre :
<fichier A>
<fichier B>
Commit abandonné.
```

---

## G16 — Lien catégorie vers page inexistante

### Vérification

Croiser les liens produit des pages catégories avec l'ensemble des pages générées.

### Pourquoi

Empêcher la migration de liens vers des cibles absentes.

### Sévérité

Bloquant global.

### Message attendu

```text
Lien mort détecté :
<fichier source> référence <slug> sans page générée.
```

---

## G17 — Fichier orphelin

### Vérification

Détecter tout répertoire :

```text
<slug>/index.html
```

sans produit actif correspondant et sans page de redirection reconnue.

### Pourquoi

Identifier un produit retiré ou renommé non traité selon la politique P0.

### Sévérité

Alerte non bloquante.

### Message attendu

```text
Fichier orphelin détecté :
<slug>/index.html
Aucun produit actif ni mécanisme de redirection reconnu.
Action manuelle requise.
```

---

# Contrôle de cohérence globale du catalogue

Le contrôle doit vérifier automatiquement :

* une page pour chaque produit actif ;
* aucune page active pour un produit inactif ;
* aucun slug dupliqué ;
* aucun canonical dupliqué ;
* aucun produit manquant sans exclusion expliquée ;
* aucun lien catégorie vers une page inexistante ;
* aucun sitemap désynchronisé ;
* aucun fichier orphelin non signalé ;
* aucune URL sitemap en erreur post-déploiement.

Le contrôle doit utiliser des comparaisons d'ensembles, pas uniquement des comptages.

Un simple égalité de nombres ne suffit pas, car deux ensembles différents peuvent avoir le même nombre d'éléments.

---

# Validation HTML systématique

Chaque page générée doit être validée avant écriture.

Contrôles obligatoires :

* `<title>` présent et non vide ;
* meta description présente et non vide ;
* canonical présent et correct ;
* `og:title` présent ;
* `og:description` présent ;
* `og:url` présent ;
* `og:type` présent ;
* `og:image` présent ;
* JSON-LD syntaxiquement valide ;
* type `Product` présent ;
* champs obligatoires JSON-LD présents ;
* exactement un `<h1>` ;
* aucun placeholder résiduel ;
* aucun lien interne cassé ;
* aucun fragment produit canonique ;
* aucune divergence entre slug, chemin de sortie et canonical.

Tous les contrôles ci-dessus sont automatiques et bloquants ou exclusifs selon la classe du garde-fou concerné.

---

# Gouvernance des garde-fous

* Les identifiants G1–G17 sont stables.
* Un identifiant ne doit jamais être réutilisé pour une autre notion.
* Toute modification de classe nécessite une revue architecturale.
* Toute baisse de sévérité doit être documentée et validée.
* Un nouveau garde-fou reçoit :
  * un identifiant stable ;
  * une classe ;
  * une justification ;
  * une sévérité ;
  * un message d'erreur attendu.
* Aucun garde-fou bloquant ne peut être désactivé pour faire passer un build.
* Les erreurs doivent rester explicites.
* Le résumé de génération doit lister :
  * produits générés ;
  * produits exclus ;
  * erreurs systémiques ;
  * incohérences catalogue ;
  * fichiers orphelins ;
  * alertes non bloquantes.

---

# Validation finale de la revue

Une revue architecturale n'est validée que si :

* toutes les sections A–H ont été remplies ;
* les réponses « Oui » ont été traitées ;
* la classification est justifiée ;
* les tests sont définis ;
* le rollback est compris ;
* la dette est documentée ;
* l'impact sur les garde-fous est explicite ;
* l'ADR éventuelle est rédigée avant implémentation.

Aucune évolution Majeure ou Structurante ne doit commencer sans cette validation.
