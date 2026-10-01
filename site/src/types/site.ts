import type { UniverseId } from './catalog';

/** Lien de navigation simple. */
export interface NavLink {
  label: string;
  href: string;
}

/** Groupe de liens sous un sous-titre non cliquable (« Femme », « Homme »). */
export interface NavGroup {
  title?: string;
  links: NavLink[];
}

/** Entrée de premier niveau du header. */
export type NavigationItem =
  | {
      kind: 'universe';
      id: UniverseId;
      label: string;
      href: string;
      groups: NavGroup[];
      /** Tuile du méga-menu (facultative). */
      feature?: { label: string; href: string };
    }
  | { kind: 'link'; id: string; label: string; href: string };

export interface FooterSection {
  title: string;
  links: (NavLink & { external?: boolean })[];
}

/** Métadonnées SEO d'une page. */
export interface SeoMeta {
  title: string;
  description: string;
  /** Chemin canonique (relatif à `site`). Par défaut : chemin courant. */
  canonicalPath?: string;
  /** Force noindex même en production (pages internes : design system, lab). */
  noindex?: boolean;
  ogImage?: string;
  ogType?: 'website' | 'product';
}

export interface AnnouncementMessage {
  text: string;
  href?: string;
}

/**
 * Politique de livraison. Deux objets SÉPARÉS (src/config/shipping.ts) :
 * la politique en vigueur et la politique prévue. Seule la première est affichée.
 */
export interface ShippingPolicy {
  status: 'active' | 'planned';
  zoneLabel: string;
  /** Seuil de livraison offerte en euros ; null = aucune livraison offerte. */
  freeShippingThreshold: number | null;
  summary: string;
}
