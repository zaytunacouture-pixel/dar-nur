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
  /**
   * `contain` pour les packshots détourés sur blanc (aucun flacon coupé) ; `inside` garde
   * les proportions de la photo sans rien ajouter ni couper (galerie de fiche, étape 8).
   */
  fit?: 'cover' | 'contain' | 'inside';
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

/** Référence courte vers une collection (fil d'Ariane, collection principale d'un produit). */
export interface CollectionRef {
  slug: string;
  name: string;
  /** URL publique stockée en base (`collections.path`). */
  href: string;
}

/** Nœud de l'arbre univers → collection → sous-collection (étape 6). */
export interface CollectionNode {
  slug: string;
  name: string;
  /** Absente pour un filtre ou un regroupement interne (pas d'URL propre). */
  href?: string;
  type: 'universe' | 'collection' | 'subcollection' | 'filter' | 'group' | 'transverse';
  indexable: boolean;
  children: CollectionNode[];
}

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
  /** Collection principale (fil d'Ariane) ; n'influe jamais sur l'URL du produit. */
  primaryCollection?: CollectionRef;
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
  /**
   * Prix au kg / litre déjà calculé depuis une quantité et une unité CERTAINES (étape 8).
   * `null` = non calculable : aucun calcul de repli à partir du libellé.
   */
  unitPrice?: string | null;
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

/* ── Pages catalogue (étape 7) ─────────────────────────────────────────── */

/** Élément de fil d'Ariane ; le dernier est la page courante. */
export interface BreadcrumbItem {
  name: string;
  href: string;
}

/** Valeur de facette : `code` sert au fragment d'URL (#contenance=200-g). */
export interface FacetOption {
  code: string;
  label: string;
}

export interface FacetValue extends FacetOption {
  /** Produits de la page portant cette valeur (avant tout filtrage). */
  count: number;
}

export interface Facet {
  key: string;
  label: string;
  values: FacetValue[];
}

/** Produit d'une grille : la carte + les attributs nécessaires aux filtres et aux tris. */
export interface GridProduct {
  summary: ProductSummary;
  /** Codes de valeurs par facette (plusieurs possibles : contenances, tailles). */
  facets: Record<string, string[]>;
  /** Rang dans l'ordre « Sélection » (ordre admin). */
  order: number;
  /** Prix le plus bas réellement proposé ; null = prix sur demande (classé en fin). */
  minPrice: number | null;
  /** Date d'ajout au catalogue (AAAAMMJJ), pour le tri « Nouveautés ». */
  added: string;
}

/** Puce sous le H1 : lien vers une vraie page, ou filtre de la page (fragment). */
export type CollectionChip =
  | { kind: 'link'; label: string; href: string; current: boolean }
  | { kind: 'filter'; label: string; facet: string; code: string | null };

export type SortKey = 'selection' | 'prix-croissant' | 'prix-decroissant' | 'nouveautes';
