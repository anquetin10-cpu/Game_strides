// Cheval WildMesh de Jumping League Sim (modèle, squelette de 419 os, clips d'allures, de virages, de saut et
// d'arrêt, sellerie anglaise ; voir pjl/asset.js et pjl/view.js, repris du dépôt PGL_Game- au commit afa56f9c)
// affiché à la place du cheval procédural du jeu, qui reste la simulation : il continue d'avancer, de sauter, de
// porter le cavalier et d'émettre les pas (sons, empreintes) ; il est seulement masqué (calque 31, comme pour le
// cheval Tripo). Les deux jeux restent distincts : rien n'est échangé entre leurs sauvegardes.
//
// Synchronisation (même principe que la source, où la vue lit la phase de foulée de la simulation) :
//  - allure, main au galop, virage et vitesse viennent du cheval du jeu (horse.anim._a : allure et main choisies par
//    la locomotion procédurale ; horse.lastTurn ; horse.speed) ;
//  - la phase de foulée de la vue avance de vitesse / longueur de foulée du clip (sabots sans glissement, cadence
//    bornée), puis est réécrite dans horse.anim.phase, décalée pour que les posers du cheval du jeu (sons, empreintes,
//    trot enlevé du cavalier) tombent sur ceux des clips : décalage mesuré sur les sabots de chaque clip
//    (asset.gaitContacts) et comparé aux instants de poser des allures du jeu (GAIT_OFFSETS) ;
//  - saut : la durée du vol du jeu (de l'appel à la réception) est répartie sur le clip de saut, du départ des
//    postérieurs (un peu avant leur décollage) à la réception des antérieurs ; la hauteur suit la parabole du jeu
//    (bassin du clip compensé, comme dans la source) ; après la réception, le clip continue sur la foulée de
//    réception puis rend la main aux allures ;
//  - refus (freinage puis cabrer du jeu) : clip d'arrêt glissé de la source.
// Cavalier (apparence d'Equestrian Tour inchangée) : l'os « saddle » du cheval du jeu, auquel le cavalier est attaché
// et sur lequel sont exprimées la montée et la descente (gameplay/horseMount.js), est placé chaque image au point
// d'assise de la selle WildMesh (position, tangage du dos, inclinaison) ; ses étriers sont recalés sur la selle
// WildMesh (horse.riderFit) ; rênes du mors WildMesh aux poings du cavalier ; étrivières des portes-étrivières WildMesh
// aux étriers, que le pied du cavalier tient (Horse._stirrupsFollow) ; longe au mors.
import * as THREE from 'three';
import { HorseView, COM_CANTER_HEIGHT } from './pjl/view.js';
import { GAIT_OFFSETS } from './horse/anim.js';
import { refreshHorseTack } from './horse/mesh.js';
import { RIDER_FIT } from './human.js';
import { clamp, damp, smoothstep } from '../core/math.js';

const wrap01 = (u) => u - Math.floor(u);
// Écart circulaire moyen (0..1) entre deux séries de phases, et résidu (0 = calage parfait).
function circularOffset(a, b) {
  let sx = 0, sy = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] - b[i]) * Math.PI * 2;
    sx += Math.cos(d);
    sy += Math.sin(d);
  }
  const off = wrap01(Math.atan2(sy, sx) / (Math.PI * 2));
  let res = 0;
  for (let i = 0; i < a.length; i++) {
    let d = wrap01(a[i] - b[i] - off);
    if (d > 0.5) d -= 1;
    res += Math.abs(d);
  }
  return { off, res: res / a.length };
}

// Robes du jeu → robes de la source (les autres teintes : baie).
const COATS = new Set(['bay', 'darkbay', 'brown', 'chestnut', 'liverchestnut', 'grey', 'dapplegrey', 'black', 'palomino']);
export function coatOf(def = {}) {
  const colour = typeof def.coat === 'string' && COATS.has(def.coat) ? def.coat : 'bay';
  const blaze = typeof def.blaze === 'string' ? def.blaze : def.blaze ? 'blaze' : 'none';
  // Balzanes du jeu (vrai/faux par membre, AG, AD, PG, PD) : balzane moyenne (38 % de la hauteur du canon).
  const socks = (def.socks || [0, 0, 0, 0]).map((s) => (s === true ? 0.38 : typeof s === 'number' ? s : 0));
  return { colour, blaze, socks, dapples: colour === 'dapplegrey' ? 0.6 : 0 };
}

