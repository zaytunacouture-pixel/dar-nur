// Banc des fiches PREMIUM (fiches/premium/) : copie du banc commun, chemins adaptés.
// Contrôles d'une fiche éditoriale dans un vrai navigateur, quel que soit le parfum.
// Tout ce qui est attendu (nom, prix, notes, images, film, sections) est lu dans
// fiches/_data/<slug>.json et dans Supabase : rien n'est écrit ici pour un parfum précis,
// sauf le bloc facultatif « _test » du JSON.
//
//   PWDIR=<dossier contenant node_modules/playwright-core> [MOTEUR=webkit] \
//     node scripts/test-fiche-editoriale.mjs <slug> [adresse]
//
// Aucune commande ni message réels : WhatsApp est intercepté.

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(process.env.PWDIR + '/x.js');
const moteur = require('playwright-core')[process.env.MOTEUR || 'chromium'];
const [, , slug, U = 'http://127.0.0.1:3022'] = process.argv;
const ROOT = new URL('../', import.meta.url);
const data = JSON.parse(await readFile(new URL(`fiches/premium/_data/${slug}.json`, ROOT), 'utf8'));
const cfg = await readFile(new URL('js/config.js', ROOT), 'utf8');
const SB = cfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1], KEY = cfg.match(/SUPABASE_ANON\s*=\s*'([^']+)'/)[1];
const row = (await (await fetch(`${SB}/rest/v1/products?slug=eq.${slug}&select=*`, { headers: { apikey: KEY } })).json())[0];
const T = data._test || {};
const eur = v => Number(v).toFixed(2).replace('.', ',') + ' €';
const court = v => (Number.isInteger(+v) ? String(+v) : Number(v).toFixed(2).replace('.', ',')) + ' €';
const nu = s => String(s).replace(/\u2019/g, "'").replace(/\u00a0/g, ' ');
const PRIX = row.price_value;
const heroes = data.hero.images || [data.hero.image];
const film = data.film && data.film.published !== false ? data.film : null;
const notes = [...row.composition.matchAll(/Notes? de (tête|cœur|fond)\s*:\s*([^.]*)\./gi)].map(m => [m[1].toLowerCase(), m[2].split(',').map(x => x.trim())]);
const RF = film ? film.poster.w / film.poster.h : 9 / 16; // proportions du film : celles de son affiche
const imgNotes = Object.values(data.pyramid.notes).filter(n => n.src);
const GAL = data.gallery.items.length;
const CH = `/${slug}/`;

const R = [];
const ok = (n, c, d = '') => { R.push([n, !!c]); console.log((c ? 'OK ' : 'KO ') + n + (d ? ' — ' + d : '')); };
const b = await moteur.launch({ headless: true });
const open = async (w, h, o = {}) => {
  const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 900 && !o.nojs, hasTouch: w < 900, deviceScaleFactor: w < 900 ? 2 : 1, locale: 'fr-FR', javaScriptEnabled: !o.nojs, reducedMotion: o.calm ? 'reduce' : 'no-preference' });
  const p = await c.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => m.type() === 'error' && p.errs.push(m.text()));
  if (o.route) await o.route(p);
  await p.addInitScript(() => { window.__wa = []; window.open = u => { window.__wa.push(u); return null; }; });
  await p.goto(U + (o.path || CH), { waitUntil: 'load' }); await p.waitForTimeout(o.wait ?? 1500); return p;
};
const instant = p => p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
const step = async (n, f) => { try { await f(); } catch (e) { ok(n, false, String(e).slice(0, 200)); } };
const badge = (p, v, t = 8000) => p.waitForFunction(x => document.querySelector('#dnCartBadge')?.textContent === x, v, { timeout: t });

for (const w of [320, 375, 390, 430, 673, 768, 1024, 1280, 1440, 1920]) await step(w + 'px', async () => {
  const p = await open(w, w < 700 ? 844 : 900);
  const d = await p.evaluate(() => {
    const vis = e => e.offsetParent && e.getBoundingClientRect().width > 0;
    const small = [...document.querySelectorAll('main p,main li,main dd,main dt,main small,main span,main a,main button,main summary,figcaption')].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize));
    const tap = [...document.querySelectorAll('main button,main .fe-btn,.mbar button,main summary,.fe-anchors a,.fe-shop')].filter(vis).map(e => [e.className || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(x => x[1] < 40);
    const price = [...document.querySelectorAll('[data-price]')].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && r.bottom > 0; });
    const coupe = [...document.querySelectorAll('main h1,main h2,main h3,main h4,main p')].filter(e => vis(e) && (e.getBoundingClientRect().right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 2) && !e.closest('.fe-strip,.fe-related,.fe-crumb')).map(e => e.textContent.slice(0, 24));
    return { ov: document.documentElement.scrollWidth - document.documentElement.clientWidth, min: Math.min(...small), tap, price, coupe };
  });
  ok(`${w}px sans débordement`, d.ov <= 0 && !d.coupe.length, 'dépassement ' + d.ov + ' ' + d.coupe.join('|'));
  ok(`${w}px texte ≥ 14 px`, d.min >= 14, 'min ' + d.min);
  ok(`${w}px cibles ≥ 40 px`, !d.tap.length, JSON.stringify(d.tap)); ok(`${w}px prix visible sans défiler`, d.price);
  ok(`${w}px sans erreur console`, !p.errs.length, p.errs.join('|').slice(0, 160)); await p.context().close();
});

