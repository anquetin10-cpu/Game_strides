# Joueur de l'agent : lit l'écran comme un joueur (captures système + reconnaissance de texte de la pastille de guidage et
# du tableau, couleur du bouton SAUT) et répond par des touches injectées au niveau HID (CGEvent). Aucune console, aucune
# option de débogage du jeu, pas l'autopilote F8 : le jeu ne sait pas qui appuie. Lancé par jouer-suivre.sh (launchd),
# parce que seul ce python a les droits Accessibilité / Enregistrement de l'écran.
# Usage : python3.11 -I suivre.py <dossier-preuves> <journal> <outils> <mode> <durée_s>
#   mode « saut »     : suit la pastille, tape SAUT quand le bouton est vert (aide à l'appel du jeu) ;
#   mode « sans-saut » : suit la pastille sans jamais sauter (refus attendu), s'arrête au premier point de pénalité ;
#   mode « refus-puis-saut » : sans saut jusqu'au premier refus présumé (cheval arrêté devant l'obstacle), puis « saut » ;
#   mode « poteau »   : suit la ligne « Chrono du Pôle » hors épreuve, s'arrête à moins de 6 m.
import ctypes, ctypes.util, os, re, subprocess, sys, time
cg = ctypes.CDLL(ctypes.util.find_library('CoreGraphics'))
cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
cf = ctypes.CDLL(ctypes.util.find_library('CoreFoundation'))
cf.CFRelease.argtypes = [ctypes.c_void_p]
out, logp, tools, mode, dur = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5])
os.makedirs(out, exist_ok=True)
log = open(logp, 'a')
def L(m):
    log.write(time.strftime('%H:%M:%S') + ' ' + m + '\n'); log.flush()
def key(code, down):
    e = cg.CGEventCreateKeyboardEvent(None, code, down); cg.CGEventPost(0, e); cf.CFRelease(e)
def hold(code, s):
    key(code, True); time.sleep(s); key(code, False)
A, D, W, S, SPACE = 0, 2, 13, 1, 49
def front_ok():
    r = subprocess.run(['/usr/bin/lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
    n = subprocess.run(['/usr/bin/lsappinfo', 'info', '-only', 'name', r], capture_output=True, text=True).stdout
    return '"StridesGrandTour"' in n
cur = os.path.join(out, 'courant.jpg')
t0 = time.time(); slowed = False; refused = False; last_mash = 0; k = 0; lost = 0; last_d = None; same = 0; green_prev = False
L('début suivre mode=%s durée=%.0f' % (mode, dur))
try:
    while time.time() - t0 < dur:
        if not front_ok():
            L('ABANDON : le jeu n\'est plus au premier plan'); break
        subprocess.run(['/usr/sbin/screencapture', '-x', '-t', 'jpg', cur])
        k += 1
        if k % 3 == 1:
            subprocess.run(['/bin/cp', cur, os.path.join(out, time.strftime('%H%M%S-') + 's%s-%03d.jpg' % (mode, k))])
        txt = subprocess.run([tools + ('/ocr' if mode == 'poteau' else '/ocr2'), cur], capture_output=True, text=True).stdout
        parts = [p.strip() for p in txt.split('|')[1:]]
        pill = next((p for p in parts if re.search(r'Obstacle|Ligne de d|Arriv|Chrono du P', p)), '')
        pts = next((p for p in parts if re.search(r'\d+\s*pts?\b', p)), '')
        # Bouton SAUT (bas droite, plein écran 3840 × 2160) : fond vert quand l'appel est bon (.btn-jump.good du web).
        px = subprocess.run([tools + '/pix', cur, '3660', '2025', '3750', '2025', '3706', '1975'], capture_output=True, text=True).stdout.split('\n')
        green = 0
        for line in px:
            v = line.split()
            if len(v) == 3 and v[0].isdigit():
                r, g, b = map(int, v)
                if g > r + 30 and g > b + 10: green += 1
        dm = re.search(r'(\d[\d,.]*)\s*m\b', pill.replace(' ,', ','))
        d = float(dm.group(1).replace(',', '.')) if dm else None
        L('i%d pastille=« %s » tableau=« %s » saut_vert=%d' % (k, pill, pts, green))
        if mode == 'sans-saut-arret' and re.search(r'(?<![\d,.])[1-9]\d?\s*pts?\b', pts) and 'accord' not in pts:
            L('pénalité affichée : arrêt du mode sans-saut'); break
        # refus-puis-saut : pas de SAUT tant qu'aucun refus n'est vu (cheval arrêté tout près de l'obstacle attendu).
        if mode == 'refus-puis-saut' and refused: mode = 'saut'; L('refus vu : SAUT désormais au bouton vert')
        if mode == 'saut' and green >= 2 and not green_prev:
            key(SPACE, True); time.sleep(0.08); key(SPACE, False); L('SAUT (bouton vert)')
        green_prev = green >= 2
        if not pill:
            lost += 1
            if lost >= 4: L('plus de pastille : arrêt'); break
            continue
        lost = 0
        if mode == 'poteau' and d is not None and d < 9:
            hold(S, 2.0); L('poteau proche : arrêt'); break
        if mode == 'poteau' and d is not None and d < 45 and not slowed:
            hold(S, 1.2); slowed = True; L('ralenti à l\'approche du poteau')
        # Pas d'avancée sur trois lectures (refus, arrêt) : reprendre la cadence.
        if d is not None and last_d is not None and abs(d - last_d) < 0.5: same += 1
        else: same = 0
        last_d = d
        if mode == 'refus-puis-saut' and same >= 2 and 'Obstacle' in pill and d is not None and d < 10:
            refused = True; L('cheval arrêté devant l\'obstacle : refus présumé (journal du jeu pour preuve)')
        if same >= 3 and not (mode == 'poteau' and d is not None and d < 20):
            # Bloqué (barre, aile, lice) : s'écarter d'abord à droite, puis reprendre la cadence ; le guidage recorrige.
            if not (mode == 'refus-puis-saut' and not refused): hold(D, 1.2)
            hold(W, 0.7); same = 0; L('cadence reprise (écart à droite)')
        # Abord de l'obstacle attendu, aligné, à moins de 14 m : SAUT tapé toutes les 0,15 s pendant 3,5 s (« trop tôt »
        # ne fait pas sauter ; le premier appui dans la zone d'appel fait sauter), sans regarder l'écran entre-temps.
        if mode == 'saut' and 'Obstacle' in pill and d is not None and d <= 14 and 'tout' in pill and time.time() - last_mash > 5:
            L('abord : SAUT tapé en rafale')
            for _ in range(23):
                key(SPACE, True); time.sleep(0.05); key(SPACE, False); time.sleep(0.1)
            last_mash = time.time(); same = 0; last_d = None
            continue
        # Ligne de départ : la cible est l'abord, 8 m avant la ligne ; une fois tout près, continuer tout droit pour la
        # franchir (la pastille dirait « demi-tour » vers l'abord dépassé).
        if 'Ligne de d' in pill and d is not None and d < 12: continue
        # (lecture tolérante : « gauche » est parfois lu « dauche », « aauche »)
        if 'demi' in pill: hold(D, 1.1)
        elif 'auche' in pill: hold(A, 0.45)
        elif 'roite' in pill: hold(D, 0.45)
finally:
    for c in (A, D, W, S, SPACE): key(c, False)
    L('fin du plan')
