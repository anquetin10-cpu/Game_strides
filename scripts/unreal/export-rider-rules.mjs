// Essai de monte, voie A, étape 2 : oracle O1 des règles de monte du jeu web v3, exporté du jeu EN COURS D'EXÉCUTION
// (unreal/docs/parite/monte/plan-essai.md, étape 2 ; étude : oracle-monte.md §2 et §4). Le jeu web est la spécification ;
// ce script ne modifie rien dans src/, public/ ni tests/ : il pilote la page par l'API du jeu et le pilote injecté
// tests/e2e/autopilot.js (lu, jamais modifié), au pas fixe de 1/30 s, comme tests/e2e/pjl/rider-audit.mjs (plans des
// scénarios relus dans son source) et scripts/unreal/export-cso-runs.mjs (déterminisme).
//
// Sorties :
//  - unreal/core/tests/oracles/monte/o1/ : un fichier par scénario (<id>.json : objet { id, desc, setup, frames }, en-tête
//    sur la première ligne puis une image par ligne) et un index (index.json : en-tête qui décrit les canaux, puis la
//    liste des scénarios). Format d'écriture : scripts/unreal/cso-runs-io.mjs (runText, indexText).
//  - avec --anchors : unreal/StridesGrandTour/Content/Data/pjl_tack_anchors.json (ancres de sellerie : os par nom, poids,
//    point local en espace de liaison ; indices des sommets des profils de flanc et d'encolure), relu à l'étape 5.
//
// Chaque scénario part de la mise en selle, dans une page neuve : boucle de rendu arrêtée, hasard à graine 20261118 et
// horloges virtuelles (performance.now et Date.now avancent de 1/30 s par image), cheval remis à neuf (position, état de
// l'animation, cheval WildMesh recréé), puis une image de mise en place (non exportée : elle donne au cheval WildMesh sa
// première pose, ses profils de flanc et d'encolure), puis Human.mount (état du cavalier neuf : _ride, pose, fondu de
// 0,45 s de human/anim.js). Toutes les images à partir de la mise en selle sont exportées ; la fenêtre de mesure est
// écrite dans l'en-tête (setup.window), après le fondu. Deux exports donnent des fichiers identiques octet pour octet ;
// un fichier dont le contenu ne change pas n'est pas réécrit.
//
// Usage (serveur Vite de la copie sur BASE, défaut http://127.0.0.1:5176 ; Chrome installé, aucun téléchargement) :
//   node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-rider-rules.mjs [--only=E1,E3] [--out=dossier] [--anchors | --anchors-only]
// --only : seulement ces scénarios (les autres entrées de l'index sont gardées) ; --anchors : écrit aussi les ancres ;
// --anchors-only : seulement les ancres.
// --shots=<dossier> (essai de monte, étape 6) : captures côte à côte, sans rien écrire dans les oracles. Scénarios E1
//   (arrêt) et E2d (galop à droite : le cheval Unreal n'a pas les clips en miroir de la main gauche), page en 844 × 390,
//   arrêtés à l'image de capture (SHOT_POSES) ; caméra posée dans le repère du cheval (holder : x à gauche, y vers le
//   haut, z vers l'avant, m), FOV vertical, rendu, capture <dossier>/monte-<nom>-web.png ; poses et état de l'image dans
//   <dossier>/poses.json, relu par -StridesShots=monte côté Unreal (même caméra dans le repère de l'acteur du cheval).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runText, indexText } from './cso-runs-io.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5176';
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const OUT = arg('out') || join(ROOT, 'unreal/core/tests/oracles/monte/o1');
const ANCHORS_ONLY = process.argv.includes('--anchors-only');
const ANCHORS = ANCHORS_ONLY || process.argv.includes('--anchors');
const ANCHORS_FILE = join(ROOT, 'unreal/StridesGrandTour/Content/Data/pjl_tack_anchors.json');
const ONLY = arg('only').split(',').filter(Boolean);
const SEED = 20261118;
const SCHEMA = 'strides.oracle.rider_rules/1';
const SHOTS = arg('shots');
// Captures (--shots) : scénario, image, caméra dans le repère du cheval (vue de gauche, à hauteur du cavalier).
const SHOT_POSES = [
  { name: 'arret', scenario: 'E1', frame: 40, eyeH: [4.2, 1.5, 0.5], targetH: [0, 1.4, 0.1], fovV: 38 },
  { name: 'galop', scenario: 'E2d', frame: 100, eyeH: [4.2, 1.5, 0.5], targetH: [0, 1.4, 0.1], fovV: 38 },
  // Étape M2 (clips miroir) : galop à main gauche (E2g, clips canter_M et canter_L90_M seuls) et saut à main gauche (E3,
  // clip jump_canter_M, en vol : jT 0,61). Choisies par --only-shots=galop-gauche,saut-gauche.
  { name: 'galop-gauche', scenario: 'E2g', frame: 100, eyeH: [4.2, 1.5, 0.5], targetH: [0, 1.4, 0.1], fovV: 38, only: true },
  { name: 'saut-gauche', scenario: 'E3', frame: 50, eyeH: [4.2, 1.5, 0.5], targetH: [0, 1.4, 0.1], fovV: 38, only: true },
];
// --only-shots=a,b : seulement ces captures ; sans l'option, les captures de l'étape 6 (arrêt, galop) comme avant.
const ONLY_SHOTS = arg('only-shots').split(',').filter(Boolean);

// ---------------------------------------------------------------------------------------------------------------
// Plans des scénarios : table « plan » de tests/e2e/pjl/rider-audit.mjs (allures) et obstacles de sa préparation CSO,
// relus dans son source (aucune valeur recopiée). Les ajouts de l'essai (stabilisation, préparation depuis l'arrêt) sont
// déclarés ici et écrits dans l'en-tête de chaque scénario.
const AUDIT_SRC = readFileSync(join(ROOT, 'tests/e2e/pjl/rider-audit.mjs'), 'utf8');
function auditLiteral(re, what) {
  const m = re.exec(AUDIT_SRC);
  if (!m) throw new Error(`rider-audit.mjs : ${what} introuvable`);
  return new Function(`return (${m[1]});`)();
}
const PLANS = auditLiteral(/const plan = (\{[\s\S]*?\})\[name\];/, 'table des plans d’allures');
const CSO_SPECS = auditLiteral(/const specs = (\[[\s\S]*?\]);/, 'obstacles de la préparation CSO');
const CSO_N = Number((/const N = (\d+), first = /.exec(AUDIT_SRC) || [])[1]);
if (!CSO_N) throw new Error('rider-audit.mjs : nombre d’images d’approche (N) introuvable');

