// Étape M2 de l'essai de monte (voie A) : oracle des clips miroir du cheval WildMesh, relevé dans le jeu web EN COURS
// D'EXÉCUTION (page chargée par Vite, modules du jeu importés tels quels, rien n'est modifié dans src/, public/ ni tests/).
//
// La page prépare le cheval exactement comme le jeu (src/entities/pjl/asset.js loadHorseAsset, chargeur du jeu
// src/entities/realistic.js loadRealGltf('horse_pjl')) : les clips « _M » qu'elle relève sont ceux que bakeMirror a cuits
// pour le jeu. Elle relève aussi, pour que le portage C++ refasse le calcul, les entrées que bakeMirror lit :
//  - le squelette (noms, parents, pose de repos locale, matrice monde des parents qui ne sont pas des os) ;
//  - la pose du clip idle à 0,5 s (plan de symétrie : bras upperarm_l et upperarm_r, pjl/asset.js) ;
//  - pour chaque clip source, à chaque instant de la cuisson (FPS et liste des clips relus dans asset.js par le pilote),
//    la pose locale du clip telle que le mélangeur three.js la pose (AnimationMixer.setTime, comme bakeMirror) et le
//    temps du clip après bouclage (AnimationAction.time).
// Les valeurs des pistes animées sont écrites en doubles (le mélangeur interpole dans le tampon Float64Array de son
// PropertyMixer) ; les propriétés sans piste doivent rester à la pose de repos à chaque instant (vérifié).
// Pilote : scripts/unreal/export-horse-mirror.mjs (Playwright), qui lit window.__mirror.run(params).
import * as THREE from 'three';
import { loadHorseAsset } from '/src/entities/pjl/asset.js';
import { loadRealGltf } from '/src/entities/realistic.js';

const log = (s) => (document.getElementById('log').textContent += s + '\n');

