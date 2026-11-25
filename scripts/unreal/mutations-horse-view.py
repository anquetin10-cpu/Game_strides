#!/usr/bin/env python3
"""Mutations de la vue du cheval du web (étape S4) : preuve que les tests départagent StridesCore/HorseView.cpp (port de
pjl/view.js update, pjlHorse.js _snapshot, _jumpTime, _pushContact, _barNeed, _limbTuck, _barClear et horse/anim.js) et son
branchement dans le moteur (FStridesHorseView, AStridesHorse, option -StridesHorseView, replis dans le mélangeur).

Deux niveaux, comme scripts/unreal/mutations-horse-straps.py :
- « cœur » : mutation appliquée à une copie de HorseView.cpp (le source du dépôt n'est pas touché), reliée au banc
  unreal/core/tests/test_horse_view.cpp (ctest « monte-vue ») et rejouée sur l'oracle vue/ ; elle doit le faire échouer ;
- « moteur » (option --moteur) : mutation appliquée AU SOURCE DU DÉPÔT, Unreal Build Tool recompile, l'éditeur rejoue
  Strides.Parite.HorseView et Strides.Monte.Options, puis le source est rétabli (try/finally) et une dernière compilation
  remet le module à l'identique.

Code 1 si une mutation n'est pas détectée hors de la liste ATTENDUES, si l'une de celles-ci devient détectée, ou si un
témoin non muté ne passe pas.
Usage (DEVELOPER_DIR réglé sur Xcode) : python3 scripts/unreal/mutations-horse-view.py [--moteur] [--sortie=dossier]
Défaut de sortie : .ue-cache/travail/mutations-horse-view.
"""
import os
import subprocess
import sys
import time
import ue_travail

sys.dont_write_bytecode = True
repo = ue_travail.REPO
arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}
out = os.path.abspath(arg.get('--sortie', ue_travail.sortie('mutations-horse-view')))
MOTEUR = bool(arg.get('--moteur'))
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
game = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesGrandTour')
CORE_CPP = os.path.join(core, 'Private/HorseView.cpp')
VIEW_CPP = os.path.join(game, 'Private/StridesHorseView.cpp')
HORSE_CPP = os.path.join(game, 'Private/StridesHorse.cpp')
OPT_CPP = os.path.join(game, 'Private/StridesMonteOptions.cpp')
MIX_CPP = os.path.join(game, 'Private/StridesHorseMirror.cpp')
ora = os.path.join(repo, 'unreal/core/tests/oracles/monte')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
test = os.path.join(repo, 'unreal/core/tests/test_horse_view.cpp')
TESTS = 'Strides.Parite.HorseView+Strides.Monte.Options'

