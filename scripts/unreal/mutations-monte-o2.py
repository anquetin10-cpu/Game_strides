#!/usr/bin/env python3
"""Mutations de la règle de monte du web (essai de monte, voie A, étape 3) : preuve que l'oracle O1 départage la logique
de src/entities/human/anim.js, et que chaque entrée du canal in est nécessaire au rejeu O2.

Chaque mutation est appliquée à une copie, dans le dossier de travail : copie d'anim.js (constantes et branches de la
règle de monte) ou copie de scripts/unreal/rider-rules-o2.mjs (entrées du rejeu : une entrée d'O1 ignorée, retardée ou
partagée). Ni src/ ni scripts/ ne sont modifiés : la copie du rejeu importe la copie d'anim.js par chemin absolu, le reste
(skeleton.js, three, cso-runs-io.mjs, rider-rules-metrics.mjs, oracles O1) est lu dans le dépôt. Le rejeu tourne avec le
rig web_classic, sorties dans le dossier de travail (--out : aucun fichier versionné écrit, ce que le script vérifie par
empreintes), et doit échouer contre O1 (code 1, « ÉCHECS ») : c'est la détection. Un témoin (copies sans mutation) doit
passer avant toute mutation.

Une mutation non détectée n'est admise que listée dans ATTENDUES, avec sa raison et une ou plusieurs sondes qui la
prouvent : une sonde est une copie d'anim.js (ou du rejeu) qui lève une erreur quand une condition est vraie, rejouée sur
O1 ; « jamais » exige qu'aucune image ne la déclenche (branche ou seuil jamais atteint sur O1), « atteinte » qu'elle se
déclenche (branche atteinte mais sans effet). Pour une mutation non détectée, le script affiche aussi les écarts maximaux
à O1, à comparer à ceux du témoin.

Le script sort en code 1 si une mutation n'est pas détectée hors d'ATTENDUES, si l'une de celles-ci devient détectée, si
une sonde dément sa raison, ou si une mutation fait planter le rejeu ; code 2 si le témoin échoue, si un motif n'est pas
trouvé exactement une fois, ou si un fichier versionné a changé.

Usage (racine de la copie) :
  [MUT_ONLY=<texte>] python3 scripts/unreal/mutations-monte-o2.py [dossier de travail]
Défaut : .ue-cache/travail/mutations-monte-o2. Durée : environ 0,3 s par mutation ou sonde (une demi-minute en tout).
"""
import hashlib
import os
import subprocess
import sys
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
work = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else repo / '.ue-cache/travail/mutations-monte-o2'
ANIM = repo / 'src/entities/human/anim.js'
O2 = repo / 'scripts/unreal/rider-rules-o2.mjs'
A, H = 'anim.js', 'rejeu'

