# Joueur sûr du poste partagé (règles du 27/11 après les incidents du trousseau et de Notes) : entrées injectées
# ADRESSÉES AU SEUL PROCESSUS DU JEU (CGEventPostToPid, jamais le flux global), modificateurs forcés à 0, aucune touche
# fn ni Globe ; avant chaque rafale, `garde <pid>` vérifie que le jeu est au premier plan et qu'aucune fenêtre système
# modale n'est affichée, sinon on attend sans rien taper ; captures de la SEULE fenêtre du jeu (screencapture -l).
# Aucune console, ni F8, ni autopilote, ni -StridesShots. Aucun clic, aucune autre fenêtre touchée.
# Usage (job launchd, seul python autorisé à poster) : python3.11 -I joueur-sur.py <dossier> <plan.txt>
# Commandes : tap <code> | hold <code> <s> | combo <code,code> <s> | wait <s> | shot <nom> | ocr <nom>
#   | gps <durée_s> [motif d'arrêt] (suit « GPS · … · N m · direction »)
import ctypes, ctypes.util, os, re, subprocess, sys, time
cg = ctypes.CDLL(ctypes.util.find_library('CoreGraphics'))
cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
cg.CGEventCreateMouseEvent.restype = ctypes.c_void_p
class P(ctypes.Structure): _fields_ = [('x', ctypes.c_double), ('y', ctypes.c_double)]
cg.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, P, ctypes.c_uint32]
cg.CGEventPostToPid.argtypes = [ctypes.c_int32, ctypes.c_void_p]
cg.CGEventSetFlags.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
cf = ctypes.CDLL(ctypes.util.find_library('CoreFoundation')); cf.CFRelease.argtypes = [ctypes.c_void_p]
OUT, PLAN = sys.argv[1], sys.argv[2]
PID = int(subprocess.run(['/usr/bin/pgrep', '-xn', 'StridesGrandTour'], capture_output=True, text=True).stdout.strip() or 0)
T = '/Volumes/Stockage-Qualification/Mac-Mini-Migration/Active-Projects/grand-tour-unreal/.ue-cache/travail/livraison/outils'
os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, 'drive.log'), 'a')
def L(m): log.write(time.strftime('%H:%M:%S') + ' ' + m + '\n'); log.flush()
def key(c, d):
    e = cg.CGEventCreateKeyboardEvent(None, c, d); cg.CGEventSetFlags(e, 0); cg.CGEventPostToPid(PID, e); cf.CFRelease(e)  # au seul jeu, aucun modificateur
def tap(c): key(c, True); time.sleep(0.07); key(c, False)
def hold(c, s): key(c, True); time.sleep(s); key(c, False)
GARDE = os.path.join(T, 'garde')
WIN = [0]
def front(patience=600):
    # Attend (sans rien taper) que le jeu soit au premier plan et qu'aucune fenêtre système modale ne soit ouverte.
    t0 = time.time(); said = None
    while True:
        r = subprocess.run([GARDE, str(PID)], capture_output=True, text=True)
        out = r.stdout.strip()
        if r.returncode == 0:
            WIN[0] = int(out.split()[1]); return True, out
        if out != said: L('garde : ' + out); said = out
        if time.time() - t0 > patience: return False, out
        time.sleep(2)
def shot(name):
    p = os.path.join(OUT, time.strftime('%H%M%S-') + name + '.jpg')
    subprocess.run(['/usr/sbin/screencapture', '-x', '-o', '-l', str(WIN[0]), '-t', 'jpg', p]); L('shot ' + os.path.basename(p)); return p
def ocr(p):
    return subprocess.run(['/Volumes/Stockage-Qualification/Mac-Mini-Migration/Active-Projects/grand-tour-unreal/.ue-cache/travail/livraison/ctrl-J3/final/outils/ocr3', p], capture_output=True, text=True).stdout
