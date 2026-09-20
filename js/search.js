/* ============================================================================
   DAR NŪR — recherche publique (bouton dans l'en-tête + panneau de résultats)
   ----------------------------------------------------------------------------
   Module autonome, sans dépendance : aucun framework, aucun SDK Supabase.

   Principes structurants :

   1. UN SEUL INDEX, GÉNÉRÉ. Les données viennent de data/search-index.json,
      produit par scripts/generate-search-index.mjs depuis Supabase dans le
      même workflow que les fiches /{slug}/. Aucune requête Supabase à la
      frappe, aucun catalogue chargé au démarrage de la page : l'index n'est
      téléchargé qu'au premier survol/clic du bouton, puis gardé en mémoire
      (et en cache HTTP pour les pages suivantes).

   2. TOUT SE CALCULE DANS LE NAVIGATEUR. Normalisation (accents, casse,
      tirets), classement (nom exact > début du nom > nom partiel > marque >
      catégorie > tagline/contenance > texte de la fiche) et tolérance aux
      fautes (distance d'édition bornée sur les mots du nom, de la marque et
      de la catégorie). Dimensionné pour plusieurs milliers de produits :
      aucune comparaison approximative sur le texte long des fiches.

   3. AUCUNE INSERTION LOURDE DANS L'EN-TÊTE. Le seul élément ajouté est un
      bouton de 38 px : sur les pages à deux rangées (catégories, parfums,
      cadeaux) il prend place à droite de la rangée identité, sur la homepage
      et les fiches il ferme la rangée de navigation (dont l'espacement a été
      resserré de 6 px pour lui faire de la place, mesuré à 1240 px). Sur
      mobile il se place à gauche du burger, sur tous les types de page.

   Chargement : en defer, sur les pages commerciales uniquement (mêmes pages
   que js/cart.js). Styles : /search.css.
   ========================================================================== */
