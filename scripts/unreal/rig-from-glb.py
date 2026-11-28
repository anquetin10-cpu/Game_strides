#!/usr/bin/env python3
# Rig de monte d'un modèle GLB pour l'oracle O2 (essai de monte, voie A, étape 3) : squelette de 25 os du personnage
# classique (src/entities/human/skeleton.js) aux proportions d'un modèle réaliste, au format de
# unreal/core/tests/oracles/monte/rigs/web_classic.json (écrit par scripts/unreal/rider-rules-o2.mjs depuis skeleton.js).
#
# Lecture seule du GLB (chunk JSON seulement, sans dépendance : les nœuds suffisent, aucun maillage n'est décodé).
# Méthode = calage du jeu web (src/entities/realistic.js _calibrate, MAP et ALIGN, lignes 17-27 et 679-732) :
#   1. positions des os dans la pose de repos du fichier (TRS des nœuds), repère de la scène glTF (= repère du modèle
#      réaliste dans le jeu, mètres, taille naturelle) ;
#   2. chaînes des membres tournées une à une (ordre ALIGN) pour prendre les directions de repos du personnage classique
#      (bras le long du corps, jambes droites) : rotation minimale (THREE.Quaternion.setFromUnitVectors) appliquée au
#      sous-arbre de l'os ;
#   3. décalage de repos de chaque os classique = position de l'os réaliste associé (MAP) moins celle de son parent.
# Le jeu pose le modèle réaliste en recopiant les rotations monde du classique sur cette pose calée
# (realistic.js update, :746-766) : le rig écrit ici, animé par les rotations du classique, redonne donc les articulations
# du rendu réaliste, ce que rider-rules-o2.mjs contrôle contre le canal rz d'O1 (à 1e-6 près, arrondi de rz).
#
# Points sans os, mesurés dans la page par l'exporteur O1 (scripts/unreal/export-rider-rules.mjs calibrateReal et canal
# rz), pas dans ce fichier :
#   - semelle : sommet le plus bas de la botte dans la pose calée (setup.real.sole) → ankleY = hauteur de la cheville
#     au-dessus de la semelle (côté gauche, comme rigInfo) ; contrôle : boule du pied calée ici = setup.real.ball ;
#   - poing : creux du poing réaliste (RealBody.gripPoint, rz gripL/gripR) ramené dans le repère de la main, moyenne sur
#     la fenêtre de mesure d'E1 (doigts fermés sur les rênes, pose constante en selle).
# seatToHips (ischions → os du bassin, assis) : pas d'équivalent mesurable sans maillage ; convention déclarée : valeur
# du classique × (hauteur du bassin réaliste / hauteur du bassin classique), le rapport que le jeu applique déjà au
# déplacement du bassin (realistic.js:726, hipScale). À confirmer (étape 6) ; rider-rules-o2.mjs --seat permet de la
# remplacer.
#
# Usage (racine de la copie) :
#   python3 scripts/unreal/rig-from-glb.py [--glb public/real/rider_f.glb] [--name rider_f]
#       [--o1 unreal/core/tests/oracles/monte/o1/E1.json] [--out unreal/core/tests/oracles/monte/rigs/rider_f.json]
# Sortie 0 : rig écrit (ou inchangé) ; 1 : contrôle de la boule du pied hors tolérance ; 2 : entrée absente.
import json
import math
import os
import struct
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def arg(name, default):
    for a in sys.argv[1:]:
        if a.startswith('--' + name + '='):
            return a[len(name) + 3:]
    return default


GLB = os.path.join(ROOT, arg('glb', 'public/real/rider_f.glb'))
NAME = arg('name', 'rider_f')
O1 = os.path.join(ROOT, arg('o1', 'unreal/core/tests/oracles/monte/o1/E1.json'))
OUT = os.path.join(ROOT, arg('out', 'unreal/core/tests/oracles/monte/rigs/' + NAME + '.json'))
TOL = 1e-6

for p in (GLB, O1):
    if not os.path.exists(p):
        print('entrée absente :', os.path.relpath(p, ROOT))
        sys.exit(2)