C, E = 'cœur', 'moteur'
M = [
 # horse/anim.js
 (C, CORE_CPP, 'allure : hystérésis du pas oubliée', 'if (A.gait == "walk" && target == "idle" && vn > 0.12) target = "walk";', ''),
 (C, CORE_CPP, 'allure : seuil du galop au trot', 'vn < c.edgeTrot ? "trot"', 'vn < c.edgeWalk ? "trot"'),
 (C, CORE_CPP, 'main : changement immédiat', 'if (A.leadHold > 0.5) {', 'if (A.leadHold >= 0) {'),
 (C, CORE_CPP, 'main imposée ignorée', 'if (in.lead) A.lead = in.lead;', 'if (false) A.lead = in.lead;'),
 (C, CORE_CPP, 'mouvement lissé à 6/s dans les deux sens', '(moving ? 6 : 4)', '(moving ? 6 : 6)'),
 (C, CORE_CPP, 'fréquence du galop sans pente', 'f = clampv(1.32 + 0.068 * vw, 1.62, 2.12);', 'f = clampv(1.32, 1.62, 2.12);'),
 (C, CORE_CPP, 'foulée non bornée par Lmax', 'if (A.freq < fmin) A.freq = fmin;', ''),
 (C, CORE_CPP, 'phase figée à l’arrêt qui commence', 'if (moving || A.move > 0.05)', 'if (moving)'),
 # _snapshot, _jumpTime
 (C, CORE_CPP, 'foulée du grand galop sans fondu', 'target = 3.42 + (4.5 - 3.42) * smoothstep(8.2, 11.5, speed);', 'target = 3.42;'),
 (C, CORE_CPP, 'cadence non bornée', 'const double f = clampv(speed / std::max(0.5, st.stride), d.c.cadence[ci][0], d.c.cadence[ci][1]);', 'const double f = speed / std::max(0.5, st.stride);'),
 (C, CORE_CPP, 'phase de la vue avance pendant le saut', 'if (ci >= 0 && !jumping && speed > 0.2) {', 'if (ci >= 0 && speed > 0.2) {'),
 (C, CORE_CPP, 'réécriture de la phase pendant le saut', 'if (al != d.align.end() && !jumping && speed > 0.2)', 'if (al != d.align.end() && speed > 0.2)'),
 (C, CORE_CPP, 'roulis : signe du virage', '-std::atan2(turnRate * speed, 9.81) * 0.9', 'std::atan2(turnRate * speed, 9.81) * 0.9'),
 (C, CORE_CPP, 'roulis lissé à 8/s', 'st.roll = damp(st.roll, -std::atan2(turnRate * speed, 9.81) * 0.9, 6, dt);', 'st.roll = damp(st.roll, -std::atan2(turnRate * speed, 9.81) * 0.9, 8, dt);'),
 (C, CORE_CPP, 'mode réception de 0,3 s', 'st.landT < 0.45 ? "landing"', 'st.landT < 0.3 ? "landing"'),
 (C, CORE_CPP, 'horloge du saut linéaire (sans sommet)', 'const double c = tau < 0.5 ? c0 + (tau / 0.5) * (j.apex - c0) : j.apex + ((tau - 0.5) / 0.5) * (j.foreLand - j.apex);', 'const double c = c0 + tau * (j.foreLand - c0);'),
 (C, CORE_CPP, 'horloge du saut sans départ anticipé (PUSH)', 'const double c0 = j.toeOff - d.c.push;', 'const double c0 = j.toeOff;'),
 (C, CORE_CPP, 'sommet sur le bassin', 'const std::vector<double>& R = j.trunkRise.empty() ? j.pelvisRise : j.trunkRise;\n  double best', 'const std::vector<double>& R = j.pelvisRise;\n  double best'),
 # view.js update
 (C, CORE_CPP, 'grand saut dès 7 m/s', 'const char* want = s.speed > 8 ?', 'const char* want = s.speed > 7 ?'),
 (C, CORE_CPP, 'saut jamais en miroir', 'v.jumpMirror = s.lead == \'L\';', 'v.jumpMirror = false;'),
 (C, CORE_CPP, 'corps : trunkRise non annulé', 'rootY = s.y - d.c.com - rise * d.scale;', 'rootY = s.y - d.c.com;'),
 (C, CORE_CPP, 'fondu du saut à 12/s', 'v.jumpWeight = damp(v.jumpWeight, 1, 18, dt);', 'v.jumpWeight = damp(v.jumpWeight, 1, 12, dt);'),
 (C, CORE_CPP, 'suite après réception : fin du fondu décalée', 'j->nextFore - j->foreLand + 0.05, v.postLand', 'j->nextFore - j->foreLand + 0.15, v.postLand'),
 (C, CORE_CPP, 'après réception : abaissement non borné', 'rootY = std::max(-0.08, -rise * d.scale) * v.jumpWeight;', 'rootY = -rise * d.scale * v.jumpWeight;'),
 (C, CORE_CPP, 'virage : poids 1 au lieu de 0,85', 'const double turnW = std::min(1.0, std::fabs(turn)) * 0.85;', 'const double turnW = std::min(1.0, std::fabs(turn));'),
 (C, CORE_CPP, 'virage : côtés inversés', 'const std::string side = turn > 0 ? "L90" : "R90";', 'const std::string side = turn > 0 ? "R90" : "L90";'),
 (C, CORE_CPP, 'galop / grand galop : fondu décalé', 'smoothstep(3.55, 4.45, s.strideLen)', 'smoothstep(3.75, 4.45, s.strideLen)'),
 (C, CORE_CPP, 'poids lissés à 10/s', 'const double lambda = 14;', 'const double lambda = 10;'),
 (C, CORE_CPP, 'action active dès 0,02', 'if (!(w > 0.002)) continue;', 'if (!(w > 0.02)) continue;'),
 (C, CORE_CPP, 'temps des allures sans décalage gaitInfo', 'const double ph = jsMod(s.phase + info.offset, 1);', 'const double ph = jsMod(s.phase, 1);'),
 (C, CORE_CPP, 'hauteur du corps lissée à 20/s', 'v.bodyBaseY = damp(v.hasBodyBaseY ? v.bodyBaseY : v.bodyY, rootY, 30, dt);', 'v.bodyBaseY = damp(v.hasBodyBaseY ? v.bodyBaseY : v.bodyY, rootY, 20, dt);'),
 (C, CORE_CPP, 'saut de hauteur sans rattrapage immédiat', 'if (std::fabs(v.bodyBaseY - rootY) > 0.25) v.bodyBaseY = rootY;', ''),
 (C, CORE_CPP, 'inclinaison : facteur 1', 'clampv(s.roll, -0.3, 0.3) * 0.75', 'clampv(s.roll, -0.3, 0.3) * 1.0'),
 (C, CORE_CPP, 'inclinaison gardée au saut', '* 0.75 * (1 - v.jumpWeight);', '* 0.75;'),
 # _pushContact
 (C, CORE_CPP, 'appel : antérieurs enfoncés permis', 'cur - std::min(in.hind, std::max(0.0, in.fore))', 'cur - std::min(in.hind, in.fore)'),
 (C, CORE_CPP, 'appel : abaissement jamais résorbé', 'off = P.off * (1 - smoothstep(P.tau, P.tau + c.pushRelease, in.jumpT));', 'off = P.off;'),
 (C, CORE_CPP, 'appel : distance à la barre ignorée', 'if (in.nearBar && in.hasD) k = smoothstep(-1.6, -2.6, in.d);', ''),
 # _barNeed, _limbTuck, _barClear
 (C, CORE_CPP, 'barres : sole oubliée', 'p.y - o.ground - c.hoofSole', 'p.y - o.ground'),
 (C, CORE_CPP, 'barres : barre tombée comptée', 'if (!bar.mesh || bar.fall) continue;', 'if (!bar.mesh) continue;'),
 (C, CORE_CPP, 'barres : marge non plafonnée', 'clampv(m, 0, c.hindClearMax)', 'std::max(m, 0.0)'),
 (C, CORE_CPP, 'barres : vitesse verticale ignorée', 'const double y = hp.y + std::min(0.0, vy) * tc;', 'const double y = hp.y;'),
 (C, CORE_CPP, 'barres : levier minimal 0,5 m', 'lever = std::max(0.8, jsHypot(', 'lever = std::max(0.5, jsHypot('),
 (C, CORE_CPP, 'barres : mémoire ignorée', 'const bool ok = hasQ && q.o == o.id && time > q.t && time - q.t < 0.1 && std::fabs(hp.s - q.s) < 1;', 'const bool ok = false;'),
 (C, CORE_CPP, 'repli : antérieur replié au sol', 'if (!in.hasUp[i] || (fore && !in.jumping)) {', 'if (!in.hasUp[i]) {'),
 (C, CORE_CPP, 'repli : sens de l’antérieur inversé', 'sg = fore ? (dd.x * in.fw.x + dd.y * in.fw.y + dd.z * in.fw.z <= 0 ? 1 : -1)', 'sg = fore ? (dd.x * in.fw.x + dd.y * in.fw.y + dd.z * in.fw.z <= 0 ? -1 : 1)'),
 (C, CORE_CPP, 'repli : dichotomie à 4 pas', 'for (int k = 0; k < 8; k++) {', 'for (int k = 0; k < 4; k++) {'),
 (C, CORE_CPP, 'repli : relâché à 30/s', 'damp(cur, want, 30, dt) : damp(cur, want, 10, dt)', 'damp(cur, want, 30, dt) : damp(cur, want, 30, dt)'),
 (C, CORE_CPP, 'rotation : signe du terme qw', 'return V3{o.x + (vx + qw * tx', 'return V3{o.x + (vx - qw * tx'),
 (C, CORE_CPP, 'bascule : relevé en vol sans plafond', 'std::min(c.hindLiftMax, std::max(0.0, hind->lift - hind->lever * std::sin(tiltH)))', 'std::max(0.0, hind->lift - hind->lever * std::sin(tiltH))'),
 (C, CORE_CPP, 'bascule : avant-main dans le même sens', 'if (st.f > 0 && st.hasPivH) rot(Oy, Oz, st.pivH, -st.f);', 'if (st.f > 0 && st.hasPivH) rot(Oy, Oz, st.pivH, st.f);'),
 (C, CORE_CPP, 'bascule : pas de rotation autour du pivot', 'if (st.a > 0 && st.hasPivF) rot(Oy, Oz, st.pivF, st.a);', ''),
 (C, CORE_CPP, 'bascule : corps non remis à plat', '  if (st.clr) {\n    v.rotX = 0;', '  if (false) {\n    v.rotX = 0;'),
 # Moteur
 (E, OPT_CPP, 'option : web prise pour jeu', 'if (V == TEXT("web")) return true;\n\t\tif (V == TEXT("jeu")) return false;\n\t\tif (Unknown) Unknown->Add(FString::Printf(TEXT("-StridesHorseView', 'if (V == TEXT("web")) return false;\n\t\tif (V == TEXT("jeu")) return false;\n\t\tif (Unknown) Unknown->Add(FString::Printf(TEXT("-StridesHorseView'),
 (E, VIEW_CPP, 'moteur : axe du repli sans la symétrie web → Unreal', 'Tk.Angle = -Applied[K];', 'Tk.Angle = Applied[K];'),
 (E, VIEW_CPP, 'moteur : corps en roulis inversé', 'const double cx = FMath::Cos(Rx), sx = FMath::Sin(Rx), cz = FMath::Cos(Rz), sz = FMath::Sin(Rz);', 'const double cx = FMath::Cos(Rx), sx = FMath::Sin(Rx), cz = FMath::Cos(-Rz), sz = FMath::Sin(-Rz);'),
 (E, VIEW_CPP, 'moteur : bascule appliquée avant l’inclinaison', 'const V3 a{cz * v.x - sz * v.y, sz * v.x + cz * v.y, v.z};  // Rz\n\t\treturn V3{a.x, cx * a.y - sx * a.z, sx * a.y + cx * a.z};   // Rx', 'const V3 a{v.x, cx * v.y - sx * v.z, sx * v.y + cx * v.z};\n\t\treturn V3{cz * a.x - sz * a.y, sz * a.x + cz * a.y, a.z};'),
 (E, VIEW_CPP, 'moteur : clips dans l’ordre alphabétique', 'for (const std::string& N : D.clipOrder)', 'for (const auto& [N, Dur0] : D.clips)'),
 (E, VIEW_CPP, 'moteur : main imposée ignorée', 'Li.lead = In.ForcedLead;', 'Li.lead = 0;'),
 (E, HORSE_CPP, 'moteur : pose non réévaluée avec les replis', '\t\tA->Tucks = Tucks;\n\t\tMesh->TickAnimation(0.f, false);', '\t\tMesh->TickAnimation(0.f, false);'),
 (E, HORSE_CPP, 'moteur : clips de la vue non retenus (ramasse-miettes)', 'for (const UAnimSequence* S : Seqs) ViewClipRefs.Add(S);', 'for (const UAnimSequence* S : Seqs) (void)S;'),
 (E, MIX_CPP, 'mélangeur : repli dans le repère local', 'Pose[CI].SetRotation((Wp.Inverse() * R * Wp * Pose[CI].GetRotation()).GetNormalized());', 'Pose[CI].SetRotation((R * Pose[CI].GetRotation()).GetNormalized());'),
]
EXTRA = {}
# Équivalentes sur l'oracle (branche jamais prise par le jeu web dans les 17 scénarios ; déclarées, raison relevée dans
# l'oracle le 25/11/2026) :
ATTENDUES = {
 'saut de hauteur sans rattrapage immédiat': 'rootY ne s’écarte jamais de plus de 0,25 m de la hauteur lissée dans l’oracle (rattrapage jamais pris)',
 'inclinaison gardée au saut': 'tous les sauts de l’oracle sont en ligne droite (roulis nul au saut) : la remise à plat pendant le saut ne se voit pas',
 'appel : antérieurs enfoncés permis': 'à l’appel, les antérieurs sont toujours au-dessus du sol dans l’oracle (max(0, fore) = fore)',
 'barres : barre tombée comptée': 'aucune barre ne tombe dans les sauts de l’oracle (tous sans faute)',
 'barres : levier minimal 0,5 m': 'levier sabot – pivot toujours > 0,8 m dans l’oracle (1,7 à 2,4 m relevés) : borne jamais atteinte',
 'bascule : relevé en vol sans plafond': 'le relevé en vol reste sous HIND_LIFT_MAX (0,25 m) dans l’oracle : plafond jamais atteint',
 'moteur : bascule appliquée avant l’inclinaison': 'ordre des deux rotations du corps : la bascule n’existe qu’autour des sauts, où l’inclinaison est nulle (annulée par jumpWeight) ; ordre non départagé par l’oracle (aucun saut en virage)',
 'moteur : clips dans l’ordre alphabétique': 'ordre d’accumulation des poses (slerp successifs du PropertyMixer) : écart sous les seuils du test (sabots à 4 cm, logique à 1e-9) ; non départagé, écart non mesuré (à confirmer)',
 'moteur : clips de la vue non retenus (ramasse-miettes)': 'dans l’éditeur (tests Automation), les clips chargés restent tenus par l’éditeur et le ramasse-miettes ne les libère pas ; le défaut ne se voit qu’en jeu (-game) : plantage SIGBUS constaté en partie jouée le 25/11/2026 avant la correction, partie jouée entière sans plantage après',
}
# --noms=<motif,…> : seulement les mutations dont le nom contient l'un des motifs (relance ciblée).
NOMS = [n for n in str(arg.get('--noms', '')).split(',') if n] if isinstance(arg.get('--noms'), str) else []
if NOMS:
    M = [m for m in M if any(n in m[2] for n in NOMS)]
    ATTENDUES = {k: v for k, v in ATTENDUES.items() if any(k == m[2] for m in M)}
