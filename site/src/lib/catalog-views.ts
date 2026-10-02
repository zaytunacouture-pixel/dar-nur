/**
 * Modèles de vue des pages catalogue (étape 7) : univers, collection, marque, offres.
 * Tout est dérivé de catalog-store (données réelles) ; aucun texte commercial n'est inventé :
 * à défaut de donnée, un bloc est omis ou un libellé neutre et factuel est construit
 * (nom + nombre de produits).
 */
import {
  FACET_LABELS,
  FACET_MIN_COVERAGE,
  UNIVERSE_SELECTION_SIZE,
  facetConfigOf,
  type FacetKey,
  type PageFacetConfig,
} from '@/config/catalog-pages';
import { navigation } from '@/config/navigation';
import { siteName } from '@/config/site';
import type {
  BreadcrumbItem,
  Collection,
  CollectionChip,
  Facet,
  FacetOption,
  FacetValue,
  GridProduct,
  ProductSummary,
  SortKey,
} from '@/types/catalog';
import {
  ancestorsOf,
  getCatalog,
  matchesRule,
  productsOf,
  rootOf,
  subtreeOf,
  type Catalog,
  type CatalogBrand,
  type CatalogCollection,
  type CatalogOffer,
  type CatalogProduct,
} from './catalog-store';
import { resolveMediaUrl } from './catalog';

/* ── Routes ─────────────────────────────────────────────────────────────── */

export type CatalogRoute =
  | { kind: 'universe'; path: string; slug: string }
  | { kind: 'collection'; path: string; slug: string }
  | { kind: 'offers'; path: string; slug: string }
  | { kind: 'brand'; path: string; slug: string };

/** Toutes les pages catalogue à générer. Une collection vide garde sa page, en noindex (voir docs). */
export async function catalogRoutes(): Promise<CatalogRoute[]> {
  const catalog = await getCatalog();
  const routes: CatalogRoute[] = catalog.collections.map((c) => ({
    kind: c.type === 'universe' ? 'universe' : c.slug === 'offres' ? 'offers' : 'collection',
    path: c.path,
    slug: c.slug,
  }));
  for (const brand of catalog.brands) routes.push({ kind: 'brand', path: brand.path, slug: brand.slug });
  return routes;
}

/* ── Éléments communs ───────────────────────────────────────────────────── */

export interface LinkItem {
  label: string;
  href: string;
}

export interface RelatedBlock {
  title: string;
  links: LinkItem[];
}

interface PageBase {
  path: string;
  h1: string;
  seoTitle: string;
  seoDescription: string;
  intro: string | null;
  breadcrumb: BreadcrumbItem[];
  /** Indexable en PRODUCTION (la préproduction reste noindex quoi qu'il arrive). */
  indexable: boolean;
}

const HOME: BreadcrumbItem = { name: 'Accueil', href: '/' };

