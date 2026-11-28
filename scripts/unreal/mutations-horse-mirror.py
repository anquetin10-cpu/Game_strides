#!/usr/bin/env python3
"""Mutations des clips miroir du cheval (essai de monte, voie A, étape M2) : preuve que les tests départagent la cuisson
de StridesCore/HorseMirror.cpp (port de pjl/asset.js bakeMirror, horse/anim.js, pjl/view.js), son adaptateur Unreal
(StridesHorseMirror.cpp) et le branchement du jeu (StridesHorse.cpp, option -StridesHorseLead=web).

Deux niveaux, comme scripts/unreal/mutations-horse-tack.py.
- « cœur » : la mutation est appliquée à une copie de HorseMirror.cpp (le source du dépôt n'est pas touché), reliée au
  banc unreal/core/tests/test_horse_mirror.cpp (ctest « monte-miroir », oracle miroir et O1) ; elle doit le faire échouer.
- « moteur » (option --moteur) : mutation appliquée AU SOURCE DU DÉPÔT, Unreal Build Tool recompile, l'éditeur rejoue
  Strides.Parite.HorseMirror, puis le source est rétabli (try/finally) et une dernière compilation remet le module à
  l'identique ; le script vérifie à la fin que les sources mutés n'ont plus aucune différence avec leur contenu initial.
  Environ 4 min par mutation. Une seule instance d'UnrealEditor à la fois.

Code de sortie 1 si une mutation n'est pas détectée hors de la liste ATTENDUES (raison donnée), si l'une de celles-ci
devient détectée, ou si un témoin non muté ne passe pas.

Usage (DEVELOPER_DIR réglé sur Xcode) : python3 scripts/unreal/mutations-horse-mirror.py [--moteur] [--sortie=dossier]
Défaut de sortie : .ue-cache/travail/mutations-horse-mirror (exclu de git).
"""
import os
import subprocess
import sys
import time
import ue_travail

repo = ue_travail.REPO
arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}
out = os.path.abspath(arg.get('--sortie', ue_travail.sortie('mutations-horse-mirror')))
MOTEUR = bool(arg.get('--moteur'))
# --noms=a|b : seulement ces mutations (noms exacts, séparés par « | ») ; les autres sont comptées non vérifiées.
NOMS = [n for n in str(arg.get('--noms', '')).split('|') if n]
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
game = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesGrandTour')
CORE_CPP = os.path.join(core, 'Private/HorseMirror.cpp')
ADAPT_CPP = os.path.join(game, 'Private/StridesHorseMirror.cpp')
HORSE_CPP = os.path.join(game, 'Private/StridesHorse.cpp')
ora = os.path.join(repo, 'unreal/core/tests/oracles/monte')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
test = os.path.join(repo, 'unreal/core/tests/test_horse_mirror.cpp')