// Longueur de foulée des clips (m, source : gaitInfo) et cadence bornée (Hz) : au-delà, la foulée s'allonge (léger
// glissement des sabots plutôt qu'une cadence irréaliste).
const CADENCE = { walk: [0.55, 1.15], trot: [1.1, 1.75], canter: [1.3, 2.6] };
// Départ du clip de saut avant le décollage des postérieurs (s) : poussée visible des postérieurs à l'appel.
const PUSH = 0.12;
// Hors de ce rayon (m) : étrivières, rênes simplifiées masquées (moins d'un pixel), comme le filet procédural au loin.
const DETAIL_DIST = 30;
// Marge supplémentaire sur l’enveloppe maximale du tronc déjà échantillonnée aux deux mains.
// Ne pas cumuler une seconde marge de roulis : elle écarterait artificiellement les mollets.
const LEG_CLEAR = 0.025;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3();
const _hl = new THREE.Vector3(), _hr = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

// Lanière (rêne, étrivière) : ruban de N segments, recalculé chaque image entre deux points (flèche `sag`).
class Strap {
  constructor(n, width, material) {
    this.n = n;
    this.w = width;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.matrixAutoUpdate = false;
  }
  // De a à b (monde), flèche sag (m, vers le bas), largeur orientée selon `side` (vecteur monde).
  set(a, b, sag, side) {
    const P = this.geo.attributes.position.array;
    for (let i = 0; i <= this.n; i++) {
      const t = i / this.n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * sag;
      P[i * 6] = x - side.x * this.w;
      P[i * 6 + 1] = y - side.y * this.w;
      P[i * 6 + 2] = z - side.z * this.w;
      P[i * 6 + 3] = x + side.x * this.w;
      P[i * 6 + 4] = y + side.y * this.w;
      P[i * 6 + 5] = z + side.z * this.w;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}

// Étrier (arceau + plancher), petit maillage partagé.
let ironGeo = null;
function ironGeometry() {
  if (ironGeo) return ironGeo;
  const arch = new THREE.TorusGeometry(0.058, 0.0075, 6, 14, Math.PI);
  arch.rotateY(Math.PI / 2);
  const tread = new THREE.BoxGeometry(0.03, 0.012, 0.11);
  const parts = [arch, tread];
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    for (const i of p.index.array) idx.push(i + o);
    o += p.attributes.position.count;
  }
  ironGeo = new THREE.BufferGeometry();
  ironGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ironGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  ironGeo.setIndex(idx);
  for (const p of parts) p.dispose();
  return ironGeo;
}

export class PjlHorse {
  constructor(horse, asset, tack = {}) {
    this.horse = horse;
    this.asset = asset;
    this.view = new HorseView(asset, coatOf(horse.def));
    // Couleurs de la sellerie du jeu (tapis, liseré, guêtres, bonnet) reprises sur la sellerie WildMesh.
    const tc = {};
    if (tack.pad) tc.pad = tack.pad;
    if (tack.padTrim) tc.trim = tack.padTrim;
    if (tack.bootsColor) tc.boots = tack.bootsColor;
    if (tack.bonnet?.color) tc.bonnet = tack.bonnet.color;
    this.view.setTackColours(tc);
    // Racine : enfant du maillage du cheval du jeu (position, cap, pente, hauteur du saut ; visibilité au loin), à
    // l'échelle 1 (le maillage du jeu est réduit à 0,94).
    this.holder = new THREE.Group();
    this.holder.name = 'pjl-horse';
    this.holder.scale.setScalar(1 / (horse.mesh.scale.x || 1));
    this.holder.add(this.view.root);
    horse.mesh.add(this.holder);
    // Accessoires dessinés par le jeu : étrivières, étriers, rênes.
    const leather = this.view.tackMats.saddle || new THREE.MeshStandardMaterial({ color: '#2a170c', roughness: 0.5 });
    this.mats = { iron: new THREE.MeshStandardMaterial({ color: '#cfcfcf', metalness: 1, roughness: 0.25 }), rein: new THREE.MeshStandardMaterial({ color: '#1d1410', roughness: 0.6, side: THREE.DoubleSide }), leather: leather.clone() };
    this.mats.leather.side = THREE.DoubleSide;
    this.extras = new THREE.Group();
    this.extras.name = 'pjl-straps';
    this.leathers = [new Strap(6, 0.013, this.mats.leather), new Strap(6, 0.013, this.mats.leather)];
    this.reins = [new Strap(16, 0.008, this.mats.rein), new Strap(16, 0.008, this.mats.rein)];
    this.irons = [0, 1].map(() => {
      const m = new THREE.Mesh(ironGeometry(), this.mats.iron);
      m.castShadow = true;
      m.frustumCulled = false;
      return m;
    });
    for (const s of [...this.leathers, ...this.reins]) this.extras.add(s.mesh);
    for (const m of this.irons) this.extras.add(m);
    horse.game?.scene.add(this.extras);
    // Phase de foulée (convention de la source : s.phase), longueur de foulée lissée, main, état du saut.
    this.ph = horse.anim?.phase || 0;
    this.stride = 3.42;
    this.roll = 0;
    this.landT = 9;
    this.wasJump = false;
    this._calibrate();
    this.setActive(true);
  }

