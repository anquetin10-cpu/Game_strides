// Caméra 3e personne : orbite au doigt, recentrage automatique derrière le cheval, anti-collision.
import * as THREE from 'three';
import { angleDiff, clamp, damp, lerp, smoothstep } from '../core/math.js';
import { TIDE_UNIFORMS } from '../world/weather.js';


// Profil de caméra des épreuves de saut d'obstacles (activé par game.course.camera, rendu au monde ouvert dès la sortie,
// l'abandon ou l'élimination), façon jeu de sport console : centrée derrière le cavalier, un peu surélevée, à distance
// fixe ; le couple occupe le bas de l'écran et l'on voit au-dessus de lui la courbe et l'obstacle suivant. Elle tourne
// avec le cheval (avec une légère anticipation dans les courbes), sans flottement ni rattrapage brutal, sans zoom
// pendant les sauts, et ne traverse ni obstacle ni décor. Verrouillée derrière le cavalier (pas d'orbite au doigt).
// Réglages ajustables :
export const CAM_COMP = {
  back: 6.6, // distance horizontale derrière le cheval (m)
  up: 3.4, // hauteur de la caméra au-dessus du sol sous le cheval (m)
  lookAhead: 9, // point visé devant le cheval (m)
  lookUp: 1.1, // hauteur du point visé (m)
  fenceBias: 0.22, // attirance du point visé vers l'obstacle suivant (devant, à moins de fenceRange)
  fenceRange: 30, // (m)
  lead: 0.18, // anticipation de la rotation (s) : la caméra accompagne la courbe sans prendre de retard
  yawK: 5, // vitesse de recentrage derrière le cheval (1/s)
  yawAcc: 4, // accélération angulaire maximale de la caméra (rad/s²) : jamais de rattrapage brutal
  posK: 10, // suivi horizontal du cheval (1/s)
  yK: 3, // suivi vertical (1/s)
  jumpFollow: 0.12, // part de la hauteur du saut suivie (le saut ne secoue pas l'image)
  fov: 58, // champ vertical fixe (°) : ni zoom au saut, ni grand-angle à la vitesse
  minBack: 1.6, // contre une tribune ou un mât, la caméra se rapproche (jamais dans l'obstacle ni devant le cheval) (m)
  fenceClear: 0.7, // marge au-dessus d'un obstacle survolé (m)
  enter: 1.2, // fondu d'entrée depuis la caméra précédente (s)
};
// Ancien nom (réglages de la première version de la caméra de concours).
export const CAM_CSO = CAM_COMP;
// Profil de caméra des commerces (game.indoor, à pied) : plus proche et plus basse que dehors, recentrage plus
// rapide derrière le personnage dans les allées ; les murs, le mobilier haut et le plafond la rapprochent (anti-collision
// commune). Rétabli dès la sortie.
export const CAM_INDOOR = { dist: 3.1, height: 1.5, pitch: 0.2, yawFollow: 2.4, manualHold: 1.0, fov: 62 };

