#!/usr/bin/env python3
"""Mutations du portage C++ des règles de monte (essai de monte, voie A, étape 4) : preuve que l'oracle O2 (et le canal
« in » d'O1 pour la préparation des entrées) départage chaque constante et chaque branche de StridesCore/RiderRules.cpp.

Chaque mutation est appliquée à une copie de StridesCore/Private/RiderRules.cpp (le source du dépôt n'est jamais
modifié) ; le banc unreal/core/tests/test_monte.cpp, compilé une fois, est relié à cette copie et rejoué sur les oracles
(unreal/core/tests/oracles/monte : O2 des rigs web_classic et rider_f, O1 ; Content/Data/rider_rules.json). Une mutation
doit faire échouer le banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas détectée, hors des
mutations listées dans ATTENDUES (raison donnée) — et aussi si l'une de celles-ci devient détectée, ou si le source
non muté ne passe pas.

Les mutations portent sur l'usage des paramètres dans le .cpp (les valeurs par défaut de RiderRules.h sont, elles,
contrôlées contre rider_rules.json par le même banc).

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-rider-rules.py [dossier des oracles monte] [dossier de travail]
Défauts : unreal/core/tests/oracles/monte et build/mutations-monte.
"""
import os
import subprocess
import sys
import time

repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles/monte')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-monte')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
src = open(os.path.join(core, 'Private/RiderRules.cpp')).read()
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
test = os.path.join(repo, 'unreal/core/tests/test_monte.cpp')

