// Cartons et sous-titres du teaser (1920 × 1080, PNG), dessinés en HTML aux couleurs du design Strides (encre, crème,
// or) avec le logo officiel Strides (src/assets/partners/strides/strides-logo-full.png, inversé en crème sur fond sombre).
// Usage : node tests/e2e/teaser/graphics.mjs   → tests/e2e/out/teaser/graphics/*.png
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const OUT = join(HERE, '../out/teaser/graphics');
mkdirSync(OUT, { recursive: true });
const logo = `data:image/png;base64,${readFileSync(join(ROOT, 'src/assets/partners/strides/strides-logo-full.png')).toString('base64')}`;

// Sous-titres des plans : [fichier, surtitre, titre].
export const CAPTIONS = [
  ['cap-p1', 'Côte Fleurie · Normandie', 'Bienvenue à Deauville City'],
  ['cap-p2', 'Écurie du Val', 'Ton écurie, ta jument'],
  ['cap-p3', 'Plage de Deauville', 'Galope en monde ouvert'],
  ['cap-p4', 'Transport', 'Emmène tes chevaux en concours'],
  ['cap-p5', 'En route', 'Prends le volant'],
  ['cap-p6', 'Pôle International', 'Saute en concours'],
  ['cap-p6b', 'Paris Indoor', 'Vise le Grand Prix'],
  ['cap-p7', 'Application intégrée', 'Tes missions sur Strides'],
  ['cap-p8', 'Rythme de vie', 'La vie d’écurie, jour et nuit'],
];

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=block" rel="stylesheet">`;
const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; }
  body { font-family: Geist, Inter, 'Helvetica Neue', Arial, sans-serif; color: #fbfaf5; -webkit-font-smoothing: antialiased; }
  .mono { font-family: 'Geist Mono', 'DejaVu Sans Mono', monospace; }
`;

const page = (body, css, bg = 'transparent') => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}${css} body { background: ${bg}; }</style></head><body>${body}</body></html>`;

// Sous-titre en bas à gauche : filet doré, surtitre en capitales espacées, titre.
const caption = (kicker, title) => page(
  `<div class="cap"><div class="bar"></div><div class="k mono">${kicker}</div><div class="t">${title}</div></div>`,
  `.cap { position: absolute; left: 120px; bottom: 120px; max-width: 1300px; text-shadow: 0 2px 18px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.6); }
   .bar { width: 64px; height: 4px; background: #b8953a; margin-bottom: 22px; box-shadow: none; }
   .k { font-size: 26px; letter-spacing: .32em; text-transform: uppercase; color: #efeae0; opacity: .92; margin-bottom: 14px; }
   .t { font-size: 76px; font-weight: 600; letter-spacing: -.01em; line-height: 1.05; }`,
);

const intro = page(
  `<div class="c"><img src="${logo}"><div class="p mono">présente</div></div>`,
  `.c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; }
   img { width: 560px; filter: invert(1) brightness(.98) sepia(.08); }
   .p { font-size: 28px; letter-spacing: .5em; text-transform: uppercase; color: #c8c3b5; padding-left: .5em; }`,
  '#0f0f0e',
);

const end = page(
  `<div class="c">
     <div class="title"><span class="l">EQUESTRIAN</span> <span class="b">TOUR</span></div>
     <div class="bar"></div>
     <div class="tag mono">Le monde équestre en monde ouvert</div>
     <div class="with"><span>Avec l’application</span><img src="${logo}"><span>intégrée</span></div>
     <div class="play">Jouable dans le navigateur, sur iPhone comme sur ordinateur</div>
   </div>
   <div class="note mono">Images du jeu en cours de développement</div>`,
  `.c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
   .title { font-size: 150px; letter-spacing: .06em; line-height: 1; }
   .title .l { font-weight: 300; } .title .b { font-weight: 700; }
   .bar { width: 120px; height: 5px; background: #b8953a; margin: 46px 0 34px; }
   .tag { font-size: 30px; letter-spacing: .36em; text-transform: uppercase; color: #efeae0; padding-left: .36em; }
   .with { display: flex; align-items: center; gap: 22px; margin-top: 110px; font-size: 34px; color: #c8c3b5; }
   .with img { height: 54px; filter: invert(1) brightness(.98) sepia(.08); }
   .play { margin-top: 28px; font-size: 28px; color: #b5b0a2; letter-spacing: .02em; }
   .note { position: absolute; left: 0; right: 0; bottom: 54px; text-align: center; font-size: 18px; letter-spacing: .18em; text-transform: uppercase; color: #7d796f; }`,
  'radial-gradient(ellipse at 50% 42%, #23221f 0%, #0f0f0e 62%)',
);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const shot = async (html, name, transparent = false) => {
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(OUT, `${name}.png`), omitBackground: transparent });
};
await shot(intro, 'card-intro');
await shot(end, 'card-end');
for (const [name, k, t] of CAPTIONS) await shot(caption(k, t), name, true);
const font = await p.evaluate(() => document.fonts.check('600 40px Geist'));
console.log(`cartons et sous-titres → ${OUT} (police Geist ${font ? 'chargée' : 'indisponible : Inter'})`);
await b.close();
