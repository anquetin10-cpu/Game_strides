#!/usr/bin/env python3
"""Coût de la cavalière montée par les règles (essai de monte, voie A, étape 7) : passes du mode -StridesShots=perf et
résumé.

Deux usages.
- Mesure (option --mesurer) : lance le jeu (rendu GPU réel, jamais -nullrhi) pour chaque passe, en alternant les
  configurations « actuel » (jeu par défaut) et « regles » (-StridesRider=regles), --passes=N passes chacune (3 par
  défaut), chaque passe dans <sortie>/<config>-<n>/ (perf-unreal.json, perf-arret.png, perf-galop.png, journal). Avant
  chaque passe : session graphique ouverte (« who » : console), économiseur d'écran arrêté (pgrep -x ScreenSaverEngine),
  aucune autre instance d'UnrealEditor, écran réveillé (caffeinate -u) ; pendant la passe : caffeinate -d -i.
  --apercu-mobile : en plus, une passe « actuel » avec -FeatureLevelES31 (aperçu du rendu mobile sur Mac), notée à part.
  --libre : en plus, les mêmes passes synchronisation verticale coupée (-ExecCmds="r.VSync 0, t.MaxFPS 0"), dossiers
  <config>-libre-<n> : avec la synchronisation à 60 Hz, le temps du fil de rendu inclut l'attente de l'écran (constaté).
  Groupes du résumé : nom du dossier de la passe sans son numéro (actuel, regles, actuel-libre, …).
- Résumé (toujours) : lit les perf-unreal.json des passes (dossiers donnés, ou ceux de --sortie), recalcule médiane et
  95e centile depuis les valeurs brutes avec statistics.quantiles(method='inclusive') (implantation indépendante de
  strides::perf, qui a écrit le résumé du fichier) et les compare ; dispersion des médianes entre passes
  ((max − min) / min) ; Δ temps du jeu « regles » − « actuel » (moyenne des médianes des passes). --ecrire : copie les
  perf-unreal.json dans unreal/docs/parite/monte/perf/ et remplace le bloc généré de unreal/docs/parite/monte/cout.md.

Critères du plan (plan-essai.md, étape 7) : dispersion des médianes ≤ 5 % (temps du jeu, du rendu et du GPU) ;
Δ temps du jeu ≤ 0,3 ms.

Usage (DEVELOPER_DIR réglé sur Xcode) :
  python3 scripts/unreal/perf-summary.py --mesurer --sortie=<dossier> [--passes=3] [--apercu-mobile] [--ecrire]
  python3 scripts/unreal/perf-summary.py --mesurer --sellerie --sortie=<dossier> [--passes=3]   (étape S1 : regles contre
    regles-sans-sellerie, -StridesTack=aucune)
  python3 scripts/unreal/perf-summary.py <dossier ou perf-unreal.json>… [--ecrire]
Code 1 : fichier incomplet ou résumé du jeu différent du recalcul ; code 2 : précondition de mesure non remplie ;
code 0 sinon (les critères sont rapportés, pas changés en code de sortie).
"""
import glob
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import time

