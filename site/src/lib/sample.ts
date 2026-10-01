/**
 * Échantillon RÉEL lu dans Supabase au build, pour prouver la chaîne
 * Astro build → Supabase → HTML statique (étape 5). Ce n'est PAS une sélection
 * éditoriale : les premiers produits publiés (ordre admin) de quelques catégories
 * dont les photos sont de vraies photos produit sans filigrane (vérifié le 01/10/2026).
 *
 * Mis en cache : une seule série de requêtes par build, quel que soit le nombre de pages.
 */
import type { Brand, ProductSummary } from '@/types/catalog';
import { toProductSummary } from './catalog';
import {
  countActiveProducts,
  fetchBrands,
  fetchCategories,
  fetchFirstWithVariantAxis,
  fetchProductsByCategory,
  isSupabaseConfigured,
  type SupabaseCategoryRow,
  type SupabaseProductRow,
} from './supabase';

export const SAMPLE_CATEGORIES = ['parfums', 'vetements', 'qamis', 'chaussures'] as const;
const PER_CATEGORY = 2;

export interface CatalogSample {
  configured: boolean;
  fetchedAt: string;
  activeProductCount: number | null;
  categories: SupabaseCategoryRow[];
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
      brands: [],
      rows: [],
      products: [],
      variantExamples: {},
    };
  }
  const [categories, brandRows, activeProductCount, format, contenance, taille, ...perCategory] =
    await Promise.all([
      fetchCategories(),
      fetchBrands(),
      countActiveProducts(),
      fetchFirstWithVariantAxis('format'),
      fetchFirstWithVariantAxis('contenance'),
      fetchFirstWithVariantAxis('taille'),
      ...SAMPLE_CATEGORIES.map((id) => fetchProductsByCategory(id, PER_CATEGORY)),
    ]);
  const rows = (perCategory as SupabaseProductRow[][]).flat();
  return {
    configured: true,
    fetchedAt,
    activeProductCount,
    categories,
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

/** Un produit par catégorie de l'échantillon (vitrine de démonstration). */
export function onePerCategory(sample: CatalogSample): ProductSummary[] {
  return SAMPLE_CATEGORIES.map((id) => sample.rows.findIndex((r) => r.category_id === id))
    .filter((index) => index >= 0)
    .map((index) => sample.products[index]!)
    .filter(Boolean);
}
