import type { AnnouncementMessage, ShippingPolicy } from '@/types/site';

/**
 * Faits commerciaux. RÈGLE : n'afficher que ce qui est vrai pour le futur site.
 *
 * Décisions du propriétaire (3 octobre 2026) : plus de paiement à la réception — la commande est
 * préparée, le client paie une fois la commande prête, l'expédition suit le paiement ; livraison
 * internationale VISÉE (pays, tarifs et expédition à construire dans l'étape commande/livraison).
 * Tant que ce système n'existe pas, aucun texte public ne décrit de zone, de tarif, de délai ni de
 * moyen de paiement : seulement le parcours réellement actif (commande et conseil sur WhatsApp).
 * Les CGV de https://dar-nur.fr/cgv.html décrivent encore l'ancien fonctionnement (site actuel).
 */

/** Actif dans la refonte : modalités confirmées au cas par cas sur WhatsApp, aucune livraison offerte. */
export const currentShipping: ShippingPolicy = {
  status: 'active',
  zoneLabel: 'à confirmer',
  freeShippingThreshold: null,
  summary: 'Livraison et paiement : modalités confirmées sur WhatsApp',
};

/**
 * PRÉVUE, NON ACTIVE — À CONFIRMER. Seuil de gratuité envisagé autour de 50 € ; zones (dont
 * l'international) à définir. Ne sert qu'à la démonstration étiquetée du design system.
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
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2).replace('.', ',')} €`;
}

/**
 * Messages du bandeau d'annonce, dans l'ordre. Le premier est le seul affiché sans rotation.
 * Message neutre et vrai : ni zone de livraison ni mode de paiement tant qu'ils ne sont pas définis.
 */
export const announcementMessages: AnnouncementMessage[] = [
  ...(freeShippingMessage(currentShipping) ? [freeShippingMessage(currentShipping)!] : []),
  { text: 'Commande et conseil sur WhatsApp' },
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

/**
 * Réassurance : uniquement le parcours réellement actif (§N.4). Étape 9 : retirés « Paiement à la
 * réception » et « Livraison en Île-de-France » (décisions du 3 octobre 2026), et « Votre panier »
 * (le nouveau site n'a pas de panier). Aucun picto de paiement ni de livraison avant l'étape
 * commande/livraison.
 */
export const reassurance = [
  {
    icon: 'shopping-bag',
    title: 'Commande sur WhatsApp',
    text: 'Depuis la fiche produit, message prérempli',
  },
  { icon: 'headset', title: 'Conseil personnalisé', text: 'Une question ? Écrivez-nous sur WhatsApp' },
] as const;

/** Recherches fréquentes : termes réels du catalogue, configurés (pas de « tendances » inventées). */
export const frequentSearches = ['nigelle', 'sidr', 'tahara', 'musc', 'qamis'];
