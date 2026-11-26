# Joueur de l'agent, version 2 (2e correction J1) : lit l'écran par l'« œil » persistant (oeil.swift : ScreenCaptureKit +
# Vision, une lecture en ~0,3 s au lieu de 1,5 à 2 s) et répond par des touches injectées au niveau HID (CGEvent). Il ne
# lit QUE ce qu'un joueur voit : la pastille de guidage (« Obstacle n · 12 m · à gauche »), le tableau du chrono et la
# ligne « Chrono du Pôle ». Aucune console, aucune option de débogage, pas l'autopilote F8 : le jeu ne sait pas qui appuie.
# Lancé par jouer-pilote.sh (job launchd : seul ce python a les droits Accessibilité / Enregistrement de l'écran).
# Usage : python3.11 -I pilote.py <dossier-preuves> <journal> <outils> <mode> <durée_s> [refus=<label>] [lent=<label>]
#   mode « poteau »   : suit « Chrono du Pôle », s'arrête à moins de 8 m (invite « E · Chrono »).
#   mode « parcours » : suit la pastille ; tape SAUT en rafale (fil dédié) à l'abord de l'obstacle attendu, aligné ;
#                       refus=<label> : premier abord de cet obstacle sans SAUT (refus voulu) ;
#                       lent=<label>  : abord de cet obstacle au trot (barre probable, faute voulue).
#   S'arrête quand la pastille disparaît (bilan affiché) ou au bout de la durée.
import ctypes, ctypes.util, os, re, subprocess, sys, threading, time
cg = ctypes.CDLL(ctypes.util.find_library('CoreGraphics'))
cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
cf = ctypes.CDLL(ctypes.util.find_library('CoreFoundation'))
cf.CFRelease.argtypes = [ctypes.c_void_p]
out, logp, tools, mode, dur = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5])
opts = dict(a.split('=', 1) for a in sys.argv[6:] if '=' in a)
os.makedirs(out, exist_ok=True)
log = open(logp, 'a')
lock = threading.Lock()
def L(m):
    with lock:
        log.write(time.strftime('%H:%M:%S') + ('%.2f' % (time.time() % 1))[1:] + ' ' + m + '\n'); log.flush()
def key(code, down):
    e = cg.CGEventCreateKeyboardEvent(None, code, down); cg.CGEventPost(0, e); cf.CFRelease(e)
def hold(code, s):
    key(code, True); time.sleep(s); key(code, False)
A, D, W, S, SPACE = 0, 2, 13, 1, 49
def press_e():
    # option e=1 : E tapé à l'arrêt devant le poteau (invite « E · Chrono »), comme un joueur.
    if opts.get('e'):
        time.sleep(0.2); hold(14, 0.08); L('E tapé (invite du poteau)')
