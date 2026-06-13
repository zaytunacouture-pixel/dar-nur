# Kit de Validation Post-Déploiement — Dar Nūr

**Version:** 1.0  
**Créé:** 2026-06-12  
**Scope:** Navigation hiérarchique (commit 09f733a)  
**Destiné à:** Équipe DevOps, QA, Product, Validateurs externes

---

## 📋 Contenu du kit

Ce kit contient tous les documents nécessaires pour déployer et valider la navigation hiérarchique de Dar Nūr en production, de manière reproductible et traçable.

### Documents inclus

1. **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** — Guide complet de déploiement
   - Vérifications pré-déploiement
   - Instructions de déploiement (Git et manuel)
   - Gestion du cache
   - Procédure de rollback
   - **À utiliser par:** DevOps, Tech Lead
   - **Durée:** ~30 min

2. **[VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md)** — Checklist de validation
   - Test détaillé sur 4 navigateurs/appareils
   - Vérification de chaque fonctionnalité
   - Cases à cocher pour chaque élément
   - Sign-off final
   - **À utiliser par:** QA, Testeurs, Validateurs
   - **Durée:** ~45 min (15 min par navigateur)

3. **[RECETTE_REPORT_TEMPLATE.md](./RECETTE_REPORT_TEMPLATE.md)** — Rapport de recette
   - Synthèse des résultats
   - Résultats par plateforme
   - Anomalies découvertes
   - Approbations
   - **À utiliser par:** QA Lead, Validateur final
   - **À remplir:** Après validation checklist

4. **[ANOMALY_REPORT_TEMPLATE.md](./ANOMALY_REPORT_TEMPLATE.md)** — Déclaration d'anomalie
   - Template pour documenter chaque anomalie
   - Classification (critique/majeure/mineure)
   - Étapes de reproduction
   - Preuves et logs
   - **À utiliser par:** Équipe QA
   - **À utiliser si:** Anomalies découvertes

---

## 🚀 Guide d'utilisation rapide

### Scénario 1 : Déploiement en production

```
1. Ouvrir DEPLOYMENT_GUIDE.md
2. Suivre "Pré-déploiement" (checklist)
3. Suivre "Déploiement" (instructions étape par étape)
4. Suivre "Validation post-déploiement" (vérification rapide)
5. Passer à la validation détaillée
```

### Scénario 2 : Validation détaillée

```
1. Ouvrir VALIDATION_CHECKLIST.md
2. Suivre les tests sur chaque navigateur (4 sections)
3. Cocher les cases au fur et à mesure
4. Documenter toute anomalie observée
5. Remplir le sign-off final
```

### Scénario 3 : Validation réussie

```
1. VALIDATION_CHECKLIST.md complète ✅
2. Toutes les cases cochées ✅
3. Aucune anomalie détectée ✅
4. Remplir RECETTE_REPORT_TEMPLATE.md
5. Valider avec signatures
6. Clore le déploiement
```

### Scénario 4 : Anomalie détectée

```
1. Anomalie observée durant VALIDATION_CHECKLIST.md
2. Ouvrir ANOMALY_REPORT_TEMPLATE.md
3. Remplir tous les champs
4. Joindre captures d'écran et logs
5. Soumettre au système de tickets
6. Décider : correction immédiate ou rollback
7. Si correction : re-valider après déploiement
```

---

## 📊 Matrice de responsabilités

| Rôle | Pré-déploiement | Déploiement | Validation | Rollback |
|------|---|---|---|---|
| **DevOps** | ✅ Vérifier | ✅ Exécuter | ✅ Vérification tech | ✅ Exécuter |
| **QA Lead** | ☐ Planifier | ☐ Assister | ✅ Superviser | ✅ Décider |
| **Testeur QA** | ☐ Assister | ☐ Observer | ✅ Exécuter checklist | ☐ Assister |
| **Product Owner** | ☐ Approuver | ☐ Notifié | ✅ Sign-off final | ✅ Décider |
| **Tech Lead** | ✅ Approuver | ✅ Superviser | ✅ Validation tech | ✅ Assister |

