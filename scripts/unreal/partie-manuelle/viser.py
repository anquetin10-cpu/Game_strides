# Joueur de l'agent pour l'entraînement au paddock (jalon J2d) : cercle à main droite (astuce du web), mais la droite est
# relâchée dès que le bouton SAUT s'allume (anneau orange « trop loin », vert « saute ! », rouge « trop près » : un
# obstacle est visé, aligné), et SAUT est tapé quand le bouton passe au vert. Entrées injectées au niveau HID (CGEvent),
# lecture par captures système de la seule zone du bouton : aucune console, aucune option de débogage, pas l'autopilote.
# Usage : python3.11 -I viser.py <dossier-preuves> <journal> <outils> <durée_s> <cx> <cy> <r> [appui_s] [cadence_s]
#   cx, cy, r : centre et rayon du bouton SAUT en points d'écran (relevés sur une capture de la partie).
import ctypes, ctypes.util, os, subprocess, sys, time
cg = ctypes.CDLL(ctypes.util.find_library('CoreGraphics'))
cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
cg.CGEventSetFlags.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
cf = ctypes.CDLL(ctypes.util.find_library('CoreFoundation'))
cf.CFRelease.argtypes = [ctypes.c_void_p]
out, logp, tools, dur = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
cx, cy, r = float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7])
push = float(sys.argv[8]) if len(sys.argv) > 8 else 0.15
cad = float(sys.argv[9]) if len(sys.argv) > 9 else 0.0
os.makedirs(out, exist_ok=True)
log = open(logp, 'a')
def L(m):
    log.write(time.strftime('%H:%M:%S') + ' ' + m + '\n'); log.flush()
def key(code, down):
    e = cg.CGEventCreateKeyboardEvent(None, code, down); cg.CGEventSetFlags(e, 0); cg.CGEventPost(0, e); cf.CFRelease(e)
def front_ok():
    a = subprocess.run(['/usr/bin/lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
    n = subprocess.run(['/usr/bin/lsappinfo', 'info', '-only', 'name', a], capture_output=True, text=True).stdout
    return '"StridesGrandTour"' in n
D, W, SPACE = 2, 13, 49
btn = os.path.join(out, 'viser-bouton.png')
# Zone capturée : carré de 2r autour du bouton (points) ; l'image est en pixels (Retina : ×2).
x0, y0, side = int(cx - r), int(cy - r), int(2 * r)
import math
ring, inner = [], []
for i in range(24):
    a = 2 * math.pi * i / 24
    for k, lst in ((0.93, ring), (0.55, inner)):
        ring_x = int((r + r * k * math.cos(a)) * 2); ring_y = int((r + r * k * math.sin(a)) * 2)
        lst.append((ring_x, ring_y))
def classify(cols):
    g = o = rd = 0
    for (R, G, B) in cols:
        if G > R + 40 and G > B + 15 and G > 110: g += 1
        elif R > 200 and 120 < G < 210 and B < 110: o += 1
        elif R > 190 and G < 130 and B < 120: rd += 1
    return g, o, rd
def colors(pts):
    args = [tools + '/pix', btn] + [str(v) for p in pts for v in p]
    res = []
    for line in subprocess.run(args, capture_output=True, text=True).stdout.split('\n'):
        v = line.split()
        if len(v) == 3 and v[0].isdigit(): res.append(tuple(map(int, v)))
    return res
t0 = time.time(); k = 0; jumps = 0; lit_n = 0; prev_good = False
L('début viser durée=%.0f bouton=(%.0f, %.0f, r %.0f) appui=%.2f cadence=%.2f' % (dur, cx, cy, r, push, cad))
try:
    if cad > 0 and front_ok():
        key(W, True); time.sleep(cad); key(W, False)
    while time.time() - t0 < dur:
        if not front_ok():
            L('ABANDON : le jeu n\'est plus au premier plan'); break
        subprocess.run(['/usr/sbin/screencapture', '-x', '-R%d,%d,%d,%d' % (x0, y0, side, side), btn])
        k += 1
        rg_, ro, rr = classify(colors(ring))
        ig, _, _ = classify(colors(inner))
        good = ig >= 6 or rg_ >= 6
        lit = good or ro >= 4 or rr >= 4
        if k % 10 == 0:
            subprocess.run(['/usr/sbin/screencapture', '-x', '-t', 'jpg', os.path.join(out, time.strftime('%H%M%S-') + 'viser-%04d.jpg' % k)])
        if lit: lit_n += 1
        if good and not prev_good:
            key(SPACE, True); time.sleep(0.06); key(SPACE, False); jumps += 1
            L('i%d SAUT (bouton vert : anneau %d, fond %d)' % (k, rg_, ig))
            time.sleep(0.35)
            subprocess.run(['/usr/sbin/screencapture', '-x', '-t', 'jpg', os.path.join(out, time.strftime('%H%M%S-') + 'saut-%02d.jpg' % jumps)])
        elif lit:
            if k % 5 == 0: L('i%d bouton allumé (vert %d / %d, orange %d, rouge %d) : tout droit' % (k, rg_, ig, ro, rr))
        else:
            key(D, True); time.sleep(push); key(D, False)
            # Cadence entretenue (les virages et la lice la font tomber) : W bref toutes les 40 lectures.
            if cad > 0 and k % 40 == 0: key(W, True); time.sleep(min(cad, 0.3)); key(W, False)
        prev_good = good
finally:
    for c in (D, W, SPACE): key(c, False)
    L('fin du plan (%d lectures, %d allumées, %d SAUT)' % (k, lit_n, jumps))
    time.sleep(100000)
