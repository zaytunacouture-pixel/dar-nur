/**
 * Préréglages d'images (étape 8B) : un cadre par USAGE, partagé par tous les composants qui
 * montrent la même chose. Deux appels identiques (même source, mêmes largeur / hauteur /
 * recadrage / format) produisent UN seul fichier au build : mutualiser les cadres évite de
 * réencoder la même photo sous des dimensions presque identiques.
 *
 * Largeurs = besoins réels (taille CSS maximale × DPR 2, raisonnablement 3 sur mobile), jamais
 * « au cas où ». Tous les cadres sont en AVIF + WebP (CatalogPicture) ; l'encodeur AVIF est
 * réglé dans astro.config.mjs (effort 3).
 */

export interface ImageFrame {
  /** Dimensions de sortie maximales (fixent aussi le ratio du recadrage). */
  width: number;
  height: number;
  widths: number[];
}

/**
 * Galerie de fiche : mobile 100vw (≤ 430 px CSS × DPR 2–3), tablette ≤ 560 px CSS,
 * desktop ≤ (hauteur d'écran − 140 px) × 0,8. Recadrage `inside` (image entière).
 */
export const GALLERY: ImageFrame = { width: 1200, height: 1500, widths: [480, 800, 1200] };

/** Carte produit 4:5 : ≤ 302 px CSS (desktop), 30vw (tablette), 46vw (mobile). */
export const PRODUCT_CARD: ImageFrame = { width: 600, height: 750, widths: [200, 400, 600] };

/**
 * Miniature 4:5 UNIQUE : rail de la galerie (64 px CSS), sélecteur de couleur (48 px),
 * recherche (48 px), LAB (96 px, page interne). Un seul jeu de fichiers par photo.
 */
export const THUMBNAIL: ImageFrame = { width: 128, height: 160, widths: [64, 128] };

/** Carte de collection 1:1 : 30vw (desktop), 46vw (mobile). */
export const COLLECTION_CARD: ImageFrame = { width: 600, height: 600, widths: [200, 400, 600] };

/** Carte d'univers 4:5 : 30vw dès la tablette, 120 px sur mobile. */
export const UNIVERSE_CARD: ImageFrame = { width: 820, height: 1025, widths: [240, 420, 820] };

/** Carte d'offre 4:3 : 40vw (desktop), 92vw (mobile). */
export const OFFER_CARD: ImageFrame = { width: 800, height: 600, widths: [400, 800] };

/** Hero 4:3 : 58vw (desktop), 100vw (mobile). */
export const HERO: ImageFrame = { width: 1600, height: 1200, widths: [390, 780, 960, 1280, 1600] };

/**
 * Ramène un cadre à la taille réelle d'une source plus petite, ratio conservé (étape 9).
 * Sans cela, une source de 1 100 px servie dans HERO produirait des fichiers « 1280w » et
 * « 1600w » identiques au 1100 (sharp n'agrandit pas) et un recadrage incertain.
 */
export function frameForSource(frame: ImageFrame, sourceWidth: number, sourceHeight: number): ImageFrame {
  const scale = Math.min(1, sourceWidth / frame.width, sourceHeight / frame.height);
  if (scale === 1) return frame;
  const width = Math.floor(frame.width * scale);
  const height = Math.round((width * frame.height) / frame.width);
  return { width, height, widths: [...frame.widths.filter((w) => w < width), width] };
}
