import type { FooterSection } from '@/types/site';
import { cgvUrl, contact } from './commerce';
import { navigation } from './navigation';

/**
 * Footer : uniquement des liens réels. Pages légales internes depuis l'étape 12 ;
 * « Notre histoire » n'existe pas encore et apparaît comme « bientôt », sans lien.
 */
export const footerSections: FooterSection[] = [
  {
    title: 'Univers',
    links: navigation.map(({ label, href }) => ({ label, href })),
  },
  {
    title: 'Aide',
    links: [
      { label: 'Mon panier', href: '/panier/' },
      { label: 'Suivre une commande', href: '/suivi/' },
      { label: 'Une question ? WhatsApp', href: contact.whatsappUrl, external: true },
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
      { label: 'Conditions générales de vente', href: cgvUrl },
      { label: 'Mentions légales', href: '/mentions-legales/' },
      { label: 'Confidentialité', href: '/confidentialite/' },
    ],
  },
];

/** Entrées prévues mais inexistantes : affichées « bientôt », jamais en lien. */
export const footerUpcoming: Record<string, string[]> = {
  'La maison': ['Notre histoire'],
};
