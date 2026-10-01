/**
 * Lecture Supabase — LECTURE SEULE, au build uniquement.
 *
 * - PostgREST par `fetch` natif (pas de SDK : aucune dépendance, rien dans le bundle client).
 * - Clé « publishable » (publique par conception, lecture filtrée par RLS). Aucune clé
 *   service_role / sb_secret n'est acceptée : on refuse explicitement ce préfixe.
 * - Colonnes TOUJOURS listées explicitement : jamais de `select=*`, pour ne jamais
 *   embarquer une colonne privée (prix d'achat, données fournisseur…) dans le HTML.
 * - Aucune méthode d'écriture n'existe dans ce module.
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL } from 'astro:env/server';

export interface SupabaseVariantRow {
  name: string;
  price: number | null;
  active: boolean;
  sort_order: number | null;
  options: Record<string, string> | null;
}

export interface SupabaseProductRow {
  slug: string;
  name: string;
  category_id: string;
  tagline: string | null;
  price_value: number | null;
  images: string[] | null;
  brand: string | null;
  brand_slug: string | null;
  coming_soon: boolean;
  featured: boolean;
  variant_axes: string[] | null;
  product_variants: SupabaseVariantRow[];
}

export interface SupabaseCategoryRow {
  id: string;
  label: string;
  filter_label: string | null;
  sort_order: number | null;
}

export interface SupabaseBrandRow {
  id: string;
  name: string;
}

export const PRODUCT_COLUMNS =
  'slug,name,category_id,tagline,price_value,images,brand,brand_slug,coming_soon,featured,variant_axes,' +
  'product_variants(name,price,active,sort_order,options)';

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Origine publique des fichiers relatifs (`assets/...`) référencés en base. */
export const LEGACY_MEDIA_ORIGIN = 'https://dar-nur.fr';

async function select<T>(table: string, query: Record<string, string>): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_ANON_KEY).');
  }
  if (!SUPABASE_ANON_KEY.startsWith('sb_publishable_')) {
    // Refus de toute autre clé (sb_secret_, service_role JWT…) : rien de privé dans un build statique.
    throw new Error('SUPABASE_ANON_KEY doit être la clé « sb_publishable_… » (lecture publique).');
  }
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    method: 'GET',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Échec bruyant : une page générée sur des données manquantes est pire qu'un build en échec.
    throw new Error(`Supabase ${table} : HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T[];
}

/** Produits publiés (active = true) d'une catégorie, dans l'ordre défini en admin. */
export function fetchProductsByCategory(categoryId: string, limit: number): Promise<SupabaseProductRow[]> {
  return select<SupabaseProductRow>('products', {
    select: PRODUCT_COLUMNS,
    active: 'eq.true',
    category_id: `eq.${categoryId}`,
    order: 'sort_order.asc',
    limit: String(limit),
  });
}

/** Premier produit publié qui porte un axe de variante donné (ex. « format »). */
export async function fetchFirstWithVariantAxis(axis: string): Promise<SupabaseProductRow | undefined> {
  const rows = await select<SupabaseProductRow>('products', {
    select: PRODUCT_COLUMNS,
    active: 'eq.true',
    variant_axes: `cs.{${axis}}`,
    order: 'sort_order.asc',
    limit: '1',
  });
  return rows[0];
}

export function fetchCategories(): Promise<SupabaseCategoryRow[]> {
  return select<SupabaseCategoryRow>('categories', {
    select: 'id,label,filter_label,sort_order',
    order: 'sort_order.asc',
  });
}

export function fetchBrands(): Promise<SupabaseBrandRow[]> {
  return select<SupabaseBrandRow>('brands', {
    select: 'id,name',
    active: 'eq.true',
    order: 'sort_order.asc',
  });
}

/** Nombre de produits publiés (en-tête Content-Range de PostgREST). */
export async function countActiveProducts(): Promise<number | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const url = new URL('/rest/v1/products', SUPABASE_URL);
  url.searchParams.set('select', 'slug');
  url.searchParams.set('active', 'eq.true');
  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: 'count=exact',
    },
    signal: AbortSignal.timeout(15_000),
  });
  const total = response.headers.get('content-range')?.split('/')[1];
  return total && total !== '*' ? Number(total) : null;
}
