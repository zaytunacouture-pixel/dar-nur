/**
 * Types d'affichage du catalogue. Ils décrivent ce dont les composants ont besoin,
 * indépendamment du schéma Supabase (qui évoluera à l'étape 6) : seul
 * src/lib/catalog.ts traduit les lignes de la base vers ces types.
 */

/** Image prête à être passée au pipeline (astro:assets). */
export interface MediaImage {
  /** URL absolue (catalogue) ou import local (ImageMetadata). */
  src: string | ImageMetadata;
  alt: string;
  /** Dimensions de la source quand elles sont connues ; sinon déduites au build. */
  width?: number;
  height?: number;
  /** `contain` pour les packshots détourés sur blanc (aucun flacon coupé). */
  fit?: 'cover' | 'contain';
}

export interface Brand {
  /** Identifiant stable (= brand_slug en base). */
  slug: string;
  name: string;
}

export interface Collection {
  /** Identifiant de collection (catégorie Supabase ou future collection). */
  id: string;
  label: string;
  href: string;
  /** Univers parent (Miels & Herboristerie, Parfums & Soins, Mode). */
  universe?: UniverseId;
  productCount?: number;
  image?: MediaImage;
  description?: string;
}

export type UniverseId = 'miels-herboristerie' | 'parfums-soins' | 'mode';

/** Liste fermée de badges, un seul par carte, toujours issu d'une donnée (§G.2). */
export type BadgeKind = 'coming-soon' | 'sold-out' | 'offer' | 'new';

export type Availability = 'available' | 'coming-soon' | 'unavailable';

export type PriceInfo =
  | { kind: 'fixed'; amount: number; compareAt?: number }
  | { kind: 'from'; amount: number }
  | { kind: 'on-request' };

export interface ProductSummary {
  slug: string;
  name: string;
  href: string;
  brand?: Brand;
  image?: MediaImage;
  /** Seconde image (survol desktop), seulement si elle existe. */
  hoverImage?: MediaImage;
  price: PriceInfo;
  /** Une seule ligne utile : « 3 formats », « M à 2XL », « Eau de parfum · 100 ml ». */
  metaLine?: string;
  badge?: BadgeKind;
  availability: Availability;
  /** Nombre d'options s'il y a un choix à faire (la carte mène alors à la fiche). */
  variantCount: number;
}

/** Axes de variante gérés par le sélecteur unique (§M.1). */
export type VariantAxis = 'format' | 'contenance' | 'taille' | 'couleur' | 'motif' | 'senteur';

/** Forme visuelle de l'option : carte format + prix, bouton texte, miniature photo, pastille. */
export type VariantPresentation = 'format' | 'text' | 'thumbnail' | 'swatch';

export interface VariantOption {
  id: string;
  label: string;
  /** Prix propre à l'option (formats, contenances). */
  price?: number;
  /** Deuxième ligne d'un bouton texte (ex. stature) — uniquement si la donnée existe. */
  detail?: string;
  available: boolean;
  /** Miniature photo (couleur, motif). */
  image?: MediaImage;
  /** Couleur codée — uniquement si elle existe en base (§M.1). */
  swatch?: string;
  /** Lien vers une fiche sœur (couleurs aujourd'hui stockées en produits séparés). */
  href?: string;
}

/** Guide des tailles : n'est rendu que si de VRAIES mesures existent (§M.4). */
export interface SizeGuide {
  title: string;
  columns: [string, ...string[]];
  rows: string[][];
  howToMeasure?: string[];
}
