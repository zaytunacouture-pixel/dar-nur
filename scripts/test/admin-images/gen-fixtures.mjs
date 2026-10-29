// Génère les fichiers de test de js/admin-images.js (hors dépôt).
// node scripts/test/admin-images/gen-fixtures.mjs <dossier> [image-etiquette-reelle]
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// sharp vient des dépendances du site ; SHARP_SITE_DIR permet de pointer une autre copie installée.
const sharp = createRequire(path.join(process.env.SHARP_SITE_DIR || path.join(ROOT, 'site'), 'package.json'))('sharp');
const OUT = process.argv[2];
const REAL_LABEL = process.argv[3];
if (!OUT) throw new Error('usage : gen-fixtures.mjs <dossier> [image-etiquette-reelle]');
mkdirSync(OUT, { recursive: true });

// Étiquette synthétique : petits textes (9 à 16 px) sur fond crème, filets dorés.
const lignes = Array.from({ length: 22 }, (_, i) =>
  `<text x="40" y="${120 + i * 30}" font-family="Georgia" font-size="${9 + (i % 8)}" fill="#3a2a10">` +
  `Eau de parfum 100 ml — Oud, ambre, santal, vanille · lot ${1000 + i} · ${9 + (i % 8)} px</text>`).join('');
const etiquette = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <rect width="1200" height="800" fill="#f4ecd8"/><rect x="20" y="20" width="1160" height="760" fill="none" stroke="#b8902f" stroke-width="3"/>
  <text x="40" y="80" font-family="Georgia" font-size="44" fill="#7a5a12">KHAMRAH — DAR NŪR</text>${lignes}</svg>`;
await sharp(Buffer.from(etiquette)).png().toFile(path.join(OUT, 'etiquette-synthetique.png'));

// Logo avec transparence (fond entièrement transparent, bords adoucis).
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
  <circle cx="600" cy="600" r="420" fill="#1f4d3a" fill-opacity="0.92"/>
  <text x="600" y="640" text-anchor="middle" font-family="Georgia" font-size="120" fill="#e8c96a">Gulf</text></svg>`;
await sharp(Buffer.from(logo)).png().toFile(path.join(OUT, 'logo-transparent.png'));

// Photo de téléphone : 4000×3000, dégradés et détails, orientation EXIF 6 (à faire pivoter).
const photo = sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#8a6d3b' } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2d9a0"/><stop offset="1" stop-color="#5a3d1a"/></linearGradient></defs>
    <rect width="4000" height="3000" fill="url(#g)"/><rect x="0" y="0" width="1000" height="3000" fill="#c0392b"/>
    <text x="2000" y="1500" text-anchor="middle" font-size="260" font-family="Georgia" fill="#fff">HAUT</text></svg>`) }]);
await photo.jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toFile(path.join(OUT, 'photo-telephone-exif6.jpg'));

// Bruit aléatoire : impossible à compresser sous 800 Ko → doit être refusé.
const W = 2400, H = 2400;
await sharp(randomBytes(W * H * 3), { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(OUT, 'bruit-incompressible.png'));

// WebP déjà optimisé (≈ 100 Ko, 900×1200) : doit être gardé tel quel.
await sharp(path.join(OUT, 'etiquette-synthetique.png')).resize(900, 1200, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(OUT, 'deja-optimisee.webp'));

// Formats refusés et fichiers endommagés.
await sharp(Buffer.from(logo)).resize(200, 200).gif().toFile(path.join(OUT, 'anime.gif'));
writeFileSync(path.join(OUT, 'photo.heic'), randomBytes(4096));
writeFileSync(path.join(OUT, 'endommagee.jpg'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(20000)]));
writeFileSync(path.join(OUT, 'trop-lourde.jpg'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(26 * 1024 * 1024)]));

if (REAL_LABEL && existsSync(REAL_LABEL)) copyFileSync(REAL_LABEL, path.join(OUT, 'etiquette-reelle.png'));
console.log(`fixtures écrites dans ${OUT}`);