M = [
 # RIDE (anim.js:485-507) : hauteurs du bassin, portées de la jambe
 (A, 'RIDE.seatReach 0,93 -> 0,92', 'seatReach: 0.93, riseReach: 0.95,', 'seatReach: 0.92, riseReach: 0.95,'),
 (A, 'RIDE.riseReach 0,95 -> 0,94', 'seatReach: 0.93, riseReach: 0.95,', 'seatReach: 0.93, riseReach: 0.94,'),
 (A, 'RIDE.postLift 0,085 -> 0,075', 'postLift: 0.085, twoLift: 0.1, jumpLift: 0.05,', 'postLift: 0.075, twoLift: 0.1, jumpLift: 0.05,'),
 (A, 'RIDE.twoLift 0,1 -> 0,09', 'postLift: 0.085, twoLift: 0.1, jumpLift: 0.05,', 'postLift: 0.085, twoLift: 0.09, jumpLift: 0.05,'),
 (A, 'RIDE.jumpLift 0,05 -> 0,04', 'postLift: 0.085, twoLift: 0.1, jumpLift: 0.05,', 'postLift: 0.085, twoLift: 0.1, jumpLift: 0.04,'),
 # RIDE : accompagnement du saut
 (A, 'RIDE.foldIn 0,18 -> 0,22', 'foldIn: 0.18, releaseIn', 'foldIn: 0.22, releaseIn'),
 (A, 'RIDE.releaseIn début 0,12 -> 0,16', 'releaseIn: [0.12, 0.35]', 'releaseIn: [0.16, 0.35]'),
 (A, 'RIDE.releaseIn fin 0,35 -> 0,3', 'releaseIn: [0.12, 0.35]', 'releaseIn: [0.12, 0.3]'),
 (A, 'RIDE.holdMax 0,45 -> 0,4', 'holdMax: 0.45, recover', 'holdMax: 0.4, recover'),
 (A, 'RIDE.recover 0,5 -> 0,6', 'recover: 0.5, handBack', 'recover: 0.6, handBack'),
 (A, 'RIDE.handBack 0,4 -> 0,5', 'handBack: 0.4,', 'handBack: 0.5,'),
 (A, 'RIDE.landFold 0,6 -> 0,5', 'landFold: 0.6, hindFold: 0.4,', 'landFold: 0.5, hindFold: 0.4,'),
 (A, 'RIDE.hindFold 0,4 -> 0,3', 'landFold: 0.6, hindFold: 0.4,', 'landFold: 0.6, hindFold: 0.3,'),
 # RIDE : attente vivante, mains
 (A, 'RIDE.breathRate 0,25 -> 0,3', 'breathRate: 0.25,', 'breathRate: 0.3,'),
 (A, 'RIDE.breathChest 0,012 -> 0,015', 'breathChest: 0.012,', 'breathChest: 0.015,'),
 (A, 'RIDE.breathShoulder 0,012 -> 0,015', 'breathShoulder: 0.012,', 'breathShoulder: 0.015,'),
 (A, 'RIDE.idleShift 0,018 -> 0,022', 'idleShift: 0.018,', 'idleShift: 0.022,'),
 (A, 'RIDE.handSpread 0,02 -> 0,03', 'handSpread: 0.02,', 'handSpread: 0.03,'),
 (A, 'RIDE.handReach 0,97 -> 0,96', 'handReach: 0.97, handClear: 0.1,', 'handReach: 0.96, handClear: 0.1,'),
 (A, 'RIDE.handClear 0,1 -> 0,09', 'handReach: 0.97, handClear: 0.1,', 'handReach: 0.97, handClear: 0.09,'),
 # Jambe contre le flanc (hugFlank, anim.js:550-626)
 (A, 'THIGH_MARGIN 0,02 -> 0,03', 'const THIGH_MARGIN = 0.02;', 'const THIGH_MARGIN = 0.03;'),
 (A, 'POLE_OPEN 0,9 -> 0,8', 'const POLE_OPEN = 0.9;', 'const POLE_OPEN = 0.8;'),
 (A, 'hugFlank : marge au flanc 1 cm -> 0,5 cm', 'const gap = (p) => p.x * sg - (flankAt(flank, p.y) + clr + 0.01);', 'const gap = (p) => p.x * sg - (flankAt(flank, p.y) + clr + 0.005);'),
 (A, 'hugFlank : tibia contrôlé à mi-longueur seulement', 'for (const t of [0.35, 0.65]) gs', 'for (const t of [0.5]) gs'),
 (A, 'hugFlank : genou au-delà de la cheville toléré 1 -> 3 cm', '_hk).x * sg < foot.x * sg + 0.01);', '_hk).x * sg < foot.x * sg + 0.03);'),
 (A, 'hugFlank : genou jamais ouvert (pied d’abord)', 'if (g.gk < -1e-4 && pxMax > px0 + 1e-4) {', 'if (false) {'),
 (A, 'hugFlank : écart du pied borné à 8 cm au lieu de 12', 'Math.min(xMax, x0 + 0.12) - x0', 'Math.min(xMax, x0 + 0.08) - x0'),
 (A, 'hugFlank : étape 3 (genou rouvert, pied à sa limite) supprimée', 'if (lim <= pxNow + 1e-4) return setPole(pxNow);', 'if (true) return setPole(pxNow);'),
 # Mémoire de la jambe (hugMemory, anim.js:634-659)
 (A, 'HUG_OPEN 2,4 -> 2,0', 'const HUG_OPEN = 2.4, HUG_RELAX = 0.12;', 'const HUG_OPEN = 2.0, HUG_RELAX = 0.12;'),
 (A, 'HUG_RELAX 0,12 -> 0,2', 'const HUG_OPEN = 2.4, HUG_RELAX = 0.12;', 'const HUG_OPEN = 2.4, HUG_RELAX = 0.2;'),
 (A, 'FOOT_OPEN 0,6 -> 0,4', 'const FOOT_OPEN = 0.6, FOOT_RELAX = 0.02;', 'const FOOT_OPEN = 0.4, FOOT_RELAX = 0.02;'),
 (A, 'FOOT_RELAX 0,02 -> 0,04', 'const FOOT_OPEN = 0.6, FOOT_RELAX = 0.02;', 'const FOOT_OPEN = 0.6, FOOT_RELAX = 0.04;'),
 (A, 'hugMemory : mémoire gardée 0,25 -> 0,1 s', 'if (m && t - m.t < 0.25 && dt > 0) {', 'if (m && t - m.t < 0.1 && dt > 0) {'),
 (A, 'hugMemory : pôle borné à 0,97 -> 0,9', 'const cpx = Math.min(apx, 0.97);', 'const cpx = Math.min(apx, 0.9);'),
 (A, 'hugMemory : solution exacte au-delà de 1 -> 2 cm dans le flanc', 'if (g < -0.01) {', 'if (g < -0.02) {'),
 (A, 'hugMemory supprimée', 'hugMemory(R, P, side, sg, f.pos, pole, fl, fit.legClear || 0, info, dt, st.t || 0);', ''),
 # Pied dans l'étrier, étrivière de longueur fixe (riding, anim.js:761-842)
 (A, 'talon : 0,14 -> 0,12 rad', 'const heel = 0.14 + two * 0.06', 'const heel = 0.12 + two * 0.06'),
 (A, 'pointe ouverte : 0,10 -> 0,12 rad', 'qEuler(f.q, -heel, sg * 0.10, 0);', 'qEuler(f.q, -heel, sg * 0.12, 0);'),
 (A, 'plante sur la grille : 1,2 -> 1,5 cm au-dessus de la semelle', '_v1.set(0, -info.ankleY + 0.012, info.toe[2] - 0.005).applyQuaternion(f.q);', '_v1.set(0, -info.ankleY + 0.015, info.toe[2] - 0.005).applyQuaternion(f.q);'),
 (A, 'étrier : relèvement au trot enlevé ignoré', 'fit.stirrupY + R.post * 0.012 + two * 0.02', 'fit.stirrupY + two * 0.02'),
 (A, 'place naturelle du pied : 4 -> 3 cm', 'f.xMax = Math.abs(f.pos.x) + 0.04 *', 'f.xMax = Math.abs(f.pos.x) + 0.03 *'),
 (A, 'cheval large : bassin descendu de 3,5 -> 3 cm au plus', 'lowerSeat = Math.min(lowerSeat, 0.035 * legLen / 0.9);', 'lowerSeat = Math.min(lowerSeat, 0.03 * legLen / 0.9);'),
 (A, 'pied remonté : marge au flanc de 5 mm supprimée', 'flankAt(fl, f.pos.y) + (fit.legClear || 0) + 0.005);', 'flankAt(fl, f.pos.y) + (fit.legClear || 0));'),
 (A, 'pied remonté : une passe au lieu de trois', 'for (let pass = 0; pass < 3; pass++) {', 'for (let pass = 0; pass < 1; pass++) {'),
 (A, 'portée hors de la selle = portée assise', 'const reachNow = legLen * (dy > 0 ? RIDE.riseReach : RIDE.seatReach);', 'const reachNow = legLen * RIDE.seatReach;'),
 (A, 'pôle du genou : composante verticale −0,05 -> −0,1', 'const pole = _v5.set(sg * fit.kneeOut, -0.05, 1).normalize();', 'const pole = _v5.set(sg * fit.kneeOut, -0.1, 1).normalize();'),
 (A, 'IK de la jambe : allonge 0,9995 -> 0,999', '  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);\n  const u = d > 1e-6', '  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.999);\n  const u = d > 1e-6'),
 (A, 'kneeOf : allonge 0,9995 -> 0,999 (genou estimé différent de l’IK)', '  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);\n  _hu.copy', '  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.999);\n  _hu.copy'),
 # Allures, trot enlevé, suspension
 (A, 'trot : seuil 2,8 -> 2,6 m/s', 'const trot = sstep(2.8, 3.6, hs)', 'const trot = sstep(2.6, 3.6, hs)'),
 (A, 'galop : seuil 9,8 -> 9,0 m/s', 'const gallop = sstep(9.8, 11.8, hs);', 'const gallop = sstep(9.0, 11.8, hs);'),
 (A, 'changement de diagonal : 1,2 -> 1,0 s', 'if (R.diagT > 1.2) {', 'if (R.diagT > 1.0) {'),
 (A, 'trot enlevé : lissage 30 -> 20 /s', 'R.post = lerp(R.post, rise * trot, 1 - Math.exp(-30 * dt));', 'R.post = lerp(R.post, rise * trot, 1 - Math.exp(-20 * dt));'),
 (A, 'suspension au galop : 0,55 -> 0,5', 'const twoTarget = Math.max(canter * 0.55, gallop * 1.0, R.jumpK);', 'const twoTarget = Math.max(canter * 0.5, gallop * 1.0, R.jumpK);'),
 (A, 'suspension : lissage 5 -> 4 /s', 'R.two = lerp(R.two, twoTarget, 1 - Math.exp(-5 * dt));', 'R.two = lerp(R.two, twoTarget, 1 - Math.exp(-4 * dt));'),
 (A, 'dos du cheval : moyenne lissée 2 -> 3 /s', 'R.bobAvg = lerp(R.bobAvg, bob, 1 - Math.exp(-2 * dt));', 'R.bobAvg = lerp(R.bobAvg, bob, 1 - Math.exp(-3 * dt));'),
 (A, 'dos du cheval : amorti hors de la selle 0,4 -> 0,3', 'const dy = Math.max(0, lift - bobHP * (0.4 + two * 0.5) * offSeat);', 'const dy = Math.max(0, lift - bobHP * (0.3 + two * 0.5) * offSeat);'),
 (A, 'bassin : recul en suspension 3,5 -> 3 cm', 'let hz = R.post * 0.06 - two * 0.035 - R.jumpK * 0.02;', 'let hz = R.post * 0.06 - two * 0.03 - R.jumpK * 0.02;'),
 (A, 'bassin : bascule 0,08 -> 0,06 rad', 'qEuler(P.q.hips, 0.08 + two * 0.35', 'qEuler(P.q.hips, 0.06 + two * 0.35'),
 (A, 'buste : compensation du tangage 0,85 -> 0,8', 'const comp = -pitchW * 0.85 *', 'const comp = -pitchW * 0.8 *'),
 # Saut, calé sur les posers (anim.js:691-713)
 (A, 'saut : ouverture à la descente dès 0,6 du vol au lieu de 0,5', '(1 - (1 - RIDE.landFold) * sstep(0.5, 1, jump));', '(1 - (1 - RIDE.landFold) * sstep(0.6, 1, jump));'),
 (A, 'saut : postérieurs reposés ignorés (attente holdMax seule)', '(st.hindDown || landT >= RIDE.holdMax)', '(landT >= RIDE.holdMax)'),
 (A, 'saut : réception jamais suivie (wasJump jamais posé)', 'if (jump >= 0) R.wasJump = true;', ''),
 (A, 'saut : lissage de la flexion 14 -> 10 /s', 'R.jumpK = lerp(R.jumpK, jk, 1 - Math.exp(-14 * dt));', 'R.jumpK = lerp(R.jumpK, jk, 1 - Math.exp(-10 * dt));'),
 (A, 'saut : main rendue, lissage 10 -> 8 /s', 'R.rel = lerp(R.rel, release, 1 - Math.exp(-10 * dt));', 'R.rel = lerp(R.rel, release, 1 - Math.exp(-8 * dt));'),
 # Attente vivante, regard
 (A, 'attente : immobile en dessous de 1,6 -> 2,0 m/s', 'const still = (1 - sstep(0.3, 1.6, hs))', 'const still = (1 - sstep(0.3, 2.0, hs))'),
 (A, 'regard : lissage 1,8 -> 2,5 /s', 'R.look.a = lerp(R.look.a, R.look.to * still, 1 - Math.exp(-1.8 * dt));', 'R.look.a = lerp(R.look.a, R.look.to * still, 1 - Math.exp(-2.5 * dt));'),
 # Mains au-dessus de l'encolure
 (A, 'mains : abaissées de 7 -> 5 cm en suspension', 'hY = fit.handY - two * 0.07', 'hY = fit.handY - two * 0.05'),
 (A, 'mains : encolure lue 6 -> 4 cm devant le poignet', 'crestAt(fit.crest, hp.z + 0.06)', 'crestAt(fit.crest, hp.z + 0.04)'),
 (A, 'mains : hochement au galop 0,035 -> 0,03', 'canter * 0.035 + gallop * 0.03', 'canter * 0.03 + gallop * 0.03'),
 (A, 'bras : pôle du coude 0,45 -> 0,4', 'solveArm(B, P, side, hp, _v4.set(sg * 0.45, -0.75, -0.5).normalize(), _q2);', 'solveArm(B, P, side, hp, _v4.set(sg * 0.4, -0.75, -0.5).normalize(), _q2);'),
 # Application des poses (animateHuman, anim.js:925-975)
 (A, 'lissage pendant le fondu : 9 -> 8 /s', 'const rate = P.blendT < 0.45 ? 9 : 40;', 'const rate = P.blendT < 0.45 ? 8 : 40;'),
 (A, 'lissage après le fondu : 40 -> 30 /s', 'const rate = P.blendT < 0.45 ? 9 : 40;', 'const rate = P.blendT < 0.45 ? 9 : 30;'),
 (A, 'jambes lissées malgré le profil de flanc', 'if (k >= 1 || (exact && LEG_CHAIN.has(n))) b.quaternion.copy(P.q[n]);', 'if (k >= 1) b.quaternion.copy(P.q[n]);'),
 (A, 'bassin lissé malgré le profil de flanc', 'if (k >= 1 || exact) B.hips.position.copy(P.hips);', 'if (k >= 1) B.hips.position.copy(P.hips);'),
 (A, 'queue de cheval : raideur 60 -> 50', 'const k = 60, c = 7;', 'const k = 50, c = 7;'),
 # Entrées du rejeu (rider-rules-o2.mjs replay) : chacune est-elle nécessaire ?
 (H, 'entrée hindDown ignorée', 'hindDown: I.hindDown', 'hindDown: false'),
 (H, 'entrée landT ignorée', 'landT: I.landT', 'landT: -1'),
 (H, 'entrée jump ignorée', 'jump: I.jump', 'jump: -1'),
 (H, 'entrée pitch ignorée', 'pitch: I.pitch', 'pitch: 0'),
 (H, 'entrée bob ignorée', 'bob: I.bob', 'bob: 0'),
 (H, 'entrée turn ignorée', 'turn: I.turn', 'turn: 0'),
 (H, 'entrée t (horloge) ignorée', 'Object.assign(st, { t: I.t,', 'Object.assign(st, { t: 0,'),
 (H, 'entrée horseSpeed ignorée', 'horseSpeed: I.hs', 'horseSpeed: 0'),
 (H, 'entrée horseGaitPhase ignorée', 'horseGaitPhase: I.ph', 'horseGaitPhase: 0'),
 (H, 'entrée wave ignorée', 'wave: I.wave', 'wave: false'),
 (H, 'entrée dt remplacée par 1/30 s', "animateHuman(B, 'ride', st, I.dt);", "animateHuman(B, 'ride', st, 1 / 30);"),
 (H, 'profils de flanc avec une image de retard', 'const fit = rigFit(I.fit, S.scale, rig, shift);',
  'const prevIn = (run.frames[run.frames.indexOf(fr) - 1] ?? fr).in;\n    const fit = rigFit({ ...I.fit, flankL: prevIn.fit.flankL, flankR: prevIn.fit.flankR }, S.scale, rig, shift);'),
 (H, 'profil d’encolure (crest) ignoré', 'const fit = rigFit(I.fit, S.scale, rig, shift);', 'const fit = rigFit({ ...I.fit, crest: null }, S.scale, rig, shift);'),
 (H, 'épaisseur de la jambe (legClear) ignorée', 'const fit = rigFit(I.fit, S.scale, rig, shift);', 'const fit = rigFit({ ...I.fit, legClear: 0 }, S.scale, rig, shift);'),
 (H, 'réglage kneeOut 0,45 -> 0,5', 'const fit = rigFit(I.fit, S.scale, rig, shift);', 'const fit = rigFit({ ...I.fit, kneeOut: 0.5 }, S.scale, rig, shift);'),
 (H, 'queue de cheval inversée (st.hair)', 'const st = { hair };', 'const st = { hair: !hair };'),
 (H, 'état de la règle partagé entre scénarios (pas de mise en selle neuve)', 'const st = { hair };', 'const st = (globalThis.__st ||= { hair });'),
 (H, 'squelette à l’échelle 1 au lieu de celle du joueur', 'group.scale.setScalar(rig.scale);', 'group.scale.setScalar(1);'),
]
# Mutations qu'aucun scénario d'O1 ne peut départager : raison, et sondes qui la prouvent (cible, motif, remplacement qui
# lève « SONDE » quand la condition est vraie, attendu « jamais » ou « atteinte »). Listées pour mémoire, pas comme des
# succès : ce sont des parties de la règle que O1 n'exerce pas, ou exerce sans effet, et que le portage C++ ne pourra pas
# départager non plus contre O2 (étape 4).
T = "throw new Error('SONDE')"
ATTENDUES = {
 'hugFlank : genou au-delà de la cheville toléré 1 -> 3 cm': (
  'room() n’est jamais faux sur O1 : même pôle ouvert au maximum, le genou reste en deçà de la cheville + 1 cm ; la '
  'tolérance n’agit donc pas',
  [(A, '_hk).x * sg < foot.x * sg + 0.01);', '_hk).x * sg < foot.x * sg + 0.01 || (() => { ' + T + ' })());', 'jamais')]),
 'hugFlank : écart du pied borné à 8 cm au lieu de 12': (
  'xMax (place naturelle du pied + 4 cm) est toujours la borne la plus serrée : x0 + 0,08 ≥ xMax à chaque appel',
  [(A, 'const x0 = foot.x * sg, room2 = Math.max(0, Math.min(xMax, x0 + 0.12) - x0);',
    'const x0 = foot.x * sg, room2 = Math.max(0, Math.min(xMax, x0 + 0.12) - x0); if (x0 + 0.08 < xMax) ' + T + ';', 'jamais')]),
 'hugMemory : mémoire gardée 0,25 -> 0,1 s': (
  'mémoire relue à chaque image : t − m.t vaut le pas de 1/30 s, sous les deux seuils',
  [(A, 'if (m && t - m.t < 0.25 && dt > 0) {', 'if (m && t - m.t >= 0.1) ' + T + ';\n  if (m && t - m.t < 0.25 && dt > 0) {', 'jamais')]),
 'hugMemory : pôle borné à 0,97 -> 0,9': (
  'équivalente par construction : le pôle sort de hugFlank borné à POLE_OPEN = 0,9 et la mémoire reste entre deux '
  'valeurs ≤ 0,9 ; la borne 0,97 n’agit jamais (code mort de la v3, à porter tel quel)',
  [(A, 'const cpx = Math.min(apx, 0.97);', 'if (apx > 0.9) ' + T + ';\n    const cpx = Math.min(apx, 0.97);', 'jamais')]),
 'pied remonté : marge au flanc de 5 mm supprimée': (
  'après hugFlank, la cheville est toujours à flanc + legClear + 5 mm au moins : cette remise à distance n’agit pas sur O1',
  [(A, 'f.pos.x = sg * Math.max(Math.abs(f.pos.x), flankAt(fl, f.pos.y) + (fit.legClear || 0) + 0.005);',
    'if (flankAt(fl, f.pos.y) + (fit.legClear || 0) + 0.005 > Math.abs(f.pos.x)) ' + T + ';', 'jamais')]),
 'pied remonté : une passe au lieu de trois': (
  'la seconde passe est entamée (pied remonté à la première), mais hugFlank n’y change ni le pied ni le pôle et le pied '
  'n’y remonte plus, sur O1',
  [(A, 'for (let pass = 0; pass < 3; pass++) {', 'for (let pass = 0; pass < 3; pass++) { if (pass > 0) ' + T + ';', 'atteinte'),
   (A, '        hugFlank(P, side, sg, f.pos, pole, fl, fit.legClear || 0, info, f.xMax ?? Infinity);\n        let raised',
    '        const bx = f.pos.x, bp = pole.x;\n        hugFlank(P, side, sg, f.pos, pole, fl, fit.legClear || 0, info, f.xMax ?? Infinity);\n'
    '        if (pass > 0 && (f.pos.x !== bx || pole.x !== bp)) ' + T + ';\n        let raised', 'jamais'),
   (A, 'if (f.pos.y < minY - 1e-4) (f.pos.y = minY), (raised = true);',
    'if (f.pos.y < minY - 1e-4 && pass > 0) ' + T + ';\n          if (f.pos.y < minY - 1e-4) (f.pos.y = minY), (raised = true);', 'jamais')]),
 'IK de la jambe : allonge 0,9995 -> 0,999': (
  'ik2 (jambes et bras) ne reçoit jamais de cible au-delà de 0,98 de la longueur du membre sur O1 (la jambe est bornée '
  'par seatReach et riseReach, le bras par RIDE.handReach 0,97)',
  [(A, '  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);\n  const u = d > 1e-6',
    '  if (d > (a + b) * 0.98) ' + T + ';\n  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);\n  const u = d > 1e-6', 'jamais')]),
 'kneeOf : allonge 0,9995 -> 0,999 (genou estimé différent de l’IK)': (
  'borne atteinte pendant les recherches de hugFlank (positions candidates du pied, jambe tendue), sans changer aucune '
  'décision sur O1 : écarts identiques à ceux du témoin',
  [(A, '  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);\n  _hu.copy',
    '  if (d > (a + b) * 0.9995) ' + T + ';\n  const dc = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);\n  _hu.copy', 'atteinte')]),
 'galop : seuil 9,8 -> 9,0 m/s': (
  'vitesse du cheval de 8,7 m/s au plus dans les 8 scénarios d’O1 : la part « galop » (au-delà du galop de travail) reste '
  'nulle aux deux seuils ; RIDE gallop n’est pas exercé',
  [(A, 'const gallop = sstep(9.8, 11.8, hs);', 'if (hs > 9.0) ' + T + ';\n  const gallop = sstep(9.8, 11.8, hs);', 'jamais')]),
 'queue de cheval : raideur 60 -> 50': (
  'la cavalière d’O1 n’a pas de queue de cheval (hairTail nul à toutes les images, st.hair faux) : le ressort ne tourne pas',
  [(A, 'const H = st._hair || (st._hair = { a: 0, v: 0, b: 0, w: 0 });', T + ';\n  const H = st._hair || (st._hair = { a: 0, v: 0, b: 0, w: 0 });', 'jamais')]),
 'entrée wave ignorée': (
  'wave vaut null à toutes les images des 8 scénarios (le salut n’est pas exporté) : la branche st.wave n’est pas couverte',
  [(A, "if (st.wave && side === 'l') hx = 0.01;", "if (st.wave) " + T + ";\n    if (st.wave && side === 'l') hx = 0.01;", 'jamais')]),
 'entrée dt remplacée par 1/30 s': (
  'équivalente par construction : O1 est exporté au pas fixe de 1/30 s, dt vaut exactement 1/30 à toutes les images',
  [(H, "animateHuman(B, 'ride', st, I.dt);", "if (I.dt !== 1 / 30) " + T + ";\n    animateHuman(B, 'ride', st, I.dt);", 'jamais')]),
}
only = os.environ.get('MUT_ONLY')
if only:
    M = [m for m in M if only in m[1]]