function breadcrumbOf(collection: CatalogCollection): BreadcrumbItem[] {
  return [HOME, ...[...ancestorsOf(collection), collection].map((c) => ({ name: c.name, href: c.path }))];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** Coupe une description trop longue pour une meta, sur un mot entier. */
function clip(text: string, max = 158): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function seoOf(collection: CatalogCollection, count: number) {
  const h1 = collection.h1 ?? collection.name;
  return {
    h1,
    seoTitle: collection.seoTitle ?? `${h1} | ${siteName}`,
    // Repli factuel seulement si la meta manque en base.
    seoDescription:
      collection.seoDescription ??
      collection.description ??
      `${h1} : ${plural(count, 'produit')} sélectionnés par ${siteName}.`,
    // Intro : texte éditorial (`description`) ; à défaut la description validée à l'étape 3.
    intro: collection.description ?? collection.seoDescription,
  };
}

/** Image de carte de collection : visuel stocké, sinon la 1ʳᵉ vraie photo produit de la collection. */
function collectionImage(collection: CatalogCollection, products: CatalogProduct[]) {
  if (collection.imageUrl) return { src: resolveMediaUrl(collection.imageUrl), alt: '' };
  const withImage = products.find((p) => p.images[0]);
  return withImage ? { src: withImage.images[0]!, alt: '' } : undefined;
}

function toCard(catalog: Catalog, collection: CatalogCollection): Collection {
  const products = productsOf(catalog, collection);
  const image = collectionImage(collection, products);
  return {
    id: collection.slug,
    label: collection.name,
    href: collection.path,
    productCount: products.length,
    ...(image ? { image } : {}),
  };
}

const universesOf = (catalog: Catalog) => catalog.collections.filter((c) => c.type === 'universe');
const transversesOf = (catalog: Catalog) => catalog.collections.filter((c) => c.type === 'transverse');

/* ── Page univers ───────────────────────────────────────────────────────── */

export interface UniverseGroup {
  /** Libellé de groupe (« Femme », « Homme ») : celui du menu validé, si le groupe y correspond. */
  label?: string;
  /** Page du groupe quand il correspond à une collection conteneur (Mode homme). */
  link?: LinkItem;
  cards: Collection[];
}

export interface UniverseView extends PageBase {
  kind: 'universe';
  groups: UniverseGroup[];
  cardCount: number;
  selection: ProductSummary[];
  otherUniverses: {
    title: string;
    description: string;
    href: string;
    image?: { src: string; alt: string };
  }[];
  transverses: { title: string; href: string; text: string; icon: 'gift' | 'package' }[];
  productCount: number;
}

export async function universeView(slug: string): Promise<UniverseView> {
  const catalog = await getCatalog();
  const universe = mustCollection(catalog, slug);
  const products = productsOf(catalog, universe);

  // Une collection sans produit propre mais avec des sous-collections (Mode homme) devient
  // un sous-titre de groupe ; les autres, et leurs sous-collections, deviennent des cartes.
  const groups: UniverseGroup[] = [];
  for (const child of universe.children) {
    const isContainer = child.children.length > 0 && !catalog.products.some((p) => p.primary === child);
    if (isContainer) {
      groups.push({
        link: { label: `Tout ${child.name}`, href: child.path },
        cards: child.children.map((c) => toCard(catalog, c)),
      });
    } else {
      const cards = subtreeOf(child).map((c) => toCard(catalog, c));
      const last = groups.at(-1);
      if (last && !last.link) last.cards.push(...cards);
      else groups.push({ cards });
    }
  }
  // Libellés de présentation repris du menu (étape 4), seulement s'il y a plusieurs groupes
  // et que les cartes d'un groupe sont exactement celles d'un groupe du menu.
  const menuGroups = navigation.find((item) => item.href === universe.path && item.kind === 'universe');
  if (groups.length > 1 && menuGroups?.kind === 'universe') {
    for (const group of groups) {
      const hrefs = group.cards
        .map((c) => c.href)
        .sort()
        .join('|');
      const match = menuGroups.groups.find(
        (g) =>
          g.links
            .map((l) => l.href)
            .sort()
            .join('|') === hrefs,
      );
      if (match?.title) group.label = match.title;
    }
  }

  return {
    kind: 'universe',
    path: universe.path,
    ...seoOf(universe, products.length),
    breadcrumb: breadcrumbOf(universe),
    indexable: universe.isIndexable && products.length > 0,
    groups,
    cardCount: groups.reduce((total, g) => total + g.cards.length, 0),
    selection: universeSelection(universe, products),
    otherUniverses: universesOf(catalog)
      .filter((u) => u !== universe)
      .map((u) => {
        const image = collectionImage(u, productsOf(catalog, u));
        return {
          title: u.name,
          // Factuel : la liste réelle de ses collections.
          description: subtreeOf(u)
            .slice(1)
            .filter((c) => catalog.products.some((p) => p.primary === c))
            .map((c) => c.name)
            .join(', '),
          href: u.path,
          ...(image ? { image } : {}),
        };
      }),
    transverses: transversesOf(catalog).map((t) => transverseEntry(catalog, t)),
    productCount: products.length,
  };
}

function transverseEntry(catalog: Catalog, collection: CatalogCollection) {
  if (collection.slug === 'offres') {
    const count = catalog.offers.length;
    return {
      title: collection.name,
      href: collection.path,
      text: `${plural(count, 'offre')} en cours`,
      icon: 'package' as const,
    };
  }
  const count = productsOf(catalog, collection).length;
  return {
    title: collection.name,
    href: collection.path,
    text: plural(count, 'produit'),
    icon: 'gift' as const,
  };
}

/**
 * Sélection d'univers : produits mis en avant (`featured`) d'abord, puis un produit par
 * collection à tour de rôle (ordre admin) pour représenter tout l'univers. Aucune notion
 * de « meilleure vente » : la base n'en contient pas.
 */
function universeSelection(universe: CatalogCollection, products: CatalogProduct[]): ProductSummary[] {
  const picked: CatalogProduct[] = products.filter((p) => p.featured);
  const queues = universe.children.map((child) => {
    const slugs = new Set(subtreeOf(child).map((c) => c.slug));
    return products.filter((p) => slugs.has(p.primary.slug) && !picked.includes(p));
  });
  while (picked.length < UNIVERSE_SELECTION_SIZE && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < UNIVERSE_SELECTION_SIZE) picked.push(next);
    }
  }
  return picked.slice(0, UNIVERSE_SELECTION_SIZE).map((p) => p.summary);
}

