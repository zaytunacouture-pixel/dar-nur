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
