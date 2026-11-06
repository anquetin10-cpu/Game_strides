// Repris de Jumping League Sim (dépôt anquetin10-cpu/PGL_Game-, branche claude/pjl-jumping-game, commit afa56f9c,
// fichier src/render/horse/HorseView.ts), converti de TypeScript en JavaScript. Un cheval : modèle skinné WildMesh +
// locomotion par clips synchronisée sur la phase de foulée, sauts calés sur la trajectoire, mouvements secondaires
// (queue, crinière, encolure, oreilles), sellerie skinnée sur le squelette.
// Equestrian Tour : la vue est pilotée par pjlHorse.js, qui lui donne un état au format de la simulation de la
// source (allure, main, phase, virage, saut) calculé depuis le cheval du jeu ; la racine est placée par le cheval du
// jeu (position, cap, pente). Changements marqués « ET » : choix du clip de saut selon les vitesses du jeu,
// visibilité des pièces de sellerie selon l'équipement, robe mouillée.
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { baseName } from './names.js';
import { SecondaryMotion } from './secondary.js';
import { makeCoatMaterial, makeHairMaterial } from './coat.js';
import { clamp, clamp01, damp, lerp, smoothstep } from './math.js';
// Hauteur du centre de masse au galop (source : core/sim/jumpModel.ts).
export const COM_CANTER_HEIGHT = 1.3;
export const DEFAULT_TACK = { pad: '#f3f2ee', trim: '#1c2a4a', bonnet: '#1c2a4a', boots: '#151515', leather: '#2a170c' };
export class HorseView {
    root = new THREE.Group(); // positioned on the ground at the sim's root (x, z), yaw = heading
    body = new THREE.Group(); // vertical offset / lean
    model;
    asset;
    mixer;
    bones = new Map();
    actions = new Map();
    weights = new Map();
    jumpWeight = 0;
    jumpClip = null;
    jumpMirror = false;
    jumpTime = 0;
    postLand = -1; // seconds since fore landing (view-side continuation)
    lastJt = 0;
    wasJumping = false;
    refusalT = -1;
    leadBlend = 1; // 1 = right lead clips, 0 = left lead (mirrored)
    idleTime = 0;
    materials = null;
    /** Saddle attachment for the rider (a bone of the horse rig). */
    saddleBone;
    headBone;
    /** Procedural tail/mane/neck/ear layers on top of the clips. */
    secondary = null;
    /** Set by the scene: the horse is on the approach to its next fence (ears pricked). */
    approaching = false;
    constructor(asset, coat) {
        this.asset = asset;
        this.model = skeletonClone(asset.scene);
        const inner = new THREE.Group();
        inner.rotation.y = -asset.yaw;
        inner.scale.setScalar(asset.scale);
        inner.position.y = -asset.groundY * asset.scale;
        inner.add(this.model);
        this.body.add(inner);
        this.root.add(this.body);
        let coatMat = null;
        let hairMat = null;
        this.model.traverse((o) => {
            const sm = o;
            if (o.isBone)
                this.bones.set(baseName(o.name), o);
            if (!sm.isSkinnedMesh)
                return;
            sm.castShadow = true;
            sm.receiveShadow = true;
            sm.frustumCulled = false;
            const mat = sm.material;
            if (mat.name === 'horse_body')
                sm.material = coatMat = makeCoatMaterial(mat, coat);
            else if (mat.name === 'horse_hair') {
                sm.material = hairMat = makeHairMaterial(mat, coat);
                sm.castShadow = true;
            }
            else if (mat.name === 'horse_eye') {
                const em = mat.clone();
                em.roughness = 0.08;
                em.envMapIntensity = 1.5;
                sm.material = em;
            }
        });
        if (coatMat && hairMat)
            this.materials = { coat: coatMat, hair: hairMat };
        this.buildTackMeshes(DEFAULT_TACK);
        this.saddleBone = this.bones.get('saddle') ?? this.bones.get('spine_02');
        this.headBone = this.bones.get('head');
        this.secondary = new SecondaryMotion(this.bones, this.body);
        this.mixer = new THREE.AnimationMixer(this.model);
        for (const [name, clip] of asset.clips) {
            const a = this.mixer.clipAction(clip);
            a.play();
            a.setEffectiveWeight(0);
            a.enabled = true;
            a.timeScale = 0; // we drive time explicitly
            this.actions.set(name, a);
            this.weights.set(name, 0);
        }
        this.setWeight('idle', 1, true);
    }
    tackMats = {};
    tackMeshes = [];
    bodyMesh = null;
    _am = new THREE.Matrix4();
    _bm = new THREE.Matrix4();
    /** Live world position of a tack anchor (seat, barL/R, bitL/R, withers, crest), following the skinned body. */
    anchorWorld(name, out = new THREE.Vector3()) {
        const a = this.asset.tack.anchorLocal[name];
        const b = this.bodyMesh;
        if (!a || !b)
            return out;
        const e = this._am.elements;
        e.fill(0);
        const sk = b.skeleton;
        for (let k = 0; k < 4; k++) {
            const w = a.w[k];
            if (w <= 0)
                continue;
            this._bm.multiplyMatrices(sk.bones[a.idx[k]].matrixWorld, sk.boneInverses[a.idx[k]]).multiply(b.bindMatrix);
            const m = this._bm.elements;
            for (let j = 0; j < 16; j++)
                e[j] += m[j] * w;
        }
        return out.copy(a.p).applyMatrix4(this._am);
    }
    buildTackMeshes(c) {
        let body = null;
        this.model.traverse((o) => {
            const sm = o;
            if (sm.isSkinnedMesh && sm.material.name === 'horse_body')
                body = sm;
        });
        if (!body)
            return;
        const b = body;
        this.bodyMesh = b;
        const t = this.asset.tack;
        const leather = new THREE.MeshStandardMaterial({ color: c.leather, roughness: 0.5, metalness: 0, envMapIntensity: 0.55 });
        const m = {
            pad: quiltMaterial(c.pad),
            padTrim: new THREE.MeshStandardMaterial({ color: c.trim, roughness: 0.8 }),
            saddle: leather,
            girth: new THREE.MeshStandardMaterial({ color: '#151311', roughness: 0.55 }),
            bridle: leather,
            bit: new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.22, metalness: 1 }),
            boots: new THREE.MeshStandardMaterial({ color: c.boots, roughness: 0.6 }),
            bonnet: new THREE.MeshStandardMaterial({ color: c.bonnet, roughness: 0.95, side: THREE.DoubleSide }),
        };
        Object.assign(this.tackMats, m);
        for (const key of Object.keys(m)) {
            const geo = t[key];
            if (!geo || !geo.getAttribute('position') || geo.getAttribute('position').count === 0)
                continue;
            const mesh = new THREE.SkinnedMesh(geo, m[key]);
            mesh.name = 'tack_' + key;
            mesh.position.copy(b.position);
            mesh.quaternion.copy(b.quaternion);
            mesh.scale.copy(b.scale);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            b.parent.add(mesh);
            this.tackMeshes.push(mesh);
            mesh.bind(b.skeleton, b.bindMatrix);
        }
    }
    // ET : pièces de sellerie affichées selon l'équipement du cheval du jeu ({ saddle, bridle, boots, bonnet }).
    setTackVisible(v) {
        for (const o of this.tackMeshes) {
            const k = o.name.slice(5);
            o.visible = k === 'pad' || k === 'padTrim' || k === 'saddle' || k === 'girth' ? !!v.saddle : k === 'bridle' || k === 'bit' ? !!v.bridle : k === 'boots' ? !!v.boots : k === 'bonnet' ? !!v.bonnet : true;
        }
    }
    // ET : robe mouillée (0..1 : sueur, pluie, eau).
    setWet(w) {
        const u = this.materials?.coat.userData.coatUniforms;
        if (u?.uWet)
            u.uWet.value = w;
    }
    setTackColours(c) {
        if (c.pad)
            this.tackMats.pad.userData.colour.set(c.pad);
        if (c.trim)
            this.tackMats.padTrim.color.set(c.trim);
        if (c.bonnet)
            this.tackMats.bonnet.color.set(c.bonnet);
        if (c.boots)
            this.tackMats.boots.color.set(c.boots);
        if (c.leather) {
            this.tackMats.saddle.color.set(c.leather);
        }
    }
    setCoat(coat) {
        if (!this.materials)
            return;
        const u = this.materials.coat.userData.coatUniforms;
        const fresh = makeCoatMaterial(this.materials.coat, coat).userData.coatUniforms;
        for (const k of Object.keys(u))
            u[k].value = fresh[k].value;
        const h = this.materials.hair.userData.hairUniform;
        h.value.copy(makeHairMaterial(this.materials.hair, coat).userData.hairUniform.value);
    }
    setWeight(name, w, immediate = false) {
        const a = this.actions.get(name);
        if (!a)
            return;
        const cur = this.weights.get(name) ?? 0;
        this.weights.set(name, immediate ? w : w);
        void cur;
    }
    /**
     * Update from a simulation snapshot.
     * @param s  current sim snapshot
     * @param dt frame delta (s)
     */
    update(s, dt) {
        const a = this.asset;
        // ---- Root transform
        this.root.position.set(s.x, 0, s.z);
        this.root.rotation.set(0, s.heading, 0);
        const jumping = s.mode === 'takeoff' || s.mode === 'air';
        // target weights
        const target = new Map();
        for (const k of this.actions.keys())
            target.set(k, 0);
        // Lead: right-lead clips are the originals, left-lead the mirrored ones
        const wantRight = s.lead === 'R' ? 1 : 0;
        this.leadBlend = damp(this.leadBlend, wantRight, 10, dt);
        if (jumping && !this.wasJumping) {
            // pick the jump clip (gallop version for faster approaches, it has a longer flight)
            // ET : galop de travail du jeu à 6,5 m/s (source : 5,4 m/s) ; le saut « galop » au-delà de 8 m/s.
            this.jumpClip = a.jumps.get(s.speed > 8 ? 'jump_gallop' : 'jump_canter') ?? a.jumps.get('jump_gallop');
            this.jumpMirror = s.lead === 'L';
            this.postLand = -1;
        }
        if (!jumping && this.wasJumping) {
            this.postLand = 0; // landed: continue the clip for the landing stride
        }
        this.wasJumping = jumping;
        let rootY = 0;
        if (jumping && this.jumpClip) {
            const j = this.jumpClip;
            const T = Math.max(0.3, s.jT);
            const jt = s.jt;
            let ct;
            if (jt < 0)
                ct = j.toeOff + jt * 1.0;
            else
                ct = j.toeOff + (jt / T) * (j.foreLand - j.toeOff);
            this.jumpTime = clamp(ct, 0, j.end);
            this.lastJt = jt;
            this.jumpWeight = damp(this.jumpWeight, 1, 18, dt);
            const rise = this.pelvisRise(j, this.jumpTime);
            rootY = s.y - COM_CANTER_HEIGHT - rise * a.scale;
        }
        else if (this.postLand >= 0 && this.jumpClip) {
            const j = this.jumpClip;
            this.postLand += dt;
            this.jumpTime = j.foreLand + this.postLand;
            const blendOut = smoothstep(j.nextFore - j.foreLand - 0.18, j.nextFore - j.foreLand + 0.05, this.postLand);
            this.jumpWeight = 1 - blendOut;
            const rise = this.pelvisRise(j, Math.min(this.jumpTime, j.end));
            rootY = Math.max(-0.08, -rise * a.scale) * this.jumpWeight;
            if (blendOut >= 1 || this.jumpTime >= j.end) {
                this.postLand = -1;
                this.jumpWeight = 0;
            }
        }
        else {
            this.jumpWeight = damp(this.jumpWeight, 0, 12, dt);
        }
        // Refusal: sliding stop clip
        if (s.mode === 'refusal') {
            if (this.refusalT < 0)
                this.refusalT = 0;
            this.refusalT += dt;
        }
        else if (this.refusalT >= 0) {
            this.refusalT = -1;
        }
        const refusalW = this.refusalT >= 0 ? clamp01(this.refusalT / 0.15) * (1 - smoothstep(1.6, 2.0, this.refusalT)) : 0;
        // ---- Gait weights
        const groundW = (1 - this.jumpWeight) * (1 - refusalW);
        const gw = { idle: 0, walk: 0, trot: 0, canter: 0, gallop: 0 };
        if (s.gait === 'halt' || s.speed < 0.25)
            gw.idle = 1;
        else if (s.gait === 'walk')
            gw.walk = 1;
        else if (s.gait === 'trot')
            gw.trot = 1;
        else {
            const g = smoothstep(3.55, 4.45, s.strideLen);
            gw.canter = 1 - g;
            gw.gallop = g;
        }
        // turning: blend L90/R90 variants
        const turn = clamp(s.turnRate / 0.95, -1, 1);
        const turnW = Math.min(1, Math.abs(turn)) * 0.85;
        const side = turn > 0 ? 'L90' : 'R90';
        for (const k of ['walk', 'trot', 'canter', 'gallop']) {
            const w = gw[k] * groundW;
            if (w <= 0)
                continue;
            const hasMirror = this.actions.has(k + '_M');
            const rightW = hasMirror ? this.leadBlend : 1;
            const leftW = hasMirror ? 1 - this.leadBlend : 0;
            const straightR = k, turnR = `${k}_${side}`;
            const straightL = `${k}_M`, turnL = `${k}_${side}_M`;
            add(target, straightR, w * rightW * (1 - turnW));
            add(target, this.actions.has(turnR) ? turnR : straightR, w * rightW * turnW);
            if (leftW > 0) {
                add(target, straightL, w * leftW * (1 - turnW));
                add(target, this.actions.has(turnL) ? turnL : straightL, w * leftW * turnW);
            }
        }
        add(target, 'idle', gw.idle * groundW);
        if (this.jumpClip) {
            const jn = this.jumpClip.name + (this.jumpMirror ? '_M' : '');
            add(target, this.actions.has(jn) ? jn : this.jumpClip.name, this.jumpWeight);
        }
        add(target, 'brake', refusalW);
        // ---- Apply weights (smoothed) and clip times
        const lambda = 14;
        for (const [name, act] of this.actions) {
            const w = damp(this.weights.get(name) ?? 0, target.get(name) ?? 0, lambda, dt);
            this.weights.set(name, w);
            act.setEffectiveWeight(w);
            act.enabled = w > 0.002;
            if (!act.enabled)
                continue;
            const clip = act.getClip();
            const k = name.split('_')[0];
            if (name.startsWith('jump')) {
                act.time = Math.min(this.jumpTime, clip.duration - 1e-3);
            }
            else if (name === 'brake') {
                act.time = Math.min(this.refusalT * 1.15 + 0.2, clip.duration - 1e-3);
            }
            else if (name === 'idle') {
                this.idleTime = (this.idleTime + dt) % clip.duration;
                act.time = this.idleTime;
            }
            else if (k === 'walk' || k === 'trot' || k === 'canter' || k === 'gallop') {
                const info = a.gaitInfo[k];
                const ph = (s.phase + info.offset) % 1;
                act.time = ph * clip.duration;
            }
        }
        this.mixer.update(0);
        // ---- Body: vertical offset & lean into turns
        this.body.position.y = damp(this.body.position.y, rootY, 30, dt);
        if (Math.abs(this.body.position.y - rootY) > 0.25)
            this.body.position.y = rootY;
        const lean = clamp(s.roll, -0.3, 0.3) * 0.75 * (1 - this.jumpWeight);
        this.body.rotation.z = damp(this.body.rotation.z, -lean, 8, dt);
        this.secondary?.update(s, dt, this.approaching);
    }
    pelvisRise(j, t) {
        const f = clamp(t * 24, 0, j.pelvisRise.length - 1);
        const i = Math.floor(f);
        const k = f - i;
        return lerp(j.pelvisRise[i], j.pelvisRise[Math.min(i + 1, j.pelvisRise.length - 1)], k);
    }
    /** World position of a bone (by base name). */
    boneWorld(base, out = new THREE.Vector3()) {
        const b = this.bones.get(base);
        if (b)
            out.setFromMatrixPosition(b.matrixWorld);
        return out;
    }
    dispose() {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.model);
    }
}
function quiltMaterial(colour) {
    const m = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92 });
    m.userData.colour = m.color;
    m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 q = vUv * vec2(14.0, 12.0);
    float l1 = abs(fract(q.x + q.y) - 0.5);
    float l2 = abs(fract(q.x - q.y) - 0.5);
    float quilt = smoothstep(0.0, 0.06, min(l1, l2));
    diffuseColor.rgb *= mix(0.78, 1.0, quilt);
  }`);
        sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifndef USE_UV\nvUv = uv;\n#endif');
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n#ifndef USE_UV\nvarying vec2 vUv;\n#endif');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n#ifndef USE_UV\nvarying vec2 vUv;\n#endif');
    };
    m.customProgramCacheKey = () => 'quilt-v1';
    return m;
}
function add(m, k, w) {
    if (!m.has(k))
        return;
    m.set(k, (m.get(k) ?? 0) + w);
}