M = [
 # Trot enlevé, diagonal, suspension (riding, anim.js:668-713)
 ('trot enlevé : amorti 30 /s -> 15 /s', 'R.post = lerp(R.post, rise * trot, 1 - std::exp(-30 * dt));', 'R.post = lerp(R.post, rise * trot, 1 - std::exp(-15 * dt));'),
 ('trot enlevé : lever jusqu’à 0,2 -> 0,3 de la foulée', 'smoothstep(0.02, 0.2, u)', 'smoothstep(0.02, 0.3, u)'),
 ('diagonal : seuil de virage 0,25 -> 0,5', 'if (std::abs(turn) > 0.25) R.wantDiag', 'if (std::abs(turn) > 0.5) R.wantDiag'),
 ('diagonal : délai 1,2 s -> 0,6 s', 'if (R.diagT > 1.2) {', 'if (R.diagT > 0.6) {'),
 ('suspension : amorti 5 /s -> 3 /s', 'R.two = lerp(R.two, twoTarget, 1 - std::exp(-5 * dt));', 'R.two = lerp(R.two, twoTarget, 1 - std::exp(-3 * dt));'),
 ('galop : part de suspension 0,55 -> 0,4', 'jmax(jmax(canter * 0.55, gallop * 1.0), R.jumpK)', 'jmax(jmax(canter * 0.4, gallop * 1.0), R.jumpK)'),
 # Accompagnement du saut, calé sur les posers
 ('saut : flexion foldIn -> 0,3', 'smoothstep(0, RIDE.foldIn, jump)', 'smoothstep(0, 0.3, jump)'),
 ('saut : landFold ignoré pendant le vol', '* (1 - (1 - RIDE.landFold) * smoothstep(0.5, 1, jump));', ';'),
 ('saut : main rendue dès 0,12 -> 0,2 du vol', 'smoothstep(RIDE.releaseIn0, RIDE.releaseIn1, jump)', 'smoothstep(0.2, RIDE.releaseIn1, jump)'),
 ('réception : postérieurs reposés ignorés', '(in.hindDown || landT >= RIDE.holdMax)', '(landT >= RIDE.holdMax)'),
 ('réception : attente holdMax 0,45 -> 0,25 s', '(in.hindDown || landT >= RIDE.holdMax)', '(in.hindDown || landT >= 0.25)'),
 ('réception : hindFold -> 0,2', '(RIDE.landFold - RIDE.hindFold)', '(RIDE.landFold - 0.2)'),
 ('réception : redressement recover 0,5 -> 1 s', 'smoothstep(0, RIDE.recover, landT - R.hd)', 'smoothstep(0, 1.0, landT - R.hd)'),
 ('réception : main ramenée handBack 0,4 -> 0,8 s', '1 - smoothstep(0, RIDE.handBack, landT)', '1 - smoothstep(0, 0.8, landT)'),
 ('saut : amorti de jumpK 14 /s -> 7 /s', 'R.jumpK = lerp(R.jumpK, jk, 1 - std::exp(-14 * dt));', 'R.jumpK = lerp(R.jumpK, jk, 1 - std::exp(-7 * dt));'),
 ('saut : amorti de la main 10 /s -> 5 /s', 'R.rel = lerp(R.rel, release, 1 - std::exp(-10 * dt));', 'R.rel = lerp(R.rel, release, 1 - std::exp(-5 * dt));'),
 # Bassin, buste, attente
 ('dos : moyenne 2 /s -> 4 /s', 'R.bobAvg = lerp(R.bobAvg, bob, 1 - std::exp(-2 * dt));', 'R.bobAvg = lerp(R.bobAvg, bob, 1 - std::exp(-4 * dt));'),
 ('bassin : lever du trot postLift -> 0,1', 'R.post * RIDE.postLift', 'R.post * 0.1'),
 ('bassin : lever de suspension twoLift -> 0,08', 'two * RIDE.twoLift', 'two * 0.08'),
 ('bassin : lever d’obstacle jumpLift -> 0', 'R.jumpK * RIDE.jumpLift', 'R.jumpK * 0'),
 ('bassin : amorti du dos hors de la selle ignoré', 'lift - bobHP * (0.4 + two * 0.5) * offSeat', 'lift'),
 ('bassin : recul en suspension 3,5 -> 2 cm', '- two * 0.035 -', '- two * 0.02 -'),
 ('buste : suspension 0,52 -> 0,4', 'two * 0.52', 'two * 0.4'),
 ('buste : tangage du dos non compensé', 'const double comp = -pitchW * 0.85', 'const double comp = 0 * pitchW * 0.85'),
 ('buste : compensation à l’obstacle 0,75 -> 0,5', '(pitchW < 0 ? 0.75 : 0.25)', '(pitchW < 0 ? 0.5 : 0.25)'),
 ('attente : immobilité jusqu’à 1,6 -> 3 m/s', '(1 - smoothstep(0.3, 1.6, hs))', '(1 - smoothstep(0.3, 3.0, hs))'),
 ('attente : respiration breathRate -> 0,5 Hz', 't * RIDE.breathRate * kTau', 't * 0.5 * kTau'),
 ('attente : transfert de poids idleShift -> 0', 'shiftW * RIDE.idleShift);', 'shiftW * 0);'),
 ('regard : durée 2,5 + 3,5 × hasard -> 2,5 s', 'R.lookT = 2.5 + 3.5 * frac(std::sin(t * 12.9898) * 43758.5);', 'R.lookT = 2.5;'),
 ('regard : amplitude 0,6 -> 0,3', '- 0.5) * 0.6;', '- 0.5) * 0.3;'),
 ('tête : relevée de 0,06 -> 0', '-totalPitch * 0.42 + 0.06 -', '-totalPitch * 0.42 + 0 -'),
 # Jambes : pied dans l'étrier, étrivière fixe, genou continu, jambe contre le flanc
 ('talon : abaissé de 0,14 -> 0,10 rad', 'const double heel = 0.14 + two * 0.06', 'const double heel = 0.10 + two * 0.06'),
 ('pied : ouverture de la pointe 0,10 -> 0', 'fq = qEuler(-heel, sg * 0.10, 0);', 'fq = qEuler(-heel, 0, 0);'),
 ('plante : 1,2 cm au-dessus de la semelle -> 0', 'const Vec3 v1 = applyQ(vset(0, -info.ankleY + 0.012,', 'const Vec3 v1 = applyQ(vset(0, -info.ankleY + 0,'),
 ('étrier : remonté au trot enlevé (1,2 cm) ignoré', 'fit.stirrupY + R.post * 0.012 + two * 0.02', 'fit.stirrupY + two * 0.02'),
 ('cheville hors du flanc ignorée', '      fpos.x = sg * jmax(std::abs(fpos.x), flankAt(*fl, fpos.y) + orZero(fit.legClear));\n', ''),
 ('place naturelle du pied : 4 -> 8 cm', 'std::abs(fpos.x) + 0.04 * (', 'std::abs(fpos.x) + 0.08 * ('),
 ('assise : portée seatReach -> 0,95', 'const double maxReach = legLen * RIDE.seatReach;', 'const double maxReach = legLen * 0.95;'),
 ('cheval large : abaissement du bassin non borné', 'if (wide) lowerSeat = jmin(lowerSeat, 0.035 * legLen / 0.9);', '(void)wide;'),
 ('cheval large : bassin abaissé, troncs non recalculés (retard)', '    P.tg.hips.y -= lowerSeat;\n    forwardTrunk(rig_, P);', '    P.tg.hips.y -= lowerSeat;'),
 ('cheval large : pied non remonté à portée', '      if (fpos.y < minY) fpos.y = minY;\n', ''),
 ('debout : portée riseReach -> 0,97', 'const double riseReach = legLen * RIDE.riseReach;', 'const double riseReach = legLen * 0.97;'),
 ('debout : bassin soulevé sans limite de portée', 'P.tg.hips.y = jmax(seated, top);', 'P.tg.hips.y = seated + dy;'),
 ('hugFlank : marge de 1 cm -> 0', '(flankAt(flank, p.y) + clr + 0.01); };', '(flankAt(flank, p.y) + clr); };'),
 ('cuisse : THIGH_MARGIN ignoré (2 cm -> 0)', 'gap(vlerp(hip, knee, 0.75))) - margin;', 'gap(vlerp(hip, knee, 0.75))) - 0 * margin;'),
 ('hugFlank : tibia à 65 % -> 90 %', '    for (const double t : {0.35, 0.65}) gs = jmin(gs, gap(vlerp(hk, foot, t)));', '    for (const double t : {0.35, 0.9}) gs = jmin(gs, gap(vlerp(hk, foot, t)));'),
 ('hugFlank : POLE_OPEN 0,9 -> 0,8', 'const double POLE_OPEN = C.poleOpen;', 'const double POLE_OPEN = 0.8;'),
 ('hugFlank : genou au-delà de la cheville (1 -> 5 cm)', 'foot.x * sg + 0.01;', 'foot.x * sg + 0.05;'),
 ('hugFlank : ordre inversé, pied avant genou (étape 1 sautée)', 'if (g.gk < -1e-4 && pxMax > px0 + 1e-4) {', 'if (false) {'),
 ('hugFlank : étape 2 (pied) supprimée', 'if (room2 > 1e-5) {', 'if (false) {'),
 ('hugFlank : étape 3 (genou encore) supprimée', 'if (lim <= pxNow + 1e-4) {', 'if (true) {'),
 ('hugFlank : écart du pied 12 -> 6 cm', 'jmin(xMax, x0 + 0.12) - x0', 'jmin(xMax, x0 + 0.06) - x0'),
 ('hugFlank : dichotomie du genou 14 -> 4 pas', 'for (int i = 0; i < 14; i++) {\n        const double m = (lo + hi) / 2;\n        setPole(m);\n        if (gaps().gk', 'for (int i = 0; i < 4; i++) {\n        const double m = (lo + hi) / 2;\n        setPole(m);\n        if (gaps().gk'),
 ('hugFlank : genou ouvert au maximum sans dichotomie', '      setPole(hi);\n    }\n  }\n  g = gaps();', '      setPole(pxMax);\n    }\n  }\n  g = gaps();'),
 ('jambe : une seule passe de remontée (3 -> 1)', 'for (int pass = 0; pass < 3; pass++) {', 'for (int pass = 0; pass < 1; pass++) {'),
 ('jambe : marge de remontée 0,5 cm -> 0', '+ orZero(fit.legClear) + 0.005);', '+ orZero(fit.legClear));'),
 ('hugMemory : supprimée', '      hugMemory(C_, R, P, side, sg, fpos, pole, *fl, orZero(fit.legClear), info, dt, t);\n', ''),
 ('hugMemory : ouverture HUG_OPEN × 0,5', 'jmin(px, mpx + C.hugOpen * dt)', 'jmin(px, mpx + 0.5 * C.hugOpen * dt)'),
 ('hugMemory : refermeture HUG_RELAX × 2', 'jmax(px, mpx - C.hugRelax * dt)', 'jmax(px, mpx - 2 * C.hugRelax * dt)'),
 ('hugMemory : écart du pied FOOT_OPEN × 0,5', 'jmin(fx, mfx + C.footOpen * dt)', 'jmin(fx, mfx + 0.5 * C.footOpen * dt)'),
 ('hugMemory : resserrement du pied FOOT_RELAX × 4', 'jmax(fx, mfx - C.footRelax * dt)', 'jmax(fx, mfx - 4 * C.footRelax * dt)'),
 ('hugMemory : pôle plafonné à 0,97 -> 0,9', 'const double cpx = jmin(apx, 0.97);', 'const double cpx = jmin(apx, 0.9);'),
 ('hugMemory : solution exacte au-delà de 1 -> 3 cm', 'if (g < -0.01) {', 'if (g < -0.03) {'),
 ('hugMemory : mémoire de 0,25 s -> 0', 't - R.hugT[side] < 0.25', 't - R.hugT[side] < 0'),
 # IK et cinématique
 ('ik2 : jambe tendue à 0,9995 -> 1', 'const double dc = clampd(d, std::abs(a - b) + 1e-4, (a + b) * 0.9995);\n  const Vec3 u =', 'const double dc = clampd(d, std::abs(a - b) + 1e-4, (a + b) * 1.0);\n  const Vec3 u ='),
 ('kneeOf : jambe tendue à 0,9995 -> 1', 'const double dc = clampd(d, std::abs(a - b) + 1e-4, (a + b) * 0.9995);\n  const Vec3 hu =', 'const double dc = clampd(d, std::abs(a - b) + 1e-4, (a + b) * 1.0);\n  const Vec3 hu ='),
 ('pôle du genou : composante basse −0,05 -> 0', 'Vec3 pole = vnormalize(vset(sg * fit.kneeOut, -0.05, 1));', 'Vec3 pole = vnormalize(vset(sg * fit.kneeOut, 0, 1));'),
 ('pied : orientation non appliquée', 'P.q[kFoot[s]] = qmul(qconj(P.mqShin[s]), footQ);', 'P.q[kFoot[s]] = footQ;'),
 ('tronc : bras rattaché au buste, pas à la clavicule', 'P.mpArm[s] = vadd(applyQ(rest[kArm[s]], P.mqClav[s]), P.mpClav[s]);', 'P.mpArm[s] = vadd(applyQ(rest[kArm[s]], P.mqChest), P.mpClav[s]);'),
 # Bras et mains au-dessus de l'encolure
 ('mains : handSpread ignoré', 'double hx = sg * (fit.handX + RIDE.handSpread);', 'double hx = sg * fit.handX;'),
 ('mains : suivi du dos 0,3 -> 0', 'hp = vset(hx, hY - bobHP * 0.3, hZ);', 'hp = vset(hx, hY, hZ);'),
 ('mains : avance en suspension 0,13 -> 0,1', 'two * 0.13', 'two * 0.1'),
 ('mains : hochement au galop 0,035 -> 0,07', 'canter * 0.035', 'canter * 0.07'),
 ('encolure : handClear -> 0,05', 'crestAt(fit.crest, hp.z + 0.06) + RIDE.handClear', 'crestAt(fit.crest, hp.z + 0.06) + 0.05'),
 ('encolure : avance du poignet 6 cm ignorée', 'crestAt(fit.crest, hp.z + 0.06)', 'crestAt(fit.crest, hp.z)'),
 ('bras : handReach -> 1', '* RIDE.handReach;', '* 1.0;'),
 ('poing : tournure −0,6 -> −0,5', 'lookQ(vset(-sg * 0.25, -0.6, 1)', 'lookQ(vset(-sg * 0.25, -0.5, 1)'),
 ('coude : pôle vers l’arrière −0,5 -> +0,5', 'vset(sg * 0.45, -0.75, -0.5)', 'vset(sg * 0.45, -0.75, 0.5)'),
 ('doigts : fermeture 1,25 -> 1', 'qAxis(kZv, -sg * 1.25)', 'qAxis(kZv, -sg * 1.0)'),
 # Application lissée (animateHuman) et squelette
 ('lissage : fondu 0,45 s -> 0,3 s', 'const double rate = P.blendT < 0.45 ? 9 : 40;', 'const double rate = P.blendT < 0.3 ? 9 : 40;'),
 ('lissage : régime 40 /s -> 20 /s', 'const double rate = P.blendT < 0.45 ? 9 : 40;', 'const double rate = P.blendT < 0.45 ? 9 : 20;'),
 ('lissage : jambes lissées au lieu d’exactes (retard)', 'const bool exact = P.blendT >= 0.45 &&', 'const bool exact = false &&'),
 ('lissage : os hors jambes non lissés', 'else boneQ_[n] = qSlerp(boneQ_[n], P.q[n], k);', 'else boneQ_[n] = P.q[n];'),
 ('lissage : slerp, branche linéaire supprimée', 'if (sqrSinHalfTheta <= std::numeric_limits<double>::epsilon()) {', 'if (false) {'),
 ('squelette : échelle du cavalier ignorée', 'compose(Vec3{}, Quat{}, s, s, s)', 'compose(Vec3{}, Quat{}, 1, 1, 1)'),
 ('poing droit = poing gauche', 'side == 1 && rig_.hasFistR ? rig_.fistR : rig_.fist', 'rig_.fist'),
 # Entrées (human.js animateRiding)
 ('entrées : tangage de signe opposé', 'a.pitch = -std::asin(', 'a.pitch = std::asin('),
 ('entrées : réception, landT figé', '    landT_ += step;\n', ''),
 ('entrées : profils sans resserrement borné (FLANK_RELAX)', 'arr[i] = jmax((v[i] + grow) * k, arr[i] - C_.flankRelax * k * step);', 'arr[i] = (v[i] + grow) * k;'),
 ('entrées : élargissement non anticipé (FLANK_LEAD)', 'const double grow = jmax(0, v[i] - raw[i]) * C_.flankLead;', 'const double grow = 0;'),
 ('entrées : profils en mètres (échelle ignorée)', '        arr[i] = v[i] * k;\n', '        arr[i] = v[i];\n'),
 ('entrées : contactOff ignoré', 'a.bob = h.attachY - h.horseY - orZero(h.contactOff);', 'a.bob = h.attachY - h.horseY;'),
 ('entrées : virage × 1,4 -> × 1', 'clampd(orZero(h.lastTurn) * 1.4, -1, 1)', 'clampd(orZero(h.lastTurn) * 1, -1, 1)'),
 # Branches que les scénarios n'exercent pas (voir ATTENDUES)
 ('queue de cheval : ressort 60 -> 30', 'const double k = 60, c = 7;', 'const double k = 30, c = 7;'),
 ('salut : main gauche à 1 cm -> 5 cm', 'if (in.wave && side == 0) hx = 0.01;', 'if (in.wave && side == 0) hx = 0.05;'),
 ('sans réglages : DEFAULT_FIT ignoré', 'const RideFit& fit = in.hasFit ? in.fit : C_.defaultFit;', 'const RideFit& fit = in.fit;'),
]

