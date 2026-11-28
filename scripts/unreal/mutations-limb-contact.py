#!/usr/bin/env python3
"""Mutations du portage des contacts des membres avec les barres (jalon J2) : preuve que les oracles exercent chaque règle.

Chaque mutation est appliquée à une copie de StridesCore/Private/LimbContact.cpp (le source du dépôt n'est jamais modifié) ;
le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué (bancs « limb » et « fences » :
limb_contact.json et scénarios j2-* de cso_runs/, exportés du jeu web). Une mutation doit faire échouer le banc ; le script
sort en code 1 si l'une n'est pas détectée hors de ATTENDUES (raison donnée), ou si l'une de celles-ci devient détectée ;
code 2 si une mutation n'a pas pu être jouée (motif absent ou en double, compilation échouée).

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-limb-contact.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et .ue-cache/travail/mutations-limb.
"""
import glob, os, subprocess, sys
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, '.ue-cache/travail/mutations-limb')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
K = 'LimbContact.cpp'
src = open(os.path.join(core, 'Private', K)).read()
M = [
 # Géométrie (limbContact.js)
 ('toLocal : s et u échangés', 'return P3{dx * o.n.x + dz * o.n.z, dx * o.t.x + dz * o.t.z, y - ground};', 'return P3{dx * o.t.x + dz * o.t.z, dx * o.n.x + dz * o.n.z, y - ground};'),
 ('toLocal : sol ignoré', 'dz * o.t.z, y - ground};', 'dz * o.t.z, y};'),
 ('segAxis : k non borné', 'k = std::max(0.0, std::min(1.0, k));', ''),
 ('segAxis : borne basse seule', 'k = std::max(0.0, std::min(1.0, k));', 'k = std::max(0.0, k);'),
 ('segAxis : segment réduit, k = 0,5', 'L2 > 1e-12 ? ((barS - a.s) * ds + (barH - a.y) * dy) / L2 : 0;', 'L2 > 1e-12 ? ((barS - a.s) * ds + (barH - a.y) * dy) / L2 : 0.5;'),
 ('segAxis : u de l\'extrémité a', 'u = a.u + (b.u - a.u) * k;', 'u = a.u;'),
 ('capsuleRail : largeur sans le rayon', 'if (std::abs(q.u) > halfW + r) return c;', 'if (std::abs(q.u) > halfW) return c;'),
 ('capsuleRail : rayon de la barre ignoré', 'c.depth = r + P.railR - q.dist;', 'c.depth = r - q.dist;'),
 ('sweepRail : départ à t = 0', 'for (int i = 1; i <= steps; i++) {', 'for (int i = 0; i < steps; i++) {'),
 ('sweepRail : premier contact au lieu du plus profond', '(!best.valid || c.depth > best.depth)', '!best.valid'),
 ('sweepRail : contact rasant compté', 'if (c.valid && c.depth > 0 &&', 'if (c.valid && c.depth >= -0.01 &&'),
 # Choix et balayage (pjlHorse.js _limbContacts)
 ('jugé : fenêtre 0,8 s -> 0,3 s', 'time - s.lastLandTime < P.window);', 'time - s.lastLandTime < 0.3);'),
 ('jugé : réception ignorée (vol seul)', 'return s.jumpT >= 0 || (s.lastLanded && time - s.lastLandTime < P.window);', 'return s.jumpT >= 0;'),
 ('jugé : cheval d\'un autre cavalier', 'if (!playerHorse || !s.hasLastJump', 'if (!s.hasLastJump'),
 ('abord : pose gardée à 4 m -> 1 m', 'target->geo.rails[0].x < P.preRoll)', 'target->geo.rails[0].x < 1)'),
 ('pose : écart 0,1 s -> 0,02 s', 'time - prev.time > P.maxGap)', 'time - prev.time > 0.02)'),
 ('pose précédente d\'un autre obstacle acceptée', '|| prev.obstacle != choice.obstacle ||', '||'),
 ('rayon du canon 0,045 -> 0,03', 'k == 0 ? P.rCanon : P.rHoof;', 'k == 0 ? 0.03 : P.rHoof;'),
 ('rayon du sabot 0,055 -> 0,045', 'k == 0 ? P.rCanon : P.rHoof;', 'k == 0 ? P.rCanon : 0.045;'),
 ('tolérance 0,01 -> 0,03', 'c.depth > P.tol &&', 'c.depth > 0.03 &&'),
 ('balayage 6 pas -> 2', 'o->w / 2, P.steps, P);', 'o->w / 2, 2, P);'),
 ('barre en chute non ignorée', '|| fence->rails[bi].falling) continue;', ') continue;'),
 ('segment paturon-sabot oublié', 'for (int k = 0; k < 2; k++) {', 'for (int k = 0; k < 1; k++) {'),
 ('postérieurs vus comme antérieurs', 'best = Hit{(int)bi, c.depth, c.u, c.t, i, i >= 2};', 'best = Hit{(int)bi, c.depth, c.u, c.t, i, false};'),
 ('membres : postérieurs ignorés', 'for (int i = 0; i < 4; i++) {\n      for (int k', 'for (int i = 0; i < 2; i++) {\n      for (int k'),
 ('u du contact inversé (côté de la chute)', 'f.u = h.u;', 'f.u = -h.u;'),
]
ATTENDUES = {
 'pose précédente d\'un autre obstacle acceptée': 'aucun changement d’obstacle jugé à moins de 0,1 s d’intervalle (deux obstacles à moins d’une foulée)',
 'jugé : cheval d\'un autre cavalier': 'les scénarios n’ont que le cheval du joueur',
}
os.makedirs(out, exist_ok=True)
inc = os.path.join(core, 'Public')
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
others = sorted(f for f in glob.glob(os.path.join(core, 'Private', '*.cpp')) if not f.endswith(('StridesCoreModule.cpp', K)))
# Objets des autres sources compilés une fois.
objs = []
for f in others + [test]:
    o = os.path.join(out, os.path.basename(f) + '.o')
    if not os.path.exists(o) or os.path.getmtime(o) < os.path.getmtime(f):
        c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, '-c', f, '-o', o], capture_output=True, text=True)
        if c.returncode:
            print(f'compilation de {f} échouée\n{c.stderr[:400]}'); sys.exit(2)
    objs.append(o)
env = dict(os.environ, STRIDES_TESTS='limb,fences')
undetected, broken = [], []
for name, a, b in M:
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée'); broken.append(name); continue
    f = os.path.join(out, K)
    open(f, 'w').write(src.replace(a, b))
    exe = os.path.join(out, 'mut')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, f, *objs, '-o', exe], capture_output=True, text=True)
    if c.returncode:
        print(f'{name} : compilation échouée\n{c.stderr[:400]}'); broken.append(name); continue
    r = subprocess.run([exe, ora, data], capture_output=True, text=True, env=env)
    last = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    fails = [l.strip() for l in r.stdout.splitlines() if 'ÉCHEC' in l][:1]
    status = 'détectée' if r.returncode else 'NON DÉTECTÉE'
    if not r.returncode: undetected.append(name)
    print(f'{name} : {status} (code {r.returncode}, {last}){" ; " + fails[0][:160] if fails else ""}')
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and n not in broken]
print(f'{len(M)} mutations, {len(M) - len(undetected) - len(broken)} détectées, {len(undetected)} non détectées, {len(broken)} non jouées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES: print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected: print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected: print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
if broken: print('NON JOUÉES : ' + ' ; '.join(broken))
sys.exit(2 if broken else 1 if unexpected or now_detected else 0)
