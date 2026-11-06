// Repris de Jumping League Sim (dépôt anquetin10-cpu/PGL_Game-, branche claude/pjl-jumping-game, commit afa56f9c,
// fichier src/render/horse/HorseAsset.ts), converti de TypeScript en JavaScript. Données partagées du cheval WildMesh
// (« Realistic Animated Horse », WildMesh 3D, CC BY 4.0 — voir public/real/LICENSES.md), préparées une fois puis
// clonées pour chaque cheval :
//  - mouvement de la racine retiré des clips (la simulation déplace le cheval) ;
//  - clips à main gauche construits en miroir des clips à main droite, longueurs d'os conservées (correction de la
//    source : plus de postérieur étiré à chaque foulée à gauche) ;
//  - masques de robe par sommet (bas des membres, balzanes, liste) calculés depuis les poids de peau ;
//  - mesures : échelle (cm → m), sol (sole des sabots), orientation (le modèle regarde +X, le jeu +Z) ;
//  - contacts des sauts (départ des postérieurs, réception des antérieurs) mesurés sur les sabots des clips ;
//  - sellerie anglaise (tapis, selle, sangle, filet, mors, guêtres, bonnet) construite sur la surface du cheval.
// Equestrian Tour : chargement du fichier par le jeu (`loadGltf`, public/real/horse_pjl.glb) au lieu du chargeur de
// la source ; mesure ajoutée des appuis de chaque clip d'allure (`gaitContacts`), pour caler les clips sur la
// foulée du cheval du jeu (voir pjlHorse.js) ; journal de préparation (durées) gardé dans `asset.stats`.
import * as THREE from 'three';
import { buildTack } from './tack.js';
import { baseName } from './names.js';
const FPS = 24;
let assetPromise = null;
// Préparation unique (une promesse partagée) ; `loadGltf()` rend le glTF chargé (scène, animations). Échec : la
// promesse est oubliée, un nouvel essai reste possible.
export function loadHorseAsset(loadGltf) {
    if (!assetPromise)
        assetPromise = prepare(loadGltf).catch((e) => {
            assetPromise = null;
            throw e;
        });
    return assetPromise;
}
export { baseName };
// Asset préparé, s'il est prêt (sinon null).
let readyAsset = null;
export const horseAssetNow = () => readyAsset;
// Libère l'asset (appareils à mémoire limitée, plus aucun cheval ne l'affiche).
export function releaseHorseAsset() {
    readyAsset = null;
    assetPromise = null;
}
async function prepare(loadGltf) {
    const T0 = performance.now();
    const gltf = await loadGltf();
    const tLoad = performance.now() - T0;
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    // ---- Strip root motion from every clip
    const clips = new Map();
    for (const c of gltf.animations) {
        const clip = c.clone();
        clip.tracks = clip.tracks.filter((t) => {
            const node = t.name.split('.')[0];
            return !(node === 'root_04' || node === '_rootJoint' || node === 'rootmountpoint_01_0289');
        });
        clips.set(c.name, clip);
    }
    // ---- Skeleton & bones
    let skinned = null;
    scene.traverse((o) => {
        if (o.isSkinnedMesh && !skinned)
            skinned = o;
    });
    if (!skinned)
        throw new Error('horse: no skinned mesh');
    const skel = skinned.skeleton;
    const bones = skel.bones;
    const byBase = new Map();
    for (const b of bones)
        byBase.set(baseName(b.name), b);
    const bone = (base) => byBase.get(base);
    const restLocal = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
    const resetPose = () => {
        bones.forEach((b, i) => {
            b.position.copy(restLocal[i].p);
            b.quaternion.copy(restLocal[i].q);
            b.scale.copy(restLocal[i].s);
        });
        scene.updateMatrixWorld(true);
    };
    // ---- Coat masks on the body geometry (bind pose)
    scene.traverse((o) => {
        const sm = o;
        if (sm.isSkinnedMesh && sm.material.name === 'horse_body')
            buildCoatMasks(sm, byBase);
    });
    // ---- Metrics from a canter frame (bones are posed by the clip)
    const tmpMixer = new THREE.AnimationMixer(scene);
    const pose = (clipName, t) => {
        tmpMixer.stopAllAction();
        const a = tmpMixer.clipAction(clips.get(clipName));
        a.reset().play();
        tmpMixer.setTime(t);
        scene.updateMatrixWorld(true);
    };
    const wpos = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    pose('canter', 0.0);
    const hoofNames = ['fingers_02_l', 'fingers_02_r', 'toes_02_l', 'toes_02_r'];
    let groundY = Infinity;
    // average over the canter cycle for robust ground estimate
    for (let i = 0; i < 17; i++) {
        pose('canter', i / FPS);
        for (const h of hoofNames)
            groundY = Math.min(groundY, wpos(bone(h)).y);
    }
    // The hoof joints sit a few cm above the sole: taking them as the ground buried the hooves at mid-stance
    // (the planted leg looked like a post stuck in the sand). Use the lowest SKINNED hoof vertex over the same
    // canter cycle instead (only the lowest vertices of the body mesh in bind pose are tested, for speed).
    let soleGround = groundY; // vertical placement; the size calibration below keeps using the hoof joints
    {
        let body = null;
        scene.traverse((o) => {
            const sm = o;
            const mat = sm.material;
            if (sm.isSkinnedMesh && mat && /body/i.test(mat.name))
                body = sm; // not the hair cards (mane/tail)
        });
        if (body) {
            const bm = body;
            const pa = bm.geometry.attributes.position;
            const tmp = new THREE.Vector3();
            const ys = [];
            for (let i = 0; i < pa.count; i++)
                ys.push(tmp.fromBufferAttribute(pa, i).applyMatrix4(bm.bindMatrix).y);
            const sorted = [...ys].sort((a, b) => a - b);
            const cut = sorted[Math.floor(sorted.length * 0.04)];
            const low = [];
            ys.forEach((y, i) => { if (y <= cut)
                low.push(i); });
            let sole = Infinity;
            for (let f = 0; f < 17; f++) {
                pose('canter', f / FPS);
                for (const i of low) {
                    tmp.fromBufferAttribute(pa, i);
                    bm.applyBoneTransform(i, tmp);
                    tmp.applyMatrix4(bm.matrixWorld);
                    if (tmp.y < sole)
                        sole = tmp.y;
                }
            }
            console.info('[horse] ground: hoof soles', sole.toFixed(4), 'hoof joints', groundY.toFixed(4));
            if (Number.isFinite(sole) && sole < groundY)
                soleGround = sole;
        }
    }
    pose('idle', 0.5);
    const withers = wpos(bone('spine_04'));
    const head = wpos(bone('head'));
    const tail = wpos(bone('tail_01'));
    const lf = wpos(bone('upperarm_l'));
    const rf = wpos(bone('upperarm_r'));
    // Model forward axis (tail → head) and lateral axis (right → left)
    const fwd = new THREE.Vector3().subVectors(head, tail).setY(0).normalize();
    const yaw = Math.atan2(fwd.x, fwd.z); // angle of model forward from +Z
    const withersJointH = withers.y - groundY;
    // spine_04 joint sits ~0.2 m under the skin at the withers; target 1.68 m horse
    const scale = (1.68 - 0.2) / withersJointH;
    // size unchanged (as calibrated on the hoof joints); placement uses the soles so planted hooves stay on the ground
    groundY = soleGround;
    void lf;
    void rf;
    // ---- Mirrored (left-lead) clips
    const lateral = new THREE.Vector3().subVectors(wpos(bone('upperarm_l')), wpos(bone('upperarm_r'))).normalize();
    const mid = new THREE.Vector3().addVectors(wpos(bone('upperarm_l')), wpos(bone('upperarm_r'))).multiplyScalar(0.5);
    for (const name of ['canter', 'canter_L90', 'canter_R90', 'gallop', 'gallop_L90', 'gallop_R90', 'jump_canter', 'jump_gallop', 'trot', 'trot_L90', 'trot_R90']) {
        const src = clips.get(name);
        if (!src)
            continue;
        resetPose();
        const m = bakeMirror(src, scene, bones, byBase, lateral, mid);
        // swap turn direction in the name: mirrored L90 turns right
        const mName = name.includes('_L90') ? name.replace('_L90', '_R90') + '_M' : name.includes('_R90') ? name.replace('_R90', '_L90') + '_M' : name + '_M';
        m.name = mName;
        clips.set(mName, m);
    }
    // ---- Jump clip analysis (contacts from hoof heights)
    const jumps = new Map();
    pose('canter', 0);
    let canterPelvis = 0;
    for (let i = 0; i < 17; i++) {
        pose('canter', i / FPS);
        canterPelvis += wpos(bone('pelvis')).y / 17;
    }
    for (const jn of ['jump_canter', 'jump_gallop']) {
        const clip = clips.get(jn);
        if (!clip)
            continue;
        const n = Math.round(clip.duration * FPS) + 1;
        const H = { LF: [], RF: [], LH: [], RH: [] };
        const rise = [];
        for (let i = 0; i < n; i++) {
            pose(jn, Math.min(clip.duration, i / FPS));
            H.LF.push(wpos(bone('fingers_02_l')).y);
            H.RF.push(wpos(bone('fingers_02_r')).y);
            H.LH.push(wpos(bone('toes_02_l')).y);
            H.RH.push(wpos(bone('toes_02_r')).y);
            rise.push(wpos(bone('pelvis')).y - canterPelvis);
        }
        const contact = (arr) => {
            const mn = Math.min(...arr);
            return arr.map((y) => y < mn + 3.5 / 100 / scale);
        };
        const c = { LF: contact(H.LF), RF: contact(H.RF), LH: contact(H.LH), RH: contact(H.RH) };
        // hind toe-off: last frame of the first hind stance
        let firstHind = c.LH.findIndex((x, i) => x || c.RH[i]);
        let toeOff = firstHind;
        while (toeOff < n && (c.LH[toeOff] || c.RH[toeOff]))
            toeOff++;
        let foreLand = toeOff;
        while (foreLand < n && !(c.LF[foreLand] || c.RF[foreLand]))
            foreLand++;
        let hindLand = foreLand;
        while (hindLand < n && !(c.LH[hindLand] || c.RH[hindLand]))
            hindLand++;
        let k = hindLand;
        while (k < n && (c.LF[k] || c.RF[k]))
            k++;
        let nextFore = k;
        while (nextFore < n && !(c.LF[nextFore] || c.RF[nextFore]))
            nextFore++;
        jumps.set(jn, {
            name: jn,
            toeOff: (toeOff - 0.5) / FPS,
            foreLand: foreLand / FPS,
            hindLand: hindLand / FPS,
            nextFore: Math.min(nextFore, n - 1) / FPS,
            end: clip.duration,
            pelvisRise: rise,
        });
    }
    tmpMixer.stopAllAction();
    tmpMixer.uncacheRoot(scene);
    resetPose();
    // ---- Tack (built once in horse space, bind pose)
    const inner = new THREE.Matrix4().compose(new THREE.Vector3(0, -groundY * scale, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw), new THREE.Vector3(scale, scale, scale));
    let bodyMesh = null;
    scene.traverse((o) => {
        const sm = o;
        if (sm.isSkinnedMesh && sm.material.name === 'horse_body')
            bodyMesh = sm;
    });
    scene.updateMatrixWorld(true);
    const t0 = performance.now();
    const tack = buildTack(bodyMesh, inner);
    console.info('[horse] tack built in', Math.round(performance.now() - t0), 'ms');
    // ---- Equestrian Tour : appuis des clips d'allure (phase du poser de chaque sabot, AG, AD, PG, PD), clips d'origine
    // et en miroir, mesurés comme les contacts des sauts (sabot à moins de 3,5 cm de son point le plus bas).
    const gaitContacts = {};
    {
        const hoofs = ['fingers_02_l', 'fingers_02_r', 'toes_02_l', 'toes_02_r'];
        const tm = new THREE.AnimationMixer(scene);
        for (const name of ['walk', 'trot', 'canter', 'gallop', 'trot_M', 'canter_M', 'gallop_M']) {
            const clip = clips.get(name);
            if (!clip)
                continue;
            tm.stopAllAction();
            const act = tm.clipAction(clip);
            act.reset().play();
            const n = 48;
            const H = hoofs.map(() => []);
            for (let i = 0; i < n; i++) {
                tm.setTime((i / n) * clip.duration);
                scene.updateMatrixWorld(true);
                hoofs.forEach((h, k) => H[k].push(wpos(bone(h)).y));
            }
            const touch = H.map((arr) => {
                const mn = Math.min(...arr);
                const c = arr.map((y) => y < mn + 3.5 / 100 / scale);
                // poser : premier instant au sol après un instant en l'air (cycle fermé)
                for (let i = 0; i < n; i++)
                    if (c[i] && !c[(i - 1 + n) % n])
                        return i / n;
                return 0;
            });
            const duty = H.map((arr) => {
                const mn = Math.min(...arr);
                return arr.filter((y) => y < mn + 3.5 / 100 / scale).length / n;
            });
            gaitContacts[name] = { touch, duty, duration: clip.duration };
            tm.uncacheAction(clip);
        }
        tm.stopAllAction();
        tm.uncacheRoot(scene);
        resetPose();
    }
    const stats = { loadMs: Math.round(tLoad), prepareMs: Math.round(performance.now() - T0 - tLoad), bones: bones.length, clips: clips.size };
    console.info('[horse] Equestrian Tour : préparation', stats);
    readyAsset = {
        // ET : pose de repos rendue au modèle partagé après une mesure (les chevaux sont clonés depuis elle).
        resetPose,
        gaitContacts,
        stats,
        gltf,
        scene,
        clips,
        scale,
        groundY,
        yaw,
        jumps,
        gaitInfo: {
            walk: { stride: 1.85, offset: 0.0 },
            trot: { stride: 2.49, offset: 0.07 },
            canter: { stride: 3.42, offset: 0.88 },
            gallop: { stride: 4.5, offset: 0.87 },
        },
        boneBase: baseName,
        tack,
    };
    return readyAsset;
}
/**
 * Mirror a clip across the horse's sagittal plane (left ↔ right), baked per frame
 * in world space so any bone-axis convention is handled.
 */