A, D, W, S = 0, 2, 13, 1
def gps(dur, stop):
    t0 = time.time(); k = 0; last = None; same = 0; lost = 0
    key(W, False)
    while time.time() - t0 < dur:
        ok, n = front()
        if not ok: L('ABANDON premier plan : ' + n); return
        k += 1
        p = shot('gps-%03d' % k) if k % 4 == 1 else None
        cur = p or os.path.join(OUT, 'courant.jpg')
        if not p: subprocess.run(['/usr/sbin/screencapture', '-x', '-o', '-l', str(WIN[0]), '-t', 'jpg', cur])
        txt = ocr(cur); parts = [x.strip() for x in txt.split('|')[1:]]
        g = next((x for x in parts if x.startswith('GPS')), '') or next((x for x in parts if x.startswith('Chrono du P') and ' m' in x), '')
        L('i%d gps=« %s » | %s' % (k, g, ' / '.join(x for x in parts if 'cr' in x and 'dit' in x)[:120]))
        if stop and re.search(stop, txt): L('arret : motif « %s » lu' % stop); hold(S, 1.5); return
        if not g:
            lost += 1
            if lost > 12: L('plus de GPS'); hold(S, 1.5); return
            continue
        lost = 0
        m = re.search(r'(\d[\d ,.]*)\s*(k?m)\b', g)
        d = None
        if m:
            d = float(m.group(1).replace(' ', '').replace(',', '.')) * (1000 if m.group(2) == 'km' else 1)
        if g.startswith('Chrono') and d is not None and d < 9: hold(S, 2.5); L('poteau Chrono atteint'); return
        if d is not None and last is not None and abs(d - last) < 0.4: same += 1
        else: same = 0
        last = d
        if same >= 4: hold(D, 1.0); hold(W, 0.5); same = 0; L('bloque : ecart a droite'); continue
        if 'demi' in g: hold(D, 1.6)
        elif 'auche' in g: hold(A, 0.8 if (d or 99) < 40 else 0.4)
        elif 'roite' in g: hold(D, 0.8 if (d or 99) < 40 else 0.4)
        allure = next((x for x in parts if 'cheval' in x and 'm/s' in x), '')
        if 'ARR' in allure: hold(W, 0.3)
        elif d is not None and d < 35 and re.search(r'TROT|GALOP', allure): hold(S, 0.4)
        elif d is not None and d > 60 and 'PAS' in allure: hold(W, 0.3)
    L('gps : duree ecoulee')
import fcntl
lk = open(os.path.join(OUT, '.verrou-' + os.path.basename(PLAN)), 'a+')
lk.seek(0)
if lk.read().strip() == 'fait': L('plan deja joue, ignore'); time.sleep(900); sys.exit(0)
L('debut plan %s (pid du jeu %d)' % (PLAN, PID))
if not PID: L('ABANDON : jeu absent'); sys.exit(1)
try:
    for line in open(PLAN):
        a = line.split()
        if not a or a[0].startswith('#'): continue
        c = a[0]; L(' '.join(a))
        if c in ('tap', 'hold', 'combo', 'gps', 'shot', 'ocr'):
            ok, n = front()
            if not ok: L('ABANDON avant %s : premier plan = %s' % (c, n)); break
        if c == 'front':
            ok, n = front()
            if not ok: L('ABANDON : ' + n); break
        elif c == 'combo':
            cs = [int(x) for x in a[1].split(',')]
            for k in cs: key(k, True)
            time.sleep(float(a[2]))
            for k in reversed(cs): key(k, False)
        elif c == 'tap': tap(int(a[1]))
        elif c == 'hold': hold(int(a[1]), float(a[2]))
        elif c == 'wait': time.sleep(float(a[1]))
        elif c == 'shot': shot(a[1])
        elif c == 'ocr': L('ocr ' + ocr(shot(a[1] if len(a) > 1 else 'ocr')).strip()[:600])
        elif c == 'gps': gps(float(a[1]), ' '.join(a[2:]) if len(a) > 2 else None)
finally:
    for c in (A, D, W, S): key(c, False)
    lk.write('fait'); lk.flush()
    L('fin du plan')
    time.sleep(900)  # launchd submit relance un programme termine : rester vivant jusqu'au retrait du job
