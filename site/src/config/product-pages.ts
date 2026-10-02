/**
 * Fiches produit (étape 8) : règles d'affichage par FAMILLE de produits.
 *
 * Un seul gabarit (ProductTemplate.astro) ; ces règles décident seulement quelles sections
 * conditionnelles il montre. Chaque section n'apparaît que si sa donnée existe en base.
 *
 * Famille = univers racine de la collection principale, sauf les parfums (collection).
 */
import type { VariantAxis, VariantPresentation } from '@/types/catalog';

export type ProductFamily = 'bien-etre' | 'parfum' | 'mode';

/** Collections « parfum » (titre SEO {Nom} – {concentration} {marque}, notes olfactives). */
export const PERFUME_COLLECTIONS = ['parfums', 'parfums-interieur'];

/** Univers racine de la Mode (tailles, guide des tailles, couleurs). */
export const MODE_UNIVERSE = 'mode';

/**
 * `products.benefits` (liste à puces) n'est affiché QUE pour les parfums et la mode
 * (profil olfactif, coupe). Pour le bien-être (miels, gélules, poudres, huiles, soins,
 * brumes, tahara), la liste contient des allégations de santé (« Renforce l'immunité »,
 * « Soulage les douleurs dentaires »…) : elle n'est pas rendue tant qu'elle n'a pas été
 * réécrite (docs/REFONTE_ASTRO.md, « Fiches produit »).
 */
export const BENEFITS_FAMILIES: ProductFamily[] = ['parfum', 'mode'];

/**
 * Vocabulaire FERMÉ des concentrations / types de parfum. Une concentration n'est retenue
 * que si l'accroche COMMENCE par l'un de ces termes, ou si un élément de `benefits` lui est
 * exactement égal (Gulf Collection : « Extrait de parfum »). Jamais déduite du nom.
 */
export const PERFUME_TYPES = [
  'Extrait de parfum',
  'Eau de parfum',
  'Eau de toilette',
  'Eau de Cologne',
  'Spray parfumé',
] as const;

/** Type ajouté au title SEO quand le nom ne le dit pas (parfums d'intérieur sans type connu). */
export const TITLE_TYPE_FALLBACK: Record<string, string> = {
  'parfums-interieur': 'Parfum d’intérieur',
};

/** Axes de variante : légende, paramètre d'URL (?contenance=200-g) et présentation (§M.1). */
export const AXES: Record<
  string,
  { axis: VariantAxis; legend: string; param: string; presentation: VariantPresentation; verb: string }
> = {
  contenance: {
    axis: 'contenance',
    legend: 'Contenance',
    param: 'contenance',
    presentation: 'format',
    verb: 'une contenance',
  },
  taille: { axis: 'taille', legend: 'Taille', param: 'taille', presentation: 'text', verb: 'une taille' },
  couleur: {
    axis: 'couleur',
    legend: 'Couleur',
    param: 'couleur',
    presentation: 'thumbnail',
    verb: 'une couleur',
  },
  motif: { axis: 'motif', legend: 'Motif', param: 'motif', presentation: 'thumbnail', verb: 'un motif' },
  senteur: {
    axis: 'senteur',
    legend: 'Senteur',
    param: 'senteur',
    presentation: 'text',
    verb: 'une senteur',
  },
};

/** Ordre d'affichage des axes (couleur avant taille, comme le dictionnaire option_types). */
export const AXIS_ORDER = ['couleur', 'motif', 'senteur', 'contenance', 'taille'];

/** Nombre de produits « Dans la même collection ». */
export const SIMILAR_COUNT = 4;

/** Libellés de disponibilité (4 états de `products.availability`, §28 de la consigne). */
export const AVAILABILITY_LABELS = {
  available: 'Disponible',
  on_demand: 'Sur commande',
  coming_soon: 'Bientôt disponible',
  out_of_stock: 'Épuisé',
} as const;

/** Unités certaines de `option_values.unit` / `products.net_unit` → base du prix unitaire. */
export const UNIT_BASES: Record<string, { factor: number; per: string }> = {
  g: { factor: 1000, per: 'kg' },
  kg: { factor: 1, per: 'kg' },
  ml: { factor: 1000, per: 'L' },
  l: { factor: 1, per: 'L' },
};