// pre : images jouées avant le plan (depuis la mise en selle, cheval à l'arrêt) ; preTurn : la préparation suit déjà le
// cercle du plan (sinon : ligne droite le long du rivage, comme la préparation « pre » de rider-audit.mjs).
const SCENARIOS = [
  { id: 'E1', type: 'allures', plan: 'repos', pre: 20, accept: true, desc: 'arrêt, en selle : 20 images de stabilisation puis le plan « repos » (45 images)' },
  { id: 'E1b', type: 'allures', plan: 'arret', accept: true, desc: 'arrêt depuis le galop : plan « arret » (préparation de 60 images au galop, puis 70 images à l’arrêt)' },
  { id: 'E2g', type: 'allures', plan: 'galop-gauche', pre: 60, preTurn: true, accept: true, desc: 'galop à gauche : 60 images de mise en train sur le même cercle depuis l’arrêt, puis le plan « galop-gauche » (80 images)' },
  { id: 'E2d', type: 'allures', plan: 'galop-droite', pre: 60, preTurn: true, accept: true, desc: 'galop à droite : 60 images de mise en train sur le même cercle depuis l’arrêt, puis le plan « galop-droite » (80 images)' },
  { id: 'E3', type: 'cso', cas: 'v110:6.5:normal', accept: true, desc: 'vertical de 1,10 m abordé à 6,5 m/s, appel « normal » (cas CSO de rider-audit.mjs)' },
  { id: 'E3b', type: 'cso', cas: 'v140:9:normal', accept: true, desc: 'vertical de 1,40 m abordé à 9 m/s, appel « normal » (cas CSO de rider-audit.mjs)' },
  { id: 'E6t', type: 'allures', plan: 'trot', pre: 45, accept: false, desc: 'trot enlevé : 45 images de mise en train en ligne droite, puis le plan « trot » (75 images) ; hors acceptation de l’essai' },
  { id: 'E6v', type: 'allures', plan: 'virage-droite', pre: 60, accept: false, desc: 'virage à droite au galop : 60 images au galop en ligne droite, puis le plan « virage-droite » (60 images) ; hors acceptation de l’essai' },
];
for (const sc of SCENARIOS) {
  if (sc.type !== 'allures') continue;
  sc.p = PLANS[sc.plan];
  if (!sc.p) throw new Error(`plan ${sc.plan} absent de rider-audit.mjs`);
  sc.pre = sc.pre ?? sc.p.pre ?? 0;
  sc.window = [sc.pre, sc.pre + sc.p.n];
  sc.frames = sc.pre + sc.p.n;
}

