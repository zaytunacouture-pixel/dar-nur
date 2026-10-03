/**
 * Types partagés des e-mails transactionnels (étape 11).
 * Forme des données rendues par public.order_emails_claim (orders_private.order_email_payload).
 * Aucun identifiant interne de commande, aucune adresse postale, aucun téléphone.
 */

export type EmailType = 'order_received' | 'payment_requested' | 'payment_confirmed' | 'order_shipped';
export type Locale = 'fr';
export type Environment = 'development' | 'preprod' | 'production';

export interface EmailItem {
  name: string;
  variant: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  on_demand: boolean;
  unavailable: boolean;
}

export interface EmailShipment {
  carrier: string | null;
  service: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
}

export interface EmailOrder {
  number: string;
  created_at: string;
  country_code: string;
  currency: 'EUR';
  items: EmailItem[];
  subtotal_cents: number;
  total_confirmed: boolean;
  shipping_cents: number | null;
  discount_cents: number | null;
  total_cents: number | null;
  has_payment_link: boolean;
  paid_at: string | null;
  shipment: EmailShipment | null;
}

/** Une ligne d'outbox réclamée, prête à rendre et envoyer. */
export interface EmailJob {
  id: string;
  claim_id: string;
  email_type: EmailType;
  locale: Locale;
  environment: Environment;
  attempt: number;
  recipient: { email: string; first_name: string };
  tracking_url: string;
  order: EmailOrder;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderContext {
  /** Une adresse de réponse est configurée (sinon, on n'invite pas à « répondre »). */
  replyToConfigured: boolean;
}
