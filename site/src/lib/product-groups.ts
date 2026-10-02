/**
 * LAB des futurs regroupements Mode (étape 8) — INSPECTION SEULEMENT.
 *
 * Source : instantané versionné des propositions de l'étape 6 (src/data/lab/product-groupings.json,
 * tables réservées à l'admin, exportées en lecture par scripts/lab/export-product-groupings.mjs)
 * croisé avec le catalogue public lu au build (photos, prix, tailles, disponibilité).
 *
 * Rien n'est publié : pages /lab/regroupements/… en noindex, hors sitemap, sans lien depuis la
 * navigation publique ; les fiches actuelles, leurs URL et la table `redirects` ne changent pas.
 * Aucune décision n'est prise ici : les écarts sont listés pour le propriétaire.
 */
import { AXES } from '@/config/product-pages';
import snapshot from '@/data/lab/product-groupings.json';
import type { MediaImage, PriceInfo, VariantOption } from '@/types/catalog';
import { commercialAvailability } from './catalog';
import { getCatalog, type Catalog, type CatalogProduct } from './catalog-store';
import { formatPrice } from './format';
import {
  accordionsOf,
  breadcrumbOf,
  familyOf,
  productGallery,
  type ProductAxisView,
  type ProductPageView,
  type ProductVariantData,
} from './product-page';
import type { ProductAvailability } from './supabase';

type Snapshot = (typeof snapshot)['groupings'][number];

export interface GroupMemberView {
  slug: string;
  /** Nom actuel (catalogue public) ; null si la fiche n'est plus publiée. */
  name: string | null;
  href: string;
  /** Libellé de couleur / senteur / motif proposé à l'étape 6. */
  label: string | null;
  labelSource: string;
  images: MediaImage[];
  priceLabel: string;
  minPrice: number | null;
  sizes: string[];
  availability: ProductAvailability | null;
  isBase: boolean;
}

export interface GroupView {
  code: string;
  kind: string;
  decision: string;
  proposedName: string | null;
  proposedSlug: string | null;
  axisLabel: string | null;
  note: string | null;
  members: GroupMemberView[];
  /** Écarts factuels à trancher (prix, tailles, libellés, photos, slug). */
  issues: string[];
  /** Aperçu de la fiche fusionnée (regroupements sûrs seulement). */
  previewPath: string | null;
}

export interface GroupsPage {
  exportedAt: string;
  safe: GroupView[];
  review: GroupView[];
  /** Slugs futurs à l'étude hors regroupements (ex. Khamrah) : rien n'est appliqué. */
  futureSlugs: { label: string; current: string | null; future: string; issues: string[] }[];
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];
const SOURCE_LABELS: Record<string, string> = {
  product_name: 'tiré du nom de la fiche',
  photo: 'lu sur la photo — à confirmer',
  interpreted: 'interprété — à confirmer',
  unknown: 'non renseigné',
};
export const labelSourceText = (source: string) => SOURCE_LABELS[source] ?? source;

export const previewPathOf = (code: string) => `/lab/regroupements/${code.toLowerCase()}/`;

function sizesOf(product: CatalogProduct): string[] {
  return product.taille.map((t) => t.label).sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
}

function memberOf(catalog: Catalog, group: Snapshot, member: Snapshot['members'][number]): GroupMemberView {
  const product = catalog.products.find((p) => p.slug === member.slug);
  return {
    slug: member.slug,
    name: product?.name ?? null,
    href: `/${member.slug}/`,
    label: member.label,
    labelSource: member.labelSource,
    images: product ? productGallery(catalog, product.row) : [],
    priceLabel: product ? priceText(product.summary.price) : '—',
    minPrice: product?.minPrice ?? null,
    sizes: product ? sizesOf(product) : [],
    availability: product ? commercialAvailability(product.row) : null,
    isBase: member.slug === group.baseSlug,
  };
}

function priceText(price: PriceInfo): string {
  if (price.kind === 'on-request') return 'Prix sur demande';
  return price.kind === 'from' ? `dès ${formatPrice(price.amount)}` : formatPrice(price.amount);
}

