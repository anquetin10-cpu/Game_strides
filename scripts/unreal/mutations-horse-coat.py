#!/usr/bin/env python3
"""Mutations du portage de la robe du cheval engagé (C1) : preuve que l'oracle départage la logique.

Chaque mutation est appliquée à une copie de StridesCore/Private/HorseCoat.cpp (coatOf, uniformes de makeCoatMaterial /
makeHairMaterial, conversion sRGB → linéaire, ownedHorses, activeHorseId, cheval engagé) — le source du dépôt n'est
jamais modifié ; le banc unreal/core/tests/test_core.cpp est recompilé avec cette copie et rejoué (STRIDES_TESTS=coat) sur
l'oracle exporté du jeu web (horse_coat.json, scripts/unreal/export-horse-coat.mjs). Une mutation doit faire échouer le
banc (code de sortie non nul) ; le script sort en code 1 si l'une n'est pas détectée, hors des mutations listées dans
ATTENDUES (raison donnée) — et aussi si l'une de celles-ci devient détectée.
Code 2 si une mutation n'a pas pu être jouée (motif absent ou en double, compilation échouée), même listée dans ATTENDUES.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/mutations-horse-coat.py [dossier des oracles] [dossier de travail]
Défauts : unreal/core/tests/oracles et build/mutations-coat.
"""
import glob
import os
import subprocess
import sys

repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ora = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(repo, 'unreal/core/tests/oracles')
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(repo, 'build/mutations-coat')
core = os.path.join(repo, 'unreal/StridesGrandTour/Source/StridesCore')
K = 'HorseCoat.cpp'
M = [
    # coatOf (pjlHorse.js:54-60)
    ('robe inconnue : gardée', '!= data.coats.end() ? coat.s : "bay"', '!= data.coats.end() || true ? coat.s : "bay"'),
    ('robe : repli « grey »', '!= data.coats.end() ? coat.s : "bay"', '!= data.coats.end() ? coat.s : "grey"'),
    ('liste : chaîne ignorée', 'c.blaze = blaze.t == J::Str ? blaze.s : truthy(blaze) ? "blaze" : "none";', 'c.blaze = truthy(blaze) ? "blaze" : "none";'),
    ('liste : vrai → « star »', ': truthy(blaze) ? "blaze" : "none";', ': truthy(blaze) ? "star" : "none";'),
    ('vérité : nombre toujours vrai', 'case J::Num: return v.n != 0 && !std::isnan(v.n);', 'case J::Num: return true;'),
    ('vérité : tableau faux', 'default: return true;  // tableaux et objets', 'default: return false;'),
    ('balzane : vrai → 0,4', 'x.t == J::Bool && x.b ? 0.38', 'x.t == J::Bool && x.b ? 0.4'),
    ('balzane : nombre ignoré', ': x.t == J::Num ? x.n : 0.0', ': 0.0'),
    ('balzanes : quatre au plus', 'for (const J& x : s.a) socks.push_back(', 'for (const J& x : s.a) if (socks.size() < 4) socks.push_back('),
    ('balzanes : valeur non tableau acceptée', '  else if (s.t != J::Arr) throw std::runtime_error("def.socks.map is not a function");\n', ''),
    ('pommelage : 0,6 → 1', 'c.dapples = c.colour == "dapplegrey" ? 0.6 : 0.0;', 'c.dapples = c.colour == "dapplegrey" ? 1.0 : 0.0;'),
    # makeCoatMaterial / makeHairMaterial (coat.js:26-45, 111-119)
    ('palette : robe inconnue → « grey »', ': data.palette.at("bay");', ': data.palette.at("grey");'),
    ('balzanes : w par défaut 0', 'u.socks = {0, 0, 0, 1};', 'u.socks = {0, 0, 0, 0};'),
    ('liste inconnue : « none »', 'if (bz == data.blaze.end()) throw std::runtime_error("BLAZE[" + b + "] is not iterable");', 'if (bz == data.blaze.end()) bz = data.blaze.find("none");'),
    ('pommelage absent : 0,6', ': coat.colour == "dapplegrey" ? 1.0 : 0.0;', ': coat.colour == "dapplegrey" ? 0.6 : 0.0;'),
    ('pommelage : valeur de la robe ignorée', 'u.dapples = coat.dapples ? *coat.dapples :', 'u.dapples = false ? *coat.dapples :'),
    ('rugosité : gris pommelé à 0,48', 'coat.colour == "grey" || coat.colour == "dapplegrey" ? 0.6 : 0.48', 'coat.colour == "grey" ? 0.6 : 0.48'),
    ('rugosité : 0,48 → 0,5', '? 0.6 : 0.48;', '? 0.6 : 0.5;'),
    ('crins : couleur du corps', 'u.hair = srgbHexToLinear(pal.hair);', 'u.hair = srgbHexToLinear(pal.body);'),
    ('crins : rugosité 0,7 (GLB)', 'u.hairRoughness = 0.62;', 'u.hairRoughness = 0.7;'),
    ('crins : seuil alpha 0,5', 'u.alphaTest = 0.35;', 'u.alphaTest = 0.5;'),
    ('extrémités : couleur du corps', 'u.points = srgbHexToLinear(pal.points);', 'u.points = srgbHexToLinear(pal.body);'),
    ('détail : 1', 'u.detail = pal.detail;', 'u.detail = 1;'),
    # Conversion sRGB → linéaire (ColorManagement.js SRGBToLinear)
    ('sRGB : seuil 0,04045 → 0,04', 'c < 0.04045 ? c * 0.0773993808', 'c < 0.04 ? c * 0.0773993808'),
    ('sRGB : seuil 0,04045 → 0,045', 'c < 0.04045 ? c * 0.0773993808', 'c < 0.045 ? c * 0.0773993808'),
    ('sRGB : gamma 2,2', 'std::pow(c * 0.9478672986 + 0.0521327014, 2.4)', 'std::pow(c * 0.9478672986 + 0.0521327014, 2.2)'),
    ('sRGB : sans conversion', 'out[k] = c < 0.04045 ?', 'out[k] = true ? c : c < 0.04045 ?'),
    ('sRGB : canaux inversés', '(v >> (16 - 8 * k)) & 255', '(v >> (8 * k)) & 255'),
    # ownedHorses / activeHorseId (data.js:38-48)
    ('écurie : doublons gardés', 'if (!first || id.t != J::Str) continue;', 'if (id.t != J::Str) continue;'),
    ('écurie : cheval à l’essai gardé à sa place', 'if (h && !h->trial) out.push_back(id.s);', 'if (h) out.push_back(id.s);'),
    ('écurie : cheval inconnu gardé', 'if (h && !h->trial) out.push_back(id.s);', 'if (!h || !h->trial) out.push_back(id.s);'),
    ('écurie vide : sans Comète', '  if (out.empty()) out.push_back("comete");\n', ''),
    ('écurie : essai en tête', 'out.insert(out.begin() + std::min<size_t>(1, out.size()), trial.begin(), trial.end());', 'out.insert(out.begin(), trial.begin(), trial.end());'),
    ('écurie : essai omis', 'out.insert(out.begin() + std::min<size_t>(1, out.size()), trial.begin(), trial.end());', ''),
    ('monture : sans contrôle de l’écurie', 'return std::find(own.begin(), own.end(), a.s) != own.end() ? a.s : "comete";', 'return a.s;'),
    ('monture : repli sur la première de l’écurie', 'return std::find(own.begin(), own.end(), a.s) != own.end() ? a.s : "comete";', 'return std::find(own.begin(), own.end(), a.s) != own.end() ? a.s : own[0] == "comete" && own.size() > 1 ? own[1] : own[0];'),
    # Cheval engagé (game.js spawnMainHorse)
    ('engagé : modèle oublié', '  e.model = h->model;\n', ''),
    ('engagé : liste du cheval ignorée', '  def.o["blaze"] = h->blaze;\n', ''),
    ('engagé : balzanes du cheval ignorées', '  def.o["socks"] = h->socks;\n', ''),
]
ATTENDUES = {
    'sRGB : seuil 0,04045 → 0,04': 'équivalente pour une couleur #rrggbb : aucune composante k / 255 entre 0,04 et 0,04045 (10 / 255 = 0,0392, 11 / 255 = 0,0431) ; le seuil est départagé par la mutation 0,045 (composante 0x0b des crins de « darkbay »)',
}
os.makedirs(out, exist_ok=True)
src = open(os.path.join(core, 'Private', K)).read()
test = os.path.join(repo, 'unreal/core/tests/test_core.cpp')
data = os.path.join(repo, 'unreal/StridesGrandTour/Content/Data')
inc = os.path.join(core, 'Public')
others = sorted(f for f in glob.glob(os.path.join(core, 'Private', '*.cpp')) if not f.endswith(('StridesCoreModule.cpp', K)))
objs = {}
for f in others + [test]:
    o = os.path.join(out, os.path.basename(f) + '.o')
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, '-c', f, '-o', o], capture_output=True, text=True)
    if c.returncode:
        sys.exit(f'{f} : compilation échouée\n{c.stderr[:600]}')
    objs[f] = o
