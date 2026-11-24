// Étape M3 de l'essai de monte (voie A) : calage de la phase de foulée du cheval WildMesh, relevé dans le jeu web EN COURS
// D'EXÉCUTION (modules du jeu importés tels quels, rien n'est modifié dans src/, public/ ni tests/).
//
// Ce que le cavalier lit comme phase de foulée (human.js animateRiding : a.horseGaitPhase = h.anim.phase + riderPostOffset)
// est réécrit par pjlHorse.js _snapshot : H.anim.phase = wrap01(ph − align[clé].off), où ph est la phase des clips de la
// vue (pjl/view.js : temps du clip = ((ph + gaitInfo[allure].offset) % 1) · durée). Les décalages align viennent du calage
// PjlHorse._calibrate (appuis des clips mesurés par asset.js, gaitContacts, contre les instants de poser des allures du
// jeu, GAIT_OFFSETS de horse/anim.js). La page relève :
//  - les ENTRÉES du calage, telles que le jeu les a calculées : asset.gaitContacts, asset.gaitInfo, GAIT_OFFSETS ;
//  - la SORTIE du calage du jeu : align et leadSwap d'un PjlHorse construit sur le cheval préparé par le jeu (cheval du
//    jeu remplacé par un objet minimal : un groupe three.js pour le maillage, sans scène ; seul _calibrate est lu).
// Pilote : scripts/unreal/export-horse-phase.mjs (Playwright), qui lit window.__phase.run().
import * as THREE from 'three';
import { loadHorseAsset } from '/src/entities/pjl/asset.js';
import { loadRealGltf } from '/src/entities/realistic.js';
import { GAIT_OFFSETS } from '/src/entities/horse/anim.js';
import { PjlHorse } from '/src/entities/pjlHorse.js';

const plain = (o) => JSON.parse(JSON.stringify(o));

async function run() {
  const asset = await loadHorseAsset(() => loadRealGltf('horse_pjl'));
  const horse = { mesh: new THREE.Group(), def: {}, anim: { phase: 0 }, bones: {} };
  const p = new PjlHorse(horse, asset);
  const align = {};
  for (const [k, v] of Object.entries(p.align)) align[k] = v ? { off: v.off, res: v.res } : null;
  return {
    three: THREE.REVISION,
    gaitInfo: plain(asset.gaitInfo),
    gaitOffsets: plain(GAIT_OFFSETS),
    gaitContacts: plain(asset.gaitContacts),
    align,
    leadSwap: p.leadSwap,
  };
}

window.__phase = { run };
window.__phaseReady = true;