/** Écarts visibles entre les fiches d'un groupe : aucun n'est corrigé, tous sont listés. */
function issuesOf(catalog: Catalog, group: Snapshot, members: GroupMemberView[]): string[] {
  const issues: string[] = [];
  const missing = members.filter((m) => m.name === null);
  if (missing.length)
    issues.push(`Fiche(s) absente(s) du catalogue publié : ${missing.map((m) => m.slug).join(', ')}.`);
  const present = members.filter((m) => m.name !== null);

  const prices = new Map<string, number>();
  for (const m of present) prices.set(m.priceLabel, (prices.get(m.priceLabel) ?? 0) + 1);
  if (prices.size > 1)
    issues.push(
      `Prix différents selon la fiche : ${[...prices].map(([p, n]) => `${p} (${n} fiche${n > 1 ? 's' : ''})`).join(', ')}.`,
    );

  const names = new Set(present.map((m) => m.name));
  if (names.size === 1 && present.length > 1)
    issues.push(
      `Les ${present.length} fiches portent aujourd’hui exactement le même nom (« ${[...names][0]} »).`,
    );

  const withSizes = present.filter((m) => m.sizes.length > 0);
  if (withSizes.length > 0 && withSizes.length < present.length)
    issues.push(`Tailles en base sur ${withSizes.length} fiche(s) sur ${present.length} seulement.`);
  if (withSizes.length === 0 && group.axis === 'couleur' && present.length > 0)
    issues.push('Aucune taille en base pour ce modèle.');
  const sizeSets = new Set(withSizes.map((m) => m.sizes.join('/')));
  if (sizeSets.size > 1) issues.push(`Grilles de tailles différentes : ${[...sizeSets].join(' · ')}.`);
  const allSizes = new Set(withSizes.flatMap((m) => m.sizes));
  if (allSizes.has('XXL') && allSizes.has('2XL'))
    issues.push(
      '« XXL » et « 2XL » coexistent : deux valeurs distinctes tant que la normalisation n’est pas validée.',
    );

  const toConfirm = members.filter((m) => m.labelSource !== 'product_name');
  if (group.kind === 'model' && toConfirm.length)
    issues.push(
      `Libellé à confirmer pour ${toConfirm.map((m) => `${m.slug} (${labelSourceText(m.labelSource)})`).join(', ')}.`,
    );

  const firstImages = new Map<string, string[]>();
  for (const m of present) {
    const src = m.images[0] ? String(m.images[0].src) : null;
    if (src) firstImages.set(src, [...(firstImages.get(src) ?? []), m.slug]);
  }
  for (const slugs of firstImages.values())
    if (slugs.length > 1) issues.push(`Même photo principale : ${slugs.join(' et ')}.`);
  const noImage = present.filter((m) => m.images.length === 0);
  if (noImage.length) issues.push(`Sans photo : ${noImage.map((m) => m.slug).join(', ')}.`);

  const states = new Set(present.map((m) => m.availability));
  if (states.size > 1) issues.push(`Disponibilités différentes : ${[...states].join(', ')}.`);

  if (group.kind === 'model') {
    if (!group.proposedSlug) issues.push('Aucun slug de modèle proposé : à définir.');
    else issues.push(...slugIssues(catalog, group.proposedSlug));
  }
  return issues;
}

/** Le futur slug ne doit entrer en conflit avec aucune route actuelle. */
function slugIssues(catalog: Catalog, slug: string): string[] {
  const path = `/${slug}/`;
  const issues: string[] = [];
  if (catalog.products.some((p) => p.slug === slug))
    issues.push(`CONFLIT : /${slug}/ est déjà l’URL d’une fiche publiée.`);
  if (catalog.collections.some((c) => c.path === path))
    issues.push(`CONFLIT : ${path} est déjà une page collection.`);
  if (catalog.brands.some((b) => b.path === path)) issues.push(`CONFLIT : ${path} est déjà une page marque.`);
  return issues;
}

export async function groupsPage(): Promise<GroupsPage> {
  const catalog = await getCatalog();
  const views = snapshot.groupings.map((group): GroupView => {
    const members = group.members.map((m) => memberOf(catalog, group, m));
    return {
      code: group.code,
      kind: group.kind,
      decision: group.decision,
      proposedName: group.proposedName,
      proposedSlug: group.proposedSlug,
      axisLabel: group.axis ? (AXES[group.axis]?.legend ?? group.axis) : null,
      note: group.note,
      members,
      issues: issuesOf(catalog, group, members),
      previewPath: group.decision === 'safe' && group.kind === 'model' ? previewPathOf(group.code) : null,
    };
  });
  const khamrah = catalog.products.find((p) => /^khamrah-eau-de-parfum/.test(p.slug));
  return {
    exportedAt: snapshot.exportedAt,
    safe: views.filter((v) => v.previewPath),
    review: views.filter((v) => !v.previewPath),
    futureSlugs: [
      {
        label: 'Khamrah (Lattafa) — décision de l’étape 3, 301 NON appliquée',
        current: khamrah ? `/${khamrah.slug}/` : null,
        future: '/khamrah/',
        issues: slugIssues(catalog, 'khamrah'),
      },
    ],
  };
}

export async function safeGroupCodes(): Promise<string[]> {
  return (await groupsPage()).safe.map((g) => g.code);
}