work.mkdir(parents=True, exist_ok=True)


def tree_sha(paths):
    h = hashlib.sha256()
    for root in paths:
        for p in sorted(root.rglob('*')) if root.is_dir() else [root]:
            if p.is_file():
                h.update(str(p.relative_to(repo)).encode() + b'\0' + p.read_bytes())
    return h.hexdigest()


VERSIONED = [repo / 'unreal/core/tests/oracles/monte', repo / 'unreal/docs/parite/monte', repo / 'src']
sha0 = tree_sha(VERSIONED)

anim_src = ANIM.read_text(encoding='utf-8')
o2_src = O2.read_text(encoding='utf-8')
# Copie du rejeu : imports relatifs rendus absolus (anim.js : la copie du dossier de travail), racine du dépôt fixée.
IMPORTS = [
 ("from '../../src/entities/human/anim.js';", "from '" + (work / 'anim.js').as_uri() + "';"),
 ("from '../../src/entities/human/skeleton.js';", "from '" + (repo / 'src/entities/human/skeleton.js').as_uri() + "';"),
 ("from './cso-runs-io.mjs';", "from '" + (repo / 'scripts/unreal/cso-runs-io.mjs').as_uri() + "';"),
 ("from './rider-rules-metrics.mjs';", "from '" + (repo / 'scripts/unreal/rider-rules-metrics.mjs').as_uri() + "';"),
 ("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');", 'const ROOT = ' + repr(str(repo)) + ';'),
]
for a, _ in IMPORTS:
    if o2_src.count(a) != 1:
        print(f'rejeu : motif d’import trouvé {o2_src.count(a)} fois : {a}')
        sys.exit(2)
