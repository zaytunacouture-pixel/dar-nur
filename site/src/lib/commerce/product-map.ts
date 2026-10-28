import { SHOPIFY_CATALOG_SOURCE } from './mode.ts';

export const EXCLUDED_SLUGS = [
  'miel-blanc-kirghizistan',
  'miel-rose-siberie',
  'miel-fraise-russie',
  'miel-lavande',
  'miel-shilajit',
] as const;
const EXCLUDED_TITLES = [
  'Miel Blanc du Kirghizistan',
  'Miel Rose de Sibérie',
  'Miel de Fraise de Russie',
  'Miel de Lavande',
  'Miel Noir de Shilajit',
];
export const isExcluded = (slug: string, title = ''): boolean =>
  EXCLUDED_SLUGS.some((value) => value === slug) || EXCLUDED_TITLES.includes(title.trim());

export interface ShopifyVariant {
  id: number;
  title: string;
  options: string[];
  price: string | null;
  available: boolean;
}
export interface ShopifyProduct {
  id: number;
  handle: string;
  title: string;
  variants: ShopifyVariant[];
}
export interface ShopifyCatalog {
  schemaVersion: 1;
  needsGeneration: boolean;
  fetchedAt: string | null;
  source: string;
  products: ShopifyProduct[];
}
export interface SourceVariant {
  id: string;
  active: boolean;
  price: number | null;
  options: Record<string, string> | null;
  product_variant_options: {
    option_type_id: string;
    option_values: { label: string; code: string } | null;
  }[];
}
export interface SourceProduct {
  id: string;
  slug: string;
  status: 'published';
  availability: 'available' | 'on_demand' | 'coming_soon' | 'out_of_stock' | null;
  price_value: number | null;
  variant_axes: string[] | null;
  product_variants: SourceVariant[];
}
export interface Anomaly {
  code: string;
  severity: 'blocking' | 'warning';
  slug: string;
  detail: string;
}
export interface VariantMatch {
  supabaseVariantId: string | null;
  shopifyVariantId: number | null;
  options: string[];
  available: boolean | null;
  supabaseAvailable: boolean;
  supabasePrice: number | null;
  shopifyPrice: string | null;
}
export interface ProductMatch {
  supabaseProductId: string | null;
  slug: string;
  shopifyProductId: number | null;
  shopifyHandle: string | null;
  status: { supabase: 'published' | 'absent'; shopify: 'public' | 'absent' };
  excluded: boolean;
  requiresVariant: boolean;
  matchStatus: 'matched' | 'unmatched' | 'ambiguous' | 'excluded';
  variants: VariantMatch[];
  anomalies: Anomaly[];
}
export interface ProductMap {
  schemaVersion: 1;
  needsGeneration: boolean;
  generatedAt: string | null;
  catalogFetchedAt: string | null;
  /** Projection publique : permet de recalculer toutes les décisions sans réseau. */
  sourceProducts: SourceProduct[];
  entries: ProductMatch[];
  anomalies: Anomaly[];
}

