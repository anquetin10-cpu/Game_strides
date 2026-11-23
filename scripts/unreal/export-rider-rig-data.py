#!/usr/bin/env python3
"""Données de la cavalière montée par les règles (essai de monte, voie A, étape 6) : Content/Data/monte_rider_f.json.

Lu par UStridesRiderRig (StridesGrandTour/Private/StridesRiderRig.cpp) avec -StridesRider=regles. Rien n'est recopié à la
main : le fichier rassemble
- rig : unreal/core/tests/oracles/monte/rigs/rider_f.json tel quel (scripts/unreal/rig-from-glb.py : squelette de règle de
  25 os aux proportions de public/real/rider_f.glb, calé comme realistic.js _calibrate) ;
- fit0 : réglages de la mise en selle du cheval PJL (Comète), setup.fit0 de l'oracle O1 (identiques dans tous les
  scénarios, contrôlé ici) ; stirrupY −0,64 m : décision J3 de Julien (longueur v3 conservée) ;
- map, align, curl : correspondance des os classiques et réalistes (MAP), chaînes alignées au calage (ALIGN, dans
  l'ordre), flexion des doigts au calage (axe, signe par côté, angles par doigt), LUS dans src/entities/realistic.js
  (expressions régulières sur les lignes du source ; le script échoue si leur forme change).

Usage (racine du dépôt) : python3 scripts/unreal/export-rider-rig-data.py [--check]
--check : n'écrit rien, sort en code 1 si le fichier du dépôt diffère de ce que le script produirait.
"""
import hashlib
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
RIG = 'unreal/core/tests/oracles/monte/rigs/rider_f.json'
O1 = 'unreal/core/tests/oracles/monte/o1'
SRC = 'src/entities/realistic.js'
OUT = 'unreal/StridesGrandTour/Content/Data/monte_rider_f.json'


def read(rel):
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return f.read()


def sha(rel):
    return hashlib.sha256(read(rel)).hexdigest()


def fail(msg):
    print('export-rider-rig-data : ' + msg)
    sys.exit(1)


src = read(SRC).decode('utf-8')
m = re.search(r"const SIDES = \[\['(\w)', '(_\w)'\], \['(\w)', '(_\w)'\]\];", src)
if not m:
    fail('SIDES introuvable dans realistic.js')
SIDES = [(m.group(1), m.group(2)), (m.group(3), m.group(4))]


def templates(stmt, size):
    """Tuples de gabarits `…${o}…` d'une instruction X.push(…) ou d'un littéral [[…], …]."""
    out = []
    for g in re.finditer(r'\[(`[^`]*`(?:, `[^`]*`)*)\]', stmt):
        items = re.findall(r'`([^`]*)`', g.group(1))
        if len(items) != size:
            fail(f'gabarit de {len(items)} éléments (attendu {size}) : {g.group(0)}')
        out.append(items)
    return out


# MAP : littéral initial puis MAP.push dans la boucle sur SIDES.
m = re.search(r"const MAP = (\[\[.*?\]\]);\n", src)
if not m:
    fail('MAP introuvable')
MAP = [tuple(p) for p in json.loads(m.group(1).replace("'", '"'))]
loop = re.search(r"for \(const \[o, t\] of SIDES\) \{\n((?:  MAP\.push\(.*\);\n)+)\}", src)
if not loop:
    fail('boucle MAP.push introuvable')
mt = templates(loop.group(1), 2)
for o, t in SIDES:
    MAP += [tuple(x.replace('${o}', o).replace('${t}', t) for x in p) for p in mt]
# ALIGN : boucle sur SIDES, ordre conservé (côté gauche d'abord).
loop = re.search(r"const ALIGN = \[\];\nfor \(const \[o, t\] of SIDES\) \{\n((?:  ALIGN\.push\(.*\);\n)+)\}", src)
if not loop:
    fail('boucle ALIGN.push introuvable')
at = templates(loop.group(1), 4)
ALIGN = []
for o, t in SIDES:
    ALIGN += [[x.replace('${o}', o).replace('${t}', t) for x in p] for p in at]
