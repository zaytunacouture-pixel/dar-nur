/**
 * Pages catalogue (étape 7) : quels filtres chaque type de catalogue propose.
 *
 * RÈGLES
 * - Une facette listée ici n'est AFFICHÉE que si la donnée réelle la justifie sur la page :
 *   au moins 2 valeurs distinctes ET une valeur connue pour au moins FACET_MIN_COVERAGE des
 *   produits (sinon filtrer cacherait des produits dont l'information manque simplement).
 * - Les « types » sont des règles LEXICALES sur le nom réel du produit (ex. « Savon … ») ou
 *   l'appartenance réelle à une sous-collection, jamais une déduction de composition,
 *   d'usage ou de public. Un produit qui ne correspond
 *   à aucune règle reste visible sous « Tous ». Le build échoue si une règle ne trouve aucun
 *   produit ou si un produit correspond à deux règles (catalog-store.ts).
 * - Écartés faute de donnée (à créer en base avant de les afficher) : « Miels nature /
 *   Miel & plantes » (nature réelle de plusieurs miels à confirmer, CLOTURE_LOT1),
 *   concentration des parfums, couleur des abayas, pointure, budget, pour elle / pour lui.
 * - Une collection de type `filter` créée plus tard en base (étape 6 : prévu, non rempli)
 *   remplacera la règle lexicale correspondante.
 */

export type FacetKey = 'type' | 'marque' | 'contenance' | 'taille' | 'univers' | 'rayon' | 'disponibilite';

export type TypeRule = {
  /** Code stable du fragment d'URL (#type=savons). */
  code: string;
  label: string;
} & (
  | {
      /** Testé sur « nom · accroche » du produit (^ = début du nom). */
      pattern: RegExp;
    }
  | {
      /** Appartenance réelle à une collection (product_collections), sans règle lexicale. */
      collection: string;
    }
);

export interface PageFacetConfig {
  facets: FacetKey[];
  /** Facette proposée en puces sous le H1 quand la page n'a pas de sous-collections. */
  quick?: FacetKey;
  types?: TypeRule[];
}

/** Part minimale de produits renseignés pour afficher une facette (voir RÈGLES). */
export const FACET_MIN_COVERAGE = 0.8;

export const FACET_LABELS: Record<FacetKey, string> = {
  type: 'Type',
  marque: 'Marque',
  contenance: 'Contenance',
  taille: 'Taille',
  univers: 'Univers',
  rayon: 'Rayon',
  disponibilite: 'Disponibilité',
};

const DEFAULT: PageFacetConfig = { facets: ['disponibilite'] };

/** Clé = slug de collection ; `marque` = pages marque de parfum (/parfums/{marque}/). */
export const PAGE_FACETS: Record<string, PageFacetConfig> = {
  // Miels & Herboristerie
  miels: { facets: ['contenance', 'disponibilite'] },
  'miels-gourmands': { facets: ['contenance', 'disponibilite'] },
  poudres: {
    facets: ['type', 'disponibilite'],
    quick: 'type',
    types: [
      { code: 'poudres', label: 'Poudres', pattern: /^poudre\b/i },
      { code: 'graines', label: 'Graines', pattern: /^graines?\b/i },
    ],
  },
  gelules: DEFAULT,

  // Parfums & Soins
  parfums: { facets: ['marque', 'contenance', 'disponibilite'] },
  marque: { facets: ['contenance', 'disponibilite'] },
  'parfums-interieur': {
    facets: ['type', 'marque', 'disponibilite'],
    quick: 'type',
    types: [
      { code: 'sprays', label: 'Sprays d’ambiance', pattern: /\bspray\b/i },
      { code: 'bakhour', label: 'Bakhour & encens', pattern: /\bbakh?o?u?r\b|\bencens\b/i },
    ],
  },
  tahara: {
    facets: ['type', 'disponibilite'],
    quick: 'type',
    types: [
      { code: 'muscs', label: 'Muscs', pattern: /^musc\b/i },
      { code: 'packs', label: 'Packs & coffrets', pattern: /^(pack|coffret|lot)\b/i },
    ],
  },
  soins: {
    facets: ['type', 'contenance', 'disponibilite'],
    types: [
      { code: 'savons', label: 'Savons', pattern: /^savon\b/i },
      { code: 'gommages', label: 'Gommages', pattern: /^gommage\b/i },
      { code: 'poudres', label: 'Poudres', pattern: /^poudre\b/i },
      // La page Soins inclut sa sous-collection Brumes : type tiré de l'appartenance réelle.
      { code: 'brumes', label: 'Brumes & eaux florales', collection: 'brumes' },
    ],
  },
  brumes: DEFAULT,
  huiles: DEFAULT,

  // Mode
  abayas: {
    facets: ['type', 'taille', 'disponibilite'],
    quick: 'type',
    types: [
      { code: 'abayas', label: 'Abayas', pattern: /^abaya\b/i },
      { code: 'ensembles', label: 'Ensembles', pattern: /^ensemble\b/i },
    ],
  },
  'mode-homme': { facets: ['taille', 'disponibilite'] },
  qamis: { facets: ['taille', 'disponibilite'] },
  chaussures: DEFAULT,
  accessoires: {
    facets: ['type', 'disponibilite'],
    quick: 'type',
    types: [
      { code: 'chechias', label: 'Chéchias', pattern: /^ch[ée]chias?\b/i },
      { code: 'shemaghs', label: 'Shemaghs', pattern: /^she[iy]?maghs?\b/i },
    ],
  },

  // Transverses
  'idees-cadeaux': { facets: ['univers', 'rayon', 'disponibilite'], quick: 'univers' },
  offres: { facets: [] },
};

export function facetConfigOf(key: string): PageFacetConfig {
  return PAGE_FACETS[key] ?? DEFAULT;
}

/** Nombre de produits mis en avant sur une page univers (§J.1 : rangée de 8). */
export const UNIVERSE_SELECTION_SIZE = 8;