export class FollowCamera {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 6;
    this.targetDist = 6;
    this.height = 1.6;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.sens = 1;
    this.fov = 60;
    this.shake = 0;
    this.override = null; // { pos, look, t } pour les plans cinématiques
    this.lastManual = -10;
    this.swing = 0; // sens (±1) d'un grand recentrage en cours, 0 sinon
  }

  snap(pos, heading) {
    this.smoothTarget.copy(pos);
    this.yaw = heading + Math.PI;
    this.update(0.016, { pos, heading, speed: 0, mode: this.game.player?.mode || 'foot' }, { dx: 0, dy: 0 }, true);
  }

  update(dt, focus, look, instant = false) {
    const cam = this.camera;
    if (this.override) {
      const o = this.override;
      cam.position.lerp(o.pos, instant ? 1 : 1 - Math.exp(-3 * dt));
      cam.lookAt(o.look);
      this._comp = null;
      return;
    }
    // Épreuve de saut d'obstacles : caméra de concours (branche séparée : le monde ouvert n'est pas modifié).
    const horse = this.game.player?.horse;
    if (focus.mode === 'ride' && this.game.course?.camera && horse && this.game.state !== 'photo') return this._updateComp(dt, horse, instant);
    this._comp = null;
    const mode = focus.mode;
    const now = this.game.time;
    const indoor = mode === 'foot' && !!this.game.indoor;
    if (look.dx || look.dy) {
      this.yaw -= look.dx * 0.0062 * this.sens;
      this.pitch = clamp(this.pitch + look.dy * 0.0045 * this.sens, -0.12, 1.15);
      this.lastManual = now;
    }
    // Recentrage derrière le sujet quand il avance.
    const idle = now - this.lastManual;
    if (focus.speed > (indoor ? 0.6 : 1.2) && idle > (indoor ? CAM_INDOOR.manualHold : 1.4)) {
      const k = mode === 'drive' ? 2.4 : indoor ? CAM_INDOOR.yawFollow : 1.4 + Math.min(focus.speed / 10, 1.6);
      // Grand recentrage (> ~70°, demi-tour au pied du camion…) : on tourne du côté où la perche est dégagée plutôt
      // que par le plus court chemin, qui peut balayer la caisse (perche écrasée, vue plongeante sur le toit), et on
      // garde ce sens jusqu'au bout.
      let d = angleDiff(this.yaw, focus.heading + Math.PI);
      if (Math.abs(d) > 1.2) {
        const s = Math.sign(d);
        if (!this.swing) this.swing = this._boomFree(s) || !this._boomFree(-s) ? s : -s;
        if (s !== this.swing) d -= s * 2 * Math.PI;
      } else this.swing = 0;
      this.yaw += d * (1 - Math.exp(-k * dt));
      this.pitch = damp(this.pitch, mode === 'drive' ? 0.24 : indoor ? CAM_INDOOR.pitch : 0.28, 1.2, dt);
    } else this.swing = 0;
    const base = mode === 'drive' ? focus.camDist || 11 : mode === 'ride' ? 6.6 : indoor ? CAM_INDOOR.dist : 4.6;
    this.targetDist = base + (mode === 'ride' ? Math.min(focus.speed, 16) * 0.09 : 0) + (mode === 'drive' ? Math.abs(focus.speed) * 0.08 : 0);
    // Hauteur du pivot lissée : monter ou descendre (de cheval, du camion) ne fait plus sauter la caméra d'une image à l'autre.
    const height = mode === 'drive' ? focus.camHeight || (focus.camDist ? 2.1 : 2.8) : mode === 'ride' ? 2.35 : indoor ? CAM_INDOOR.height : 1.55;
    this.height = instant ? height : damp(this.height, height, 4, dt);
    // (Point visé devant le sujet : réservé à l'ancienne caméra de concours, ramené à zéro en douceur.)
    this.ahead = damp(this.ahead || 0, 0, 2, dt);
    const fx = focus.pos.x + Math.sin(focus.heading) * this.ahead, fz = focus.pos.z + Math.cos(focus.heading) * this.ahead;
    const fy = focus.pos.y;
    this.smoothTarget.x = instant ? fx : damp(this.smoothTarget.x, fx, 18, dt);
    this.smoothTarget.z = instant ? fz : damp(this.smoothTarget.z, fz, 18, dt);
    this.smoothTarget.y = instant ? fy : damp(this.smoothTarget.y, fy, 10, dt);
    const tx = this.smoothTarget.x, ty = this.smoothTarget.y + this.height, tz = this.smoothTarget.z;
    this.target.set(tx, ty, tz);

    // Anti-collision bâtiments : rapprocher la caméra si elle passe dans un mur. La perche est sondée tous les 0,4 m
    // (bout compris) à la hauteur réelle de la caméra (relevée au-dessus d'un véhicule), contre les obstacles gonflés
    // d'une marge et les débords de toit : elle s'arrête juste devant, jamais dans un auvent ni dans un tronc.
    let dist = this.targetDist;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirx = Math.sin(this.yaw) * cp, diry = sp, dirz = Math.cos(this.yaw) * cp;
    const cs = this.game.colliders;
    // À pied sous un toit (allée d'écurie, club-house) : perche sondée dès 0,3 m et raccourcie jusqu'à 0,3 m. Dos à
    // une façade de box, à moins de 1,2 m, la caméra se plaçait sinon dans la cloison (vue masquée par les grilles).
    // Dehors, inchangé (premier point à 1,2 m : les lices basses ne rapprochent pas la caméra).
    const ceil = this.game.colliders.ceilingAt(tx, tz);
    const near = mode === 'foot' && !!ceil ? 0.3 : 1.2;
    for (let d = near, last = false; !last; d += 0.4) {
      if (d >= this.targetDist) {
        d = this.targetDist;
        last = true;
      }
      const x = tx + dirx * d, z = tz + dirz * d;
      let y = ty + diry * d;
      const vt = cs.volumeTopAt(x, z, y - 0.3);
      if (vt > -Infinity) y = Math.max(y, vt + 0.7);
      if (cs.cameraBlocked(x, z, y)) {
        dist = Math.max(near, d - 0.45);
        break;
      }
    }
    this.dist = instant ? dist : dist < this.dist ? damp(this.dist, dist, 14, dt) : damp(this.dist, dist, 3, dt);
    let cx = tx + dirx * this.dist;
    let cy = ty + diry * this.dist;
    let cz = tz + dirz * this.dist;
    const ground = this.game.terrain.getHeight(cx, cz) + 0.6;
    if (cy < ground) cy = ground;
    // Dans un bâtiment (couloir d'écurie, club-house) : la caméra reste sous la charpente.
    if (ceil) {
      const cmax = this.game.colliders.ceilingY(ceil, cx, cz);
      if (cmax !== null && cy > cmax) cy = Math.max(cmax, ty - 0.2);
    }
    // Collé à un véhicule (camion à la rampe…) : la caméra s'élève au-dessus de la caisse au lieu de la traverser.
    const vt = this.game.colliders.volumeTopAt(cx, cz, cy - 0.3);
    const lift = vt > -Infinity ? Math.max(0, vt + 0.7 - cy) : 0;
    this.lift = instant ? lift : damp(this.lift || 0, lift, lift > (this.lift || 0) ? 12 : 3, dt);
    cy += this.lift;
    // Au-dessus de la mer : marge fixe au-dessus du niveau de la marée (crêtes des vagues comprises).
    if (this.game.terrain.waterDepth(cx, cz) > 0) cy = Math.max(cy, TIDE_UNIFORMS.tdLevel.value + 0.8);
    // Tremblement au grand galop.
    const shake = this.shake + (mode === 'ride' && focus.speed > 12 ? (focus.speed - 12) * 0.006 : 0);
    if (shake > 0) {
      cy += Math.sin(now * 31) * shake;
      cx += Math.sin(now * 23) * shake * 0.5;
    }
    this.shake = Math.max(0, this.shake - dt * 2);
    // Perche très courte (dos à une cloison, sous un toit) : la caméra est contre la tête du personnage ; on masque
    // son modèle (vue à la première personne) plutôt que de montrer l'intérieur de la tête. Les murs restent opaques.
    // (Le personnage recalcule sa visibilité à chaque mise à jour, avant la caméra : masqué ici pour cette image,
    // toujours animé.)
    const hu = this.game.player?.human;
    if (hu && mode === 'foot' && this.dist < 0.8) hu.mesh.visible = false;
    cam.position.set(cx, cy, cz);
    cam.lookAt(tx, ty + (mode === 'ride' ? 0.1 : 0), tz);
    const fovTarget = indoor ? CAM_INDOOR.fov : 60 + (mode === 'ride' ? clamp((focus.speed - 8) * 0.9, 0, 9) : mode === 'drive' ? clamp(Math.abs(focus.speed) * 0.3, 0, 7) : 0);
    this.fov = damp(this.fov, fovTarget, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  // Caméra de concours (voir CAM_COMP). Tient à jour l'état de la caméra commune (lacet, inclinaison, distance, cible)
  // pour que la sortie de l'épreuve se fasse sans saut d'image.
  _updateComp(dt, h, instant) {
    const C = CAM_COMP;
    const cam = this.camera;
    const g = this.game;
    const yawRate = h.jumpT >= 0 ? 0 : h._yawRate || 0;
    const want = h.heading + yawRate * C.lead;
    let st = this._comp;
    if (!st || instant) {
      // Entrée : on part de la caméra actuelle (cap vers le cheval), fondu vers le cadrage de concours.
      const ch = Math.atan2(h.pos.x - cam.position.x, h.pos.z - cam.position.z);
      st = this._comp = {
        cH: instant ? want : ch,
        w: 0,
        t: instant ? C.enter : 0,
        ax: h.pos.x, az: h.pos.z, ay: h.groundY,
        back: C.back,
        from: cam.position.clone(),
        fromLook: new THREE.Vector3(h.pos.x, h.groundY + 1.6, h.pos.z),
        aim: null,
      };
    }
    st.t += dt;
    // Lacet : vitesse angulaire bornée (rattrapage progressif), recentrage à toutes les vitesses (aussi après un refus).
    const d = angleDiff(st.cH, want);
    const wWant = d * C.yawK + (instant ? 0 : yawRate);
    st.w += clamp(wWant - st.w, -C.yawAcc * dt, C.yawAcc * dt);
    st.cH = instant ? want : st.cH + st.w * dt;
    // Ancrage : le cheval, suivi en douceur (au sol plus qu'en l'air).
    const kp = instant ? 1 : 1 - Math.exp(-C.posK * dt);
    st.ax += (h.pos.x - st.ax) * kp;
    st.az += (h.pos.z - st.az) * kp;
    const ay = h.groundY + Math.max(0, h.jumpY) * C.jumpFollow;
    st.ay += (ay - st.ay) * (instant ? 1 : 1 - Math.exp(-C.yK * dt));
    const fx = Math.sin(st.cH), fz = Math.cos(st.cH);
    // Perche : de la tête du cavalier vers l'arrière ; tribune ou bâtiment sur le chemin : la caméra se rapproche.
    const cs = g.colliders;
    let back = C.back;
    for (let q = 1.0; q <= C.back + 1e-6; q += 0.4) {
      const x = st.ax - fx * q, z = st.az - fz * q;
      const y = st.ay + 2.2 + (C.up - 2.2) * (q / C.back);
      if (cs.cameraBlocked(x, z, y)) {
        back = Math.max(C.minBack, q - 0.45);
        break;
      }
    }
    st.back = instant ? back : damp(st.back, back, back < st.back ? 10 : 2.5, dt);
    let cx = st.ax - fx * st.back, cz = st.az - fz * st.back;
    let cy = st.ay + C.up;
    // Obstacle survolé (après une réception, dans une courbe) : la caméra passe au-dessus, jamais au travers.
    for (const o of g.obstacles?.list || []) {
      if (o.off || Math.abs(o.x - cx) > 4 || Math.abs(o.z - cz) > 4) continue;
      const ls = (cx - o.x) * o.n.x + (cz - o.z) * o.n.z;
      const lu = (cx - o.x) * o.t.x + (cz - o.z) * o.t.z;
      if (Math.abs(lu) < o.w / 2 + 2.4 && Math.abs(ls) < (o.depth || 1) / 2 + 0.8) cy = Math.max(cy, o.ground + o.h + 0.75 + C.fenceClear);
    }
    cy = Math.max(cy, Math.max(h.groundY, g.terrain.getHeight(cx, cz)) + 0.8);
    // Point visé : devant le cheval, légèrement attiré par l'obstacle suivant quand il est devant.
    let lx = st.ax + fx * C.lookAhead, lz = st.az + fz * C.lookAhead;
    const ly = st.ay + C.lookUp;
    const nx = g.course?.next;
    if (nx) {
      const dx = nx.x - st.ax, dz = nx.z - st.az, dd = Math.hypot(dx, dz);
      if (dd > 1 && dd < C.fenceRange && (dx * fx + dz * fz) / dd > 0.5) {
        const k = C.fenceBias * (1 - smoothstep(C.fenceRange * 0.6, C.fenceRange, dd));
        lx += (nx.x - lx) * k;
        lz += (nx.z - lz) * k;
      }
    }
    if (!st.aim || instant) st.aim = new THREE.Vector3(lx, ly, lz);
    else {
      const ka = 1 - Math.exp(-4 * dt);
      st.aim.x += (lx - st.aim.x) * ka;
      st.aim.y += (ly - st.aim.y) * ka;
      st.aim.z += (lz - st.aim.z) * ka;
    }
    // Fondu d'entrée depuis la caméra précédente.
    const e = smoothstep(0, C.enter, st.t);
    const px = st.from.x + (cx - st.from.x) * e, py = st.from.y + (cy - st.from.y) * e, pz = st.from.z + (cz - st.from.z) * e;
    cam.position.set(px, py, pz);
    cam.lookAt(st.fromLook.x + (st.aim.x - st.fromLook.x) * e, st.fromLook.y + (st.aim.y - st.fromLook.y) * e, st.fromLook.z + (st.aim.z - st.fromLook.z) * e);
    this.fov = instant ? C.fov : damp(this.fov, C.fov, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    this.shake = 0;
    // État commun recalé sur la position réelle : à la sortie de l'épreuve, la caméra du monde ouvert repart d'ici.
    this.height = 2.35;
    this.ahead = 0;
    this.smoothTarget.set(h.pos.x, h.pos.y, h.pos.z);
    const tx = h.pos.x, ty = h.pos.y + this.height, tz = h.pos.z;
    const vx = px - tx, vy = py - ty, vz = pz - tz;
    const dist = Math.max(0.5, Math.hypot(vx, vy, vz));
    this.yaw = Math.atan2(vx, vz);
    this.pitch = Math.asin(clamp(vy / dist, -1, 1));
    this.dist = this.targetDist = dist;
    this.target.set(tx, ty, tz);
    this.swing = 0;
    this.lastManual = this.game.time;
  }

  // Perche dégagée si l'on tourne du côté s : points à 25-100 % de la distance cible, à 0,6 et 1,2 rad du lacet
  // actuel, ni dans un obstacle haut ni sous le gabarit d'un véhicule.
  _boomFree(s) {
    const c = this.game.colliders;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const tx = this.smoothTarget.x, ty = this.smoothTarget.y + this.height, tz = this.smoothTarget.z;
    for (let j = 1; j <= 2; j++) {
      const a = this.yaw + s * 0.6 * j;
      const ax = Math.sin(a) * cp, az = Math.cos(a) * cp;
      for (let i = 1; i <= 4; i++) {
        const d = (this.targetDist * i) / 4;
        const x = tx + ax * d, y = ty + sp * d, z = tz + az * d;
        if (c.blocked(x, z, y - 0.5) || c.volumeTopAt(x, z, y - 0.3) > -Infinity) return false;
      }
    }
    return true;
  }

  // Direction monde correspondant au joystick (y = vers l'avant de la caméra).
  worldDir(mx, my) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    return { x: fx * my + rx * mx, z: fz * my + rz * mx };
  }
}

export { lerp };
