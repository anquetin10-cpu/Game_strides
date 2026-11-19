#!/usr/bin/env python3
"""Montage côte à côte des captures jumelles du banc de parité (web à gauche, Unreal à droite).

Lit unreal/docs/parite/<système>/poses.json (écrit par scripts/unreal/export-cso-runs.mjs --shots) ; pour chaque pose,
vérifie que la capture web (<pose>-web.png, Playwright) et la capture Unreal (<pose>-unreal.png, -StridesShots=cso) ont
exactement la taille du viewport de la pose (sips -g pixelWidth -g pixelHeight), puis les assemble avec ffmpeg (hstack ;
Pillow n'est pas installé) dans <pose>.png. Code de sortie 1 au premier écart (fichier absent, taille fausse, ffmpeg).
Usage : python3 scripts/unreal/parite-montage.py [unreal/docs/parite/cso]
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def size(path):
    out = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path], capture_output=True, text=True, check=True).stdout
    w = re.search(r'pixelWidth: (\d+)', out)
    h = re.search(r'pixelHeight: (\d+)', out)
    return (int(w.group(1)), int(h.group(1))) if w and h else None


def main():
    folder = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else 'unreal/docs/parite/cso')
    with open(os.path.join(folder, 'poses.json'), encoding='utf-8') as f:
        doc = json.load(f)
    ok = True
    for pose in doc['poses']:
        vw, vh = pose['viewport']['w'], pose['viewport']['h']
        files = {k: os.path.join(ROOT, pose[k]) for k in ('web', 'unreal')}
        for k, p in files.items():
            if not os.path.exists(p):
                print(f'{pose["name"]} : capture {k} absente ({os.path.relpath(p, ROOT)})')
                ok = False
                continue
            s = size(p)
            print(f'{pose["name"]} : {k} {s[0]} x {s[1]} px ({os.path.relpath(p, ROOT)})')
            if s != (vw, vh):
                print(f'  attendu {vw} x {vh} px')
                ok = False
        if not ok:
            continue
        out = os.path.join(folder, f'{pose["name"]}.png')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', files['web'], '-i', files['unreal'],
                        '-filter_complex', 'hstack=inputs=2', '-frames:v', '1', out], check=True)
        s = size(out)
        print(f'{pose["name"]} : montage {s[0]} x {s[1]} px ({os.path.relpath(out, ROOT)})')
        ok = ok and s == (2 * vw, vh)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