# Ordre : mémoire de la jambe (hugMemory) appliquée avant la recherche contre le flanc et la remontée du pied, au lieu
# d'après (bloc relu dans le source, déplacé tel quel).
_mem = '      hugMemory(C_, R, P, side, sg, fpos, pole, *fl, orZero(fit.legClear), info, dt, t);\n'
_beg = '      for (int pass = 0; pass < 3; pass++) {\n'
if src.count(_mem) == 1 and src.count(_beg) == 1 and src.index(_beg) < src.index(_mem):
    _blk = src[src.index(_beg):src.index(_mem) + len(_mem)]
    M.append(('ordre : mémoire de la jambe avant la recherche du flanc', _blk, _mem + _blk[:-len(_mem)]))
else:
    M.append(('ordre : mémoire de la jambe avant la recherche du flanc', '<motif introuvable>', ''))

# Mutations qu'aucun oracle ne peut départager (raison donnée) : listées pour mémoire, pas comme des succès.
ATTENDUES = {
 # Parties de la règle que les scénarios d'O1 n'exercent pas : mêmes constats que mutations-monte-o2.py sur anim.js, où
 # chaque raison est prouvée par une sonde rejouée sur O1 (étape 3, README de unreal/docs/parite/monte).
 'hugFlank : genou au-delà de la cheville (1 -> 5 cm)': 'room() jamais faux dans les scénarios : la limite « genou au-delà de la cheville » n’est jamais atteinte',
 'hugFlank : écart du pied 12 -> 6 cm': 'la place naturelle du pied (xMax, 4 cm) est toujours plus serrée que la borne de l’écart',
 'jambe : une seule passe de remontée (3 -> 1)': 'seconde passe de la remontée du pied atteinte, sans effet sur la pose',
 'jambe : marge de remontée 0,5 cm -> 0': 'marge de 5 mm de la remontée sans effet sur la pose dans les scénarios',
 'hugMemory : pôle plafonné à 0,97 -> 0,9': 'borne inactive : avec kneeOut = 0,45 (pôle initial 0,41), le pôle et sa mémoire restent sous POLE_OPEN = 0,9',
 'ik2 : jambe tendue à 0,9995 -> 1': 'allonge de la jambe toujours sous 0,98 de sa longueur (borne jamais atteinte)',
 'kneeOf : jambe tendue à 0,9995 -> 1': 'allonge de la jambe toujours sous 0,98 de sa longueur (borne jamais atteinte)',
 'lissage : slerp, branche linéaire supprimée': 'branche prise à un ulp de la cible : écart de quelques 1e-9 au plus (o2.md §1), sous les tolérances du plan',
 'entrées : virage × 1,4 -> × 1': 'h.lastTurn n’est pas exporté dans O1 : le virage est repris du canal in, la formule n’est pas comparée',
 'queue de cheval : ressort 60 -> 30': 'aucun scénario avec queue de cheval (setup.hair faux pour les deux rigs)',
 'salut : main gauche à 1 cm -> 5 cm': 'aucun salut en selle dans les scénarios (wave nul)',
 'sans réglages : DEFAULT_FIT ignoré': 'le jeu fournit toujours fit (hu._fit) : DEFAULT_FIT n’est jamais lu dans les scénarios',
}

