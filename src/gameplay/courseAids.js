// Aides visuelles d'un parcours de CSO, désactivables (Réglages → Tracé au sol, Aide au saut ; en épreuve : menu pause) :
// - tracé au sol : une ligne discrète de petits repères (tirets courts) qui relie les obstacles dans l'ordre, courbes
//   comprises, du cheval jusqu'après l'obstacle suivant — la suite, après l'obstacle, est plus pâle pour préparer la
//   courbe dès la réception. Simple suggestion, jamais un rail : le cavalier choisit ses courbes et ses abords ;
// - zone d'appel (Aide au saut « Complète ») : bande au sol devant l'obstacle suivant, calculée par le modèle de saut
//   (jumpModel.js) pour la vitesse et l'abord du moment — vert : bonne zone, ambre : encore possible ;
// - repère discret au-dessus de l'obstacle suivant.
import * as THREE from 'three';
import { planJump, railsAhead, JUMP } from './jumpModel.js';
import { CSO_LINE } from './obstacles.js';
import { PARIS_COURSES } from './parisCourse.js';

// Repères du tracé : tirets courts posés sur la ligne, blanc cassé (lisible sur le sable sans l'envahir).
const LINE_MAT = new THREE.MeshBasicMaterial({ color: '#f7f3e8', transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide });
const NEXT_MAT = new THREE.MeshBasicMaterial({ color: '#f7f3e8', transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
// Réglages du tracé : longueur et largeur d'un repère, pas entre deux repères, longueur affichée après l'obstacle
// suivant (plus pâle), repères masqués juste sous le cheval.
export const LINE_MARK = { dash: 0.55, width: 0.2, every: 1.4, after: 12, hideNear: 1.5 };
const GOOD_MAT = new THREE.MeshBasicMaterial({ color: '#3ddc97', transparent: true, opacity: 0.26, depthWrite: false });
const OK_MAT = new THREE.MeshBasicMaterial({ color: '#f0b33a', transparent: true, opacity: 0.16, depthWrite: false });
const MARK_MAT = new THREE.MeshBasicMaterial({ color: '#7dffc4', transparent: true, opacity: 0.8, depthWrite: false });

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
    // Ligne du cavalier : parcours du Pôle ou de l'arène de Paris.
    this.lineData = courseId === 'cso' ? CSO_LINE : PARIS_COURSES[courseId]?.line || null;
    this.line = this.lineData ? this._marks(this.lineData, LINE_MAT) : null;
    // (deux géométries : la plage affichée se règle par géométrie)
    this.after = this.lineData ? this._marks(this.lineData, NEXT_MAT) : null;
    if (this.line) this.group.add(this.line.mesh, this.after.mesh);
    this._lineI = 0;
    this.good = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), GOOD_MAT);
    this.ok = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), OK_MAT);
    this.good.renderOrder = this.ok.renderOrder = 2;
    this.group.add(this.ok, this.good);
    const tri = new THREE.ConeGeometry(0.16, 0.3, 3).rotateX(Math.PI);
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

  // Repères du tracé : tirets courts tous les LINE_MARK.every mètres, dans l'axe de la ligne.
  _marks(pts, mat) {
    const M = LINE_MARK, quads = [];
    let next = 1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i];
      if (p.s < next) continue;
      next = p.s + M.every;
      const f = { x: Math.sin(p.h), z: Math.cos(p.h) }, t = { x: f.z, z: -f.x };
      const l = M.dash / 2, w = M.width / 2;
      quads.push({ s: p.s, c: [[p.x - f.x * l - t.x * w, p.z - f.z * l - t.z * w], [p.x - f.x * l + t.x * w, p.z - f.z * l + t.z * w], [p.x + f.x * l + t.x * w, p.z + f.z * l + t.z * w], [p.x + f.x * l - t.x * w, p.z + f.z * l - t.z * w]] });
    }
    return this._strip(quads, mat);
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
      this.line.mesh.visible = this.after.mesh.visible = on;
      if (on) {
        const sF = next.lineS ?? 1e9;
        const s1 = sF + LINE_MARK.after;
        // Position du cheval sur le tracé (point le plus proche entre l'obstacle précédent et le suivant).
        let s0 = prevS;
        if (horse) {
          let bd = 1e9;
          for (const p of this.lineData) {
            if (p.s < prevS - 2 || p.s > s1) continue;
            const d = (p.x - horse.pos.x) ** 2 + (p.z - horse.pos.z) ** 2;
            if (d < bd) { bd = d; s0 = p.s; }
          }
          if (bd > 15 * 15) s0 = prevS; // loin du tracé (volte, départ) : tout le tronçon
          else s0 += LINE_MARK.hideNear; // (pas de repère sous les sabots)
          s0 = Math.max(prevS, s0);
        }
        this._range(this.line, s0, sF);
        this._range(this.after, Math.max(s0, sF), s1);
      }
    }
    // Repère au-dessus de l'obstacle suivant.
    this.mark.visible = !!next;
    if (next) {
      const t = g.time;
      this.mark.position.set(next.x, next.ground + next.h + 1.15 + Math.sin(t * 2.4) * 0.06, next.z);
      this.mark.rotation.y = next.rot;
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
      m.scale.set(Math.min(next.w, 2.2), 1, len);
      m.visible = true;
    };
    place(this.ok, z.pass);
    place(this.good, z.good);
    this.good.position.y += 0.005;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.line?.geo.dispose();
    this.after?.geo.dispose();
    this.good.geometry.dispose();
    this.ok.geometry.dispose();
    this.mark.geometry.dispose();
  }
}
