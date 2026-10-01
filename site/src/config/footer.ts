import type { FooterSection } from '@/types/site';
import { cgvUrl, contact } from './commerce';
import { navigation } from './navigation';

/**
 * Footer : uniquement des liens réels. Les pages légales vivent encore sur le site
 * actuel (liens absolus vers dar-nur.fr) ; « Notre histoire » n'existe pas encore
 * et apparaît comme « bientôt », sans lien.
 */
export const footerSections: FooterSection[] = [
  {
    title: 'Univers',
    links: navigation.map(({ label, href }) => ({ label, href })),
  },
  {
    title: 'Aide',
    links: [
      { label: 'Livraison & paiement', href: cgvUrl, external: true },
      { label: 'Commander sur WhatsApp', href: contact.whatsappUrl, external: true },
    ],
  },
  {
    title: 'La maison',
    links: [
      { label: 'Instagram', href: contact.instagramUrl, external: true },
      { label: 'TikTok', href: contact.tiktokUrl, external: true },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'Conditions générales de vente', href: cgvUrl, external: true },
      { label: 'Mentions légales', href: 'https://dar-nur.fr/mentions-legales.html', external: true },
      { label: 'Confidentialité', href: 'https://dar-nur.fr/confidentialite.html', external: true },
    ],
  },
];

/** Entrées prévues mais inexistantes : affichées « bientôt », jamais en lien. */
export const footerUpcoming: Record<string, string[]> = {
  'La maison': ['Notre histoire'],
};