ATTENDUES = {k: v for k, v in ATTENDUES.items() if v}

os.makedirs(out, exist_ok=True)
t0 = time.time()
paths = [CORE_CPP, VIEW_CPP, HORSE_CPP, OPT_CPP, MIX_CPP]
srcs = {p: open(p).read() for p in paths}

inc = os.path.join(core, 'Public')
flags = ['clang++', '-std=c++20', '-O1', '-I', inc]
objs = []
for src, name in ((test, 'test_horse_view.o'),):
    o = os.path.join(out, name)
    c = subprocess.run(flags + ['-c', src, '-o', o], capture_output=True, text=True)
    if c.returncode:
        print(f'compilation de {os.path.basename(src)} échouée\n' + c.stderr[:800]); sys.exit(1)
    objs.append(o)


def core_run(text, tag):
    f = os.path.join(out, 'HorseView.cpp')
    open(f, 'w').write(text)
    obj, exe = os.path.join(out, 'HorseView.o'), os.path.join(out, 'mut')
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
        code, log = ue_travail.ubt(os.path.join(out, 'ubt-dernier.log'))
        if code:
            return None, 'compilation UBT échouée : ' + log[-300:]
        state, errs = run_tests(name)
    finally:
        for p in paths:
            open(p, 'w').write(srcs[p])
    return state != 'Success', (errs[0][:170] if errs else state)


def run_tests(tag):
    # Les deux tests : état global « Success » si les deux passent (rapport lu test par test).
    states, errs = [], []
    for t in TESTS.split('+'):
        st, er, _ = ue_travail.editor_test(t, out, tag + ' ' + t.split('.')[-1])
        states.append(st)
        errs += er
    return ('Success' if all(s == 'Success' for s in states) else ' / '.join(states)), errs


r, err = core_run(srcs[CORE_CPP], 'témoin')
if r is None or r.returncode:
    print(err or ('témoin cœur (source non muté) en échec :\n' + r.stdout[-800:])); sys.exit(1)
print(f'témoin cœur : passe ({r.stdout.strip().splitlines()[-1]})', flush=True)
if MOTEUR:
    code, log = ue_travail.ubt(os.path.join(out, 'ubt-temoin.log'))
    state, errs = run_tests('témoin') if not code else ('UBT en échec', [])
    if state != 'Success':
        print(f'témoin moteur en échec : {state} {errs[:1]}'); sys.exit(1)
    print('témoin moteur : Strides.Parite.HorseView et Strides.Monte.Options passent', flush=True)

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