export const isShopifyId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Normalisation `norm` de build-import.js, reprise sans modifier les slugs/handles. */
export function normalizeOption(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const optionKey = (options: string[]) => JSON.stringify(options.map(normalizeOption));

/** Axes de l'import : variant_axes, sinon clés du jsonb. Valeur normalisée en repli. */
function sourceOptions(product: SourceProduct, variant: SourceVariant): string[] {
  const first = product.product_variants.find((v) => v.active);
  const axes = product.variant_axes?.length ? product.variant_axes : Object.keys(first?.options ?? {});
  const effectiveAxes = axes.length
    ? axes
    : variant.product_variant_options.map((o) => o.option_type_id).sort();
  return effectiveAxes.map(
    (axis) =>
      variant.options?.[axis] ??
      variant.product_variant_options.find(
        (o) => o.option_type_id === (axis === 'format' ? 'contenance' : axis),
      )?.option_values?.label ??
      '',
  );
}

function anomaly(
  code: string,
  slug: string,
  detail: string,
  severity: Anomaly['severity'] = 'blocking',
): Anomaly {
  return { code, severity, slug, detail };
}
const canOrder = (p: SourceProduct) => p.availability === 'available' || p.availability === 'on_demand';
const cents = (price: number | string | null): number | null => {
  if (price === null || (typeof price === 'string' && !/^\d+(\.\d{1,2})?$/.test(price))) return null;
  const n = Number(price);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function buildProductMap(
  sourceProducts: SourceProduct[],
  catalog: ShopifyCatalog,
  generatedAt: string,
): ProductMap {
  assertCatalog(catalog);
  assertSources(sourceProducts);
  const entries: ProductMatch[] = [];
  const slugs = [
    ...new Set([...sourceProducts.map((p) => p.slug), ...catalog.products.map((p) => p.handle)]),
  ].sort();
  for (const slug of slugs) {
    const sources = sourceProducts.filter((p) => p.slug === slug);
    const shops = catalog.products.filter((p) => p.handle === slug);
    const p = sources.length === 1 ? sources[0] : undefined;
    const s = shops.length === 1 ? shops[0] : undefined;
    const excluded = isExcluded(slug) || shops.some((p) => isExcluded(p.handle, p.title));
    const entry: ProductMatch = {
      supabaseProductId: p?.id ?? null,
      slug,
      shopifyProductId: s?.id ?? null,
      shopifyHandle: s?.handle ?? null,
      status: {
        supabase: sources.length ? 'published' : 'absent',
        shopify: shops.length ? 'public' : 'absent',
      },
      excluded,
      requiresVariant: Boolean(p?.product_variants.length),
      matchStatus: excluded
        ? 'excluded'
        : sources.length > 1 || shops.length > 1
          ? 'ambiguous'
          : p && s
            ? 'matched'
            : 'unmatched',
      variants: [],
      anomalies: [],
    };
    const add = (code: string, detail: string, severity?: Anomaly['severity']) =>
      entry.anomalies.push(anomaly(code, slug, detail, severity));
    if (excluded) add('excluded-present', 'Référence définitivement exclue présente dans une source.');
    if (sources.length > 1 || shops.length > 1)
      add(
        'multiple-products',
        `${sources.length} produit(s) Supabase / ${shops.length} produit(s) Shopify : aucun choix.`,
      );
    if (!sources.length)
      add(
        'shopify-only',
        'Absent du catalogue Supabase publié : origine inconnue (SumUp, brouillon ou archive possibles).',
        'warning',
      );
    if (!shops.length) add('supabase-only', 'Absent du catalogue Shopify public (publication inconnue).');
    if (p && s && !excluded) {
      const active = p.product_variants.filter((v) => v.active);
      const candidates = active.map((v) => ({
        id: v.id as string | null,
        options: sourceOptions(p, v),
        price: v.price,
      }));
      if (!p.product_variants.length) candidates.push({ id: null, options: [], price: p.price_value });
      if (p.product_variants.length && !active.length)
        add('no-active-variant', 'Aucune variante Supabase active.');
      const used = new Set<number>();
      for (const v of candidates) {
        const key = optionKey(v.options);
        const peers = candidates.filter((other) => optionKey(other.options) === key);
        const matches =
          v.id === null
            ? s.variants.length === 1
              ? s.variants
              : []
            : v.options.length && v.options.every((o) => normalizeOption(o))
              ? s.variants.filter((sv) => optionKey(sv.options) === key)
              : [];
        const ambiguous = peers.length > 1 || matches.length > 1;
        const sv = !ambiguous && matches.length === 1 ? matches[0] : undefined;
        if (ambiguous) add('ambiguous-variant', `${v.id ?? 'sans variante'} : options ${key}, aucun choix.`);
        else if (!sv)
          add('supabase-variant-only', `${v.id ?? 'sans variante'} : aucune variante Shopify unique valide.`);
        if (sv) used.add(sv.id);
        entry.variants.push({
          supabaseVariantId: v.id,
          shopifyVariantId: sv?.id ?? null,
          options: v.options,
          available: sv?.available ?? null,
          supabaseAvailable: canOrder(p),
          supabasePrice: v.price,
          shopifyPrice: sv?.price ?? null,
        });
        if (cents(v.price) === null || (sv && cents(sv.price) === null))
          add('missing-price', `${v.id ?? 'produit'} : prix absent ou non positif.`);
        else if (sv && cents(v.price) !== cents(sv.price))
          add('price-difference', `${v.id ?? 'produit'} : Supabase ${v.price} / Shopify ${sv.price}.`);
        if (sv && canOrder(p) !== sv.available)
          add(
            'availability-difference',
            `${v.id ?? 'produit'} : Supabase ${p.availability} / Shopify ${sv.available}.`,
            'warning',
          );
      }
      for (const sv of s.variants)
        if (!used.has(sv.id))
          add('shopify-variant-only', `${sv.id} : aucune variante Supabase correspondante.`);
      if (!s.variants.length) add('no-shopify-variant', 'Produit Shopify sans variante.');
      if (entry.anomalies.some((a) => a.severity === 'blocking'))
        entry.matchStatus = entry.anomalies.some((a) => a.code === 'ambiguous-variant')
          ? 'ambiguous'
          : 'unmatched';
    }
    entries.push(entry);
  }
  return {
    schemaVersion: 1,
    needsGeneration: catalog.needsGeneration,
    generatedAt,
    catalogFetchedAt: catalog.fetchedAt,
    sourceProducts: [...sourceProducts].sort(
      (a, b) => a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id),
    ),
    entries,
    anomalies: entries.flatMap((e) => e.anomalies),
  };
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function record(value: unknown): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Objet attendu.');
}
const text = (v: unknown) => typeof v === 'string' && v.length > 0;
const nullablePrice = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));