C, E = 'cœur', 'moteur'
PAIR = 'out[i] = it != byBase.end() ? it->second : static_cast<int>(i);'
PLANE = 'out.d = out.n[0] * out.mid[0] + out.n[1] * out.mid[1] + out.n[2] * out.mid[2];'
LEN = 'P[f * 3 + k] = static_cast<float>(static_cast<double>(P[f * 3 + k]) * (want / L));'
REFL = '-2 * nz * nx, -2 * nz * ny, 1 - 2 * nz * nz, 2 * d * nz,'
M = [
 # Paires, plan, réflexion (asset.js bakeMirror, prepare)
 (C, CORE_CPP, 'paires : aucun os apparié', PAIR, 'out[i] = static_cast<int>(i);'),
 (C, CORE_CPP, 'paires : pose miroir posée sur l’os lui-même', 'mirroredW[pairIdx[i]] = mul(mul(S, worldM[i]), C[i]);', 'mirroredW[i] = mul(mul(S, worldM[i]), C[i]);'),
 (C, CORE_CPP, 'paires : côté « _right » ignoré', 'else if (hasSide(base, "_right", at))', 'else if (false)'),
 (C, CORE_CPP, 'plan décalé de 0,5 unité', PLANE, 'out.d = out.n[0] * out.mid[0] + out.n[1] * out.mid[1] + out.n[2] * out.mid[2] + 0.5;'),
 (C, CORE_CPP, 'plan : normale inversée (r − l)', 'double n[3] = {L[0] - R[0], L[1] - R[1], L[2] - R[2]};', 'double n[3] = {R[0] - L[0], R[1] - L[1], R[2] - L[2]};'),
 (C, CORE_CPP, 'réflexion : signe d’un terme de translation', REFL, '-2 * nz * nx, -2 * nz * ny, 1 - 2 * nz * nz, -2 * d * nz,'),
 (C, CORE_CPP, 'matrices C de la pose de repos omises', 'C[i] = mul(inverse(mul(S, restWorld[i])), restWorld[pairIdx[i]]);', 'C[i] = Mat4();'),
 # Longueurs d'os, signe, racines, temps
 (C, CORE_CPP, 'longueurs non conservées', LEN, '(void)want;'),
 (C, CORE_CPP, 'longueurs : os fixes non remis au repos', 'if (!moving) {', 'if (false) {'),
 (C, CORE_CPP, 'longueurs : seuil de mouvement ×10', 'if (hypot3(dx, dy, dz) > 1e-3 * (', 'if (hypot3(dx, dy, dz) > 1e-2 * ('),
 (C, CORE_CPP, 'longueurs : bassin aussi corrigé', 'if (base != "root" && base != "pelvis") {', 'if (base != "root") {'),
 (C, CORE_CPP, 'signe des quaternions : continuité inversée', 'if (dot < 0)', 'if (dot > 0)'),
 (C, CORE_CPP, 'racines : pistes de root_04 et _rootJoint gardées', 'if (nm == "root_04" || nm == "_rootJoint") continue;', 'if (false) continue;'),
 (C, CORE_CPP, 'renommage : virages non échangés', 'if (name.find("_L90") != std::string::npos) return swap("_L90", "_R90");', 'if (false) return swap("_L90", "_R90");'),
 (C, CORE_CPP, 'bouclage : fin du clip non bouclée', 'if (t >= duration || t < 0) {', 'if (t > duration || t < 0) {'),
 (C, CORE_CPP, 'lecture : poids des clés inversé', 'slerpFlat(qa, qb, w1, x.q);', 'slerpFlat(qa, qb, w0, x.q);'),
 (C, CORE_CPP, 'décomposition : signe du déterminant ignoré', 'if (det < 0) sx = -sx;', ''),
 # Main au galop et fondu (horse/anim.js, pjl/view.js)
 (C, CORE_CPP, 'main : virage 0,25 -> 0,30 rad/s', 'std::fabs(turn) > 0.25', 'std::fabs(turn) > 0.30'),
 (C, CORE_CPP, 'main : virage 0,25 -> 0,45 rad/s', 'std::fabs(turn) > 0.25', 'std::fabs(turn) > 0.45'),
 (C, CORE_CPP, 'main : maintien 0,5 -> 0,4 s', 'if (A.hold > 0.5) {', 'if (A.hold > 0.4) {'),
 (C, CORE_CPP, 'main : maintien non remis à zéro', '  } else\n    A.hold = 0;', '  } else\n    (void)0;'),
 (C, CORE_CPP, 'main des clips inversée', "const char dest = lead > 0 ? 'L' : 'R';", "const char dest = lead > 0 ? 'R' : 'L';"),
 (C, CORE_CPP, 'fondu de main 10/s -> 5/s', 'const double t = 1 - std::exp(-10 * dt);', 'const double t = 1 - std::exp(-5 * dt);'),
 (C, CORE_CPP, 'main : pas non borné à 0,1 s', '  dt = std::min(dt, 0.1);\n', ''),
 (C, CORE_CPP, 'main : maintien ≥ 0,5 s au lieu de > 0,5 s', 'if (A.hold > 0.5) {', 'if (A.hold >= 0.5) {'),
 (C, CORE_CPP, 'main : virage ≥ 0,25 au lieu de > 0,25', 'std::fabs(turn) > 0.25', 'std::fabs(turn) >= 0.25'),
 # Clip de saut de la vue (pjl/view.js:229-233)
 (C, CORE_CPP, 'saut : miroir à main droite', "c.mirror = lead == 'L';", "c.mirror = lead == 'R';"),
 (C, CORE_CPP, 'saut : galop dès 7 m/s (seuil du jeu par défaut)', 'c.gallop = speed > 8;', 'c.gallop = speed >= 7;'),
 (C, CORE_CPP, 'saut : galop à 8 m/s inclus', 'c.gallop = speed > 8;', 'c.gallop = speed >= 8;'),
 (C, CORE_CPP, 'saut : choix refait à chaque image du saut', 'const bool start = jumping && !v.wasJumping;', 'const bool start = jumping;'),
 (C, CORE_CPP, 'saut : choix effacé à la réception', '  v.wasJumping = jumping;\n  return start;', '  if (!jumping) v.hasClip = false;\n  v.wasJumping = jumping;\n  return start;'),
 # Moteur : la cuisson nourrie des clips d'Unreal, le mélangeur du jeu
 (E, CORE_CPP, 'moteur : aucun os apparié', PAIR, 'out[i] = static_cast<int>(i);'),
 (E, CORE_CPP, 'moteur : plan décalé de 0,5 unité', PLANE, 'out.d = out.n[0] * out.mid[0] + out.n[1] * out.mid[1] + out.n[2] * out.mid[2] + 0.5;'),
 (E, CORE_CPP, 'moteur : plan incliné (normale + 0,01 en y)', 'for (int k = 0; k < 3; k++) out.n[k] = n[k] * inv;', 'for (int k = 0; k < 3; k++) out.n[k] = n[k] * inv + (k == 1 ? 0.01 : 0.0);'),
 (E, CORE_CPP, 'moteur : longueurs non conservées', LEN, '(void)want;'),
 (E, CORE_CPP, 'moteur : signe d’un terme de translation de la réflexion', REFL, '-2 * nz * nx, -2 * nz * ny, 1 - 2 * nz * nz, -2 * d * nz,'),
 (E, ADAPT_CPP, 'adaptateur : racines du web non remises au repos à la cuisson', 'if (!StridesHorseAnim::SampleLocal(Seq, SkM, ClipT, true, L, bRaw)) return false;', 'if (!StridesHorseAnim::SampleLocal(Seq, SkM, ClipT, false, L, bRaw)) return false;'),
 (E, ADAPT_CPP, 'adaptateur : durée non arrondie en 32 bits', 'return Seq ? (double)(float)Seq->GetPlayLength() : 0;', 'return Seq ? (double)Seq->GetPlayLength() : 0;'),
 (E, ADAPT_CPP, 'adaptateur : plan pris à 0 s au lieu de 0,5 s', 'SampleLocal(Idle, SkM, 0.5, true, L, bRaw)', 'SampleLocal(Idle, SkM, 0.0, true, L, bRaw)'),
 (E, ADAPT_CPP, 'mélangeur : poids relatif oublié', 'StridesHorseAnim::Mix(Acc, In, Ly.Weight / W);', 'StridesHorseAnim::Mix(Acc, In, Ly.Weight);'),
 (E, HORSE_CPP, 'jeu : clip miroir au poids leadBlend', 'Mi.Weight = 1 - LeadBlendV;', 'Mi.Weight = LeadBlendV;'),
 (E, HORSE_CPP, 'jeu : fondu de main absent', 'LeadBlendV = strides::mirror::leadBlendStep(LeadBlendV, Lead, Dt);', 'LeadBlendV = Lead == \'R\' ? 1 : 0;'),
 # Moteur : décisions de la main et du saut dans le jeu Unreal (contrôle adverse de M2)
 (E, HORSE_CPP, 'jeu : saut en miroir à main droite (Lead == R)', 'strides::mirror::jumpViewStep(JumpV, bJumping, SpeedMS, Lead);', "strides::mirror::jumpViewStep(JumpV, bJumping, SpeedMS, Lead == 'L' ? 'R' : 'L');"),
 (E, HORSE_CPP, 'jeu : miroir du saut jamais joué', 'const int32 M = JumpV.clip.mirror ? Mirrors->Find(', 'const int32 M = Dt < 0 ? Mirrors->Find('),  # condition fausse à l’exécution (« false ? » refusé par -Wunreachable-code)
 (E, HORSE_CPP, 'jeu : saut au galop dès 7 m/s (seuil du jeu par défaut)', 'const bool bGallop = JumpV.clip.gallop;', 'const bool bGallop = SpeedMS >= 7.f;'),
 (E, HORSE_CPP, 'jeu : choix du saut refait à chaque image', 'strides::mirror::jumpViewStep(JumpV, bJumping, SpeedMS, Lead);', 'JumpV.wasJumping = false; strides::mirror::jumpViewStep(JumpV, bJumping, SpeedMS, Lead);'),
 (E, HORSE_CPP, 'jeu : virage de signe inversé pour la main', 'strides::mirror::leadStep(LeadSt, Turn, Dt);', 'strides::mirror::leadStep(LeadSt, -Turn, Dt);'),
 (E, HORSE_CPP, 'jeu : pas de la main pris en 32 bits', 'strides::mirror::leadStep(LeadSt, Turn, Dt);', 'strides::mirror::leadStep(LeadSt, Turn, (float)Dt);'),
]

