# Plan de Correction des Packs — Dar Nūr

## 🔍 Audit du Problème Actuel

### Problème 1 : Calcul de prix basé sur variantes par défaut
- **Symptôme** : Pack Sport affiche 80€ total, mais les produits individuels somment à 69.95€ (10.05€ de markup, pas d'économie)
- **Cause** : `loadActiveOffersSection()` calcule le prix total en utilisant TOUJOURS le premier prix de variante (50g pour miels, 10ml pour huiles)
- **Réalité probable** : l'offre fournisseur utilise des formats 200g, 200ml, etc., pas 50g/10ml
- **Conséquence** : écart de prix inexplicable visible au client

### Problème 2 : Structure `offer_products` insuffisante
- **Limitation** : actuellement `(offer_id, product_slug)` seulement
- **Manque** : pas de moyen de stocker quelle variante inclure dans un pack
- **Impact** : on ne peut pas dire "ce pack contient Miel 200g, pas 50g"

### Problème 3 : Économies négatives affichées
- **Cas** : quand normal_price < calcul réel, on affiche une "économie" négative
- **Attendu** : masquer l'économie automatique si <= 0, garder seulement badge manuel

### Problème 4 : Offre Abaya sans produits
- **Cas actuel** : "Offre Abaya" ne contient aucun produit (pas de lien aux abayas/couleurs)
- **Attendu** : soit ajouter les abayas/couleurs au pack, soit changer le type d'offre

---

## ✅ Objectifs de la Correction

1. **Structure Supabase** : Ajouter `variant_id`, `variant_name`, `quantity` à `offer_products`
2. **Données des packs** : Reconfigurer chaque pack avec les bonnes variantes/quantités
3. **Calcul de prix** : Utiliser variant_id si fourni, sinon fallback prix par défaut
4. **Affichage** : Masquer économie négative, garder seulement badge manuel
5. **Offre Abaya** : Décider si c'est un pack de produits ou une promo simple

---

## 📋 Étapes de Migration

### Étape 1 : Migration Supabase (REQUIERT VALIDATION)
**Fichier** : `supabase/migration_offer_products.sql`

```sql
-- Ajoute 3 colonnes à offer_products :
-- - variant_id (uuid, nullable, FK vers product_variants)
-- - variant_name (text, cache du nom)
-- - quantity (integer, défaut 1)
```

**Avant de lancer** :
- [ ] Exécuter `audit_variants.sql` pour voir les variantes réelles
- [ ] Vérifier les formats de Miel et Huile disponibles
- [ ] Confirmer la structure avec l'utilisateur

### Étape 2 : Audit des Variantes Existantes
**Fichier** : `supabase/audit_variants.sql`

**Résultats attendus** :
- Lister tous les miels et leurs variantes (50g, 100g, 200g, 300g?)
- Lister toutes les huiles et leurs variantes (10ml, 30ml, 60ml, 100ml?)
- Afficher les offres actuelles et leurs produits

### Étape 3 : Reconfiguration des Packs (APRÈS AUDIT)

#### Pack Sport (exemple de ce qui pourrait être)
```json
{
  "id": "pack-sport",
  "title": "Pack Sport",
  "type": "pack",
  "normal_price": null,  // Calculé
  "promo_price": 80,
  "badge": "jusqu'à 20% d'économie",
  "products": [
    { "slug": "miel-nigelle", "variant_name": "200g", "quantity": 1 },
    { "slug": "miel-gingembre-curcuma", "variant_name": "200g", "quantity": 1 },
    { "slug": "huile-nigelle", "variant_name": "60ml", "quantity": 1 },
    { "slug": "huile-olive", "variant_name": "100ml", "quantity": 1 },
    { "slug": "gelules-spiruline", "variant_name": "défaut", "quantity": 1 }
  ]
}
```

#### Pack Gourmand
- À définir avec les bonnes variantes (200g?, 100ml?)

#### Pack Thérapeutiques
- À définir avec les bonnes variantes

#### Offre Abaya
- **Option A** : Ajouter les abayas/couleurs au pack
- **Option B** : Garder comme promo simple (type='product_promo') sans produits liés
- **À décider** : quel est le type réel de cette offre?

### Étape 4 : Changement Frontend (index.html)

**Fonction à mettre à jour** : `loadActiveOffersSection(_sb)`

```javascript
// AVANT (utilise toujours premier prix)
const totalPrice = 
  packProducts.reduce((sum, p) => sum + parseFloat(startPrice(p)), 0);

// APRÈS (utilise variant_id si fourni)
const totalPrice = packProducts.reduce((sum, p, i) => {
  const packLine = packLines[i];
  if (packLine.variant_id) {
    // Chercher la variante spécifique
    const variant = p.price.options?.find(
      opt => opt.id === packLine.variant_id
    );
    if (variant) return sum + parseFloat(variant.price);
  }
  return sum + parseFloat(startPrice(p));
}, 0);
```

**Économie négative** :
```javascript
// Si economie <= 0, masquer la div
if (economie <= 0) {
  showEconomie = false;  // Ne pas afficher "Économisez 5€"
  // Garder seulement le badge manuel si fourni
}
```

### Étape 5 : Scripts SQL de Mise à Jour des Données

**À générer après audit**, exemple pour Pack Sport :
```sql
-- Effacer le pack existant
DELETE FROM offer_products WHERE offer_id = 'pack-sport-id';

-- Ajouter les nouvelles lignes avec variantes
INSERT INTO offer_products (offer_id, product_slug, variant_id, variant_name, quantity, sort_order)
VALUES
  ('pack-sport-id', 'miel-nigelle', 'variant-200g-id', '200g', 1, 0),
  ('pack-sport-id', 'miel-gingembre-curcuma', 'variant-200g-id', '200g', 1, 1),
  ('pack-sport-id', 'huile-nigelle', 'variant-60ml-id', '60ml', 1, 2),
  ...
```

---

## 🚀 Processus d'Exécution

### 1️⃣ Validation Actuelle (MAINTENANT)
- [ ] User valide ce plan
- [ ] User confirme les noms/variantes pour chaque pack
- [ ] User décide de l'Offre Abaya (pack ou promo?)

### 2️⃣ Exécution (AVEC VALIDATION AVANT CHAQUE ÉTAPE)
1. Exécuter `audit_variants.sql` → voir résultats
2. Exécuter `migration_offer_products.sql` → structure prête
3. Générer scripts de mise à jour des packs → basés sur l'audit
4. Exécuter scripts de mise à jour → données correctes
5. Mettre à jour index.html → calculs corrects
6. Tester en local
7. Commit et push

### 3️⃣ Vérification en Production
- [ ] Vérifier les prix des packs sont corrects
- [ ] Vérifier les économies calculées sont positives
- [ ] Vérifier le masquage des économies négatives
- [ ] Tester tous les packs et clics

---

## 📝 Fichiers Prêts pour Validation

1. **supabase/audit_variants.sql** — audit des données actuelles
2. **supabase/migration_offer_products.sql** — migration de structure
3. **PLAN_CORRECTION_PACKS.md** (ce fichier)

**Prochaine action** :
➡️ User valide ce plan
➡️ User fournit les noms exacts des variantes pour chaque pack
➡️ Claude exécute les migrations et updates
