# Checklist de Validation Post-Déploiement — Dar Nūr Navigation

**Version:** 1.0  
**Date de test:** _______________  
**Testeur:** _______________  
**Navigateur/Appareil:** _______________  

---

## 1. DESKTOP CHROME

### 1.1 Navigation principale

- [ ] Logo Dar Nūr visible et centré
- [ ] "BOUTIQUE" visible
- [ ] "BIEN-ÊTRE" visible
- [ ] "MODE" visible
- [ ] "NOTRE HISTOIRE" visible
- [ ] Menu items alignés horizontalement
- [ ] Aucun texte coupé
- [ ] Aucun chevauchement d'éléments

### 1.2 Dropdown Bien-être

**Survol sur "BIEN-ÊTRE" :**

- [ ] Dropdown s'ouvre au survol
- [ ] "MIELS" visible
- [ ] "GÉLULES" visible
- [ ] "POUDRES & GRAINES" visible
- [ ] "HUILES" visible
- [ ] "BRUMES" visible
- [ ] Aucun chevauchement avec le menu principal
- [ ] Chevron (▾) visible
- [ ] Aucun scintillement/clignotement

**Clic sur chaque item :**

- [ ] "MIELS" → filtre produits et s'ouvre
- [ ] "GÉLULES" → filtre produits et s'ouvre
- [ ] "POUDRES & GRAINES" → filtre produits et s'ouvre
- [ ] "HUILES" → filtre produits et s'ouvre
- [ ] "BRUMES" → filtre produits et s'ouvre

**Fermeture du dropdown :**

- [ ] S'éloigner du dropdown → fermeture
- [ ] Clic ailleurs → fermeture
- [ ] Chevron revient à l'état initial

### 1.3 Dropdown Mode

**Survol sur "MODE" :**

- [ ] Dropdown s'ouvre au survol
- [ ] "QAMIS" visible
- [ ] "ABAYAS" visible
- [ ] Aucun chevauchement

**Clic sur chaque item :**

- [ ] "QAMIS" → filtre produits et s'ouvre
- [ ] "ABAYAS" → filtre produits et s'ouvre

### 1.4 Autres liens

- [ ] "BOUTIQUE" → affiche tous les produits
- [ ] "NOTRE HISTOIRE" → scroll vers section

### 1.5 Validation générale Desktop Chrome

- [ ] Aucun espacement anormal
- [ ] Aucun décalage visuel
- [ ] Aucune erreur JavaScript (F12 > Console)
- [ ] Tous les liens fonctionnent
- [ ] Pas de clignotement CSS
- [ ] Aspect cohérent avec le branding Dar Nūr (vert/doré)

---

## 2. IPHONE SAFARI

### 2.1 Menu fermé

- [ ] Burger menu (☰) visible en haut à droite
- [ ] Burger menu doré
- [ ] Burger menu clickable
- [ ] Logo Dar Nūr visible et centré
- [ ] Texte arabe "دار النور" visible
- [ ] Pas de débordement horizontal

### 2.2 Menu ouvert

**Clic sur burger menu :**

- [ ] Slide-in de la droite fluide
- [ ] "BOUTIQUE" visible
- [ ] "BIEN-ÊTRE" visible avec chevron (▸)
- [ ] "MODE" visible avec chevron (▸)
- [ ] "NOTRE HISTOIRE" visible
- [ ] Burger se transforme en X
- [ ] Aucun débordement horizontal
- [ ] Items empilés verticalement
- [ ] Items lisibles et bien espacés

### 2.3 Sous-menu Bien-être

**Clic sur "BIEN-ÊTRE" :**

- [ ] Sous-menu s'ouvre fluide
- [ ] "MIELS" visible
- [ ] "GÉLULES" visible
- [ ] "POUDRES & GRAINES" visible
- [ ] "HUILES" visible
- [ ] "BRUMES" visible
- [ ] **Chevron tourne (▸→▲)**
- [ ] Aucun débordement
- [ ] Aucun élément coupé

**Clic sur chaque item :**