function b64(a) {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const arr = (v) => [v.x, v.y, v.z, ...(v.w !== undefined ? [v.w] : [])];

async function run({ sources, fps }) {
  const t0 = performance.now();
  const asset = await loadHorseAsset(() => loadRealGltf('horse_pjl'));
  const scene = asset.scene;
  let skinned = null;
  scene.traverse((o) => {
    if (o.isSkinnedMesh && !skinned) skinned = o; // même choix que prepare()
  });
  const bones = skinned.skeleton.bones;
  const idx = new Map(bones.map((b, i) => [b, i]));
  asset.resetPose();
  scene.updateMatrixWorld(true);
  const rest = bones.map((b) => ({ p: arr(b.position), q: arr(b.quaternion), s: arr(b.scale) }));
  const parent = bones.map((b) => (b.parent && b.parent.isBone ? idx.get(b.parent) : -1));
  const parentWorld = bones.map((b) => (b.parent && b.parent.isBone ? null : [...b.parent.matrixWorld.elements]));
  // Os qui portent au moins un sommet (poids > 0) d'un maillage skinné du cheval (corps, yeux, crins) : seuls leurs
  // écarts se voient ; les autres (aides de l'export, points de fixation) sont relevés sans critère par le test moteur.
  const skinnedBones = bones.map(() => 0);
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const si = o.geometry.getAttribute('skinIndex'), sw = o.geometry.getAttribute('skinWeight');
    for (let v = 0; v < si.count; v++)
      for (let c = 0; c < 4; c++)
        if (sw.getComponent(v, c) > 0) {
          const k = idx.get(o.skeleton.bones[si.getComponent(v, c)]);
          if (k !== undefined) skinnedBones[k] = 1;
        }
  });
  const rig = { names: bones.map((b) => b.name), parent, rest, parentWorld, skinned: skinnedBones };

  const props = ['position', 'quaternion', 'scale'];
  const width = { position: 3, quaternion: 4, scale: 3 };
  // Pose locale de tous les os ; contrôle des parents non-os (constants).
  const checkParents = (where) => {
    bones.forEach((b, i) => {
      if (parentWorld[i] && b.parent.matrixWorld.elements.some((v, k) => v !== parentWorld[i][k])) throw new Error(`${where} : parent non-os de ${b.name} déplacé`);
    });
  };
  // Échantillonne un clip comme bakeMirror (nouveau mélangeur, une action jouée, setTime, updateMatrixWorld).
  function sample(clip, times) {
    asset.resetPose();
    const mixer = new THREE.AnimationMixer(scene);
    const action = mixer.clipAction(clip);
    action.play();
    const tracked = new Set(clip.tracks.map((t) => t.name));
    const animated = []; // [indice d'os, propriété]
    bones.forEach((b, i) => props.forEach((p) => tracked.has(`${b.name}.${p}`) && animated.push([i, p])));
    const nv = animated.reduce((n, [, p]) => n + width[p], 0);
    const vals = new Float64Array(nv * times.length);
    const clipTime = [];
    times.forEach((t, f) => {
      mixer.setTime(t);
      scene.updateMatrixWorld(true);
      checkParents(clip.name);
      clipTime.push(action.time);
      let k = f * nv;
      for (const [i, p] of animated)
        for (const v of arr(bones[i][p])) vals[k++] = v;
      bones.forEach((b, i) =>
        props.forEach((p) => {
          if (tracked.has(`${b.name}.${p}`)) return;
          const key = p === 'position' ? 'p' : p === 'quaternion' ? 'q' : 's';
          if (arr(b[p]).some((v, c) => v !== rest[i][key][c])) throw new Error(`${clip.name} : ${b.name}.${p} sans piste mais hors repos`);
        }),
      );
    });
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
    asset.resetPose();
    return { animated: animated.map(([i, p]) => [i, p[0]]), clipTime, vals: b64(vals) };
  }
  // Pose idle à 0,5 s (plan de symétrie), toutes les valeurs (doubles).
  const idleClip = asset.clips.get('idle');
  asset.resetPose();
  {
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(idleClip).play();
    mixer.setTime(0.5);
    scene.updateMatrixWorld(true);
    checkParents('idle');
    var idle = {
      t: 0.5,
      local: bones.map((b) => ({ p: arr(b.position), q: arr(b.quaternion), s: arr(b.scale) })),
      // information : positions monde des bras calculées par three.js (le C++ les recalcule depuis la pose locale)
      upperarm: Object.fromEntries(bones.filter((b) => /^upperarm_[lr]_\d+$/.test(b.name)).map((b) => [b.name, arr(new THREE.Vector3().setFromMatrixPosition(b.matrixWorld))])),
    };
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
    asset.resetPose();
  }
  const src = [];
  for (const name of sources) {
    const clip = asset.clips.get(name);
    if (!clip) throw new Error(`clip source ${name} absent`);
    const n = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = Array.from({ length: n }, (_, f) => Math.min(clip.duration, f / fps));
    src.push({ name, duration: clip.duration, times, ...sample(clip, times) });
  }
  // Clips « _M » cuits par le jeu : une piste position et une piste quaternion par os (ordre du squelette).
  const mirrored = [];
  for (const [name, clip] of asset.clips) {
    if (!name.endsWith('_M')) continue;
    const times = clip.tracks[0].times;
    const outBones = [];
    const parts = [];
    bones.forEach((b, i) => {
      const tp = clip.tracks.find((t) => t.name === `${b.name}.position`);
      const tq = clip.tracks.find((t) => t.name === `${b.name}.quaternion`);
      if (!tp && !tq) return;
      if (!tp || !tq) throw new Error(`${name} : ${b.name} n'a qu'une des deux pistes`);
      for (const t of [tp, tq]) if (t.times.length !== times.length || t.times.some((v, k) => v !== times[k])) throw new Error(`${name} : temps des pistes différents`);
      outBones.push(i);
      parts.push(tp.values, tq.values);
    });
    if (clip.tracks.length !== 2 * outBones.length) throw new Error(`${name} : pistes inattendues`);
    // une image = pour chaque os de outBones : position (3) puis quaternion (4)
    const n = times.length, nb = outBones.length;
    const vals = new Float32Array(n * nb * 7);
    for (let f = 0; f < n; f++)
      for (let j = 0; j < nb; j++) {
        vals.set(parts[2 * j].subarray(f * 3, f * 3 + 3), (f * nb + j) * 7);
        vals.set(parts[2 * j + 1].subarray(f * 4, f * 4 + 4), (f * nb + j) * 7 + 3);
      }
    mirrored.push({ name, duration: clip.duration, times: [...times], bones: outBones, vals: b64(vals) });
  }
  log(`oracle relevé en ${Math.round(performance.now() - t0)} ms : ${src.length} clips source, ${mirrored.length} clips miroir`);
  return { three: THREE.REVISION, boneCount: bones.length, rig, idle, src, mirrored, stats: asset.stats };
}

window.__mirror = { run, THREE }; // THREE : pour les diagnostics pilotés depuis Playwright
window.__mirrorReady = true;
