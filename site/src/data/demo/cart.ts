/**
 * PANIER FICTIF — démonstration visuelle du mini-panier uniquement.
 * Séparé du métier : aucun lien avec js/cart.js (non migré), aucune donnée de prix
 * qui ferait autorité, aucune commande possible. Utilisé seulement sur /demo/ et
 * /design-system/, où il est étiqueté « Démonstration ».
 */
export interface DemoCartLine {
  name: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
}

export const demoCartLines: DemoCartLine[] = [
  { name: 'Article de démonstration A', variant: 'Format : 200 g', quantity: 1, unitPrice: 14.9 },
  { name: 'Article de démonstration B', variant: 'Taille : L', quantity: 2, unitPrice: 12.5 },
];

export const demoCartSubtotal = demoCartLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
export const demoCartCount = demoCartLines.reduce((sum, l) => sum + l.quantity, 0);