/* ── Page collection / marque / offres ──────────────────────────────────── */

export interface CollectionView extends PageBase {
  kind: 'collection' | 'brand' | 'offers';
  /** Collection de rattachement (marque → Parfums). */
  collectionSlug: string;
  products: GridProduct[];
  facets: Facet[];
  chips: CollectionChip[];
  sorts: SortKey[];
  related: RelatedBlock[];
  /** Lien complémentaire factuel (ex. sprays de la même marque dans Parfums d'intérieur). */
  seeAlso?: LinkItem;
  /** Offres métier (page /offres/ uniquement). */
  offers: CatalogOffer[];
  brandName?: string;
}

export async function collectionView(slug: string): Promise<CollectionView> {
  const catalog = await getCatalog();
  const collection = mustCollection(catalog, slug);
  const products = productsOf(catalog, collection);
  const config = facetConfigOf(collection.slug);
  const { facets, grid } = buildFacets(catalog, products, config);
  const isOffers = collection.slug === 'offres';
  return {
    kind: isOffers ? 'offers' : 'collection',
    collectionSlug: collection.slug,
    path: collection.path,
    ...seoOf(collection, products.length),
    breadcrumb: breadcrumbOf(collection),
    indexable: collection.isIndexable && (products.length > 0 || (isOffers && catalog.offers.length > 0)),
    products: grid,
    facets,
    chips: chipsOf(catalog, collection, facets, config),
    sorts: sortsOf(grid),
    related: relatedOf(catalog, collection),
    offers: isOffers ? catalog.offers : [],
  };
}

export async function brandView(slug: string): Promise<CollectionView> {
  const catalog = await getCatalog();
  const brand = catalog.brands.find((b) => b.slug === slug);
  if (!brand) throw new Error(`[catalogue] marque inconnue : ${slug}`);
  const parfums = mustCollection(catalog, 'parfums');
  const config = facetConfigOf('marque');
  const { facets, grid } = buildFacets(catalog, brand.products, config);
  const h1 = `Parfums ${brand.name}`;
  const count = brand.products.length;
  const elsewhere = catalog.products.filter(
    (p) => p.brand?.slug === brand.slug && !brand.products.includes(p),
  );
  const interieur = catalog.bySlug.get('parfums-interieur');
  const seeAlsoCount = interieur
    ? elsewhere.filter((p) => productsOf(catalog, interieur).includes(p)).length
    : 0;
  return {
    kind: 'brand',
    collectionSlug: parfums.slug,
    path: brand.path,
    h1,
    seoTitle: `${h1} | ${siteName}`,
    seoDescription: brand.description
      ? clip(brand.description)
      : `Les parfums ${brand.name} chez ${siteName} : ${plural(count, 'référence')}.`,
    intro: brand.description,
    breadcrumb: [...breadcrumbOf(parfums), { name: brand.name, href: brand.path }],
    indexable: brand.indexable,
    products: grid,
    facets,
    chips: brandChips(catalog, parfums, brand),
    sorts: sortsOf(grid),
    related: [
      {
        title: 'Les autres marques',
        links: catalog.brands.filter((b) => b !== brand).map((b) => ({ label: b.name, href: b.path })),
      },
      ...relatedOf(catalog, parfums),
    ],
    ...(interieur && seeAlsoCount > 0
      ? {
          seeAlso: {
            label: `${brand.name} pour la maison : ${plural(seeAlsoCount, 'parfum')} d’intérieur`,
            href: interieur.path,
          },
        }
      : {}),
    offers: [],
    brandName: brand.name,
  };
}

function mustCollection(catalog: Catalog, slug: string): CatalogCollection {
  const collection = catalog.bySlug.get(slug);
  if (!collection) throw new Error(`[catalogue] collection inconnue ou non publiée : ${slug}`);
  return collection;
}

/* ── Facettes ───────────────────────────────────────────────────────────── */

const AVAILABILITY: Record<ProductSummary['availability'], FacetOption> = {
  available: { code: 'disponible', label: 'Disponible' },
  'coming-soon': { code: 'bientot', label: 'Bientôt disponible' },
  unavailable: { code: 'epuise', label: 'Épuisé' },
};
const AVAILABILITY_ORDER = ['disponible', 'bientot', 'epuise'];
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];

