/* En-tête compact sur ordinateur (dès 1240 px). La rangée du logo s'en va avec le défilement, sans saut :
   c'est la position collante de l'en-tête qui s'arrête à la navigation. Une fois la rangée sortie, le logo et
   la recherche reparaissent dans la barre. La hauteur de l'en-tête dans la page ne change jamais. */
(function () {
  var h = document.querySelector('header'), id = h && h.querySelector('.row-identity'), nav = h && h.querySelector('.row-nav');
  if (!id || !nav || !('IntersectionObserver' in window) || !('ResizeObserver' in window)) return;
  var large = matchMedia('(min-width:1240px)'), sorti = false, repere = document.createElement('i');
  repere.setAttribute('aria-hidden', 'true');
  repere.className = 'fe-repere';
  document.body.prepend(repere);
  function etat() {
    var c = sorti && large.matches;
    if (c === h.classList.contains('is-compact')) return;
    /* La nouvelle disposition se met en place avant d'être montrée (deux images, puis un fondu) : rien ne
       glisse à l'écran. Sauf si l'en-tête a le focus ou le pointeur : il reste alors visible. */
    if (!h.contains(document.activeElement) && !h.matches(':hover')) {
      h.classList.add('is-bascule');
      requestAnimationFrame(function () { requestAnimationFrame(function () { h.classList.remove('is-bascule'); }); });
    }
    h.classList.toggle('is-compact', c);
    h.classList.toggle('is-plein', !c);
  }
  /* Hauteurs réelles des deux rangées (zoom du navigateur, taille de police minimale). */
  var mesure = new ResizeObserver(function (l) {
    l.forEach(function (e) {
      var v = Math.round(e.borderBoxSize ? (e.borderBoxSize[0] || e.borderBoxSize).blockSize : e.target.offsetHeight);
      if (e.target === nav) h.style.setProperty('--barre', v + 'px');
      else if (!h.classList.contains('is-compact') && large.matches) document.documentElement.style.setProperty('--identite', v + 'px');
    });
  });
  mesure.observe(id);
  mesure.observe(nav);
  new IntersectionObserver(function (e) { sorti = !e[e.length - 1].isIntersecting; etat(); }).observe(repere);
  if (large.addEventListener) large.addEventListener('change', etat);
})();