# ---- Correspondance des os (realistic.js:17-27) ----
SIDES = [('l', '_l'), ('r', '_r')]
MAP = [('hips', 'pelvis'), ('spine', 'spine_01'), ('chest', 'spine_03'), ('neck', 'neck_01'), ('head', 'head')]
for o, t in SIDES:
    MAP += [(o + 'Clav', 'clavicle' + t), (o + 'Arm', 'upperarm' + t), (o + 'Fore', 'lowerarm' + t), (o + 'Hand', 'hand' + t)]
    MAP += [(o + 'Thigh', 'thigh' + t), (o + 'Shin', 'calf' + t), (o + 'Foot', 'foot' + t), (o + 'Toe', 'ball' + t)]
ALIGN = []
for o, t in SIDES:
    ALIGN += [('clavicle' + t, 'upperarm' + t, o + 'Clav', o + 'Arm'), ('upperarm' + t, 'lowerarm' + t, o + 'Arm', o + 'Fore')]
    ALIGN += [('lowerarm' + t, 'hand' + t, o + 'Fore', o + 'Hand'), ('hand' + t, 'middle_01' + t, o + 'Hand', o + 'Fing')]
    ALIGN += [('thigh' + t, 'calf' + t, o + 'Thigh', o + 'Shin'), ('calf' + t, 'foot' + t, o + 'Shin', o + 'Foot'), ('foot' + t, 'ball' + t, o + 'Foot', o + 'Toe')]
# Os classique sans os réaliste : lFing/rFing suivent middle_01 (direction de la main, realistic.js:27) ; root à l'origine
# du modèle ; hairTail sans équivalent (confondu avec la tête, sans effet sur la règle ni sur les cibles).
EXTRA = [('lFing', 'middle_01_l'), ('rFing', 'middle_01_r')]

# ---- Algèbre (doubles, ordre des opérations de three.js là où il compte) ----
def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz]


def qconj(q):
    return [-q[0], -q[1], -q[2], q[3]]


def qrot(q, v):
    # THREE.Vector3.applyQuaternion
    qx, qy, qz, qw = q
    vx, vy, vz = v
    tx = 2 * (qy * vz - qz * vy)
    ty = 2 * (qz * vx - qx * vz)
    tz = 2 * (qx * vy - qy * vx)
    return [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx]


def unit_q(vf, vt):
    # THREE.Quaternion.setFromUnitVectors (vecteurs normés)
    r = vf[0] * vt[0] + vf[1] * vt[1] + vf[2] * vt[2] + 1
    if r < 2.220446049250313e-16:
        r = 0
        if abs(vf[0]) > abs(vf[2]):
            q = [-vf[1], vf[0], 0, r]
        else:
            q = [0, -vf[2], vf[1], r]
    else:
        q = [vf[1] * vt[2] - vf[2] * vt[1], vf[2] * vt[0] - vf[0] * vt[2], vf[0] * vt[1] - vf[1] * vt[0], r]
    n = math.sqrt(sum(x * x for x in q))
    return [x / n for x in q]


def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def norm(v):
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    return [x / n for x in v]


def length(v):
    return math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])


# ---- Lecture du GLB : nœuds, TRS, hiérarchie, positions et rotations monde (repère de la scène) ----
data = open(GLB, 'rb').read()
if data[:4] != b'glTF':
    print('pas un GLB :', GLB)
    sys.exit(2)
jlen = struct.unpack_from('<I', data, 12)[0]
gl = json.loads(data[20:20 + jlen])
nodes = gl['nodes']
children = {i: list(nd.get('children', [])) for i, nd in enumerate(nodes)}
byname = {}
for i, nd in enumerate(nodes):
    if nd.get('name') is not None and nd['name'] not in byname:
        byname[nd['name']] = i
if any('matrix' in nd for nd in nodes):
    print('nœud décrit par une matrice : non pris en charge')
    sys.exit(2)

wpos, wq, wscale = {}, {}, {}


def walk(i, ppos, pq, ps):
    nd = nodes[i]
    t = nd.get('translation', [0, 0, 0])
    r = nd.get('rotation', [0, 0, 0, 1])
    s = nd.get('scale', [1, 1, 1])
    if abs(s[0] - s[1]) > 1e-9 or abs(s[0] - s[2]) > 1e-9:
        raise SystemExit('échelle non uniforme sur ' + str(nd.get('name')))
    wpos[i] = add(ppos, qrot(pq, [t[0] * ps, t[1] * ps, t[2] * ps]))
    wq[i] = qmul(pq, r)
    wscale[i] = ps * s[0]
    for c in children[i]:
        walk(c, wpos[i], wq[i], wscale[i])


