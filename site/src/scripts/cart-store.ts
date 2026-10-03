/**
 * Panier local (étape 10) : `localStorage`, aucun compte, aucune donnée personnelle.
 *
 * Le panier mémorise ce que le client a vu (produit, option, prix affiché, image, lien) pour
 * l'afficher sans réseau. Il ne fait JAMAIS foi : à la demande de commande, le serveur relit
 * produits, variantes, prix et disponibilités en base et refuse tout écart (prix modifié dans
 * le navigateur compris). Lecture défensive : une entrée mal formée est ignorée, les quantités
 * sont ramenées à des entiers entre 1 et le plafond technique.
 */

export interface CartLine {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  /** « Contenance : 200 g » — option choisie, telle qu'affichée sur la fiche. */
  variant: string | null;
  unitPriceCents: number;
  /** Prix catalogue si une offre produit s'applique (prix barré). */
  listPriceCents: number | null;
  image: string | null;
  href: string;
  onDemand: boolean;
  quantity: number;
}

const KEY = 'dn-cart-v1';
const EVENT = 'dn:cart-change';
export const MAX_QUANTITY = 99;
export const MAX_LINES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const lineKey = (line: Pick<CartLine, 'productId' | 'variantId'>) =>
  `${line.productId}/${line.variantId ?? '-'}`;

/** Quantité saisie → entier entre 1 et MAX_QUANTITY (NaN, 0, négatif, décimal : corrigés). */
export function clampQuantity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(n)));
}

function sanitize(raw: unknown): CartLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);
  const productId = text(r['productId'], 40);
  const variantId = r['variantId'] === null ? null : text(r['variantId'], 40);
  const price = r['unitPriceCents'];
  if (!productId || !UUID.test(productId) || (variantId !== null && !UUID.test(variantId))) return null;
  if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0) return null;
  const href = text(r['href'], 300);
  const image = text(r['image'], 500);
  const list = r['listPriceCents'];
  return {
    productId,
    variantId,
    slug: text(r['slug'], 200) ?? '',
    name: text(r['name']) ?? 'Article',
    variant: text(r['variant']),
    unitPriceCents: price,
    listPriceCents: typeof list === 'number' && Number.isInteger(list) && list > price ? list : null,
    // Liens et images : seulement des chemins du site ou des URL https (jamais javascript:).
    image: image && /^(\/|https:\/\/)/.test(image) ? image : null,
    href: href && href.startsWith('/') && !href.startsWith('//') ? href : '/',
    onDemand: r['onDemand'] === true,
    quantity: clampQuantity(r['quantity']),
  };
}

export function readCart(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .map(sanitize)
      .filter((line): line is CartLine => {
        if (!line || seen.has(lineKey(line))) return false;
        seen.add(lineKey(line));
        return true;
      })
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

function writeCart(lines: CartLine[]): void {
  try {
    if (lines.length) localStorage.setItem(KEY, JSON.stringify(lines));
    else localStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible (navigation privée stricte) : le panier vit le temps de la page.
  }
  document.dispatchEvent(new CustomEvent(EVENT, { detail: lines }));
}

export type AddResult = 'added' | 'increased' | 'capped' | 'full';

export function addToCart(line: Omit<CartLine, 'quantity'>, quantity = 1): AddResult {
  const lines = readCart();
  const existing = lines.find((l) => lineKey(l) === lineKey(line));
  if (existing) {
    const next = clampQuantity(existing.quantity + quantity);
    const capped = next === existing.quantity;
    // Le prix et le libellé affichés à l'instant remplacent l'ancien instantané.
    Object.assign(existing, line, { quantity: next });
    writeCart(lines);
    return capped ? 'capped' : 'increased';
  }
  if (lines.length >= MAX_LINES) return 'full';
  const clean = sanitize({ ...line, quantity });
  if (!clean) throw new Error('Ligne de panier invalide');
  writeCart([...lines, clean]);
  return 'added';
}

export function setQuantity(key: string, quantity: number): void {
  writeCart(readCart().map((l) => (lineKey(l) === key ? { ...l, quantity: clampQuantity(quantity) } : l)));
}

export function removeLine(key: string): void {
  writeCart(readCart().filter((l) => lineKey(l) !== key));
}

export function clearCart(): void {
  writeCart([]);
}

/** Remplace des lignes par leur version vérifiée (prix réel après check_cart). */
export function updateLines(update: (line: CartLine) => CartLine | null): void {
  writeCart(readCart().flatMap((l) => update(l) ?? []));
}

export const cartCount = (lines = readCart()) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotal = (lines = readCart()) =>
  lines.reduce((n, l) => n + l.quantity * l.unitPriceCents, 0);

/** Abonnement : changements de cette page ET des autres onglets (événement storage). */
export function onCartChange(callback: (lines: CartLine[]) => void): void {
  document.addEventListener(EVENT, () => callback(readCart()));
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) callback(readCart());
  });
}