def front_ok():
    r = subprocess.run(['/usr/bin/lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
    n = subprocess.run(['/usr/bin/lsappinfo', 'info', '-only', 'name', r], capture_output=True, text=True).stdout
    return '"StridesGrandTour"' in n
# SAUT en rafale dans un fil : un appui toutes les 0,12 s tant que mash_until n'est pas dépassé (« trop tôt » ne fait pas
# sauter ; le premier appui hors de la zone « loin » fait sauter, comme un joueur qui tape SAUT à l'approche).
mash_until = 0.0
stop = False
def masher():
    while not stop:
        if time.time() < mash_until:
            key(SPACE, True); time.sleep(0.05); key(SPACE, False); time.sleep(0.07)
        else:
            time.sleep(0.03)
threading.Thread(target=masher, daemon=True).start()
eye = subprocess.Popen([tools + '/oeil'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
def look():
    eye.stdin.write('go\n'); eye.stdin.flush()
    line = eye.stdout.readline().strip()
    parts = line.split('|')
    if not parts or parts[0] != 'T': return [], 0, 0
    gi = parts.index('G') if 'G' in parts else len(parts)
    texts = [p.strip() for p in parts[1:gi]]
    g = int(parts[gi + 1]) if gi + 1 < len(parts) else 0
    ms = int(parts[gi + 3]) if gi + 3 < len(parts) else 0
    return texts, g, ms
PILL = re.compile(r'(Obstacle\s*[0-9]+[AB]?|Ligne de d\S*part|Arriv\S*e|Chrono du P\S*le)[^\w]*([\d][\d,.]*)\s*(k?m)\b[^\w]*(.*)')
def parse(texts):
    for t in texts:
        m = PILL.search(t)
        if m:
            d = float(m.group(2).replace(' ', '').replace(',', '.')) * (1000 if m.group(3) == 'km' else 1)
            w = m.group(4)
            way = 'demi' if 'demi' in w else 'gauche' if 'auche' in w else 'droite' if 'roite' in w else 'droit' if ('tout' in w or 'droit' in w) else '?'
            return m.group(1).replace('  ', ' '), d, way
    return None, None, None
refuse = opts.get('refus'); slow_at = opts.get('lent')
refused = False; near_refuse = False
t0 = time.time(); k = 0; lost = 0; last = None; last_d = None; stall = 0; stalls = 0; seen = False; last_t = None; v_est = None; streak = 0; last_way = None
L('début pilote mode=%s durée=%.0f options=%s' % (mode, dur, opts))
try:
    while time.time() - t0 < dur:
        if k % 10 == 0 and not front_ok():
            L('ABANDON : le jeu n\'est plus au premier plan'); break
        texts, green, ms = look()
        now = time.time(); k += 1
        if k % 6 == 1:
            subprocess.Popen(['/usr/sbin/screencapture', '-x', '-t', 'jpg', os.path.join(out, time.strftime('%H%M%S-') + 'p%s-%04d.jpg' % (mode, k))])
        label, d, way = parse(texts)
        # Ligne d'allure du HUD hors épreuve (« À cheval · GALOP · 6.6 m/s … cadence 6.6 ») : la cadence lue sert de vitesse.
        cad = None
        for t in texts:
            mc = re.search(r'cadence\s*([\d]+[.,]\d)', t)
            if mc: cad = float(mc.group(1).replace(',', '.'))
        board = next((t for t in texts if re.search(r'\bpts?\b|/\s*\d+\s*s', t)), '')
        L('i%d %dms « %s » d=%s %s | tableau « %s » | vert=%d' % (k, ms, label, d, way, board, green))
        if label is None:
            L('   texte lu : %s' % ' | '.join(texts)[:300])
            if mode == 'poteau' and last_d is not None and last_d < 20:
                hold(S, 4.0); L('ligne du poteau effacée tout près (moins de 6 m) : arrêt'); press_e(); break
            lost += 1
            if not seen and time.time() - t0 < 90: continue  # entrée en piste, cloche : pas encore de pastille
            if lost >= (6 if mode == 'parcours' else 10): L('plus de pastille : arrêt (bilan ou fin)'); break
            continue
        lost = 0; seen = True
        if mode == 'poteau':
            if d < 6.5:
                hold(S, 4.0); L('poteau atteint : arrêt'); press_e(); break
            if cad is not None:
                want_p = 6.0 if d > 70 else 2.0 if d > 15 else 1.2
                if cad > want_p + 0.4: hold(S, 0.3); L('ralenti (cadence %.1f, visée %.1f)' % (cad, want_p))
                elif cad < want_p - 0.4 and way == 'droit': hold(W, 0.3)
        # Vitesse estimée par la distance lue (même cible, cap tenu).
        if last == label and last_t and way == 'droit' and last_way == 'droit' and d is not None:
            v = (last_d - d) / (now - last_t)
            if 0 < v < 12: v_est = v if v_est is None else 0.5 * v_est + 0.5 * v
        # Arrêté (distance figée sur 4 lectures, refus ou cadence nulle) : reprendre la cadence.
        stall = stall + 1 if (last == label and last_d is not None and abs(last_d - d) < 0.5) else 0
        if stall >= 4:
            stalls += 1
            # Bloqué (lice, aile, refus) : s'écarter, alternativement à droite puis à gauche, puis reprendre la cadence.
            hold(D if stalls % 2 else A, 0.6); hold(W, 0.5); stall = 0; v_est = 1.5; L('arrêté : écart et cadence reprise (%d)' % stalls)
        last, last_d, last_t, last_way = label, d, now, way
        want = 5.2 if mode == 'parcours' else (6.0 if d > 60 else 3.0)
        if slow_at and label == 'Obstacle ' + slow_at: want = 3.6
        if way in ('gauche', 'droite'): streak = streak + 1 if way == last_way else 1
        # Direction : appuis courts, plus longs si la consigne persiste ; demi-tour : à droite, au ralenti.
        if way == 'demi':
            if v_est is None or v_est > 3.2: key(S, True); time.sleep(0.2); key(S, False); v_est = (v_est or 4) - 0.5
            hold(D, 0.35)
        elif way == 'gauche':
            hold(A, min(0.12 + 0.05 * streak, 0.35))
        elif way == 'droite':
            hold(D, min(0.12 + 0.05 * streak, 0.35))
        elif way == 'droit' and mode == 'parcours':
            if cad is not None: v_est = cad
            if v_est is not None and v_est < want - 0.6: hold(W, 0.25); L('cadence + (%.1f m/s estimés)' % v_est)
            elif v_est is not None and v_est > want + 0.8: hold(S, 0.2); L('cadence - (%.1f m/s estimés)' % v_est)
            elif v_est is None and k < 6: hold(W, 0.4)
        if mode != 'parcours' or not label.startswith('Obstacle'): continue
        lab = label.split(' ', 1)[1]
        # Refus voulu : premier abord sans SAUT ; refus vu quand la consigne repasse à « demi-tour » tout près.
        if refuse == lab and not refused:
            if d < 4: near_refuse = True
            if near_refuse and way == 'demi': refused = True; L('refus voulu au %s : vu (demi-tour demandé)' % lab)
            continue
        if d <= 9 and way == 'droit' and time.time() > mash_until:
            mash_until = time.time() + 2.2; L('abord du %s : SAUT en rafale' % lab)
finally:
    stop = True
    for c in (A, D, W, S, SPACE): key(c, False)
    try:
        eye.stdin.write('fin\n'); eye.stdin.flush()
    except Exception:
        pass
    L('fin du plan')
    time.sleep(100000)  # launchd submit relance un programme sorti : on attend le retrait du job (jouer-pilote.sh)
