// Crins : texture de mèches générée (atlas de 4 variantes), matériau double face à seuil alpha, reflets plus doux.
import * as THREE from 'three';
import { resolveCoat } from './coat.js';
import { mulberry32 } from '../../core/math.js';

let hairTex = null;

// Texture : fines mèches verticales (racine en haut, pointe en bas), luminance et opacité variables.
function makeHairTexture() {
  if (typeof document === 'undefined') {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const rnd = mulberry32(11);
  g.lineCap = 'round';
  for (let col = 0; col < 4; col++) {
    const x0 = col * 64;
    const n = 110 + col * 18;
    for (let i = 0; i < n; i++) {
      // Densité plus forte au centre de la carte : bords fondus (pas d'effet ruban).
      const r = (rnd() + rnd() + rnd()) / 3;
      const x = x0 + 3 + r * 58;
      const edge = 1 - Math.abs(r - 0.5) * 2;
      const end = H * (0.5 + rnd() * 0.5) * (0.7 + 0.3 * edge);
      const l = Math.floor(140 + rnd() * 115);
      const a = (0.55 + rnd() * 0.45) * (0.55 + 0.45 * edge);
      const w = 0.8 + rnd() * 1.6;
      const wav = (rnd() - 0.5) * 6, ph = rnd() * 6;
      g.strokeStyle = `rgba(${l},${l},${l},${a})`;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 16; y <= end; y += 16) g.lineTo(x + Math.sin(y / 90 + ph) * wav + (y / H) * (rnd() - 0.5) * 2, y);
      g.stroke();
    }
    // Bord de racine plus dense.
    const grd = g.createLinearGradient(0, 0, 0, 40);
    grd.addColorStop(0, 'rgba(200,200,200,0.9)');
    grd.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grd;
    g.fillRect(x0 + 6, 0, 52, 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

const mats = new Map();
export function hairMaterial(coat) {
  const key = typeof coat === 'object' && coat ? JSON.stringify(coat) : coat || 'bay';
  let m = mats.get(key);
  if (m) return m;
  if (!hairTex) hairTex = makeHairTexture();
  const C = resolveCoat(coat);
  const col = C.mane.clone();
  // Crins noirs : albédo réel ~0,02 (sinon un trou noir), reflets portés par la brillance.
  col.r = Math.max(col.r, 0.018);
  col.g = Math.max(col.g, 0.015);
  col.b = Math.max(col.b, 0.013);
  m = new THREE.MeshStandardMaterial({
    color: col,
    map: hairTex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.72,
    envMapIntensity: 0.35,
    metalness: 0,
    vertexColors: true,
  });
  // Couleur de sommet : variation de teinte par mèche (×1,5).
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.5;');
  };
  m.customProgramCacheKey = () => 'horse-hair-1';
  mats.set(key, m);
  return m;
}