for r in gl['scenes'][gl.get('scene', 0)]['nodes']:
    walk(r, [0, 0, 0], [0, 0, 0, 1], 1.0)


def subtree(i):
    out = [i]
    for c in children[i]:
        out += subtree(c)
    return out


# ---- Personnage classique tel qu'exporté par la page dans O1 (repos, rigInfo, calage du modèle réaliste) ----
o1 = json.load(open(O1))
S = o1['setup']
crest = S['rest']
crig = S['rig']
real = S.get('real')
if not real:
    print('O1 sans calage du modèle réaliste (setup.real) :', os.path.relpath(O1, ROOT))
    sys.exit(2)

# ---- Calage des membres (realistic.js:692-702) ----
pos = {i: wpos[i][:] for i in wpos}
for t, tc, o, oc in ALIGN:
    ti, tci = byname[t], byname[tc]
    dT = norm(sub(pos[tci], pos[ti]))
    dO = norm(crest[oc])  # os classique enfant direct : direction de repos = son décalage
    sw = unit_q(dT, dO)
    for k in subtree(ti)[1:]:
        pos[k] = add(pos[ti], qrot(sw, sub(pos[k], pos[ti])))

P = {n: pos[byname[n]] for n in byname if byname[n] in pos}

# Contrôle : boule du pied calée = celle relevée dans la page (setup.real.ball, repère du modèle réaliste).
ecart_ball = max(abs(P['ball' + t][k] - real['ball'][s][k]) for s, t in SIDES for k in range(3))

# ---- Squelette classique aux proportions du modèle ----
BONES = S['bones']
# Parents des os classiques : skeleton.js PARENT et son miroir (structure, pas de valeur) ; une erreur ici ferait échouer
# le contrôle contre le rendu réaliste de rider-rules-o2.mjs.
cls_parent = {
    'hips': 'root', 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'hairTail': 'head',
}
for o, _ in SIDES:
    cls_parent.update({o + 'Clav': 'chest', o + 'Arm': o + 'Clav', o + 'Fore': o + 'Arm', o + 'Hand': o + 'Fore', o + 'Fing': o + 'Hand',
                       o + 'Thigh': 'hips', o + 'Shin': o + 'Thigh', o + 'Foot': o + 'Shin', o + 'Toe': o + 'Foot'})
model = {'root': [0.0, 0.0, 0.0]}
for c, t in MAP + EXTRA:
    model[c] = P[t]
model['hairTail'] = model['head']
rest = {}
for n in BONES:
    if n == 'root':
        rest[n] = [0.0, 0.0, 0.0]
    else:
        rest[n] = sub(model[n], model[cls_parent[n]])

hips = rest['hips']
thigh = rest['lThigh']
seat_ratio = model['hips'][1] / crig['hipsY']
info = {
    'sex': crig['sex'],
    'hipsY': hips[1],
    'hipJointY': hips[1] + thigh[1],
    'hipHalf': abs(thigh[0]),
    'thighLen': length(rest['lShin']),
    'shinLen': length(rest['lFoot']),
    'upperArmLen': length(rest['lFore']),
    'foreArmLen': length(rest['lHand']),
    'ankleY': model['lFoot'][1] - real['sole']['l'],
    'toe': rest['lToe'],
    'heelBack': None,
    'seatToHips': crig['seatToHips'] * seat_ratio,
    'height': None,
}

