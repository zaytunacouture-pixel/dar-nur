/**
 * Gabarits des quatre e-mails transactionnels (étape 11) — versionnés et testés ici,
 * jamais modifiables à la main dans Brevo (aucun templateId).
 *
 * Contraintes e-mail : tableaux de mise en page, styles en ligne, aucune image obligatoire
 * (logo en texte), aucune police web, aucun JavaScript, 600 px max, bouton ≥ 44 px.
 * Chaque e-mail a une version HTML et une version texte équivalente.
 * Toute donnée variable est échappée (noms de produits, prénom, transporteur…).
 *
 * Langue : français seulement ; les textes sont regroupés par langue (STRINGS) pour
 * pouvoir en ajouter une sans toucher à la mise en page.
 */

import type { EmailItem, EmailJob, EmailType, Locale, RenderContext, RenderedEmail } from './types.ts';

export class RenderError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const COLORS = {
  bg: '#fbf8f2',
  surface: '#ffffff',
  alt: '#f3ede2',
  ink: '#1f221d',
  ink2: '#55524a',
  green: '#2c4a23',
  onGreen: '#fbf8f2',
  gold: '#b48a3c',
  line: '#e2d9c9',
  warningBg: '#f7eeda',
  warning: '#8a5a00',
};
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = 'Arial, Helvetica, sans-serif';

/* ── Outils ─────────────────────────────────────────────────────────── */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texte sur une ligne : caractères de contrôle remplacés (version texte et objet). */
function oneLine(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
}

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new RenderError('invalid_amount');
  return money.format(cents / 100);
}

/** Lien de suivi Dar Nūr : https, chemin /suivi/, jeton de 43 caractères dans le FRAGMENT. */
const TRACKING = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/suivi\/#[A-Za-z0-9_-]{43}$/;
export function checkTrackingUrl(url: string): string {
  if (!TRACKING.test(url)) throw new RenderError('invalid_tracking_url');
  return url;
}

/** Lien transporteur : seulement https, sans identifiants, vers un vrai nom d'hôte. Sinon NULL. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url || url.length > 2000 || /\s/.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  if (!host.includes('.') || /^[0-9.]+$/.test(host) || host.startsWith('[')) return null;
  if (/(^|\.)(localhost|local|internal)$/.test(host)) return null;
  return parsed.href;
}

/* ── Textes (fr) ────────────────────────────────────────────────────── */

interface Strings {
  brand: string;
  testBanner: string;
  testSubjectPrefix: string;
  hello: (firstName: string) => string;
  subject: Record<EmailType, (n: string) => string>;
  preheader: Record<EmailType, string>;
  title: Record<EmailType, string>;
  cta: { track: string; trackAndPay: string; carrier: string };
  received: { intro: (n: string) => string; checking: string; noPayment: string; next: string };
  requested: { intro: (n: string) => string; withLink: string; withoutLink: string; shipAfter: string };
  confirmed: { intro: (n: string) => string; next: string };
  shipped: { intro: (n: string) => string; noTracking: string };
  labels: {
    items: string;
    subtotal: string;
    discount: string;
    shipping: string;
    shippingPending: string;
    total: string;
    totalPaid: string;
    onDemand: string;
    unavailable: string;
    carrier: string;
    service: string;
    trackingNumber: string;
    quantity: (q: number) => string;
  };
  footer: { why: string; personalLink: string; reply: string };
}