  // Calages faits une fois : décalages de phase des clips sur les allures du jeu, main des clips d'origine, position
  // des étriers par rapport au siège (pour le cavalier), tangage de repos du dos.
  _calibrate() {
    const A = this.asset, C = A.gaitContacts || {}, G = A.gaitInfo;
    this.align = {};
    const fit = (clip, key, info) => {
      const c = C[clip];
      const off = GAIT_OFFSETS[key];
      if (!c || !off) return null;
      const sim = c.touch.map((x) => wrap01(x - info.offset));
      return circularOffset(sim, off);
    };
    // Main des clips d'origine : main droite selon la source ; vérifiée sur les appuis (le dernier antérieur posé mène).
    const r = fit('canter', 'canterR', G.canter), l = fit('canter', 'canterL', G.canter);
    this.leadSwap = !!(r && l && l.res + 0.02 < r.res);
    const right = this.leadSwap ? 'L' : 'R', left = this.leadSwap ? 'R' : 'L';
    this.align.walk = fit('walk', 'walk', G.walk);
    this.align.trot = fit('trot', 'trot', G.trot);
    this.align['canter' + right] = fit('canter', 'canter' + right, G.canter);
    this.align['canter' + left] = fit('canter_M', 'canter' + left, G.canter);
    this.align['gallop' + right] = fit('gallop', 'gallop' + right, G.gallop);
    this.align['gallop' + left] = fit('gallop_M', 'gallop' + left, G.gallop);
    if (!PjlHorse.logged) {
      PjlHorse.logged = true;
      const fmt = Object.fromEntries(Object.entries(this.align).map(([k, v]) => [k, v ? `${v.off.toFixed(3)} (écart ${v.res.toFixed(3)})` : '—']));
      console.info('[horse] Equestrian Tour : calage des clips sur les allures du jeu', fmt, this.leadSwap ? 'clips d’origine à main gauche' : 'clips d’origine à main droite');
      PjlHorse.logFit = true;
    }
    // Étriers (pieds du cavalier) : hauteur et avance de l'ancre d'étrier de la sellerie WildMesh ; écartement d'après
    // la largeur réelle du tronc WildMesh (plus large que celui du cheval du jeu) entre l'étrier et le genou, plus
    // l'épaisseur de la jambe et de la botte et le mouvement du tronc aux allures (les clips gonflent et balancent le
    // tronc) : sinon, le bas de jambe du cavalier entre dans le flanc.
    const an = A.tack.anchors, k = A.tack.anchorLocal;
    this.anchorsRest = an;
    const seat = an.seat;
    const iron = k.ironL ? this._restAnchor('ironL') : null;
    if (iron) {
      // RIDER_FIT : repère de la selle (x vers la gauche, y vers le haut, z vers l'avant), pied (étrier) relatif au siège.
      // Descente de jambe de CSO : l’ancre de la sellerie seule donnait des étriers trop courts
      // et trop en avant. Le pied reste sous le bassin ; les étriers visibles le suivent.
      const stirrupY = clamp(iron.y - seat.y - 0.06, -0.85, -0.64), stirrupZ = clamp(iron.z - seat.z - 0.09, -0.1, 0.16);
      const b = PjlHorse.halfWidth(A, seat, seat.y + stirrupY + 0.04, seat.y - 0.16, seat.z + stirrupZ - 0.3, seat.z + stirrupZ + 0.08);
      // Siège recentré sur l'axe du tronc (le point d'assise de la sellerie en est décalé de quelques centimètres).
      this.seatShift = clamp(b.center - seat.x, -0.05, 0.05);
      this.fit = { stirrupX: clamp(b.half + LEG_CLEAR, 0.3, 0.55), stirrupY, stirrupZ };
      this.barrel = b;
      if (PjlHorse.logFit) {
        PjlHorse.logFit = false;
        console.info('[horse] Equestrian Tour : étriers du cavalier', JSON.stringify({ ...this.fit, flancG: +b.left.toFixed(3), flancD: +b.right.toFixed(3), recentrage: +this.seatShift.toFixed(3) }));
      }
    }
  }