# Doigts fléchis au calage.
m = re.search(r"for \(const \[side, sign\] of \[\['(_\w)', (-?\d+)\], \['(_\w)', (-?\d+)\]\]\) \{\n"
              r"\s*for \(const f of (\[[^\]]*\])\) \{\n"
              r"\s*const curl = f === '(\w+)' \? (\[[^\]]*\]) : f === '(\w+)' \? (\[[^\]]*\]) : (\[[^\]]*\]);\n"
              r"\s*for \(let k = 1; k <= 3; k\+\+\) \{\n"
              r"\s*const b = this\.bones\[`\$\{f\}_0\$\{k\}\$\{side\}`\];\n"
              r"(?:.*\n){1}"
              r"\s*const world = rel\(b, _q2\)\.premultiply\(_q\.setFromAxisAngle\(_v\.set\((-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\), sign \* curl\[k - 1\]\)\);", src)
if not m:
    fail('flexion des doigts introuvable')
fingers = json.loads(m.group(5).replace("'", '"'))
curls = {}
for f in fingers:
    curls[f] = json.loads(m.group(7) if f == m.group(6) else m.group(9) if f == m.group(8) else m.group(10))
CURL = {'axis': [float(m.group(11)), float(m.group(12)), float(m.group(13))],
        'sign': {m.group(1): int(m.group(2)), m.group(3): int(m.group(4))}, 'fingers': fingers, 'angles': curls,
        'bone': '<doigt>_0<k><côté>, k = 1 à 3'}

rig = json.loads(read(RIG))
# Contrôle : la correspondance du rig (rig-from-glb.py) est celle du jeu (MAP), plus lFing/rFing → middle_01 (ALIGN).
want = {c: t for c, t in MAP}
for o, t in SIDES:
    want[o + 'Fing'] = 'middle_01' + t
if rig.get('map') != want:
    fail('rigs/rider_f.json : map différente de realistic.js MAP (+ middle_01)')
index = json.loads(read(O1 + '/index.json'))
fit0 = None
for e in index['runs']:
    f0 = json.loads(read(O1 + '/' + e['file']))['setup']['fit0']
    if fit0 is None:
        fit0 = f0
    elif f0 != fit0:
        fail(f'setup.fit0 différent dans {e["file"]}')

data = {
    'schema': 'strides.monte_rider/1',
    'generator': 'scripts/unreal/export-rider-rig-data.py',
    'doc': ('cavalière rider_f montée par les règles du web (UStridesRiderRig, option -StridesRider=regles) : rig de règle '
            '(squelette de 25 os aux proportions de rider_f.glb, repère du modèle du web : y vers le haut, z vers l’avant, x '
            'à gauche, mètres) ; fit0 : réglages de la mise en selle du cheval PJL, mètres (O1 setup.fit0) ; map : os '
            'classique → os réaliste (realistic.js MAP) ; align : [os réaliste, enfant, os classique, enfant] dans l’ordre '
            'du calage (realistic.js ALIGN) ; curl : flexion des doigts au calage, rotation monde autour de axis (repère '
            'du modèle), angle sign × angles[k − 1].'),
    'sources': {RIG: sha(RIG), O1 + '/' + index['runs'][0]['file']: sha(O1 + '/' + index['runs'][0]['file']), SRC: sha(SRC)},
    'rig': rig,
    'fit0': fit0,
    'map': [list(p) for p in MAP],
    'align': ALIGN,
    'curl': CURL,
}
text = json.dumps(data, ensure_ascii=False, indent=1) + '\n'
path = os.path.join(ROOT, OUT)
if '--check' in sys.argv:
    same = os.path.exists(path) and open(path, encoding='utf-8').read() == text
    print(f'{OUT} : {"à jour" if same else "DIFFÉRENT de ce que produit le script"}')
    sys.exit(0 if same else 1)
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print(f'écrit : {OUT} ({len(MAP)} os appariés, {len(ALIGN)} chaînes alignées, {len(fingers)} doigts ; fit0.stirrupY = {fit0["stirrupY"]})')