const STRINGS: Record<Locale, Strings> = {
  fr: {
    brand: 'Dar Nūr',
    testBanner: 'E-mail de test — commande de test (préproduction), sans suite commerciale.',
    testSubjectPrefix: '[TEST] ',
    hello: (firstName) => `Bonjour ${firstName},`,
    subject: {
      order_received: (n) => `Dar Nūr — Commande ${n} reçue`,
      payment_requested: (n) => `Dar Nūr — Paiement demandé pour la commande ${n}`,
      payment_confirmed: (n) => `Dar Nūr — Paiement reçu pour la commande ${n}`,
      order_shipped: (n) => `Dar Nūr — Commande ${n} expédiée`,
    },
    preheader: {
      order_received: 'Nous avons bien reçu votre demande de commande. Aucun paiement n’est demandé à ce stade.',
      payment_requested: 'Votre commande a été vérifiée : voici le total final, livraison comprise.',
      payment_confirmed: 'Nous avons bien reçu votre paiement. Nous préparons l’expédition.',
      order_shipped: 'Votre commande a été expédiée.',
    },
    title: {
      order_received: 'Votre demande de commande est bien reçue',
      payment_requested: 'Votre commande a été vérifiée',
      payment_confirmed: 'Paiement reçu',
      order_shipped: 'Votre commande est expédiée',
    },
    cta: {
      track: 'Suivre ma commande',
      trackAndPay: 'Voir ma commande et le paiement',
      carrier: 'Suivre le colis chez le transporteur',
    },
    received: {
      intro: (n) => `Nous avons bien reçu votre demande de commande ${n}.`,
      checking:
        'Dar Nūr vérifie maintenant la disponibilité des articles et calcule les frais de livraison vers votre adresse.',
      noPayment: 'Aucun paiement n’est demandé à ce stade.',
      next: 'Une fois la commande vérifiée, vous recevrez le total final, livraison comprise, et les instructions de paiement.',
    },
    requested: {
      intro: (n) => `Nous avons vérifié votre commande ${n} et confirmé les frais de livraison. Voici le total final.`,
      withLink: 'Le lien de paiement sécurisé est disponible sur votre page de suivi.',
      withoutLink: 'Les instructions de paiement vous seront transmises par Dar Nūr.',
      shipAfter: 'Votre commande sera expédiée après réception du paiement.',
    },
    confirmed: {
      intro: (n) => `Nous confirmons la réception de votre paiement pour la commande ${n}.`,
      next: 'Prochaine étape : nous préparons l’expédition de votre commande. Vous recevrez un e-mail lors de son expédition.',
    },
    shipped: {
      intro: (n) => `Votre commande ${n} a été expédiée.`,
      noTracking: 'Aucun numéro de suivi transporteur n’a été communiqué pour cet envoi.',
    },
    labels: {
      items: 'Articles',
      subtotal: 'Sous-total produits',
      discount: 'Remise',
      shipping: 'Livraison',
      shippingPending: 'À confirmer',
      total: 'Total à régler',
      totalPaid: 'Total payé',
      onDemand: 'Sur commande',
      unavailable: 'Indisponible — non facturé',
      carrier: 'Transporteur',
      service: 'Service',
      trackingNumber: 'Numéro de suivi',
      quantity: (q) => `Quantité : ${q}`,
    },
    footer: {
      why: 'Vous recevez cet e-mail parce que vous avez fait une demande de commande sur Dar Nūr. Ce n’est pas un message publicitaire.',
      personalLink: 'Le lien de suivi est personnel : ne le transférez pas.',
      reply: 'Une question ? Répondez simplement à cet e-mail.',
    },
  },
};

/* ── Blocs (HTML + texte en parallèle) ──────────────────────────────── */

interface Block {
  html: string;
  text: string;
}
const p = (text: string, opts: { strong?: boolean; muted?: boolean } = {}): Block => ({
  html:
    `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.55;color:${opts.muted ? COLORS.ink2 : COLORS.ink};">` +
    // Le numéro de commande ne se coupe jamais à ses tirets.
    (opts.strong ? `<strong>${escapeHtml(text)}</strong>` : escapeHtml(text)).replace(
      /DN-\d{4}-[A-HJ-NP-Z2-9]{6}/g,
      '<span style="white-space:nowrap;">$&</span>',
    ) +
    '</p>',
  text: oneLine(text),
});

function button(label: string, url: string, primary = true): Block {
  const bg = primary ? COLORS.green : COLORS.surface;
  const fg = primary ? COLORS.onGreen : COLORS.green;
  return {
    html:
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr>` +
      `<td align="center" bgcolor="${bg}" style="border-radius:4px;border:2px solid ${COLORS.green};">` +
      `<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:13px 24px;min-width:200px;` +
      `font-family:${SANS};font-size:16px;font-weight:bold;line-height:1.2;color:${fg};text-decoration:none;text-align:center;">` +
      `${escapeHtml(label)}</a></td></tr></table>`,
    text: `${label} : ${url}`,
  };
}