await step('panier', async () => {
  const p = await open(1440, 900, { wait: 0 });
  await p.click('.fe-hero [data-add]'); await badge(p, '1'); ok('Ajouter au panier (clic immédiat)', true);
  await p.click('.fe-final [data-add]'); await p.waitForTimeout(500);
  ok('Second ajout cumulé', await p.evaluate(() => document.querySelector('#dnCartBadge').textContent === '2'));
  await p.click('.dn-cart-fab'); await p.waitForTimeout(2500);
  ok('Panier : total ' + eur(PRIX * 2), (await p.evaluate(() => document.body.innerText)).includes(eur(PRIX * 2).replace(' €', '')));
  await p.click('#dnCartOrder'); await p.waitForTimeout(400);
  const m = decodeURIComponent((await p.evaluate(() => window.__wa[0] || '')).split('text=')[1] || '');
  ok('WhatsApp depuis le panier', m.includes(row.name) && m.includes(`${eur(PRIX)} × 2 = ${eur(PRIX * 2)}`) && /lien sécurisé SumUp/.test(m) && !/revolut|espèces|virement|réception/i.test(m));
  await p.context().close();
});
await step('clic pendant la relecture du prix', async () => {
  let perdus = 0;
  for (let k = 0; k < 20; k++) { const p = await open(1440, 900, { wait: 0 }); await p.waitForTimeout(k * 15); await p.click('.fe-hero [data-add]', { delay: 40 }); await badge(p, '1', 5000).catch(() => perdus++); await p.context().close(); }
  ok('20 ajouts immédiats, aucun perdu', perdus === 0, perdus + ' perdus');
});
await step('panier complet', async () => {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await open(w, h); const txt = q => p.$eval(q, e => e.textContent.trim()); const totalLigne = () => txt('.dn-cart-linetotal');
    for (let k = 1; k <= 3; k++) { await p.click('.fe-hero [data-add]'); await badge(p, String(k)); }
    ok(`${w} trois ajouts successifs`, await txt('#dnCartBadge') === '3');
    await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('.dn-cart-fab').click()); await p.waitForTimeout(1200);
    ok(`${w} panier : une ligne, 3 × ${court(PRIX)}`, (await p.$$('.dn-cart-line')).length === 1 && await txt('.dn-cart-qty-val') === '3' && nu(await totalLigne()).startsWith(eur(PRIX * 3).replace(' €', '')) || nu(await totalLigne()).startsWith(court(PRIX * 3).replace(' €', '')), await totalLigne());
    await p.click('[data-act="inc"]'); await p.waitForTimeout(500); const plus = await txt('.dn-cart-qty-val');
    await p.click('[data-act="dec"]'); await p.waitForTimeout(400); await p.click('[data-act="dec"]'); await p.waitForTimeout(500); const moins = await txt('.dn-cart-qty-val');
    ok(`${w} quantité modifiée : 4 puis 2`, plus === '4' && moins === '2' && await txt('#dnCartBadge') === '2', plus + ' ' + moins);
    await p.reload({ waitUntil: 'load' }); await badge(p, '2'); ok(`${w} panier conservé après rechargement`, true);
    await p.evaluate(() => document.querySelector('.dn-cart-fab').click()); await p.waitForTimeout(1200); await p.click('[data-act="del"]'); await p.waitForTimeout(700);
    ok(`${w} suppression : panier vide`, !(await p.$('.dn-cart-line')) && !!(await p.$('.dn-cart-empty')));
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3500); ok(`${w} panier vide après rechargement`, await p.evaluate(() => { const b = document.querySelector('#dnCartBadge'); return !b || b.textContent === '' || b.textContent === '0' || getComputedStyle(b).display === 'none'; }));
    ok(`${w} aucune fenêtre ouverte, aucun message envoyé`, (await p.evaluate(() => window.__wa.length)) === 0); await p.context().close();
  }
});
await step('liens', async () => {
  const p = await open(1440, 900);
  const h = await p.getAttribute('.fe-hero [data-wa]', 'href'); const m = decodeURIComponent(h.split('text=')[1]);
  ok('Lien WhatsApp direct', /wa\.me\/33769253375/.test(h) && m.includes(row.name) && m.includes(`Référence : ${slug}`) && m.includes(eur(PRIX)) && /SumUp/.test(m));
  ok('Lien boutique en ligne', !data.shopUrl || await p.getAttribute('.fe-hero .fe-shop', 'href') === data.shopUrl);
  const links = await p.evaluate(() => [...new Set([...document.querySelectorAll('main a[href],header a[href],footer a[href],.fe-crumb a')].map(a => a.href))]);
  const bad = [];
  for (const l of links) { if (/wa\.me|#|instagram|tiktok/.test(l)) continue; try { const r = await fetch(l.replace('https://dar-nur.fr', U)); if (!r.ok) bad.push(r.status + ' ' + l); } catch { bad.push('ERR ' + l); } }
  ok(`Liens (${links.length})`, !bad.length, bad.join(', '));
  for (const a of await p.$$eval('.fe-anchors a', x => x.map(e => e.getAttribute('href')))) {
    await instant(p); await p.evaluate(() => scrollTo(0, 0)); await p.click(`.fe-anchors a[href="${a}"]`); await p.waitForTimeout(900);
    const y = await p.evaluate(q => Math.round(document.querySelector(q).getBoundingClientRect().top), a);
    ok('Repère ' + a, y > -40 && y < 420, 'haut ' + y);
  }
  await p.context().close();
});

for (const w of [390, 1440]) await step(w + ' galerie et film', async () => {
  const p = await open(w, 844); await instant(p); await p.evaluate(() => document.querySelector('#galerie').scrollIntoView()); await p.waitForTimeout(1500);
  const ratio = await p.$$eval('.fe-shot img', l => l.filter(e => e.offsetParent && e.naturalWidth > 10).map(e => Math.abs(e.clientWidth / e.clientHeight - e.naturalWidth / e.naturalHeight)));
  ok(`${w} galerie : images sans recadrage`, ratio.length && ratio.every(r => r < .01), ratio.map(r => r.toFixed(3)).join());
  ok(`${w} galerie : ${GAL} images`, (await p.$$('.fe-strip li')).length === GAL);
  if (w > 800) ok('Galerie ordinateur : toutes les images visibles sans flèche', await p.$$eval('.fe-strip li img', l => l.every(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })));
  else ok('Galerie mobile : défilement tactile horizontal', await p.evaluate(async () => { const g = document.querySelector('#feStrip'); g.scrollBy(200, 0); await new Promise(r => setTimeout(r, 700)); return g.scrollLeft > 60 && g.scrollWidth > g.clientWidth; }));
  await p.evaluate(() => document.querySelector('#feStrip').scrollTo(0, 0)); await p.waitForTimeout(500); await (await p.$('.fe-strip .fe-shot')).click(); await p.waitForTimeout(900);
  const s1 = await p.$eval('#feBoxImg', e => [e.src, e.naturalWidth]); ok(`${w} agrandissement`, await p.$eval('#feBox', d => d.open) && s1[1] > 500);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); ok(`${w} image suivante au clavier`, s1[0] !== await p.$eval('#feBoxImg', e => e.src));
  await p.click('[data-box="-1"]'); await p.waitForTimeout(400); ok(`${w} bouton image précédente`, s1[0] === await p.$eval('#feBoxImg', e => e.src));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); ok(`${w} fermeture Échap`, !(await p.$eval('#feBox', d => d.open)));
  if (film) {
    const mp4 = () => p.evaluate(() => performance.getEntriesByType('resource').filter(r => /\.mp4/.test(r.name)).length);
    const before = await mp4(); await p.evaluate(() => document.querySelector('#film').scrollIntoView()); await p.waitForTimeout(1500);
    const st = await p.$eval('#feVideo', (v, RF) => { const i = document.querySelector('.fe-poster'), r = i.getBoundingClientRect(), q = v.getBoundingClientRect(); return { poster: i.naturalWidth > 500 && getComputedStyle(i).visibility === 'visible' && Math.abs(r.width - q.width) < 2 && Math.abs(r.width / r.height - RF) < .018 * RF, auto: v.autoplay, paused: v.paused, pre: v.preload }; }, RF);
    ok(`${w} film : affiche, aucun MP4 avant le clic, pas de lecture automatique`, before === 0 && await mp4() === 0 && st.poster && !st.auto && st.paused && st.pre === 'none', JSON.stringify(st));
    await p.click('#fePlay'); await p.waitForTimeout(6000);
    const v = await p.$eval('#feVideo', v => ({ t: v.currentTime, c: v.controls, err: v.error?.message || '', src: v.currentSrc.slice(-34), masque: getComputedStyle(document.querySelector('.fe-poster')).visibility, ratio: v.clientWidth / v.clientHeight }));
    ok(`${w} film : commandes affichées après le clic`, v.c, JSON.stringify(v)); ok(`${w} film : image effacée, proportions respectées`, v.masque === 'hidden' && Math.abs(v.ratio - RF) < .018 * RF);
    if (process.env.MOTEUR === 'webkit') ok(`${w} film : lecture réelle`, v.t > 1 && !v.err, `${v.t.toFixed(1)} s, ${v.src}`);
  }
  await p.context().close();
});