/* ── Aperçu de la future fiche fusionnée ────────────────────────────────── */

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Fiche fusionnée SIMULÉE avec les données réelles des membres : un axe couleur (miniature =
 * vraie photo de chaque fiche, libellé proposé à l'étape 6) et, si des tailles existent, un axe
 * taille (valeurs réelles de chaque fiche ; une couleur sans taille en base ne peut pas être
 * complétée — c'est l'un des écarts listés). Commande désactivée, aucun JSON-LD.
 */
export async function groupPreview(code: string): Promise<{ view: ProductPageView; group: GroupView }> {
  const catalog = await getCatalog();
  const page = await groupsPage();
  const group = page.safe.find((g) => g.code === code);
  const source = snapshot.groupings.find((g) => g.code === code);
  if (!group || !source) throw new Error(`[lab] regroupement sûr inconnu : ${code}`);
  const products = source.members
    .map((m) => ({ member: m, product: catalog.products.find((p) => p.slug === m.slug) }))
    .filter((x): x is { member: (typeof source.members)[number]; product: CatalogProduct } =>
      Boolean(x.product),
    );
  const base = products.find((x) => x.product.slug === source.baseSlug)?.product ?? products[0]!.product;
  const axisId = source.axis ?? 'couleur';
  const axisConfig = AXES[axisId]!;
  const orderable = (p: CatalogProduct) => ['available', 'on_demand'].includes(commercialAvailability(p.row));

  const colorOptions: VariantOption[] = [];
  const variants: ProductVariantData[] = [];
  const mediaSets: Record<string, MediaImage[]> = {};
  const sizeLabels = new Map<string, string>();
  for (const { member, product } of products) {
    const label = member.label ?? product.name;
    const code = slug(label) || product.slug;
    const gallery = productGallery(catalog, product.row);
    mediaSets[product.slug] = gallery;
    const sized = [...product.row.product_variants]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .flatMap((v) => {
        const size = v.product_variant_options.find((o) => o.option_type_id === 'taille')?.option_values;
        return size ? [{ v, size }] : [];
      });
    colorOptions.push({
      id: code,
      label,
      available: orderable(product) && (sized.length === 0 || sized.some((s) => s.v.active)),
      ...(gallery[0] ? { image: gallery[0] } : {}),
    });
    if (sized.length === 0) {
      const price = product.summary.price;
      variants.push({
        options: { [axisId]: code },
        label,
        price: price.kind === 'fixed' ? price.amount : null,
        available: orderable(product),
        unitPrice: null,
        media: product.slug,
      });
    }
    for (const { v, size } of sized) {
      sizeLabels.set(size.code, size.label);
      variants.push({
        options: { [axisId]: code, taille: size.code },
        label: `${label} · ${size.label}`,
        price: typeof v.price === 'number' ? Number(v.price) : null,
        available: orderable(product) && v.active,
        unitPrice: null,
        media: product.slug,
      });
    }
  }

  const axes: ProductAxisView[] = [
    {
      id: axisId,
      legend: axisConfig.legend,
      param: axisConfig.param,
      presentation: axisConfig.presentation,
      verb: axisConfig.verb,
      options: colorOptions,
    },
  ];
  if (sizeLabels.size) {
    axes.push({
      id: 'taille',
      legend: AXES['taille']!.legend,
      param: AXES['taille']!.param,
      presentation: AXES['taille']!.presentation,
      verb: AXES['taille']!.verb,
      options: [...sizeLabels]
        .sort(([, a], [, b]) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))
        .map(([id, label]) => ({
          id,
          label,
          available: variants.some((v) => v.options['taille'] === id && v.available),
        })),
    });
  }

  const prices = variants.map((v) => v.price).filter((p): p is number => p !== null);
  const price: PriceInfo =
    prices.length === 0
      ? { kind: 'on-request' }
      : new Set(prices).size > 1
        ? { kind: 'from', amount: Math.min(...prices) }
        : { kind: 'fixed', amount: prices[0]! };
  const states = products.map((x) => commercialAvailability(x.product.row));
  const availability: ProductAvailability = (
    ['available', 'on_demand', 'coming_soon', 'out_of_stock'] as const
  ).find((s) => states.includes(s))!;
  const path = previewPathOf(code);
  const name = source.proposedName ?? base.name;
  const crumbs = breadcrumbOf(base).slice(0, -1);
  const view: ProductPageView = {
    kind: 'preview',
    slug: source.proposedSlug ?? code.toLowerCase(),
    path,
    name,
    seoTitle: `Aperçu ${code} — ${name}`,
    seoDescription: `Aperçu interne du regroupement ${code} (${products.length} fiches actuelles). Non publié.`,
    breadcrumb: [...crumbs, { name, href: path }],
    family: familyOf(base.primary),
    facts: [],
    price,
    unitPrice: null,
    availability,
    availabilityLabel: '',
    axes,
    variants,
    gallery: productGallery(catalog, base.row),
    mediaSets,
    sizeGuide: null,
    hasSizeAxis: sizeLabels.size > 0,
    accordions: accordionsOf(base.row, familyOf(base.primary)).filter((a) => a.id !== 'livraison'),
    order: { orderable: false, href: '', messageHead: '', messageTail: '' },
    delivery: '',
    similar: [],
    similarTitle: '',
    related: [],
    offers: [],
    lastmod: '',
    indexable: false,
  };
  return { view, group };
}
