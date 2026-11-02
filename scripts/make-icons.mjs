// Icônes de l'application (PWA, écran d'accueil) : monogramme typographique « ET » d'Equestrian Tour, aux couleurs du
// jeu (fond encre #121316, lettres crème #f4f3ef, filet or #b8953a). L'icône du jeu n'est pas la marque Strides.
// Usage : node scripts/make-icons.mjs  →  public/icon.svg, public/icon-512.png, public/icon-192.png,
// public/apple-touch-icon.png (180 px).
//
// Lettres : contours des glyphes « E » et « T » de Geist (police d'affichage du jeu, SIL Open Font License 1.1,
// Vercel), graisse 600 — celle du titre de l'écran d'accueil —, unités de la fonte (1000 par em, capitales à 710),
// relevés une fois dans la fonte variable (instance wght = 600). Ce sont des polygones : aucune fonte n'est nécessaire
// pour afficher l'icône (favicon SVG compris). Approche du titre : -0,045 em.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const INK = '#121316';
const CREAM = '#f4f3ef';
const GOLD = '#b8953a';
const GLYPH = {
  E: { adv: 615, d: 'M80 0V710H558V596.8H210V411.8H546V300.2H210V113.2H566V0Z', x0: 80, x1: 566 },
  T: { adv: 584, d: 'M226.6 0V596.8H11.2V710H572.4V596.8H357V0Z', x0: 11.2, x1: 572.4 },
};
const CAP = 710;
const TRACK = -45;

function iconSvg(size = 512) {
  const S = 512;
  // Position de chaque lettre (unités de fonte) et étendue de l'encre.
  const tx = GLYPH.E.adv + TRACK;
  const inkL = GLYPH.E.x0;
  const inkR = tx + GLYPH.T.x1;
  const k = 300 / (inkR - inkL); // largeur de l'encre : 300 px sur 512
  const capPx = CAP * k;
  const gap = 30, bar = 10;
  const top = (S - (capPx + gap + bar)) / 2;
  const base = top + capPx;
  const left = S / 2 - ((inkL + inkR) / 2) * k;
  const f = (n) => Math.round(n * 100) / 100;
  const ks = k.toFixed(5);
  const letters = [
    `<path transform="translate(${f(left)} ${f(base)}) scale(${ks} -${ks})" d="${GLYPH.E.d}"/>`,
    `<path transform="translate(${f(left + tx * k)} ${f(base)}) scale(${ks} -${ks})" d="${GLYPH.T.d}"/>`,
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${size}" height="${size}">` +
    `<title>Equestrian Tour</title>` +
    `<rect width="${S}" height="${S}" rx="112" fill="${INK}"/>` +
    `<g fill="${CREAM}">${letters}</g>` +
    `<rect x="${f(left + inkL * k)}" y="${f(base + gap)}" width="${f((inkR - inkL) * k)}" height="${bar}" fill="${GOLD}"/>` +
    `</svg>`;
}

const svg = iconSvg();
writeFileSync('public/icon.svg', `${svg}\n`);
// PNG pleins (sans transparence) : iOS et Android appliquent leur propre masque d'icône.
for (const [size, name] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']]) {
  await sharp(Buffer.from(svg), { density: 72 * (size / 512) * 4 })
    .resize(size, size)
    .flatten({ background: INK })
    .png({ compressionLevel: 9 })
    .toFile(`public/${name}`);
}
console.log('icônes : public/icon.svg, icon-512.png, icon-192.png, apple-touch-icon.png');
