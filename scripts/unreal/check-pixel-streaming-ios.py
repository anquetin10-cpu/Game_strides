#!/usr/bin/env python3
"""Contrôle que Pixel Streaming n'entre pas dans la cible iOS (tranche T12, unreal/docs/parite/cso-ecarts.md §4).

Sans paquet ni compilation :
  1. .uproject : le plugin PixelStreaming2 n'est permis que sur Mac (PlatformAllowList == ["Mac"]) ;
  2. UnrealBuildTool -Mode=JsonExport de la cible de jeu StridesGrandTour pour IOS et pour Mac (Development) : liste des
     modules de chaque cible ; aucun module PixelStreaming* pour IOS, au moins un pour Mac (témoin : le plugin est bien
     vu par UBT là où il est permis).
Option --binary=<exécutable iOS lié> : aucune chaîne « pixelstreaming » (casse ignorée) dans le binaire Mach-O.
Sorties JSON de UBT dans .tmp/ubt-export/ (hors dépôt). Code 0 si tout est conforme, 1 sinon.

Usage : DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer python3 scripts/unreal/check-pixel-streaming-ios.py \\
          [--binary=unreal/StridesGrandTour/Binaries/IOS/StridesGrandTour-IOS-Shipping]
"""
import json, os, subprocess, sys
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
proj = os.path.join(repo, 'unreal/StridesGrandTour/StridesGrandTour.uproject')
ue = os.environ.get('UE', '/Users/Shared/Epic Games/UE_5.8')
out = os.path.join(repo, '.tmp/ubt-export')
os.makedirs(out, exist_ok=True)
ok = True
u = json.load(open(proj, encoding='utf-8-sig'))
ps = [p for p in u.get('Plugins', []) if p.get('Name', '').startswith('PixelStreaming')]
for p in ps:
    allow = p.get('PlatformAllowList')
    good = p.get('Enabled') is True and allow == ['Mac'] and 'IOS' not in (allow or [])
    print(f".uproject : {p['Name']} activé {p.get('Enabled')}, plateformes permises {allow} : {'conforme' if good else 'NON CONFORME'}")
    ok &= good
if not ps:
    print('.uproject : aucun plugin PixelStreaming déclaré')
counts = {}
for plat in ('IOS', 'Mac'):
    dest = os.path.join(out, f'StridesGrandTour-{plat}.json')
    r = subprocess.run([os.path.join(ue, 'Engine/Build/BatchFiles/RunUBT.sh'), 'StridesGrandTour', plat, 'Development', f'-project={proj}', '-Mode=JsonExport', f'-OutputFile={dest}'],
                       capture_output=True, text=True)
    if r.returncode:
        print(f'UBT JsonExport {plat} : échec (code {r.returncode})\n{r.stdout[-800:]}')
        sys.exit(1)
    d = json.load(open(dest, encoding='utf-8-sig'))
    mods = list(d['Modules'].keys()) if isinstance(d['Modules'], dict) else [m['Name'] for m in d['Modules']]
    pix = sorted(m for m in mods if 'pixelstreaming' in m.lower())
    counts[plat] = pix
    print(f'UBT JsonExport {plat} Development : {len(mods)} modules, modules PixelStreaming : {pix if pix else "aucun"}')
ok &= not counts['IOS'] and bool(counts['Mac'])
for a in sys.argv[1:]:
    if a.startswith('--binary='):
        b = os.path.join(repo, a.split('=', 1)[1]) if not os.path.isabs(a.split('=', 1)[1]) else a.split('=', 1)[1]
        data = open(b, 'rb').read()
        n = data.lower().count(b'pixelstreaming')
        print(f'binaire {os.path.relpath(b, repo)} ({len(data)} octets) : {n} occurrence(s) de « pixelstreaming »')
        ok &= n == 0
print('CONFORME : Pixel Streaming absent de la cible iOS' if ok else 'NON CONFORME')
sys.exit(0 if ok else 1)