ATTENDUES = {
 'plan : normale inversée (r − l)': 'mutation équivalente : la réflexion ne dépend que de n nᵀ et de d n, inchangés quand n et d changent de signe ensemble',
 'décomposition : signe du déterminant ignoré': 'mutation équivalente dans la cuisson : chaque matrice locale décomposée est parentW⁻¹ · S·W·C avec det S = det C = −1, donc de déterminant positif (déduit, non mesuré) ; la branche det < 0 ne sert pas',
 'adaptateur : racines du web non remises au repos à la cuisson': 'équivalente (déduit) : la rotation de 90° cuite dans la racine des clips Unreal est autour de l’axe latéral (−X), normal au plan de symétrie ; elle commute avec la réflexion S et disparaît des poses locales',
 'adaptateur : durée non arrondie en 32 bits': 'équivalente : UAnimSequenceBase::GetPlayLength rend déjà un float (UE 5.8, AnimSequenceBase.h:86) ; l’arrondi est gardé comme garde-fou',
 'mélangeur : poids relatif oublié': 'équivalente pour le jeu : deux couches de poids w et 1 − w, donc W = 1 au second mélange et w₂ / W = w₂ ; elle ne départagerait qu’un mélange de trois couches ou plus, que le jeu ne fait pas',
}

os.makedirs(out, exist_ok=True)
t0 = time.time()
paths = sorted({m[1] for m in M})
srcs = {p: open(p).read() for p in paths}