function bakeMirror(clip, scene, bones, byBase, lateral, mid) {
    const pairOf = (b) => {
        const base = baseName(b.name);
        let other = null;
        if (/_l(_|$)/.test(base))
            other = base.replace(/_l(_|$)/, '_r$1');
        else if (/_r(_|$)/.test(base))
            other = base.replace(/_r(_|$)/, '_l$1');
        else if (/_left(_|$)/.test(base))
            other = base.replace(/_left(_|$)/, '_right$1');
        else if (/_right(_|$)/.test(base))
            other = base.replace(/_right(_|$)/, '_left$1');
        return (other && byBase.get(other)) || b;
    };
    // Reflection S across plane (n·x = d)
    const n = lateral;
    const d = n.dot(mid);
    const S = new THREE.Matrix4().set(1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 2 * d * n.x, -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 2 * d * n.y, -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 2 * d * n.z, 0, 0, 0, 1);
    // Rest pose world matrices (the caller has reset the bones to their rest transforms)
    const restLocal = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
    const mixer = new THREE.AnimationMixer(scene);
    mixer.stopAllAction();
    scene.updateMatrixWorld(true);
    const restWorld = bones.map((b) => b.matrixWorld.clone());
    const idx = new Map();
    bones.forEach((b, i) => idx.set(b, i));
    const pairIdx = bones.map((b) => idx.get(pairOf(b)));
    // C_b = (S W_b_rest)^-1 W_p_rest
    const C = bones.map((_, i) => new THREE.Matrix4().multiplyMatrices(S, restWorld[i]).invert().multiply(restWorld[pairIdx[i]]));
    const action = mixer.clipAction(clip);
    action.play();
    const nFrames = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const times = new Float32Array(nFrames);
    const pos = bones.map(() => new Float32Array(nFrames * 3));
    // the source pose's local offset of each bone's mirror partner, per frame (bone lengths to preserve)
    const srcPos = bones.map(() => new Float32Array(nFrames * 3));
    const quat = bones.map(() => new Float32Array(nFrames * 4));
    const worldM = bones.map(() => new THREE.Matrix4());
    const mirroredW = bones.map(() => new THREE.Matrix4());
    const tmp = new THREE.Matrix4();
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3();
    for (let f = 0; f < nFrames; f++) {
        const t = Math.min(clip.duration, f / FPS);
        times[f] = t;
        mixer.setTime(t);
        scene.updateMatrixWorld(true);
        for (let i = 0; i < bones.length; i++) {
            worldM[i].copy(bones[i].matrixWorld);
            const sp = bones[pairIdx[i]].position;
            srcPos[i].set([sp.x, sp.y, sp.z], f * 3);
        }
        // mirrored world of pair(i) = S W_i C_i
        for (let i = 0; i < bones.length; i++) {
            mirroredW[pairIdx[i]].multiplyMatrices(S, worldM[i]).multiply(C[i]);
        }
        for (let i = 0; i < bones.length; i++) {
            const b = bones[i];
            const parent = b.parent;
            const pi = parent.isBone ? idx.get(parent) : undefined;
            const parentW = pi !== undefined ? mirroredW[pi] : parent.matrixWorld;
            tmp.copy(parentW).invert().multiply(mirroredW[i]);
            tmp.decompose(P, Q, Sc);
            pos[i].set([P.x, P.y, P.z], f * 3);
            quat[i].set([Q.x, Q.y, Q.z, Q.w], f * 4);
        }
    }
    // fix quaternion sign continuity
    for (let i = 0; i < bones.length; i++) {
        const q = quat[i];
        for (let f = 1; f < nFrames; f++) {
            const dot = q[f * 4] * q[f * 4 - 4] + q[f * 4 + 1] * q[f * 4 - 3] + q[f * 4 + 2] * q[f * 4 - 2] + q[f * 4 + 3] * q[f * 4 - 1];
            if (dot < 0)
                for (let k = 0; k < 4; k++)
                    q[f * 4 + k] *= -1;
        }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
    // restore rest pose
    bones.forEach((b, i) => {
        b.position.copy(restLocal[i].p);
        b.quaternion.copy(restLocal[i].q);
        b.scale.copy(restLocal[i].s);
    });
    scene.updateMatrixWorld(true);
    const tracks = [];
    for (let i = 0; i < bones.length; i++) {
        const nm = bones[i].name;
        if (nm === 'root_04' || nm === '_rootJoint')
            continue;
        const base = baseName(nm);
        if (base !== 'root' && base !== 'pelvis') {
            // Bone translations are lengths, not motion. The rig's left and right sides are not exact mirror images,
            // so the baked mirrored offsets drift with the pose (hind toes up to ×4.5 longer, lower legs ×1.5):
            // the "stretched leg" glitch on every left-lead stride. Keep the bone's own rest offset when the source
            // animation does not move its partner, otherwise keep the baked direction at the partner's true length.
            const sp = srcPos[i];
            let moving = false;
            for (let f = 1; f < nFrames && !moving; f++) {
                const dx = sp[f * 3] - sp[0], dy = sp[f * 3 + 1] - sp[1], dz = sp[f * 3 + 2] - sp[2];
                if (Math.hypot(dx, dy, dz) > 1e-3 * (Math.hypot(sp[0], sp[1], sp[2]) + 1e-6))
                    moving = true;
            }
            if (!moving) {
                const r = restLocal[i].p;
                for (let f = 0; f < nFrames; f++)
                    pos[i].set([r.x, r.y, r.z], f * 3);
            }
            else {
                for (let f = 0; f < nFrames; f++) {
                    const L = Math.hypot(pos[i][f * 3], pos[i][f * 3 + 1], pos[i][f * 3 + 2]);
                    const want = Math.hypot(sp[f * 3], sp[f * 3 + 1], sp[f * 3 + 2]);
                    if (L > 1e-9)
                        for (let k = 0; k < 3; k++)
                            pos[i][f * 3 + k] *= want / L;
                }
            }
        }
        tracks.push(new THREE.VectorKeyframeTrack(`${nm}.position`, times, pos[i]));
        tracks.push(new THREE.QuaternionKeyframeTrack(`${nm}.quaternion`, times, quat[i]));
    }
    return new THREE.AnimationClip(clip.name + '_M', clip.duration, tracks);
}
/**
 * Per-vertex coat masks, stored as a vec4 attribute `coatMask`:
 *   x  lower-leg "points" mask (bay/brown horses have black legs)
 *   y  legs: height of the vertex for socks (0 coronet … 1 knee/hock); head: position along the face (0 poll … 1 nose)
 *   z  head: how much the surface faces forward/up (0..1)
 *   w  head: lateral distance from the midline (0 … 1 = 12 cm); else 1
 * plus a flat attribute `coatRegion`: 0 body, 1 LF, 2 RF, 3 LH, 4 RH, 5 head
 */
function buildCoatMasks(mesh, byBase) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const si = geo.getAttribute('skinIndex');
    const sw = geo.getAttribute('skinWeight');
    const bones = mesh.skeleton.bones;
    const legOf = new Map();
    const legRe = [
        [/_l(_|$)/, 0],
        [/_r(_|$)/, 1],
    ];
    bones.forEach((b, i) => {
        const base = baseName(b.name);
        const fore = /^(clavicle|upperarm|lowerarm|hand|fingers|wrist|elbow)/.test(base);
        const hind = /^(upperleg|lowerleg|foot|toes|ankle|knee|hip_middle|hip_corrective)/.test(base);
        if (!fore && !hind)
            return;
        let side = -1;
        for (const [re, s] of legRe)
            if (re.test(base))
                side = s;
        if (side < 0)
            return;
        const leg = (fore ? 0 : 2) + side; // 0 LF 1 RF 2 LH 3 RH
        let lower = 0;
        if (/^(hand|fingers|wrist|foot|toes|ankle)/.test(base))
            lower = 1;
        else if (/^(lowerarm|lowerleg|knee)/.test(base))
            lower = 0.45;
        legOf.set(i, { leg, lower });
    });
    const headBones = new Set();
    bones.forEach((b, i) => {
        const base = baseName(b.name);
        if (/^(head|jaw|upperlip|bottomlip|innernostril|outernostril|mouthcorner|eye|uppereyelid|lowereyelid|dyn_head)/.test(base))
            headBones.add(i);
    });
    mesh.updateMatrixWorld(true);
    // Bind pose: vertex world = bindMatrix · v ; bone world = bindMatrix · inverse(boneInverse)
    const M = mesh.bindMatrix;
    const v = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const nmat = new THREE.Matrix3().getNormalMatrix(M);
    const boneIndex = new Map();
    bones.forEach((b, i) => boneIndex.set(b, i));
    const wp = (base) => {
        const bi = boneIndex.get(byBase.get(base));
        const bw = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[bi]).invert().premultiply(M);
        return new THREE.Vector3().setFromMatrixPosition(bw);
    };
    // ground & scale in bind pose (hooves → withers)
    let groundY = Infinity;
    for (let i = 0; i < pos.count; i++)
        groundY = Math.min(groundY, v.fromBufferAttribute(pos, i).applyMatrix4(M).y);
    const scale = (1.68 - 0.2) / (wp('spine_04').y - groundY);
    const poll = wp('head');
    const muzzle = byBase.get('upperlip') ? wp('upperlip') : wp('jaw');
    const headAxis = new THREE.Vector3().subVectors(muzzle, poll);
    const headLen = headAxis.length();
    headAxis.normalize();
    const lat = new THREE.Vector3().subVectors(wp('eye_l'), wp('eye_r')).normalize();
    let dorsal = new THREE.Vector3().crossVectors(lat, headAxis).normalize();
    if (dorsal.y < 0)
        dorsal.negate();
    const eyeMid = new THREE.Vector3().addVectors(wp('eye_l'), wp('eye_r')).multiplyScalar(0.5);
    const out = new Float32Array(pos.count * 4);
    const region = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(M);
        nrm.fromBufferAttribute(nor, i).applyMatrix3(nmat).normalize();
        const legW = [0, 0, 0, 0];
        let lowerW = 0, headW = 0;
        for (let k = 0; k < 4; k++) {
            const bi = si.getComponent(i, k);
            const w = sw.getComponent(i, k);
            if (w <= 0)
                continue;
            const lo = legOf.get(bi);
            if (lo) {
                legW[lo.leg] += w;
                lowerW += w * lo.lower;
            }
            if (headBones.has(bi))
                headW += w;
        }
        const legSum = legW[0] + legW[1] + legW[2] + legW[3];
        let x = 0, y = 1, z = 1, w = 1;
        const hM = (v.y - groundY) * scale; // metres above ground (rest pose)
        if (legSum > 0.5) {
            let best = 0;
            for (let k = 1; k < 4; k++)
                if (legW[k] > legW[best])
                    best = k;
            const isFore = best < 2;
            x = THREE.MathUtils.clamp(lowerW / Math.max(legSum, 1e-3), 0, 1);
            // points also by height: below ~0.55 m (fore) / 0.65 m (hind) fully black on bays
            const pointTop = isFore ? 0.56 : 0.62;
            x = Math.max(x, 1 - THREE.MathUtils.smoothstep(hM, pointTop - 0.08, pointTop + 0.08));
            y = THREE.MathUtils.clamp((hM - 0.04) / (isFore ? 0.5 : 0.58), 0, 1);
            z = 0;
            region[i] = best + 1;
        }
        else if (headW > 0.5) {
            const rel = new THREE.Vector3().subVectors(v, eyeMid);
            const along = THREE.MathUtils.clamp(rel.dot(headAxis) / (headLen * 1.05) + 0.25, 0, 1.2);
            const latD = Math.abs(rel.dot(lat)) * scale;
            const front = nrm.dot(dorsal);
            region[i] = 5;
            y = along;
            z = THREE.MathUtils.clamp(front, 0, 1);
            w = THREE.MathUtils.clamp(latD / 0.12, 0, 1);
        }
        out[i * 4] = x;
        out[i * 4 + 1] = y;
        out[i * 4 + 2] = z;
        out[i * 4 + 3] = w;
    }
    geo.setAttribute('coatMask', new THREE.BufferAttribute(out, 4));
    geo.setAttribute('coatRegion', new THREE.BufferAttribute(region, 1));
}

