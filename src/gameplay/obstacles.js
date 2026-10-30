// Obstacles de saut (CSO, cross, entraînement) : détection du franchissement, barres tombées, refus, aide à l'appel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { showJumpGeo, railGeo, logJumpGeo, brushJumpGeo, partsToGeo, box } from '../world/builders.js';
import { POLE, HOME } from '../world/sites.js';
import { XC_PATH, POND } from '../world/layout.js';
import { pointAlong, polylineLength, clamp } from '../core/math.js';
import { HORSE } from '../config.js';
import { signTexture } from '../world/textures.js';
import { t } from '../core/i18n.js';
import { CSO_TRACE, csoHeights } from './csoCourse.js';
import { PARIS_COURSES, PARIS_WARM } from './parisCourse.js';
import { PARIS } from '../world/sites.js';
import { planJump, railsAhead, arcY, JUMP, CAUSES } from './jumpModel.js';
import { applySurfaces } from '../world/surfaces.js';
import { addCloudShadows } from '../world/sky.js';

// Bois peint satiné (barres, chandeliers), métal des taquets.
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
MAT.onBeforeCompile = (sh) => addCloudShadows(sh);
MAT.customProgramCacheKey = () => 'obstacles';
let wallMat = null;
const COLORS = [
  ['#f2f1ec', '#17181b'],
  ['#f2f1ec', '#b8322a'],
  ['#f2f1ec', '#2f5f8a'],
  ['#f2f1ec', '#2f6e4a'],
  ['#17181b', '#f2f1ec'],
];

// Refus : longueur de l'avant-main (bout du nez devant l'origine du cheval) ; point de référence du saut (épaules)
// devant l'origine ; dépassement du nez au-delà de la face d'un obstacle sur un refus tout contre (il emporte la barre).
const NOSE = 1.6, REF = 0.4, OVERRUN = 0.6;

// Parcours de CSO du Pôle International : voir csoCourse.js (tracé, obstacles, hauteurs). Positions dans la carrière.
const A0 = POLE.arena;
const toWorld = (p) => ({ ...p, x: A0.x + p.x, z: A0.z + p.z });
export const CSO_LAYOUT = CSO_TRACE.fences.map(toWorld);
export const CSO_START = { ...toWorld(CSO_TRACE.marks.start), w: 7 };
export const CSO_FINISH = { ...toWorld(CSO_TRACE.marks.finish), w: 7 };
export const CSO_LINE = CSO_TRACE.pts.map(toWorld);
export const CSO_LENGTH = Math.round(CSO_TRACE.length);
// Entrée de piste (milieu du grand côté sud) : point d'accueil juste à l'intérieur, face à la carrière.
export const CSO_GATE = { x: A0.x, z: A0.z + A0.d / 2 - 5, rot: Math.PI };

function xcLayout() {
  const L = polylineLength(XC_PATH);
  // Saut d'entrée dans la mare : juste avant l'eau.
  let waterS = L * 0.42;
  for (let s = 0; s < L; s += 1) {
    const p = pointAlong(XC_PATH, s);
    if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 4) {
      waterS = s - 3;
      break;
    }
  }
  const fr = [0.07, 0.15, 0.24, 0.32, -1, 0.55, 0.64, 0.73, 0.82, 0.91];
  const kinds = ['log', 'brush', 'log', 'brush', 'water', 'log', 'brush', 'log', 'brush', 'log'];
  return fr.map((f, i) => {
    const p = pointAlong(XC_PATH, f < 0 ? waterS : L * f);
    return { x: p.x, z: p.z, rot: p.dir, kind: kinds[i] };
  });
}

