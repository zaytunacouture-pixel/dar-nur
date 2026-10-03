import type { AnnouncementMessage, ShippingPolicy } from '@/types/site';

/**
 * Faits commerciaux. RÈGLE : n'afficher que ce qui est vrai pour le futur site.
 *
 * Parcours de l'étape 10 (décisions du propriétaire du 3 octobre 2026) : le client envoie une
 * DEMANDE de commande depuis le panier ; Dar Nūr vérifie la disponibilité, prépare la commande et
 * fixe les frais de livraison (France comme international) ; le client reçoit alors le total final
 * et les instructions de paiement ; l'expédition n'a lieu qu'après paiement confirmé.
 * Aucun tarif, délai, seuil de gratuité ni pays desservi n'est annoncé : tout est confirmé par
 * Dar Nūr, commande par commande, avant paiement. Aucun prestataire de paiement n'est branché.
 */

/** Actif dans la refonte : frais confirmés pour chaque commande, aucune livraison offerte. */
export const currentShipping: ShippingPolicy = {
  status: 'active',
  zoneLabel: 'France et international',
  freeShippingThreshold: null,
  summary: 'Livraison en France et à l’international : frais confirmés avant paiement',
};

/** Étapes du parcours, dans l'ordre (fiche, panier, commande, accordéon « Livraison & paiement »). */
export const orderingSteps = [
  'Ajoutez vos articles au panier, puis envoyez votre demande de commande : rien n’est payé à ce moment-là.',
  'Dar Nūr vérifie la disponibilité, prépare votre commande et confirme les frais de livraison.',
  'Vous recevez le total final et les instructions de paiement.',
  'Votre commande est expédiée après réception du paiement.',
] as const;

/**
 * Commande en ligne et conditions générales (étape 10). Les CGV publiées décrivent encore l'ANCIEN
 * fonctionnement (paiement à la réception, livraison locale) : tant que `termsReviewed` est faux,
 * la page de commande affiche ce blocage et un build de PRODUCTION n'ouvre pas la commande en ligne
 * (le serveur la refuse aussi : orders_private.config.production_ordering_open = false).
 */
export const ordering = {
  termsReviewed: false,
  termsUrl: 'https://dar-nur.fr/cgv.html',
  privacyUrl: 'https://dar-nur.fr/confidentialite.html',
  /** Plafond technique anti-abus par ligne (pas une limite commerciale). */
  maxQuantity: 99,
  /** Nombre maximal de lignes par demande (même plafond côté serveur). */
  maxLines: 30,
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
  { text: 'Commande en ligne · paiement après confirmation de votre commande' },
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
 * Réassurance : uniquement le parcours réellement actif (§N.4). Étape 10 : commande en ligne
 * (demande, puis vérification), paiement après confirmation du total. Aucun logo de moyen de
 * paiement : aucun prestataire n'est branché.
 */
export const reassurance = [
  {
    icon: 'shopping-bag',
    title: 'Commande en ligne',
    text: 'Dar Nūr vérifie et prépare votre commande',
  },
  {
    icon: 'wallet',
    title: 'Paiement après confirmation',
    text: 'Total final, livraison comprise, confirmé avant paiement',
  },
  { icon: 'headset', title: 'Conseil personnalisé', text: 'Une question ? Écrivez-nous sur WhatsApp' },
] as const;

/** Recherches fréquentes : termes réels du catalogue, configurés (pas de « tendances » inventées). */
export const frequentSearches = ['nigelle', 'sidr', 'tahara', 'musc', 'qamis'];