export function assertCatalog(value: unknown): asserts value is ShopifyCatalog {
  record(value);
  requireValue(
    value['schemaVersion'] === 1 &&
      typeof value['needsGeneration'] === 'boolean' &&
      value['source'] === SHOPIFY_CATALOG_SOURCE &&
      Array.isArray(value['products']),
    'Structure/source du catalogue Shopify invalide.',
  );
  requireValue(
    value['needsGeneration']
      ? value['fetchedAt'] === null && !value['products'].length
      : timestamp(value['fetchedAt']),
    'Date/marqueur du catalogue invalide.',
  );
  const ids = new Set<number>();
  const variantIds = new Set<number>();
  for (const p of value['products']) {
    record(p);
    requireValue(
      isShopifyId(p['id']) &&
        !ids.has(p['id']) &&
        typeof p['handle'] === 'string' &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p['handle']) &&
        text(p['title']) &&
        Array.isArray(p['variants']),
      'Produit Shopify invalide ou ID dupliqué.',
    );
    ids.add(p['id']);
    for (const v of p['variants']) {
      record(v);
      requireValue(
        isShopifyId(v['id']) &&
          !variantIds.has(v['id']) &&
          typeof v['title'] === 'string' &&
          Array.isArray(v['options']) &&
          v['options'].every((o: unknown) => typeof o === 'string') &&
          typeof v['available'] === 'boolean' &&
          (v['price'] === null || (typeof v['price'] === 'string' && /^\d+(\.\d{1,2})?$/.test(v['price']))),
        'Variante Shopify invalide ou ID dupliqué.',
      );
      variantIds.add(v['id']);
    }
  }
}

