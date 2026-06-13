# Déclaration d'Anomalie — Dar Nūr

**ID Anomalie:** ANO-_______ (généré automatiquement)  
**Date de découverte:** _______________  
**Découvreur:** _______________  

---

## 1. IDENTIFICATION ANOMALIE

### 1.1 Classification

**Sévérité:**
- ☐ **CRITIQUE** — Site inaccessible, flux e-commerce cassé, aucun contournement possible
- ☐ **MAJEURE** — Fonctionnalité clé non fonctionnelle, impact utilisateur direct
- ☐ **MINEURE** — Défaut cosmétique, contournement possible, impact utilisateur faible
- ☐ **COSMÉTIQUE** — Espacement, couleur, police légèrement différent

**Domaine:**
- ☐ Navigation
- ☐ Dropdown menu
- ☐ Chevrons/Animation
- ☐ Responsive
- ☐ Performance
- ☐ Accessibilité
- ☐ Autre : _______________

### 1.2 Titre

**Titre court (< 10 mots) :**  
```
[Exemple: "Dropdown Mode ne s'ouvre pas en mobile"]
```

---

## 2. ENVIRONNEMENT

### 2.1 Plateforme

- ☐ **Desktop Chrome** (version : ____________)
- ☐ **Desktop Safari** (version : ____________)
- ☐ **iPhone Safari** (modèle : ____________, iOS : ____________)
- ☐ **Android Chrome** (modèle : ____________, Android : ____________)

### 2.2 Résolution/Appareil

**Largeur d'écran:** _______________ px  
**Modèle appareil:** _______________  
**Navigateur User-Agent:** _______________  

### 2.3 Contexte

- ☐ Menu fermé
- ☐ Menu ouvert
- ☐ Dropdown ouvert
- ☐ Autre : _______________

---

## 3. DESCRIPTION ANOMALIE

### 3.1 Étapes pour reproduire

**Étape 1:** 
```
[Exemple: "Naviguer vers https://dar-nur.fr"]
```

**Étape 2:**
```
[Exemple: "Cliquer sur 'Bien-être'"]
```

**Étape 3:**
```
[Exemple: "Observer le dropdown"]
```

**Étape 4:**
```
[Laisser vide si étapes 1-3 suffisent]
```

### 3.2 Résultat attendu

```
[Exemple: 
"Le dropdown 'Bien-être' doit s'ouvrir et afficher les 5 catégories :
- Miels
- Gélules
- Poudres & Graines
- Huiles
- Brumes"]
```

### 3.3 Résultat observé

```
[Exemple:
"Le dropdown ne s'ouvre pas.
Rien ne se passe au clic sur 'Bien-être'.
Aucun message d'erreur."]
```

### 3.4 Différence

```
[Exemple:
"Expected: Dropdown s'ouvre
Observed: Aucune action
Différence: Dropdown complètement non fonctionnel en mobile"]
```

---

## 4. IMPACT

### 4.1 Impact utilisateur

**Gravité:**
- ☐ Utilisateur ne peut pas effectuer son action
- ☐ Utilisateur doit trouver un contournement
- ☐ Utilisateur constate une différence mineure
- ☐ Aucun impact utilisateur visible

**Description de l'impact:**
```
[Exemple: 
"L'utilisateur ne peut pas accéder à la catégorie 'Gélules' depuis le menu mobile.
Il doit passer par le menu 'BOUTIQUE' et utiliser le filtre pour trouver les gélules."]
```

### 4.2 Impact métier

- [ ] Perte de ventes estimée : _______________ 
- [ ] % Utilisateurs affectés : _______________ 
- [ ] Délai acceptable pour correction : _______________ 

---

## 5. PREUVES

### 5.1 Captures d'écran

**Capture 1 — État normal (si applicable):**
```
[Insérer capture ou descripton]
Résolution: _____x_____
Navigateur: _____________
```

**Capture 2 — Anomalie observée:**
```
[Insérer capture ou description]
Résolution: _____x_____
Navigateur: _____________
```

