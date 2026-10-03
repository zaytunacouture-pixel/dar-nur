/**
 * Modèle de vue de l'accueil (étape 9). Toute la logique de la page est ici ; `index.astro`
 * ne fait que la mise en page.
 *
 * - Choix éditoriaux : `src/config/home.ts` (slugs explicites, versionnés).
 * - Données : le même catalogue que les autres pages (catalog-store, lu une fois par build).
 * - Échec explicite : un slug configuré absent, non publié, sans image vérifiée ou exclu fait
 *   ÉCHOUER le build — jamais de bloc vide silencieux ni de produit de remplacement.
 * - Aucun texte commercial inventé : nombres et noms viennent de la base.
 */
import { inferRemoteSize } from 'astro:assets';
import { frameForSource, HERO, type ImageFrame } from '@/config/images';
import {
  HOME_EXCLUDED_PRODUCTS,
  HOME_FEATURED_PRODUCTS,
  HOME_HERO,
  HOME_HONEY,
  HOME_UNIVERSES,
} from '@/config/home';
import type { MediaImage, ProductSummary } from '@/types/catalog';
import {
  getCatalog,
  productsOf,
  type Catalog,
  type CatalogCollection,
  type CatalogProduct,
} from './catalog-store';

export interface HomeLink {
  label: string;
  href: string;
}

export interface HomeUniverse {
  title: string;
  href: string;
  image: MediaImage;
  collections: (HomeLink & { count: number })[];
}

export interface HomeEntry extends HomeLink {
  text: string;
}

export interface HomeView {
  /** Faux si Supabase n'est pas configuré : la page le dit, sans contenu inventé. */
  configured: boolean;
  hero?: {
    image: MediaImage;
    frame: ImageFrame;
    product: HomeLink;
    cta: HomeLink;
  };
  universes: HomeUniverse[];
  featured: ProductSummary[];
  honey?: { image: MediaImage; primary: HomeLink; secondary: HomeLink };
  gifts?: HomeEntry;
  offers?: HomeEntry;
}

const fail = (message: string): never => {
  throw new Error(`[accueil] ${message}`);
};

/** Espace insécable avant « : » (typographie française). */
const NBSP = String.fromCharCode(0xa0);

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count > 1 ? pluralForm : singular}`;

function mustProduct(catalog: Catalog, slug: string, usage: string): CatalogProduct {
  if ((HOME_EXCLUDED_PRODUCTS as readonly string[]).includes(slug))
    fail(`« ${slug} » (${usage}) est exclu de l'accueil (src/config/home.ts)`);
  // catalog.products ne contient que des produits PUBLIÉS (filtre explicite de catalog-store).
  const product = catalog.products.find((p) => p.slug === slug);
  if (!product) return fail(`« ${slug} » (${usage}) : produit introuvable ou non publié`);
  if (!product.images[0]) fail(`« ${slug} » (${usage}) : aucune image vérifiée accessible`);
  return product;
}

function mustCollection(catalog: Catalog, slug: string, usage: string): CatalogCollection {
  return catalog.bySlug.get(slug) ?? fail(`collection « ${slug} » (${usage}) introuvable ou non publiée`);
}

const linkOf = (collection: CatalogCollection): HomeLink => ({
  label: collection.name,
  href: collection.path,
});