// En-tête de l'index : description des canaux (unités, repères, sources).
const HEAD = {
  schema: SCHEMA,
  generator: 'scripts/unreal/export-rider-rules.mjs',
  doc: 'oracle O1 des règles de monte du jeu web v3 (essai de monte, voie A, étape 2) : entrées vues par la règle, pose du squelette classique de 25 os, cibles, repères et profils du cheval WildMesh, état de son mélangeur, rendu réaliste (information), état interne, pour chaque image depuis la mise en selle (pas fixe de 1/30 s, graine 20261118). Métriques M1 à M17 : scripts/unreal/rider-rules-metrics.mjs.',
  layout: 'un fichier par scénario dans ce dossier (runs[].file = <id>.json) : objet { id, desc, setup, frames }, en-tête sur la première ligne puis une image par ligne ; runs[].frames = nombre d’images ; runs[].window = [première, dernière + 1] images de la fenêtre de mesure ; ordre = ordre des scénarios de l’exporteur',
  frames: {
    S: 'repère du siège : os « saddle » du cheval du jeu, sans échelle (matrixWorld décomposée, recomposée à l’échelle 1, comme pjlHorse.js _flankUpdate) ; x vers la gauche du cheval, y vers le haut, z vers l’avant ; mètres',
    H: 'repère du cheval : groupe « holder » de la vue WildMesh (origine au sol sous le cheval, axes du cap) ; sert à la verticale et à l’avant pour le buste',
    model: 'repère du personnage classique (unités du modèle, avant l’échelle hu.scale) ; le maillage est enfant de l’os « saddle » à l’offset nul, sans rotation, à l’échelle monde hu.scale : point dans S = point modèle × scale',
    world: 'monde three.js (y vers le haut)',
    quaternions: '[x, y, z, w]',
  },
  setup: 'seed, dt, scale (hu.scale), sex, rig (rigInfo : thighLen, shinLen, upperArmLen, foreArmLen, ankleY, toe, heelBack, seatToHips, hipsY, …), rest (positions de repos des 25 os, unités du modèle, ordre setup.bones), bones (ordre des os de cl), cq (ordre des quaternions de cq), points (points sans os ajoutés à cl), RIDE (paramètres de human/anim.js), fit0 (réglages à la mise en selle, mètres, hu._fit), pjlFit (réglages du cheval WildMesh, mètres), pjlRest (ancres d’étrier et de siège au repos, repère du cheval, d’où viennent stirrupY et stirrupZ avant bornage), plan, window, fade (première image hors du fondu de 0,45 s), cso (cas d’obstacle), real (calage de la plante du modèle réaliste)',
  channels: {
    f: 'indice de l’image depuis la mise en selle (0 = première image exportée)',
    ui: 'commande appliquée avant l’image : [move.x, move.y, galop tenu (0/1), appui SAUT (0/1), vitesse imposée en m/s ou null]',
    in: 'entrées de la règle, relevées dans hu.anim juste après hu.animateRiding (human.js:317-383) : ce que riding() a lu à cette image (animateHuman ne les modifie pas). dt, t, hs (horseSpeed), ph (horseGaitPhase), turn, jump (vol du jeu, -1 au sol), landT (s depuis le poser des antérieurs ; null = absent, la règle lit -1), hindDown, bob (m), pitch (rad), wave, fit : réglages en UNITÉS DU MODÈLE tels que lus par la règle (mètres = valeur × scale, sauf kneeOut et mountKneeOut, directions) : stirrupX/Y/Z, kneeOut, handX/Y/Z, legClear, mountKneeOut, flankL et flankR ([y0, pas, d0..d19], profil vu par le cavalier : image précédente, resserrement borné FLANK_RELAX, élargissement anticipé FLANK_LEAD), crest ([z0, pas, h0..h17], -9 sans mesure). Pleine précision.',
    cl: 'squelette classique dans S (m), pleine précision : 25 articulations dans l’ordre setup.bones, puis planteL, planteR (lFoot/rFoot.localToWorld(0, -ankleY+0.012, toe.z-0.005), anim.js:771), poingL, poingR (lHand/rHand.localToWorld(FIST = 0, -0.068, 0.012), human.js:56)',
    cq: 'quaternions locaux des 24 os animés (ordre setup.cq, NAMES de human/anim.js), pleine précision',
    tg: 'cibles de la règle (hu.anim._P), dans S (m ; positions du modèle × scale) : fL, fR (cheville visée), qL, qR (orientation du pied, repère du modèle = S), xL, xR (place naturelle du pied f.xMax, m, null sans profil), hL, hR (poignet visé), hp (bassin visé)',
    hz: 'cheval, pleine précision : S et H ([px, py, pz, qx, qy, qz, qw] dans le monde), an (ancres skinnées V.anchorWorld dans S : seat, barL, barR, bitL, bitR, withers, crest, kneeL, kneeR, ironL, ironR), ir (étriers affichés h.pjl.irons dans S, [gauche, droit]), fl, fr, cr (profils bruts de cette image, h.pjl.fit, mètres, repère S de cette image), hv (hauteur au-dessus du sol des os fingers_02_l, fingers_02_r, toes_02_l, toes_02_r, m), jT (h.jumpT), jd (h.jumpDur), jc (clip de saut), cT (V.jumpTime), toeOff, foreLand, hd (h.pjl.hindDown), lT (h.pjl.landT), v (h.speed), gait, lead (locomotion du jeu), p ([x, y, z] du cheval), hdg (cap), ph (h.anim.phase), gy (sol sous le cheval)',
    mx: 'mélangeur WildMesh (pjl/view.js update) : a = actions actives [nom, poids, temps du clip (s)], jc, jm (miroir), jt (jumpTime), jw (jumpWeight), pl (postLand), lb (leadBlend), it (idleTime), by (body.position.y), rz (body.rotation.z), co (contactOff), sec (ressorts de SecondaryMotion : bascule, headLift, maneRoll, earPrick, valeur x), s (instantané _snapshot : gait, lead, phase, strideLen, turnRate, mode, jt, jT, roll). Pleine précision.',
    rz: 'rendu visible, modèle réaliste rider_f.glb (information, sans valeur de preuve) : os dans S (m, au millionième) dans l’ordre setup.real.bones, puis gripL, gripR (RealBody.gripPoint), planteL, planteR (point calé, setup.real)',
    dg: 'état interne de la règle après l’image (hu.anim._ride) : post, diag, wantDiag, diagT, two, jumpK, rel, bobAvg, hd, wasJump, look [a, to, t], hug { l: [px, fx, t], r: […] } ; bT (_P.blendT)',
    pe: 'pénétration de l’axe des os dans le maillage du cheval (m), méthode des 6 rayons de rider-audit.mjs:80-150 (mêmes points : cuisse, jambe, pied, avant-bras, main, buste) : [profondeur maximale, lieu] ; seulement dans la fenêtre de mesure (null ailleurs)',
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Code injecté dans la page.
function PAGE() {
  const g = window.__game, A = window.__auto;
  const DT = 1 / 30;
  const R6 = (v) => Math.round(v * 1e6) / 1e6;
  const P = (window.__monte = {});
  // Hasard et horloges déterministes (même générateur que scripts/unreal/export-cso-runs.mjs).
  const seedRandom = (seed) => {
    let a = seed >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  let clock = 0;
  const EPOCH = Date.UTC(2026, 0, 1);
  performance.now = () => clock;
  Date.now = () => EPOCH + clock;
  let T, AN, SK, hu, h, sc, inRec = null;
  const v3 = (v) => [v.x, v.y, v.z];
  const q4 = (q) => [q.x, q.y, q.z, q.w];

  P.install = async () => {
    T = await import('/node_modules/three/build/three.module.js');
    AN = await import('/src/entities/human/anim.js');
    SK = await import('/src/entities/human/skeleton.js');
    A.stopLoop();
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.missions.abandon?.();
    A.closeCards();
    g.phone.notify = () => {};
    g.missions.timer = 1e6;
    g.sky.rain = 0;
    g.sky.wet = 0;
    h = g.mainHorse;
    hu = g.player.human;
    if (g.player.horse !== h) throw new Error('le cheval du joueur n’est pas le cheval principal');
    // Entrées de la règle : relevées juste après l'appel (animateRiding les calcule puis appelle animateHuman, qui ne
    // les modifie pas) ; avant l'appel, hu.anim contient encore celles de l'image précédente.
    const orig = hu.animateRiding.bind(hu);
    hu.animateRiding = (dt) => {
      orig(dt);
      inRec = captureIn(dt);
    };
    return { scale: hu.scale, sex: hu.sex };
  };

  const FIT_KEYS = ['stirrupX', 'stirrupY', 'stirrupZ', 'kneeOut', 'handX', 'handY', 'handZ', 'legClear', 'mountKneeOut', 'flankL', 'flankR', 'crest'];
  const nul = (v) => (v === undefined ? null : v);
  function captureIn(dt) {
    const a = hu.anim;
    if (!hu.mounted) return null;
    const fit = {};
    for (const k of FIT_KEYS) {
      const v = a.fit?.[k];
      if (v === undefined) continue;
      fit[k] = Array.isArray(v) ? v.slice() : v;
    }
    const extra = a.fit ? Object.keys(a.fit).filter((k) => !FIT_KEYS.includes(k)) : [];
    if (extra.length) throw new Error('réglages inattendus dans hu.anim.fit : ' + extra.join(', '));
    return { dt, t: a.t, hs: a.horseSpeed, ph: a.horseGaitPhase, turn: a.turn, jump: a.jump, landT: nul(a.landT), hindDown: !!a.hindDown, bob: a.bob, pitch: a.pitch, wave: nul(a.wave), fit };
  }

  // ---- Repères ----
  const Sm = () => {
    const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
    h.bones.saddle.updateWorldMatrix(true, false);
    h.bones.saddle.matrixWorld.decompose(p, q, s);
    const M = new T.Matrix4().compose(p, q, new T.Vector3(1, 1, 1));
    return { p, q, inv: M.clone().invert() };
  };
  const Hm = () => {
    const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
    h.pjl.holder.updateWorldMatrix(true, false);
    h.pjl.holder.matrixWorld.decompose(p, q, s);
    return { p, q };
  };

  // ---- Calage de la plante du modèle réaliste (oracle-monte.md §3.2) : pose de repos du personnage classique recopiée
  // sur le modèle réaliste (comme RealBody._calibrate), semelle = plus bas sommet skinné des bottes affichées de ce
  // côté, plante = sous l'os ball, 1,2 cm au-dessus de la semelle, 5 mm en arrière (même construction que la plante du
  // classique, anim.js:771) ; point exprimé dans le repère de l'os foot. ----
  const REAL_BONES = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head'];
  for (const t of ['_l', '_r']) for (const n of ['clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot', 'ball']) REAL_BONES.push(n + t);
  let realCal = null;
  function calibrateReal() {
    const rb = g.realism.bodies.get(hu);
    if (!rb) return null;
    const ours = hu.bones, saved = {};
    for (const [n, b] of Object.entries(ours)) {
      saved[n] = [b.quaternion.clone(), b.position.clone()];
      b.quaternion.identity();
      if (b.userData.rest) b.position.copy(b.userData.rest);
    }
    hu.mesh.updateMatrixWorld(true);
    rb.update();
    rb.root.updateMatrixWorld(true);
    const ymin = { l: Infinity, r: Infinity }, meshes = [];
    const v = new T.Vector3();
    rb.root.traverse((o) => {
      if (!o.isSkinnedMesh || !/boots/.test(o.material?.name || '') || !o.visible) return;
      meshes.push(o.name);
      const Pa = o.geometry.attributes.position;
      for (let i = 0; i < Pa.count; i++) {
        o.applyBoneTransform(i, v.fromBufferAttribute(Pa, i));
        v.applyMatrix4(o.matrixWorld);
        rb.root.worldToLocal(v);
        const s = v.x > 0 ? 'l' : 'r';
        if (v.y < ymin[s]) ymin[s] = v.y;
      }
    });
    const out = { bones: REAL_BONES.filter((n) => rb.bones[n]), meshes, sole: {}, ball: {}, local: {} };
    for (const [s, t] of [['l', '_l'], ['r', '_r']]) {
      const ball = rb.root.worldToLocal(rb.bones['ball' + t].getWorldPosition(new T.Vector3()));
      const w = rb.root.localToWorld(new T.Vector3(ball.x, ymin[s] + 0.012, ball.z - 0.005));
      const loc = rb.bones['foot' + t].worldToLocal(w);
      out.sole[s] = ymin[s];
      out.ball[s] = v3(ball);
      out.local[s] = v3(loc);
    }
    for (const [n, b] of Object.entries(ours)) {
      b.quaternion.copy(saved[n][0]);
      b.position.copy(saved[n][1]);
    }
    hu.mesh.updateMatrixWorld(true);
    rb.update();
    realCal = out;
    return out;
  }

  // ---- Remise à neuf commune, puis mise en selle ----
  // Cheval à (x, z, cap) à l'arrêt ; état de l'animation du cheval du jeu remis à neuf (comme export-cso-runs.mjs) ;
  // cheval WildMesh recréé (vue, mélangeur, ressorts, lissages du siège : état de son constructeur) ; une image de mise
  // en place ; puis état du cavalier neuf et Human.mount.
  function reset(x, z, hdg) {
    A.releaseInput();
    seedRandom(P.seed);
    clock = 0;
    const day = Math.floor(g.save.data.gameTime / 86400);
    g.save.data.gameTime = day * 86400 + 11 * 3600;
    g.time = 1000;
    g.simClock = 1000;
    h.setPosition(x, z, hdg);
    h.inBox = false;
    h.ai = null;
    h.speed = 0;
    h.stamina = h.maxStamina;
    h._refusal = null;
    h._rearT = 0;
    h.control.jump = false;
    h.control.mag = 0;
    if (h.anim) {
      Object.assign(h.anim, { phase: 0, t: 0, jump: -1, turn: 0, graze: 0, rear: 0, headYaw: 0, vel: 0, speed: 0 });
      delete h.anim._a;
    }
    h.lastTurn = 0;
    g.player.csoCadence = undefined;
    // Cavaliers du décor remis à leur point de départ (export-cso-runs.mjs : leur état dépend du temps de chargement).
    for (const o of g.horses) {
      if (o === h || !o.ambient || !o.ai?.points?.length) continue;
      o.setPosition(o.ai.points[0][0], o.ai.points[0][1], 0);
      Object.assign(o, { stamina: o.maxStamina, exhausted: false, _yawRate: 0, lastTurn: 0 });
      Object.assign(o.ai, { i: 0, laps: 0, finished: false });
      if (o.anim) {
        Object.assign(o.anim, { phase: 0, t: 0, jump: -1, turn: 0, graze: 0, rear: 0, headYaw: 0, vel: 0, speed: 0 });
        delete o.anim._a;
      }
    }
    g.realism.dropPjl(h);
    for (let i = 0; i < 12 && !h.pjl; i++) g.realism.update();
    if (!h.pjl) throw new Error('cheval WildMesh non recréé');
    g.cam.snap(h.pos, h.heading);
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    // Image de mise en place (non exportée).
    clock += DT * 1000;
    g.update(DT);
    g.realism.update();
    g.scene.updateMatrixWorld();
    if (!g.camera.parent) g.camera.updateMatrixWorld();
    if (!h.pjl.fit?.flankL?.slice(2).some((x) => x > 0)) throw new Error('profil de flanc absent après l’image de mise en place');
    // Cavalier neuf : état de l'animation vidé (phase et temps fixés : human.js:79 les tire au hasard), profil de flanc
    // mémorisé effacé, puis montée (Human.mount : _init = false, _ride = null, _rideFit = null).
    const a = hu.anim;
    for (const k of Object.keys(a)) delete a[k];
    Object.assign(a, { phase: 0, speed: 0, t: 0, hair: hu.model.desc.hair === 'ponytail', turnRate: 0 });
    delete hu._flankRaw;
    hu.mount(h);
    hu.mesh.updateMatrixWorld(true);
    calibrateReal();
    inRec = null;
    P.f = 0;
    P.fade = null;
    P.done = false;
  }

  const setupInfo = () => {
    const info = hu.model.rig;
    const rest = {};
    for (const n of SK.BONES) rest[n] = hu.bones[n] ? v3(hu.bones[n].userData.rest) : null;
    const scal = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => !Array.isArray(v)));
    return {
      seed: P.seed, dt: DT, scale: hu.scale, sex: hu.sex, rig: { ...info, toe: info.toe.slice() }, bones: SK.BONES.slice(), points: ['planteL', 'planteR', 'poingL', 'poingR'],
      cq: CQ.slice(), rest, RIDE: JSON.parse(JSON.stringify(AN.RIDE)), fit0: scal(hu._fit), pjlFit: scal(h.pjl.fit),
      horse: { id: h.id ?? null, name: h.name ?? null, x: h.pos.x, z: h.pos.z, heading: h.heading }, real: realCal,
      // Ancres d'étrier et de siège au repos (repère du cheval, m) d'où le cheval tire stirrupY et stirrupZ avant bornage
      // (pjlHorse.js:252-260), et demi-largeur du tronc qui donne stirrupX.
      pjlRest: { ironL: v3(h.pjl._restAnchor('ironL')), ironR: v3(h.pjl._restAnchor('ironR')), seat: v3(h.pjl.anchorsRest.seat), barrelHalf: h.pjl.barrel?.half ?? null, seatShift: h.pjl.seatShift },
    };
  };

  // ---- Allures (plans de rider-audit.mjs, au rivage à x = 160) ----
  const zAt = (x) => g.terrain.waterlineZ(x) + 8;
  P.setupAllures = (s, seed) => {
    sc = s;
    P.seed = seed;
    h = g.mainHorse;
    h.setPosition(160, zAt(160), -Math.PI / 2);
    h.inBox = false;
    h.ai = null;
    A.mount();
    if (g.player.mode !== 'ride') throw new Error('montée impossible');
    reset(160, zAt(160), -Math.PI / 2);
    return setupInfo();
  };
  const allureCmd = (f) => {
    const p = sc.p;
    const pre = f < sc.pre;
    const I = g.input;
    let mag, speed = null;
    if (pre && !(sc.preTurn && p.turn)) {
      // Préparation (rider-audit.mjs:296) : ligne droite le long du rivage ; « repos » : à l'arrêt.
      mag = p.preMag ?? p.mag;
      if (sc.plan === 'repos') mag = 0;
      if (mag) {
        const tx = h.pos.x - 12;
        A.steer(tx - h.pos.x, zAt(tx) - h.pos.z, mag);
      } else I.setVirtualMove(0, 0);
    } else {
      // Plan (rider-audit.mjs:305-309).
      mag = p.stop && !pre ? 0 : p.mag;
      if (p.turn) A.steer(Math.sin(h.heading + p.turn * 0.9), Math.cos(h.heading + p.turn * 0.9), mag);
      else if (mag) {
        const tx = h.pos.x - 12;
        A.steer(tx - h.pos.x, zAt(tx) - h.pos.z, mag);
      } else I.setVirtualMove(0, 0);
    }
    if (p.gallop) I.held.add('gallop');
    else I.held.delete('gallop');
    h.stamina = h.maxStamina;
    return [I.move.x, I.move.y, I.held.has('gallop') ? 1 : 0, 0, speed];
  };

  // ---- CSO (préparation et cas de rider-audit.mjs:243-271 et :321-387) ----
  P.setupCso = async (s, specs, N, seed) => {
    sc = s;
    P.seed = seed;
    h = g.mainHorse;
    const W0 = (await import('/src/world/sites.js')).POLE.warmup;
    A.foot();
    h.setPosition(W0.x + 6, W0.z, Math.PI / 2);
    h.inBox = false;
    h.ai = null;
    A.mount();
    if (g.player.mode !== 'ride') throw new Error('montée impossible');
    g.activities.start(g.activities.defs.find((a) => a.id === 'cso_warmup'));
    A.tick(6); A.closeCards(); A.tick(20); A.closeCards();
    for (let k = 0; k < 120 && g.course?.controls !== 'cso'; k++) { A.tick(1); A.closeCards(); }
    if (g.course?.controls !== 'cso') throw new Error('commandes de concours non actives');
    h.mods.jump = 0.45;
    const JM = await import('/src/gameplay/jumpModel.js');
    const lane = (x, z) => {
      for (let s2 = -16; s2 <= 10; s2 += 0.5) for (const u of [-1.5, 0, 1.5]) {
        const px = x + s2, pz = z + u;
        if (g.colliders.blocked(px, pz, g.terrain.getHeight(px, pz) + 0.3)) return false;
      }
      return true;
    };
    const spots = [];
    for (let x = W0.x + 60; x < W0.x + 160 && spots.length < specs.length; x += 26) {
      for (let z = W0.z - 60; z < W0.z + 80 && spots.length < specs.length; z += 14) if (lane(x, z)) spots.push({ x, z });
    }
    const obs = specs.map((sp, i) => g.obstacles.add({ x: spots[i].x, z: spots[i].z, rot: Math.PI / 2, kind: sp.kind, h: sp.h, spread: sp.spread, w: 3.6, course: 'warmup', id: 'test_' + sp.id }));
    const [id, vs, kind] = s.cas.split(':');
    const v = +vs;
    const o = obs[specs.findIndex((sp) => sp.id === id)];
    const st = { v, power: h.jumpPower, clearance: h.mods.clearance, cso: true };
    const rows = [];
    for (let x = 0.4; x <= 8; x += 0.02) {
      const first = Math.min(...o.bars.map((b) => b.s));
      const s2 = first - x;
      const pl = JM.planJump(st, JM.railsAhead(o, o.x + o.n.x * s2, o.z + o.n.z * s2, o.n.x, o.n.z));
      rows.push({ x: +x.toFixed(2), zone: pl.zone, margin: pl.margin, gap: Math.abs(pl.ideal - pl.L) });
    }
    const good = rows.filter((r) => r.zone === 'good'), near = rows.filter((r) => r.zone === 'near'), far = rows.filter((r) => r.zone === 'far');
    const x = {
      normal: good.length ? good.reduce((a, b) => (b.gap < a.gap ? b : a)).x : null,
      tot: good.length ? Math.max(...good.map((r) => r.x)) : null,
      pres: near.length ? near[Math.floor(near.length / 2)].x : null,
      loin: far.find((r) => r.margin < -0.1)?.x ?? null,
    }[kind];
    if (x === null || x === undefined) throw new Error('distance d’appel introuvable pour ' + s.cas);
    g.obstacles._rest(o);
    const first = Math.min(...o.bars.map((b) => b.s));
    const s0 = first - x - v * (1 / 30) * N - 0.4;
    reset(o.x + o.n.x * s0, o.z + o.n.z * s0, o.rot);
    const evs = [];
    const offs = [
      g.bus.on('obstacle:clear', (e) => e.obstacle === o && evs.push('sans faute')),
      g.bus.on('obstacle:fault', (e) => e.obstacle === o && evs.push('faute : ' + (e.causeText || e.cause))),
      g.bus.on('obstacle:refusal', (e) => e.obstacle === o && evs.push('refus')),
    ];
    P.cso = { o, v, N, x, first, flew: false, landedAt: -1, evs, off: () => offs.forEach((f) => f()) };
    return { ...setupInfo(), cso: { cas: s.cas, obstacle: { id, kind: o.kind, h: o.h, spread: o.spread ?? null, x: o.x, z: o.z, rot: o.rot, n: [o.n.x, o.n.z], bars: o.bars.map((b) => [b.s, b.h]) }, v, N, appel: x, s0, power: st.power, clearance: st.clearance, modsJump: h.mods.jump } };
  };
  const csoCmd = (f) => {
    const C = P.cso, o = C.o, I = g.input;
    let speed = null;
    if (f < C.N) h.speed = speed = C.v;
    A.steer(o.n.x, o.n.z, 0.95);
    I.held.delete('gallop');
    const jump = f === C.N;
    if (jump) I.pressed.add('jump');
    return [I.move.x, I.move.y, 0, jump ? 1 : 0, speed];
  };

  // ---- Pénétration (rider-audit.mjs:80-89 et :131-150) ----
  const DIRS = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  function penetration() {
    let body = null;
    h.pjl.view.model.traverse((o) => o.isSkinnedMesh && o.material?.name === 'horse_body' && (body = o));
    if (!body) return null;
    const ray = new T.Raycaster();
    const dirs = DIRS.map((d) => new T.Vector3(...d));
    const depth = (q) => {
      let d = 9;
      for (const dir of dirs) {
        ray.set(q, dir);
        ray.far = 1.5;
        const hit = ray.intersectObject(body, false)[0];
        if (!hit) return 0;
        d = Math.min(d, hit.distance);
      }
      return d;
    };
    const W = (n) => hu.bones[n].getWorldPosition(new T.Vector3());
    let pen = 0, at = null;
    for (const s of ['l', 'r']) {
      const ch = ['Thigh', 'Shin', 'Foot', 'Toe'].map((n) => W(s + n));
      for (let k = 0; k < 3; k++) for (const t of [0.25, 0.5, 0.75, 1]) {
        const d = depth(ch[k].clone().lerp(ch[k + 1], t));
        if (d > pen) (pen = d), (at = s + ['cuisse', 'jambe', 'pied'][k]);
      }
      for (const [a, b, lab] of [['Fore', 'Hand', 'avant-bras'], ['Hand', 'Fing', 'main']]) {
        const pa = W(s + a), pb = W(s + b);
        for (const t of [0.5, 1]) {
          const d = depth(pa.clone().lerp(pb, t));
          if (d > pen) (pen = d), (at = s + lab);
        }
      }
    }
    for (const [a, b] of [['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck']]) {
      const pa = W(a), pb = W(b);
      for (const t of [0, 0.5, 1]) {
        const d = depth(pa.clone().lerp(pb, t));
        if (d > pen) (pen = d), (at = 'buste');
      }
    }
    return [pen, at];
  }

  // ---- Relevé après l'image ----
  const CQ = ['hips', 'spine', 'chest', 'neck', 'head', 'hairTail', 'lClav', 'lArm', 'lFore', 'lHand', 'lFing', 'rClav', 'rArm', 'rFore', 'rHand', 'rFing', 'lThigh', 'lShin', 'lFoot', 'lToe', 'rThigh', 'rShin', 'rFoot', 'rToe'];
  const ANCH = ['seat', 'barL', 'barR', 'bitL', 'bitR', 'withers', 'crest', 'kneeL', 'kneeR', 'ironL', 'ironR'];
  const FIST = [0, -0.068, 0.012];
  function capture(ui, withPen) {
    const S = Sm(), Hh = Hm(), V = h.pjl.view, info = hu.model.rig;
    hu.mesh.updateWorldMatrix(true, true);
    const inS = (w) => v3(w.applyMatrix4(S.inv));
    const rec = { f: P.f, ui, in: inRec };
    inRec = null;
    // Squelette classique.
    const cl = SK.BONES.map((n) => inS(hu.bones[n].getWorldPosition(new T.Vector3())));
    for (const s of ['l', 'r']) cl.push(inS(hu.bones[s + 'Foot'].localToWorld(new T.Vector3(0, -info.ankleY + 0.012, info.toe[2] - 0.005))));
    for (const s of ['l', 'r']) cl.push(inS(hu.bones[s + 'Hand'].localToWorld(new T.Vector3(...FIST))));
    rec.cl = cl;
    rec.cq = CQ.map((n) => q4(hu.bones[n].quaternion));
    // Cibles (repère du modèle × scale = S).
    const Pp = hu.anim._P, k = hu.scale;
    const sc3 = (v) => [v.x * k, v.y * k, v.z * k];
    rec.tg = {
      fL: sc3(Pp.feet.l.pos), fR: sc3(Pp.feet.r.pos), qL: q4(Pp.feet.l.q), qR: q4(Pp.feet.r.q),
      xL: Pp.feet.l.xMax === undefined ? null : Pp.feet.l.xMax * k, xR: Pp.feet.r.xMax === undefined ? null : Pp.feet.r.xMax * k,
      hL: sc3(Pp.hands.l), hR: sc3(Pp.hands.r), hp: sc3(Pp.hips),
    };
    // Cheval.
    const an = {};
    for (const n of ANCH) an[n] = inS(V.anchorWorld(n, new T.Vector3()));
    const J = V.jumpClip;
    const bw = (n) => {
      const p = V.boneWorld(n, new T.Vector3());
      return p.y - h.groundAt(p.x, p.z);
    };
    const R = h.anim._a;
    rec.hz = {
      S: [...v3(S.p), ...q4(S.q)], H: [...v3(Hh.p), ...q4(Hh.q)], an,
      ir: h.pjl.irons.map((m) => inS(m.position.clone())),
      fl: h.pjl.fit.flankL.slice(), fr: h.pjl.fit.flankR.slice(), cr: h.pjl.fit.crest.slice(),
      hv: ['fingers_02_l', 'fingers_02_r', 'toes_02_l', 'toes_02_r'].map(bw),
      jT: h.jumpT, jd: nul(h.jumpDur), jc: J?.name ?? null, cT: V.jumpTime, toeOff: J ? J.toeOff : null, foreLand: J ? J.foreLand : null,
      hd: !!h.pjl.hindDown, lT: h.pjl.landT, v: h.speed, gait: R?.gait ?? null, lead: nul(R?.lead), p: v3(h.pos), hdg: h.heading, ph: h.anim.phase, gy: h.groundAt(h.pos.x, h.pos.z),
    };
    // Mélangeur.
    const acts = [];
    for (const [name, act] of V.actions) if (act.enabled) acts.push([name, V.weights.get(name), act.time]);
    const sec = V.secondary;
    const sn = h.pjl._s || {};
    rec.mx = {
      a: acts, jc: J?.name ?? null, jm: V.jumpMirror, jt: V.jumpTime, jw: V.jumpWeight, pl: V.postLand, lb: V.leadBlend, it: V.idleTime,
      by: V.body.position.y, rz: V.body.rotation.z, co: V.contactOff,
      sec: sec ? { bascule: sec.bascule.x, headLift: sec.headLift.x, maneRoll: sec.maneRoll.x, earPrick: sec.earPrick.x } : null,
      s: { gait: sn.gait, lead: sn.lead, phase: sn.phase, strideLen: sn.strideLen, turnRate: sn.turnRate, mode: sn.mode, jt: sn.jt, jT: sn.jT, roll: sn.roll },
    };
    // Rendu réaliste (information).
    const rb = g.realism.bodies.get(hu);
    if (rb && realCal) {
      const r6 = (w) => inS(w).map(R6);
      const rz = realCal.bones.map((n) => r6(rb.bones[n].getWorldPosition(new T.Vector3())));
      for (const s of ['l', 'r']) rz.push(r6(rb.gripPoint(s, new T.Vector3())));
      for (const [s, t] of [['l', '_l'], ['r', '_r']]) rz.push(r6(rb.bones['foot' + t].localToWorld(new T.Vector3(...realCal.local[s]))));
      rec.rz = rz;
    } else rec.rz = null;
    // État interne.
    const Rr = hu.anim._ride;
    rec.dg = Rr ? {
      post: Rr.post, diag: Rr.diag, wantDiag: Rr.wantDiag, diagT: Rr.diagT, two: Rr.two, jumpK: Rr.jumpK, rel: Rr.rel, bobAvg: Rr.bobAvg, hd: Rr.hd, wasJump: Rr.wasJump,
      look: Rr.look ? [Rr.look.a, Rr.look.to, Rr.look.t] : null,
      hug: Rr.hug ? Object.fromEntries(['l', 'r'].filter((s) => Rr.hug[s]).map((s) => [s, [Rr.hug[s].px, Rr.hug[s].fx, Rr.hug[s].t]])) : null,
      bT: Pp.blendT,
    } : null;
    rec.pe = withPen ? penetration() : null;
    return rec;
  }

  // ---- Images ----
  P.frames = (n, win) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const f = P.f;
      const ui = sc.type === 'cso' ? csoCmd(f) : allureCmd(f);
      clock += DT * 1000;
      g.update(DT);
      g.realism.update();
      g.scene.updateMatrixWorld();
      if (!g.camera.parent) g.camera.updateMatrixWorld();
      if (!inRec) throw new Error('image ' + f + ' : animateRiding non appelé');
      const inW = f >= win[0] && (win[1] === null || f < win[1]);
      const rec = capture(ui, inW);
      if (P.fade === null && hu.anim._P.blendT >= 0.45) P.fade = f;
      out.push(rec);
      P.f++;
      if (sc.type === 'cso') {
        const C = P.cso, o = C.o;
        if (h.jumpT >= 0) C.flew = true;
        if (C.flew && C.landedAt < 0 && h.jumpT < 0) C.landedAt = P.f;
        const sNow = (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
        // Fin : rider-audit.mjs:378 s'arrête 30 images après la réception ; ici 45 (1,5 s), pour inclure le retour du
        // cavalier sous 10 % de la position d'obstacle (holdMax 0,45 s + recover 0,5 s + lissage, oracle-monte.md §4 E3).
        if (C.flew && C.landedAt >= 0 && P.f > C.landedAt + 45 && sNow > 5) {
          P.done = true;
          break;
        }
        if (P.f >= 200) {
          P.done = true;
          break;
        }
      }
    }
    return out;
  };
  // Capture (--shots) : caméra du jeu posée dans le repère du cheval (holder), rendu de la scène seule.
  P.shot = (ps) => {
    const cam = g.camera, H = h.pjl.holder;
    H.updateWorldMatrix(true, false);
    const eye = H.localToWorld(new T.Vector3(...ps.eyeH)), target = H.localToWorld(new T.Vector3(...ps.targetH));
    cam.position.copy(eye);
    cam.fov = ps.fovV;
    cam.aspect = ps.viewport.w / ps.viewport.h;
    cam.updateProjectionMatrix();
    cam.lookAt(target);
    g.sky.update(g.hour(), h.pos, 0);
    g.sky.follow(cam);
    g.world.update(0, cam, g.sky, h.pos);
    g.renderer.domElement.classList.add('parite-scene');
    if (!document.getElementById('parite-css')) {
      const st = document.createElement('style');
      st.id = 'parite-css';
      st.textContent = '* { visibility: hidden !important; } canvas.parite-scene { visibility: visible !important; }';
      document.head.appendChild(st);
    }
    g.scene.updateMatrixWorld();
    g.renderer.render(g.scene, cam);
    return { eye: v3(eye), target: v3(target), speed: h.speed, gait: h.pjl._s?.gait ?? null, phase: h.anim.phase, hour: g.hour(), canvas: [g.renderer.domElement.width, g.renderer.domElement.height] };
  };
  P.finish = () => {
    const r = { fade: P.fade, ev: P.cso ? P.cso.evs.slice() : null };
    if (P.cso) P.cso.off();
    return r;
  };

  // ---- Ancres de sellerie (--anchors) ----
  P.anchors = () => {
    const V = h.pjl.view, b = V.bodyMesh, sk = b.skeleton, AL = h.pjl.asset.tack.anchorLocal, as = h.pjl.asset;
    const m16 = (m) => Array.from(m.elements);
    const anchors = {};
    for (const n of ANCH) {
      const a = AL[n];
      if (!a) continue;
      const bones = [];
      for (let k = 0; k < 4; k++) {
        if (a.w[k] <= 0) continue;
        const bone = sk.bones[a.idx[k]];
        bones.push({ index: a.idx[k], name: bone.name, w: a.w[k], boneInverse: m16(sk.boneInverses[a.idx[k]]) });
      }
      anchors[n] = { p: v3(a.p), bones };
    }
    const pj = h.pjl;
    return {
      body: { mesh: b.name, vertexCount: b.geometry.attributes.position.count, bones: sk.bones.length, bindMatrix: m16(b.bindMatrix) },
      asset: { scale: as.scale, groundY: as.groundY, yaw: as.yaw },
      anchors,
      flank: { band: pj._flankBand.slice(), profile: pj.fit.flankL.slice(0, 2), slices: pj.fit.flankL.length - 2, vertices: pj._flankIdx.slice() },
      crest: { profile: [pj.fit.crest[0], pj.fit.crest[1], pj.fit.crest.length - 2], vertices: pj._crestIdx.slice() },
      seatShift: pj.seatShift,
      fit: Object.fromEntries(Object.entries(pj.fit).filter(([, v]) => !Array.isArray(v))),
    };
  };
}

