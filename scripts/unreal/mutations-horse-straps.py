#!/usr/bin/env python3
"""Mutations de la sellerie affichée (étape S1) : preuve que les tests départagent StridesCore/HorseStraps.cpp (port de
pjlHorse.js Strap, _straps et horse.js _stirrupsFollow), le composant UStridesHorseTackMesh et les points de la cavalière
qu'il lit (UStridesRiderRig::ToePoint, GripPoint).

Deux niveaux, comme scripts/unreal/mutations-horse-tack.py :
- « cœur » : mutation appliquée à une copie de HorseStraps.cpp (le source du dépôt n'est pas touché), reliée au banc
  unreal/core/tests/test_horse_straps.cpp (ctest « monte-sellerie ») et rejouée sur l'oracle sellerie/ ; elle doit le faire
  échouer ;
- « moteur » (option --moteur) : mutation appliquée AU SOURCE DU DÉPÔT, Unreal Build Tool recompile, l'éditeur rejoue
  Strides.Parite.HorseTackMesh, puis le source est rétabli (try/finally) et une dernière compilation remet le module à
  l'identique ; contrôle final : sources identiques à leur texte d'avant la campagne.

Code 1 si une mutation n'est pas détectée hors de la liste ATTENDUES (raison donnée), si l'une de celles-ci devient
détectée, ou si un témoin non muté ne passe pas.
Usage (DEVELOPER_DIR réglé sur Xcode) : python3 scripts/unreal/mutations-horse-straps.py [--moteur] [--sortie=dossier]
Défaut de sortie : .ue-cache/travail/mutations-horse-straps (scripts/unreal/ue_travail.py : chemins réels, -trace=none).
"""
import os
import subprocess
import sys
import time
import ue_travail

sys.dont_write_bytecode = True
repo = ue_travail.REPO
arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}
out = os.path.abspath(arg.get('--sortie', ue_travail.sortie('mutations-horse-straps')))
MOTEUR = bool(arg.get('--moteur'))
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
game = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesGrandTour')
CORE_CPP = os.path.join(core, 'Private/HorseStraps.cpp')
COMP_CPP = os.path.join(game, 'Private/StridesHorseTackMesh.cpp')
COMP_H = os.path.join(game, 'Public/StridesHorseTackMesh.h')
RIG_CPP = os.path.join(game, 'Private/StridesRiderRig.cpp')
ora = os.path.join(repo, 'unreal/core/tests/oracles/monte')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
test = os.path.join(repo, 'unreal/core/tests/test_horse_straps.cpp')

