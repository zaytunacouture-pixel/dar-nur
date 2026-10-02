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

/** Option normalisée d'une variante (étape 6 : product_variant_options → option_values). */
export interface SupabaseVariantOptionRow {
  option_type_id: string;
  option_values: { code: string; label: string } | null;
}

export interface SupabaseVariantRow {
  name: string;
  price: number | null;
  active: boolean;
  sort_order: number | null;
  /** Ancien modèle (jsonb libre), conservé pendant la transition. */
  options: Record<string, string> | null;
  product_variant_options: SupabaseVariantOptionRow[];
}

/** Statut éditorial (étape 6) — distinct de la disponibilité commerciale. */
export type ProductStatus = 'draft' | 'published' | 'archived';
/** Disponibilité commerciale (étape 6). NULL en base = à arbitrer (coming_soon historique ambigu). */
export type ProductAvailability = 'available' | 'on_demand' | 'coming_soon' | 'out_of_stock';

export interface SupabaseCollectionRef {
  slug: string;
  path: string | null;
  name: string;
}

export interface SupabaseMediaRow {
  url: string;
  sort_order: number;
  variant_id: string | null;
  alt_text: string | null;
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
  status: ProductStatus;
  availability: ProductAvailability | null;
  net_quantity: number | null;
  net_unit: string | null;
  product_variants: SupabaseVariantRow[];
  product_collections: { role: 'primary' | 'secondary'; collections: SupabaseCollectionRef | null }[];
  product_media: SupabaseMediaRow[];
}

export interface SupabaseCollectionRow {
  id: string;
  slug: string;
  path: string | null;
  parent_id: string | null;
  type: 'universe' | 'collection' | 'subcollection' | 'filter' | 'group' | 'transverse';
  name: string;
  nav_label: string | null;
  h1: string | null;
  sort_order: number;
  is_indexable: boolean;
}

export interface SupabaseSettingRow {
  key: string;
  value: unknown;
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
  'status,availability,net_quantity,net_unit,' +
  'product_variants(name,price,active,sort_order,options,product_variant_options(option_type_id,option_values(code,label))),' +
  'product_collections(role,collections(slug,path,name)),' +
  'product_media(url,sort_order,variant_id,alt_text)';

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

/**
 * Produits publiés dont la collection PRINCIPALE est `collectionSlug`, dans l'ordre admin
 * (slug en second critère : les ex-aequo de sort_order ne dépendent plus de l'ordre physique).
 * L'alias `principale` filtre sans tronquer la liste complète product_collections.
 */
export function fetchProductsByPrimaryCollection(
  collectionSlug: string,
  limit: number,
): Promise<SupabaseProductRow[]> {
  return select<SupabaseProductRow>('products', {
    select: `${PRODUCT_COLUMNS},principale:product_collections!inner(collections!inner(slug))`,
    status: 'eq.published',
    'principale.role': 'eq.primary',
    'principale.collections.slug': `eq.${collectionSlug}`,
    order: 'sort_order.asc,slug.asc',
    limit: String(limit),
  });
}

/** Premier produit publié qui porte un axe de variante donné (ex. « format »). */
export async function fetchFirstWithVariantAxis(axis: string): Promise<SupabaseProductRow | undefined> {
  const rows = await select<SupabaseProductRow>('products', {
    select: PRODUCT_COLUMNS,
    status: 'eq.published',
    variant_axes: `cs.{${axis}}`,
    order: 'sort_order.asc,slug.asc',
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

/** Arbre des collections publiées (étape 6). L'URL est `path`, jamais déduite du parent. */
export function fetchCollections(): Promise<SupabaseCollectionRow[]> {
  return select<SupabaseCollectionRow>('collections', {
    select: 'id,slug,path,parent_id,type,name,nav_label,h1,sort_order,is_indexable',
    order: 'sort_order.asc,slug.asc',
  });
}

/** Paramètres globaux PUBLICS (la RLS ne renvoie que is_public = true). */
export function fetchPublicSettings(): Promise<SupabaseSettingRow[]> {
  return select<SupabaseSettingRow>('settings', { select: 'key,value', order: 'key.asc' });
}

export function fetchBrands(): Promise<SupabaseBrandRow[]> {
  return select<SupabaseBrandRow>('brands', {
    select: 'id,name',
    active: 'eq.true',
    order: 'sort_order.asc',
  });
}

/** Nombre de produits publiés — status = published (en-tête Content-Range de PostgREST). */
export async function countPublishedProducts(): Promise<number | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const url = new URL('/rest/v1/products', SUPABASE_URL);
  url.searchParams.set('select', 'slug');
  url.searchParams.set('status', 'eq.published');
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
