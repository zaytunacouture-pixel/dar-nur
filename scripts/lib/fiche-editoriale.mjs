// Rendu « fiche éditoriale » d'un produit : présentation premium, page statique
// légère (sans le moteur SPA d'index.html), activée produit par produit en
// déposant fiches/_data/<slug>.json. Sans ce fichier, la fiche garde son rendu
// habituel : aucune autre page n'est touchée.
//
// Données : nom, accroche, prix, disponibilité, contenance, description,
// pyramide (composition), conseils et précautions viennent de Supabase ; les
// textes et visuels éditoriaux viennent du JSON ; les conditions de livraison
// et de paiement sont extraites d'index.html (#deliveryBlock), seule source de
// vérité du site. js/fiche-editoriale.js relit ensuite prix et disponibilité.
//
// Aucune dépendance npm.

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = o => JSON.stringify(o).replace(/</g, '\\u003C');
const norm = s => String(s).trim().toLowerCase().replace(/’/g, "'").replace(/\.$/, '');
export const fmtPrice = v => {
  const n = Number(v);
  return (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')) + ' €';
};

export async function loadEditorialFiches(root) {
  const out = new Map();
  let names = [];
  try { names = await readdir(new URL('fiches/_data/', root)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const n of names.filter(x => x.endsWith('.json'))) {
    out.set(n.slice(0, -5), JSON.parse(await readFile(new URL(`fiches/_data/${n}`, root), 'utf8')));
  }
  if (out.size) {
    // Le moteur SPA (accueil, autres fiches) doit ouvrir ces fiches par leur
    // vraie URL : la liste vit dans js/nav.js et doit rester synchrone.
    const nav = await readFile(new URL('js/nav.js', root), 'utf8');
    const m = nav.match(/FICHES_EDITORIALES\s*=\s*(\[[^\]]*\])/);
    const declared = m ? JSON.parse(m[1].replace(/'/g, '"')) : [];
    const expected = [...out.keys()].sort();
    if (JSON.stringify([...declared].sort()) !== JSON.stringify(expected)) {
      throw new Error(`js/nav.js : FICHES_EDITORIALES (${declared.join(', ')}) ne correspond pas à fiches/_data/ (${expected.join(', ')}).`);
    }
  }
  return out;
}

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

const KIND = { photo: 'Photographie', scene: 'Décor composé par la marque', ambiance: "Visuel d'ambiance de la marque" };
const FEMININE = { musqué: 'Musquée', floral: 'Florale', poudré: 'Poudrée', boisé: 'Boisée', ambré: 'Ambrée', épicé: 'Épicée', fruité: 'Fruitée', gourmand: 'Gourmande', oriental: 'Orientale' };

function figure(img, { cls = '', eager = false } = {}) {
  const kind = KIND[img.kind] || '';
  return `<figure class="${cls}">${eager ? `<img src="${esc(img.src)}" alt="${esc(img.alt)}" width="${img.w}" height="${img.h}" fetchpriority="high"/>` : lazyImg(img)}${kind ? `<figcaption>${tx(kind)}</figcaption>` : ''}</figure>`;
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

export function renderEditorialFiche({ template, data, product, price, related, navHtml, deliveryHtml, catLabel }) {
  product = { ...product, description: proposed(data, 'description', product.description, product.slug) };
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
  if (!family) throw new Error(`${product.slug} : famille olfactive absente de benefits.`);
  const families = family.split(',').map(s => FEMININE[s.trim().toLowerCase()] || cap(s.trim()));
  const availability = soon ? 'Disponible prochainement' : product.availability === 'available' ? 'Disponible' : '';

  const waText = `As-salâm 'alaykoum,\n\nJe souhaite commander :\n\n• ${product.name}\n  Référence : ${product.slug}\n  Quantité : 1${usable ? `\n  Prix : ${Number(price.value).toFixed(2).replace('.', ',')} €` : ''}\n\nMes informations :\n\n• Nom :\n• Ville :\n• Paiement : lien sécurisé SumUp, envoyé par Dar Nūr après confirmation\n\nBarakAllahu fik.`;
  const waHref = `https://wa.me/33769253375?text=${encodeURIComponent(waText)}`;

  const buy = `<div class="fe-buy" data-buy>
          <div class="fe-price-row"><span class="fe-price" data-price>${esc(priceLabel)}</span><span class="fe-stock" data-stock${availability ? '' : ' hidden'}>${esc(availability)}</span></div>
          <div class="fe-cta">
            <button type="button" class="fe-btn fe-btn-main" data-add${soon || !usable ? ' disabled' : ''}>Ajouter au panier</button>
            <a class="fe-btn fe-btn-line" data-wa href="${esc(waHref)}" target="_blank" rel="noopener"${soon ? ' hidden' : ''}>Commander sur WhatsApp</a>
          </div>
          <a class="fe-link fe-shop" href="${esc(data.shopUrl)}">Acheter en ligne sur shop.dar-nur.fr</a>
        </div>`;
  const { delivery, payment } = splitDelivery(deliveryHtml);

  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'Product', '@id': `${url}#produit`,
      name: product.name, description: (product.description || []).join(' '),
      brand: { '@type': 'Brand', name: data.brandLabel }, category: `${data.typeLabel} unisexe`, size: product.volume,
      image: [data.hero.image, data.film.poster, ...data.gallery.items.filter(i => i.kind === 'photo')].map(i => abs(i.src)).filter((x, i, a) => a.indexOf(x) === i),
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
    ...(data.film.published === false ? [] : [{
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
            <div class="fe-note">${lazyImg(d)}<h4>${esc(cap(n))}</h4><p>${tx(d.text)}</p></div>`;
          }).join('')}
          </div>
        </li>`;
  }).join('\n        ');

  let tip = (product.accordions || []).find(a => /conseil/i.test(a.title || ''));
  if (tip) tip = { ...tip, html: proposed(data, 'tip', tip.html, product.slug) };
  const paras = t => String(t || '').split(/\n{2,}/).filter(Boolean).map(p => `<p>${tx(p)}</p>`).join('');
  const specs = [
    ['Maison', data.brandLabel], ['Parfum', product.name], ['Type', data.typeLabel], ['Contenance', product.volume],
    ['Genre', data.genderLabel], ['Famille olfactive', families.join(', ')], ['Fabrication', data.details.making],
  ];

  const tokens = {
    TITLE: esc(title), DESCRIPTION: esc(description), URL: url, OG_IMAGE: esc(abs(data.hero.image.src)), OG_W: data.hero.image.w, OG_H: data.hero.image.h,
    OG_ALT: esc(data.hero.image.alt), HERO_SRC: esc(data.hero.image.src), SLUG: product.slug, NAME: esc(product.name),
    LD: ld.map(o => `<script type="application/ld+json">${json(o)}</script>`).join('\n'),
    NAV: navHtml, CAT: esc(catLabel || 'Parfums'), BRAND: esc(data.brandLabel), BRAND_URL: `/parfums/${esc(product.brand_slug)}/`,
    TAGLINE: tx(product.tagline || ''),
    FACTS: [data.typeLabel, data.genderLabel, product.volume].filter(Boolean).map(f => `<li>${esc(f)}</li>`).join(''),
    HERO_FIGURE: figure(data.hero.image, { cls: 'fe-hero-fig', eager: true }),
    HERO_PRELOAD: `<link rel="preload" as="image" href="${esc(data.hero.image.src)}" fetchpriority="high" />`,
    BUY: buy, STOCK: esc(availability), STOCK_HIDDEN: availability ? '' : ' hidden',
    GALLERY_EYEBROW: tx(data.gallery.eyebrow), GALLERY_TITLE: tx(data.gallery.title), GALLERY_LEAD: tx(data.gallery.lead),
    GALLERY: data.gallery.items.map((i, k) => `<li><button type="button" class="fe-shot" data-shot="${k}" data-full="${esc(i.src)}" aria-label="Agrandir : ${esc(i.caption)}">${lazyImg(i)}</button><p><span>${esc(i.caption)}</span><small>${tx(KIND[i.kind])}</small></p></li>`).join('\n        '),
    PERFUME_EYEBROW: tx(data.perfume.eyebrow), PERFUME_TITLE: tx(data.perfume.title), PERFUME_LEAD: tx(data.perfume.lead),
    PERFUME_TEXT: data.perfume.descriptionIndexes.map(i => (product.description || [])[i]).filter(Boolean).map(d => `<p>${tx(d)}</p>`).join(''),
    PERFUME_FIGURE: figure(data.perfume.image, { cls: 'fe-perfume-fig' }),
    DESCRIPTION_FULL: (product.description || []).filter((d, i) => !data.perfume.descriptionIndexes.includes(i)).map(d => `<p>${tx(d)}</p>`).join(''), SENSORY_NOTE: tx(data.details.sensoryNote),
    TIP: tip ? `<div class="fe-tip"><h4>${esc(tip.title)}</h4>${tip.html.replace(/'/g, '’')}</div>` : '',
    FILM_EYEBROW: tx(film.eyebrow), FILM_TITLE: tx(film.title), FILM_TEXT: tx(film.text), FILM_CREDIT: tx(film.credit), FILM_MEDIA: film.media,
    PYR_EYEBROW: tx(data.pyramid.eyebrow), PYR_TITLE: tx(data.pyramid.title), PYRAMID: pyramidHtml,
    FAMILIES: esc(families.join(', ').toLowerCase()),
    SPEC_EYEBROW: tx(data.details.eyebrow), SPEC_TITLE: tx(data.details.title),
    SPECS: specs.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') + `<div><dt>Tenue annoncée</dt><dd>${tx(data.details.lasting)}<small>${tx(data.details.lastingNote)}</small></dd></div>`,
    USAGE: paras(product.usage_advice), PRECAUTIONS: (product.precautions || []).map(p => `<li>${tx(p)}</li>`).join(''),
    HOUSE_EYEBROW: tx(data.house.eyebrow), HOUSE_TITLE: tx(data.house.title), HOUSE_TEXT: data.house.paragraphs.map(p => `<p>${tx(p)}</p>`).join(''),
    HOUSE_FIGURE: figure(data.house.image, { cls: 'fe-house-fig' }),
    HOUSE_LINK: esc(data.house.link), HOUSE_LABEL: tx(data.house.linkLabel),
    DELIVERY: delivery, PAYMENT: payment, SHOP_URL: esc(data.shopUrl),
    FINAL_TITLE: tx(data.final.title),
    RELATED: related.map(r => {
      const img = (r.images || [])[0];
      return `<li><a href="/${esc(r.slug)}/">${img ? lazyImg({ src: /^https?:/.test(img) ? img : '/' + img, alt: '', w: 400, h: 400 }) : ''}<span>${esc(r.name)}</span><small>${r.price_value != null ? esc(fmtPrice(r.price_value)) : ''}</small></a></li>`;
    }).join('\n        '),
    PRICE: esc(priceLabel), MBAR_LABEL: soon ? 'Disponible prochainement' : 'Ajouter au panier', MBAR_DISABLED: soon || !usable ? ' disabled' : '',
    CONFIG: json({ slug: product.slug, name: product.name, price: usable ? Number(price.value) : null, image: (product.images || [])[0] || null, category: product.category_id, soon }),
  };
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    if (!(k in tokens)) throw new Error(`fiche éditoriale : jeton inconnu ${m}`);
    return tokens[k];
  });
  return html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!-- GENERATED:PRODUCT-PAGE:${product.slug} — fiche éditoriale générée par scripts/generate-product-pages.mjs, ne pas éditer à la main -->`);
}