const mock = r => async p => p.route('**/rest/v1/products?select=price_value,coming_soon*', x => x.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r) }));
await step('prix simulé', async () => { const p = await open(1440, 900, { route: mock([{ price_value: 75.5, coming_soon: false, availability: 'available' }]) }); await p.waitForTimeout(1500); const t = await p.$$eval('[data-price]', l => l.map(e => e.textContent)); const m = decodeURIComponent((await p.getAttribute('.fe-hero [data-wa]', 'href')).split('text=')[1]); ok('Prix relu dans Supabase (simulé 75,50 €)', t.every(x => /75,50/.test(x)) && /75,50 €/.test(m), t.join()); await p.context().close(); });
await step('à venir simulé', async () => { const p = await open(1440, 900, { route: mock([{ price_value: 70, coming_soon: true, availability: 'coming_soon' }]) }); await p.waitForTimeout(1500); ok('Simulé « à venir » : commande bloquée', await p.evaluate(() => [...document.querySelectorAll('[data-add]')].every(b => b.disabled) && [...document.querySelectorAll('[data-wa]')].every(a => a.hidden) && /prochainement/.test(document.querySelector('[data-stock]').textContent))); await p.context().close(); });
await step('retiré simulé', async () => { const p = await open(1440, 900, { route: mock([]) }); await p.waitForTimeout(1500); ok('Simulé produit retiré : commande bloquée, libellé cohérent', await p.evaluate(() => [...document.querySelectorAll('[data-add]')].every(b => b.disabled && /Indisponible/.test(b.textContent)) && /Indisponible/.test(document.querySelector('[data-stock]').textContent))); await p.context().close(); });
await step('hors ligne', async () => { const p = await open(1440, 900, { route: async p => p.route('**/rest/v1/**', r => r.abort()) }); ok('Supabase injoignable : prix conservé', (await p.$eval('[data-price]', e => e.textContent)).startsWith(court(PRIX).replace(' €', ''))); await p.context().close(); });
await step('sans js', async () => { const p = await open(1440, 900, { nojs: true }); const t = await p.content(); ok('Sans JavaScript : contenu, prix, WhatsApp, images', t.includes(court(PRIX).replace(' €', '')) && /wa\.me/.test(t) && notes.flatMap(x => x[1]).every(n => nu(t).includes(nu(n))) && await p.$$eval('main noscript', l => l.length) === 0 | t.includes('<noscript>')); await p.context().close(); });
await step('script en échec', async () => { const p = await open(1440, 900, { route: async p => p.route('**/js/fiche-editoriale.js', r => r.abort()) }); ok('Script de confort en échec : rien de masqué', await p.evaluate(() => ![...document.querySelectorAll('main *')].some(e => getComputedStyle(e).opacity === '0' || e.classList.contains('fe-wait')))); await p.context().close(); });
await step('calme', async () => { const p = await open(1440, 900, { calm: true }); ok('Mouvement réduit respecté', await p.evaluate(() => !document.querySelector('.fe-wait') && getComputedStyle(document.documentElement).scrollBehavior === 'auto')); await p.context().close(); });
await step('filet', async () => { const p = await open(1440, 900, { wait: 8000 }); ok('Filet : plus aucun bloc masqué après 6 s', await p.evaluate(() => !document.querySelector('.fe-wait'))); await p.context().close(); });
await step('apparitions', async () => {
  for (const w of [390, 1440]) { const p = await open(w, 844); await instant(p); await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } }); await p.waitForTimeout(1800);
    ok(`${w} après défilement : tous les textes découverts`, await p.evaluate(() => [...document.querySelectorAll('[data-reveal]')].every(e => { const s = getComputedStyle(e); return !e.classList.contains('fe-wait') && (s.opacity === '1') && (s.clipPath === 'none' || !/100%/.test(s.clipPath)); }))); await p.context().close(); }
});
await step('barre mobile', async () => {
  const p = await open(390, 844); const vis = () => p.$eval('#mbar', m => !m.classList.contains('is-off'));
  const entier = await p.$eval('.fe-hero [data-add]', b => b.getBoundingClientRect().bottom <= innerHeight); const a = (await vis()) !== entier; await instant(p); await p.evaluate(() => document.querySelector('.fe-hero [data-add]').scrollIntoView({ block: 'center' })); await p.waitForTimeout(900);
  const c = await vis(); await p.evaluate(() => document.querySelector('#notes').scrollIntoView()); await p.waitForTimeout(900); const d = await vis();
  ok("Barre mobile : présente, s'efface devant le bouton, revient", a && !c && d, [a, !c, d].join());
  await p.click('#mbar [data-add]'); await p.waitForTimeout(2500); ok('Barre mobile : ajout au panier', await p.evaluate(() => document.querySelector('#dnCartBadge')?.textContent === '1'));
  await p.waitForTimeout(600); ok('Bouton panier au-dessus de la barre', await p.evaluate(() => { const f = document.querySelector('.dn-cart-fab').getBoundingClientRect(), m = document.querySelector('#mbar').getBoundingClientRect(); return f.bottom <= m.top + 1; }));
  await p.evaluate(() => scrollTo(0, 0)); await p.click('#burger'); await p.waitForTimeout(600); ok('Menu mobile', await p.$eval('#navLinks', n => n.classList.contains('open'))); await p.context().close();
});
await step('autres pages', async () => {
  const editoriales = JSON.parse((await readFile(new URL('js/nav.js', ROOT), 'utf8')).match(/FICHES_PREMIUM\s*=\s*(\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const voisin = ['santal-gourmand', 'rosa-vento'].find(x => !editoriales.includes(x));
  const p = await open(1440, 900, { path: `/${voisin}/`, wait: 5000 }); ok(`Autre fiche intacte (${voisin})`, await p.evaluate(v => document.querySelector('#productView h1')?.innerText.toLowerCase() === v.replace('-', ' ') && !!document.querySelector('.pp-buybox'), voisin));
  await p.evaluate(s => showProduct(s), slug); await p.waitForURL('**' + CH, { timeout: 6000 }); await p.waitForTimeout(800); ok('Depuis une autre fiche : ouvre la fiche éditoriale', await p.evaluate(() => document.documentElement.dataset.fiche === 'editoriale')); await p.context().close();
  const q = await open(1440, 900, { path: '/', wait: 5000 }); await q.evaluate(s => showProduct(s), slug); await q.waitForURL('**' + CH, { timeout: 6000 }); await q.waitForTimeout(800); ok("Depuis l'accueil : ouvre la fiche éditoriale", await q.evaluate(() => document.documentElement.dataset.fiche === 'editoriale')); await q.context().close();
});
await step('première vue', async () => {
  for (const [w, h] of [[320, 640], [375, 667], [390, 664], [390, 844], [430, 932], [600, 900], [673, 900], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1366, 768], [1440, 900], [1920, 1080]]) {
    const p = await open(w, h);
    const d = await p.evaluate(({ boites, horsImage }) => {
      const vu = e => { const x = e.getBoundingClientRect(); return x.width > 0 && x.top >= 0 && x.bottom <= innerHeight + 1 && getComputedStyle(e).visibility === 'visible'; };
      const over = (x, y) => x.left < y.right - 1 && x.right > y.left + 1 && x.top < y.bottom - 1 && x.bottom > y.top + 1;
      const rg = e => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
      const imgs = [...document.querySelectorAll('.fe-hero-fig img')].map(i => ({ r: i.getBoundingClientRect(), f: i.closest('figure').getBoundingClientRect(), n: i.naturalWidth / i.naturalHeight }));
      const txt = ['h1', '.fe-facts', '.fe-brand'].map(q => document.querySelector('.fe-hero ' + q));
      /* _test.flacons : place du flacon dans chaque photographie (gauche, droite, haut, bas). _test.texteHorsImage : aucun texte sur la photographie. */
      const flacons = imgs.map((i, k) => { const x = boites[k] || [0, 1, 0, 1]; return { left: i.r.left + i.r.width * x[0], right: i.r.left + i.r.width * x[1], top: i.r.top + i.r.height * x[2], bottom: i.r.top + i.r.height * x[3] }; });
      const zones = horsImage ? imgs.map(i => i.f) : flacons;
      return {
        ratio: imgs.every(i => Math.abs(i.r.width / i.r.height - i.n) < .006), visible: flacons.every((z, k) => { const f = imgs[k].f; return z.left >= f.left - 1 && z.right <= f.right + 1 && z.top >= f.top - 1 && z.bottom <= f.bottom + 1; }), plein: imgs.every(i => i.f.left >= -1 && i.f.right <= innerWidth + 1),
        texte: txt.every(vu), prix: [...document.querySelectorAll('[data-price]')].some(vu), ajout: [...document.querySelectorAll('[data-add]')].some(vu), dispo: [...document.querySelectorAll('[data-stock]')].some(vu),
        dessus: txt.some(t => zones.some(z => over(rg(t), z))), n: imgs.length,
        boutons: [...document.querySelectorAll('.fe-hero .fe-btn')].filter(e => e.offsetParent).every(e => { const r = e.getBoundingClientRect(), H = document.querySelector('.fe-hero').getBoundingClientRect(); return r.bottom <= H.bottom + 1 && r.right <= innerWidth; }),
      };
    }, { boites: T.flacons || [], horsImage: !!T.texteHorsImage });
    ok(`${w}×${h} première vue : nom, maison, type, prix, disponibilité, ajout`, d.texte && d.prix && d.ajout && d.dispo, JSON.stringify(d));
    ok(`${w}×${h} flacon(s) entier(s), proportions exactes, aucun texte dessus`, d.ratio && d.plein && d.visible && !d.dessus && d.boutons && d.n === heroes.length, JSON.stringify(d));
    await p.context().close();
  }
});
if (T.achatPremierEcran) await step('achat au premier écran', async () => {
  for (const [w, h] of T.achatPremierEcran) { const p = await open(w, h);
    const d = await p.evaluate(() => { const v = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; }; return { prix: [...document.querySelectorAll('.fe-hero [data-price]')].some(v), ajout: v(document.querySelector('.fe-hero [data-add]')), nom: v(document.querySelector('h1')), barre: document.querySelector('#mbar').classList.contains('is-off'), bas: Math.round(document.querySelector('.fe-hero [data-add]').getBoundingClientRect().bottom) }; });
    ok(`${w}×${h} prix et bouton du premier écran entiers, barre effacée`, d.prix && d.ajout && d.nom && d.barre, JSON.stringify(d)); await p.context().close(); }
});
await step('en-tête', async () => {
  for (const w of [390, 820, 1440]) { const p = await open(w, 844); await instant(p); await p.evaluate(() => scrollTo(0, 1500)); await p.waitForTimeout(900);
    const d = await p.evaluate(() => { const h = document.querySelector('header'), m = getComputedStyle(h).backgroundColor.match(/[\d.]+/g).map(Number), r = h.getBoundingClientRect(); return { alpha: m.length > 3 ? m[3] : 1, top: r.top, bas: r.bottom, dessus: [4, Math.round(r.bottom / 2), Math.round(r.bottom) - 4].every(y => document.elementFromPoint(innerWidth / 2, y)?.closest('header') === h) }; });
    ok(`${w} en-tête collé, au-dessus du contenu${T.enteteOpaque ? ', fond plein' : ''}`, d.top <= 0 && d.bas > 40 && d.dessus && (!T.enteteOpaque || d.alpha === 1) && (T.enteteCompact && w >= 1240 || d.top === 0), JSON.stringify(d)); await p.context().close(); }
});
if (T.enteteCompact) await step('en-tête compact', async () => {
  const etat = p => p.evaluate(() => { const h = document.querySelector('header'), b = q => { const r = document.querySelector(q).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }; return { c: h.classList.contains('is-compact'), bas: Math.round(h.getBoundingClientRect().bottom), H: h.offsetHeight, doc: document.documentElement.scrollHeight, logo: b('header .brand-logo'), nav: b('#navLinks'), rech: b('header .dn-search-trigger') }; });
  for (const w of [1240, 1339, 1340, 1366, 1440, 1536, 1920]) {
    const p = await open(w, 900, { wait: 3000 }); await instant(p); const A = await etat(p); await p.evaluate(() => scrollTo(0, 1400)); await p.waitForTimeout(900); const B = await etat(p);
    ok(`${w} en haut : en-tête entier ; défilé : barre de ${B.bas} px`, !A.c && A.bas > 150 && B.c && B.bas >= T.enteteCompact[0] && B.bas <= T.enteteCompact[1], JSON.stringify([A.bas, B.bas]));
    ok(`${w} aucun décalage : hauteurs de page et d’en-tête inchangées`, A.doc === B.doc && A.H === B.H, JSON.stringify([A.doc, B.doc, A.H, B.H]));
    ok(`${w} logo, navigation et recherche visibles, sans chevauchement`, [B.logo, B.nav, B.rech].every(x => x.t >= 0 && x.b <= B.bas && x.l >= 0 && x.r <= w) && B.logo.r < B.nav.l && B.nav.r < B.rech.l, JSON.stringify(B));
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(900); const C = await etat(p); ok(`${w} retour en haut : en-tête entier`, !C.c && C.bas === A.bas && C.doc === A.doc); await p.context().close();
  }
  const p = await open(1440, 900, { wait: 3000 }); await instant(p);
  const cls = await p.evaluate(() => new Promise(ok => { let s = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) s += e.value; })).observe({ type: 'layout-shift' }); let y = 0; const t = setInterval(() => { y += 24; scrollTo(0, y < 400 ? y : 800 - y); if (y >= 800) { clearInterval(t); setTimeout(() => ok(s), 800); } }, 30); }).catch(() => 0));
  ok('Aller-retour autour du seuil : décalage cumulé < 0,01', cls < .01, String(cls));
  await p.evaluate(() => scrollTo(0, 1400)); await p.waitForTimeout(700);
  for (const n of ['bien-etre', 'parfums', 'mode-accessoires']) {
    await p.mouse.move(700, 600); await p.hover(`#nav-${n}-trigger`); await p.waitForTimeout(250);
    ok(`Barre compacte, menu ${n} au survol, entier à l’écran`, await p.$eval(`#nav-${n}-menu`, e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display === 'flex' && r.top > 20 && r.bottom <= innerHeight && r.right <= innerWidth && document.elementFromPoint(r.left + r.width / 2, r.bottom - 14)?.closest('header'); }));
    const l = await p.$(`#nav-${n}-menu a`); await l.hover(); await p.waitForTimeout(150); ok(`Menu ${n} : reste ouvert jusqu’au lien`, await l.isVisible());
  }
  await p.mouse.move(700, 700); await p.waitForTimeout(200); await p.focus('#nav-parfums-trigger'); await p.waitForTimeout(200); ok('Menu au clavier : ouvert au focus', await p.$eval('#nav-parfums-menu', e => getComputedStyle(e).display === 'flex'));
  /* Le moteur WebKit saute les liens avec Tab (réglage du système) : le focus y est donné directement au lien. */ if (process.env.MOTEUR === 'webkit') await p.focus('#nav-parfums-menu a'); else await p.keyboard.press('Tab'); await p.waitForTimeout(200); ok('Menu au clavier : premier lien atteint et visible', await p.evaluate(() => { const a = document.activeElement, m = a.closest('#nav-parfums-menu'); return !!m && getComputedStyle(m).display === 'flex' && a.getBoundingClientRect().height > 10; }));
  await p.focus('header .brand'); await p.waitForTimeout(300); ok('Clavier : le logo reste visible quand il a le focus', await p.$eval('header .brand', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= document.querySelector('header').getBoundingClientRect().bottom; }));
  await p.click('header .dn-search-trigger'); await p.waitForTimeout(900); ok('Recherche ouverte depuis la barre compacte', await p.evaluate(() => { const e = document.querySelector('.dn-search-panel'); return !!e && e.getBoundingClientRect().height > 40; })); await p.keyboard.press('Escape'); await p.context().close();
  const q = await open(1440, 900); await instant(q);
  for (const a of await q.$$eval('.fe-anchors a', l => l.map(e => e.getAttribute('href')))) { await q.evaluate(() => scrollTo(0, 0)); await q.waitForTimeout(250); await q.click(`.fe-anchors a[href="${a}"]`); await q.waitForTimeout(900);
    const d = await q.evaluate(x => { const c = document.querySelector(x), t = c.querySelector('h2,h3') || c; return [Math.round(t.getBoundingClientRect().top), Math.round(document.querySelector('header').getBoundingClientRect().bottom)]; }, a);
    ok(`Ancre ${a} : titre sous l’en-tête, à l’écran`, d[0] >= d[1] && d[0] < 760, d.join(' / ')); }
  await q.context().close();
  const n = await open(1440, 900, { nojs: true }); await n.evaluate(() => scrollTo(0, 1400)).catch(() => {}); await n.mouse.wheel(0, 1400); await n.waitForTimeout(700); const bb = await (await n.$('header')).boundingBox(); ok('Sans JavaScript : la navigation reste collée', bb && bb.y + bb.height >= T.enteteCompact[0] && bb.y + bb.height <= T.enteteCompact[1], JSON.stringify(bb)); await n.context().close();
  const c = await open(1440, 900, { calm: true, wait: 2500 }); await instant(c); await c.evaluate(() => scrollTo(0, 1400)); await c.waitForTimeout(600); ok('Mouvement réduit : aucune animation de la barre', await c.evaluate(() => [...document.querySelectorAll('header .row-identity,header .nav-links')].every(e => getComputedStyle(e).animationName === 'none'))); await c.context().close();
  const m = await open(390, 844); await instant(m); await m.evaluate(() => scrollTo(0, 1500)); await m.waitForTimeout(700); ok('Téléphone : en-tête inchangé', await m.evaluate(() => { const h = document.querySelector('header'); return !h.classList.contains('is-compact') && h.offsetHeight === 81 || h.offsetHeight === 82; }), String(await m.$eval('header', e => e.offsetHeight))); await m.context().close();
});
await step('barre de commande', async () => {
  const p = await open(390, 664); await instant(p);
  const r = []; for (const q of ['.fe-perfume h2', '.fe-note h4', '.fe-note:last-child p', '#fePlay', '.fe-folds summary', '.fe-final [data-add]', '.fe-related a', 'footer a']) { if (!await p.$(q)) continue; await p.evaluate(x => { const l = [...document.querySelectorAll(x)]; l[l.length - 1].scrollIntoView({ block: 'center' }); }, q); await p.waitForTimeout(500); r.push(await p.evaluate(x => { const l = [...document.querySelectorAll(x)], e = l[l.length - 1].getBoundingClientRect(), m = document.querySelector('#mbar'), b = m.getBoundingClientRect(), off = m.classList.contains('is-off') || m.classList.contains('is-fin'); return [x, off || e.top + Math.min(e.height, 60) <= b.top + 1]; }, q)); }
  ok('Barre : aucun contenu impossible à dégager', r.every(x => x[1]), r.filter(x => !x[1]).map(x => x[0]).join());
  const h = await p.evaluate(() => document.querySelector('#mbar').offsetHeight / innerHeight); ok('Barre : moins de 13 % de l’écran', h > 0 && h < .13, (h * 100).toFixed(1) + ' %');
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(600); ok('Barre : le bas du pied de page reste lisible', await p.evaluate(() => { const b = document.querySelector('.foot-blessing').getBoundingClientRect(), m = document.querySelector('#mbar'); return m.classList.contains('is-off') || m.classList.contains('is-fin') || b.bottom <= m.getBoundingClientRect().top + 1; })); await p.context().close();
});
if (T.barreFin) await step('barre en fin de page', async () => {
  const etat = p => p.evaluate(() => { const m = document.querySelector('#mbar'), a = document.querySelector('.fe-final [data-add]').getBoundingClientRect(), b = m.getBoundingClientRect(); return { v: !m.classList.contains('is-off') && !m.classList.contains('is-fin'), fin: m.classList.contains('is-fin'), haut: Math.round(a.top), sous: b.top < innerHeight - 4 && getComputedStyle(m).visibility === 'visible' && a.bottom > b.top && a.top < b.bottom && a.top < innerHeight - 4, doc: document.documentElement.scrollHeight }; });
  for (const [w, h] of [[390, 664], [390, 844], [430, 932], [768, 1024]]) {
    const p = await open(w, h, { wait: 2500 }); await instant(p);
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } }); await p.waitForTimeout(1200);
    for (const q of ['#parfum', '#notes', '#galerie', '#film', '#details', '.fe-house']) { await p.evaluate(x => document.querySelector(x).scrollIntoView(), q); await p.waitForTimeout(450); ok(`${w}×${h} barre visible dans ${q}`, (await etat(p)).v); }
    for (const q of ['.fe-final', '.fe-related', '.fe-credits', 'footer', '.foot-blessing']) { await p.evaluate(x => document.querySelector(x).scrollIntoView({ block: x === '.foot-blessing' ? 'end' : 'center' }), q); await p.waitForTimeout(600); ok(`${w}×${h} barre effacée dans ${q}`, !(await etat(p)).v); }
    /* parcours lent dans les deux sens : un seul changement à l'aller, un seul au retour, jamais de clignotement */
    const y0 = await p.evaluate(() => { const r = document.querySelector('.fe-final').getBoundingClientRect(); return Math.round(r.top + scrollY - innerHeight * 1.3); });
    const fin = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight); await p.evaluate(y => scrollTo(0, y), y0); await p.waitForTimeout(600);
    const aller = [], retour = []; for (let y = y0; y <= fin + 30; y += 45) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(70); aller.push(await etat(p)); }
    for (let y = fin; y >= y0; y -= 45) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(70); retour.push(await etat(p)); }
    const ch = l => l.filter((x, i) => i && x.v !== l[i - 1].v).length;
    ok(`${w}×${h} aller : un seul effacement, sans clignotement`, aller[0].v && !aller.at(-1).v && ch(aller) === 1, ch(aller) + ' changement(s)');
    ok(`${w}×${h} retour : une seule réapparition`, !retour[0].v && retour.at(-1).v && ch(retour) === 1, ch(retour) + ' changement(s)');
    ok(`${w}×${h} aucune hauteur de page modifiée`, new Set([...aller, ...retour].map(x => x.doc)).size === 1);
    ok(`${w}×${h} la barre ne recouvre jamais longtemps le bouton final`, aller.filter(x => x.sous).length <= 2 && retour.filter(x => x.sous).length <= 2, `${aller.filter(x => x.sous).length} / ${retour.filter(x => x.sous).length}`);
    /* barres de Safari qui se replient : la hauteur de la fenêtre change près du seuil */
    const pos = await p.evaluate(() => { const r = document.querySelector('.fe-final [data-add]').getBoundingClientRect(); return Math.round(r.top + scrollY - innerHeight * .74); });
    await p.evaluate(y => scrollTo(0, y), pos); await p.waitForTimeout(500); const suite = []; for (const dh of [81, 0, 81, 0, 40, 0]) { await p.setViewportSize({ width: w, height: h + dh }); await p.waitForTimeout(220); suite.push((await etat(p)).v); }
    ok(`${w}×${h} barres de Safari repliées puis dépliées : pas de clignotement`, suite.every(x => x === suite[0]), suite.join()); await p.context().close();
  }
  const p = await open(390, 664, { wait: 2500 }); await instant(p); await p.click('.fe-hero [data-add]'); await badge(p, '1'); await p.waitForTimeout(3500); await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(1200);
  ok('Pied de page : bouton du panier en bas, pied entièrement lisible', await p.evaluate(() => { const f = document.querySelector('.dn-cart-fab').getBoundingClientRect(), b = document.querySelector('.foot-blessing').getBoundingClientRect(); return f.bottom <= innerHeight && f.bottom > innerHeight - 60 && b.bottom <= innerHeight; }));
  await p.evaluate(() => document.querySelector('#notes').scrollIntoView()); await p.waitForTimeout(1000); ok('Retour aux notes : barre présente, panier au-dessus', await p.evaluate(() => { const m = document.querySelector('#mbar'), f = document.querySelector('.dn-cart-fab').getBoundingClientRect(); return !m.classList.contains('is-fin') && f.bottom <= m.getBoundingClientRect().top + 1; }));
  await p.click('#mbar [data-add]'); await badge(p, '2'); ok('Barre revenue : ajout au panier', true); await p.context().close();
  const x = await open(390, 844, { route: async p => p.route('**/barre.js', r => r.abort()) }); await instant(x); await x.evaluate(() => document.querySelector('#notes').scrollIntoView()); await x.waitForTimeout(700); ok('Script de la barre en échec : barre d’achat présente', await x.evaluate(() => !document.querySelector('#mbar').classList.contains('is-off'))); await x.context().close();
  const y = await open(1440, 900); ok('Ordinateur : barre jamais affichée, script demandé après le chargement', await y.evaluate(() => { const r = performance.getEntriesByType('resource').find(r => /barre[.]js/.test(r.name)), n = performance.getEntriesByType('navigation')[0]; return getComputedStyle(document.querySelector('#mbar')).display === 'none' && !!r && r.startTime >= n.loadEventStart - 1; })); await y.context().close();
});
if (T.filmCentre && film) await step('film : bouton au centre', async () => {
  for (const [w, h] of [[320, 640], [390, 664], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) { const p = await open(w, h); await instant(p); await p.evaluate(() => document.querySelector('#film').scrollIntoView()); await p.waitForTimeout(900);
    const d = await p.evaluate(() => { const R = document.querySelector('.fe-player').getBoundingClientRect(), r = document.querySelector('.fe-play-pill').getBoundingClientRect(); return { dx: Math.abs((r.left + r.right - R.left - R.right) / 2), y: ((r.top + r.bottom) / 2 - R.top) / R.height, h: r.height, part: r.width * r.height / (R.width * R.height), dedans: r.left > R.left && r.right < R.right }; });
    ok(`${w}×${h} bouton du film centré, ${Math.round(d.h)} px, ${(d.part * 100).toFixed(1)} % de l’image`, d.dx < 1 && d.y > .44 && d.y < .58 && d.h >= 44 && d.part < .09 && d.dedans, JSON.stringify(d)); await p.context().close(); }
  const p = await open(390, 664); await instant(p); await p.evaluate(() => document.querySelector('.fe-player').scrollIntoView({ block: 'center' })); await p.waitForTimeout(900);
  ok('Bouton du film entièrement visible quand l’affiche est à l’écran', await p.evaluate(() => { const r = document.querySelector('.fe-play-pill').getBoundingClientRect(), m = document.querySelector('#mbar').getBoundingClientRect(), h = document.querySelector('header').getBoundingClientRect(); return r.top >= h.bottom && r.bottom <= m.top; }));
  await p.click('.fe-play-pill'); await p.waitForTimeout(1200); ok('Clic sur le bouton : lecteur ouvert, bouton retiré', await p.evaluate(() => document.querySelector('#fePlay').hidden && document.querySelector('.fe-player').classList.contains('is-on'))); await p.context().close();
});
await step('sections dépliables', async () => {
  const p = await open(390, 844, { path: CH + '#livraison' });
  ok("Adresse #livraison : la section s'ouvre", await p.$eval('#livraison', d => d.open)); ok('Les autres restent fermées', !(await p.$eval('#paiement', d => d.open)));
  await instant(p); await p.evaluate(() => document.querySelector('#paiement summary').scrollIntoView({ block: 'center' })); await p.click('#paiement summary'); await p.waitForTimeout(300); ok('Ouverture au toucher', await p.$eval('#paiement', d => d.open));
  await p.focus('#paiement summary'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); ok('Fermeture au clavier', !(await p.$eval('#paiement', d => d.open)));
  const ref = await (await fetch(U + '/index.html')).text(); const i = ref.indexOf('id="deliveryBlock"'); const bloc = ref.slice(i, ref.indexOf('</section>', i));
  const net = t => t.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '|').split('|').map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x.length > 3 && !/deliveryBlock/.test(x));
  const ici = nu(await p.evaluate(() => document.querySelector('.fe-folds').textContent)).replace(/\s+/g, ' ');
  const manque = net(bloc).map(nu).filter(x => !ici.includes(x) && !/Paiement sécurisé SumUp/.test(x)); ok('Conditions de livraison et de paiement : rien n’est perdu', !manque.length, manque.join(' / '));
  if (data.details.delivery === 'trio') {
    const t = await p.$$eval('.fe .dc-tier', l => l.map(e => [e.querySelector('.dc-price').textContent.trim(), e.querySelector('h3').textContent.trim(), !!e.querySelector('.dc-hint')])); const src = [...bloc.matchAll(/dc-price">([^<]+)[\s\S]*?<h3>([^<]+)/g)].map(x => [x[1].trim(), x[2].trim()]);
    ok('Livraison : les trois tarifs et intitulés, dans l’ordre du site', t.length === 3 && src.slice(0, 3).every((x, i) => nu(t[i][0]) === nu(x[0]) && nu(t[i][1]) === nu(x[1])), JSON.stringify(t));
    ok('Livraison : précisions sous les trois possibilités', await p.evaluate(() => { const m = document.querySelector('.dc-more'); return !!m && !document.querySelector('.dc-tier .dc-hint') && ['.dc-hint', '.dc-note', '.dc-modes'].every(q => m.querySelector(q)); }));
    for (const w of [1440, 1024, 390]) { const x = await open(w, 900, { path: CH + '#livraison' }); await x.waitForTimeout(500); const g = await x.$$eval('.dc-tier', l => l.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.top), Math.round(r.height)]; })); const larg = g.map(y => y[0]), eg = Math.max(...larg) - Math.min(...larg) <= 2; ok(`${w} livraison : trois blocs équilibrés`, g.length === 3 && eg && (w < 861 ? true : g.every(y => y[1] === g[0][1] && y[2] === g[0][2])), JSON.stringify(g)); await x.context().close(); }
  }
  const pyr = await p.evaluate(() => [...document.querySelectorAll('.fe-step')].map(s => [s.querySelector('h3 em').textContent, [...s.querySelectorAll('h4')].map(h => h.textContent)]));
  ok('Pyramide officielle exacte', nu(JSON.stringify(pyr)).toLowerCase() === nu(JSON.stringify(notes)).toLowerCase(), JSON.stringify(pyr));
  ok('Aucune impression présentée comme une mesure', await p.evaluate(() => { const t = document.body.textContent.replace(/’/g, "'"); return /impression olfactive, pas une mesure|sillage et la tenue peuvent varier/.test(t) && (!/24 à 48/.test(t) || /Indication du fabricant, et non une garantie|Selon le fabricant, à titre indicatif/.test(t)); }));
  await p.context().close();
});
await step('images entières', async () => {
  for (const w of [390, 768, 1440]) { const p = await open(w, 844); await instant(p); await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } for (const g of document.querySelectorAll('.fe-strip,.fe-related ul')) { g.scrollIntoView({ block: 'center' }); for (let x = 0; x < 1500; x += 120) { g.scrollLeft = x; await new Promise(r => setTimeout(r, 120)); } } }); await p.waitForTimeout(2500);
    const bad = await p.$$eval('main img', l => l.filter(i => i.offsetParent && i.src.indexOf('data:') < 0 && getComputedStyle(i).objectFit !== 'contain' && (c => Math.abs((i.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight)) / (i.clientHeight - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom)) - i.naturalWidth / i.naturalHeight) > .012 * i.naturalWidth / i.naturalHeight)(getComputedStyle(i))).map(i => i.src.slice(-40)));
    ok(`${w} toutes les images chargées sans recadrage ni déformation`, !bad.length && !(await p.$$eval('main img[data-src]', l => l.length)), bad.join()); await p.context().close(); }
});
// Crédits regroupés (data.credits) : aucune légende sous les images, mais un bloc visible et lisible
// qui cite chaque nature d'image, et la nature de chaque vue dans l'agrandissement.
const toutes = [...heroes, data.perfume.image, ...data.gallery.items, data.house && data.house.image, film && film.poster, ...imgNotes, ...Object.values(data.planches || {}).flatMap(x => x.images), ...Object.values(data.related || {})].filter(Boolean);
const MOT = { photo: /photographie/i, scene: /décor composé/i, ambiance: /visuels? d'ambiance/i, film: /films? officiels?/i, dessin: /dessin/i };
if (data.credits) await step('crédits', async () => {
  ok('Chaque image déclare sa nature', toutes.every(i => i.kind), toutes.filter(i => !i.kind).map(i => i.src).join());
  for (const w of [390, 768, 1024, 1440]) { const p = await open(w, 844);
    const d = await p.evaluate(() => { const c = document.querySelector('.fe-credits'), v = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1; }; return { vis: v(c), tailles: [...c.querySelectorAll('h2,p')].map(e => parseFloat(getComputedStyle(e).fontSize)), texte: c.innerText, leg: [...document.querySelectorAll('main figcaption,.fe-strip small')].filter(e => e.getBoundingClientRect().width > 0).length }; });
    ok(`${w} crédits regroupés, visibles, lisibles, natures citées`, d.vis && d.tailles.every(x => x >= 14) && [...new Set(toutes.map(i => i.kind))].every(k => MOT[k].test(nu(d.texte))) && d.texte.includes(data.brandLabel), JSON.stringify(d).slice(0, 220));
    ok(`${w} aucune légende répétée sous les images`, d.leg === 0, String(d.leg)); await p.context().close(); }
  const p = await open(390, 844); await instant(p); await p.evaluate(() => document.querySelector('#galerie').scrollIntoView()); await p.waitForTimeout(1500); await p.click('.fe-strip .fe-shot'); await p.waitForTimeout(700);
  ok('Agrandissement : nature de l’image indiquée', /Image du film officiel|Photographie|Visuel d|Décor composé|Dessin/.test(nu(await p.$eval('#feBoxCap', e => e.textContent)))); await p.context().close();
});
else await step('légendes', async () => { for (const w of [390, 768, 1024, 1440]) { const p = await open(w, 844); ok(`${w} légendes hors des images`, await p.evaluate(() => [...document.querySelectorAll('.fe-perfume-fig,.fe-house-fig,.fe-planche-fig')].every(f => { const i = f.querySelector('img').getBoundingClientRect(), c = f.querySelector('figcaption').getBoundingClientRect(); return c.width > 0 && (c.top >= i.bottom - 1 || c.right <= i.left + 1 || c.left >= i.right - 1) && c.left >= 0 && c.right <= innerWidth; }))); await p.context().close(); } });
await step('contrastes', async () => {
  for (const w of [390, 1440]) { const p = await open(w, 844, { calm: true }); const bad = await p.evaluate(() => {
    const rgb = c => (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number), lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, L = c => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
    const fond = e => { for (; e; e = e.parentElement) { const s = getComputedStyle(e), c = rgb(s.backgroundColor); if (s.backgroundImage !== 'none') return null; if (c.length < 4 || c[3] > 0) return c; } return [255, 255, 255]; };
    return [...document.querySelectorAll('main *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('figcaption,noscript,[disabled]')).map(e => { const f = fond(e); if (!f) return null; const s = getComputedStyle(e), a = L(rgb(s.color)), z = L(f), k = (Math.max(a, z) + .05) / (Math.min(a, z) + .05), big = parseFloat(s.fontSize) >= 24; return k < (big ? 3 : 4.5) ? `${e.textContent.trim().slice(0, 20)} ${k.toFixed(2)}` : null; }).filter(Boolean); });
    ok(`${w} contrastes AA`, !bad.length, bad.slice(0, 4).join(' | ')); await p.context().close(); }
});
if (data.related) await step('parfums associés', async () => {
  for (const w of [1440, 390]) { const p = await open(w, 900); await instant(p); await p.evaluate(() => document.querySelector('.fe-related').scrollIntoView()); await p.waitForTimeout(800); await p.evaluate(async () => { const u = document.querySelector('.fe-related ul'); for (let x = 0; x < 1200; x += 150) { u.scrollLeft = x; await new Promise(r => setTimeout(r, 120)); } }); await p.waitForTimeout(1200);
    const d = await p.$$eval('.fe-related li', l => l.map(e => { const i = e.querySelector('img'), r = i.getBoundingClientRect(); return [e.querySelector('a').getAttribute('href').replaceAll('/', ''), Math.round(r.width), Math.round(r.height), i.naturalWidth, i.naturalHeight, Math.abs(r.width / r.height - i.naturalWidth / i.naturalHeight) < .01, e.querySelector('small').textContent]; }));
    ok(`${w} parfums associés : cinq visuels au même format, sans déformation`, d.length === 5 && d.every(x => data.related[x[0]] && x[3] === d[0][3] && x[4] === d[0][4] && x[5] && Math.abs(x[2] - d[0][2]) <= 1), JSON.stringify(d)); await p.context().close(); }
  const attendu = await (await fetch(`${SB}/rest/v1/products?slug=in.(${Object.keys(data.related).join()})&select=slug,name,price_value`, { headers: { apikey: KEY } })).json();
  const p = await open(1440, 900); const t = await p.$$eval('.fe-related li', l => l.map(e => [e.querySelector('a').getAttribute('href').replaceAll('/', ''), e.querySelector('span').textContent, e.querySelector('small').textContent]));
  ok('Parfums associés : noms et prix de Supabase', attendu.length === t.length && attendu.every(a => t.some(x => x[0] === a.slug && x[1] === a.name && nu(x[2]) === court(a.price_value))), JSON.stringify(t)); await p.context().close();
});
await step('écran très haut', async () => { const p = await open(1080, 2400); await p.waitForTimeout(1500); ok('Écran très haut : images visibles chargées sans défiler', !(await p.$$eval('main img[data-src]', l => l.filter(i => i.getBoundingClientRect().top < innerHeight - 5).length))); await p.context().close(); });
await step('premier écran économe', async () => { const p = await open(390, 844); const n = await p.evaluate(s => performance.getEntriesByType('resource').filter(r => r.name.includes(`/assets/${s}/`) && /[.](webp|jpe?g|png|svg|avif)/.test(r.name)).length, slug); const vues = heroes.length + (T.decor || 0); ok(`Premier écran : ${vues} image(s) demandée(s) sans défiler`, n === vues, String(n)); await p.context().close(); });
await step('textes', async () => {
  const p = await open(1440, 900); const t = nu(await p.evaluate(() => document.body.textContent + [...document.querySelectorAll('script[type="application/ld+json"]')].map(x => x.textContent).join(' ')));
  const bad = [...(T.absent || []), 'sillage le plus', 'puissant', 'longue tenue', 'revendeur agréé', 'partenaire officiel'].filter(x => t.toLowerCase().includes(x.toLowerCase())); ok('Formulations à éviter absentes', !bad.length, bad.join());
  const voulu = [...(T.present || []), ...(data.texts?.description?.value || row.description).map(x => nu(x))].filter(x => !t.replace(/« /g, '« ').includes(nu(x))); ok('Description publiée en entier', !voulu.length, voulu.map(x => x.slice(0, 40)).join(' | '));
  ok('Faits présents : maison, type, contenance, fabrication', [data.brandLabel, data.typeLabel, row.volume, data.details.making].filter(Boolean).every(x => t.includes(nu(x)))); await p.context().close();
});
await step('images fiables', async () => {
  for (const [w, h] of [[390, 844], [673, 900], [1440, 900]]) { const p = await open(w, h); await instant(p); await p.evaluate(() => scrollTo(0, innerHeight * 2)); await p.waitForFunction(() => !document.querySelector('main img[data-src]'), null, { timeout: 25000 }).catch(() => {});
    const r = await p.evaluate(() => ({ reste: document.querySelectorAll('main img[data-src]').length, vides: [...document.querySelectorAll('main img')].filter(i => i.offsetParent && i.naturalWidth < 60).length })); ok(`${w} deux écrans parcourus : toutes les images finissent par arriver`, r.reste === 0 && r.vides === 0, JSON.stringify(r)); await p.context().close(); }
  const cible = imgNotes[0].src.split('/').pop(); let n = 0;
  const p = await open(390, 844, { route: async p => p.route(`**/${cible}*`, r => n++ < 1 ? r.abort() : r.continue()) }); await instant(p); await p.evaluate(() => document.querySelector('#notes').scrollIntoView()); await p.waitForTimeout(6000);
  ok('Image en échec : nouvelle tentative réussie', n >= 2 && await p.evaluate(c => [...document.querySelectorAll('main img')].some(i => i.src.includes(c + '?r=') && i.naturalWidth > 500), cible), String(n)); await p.context().close();
  const q = await open(390, 844, { route: async p => { for (const x of imgNotes) await p.route(`**/${x.src.split('/').pop()}*`, r => r.abort()); } }); await instant(q); await q.evaluate(() => document.querySelector('#notes').scrollIntoView()); await q.waitForTimeout(1500);
  ok('Image introuvable : emplacement teinté, jamais cassé', await q.evaluate(k => { const l = [...document.querySelectorAll('.fe-note img[data-src]')], d = document.createElement('i'); d.style.color = 'var(--wait)'; document.querySelector('.fe-pyramid').append(d); const c = getComputedStyle(d).color; return l.length === k && l.every(i => getComputedStyle(i).backgroundColor === c); }, imgNotes.length)); await q.context().close();
  const e = await open(390, 844, { wait: 0 }); await e.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } })); await e.reload({ waitUntil: 'load' }); await instant(e); await e.waitForTimeout(800); await e.evaluate(() => scrollTo(0, innerHeight * 2)); await e.waitForTimeout(6000);
  ok('Économie de données : pas de chargement anticipé du bas de page', await e.evaluate(() => document.querySelectorAll('main img[data-src]').length > 4)); await e.context().close();
});
await step('visiteur de passage', async () => { const p = await open(390, 844); await instant(p); await p.evaluate(() => scrollTo(0, innerHeight * .8)); await p.waitForTimeout(6000); ok("Un seul écran parcouru : le bas de page n'est pas téléchargé", await p.evaluate(() => document.querySelectorAll('main img[data-src]').length > 6)); await p.context().close(); });
if (film) await step('film avant lecture', async () => {
  const poster = film.poster.src.split('/').pop();
  for (const w of [390, 673, 1440]) { const p = await open(w, 900, { route: async p => p.route(`**/${poster}*`, r => r.abort()) }); await instant(p); await p.evaluate(() => document.querySelector('#film').scrollIntoView()); await p.waitForTimeout(1500);
    const d = await p.evaluate(() => { const pl = document.querySelector('.fe-player'), pill = document.querySelector('.fe-play-pill').getBoundingClientRect(), R = pl.getBoundingClientRect(); return { vid: getComputedStyle(document.querySelector('#feVideo')).visibility, h: pill.height, dedans: pill.left >= R.left && pill.right <= R.right && pill.bottom <= R.bottom + 1, nom: document.querySelector('#fePlay').getAttribute('aria-label') }; });
    ok(`${w} film sans photo : bouton visible et nommé`, d.vid === 'hidden' && d.h >= 44 && d.dedans && d.nom === film.play, JSON.stringify(d)); await p.context().close(); }
});
await step('impression', async () => {
  for (const [w, scroll] of [[673, 0], [673, 1], [1200, 1]]) { const p = await open(w, 900); await instant(p); if (scroll) { await p.evaluate(() => scrollTo(0, innerHeight * 2)); await p.waitForFunction(() => !document.querySelector('main img[data-src]'), null, { timeout: 25000 }).catch(() => {}); } await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(400);
    const d = await p.evaluate(() => { const L = c => { const m = c.match(/[\d.]+/g).map(Number); return m.length > 3 && m[3] === 0 ? 255 : m[0] * .3 + m[1] * .59 + m[2] * .11; }; const W = document.documentElement.clientWidth; const vis = [...document.querySelectorAll('main img')].filter(i => i.getBoundingClientRect().width > 0); const n = q => [...document.querySelectorAll(q)].filter(i => i.getBoundingClientRect().width > 60).length;
      return { coupees: vis.filter(i => { const r = i.getBoundingClientRect(); return r.right > W + 1 || r.left < -1; }).length, vides: vis.filter(i => i.src.slice(0, 5) === 'data:').length, gal: n('.fe-strip img'), notes: n('.fe-note img'), film: n('.fe-poster'), sombre: [...document.querySelectorAll('main section,.fe-player,.fe-note')].filter(e => e.offsetParent && L(getComputedStyle(e).backgroundColor) < 150).length, masques: [...document.querySelectorAll('[data-reveal]')].filter(e => getComputedStyle(e).opacity !== '1').length, pales: [...document.querySelectorAll('main h1,main h2,main h4,main p')].filter(e => e.offsetParent && L(getComputedStyle(e).color) > 190).length }; });
    ok(`Impression ${w} px ${scroll ? 'après défilement' : 'sans défiler'} : rien de coupé, de vide, de sombre ni d’illisible`, !d.coupees && !d.vides && !d.sombre && !d.masques && !d.pales && (!scroll || d.gal === GAL && d.notes === imgNotes.length && (!data.film || d.film)), JSON.stringify(d)); await p.context().close(); }
});
await step('recherche', async () => { const p = await open(1440, 900, { wait: 3500 }); ok('Recherche du site présente', await p.evaluate(() => !!document.querySelector('[class*=dn-search]'))); await p.context().close(); });
await step('référencement et publication', async () => {
  const p = await open(1440, 900); const h = await (await fetch(U + CH)).text();
  const L = await p.$$eval('script[type="application/ld+json"]', l => l.map(s => JSON.parse(s.textContent))); const pr = L.find(x => x['@type'] === 'Product');
  ok('Données structurées Product', pr.offers.price === Number(PRIX).toFixed(2) && pr.offers.priceCurrency === 'EUR' && /InStock/.test(pr.offers.availability) && pr.brand.name === data.brandLabel && pr.name === row.name);
  ok('Données structurées : ' + (film ? 'Product, BreadcrumbList, VideoObject' : 'Product, BreadcrumbList'), L.map(x => x['@type']).join() === 'Product,BreadcrumbList' + (film ? ',VideoObject' : ''));
  const t = await p.evaluate(() => document.body.innerText); ok('Aucun moyen de paiement interdit', !/revolut|espèces|virement|paiement à la réception/i.test(t)); ok('Aucun pourcentage ni statut officiel revendiqué', !/\d+\s?%|revendeur agréé|partenaire officiel|distributeur officiel/i.test(t) || T.pourcentage);
  const H = await p.$$eval('main h1,main h2,main h3,main h4', l => l.map(e => +e.tagName[1])); ok('Un seul h1, hiérarchie sans saut', H.filter(x => x === 1).length === 1 && H.every((x, i) => !i || x - H[i - 1] <= 1), H.join(''));
  ok('Images : attribut alt partout', await p.$$eval('main img', l => l.every(i => i.hasAttribute('alt')))); ok('Titre ≤ 65 et description ≤ 160 caractères', (await p.title()).length <= 65 && (await p.getAttribute('meta[name=description]', 'content')).length <= 160);
  ok('Aucune trace de prévisualisation', !/ts\.net|tailscale|localhost|127\.0\.0\.1|noindex|prévisualisation/i.test(h)); ok('Adresse canonique', h.includes(`<link rel="canonical" href="https://dar-nur.fr${CH}" />`) && h.includes(`property="og:url" content="https://dar-nur.fr${CH}"`));
  ok('Dégradés opaques (export PDF d’iOS)', !/gradient\([^;}]*(transparent|rgba\()/.test(h + await (await fetch(U + '/fiche-premium.css')).text()));
  const natures = [...new Set([...heroes, data.perfume.image, data.house && data.house.image].filter(Boolean).map(i => i.kind))]; const LEG = { photo: 'Photographie', scene: 'Décor composé par la marque', ambiance: "Visuel d'ambiance de la marque", film: 'Image du film officiel' };
  ok('Nature des images indiquée', natures.every(k => data.credits ? MOT[k].test(nu(data.credits.lines.join(' '))) && nu(t).includes(nu(data.credits.lines[0])) : nu(h).includes(LEG[k])) && nu(t).includes(nu(data.pyramid.disclaim || 'Illustrations de la marque')));
  const r = await p.evaluate(async () => { const u = [...new Set([...document.querySelectorAll("img[src^='/'],img[data-src],link[href^='/'],script[src^='/']")].map(e => e.dataset.src || e.getAttribute('src') || e.getAttribute('href')))]; return (await Promise.all(u.map(async x => [x, (await fetch(x, { method: 'HEAD', mode: x.startsWith('http') ? 'no-cors' : 'same-origin' })).status]))).filter(x => x[1] !== 200 && x[1] !== 0); }); ok('Toutes les ressources répondent', !r.length, JSON.stringify(r)); await p.context().close();
  const q = await open(1440, 900, { wait: 3000 }); await q.click('.fe-hero [data-add]'); await q.waitForTimeout(1500); await q.goto(U + '/rosa-vento/', { waitUntil: 'load' }); await q.waitForTimeout(3500); ok('Panier conservé pendant la navigation', await q.evaluate(() => document.querySelector('#dnCartBadge')?.textContent === '1')); await q.goto(U + CH, { waitUntil: 'load' }); await q.waitForTimeout(3500); ok('Panier conservé au retour', await q.evaluate(() => document.querySelector('#dnCartBadge')?.textContent === '1')); await q.context().close();
});
await b.close();
const k = R.filter(r => !r[1]); console.log(`\n${slug} ${process.env.MOTEUR || 'chromium'} ${R.length - k.length}/${R.length} ${k.map(r => r[0]).join(' ; ')}`);
process.exitCode = k.length ? 1 : 0;
