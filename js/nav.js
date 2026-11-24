// nav.js — comportement commun du burger de navigation (ouverture/fermeture).
// Extraction fidèle du one-liner déjà identique sur les 15 pages catégories
// + 2 gabarits parfums (vérifié caractère pour caractère avant extraction).
// Aucun comportement nouveau (pas de clic extérieur, pas d'Escape, pas de
// synchronisation aria-expanded — aucun des trois n'existe dans le code
// d'origine, les ajouter serait une harmonisation UX, pas une extraction).
// index.html (homepage) garde sa propre logique (overlay, clic extérieur,
// vues SPA) dans son script inline — voir N5 dans le plan de chantier.
document.getElementById('burger').addEventListener('click', () => {
  document.getElementById('navLinks').classList.toggle('open');
});

/* Fiches éditoriales : pages statiques sans moteur SPA. Depuis l'accueil ou une
   autre fiche, on les ouvre par leur vraie URL au lieu de les redessiner.
   Liste contrôlée par scripts/lib/fiche-editoriale.mjs (= fiches/_data/). */
(function () {
  var FICHES_EDITORIALES = ['coeur-blanc'];
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.showProduct !== 'function') return;
    var original = window.showProduct;
    window.showProduct = function (id) {
      /* Déjà sur l'URL : rendu standard de repli, on ne recharge pas en boucle. */
      if (FICHES_EDITORIALES.indexOf(id) >= 0 && location.pathname !== '/' + id + '/') { location.href = '/' + id + '/'; return; }
      return original.apply(this, arguments);
    };
  });
})();
