/**
 * Accueil (étape 9) — CHOIX ÉDITORIAUX versionnés. Ce n'est PAS un classement commercial :
 * aucune donnée de vente n'existe en base. Les slugs sont explicites et figés ; le build
 * ÉCHOUE (src/lib/home-page.ts) si l'un d'eux disparaît, passe en brouillon, perd son image ou
 * figure dans la liste d'exclusion — jamais de remplacement silencieux par un autre produit.
 *
 * Critères de choix (audit des images du 3 octobre 2026) : produits publiés et commandables,
 * vraies photos sans texte incrusté illisible ni filigrane ni identité fournisseur, hors dossier
 * `assets/produits-ia/` (visuels générés, point ouvert) et hors affiches promotionnelles.
 */

/**
 * Visuel du hero : la 1ʳᵉ photo de ce produit. Bakhur Mukhalat : vraie photo (boîte ciselée sur
 * bois et mousse), carrée 1 100 px, sans texte ni filigrane, accordée au vert et à l'or de la
 * charte ; le recadrage 4:3 du préréglage HERO garde la boîte et le couvercle entiers.
 */
export const HOME_HERO = {
  productSlug: 'dn-bakhour-0',
  alt: 'Bakhur Mukhalat dans sa boîte ciselée, couvercle ouvert',
  /** CTA principal : l'univers du produit photographié (§I.2). */
  universeSlug: 'parfums-soins',
} as const;

/**
 * Les trois univers, dans l'ordre du menu. `imageProduct` : photo décorative de la carte
 * (1ʳᵉ image du produit). `collections` : entrées directes affichées sous chaque univers
 * (Huiles et Brumes ne sont pas reprises : les 16 huiles sont toutes « bientôt disponibles »,
 * et une liste de 6 alourdirait le bloc).
 */
export const HOME_UNIVERSES = [
  {
    slug: 'miels-herboristerie',
    imageProduct: 'miel-lavande',
    collections: ['miels', 'miels-gourmands', 'poudres', 'gelules'],
  },
  {
    slug: 'parfums-soins',
    imageProduct: 'dn-lecode-galaxie',
    collections: ['parfums', 'tahara', 'parfums-interieur', 'soins'],
  },
  {
    slug: 'mode',
    imageProduct: 'vt-aicha-vert-sapin',
    collections: ['abayas', 'qamis', 'chaussures', 'accessoires'],
  },
] as const;

/**
 * « À découvrir » : 8 produits, tous les univers, ordre d'affichage = ordre de la liste.
 * `mg-mangue-fraise` est le seul produit marqué `featured` en admin.
 */
export const HOME_FEATURED_PRODUCTS = [
  'mg-mangue-fraise',
  'dn-lecode-blue-addict',
  'vt-layali-beige',
  'dn-musc-tahara-grenade',
  'qms-blanc',
  'savon-noir-karite',
  'dn-sandale-homme-0',
  'dn-lecode-jardin-persan',
] as const;

/**
 * Bloc éditorial Miels. Faits confirmés (CLOTURE_LOT1_MIELS_DAR_NUR.md) : le miel de printemps
 * est récolté en France ; il sert de base aux miels gourmands aux fruits (gamme `mg-*`) ; d'autres
 * miels ont une autre provenance (Russie, Kirghizistan). Jamais de lieu de récolte précis.
 */
export const HOME_HONEY = {
  imageProduct: 'miel-printemps',
  alt: 'Pot de miel de printemps',
  collectionSlug: 'miels',
  secondarySlug: 'miels-gourmands',
} as const;

/**
 * Jamais mis en avant sur l'accueil, quel que soit le choix ci-dessus (le build échoue si l'un
 * d'eux y figure). `miel-myrtille` : mention de test relevée à l'étape 8, non corrigée en base.
 */
export const HOME_EXCLUDED_PRODUCTS = ['miel-myrtille'] as const;
