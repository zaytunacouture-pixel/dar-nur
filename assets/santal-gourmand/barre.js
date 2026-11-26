/* Téléphone et tablette. Barre d'achat (jusqu'à 860 px) : elle s'efface dès que le bloc d'achat final est bien à l'écran
   et reste effacée jusqu'au pied de page ; elle revient quand on remonte. Deux seuils (78 % et 94 % de la hauteur)
   évitent tout clignotement, y compris quand les barres de Safari se replient. Aucune écoute du défilement.
   js/fiche-editoriale.js garde son rôle (classe is-off) ; ce script n'ajoute que la classe is-fin et son style. */
(function () {
  /* Style des rubriques fermées (livraison, paiement) : ce script arrive une fois la page chargée. */
  function detail() {
    if (document.getElementById('feDetail')) return;
    var l = document.createElement('link');
    l.id = 'feDetail'; l.rel = 'stylesheet'; l.media = 'screen'; l.href = '/assets/santal-gourmand/detail.css';
    document.head.appendChild(l);
  }
  detail();
  var barre = document.getElementById('mbar'), achat = document.querySelector('.fe-final [data-add]');
  if (!barre || !achat || !('IntersectionObserver' in window)) return;
  /* sur ordinateur, la barre n'est pas affichée : les observateurs n'y ont aucun effet visible */
  var style = document.createElement('style');
  style.textContent = '@media(max-width:860px){.fe .mbar.is-fin{transform:translateY(110%);visibility:hidden;transition:transform .35s ease,visibility 0s .35s}.fe:has(.mbar.is-fin) .dn-cart-fab{bottom:20px!important}}';
  document.head.appendChild(style);
  /* Zone prolongée très haut : « intersecte » signifie que le haut du bouton est au-dessus de la ligne, ou déjà passé. */
  function ligne(bas, f) {
    new IntersectionObserver(function (e) { f(e[e.length - 1].isIntersecting); }, { rootMargin: '1000000px 0px -' + bas + '% 0px' }).observe(achat);
  }
  ligne(22, function (atteint) { if (atteint) barre.classList.add('is-fin'); });
  ligne(6, function (atteint) { if (!atteint) barre.classList.remove('is-fin'); });
})();