(function () {
  'use strict';

  var INDEX_URL = '/data/search-index.json';
  var MIN_CHARS = 2;
  var SUGGEST_LIMIT = 8;      // suggestions affichées avant « Voir tous les résultats »
  var PAGE_STEP = 40;         // résultats ajoutés à chaque « Afficher plus »
  var DEBOUNCE_MS = 120;
  var MOBILE_QUERY = '(max-width: 1239px)';   // même seuil que nav.css / index.html

  /* ── État ──────────────────────────────────────────────────────────── */
  var index = null;           // { imgBase, cats, items[] } préparé pour la recherche
  var indexPromise = null;
  var indexFailed = false;
  var isOpen = false;
  var expanded = false;       // true après « Voir tous les résultats » / Entrée
  var shown = SUGGEST_LIMIT;
  var results = [];           // résultats de la dernière requête, classés
  var lastQuery = '';
  var activeIdx = -1;         // option active (clavier), -1 = aucune
  var lastFocus = null;
  var debounceTimer = null;

  var trigger, root, panel, form, input, clearBtn, closeBtn, status, list, foot;

  /* ── Utilitaires ───────────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Format français imposé : 31,50 € — même règle que fmt() de js/cart.js.
  function fmtPrice(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    return n.toFixed(2).replace('.', ',') + ' €';
  }

  // Même contrat que normalize() de scripts/generate-search-index.mjs.
  function normalize(str) {
    return String(str == null ? '' : str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Pluriel simple retiré (« miels » → « miel ») pour que singulier et
  // pluriel se rejoignent ; appliqué aux mots des champs courts ET à la
  // requête, jamais au sac de mots (recherché par préfixe, donc déjà couvert).
  function stem(tok) {
    return (tok.length > 3 && /[sx]$/.test(tok)) ? tok.slice(0, -1) : tok;
  }

  function tokens(str) {
    var n = normalize(str);
    if (!n) return [];
    var out = n.split(' ');
    for (var i = 0; i < out.length; i++) out[i] = stem(out[i]);
    return out;
  }

  // Distance de Levenshtein bornée : renvoie max+1 dès que la borne est
  // dépassée (évite de calculer la matrice entière sur des mots éloignés).
  function editDistance(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i;
      var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[lb];
  }

  // Tolérance : 1 faute dès 4 lettres, 2 fautes dès 7 lettres.
  function fuzzyBudget(tok) {
    return tok.length >= 7 ? 2 : (tok.length >= 4 ? 1 : 0);
  }

  function imgUrl(src) {
    if (!src) return null;
    if (/^https?:\/\//i.test(src) || src.charAt(0) === '/') return src;
    return index.imgBase + src;
  }

  /* ── Index ─────────────────────────────────────────────────────────── */

  function prepare(raw) {
    var cats = raw.cats || {};
    var items = raw.items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var cat = cats[it.c] || {};
      it._n = normalize(it.n);
      it._nc = it._n.replace(/ /g, '');
      it._nt = tokens(it.n);
      it._bt = it.b ? tokens(it.b) : [];
      it._ct = tokens((cat.l || '') + ' ' + (cat.f || '') + ' ' + it.c);
      it._tt = it.t ? tokens(it.t) : [];
      it._vt = it.v ? normalize(it.v).split(' ') : [];
      it._k = it.k ? ' ' + it.k + ' ' : '';
      it._catLabel = cat.f || cat.l || '';
      it._pos = i;
    }
    return { imgBase: raw.imgBase || '', cats: cats, items: items };
  }

  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(INDEX_URL, { credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (raw) {
        index = prepare(raw);
        indexFailed = false;
        return index;
      })
      .catch(function (e) {
        indexPromise = null;   // un prochain essai retentera le téléchargement
        indexFailed = true;
        throw e;
      });
    return indexPromise;
  }

  /* ── Classement ────────────────────────────────────────────────────── */

  // Meilleur score d'un mot de la requête contre une liste de mots courts.
  // exact > préfixe > inclusion > approché (fautes de frappe).
  function matchWords(tok, words, exact, prefix, contains, fuzzyBase) {
    var best = 0, i, w;
    for (i = 0; i < words.length; i++) {
      w = words[i];
      if (w === tok) return exact;
      if (w.indexOf(tok) === 0) { if (prefix > best) best = prefix; }
      // inclusion au milieu d'un mot : 4 lettres minimum, sinon « oud »
      // remonterait toutes les « poudres » devant les parfums au oud.
      else if (contains && tok.length >= 4 && w.indexOf(tok) >= 0) { if (contains > best) best = contains; }
    }
    if (best) return best;
    var budget = fuzzyBudget(tok);
    if (!budget || !fuzzyBase) return 0;
    for (i = 0; i < words.length; i++) {
      w = words[i];
      // le mot entier, ou son début (« latafa » ≈ « lattafa », « nomad » ≈ « nomade »)
      var d = editDistance(tok, w, budget);
      if (d > budget && w.length > tok.length) d = editDistance(tok, w.slice(0, tok.length + 1), budget);
      if (d <= budget) {
        var s = fuzzyBase - d * 6;
        if (s > best) best = s;
      }
    }
    return best;
  }

  function tokenScore(it, tok) {
    var s = matchWords(tok, it._nt, 100, 80, 55, 60);
    if (s >= 80) return s;
    var b = matchWords(tok, it._bt, 50, 46, 0, 40);   if (b > s) s = b;
    var c = matchWords(tok, it._ct, 42, 38, 0, 30);   if (c > s) s = c;
    if (s >= 42) return s;
    var t = matchWords(tok, it._tt, 30, 26, 0, 0);    if (t > s) s = t;
    var v = matchWords(tok, it._vt, 30, 0, 0, 0);     if (v > s) s = v;
    if (s >= 30) return s;
    if (it._k) {
      if (it._k.indexOf(' ' + tok) >= 0) { if (20 > s) s = 20; }
      else if (tok.length >= 4 && it._k.indexOf(tok) >= 0) { if (12 > s) s = 12; }
    }
    return s;
  }

  function scoreItem(it, toks, qn, qc) {
    var total = 0;
    // Bonus sur la requête entière : nom exact > début du nom > début d'un
    // mot du nom > inclusion (5 lettres min.) > forme compacte sans espaces
    // ni tirets (« ambrenomade », 6 lettres min. pour ne pas coller deux
    // mots par accident, ex. « miels » dans « miel spiruline »).
    var compact = false;
    if (it._n === qn) total += 200;
    else if (it._n.indexOf(qn) === 0) total += 120;
    else if ((' ' + it._n).indexOf(' ' + qn) >= 0) total += 70;
    else if (qn.length >= 5 && it._n.indexOf(qn) >= 0) total += 40;
    else if (qc.length >= 6 && it._nc.indexOf(qc) >= 0) { total += 40; compact = true; }
    for (var i = 0; i < toks.length; i++) {
      var s = tokenScore(it, toks[i]);
      // chaque mot de la requête doit correspondre quelque part — sauf si la
      // forme compacte a déjà reconnu le nom (« ambrenomade » n'a aucun mot)
      if (!s) { if (compact) continue; return 0; }
      total += s;
    }
    return total;
  }

  function search(query) {
    var qn = normalize(query);
    var toks = tokens(query);
    if (!index || !toks.length) return [];
    var qc = qn.replace(/ /g, '');
    var out = [];
    var items = index.items;
    for (var i = 0; i < items.length; i++) {
      var s = scoreItem(items[i], toks, qn, qc);
      if (s > 0) out.push({ it: items[i], s: s });
    }
    out.sort(function (a, b) { return (b.s - a.s) || (a.it._pos - b.it._pos); });
    return out;
  }

  /* ── Rendu ─────────────────────────────────────────────────────────── */

  var ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function priceLabel(it) {
    if (it.o) return 'Bientôt disponible';
    var p = fmtPrice(it.p);
    return p ? p : 'Prix sur demande';
  }

  function itemHtml(it, i) {
    var img = imgUrl(it.i) || '/logo-dar-nur.png';
    var meta = it.b ? esc(it.b) + (it._catLabel ? ' · ' + esc(it._catLabel) : '') : esc(it._catLabel);
    return '<li role="option" id="dn-search-opt-' + i + '" aria-selected="false" class="dn-search-item">'
      + '<a href="/' + encodeURIComponent(it.s) + '/" tabindex="-1">'
      + '<span class="dn-search-thumb"><img src="' + esc(img) + '" alt="" loading="lazy" decoding="async" width="56" height="56"></span>'
      + '<span class="dn-search-body">'
      + '<span class="dn-search-name">' + esc(it.n) + '</span>'
      + (meta ? '<span class="dn-search-meta">' + meta + '</span>' : '')
      + '</span>'
      + '<span class="dn-search-price' + (it.o || it.p == null ? ' is-muted' : '') + '">' + esc(priceLabel(it)) + '</span>'
      + '</a></li>';
  }

  function setStatus(text, tone) {
    status.textContent = text || '';
    status.className = 'dn-search-status' + (tone ? ' is-' + tone : '');
  }

  function render() {
    var q = lastQuery;
    var qTrim = q.trim();
    activeIdx = -1;
    input.setAttribute('aria-activedescendant', '');
    clearBtn.hidden = !qTrim;

    if (indexFailed && !index) {
      list.innerHTML = '';
      foot.innerHTML = '';
      setStatus('La recherche est momentanément indisponible. Réessayez dans un instant.', 'error');
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    if (qTrim.length < MIN_CHARS) {
      list.innerHTML = '';
      foot.innerHTML = '';
      setStatus(qTrim ? 'Tapez au moins ' + MIN_CHARS + ' caractères.' : 'Nom, marque, catégorie, note olfactive, ingrédient…');
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!index) {
      setStatus('Chargement du catalogue…');
      return;
    }

    var total = results.length;
    if (!total) {
      list.innerHTML = '';
      foot.innerHTML = '<a class="dn-search-all" href="https://dar-nur.fr/#boutique">Voir toute la boutique</a>';
      setStatus('Aucun produit ne correspond à « ' + qTrim + ' ». Vérifiez l’orthographe ou essayez un mot plus court.', 'empty');
      input.setAttribute('aria-expanded', 'false');
      return;
    }

    var limit = expanded ? Math.min(shown, total) : Math.min(SUGGEST_LIMIT, total);
    var html = '';
    for (var i = 0; i < limit; i++) html += itemHtml(results[i].it, i);
    list.innerHTML = html;
    input.setAttribute('aria-expanded', 'true');

    var label = total + (total > 1 ? ' résultats' : ' résultat') + ' pour « ' + qTrim + ' »';
    setStatus(label + (limit < total ? ' — ' + limit + ' affichés' : ''));

    if (limit < total) {
      var remaining = total - limit;
      foot.innerHTML = expanded
        ? '<button type="button" class="dn-search-more" data-more>Afficher ' + Math.min(PAGE_STEP, remaining) + ' de plus</button>'
        : '<button type="button" class="dn-search-more" data-all>Voir tous les ' + total + ' résultats</button>';
    } else {
      foot.innerHTML = '';
    }
  }

  function runSearch() {
    results = index ? search(lastQuery) : [];
    render();
  }

  function onInput() {
    lastQuery = input.value;
    expanded = false;             // toute nouvelle saisie revient aux suggestions
    shown = SUGGEST_LIMIT;
    clearTimeout(debounceTimer);
    if (lastQuery.trim().length < MIN_CHARS) { results = []; render(); return; }
    debounceTimer = setTimeout(function () {
      if (!index) {
        render();
        loadIndex().then(runSearch, render);
        return;
      }
      runSearch();
    }, DEBOUNCE_MS);
  }

  /* ── Navigation clavier ────────────────────────────────────────────── */

  function options() { return list.querySelectorAll('[role="option"]'); }

  function setActive(i) {
    var opts = options();
    if (!opts.length) { activeIdx = -1; input.setAttribute('aria-activedescendant', ''); return; }
    if (i < 0) i = opts.length - 1;
    if (i >= opts.length) i = 0;
    for (var k = 0; k < opts.length; k++) {
      opts[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
      opts[k].classList.toggle('is-active', k === i);
    }
    activeIdx = i;
    input.setAttribute('aria-activedescendant', opts[i].id);
    if (opts[i].scrollIntoView) opts[i].scrollIntoView({ block: 'nearest' });
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); return; }
    if (e.key === 'Home' && activeIdx >= 0) { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End' && activeIdx >= 0) { e.preventDefault(); setActive(9999); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      var opts = options();
      if (activeIdx >= 0 && opts[activeIdx]) {
        var a = opts[activeIdx].querySelector('a');
        if (a) window.location.href = a.href;
        return;
      }
      // Entrée sans sélection : lance la recherche complète immédiatement.
      clearTimeout(debounceTimer);
      lastQuery = input.value;
      expanded = true;
      shown = PAGE_STEP;
      if (!index) { render(); loadIndex().then(runSearch, render); return; }
      runSearch();
    }
  }

  // Piège de focus : Tab circule entre le champ, les boutons et les options.
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    // Les options portent tabindex="-1" (le clavier les parcourt par les
    // flèches, pas par Tab) : on les exclut, sinon le piège ne reconnaît pas
    // le dernier élément réellement tabulable et laisse sortir le focus.
    var focusables = panel.querySelectorAll('input, button:not([hidden]), a[href]:not([tabindex="-1"])');
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ── Ouverture / fermeture ─────────────────────────────────────────── */

  function open() {
    if (isOpen) return;
    isOpen = true;
    lastFocus = document.activeElement;

    // Menu mobile ouvert : on le referme par son propre bouton, pour que
    // chaque page applique sa logique (nav.js seul, ou toggleMenu() de la
    // homepage qui gère aussi la croix et l'overlay).
    var navLinks = document.getElementById('navLinks');
    var burger = document.getElementById('burger');
    if (navLinks && burger && navLinks.classList.contains('open')) burger.click();

    root.hidden = false;
    document.documentElement.classList.add('dn-search-open');
    trigger.setAttribute('aria-expanded', 'true');
    loadIndex().then(function () { if (isOpen && lastQuery.trim().length >= MIN_CHARS) runSearch(); }, function () { if (isOpen) render(); });
    render();
    // requestAnimationFrame : laisse le navigateur appliquer [hidden] avant
    // le focus, sinon le clavier mobile ne s'ouvre pas toujours.
    requestAnimationFrame(function () { input.focus(); if (input.value) input.select(); });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(debounceTimer);
    root.hidden = true;
    document.documentElement.classList.remove('dn-search-open');
    trigger.setAttribute('aria-expanded', 'false');
    var back = (lastFocus && lastFocus !== document.body && lastFocus.focus) ? lastFocus : trigger;
    try { back.focus(); } catch (e) { /* élément disparu */ }
    lastFocus = null;
  }

  /* ── Placement du bouton dans l'en-tête ────────────────────────────── */

  var mq = window.matchMedia(MOBILE_QUERY);

  function placeTrigger() {
    var identity = document.querySelector('header .row-identity');
    var burger = document.getElementById('burger');
    var nav = document.querySelector('header nav');
    if (!mq.matches && identity) { identity.appendChild(trigger); return; }
    if (burger && burger.parentNode) { burger.parentNode.insertBefore(trigger, burger); return; }
    if (nav) nav.appendChild(trigger);
  }

  /* ── Construction ──────────────────────────────────────────────────── */

  function build() {
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dn-search-trigger';
    trigger.id = 'dnSearchTrigger';
    trigger.setAttribute('aria-label', 'Rechercher un produit');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'dnSearch');
    trigger.innerHTML = ICON_SEARCH;

    root = document.createElement('div');
    root.className = 'dn-search';
    root.id = 'dnSearch';
    root.hidden = true;
    root.innerHTML =
      '<div class="dn-search-backdrop" data-close></div>'
      + '<div class="dn-search-panel" role="dialog" aria-modal="true" aria-label="Rechercher un produit">'
      + '<form class="dn-search-form" role="search" action="/" autocomplete="off">'
      + '<span class="dn-search-icon">' + ICON_SEARCH + '</span>'
      + '<input id="dnSearchInput" class="dn-search-input" type="search" name="q"'
      + ' role="combobox" aria-expanded="false" aria-controls="dnSearchList" aria-autocomplete="list" aria-haspopup="listbox"'
      + ' aria-label="Rechercher un produit" placeholder="Rechercher un produit, une marque…"'
      + ' autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" inputmode="search">'
      + '<button type="button" class="dn-search-clear" aria-label="Effacer la recherche" hidden>' + ICON_CLOSE + '</button>'
      + '<button type="button" class="dn-search-close" aria-label="Fermer la recherche">Fermer</button>'
      + '</form>'
      + '<p class="dn-search-status" id="dnSearchStatus" aria-live="polite"></p>'
      + '<ul class="dn-search-list" id="dnSearchList" role="listbox" aria-label="Résultats de recherche"></ul>'
      + '<div class="dn-search-foot"></div>'
      + '</div>';

    document.body.appendChild(root);
    panel = root.querySelector('.dn-search-panel');
    form = root.querySelector('.dn-search-form');
    input = root.querySelector('.dn-search-input');
    clearBtn = root.querySelector('.dn-search-clear');
    closeBtn = root.querySelector('.dn-search-close');
    status = root.querySelector('.dn-search-status');
    list = root.querySelector('.dn-search-list');
    foot = root.querySelector('.dn-search-foot');

    placeTrigger();
    if (mq.addEventListener) mq.addEventListener('change', placeTrigger);
    else if (mq.addListener) mq.addListener(placeTrigger);

    trigger.addEventListener('click', open);
    // Préchargement discret dès l'intention (survol / toucher / focus) : le
    // premier résultat arrive alors sans délai perceptible.
    ['pointerenter', 'touchstart', 'focus'].forEach(function (ev) {
      trigger.addEventListener(ev, function () { loadIndex().catch(function () {}); }, { passive: true });
    });

    form.addEventListener('submit', function (e) { e.preventDefault(); });
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    panel.addEventListener('keydown', trapFocus);
    clearBtn.addEventListener('click', function () {
      input.value = ''; lastQuery = ''; results = []; expanded = false; shown = SUGGEST_LIMIT;
      render(); input.focus();
    });
    closeBtn.addEventListener('click', close);
    root.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) close();
    });
    foot.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.hasAttribute('data-all')) { expanded = true; shown = PAGE_STEP; }
      else if (btn.hasAttribute('data-more')) { shown += PAGE_STEP; }
      else return;
      var keepScroll = list.scrollTop;
      render();
      list.scrollTop = keepScroll;
      input.focus();
    });
    // Survol souris = option active (cohérent avec le clavier).
    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest('[role="option"]');
      if (!li) return;
      var opts = options();
      for (var i = 0; i < opts.length; i++) if (opts[i] === li && i !== activeIdx) { setActive(i); break; }
    });
    // Sur mobile, faire défiler les résultats replie le clavier pour libérer
    // l'écran ; le champ reste à portée d'un toucher en haut du panneau.
    list.addEventListener('touchstart', function () { if (document.activeElement === input) input.blur(); }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