export async function homeView(): Promise<HomeView> {
  const catalog = await getCatalog();
  if (!catalog.configured) return { configured: false, universes: [], featured: [] };

  // ── Hero : une seule photo réelle, ramenée à la taille de sa source ──────
  const heroProduct = mustProduct(catalog, HOME_HERO.productSlug, 'hero');
  const heroSrc = heroProduct.images[0]!;
  const size = await inferRemoteSize(heroSrc);
  const heroUniverse = mustCollection(catalog, HOME_HERO.universeSlug, 'hero');
  const hero = {
    image: { src: heroSrc, alt: HOME_HERO.alt },
    frame: frameForSource(HERO, size.width, size.height),
    product: { label: heroProduct.name, href: heroProduct.summary.href },
    cta: { label: `Découvrir ${heroUniverse.name}`, href: heroUniverse.path },
  };

  // ── Univers et leurs collections (nombres réels) ─────────────────────────
  const universes = HOME_UNIVERSES.map((entry): HomeUniverse => {
    const universe = mustCollection(catalog, entry.slug, 'univers');
    if (universe.type !== 'universe') fail(`« ${entry.slug} » n'est pas un univers`);
    const image = mustProduct(catalog, entry.imageProduct, `image de l'univers ${entry.slug}`);
    return {
      // Libellé éditorial validé (h1 en base) : « Mode modeste » pour /mode/.
      title: universe.h1 ?? universe.name,
      href: universe.path,
      image: { src: image.images[0]!, alt: '' },
      collections: entry.collections.map((slug) => {
        const collection = mustCollection(catalog, slug, `univers ${entry.slug}`);
        let root = collection;
        while (root.parent) root = root.parent;
        if (root !== universe) fail(`« ${slug} » n'appartient pas à l'univers ${entry.slug}`);
        const count = productsOf(catalog, collection).length;
        if (count === 0) fail(`« ${slug} » (univers ${entry.slug}) ne contient aucun produit publié`);
        return { ...linkOf(collection), count };
      }),
    };
  });

  // ── À découvrir : sélection éditoriale, dans l'ordre configuré ───────────
  if (new Set(HOME_FEATURED_PRODUCTS).size !== HOME_FEATURED_PRODUCTS.length)
    fail('sélection « À découvrir » : slug en double');
  const featured = HOME_FEATURED_PRODUCTS.map((slug) => {
    const product = mustProduct(catalog, slug, 'À découvrir');
    // L'état réel est affiché tel quel (badge) ; il est seulement signalé au build.
    if (product.summary.availability !== 'available')
      console.warn(`[accueil] « ${slug} » (À découvrir) n'est plus commandable : à remplacer`);
    return product.summary;
  });

  // ── Bloc Miels ───────────────────────────────────────────────────────────
  const honeyProduct = mustProduct(catalog, HOME_HONEY.imageProduct, 'bloc Miels');
  const honey = {
    image: { src: honeyProduct.images[0]!, alt: HOME_HONEY.alt },
    primary: linkOf(mustCollection(catalog, HOME_HONEY.collectionSlug, 'bloc Miels')),
    secondary: linkOf(mustCollection(catalog, HOME_HONEY.secondarySlug, 'bloc Miels')),
  };

  return {
    configured: true,
    hero,
    universes,
    featured,
    honey,
    gifts: giftsEntry(catalog),
    offers: offersEntry(catalog),
  };
}

/**
 * Idées cadeaux : nombre réel et collections réellement représentées. Aucune promesse de
 * filtre « pour elle / pour lui / par budget » : la page n'en propose pas (point ouvert étape 7).
 */
function giftsEntry(catalog: Catalog): HomeEntry {
  const collection = mustCollection(catalog, 'idees-cadeaux', 'Idées cadeaux');
  const products = productsOf(catalog, collection);
  if (products.length === 0) fail('Idées cadeaux : aucun produit publié');
  const byCollection = new Map<string, number>();
  for (const p of products) byCollection.set(p.primary.name, (byCollection.get(p.primary.name) ?? 0) + 1);
  const names = [...byCollection.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const shown = names.slice(0, 3).join(', ');
  return {
    ...linkOf(collection),
    text: `${plural(products.length, 'produit')} à offrir${NBSP}: ${shown}${names.length > 3 ? '…' : '.'}`,
  };
}

/** Offres & packs : nombres réels par type ; jamais d'économie ni de titre d'offre repris. */
function offersEntry(catalog: Catalog): HomeEntry {
  const collection = mustCollection(catalog, 'offres', 'Offres & packs');
  const packs = catalog.offers.filter((o) => o.type === 'pack').length;
  const promos = catalog.offers.length - packs;
  const parts = [...(packs ? [plural(packs, 'pack')] : []), ...(promos ? [plural(promos, 'promotion')] : [])];
  return {
    ...linkOf(collection),
    text: parts.length ? `${parts.join(' et ')} en cours.` : 'Aucune offre en cours pour le moment.',
  };
}