### 5.2 Logs/Erreurs

**Erreurs JavaScript (F12 > Console):**
```
[Copier le contenu de la console]

[Exemple:
"TypeError: Cannot read property 'classList' of null
  at toggleDropdown (index.html:2136)"]
```

**Erreurs réseau (F12 > Network):**
```
[Copier les erreurs de chargement de ressources]

[Exemple:
"Failed to load resource: the server responded with a status of 404 (Not Found)
https://dar-nur.fr/style.css"]
```

### 5.3 Video/GIF (optionnel)

```
[Lien vers enregistrement d'écran montrant l'anomalie]
[Format: MP4, GIF, ou lien vidéo]
```

---

## 6. DIAGNOSTIC PRÉLIMINAIRE

### 6.1 Cause supposée

```
[Basée sur observations et logs]

[Exemple:
"Le JavaScript fonction 'toggleDropdown' ne se déclenche pas au clic.
Possible cause: événement 'click' non capturé correctement sur mobile."]
```

### 6.2 Localisation suspectée

**Fichier(s):** 
```
- index.html (ligne approximative: _______)
```

**Fonction(s):** 
```
- toggleDropdown()
- closeDropdowns()
```

**CSS:** 
```
- .nav-dropdown
- .nav-dropdown-menu.active
```

### 6.3 Contournement possible

```
[Si applicable]

[Exemple:
"Utilisateur peut filtrer par le bouton 'GÉLULES' dans la section 'Notre collection'"]
```

---

## 7. PRIORITÉ CORRECTION

| Critère | Évaluation | Justification |
|---------|-----------|--------------|
| **Urgence** | Élevée ☐ | Moyenne ☐ | Basse ☐ | _______________ |
| **Complexité** | Simple ☐ | Modérée ☐ | Complexe ☐ | _______________ |
| **Impact** | Critique ☐ | Majeur ☐ | Mineur ☐ | _______________ |

**Priorité globale:** 
```
☐ URGENT (corriger avant prochain déploiement)
☐ ÉLEVÉE (corriger dans la semaine)
☐ NORMALE (planifier dans le sprint suivant)
☐ BASSE (corriger si temps disponible)
```

---

## 8. HISTORIQUE

### 8.1 Découverte

- **Date/Heure:** _______________
- **Découvreur:** _______________
- **Plateforme test:** _______________

### 8.2 Suivi

| Date | Statut | Commentaires | Par |
|------|--------|--------------|-----|
| _____________ | ☐ Découverte | _____________ | _____________ |
| _____________ | ☐ Confirmée | _____________ | _____________ |
| _____________ | ☐ En cours de correction | _____________ | _____________ |
| _____________ | ☐ Corrigée | _____________ | _____________ |
| _____________ | ☐ Validée | _____________ | _____________ |
| _____________ | ☐ Fermée | _____________ | _____________ |

---

## 9. NOTES SUPPLÉMENTAIRES

```
[Informations additionnelles pertinentes]

[Exemple:
"Anomalie intermittente - pas toujours reproductible
Semble dépendre de la vitesse de connexion"]
```

---

## 10. SIGN-OFF DÉCOUVREUR

**Découvreur:** _______________  
**Date:** _______________  
**Signature:** _______________  

Je confirme que :
- ☐ L'anomalie est reproductible
- ☐ Les étapes pour reproduire sont claires
- ☐ Des preuves (captures/logs) sont fournies
- ☐ L'impact utilisateur est documenté

---

## Checklist submission

Avant de soumettre :
- [ ] Titre clair et descriptif
- [ ] Étapes reproductibles
- [ ] Captures d'écran ou logs joints
- [ ] Impact utilisateur clairement décrit
- [ ] Sévérité appropriée
- [ ] Plateforme correctement identifiée
- [ ] Diagnostic préliminaire fourni

---

*Généré le 2026-06-12 pour Dar Nūr*  
*Modèle de déclaration d'anomalie réutilisable*  
*Lien vers système de tickets : [Ajouter URL Jira/Linear/etc]*
