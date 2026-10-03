/**
 * Appels aux fonctions de commande Supabase (étape 10) depuis le navigateur.
 *
 * Seule la clé PUBLIQUE (`sb_publishable_…`) est utilisée : les tables de commande sont fermées
 * à ce rôle, seules quatre fonctions contrôlées lui sont ouvertes (create_order_request,
 * get_order_tracking, check_cart, order_country_codes). L'administration ajoute le jeton de
 * session de l'administrateur connecté ; aucune clé secrète n'existe côté site.
 * Configuration lue dans <script type="application/json" id="dn-api"> (ApiConfig.astro).
 */

export interface ApiConfig {
  url: string;
  key: string;
  env: 'development' | 'preprod' | 'production';
  orderingOpen: boolean;
}

export function apiConfig(): ApiConfig | null {
  try {
    const raw = document.getElementById('dn-api')?.textContent;
    const config = raw ? (JSON.parse(raw) as ApiConfig) : null;
    return config?.url && config.key ? config : null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** POST /rest/v1/rpc/<fn>. `token` : jeton de session admin (sinon clé publique). */
export async function rpc<T>(fn: string, args: Record<string, unknown>, token?: string): Promise<T> {
  const config = apiConfig();
  if (!config) throw new ApiError('Configuration absente', 0, 'config');
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${token ?? config.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError('Réseau indisponible', 0, 'network');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message ?? `HTTP ${response.status}`;
    throw new ApiError(message, response.status, message.startsWith('dn:') ? message.slice(3) : 'http');
  }
  return body as T;
}

/** Ligne envoyée au serveur : identifiants, quantité, prix AFFICHÉ (contrôlé, jamais repris). */
export interface OrderItemInput {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price_cents: number;
}

export interface ResolvedLine {
  index: number;
  product_id: string | null;
  variant_id: string | null;
  quantity: number | null;
  issue: string | null;
  product_name: string | null;
  variant_label: string | null;
  availability: string | null;
  unit_price_cents: number | null;
  list_unit_price_cents: number | null;
}

export interface PublicOrderItem {
  name: string;
  slug: string;
  variant: string | null;
  quantity: number;
  unit_price_cents: number;
  list_unit_price_cents: number;
  offer: string | null;
  line_total_cents: number;
  on_demand: boolean;
  unavailable: boolean;
}

export interface PublicOrder {
  number: string;
  status: import('@/lib/orders/labels').OrderStatus;
  payment_status: import('@/lib/orders/labels').PaymentStatus;
  environment: string;
  created_at: string;
  country_code: string;
  currency: string;
  items: PublicOrderItem[];
  subtotal_cents: number;
  total_confirmed: boolean;
  shipping_cents: number | null;
  discount_cents: number | null;
  total_cents: number | null;
  shipping_estimate: string | null;
  payment_url: string | null;
  payment_provider: string | null;
  paid_at: string | null;
  shipment: {
    carrier: string | null;
    service: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    shipped_at: string | null;
  } | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

/** Commandes passées depuis cet appareil (numéro + jeton), pour retrouver le suivi. */
const ORDERS_KEY = 'dn-orders-v1';
export interface SavedOrder {
  number: string;
  token: string;
  at: string;
}
export function savedOrders(): SavedOrder[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]');
    return Array.isArray(list)
      ? list.filter(
          (o): o is SavedOrder =>
            typeof o?.number === 'string' &&
            /^DN-\d{4}-[A-Z0-9]{6}$/.test(o.number) &&
            typeof o?.token === 'string' &&
            /^[A-Za-z0-9_-]{43}$/.test(o.token),
        )
      : [];
  } catch {
    return [];
  }
}
export function saveOrder(order: SavedOrder): void {
  try {
    const list = [order, ...savedOrders().filter((o) => o.number !== order.number)].slice(0, 10);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
  } catch {
    // Sans stockage : le lien de suivi reste affiché sur la page de confirmation.
  }
}