function optionsOf(product: CatalogProduct, key: FacetKey, config: PageFacetConfig): FacetOption[] {
  switch (key) {
    case 'type': {
      const rule = config.types?.find((r) => matchesRule(product, r));
      return rule ? [{ code: rule.code, label: rule.label }] : [];
    }
    case 'marque':
      return product.brand ? [{ code: product.brand.slug, label: product.brand.name }] : [];
    case 'contenance':
      return product.contenance;
    case 'taille':
      return product.taille;
    case 'univers': {
      const root = rootOf(product.primary);
      return [{ code: root.slug, label: root.name }];
    }
    case 'rayon':
      return [{ code: product.primary.slug, label: product.primary.name }];
    case 'disponibilite':
      return [AVAILABILITY[product.summary.availability]];
  }
}

function valueOrder(catalog: Catalog, key: FacetKey, config: PageFacetConfig) {
  const treeIndex = new Map(catalog.collections.map((c, i) => [c.slug, i]));
  const brandIndex = new Map(catalog.brands.map((b, i) => [b.slug, i]));
  const quantity = (label: string) => {
    const match = /^([\d.,]+)\s*(\S+)/.exec(label);
    return match ? [match[2] ?? '', Number(match[1]!.replace(',', '.'))] : ['', 0];
  };
  return (a: FacetValue, b: FacetValue): number => {
    switch (key) {
      case 'type':
        return (
          (config.types?.findIndex((r) => r.code === a.code) ?? 0) -
          (config.types?.findIndex((r) => r.code === b.code) ?? 0)
        );
      case 'marque':
        return (
          (brandIndex.get(a.code) ?? 99) - (brandIndex.get(b.code) ?? 99) || a.label.localeCompare(b.label)
        );
      case 'contenance': {
        const [ua, qa] = quantity(a.label);
        const [ub, qb] = quantity(b.label);
        return String(ua).localeCompare(String(ub)) || Number(qa) - Number(qb);
      }
      case 'taille':
        return SIZE_ORDER.indexOf(a.code.toUpperCase()) - SIZE_ORDER.indexOf(b.code.toUpperCase());
      case 'univers':
      case 'rayon':
        return (treeIndex.get(a.code) ?? 99) - (treeIndex.get(b.code) ?? 99);
      case 'disponibilite':
        return AVAILABILITY_ORDER.indexOf(a.code) - AVAILABILITY_ORDER.indexOf(b.code);
    }
  };
}

/**
 * Facettes réellement utiles à la page + attributs de filtre de chaque produit.
 * Seules les facettes AFFICHÉES sont écrites dans le HTML (data-f-*).
 */
function buildFacets(catalog: Catalog, products: CatalogProduct[], config: PageFacetConfig) {
  const facets: Facet[] = [];
  const perProduct = new Map<CatalogProduct, Record<string, string[]>>(products.map((p) => [p, {}]));
  for (const key of config.facets) {
    const values = new Map<string, FacetValue>();
    let covered = 0;
    for (const product of products) {
      const options = optionsOf(product, key, config);
      if (options.length) covered += 1;
      perProduct.get(product)![key] = options.map((o) => o.code);
      for (const option of options) {
        const value = values.get(option.code) ?? { ...option, count: 0 };
        value.count += 1;
        values.set(option.code, value);
      }
    }
    const shown = values.size >= 2 && products.length > 0 && covered / products.length >= FACET_MIN_COVERAGE;
    if (!shown) {
      for (const record of perProduct.values()) delete record[key];
      continue;
    }
    facets.push({
      key,
      label: FACET_LABELS[key],
      values: [...values.values()].sort(valueOrder(catalog, key, config)),
    });
  }
  const grid: GridProduct[] = products.map((p, index) => ({
    summary: p.summary,
    facets: perProduct.get(p)!,
    order: index,
    minPrice: p.minPrice,
    added: p.added,
  }));
  return { facets, grid };
}

/**
 * Tris : « Sélection » (ordre admin) et prix toujours ; « Nouveautés » seulement si les
 * produits de la page ont été ajoutés à au moins deux dates différentes — sinon il serait
 * identique à « Sélection ». Définition : date d'ajout du produit au catalogue Supabase
 * (`products.created_at`), la plus récente d'abord, puis ordre « Sélection ».
 */
