# Guide de Déploiement — Dar Nūr

**Version:** 1.0  
**Date:** 2026-06-12  
**Scope:** Navigation hiérarchique (commit 09f733a)  

---

## Table des matières

1. [Pré-déploiement](#pré-déploiement)
2. [Déploiement](#déploiement)
3. [Validation post-déploiement](#validation-post-déploiement)
4. [Rollback](#rollback)

---

## Pré-déploiement

### Vérifications du commit

- [ ] **Commit correct identifié** : `09f733a`
  ```bash
  git log --oneline | grep 09f733a
  ```

- [ ] **Message du commit conforme**
  ```
  feat(navigation): restructurer le menu avec catégories hiérarchiques
  ```

- [ ] **Un seul fichier modifié** : `index.html`
  ```bash
  git show --stat 09f733a | grep "1 file changed"
  ```

- [ ] **Aucun fichier temporaire inclus**
  ```bash
  git show 09f733a --name-only | grep -E "\.(md|py|tmp|log)$"
  # Doit retourner : aucun résultat
  ```

### Vérifications du code

- [ ] **+61 insertions, -4 deletions**
  ```bash
  git show --stat 09f733a | grep "65 .*+.*-"
  ```

- [ ] **Changements limités à la navigation**
  - CSS dropdowns : +28 lignes
  - HTML structure : +23 lignes
  - JavaScript functions : +13 lignes

### Sauvegarde pré-déploiement

- [ ] **Backup de la version actuelle en production**
  ```bash
  # Backup recommandé
  cp index.html index.html.backup.$(date +%Y%m%d_%H%M%S)
  ```

- [ ] **Snapshot du dépôt local**
  ```bash
  git log --oneline -1
  # Noter le hash du commit actuel
  ```

---

## Déploiement

### Méthode A : Déploiement via Git (recommandé)

**Prérequis :** Accès SSH au serveur de production

```bash
# 1. Se connecter au serveur
ssh user@dar-nur.fr

# 2. Accéder au répertoire du site
cd /var/www/dar-nur

# 3. Vérifier la branche actuelle
git status

# 4. Récupérer les derniers changements
git fetch origin

# 5. Vérifier que le commit est disponible
git log --oneline origin/main | head -5

# 6. Merger/Checkout le commit
git pull origin main
# OU si utilisant un tag/release
git checkout 09f733a

# 7. Vérifier que le fichier est à jour
git log --oneline -1 | grep 09f733a
```

### Méthode B : Déploiement manuel

**Prérequis :** FTP ou SCP

```bash
# 1. Sur votre machine locale
git show 09f733a:index.html > index.html.prod

# 2. Transférer le fichier au serveur
scp index.html.prod user@dar-nur.fr:/var/www/dar-nur/index.html

# 3. Vérifier les permissions
ssh user@dar-nur.fr "ls -la /var/www/dar-nur/index.html"
```

### Gestion du cache

- [ ] **Vider les caches côté serveur** (si applicable)
  ```bash
  # Exemple avec Varnish
  ssh user@dar-nur.fr "varnishadm ban obj.http.url ~ ."
  
  # Exemple avec Redis
  ssh user@dar-nur.fr "redis-cli FLUSHALL"
  ```

- [ ] **Vider le cache CDN** (si applicable)
  - Cloudflare : Purge cache > Purge Everything
  - AWS CloudFront : Create invalidation > `/*`

- [ ] **Vider le cache navigateur client**
  - Hard refresh : `Ctrl+Shift+R` (Windows) ou `Cmd+Shift+R` (Mac)

### Vérification du déploiement

- [ ] **Vérifier la version en ligne**
  ```bash
  # Récupérer la version depuis le serveur
  curl -s https://dar-nur.fr/index.html | grep "nav-dropdown" | head -1
  
  # Doit retourner : une ligne contenant "nav-dropdown"
  ```

- [ ] **Vérifier la date de modification**
  ```bash
  curl -I https://dar-nur.fr/index.html | grep -i "last-modified"
  # Date doit être récente (aujourd'hui)
  ```

- [ ] **Vérifier l'intégrité du fichier**
  ```bash
  # Comparer la taille locale vs en ligne
  wc -c index.html
  curl -s https://dar-nur.fr/index.html | wc -c
  # Les deux tailles doivent être identiques
  ```

---

## Validation post-déploiement

### Checklist rapide (5 min)

- [ ] Site accessible : `https://dar-nur.fr`
- [ ] Page charge sans erreur 404
- [ ] Menu visible et non cassé
- [ ] Pas d'erreur JavaScript en console (F12 > Console)
- [ ] Pas de contenu blanc/cassé

### Validation détaillée

Voir `VALIDATION_CHECKLIST.md`

---

## Rollback

### Rollback via Git

**Prérequis :** Accès SSH au serveur

```bash
# 1. Se connecter au serveur
ssh user@dar-nur.fr

# 2. Accéder au répertoire
cd /var/www/dar-nur

# 3. Identifier le commit précédent
git log --oneline -5

# 4. Revenir au commit précédent (ex: 48d3017)
git checkout 48d3017

# 5. Vérifier le résultat
git log --oneline -1

# 6. Vider les caches
# (voir section "Gestion du cache" ci-dessus)
```

### Rollback via sauvegarde

**Si le rollback Git n'est pas possible**

```bash
# 1. Transférer la sauvegarde
scp index.html.backup.YYYYMMDD_HHMMSS user@dar-nur.fr:/var/www/dar-nur/index.html

# 2. Vérifier le résultat
curl -s https://dar-nur.fr/index.html | grep "nav-dropdown"
# Doit retourner : aucun résultat (version ancienne)

# 3. Vider les caches
```

### Décision de rollback

Rollback immédiat si :
- ❌ Site inaccessible ou erreur 500
- ❌ Contenu blanc/non-chargé
- ❌ Erreur JavaScript bloquante
- ❌ Lien cassé sur page d'accueil
- ❌ Image/CSS/JS non-chargée

Rollback après analyse si :
- ⚠️ Anomalie mineure observée sur 1 seul navigateur
- ⚠️ Bug cosmétique (espacement, couleur)

Ne pas rollback si :
- ✅ Bug visible seulement sur navigateur/appareil ancien
- ✅ Problème n'affectant pas le flux de commande
- ✅ Anomalie documentée et acceptée

---

## Contacts d'urgence

**En cas de problème critique :**

| Rôle | Contact | Disponibilité |
|------|---------|---------------|
| DevOps | [Email] | 9h-17h |
| Tech Lead | [Email] | Sur demande |
| On-call | [Numéro] | 24/7 |

---

## Checklist finale

- [ ] Pré-déploiement : toutes les vérifications OK
- [ ] Déploiement : commit 09f733a en production
- [ ] Cache vidé et propagation vérifiée
- [ ] Validation post-déploiement : pas d'anomalie bloquante
- [ ] Équipe informée du déploiement
- [ ] Documentation mise à jour

---

*Généré le 2026-06-12 pour Dar Nūr*
