import type { PriceInfo } from '@/types/catalog';

/**
 * Format monétaire unique du site, identique à `fmtPrice()` (index.html) et
 * `formatPriceLabel()` (generate-category-pages.mjs) : « 14,90 € », espace insécable.
 */
export function formatPrice(amount: number): string {
  return `${Number(amount).toFixed(2).replace('.', ',')} €`;
}

/** Libellé lisible d'un prix de carte. */
export function priceLabel(price: PriceInfo): string {
  switch (price.kind) {
    case 'fixed':
      return formatPrice(price.amount);
    case 'from':
      return `dès ${formatPrice(price.amount)}`;
    case 'on-request':
      return 'Prix sur demande';
  }
}

/** Prix au kilo ou au litre à partir d'un libellé de format (« 200 g », « 50 ml »). */
export function unitPrice(price: number, formatLabel: string): string | null {
  const match = /^\s*([\d.,]+)\s*(g|kg|ml|cl|l)\s*$/i.exec(formatLabel);
  if (!match?.[1] || !match[2]) return null;
  const value = Number(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  const factor: Record<string, [number, string]> = {
    g: [value / 1000, 'kg'],
    kg: [value, 'kg'],
    ml: [value / 1000, 'L'],
    cl: [value / 100, 'L'],
    l: [value, 'L'],
  };
  const entry = factor[unit];
  if (!entry || entry[0] <= 0) return null;
  return `Soit ${formatPrice(price / entry[0])} / ${entry[1]}`;
}