function sortsOf(grid: GridProduct[]): SortKey[] {
  const sorts: SortKey[] = ['selection'];
  if (grid.length > 1) sorts.push('prix-croissant', 'prix-decroissant');
  if (new Set(grid.map((g) => g.added)).size >= 2) sorts.push('nouveautes');
  return sorts;
}

/* ── Puces sous le H1 ───────────────────────────────────────────────────── */

/**
 * 1. La page a des sous-pages (sous-collections, ou marques pour Parfums) → liens.
 * 2. Sinon, sa facette « rapide » est affichée → puces de filtre (fragment d'URL).
 * 3. Sinon, c'est une sous-collection → liens vers le parent et les sœurs.
 */
function chipsOf(
  catalog: Catalog,
  collection: CatalogCollection,
  facets: Facet[],
  config: PageFacetConfig,
): CollectionChip[] {
  const subPages: LinkItem[] = [
    ...collection.children.map((c) => ({ label: c.name, href: c.path })),
    ...(collection.slug === 'parfums' ? catalog.brands.map((b) => ({ label: b.name, href: b.path })) : []),
  ];
  if (subPages.length) {
    return [
      { kind: 'link', label: 'Tous', href: collection.path, current: true },
      ...subPages.map((l) => ({ kind: 'link' as const, ...l, current: false })),
    ];
  }
  const quick = config.quick ? facets.find((f) => f.key === config.quick) : undefined;
  if (quick) {
    return [
      { kind: 'filter', label: 'Tous', facet: quick.key, code: null },
      ...quick.values.map((v) => ({
        kind: 'filter' as const,
        label: v.label,
        facet: quick.key,
        code: v.code,
      })),
    ];
  }
  const parent = collection.parent;
  if (parent && parent.type !== 'universe') {
    return [
      { kind: 'link', label: parent.name, href: parent.path, current: false },
      ...parent.children.map((c) => ({
        kind: 'link' as const,
        label: c.name,
        href: c.path,
        current: c === collection,
      })),
    ];
  }
  return [];
}

function brandChips(catalog: Catalog, parfums: CatalogCollection, brand: CatalogBrand): CollectionChip[] {
  return [
    { kind: 'link', label: 'Tous les parfums', href: parfums.path, current: false },
    ...catalog.brands.map((b) => ({
      kind: 'link' as const,
      label: b.name,
      href: b.path,
      current: b === brand,
    })),
  ];
}

/* ── Maillage ───────────────────────────────────────────────────────────── */

function relatedOf(catalog: Catalog, collection: CatalogCollection): RelatedBlock[] {
  const root = rootOf(collection);
  const blocks: RelatedBlock[] = [];
  if (root.type === 'universe') {
    const neighbours = subtreeOf(root)
      .slice(1)
      .filter((c) => c !== collection);
    blocks.push({
      title: `Dans ${root.name}`,
      links: [{ label: `Tout l’univers ${root.name}`, href: root.path }, ...neighbours.map(asLink)],
    });
  }
  blocks.push({
    title: root.type === 'universe' ? 'Autres univers' : 'Explorer les univers',
    links: [
      ...universesOf(catalog).filter((u) => u !== root),
      ...transversesOf(catalog).filter((t) => t !== root),
    ].map(asLink),
  });
  return blocks;
}

const asLink = (c: CatalogCollection): LinkItem => ({ label: c.name, href: c.path });

/* ── Recherche (future) ─────────────────────────────────────────────────── */

export interface SearchableCollection {
  kind: 'universe' | 'collection' | 'transverse' | 'brand';
  name: string;
  path: string;
  description: string | null;
  parent: string | null;
  productCount: number;
}

/**
 * Métadonnées des pages univers / collections / marques pour la future recherche
 * (non branchée à l'étape 7) : nom, chemin, description, parent, nombre de produits.
 */
export async function searchableCollections(): Promise<SearchableCollection[]> {
  const catalog = await getCatalog();
  return [
    ...catalog.collections.map((c) => ({
      kind:
        c.type === 'universe'
          ? ('universe' as const)
          : c.type === 'transverse'
            ? ('transverse' as const)
            : ('collection' as const),
      name: c.name,
      path: c.path,
      description: c.seoDescription ?? c.description,
      parent: c.parent?.name ?? null,
      productCount: productsOf(catalog, c).length,
    })),
    ...catalog.brands.map((b) => ({
      kind: 'brand' as const,
      name: b.name,
      path: b.path,
      description: b.description,
      parent: 'Parfums',
      productCount: b.products.length,
    })),
  ];
}
