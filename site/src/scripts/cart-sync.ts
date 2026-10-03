/**
 * Revérification du panier contre le catalogue ACTUEL (fonction check_cart, lecture seule).
 * - prix changé : le panier prend le nouveau prix ET le client voit l'écart avant d'envoyer ;
 * - article indisponible, supprimé, option disparue : ligne signalée, envoi bloqué tant qu'elle
 *   reste dans le panier (jamais retirée en silence).
 * Le serveur refait ces contrôles à la création de la commande : ceci n'est qu'un affichage.
 */
import { formatCents, LINE_ISSUES } from '@/lib/orders/labels';
import { lineKey, readCart, updateLines, type CartLine } from './cart-store';
import type { LineNotice } from './cart-view';
import { rpc, type OrderItemInput, type ResolvedLine } from './order-api';

export const toItem = (line: CartLine): OrderItemInput => ({
  product_id: line.productId,
  variant_id: line.variantId,
  quantity: line.quantity,
  unit_price_cents: line.unitPriceCents,
});

export interface SyncResult {
  notices: Map<string, LineNotice>;
  /** Au moins une ligne ne peut pas être commandée telle quelle. */
  blocking: boolean;
  /** Prix mis à jour dans le panier. */
  repriced: number;
}

/** Applique au panier local le verdict du serveur (check_cart ou cart_changed). */
export function applyResolved(lines: CartLine[], resolved: ResolvedLine[]): SyncResult {
  const notices = new Map<string, LineNotice>();
  const fresh = new Map<string, { unit: number; list: number | null }>();
  let blocking = false;
  let repriced = 0;
  resolved.forEach((r, i) => {
    const line = lines[i];
    if (!line || !r.issue) return;
    const key = lineKey(line);
    if (r.issue === 'price_changed' && r.unit_price_cents) {
      repriced++;
      fresh.set(key, {
        unit: r.unit_price_cents,
        list:
          r.list_unit_price_cents && r.list_unit_price_cents > r.unit_price_cents
            ? r.list_unit_price_cents
            : null,
      });
      notices.set(key, {
        tone: 'warning',
        text: `Prix mis à jour : ${formatCents(line.unitPriceCents)} → ${formatCents(r.unit_price_cents)} l’unité.`,
      });
    } else {
      blocking = true;
      notices.set(key, { tone: 'error', text: LINE_ISSUES[r.issue] ?? LINE_ISSUES['unavailable']! });
    }
  });
  if (fresh.size)
    updateLines((line) => {
      const price = fresh.get(lineKey(line));
      return price ? { ...line, unitPriceCents: price.unit, listPriceCents: price.list } : line;
    });
  return { notices, blocking, repriced };
}

export async function syncCart(): Promise<SyncResult | null> {
  const lines = readCart();
  if (!lines.length) return { notices: new Map(), blocking: false, repriced: 0 };
  try {
    const result = await rpc<{ ok: boolean; lines?: ResolvedLine[] }>('check_cart', {
      p_items: lines.map(toItem),
    });
    return result.ok && result.lines ? applyResolved(lines, result.lines) : null;
  } catch {
    // Hors ligne : le panier reste affiché ; la demande de commande revérifiera tout.
    return null;
  }
}