C, E = 'cœur', 'moteur'
M = [
 # Strap.set (pjlHorse.js:115-149)
 (C, CORE_CPP, 'ruban : pas t sur n + 1', 'const double t = (double)i / p.n;', 'const double t = (double)i / (p.n + 1);'),
 (C, CORE_CPP, 'ruban : flèche vers le haut', 'a.y + (b.y - a.y) * t - std::sin(kPi * t) * sag', 'a.y + (b.y - a.y) * t + std::sin(kPi * t) * sag'),
 (C, CORE_CPP, 'ruban : flèche en demi-sinus', 'std::sin(kPi * t) * sag', 'std::sin(0.5 * kPi * t) * sag'),
 (C, CORE_CPP, 'ruban : demi-largeur doublée d’un côté', 'out[2 * i] = V3{x - side.x * p.w, y - side.y * p.w, z - side.z * p.w};', 'out[2 * i] = V3{x - 2 * side.x * p.w, y - 2 * side.y * p.w, z - 2 * side.z * p.w};'),
 (C, CORE_CPP, 'ruban : bords inversés', 'out[2 * i] = V3{x - side.x * p.w, y - side.y * p.w, z - side.z * p.w};\n    out[2 * i + 1] = V3{x + side.x * p.w, y + side.y * p.w, z + side.z * p.w};',
  'out[2 * i + 1] = V3{x - side.x * p.w, y - side.y * p.w, z - side.z * p.w};\n    out[2 * i] = V3{x + side.x * p.w, y + side.y * p.w, z + side.z * p.w};'),
 (C, CORE_CPP, 'ruban : dernier segment oublié', 'for (int i = 0; i <= p.n; i++) {', 'for (int i = 0; i < p.n; i++) {'),
 # _stirrupsFollow (horse.js:193-216)
 (C, CORE_CPP, 'étrier tenu : abaissement sans l’échelle du cavalier', 's.y -= m.toeDrop * riderScale;', 's.y -= m.toeDrop;'),
 (C, CORE_CPP, 'étrier tenu : relevé au lieu d’abaissé', 's.y -= m.toeDrop * riderScale;', 's.y += m.toeDrop * riderScale;'),
 # _straps (pjlHorse.js:883-930)
 (C, CORE_CPP, 'étrier : toujours pendant', 'const V3 iron = in.inStirrup[k] ? in.stirrup[k] : in.ironAnchor[k];', 'const V3 iron = in.ironAnchor[k];'),
 (C, CORE_CPP, 'étrier : orientation identité', 'out.ironQ[k] = in.holder;', 'out.ironQ[k] = Q4{};'),
 (C, CORE_CPP, 'étrivière : œil dans l’axe z', 'eye.y += m.ironEye;', 'eye.z += m.ironEye;'),
 (C, CORE_CPP, 'étrivière : largeur selon l’axe latéral', 'strapSet(m.leather, in.bar[k], eye, 0, fw, out.leather[k]);', 'strapSet(m.leather, in.bar[k], eye, 0, lat, out.leather[k]);'),
 (C, CORE_CPP, 'étrivière : flèche des rênes', 'strapSet(m.leather, in.bar[k], eye, 0, fw, out.leather[k]);', 'strapSet(m.leather, in.bar[k], eye, m.reinSagMax, fw, out.leather[k]);'),
 (C, CORE_CPP, 'rênes : largeur selon l’avant', 'm.reinSagFree, V3{0, 1, 0}, out.rein[k]);', 'm.reinSagFree, fw, out.rein[k]);'),
 (C, CORE_CPP, 'rênes : flèche maximale toujours', 'std::fmin(m.reinSagMax, len * m.reinSagPerLen)', 'm.reinSagMax'),
 (C, CORE_CPP, 'rênes : flèche proportionnelle seule', 'std::fmin(m.reinSagMax, len * m.reinSagPerLen)', 'len * m.reinSagPerLen'),
 (C, CORE_CPP, 'rênes : toujours sur l’encolure', 'if (in.hasHands) b = in.hand[k];', 'if (false) b = in.hand[k];'),
 (C, CORE_CPP, 'rênes : poings croisés', 'if (in.hasHands) b = in.hand[k];', 'if (in.hasHands) b = in.hand[1 - k];'),
 (C, CORE_CPP, 'rênes posées : côté de l’encolure inversé', 'const double s = k ? -m.crestSide : m.crestSide;', 'const double s = k ? m.crestSide : -m.crestSide;'),
 (C, CORE_CPP, 'visibilité : seuil de distance inversé', '> m.detailDist : false;', '< m.detailDist : false;'),
 (C, CORE_CPP, 'visibilité : selle ignorée', 'out.show = in.saddle && !far;', 'out.show = !far;'),
 (C, CORE_CPP, 'applyQuaternion : signe du terme q.w · tx', 'return V3{v.x + q.w * tx + q.y * tz - q.z * ty,', 'return V3{v.x - q.w * tx + q.y * tz - q.z * ty,'),
 # Composant (StridesHorseTackMesh.cpp) et points de la cavalière (StridesRiderRig.cpp)
 (E, COMP_CPP, 'composant : poings de l’image courante', 'In.hand[K] = ToWebV(SeatWorld.TransformPosition(bHasPrevGrip ? PrevGrip[K] : Rider->Grip[K]));', 'In.hand[K] = ToWebV(SeatWorld.TransformPosition(Rider->Grip[K]));'),
 (E, COMP_H, 'composant : axe x du web sans symétrie', 'return strides::tack::V3{-U.Y / 100.0, U.Z / 100.0, U.X / 100.0};', 'return strides::tack::V3{U.Y / 100.0, U.Z / 100.0, U.X / 100.0};'),
 (E, COMP_CPP, 'composant : axe latéral du cheval inversé', 'const FVector3d Lat = ToWeb(H.GetRotation().RotateVector(FVector(0, -100, 0)));', 'const FVector3d Lat = ToWeb(H.GetRotation().RotateVector(FVector(0, 100, 0)));'),
 (E, COMP_CPP, 'composant : pièces sans meneur', '		C->SetLeaderPoseComponent(Body);\n', ''),
 (E, COMP_CPP, 'composant : visibilité du web ignorée', 'C->SetVisibility(P["visible"].b);', 'C->SetVisibility(true);'),
 (E, COMP_CPP, 'composant : étriers sans la symétrie des axes', 'IronV.Add(FromWeb(V3{Iron["position"][I].num(), Iron["position"][I + 1].num(), Iron["position"][I + 2].num()}));',
  'IronV.Add(FVector(100.0 * Iron["position"][I].num(), 100.0 * Iron["position"][I + 1].num(), 100.0 * Iron["position"][I + 2].num()));'),
 (E, COMP_CPP, 'composant : étrier sous l’orteil de la pose précédente', '		if (Rider) In.stirrup[K] = stirrupUnderToe(Model_, ToWebV(SeatWorld.TransformPosition(Rider->Toe[K])), Rider->Scale);\n',
  '		if (Rider) In.stirrup[K] = stirrupUnderToe(Model_, ToWebV(SeatWorld.TransformPosition(bHasPrevGrip ? PrevToe[K] : Rider->Toe[K])), Rider->Scale);\n		if (Rider) PrevToe[K] = Rider->Toe[K];\n'),
 (E, RIG_CPP, 'cavalière : orteil = os du pied', 'const int32 B = RuleToMesh[Side ? RToe : LToe];', 'const int32 B = RuleToMesh[Side ? RFoot : LFoot];'),
 (E, RIG_CPP, 'cavalière : creux du poing sur trois os', 'for (const char* Nm : {"index_02", "middle_02", "pinky_02", "middle_01"})', 'for (const char* Nm : {"index_02", "middle_02", "middle_01"})'),
]
# La mutation « étrier sous l'orteil de la pose précédente » a besoin d'un membre PrevToe : ajouté au source muté.
EXTRA = {'composant : étrier sous l’orteil de la pose précédente': (COMP_CPP, 'FVector PrevGrip[2];', None)}

