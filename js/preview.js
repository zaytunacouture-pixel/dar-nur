// Aperçu administrateur d'un brouillon — Dar Nūr
//
// Chargé par index.html UNIQUEMENT quand la homepage est ouverte avec
// /?preview=<slug> (voir le crochet en fin de loadFromSupabase()). Un visiteur
// normal ne télécharge jamais ce fichier.
//
// Ce que ce script fait :
//   1. demande à Supabase la ligne `products` du slug, SANS filtre `active` ;
//   2. si une ligne revient, la convertit avec productFromRow() (le même mapping
//      que le catalogue public) et l'affiche avec showProduct() — donc avec le
//      vrai gabarit de fiche, sans aucune copie ;
//   3. neutralise toute commande (panier, demande de prix) et marque la page
//      noindex.
//
// Ce que ce script ne fait PAS, et ne doit jamais faire :
//   - vérifier lui-même qui est connecté. Le paramètre `preview` n'est pas un
//     secret et ce code n'est pas une barrière : la seule autorité est la
//     politique RLS `admin_only_products` (public.is_admin()) côté Postgres.
//     Sans session administrateur, Supabase renvoie zéro ligne et rien n'est
//     affiché — getSession() ne sert ici qu'à afficher un message clair sans
//     requête inutile ;
//   - insérer le brouillon dans PRODUCTS : il reste dans _previewProduct, hors
//     grille, collections, meilleures ventes, packs et recommandations ;
//   - écrire quoi que ce soit en base.
(function () {
  'use strict';

  var ADMIN_URL = '/admin.html';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById('dn-preview-style')) return;
    var st = document.createElement('style');
    st.id = 'dn-preview-style';
    st.textContent =
      '.dn-preview-banner{background:var(--green,#0d1f16);color:var(--cream,#f4efe4);border-bottom:2px solid var(--gold,#c8a84b);' +
      'font-family:Jost,sans-serif;font-size:.82rem;letter-spacing:.04em;line-height:1.45;padding:10px 16px;text-align:center}' +
      '.dn-preview-banner strong{color:var(--gold,#c8a84b);text-transform:uppercase;letter-spacing:.12em;font-weight:600}' +
      '.dn-preview-banner a{color:var(--gold-light,#dcc079);text-decoration:underline}' +
      '.dn-preview-banner.is-warn{background:#5a2d0c}';
    document.head.appendChild(st);
  }

  function banner(html, warn) {
    var old = document.querySelector('.dn-preview-banner');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'dn-preview-banner' + (warn ? ' is-warn' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = html;
    document.body.insertBefore(el, document.body.firstChild);
  }

  // La fiche affichée ne doit jamais être indexée ni se déclarer canonique :
  // updatePageMetadata() (appelée par showProduct) pose un canonical /{slug}/
  // qui n'existe pas pour un brouillon — on le remet sur la homepage.
  function markNoindex() {
    var meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'noindex, nofollow');
    var canonical = document.getElementById('canonicalLink');
    if (canonical) canonical.href = 'https://dar-nur.fr';
    if (document.title.indexOf('[Aperçu]') !== 0) document.title = '[Aperçu] ' + document.title;
  }

  // Bouton principal de la fiche (desktop) : bouton panier, lien « Demander le
  // prix » ou pastille « Disponible prochainement » selon le produit. La barre
  // mobile est neutralisée par updateMobileBar() (drapeau _preview), et
  // addActiveProductToCart() refuse de toute façon un produit _preview.
  function neutralizeOrdering() {
    var btn = document.getElementById('ppBtn');
    if (btn) {
      if (btn.tagName === 'A') {
        btn.removeAttribute('href');
        btn.removeAttribute('target');
        btn.addEventListener('click', function (e) { e.preventDefault(); });
      } else if (btn.tagName === 'BUTTON') {
        btn.disabled = true;
      }
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('btn-soon');
      btn.textContent = 'Aperçu — commande désactivée';
    }
    if (typeof updateMobileBar === 'function') updateMobileBar();
  }

  async function run(sb, slug) {
    injectStyles();
    markNoindex();
    slug = String(slug || '').trim();

    if (!sb || typeof productFromRow !== 'function' || typeof showProduct !== 'function') {
      banner('<strong>Aperçu indisponible</strong> — moteur ou SDK Supabase absent.', true);
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      banner('<strong>Aperçu</strong> — adresse de produit invalide.', true);
      return;
    }

    var sessionRes = await sb.auth.getSession();
    var session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
    if (!session) {
      banner('<strong>Aperçu réservé à l’administrateur</strong> — connectez-vous sur <a href="' + ADMIN_URL + '">l’administration</a>, puis rouvrez cette adresse.', true);
      return;
    }

    // Aucun filtre `active` : c'est la RLS qui décide. Admin → la ligne, quel
    // que soit son état ; tout autre compte → aucune ligne.
    var res = await sb.from('products').select('*, product_variants(*)').eq('slug', slug).maybeSingle();
    if (res.error || !res.data) {
      banner('<strong>Aperçu</strong> — aucun produit accessible pour « ' + esc(slug) + ' » : il n’existe pas, ou ce compte n’est pas administrateur. Aucune donnée n’a été renvoyée.', true);
      return;
    }

    var row = res.data;
    var product = productFromRow(row);
    product._preview = true;
    product.active = row.active === true;
    _previewProduct = product;

    showProduct(slug);
    neutralizeOrdering();
    markNoindex();

    var etat = product.active
      ? 'produit <strong>publié</strong> (active = true)'
      : '<strong>brouillon non publié</strong> (active = false) — invisible pour les clients';
    banner('<strong>Aperçu administrateur</strong> · ' + esc(product.name) + ' <code>' + esc(slug) + '</code> · ' + etat +
      ' · commande désactivée · <a href="' + ADMIN_URL + '">Modifier dans l’administration</a>');
    window.scrollTo(0, 0);
  }

  window.DarNurPreview = { run: run };
})();