- [ ] "MIELS" → ferme menu et filtre produits
- [ ] "GÉLULES" → ferme menu et filtre produits
- [ ] "POUDRES & GRAINES" → ferme menu et filtre produits
- [ ] "HUILES" → ferme menu et filtre produits
- [ ] "BRUMES" → ferme menu et filtre produits

**Fermeture du sous-menu :**

- [ ] Clic sur "BIEN-ÊTRE" à nouveau → fermeture
- [ ] Chevron revient à ▸
- [ ] Items disparaissent

### 2.4 Sous-menu Mode

**Clic sur "MODE" :**

- [ ] Sous-menu s'ouvre fluide
- [ ] "QAMIS" visible
- [ ] "ABAYAS" visible
- [ ] **Chevron tourne (▸→▲)**
- [ ] Aucun débordement
- [ ] Aucun élément coupé

**Clic sur chaque item :**

- [ ] "QAMIS" → ferme menu et filtre produits
- [ ] "ABAYAS" → ferme menu et filtre produits

### 2.5 Interaction répétée

- [ ] Ouvrir/fermer menu 3 fois → fonctionne chaque fois
- [ ] Ouvrir/fermer sous-menus 3 fois → fonctionne chaque fois
- [ ] Chevron s'anime correctement chaque fois

### 2.6 Scroll

- [ ] Scroll du menu mobile fluide
- [ ] Pas de saccade
- [ ] Contenu scrollable si menu trop long

### 2.7 Validation générale iPhone Safari

- [ ] Aucun débordement horizontal
- [ ] Aucun élément coupé
- [ ] Aucune erreur JavaScript (Safari > Developer)
- [ ] Tous les liens clickables
- [ ] Menu responsive et fluide
- [ ] Chevrons animés correctement

---

## 3. ANDROID CHROME

### 3.1-3.7 Effectuer les MÊMES vérifications que iPhone Safari

**Points identiques :**
- Menu fermé/ouvert
- Sous-menus Bien-être et Mode
- Rotation chevrons
- Interaction répétée
- Scroll
- Validation générale

### 3.8 Spécificités Android

- [ ] Aucun problème de rendu Android
- [ ] Police correcte sur Android
- [ ] Pas de décalage de layout
- [ ] Gestes tactiles réactifs

---

## 4. DESKTOP SAFARI

### 4.1-4.4 Effectuer les MÊMES vérifications que Desktop Chrome

**Points identiques :**
- Navigation principale
- Dropdown Bien-être
- Dropdown Mode
- Autres liens

### 4.5 Spécificités Safari

- [ ] Effets hover fonctionnent
- [ ] Positionnement des dropdowns correct
- [ ] Alignement des éléments identique à Chrome
- [ ] Pas de clignotement spécifique à Safari
- [ ] Pas de problème de z-index
- [ ] Transitions CSS fluides

---

## 5. RÉSUMÉ VALIDATION

### Validation réussie si :

✅ Toutes les catégories accessibles  
✅ Tous les liens fonctionnent  
✅ Aucun débordement observé  
✅ Aucun bug de navigation  
✅ Chevrons fonctionnent correctement  
✅ Rendu cohérent avec branding premium Dar Nūr  

### Décision finale

**Validation RÉUSSIE** si :
- [ ] Toutes les cases cochées sur les 4 navigateurs
- [ ] Aucune anomalie bloquante
- [ ] Cohérence visuelle confirmée

**Validation ÉCHOUÉE** si :
- [ ] Au moins 1 élément non fonctionnel
- [ ] Débordement horizontal observé
- [ ] Bug bloquant la navigation
- [ ] Lien cassé
- [ ] Erreur JavaScript critique

**En cas d'anomalie :** Documenter avec `ANOMALY_REPORT.md`

---

## 6. SIGN-OFF

| Critère | Desktop Chrome | iPhone Safari | Android Chrome | Desktop Safari |
|---------|---|---|---|---|
| Navigation | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO |
| Dropdowns | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO |
| Chevrons | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO |
| Liens | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO |
| Rendu | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO | ☐ OK ☐ KO |

**Validation globale :** ☐ RÉUSSIE  ☐ ÉCHOUÉE  

**Validé par:** _______________  
**Date:** _______________  
**Heure:** _______________  

---

*Généré le 2026-06-12 pour Dar Nūr*
