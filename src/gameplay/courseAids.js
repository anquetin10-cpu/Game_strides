// Aides visuelles d'un parcours de CSO, désactivables (Réglages → Aide au saut, Tracé au sol) :
// - tracé au sol : la ligne du cavalier jusqu'à l'obstacle suivant (pointillés), simple suggestion — le cavalier
//   choisit ses courbes ;
// - zone d'appel : bande au sol devant l'obstacle suivant, calculée par le modèle de saut (jumpModel.js) pour la
//   vitesse et l'abord du moment — vert : bonne zone, ambre : encore possible (saut moins confortable) ;
// - repère discret au-dessus de l'obstacle suivant.
import * as THREE from 'three';
import { planJump, railsAhead, JUMP } from './jumpModel.js';
import { CSO_LINE } from './obstacles.js';

const LINE_MAT = new THREE.MeshBasicMaterial({ color: '#f4f3ee', transparent: true, opacity: 0.55, depthWrite: false });
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
    // Tracé : tirets posés sur le sol tout le long de la ligne ; seul le tronçon vers l'obstacle suivant est affiché.
    this.line = courseId === 'cso' ? this._dashes(CSO_LINE) : null;
    if (this.line) this.group.add(this.line.mesh);
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

  _dashes(pts) {
    const pos = [];
    const idx = [];
    const ter = this.game.terrain;
    const stepS = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      // Tiret d'environ 0,5 m sur deux.
      if (Math.floor(a.s / 0.9) % 2) continue;
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * 0.07, nz = (dx / l) * 0.07;
      const k = pos.length / 3;
      for (const [x, z] of [[a.x + nx, a.z + nz], [a.x - nx, a.z - nz], [b.x - nx, b.z - nz], [b.x + nx, b.z + nz]]) pos.push(x, ter.getHeight(x, z) + 0.03, z);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      stepS.push(a.s);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, LINE_MAT);
    mesh.renderOrder = 2;
    return { mesh, geo, stepS };
  }

  // next : obstacle suivant (ou null) ; prev : obstacle précédent (début du tronçon) ; aid : réglages.
  update(dt, { next, prevS = 0, showLine = true, showZone = true }) {
    const g = this.game;
    const horse = g.player.horse;
    // Tracé : de l'obstacle précédent (ou du départ) jusqu'à 4 m après l'obstacle suivant.
    if (this.line) {
      const on = showLine && !!next;
      this.line.mesh.visible = on;
      if (on) {
        const s0 = prevS, s1 = (next.lineS ?? 1e9) + 4;
        let a = this.line.stepS.findIndex((s) => s >= s0);
        let b = this.line.stepS.findIndex((s) => s > s1);
        if (a < 0) a = this.line.stepS.length;
        if (b < 0) b = this.line.stepS.length;
        this.line.geo.setDrawRange(a * 6, Math.max(0, b - a) * 6);
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
    this.good.geometry.dispose();
    this.ok.geometry.dispose();
    this.mark.geometry.dispose();
  }
}
