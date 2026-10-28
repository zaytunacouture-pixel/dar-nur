/** Décisions pures : aucun accès à l'environnement ni à l'interface. */
export type CommerceMode = 'legacy' | 'shopify' | 'disabled';
export const configuredCommerceMode: CommerceMode = 'legacy';
/** Approbation versionnée, indépendante d'une variable de déploiement. */
export const shopifyProductionApproved = false;
export const SHOPIFY_ORIGIN = 'https://shop.dar-nur.fr';
export const SHOPIFY_CATALOG_SOURCE = `${SHOPIFY_ORIGIN}/products.json?limit=250&page=N`;

export function resolveCommerceMode(override: unknown = undefined): CommerceMode {
  if (override === undefined) return configuredCommerceMode;
  if (override === 'legacy' || override === 'shopify' || override === 'disabled') return override;
  throw new Error('DAR_NUR_COMMERCE_MODE invalide : attendu legacy, shopify ou disabled.');
}

export const isLegacyCartEnabled = (mode: CommerceMode): boolean => mode === 'legacy';

export function isOrderSubmissionEnabled(
  mode: CommerceMode,
  environment: string,
  productionOrderingReady: boolean,
): boolean {
  return isLegacyCartEnabled(mode) && (environment !== 'production' || productionOrderingReady);
}

export const purchaseActionFor = (mode: CommerceMode): 'legacy-cart' | 'shopify-link' | 'none' =>
  mode === 'legacy' ? 'legacy-cart' : mode === 'shopify' ? 'shopify-link' : 'none';

export function assertCommerceBuild(
  mode: CommerceMode,
  environment: string,
  approved: boolean,
  validation: { structuralErrors: string[]; blockingCount: number; ready: boolean },
): void {
  if (mode !== 'shopify') return;
  if (environment === 'production' && !approved) {
    throw new Error(
      'Shopify en production interdit : shopifyProductionApproved doit être approuvé explicitement.',
    );
  }
  if (!validation.ready || validation.structuralErrors.length || validation.blockingCount) {
    throw new Error(
      'Mode shopify interdit : générer et valider la table (verify:shopify-map --strict), sans anomalie bloquante.',
    );
  }
}
