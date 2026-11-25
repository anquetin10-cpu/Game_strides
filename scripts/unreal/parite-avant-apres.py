#!/usr/bin/env python3
"""Comparaison avant / après de captures Unreal, avec le web en référence (étape S2 de l'essai de monte, voie A).

Pour chaque capture <nom>-unreal.png du dossier « après » : capture « avant » de même nom (dossier avant), capture web
(<nom>-web.png du dossier web, si elle existe), mesure de l'écart avant → après par le PSNR de ffmpeg (filtre psnr,
moyenne des canaux, dB ; « inf » si identiques) et, avec --montages=<dossier>, montage avant | après | web (hstack de
ffmpeg ; Pillow n'est pas installé). Écrit un tableau JSON (--json=<fichier>) et l'affiche.
Le PSNR ne juge pas la justesse : il dit seulement combien l'image a changé. Référence du bruit de rendu : une même
configuration relancée (voir unreal/docs/parite/monte/README.md, étape S2).

Usage : python3 scripts/unreal/parite-avant-apres.py --avant=<dossier> --apres=<dossier> [--web=<dossier>]
        [--montages=<dossier>] [--json=<fichier>] [--prefixe=<p>]
"""
import json
import os
import re
import subprocess
import sys

arg = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:]}


def psnr(a, b):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'average:(inf|[0-9.]+)', r.stderr)
    return None if not m else (float('inf') if m.group(1) == 'inf' else float(m.group(1)))


def main():
    avant, apres = arg.get('--avant'), arg.get('--apres')
    if not avant or not apres:
        print(__doc__)
        sys.exit(2)
    web, mont, pre = arg.get('--web'), arg.get('--montages'), arg.get('--prefixe', '')
    if mont:
        os.makedirs(mont, exist_ok=True)
    rows = []
    for n in sorted(os.listdir(apres)):
        # Captures Unreal : <pose>-unreal.png (poses) ou jeu-*.png (partie réelle, -StridesShots=cso-jeu, sans web).
        if not (n.endswith('-unreal.png') or (n.startswith('jeu-') and n.endswith('.png'))) or not n.startswith(pre):
            continue
        a, b = os.path.join(avant, n), os.path.join(apres, n)
        if not os.path.exists(a):
            rows.append({'capture': n, 'avant': None})
            continue
        w = os.path.join(web, n.replace('-unreal.png', '-web.png')) if web and n.endswith('-unreal.png') else None
        w = w if w and os.path.exists(w) else None
        p = psnr(a, b)
        row = {'capture': n, 'psnr_avant_apres_db': None if p is None else (p if p != float('inf') else 'inf'), 'web': bool(w)}
        if mont:
            out = os.path.join(mont, n.replace('-unreal.png', '.png') if n.endswith('-unreal.png') else n.replace('.png', '-avant-apres.png'))
            ins = [a, b] + ([w] if w else [])
            cmd = ['ffmpeg', '-loglevel', 'error', '-y']
            for i in ins:
                cmd += ['-i', i]
            # Hauteurs égales exigées par hstack : chaque image ramenée à la hauteur de la capture avant.
            filt = ';'.join(f'[{k}]scale=-2:ih[s{k}]' for k in range(len(ins))) + ';' + ''.join(f'[s{k}]' for k in range(len(ins))) + f'hstack=inputs={len(ins)}'
            row['montage_code'] = subprocess.run(cmd + ['-filter_complex', filt, out]).returncode
        rows.append(row)
    for r in rows:
        print(f"{r['capture']:52s} PSNR avant→après {r.get('psnr_avant_apres_db')} dB{'' if r.get('web') else ' (sans web)'}")
    if arg.get('--json'):
        with open(arg['--json'], 'w') as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)
            f.write('\n')


if __name__ == '__main__':
    main()
