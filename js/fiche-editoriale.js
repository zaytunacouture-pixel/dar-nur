/* Fiche éditoriale (voir scripts/lib/fiche-editoriale.mjs).
   Tout le contenu est déjà dans le HTML : ce script n'ajoute que le confort
   (panier, galerie, film, apparitions) et relit prix et disponibilité. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cfg;
  try { cfg = JSON.parse($('#feConfig').textContent); } catch (e) { return; }
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Prix et disponibilité : Supabase reste la source de vérité ── */
  function fmt(v) { var n = Number(v); return (n % 1 ? n.toFixed(2).replace('.', ',') : String(n)) + ' €'; }
  /* N'écrit que si le texte change : réécrire un libellé identique pendant l'appui
     supprime le clic sous Safari (le nœud pressé n'existe plus au relâchement). */
  function txt(e, v) { if (e.textContent !== v) e.textContent = v; }
  function apply() {
    var off = cfg.soon || cfg.price == null;
    $$('[data-price]').forEach(function (e) { txt(e, cfg.price == null ? 'Prix sur demande' : fmt(cfg.price)); });
    $$('[data-add]').forEach(function (b) { b.disabled = off; txt(b, cfg.gone ? 'Indisponible' : cfg.soon ? 'Disponible prochainement' : 'Ajouter au panier'); });
    $$('[data-wa]').forEach(function (a) {
      a.hidden = !!cfg.soon;
      if (cfg.price != null) a.href = a.href.replace(/Prix%20%3A%20[^%]*%2C\d\d/, 'Prix%20%3A%20' + Number(cfg.price).toFixed(2).replace('.', '%2C'));
    });
  }
  function refresh() {
    if (typeof SUPABASE_URL === 'undefined' || !window.fetch) return;
    fetch(SUPABASE_URL + '/rest/v1/products?select=price_value,coming_soon,availability&active=eq.true&slug=eq.' + encodeURIComponent(cfg.slug),
      { headers: { apikey: SUPABASE_ANON } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (rows) {
        var p = rows[0];
        if (!p) { cfg.soon = cfg.gone = true; }
        else { cfg.price = p.price_value == null ? null : Number(p.price_value); cfg.soon = p.coming_soon === true; }
        apply();
        $$('[data-stock]').forEach(function (e) {
          var t = !p ? 'Indisponible' : cfg.soon ? 'Disponible prochainement' : p.availability === 'available' ? 'Disponible' : '';
          txt(e, t); e.hidden = !t;
        });
      })
      .catch(function () { /* hors ligne : valeurs de la dernière génération */ });
  }
  if (document.readyState === 'complete') setTimeout(refresh, 300); else window.addEventListener('load', function () { setTimeout(refresh, 300); });

  /* ── Panier et recherche existants : chargés après la photo principale, ou
        aussitôt au premier geste. Un clic « Ajouter » n'est jamais perdu. ── */
  var booted = null;
  function css(h) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.appendChild(l); return new Promise(function (ok) { l.onload = l.onerror = ok; }); }
  function js(h) { return new Promise(function (ok) { var s = document.createElement('script'); s.src = h; s.onload = s.onerror = ok; document.body.appendChild(s); }); }
  function boot() {
    if (!booted) booted = Promise.all([css('/cart.css'), css('/search.css')]).then(function () { return js('/js/cart.js'); }).then(function () { return js('/js/search.js'); });
    return booted;
  }
  function idle() { if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 2500 }); else setTimeout(boot, 400); }
  if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle);
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (t) { window.addEventListener(t, boot, { once: true, passive: true }); });

  $$('[data-add]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (cfg.soon || cfg.price == null) return;
      boot().then(function () {
        if (window.DarNurCart) window.DarNurCart.add({ slug: cfg.slug, variant: null, qty: 1, snapshot: { name: cfg.name, price: cfg.price, image: cfg.image, category: cfg.category } });
      });
    });
  });

  /* ── Barre mobile : masquée tant que le bouton principal est visible ── */
  var mbar = $('#mbar'), heroBuy = $('.fe-hero [data-add]'), finalBuy = $('.fe-final [data-add]');
  if (mbar && heroBuy && 'IntersectionObserver' in window) {
    var seen = new Map();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { seen.set(e.target, e.isIntersecting); });
      var any = false; seen.forEach(function (v) { if (v) any = true; });
      mbar.classList.toggle('is-off', any);
    }, { threshold: .95 });
    io.observe(heroBuy); if (finalBuy) io.observe(finalBuy);
  }

  /* ── Agrandissement : les images gardent leurs proportions ── */
  var box = $('#feBox'), shots = $$('[data-shot]'), cur = 0;
  function show(i) {
    cur = (i + shots.length) % shots.length;
    var b = shots[cur], im = $('img', b), cap = b.nextElementSibling;
    $('#feBoxImg').src = b.dataset.full; $('#feBoxImg').alt = im.alt;
    $('#feBoxCap').textContent = (cur + 1) + ' / ' + shots.length + ' · ' + $('span', cap).textContent + ' · ' + $('small', cap).textContent;
  }
  if (box && box.showModal) {
    shots.forEach(function (b, i) { b.addEventListener('click', function () { show(i); box.showModal(); }); });
    box.addEventListener('click', function (e) {
      var t = e.target.closest('[data-box]');
      if (e.target === box || (t && t.dataset.box === 'close')) return box.close();
      if (t) show(cur + Number(t.dataset.box));
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(cur - 1);
      if (e.key === 'ArrowRight') show(cur + 1);
    });
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    });
    box.addEventListener('close', function () { shots[cur] && shots[cur].focus({ preventScroll: true }); });
  }

  /* ── Film : la photographie officielle tient lieu d'affiche, le film n'est
        demandé qu'au clic ── */
  var video = $('#feVideo'), play = $('#fePlay'), player = $('.fe-player');
  if (video && play) {
    var lit = function (on) { player.classList.toggle('is-on', on); play.hidden = on; video.controls = on; };
    player.classList.add('has-js');
    lit(false);
    play.addEventListener('click', function () {
      lit(true);
      var s = video.play();
      if (s && s.catch) s.catch(function () { /* commandes déjà visibles : le visiteur relance */ });
      video.focus({ preventScroll: true });
    });
    video.addEventListener('play', function () { lit(true); });
    video.addEventListener('ended', function () { lit(false); });
  }

  /* ── Sections dépliables : un lien vers une section fermée l'ouvre ── */
  function unfold(id) {
    var d = id && document.getElementById(id);
    if (d && d.tagName === 'DETAILS') d.open = true;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a) unfold(a.getAttribute('href').slice(1));
  });
  unfold(location.hash.slice(1));
  window.addEventListener('beforeprint', function () { $$('.fe-folds details').forEach(function (d) { d.open = true; }); });

  /* ── Apparitions : uniquement sous la ligne de flottaison, jamais bloquantes ── */
  var rev = $$('[data-reveal]');
  if (!calm && 'IntersectionObserver' in window) {
    /* L'observateur donne la position sans forcer de calcul de mise en page. */
    var first = true;
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.remove('fe-wait'); ro.unobserve(e.target); }
        else if (first && e.boundingClientRect.top > 0) e.target.classList.add('fe-wait');
        else if (first) ro.unobserve(e.target);
      });
      first = false;
    }, { rootMargin: '0px 0px -8% 0px' });
    rev.forEach(function (e) { ro.observe(e); });
    /* Filet : impression, capture ou observateur muet → tout redevient visible. */
    var all = function () { rev.forEach(function (e) { e.classList.remove('fe-wait'); }); };
    window.addEventListener('beforeprint', all);
    setTimeout(all, 6000);
  }
})();