function assertSources(value: unknown): asserts value is SourceProduct[] {
  requireValue(Array.isArray(value), 'Liste source Supabase attendue.');
  const ids = new Set<string>();
  const variants = new Set<string>();
  for (const p of value) {
    record(p);
    requireValue(
      text(p['id']) &&
        text(p['slug']) &&
        p['status'] === 'published' &&
        [null, 'available', 'on_demand', 'coming_soon', 'out_of_stock'].includes(
          p['availability'] as string | null,
        ) &&
        nullablePrice(p['price_value']) &&
        (p['variant_axes'] === null || (Array.isArray(p['variant_axes']) && p['variant_axes'].every(text))) &&
        Array.isArray(p['product_variants']),
      'Produit source Supabase invalide.',
    );
    const id = p['id'] as string;
    requireValue(!ids.has(id), 'ID Supabase produit dupliqué.');
    ids.add(id);
    for (const v of p['product_variants']) {
      record(v);
      requireValue(
        text(v['id']) &&
          typeof v['active'] === 'boolean' &&
          nullablePrice(v['price']) &&
          Array.isArray(v['product_variant_options']),
        'Variante source invalide.',
      );
      const variantId = v['id'] as string;
      requireValue(!variants.has(variantId), 'ID Supabase variante dupliqué.');
      variants.add(variantId);
      if (v['options'] !== null) {
        record(v['options']);
        requireValue(
          Object.values(v['options']).every((o) => typeof o === 'string'),
          'Options jsonb invalides.',
        );
      }
      for (const o of v['product_variant_options']) {
        record(o);
        requireValue(text(o['option_type_id']), 'Axe invalide.');
        if (o['option_values'] !== null) {
          record(o['option_values']);
          requireValue(
            text(o['option_values']['label']) && text(o['option_values']['code']),
            'Valeur normalisée invalide.',
          );
        }
      }
    }
  }
}

/** Comparaison indépendante de l'ordre des propriétés JSON, mais pas des listes. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function validateProductMap(
  value: unknown,
  catalog: unknown,
): {
  structuralErrors: string[];
  anomalies: Anomaly[];
  blockingCount: number;
  ready: boolean;
} {
  try {
    assertCatalog(catalog);
    record(value);
    requireValue(
      value['schemaVersion'] === 1 &&
        typeof value['needsGeneration'] === 'boolean' &&
        Array.isArray(value['entries']) &&
        Array.isArray(value['anomalies']),
      'Structure de table invalide.',
    );
    assertSources(value['sourceProducts']);
    const pending = value['needsGeneration'];
    requireValue(
      pending === catalog.needsGeneration &&
        value['catalogFetchedAt'] === catalog.fetchedAt &&
        (pending
          ? value['generatedAt'] === null && !value['sourceProducts'].length
          : timestamp(value['generatedAt'])),
      'Génération/date de la table incohérente avec le catalogue.',
    );
    const rebuilt = buildProductMap(
      value['sourceProducts'],
      catalog,
      (value['generatedAt'] as string | null) ?? '',
    );
    requireValue(
      canonical(value['entries']) === canonical(rebuilt.entries) &&
        canonical(value['anomalies']) === canonical(rebuilt.anomalies),
      'Table incohérente : IDs, options, prix, disponibilité, exclusions ou anomalies diffèrent des sources.',
    );
    const anomalies = [...rebuilt.anomalies];
    if (pending || !value['sourceProducts'].length || !catalog.products.length)
      anomalies.push(
        anomaly(
          'not-generated',
          '',
          'Instantané/table à générer, catalogues non vides requis pour activer Shopify.',
        ),
      );
    return {
      structuralErrors: [],
      anomalies,
      blockingCount: anomalies.filter((a) => a.severity === 'blocking').length,
      ready: !pending && value['sourceProducts'].length > 0 && catalog.products.length > 0,
    };
  } catch (error) {
    return {
      structuralErrors: [error instanceof Error ? error.message : String(error)],
      anomalies: [],
      blockingCount: 0,
      ready: false,
    };
  }
}