for a, b in IMPORTS:
    o2_src = o2_src.replace(a, b)
out = work / 'out'


def run(anim_text, o2_text):
    (work / 'anim.js').write_text(anim_text, encoding='utf-8')
    (work / 'rider-rules-o2.mjs').write_text(o2_text, encoding='utf-8')
    r = subprocess.run(['node', str(work / 'rider-rules-o2.mjs'), '--rigs=web_classic', '--no-doc', '--out=' + str(out)],
                       capture_output=True, text=True, cwd=str(repo))
    lines = r.stdout.splitlines()
    fails = [l.strip('- ').strip() for l in lines[lines.index('ÉCHECS :') + 1:]] if 'ÉCHECS :' in lines else []
    dev = next((l.split(' : ', 1)[1] for l in lines if l.startswith('web_classic contre O1')), '')
    return r.returncode, fails, r.stderr.strip().splitlines()[-1:] if r.stderr.strip() else [], dev, 'SONDE' in r.stderr


code, fails, err, dev0, _ = run(anim_src, o2_src)
if code != 0:
    print(f'témoin (copies sans mutation) : code {code} ; {fails[:2]} {err}')
    sys.exit(2)
print(f'témoin (copies sans mutation) : contrôles passés ; écarts à O1 : {dev0}', flush=True)

