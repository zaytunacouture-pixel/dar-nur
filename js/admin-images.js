// Optimisation des images envoyées depuis admin.html (produits, marques, offres).
// Chargé UNIQUEMENT par admin.html ; sans dépendance, tout se passe dans le
// navigateur, aucun service externe.
//
// Règles (lot B, 29/10/2026 — des PNG de 2 Mo étaient arrivés dans Storage parce
// que l'ancienne préparation renvoyait l'original en silence en cas d'échec) :
//   - côté le plus long ≤ 1600 px (cadre le plus grand du site), jamais d'agrandissement,
//     proportions conservées, orientation EXIF appliquée ;
//   - WebP à qualité dégressive 0,92 → 0,82 : la première qualité sous 400 Ko gagne,
//     jamais en dessous de 0,82 (les petits textes des étiquettes de parfums restent nets) ;
//   - transparence conservée (WebP la gère) ;
//   - navigateur incapable d'encoder le WebP (Safari ancien) : JPEG si l'image est opaque,
//     refus explicite si elle a de la transparence ;
//   - un JPEG/WebP déjà léger et à la bonne taille est gardé tel quel (pas de
//     recompression inutile) ; un PNG est toujours converti ;
//   - AUCUN repli silencieux : tout ce qui ne peut pas être optimisé sous 800 Ko est
//     refusé avec un message lisible (ImageRejectedError).

const IMAGE_MAX_SIDE = 1600;
const IMAGE_TARGET_BYTES = 400 * 1024;
const IMAGE_HARD_MAX_BYTES = 800 * 1024;
const IMAGE_MAX_INPUT_BYTES = 25 * 1024 * 1024;
const IMAGE_QUALITIES = [0.92, 0.9, 0.88, 0.86, 0.84, 0.82];
const IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

class ImageRejectedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageRejectedError';
  }
}

function imageExtensionFor(type) {
  return { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[type] || 'bin';
}

// Lecture du fichier en tenant compte de l'orientation EXIF. createImageBitmap
// d'abord ; <img> en secours pour les navigateurs qui refusent l'option.
async function decodeImageFile(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function sourceSize(source) {
  return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
}

// Réduction par paliers successifs (÷2 au plus à chaque étape) : une réduction
// directe de 4000 à 1600 px en une passe crénelle les textes fins.
function drawScaled(source, width, height) {
  let current = source;
  let { width: cw, height: ch } = sourceSize(source);
  while (cw / 2 > width && ch / 2 > height) {
    cw = Math.round(cw / 2);
    ch = Math.round(ch / 2);
    current = drawOnCanvas(current, cw, ch);
  }
  return drawOnCanvas(current, width, height);
}

function drawOnCanvas(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasHasTransparency(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Première qualité sous la cible, sinon la plus basse autorisée. Renvoie null si
// le navigateur ne produit pas le format demandé (il renverrait du PNG).
async function encodeWithQualities(canvas, type) {
  let last = null;
  for (const quality of IMAGE_QUALITIES) {
    const blob = await canvasToBlob(canvas, type, quality);
    if (!blob || blob.type !== type) return null;
    last = { blob, quality };
    if (blob.size <= IMAGE_TARGET_BYTES) break;
  }
  return last;
}

function formatKo(bytes) {
  return `${Math.round(bytes / 1024)} Ko`;
}

// Renvoie { file, info } ; lève ImageRejectedError avec un message destiné à l'admin.
async function optimizeImage(file) {
  const name = file?.name || 'image';
  if (!file || !IMAGE_ACCEPTED_TYPES.includes(file.type)) {
    const shown = file?.type ? file.type.replace('image/', '').toUpperCase() : 'inconnu';
    throw new ImageRejectedError(`${name} : format ${shown} non accepté (JPEG, PNG ou WebP uniquement)`);
  }
  if (file.size > IMAGE_MAX_INPUT_BYTES) {
    throw new ImageRejectedError(`${name} : fichier trop lourd (${formatKo(file.size)}, maximum 25 Mo)`);
  }

  let source;
  try {
    source = await decodeImageFile(file);
  } catch {
    throw new ImageRejectedError(`${name} : image illisible ou endommagée`);
  }
  const { width: sw, height: sh } = sourceSize(source);
  if (!sw || !sh) throw new ImageRejectedError(`${name} : image illisible ou endommagée`);

  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));
  const info = { from: { type: file.type, size: file.size, width: sw, height: sh }, width, height };

  // Déjà optimisée : JPEG/WebP léger, à la bonne taille. On ne recompresse pas.
  if (file.type !== 'image/png' && scale === 1 && file.size <= IMAGE_TARGET_BYTES) {
    source.close?.();
    return { file, info: { ...info, type: file.type, size: file.size, quality: null, kept: true } };
  }

  const canvas = drawScaled(source, width, height);
  source.close?.();
  const transparent = canvasHasTransparency(canvas);

  let result = await encodeWithQualities(canvas, 'image/webp');
  if (!result) {
    if (transparent) {
      throw new ImageRejectedError(
        `${name} : ce navigateur ne sait pas produire de WebP et l'image a de la transparence — ` +
        `réessayez avec Chrome ou Edge`,
      );
    }
    result = await encodeWithQualities(canvas, 'image/jpeg');
    if (!result) throw new ImageRejectedError(`${name} : ce navigateur ne sait pas convertir l'image`);
  }

  // Un original JPEG/WebP plus léger que le résultat et déjà à la bonne taille est préférable.
  if (file.type !== 'image/png' && scale === 1 && file.size <= result.blob.size && file.size <= IMAGE_HARD_MAX_BYTES) {
    return { file, info: { ...info, type: file.type, size: file.size, quality: null, kept: true } };
  }
  if (result.blob.size > IMAGE_HARD_MAX_BYTES) {
    throw new ImageRejectedError(
      `${name} : encore ${formatKo(result.blob.size)} après optimisation (maximum ${formatKo(IMAGE_HARD_MAX_BYTES)}) — ` +
      `image trop détaillée, utilisez une version plus simple ou plus petite`,
    );
  }

  const type = result.blob.type;
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  const optimized = new File([result.blob], `${base}.${imageExtensionFor(type)}`, { type });
  return {
    file: optimized,
    info: { ...info, type, size: optimized.size, quality: result.quality, transparent, kept: false },
  };
}
