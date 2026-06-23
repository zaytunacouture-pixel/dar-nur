# 🔍 Instructions Audit des Variantes des Packs

## 📍 Objectif
Vérifier que TOUS les produits des packs ont une variante **200g** (ou le bon format).

## 🚀 Étapes pour Exécuter l'Audit

### 1️⃣ Accéder à Supabase SQL Editor

```
1. Va sur https://supabase.com
2. Connecte-toi à ton projet Dar Nūr
3. Clique sur "SQL Editor" (panneau de gauche)
4. Clique sur "+ New Query"
```

### 2️⃣ Copier-Coller la Requête

Copie le contenu complet de :
```
supabase/audit_pack_variants_readonly.sql
```

Colle-le dans le SQL Editor de Supabase.

### 3️⃣ Exécuter la Requête

```
Clique sur le bouton "Run" (ou Ctrl+Enter)
```

## 📊 Résultats Attendus

Tu verras **2 sections** :

### Section 1 : Détail Complet (première requête)
```
pack_name       | product_slug           | variant_name  | variant_price | format_check
────────────────┼────────────────────────┼───────────────┼───────────────┼─────────────
Pack Sport      | miel-nigelle           | 50g           | 9.99€         | ⚠️ 50G (pas 200g)
Pack Sport      | miel-nigelle           | 200g          | 24.99€        | ✅ 200G TROUVÉ
Pack Sport      | miel-gingembre-curcuma | 50g           | 9.99€         | ⚠️ 50G (pas 200g)
Pack Sport      | miel-gingembre-curcuma | 200g          | 24.99€        | ✅ 200G TROUVÉ
Pack Sport      | huile-nigelle          | 10ml          | 7.99€         | ⚠️ 10G (pas 200g)
Pack Sport      | huile-nigelle          | 60ml          | 19.99€        | ✅ 200G TROUVÉ
...
```

### Section 2 : Synthèse par Produit (deuxième requête)
```
pack_name   | product_slug           | product_name              | total_variants | available_variants      | status
────────────┼────────────────────────┼───────────────────────────┼────────────────┼─────────────────────────┼──────────────
Pack Sport  | miel-nigelle           | Miel de Nigelle           | 3              | 100g, 200g, 50g         | ✅ OK
Pack Sport  | miel-gingembre-curcuma | Miel Gingembre Curcuma    | 3              | 100g, 200g, 50g         | ✅ OK
Pack Sport  | huile-nigelle          | Huile de Nigelle          | 2              | 10ml, 60ml              | ✅ OK
Pack Sport  | gelules-spiruline      | Gélules Spiruline         | 1              | défaut                  | ❌ MANQUE 200G
```

## ⚠️ Ce qu'il faut Vérifier

Après l'exécution, **regarde la colonne `status`** :

- ✅ **OK** → Produit a une variante 200g (ou équivalente)
- ❌ **MANQUE 200G** → Produit n'a PAS de variante 200g

**Si tu vois ❌ :**
- Note le produit exactement
- Note quelle variante est disponible à la place
- On devra décider : utiliser 100g? 50g? ou créer 200g?

## 📝 Informations à Noter

Pour **CHAQUE produit** du pack, note :
1. **product_slug** : ex. `miel-nigelle`
2. **product_name** : ex. `Miel de Nigelle`
3. **variant_id** : UUID de la variante 200g (dans les résultats)
4. **variant_name** : ex. `200g`
5. **variant_price** : ex. `24.99€`
6. **variant_image_first** : URL de l'image (si dispo)

## 🎯 Prochaine Étape

Une fois que tu **m'as montré les résultats** :
1. Je vérifierai si tous les produits ont 200g
2. Si des produits manquent 200g, on décidera ensemble du format à utiliser
3. On créera la migration PostgreSQL VALIDE (sans COALESCE en PK!)
4. On modifiera le code frontend pour utiliser les bonnes variantes

---

## 💡 Raccourci : Copie-Colle Directe

Si tu veux une version simplifiée, tu peux exécuter juste cette requête pour voir les variantes manquantes :

```sql
WITH pack_products AS (
  SELECT DISTINCT op.product_slug
  FROM offers o
  JOIN offer_products op ON o.id = op.offer_id
  WHERE o.type = 'pack' AND o.active = true
)

SELECT
  pp.product_slug,
  p.name,
  STRING_AGG(DISTINCT pv.name, ', ') AS variants,
  CASE WHEN COUNT(*) FILTER (WHERE pv.name ILIKE '%200%') > 0 THEN '✅' ELSE '❌' END AS has_200g
FROM pack_products pp
JOIN products p ON p.slug = pp.product_slug
LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.active = true
GROUP BY pp.product_slug, p.name
ORDER BY pp.product_slug;
```

---

**À toi de jouer !** Exécute la requête et montre-moi les résultats 👇
