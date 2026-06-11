# Retouches visuelles prioritaires Dar Nūr

Liste de suivi créée suite à la décision du 2026-06-11 : les visuels listés ci-dessous
sont **conservés en l'état** (intégrés au catalogue), mais portent un texte/tagline
généré par IA qu'il faudra retoucher (recadrage, effacement ou regénération du visuel)
lors d'un prochain cycle de production photo.

Pour chaque produit : texte à supprimer du visuel + niveau de priorité.

---

## Priorité Critique (7)

| Produit | Texte à supprimer du visuel |
|---|---|
| `gel-aphrodisiaque` | Tagline "ENERGIE - VITALITE - DESIR" + nom produit visible "Aphrodisiaque" |
| `gel-macca` | Tagline "ENERGIE - LIBIDO - VITALITE" |
| `gel-costus` | Tagline "VITALITE • ENERGIE • BIEN-ÊTRE INTIME" |
| `gel-chardon` | Tagline "FOIE - DETOX - DIGESTION" |
| `gel-termis` | Tagline "FOIE • DÉTOX • DIGESTION" |
| `gel-fenugrec` | Tagline "APPÉTIT • DIGESTION • ÉQUILIBRE" (proche de l'allégation interdite "prise de poids") |
| `hl-arthrose` | Badge "Pure & Efficace" + nom produit visible "Arthrose Polyarthrite" |

## Priorité Haute (9)

| Produit | Texte à supprimer du visuel |
|---|---|
| `gel-valeriane` | Tagline "SOMMEIL • STRESS • RELAXATION" |
| `gel-ashwaganda` | Tagline "ENERGIE • STRESS • CONCENTRATION" + orthographe "ASHWAGANDA" → corriger en "Ashwagandha" |
| `gel-gingembre-curcuma` | Tagline "DIGESTION • IMMUNITÉ • ARTICULATIONS" |
| `gel-spiruline` | Tagline "ÉNERGIE • IMMUNITÉ • DÉTOX" |
| `gel-moringa` | Tagline "ÉNERGIE • IMMUNITÉ • VITALITÉ" |
| `hl-nigelle` | Badges "Pure & Efficace" / "Naturelle & Biologique" |
| `hl-rose-blanc` | Badge "Riche & Efficace" |
| `miel-shilajit` | Tagline "Energie & Vitalité" |
| `pdr-gingembre-curcuma` | Mention « ... pour soutenir la vitalité et le bien-être général » |

## Priorité Moyenne (3)

| Produit | Texte à supprimer du visuel |
|---|---|
| `miel-cactus` | Tagline "PURETÉ & RÉSISTANCE" |
| `br-eau-rose` | Tagline "Fraîcheur & Pureté Naturelle" |
| `grn-lavande` | Mention « ... parfum apaisant et ses usages traditionnels en infusion » |

---

## Annexe — constat complémentaire (hors visuels)

Lors de la vérification finale, 17 mentions textuelles visibles "Rayève Naturals" /
"Maison Rayève" ont été repérées dans les champs `prov` (provenance) de la fiche
produit — distinctes des visuels ci-dessus, non générées par les nouvelles images,
et non modifiées dans ce commit (hors périmètre demandé) :

- `miel-cactus` (1) : `prov:"Préparé artisanalement par Rayève Naturals, ..."`
- `br-sublimante`, `br-eau-rose`, `br-apaisante`, `br-nila` (4, via `SUPPLIER_PATCHES`) : même formulation "Rayève Naturals"
- 12 produits `vt-*` (catégorie Mode) : `prov:"Maison Rayève"`

Priorité suggérée : **Critique** (cohérence de marque Dar Nūr) — à traiter dans une
tâche dédiée de remplacement de texte (hors scope de cette validation visuelle).
