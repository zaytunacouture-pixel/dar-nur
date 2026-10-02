import type { NavigationItem } from '@/types/site';

/**
 * Arbre de navigation validé (étapes 2, 3 et 4). Source unique : header desktop,
 * méga-menu, menu mobile et footer lisent ce fichier.
 *
 * Les URL sont les URL cibles validées ; depuis l'étape 7, chacune est une vraie page générée
 * depuis `collections.path` (contrôlé par scripts/verify-catalog.mjs : toute URL du menu
 * doit exister dans dist/).
 */
export const navigation: NavigationItem[] = [
  {
    kind: 'universe',
    id: 'miels-herboristerie',
    label: 'Miels & Herboristerie',
    href: '/miels-herboristerie/',
    groups: [
      {
        links: [
          { label: 'Miels', href: '/miels/' },
          { label: 'Miels gourmands', href: '/miels-gourmands/' },
          { label: 'Poudres & graines', href: '/poudres/' },
          { label: 'Gélules', href: '/gelules/' },
        ],
      },
    ],
    feature: { label: 'Miels', href: '/miels/' },
  },
  {
    kind: 'universe',
    id: 'parfums-soins',
    label: 'Parfums & Soins',
    href: '/parfums-soins/',
    groups: [
      {
        title: 'Parfumer',
        links: [
          { label: 'Parfums', href: '/parfums/' },
          { label: 'Parfums d’intérieur', href: '/parfums-interieur/' },
          { label: 'Muscs & Tahara', href: '/tahara/' },
        ],
      },
      {
        title: 'Soigner',
        links: [
          { label: 'Soins & beauté', href: '/soins/' },
          { label: 'Brumes & eaux florales', href: '/brumes/' },
          { label: 'Huiles', href: '/huiles/' },
        ],
      },
    ],
    feature: { label: 'Parfums', href: '/parfums/' },
  },
  {
    kind: 'universe',
    id: 'mode',
    label: 'Mode',
    href: '/mode/',
    groups: [
      { title: 'Femme', links: [{ label: 'Abayas & ensembles', href: '/abayas/' }] },
      {
        title: 'Homme',
        links: [
          { label: 'Qamis', href: '/qamis/' },
          { label: 'Sandales', href: '/chaussures/' },
          { label: 'Accessoires', href: '/accessoires/' },
        ],
      },
    ],
    feature: { label: 'Abayas & ensembles', href: '/abayas/' },
  },
  { kind: 'link', id: 'idees-cadeaux', label: 'Idées cadeaux', href: '/idees-cadeaux/' },
  { kind: 'link', id: 'offres', label: 'Offres & packs', href: '/offres/' },
];

export const universes = navigation.filter(
  (item): item is Extract<NavigationItem, { kind: 'universe' }> => item.kind === 'universe',
);