// ---------------------------------------------------------------------------------------------------------------
const AUTOPILOT = readFileSync(join(ROOT, 'tests/e2e/autopilot.js'), 'utf8');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function openGame(viewport = { width: 640, height: 360 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?autostart&quality=high&lang=fr&real`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 400000, polling: 500 });
  await page.addScriptTag({ content: AUTOPILOT });
  await page.addScriptTag({ content: `(${PAGE.toString()})();` });
  await page.evaluate(() => window.__monte.install());
  return { ctx, page };
}

function writeIfChanged(file, text) {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  writeFileSync(file, text);
  return true;
}

// Arbre de src/ (empreinte git) : identifie le jeu web exporté sans dépendre des commits de la copie.
let srcTree = null;
try {
  srcTree = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD:src'], { encoding: 'utf8' }).trim();
} catch {
  srcTree = null;
}

if (ANCHORS) {
  const { ctx, page } = await openGame();
  const sc = SCENARIOS[0];
  await page.evaluate(([s, seed]) => window.__monte.setupAllures(s, seed), [{ ...sc }, SEED]);
  await page.evaluate(([w]) => window.__monte.frames(2, w), [[999, 999]]);
  const a = await page.evaluate(() => window.__monte.anchors());
  await ctx.close();
  const doc = {
    schema: 'strides.pjl_tack_anchors/1',
    generator: 'scripts/unreal/export-rider-rules.mjs --anchors',
    source: ['src/entities/pjl/view.js', 'src/entities/pjl/tack.js', 'src/entities/pjlHorse.js'],
    doc: 'ancres de sellerie du cheval WildMesh relues dans la page (h.pjl.asset.tack.anchorLocal) : pour chaque ancre, point p dans l’espace de la géométrie du corps (avant liaison) et os qui la portent (indice dans le squelette du maillage horse_body, nom du nœud, poids, matrice inverse de liaison, colonnes) ; position monde = Σ w · (os.matrixWorld · boneInverse · bindMatrix) · p (pjl/view.js anchorWorld). Profils de flanc et d’encolure (pjlHorse.js _flankUpdate) : indices des sommets du maillage horse_body retenus (attention : un import Unreal peut renuméroter les sommets, à vérifier à l’étape 5), bande d’avance (repère du cheval, m), début et pas des tranches. fit : réglages calculés par le cheval (mètres, repère du siège). asset : échelle, hauteur du sol et lacet du modèle (groupe intérieur de la vue).',
    srcTree,
    ...a,
  };
  const text = JSON.stringify(doc, null, 1) + '\n';
  console.log(`${ANCHORS_FILE} : ${writeIfChanged(ANCHORS_FILE, text) ? 'écrit' : 'inchangé'} (${text.length} octets)`);
}

if (SHOTS) {
  // Captures côte à côte (étape 6) : aucune écriture dans les oracles.
  mkdirSync(SHOTS, { recursive: true });
  const VIEW = { w: 844, h: 390 };
  const out = [];
  for (const { only, ...ps } of SHOT_POSES) {
    if (ONLY_SHOTS.length ? !ONLY_SHOTS.includes(ps.name) : only) continue;
    const sc = SCENARIOS.find((x) => x.id === ps.scenario);
    const { ctx, page } = await openGame({ width: VIEW.w, height: VIEW.h });
    if (sc.type === 'cso') await page.evaluate(([s, specs, N, seed]) => window.__monte.setupCso(s, specs, N, seed), [{ ...sc }, CSO_SPECS, CSO_N, SEED]);
    else await page.evaluate(([s, seed]) => window.__monte.setupAllures(s, seed), [{ ...sc }, SEED]);
    let n = 0;
    const shotWin = sc.type === 'cso' ? [CSO_N - 20, null] : sc.window; // fenêtre de l'export (CSO : voir plus bas)
    while (n <= ps.frame) {
      const k = Math.min(10, ps.frame + 1 - n);
      await page.evaluate(([m, w]) => window.__monte.frames(m, w), [k, shotWin]);
      n += k;
    }
    const st = await page.evaluate((p) => window.__monte.shot(p), { ...ps, viewport: VIEW });
    const file = join(SHOTS, `monte-${ps.name}-web.png`);
    await page.screenshot({ path: file });
    await ctx.close();
    out.push({ ...ps, viewport: VIEW, web: { file: `monte-${ps.name}-web.png`, ...st } });
    console.log(`capture ${ps.name} : ${ps.scenario} image ${ps.frame}, vitesse ${st.speed.toFixed(2)} m/s, ${file}`);
  }
  const doc = { schema: 'strides.monte.captures/1', generator: 'scripts/unreal/export-rider-rules.mjs --shots', srcTree,
    doc: 'captures côte à côte de la cavalière montée par les règles : caméra dans le repère du cheval (holder du web : x à gauche, y vers le haut, z vers l’avant, m ; Unreal : X = 100 z, Y = −100 x, Z = 100 y dans le repère de l’acteur du cheval), FOV vertical (degrés), viewport ; état du web à l’image de capture.',
    poses: out };
  writeFileSync(join(SHOTS, 'poses.json'), JSON.stringify(doc, null, 1) + '\n');
}
const runs = [];
const todo = SCENARIOS.filter((s) => !ONLY.length || ONLY.includes(s.id));
if (!ANCHORS_ONLY && !SHOTS) {
  for (const sc of todo) {
    const t0 = Date.now();
    const { ctx, page } = await openGame();
    let setup;
    if (sc.type === 'cso') setup = await page.evaluate(([s, specs, N, seed]) => window.__monte.setupCso(s, specs, N, seed), [{ ...sc }, CSO_SPECS, CSO_N, SEED]);
    else setup = await page.evaluate(([s, seed]) => window.__monte.setupAllures(s, seed), [{ ...sc }, SEED]);
    const frames = [];
    // Fenêtre : plan d'allure (setup) ; CSO : de N - 20 images (comme la synthèse de rider-audit.mjs:394) à la fin.
    const win = sc.type === 'cso' ? [CSO_N - 20, null] : sc.window;
    const total = sc.type === 'cso' ? 200 : sc.frames;
    while (frames.length < total) {
      const batch = await page.evaluate(([n, w]) => window.__monte.frames(n, w), [Math.min(10, total - frames.length), win]);
      frames.push(...batch);
      if (sc.type === 'cso' && (await page.evaluate(() => !!window.__monte.done))) break;
    }
    const fin = await page.evaluate(() => window.__monte.finish());
    await ctx.close();
    const window_ = sc.type === 'cso' ? [win[0], frames.length] : win;
    if (fin.fade === null || fin.fade > window_[0]) throw new Error(`${sc.id} : fenêtre de mesure avant la fin du fondu (${fin.fade})`);
    const { accept, desc, id, type } = sc;
    setup.scenario = { type, accept, plan: sc.plan ?? null, planValues: sc.p ?? null, pre: sc.pre ?? null, preTurn: !!sc.preTurn };
    setup.window = window_;
    setup.fade = fin.fade;
    if (fin.ev) setup.events = fin.ev;
    runs.push({ id, desc, setup, frames });
    console.log(`${id} : ${frames.length} images, fenêtre ${window_.join('–')}, fondu fini à ${fin.fade}, ${((Date.now() - t0) / 1000).toFixed(0)} s${fin.ev ? ', ' + (fin.ev.join(', ') || 'aucun événement') : ''}`);
  }

  mkdirSync(OUT, { recursive: true });
  const prevFile = join(OUT, 'index.json');
  const prev = existsSync(prevFile) ? JSON.parse(readFileSync(prevFile, 'utf8')) : null;
  const prevRuns = prev && prev.schema === SCHEMA ? prev.runs : [];
  const written = [], kept = [];
  const fresh = new Map();
  for (const r of runs) {
    const file = `${r.id}.json`;
    (writeIfChanged(join(OUT, file), runText(r)) ? written : kept).push(file);
    fresh.set(r.id, { id: r.id, file, frames: r.frames.length, window: r.setup.window, accept: r.setup.scenario.accept });
  }
  const entries = [];
  for (const sc of SCENARIOS) {
    const e = fresh.get(sc.id) ?? prevRuns.find((x) => x.id === sc.id && existsSync(join(OUT, x.file)));
    if (e) entries.push(e);
  }
  const head = { ...HEAD, srcTree };
  (writeIfChanged(prevFile, indexText(head, entries)) ? written : kept).push('index.json');
  const listed = new Set(['index.json', ...entries.map((e) => e.file)]);
  const orphans = readdirSync(OUT).filter((f) => f.endsWith('.json') && !listed.has(f));
  console.log(`écrits : ${written.join(' ') || 'aucun'} ; inchangés : ${kept.join(' ') || 'aucun'}${orphans.length ? ' ; non listés : ' + orphans.join(' ') : ''}`);
}
console.log('erreurs de page :', errors.length ? errors.slice(0, 5) : 'aucune');
await browser.close();
if (errors.length) process.exitCode = 1;
