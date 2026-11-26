// FICHES PREMIUM (gabarit généralisé, fiches/premium/) : publié pour Santal Gourmand le 26 novembre 2026.
// Coexiste avec scripts/lib/fiche-editoriale.mjs (Cœur Blanc, fiches/_data/), laissé intact : chaque
// fiche n'est rendue que par un seul des deux gabarits (fiches/premium/_data/ prioritaire).
// Socle CSS : /fiche-premium.css ; liste du moteur SPA : FICHES_PREMIUM dans js/nav.js.
// Rendu « fiche éditoriale » d'un produit : présentation premium, page statique
// légère (sans le moteur SPA d'index.html), activée produit par produit. Sans
// fiches/_data/<slug>.json, la fiche garde son rendu habituel.
//
//   fiches/_editorial.html       coquille commune (head, navigation, pied, script)
//   fiches/_sections/<nom>.html  une section par fichier ; « nom.variante » pour une
//                                structure différente, « planche:<clé> » pour un chapitre libre
//   fiches/_data/<slug>.json     contenu, visuels, ordre des sections du parfum
//   fiches/_art/<slug>.css       palette et composition propres au parfum, écrites dans sa page
//   data.styles, data.scripts    facultatifs : fichiers de assets/<slug>/ limités à un média (ordinateur,
//                                impression), pour ne pas alourdir la page du téléphone
//   fiche-editoriale.css         socle commun ; fiche-impression.css : impression
//
// Données : nom, accroche, prix, disponibilité, contenance, description,
// pyramide (composition), conseils et précautions viennent de Supabase ; les
// textes et visuels éditoriaux viennent du JSON ; les conditions de livraison
// et de paiement sont extraites d'index.html (#deliveryBlock), seule source de
// vérité du site. js/fiche-editoriale.js relit ensuite prix et disponibilité.
//
// Une fiche en erreur n'affecte qu'elle-même : elle reprend le rendu standard et
// l'exécution le signale. Mode d'emploi : fiches/README.md. Aucune dépendance npm.

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = o => JSON.stringify(o).replace(/</g, '\\u003C');
const norm = s => String(s).trim().toLowerCase().replace(/’/g, "'").replace(/\.$/, '');
export const fmtPrice = v => {
  const n = Number(v);
  return (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')) + ' €';
};

const SECTIONS = ['ouverture', 'reperes', 'parfum', 'galerie', 'film', 'notes', 'essentiel', 'maison', 'conclusion', 'meme-maison'];
const FACULTATIVES = ['credits'];
const lf = t => t.replace(/\r\n/g, '\n');
const read = async (root, p) => lf(await readFile(new URL(p, root), 'utf8'));
const heroImages = data => ((data.hero || {}).images || [(data.hero || {}).image]).filter(Boolean);
const sectionsOf = data => data.sections || SECTIONS;
const allImages = data => [...heroImages(data), (data.perfume || {}).image, ...((data.gallery || {}).items || []), (data.house || {}).image, (data.film || {}).poster,
  ...Object.values((data.pyramid || {}).notes || {}).filter(n => n.src), ...Object.values(data.planches || {}).flatMap(p => p.images || []), ...Object.values(data.related || {})].filter(Boolean);

// Champs sans lesquels la fiche ne peut pas être composée. Le message nomme tout ce
// qui manque : une nouvelle fiche se corrige en une fois.
export function checkFiche(data) {
  const miss = [];
  const need = (o, keys, at) => keys.forEach(k => { if (o == null || o[k] == null || o[k] === '') miss.push(at + k); });
  need(data, ['brandLabel', 'typeLabel', 'genderLabel', 'seo', 'hero', 'perfume', 'gallery', 'pyramid', 'details', 'final'], '');
  need(data.seo, ['title', 'description'], 'seo.');
  need(data.perfume, ['eyebrow', 'title', 'lead', 'image', 'descriptionIndexes'], 'perfume.');
  need(data.gallery, ['eyebrow', 'title', 'lead', 'items'], 'gallery.');
  need(data.pyramid, ['eyebrow', 'title', 'notes'], 'pyramid.');
  need(data.details, ['eyebrow', 'title', 'sensoryNote'], 'details.');
  need(data.final, ['title'], 'final.');
  if (!heroImages(data).length) miss.push('hero.image');
  const images = allImages(data);
  for (const i of images) {
    if (!i.src || !i.w || !i.h || i.alt == null) miss.push(`image ${i.src || '(sans adresse)'} : src, w, h et alt`);
    if (i.kind && !KIND[i.kind]) miss.push(`nature d'image « ${i.kind} » inconnue`);
  }
  for (const n of sectionsOf(data)) {
    const [part, key] = n.split(':');
    const base = part.split('.')[0];
    if (base === 'planche' ? !(data.planches || {})[key] : ![...SECTIONS, ...FACULTATIVES].includes(base)) miss.push(`section « ${n} »`);
    if (base === 'film' && !data.film) miss.push('film');
    if (base === 'maison' && !data.house) miss.push('house');
  }
  // Crédits regroupés : la section doit être affichée et citer chaque nature d'image
  // utilisée. Sans elle, chaque image garde sa légende.
  if (data.credits) {
    if (!sectionsOf(data).includes('credits')) miss.push('section « credits »');
    const t = (data.credits.lines || []).join(' ').toLowerCase();
    for (const k of new Set(images.map(i => i.kind).filter(Boolean))) if (KIND[k] && !KIND_MOT[k].test(t)) miss.push(`credits.lines : nature « ${KIND[k]} » non citée`);
  } else if (sectionsOf(data).includes('credits')) miss.push('credits');
  return [...new Set(miss)];
}

export async function loadEditorialFiches(root, warn = () => {}) {
  const fiches = new Map();
  let names = [];
  try { names = await readdir(new URL('fiches/premium/_data/', root)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  names = names.filter(x => x.endsWith('.json')).sort();
  if (!names.length) return { fiches };
  const template = await read(root, 'fiches/premium/_editorial.html');
  // Le moteur SPA (accueil, autres fiches) doit ouvrir ces fiches par leur vraie
  // URL : la liste vit dans js/nav.js et doit nommer chaque fiche.
  const m = (await read(root, 'js/nav.js')).match(/FICHES_PREMIUM\s*=\s*(\[[^\]]*\])/);
  const declared = m ? JSON.parse(m[1].replace(/'/g, '"')) : [];
  const sections = new Map();
  for (const n of names) {
    const slug = n.slice(0, -5);
    try {
      const data = JSON.parse(await read(root, `fiches/premium/_data/${n}`));
      if (!declared.includes(slug)) throw new Error('absente de FICHES_PREMIUM (js/nav.js)');
      const miss = checkFiche(data);
      if (miss.length) throw new Error(`champs manquants ou inconnus : ${miss.join(', ')}`);
      const art = await read(root, `fiches/premium/_art/${slug}.css`);
      for (const part of sectionsOf(data).map(x => x.split(':')[0])) {
        if (!sections.has(part)) sections.set(part, (await read(root, `fiches/premium/_sections/${part}.html`)).trimEnd());
      }
      for (const f of [...(data.styles || []), ...(data.scripts || [])]) await read(root, (f.href || f.src).replace(/^\//, ''));
      fiches.set(slug, { data, art });
    } catch (e) {
      warn(`Fiche éditoriale ${slug} : ${e.message} — rendu standard publié à la place.`);
    }
  }
  for (const slug of declared) if (!names.includes(`${slug}.json`)) warn(`js/nav.js déclare la fiche premium ${slug}, sans fiches/premium/_data/${slug}.json.`);
  return { fiches, template, sections };
}

// Livraison « en trio » (details.delivery) : les trois possibilités restent côte à côte, les
// précisions plus longues passent en dessous. Présentation seule : aucune phrase n'est
// réécrite ni perdue ; si le bloc n'est pas reconnu, il est rendu tel quel.
export function trioDelivery(block) {
  const parts = [/<p class="dc-hint">[\s\S]*?<\/p>/, /<p class="dc-note">[\s\S]*?<\/p>/, /<div class="dc-modes">[\s\S]*?<\/div>/].map(r => (block.match(r) || [])[0]);
  const end = block.lastIndexOf('</div>');
  if (parts.some(p => !p) || end < 0 || (block.match(/\bdc-tier\b/g) || []).length !== 3) return block;
  let rest = block.slice(0, end);
  parts.forEach(p => { rest = rest.replace(p, ''); });
  return `${rest.trimEnd()}\n        <div class="dc-more">${parts.join('')}</div>\n      </div>`;
}

// Fichiers propres au parfum, limités à un média : demandés seulement si le média correspond
// (ordinateur), ou après le chargement (impression). Le téléphone ne les attend jamais.
function extras(data) {
  const L = [...(data.styles || []).map(f => [0, f.href, f.media]), ...(data.scripts || []).map(f => [1, f.src, f.media])];
  if (!L.length) return '';
  return `\n<script>(function(L){function a(x){var e=document.createElement(x[0]?'script':'link');if(x[0])e.src=x[1];else{e.rel='stylesheet';e.href=x[1];e.media=x[2]}document.head.appendChild(e)}L.forEach(function(x){if(x[2]==='print'){addEventListener('load',function(){a(x)});return}var m=matchMedia(x[2]),k;function f(){if(m.matches&&!k){k=1;a(x)}}f();if(m.addEventListener)m.addEventListener('change',f)})})(${json(L)})</script>`
    + `<noscript>${(data.styles || []).map(f => `<link rel="stylesheet" href="${esc(f.href)}" media="${esc(f.media)}"/>`).join('')}</noscript>`;
}

// Apostrophes courbes et espaces insécables d'un bloc HTML extrait, hors balises. Les pictogrammes,
// que ces fiches n'affichent pas, sont retirés.
const typo = html => html.replace(/\s*<svg class="dc-icon"[\s\S]*?<\/svg>/g, '').replace(/>\s+</g, '><').replace(/>[^<]+/g, t => t.replace(/'/g, '’').replace(/ ([:;?!»€])/g, '\u00a0$1'));

// Feuille du parfum, écrite dans sa page : sans commentaires ni blancs inutiles.
export const compactCss = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').trim();

// Isole <div ... id="deliveryBlock"> ... </div> d'index.html en équilibrant les div.
export function extractDeliveryBlock(indexHtml) {
  const start = indexHtml.indexOf('<div class="delivery-block" id="deliveryBlock">');
  if (start < 0) throw new Error('#deliveryBlock introuvable dans index.html');
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(indexHtml))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return indexHtml.slice(start, re.lastIndex).replace(' id="deliveryBlock"', '');
  }
  throw new Error('#deliveryBlock non refermé dans index.html');
}

// Sépare le bloc livraison de la carte de paiement SumUp. Toutes les phrases sont
// conservées : la zone de livraison (.dc-modes) reste avec la livraison. Si la carte
// n'est pas reconnue, le bloc entier reste sous « Livraison » : rien n'est perdu.
export function splitDelivery(block) {
  const start = block.search(/<div class="[^"]*\bdc-pay\b[^"]*">/);
  if (start < 0) return { delivery: block, payment: '' };
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0, m, end = -1;
  while ((m = re.exec(block))) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) { end = re.lastIndex; break; } }
  if (end < 0) return { delivery: block, payment: '' };
  let pay = block.slice(start, end);
  const zone = pay.match(/<div class="dc-modes">[\s\S]*?<\/div>/);
  if (zone) pay = pay.replace(zone[0], '');
  return { delivery: block.slice(0, start) + (zone ? zone[0] : '') + block.slice(end), payment: pay };
}

// « Notes de tête : A, B. Notes de cœur : C. Notes de fond : D, E. »
export function parsePyramid(composition) {
  const steps = [];
  for (const [, key, list] of String(composition || '').matchAll(/Notes? de (tête|cœur|coeur|fond)\s*:\s*([^.]*)\.?/gi)) {
    steps.push({ key: key.toLowerCase().replace('coeur', 'cœur'), notes: list.split(',').map(s => s.trim()).filter(Boolean) });
  }
  if (steps.length !== 3) throw new Error(`pyramide illisible : « ${composition} »`);
  return steps;
}

// Image hors premier écran : le chargement différé natif anticipe de plusieurs
// milliers de pixels en connexion lente. On attend donc l'approche réelle (script
// en ligne du gabarit), avec un repli <noscript> et des dimensions réservées.
function lazyImg(img, attrs = '') {
  const a = `alt="${esc(img.alt || '')}" width="${img.w}" height="${img.h}"${attrs}`;
  return `<img data-src="${esc(img.src)}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${img.w}' height='${img.h}'/%3E" ${a}/><noscript><img src="${esc(img.src)}" ${a}/></noscript>`;
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// Texte affiché : apostrophes courbes et espaces insécables (typographie française).
const tx = s => esc(s).replace(/'/g, '’').replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

const KIND = { photo: 'Photographie', scene: 'Décor composé par la marque', ambiance: "Visuel d'ambiance de la marque", film: 'Image du film officiel', dessin: 'Dessin au trait' };
const KIND_MOT = { photo: /photographie/, scene: /décor composé/, ambiance: /visuels? d'ambiance/, film: /films? officiels?/, dessin: /dessin/ };
const FEMININE = { musqué: 'Musquée', floral: 'Florale', poudré: 'Poudrée', boisé: 'Boisée', ambré: 'Ambrée', épicé: 'Épicée', fruité: 'Fruitée', gourmand: 'Gourmande', oriental: 'Orientale', frais: 'Fraîche', lacté: 'Lactée', cuiré: 'Cuirée', vert: 'Verte', hespéridé: 'Hespéridée', aromatique: 'Aromatique', aquatique: 'Aquatique', chypré: 'Chyprée', sucré: 'Sucrée', fumé: 'Fumée', solaire: 'Solaire' };

function figure(img, { cls = '', eager = false, caption = true } = {}) {
  const kind = caption && KIND[img.kind] || '';
  return `<figure class="${cls}">${eager ? `<img src="${esc(img.src)}"${img.srcset ? ` srcset="${esc(img.srcset)}" sizes="${esc(img.sizes || '100vw')}"` : ''} alt="${esc(img.alt)}" width="${img.w}" height="${img.h}" fetchpriority="high"/>` : lazyImg(img)}${kind ? `<figcaption>${tx(kind)}</figcaption>` : ''}</figure>`;
}

// Texte proposé dans le JSON (data.texts) : appliqué seulement si le texte Supabase
// qu'il remplace est inchangé. Sinon Supabase, source de vérité, l'emporte.
export const fingerprint = v => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);
function proposed(data, key, current, slug) {
  const t = (data.texts || {})[key];
  if (!t) return current;
  if (t.replaces === fingerprint(current)) return t.value;
  if (JSON.stringify(t.value) !== JSON.stringify(current)) console.log(`::warning::Fiche éditoriale ${slug} : le texte « ${key} » a changé dans Supabase, il remplace le texte proposé (fiches/_data, texts.${key}).`);
  return current;
}

// Film : affiché seulement si sa diffusion est autorisée (film.published). Sinon la
// photographie tient la même place, sans lecteur, sans adresse vidéo dans la page.
function filmBlock(film) {
  if (!film) return { eyebrow: '', title: '', text: '', credit: '', media: '' };
  const poster = lazyImg(film.poster, ' class="fe-poster"');
  if (film.published === false) return { ...film, ...film.still, media: `<div class="fe-player has-js">
      ${poster}
    </div>` };
  const sd = esc(film.sd), play = tx(film.play);
  return { ...film, media: `<div class="fe-player">
      ${poster}
      <video id="feVideo" controls playsinline preload="none" width="1080" height="1920" aria-label="${esc(film.label)}">
        <source src="${sd}" type="video/mp4" media="(max-width:767px)">
        <source src="${esc(film.hd)}" type="video/mp4">
        <a href="${sd}">${play}</a>
      </video>
      <button type="button" class="fe-play" id="fePlay" aria-label="${play}" hidden><span class="fe-play-pill" aria-hidden="true"><span class="fe-play-disc"></span>${play}</span></button>
    </div>` };
}

export function renderEditorialFiche({ template, sections, data, art, product, price, related, navHtml, deliveryHtml, catLabel }) {
  product = { ...product, description: proposed(data, 'description', product.description, product.slug), tagline: proposed(data, 'tagline', product.tagline, product.slug) };
  const heroes = heroImages(data), hero = heroes[0], og = data.seo.image || hero;
  const caption = !data.credits; // crédits regroupés en fin de page : aucune légende sous les images
  if (price.type !== 'fixed') throw new Error(`${product.slug} : une fiche éditoriale ne gère qu'un prix unique pour l'instant.`);
  const usable = price.value != null && Number.isFinite(Number(price.value));
  const soon = product.coming_soon === true;
  const priceLabel = usable ? fmtPrice(price.value) : 'Prix sur demande';
  const url = `https://dar-nur.fr/${product.slug}/`;
  const film = filmBlock(data.film);
  const abs = src => (/^https?:/.test(src) ? src : `https://dar-nur.fr${src}`);
  const fill = s => s.replace('{{VOLUME}}', product.volume || '').replace('{{PRICE}}', priceLabel);
  const title = data.seo.title;
  const description = fill(data.seo.description);
  const pyramid = parsePyramid(product.composition);
  const family = ((product.benefits || []).map(b => /^Famille olfactive\s*:\s*(.+)$/i.exec(b)).find(Boolean) || [])[1];
  if (!family && !data.family) throw new Error(`${product.slug} : famille olfactive absente de benefits.`);
  const families = (family || data.family).split(',').map(s => FEMININE[s.trim().toLowerCase()] || cap(s.trim()));
  const availability = soon ? 'Disponible prochainement' : product.availability === 'available' ? 'Disponible' : '';

  const waText = `As-salâm 'alaykoum,\n\nJe souhaite commander :\n\n• ${product.name}\n  Référence : ${product.slug}\n  Quantité : 1${usable ? `\n  Prix : ${Number(price.value).toFixed(2).replace('.', ',')} €` : ''}\n\nMes informations :\n\n• Nom :\n• Ville :\n• Paiement : lien sécurisé SumUp, envoyé par Dar Nūr après confirmation\n\nBarakAllahu fik.`;
  const waHref = `https://wa.me/33769253375?text=${encodeURIComponent(waText)}`;

  const buy = `<div class="fe-buy" data-buy>
          <div class="fe-price-row"><span class="fe-price" data-price>${esc(priceLabel)}</span><span class="fe-stock" data-stock${availability ? '' : ' hidden'}>${esc(availability)}</span></div>
          <div class="fe-cta">
            <button type="button" class="fe-btn fe-btn-main" data-add${soon || !usable ? ' disabled' : ''}>Ajouter au panier</button>
            <a class="fe-btn fe-btn-line" data-wa href="${esc(waHref)}" target="_blank" rel="noopener"${soon ? ' hidden' : ''}>Commander sur WhatsApp</a>
          </div>
${data.shopUrl ? `          <a class="fe-link fe-shop" href="${esc(data.shopUrl)}">Acheter en ligne sur shop.dar-nur.fr</a>\n` : ''}        </div>`;
  const { delivery, payment } = splitDelivery(deliveryHtml);
  const familyLine = data.details.sentenceCase ? cap(families.join(', ').toLowerCase()) : families.join(', ');

  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'Product', '@id': `${url}#produit`,
      name: product.name, description: (product.description || []).join(' '),
      brand: { '@type': 'Brand', name: data.brandLabel }, category: `${data.typeLabel} ${data.genderLabel.toLowerCase()}`, size: product.volume,
      image: [...heroes, (data.film || {}).poster, ...data.gallery.items.filter(i => i.kind === 'photo' || i.kind === 'film')].filter(Boolean).map(i => abs(i.src)).filter((x, i, a) => a.indexOf(x) === i),
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'Famille olfactive', value: families.join(', ') },
        ...pyramid.map(s => ({ '@type': 'PropertyValue', name: `Notes de ${s.key}`, value: s.notes.join(', ') })),
      ],
      ...(usable ? {
        offers: {
          '@type': 'Offer', url, priceCurrency: 'EUR', price: Number(price.value).toFixed(2), itemCondition: 'https://schema.org/NewCondition',
          ...(availability ? { availability: soon ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock' } : {}),
          seller: { '@id': 'https://dar-nur.fr/#organization', '@type': 'Organization', name: 'Dar Nūr' },
        },
      } : {}),
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        ['Dar Nūr', 'https://dar-nur.fr/'], ['Parfums', 'https://dar-nur.fr/parfums/'],
        [data.brandLabel, `https://dar-nur.fr/parfums/${product.brand_slug}/`], [product.name, url],
      ].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
    },
    ...(!data.film || data.film.published === false ? [] : [{
      '@context': 'https://schema.org', '@type': 'VideoObject', name: data.film.label, description: data.film.text,
      thumbnailUrl: abs(data.film.poster.src), uploadDate: data.film.uploadDate, duration: data.film.duration, contentUrl: data.film.hd,
    }]),
  ];

  let step = 0;
  const pyramidHtml = pyramid.map(s => {
    step++;
    return `<li class="fe-step fe-step-${s.notes.length}" data-reveal>
          <h3><span aria-hidden="true">${String(step).padStart(2, '0')}</span>Notes de <em>${esc(s.key)}</em></h3>
          <div class="fe-notes">${s.notes.map(n => {
            const d = data.pyramid.notes[norm(n)];
            if (!d) throw new Error(`${product.slug} : note « ${n} » absente de fiches/_data (pyramid.notes).`);
            return `
            <div class="fe-note${d.src ? '' : ' fe-note-mot'}">${d.src ? lazyImg(d) : ''}<h4>${esc(cap(n))}</h4><p>${tx(d.text)}</p></div>`;
          }).join('')}
          </div>
        </li>`;
  }).join('\n        ');

  let tip = (product.accordions || []).find(a => /conseil/i.test(a.title || ''));
  if (tip) tip = { ...tip, html: proposed(data, 'tip', tip.html, product.slug) };
  const paras = t => String(t || '').split(/\n{2,}/).filter(Boolean).map(p => `<p>${tx(p)}</p>`).join('');
  const specs = [
    ['Maison', data.brandLabel], ['Parfum', product.name], ['Type', data.typeLabel], ['Contenance', product.volume],
    ['Genre', data.genderLabel], ['Famille olfactive', familyLine], ['Fabrication', data.details.making], ...(data.details.specs || []),
  ];

  // Chapitres libres : images entières, titre et texte, placés où le JSON le demande.
  const planche = key => {
    const p = data.planches[key];
    return {
      PLANCHE_ID: esc(key), PLANCHE_IMAGES: p.images.map(i => figure(i, { cls: 'fe-planche-fig', caption })).join('\n      '),
      PLANCHE_EYEBROW: p.eyebrow ? `<p class="fe-eyebrow">${tx(p.eyebrow)}</p>` : '', PLANCHE_TITLE: tx(p.title),
      PLANCHE_TEXT: (p.paragraphs || []).map(x => `<p>${tx(x)}</p>`).join(''),
    };
  };
  // Repères : les seules sections présentes, dans leur ordre.
  const ANCHOR = {
    parfum: ['parfum', data.perfume.anchor || 'Le parfum'], galerie: ['galerie', data.gallery.anchor || 'Le flacon'], film: ['film', film.eyebrow],
    notes: ['notes', data.pyramid.anchor || 'Les notes'], essentiel: ['details', data.details.eyebrow],
  };
  const anchors = sectionsOf(data).map(n => ANCHOR[n.split(/[.:]/)[0]]).filter(Boolean);
  if (anchors.some(x => x[0] === 'details')) anchors.push(['livraison', 'Livraison']);

  const tokens = {
    TITLE: esc(title), DESCRIPTION: esc(description), URL: url, OG_IMAGE: esc(abs(og.src)), OG_W: og.w, OG_H: og.h,
    OG_ALT: esc(og.alt), SLUG: product.slug, NAME: esc(product.name),
    ART: compactCss(art), THEME_COLOR: esc(data.themeColor || '#0d1f16'),
    FONT_PRELOADS: (data.fonts || ['/assets/fonts/cormorant.woff2']).map(f => `<link rel="preload" as="font" type="font/woff2" href="${esc(f)}" crossorigin />`).join('\n'),
    ANCHORS: anchors.map(([id, label]) => `<a href="#${id}">${tx(label)}</a>`).join(''),
    LD: ld.map(o => `<script type="application/ld+json">${json(o)}</script>`).join('\n'),
    NAV: navHtml, CAT: esc(catLabel || 'Parfums'), BRAND: esc(data.brandLabel), BRAND_URL: `/parfums/${esc(product.brand_slug)}/`,
    TAGLINE: tx(product.tagline || ''),
    FACTS: [data.typeLabel, data.genderLabel, product.volume].filter(Boolean).map(f => `<li>${esc(f)}</li>`).join(''),
    HERO_FIGURE: heroes.map((i, k) => figure(i, { cls: heroes.length > 1 ? `fe-hero-fig fe-hero-fig-${k + 1}` : 'fe-hero-fig', eager: true, caption })).join('\n      '),
    HERO_PRELOAD: `<link rel="preload" as="image" href="${esc(hero.src)}"${hero.srcset ? ` imagesrcset="${esc(hero.srcset)}" imagesizes="${esc(hero.sizes || '100vw')}"` : ''} fetchpriority="high" />`,
    BUY: buy, STOCK: esc(availability), STOCK_HIDDEN: availability ? '' : ' hidden',
    GALLERY_EYEBROW: tx(data.gallery.eyebrow), GALLERY_TITLE: tx(data.gallery.title), GALLERY_LEAD: tx(data.gallery.lead),
    GALLERY: data.gallery.items.map((i, k) => `<li><button type="button" class="fe-shot" data-shot="${k}" data-full="${esc(i.src)}" aria-label="Agrandir : ${esc(i.caption)}">${lazyImg(i)}</button><p><span>${tx(i.caption)}</span><small${caption ? '' : ' hidden'}>${tx(KIND[i.kind])}</small></p></li>`).join('\n        '),
    PERFUME_EYEBROW: tx(data.perfume.eyebrow), PERFUME_TITLE: tx(data.perfume.title), PERFUME_LEAD: tx(data.perfume.lead),
    PERFUME_TEXT: data.perfume.descriptionIndexes.map(i => (product.description || [])[i]).filter(Boolean).map(d => `<p>${tx(d)}</p>`).join(''),
    PERFUME_FIGURE: figure(data.perfume.image, { cls: 'fe-perfume-fig', caption }),
    DESCRIPTION_FULL: (product.description || []).filter((d, i) => !data.perfume.descriptionIndexes.includes(i)).map(d => `<p>${tx(d)}</p>`).join(''), SENSORY_NOTE: tx(data.details.sensoryNote),
    TIP: tip ? `<div class="fe-tip"><h4>${esc(tip.title)}</h4>${tip.html.replace(/'/g, '’')}</div>` : '',
    FILM_EYEBROW: tx(film.eyebrow), FILM_TITLE: tx(film.title), FILM_TEXT: tx(film.text), FILM_CREDIT: tx(film.credit), FILM_MEDIA: film.media,
    PYR_EYEBROW: tx(data.pyramid.eyebrow), PYR_TITLE: tx(data.pyramid.title), PYRAMID: pyramidHtml,
    FAMILIES: esc(families.join(', ').toLowerCase()),
    SPEC_EYEBROW: tx(data.details.eyebrow), SPEC_TITLE: tx(data.details.title),
    SPECS: specs.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') + (!data.details.lasting ? '' : `<div><dt>Tenue annoncée</dt><dd>${tx(data.details.lasting)}${data.details.lastingNote ? `<small>${tx(data.details.lastingNote)}</small>` : ''}</dd></div>`),
    PYR_DISCLAIM: tx(data.pyramid.disclaim || 'Illustrations de la marque évoquant chaque matière, et non photographies des ingrédients de la composition.'),
    USAGE: paras(product.usage_advice), PRECAUTIONS: (product.precautions || []).map(p => `<li>${tx(p)}</li>`).join(''),
    ...(!data.house ? {} : {
      HOUSE_EYEBROW: tx(data.house.eyebrow), HOUSE_TITLE: tx(data.house.title), HOUSE_TEXT: data.house.paragraphs.map(p => `<p>${tx(p)}</p>`).join(''),
      HOUSE_FIGURE: data.house.image ? figure(data.house.image, { cls: 'fe-house-fig', caption }) : '',
      HOUSE_LINK: esc(data.house.link), HOUSE_LABEL: tx(data.house.linkLabel),
    }),
    DELIVERY: data.details.delivery === 'trio' ? typo(trioDelivery(delivery)) : delivery, PAYMENT: data.details.delivery === 'trio' ? typo(payment) : payment, SHOP_URL: esc(data.shopUrl),
    FINAL_TITLE: tx(data.final.title),
    CREDITS: data.credits ? data.credits.lines.map(l => `<p>${tx(l)}</p>`).join('') : '',
    RELATED: related.map(r => {
      const own = (data.related || {})[r.slug], img = (r.images || [])[0];
      return `<li><a href="/${esc(r.slug)}/">${own ? lazyImg(own) : img ? lazyImg({ src: /^https?:/.test(img) ? img : '/' + img, alt: '', w: 400, h: 400 }) : ''}<span>${esc(r.name)}</span><small>${r.price_value != null ? esc(fmtPrice(r.price_value)) : ''}</small></a></li>`;
    }).join('\n        '),
    EXTRAS: extras(data),
    PRICE: esc(priceLabel), MBAR_LABEL: soon ? 'Disponible prochainement' : 'Ajouter au panier', MBAR_DISABLED: soon || !usable ? ' disabled' : '',
    CONFIG: json({ slug: product.slug, name: product.name, price: usable ? Number(price.value) : null, image: (product.images || [])[0] || null, category: product.category_id, soon }),
  };
  const fillTokens = (t, extra) => t.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    const set = extra && k in extra ? extra : tokens;
    if (!(k in set)) throw new Error(`fiche éditoriale : jeton inconnu ${m}`);
    return set[k];
  });
  tokens.SECTIONS = sectionsOf(data).map(n => {
    const [part, key] = n.split(':');
    return fillTokens(sections.get(part), key ? planche(key) : null);
  }).join('\n\n');
  const html = fillTokens(template);
  return html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!-- GENERATED:PRODUCT-PAGE:${product.slug} — fiche éditoriale générée par scripts/generate-product-pages.mjs, ne pas éditer à la main -->`);
}
