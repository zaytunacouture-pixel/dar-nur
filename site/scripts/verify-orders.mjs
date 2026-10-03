#!/usr/bin/env node
/**
 * Contrôles du parcours de commande (étape 10) sur la sortie du build. Aucun réseau.
 *
 *  1. /panier/, /commande/, /suivi/, /admin/commandes/ existent, sont noindex dans tout
 *     environnement, absentes du sitemap ; robots.txt les interdit en production.
 *  2. /commande/ : CTA « Envoyer ma demande de commande », aucun bouton « Payer », explication du
 *     parcours (vérification, frais confirmés, paiement, expédition après paiement), case CGV,
 *     pot de miel, chaque champ a un libellé et l'autocomplete attendu, pays ISO (France en tête),
 *     aucun indicatif imposé, code postal non obligatoire en dur, blocage CGV affiché hors production.
 *  3. /suivi/ : aucun lien de paiement statique ; message d'instructions manuelles présent.
 *  4. Configuration API : clé publishable seulement, uniquement sur les pages qui l'utilisent.
 *  5. Aucune page ne propose encore « Commander sur WhatsApp » (hors démonstrations internes) ;
 *     aucune promesse interdite (paiement à la réception, livraison mondiale / gratuite).
 *  6. Étape 11 : aucune référence à l'API ou à une clé Brevo, aucune fonction du worker d'e-mails
 *     dans le navigateur ; l'admin contient le bloc « Notifications ».
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const env = process.env.DAR_NUR_ENV ?? 'development';
const errors = [];
const fail = (m) => errors.push(m);
const posix = (p) => p.split(sep).join('/');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
if (!existsSync(dist)) {
  console.error('dist/ absent : lancer `npm run build` avant `npm run verify:orders`.');
  process.exit(1);
}
const read = (page) => {
  const file = join(dist, page);
  if (!existsSync(file)) {
    fail(`${page} absente`);
    return '';
  }
  return readFileSync(file, 'utf8');
};
const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&#x27;|&rsquo;/g, '’')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const PAGES = {
  panier: 'panier/index.html',
  commande: 'commande/index.html',
  suivi: 'suivi/index.html',
  admin: 'admin/commandes/index.html',
};
const html = Object.fromEntries(Object.entries(PAGES).map(([k, p]) => [k, read(p)]));

// ── 1. Indexation ───────────────────────────────────────────────────────────
for (const [name, doc] of Object.entries(html)) {
  if (!/<meta name="robots" content="noindex/.test(doc)) fail(`${name} : meta robots noindex absente`);
  if (/data-dn-indexable="true"/.test(doc)) fail(`${name} : marquée indexable (sitemap)`);
}
const sitemap = existsSync(join(dist, 'sitemap.xml')) ? readFileSync(join(dist, 'sitemap.xml'), 'utf8') : '';
for (const path of ['/panier/', '/commande/', '/suivi/', '/admin/'])
  if (sitemap.includes(path)) fail(`sitemap : ${path} présent`);
const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
if (env === 'production')
  for (const path of ['/panier/', '/commande/', '/suivi/', '/admin/'])
    if (!robots.includes(`Disallow: ${path}`)) fail(`robots.txt : Disallow ${path} absent en production`);

// ── 2. Page de commande ─────────────────────────────────────────────────────
const order = html.commande;
const orderText = text(order);
const orderingOpen = env !== 'production' || /data-dn-checkout-form/.test(order);
if (orderingOpen) {
  if (!/Envoyer ma demande de commande/.test(order))
    fail('commande : CTA « Envoyer ma demande de commande » absent');
  if (/>\s*Payer\b|Payer ma commande|Paiement sécurisé|Procéder au paiement/i.test(order))
    fail('commande : un bouton ou texte de paiement apparaît sur la demande de commande');
  for (const [pattern, label] of [
    [/rien n’est payé à ce moment-là/, 'aucun paiement à la demande'],
    [/vérifie la disponibilité/, 'vérification par Dar Nūr'],
    [/frais de livraison/, 'frais de livraison confirmés'],
    [/instructions de paiement/, 'instructions de paiement ensuite'],
    [/expédiée après réception du paiement/, 'expédition après paiement'],
  ])
    if (!pattern.test(orderText)) fail(`commande : explication manquante (${label})`);
  if (!/id="dn-terms"[^>]*type="checkbox"|type="checkbox"[^>]*id="dn-terms"/.test(order))
    fail('commande : case des conditions générales absente');
  if (!/name="website"[^>]*tabindex="-1"/.test(order)) fail('commande : pot de miel absent');
  const fields = {
    'dn-first-name': 'given-name',
    'dn-last-name': 'family-name',
    'dn-email': 'email',
    'dn-phone': 'tel',
    'dn-country': 'country',
    'dn-line1': 'address-line1',
    'dn-line2': 'address-line2',
    'dn-postal': 'postal-code',
    'dn-city': 'address-level2',
    'dn-region': 'address-level1',
  };
  for (const [id, autocomplete] of Object.entries(fields)) {
    const tag = new RegExp(`<(?:input|select|textarea)[^>]*id="${id}"[^>]*>`).exec(order)?.[0];
    if (!tag) {
      fail(`commande : champ ${id} absent`);
      continue;
    }
    if (!new RegExp(`<label[^>]*for="${id}"`).test(order)) fail(`commande : ${id} sans libellé`);
    if (!tag.includes(`autocomplete="${autocomplete}"`))
      fail(`commande : ${id} sans autocomplete="${autocomplete}"`);
    if (!tag.includes(`aria-describedby="`) || !order.includes(`id="${id}-error"`))
      fail(`commande : ${id} sans message d'erreur relié`);
  }
  if (!/<textarea[^>]*id="dn-instructions"/.test(order))
    fail('commande : instructions de livraison absentes');
  const postal = /<input[^>]*id="dn-postal"[^>]*>/.exec(order)?.[0] ?? '';
  if (/\srequired/.test(postal) || /pattern=/.test(postal))
    fail('commande : code postal imposé en dur (format français)');
  const phone = /<input[^>]*id="dn-phone"[^>]*>/.exec(order)?.[0] ?? '';
  if (/value="\+?33|pattern=/.test(phone)) fail('commande : indicatif ou format de téléphone imposé');
  const options = [...order.matchAll(/<option value="([A-Z]{2})"/g)].map((m) => m[1]);
  if (options.length < 240 || options[0] !== 'FR')
    fail(`commande : liste des pays (${options.length}, premier ${options[0]})`);
  if (env !== 'production' && !/Préproduction/.test(orderText))
    fail('commande : bandeau de préproduction absent');
  if (
    !/conditions générales de vente publiées décrivent encore l’ancien/.test(orderText) &&
    env !== 'production'
  )
    fail('commande : blocage CGV non signalé en préproduction');
} else if (!/La commande en ligne ouvre bientôt/.test(order)) {
  fail('commande : production sans CGV révisées mais formulaire actif');
}

// ── 3. Suivi ────────────────────────────────────────────────────────────────
const tracking = html.suivi;
const payLink = /<a [^>]*data-dn-track-pay-link[^>]*>/.exec(tracking)?.[0] ?? '';
if (!payLink) fail('suivi : lien de paiement (masqué) absent du gabarit');
if (/href=/.test(payLink) || !/\shidden/.test(payLink))
  fail('suivi : lien de paiement statique ou visible sans URL réelle');
if (!/rel="noopener noreferrer"/.test(payLink))
  fail('suivi : lien de paiement sans rel="noopener noreferrer"');
if (!/Les instructions de paiement vous seront transmises par Dar Nūr\./.test(text(tracking)))
  fail('suivi : message d’instructions de paiement manuelles absent');

// ── 4. Configuration API ────────────────────────────────────────────────────
const files = walk(dist).filter((f) => f.endsWith('.html'));
for (const file of files) {
  const page = posix(relative(dist, file));
  const doc = readFileSync(file, 'utf8');
  const config = /<script type="application\/json" id="dn-api">([\s\S]*?)<\/script>/.exec(doc)?.[1];
  const expected = Object.values(PAGES).includes(page);
  if (expected && !config) fail(`${page} : configuration API absente`);
  if (!expected && config) fail(`${page} : configuration API inutile`);
  if (config) {
    const parsed = JSON.parse(config);
    if (!parsed.key.startsWith('sb_publishable_')) fail(`${page} : clé API non publique`);
    if (parsed.env !== env) fail(`${page} : environnement API ${parsed.env} ≠ ${env}`);
  }
  if (/service_role|sb_secret_/.test(doc)) fail(`${page} : clé secrète`);
  // ── 5. Plus de commande WhatsApp ni de promesse interdite ─────────────────
  if (!/^(demo|design-system|lab)\//.test(page)) {
    if (/Commander sur WhatsApp|Commande sur WhatsApp|souhaite%20commander/i.test(doc))
      fail(`${page} : commande WhatsApp encore proposée`);
    const t = text(doc);
    const banned =
      /paiement (?:à|a) la (?:r[ée]ception|livraison)|livraison (?:mondiale|gratuite|partout dans le monde)|sans frais de douane/i.exec(
        t,
      );
    if (banned) fail(`${page} : mention interdite « ${banned[0]} »`);
  }
}

// ── 6. E-mails transactionnels (étape 11) : rien côté navigateur ─────────────
// Aucun SDK ni appel Brevo, aucune fonction du worker : l'envoi est 100 % serveur
// (outbox Supabase → Edge Function). L'admin ne lit que admin_order_emails / alertes / relance.
let notificationsBlock = false;
for (const file of walk(dist).filter((f) => /\.(html|js)$/.test(f))) {
  const content = readFileSync(file, 'utf8');
  const page = posix(relative(dist, file));
  // (Les codes d'erreur « brevo_503 »… des libellés de l'admin sont attendus : casse respectée.)
  if (/api\.brevo\.com|sendinblue|sib-api|xkeysib-/i.test(content) || /BREVO_[A-Z]/.test(content))
    fail(`${page} : référence à l’API Brevo côté navigateur`);
  if (/order_emails_(claim|report|delivery_event)|ORDER_EMAILS_WORKER_SECRET/.test(content))
    fail(`${page} : fonction du worker d’e-mails exposée au navigateur`);
  if (content.includes('admin_order_emails')) notificationsBlock = true;
}
if (!notificationsBlock) fail('admin : bloc « Notifications » (admin_order_emails) absent');

if (errors.length) {
  console.error(`✗ ${errors.length} problème(s) sur le parcours de commande :`);
  for (const e of errors.slice(0, 80)) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ Parcours de commande vérifié (${files.length} pages, environnement ${env}).`);
