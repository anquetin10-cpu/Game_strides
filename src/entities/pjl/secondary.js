// Repris de Jumping League Sim (dépôt anquetin10-cpu/PGL_Game-, branche claude/pjl-jumping-game, commit afa56f9c,
// fichier src/render/horse/SecondaryMotion.ts), converti de TypeScript en JavaScript (types retirés, logique inchangée sauf
// mention « Equestrian Tour »). Modèle de cheval : « Realistic Animated Horse » par WildMesh 3D, CC BY 4.0
// (voir public/real/LICENSES.md).
import * as THREE from 'three';
import { clamp, clamp01, smoothstep } from './math.js';
const spring = () => ({ x: 0, v: 0 });
function stepSpring(s, target, k, c, dt) {
    // semi-implicit Euler, sub-stepped for stability
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
        s.v += (k * (target - s.x) - c * s.v) * h;
        s.x += s.v * h;
    }
    return s.x;
}
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _bq = new THREE.Quaternion();
const _lat = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
/** Rotate a bone by `angle` about a world-space axis, expressed in the bone's parent space. */
function rotateWorld(bone, axisWorld, angle) {
    if (Math.abs(angle) < 1e-5 || !bone.parent)
        return;
    bone.parent.getWorldQuaternion(_pq);
    _ax.copy(axisWorld).applyQuaternion(_pq.invert()).normalize();
    _q.setFromAxisAngle(_ax, angle);
    bone.quaternion.premultiply(_q);
}
export class SecondaryMotion {
    body;
    tail = [];
    mane = [];
    neck = [];
    head = null;
    ears = [];
    tailPitch = [];
    tailYaw = [];
    maneRoll = spring();
    bascule = spring();
    headLift = spring();
    earPrick = spring();
    prevSpeed = 0;
    prevY = 1.3;
    prevVy = 0;
    enabled = true;
    constructor(bones, body) {
        this.body = body;
        for (const n of ['tail_02', 'tail_03', 'tail_04', 'tail_05', 'dyn_tail_06', 'dyn_tail_07', 'dyn_tail_08']) {
            const b = bones.get(n);
            if (b)
                this.tail.push(b);
        }
        for (const n of ['dyn_new_neck_02_01', 'dyn_new_neck_03_01', 'dyn_new_neck_04_01', 'dyn_new_neck_05_01']) {
            const b = bones.get(n);
            if (b)
                this.mane.push(b);
        }
        for (const n of ['neck_02', 'neck_03', 'neck_04']) {
            const b = bones.get(n);
            if (b)
                this.neck.push(b);
        }
        this.head = bones.get('head') ?? null;
        for (const n of ['ear_01_l', 'ear_01_r']) {
            const b = bones.get(n);
            if (b)
                this.ears.push(b);
        }
        this.tailPitch = this.tail.map(() => spring());
        this.tailYaw = this.tail.map(() => spring());
    }
    setEnabled(on) {
        this.enabled = on;
    }
    update(s, dt, approaching) {
        if (!this.enabled || dt <= 0)
            return;
        dt = Math.min(dt, 1 / 20);
        // horse-space axes in world coordinates (lateral = pitch axis, up = yaw axis, forward = roll axis)
        // (getWorldQuaternion refreshes the ancestors only — no full skeleton matrix update here)
        const bq = this.body.getWorldQuaternion(_bq);
        const lat = _lat.set(1, 0, 0).applyQuaternion(bq);
        const up = _up.set(0, 1, 0).applyQuaternion(bq);
        const fwd = _fwd.set(0, 0, 1).applyQuaternion(bq);
        // accelerations seen by the body
        const accel = clamp((s.speed - this.prevSpeed) / dt, -12, 12);
        const vy = (s.y - this.prevY) / dt;
        const ay = clamp((vy - this.prevVy) / dt, -40, 40);
        this.prevSpeed = s.speed;
        this.prevY = s.y;
        this.prevVy = vy;
        const air = s.mode === 'air' || s.mode === 'takeoff';
        const jumpS = s.jT > 0 ? clamp01(s.jt / s.jT) : 0;
        const canter = s.gait === 'canter' ? 1 : s.gait === 'trot' ? 0.5 : 0;
        const beat = Math.sin(s.phase * Math.PI * 2);
        // ---- tail: carriage lifts with impulsion and streams in the air; waves with the stride
        let tgtPitch = -0.08 * canter - 0.012 * accel + 0.006 * ay - (air ? 0.18 * Math.sin(Math.PI * jumpS) : 0);
        tgtPitch += 0.06 * canter * beat;
        const tgtYaw = clamp(-s.turnRate * 0.35, -0.35, 0.35);
        let prevP = tgtPitch, prevYw = tgtYaw;
        for (let i = 0; i < this.tail.length; i++) {
            const stiff = 90 - i * 9; // tip is looser
            const p = stepSpring(this.tailPitch[i], prevP, stiff, 9, dt);
            const y = stepSpring(this.tailYaw[i], prevYw, stiff * 0.8, 8, dt);
            const w = 0.35 + 0.1 * i;
            rotateWorld(this.tail[i], lat, -p * w);
            rotateWorld(this.tail[i], up, y * w);
            prevP = p;
            prevYw = y;
        }
        // ---- mane: lateral sway with the canter rhythm and turns
        const roll = stepSpring(this.maneRoll, 0.05 * canter * beat + clamp(s.turnRate * 0.08, -0.1, 0.1), 60, 7, dt);
        for (let i = 0; i < this.mane.length; i++)
            rotateWorld(this.mane[i], fwd, roll * (0.6 + 0.2 * i));
        // ---- bascule: neck forward/down over the fence, head up on the take-off stride and on landing
        const basc = air && s.jt >= 0 ? Math.sin(Math.PI * Math.min(1, jumpS * 1.05)) : 0;
        const b = stepSpring(this.bascule, 0.2 * basc, 140, 18, dt);
        for (let i = 0; i < this.neck.length; i++)
            rotateWorld(this.neck[i], lat, b * (0.25 + 0.12 * i));
        const lift = (s.mode === 'takeoff' ? 0.12 : 0) + (s.mode === 'landing' ? 0.1 * smoothstep(0, 0.2, s.landingTimer) : 0);
        const hl = stepSpring(this.headLift, lift, 120, 16, dt);
        if (this.head)
            rotateWorld(this.head, lat, -hl - b * 0.15);
        // ---- ears: pricked toward the fence on the approach
        const prick = stepSpring(this.earPrick, approaching ? 1 : 0, 30, 9, dt);
        // positive rotation about the lateral axis tips anything above the pivot forward (+Z): ears pricked forward
        for (const e of this.ears)
            rotateWorld(e, lat, 0.22 * prick);
    }
}