inc = os.path.join(core, 'Public')
flags = ['clang++', '-std=c++20', '-O1', '-I', inc]
tobj = os.path.join(out, 'test_horse_mirror.o')
c = subprocess.run(flags + ['-c', test, '-o', tobj], capture_output=True, text=True)
if c.returncode:
    print('compilation du banc échouée\n' + c.stderr[:800]); sys.exit(1)


def core_run(text, tag):
    f = os.path.join(out, 'HorseMirror.cpp')
    open(f, 'w').write(text)
    obj, exe = os.path.join(out, 'HorseMirror.o'), os.path.join(out, 'mut')
    c = subprocess.run(flags + ['-c', f, '-o', obj], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : compilation échouée\n{c.stderr[:400]}'
    c = subprocess.run(['clang++', tobj, obj, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : édition de liens échouée\n{c.stderr[:400]}'
    return subprocess.run([exe, ora, data], capture_output=True, text=True), ''


def ubt():
    return ue_travail.ubt(os.path.join(out, 'ubt-dernier.log'))


def engine_run(tag):
    state, errs, _ = ue_travail.editor_test('Strides.Parite.HorseMirror', out, tag)
    return state, errs


def run_level(level, path, a, b, name):
    src = srcs[path]
    n = src.count(a)
    if n != 1:
        return None, f'motif trouvé {n} fois, mutation non appliquée'
    if level == C:
        r, err = core_run(src.replace(a, b), name)
        if r is None:
            return None, err
        fails = [l.strip() for l in r.stdout.splitlines() if 'ÉCHEC' in l][:1]
        return bool(r.returncode), (fails[0].split(' : ', 1)[-1][:150] if fails else r.stdout.strip().splitlines()[-1] if r.stdout.strip() else '')
    try:
        open(path, 'w').write(src.replace(a, b))
        code, log = ubt()
        if code:
            return None, 'compilation UBT échouée : ' + log[-300:]
        state, errs = engine_run(name)
    finally:
        open(path, 'w').write(src)
    return state != 'Success', (errs[0][:170] if errs else state)


r, err = core_run(srcs[CORE_CPP], 'témoin')
if r is None or r.returncode:
    print(err or ('témoin cœur (source non muté) en échec :\n' + r.stdout[-800:])); sys.exit(1)
print(f'témoin cœur : passe ({r.stdout.strip().splitlines()[-1]})', flush=True)
if MOTEUR:
    code, log = ubt()
    state, errs = engine_run('témoin') if not code else ('UBT en échec', [])
    if state != 'Success':
        print(f'témoin moteur en échec : {state} {errs[:1]}'); sys.exit(1)
    print('témoin moteur : Strides.Parite.HorseMirror passe', flush=True)

undetected, skipped = [], []
try:
    for level, path, name, a, b in M:
        if NOMS and name not in NOMS:
            skipped.append(name)
            continue
        if level == E and not MOTEUR:
            skipped.append(name)
            print(f'[{level}] {name} : non vérifiée (option --moteur)')
            continue
        det, info = run_level(level, path, a, b, name)
        if det is None:
            print(f'[{level}] {name} : {info}'); undetected.append(name); continue
        if not det: undetected.append(name)
        print(f'[{level}] {name} : {"détectée" if det else "NON DÉTECTÉE"}{" ; " + info if info else ""}', flush=True)
finally:
    for p, s in srcs.items():
        open(p, 'w').write(s)
    if MOTEUR:
        code, _ = ubt()
        print(f'recompilation finale du source non muté : code {code}')
clean = all(open(p).read() == s for p, s in srcs.items())
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and n not in skipped]
done = len(M) - len(skipped)
print(f'{len(M)} mutations ({sum(1 for m in M if m[0] == C)} cœur, {sum(1 for m in M if m[0] == E)} moteur), {done} vérifiées, {done - len(undetected)} détectées, '
      f'{len(undetected)} non détectées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
print(f'sources rétablis : {"oui" if clean else "NON"} ; durée : {time.time() - t0:.0f} s')
sys.exit(1 if unexpected or now_detected or not clean else 0)