# ---- Poing : creux du poing réaliste (rz) dans le repère de la main, fenêtre de mesure d'E1 ----
CQ = S['cq']
chain = {'l': ['hips', 'spine', 'chest', 'lClav', 'lArm', 'lFore', 'lHand'], 'r': ['hips', 'spine', 'chest', 'rClav', 'rArm', 'rFore', 'rHand']}
nb = len(real['bones'])
w0, w1 = S['window']
fist, spread = {}, 0.0
for s, t in SIDES:
    acc, samples = [0.0, 0.0, 0.0], []
    for f in o1['frames'][w0:w1]:
        q = [0, 0, 0, 1]
        for n in chain[s]:
            q = qmul(q, f['cq'][CQ.index(n)])
        grip = f['rz'][nb + (0 if s == 'l' else 1)]
        hand = f['rz'][real['bones'].index('hand' + t)]
        loc = qrot(qconj(q), sub(grip, hand))
        samples.append(loc)
        acc = add(acc, loc)
    m = [x / len(samples) for x in acc]
    spread = max(spread, max(length(sub(v, m)) for v in samples))
    fist[s] = m

doc = {
    'schema': 'strides.monte.rig/1',
    'name': NAME,
    'generator': 'scripts/unreal/rig-from-glb.py',
    'source': {'glb': os.path.relpath(GLB, ROOT), 'o1': os.path.relpath(O1, ROOT)},
    'doc': ('squelette de 25 os du personnage classique (skeleton.js : ordre bones, hiérarchie, rotations de repos nulles) aux '
            'proportions du modèle ' + os.path.basename(GLB) + ', calé comme dans le jeu (realistic.js _calibrate : membres tournés '
            'sur les directions de repos du classique) ; rest : décalage de chaque os par rapport à son parent, repère du '
            'modèle (y vers le haut, z vers l’avant, x vers la gauche), mètres à taille naturelle ; info : champs de rigInfo '
            '(skeleton.js:62-83) lus par human/anim.js ; fist : poing (centre de prise des rênes), repère de la main ; '
            'scale : échelle d’affichage par défaut (le jeu affiche le modèle réaliste à sa taille naturelle, realistic.js:393-395).'),
    'scale': 1,
    'bones': BONES,
    'rest': rest,
    'info': info,
    'fist': fist['l'],
    'fistR': fist['r'],
    'map': {c: t for c, t in MAP + EXTRA},
    'notes': {
        'root': 'origine du modèle (sol de la pose de repos du fichier)',
        'hairTail': 'pas d’os équivalent : confondu avec la tête (décalage nul), sans effet sur la règle ni sur les cibles',
        'lFing': 'os middle_01 (direction de la main, comme realistic.js ALIGN)',
        'ankleY': 'hauteur de la cheville gauche au-dessus de la semelle (sommet le plus bas de la botte, setup.real.sole.l, relevé dans la page)',
        'toe': 'boule du pied (ball_l) moins cheville, pose calée',
        'seatToHips': 'convention à confirmer : classique ' + repr(crig['seatToHips']) + ' × hauteur du bassin ' + repr(model['hips'][1]) + ' / ' + repr(crig['hipsY']) + ' (rapport hipScale de realistic.js:726)',
        'heelBack': 'non lu par la monte (anim.js plantFoot : marche) ; pas de mesure',
        'height': 'non lu par l’animation ; pas de mesure',
        'fist': 'gauche (fist) et droit (fistR, pour information) : RealBody.gripPoint (rz) dans le repère de la main classique, moyenne sur la fenêtre d’E1 ; dispersion maximale ' + repr(round(spread, 7)) + ' m',
    },
    'checks': {'ball': ecart_ball, 'fistSpread': spread},
}
text = json.dumps(doc, indent=1, ensure_ascii=False) + '\n'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
old = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else None
if old != text:
    open(OUT, 'w', encoding='utf-8').write(text)
print('%s : %s (%d octets)' % (os.path.relpath(OUT, ROOT), 'inchangé' if old == text else 'écrit', len(text.encode('utf-8'))))
print('jambe %.4f + %.4f = %.4f m ; bras %.4f + %.4f = %.4f m ; ankleY %.4f m ; seatToHips %.4f m' % (
    info['thighLen'], info['shinLen'], info['thighLen'] + info['shinLen'], info['upperArmLen'], info['foreArmLen'],
    info['upperArmLen'] + info['foreArmLen'], info['ankleY'], info['seatToHips']))
print('contrôle boule du pied contre la page : %.3g m (tolérance %g) ; dispersion du poing : %.3g m' % (ecart_ball, TOL, spread))
sys.exit(0 if ecart_ball <= TOL else 1)