---

## ⏱️ Estimation durée

| Phase | Durée | Responsable |
|-------|-------|-------------|
| **Pré-déploiement** | 15 min | DevOps |
| **Déploiement** | 10-20 min | DevOps |
| **Validation rapide** | 5 min | DevOps |
| **Validation détaillée** | 45 min | QA (15 min/navigateur) |
| **Rapport de recette** | 15 min | QA Lead |
| **Approvals & sign-off** | 10 min | Équipe |
| **TOTAL** | ~2 heures | Tous |

---

## ✅ Critères de succès

La recette est **RÉUSSIE** si :

- ✅ Tous les tests passent sur les 4 navigateurs
- ✅ Toutes les catégories sont accessibles
- ✅ Tous les liens fonctionnent
- ✅ Aucun débordement horizontal
- ✅ Aucun bug bloquant
- ✅ Chevrons animés correctement
- ✅ Rendu cohérent avec branding Dar Nūr
- ✅ Rapport de recette signé

---

## 🔄 Réutilisabilité

Ce kit est conçu pour être **réutilisable** pour les déploiements futurs :

### Pour réutiliser ce kit

1. Copier le dossier `/deployment-kit/` (ou les fichiers individuels)
2. **Mise à jour requise :**
   - Remplacer `09f733a` par le nouveau commit
   - Remplacer `Navigation hiérarchique` par la description du changement
   - Ajuster les checklists si scope change
3. **Mise à jour optionnelle :**
   - Ajouter de nouveaux navigateurs/appareils
   - Ajouter des vérifications spécifiques
   - Mettre à jour les contacts d'urgence

### Customisation par équipe

```markdown
Chaque organisation peut :
- [ ] Ajouter ses propres navigateurs de test
- [ ] Ajouter des spécifications de marque locale
- [ ] Intégrer avec son système de tickets (Jira, Linear, etc)
- [ ] Ajouter des contacts d'urgence
- [ ] Adapter les checklists à son contexte
```

---

## 📞 Support et contacts

### En cas de question

| Question | Réponse |
|----------|---------|
| "Comment déployer ?" | → Voir DEPLOYMENT_GUIDE.md |
| "Quoi tester ?" | → Voir VALIDATION_CHECKLIST.md |
| "Comment reporter une anomalie ?" | → Voir ANOMALY_REPORT_TEMPLATE.md |
| "Comment remplir le rapport ?" | → Voir RECETTE_REPORT_TEMPLATE.md |

### En cas de problème critique

1. Arrêter la validation
2. Vérifier DEPLOYMENT_GUIDE.md section "Rollback"
3. Exécuter le rollback
4. Documenter l'anomalie
5. Contacter Tech Lead

---

## 📝 Historique versions

| Version | Date | Changements |
|---------|------|------------|
| 1.0 | 2026-06-12 | Création initiale pour commit 09f733a |
| [Futures] | [Date] | [À remplir] |

---

## 🔐 Archivage

Après validation réussie :

```
Archiver le dossier complet :
├── DEPLOYMENT_KIT_INDEX.md (ce fichier)
├── DEPLOYMENT_GUIDE.md
├── VALIDATION_CHECKLIST.md (remplie)
├── RECETTE_REPORT_TEMPLATE.md (remplie)
└── Anomaly reports (si applicable)

Localisation : [À définir par équipe]
Rétention : [À définir par politique]
```

---

## 📌 Checklist finale avant utilisation

- [ ] Tous les fichiers sont présents (4 documents + index)
- [ ] Commit à déployer est confirmé : `09f733a`
- [ ] Équipe et rôles sont assignés
- [ ] Contacts d'urgence sont mis à jour
- [ ] Plateforme de test est stable (pas de maintenance prévue)
- [ ] Fenêtre de déploiement est confirmée
- [ ] Rollback procedure est revue
- [ ] Approbations préalables sont obtenues

---

**Prêt pour déploiement en production ✅**

*Kit généré le 2026-06-12 pour Dar Nūr — Navigation hiérarchique*

