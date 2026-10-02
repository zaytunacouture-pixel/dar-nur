/**
 * Échantillon RÉEL lu dans Supabase au build, pour prouver la chaîne
 * Astro build → Supabase → HTML statique (étape 5). Ce n'est PAS une sélection
 * éditoriale : les premiers produits publiés (ordre admin) de quelques collections
 * dont les photos sont de vraies photos produit sans filigrane (vérifié le 01/10/2026).
 * Depuis l'étape 6, l'échantillon est lu par COLLECTION PRINCIPALE (nouveau schéma) et
 * non plus par catégorie historique.
 *
 * Mis en cache : une seule série de requêtes par build, quel que soit le nombre de pages.
 */
import type { Brand, CollectionNode, ProductSummary } from '@/types/catalog';
import { toCollectionTree, toProductSummary } from './catalog';
import {
  countPublishedProducts,
  fetchBrands,
  fetchCategories,
  fetchCollections,
  fetchFirstWithVariantAxis,
  fetchProductsByPrimaryCollection,
  fetchPublicSettings,
  isSupabaseConfigured,
  type SupabaseCategoryRow,
  type SupabaseProductRow,
  type SupabaseSettingRow,
} from './supabase';

/** Slugs de collections (nouveau schéma) ; `chaussures` porte le libellé « Sandales ». */
export const SAMPLE_COLLECTIONS = ['parfums', 'abayas', 'qamis', 'chaussures'] as const;
const PER_CATEGORY = 2;

export interface CatalogSample {
  configured: boolean;
  fetchedAt: string;
  activeProductCount: number | null;
  /** Ancienne classification (lue par l'ancien site), affichée pour comparaison. */
  categories: SupabaseCategoryRow[];
  /** Nouvelle classification : arbre univers → collection → sous-collection. */
  collections: CollectionNode[];
  collectionCount: number;
  /** Paramètres globaux publics (la RLS masque les autres). */
  settings: SupabaseSettingRow[];
  brands: Brand[];
  rows: SupabaseProductRow[];
  products: ProductSummary[];
  /** Produits réels porteurs de variantes, pour la démonstration du sélecteur. */
  variantExamples: Partial<Record<'format' | 'contenance' | 'taille', SupabaseProductRow>>;
}

let cache: Promise<CatalogSample> | undefined;

async function load(): Promise<CatalogSample> {
  const fetchedAt = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      fetchedAt,
      activeProductCount: null,
      categories: [],
      collections: [],
      collectionCount: 0,
      settings: [],
      brands: [],
      rows: [],
      products: [],
      variantExamples: {},
    };
  }
  const [
    categories,
    collectionRows,
    settings,
    brandRows,
    activeProductCount,
    format,
    contenance,
    taille,
    ...perCollection
  ] = await Promise.all([
    fetchCategories(),
    fetchCollections(),
    fetchPublicSettings(),
    fetchBrands(),
    countPublishedProducts(),
    fetchFirstWithVariantAxis('format'),
    fetchFirstWithVariantAxis('contenance'),
    fetchFirstWithVariantAxis('taille'),
    ...SAMPLE_COLLECTIONS.map((slug) => fetchProductsByPrimaryCollection(slug, PER_CATEGORY)),
  ]);
  const rows = (perCollection as SupabaseProductRow[][]).flat();
  return {
    configured: true,
    fetchedAt,
    activeProductCount,
    categories,
    collections: toCollectionTree(collectionRows),
    collectionCount: collectionRows.length,
    settings,
    brands: brandRows.map((b) => ({ slug: b.id, name: b.name })),
    rows,
    products: rows.map(toProductSummary),
    variantExamples: {
      ...(format ? { format } : {}),
      ...(contenance ? { contenance } : {}),
      ...(taille ? { taille } : {}),
    },
  };
}

export function getCatalogSample(): Promise<CatalogSample> {
  cache ??= load();
  return cache;
}

/** Un produit par collection de l'échantillon (vitrine de démonstration). */
export function onePerCategory(sample: CatalogSample): ProductSummary[] {
  return SAMPLE_COLLECTIONS.map((slug) =>
    sample.products.findIndex((p) => p.primaryCollection?.slug === slug),
  )
    .filter((index) => index >= 0)
    .map((index) => sample.products[index]!)
    .filter(Boolean);
}
