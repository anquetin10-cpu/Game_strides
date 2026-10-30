// Zone « Paris » du Grand Prix de Paris Indoor (hommage fictif à un grand concours en salle : aucun nom, logo ni
// identité visuelle réels). Arène couverte de 80 × 40 m sous une charpente métallique, tribunes pleines sur trois côtés,
// cube d'écrans géants au-dessus de la piste, rampes de projecteurs et faisceaux de spectacle ; dehors : paddock
// d'échauffement sous projecteurs, écuries provisoires sous tente, secrétariat, parking des camions, voie d'accès à
// l'autoroute et silhouettes de Paris au loin (immeubles, tour métallique).
// Les pièces fixes passent par les lots statiques du monde (tuiles masquées au-delà de 620 m : rien de Paris n'est
// dessiné depuis Deauville, et inversement). Les éléments animés (écrans, faisceaux, public) sont mis à jour par
// update(), seulement quand le joueur est à Paris.
import * as THREE from 'three';
import { PARIS, PARIS_FLOOR } from './sites.js';
import { t, T, LANG, num } from '../core/i18n.js';
import { box, cyl } from './shapes.js';
import { partsToGeo } from './builders.js';
import { barnGeo } from './barns.js';
import { BARN_LAYOUTS } from './sites.js';
import { signTexture } from './textures.js';
import { CLOUD_UNIFORMS } from './sky.js';
import { addIndoor } from './surfaces.js';

const A = PARIS.arena, HALL = PARIS.hall;
const hx = A.w / 2, hz = A.d / 2; // demi-dimensions de la piste
const HW = HALL.w / 2, HD = HALL.d / 2;