ATTENDUES = {
 'rênes posées : côté de l’encolure inversé': 'rênes sur l’encolure : aucun scénario d’O1 sans cavalier en selle (poings toujours donnés) ; branche non exercée par l’oracle',
 'visibilité : selle ignorée': 'cheval toujours sellé dans O1 (cfg.saddle vrai à toutes les images) ; branche non exercée par l’oracle',
 'composant : axe latéral du cheval inversé': 'l’axe latéral du repère du cheval ne sert qu’aux rênes posées sur l’encolure (sans cavalier), jamais exercées par le test ; l’axe avant (étrivières) et l’orientation des étriers ne le lisent pas (constaté à la campagne moteur du 25/11/2026)',
 'cavalière : creux du poing sur trois os': None,  # détectée par le contrôle indépendant du test (milieu des quatre os relus par leur nom)
}
ATTENDUES = {k: v for k, v in ATTENDUES.items() if v}

os.makedirs(out, exist_ok=True)
t0 = time.time()
paths = [CORE_CPP, COMP_CPP, COMP_H, RIG_CPP]
srcs = {p: open(p).read() for p in paths}

inc = os.path.join(core, 'Public')
flags = ['clang++', '-std=c++20', '-O1', '-I', inc]
objs = []
for src, name in ((test, 'test_horse_straps.o'), (os.path.join(core, 'Private/HorseTack.cpp'), 'HorseTack.o')):
    o = os.path.join(out, name)
    c = subprocess.run(flags + ['-c', src, '-o', o], capture_output=True, text=True)
    if c.returncode:
        print(f'compilation de {os.path.basename(src)} échouée\n' + c.stderr[:800]); sys.exit(1)
    objs.append(o)


def core_run(text, tag):
    f = os.path.join(out, 'HorseStraps.cpp')
    open(f, 'w').write(text)
    obj, exe = os.path.join(out, 'HorseStraps.o'), os.path.join(out, 'mut')
    c = subprocess.run(flags + ['-c', f, '-o', obj], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : compilation échouée\n{c.stderr[:400]}'
    c = subprocess.run(['clang++', *objs, obj, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        return None, f'{tag} : édition de liens échouée\n{c.stderr[:400]}'
    return subprocess.run([exe, ora, data], capture_output=True, text=True), ''


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
        if name in EXTRA:
            hp = COMP_H
            open(hp, 'w').write(srcs[hp].replace('FVector PrevGrip[2];', 'FVector PrevGrip[2];\n\tFVector PrevToe[2];'))
        code, log = ue_travail.ubt(os.path.join(out, 'ubt-dernier.log'))
        if code:
            return None, 'compilation UBT échouée : ' + log[-300:]
        state, errs, _ = ue_travail.editor_test('Strides.Parite.HorseTackMesh', out, name)
    finally:
        for p in paths:
            open(p, 'w').write(srcs[p])
    return state != 'Success', (errs[0][:170] if errs else state)


r, err = core_run(srcs[CORE_CPP], 'témoin')
if r is None or r.returncode:
    print(err or ('témoin cœur (source non muté) en échec :\n' + r.stdout[-800:])); sys.exit(1)
print(f'témoin cœur : passe ({r.stdout.strip().splitlines()[-1]})', flush=True)
if MOTEUR:
    code, log = ue_travail.ubt(os.path.join(out, 'ubt-temoin.log'))
    state, errs, _ = ue_travail.editor_test('Strides.Parite.HorseTackMesh', out, 'témoin') if not code else ('UBT en échec', [], '')
    if state != 'Success':
        print(f'témoin moteur en échec : {state} {errs[:1]}'); sys.exit(1)
    print('témoin moteur : Strides.Parite.HorseTackMesh passe', flush=True)

undetected, skipped = [], []
try:
    for level, path, name, a, b in M:
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
        code, _ = ue_travail.ubt(os.path.join(out, 'ubt-final.log'))
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