function rows(pairs: [string, string, boolean?][]): Block {
  const visible = pairs.filter(([, v]) => v);
  return {
    html:
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-top:1px solid ${COLORS.line};">` +
      visible
        .map(
          ([label, value, strong]) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${COLORS.line};font-family:${SANS};font-size:15px;color:${COLORS.ink2};">${escapeHtml(label)}</td>` +
            `<td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid ${COLORS.line};font-family:${SANS};font-size:${strong ? '17px' : '15px'};` +
            `color:${COLORS.ink};${strong ? 'font-weight:bold;' : ''}white-space:nowrap;">${escapeHtml(value)}</td></tr>`,
        )
        .join('') +
      '</table>',
    text: visible.map(([label, value]) => `${label} : ${value}`).join('\n'),
  };
}

function items(list: EmailItem[], s: Strings): Block {
  if (!list.length) throw new RenderError('no_items');
  const htmlRows = list.map((item) => {
    const notes = [item.variant, s.labels.quantity(item.quantity), item.on_demand && !item.unavailable ? s.labels.onDemand : null]
      .filter(Boolean)
      .map((n) => escapeHtml(n))
      .join(' · ');
    const price = item.unavailable ? escapeHtml(s.labels.unavailable) : escapeHtml(formatCents(item.line_total_cents));
    return (
      `<tr><td style="padding:12px 0;border-bottom:1px solid ${COLORS.line};font-family:${SANS};font-size:15px;line-height:1.45;color:${COLORS.ink};">` +
      `<span style="${item.unavailable ? 'text-decoration:line-through;' : ''}">${escapeHtml(item.name)}</span>` +
      `<br><span style="font-size:13px;color:${COLORS.ink2};">${notes}</span></td>` +
      `<td align="right" valign="top" style="padding:12px 0 12px 12px;border-bottom:1px solid ${COLORS.line};font-family:${SANS};font-size:15px;color:${item.unavailable ? COLORS.ink2 : COLORS.ink};white-space:nowrap;">${price}</td></tr>`
    );
  });
  const textRows = list.map((item) => {
    const details = [item.variant, `x${item.quantity}`, item.on_demand && !item.unavailable ? s.labels.onDemand : null]
      .filter(Boolean)
      .map(oneLine)
      .join(', ');
    return `- ${oneLine(item.name)} (${details}) : ${item.unavailable ? s.labels.unavailable : formatCents(item.line_total_cents)}`;
  });
  return {
    html:
      `<h2 style="margin:8px 0 4px;font-family:${SERIF};font-size:17px;font-weight:normal;color:${COLORS.green};">${escapeHtml(s.labels.items)}</h2>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${htmlRows.join('')}</table>`,
    text: `${s.labels.items} :\n${textRows.join('\n')}`,
  };
}

/* ── Corps de chaque type ───────────────────────────────────────────── */

function body(job: EmailJob, s: Strings): { blocks: Block[]; cta: Block } {
  const o = job.order;
  const n = o.number;
  const tracking = checkTrackingUrl(job.tracking_url);
  switch (job.email_type) {
    case 'order_received':
      return {
        blocks: [
          p(s.received.intro(n)),
          p(s.received.checking),
          items(o.items, s),
          rows([
            [s.labels.subtotal, formatCents(o.subtotal_cents)],
            [s.labels.shipping, s.labels.shippingPending],
          ]),
          p(s.received.noPayment, { strong: true }),
          p(s.received.next),
        ],
        cta: button(s.cta.track, tracking),
      };
    case 'payment_requested': {
      if (!o.total_confirmed || o.total_cents === null || o.shipping_cents === null) throw new RenderError('total_not_confirmed');
      return {
        blocks: [
          p(s.requested.intro(n)),
          items(o.items, s),
          rows([
            [s.labels.subtotal, formatCents(o.subtotal_cents)],
            [s.labels.discount, o.discount_cents ? `− ${formatCents(o.discount_cents)}` : ''],
            [s.labels.shipping, formatCents(o.shipping_cents)],
            [s.labels.total, formatCents(o.total_cents), true],
          ]),
          p(o.has_payment_link ? s.requested.withLink : s.requested.withoutLink, { strong: true }),
          p(s.requested.shipAfter),
        ],
        cta: button(o.has_payment_link ? s.cta.trackAndPay : s.cta.track, tracking),
      };
    }
    case 'payment_confirmed':
      if (o.total_cents === null) throw new RenderError('total_not_confirmed');
      return {
        blocks: [p(s.confirmed.intro(n)), rows([[s.labels.totalPaid, formatCents(o.total_cents), true]]), p(s.confirmed.next)],
        cta: button(s.cta.track, tracking),
      };
    case 'order_shipped': {
      const sh = o.shipment;
      if (!sh) throw new RenderError('not_shipped');
      const carrierUrl = safeExternalUrl(sh.tracking_url);
      const blocks: Block[] = [p(s.shipped.intro(n))];
      const details = rows([
        [s.labels.carrier, oneLine(sh.carrier)],
        [s.labels.service, oneLine(sh.service)],
        [s.labels.trackingNumber, oneLine(sh.tracking_number)],
      ]);
      if (details.text) blocks.push(details);
      if (!sh.tracking_number && !carrierUrl) blocks.push(p(s.shipped.noTracking, { muted: true }));
      if (carrierUrl) blocks.push(button(s.cta.carrier, carrierUrl, false));
      return { blocks, cta: button(s.cta.track, tracking) };
    }
    default:
      throw new RenderError('unknown_type');
  }
}

