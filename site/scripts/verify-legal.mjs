#!/usr/bin/env node
/**
 * Contrôles juridiques (étape 12) sur la sortie du build. Aucun réseau, aucune écriture.
 *
 *  1. /cgv/, /confidentialite/, /mentions-legales/ existent, portent la même version, un seul <h1>.
 *  2. Production : aucune information obligatoire manquante (data-dn-legal-blockers = 0), version
 *     finalisée, et formulaire de commande inactif tant qu'un blocage subsiste.
 *  3. Aucune ancienne mention devenue fausse, sur toutes les pages publiques : commande WhatsApp
 *     obligatoire, paiement à la réception, espèces, Revolut, livraison Île-de-France, anciens
 *     points de remise (Chelles hors adresse légale, Lognes), GitHub Pages, ancienne adresse
 *     Outlook, liens vers les anciennes pages légales de dar-nur.fr.
 *  4. Contenus obligatoires : parcours et conclusion du contrat, délai de paiement de 48 h,
 *     expédition sous 3 à 5 jours, rétractation + formulaire, encadré officiel des garanties,
 *     médiation, prestataires réels, durées de conservation, droits, hébergeur.
 *  5. Pages juridiques : aucun prestataire de paiement nommé (aucun n'est intégré), aucun numéro
 *     de téléphone, jamais « conservation indéfinie ».
 *  6. Liens : footer → trois pages internes ; tout lien « Conditions générales de vente » → /cgv/.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const env = process.env.DAR_NUR_ENV ?? 'development';
const errors = [];
const notes = [];
const fail = (m) => errors.push(m);
const posix = (p) => p.split(sep).join('/');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
if (!existsSync(dist)) {
  console.error('dist/ absent : lancer `npm run build` avant `npm run verify:legal`.');
  process.exit(1);
}
const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&#x27;|&rsquo;/g, '’')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

// ── 1. Pages juridiques ─────────────────────────────────────────────────────
const PAGES = {
  cgv: 'cgv/index.html',
  confidentialite: 'confidentialite/index.html',
  mentions: 'mentions-legales/index.html',
};
const html = {};
for (const [name, page] of Object.entries(PAGES)) {
  const file = join(dist, page);
  if (!existsSync(file)) {
    fail(`${page} absente`);
    html[name] = '';
    continue;
  }
  html[name] = readFileSync(file, 'utf8');
}
const versions = new Set();
const blockerCounts = [];
for (const [name, doc] of Object.entries(html)) {
  if (!doc) continue;
  const version = /data-dn-legal-version="([^"]+)"/.exec(doc)?.[1];
  const blockers = /data-dn-legal-blockers="(\d+)"/.exec(doc)?.[1];
  if (!version || blockers === undefined) fail(`${name} : gabarit juridique (version, blocages) absent`);
  versions.add(version);
  blockerCounts.push(Number(blockers ?? 0));
  if ((doc.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${name} : un seul <h1> attendu`);
}
if (versions.size > 1) fail(`versions juridiques différentes : ${[...versions].join(', ')}`);
const blockerCount = Math.max(0, ...blockerCounts);

// ── 2. Production : rien d'incomplet ────────────────────────────────────────
if (env === 'production') {
  if (blockerCount > 0)
    fail(`production : ${blockerCount} information(s) juridique(s) obligatoire(s) manquante(s)`);
  if ([...versions].some((v) => /preprod/.test(v ?? '')))
    fail('production : version juridique de préproduction');
}
const commande = existsSync(join(dist, 'commande/index.html'))
  ? readFileSync(join(dist, 'commande/index.html'), 'utf8')
  : '';
if (env === 'production' && blockerCount > 0 && /data-dn-checkout-form/.test(commande))
  fail('production : formulaire de commande actif malgré des informations juridiques manquantes');

// ── 3. Anciennes mentions devenues fausses (toutes pages publiques) ─────────
const OBSOLETE = [
  [
    /(?:commandes?|achats?)[^.]{0,40}pass[ée]e?s? (?:uniquement |exclusivement )?(?:sur|via|par) WhatsApp/i,
    'commande sur WhatsApp',
  ],
  [/WhatsApp[^.]{0,30}obligatoire|obligatoire[^.]{0,30}WhatsApp/i, 'WhatsApp obligatoire'],
  [
    /paiement (?:à|a) (?:la )?r[ée]ception|(?:payer|pay[ée]e?|r[éè]gl(?:er|ée?|ement)) (?:à|a) la (?:r[ée]ception|livraison)/i,
    'paiement à la réception',
  ],
  [/(?:en|par) esp[èe]ces|esp[èe]ces ou |ou en esp[èe]ces/i, 'paiement en espèces'],
  [/revolut/i, 'Revolut'],
  [/[îi]le-de-france|\bIDF\b/i, 'livraison Île-de-France'],
  [/\bLognes\b|Palombes|Office Depot/i, 'anciens points de remise (Lognes)'],
  [/github pages|github\.io/i, 'GitHub Pages comme hébergeur'],
  [/dar_nur_001|@outlook\./i, 'ancienne adresse Outlook'],
];
const LEGACY_LINK = /dar-nur\.fr\/(?:cgv|confidentialite|mentions-legales)\.html/;
const LEGAL_ADDRESS = '77500 Chelles';
const files = walk(dist).filter((f) => f.endsWith('.html'));
let footerChecked = 0;
for (const file of files) {
  const page = posix(relative(dist, file));
  if (/^(demo|design-system|lab)\//.test(page)) continue;
  const doc = readFileSync(file, 'utf8');
  const t = text(doc);
  for (const [pattern, label] of OBSOLETE) {
    const hit = pattern.exec(t);
    if (hit) fail(`${page} : mention obsolète (${label}) « ${hit[0]} »`);
  }
  // Chelles n'est admis que dans l'adresse légale (ancienne remise gratuite « à Chelles »).
  const chelles = /\bChelles\b/i.exec(t.split(LEGAL_ADDRESS).join(' '));
  if (chelles) fail(`${page} : « Chelles » hors de l’adresse légale (ancien point de remise ?)`);
  if (LEGACY_LINK.test(doc)) fail(`${page} : lien vers une ancienne page légale de dar-nur.fr`);
  // Tout lien intitulé « Conditions générales de vente » mène aux CGV internes.
  for (const m of doc.matchAll(
    /<a\s[^>]*href="([^"]*)"[^>]*>\s*(?:<[^>]+>\s*)*Conditions générales de vente/g,
  ))
    if (!/^\/cgv\/(?:#[\w-]+)?$/.test(m[1])) fail(`${page} : lien CGV vers ${m[1]}`);
  const footer = /<footer class="dn-footer[\s\S]*?<\/footer>/.exec(doc)?.[0];
  if (footer) {
    footerChecked++;
    for (const path of ['/cgv/', '/mentions-legales/', '/confidentialite/'])
      if (!footer.includes(`href="${path}"`)) fail(`${page} : footer sans lien ${path}`);
  }
}
if (!footerChecked) fail('aucun footer contrôlé');

// ── 4. Contenus obligatoires ────────────────────────────────────────────────
const REQUIRED = {
  cgv: [
    [/n’entraîne aucune obligation de payer/, 'demande de commande sans obligation de payer'],
    [
      /Le contrat de vente est conclu lorsque le client paie le total final/,
      'conclusion du contrat au paiement',
    ],
    [/dispose de 48 heures après l’envoi de la demande de paiement/, 'délai de paiement de 48 heures'],
    [/les produits ne sont plus réservés/, 'fin de réservation sans paiement'],
    [
      /Les moyens de paiement disponibles sont indiqués au client au moment de la demande de paiement\./,
      'moyens de paiement',
    ],
    [
      /expédiées sous 3 à 5 jours après réception du paiement, sauf délai différent indiqué au client avant paiement/,
      'délai d’expédition',
    ],
    [/Dar Nūr livre en France et à l’international/, 'livraison France et international'],
    [/droits de douane/, 'droits et taxes à l’international'],
    [/délai de quatorze jours pour se rétracter/, 'droit de rétractation'],
    [/les frais directs de renvoi sont à la charge du client/, 'frais de retour (rétractation)'],
    [
      /les frais de retour ne sont pas à la charge du client/,
      'frais de retour (erreur, défaut, non-conformité)',
    ],
    [
      /la seule nature d’un produit \(parfum, soin, produit alimentaire…\) ne suffit pas/,
      'exceptions limitées aux cas légaux',
    ],
    [
      /Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat\./,
      'formulaire de rétractation',
    ],
    [
      /Le consommateur dispose d’un délai de deux ans à compter de la délivrance du bien pour obtenir la mise en œuvre de la garantie légale de conformité/,
      'encadré officiel des garanties',
    ],
    [
      /garantie légale des vices cachés en application des articles 1641 à 1649 du code civil/,
      'vices cachés',
    ],
    [/Médiation de la consommation/, 'médiation'],
    [/soumises au droit français/, 'droit applicable'],
  ],
  confidentialite: [
    [/Supabase/, 'Supabase'],
    [/Brevo/, 'Brevo'],
    [/Netlify/, 'Netlify'],
    [/région de Paris/, 'localisation des données'],
    [/n’enregistre ni l’ouverture des e-mails ni les clics/, 'aucun suivi comportemental enregistré'],
    [/48 heures/, 'empreinte IP 48 h'],
    [/trois ans après le dernier achat/, 'conservation relation client'],
    [/jusqu’à dix ans/, 'conservation comptable'],
    [/Programme de fidélité \(non proposé à ce jour\)/, 'fidélité future, non active'],
    [/stockage local/, 'stockage navigateur'],
    [/CNIL/, 'réclamation CNIL'],
    [/droit d’accès, de rectification, d’effacement/, 'droits RGPD'],
  ],
  mentions: [
    [/entrepreneur individuel \(EI\)/, 'forme juridique'],
    [/Directeur de la publication/, 'directeur de la publication'],
    [/Netlify, Inc\./, 'hébergeur'],
    [/contact@dar-nur\.fr/, 'e-mail public'],
    [/TVA non applicable, article 293 B/, 'mention TVA'],
  ],
};
for (const [name, rules] of Object.entries(REQUIRED)) {
  const t = text(html[name] ?? '');
  for (const [pattern, label] of rules)
    if (!pattern.test(t)) fail(`${name} : contenu obligatoire absent (${label})`);
}

// ── 5. Interdits propres aux pages juridiques ───────────────────────────────
// Contenu juridique seul (<article data-dn-legal-page>) : le footer commun n'est pas contrôlé ici.
const legalText = (doc) => text(/<article[^>]*data-dn-legal-page[\s\S]*?<\/article>/.exec(doc)?.[0] ?? '');
for (const [name, doc] of Object.entries(html)) {
  const t = legalText(doc);
  const provider = /shopify|stripe|paypal|mollie|sumup/i.exec(t);
  if (provider)
    fail(`${name} : prestataire de paiement nommé (« ${provider[0]} ») alors qu’aucun n’est intégré`);
  const phone = /(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/.exec(t);
  if (phone) fail(`${name} : numéro de téléphone affiché (« ${phone[0]} »)`);
  if (/ind[ée]finiment|ind[ée]finie|sans limitation de durée/i.test(t))
    fail(`${name} : conservation indéfinie`);
  if (/\[[^\]]*(?:compléter|TODO|XXX)[^\]]*\]|lorem ipsum/i.test(t)) fail(`${name} : texte à compléter`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} problème(s) juridique(s) :`);
  for (const e of errors.slice(0, 80)) console.error(`  - ${e}`);
  process.exit(1);
}
notes.push(`version ${[...versions][0]}, ${blockerCount} information(s) obligatoire(s) manquante(s)`);
console.log(`✓ Pages juridiques vérifiées (${files.length} pages, environnement ${env}).`);
for (const n of notes) console.log(`  · ${n}`);
if (blockerCount > 0)
  console.log('  · ouverture en production impossible tant que ces informations manquent');