// Public des tribunes : rangées de spectateurs dessinées sur une texture (un seul maillage par tribune, quelques
// triangles), plus lumineuse que la salle pour rester lisible dans la pénombre du spectacle.
function crowdTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#16171b';
  ctx.fillRect(0, 0, 1024, 256);
  const tops = ['#f2f1ec', '#1f2b45', '#b8322a', '#2e2f33', '#d9c9a6', '#3a5a8c', '#7b2b3a', '#e3d36a', '#4b6f73', '#5d7a4a', '#c4c0b7'];
  const skins = ['#e6c2a2', '#d9a982', '#c18e68', '#8d5a3b', '#f0d1b8', '#a8724f'];
  const hairs = ['#2b1d14', '#4a3222', '#8a6a46', '#c9a46a', '#1b1b1b', '#9a9a96'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = 256 - (r + 0.5) * (256 / rows);
    for (let x = 4; x < 1024; x += 13 + rnd() * 3) {
      if (rnd() < 0.06) continue;
      const jx = x + (rnd() - 0.5) * 3;
      ctx.fillStyle = tops[Math.floor(rnd() * tops.length)];
      ctx.beginPath();
      ctx.ellipse(jx, y + 6, 6, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skins[Math.floor(rnd() * skins.length)];
      ctx.beginPath();
      ctx.arc(jx, y - 6, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hairs[Math.floor(rnd() * hairs.length)];
      ctx.beginPath();
      ctx.arc(jx, y - 8, 4.2, Math.PI, 0);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Panneaux publicitaires de la lice (marques fictives).
function boardTexture() {
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  const ads = [['STRIDES', '#15161a', '#f4f3ef'], ['PARIS INDOOR', '#b8322a', '#ffffff'], ['GRAND PRIX', '#f4f3ef', '#15161a'], ['STRIDES', '#f4f3ef', '#b8322a'], ['SELLERIE DU PORT', '#1f2b45', '#e2c98f'], ['PARIS INDOOR', '#15161a', '#ffffff'], ['CÔTE FLEURIE', '#2f6e4a', '#f4f3ef'], ['STRIDES', '#b8322a', '#ffffff']];
  const w = 2048 / ads.length;
  ads.forEach(([t, bg, fg], i) => {
    ctx.fillStyle = bg;
    ctx.fillRect(i * w, 0, w, 64);
    ctx.fillStyle = fg;
    ctx.font = '700 34px Inter, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, i * w + w / 2, 34);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export class ParisZone {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'paris';
    this.t = 0;
    this.show = 0; // intensité du spectacle (présentation, podium) : faisceaux, public
    this.screenInfo = null;
    this._scrT = 0;
  }

  // Construction (appelée par World.build, avant l'assemblage des lots).
  build(world) {
    const W = world;
    const y = PARIS.y;
    W.scene.add(this.group);
    const B = W.batch, Dt = W.detailBatch, L = W.lights, cols = W.colliders;
    const X = PARIS.x, Z = PARIS.z;
    // ---------- Sol ----------
    const b = PARIS.bounds;
    const gx = (b.x0 + b.x1) / 2, gz = (b.z0 + b.z1) / 2;
    // Enrobé (zone), sous la dalle de la salle et le parking ; trottoirs et marquages.
    B.add(box(b.x1 - b.x0 + 40, 0.6, b.z1 - b.z0 + 40), '#4f5052', gx, y - 0.6, gz, 0);
    B.add(box(HALL.w + 14, PARIS_FLOOR.parvis, HALL.d + 14), '#a9a49a', X, y, Z, 0); // parvis de la salle
    for (let k = -3; k <= 3; k++) Dt.addDetail(box(0.15, 0.03, 8, false), '#e9e7e0', PARIS.park.x + k * 4.5, y + 0.01, PARIS.park.z - 9, 0, 1);
    // Voie d'accès vers l'autoroute (à l'ouest) et sa ligne médiane.
    B.add(box(70, 0.06, 9), '#3b3c3e', PARIS.exit.x + 28, y, PARIS.exit.z, 0);
    for (let x = PARIS.exit.x; x < PARIS.park.x - 10; x += 6) Dt.addDetail(box(3, 0.02, 0.15, false), '#f2f1ec', x, y + 0.07, PARIS.exit.z, 0, 1);

    // ---------- Salle ----------
    const ty = y; // sol de la salle
    // Piste : sable fibré clair ; contour du sol de la salle (gaine noire).
    B.add(box(A.w, 0.06, A.d), '#cdb68f', X, ty + PARIS_FLOOR.sand - 0.06, Z, 0);
    B.add(box(HALL.w - 1, 0.06, HALL.d - 1), '#2a2b2f', X, ty + PARIS_FLOOR.hall - 0.06, Z, 0);
    // Murs (bardage sombre) : ouvertures de la porte des cavaliers (ouest) et des entrées du public (sud).
    const wallH = HALL.h;
    const wall = (x, z, w, d) => {
      B.add(box(w, wallH, d), '#25272b', x, ty, z, 0);
      cols.addBox(x, z, w / 2, d / 2, 0, Infinity, 'arena-wall');
    };
    const D = PARIS.door;
    const dz0 = D.z - Z - D.w / 2, dz1 = D.z - Z + D.w / 2;
    wall(X - HW, Z + (-HD + dz0) / 2, 0.6, dz0 + HD);
    wall(X - HW, Z + (dz1 + HD) / 2, 0.6, HD - dz1);
    B.add(box(0.6, wallH - 4.6, D.w), '#25272b', X - HW, ty + 4.6, D.z, 0); // linteau
    wall(X + HW, Z, 0.6, HALL.d);
    wall(X, Z - HD, HALL.w, 0.6);
    wall(X, Z + HD, HALL.w, 0.6);
    // Façades : soubassement vitré (hall du public), bardage à nervures verticales, bandeau lumineux en haut des
    // quatre côtés (allumé la nuit).
    for (const [cx, cz, len, rot] of [[X, Z + HD, HALL.w, 0], [X, Z - HD, HALL.w, Math.PI], [X + HW, Z, HALL.d, Math.PI / 2], [X - HW, Z, HALL.d, -Math.PI / 2]]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const out = 0.36;
      L.add(box(len - 2, 0.45, 0.1), '#fff1d0', cx + s * out, ty + 17.8, cz + c * out, rot);
      Dt.addDetail(box(len - 2, 0.3, 0.2), '#3a3d42', cx + s * (out - 0.05), ty + 17.2, cz + c * (out - 0.05), rot, 1);
      for (let u = -len / 2 + 4; u < len / 2 - 2; u += 6) {
        const px = cx + c * u + s * 0.42, pz = cz - s * u + c * 0.42;
        B.add(box(0.5, wallH - 4.2, 0.25), '#34373c', px, ty + 4.2, pz, rot);
      }
      if (rot === 0) {
        // Hall vitré du public au sud, au rez-de-chaussée.
        W.glass.add(box(len - 30, 3.6, 0.1), '#9fb3c2', cx + s * 0.4, ty + 0.3, cz + c * 0.4, rot);
        L.add(box(len - 30, 0.12, 0.1), '#ffe7bf', cx + s * 0.5, ty + 3.95, cz + c * 0.5, rot);
      }
    }
    B.add(box(28, 0.4, 5), '#1b1c1f', X, ty + 4.2, Z + HD + 2.6, 0);
    // Enseignes rétroéclairées (lisibles de nuit).
    for (const [tex, w, x, yy, z, rot] of [
      [signTexture('GRAND PRIX DE PARIS INDOOR', 'CSI 5* · SPRINT · GRAND PRIX', { dark: true, w: 1024, h: 160 }), 34, X, ty + 10.5, Z + HD + 0.32, 0],
      [signTexture('GRAND PRIX DE PARIS INDOOR', t('PADDOCK · ENTRÉE DES CAVALIERS'), { dark: true, w: 1024, h: 160 }), 22, X - HW - 0.32, ty + 9.5, Z - 6, -Math.PI / 2],
    ]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 160) / 1024), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: '#d8d8d8' }));
      m.position.set(x + Math.sin(rot) * 0.05, yy, z + Math.cos(rot) * 0.05);
      m.rotation.y = rot;
      this.group.add(m);
      B.add(box(w + 0.3, (w * 160) / 1024 + 0.3, 0.2, false), '#15161a', x, yy, z, rot);
    }
    // Toit : couverture, fermes métalliques, coursives techniques.
    B.add(box(HALL.w + 1, 0.5, HALL.d + 1), '#1b1c20', X, ty + wallH, Z, 0);
    for (let x = -HW + 6; x < HW; x += 12) {
      B.add(box(0.5, 1.6, HALL.d - 1), '#3a3d42', X + x, ty + wallH - 1.6, Z, 0);
      Dt.addDetail(box(0.12, 0.12, HALL.d - 1, false), '#4a4d52', X + x, ty + wallH - 2.4, Z, 0, 1);
    }
    for (let z = -HD + 8; z < HD; z += 16) B.add(box(HALL.w - 1, 0.6, 0.3), '#3a3d42', X, ty + wallH - 2.2, Z + z, 0);
    // Rampes d'éclairage au-dessus de la piste (allumées en permanence en salle).
    const lampMat = new THREE.MeshBasicMaterial({ color: '#fff4dc' });
    const lampParts = [];
    for (let x = -hx + 6; x <= hx - 6; x += 11) for (const z of [-hz + 6, 0, hz - 6]) lampParts.push([box(3.2, 0.12, 0.7, false), '#ffffff', { x, y: wallH - 3.2, z }]);
    const lamps = new THREE.Mesh(partsToGeo(lampParts), lampMat);
    lamps.position.set(X, ty, Z);
    this.group.add(lamps);
    // Plafond pour la caméra et éclairage intérieur (lumière du ciel réduite sous le toit).
    cols.addCeiling({ x: X, z: Z, rot: 0, y: ty, hw: HW - 0.5, hd: HD - 0.5, h: wallH - 2.6 });
    addIndoor({ x: X, z: Z, rot: 0, y: ty, hw: HW - 0.5, hd: HD - 0.5, h: wallH - 1 });
    // Projecteurs de salle : la piste et ses abords toujours éclairés (voir csFlood).
    this.floodSlot = this._flood(A.x, A.z, A.w + 24, A.d + 20);

    // ---------- Lice et panneaux ----------
    const boardTex = boardTexture();
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveMap: boardTex, emissiveIntensity: 0.25 });
    const boards = [];
    const gate = PARIS.gate;
    const gz0 = gate.z - Z - 2.8, gz1 = gate.z - Z + 2.8;
    // Planche blanche (lot statique, collision) et face imprimée côté piste, 7 cm devant.
    const seg = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.1) return;
      const rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      let nx = Math.sin(rot), nz = Math.cos(rot);
      if (nx * -mx + nz * -mz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const g = new THREE.PlaneGeometry(len, 0.9);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 40));
      g.rotateY(Math.atan2(nx, nz));
      g.translate(mx + nx * 0.07, 0.55, mz + nz * 0.07);
      boards.push(g);
      B.add(box(len, 1.05, 0.12), '#f2f1ec', X + mx, ty, Z + mz, rot);
      cols.addBox(X + mx, Z + mz, len / 2, 0.1, rot, ty + 1.3, 'arena-boards');
    };
    seg(-hx, -hz, hx, -hz);
    seg(hx, hz, -hx, hz);
    seg(hx, -hz, hx, hz);
    seg(-hx, hz, -hx, gz1);
    seg(-hx, gz0, -hx, -hz);
    const bm = new THREE.Mesh(mergeFlat(boards), boardMat);
    bm.position.set(X, ty, Z);
    this.group.add(bm);

    // ---------- Tribunes ----------
    const crowd = crowdTexture();
    this.crowdMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9, emissive: new THREE.Color('#ffffff'), emissiveMap: crowd, emissiveIntensity: 0.32 });
    const stand = (cx, cz, len, depth, rot) => {
      // Gradins : marches de 0,85 m pour 0,5 m de haut, du bord de piste (2 m de passage) au mur.
      const rows = Math.floor(depth / 0.85);
      const parts = [];
      for (let i = 0; i < rows; i++) parts.push([box(len, 1.4 + i * 0.5, 0.85), i % 2 ? '#2e3036' : '#34363c', { z: -depth / 2 + 0.425 + i * 0.85 }]);
      parts.push([box(len, 1.1, 0.06), '#9fb2bb', { y: 1.4, z: -depth / 2 + 0.02 }]);
      B.add(partsToGeo(parts), null, cx, ty, cz, rot);
      cols.addBox(cx, cz, len / 2, depth / 2, rot, Infinity, 'stands');
      // Public : plan incliné posé sur les gradins (texture retournée : la tête des spectateurs vers le haut).
      const slope = Math.atan2(rows * 0.5, rows * 0.85);
      const g = new THREE.PlaneGeometry(len, Math.hypot(rows * 0.5, rows * 0.85));
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 26), (1 - uv.getY(i)) * (rows / 8));
      g.rotateX(-(Math.PI / 2 + slope));
      g.translate(0, 1.5 + rows * 0.25, 0);
      g.rotateY(rot);
      g.translate(cx, ty, cz);
      this.group.add(new THREE.Mesh(g, this.crowdMat));
    };
    const sd = HD - hz - 2.6; // profondeur des tribunes nord et sud
    stand(X + 4, Z - hz - 2 - sd / 2, A.w - 6, sd, Math.PI);
    stand(X + 4, Z + hz + 2 + sd / 2, A.w - 6, sd, 0);
    const ed = HW - hx - 2.6;
    stand(X + hx + 2 + ed / 2, Z, A.d + 2, ed, Math.PI / 2);

    // ---------- Écrans géants ----------
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 512;
    this.screenCanvas.height = 288;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const scrMat = new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false });
    const cube = new THREE.Group();
    const sw = 9.6, sh = 5.4;
    for (let k = 0; k < 4; k++) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(k % 2 ? sw * 0.6 : sw, sh), scrMat);
      const a = (k * Math.PI) / 2;
      const r = k % 2 ? sw / 2 : (sw * 0.6) / 2;
      face.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      face.rotation.y = a;
      cube.add(face);
    }
    const frame = new THREE.Mesh(partsToGeo([[box(sw + 0.3, 0.3, sw * 0.6 + 0.3), '#15161a', { y: sh / 2 }], [box(sw + 0.3, 0.3, sw * 0.6 + 0.3), '#15161a', { y: -sh / 2 - 0.3 }], [box(0.1, wallH, 0.1), '#2b2c30', { y: sh / 2 + 0.3 }]]), new THREE.MeshStandardMaterial({ vertexColors: true }));
    cube.add(frame);
    cube.position.set(X, ty + 13.5, Z);
    this.group.add(cube);
    // Écran mural au-dessus de la porte des cavaliers.
    const wallScr = new THREE.Mesh(new THREE.PlaneGeometry(12, 6.75), scrMat);
    wallScr.position.set(X - HW + 0.4, ty + 11, Z - 4);
    wallScr.rotation.y = Math.PI / 2;
    this.group.add(wallScr);

    // ---------- Faisceaux de spectacle ----------
    const beamGeo = new THREE.ConeGeometry(2.6, wallH - 3, 18, 1, true);
    beamGeo.translate(0, -(wallH - 3) / 2, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#fff3dc', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.beams = [];
    for (let k = 0; k < 8; k++) {
      const m = new THREE.Mesh(beamGeo, this.beamMat);
      const bx = -hx + 8 + (k % 4) * ((A.w - 16) / 3), bz = k < 4 ? -hz + 3 : hz - 3;
      m.position.set(X + bx, ty + wallH - 2.6, Z + bz);
      m.userData.ph = k * 0.9;
      m.userData.side = k < 4 ? 1 : -1;
      this.beams.push(m);
      this.group.add(m);
    }

    // ---------- Paddock d'échauffement ----------
    const wu = PARIS.warmup;
    B.add(box(wu.w, 0.06, wu.d), '#c0a881', wu.x, y + PARIS_FLOOR.warm - 0.06, wu.z, 0);
    const gapPos = (PARIS.door.z - (wu.z - wu.d / 2)) / wu.d;
    W.rectFence(wu, { height: 1.0, board: true, color: '#f2f1ec' }, 'e', 6, Math.min(0.85, Math.max(0.15, gapPos)));
    W.floodlights(wu, 12);
    // Allée du paddock jusqu'à la porte des cavaliers (tapis caoutchouc).
    B.add(box(PARIS.door.x - (wu.x + wu.w / 2), 0.05, 5), '#38393c', (PARIS.door.x + wu.x + wu.w / 2) / 2, y + 0.02, PARIS.door.z, 0);

    // ---------- Écuries provisoires sous tente ----------
    const S = PARIS.stables;
    W.placeBarn(barnGeo({ w: S.d, d: S.w, aisle: 4.2, h: 3.6, cols: BARN_LAYOUTS.pole.slice(0, 12), windowsP: 'high', endDoors: [true, true], over: 0.3, style: { kind: 'tent', wall: '#eeeeea', trim: '#d8d6cf', roof: '#f4f4f0', slide: '#e2e1dc', wood: '#9ca1a6', steel: '#7d8287', lining: '#d8d6cf', truss: '#9ca1a6', aisle: '#c9b68b' } }), S.x, S.z, -Math.PI / 2, S.d, S.w);

    // ---------- Parking, éclairage, panneaux ----------
    for (const [lx, lz] of [[-176, -4], [-176, 18], [-150, -12], [-150, 24], [-124, -4], [-124, 18], [-60, 44], [-20, 44], [20, 44]]) W.lamp(X + lx, Z + lz, Math.PI / 2);
    W.signboard('PARIS', t('Grand Prix de Paris Indoor · Paddock · Écuries'), PARIS.park.x + 14, PARIS.park.z + 15, 0, { w: 5.6 });
    W.signboard('A13 · DEAUVILLE CITY', t('Autoroute de Normandie · 200 km'), PARIS.exit.x + 6, PARIS.exit.z - 7, Math.PI / 2, { w: 5.6 });
    // Côté Deauville : bretelle de l'autoroute au bout de la route Est-Ouest.
    W.signboard('A13 · PARIS', t('Autoroute de Normandie · 200 km'), 540, -110, -Math.PI / 2, { w: 5.2 });

    // ---------- Paris au loin ----------
    this._skyline(W, y);
  }

  // Rectangle éclairé par projecteurs (csFlood) : un emplacement de plus que ceux du monde.
  _flood(x, z, w, d) {
    const n = (CLOUD_UNIFORMS._flN ||= 0);
    if (n < CLOUD_UNIFORMS.flRect.value.length) CLOUD_UNIFORMS.flRect.value[n].set(x, z, w / 2, d / 2);
    CLOUD_UNIFORMS._flN = n + 1;
    return n;
  }

  // Immeubles parisiens (blocs de pierre claire, toits de zinc, fenêtres éclairées la nuit) et tour métallique : une
  // couronne à 200–330 m, hors des limites jouables.
  _skyline(W, y) {
    const B = W.batch, L = W.lights;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const X = PARIS.x - 70, Z = PARIS.z;
    for (let a = 0; a < Math.PI * 2; a += 0.05 + rnd() * 0.04) {
      const r = 230 + rnd() * 90;
      const x = X + Math.cos(a) * r * 1.15, z = Z + Math.sin(a) * r;
      const w = 18 + rnd() * 22, d = 12 + rnd() * 10, h = 18 + rnd() * 12;
      const rot = -a;
      B.add(box(w, h, d), rnd() < 0.7 ? '#cbc3b4' : '#b9b2a4', x, y, z, rot);
      B.add(box(w + 0.6, 3.2, d + 0.6), '#5d6670', x, y + h, z, rot); // toit de zinc (mansarde)
      // Rangées de fenêtres : bandes éclairées (allumées la nuit avec les lanternes).
      for (let f = 1; f <= 5; f++) if (rnd() < 0.7) L.add(box(w * 0.82, 0.55, d + 0.1, false), '#ffe3b0', x, y + f * 3.3 + 1.2, z, rot);
    }
    // Tour métallique (silhouette de treillis : quatre arêtiers, plateformes, flèche), au nord-ouest.
    const tx = PARIS.x - 420, tz = PARIS.z - 330;
    const parts = [];
    const H = 300;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let k = 0; k < 10; k++) {
        const y0 = (k / 10) * H * 0.6, y1 = ((k + 1) / 10) * H * 0.6;
        const w0 = 62 * Math.pow(1 - y0 / (H * 0.95), 1.6), w1 = 62 * Math.pow(1 - y1 / (H * 0.95), 1.6);
        const x0 = (sx * w0) / 2, z0 = (sz * w0) / 2, x1 = (sx * w1) / 2, z1 = (sz * w1) / 2;
        const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        const g = box(2.4, len, 2.4);
        g.translate(0, -len / 2, 0);
        const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
        g.translate(x1, y1, z1);
        parts.push([g, '#6b4f3a']);
      }
    }
    const shaft = cyl(2.2, 8, H * 0.4, 6);
    shaft.translate(0, H * 0.58, 0);
    parts.push([shaft, '#6b4f3a']);
    for (const [hh, ww] of [[57, 46], [115, 26], [H * 0.9, 9]]) parts.push([box(ww, 2.5, ww), '#5a4230', { y: hh }]);
    parts.push([cyl(0.6, 1.2, 26, 6), '#6b4f3a', { y: H * 0.95 }]);
    B.add(partsToGeo(parts), null, tx, y, tz, 0.4);
    // Illumination dorée la nuit.
    for (const [hh, ww] of [[58, 46], [116, 26], [H * 0.9 + 1, 9]]) L.add(box(ww + 0.4, 0.6, ww + 0.4, false), '#ffcf7a', tx, y + hh + 1.2, tz, 0.4);
    this.tower = { x: tx, z: tz };
  }

  // Animations (seulement à Paris) : écrans, faisceaux, public. info : { title, line1, line2, clock, pen, show }.
  update(dt, game) {
    this.t += dt;
    this.show += ((this.showTarget || 0) - this.show) * Math.min(1, dt * 2);
    const k = this.show;
    for (const m of this.beams) {
      const p = this.t * 0.6 + m.userData.ph;
      m.rotation.x = Math.sin(p) * 0.35 * m.userData.side;
      m.rotation.z = Math.cos(p * 0.8) * 0.4;
    }
    this.beamMat.opacity = 0.035 + k * 0.08;
    this.beamMat.color.set(k > 0.6 && Math.sin(this.t * 2) > 0.3 ? '#ff4a3a' : '#fff3dc');
    this.crowdMat.emissiveIntensity = 0.28 + k * 0.12 + (this.cheer > 0 ? Math.abs(Math.sin(this.t * 9)) * 0.08 : 0);
    if (this.cheer > 0) this.cheer -= dt;
    this._scrT -= dt;
    if (this._scrT <= 0) {
      this._scrT = 0.25;
      this._drawScreen(game);
    }
  }

  _drawScreen(game) {
    const c = this.screenCanvas.getContext('2d');
    const W = 512, H = 288;
    c.fillStyle = '#0b0c0f';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#b8322a';
    c.fillRect(0, 0, W, 8);
    c.fillRect(0, H - 8, W, 8);
    c.textAlign = 'center';
    c.fillStyle = '#f4f3ef';
    const info = this.screenInfo || {};
    const hud = game.course?.hud?.();
    c.font = '700 22px Inter, Helvetica, Arial, sans-serif';
    c.fillText(info.title || 'GRAND PRIX DE PARIS INDOOR', W / 2, 44);
    c.font = '600 30px Inter, Helvetica, Arial, sans-serif';
    c.fillText(info.line1 || 'CSI 5* · PARIS', W / 2, 104);
    c.font = '500 22px Inter, Helvetica, Arial, sans-serif';
    c.fillStyle = '#c9c6bd';
    c.fillText(info.line2 || '', W / 2, 140);
    if (hud) {
      c.font = '700 64px Inter, Helvetica, Arial, sans-serif';
      c.fillStyle = hud.over ? '#ff5a4a' : '#f4f3ef';
      c.fillText(hud.started ? num(hud.t, 2) : `${Math.max(0, Math.ceil(hud.bell))}`, W / 2 - 60, 228);
      c.font = '700 40px Inter, Helvetica, Arial, sans-serif';
      c.fillStyle = hud.pen ? '#ff5a4a' : '#5ad18a';
      c.fillText(hud.pen > 1 || (LANG !== 'fr' && hud.pen === 0) ? T`${hud.pen} pts` : T`${hud.pen} pt`, W / 2 + 150, 222);
    } else if (info.big) {
      c.font = '700 48px Inter, Helvetica, Arial, sans-serif';
      c.fillStyle = '#f4f3ef';
      c.fillText(info.big, W / 2, 222);
    }
    this.screenTex.needsUpdate = true;
  }
}

// Fusion de géométries sans index (positions, normales, UV).
function mergeFlat(list) {
  const P = [], N = [], U = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    P.push(...g.attributes.position.array);
    N.push(...g.attributes.normal.array);
    U.push(...g.attributes.uv.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}