repo = os.path.realpath(os.path.join(os.path.dirname(__file__), '../..'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
uproject = os.path.join(repo, 'unreal/StridesGrandTour/StridesGrandTour.uproject')
UE_REAL = os.path.realpath(os.environ.get('UE', '/Users/Shared/Epic Games/UE_5.8'))
EDITOR = os.path.join(UE_REAL, 'Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor')
DOC = os.path.join(repo, 'unreal/docs/parite/monte/cout.md')
PERF_DIR = os.path.join(repo, 'unreal/docs/parite/monte/perf')
BEGIN, END = '<!-- perf-summary:debut (écrit par scripts/unreal/perf-summary.py, ne pas modifier à la main) -->', '<!-- perf-summary:fin -->'
SERIES = ['gameMs', 'renderMs', 'gpuMs', 'frameMs']
SPREAD_MAX, DELTA_MAX = 0.05, 0.3


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def preconditions():
    who = sh(['who']).stdout
    if 'console' not in who:
        return 'aucune session graphique ouverte (who : pas de console)'
    if sh(['pgrep', '-x', 'ScreenSaverEngine']).returncode == 0:
        return 'économiseur d’écran actif (ScreenSaverEngine)'
    if sh(['pgrep', '-f', 'UnrealEditor.app/Contents/MacOS/UnrealEditor ']).returncode == 0 or sh(['pgrep', '-x', 'UnrealEditor']).returncode == 0:
        return 'une instance d’UnrealEditor tourne déjà'
    return ''


def run_pass(out, name, extra):
    d = os.path.join(out, name)
    os.makedirs(d, exist_ok=True)
    why = preconditions()
    if why:
        print(f'PAUSE {name} : {why}')
        sys.exit(2)
    sh(['caffeinate', '-u', '-t', '2'])  # écran réveillé
    cmd = ['caffeinate', '-d', '-i', EDITOR, uproject, '-game', '-windowed', '-ResX=844', '-ResY=390', '-nosplash',
           '-StridesShots=perf', f'-StridesShotsDir={d}', '-trace=none', '-log', f'-abslog={os.path.join(d, "jeu.log")}'] + extra
    t0 = time.time()
    with open(os.path.join(d, 'commande.txt'), 'w') as f:
        f.write(' '.join(cmd) + '\n')
    r = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = os.path.exists(os.path.join(d, 'perf-unreal.json'))
    print(f'{name} : code {r.returncode}, {time.time() - t0:.0f} s, perf-unreal.json {"écrit" if ok else "ABSENT"}')
    return d


def q(values):
    """Médiane et 95e centile, définition type 7 (statistics.quantiles, méthode inclusive)."""
    if not values:
        return 0.0, 0.0
    if len(values) == 1:
        return values[0], values[0]
    cuts = statistics.quantiles(values, n=100, method='inclusive')
    return statistics.median(values), cuts[94]


def load(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            found = sorted(glob.glob(os.path.join(p, '**/perf-unreal.json'), recursive=True))
            files += found or sorted(f for f in glob.glob(os.path.join(p, '*.json')) if os.path.basename(f) != 'resume.json')
        else:
            files.append(p)
    runs, bad = [], []
    for f in files:
        doc = json.load(open(f))
        for ph in doc['phases']:
            for k, s in ph['series'].items():
                med, p95 = q(s['values'])
                if s['n'] != len(s['values']) or abs(med - s['median']) > 1e-9 * max(1, abs(med)) or abs(p95 - s['p95']) > 1e-9 * max(1, abs(p95)):
                    bad.append(f'{f} {ph["name"]} {k} : jeu {s["median"]}/{s["p95"]}, recalcul {med}/{p95}')
            if not ph.get('complete'):
                bad.append(f'{f} {ph["name"]} : phase incomplète ({ph["series"]["gameMs"]["n"]} images)')
        runs.append((f, doc))
    return runs, bad


def pass_name(f):
    """Nom de la passe : dossier de <passe>/perf-unreal.json, ou nom du fichier versionné perf/<passe>.json."""
    base = os.path.basename(f)
    return os.path.basename(os.path.dirname(os.path.abspath(f))) if base == 'perf-unreal.json' else base[:-5]


def fmt(x, d=3):
    return f'{x:.{d}f}'.replace('.', ',')


def summarize(runs):
    groups = {}
    for f, doc in runs:
        key = re.sub(r'-\d+$', '', pass_name(f))
        groups.setdefault(key, []).append((f, doc))
    lines, res = [], {'configs': {}, 'criteres': {}}
    phases = ['arret', 'galop']
    for key, lst in groups.items():
        cfg = res['configs'][key] = {'passes': [os.path.relpath(f, repo) if f.startswith(repo) else f for f, _ in lst], 'phases': {}}
        for pn in phases:
            phs = [next((p for p in d['phases'] if p['name'] == pn), None) for _, d in lst]
            phs = [p for p in phs if p]
            if not phs:
                continue
            e = cfg['phases'][pn] = {}
            for k in SERIES + ['rigMs', 'tackMs', 'strapsMs']:
                meds = [p['series'][k]['median'] for p in phs if p['series'].get(k, {'n': 0})['n']]
                p95s = [p['series'][k]['p95'] for p in phs if p['series'].get(k, {'n': 0})['n']]
                if not meds:
                    continue
                spread = (max(meds) - min(meds)) / min(meds) if len(meds) > 1 and min(meds) > 0 else (0.0 if len(meds) < 2 else -1)
                e[k] = {'medians': meds, 'p95s': p95s, 'mean_median': sum(meds) / len(meds), 'mean_p95': sum(p95s) / len(p95s), 'spread': spread}
            e['usedMB'] = max(statistics.median(p['series']['usedMB']['values']) for p in phs)
            e['peakMB'] = max(p['series']['peakMB']['max'] for p in phs)
            e['bones'] = sorted({p['bones'] for p in phs})
            e['bodyMesh'] = sorted({p['bodyMesh'] for p in phs})
            e['lod'] = sorted({int(v) for p in phs for v in p['series']['lod']['values']})
            e['courseCamera'] = [p['courseCameraFrames'] for p in phs]
            e['jumping'] = [p['jumpingFrames'] for p in phs]
            e['gallop'] = [p['gallopFrames'] for p in phs]
            e['speed'] = [p['series']['speed']['median'] for p in phs]
            e['frames'] = [p['series']['gameMs']['n'] for p in phs]
            e['viewport'] = sorted({tuple(d['viewport']) for _, d in lst})
            e['rhi'] = sorted({d['rhi'] + ' ' + d['featureLevel'] for _, d in lst})
            e['rulesActive'] = [d['rulesActive'] for _, d in lst]
    # Tableau
    lines.append('| Configuration | Phase | Passes | Jeu (ms) méd. [p95] | Rendu (ms) méd. [p95] | GPU (ms) méd. [p95] | Image (ms) méd. | Dispersion des médianes jeu / rendu / GPU | Règle + sellerie (+ sellerie affichée, S1) (ms) méd. | Mémoire résidente (Mo) méd. / pic | Os du corps, LOD | Images : caméra de concours / au galop / en saut |')
    lines.append('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for key, cfg in res['configs'].items():
        for pn, e in cfg['phases'].items():
            def cell(k):
                return f'{fmt(e[k]["mean_median"])} [{fmt(e[k]["mean_p95"])}]' if k in e else '—'
            sp = ' / '.join((fmt(100 * e[k]['spread'], 1) + ' %') if k in e else '—' for k in ['gameMs', 'renderMs', 'gpuMs'])
            rule = fmt(e['rigMs']['mean_median'] + e.get('tackMs', {'mean_median': 0})['mean_median'] + e.get('strapsMs', {'mean_median': 0})['mean_median'], 4) if 'rigMs' in e else '—'
            lines.append(f'| {key} | {pn} | {len(e["frames"])} × {e["frames"][0]} | {cell("gameMs")} | {cell("renderMs")} | {cell("gpuMs")} | {fmt(e["frameMs"]["mean_median"], 2)} | {sp} | {rule} | {e["usedMB"]:.0f} / {e["peakMB"]:.0f} | {", ".join(map(str, e["bones"]))}, LOD {", ".join(map(str, e["lod"]))} | {"/".join(map(str, e["courseCamera"]))} ; {"/".join(map(str, e["gallop"]))} ; {"/".join(map(str, e["jumping"]))} |')
    # Critères
    crit = res['criteres']
    for key, cfg in res['configs'].items():
        for pn, e in cfg['phases'].items():
            for k in ['gameMs', 'renderMs', 'gpuMs']:
                if k in e and len(e[k]['medians']) > 1:
                    crit[f'dispersion {key} {pn} {k}'] = {'valeur': e[k]['spread'], 'seuil': SPREAD_MAX, 'tenu': 0 <= e[k]['spread'] <= SPREAD_MAX}
    # Étape S1 : Δ temps du jeu, règle avec sellerie affichée − règle sans (information, même seuil que la règle seule).
    a, r = res['configs'].get('regles-sans-sellerie'), res['configs'].get('regles')
    if a and r:
        for pn in phases:
            if pn in a['phases'] and pn in r['phases']:
                d = r['phases'][pn]['gameMs']['mean_median'] - a['phases'][pn]['gameMs']['mean_median']
                crit[f'delta jeu sellerie (regles - regles-sans-sellerie) {pn}'] = {'valeur': d, 'seuil': DELTA_MAX, 'tenu': d <= DELTA_MAX}
                for k in ['renderMs', 'gpuMs', 'frameMs']:
                    res.setdefault('deltas_sellerie', {})[f'{pn} {k}'] = r['phases'][pn][k]['mean_median'] - a['phases'][pn][k]['mean_median']
    for suf in ['', '-libre']:
        a, r = res['configs'].get('actuel' + suf), res['configs'].get('regles' + suf)
        if not (a and r):
            continue
        for pn in phases:
            if pn in a['phases'] and pn in r['phases']:
                d = r['phases'][pn]['gameMs']['mean_median'] - a['phases'][pn]['gameMs']['mean_median']
                crit[f'delta jeu regles{suf} - actuel{suf} {pn}'] = {'valeur': d, 'seuil': DELTA_MAX, 'tenu': d <= DELTA_MAX}
                for k in ['renderMs', 'gpuMs', 'frameMs']:
                    res.setdefault('deltas', {})[f'{suf.strip("-") or "vsync"} {pn} {k}'] = r['phases'][pn][k]['mean_median'] - a['phases'][pn][k]['mean_median']
    lines.append('')
    lines.append('Critères du plan (étape 7) :')
    lines.append('')
    for k, c in crit.items():
        unit = ' ms' if k.startswith('delta') else ''
        v = fmt(c['valeur'], 3) + unit if k.startswith('delta') else fmt(100 * c['valeur'], 1) + ' %'
        s = fmt(c['seuil'], 1) + unit if k.startswith('delta') else fmt(100 * c['seuil'], 0) + ' %'
        lines.append(f'- {k} : {v} (seuil {s}) : {"tenu" if c["tenu"] else "NON TENU"}')
    for k, v in res.get('deltas', {}).items():
        lines.append(f'- information, Δ regles − actuel {k} : {fmt(v)} ms')
    for k, v in res.get('deltas_sellerie', {}).items():
        lines.append(f'- information, Δ sellerie affichée (regles − regles-sans-sellerie) {k} : {fmt(v)} ms')
    return lines, res


def main():
    out = os.path.abspath(opt['--sortie']) if '--sortie' in opt else None
    if opt.get('--mesurer') and not opt.get('--sellerie'):
        if not out:
            print('--sortie=<dossier> exigé')
            return 2
        n = int(opt.get('--passes', 3))
        for i in range(1, n + 1):
            run_pass(out, f'actuel-{i}', [])
            run_pass(out, f'regles-{i}', ['-StridesRider=regles'])
        if opt.get('--libre'):
            libre = ['-ExecCmds=r.VSync 0, t.MaxFPS 0']
            for i in range(1, n + 1):
                run_pass(out, f'actuel-libre-{i}', libre)
                run_pass(out, f'regles-libre-{i}', libre + ['-StridesRider=regles'])
        if opt.get('--apercu-mobile'):
            run_pass(out, 'actuel-mobile-1', ['-FeatureLevelES31', '-StridesPerfSansCapture'])
    elif opt.get('--mesurer') and opt.get('--sellerie'):
        # Étape S1 : coût de la sellerie complète affichée, règle avec et sans sellerie (-StridesTack=aucune), passes alternées.
        if not out:
            print('--sortie=<dossier> exigé')
            return 2
        n = int(opt.get('--passes', 3))
        for i in range(1, n + 1):
            run_pass(out, f'regles-{i}', ['-StridesRider=regles'])
            run_pass(out, f'regles-sans-sellerie-{i}', ['-StridesRider=regles', '-StridesTack=aucune'])
    paths = args or ([out] if out else [])
    if not paths:
        print(__doc__)
        return 2
    runs, bad = load(paths)
    for b in bad:
        print('ÉCART', b)
    lines, res = summarize(runs)
    print('\n'.join(lines))
    if opt.get('--ecrire') and not bad:
        os.makedirs(PERF_DIR, exist_ok=True)
        for f, doc in runs:
            name = pass_name(f) + '.json'
            shutil.copyfile(f, os.path.join(PERF_DIR, name))
        res['configs'] = {k: dict(v, passes=[pass_name(p) + '.json' for p in v['passes']]) for k, v in res['configs'].items()}
        json.dump(res, open(os.path.join(PERF_DIR, 'resume.json'), 'w'), ensure_ascii=False, indent=1)
        text = open(DOC).read()
        i, j = text.index(BEGIN), text.index(END)
        open(DOC, 'w').write(text[:i + len(BEGIN)] + '\n\n' + '\n'.join(lines) + '\n\n' + text[j:])
        print(f'écrit : {os.path.relpath(DOC, repo)}, {os.path.relpath(PERF_DIR, repo)}/')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
