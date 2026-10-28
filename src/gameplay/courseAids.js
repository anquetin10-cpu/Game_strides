// Aides visuelles d'un parcours de CSO, désactivables (Réglages → Aide au saut, Tracé au sol) :
// - marquage au sol de la trajectoire : couloir à deux bords blancs en tirets et chevrons verts au milieu, dans le sens
//   de la marche, du cheval jusqu'après l'obstacle suivant, courbes comprises ; simple suggestion — le cavalier choisit
//   ses courbes. Les bords encadrent le cheval : vus de la caméra (derrière lui), ils dépassent de part et d'autre de sa
//   silhouette, qui cache le milieu du couloir dans les lignes droites ;
// - zone d'appel : bande au sol devant l'obstacle suivant, calculée par le modèle de saut (jumpModel.js) pour la
//   vitesse et l'abord du moment — vert : bonne zone, ambre : encore possible (saut moins confortable) ;
// - repère discret au-dessus de l'obstacle suivant.
import * as THREE from 'three';
import { planJump, railsAhead, JUMP } from './jumpModel.js';
import { CSO_LINE } from './obstacles.js';

// Marquage du tracé : bords blancs en tirets et chevrons verts dans le sens de la marche, bien visibles sur le sable.
const LINE_MAT = new THREE.MeshBasicMaterial({ color: '#fbfaf5', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
const CHEV_MAT = new THREE.MeshBasicMaterial({ color: '#7dffc4', transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
// Réglages du marquage : largeur du couloir (entre les bords), largeur d'un bord, tirets, écart et taille des chevrons,
// longueur affichée après l'obstacle suivant.
export const LINE_MARK = { corridor: 1.9, width: 0.2, dash: 1.0, gap: 0.5, chevronEvery: 3.5, chevronSize: 0.6, after: 9 };
const GOOD_MAT = new THREE.MeshBasicMaterial({ color: '#3ddc97', transparent: true, opacity: 0.32, depthWrite: false });
const OK_MAT = new THREE.MeshBasicMaterial({ color: '#f0b33a', transparent: true, opacity: 0.22, depthWrite: false });
const MARK_MAT = new THREE.MeshBasicMaterial({ color: '#7dffc4', transparent: true, opacity: 0.85, depthWrite: false });

// Plage de distances d'appel (m, du point d'appel au centre de l'obstacle, abord droit) où le saut passe / passe bien.
export function takeoffZone(o, horse) {
  const st = { v: Math.max(horse.speed, 5.5), power: horse.jumpPower, clearance: horse.mods.clearance };
  let pass = null, good = null;
  for (let d = 8; d >= 0; d -= 0.1) {
    const p = planJump(st, railsAhead(o, o.x - o.n.x * d, o.z - o.n.z * d, o.n.x, o.n.z));
    if (p.margin >= -JUMP.rub && p.zone !== 'refuse') pass = pass ? [Math.min(pass[0], d), Math.max(pass[1], d)] : [d, d];
    if (p.zone === 'good') good = good ? [Math.min(good[0], d), Math.max(good[1], d)] : [d, d];
  }
  return { pass, good };
}

export class CourseAids {
  constructor(game, courseId) {
    this.game = game;
    this.courseId = courseId;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    // Tracé : bords en tirets posés sur le sol tout le long de la ligne ; seul le tronçon vers l'obstacle suivant est
    // affiché.
    this.line = courseId === 'cso' ? this._dashes(CSO_LINE) : null;
    this.chev = courseId === 'cso' ? this._chevrons(CSO_LINE) : null;
    if (this.line) this.group.add(this.line.mesh, this.chev.mesh);
    this._lineI = 0;
    this.good = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), GOOD_MAT);
    this.ok = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), OK_MAT);
    this.good.renderOrder = this.ok.renderOrder = 2;
    this.group.add(this.ok, this.good);
    const tri = new THREE.ConeGeometry(0.22, 0.42, 3).rotateX(Math.PI);
    this.mark = new THREE.Mesh(tri, MARK_MAT);
    this.group.add(this.mark);
    this._zoneT = 0;
    this._zoneFor = null;
  }

  // Quadrilatères posés sur le sol (quatre coins [x, z] chacun), un indice de tracé (s) par élément.
  _strip(quads, mat) {
    const pos = [], idx = [], ter = this.game.terrain;
    for (const q of quads) {
      const k = pos.length / 3;
      for (const [x, z] of q.c) pos.push(x, ter.getHeight(x, z) + 0.04, z);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return { mesh, geo, stepS: quads.map((q) => q.s) };
  }

  // Bords du couloir : deux traits en tirets à ± corridor/2 de la ligne.
  _dashes(pts) {
    const M = LINE_MARK, quads = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a.s % (M.dash + M.gap) > M.dash) continue;
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const ux = -dz / l, uz = dx / l;
      for (const side of [-1, 1]) {
        const o0 = side * M.corridor / 2 - M.width / 2, o1 = o0 + M.width;
        quads.push({ s: a.s, c: [[a.x + ux * o0, a.z + uz * o0], [a.x + ux * o1, a.z + uz * o1], [b.x + ux * o1, b.z + uz * o1], [b.x + ux * o0, b.z + uz * o0]] });
      }
    }
    return this._strip(quads, LINE_MAT);
  }

  // Chevrons « > » tous les quelques mètres, pointe dans le sens du parcours.
  _chevrons(pts) {
    const M = LINE_MARK, quads = [];
    let next = 1.5;
    for (const p of pts) {
      if (p.s < next) continue;
      next += M.chevronEvery;
      const f = { x: Math.sin(p.h), z: Math.cos(p.h) }, t = { x: f.z, z: -f.x };
      const c = M.chevronSize, th = 0.1;
      const tip = { x: p.x + f.x * c * 0.6, z: p.z + f.z * c * 0.6 };
      for (const side of [-1, 1]) {
        const end = { x: p.x - f.x * c * 0.4 + t.x * side * c, z: p.z - f.z * c * 0.4 + t.z * side * c };
        const dx = end.x - tip.x, dz = end.z - tip.z, l = Math.hypot(dx, dz);
        const nx = (-dz / l) * th, nz = (dx / l) * th;
        quads.push({ s: p.s, c: [[tip.x + nx, tip.z + nz], [tip.x - nx, tip.z - nz], [end.x - nx, end.z - nz], [end.x + nx, end.z + nz]] });
      }
    }
    return this._strip(quads, CHEV_MAT);
  }

  // Affiche les éléments d'un marquage dont l'indice de tracé est dans [s0, s1].
  _range(m, s0, s1) {
    let a = m.stepS.findIndex((s) => s >= s0);
    let b = m.stepS.findIndex((s) => s > s1);
    if (a < 0) a = m.stepS.length;
    if (b < 0) b = m.stepS.length;
    m.geo.setDrawRange(a * 6, Math.max(0, b - a) * 6);
  }

  // next : obstacle suivant (ou null) ; prev : obstacle précédent (début du tronçon) ; aid : réglages.
  update(dt, { next, prevS = 0, showLine = true, showZone = true }) {
    const g = this.game;
    const horse = g.player.horse;
    // Tracé : depuis le cheval (ou l'obstacle précédent) jusqu'à quelques mètres après l'obstacle suivant, en suivant
    // la courbe à prendre.
    if (this.line) {
      const on = showLine && !!next;
      this.line.mesh.visible = this.chev.mesh.visible = on;
      if (on) {
        const s1 = (next.lineS ?? 1e9) + LINE_MARK.after;
        // Position du cheval sur le tracé (point le plus proche entre l'obstacle précédent et le suivant).
        let s0 = prevS;
        if (horse) {
          let bd = 1e9;
          for (const p of CSO_LINE) {
            if (p.s < prevS - 2 || p.s > s1) continue;
            const d = (p.x - horse.pos.x) ** 2 + (p.z - horse.pos.z) ** 2;
            if (d < bd) { bd = d; s0 = p.s; }
          }
          if (bd > 15 * 15) s0 = prevS; // loin du tracé (volte, départ) : tout le tronçon
          s0 = Math.max(prevS, s0 - 1);
        }
        this._range(this.line, s0, s1);
        this._range(this.chev, s0, s1);
      }
    }
    // Repère au-dessus de l'obstacle suivant.
    this.mark.visible = !!next;
    if (next) {
      const t = g.time;
      this.mark.position.set(next.x, next.ground + next.h + 1.25 + Math.sin(t * 3) * 0.08, next.z);
      this.mark.rotation.y = t * 1.5;
    }
    // Zone d'appel (recalculée quatre fois par seconde : elle suit la vitesse du cheval).
    const zoneOn = showZone && next && horse && g.player.mode === 'ride';
    this.good.visible = this.ok.visible = false;
    if (!zoneOn) return;
    const dist = Math.hypot(next.x - horse.pos.x, next.z - horse.pos.z);
    if (dist > 26) return;
    this._zoneT -= dt;
    if (this._zoneT <= 0 || this._zoneFor !== next) {
      this._zoneT = 0.25;
      this._zoneFor = next;
      // Côté d'abord : celui où se trouve le cheval (sens de saut attendu : +n).
      this._zone = takeoffZone(next, horse);
    }
    const z = this._zone;
    // Les distances du modèle sont celles du point d'appel (épaules) : la bande est posée sous les antérieurs.
    const place = (m, r) => {
      if (!r) return;
      const near = r[0] + 0.4, far = r[1] + 0.4;
      const mid = (near + far) / 2, len = Math.max(0.2, far - near);
      const x = next.x - next.n.x * mid, zz = next.z - next.n.z * mid;
      m.position.set(x, g.terrain.getHeight(x, zz) + 0.035, zz);
      m.rotation.y = next.rot;
      m.scale.set(next.w, 1, len);
      m.visible = true;
    };
    place(this.ok, z.pass);
    place(this.good, z.good);
    this.good.position.y += 0.005;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.line?.geo.dispose();
    this.chev?.geo.dispose();
    this.good.geometry.dispose();
    this.ok.geometry.dispose();
    this.mark.geometry.dispose();
  }
}
