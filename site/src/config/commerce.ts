import type { AnnouncementMessage, ShippingPolicy } from '@/types/site';

/**
 * Faits commerciaux. RÈGLE : n'afficher que la politique EN VIGUEUR (CGV de
 * https://dar-nur.fr/cgv.html au 1er octobre 2026). La politique prévue est
 * déclarée à part et n'est jamais lue par les composants publics.
 */

/** En vigueur : Île-de-France uniquement, paiement à la réception, aucune livraison offerte. */
export const currentShipping: ShippingPolicy = {
  status: 'active',
  zoneLabel: 'Île-de-France',
  freeShippingThreshold: null,
  summary: 'Livraison en Île-de-France · paiement à la réception',
};

/**
 * PRÉVUE, NON ACTIVE — À CONFIRMER. Livraison France entière et seuil de gratuité
 * envisagé autour de 50 €. Ne sert qu'à la démonstration étiquetée du design system.
 */
export const plannedShipping: ShippingPolicy = {
  status: 'planned',
  zoneLabel: 'France',
  freeShippingThreshold: 50,
  summary: 'Livraison en France (prévue, non active)',
};

export const cgvUrl = 'https://dar-nur.fr/cgv.html';

/**
 * Message de livraison offerte, construit depuis la politique (jamais écrit en dur).
 * Retourne null si la politique n'est pas active ou n'a pas de seuil.
 */
export function freeShippingMessage(policy: ShippingPolicy): AnnouncementMessage | null {
  if (policy.status !== 'active' || policy.freeShippingThreshold === null) return null;
  return {
    text: `Livraison offerte en ${policy.zoneLabel} dès ${formatEuroShort(policy.freeShippingThreshold)}`,
  };
}

function formatEuroShort(amount: number): string {
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2).replace('.', ',')} €`;
}

/** Messages du bandeau d'annonce, dans l'ordre. Le premier est le seul affiché sans rotation. */
export const announcementMessages: AnnouncementMessage[] = [
  ...(freeShippingMessage(currentShipping) ? [freeShippingMessage(currentShipping)!] : []),
  { text: 'Paiement à la réception · Livraison en Île-de-France', href: cgvUrl },
];

/** Rotation désactivée par défaut (§H.1) ; si activée : 7 s, pause au survol/focus, bouton pause. */
export const announcementRotation = { enabled: false, intervalMs: 7000 };

/** Contact public (le numéro est public par conception, cf. js/config.js de l'ancien site). */
export const contact = {
  whatsappNumber: '33769253375',
  whatsappDisplay: '07 69 25 33 75',
  whatsappUrl: 'https://wa.me/33769253375',
  instagramUrl: 'https://www.instagram.com/dar.nur.officiel/',
  tiktokUrl: 'https://www.tiktok.com/@darnur.officiel',
};

/** Réassurance : 4 faits vérifiés dans les CGV, rien d'autre (§N.4). */
export const reassurance = [
  { icon: 'shopping-bag', title: 'Commande simple', text: 'Votre panier, envoyé sur WhatsApp' },
  { icon: 'wallet', title: 'Paiement à la réception', text: 'Revolut ou espèces, rien à l’avance' },
  { icon: 'map-pin', title: 'Livraison en Île-de-France', text: 'Remise gratuite à Chelles et Lognes' },
  { icon: 'headset', title: 'Conseil personnalisé', text: 'Une question ? Écrivez-nous sur WhatsApp' },
] as const;

/** Recherches fréquentes : termes réels du catalogue, configurés (pas de « tendances » inventées). */
export const frequentSearches = ['nigelle', 'sidr', 'tahara', 'musc', 'qamis'];
