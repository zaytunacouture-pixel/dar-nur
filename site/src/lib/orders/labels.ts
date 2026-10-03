/**
 * Libellés du parcours de commande (étape 10), partagés par le navigateur (panier, commande,
 * suivi, administration) et le build. Les CODES viennent de la base (migration étape 10) : ne
 * jamais les renommer ici sans migration.
 */

export type OrderStatus =
  | 'submitted'
  | 'reviewing'
  | 'awaiting_payment'
  | 'paid'
  | 'preparing_shipment'
  | 'shipped'
  | 'completed'
  | 'cancelled';

export type PaymentStatus =
  'not_requested' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refund_due' | 'refunded';

/** Statut vu par le client (sans jargon interne). */
export const CUSTOMER_STATUS: Record<OrderStatus, string> = {
  submitted: 'Commande reçue',
  reviewing: 'Vérification en cours',
  awaiting_payment: 'Paiement demandé',
  paid: 'Paiement reçu',
  preparing_shipment: 'Préparation de l’expédition',
  shipped: 'Expédiée',
  completed: 'Livrée',
  cancelled: 'Annulée',
};

/** Étapes de la frise de suivi (une commande annulée n'y figure pas). */
export const TIMELINE: { label: string; statuses: OrderStatus[] }[] = [
  { label: 'Commande reçue', statuses: ['submitted'] },
  { label: 'Vérification', statuses: ['reviewing'] },
  { label: 'Paiement demandé', statuses: ['awaiting_payment'] },
  { label: 'Paiement reçu', statuses: ['paid', 'preparing_shipment'] },
  { label: 'Expédiée', statuses: ['shipped', 'completed'] },
];

/** Explication de l'étape en cours, pour le client. */
export const CUSTOMER_NEXT_STEP: Record<OrderStatus, string> = {
  submitted:
    'Dar Nūr va vérifier la disponibilité de vos articles et calculer les frais de livraison. Rien n’est à payer pour l’instant.',
  reviewing:
    'Dar Nūr vérifie la disponibilité et prépare le total final, livraison comprise. Rien n’est à payer pour l’instant.',
  awaiting_payment: 'Votre commande est prête à être réglée.',
  paid: 'Votre paiement a été reçu. Dar Nūr prépare l’expédition.',
  preparing_shipment: 'Votre paiement a été reçu. Votre colis est en préparation.',
  shipped: 'Votre commande a été expédiée.',
  completed: 'Votre commande a été livrée.',
  cancelled: 'Cette commande a été annulée.',
};

/** Libellés de l'administration. */
export const ADMIN_STATUS: Record<OrderStatus, string> = {
  submitted: 'Reçue',
  reviewing: 'En vérification',
  awaiting_payment: 'Paiement demandé',
  paid: 'Payée',
  preparing_shipment: 'Préparation expédition',
  shipped: 'Expédiée',
  completed: 'Livrée',
  cancelled: 'Annulée',
};

export const ADMIN_PAYMENT: Record<PaymentStatus, string> = {
  not_requested: 'Non demandé',
  pending: 'En attente',
  paid: 'Payé',
  failed: 'Échec',
  cancelled: 'Demande annulée',
  refund_due: 'Remboursement dû',
  refunded: 'Remboursé',
};

/** Problème d'une ligne de panier renvoyé par le serveur (orders_private.resolve_lines). */
export const LINE_ISSUES: Record<string, string> = {
  invalid_line: 'Article non reconnu : retirez-le du panier.',
  invalid_quantity: 'Quantité invalide.',
  not_found: 'Cet article n’est plus proposé.',
  unavailable: 'Cet article n’est plus disponible à la commande.',
  variant_required: 'Choisissez une option sur la fiche du produit.',
  variant_mismatch: 'Option non reconnue : retirez cet article puis ajoutez-le de nouveau.',
  variant_unavailable: 'Cette option n’est plus disponible.',
  no_price: 'Cet article n’a pas de prix : il ne peut pas être commandé en ligne.',
  price_changed: 'Le prix de cet article a changé.',
  duplicate_line: 'Article en double.',
};

/** Erreurs globales de create_order_request. */
export const ORDER_ERRORS: Record<string, string> = {
  payload_invalid: 'La demande n’a pas pu être lue. Rechargez la page puis réessayez.',
  payload_too_large: 'La demande est trop volumineuse. Raccourcissez les instructions de livraison.',
  rejected: 'La demande a été refusée. Si le problème persiste, contactez-nous.',
  idempotency_conflict: 'Votre panier a changé pendant l’envoi. Vérifiez-le puis envoyez de nouveau.',
  rate_limited: 'Trop de demandes envoyées depuis votre connexion. Réessayez dans quelques minutes.',
  ordering_closed: 'La commande en ligne n’est pas encore ouverte.',
  cart_empty: 'Votre panier est vide.',
  too_many_lines: 'Votre panier contient trop d’articles différents pour une seule demande.',
  cart_changed: 'Votre panier a changé : vérifiez les articles signalés avant d’envoyer votre demande.',
  network: 'Connexion impossible. Vérifiez votre réseau : votre saisie est conservée.',
};

/** Montant en centimes → « 14,90 € » (espace insécable, comme formatPrice). */
export function formatCents(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}
