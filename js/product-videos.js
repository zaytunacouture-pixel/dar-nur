/* Vidéos officielles Maison Fragranza Paris — source unique.
   Lu par index.html (galerie des fiches, bloc « édition limitée »).
   Fichiers d'origine du Media Kit déposés sans modification sur le CDN de
   shop.dar-nur.fr, qui sert ses propres déclinaisons de lecture MP4. Rien n'est
   chargé avant le clic du visiteur (preload="none", aucune lecture automatique). */
(function () {
  'use strict';
  var CDN = 'https://cdn.shopify.com/videos/c/vp/';
  var IMG = '/assets/maison-fragranza/';

  function v(hash, id, title, poster) {
    var base = CDN + hash + '/' + hash;
    return {
      title: title,
      poster: poster,
      hd: base + '.HD-1080p-7.2Mbps-' + id + '.mp4',
      sd: base + '.HD-720p-4.5Mbps-' + id + '.mp4'
    };
  }

  window.DN_PRODUCT_VIDEOS = {
    'coeur-blanc': [v('abef4f8274a8444093aa326d27ea57ac', '102543292', 'Cœur Blanc, vidéo officielle', IMG + 'coeur-blanc-visuel-officiel.jpg')],
    'blvd-haussmann': [v('74209e700f6d4f87858f4784ddab81ce', '102543324', 'BLVD Haussmann, vidéo officielle', IMG + 'blvd-haussmann-visuel-officiel.jpg')],
    'santal-gourmand': [v('164a68fa0b584b8f8dabd6c348c2a410', '102543325', 'Santal Gourmand, vidéo officielle', IMG + 'santal-gourmand-visuel-officiel.jpg')],
    'rosa-vento': [v('4f2a230912474abe91cd4d28f842d629', '102543326', 'Rosa Vento, vidéo officielle', IMG + 'rosa-vento-visuel-officiel.jpg')],
    'fragamour': [v('287a00aac9764187adc22f3006df2956', '102543328', 'Fragamour, vidéo officielle', IMG + 'fragamour-visuel-officiel.jpg')],
    'charnel-absolu': [v('b77b009989344f2e89c39b1b2939aa48', '102543330', 'Charnel Absolu, les six matières', IMG + 'charnel-absolu-visuel-officiel.jpg')]
  };

  /* Bloc de mise en valeur d'une fiche : faits sourcés uniquement (catalogue
     2026 et site officiel), sans compte à rebours ni quantité restante. */
  window.DN_PRODUCT_FEATURES = {
    'charnel-absolu': {
      eyebrow: 'Édition limitée',
      title: 'Charnel Absolu, par Joshua Brown',
      lead: 'Un gourmand poudré construit sur le contraste.',
      text: 'Pour cette création, Maison Fragranza Paris a fait appel au nez parfumeur britannique Joshua Brown. Trois dialogues de matières en dessinent le caractère : la figue et le thé noir, l’iris et la tonka, la coco et le cacao.',
      facts: [
        ['Nez parfumeur', 'Joshua Brown'],
        ['Concentration', 'Extrait de parfum, 30 % selon le site officiel'],
        ['Univers', 'Gourmand et poudré'],
        ['Contenance', '100 ml']
      ],
      video: v('ba8cdb6905a2433ca35665ad0e8c05ce', '102543332', 'Charnel Absolu, le film officiel',
        'https://cdn.shopify.com/s/files/1/1057/6897/6732/files/preview_images/ba8cdb6905a2433ca35665ad0e8c05ce.thumbnail.0000000000.jpg?width=1280')
    }
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.dnVideoTag = function (vid) {
    return '<video controls playsinline preload="none" poster="' + esc(vid.poster) + '" aria-label="' + esc(vid.title) + '">'
      + '<source src="' + esc(vid.sd) + '" type="video/mp4" media="(max-width:767px)">'
      + '<source src="' + esc(vid.hd) + '" type="video/mp4"></video>';
  };

  /* Une seule vidéo à la fois sur la page. */
  document.addEventListener('play', function (e) {
    document.querySelectorAll('video').forEach(function (o) { if (o !== e.target) o.pause(); });
  }, true);
})();