exe = os.path.join(out, 'mut')


def run(source_file):
    c = subprocess.run(['clang++', '-std=c++20', '-O1', '-I', inc, source_file, *objs.values(), '-o', exe], capture_output=True, text=True)
    if c.returncode:
        return None, c.stderr[:400]
    r = subprocess.run([exe, ora, data], capture_output=True, text=True, env={**os.environ, 'STRIDES_TESTS': 'coat'})
    return r, ''


r, err = run(os.path.join(core, 'Private', K))
if r is None or r.returncode:
    sys.exit(f'témoin en échec sans mutation : {err or r.stdout.strip().splitlines()[-1:]}')
print('témoin : banc vert sans mutation', flush=True)
# broken : mutations non jouées (motif absent ou en double, compilation échouée) : jamais comptées non détectées.
undetected, broken = [], []
for name, a, b in M:
    n = src.count(a)
    if n != 1:
        print(f'{name} : motif trouvé {n} fois, mutation non appliquée')
        broken.append(name)
        continue
    f = os.path.join(out, 'mut_' + K)
    open(f, 'w').write(src.replace(a, b))
    r, err = run(f)
    if r is None:
        print(f'{name} : compilation échouée\n{err}')
        broken.append(name)
        continue
    last = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''
    fails = [l.strip() for l in r.stdout.splitlines() if 'ÉCHEC' in l][:1]
    status = 'détectée' if r.returncode else 'NON DÉTECTÉE'
    if not r.returncode:
        undetected.append(name)
    print(f'{name} : {status} (code {r.returncode}, {last}){" ; " + fails[0][:160] if fails else ""}', flush=True)
unexpected = [n for n in undetected if n not in ATTENDUES]
now_detected = [n for n in ATTENDUES if n not in undetected and n not in broken]
print(f'{len(M)} mutations, {len(M) - len(undetected) - len(broken)} détectées, {len(undetected)} non détectées, {len(broken)} non jouées' + (' : ' + ' ; '.join(undetected) if undetected else ''))
for n in undetected:
    if n in ATTENDUES:
        print(f'  attendue : {n} ({ATTENDUES[n]})')
if unexpected:
    print('NON DÉTECTÉES HORS LISTE : ' + ' ; '.join(unexpected))
if now_detected:
    print('désormais détectées (liste ATTENDUES à corriger) : ' + ' ; '.join(now_detected))
# Une mutation non jouée ne prouve rien : code 2, même si elle figure dans ATTENDUES.
if broken: print('NON JOUÉES (motif absent ou en double, ou compilation échouée) : ' + ' ; '.join(broken))
sys.exit(2 if broken else 1 if unexpected or now_detected else 0)