export class Obstacles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this._build();
  }

  add(o) {
    const ob = {
      w: 3.6, h: 1.1, kind: 'v', spread: 0, solid: false, colors: COLORS[0], course: null, num: 0, label: '', knocked: false, ...o,
    };
    if (ob.kind === 'o' && !ob.spread) ob.spread = 1.2;
    if (!ob.label && ob.num) ob.label = String(ob.num);
    ob.ground = this.game.terrain.getHeight(ob.x, ob.z);
    ob.n = { x: Math.sin(ob.rot), z: Math.cos(ob.rot) };
    ob.t = { x: Math.cos(ob.rot), z: -Math.sin(ob.rot) };
    this._mesh(ob);
    // Chandeliers et ailes, hors de la largeur des barres : solides pour le cheval comme pour les piétons.
    if (ob.kind === 'v' || ob.kind === 'o') {
      const u0 = ob.w / 2 + 0.5, u1 = ob.w / 2 + 1.06;
      ob.cols = [-1, 1].map((side) => {
        const u = (side * (u0 + u1)) / 2;
        return this.game.colliders.addBox(ob.x + ob.t.x * u, ob.z + ob.t.z * u, (u1 - u0) / 2, ob.spread / 2 + 0.12, ob.rot, ob.ground + ob.h + 0.75, 'wing');
      });
    }
    this.list.push(ob);
    return ob;
  }

  // Barres jugées : position le long de l'axe de saut (s) et hauteur ; oxer montant (barre avant 5 cm plus basse).
  _bars(ob) {
    if (ob.kind === 'o') return [{ s: -ob.spread / 2, h: ob.h - 0.05 }, { s: ob.spread / 2, h: ob.h }];
    return [{ s: 0, h: ob.h }];
  }

  _mesh(ob) {
    const g = new THREE.Group();
    g.position.set(ob.x, ob.ground, ob.z);
    g.rotation.y = ob.rot;
    // L'obstacle s'étend le long de l'axe local X (perpendiculaire au sens de saut).
    ob.rails = [];
    ob.bars = this._bars(ob);
    if (ob.kind === 'log') {
      g.add(new THREE.Mesh(logJumpGeo(ob.w, ob.h), MAT));
    } else if (ob.kind === 'brush' || ob.kind === 'water') {
      g.add(new THREE.Mesh(brushJumpGeo(ob.w, ob.h), MAT));
    } else if (ob.kind === 'w') {
      // Mur de CSO : blocs peints façon briques (joints blancs), couvertine, piliers. La barre posée sur le mur tombe.
      wallMat ||= applySurfaces(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), this.game.world.detailTex, () => this.game.terrain);
      g.add(new THREE.Mesh(partsToGeo([
        [box(ob.w, ob.h - 0.15, 0.5), '#a4553f'],
        [box(ob.w + 0.04, 0.1, 0.56), '#e9e6de', { y: ob.h - 0.25 }],
        [box(0.5, ob.h + 0.35, 0.6), '#a4553f', { x: -ob.w / 2 - 0.3 }],
        [box(0.5, ob.h + 0.35, 0.6), '#a4553f', { x: ob.w / 2 + 0.3 }],
        [box(0.6, 0.1, 0.7), '#e9e6de', { x: -ob.w / 2 - 0.3, y: ob.h + 0.35 }],
        [box(0.6, 0.1, 0.7), '#e9e6de', { x: ob.w / 2 + 0.3, y: ob.h + 0.35 }],
      ]), wallMat));
      const top = new THREE.Mesh(railGeo(ob.w, ob.colors), MAT);
      top.position.y = ob.h - 0.05;
      g.add(top);
      ob.rails.push(top);
      ob.bars[0].mesh = top;
    } else {
      const oxer = ob.kind === 'o';
      const zf = oxer ? -ob.spread / 2 : 0;
      // Chandeliers, remplissage et barres basses (qui ne tombent pas) : un seul maillage. Les barres du haut, celles
      // que le cheval fait tomber, restent des objets à part.
      const fixed = [showJumpGeo(ob.w, ob.h, ob.colors, oxer, ob.spread)];
      for (const hh of [ob.h * 0.62, ob.h * 0.3]) fixed.push(railGeo(ob.w, ob.colors).translate(0, hh, zf));
      // Jardinières au pied des ailes (parcours de concours).
      if (ob.course === 'cso' || ob.course === 'paris_gp' || ob.course === 'paris_sprint') fixed.push(planterGeo(ob.w, ob.num));
      g.add(new THREE.Mesh(mergeGeometries(fixed, false), MAT));
      for (const bar of ob.bars) {
        const top = new THREE.Mesh(railGeo(ob.w, ob.colors), MAT);
        top.position.set(0, bar.h, bar.s);
        g.add(top);
        ob.rails.push(top);
        bar.mesh = top;
      }
    }
    // Faces avant et arrière (axe local Z) : début et fin du franchissement ; le nez du cheval s'arrête devant sur un refus.
    const hd = ob.kind === 'log' ? ob.h / 2 : ob.kind === 'brush' || ob.kind === 'water' ? 0.55 : ob.kind === 'w' ? 0.3 : 0.06;
    ob.front = ob.kind === 'o' ? -ob.spread / 2 - 0.06 : -hd;
    ob.back = ob.kind === 'o' ? ob.spread / 2 + 0.06 : hd;
    ob.depth = ob.back - ob.front;
    if (ob.num) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: signTexture(ob.label, '', { dark: true, w: 128, h: 128 }), side: THREE.DoubleSide }));
      sign.position.set(-ob.w / 2 - 0.65, ob.h + 0.75, ob.front);
      // Face imprimée tournée vers le cavalier qui arrive (côté -z local), lisible à l'endroit.
      sign.rotation.y = Math.PI;
      g.add(sign);
      ob.sign = sign;
    }
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    ob.rails.forEach((r) => (r.userData.rest = { y: r.position.y, z: r.position.z, rx: r.rotation.x }));
    ob.group = g;
    this.group.add(g);
    // Parcours éloignés masqués par le monde : au-delà de 300 m, un obstacle ne fait que quelques pixels.
    if (ob.cull) ob.cull[0] = g;
    else this.game.world.culled.push((ob.cull = [g, ob.x, ob.z, 300]));
  }

  _build() {
    const heights = csoHeights(1.15);
    CSO_LAYOUT.forEach((f, i) => {
      this.add({ x: f.x, z: f.z, rot: f.rot, kind: f.kind, spread: f.spread, h: heights[i], w: 3.8, num: i + 1, label: f.label, lineS: f.s, course: 'cso', colors: COLORS[i % COLORS.length] });
    });
    xcLayout().forEach((p, i) => {
      this.add({ x: p.x, z: p.z, rot: p.rot, kind: p.kind, h: p.kind === 'log' ? 0.95 : 1.05, w: 4.2, num: i + 1, course: 'xc', solid: true });
    });
    // Lignes de départ et d'arrivée : fanions (rouge à droite, blanc à gauche), cellules de chronométrage, ligne au sol.
    this._timingLine(CSO_START, t('DÉPART'));
    this._timingLine(CSO_FINISH, t('ARRIVÉE'));
    const H = HOME.arena;
    this.add({ x: H.x - 9, z: H.z, rot: Math.PI / 2, kind: 'v', h: 0.75, w: 3.2, course: 'home', id: 'home1' });
    this.add({ x: H.x + 10, z: H.z, rot: -Math.PI / 2, kind: 'o', h: 1.0, w: 3.2, course: 'home', id: 'home2', colors: COLORS[1] });
    const W = POLE.warmup;
    this.add({ x: W.x, z: W.z - 9, rot: Math.PI / 2, kind: 'v', h: 1.1, w: 3.4, course: 'warmup' });
    this.add({ x: W.x, z: W.z + 10, rot: -Math.PI / 2, kind: 'o', h: 1.0, w: 3.4, course: 'warmup', colors: COLORS[1] });
    // Grand Prix de Paris Indoor : Sprint et Grand Prix dans l'arène (un seul des deux tracés en piste à la fois),
    // chacun avec ses lignes de départ et d'arrivée, et paddock d'échauffement.
    for (const c of Object.values(PARIS_COURSES)) {
      const hs = c.heights(1.45);
      c.layout.forEach((f, i) => {
        this.add({ x: f.x, z: f.z, rot: f.rot, kind: f.kind, spread: f.spread, h: hs[i], w: 3.8, num: i + 1, label: f.label, lineS: f.s, course: c.id, colors: COLORS[(i + 2) % COLORS.length] });
      });
    }
    this.parisLines = {};
    for (const c of Object.values(PARIS_COURSES)) this.parisLines[c.id] = [...this._timingLine(c.start, t('DÉPART')), ...this._timingLine(c.finish, t('ARRIVÉE'))];
    this.showParisCourse('paris_gp');
    const PW = PARIS.warmup;
    this.add({ x: PW.x - 8, z: PW.z, rot: Math.PI / 2, kind: 'v', h: 1.3, w: 3.4, course: PARIS_WARM });
    this.add({ x: PW.x + 9, z: PW.z, rot: -Math.PI / 2, kind: 'o', h: 1.25, w: 3.4, course: PARIS_WARM, colors: COLORS[1] });
  }

  _timingLine(L, label) {
    const parts = [];
    for (const side of [-1, 1]) {
      const x = (side * L.w) / 2;
      parts.push([box(0.06, 1.6, 0.06), '#f2f1ec', { x }]);
      parts.push([box(0.012, 0.36, 0.5, false), side < 0 ? '#c62b2b' : '#f4f3ee', { x: x + 0.03 * side, y: 1.38, z: 0.25 }]);
      // Cellule photoélectrique sur trépied.
      const cx = x + side * 0.6;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        parts.push([box(0.025, 0.95, 0.025, false), '#2b2c30', { x: cx + Math.cos(a) * 0.16, y: 0.45, z: Math.sin(a) * 0.16, rx: Math.sin(a) * 0.17, rz: -Math.cos(a) * 0.17 }]);
      }
      parts.push([box(0.12, 0.1, 0.16), '#f0c419', { x: cx, y: 0.9 }]);
      parts.push([box(0.05, 0.05, 0.02), '#c62b2b', { x: cx - side * 0.06, y: 0.93, z: 0.0 }]);
    }
    // Ligne tracée au sol (sciure blanche), de fanion à fanion.
    parts.push([box(L.w, 0.012, 0.12, false), '#f4f3ee', { y: 0.01 }]);
    const m = new THREE.Mesh(partsToGeo(parts), MAT);
    const y = this.game.terrain.getHeight(L.x, L.z);
    m.position.set(L.x, y, L.z);
    m.rotation.y = L.rot;
    m.castShadow = true;
    this.group.add(m);
    this.game.world.culled.push([m, L.x, L.z, 300]);
    // Panneau DÉPART / ARRIVÉE sur le fanion de gauche, lisible à l'approche.
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), new THREE.MeshBasicMaterial({ map: signTexture(label, '', { dark: true, w: 256, h: 84 }), side: THREE.DoubleSide }));
    const t = { x: Math.cos(L.rot), z: -Math.sin(L.rot) };
    sign.position.set(L.x + (t.x * L.w) / 2, y + 1.95, L.z + (t.z * L.w) / 2);
    sign.rotation.y = L.rot + Math.PI;
    this.group.add(sign);
    this.game.world.culled.push([sign, L.x, L.z, 200]);
    return [m, sign];
  }

  // Arène de Paris : un seul tracé en piste (Sprint ou Grand Prix), l'autre rangé.
  showParisCourse(id) {
    for (const c of Object.keys(PARIS_COURSES)) {
      const nums = this.list.filter((o) => o.course === c).map((o) => o.num);
      this.setOff(c, c === id ? [] : nums);
      for (const m of this.parisLines[c]) {
        if (c === id) this.group.add(m);
        else m.parent?.remove(m);
      }
    }
    this.parisCourse = id;
  }

  ofCourse(id) {
    return this.list.filter((o) => o.course === id && !o.off).sort((a, b) => a.num - b.num);
  }

  // Retire de la piste (affichage et collisions) les obstacles `nums` d'un parcours ; les autres y reviennent.
  // Sert au défi rejouable (parcours réduit) ; setOff(courseId, []) rétablit le tracé complet.
  setOff(courseId, nums = []) {
    for (const o of this.list) {
      if (o.course !== courseId) continue;
      o.off = nums.includes(o.num);
      if (o.off) o.group.parent?.remove(o.group);
      else if (!o.group.parent) this.group.add(o.group);
      this._colsTop(o);
    }
  }

  // Ailes d'un obstacle : à la hauteur des barres, sans collision quand il est retiré de la piste.
  _colsTop(o) {
    for (const c of o.cols || []) c.top = o.off ? -Infinity : o.ground + o.h + 0.75;
  }

  // Hauteurs (m) des obstacles d'un parcours, dans l'ordre (élément n = heights[n - 1]).
  setHeights(courseId, heights) {
    for (const o of this.list.filter((x) => x.course === courseId)) {
      const nh = heights[o.num - 1] ?? o.h;
      if (Math.abs(nh - o.h) < 1e-3) continue;
      o.h = nh;
      this._colsTop(o);
      const wasOn = !!o.group.parent;
      this.group.remove(o.group);
      this._mesh(o);
      if (!wasOn) this.group.remove(o.group);
    }
  }

  resetRails(courseId) {
    for (const o of this.list) if (!courseId || o.course === courseId) this._rest(o);
  }

  // Barres remises sur leurs taquets.
  _rest(o) {
    o.knocked = false;
    o.rebuild = 0;
    for (const r of o.rails) {
      r.position.y = r.userData.rest.y;
      r.position.z = r.userData.rest.z;
      r.rotation.x = r.userData.rest.rx;
      r.rotation.z = 0;
      r.userData.fall = null;
      r.userData.rattle = 0;
    }
  }

  // Barre renversée (une seule fois : déjà au sol, elle ne remonte pas sur ses taquets pour retomber). Elle part dans le
  // sens du saut ; `bar` absent : la barre du haut (la plus haute).
  knock(o, bar = null, dir = 1) {
    const r = (bar || o.bars[o.bars.length - 1]).mesh;
    o.knocked = true;
    // Entraînement : la barre est remontée dès que le cheval s'est éloigné.
    if (o.course === 'warmup' || o.course === 'home' || o.course === PARIS_WARM) o.rebuild = this.game.time + 2.5;
    if (!r || r.userData.fall) return;
    r.userData.fall = { t: 0, dir };
    this.game.audio?.railFall?.();
  }

  _localS(o, x, z) {
    return { s: (x - o.x) * o.n.x + (z - o.z) * o.n.z, u: (x - o.x) * o.t.x + (z - o.z) * o.t.z };
  }

  _horseState(horse) {
    return { v: horse.speed, power: horse.jumpPower, clearance: horse.mods.clearance };
  }

  // Obstacle visé par un appel maintenant : le plus proche devant le cheval, abordable (angle, ligne entre les
  // chandeliers). Renvoie { o, geo, plan } (plan : jumpModel.planJump) ou null.
  target(horse) {
    if (!horse) return null;
    const f = horse.forward;
    const px = horse.pos.x + f.x * REF, pz = horse.pos.z + f.z * REF;
    let best = null;
    const R = JUMP.reach + 4;
    for (const o of this.list) {
      if (o.off || Math.abs(o.x - px) > R || Math.abs(o.z - pz) > R) continue;
      const geo = railsAhead(o, px, pz, f.x, f.z);
      if (geo.cosA < JUMP.maxAngle) continue;
      const first = geo.rails[0], last = geo.rails[geo.rails.length - 1];
      if (last.x < -0.3 || first.x > JUMP.reach) continue;
      if (Math.abs((first.u + last.u) / 2) > o.w / 2 + 0.35) continue;
      if (!best || first.x < best.geo.rails[0].x) best = { o, geo };
    }
    if (!best) return null;
    best.plan = planJump(this._horseState(horse), best.geo);
    return best;
  }

  // Aide à l'appel pour l'obstacle devant : 'far' | 'good' | 'near' | 'none' (mêmes calculs que le saut).
  timing(horse) {
    if (!horse || horse.jumpT >= 0 || horse._refusing || horse.speed < HORSE.minJumpSpeed) return 'none';
    const t = this.target(horse);
    if (!t) return 'none';
    return t.plan.zone === 'refuse' ? 'near' : t.plan.zone;
  }

  // Refus décidé : le cheval freine pour s'arrêter devant l'obstacle (et, tout contre, emporte la barre).
  refuse(horse, o) {
    if (horse._refusing) return;
    const f = horse.forward;
    const { s } = this._localS(o, horse.pos.x + f.x * REF, horse.pos.z + f.z * REF);
    const side = s < 0 ? -1 : 1;
    const fn = f.x * o.n.x + f.z * o.n.z;
    const toward = Math.max(0.3, -fn * side);
    const nose = s + fn * (NOSE - REF);
    const gap = side < 0 ? o.front - nose : nose - o.back;
    horse._refusing = o;
    horse.brake(Math.max(0.35, gap + OVERRUN * 0.7) / toward);
  }

  // Appelé après le déplacement du cheval du joueur.
  updateHorse(horse, prevX, prevZ) {
    const g = this.game;
    const f = horse.forward;
    const px = horse.pos.x + f.x * REF, pz = horse.pos.z + f.z * REF;
    const ppx = prevX + f.x * REF, ppz = prevZ + f.z * REF;
    // Après un refus, le cheval doit se détourner ou reprendre du champ avant qu'un nouveau refus compte.
    const ref = horse._refusal;
    if (ref && !ref.away) {
      const { s } = this._localS(ref.o, horse.pos.x, horse.pos.z);
      if ((f.x * ref.o.n.x + f.z * ref.o.n.z) * Math.sign(s) > 0 || Math.abs(s) > ref.o.depth / 2 + 6) ref.away = true;
    }
    // Refus en cours (freinage, voir Horse.brake) : à l'arrêt, le refus est compté.
    if (horse._refusing && !(horse._brake > 0)) this._count(horse, horse._refusing);
    const airborne = horse.jumpT >= 0 || horse._jt0 >= 0;
    const lj = horse._lastJump;
    for (const o of this.list) {
      if (o.off || Math.abs(o.x - px) > 12 || Math.abs(o.z - pz) > 12) continue;
      const a = this._localS(o, ppx, ppz);
      const b = this._localS(o, px, pz);
      const inWidth = Math.abs(b.u) < o.w / 2 + 0.35;
      // Saut en cours, ou réception juste avant l'obstacle visé (appel bien trop loin : il atterrit dedans).
      const jumping = airborne || (lj && lj.o === o && lj.land !== null && g.time - lj.land < 0.6);
      if (jumping) {
        this._judge(horse, o, a, b, inWidth);
        continue;
      }
      if (!inWidth) continue;
      const side = b.s < 0 ? -1 : 1;
      const fn = f.x * o.n.x + f.z * o.n.z;
      const toward = -fn * side; // part de la marche dirigée vers l'obstacle
      if (toward > 0.3 && horse.speed > 0.5) {
        const nose = b.s + fn * (NOSE - REF);
        const gap = side < 0 ? o.front - nose : nose - o.back;
        if (!horse._refusing) {
          // Le cheval ne refuse que lorsque l'appel n'est plus possible : un saut maintenant ferait tomber la barre
          // parce qu'il est trop près (ou n'a plus la place d'enlever). Toute la zone d'appel jouable reste au cavalier.
          const geo = railsAhead(o, px, pz, f.x, f.z);
          if (geo.cosA >= JUMP.maxAngle) {
            const plan = planJump(this._horseState(horse), geo);
            if (plan.zone === 'refuse' || (plan.margin < -JUMP.late && plan.ideal <= plan.L) || (horse.speed < HORSE.minJumpSpeed && gap < 1.5)) this.refuse(horse, o);
          } else if (gap < (horse.speed * horse.speed) / 16 + 0.3) this.refuse(horse, o);
        }
        if (gap < -OVERRUN * 0.4 && horse._refusing === o && !o.knocked && !o.solid) {
          // Refus tout contre : le cheval pile dans l'obstacle et emporte la barre (refus, pas de faute de barre ; le
          // jury remonte l'obstacle).
          this.knock(o, o.bars[0], side < 0 ? 1 : -1);
          o.rebuild = g.time + 3;
        }
        if (gap < -OVERRUN) {
          // Garde-fou : le nez ne va jamais plus loin (poussée limitée par image, sans téléportation), maillage recalé.
          const push = Math.min(-OVERRUN - gap, 0.3) * side;
          horse.pos.x += o.n.x * push;
          horse.pos.z += o.n.z * push;
          horse.mesh.position.x = horse.pos.x;
          horse.mesh.position.z = horse.pos.z;
        }
      }
      const depth = o.depth / 2 + 0.1;
      const mid = (o.front + o.back) / 2;
      if ((a.s - mid < -depth && b.s - mid >= -depth) || (a.s - mid > depth && b.s - mid <= depth)) {
        // Cheval qui glisse presque parallèlement aux barres, ou au pas de fourmi (cas non couverts ci-dessus) :
        // refus sur place, ramené juste devant l'obstacle.
        const back = mid + (a.s < mid ? -depth : depth);
        horse.pos.x = o.x + o.n.x * back + o.t.x * b.u - f.x * REF;
        horse.pos.z = o.z + o.n.z * back + o.t.z * b.u - f.z * REF;
        horse.mesh.position.x = horse.pos.x;
        horse.mesh.position.z = horse.pos.z;
        horse.refuse();
        this._count(horse, o);
      }
    }
  }

  // Franchissement en l'air : chaque barre est jugée quand les épaules du cheval passent son plan, à la hauteur réelle
  // de la trajectoire à cet instant (interpolée entre deux images : indépendant de la cadence d'affichage). Une faute
  // par élément, quel que soit le nombre de barres tombées ; résultat annoncé à la sortie de l'obstacle.
  _judge(horse, o, a, b, inWidth) {
    if (a.s === b.s) return;
    const dir = b.s > a.s ? 1 : -1;
    let pass = horse._pass;
    if (!pass || pass.o !== o || pass.done) {
      const entry = dir > 0 ? o.front : o.back;
      if (!((a.s - entry) * (b.s - entry) <= 0) || !inWidth) return;
      pass = horse._pass = { o, dir, fault: false, cause: null, done: false, margin: Infinity };
    }
    const lj = horse._lastJump;
    for (const bar of o.bars) {
      if ((a.s - bar.s) * (b.s - bar.s) > 0) continue;
      const q = clamp((bar.s - a.s) / (b.s - a.s), 0, 1);
      // Progression du saut à l'instant du passage (0..1 ; hors de [0, 1] : au sol).
      const t0 = horse._jt0 ?? -1, t1 = horse._jt1 ?? -1;
      const tau = t0 >= 0 ? t0 + (t1 - t0) * q : -1;
      const y = tau >= 0 ? arcY(horse.jumpPeak, 1, tau) : 0;
      const margin = y + JUMP.lift + horse.mods.clearance - bar.h;
      pass.margin = Math.min(pass.margin, margin);
      if (margin < -JUMP.rub) {
        if (!o.solid) this.knock(o, bar, dir);
        if (!pass.fault) {
          pass.fault = true;
          const plan = lj && lj.o === o ? lj.plan : null;
          pass.cause = tau < 0 ? 'short' : plan?.cause || (plan && plan.margin >= 0 ? 'angle' : 'far');
          if (o.solid) horse.speed *= 0.55;
        }
      } else if (margin < 0.04 && bar.mesh && !o.solid) {
        // Barre effleurée : elle tinte et vibre sur ses taquets, mais reste en place.
        bar.mesh.userData.rattle = 1;
        this.game.audio?.railTouch?.();
      }
    }
    const exit = dir > 0 ? o.back : o.front;
    if ((a.s - exit) * (b.s - exit) <= 0 && (b.s - exit) * dir >= 0) {
      pass.done = true;
      const ev = { obstacle: o, dir, margin: pass.margin, cause: pass.cause, causeText: pass.cause ? CAUSES[pass.cause] : '' };
      this.game.bus.emit(pass.fault ? 'obstacle:fault' : 'obstacle:clear', ev);
    }
  }

  // Compte un refus : une seule fois tant que le cheval reste face au même obstacle sans se détourner (joystick
  // toujours poussé) ou sans rester plusieurs secondes sans le représenter.
  _count(horse, o) {
    const g = this.game;
    const ref = horse._refusal;
    const again = ref && ref.o === o && !ref.away && g.time - ref.t < 5;
    const { s } = this._localS(o, horse.pos.x, horse.pos.z);
    horse._refusing = null;
    horse._refusal = { o, t: g.time, away: false };
    if (!again) g.bus.emit('obstacle:refusal', { obstacle: o, dir: s < 0 ? 1 : -1 });
  }

  // Piéton : les obstacles sont des murets.
  blockHuman(human) {
    for (const o of this.list) {
      if (o.off || Math.abs(o.x - human.pos.x) > 6 || Math.abs(o.z - human.pos.z) > 6) continue;
      const { s, u } = this._localS(o, human.pos.x, human.pos.z);
      const mid = (o.front + o.back) / 2;
      const hd = o.depth / 2 + 0.35;
      if (Math.abs(u) < o.w / 2 + 0.2 && Math.abs(s - mid) < hd) {
        const push = (Math.sign(s - mid) || 1) * hd - (s - mid);
        human.pos.x += o.n.x * push;
        human.pos.z += o.n.z * push;
      }
    }
  }

  // Chute d'une barre : un bout quitte son taquet, l'autre suit ; rebonds amortis puis roulement sur le sol. Barre
  // effleurée : brève vibration. Obstacle emporté sur un refus : remonté par le jury quand le cheval s'est éloigné.
  update(dt) {
    const G = 9.81, R = 0.05;
    const g = this.game;
    // Hors mission, une barre tombée est remise sur ses taquets une fois le joueur éloigné (l'obstacle reste jugé à sa hauteur).
    const p = g.missions.active ? null : g.player.focusPos;
    const fp = g.player.focusPos;
    for (const o of this.list) {
      if (p && o.knocked && (Math.abs(o.x - p.x) > 60 || Math.abs(o.z - p.z) > 60) && o.rails.every((r) => !r.userData.fall || r.userData.fall.done)) this._rest(o);
      if (o.rebuild && g.time > o.rebuild && fp && Math.hypot(o.x - fp.x, o.z - fp.z) > 5) this._rest(o);
      for (const r of o.rails) {
        const ud = r.userData;
        if (ud.rattle > 0 && !ud.fall) {
          ud.rattle = Math.max(0, ud.rattle - dt * 2.5);
          r.rotation.x = ud.rest.rx + Math.sin(ud.rattle * 40) * 0.05 * ud.rattle;
          r.position.y = ud.rest.y + Math.abs(Math.sin(ud.rattle * 31)) * 0.012 * ud.rattle;
        }
        const f = ud.fall;
        if (!f || f.done) continue;
        if (!f.ends) {
          const y0 = ud.rest.y;
          f.ends = [{ y: y0, vy: 0, t0: 0 }, { y: y0, vy: 0, t0: 0.08 + Math.random() * 0.14 }];
          if (Math.random() < 0.5) f.ends.reverse();
          f.z = ud.rest.z;
          f.vz = f.dir * (0.7 + Math.random() * 0.9);
          f.roll = 0;
        }
        f.t += dt;
        let resting = true;
        for (const e of f.ends) {
          if (f.t < e.t0) { resting = false; continue; }
          e.vy -= G * dt;
          e.y += e.vy * dt;
          if (e.y <= R) {
            e.y = R;
            if (Math.abs(e.vy) > 0.6) {
              e.vy = -e.vy * 0.28;
              if (!f.clonk) { f.clonk = true; g.audio?.thud?.(); }
            } else e.vy = 0;
          }
          if (e.y > R + 1e-3 || e.vy !== 0) resting = false;
        }
        // Glisse/roule vers l'avant, freinée par le sable.
        if (f.ends[0].y <= R + 0.02 && f.ends[1].y <= R + 0.02) {
          f.vz *= Math.exp(-2.6 * dt);
          if (Math.abs(f.vz) > 0.02) resting = false;
        }
        f.z += f.vz * dt;
        f.roll += (f.vz * dt) / R;
        r.position.y = (f.ends[0].y + f.ends[1].y) / 2;
        r.position.z = f.z;
        r.rotation.z = Math.atan2(f.ends[1].y - f.ends[0].y, o.w);
        r.rotation.x = f.roll;
        if (resting && f.t > 0.5) f.done = true;
      }
    }
  }

  // Numéro de l'obstacle suivant mis en évidence pendant un parcours.
  highlight(courseId, num) {
    for (const o of this.list) {
      if (!o.sign) continue;
      o.sign.material.color.set(o.course === courseId && o.num === num ? '#7dffc4' : '#ffffff');
    }
  }
}

// Jardinières au pied des ailes : bac en bois, buis et fleurs (côté extérieur des ailes, hors du passage).
function planterGeo(w, seed = 0) {
  const parts = [];
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 1.6);
    parts.push([box(0.9, 0.34, 0.5), '#5d4632', { x }]);
    for (let i = 0; i < 6; i++) {
      const fx = x - 0.32 + (i % 3) * 0.32, fz = (i < 3 ? -0.1 : 0.1) + (((i + seed) * 7) % 3) * 0.02;
      parts.push([box(0.2, 0.18, 0.2), (i + seed) % 2 ? '#2f4424' : '#3a5a2c', { x: fx, y: 0.34, z: fz }]);
      if ((i + seed) % 2 === 0) parts.push([box(0.07, 0.07, 0.07), ['#c42e35', '#e9c23c', '#f2f1ec'][(i + seed) % 3], { x: fx + 0.03, y: 0.5, z: fz }]);
    }
  }
  return partsToGeo(parts);
}

export { clamp };