  // Flancs du tronc WildMesh (m, repère du cheval : flanc gauche, flanc droit, axe, demi-largeur) entre deux hauteurs et
  // deux abscisses : sommets du corps (ni membres ni tête) sur les poses jouées (repos, pas, trot, galop et grand galop des deux mains,
  // quelques instants de chaque clip) — enveloppe du tronc en mouvement. Grille calculée une fois par asset.
  static halfWidth(asset, seat, y0, y1, z0, z1) {
    let G = asset._barrelGrid;
    if (!G) {
      let body = null;
      asset.scene.traverse((o) => o.isSkinnedMesh && o.material?.name === 'horse_body' && (body = o));
      G = asset._barrelGrid = { y0: 0.6, z0: -1.2, dy: 0.02, dz: 0.05, ny: 70, nz: 50, hi: new Float32Array(70 * 50).fill(-9), lo: new Float32Array(70 * 50).fill(9) };
      if (body) {
        const s = asset.scale;
        const inner = new THREE.Matrix4().compose(new THREE.Vector3(0, -asset.groundY * s, 0), new THREE.Quaternion().setFromAxisAngle(_Y, -asset.yaw), new THREE.Vector3(s, s, s));
        const P = body.geometry.attributes.position, R = body.geometry.attributes.coatRegion;
        const idx = [];
        for (let i = 0; i < P.count; i++) if (!R || R.getX(i) < 0.5) idx.push(i); // ni membres (1–4) ni tête (5)
        const v = new THREE.Vector3(), M = new THREE.Matrix4();
        const mixer = new THREE.AnimationMixer(asset.scene);
        for (const [clip, n] of [['idle', 2], ['walk', 4], ['trot', 4], ['canter', 6], ['canter_M', 6], ['gallop', 6], ['gallop_M', 6]]) {
          const c = asset.clips.get(clip);
          if (!c) continue;
          mixer.stopAllAction();
          mixer.clipAction(c).reset().play();
          for (let f = 0; f < n; f++) {
            mixer.setTime((f / n) * c.duration);
            asset.scene.updateMatrixWorld(true);
            // Positions skinnées (géométrie quantifiée : les matrices des os la ramènent à l'échelle).
            M.multiplyMatrices(inner, body.matrixWorld);
            for (const i of idx) {
              body.applyBoneTransform(i, v.fromBufferAttribute(P, i)).applyMatrix4(M);
              const iy = Math.floor((v.y - G.y0) / G.dy), iz = Math.floor((v.z - G.z0) / G.dz);
              if (iy < 0 || iy >= G.ny || iz < 0 || iz >= G.nz) continue;
              const c = iy * G.nz + iz;
              if (v.x > G.hi[c]) G.hi[c] = v.x;
              if (v.x < G.lo[c]) G.lo[c] = v.x;
            }
          }
          mixer.uncacheClip(c);
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(asset.scene);
        // Pose de repos rendue au modèle partagé (les chevaux sont clonés depuis elle).
        asset.resetPose?.();
      }
    }
    // Flanc gauche (x le plus grand) et flanc droit (x le plus petit), repère du cheval.
    let left = -9, right = 9;
    for (let iy = Math.max(0, Math.floor((y0 - G.y0) / G.dy)); iy <= Math.min(G.ny - 1, Math.floor((y1 - G.y0) / G.dy)); iy++)
      for (let iz = Math.max(0, Math.floor((z0 - G.z0) / G.dz)); iz <= Math.min(G.nz - 1, Math.floor((z1 - G.z0) / G.dz)); iz++) {
        left = Math.max(left, G.hi[iy * G.nz + iz]);
        right = Math.min(right, G.lo[iy * G.nz + iz]);
      }
    return { left, right, center: (left + right) / 2, half: (left - right) / 2 };
  }

  // Ancre de sellerie au repos (repère du cheval, mètres) : position de liaison appliquée à la pose de repos.
  _restAnchor(name) {
    const s = this.asset.tack.anchorSkins?.[name];
    return s ? s.p.clone() : null;
  }

  setActive(on) {
    this.active = on;
    this.holder.visible = on;
    this.extras.visible = on;
    const H = this.horse, ud = H.mesh.userData;
    // Corps, crins, bonnet et sellerie du cheval procédural retirés de l'affichage (toujours animés).
    const layer = on ? 31 : 0;
    H.mesh.layers.set(layer);
    for (const p of ud.parts || []) p.layers.set(layer);
    if (ud.tack) ud.tack.layers.set(layer);
    if (on) {
      H.hoofAt = (i, out) => this.hoofWorld(i, out);
      // Étriers du cavalier sur la selle WildMesh.
      if (this.fit) {
        this._fitSaved = H.riderFit;
        H.riderFit = { ...(H.riderFit || {}), ...this.fit };
        if (H.rider) H.rider._fit = { ...RIDER_FIT, ...H.riderFit };
      }
      H.pjl = this;
      // Étriers « qui pendent » du cheval du jeu (cible du pied à la montée et à la descente) : remplacés chaque image par
      // ceux de la selle WildMesh (voir _attachRider) ; positions d'origine gardées.
      this._stirRest = ['stirL', 'stirR'].map((n) => H.bones[n]?.userData.rest?.clone() || null);
    } else {
      ['stirL', 'stirR'].forEach((n, k) => {
        const r = this._stirRest?.[k], b = H.bones[n];
        if (r && b?.userData.rest) b.userData.rest.copy(r);
      });
      if (H.hoofAt) delete H.hoofAt;
      if (H.pjl === this) delete H.pjl;
      if (this.fit) {
        if (this._fitSaved) H.riderFit = this._fitSaved;
        else delete H.riderFit;
        if (H.rider) H.rider._fit = { ...RIDER_FIT, ...(H.riderFit || {}) };
      }
      // Os d'attache du cheval procédural rendus à leur place de repos.
      for (const n of ['saddle', 'leadAnchor']) {
        const b = H.bones[n];
        if (b?.userData.rest) {
          b.position.copy(b.userData.rest);
          b.quaternion.identity();
        }
      }
      refreshHorseTack(H.mesh);
    }
  }

  // Sabot WildMesh (indice du jeu : 0 AG, 1 AD, 2 PG, 3 PD), repère monde, à hauteur de la sole.
  hoofWorld(i, out = new THREE.Vector3()) {
    const name = ['fingers_02_l', 'fingers_02_r', 'toes_02_l', 'toes_02_r'][i];
    this.view.boneWorld(name, out);
    const H = this.horse;
    const gy = H.groundAt ? H.groundAt(out.x, out.z) : out.y;
    if (out.y - gy < 0.12) out.y = gy;
    return out;
  }

  // État au format de la simulation de la source, calculé depuis le cheval du jeu.
  _snapshot(dt) {
    const H = this.horse, A = H.anim._a;
    const speed = H.speed || 0;
    const g = A?.gait || 'idle';
    const jumping = H.jumpT >= 0;
    // Allure et longueur de foulée.
    let gait = 'halt', target = 0;
    if (g === 'walk') (gait = 'walk'), (target = this.asset.gaitInfo.walk.stride);
    else if (g === 'trot') (gait = 'trot'), (target = this.asset.gaitInfo.trot.stride);
    else if (g === 'canter' || g === 'gallop') {
      gait = 'canter';
      // Galop de travail → galop allongé : du clip de galop au clip de grand galop (fondu par la longueur de foulée).
      target = 3.42 + (4.5 - 3.42) * smoothstep(8.2, 11.5, speed);
    }
    if (gait === 'halt' && jumping) gait = 'canter';
    if (target) this.stride = damp(this.stride, target, 5, dt);
    // Phase : avance de vitesse / foulée, cadence bornée ; arrêt : phase figée.
    const cad = CADENCE[gait === 'canter' ? 'canter' : gait];
    if (cad && !jumping && speed > 0.2) {
      const f = clamp(speed / Math.max(0.5, this.stride), cad[0], cad[1]);
      this.ph = wrap01(this.ph + f * dt);
    }
    // Main : celle choisie par la locomotion du jeu (A.lead > 0 : à gauche).
    const leadDest = (A?.lead ?? 1) > 0 ? 'L' : 'R';
    const lead = this.leadSwap ? (leadDest === 'L' ? 'R' : 'L') : leadDest;
    // Réécriture de la phase du cheval du jeu : ses posers (sons, empreintes, trot enlevé) sur ceux des clips.
    const key = g === 'canter' || g === 'gallop' ? (speed > 9.8 ? 'gallop' : 'canter') + leadDest : g;
    const al = this.align[key];
    if (al && !jumping && speed > 0.2) H.anim.phase = wrap01(this.ph - al.off);
    // Virage et inclinaison (convention de la source : turnRate > 0 à gauche).
    const turnRate = H.lastTurn || 0;
    this.roll = damp(this.roll, -Math.atan2(turnRate * speed, 9.81) * 0.9, 6, dt);
    // Saut : vol du jeu (jumpT 0 → 1) réparti du départ des postérieurs à la réception des antérieurs.
    const T = Math.max(0.3, H.jumpDur || 0.8);
    if (this.wasJump && !jumping) this.landT = 0;
    this.wasJump = jumping;
    this.landT += dt;
    const refusing = H._brake > 0 || H._rearT > 0;
    const mode = jumping ? 'air' : refusing ? 'refusal' : this.landT < 0.45 ? 'landing' : 'ride';
    const s = this._s || (this._s = {});
    s.x = 0;
    s.z = 0;
    s.y = COM_CANTER_HEIGHT;
    s.heading = 0;
    s.roll = this.roll;
    s.speed = speed;
    s.gait = gait;
    s.lead = lead;
    s.phase = this.ph;
    s.strideLen = this.stride;
    s.turnRate = turnRate;
    s.mode = mode;
    s.jt = jumping ? this._jumpTime(H.jumpT, T, speed) : 0;
    s.jT = jumping ? T : 0;
    s.landingTimer = this.landT;
    return s;
  }

  // Temps de saut donné à la vue (convention de la source : jt < 0 avant le décollage des postérieurs, 0 → T de leur
  // décollage à la réception des antérieurs, réparti linéairement sur le clip). Le vol du jeu est une parabole
  // symétrique (sommet à mi-vol) : le clip est réparti en deux morceaux pour que son sommet (bassin le plus haut entre
  // décollage et réception) tombe au sommet du jeu ; départ des postérieurs (PUSH s avant) et réception des
  // antérieurs restent calés sur le début et la fin du vol.
  _jumpTime(tau, T, speed) {
    const j = this.asset.jumps.get(speed > 8 ? 'jump_gallop' : 'jump_canter') || this.asset.jumps.get('jump_gallop');
    if (!j) return tau * (T + PUSH) - PUSH;
    if (j._apex === undefined) {
      let best = j.toeOff, hi = -Infinity;
      for (let f = Math.ceil(j.toeOff * 24); f <= Math.floor(j.foreLand * 24); f++) {
        const r = j.pelvisRise[f];
        if (r !== undefined && r > hi) (hi = r), (best = f / 24);
      }
      j._apex = Math.min(Math.max(best, j.toeOff + 0.05), j.foreLand - 0.05);
    }
    const c0 = j.toeOff - PUSH, c = tau < 0.5 ? c0 + (tau / 0.5) * (j._apex - c0) : j._apex + ((tau - 0.5) / 0.5) * (j.foreLand - j._apex);
    // Inverse de la répartition de la vue : jt < 0 en temps réel avant le décollage, puis proportionnel.
    return c < j.toeOff ? c - j.toeOff : ((c - j.toeOff) / (j.foreLand - j.toeOff)) * T;
  }

  update(dt) {
    const H = this.horse;
    if (this.disposed || !this.active || !H.anim?._a) return;
    if (!H.mesh.visible) {
      this.extras.visible = false;
      return;
    }
    this._dt = dt;
    const s = this._snapshot(dt);
    const V = this.view;
    V.approaching = !!(H.isPlayerHorse && H.game?.course);
    V.update(s, dt);
    // Équipement du cheval du jeu (selle, filet, guêtres, bonnet).
    const cfg = H.mesh.userData.tack?.userData.cfg || {};
    const key = `${cfg.saddle ? 1 : 0}${cfg.boots ? 1 : 0}${H.mesh.userData.bonnet ? 1 : 0}`;
    if (key !== this._tackKey) {
      this._tackKey = key;
      V.setTackVisible({ saddle: cfg.saddle, bridle: cfg.saddle, boots: cfg.boots, bonnet: !!H.mesh.userData.bonnet && cfg.saddle });
    }
    // Robe mouillée (pluie, sueur) comme le cheval du jeu.
    const U = H.mesh.userData.coat?.uniforms;
    if (U) V.setWet(Math.min(1, Math.max(U.uWet.value, U.uSweat.value * 0.6)));
    this.holder.updateMatrixWorld(true);
    this._attachRider(cfg);
    this._straps(cfg);
  }

  // Os « saddle » du cheval du jeu (cavalier, montée, descente) au point d'assise WildMesh ; longe au mors.
  _attachRider() {
    const H = this.horse, V = this.view, B = H.bones;
    const sb = B.saddle;
    if (sb?.parent) {
      V.anchorWorld('seat', _v);
      if (this.seatShift) _v.addScaledVector(_w.set(1, 0, 0).applyQuaternion(this.holder.getWorldQuaternion(_q)), this.seatShift);
      // Tangage du dos (garrot → bassin) par rapport au repos, inclinaison de la vue ; repère du cheval du jeu.
      V.boneWorld('spine_04', _a);
      V.boneWorld('pelvis', _b);
      this.holder.worldToLocal(_a);
      this.holder.worldToLocal(_b);
      const pitch = Math.atan2(_a.y - _b.y, _a.z - _b.z);
      if (this.pitch0 === undefined) this.pitch0 = pitch;
      // Lissage léger : le siège suit le dos, sans le tremblement des os du garrot.
      this.dPitch = damp(this.dPitch ?? 0, pitch - this.pitch0, 18, this._dt || 1 / 60);
      _e.set(-this.dPitch, 0, V.body.rotation.z, 'YXZ');
      this.holder.getWorldQuaternion(_q).multiply(_q2.setFromEuler(_e));
      sb.parent.updateWorldMatrix(true, false);
      _m.compose(_v, _q, sb.parent.getWorldScale(_s));
      _m2.copy(sb.parent.matrixWorld).invert().multiply(_m);
      _m2.decompose(sb.position, sb.quaternion, _s);
      sb.updateMatrixWorld(true);
    }
    // Étriers qui pendent : ancre d'étrier de la selle WildMesh, dans le repère du thorax du cheval du jeu.
    ['L', 'R'].forEach((side, k) => {
      const b = B[k ? 'stirR' : 'stirL'];
      if (!b?.parent || !b.userData.rest || !this._stirRest) return;
      V.anchorWorld('iron' + side, _a);
      b.parent.updateWorldMatrix(true, false);
      b.userData.rest.copy(b.parent.worldToLocal(_a));
    });
    const la = B.leadAnchor;
    if (la?.parent) {
      V.anchorWorld('bitL', _a);
      V.anchorWorld('bitR', _b);
      _v.addVectors(_a, _b).multiplyScalar(0.5);
      _v.y -= 0.03;
      la.parent.updateWorldMatrix(true, false);
      la.position.copy(la.parent.worldToLocal(_v));
      la.updateMatrixWorld(true);
    }
  }

  // Étrivières, étriers et rênes (cheval sellé et proche).
  _straps(cfg) {
    const H = this.horse, V = this.view;
    const cam = H.game?.camera?.position;
    const far = cam ? Math.hypot(H.pos.x - cam.x, H.pos.z - cam.z) > DETAIL_DIST : false;
    const show = !!cfg.saddle && !far;
    this.extras.visible = show;
    if (!show) return;
    // Repère latéral du cheval (monde).
    this.holder.getWorldQuaternion(_q);
    const lat = _w.set(1, 0, 0).applyQuaternion(_q);
    const fw = this._fw || (this._fw = new THREE.Vector3());
    fw.set(0, 0, 1).applyQuaternion(_q);
    const R = H.rider || H.mountingBy;
    const inS = R?.inStirrup;
    ['L', 'R'].forEach((side, k) => {
      const bar = V.anchorWorld('bar' + side, _a);
      // Étrier : sous le pied du cavalier quand il y est (étrier du cheval du jeu, placé au pied), sinon pendant.
      const stir = H.bones[k ? 'stirR' : 'stirL'];
      const iron = this.irons[k];
      if (inS && inS[k ? 'r' : 'l'] && stir) {
        stir.updateWorldMatrix(true, false);
        stir.getWorldPosition(_b);
      } else V.anchorWorld('iron' + side, _b);
      iron.position.copy(_b);
      iron.quaternion.copy(_q);
      // Étrivière : de la porte-étrivière à l'œil de l'étrier (haut de l'arceau).
      _v.copy(_b);
      _v.y += 0.115;
      // largeur de l'étrivière dans le sens de la longueur du cheval (posée à plat sur le quartier)
      this.leathers[k].set(bar, _v, 0, fw);
    });
    // Rênes : du mors aux poings du cavalier ; sans cavalier, sur l'encolure (devant le garrot).
    const hands = H.rider?.getHandWorldPositions ? H.rider.getHandWorldPositions(_hl, _hr) : null;
    ['L', 'R'].forEach((side, k) => {
      const bit = V.anchorWorld('bit' + side, _a);
      if (hands) _b.copy(hands[k]);
      else {
        V.anchorWorld('crest', _b);
        _b.addScaledVector(lat, k ? -0.07 : 0.07);
      }
      const len = bit.distanceTo(_b);
      this.reins[k].set(bit, _b, hands ? Math.min(0.06, len * 0.05) : 0.12, _Y);
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.setActive(false);
    this.holder.parent?.remove(this.holder);
    this.extras.parent?.remove(this.extras);
    this.view.dispose();
    // Squelette propre à ce clone (texture d'os), matériaux propres ; géométries partagées avec l'asset.
    this.view.model.traverse((o) => o.isSkinnedMesh && o.skeleton?.dispose());
    for (const m of Object.values(this.view.tackMats)) m.dispose?.();
    if (this.view.materials) for (const m of Object.values(this.view.materials)) m.dispose();
    for (const s of [...this.leathers, ...this.reins]) s.geo.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
