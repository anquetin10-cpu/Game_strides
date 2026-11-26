# Pilote d'entrées système (CGEvent, niveau HID macOS) pour jouer comme un joueur, sans console ni option de débogage.
# Usage : python3.11 -I drive.py <plan.txt> <dossier-preuves> <journal>
# Plan, une commande par ligne :
#   down <keycode> | up <keycode> | tap <keycode> [ms] | wait <s> | shot <nom> | click <x> <y> | hold <keycode> <s>
#   shots <n> <intervalle_s> <prefixe>   (captures successives)
#   front <nom>   garde-fou : si l'application au premier plan n'est pas <nom> (LSDisplayName), le plan s'ARRÊTE avant
#                 toute autre entrée (une touche injectée va à l'application au premier plan, pas forcément au jeu).
#                 À mettre avant chaque groupe de touches ; activer le jeu avec « exec /usr/bin/open -a <app> ».
import ctypes, ctypes.util, subprocess, sys, time, os
cg = ctypes.CDLL(ctypes.util.find_library('CoreGraphics'))
cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
class CGPoint(ctypes.Structure):
    _fields_ = [('x', ctypes.c_double), ('y', ctypes.c_double)]
cg.CGEventCreateMouseEvent.restype = ctypes.c_void_p
cg.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32]
cf = ctypes.CDLL(ctypes.util.find_library('CoreFoundation'))
cf.CFRelease.argtypes = [ctypes.c_void_p]
plan, out, logp = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
log = open(logp, 'a')
def L(m):
    log.write(time.strftime('%H:%M:%S') + ' ' + m + '\n'); log.flush()
def key(code, down):
    e = cg.CGEventCreateKeyboardEvent(None, code, down); cg.CGEventPost(0, e); cf.CFRelease(e)
def click(x, y):
    for t in (5, 1, 2):  # moved, down, up
        e = cg.CGEventCreateMouseEvent(None, t, CGPoint(x, y), 0); cg.CGEventPost(0, e); cf.CFRelease(e); time.sleep(0.06)
def shot(name):
    p = os.path.join(out, time.strftime('%H%M%S-') + name + '.png')
    subprocess.run(['/usr/sbin/screencapture', '-x', p]); L('shot ' + p)
held = set()
try:
    for raw in open(plan):
        a = raw.split('#')[0].split()
        if not a: continue
        c = a[0]
        if c == 'down': key(int(a[1]), True); held.add(int(a[1]))
        elif c == 'up': key(int(a[1]), False); held.discard(int(a[1]))
        elif c == 'tap': key(int(a[1]), True); time.sleep(float(a[2]) / 1000 if len(a) > 2 else 0.08); key(int(a[1]), False)
        elif c == 'hold': key(int(a[1]), True); time.sleep(float(a[2])); key(int(a[1]), False)
        elif c == 'wait': time.sleep(float(a[1]))
        elif c == 'shot': shot(a[1])
        elif c == 'shots':
            for i in range(int(a[1])): shot('%s-%02d' % (a[3], i)); time.sleep(float(a[2]))
        elif c == 'click': click(float(a[1]), float(a[2]))
        elif c == 'front':
            r = subprocess.run(['/usr/bin/lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
            n = subprocess.run(['/usr/bin/lsappinfo', 'info', '-only', 'name', r], capture_output=True, text=True).stdout
            if ('"' + a[1] + '"') not in n:
                L('ABANDON : premier plan = ' + n.strip() + ', attendu ' + a[1]); break
            L('premier plan ' + a[1])
        elif c == 'exec':
            r = subprocess.run(a[1:], capture_output=True, text=True); L('exec ' + (r.stdout + r.stderr).strip().replace('\n', ' | '))
        elif c == 'shotwin':
            p = os.path.join(out, time.strftime('%H%M%S-') + a[2] + '.png')
            subprocess.run(['/usr/sbin/screencapture', '-x', '-o', '-l', a[1], p]); L('shot ' + p)
        L(' '.join(a))
finally:
    for k in list(held): key(k, False)
    L('fin du plan')
    log.close()
    time.sleep(100000)  # launchd submit relance un programme sorti : on attend le retrait du job (run.sh)
