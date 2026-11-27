# Joueur de l'agent pour l'entraînement au paddock (jalon J2c) : cercle à main droite (consigne de l'astuce du web : « un
# cercle à main droite les enchaîne »), droite tenue par à-coups (D pendant <appui> s à chaque lecture), SAUT tapé quand
# le bouton SAUT est vert (aide à l'appel du jeu, comme suivre.py). Entrées injectées au niveau HID (CGEvent), lecture par
# captures système : aucune console, aucune option de débogage, pas l'autopilote F8.
# Usage : python3.11 -I cercle.py <dossier-preuves> <journal> <outils> <durée_s> <appui_s> [cadence_s]
import ctypes, ctypes.util, os, subprocess, sys, time
cg = ctypes.CDLL(ctypes.util.find_library('CoreGraphics'))
cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
cg.CGEventSetFlags.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
cf = ctypes.CDLL(ctypes.util.find_library('CoreFoundation'))
cf.CFRelease.argtypes = [ctypes.c_void_p]
out, logp, tools, dur, push = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5])
cad = float(sys.argv[6]) if len(sys.argv) > 6 else 0.0
os.makedirs(out, exist_ok=True)
log = open(logp, 'a')
def L(m):
    log.write(time.strftime('%H:%M:%S') + ' ' + m + '\n'); log.flush()
def key(code, down):
    e = cg.CGEventCreateKeyboardEvent(None, code, down); cg.CGEventSetFlags(e, 0); cg.CGEventPost(0, e); cf.CFRelease(e)
def front_ok():
    r = subprocess.run(['/usr/bin/lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
    n = subprocess.run(['/usr/bin/lsappinfo', 'info', '-only', 'name', r], capture_output=True, text=True).stdout
    return '"StridesGrandTour"' in n
D, W, SPACE = 2, 13, 49
btn = os.path.join(out, 'cercle-bouton.png')
t0 = time.time(); k = 0; prev = False; jumps = 0
L('début cercle durée=%.0f appui=%.2f cadence=%.1f' % (dur, push, cad))
try:
    if cad > 0 and front_ok():
        key(W, True); time.sleep(cad); key(W, False)
    while time.time() - t0 < dur:
        if not front_ok():
            L('ABANDON : le jeu n\'est plus au premier plan'); break
        # Bouton SAUT seul (zone de 60 × 40 points en bas à droite) : lecture rapide ; écran entier toutes les 8 lectures.
        subprocess.run(['/usr/sbin/screencapture', '-x', '-R1825,980,60,40', btn])
        k += 1
        if k % 8 == 0:
            subprocess.run(['/usr/sbin/screencapture', '-x', '-t', 'jpg', os.path.join(out, time.strftime('%H%M%S-') + 'cercle-%04d.jpg' % k)])
        px = subprocess.run([tools + '/pix', btn, '10', '65', '100', '65', '56', '15'], capture_output=True, text=True).stdout.split('\n')
        green = 0
        for p in px:
            v = p.split()
            if len(v) == 3 and v[0] != '?':
                r, g, b = map(int, v)
                if g > r + 30 and g > b + 10: green += 1
        if green >= 2 and not prev:
            key(SPACE, True); time.sleep(0.08); key(SPACE, False); jumps += 1; L('i%d SAUT (bouton vert)' % k)
            subprocess.run(['/usr/sbin/screencapture', '-x', '-t', 'jpg', os.path.join(out, time.strftime('%H%M%S-') + 'saut-%02d.jpg' % jumps)])
        else:
            if push > 0: key(D, True); time.sleep(push); key(D, False)
        prev = green >= 2
finally:
    for c in (D, W, SPACE): key(c, False)
    L('fin du plan (%d lectures, %d SAUT)' % (k, jumps))
    time.sleep(100000)