undetected, crashed = [], []
for target, name, a, b in M:
    src = anim_src if target == A else o2_src
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée')
        sys.exit(2)
    mut = src.replace(a, b)
    code, fails, err, dev, _ = run(mut if target == A else anim_src, mut if target == H else o2_src)
    if code == 1 and fails:
        status = 'détectée'
    elif code != 0:
        status = 'plantage'
        crashed.append(name)
    else:
        status = 'NON DÉTECTÉE'
        undetected.append(name)
    detail = fails[0][:150] if fails else (err[0][:150] if err else '')
    if status == 'NON DÉTECTÉE':
        detail = ('écarts à O1 identiques au témoin' if dev == dev0 else 'écarts à O1 : ' + dev)
    print(f'[{target}] {name} : {status}{" ; " + detail if detail else ""}', flush=True)

# Sondes des mutations attendues : chaque raison est vérifiée sur O1.
refuted = []
for n in undetected:
    if n not in ATTENDUES:
        continue
    for target, a, b, want in ATTENDUES[n][1]:
        src = anim_src if target == A else o2_src
        if src.count(a) != 1:
            print(f'sonde de « {n} » : motif trouvé {src.count(a)} fois')
            sys.exit(2)
        mut = src.replace(a, b)
        code, fails, err, dev, hit = run(mut if target == A else anim_src, mut if target == H else o2_src)
        got = 'atteinte' if hit else 'jamais'
        if not hit and code != 0:
            got = f'plantage hors sonde (code {code})'
        ok = got == want
        if not ok:
            refuted.append(n)
        print(f'  sonde ({n}) : condition {got}, attendu {want}{"" if ok else " : RAISON DÉMENTIE"}', flush=True)
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and any(m[1] == n for m in M)]
nA = sum(1 for m in M if m[0] == A)
print(f'{len(M)} mutations ({nA} de la règle, {len(M) - nA} des entrées), {len(M) - len(undetected) - len(crashed)} détectées par l’écart à O1, '
      f'{len(crashed)} par plantage, {len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES:
        print(f'  attendue : {n} ({ATTENDUES[n][0]})')
if crashed:
    print('PLANTAGES (le rejeu s’arrête avant la comparaison) : ' + ' ; '.join(crashed))
if unexpected:
    print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected:
    print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
if refuted:
    print('RAISONS DÉMENTIES PAR LEUR SONDE : ' + ' ; '.join(sorted(set(refuted))))
if tree_sha(VERSIONED) != sha0:
    print('FICHIERS VERSIONNÉS MODIFIÉS pendant les mutations (src/, oracles ou documentation de la monte)')
    sys.exit(2)
sys.exit(1 if unexpected or now_detected or crashed or refuted else 0)