os.makedirs(out, exist_ok=True)
inc = os.path.join(core, 'Public')
flags = ['clang++', '-std=c++20', '-O1', '-I', inc]
t0 = time.time()
tobj = os.path.join(out, 'test_monte.o')
c = subprocess.run(flags + ['-c', test, '-o', tobj], capture_output=True, text=True)
if c.returncode:
    print('compilation du banc échouée\n' + c.stderr[:800]); sys.exit(1)


def build_and_run(text, tag):
    f = os.path.join(out, 'RiderRules.cpp')
    open(f, 'w').write(text)
    obj = os.path.join(out, 'RiderRules.o')
    exe = os.path.join(out, 'mut')
    c = subprocess.run(flags + ['-c', f, '-o', obj], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : compilation échouée\n{c.stderr[:400]}'
    c = subprocess.run(['clang++', tobj, obj, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : édition de liens échouée\n{c.stderr[:400]}'
    return subprocess.run([exe, ora, data], capture_output=True, text=True), ''


# Témoin : le source non muté passe.
r, err = build_and_run(src, 'témoin')
if r is None or r.returncode:
    print(err or ('témoin (source non muté) en échec :\n' + r.stdout[-800:])); sys.exit(1)
print(f'témoin (source non muté) : passe ({r.stdout.strip().splitlines()[-1]})', flush=True)

undetected = []
for name, a, b in M:
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); undetected.append(name); continue
    r, err = build_and_run(src.replace(a, b), name)
    if r is None:
        print(err); undetected.append(name); continue
    last = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    fails = [l.strip() for l in r.stdout.splitlines() if 'ÉCHEC' in l][:1]
    status = 'détectée' if r.returncode else 'NON DÉTECTÉE'
    if not r.returncode: undetected.append(name)
    first = fails[0].split(' : ', 1)[-1][:150] if fails else ''
    print(f'{name} : {status} (code {r.returncode}, {last}){" ; " + first if first else ""}', flush=True)
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected]
print(f'{len(M)} mutations, {len(M) - len(undetected)} détectées, {len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
print(f'durée : {time.time() - t0:.0f} s')
sys.exit(1 if unexpected or now_detected else 0)