/* ── Rendu complet ──────────────────────────────────────────────────── */

export function renderEmail(job: EmailJob, ctx: RenderContext): RenderedEmail {
  const s = STRINGS[job.locale];
  if (!s) throw new RenderError('unknown_locale');
  if (!/^DN-\d{4}-[A-HJ-NP-Z2-9]{6}$/.test(job.order.number)) throw new RenderError('invalid_number');
  const isTest = job.environment !== 'production';
  const subject = (isTest ? s.testSubjectPrefix : '') + s.subject[job.email_type](job.order.number);
  const firstName = oneLine(job.recipient.first_name);
  const { blocks, cta } = body(job, s);
  const site = new URL(job.tracking_url).origin;
  const siteLabel = new URL(site).hostname;
  const footer = [s.footer.why, s.footer.personalLink, ctx.replyToConfigured ? s.footer.reply : null].filter(
    (x): x is string => Boolean(x),
  );

  const html =
    '<!doctype html>\n' +
    '<html lang="fr" dir="ltr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    `<title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${COLORS.bg};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(s.preheader[job.email_type])}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">` +
    '<tr><td align="center" style="padding:24px 12px;">' +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:4px;">` +
    // En-tête : logo en texte (aucune image à charger), filet doré.
    `<tr><td style="padding:28px 28px 8px;"><div style="font-family:${SERIF};font-size:26px;letter-spacing:0.5px;color:${COLORS.green};">${escapeHtml(s.brand)}</div>` +
    `<div style="width:48px;height:2px;margin-top:10px;background:${COLORS.gold};line-height:2px;font-size:0;">&nbsp;</div></td></tr>` +
    (isTest
      ? `<tr><td style="padding:12px 28px 0;"><div style="padding:10px 12px;background:${COLORS.warningBg};border-left:4px solid ${COLORS.warning};font-family:${SANS};font-size:14px;line-height:1.4;color:${COLORS.warning};">${escapeHtml(s.testBanner)}</div></td></tr>`
      : '') +
    `<tr><td style="padding:20px 28px 8px;">` +
    `<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:23px;line-height:1.3;font-weight:normal;color:${COLORS.ink};">${escapeHtml(s.title[job.email_type])}</h1>` +
    p(s.hello(firstName)).html +
    blocks.map((b) => b.html).join('') +
    cta.html +
    '</td></tr>' +
    `<tr><td style="padding:20px 28px 28px;background:${COLORS.alt};border-top:1px solid ${COLORS.line};">` +
    footer
      .map((line) => `<p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:1.5;color:${COLORS.ink2};">${escapeHtml(line)}</p>`)
      .join('') +
    `<p style="margin:12px 0 0;font-family:${SERIF};font-size:15px;color:${COLORS.green};">${escapeHtml(s.brand)} · ` +
    `<a href="${escapeHtml(site)}" target="_blank" style="color:${COLORS.green};text-decoration:underline;">${escapeHtml(siteLabel)}</a></p>` +
    '</td></tr></table></td></tr></table></body></html>';

  const text =
    [
      isTest ? `*** ${s.testBanner} ***` : null,
      s.brand.toUpperCase(),
      '',
      s.title[job.email_type],
      '',
      s.hello(firstName),
      '',
      ...blocks.flatMap((b) => [b.text, '']),
      cta.text,
      '',
      '--',
      ...footer,
      `${s.brand} · ${site}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n') + '\n';

  return { subject, html, text };
}
