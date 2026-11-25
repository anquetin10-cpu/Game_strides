#!/usr/bin/env python3
"""Ligne de base et portes hors moteur de l'essai de monte, voie A (unreal/docs/parite/monte/plan-essai.md, §3 et étape 1).

Portes passées ici, sans Unreal Build Tool ni UnrealEditor :
  G1 cœur       cmake + ctest du cœur StridesCore dans build/core-monte (compilation complète, avertissements comptés)
  G5 captures   scripts/unreal/parite-montage.py sur unreal/docs/parite/cso, puis empreintes sha256 des PNG versionnés
  G6 inventaire scripts/unreal/build-parite.py (code 0) ; PARITE.md régénéré identique à la copie de travail
  G7 web intact git diff --quiet HEAD -- src public tests ; vitest (riderPosture, puis toute la suite unitaire)
G2 (compilation UBT), G3 (tests moteur) et G4 (mutations) ne sont pas lancées par ce script.

Usage, depuis n'importe où :
  python3 scripts/unreal/monte-base.py             relève la base et écrit unreal/docs/parite/monte/base.json
  python3 scripts/unreal/monte-base.py --verifier  repasse les portes et compare à base.json (code 1 si régression,
                                                   code 2 si moins de 8 Gio libres : condition d'arrêt S3 du plan)
  python3 scripts/unreal/monte-base.py --maj-g5=<motif>  captures du CSO refaites volontairement : montages refaits,
                                                   G5 de base.json remplacé (motif et ancienne empreinte gardés)
Le cache de Vite va dans .tmp/monte/vite-cache : node_modules peut être un lien vers un autre dépôt, qu'on ne modifie pas.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = os.path.join(ROOT, 'unreal', 'docs', 'parite', 'monte', 'base.json')
BUILD = os.path.join(ROOT, 'build', 'core-monte')
TMP = os.path.join(ROOT, '.tmp', 'monte')
CSO = os.path.join(ROOT, 'unreal', 'docs', 'parite', 'cso')
UE = os.environ.get('UE', '/Users/Shared/Epic Games/UE_5.8')
ENV = dict(os.environ, DEVELOPER_DIR=os.environ.get('DEVELOPER_DIR', '/Applications/Xcode.app/Contents/Developer'))
S3_GIO = 8


def run(cmd, log=None, env=ENV, **kw):
    r = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True, **kw)
    out = r.stdout + r.stderr
    if log:
        with open(os.path.join(TMP, log), 'w') as f:
            f.write(out)
    return r.returncode, out


def first_line(cmd):
    try:
        return run(cmd)[1].strip().splitlines()[0]
    except (OSError, IndexError):
        return None


def versions():
    v = {}
    try:
        with open(os.path.join(UE, 'Engine', 'Build', 'Build.version')) as f:
            b = json.load(f)
        v['unreal'] = f"{b['MajorVersion']}.{b['MinorVersion']}.{b['PatchVersion']}-{b['Changelist']} ({b['BranchName']})"
    except (OSError, ValueError, KeyError):
        v['unreal'] = None
    x = run(['xcodebuild', '-version'])[1].split()
    v['xcode'] = f'{x[1]} ({x[4]})' if len(x) >= 5 and x[0] == 'Xcode' else None
    v['clang'] = first_line(['xcrun', 'clang++', '--version'])
    v['cmake'] = first_line(['cmake', '--version'])
    v['node'] = first_line(['node', '--version'])
    v['python'] = sys.version.split()[0]
    vit = re.search(r'"version":\s*"([^"]+)"', open(os.path.join(ROOT, 'node_modules', 'vitest', 'package.json')).read())
    v['vitest'] = vit.group(1) if vit else None
    v['macos'] = f"{first_line(['sw_vers', '-productVersion'])} ({first_line(['sw_vers', '-buildVersion'])})"
    return v


def machine():
    return {'modele': first_line(['sysctl', '-n', 'hw.model']), 'memoire_octets': int(first_line(['sysctl', '-n', 'hw.memsize'])),
            'coeurs': int(first_line(['sysctl', '-n', 'hw.ncpu']))}


def disque():
    st = os.statvfs(os.path.expanduser('~'))
    libre, total = st.f_bavail * st.f_frsize, st.f_blocks * st.f_frsize
    return {'mesure': 'statvfs du dossier personnel (même volume que df -h ~)', 'libre_octets': libre, 'total_octets': total,
            'libre_gio': round(libre / 2**30, 1)}


def builds():
    """Tailles des paquets Unreal locaux (ignorés par git) du dépôt principal, lu seulement (du -sk)."""
    common = run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'])[1].strip()
    d = os.path.join(os.path.dirname(common), 'unreal', 'StridesGrandTour', 'Builds')
    if not os.path.isdir(d):
        return {}
    res = {}
    for n in sorted(os.listdir(d)):
        p = os.path.join(d, n)
        if os.path.isdir(p):
            res[f'unreal/StridesGrandTour/Builds/{n}'] = int(run(['du', '-sk', p])[1].split()[0]) * 1024
    return res


def g1():
    code, out = run(['cmake', '-S', 'unreal/core', '-B', BUILD], 'g1-cmake.log')
    if code:
        return {'ok': False, 'erreur': 'cmake (configuration)'}
    code, out = run(['cmake', '--build', BUILD, '--clean-first', '-j', '4'], 'g1-build.log')
    warn = len(re.findall(r'warning:', out))
    if code:
        return {'ok': False, 'erreur': 'compilation', 'avertissements': warn}
    t0 = datetime.datetime.now()
    code, out = run(['ctest', '--test-dir', BUILD, '-V'], 'g1-ctest.log')
    # Un bilan par exécutable de test (oracles du cœur ; monte depuis l'étape 4) : additionnés.
    ms = re.findall(r'(\d+) vérifications, (\d+) échecs', out)
    t = re.search(r'(\d+) tests failed out of (\d+)', out)
    nv, ne = sum(int(a) for a, _ in ms), sum(int(b) for _, b in ms)
    return {'ok': code == 0 and bool(ms) and ne == 0, 'commande': 'cmake -S unreal/core -B build/core-monte && '
            'cmake --build build/core-monte --clean-first && ctest --test-dir build/core-monte -V',
            'verifications': nv if ms else None, 'echecs': ne if ms else None,
            'verifications_par_test': [int(a) for a, _ in ms],
            'tests_ctest': int(t.group(2)) if t else None, 'avertissements_compilation': warn,
            'duree_ctest_s': round((datetime.datetime.now() - t0).total_seconds())}


def g5():
    code, _ = run([sys.executable, 'scripts/unreal/parite-montage.py', 'unreal/docs/parite/cso'], 'g5-montage.log')
    changed = run(['git', 'status', '--porcelain', '--', 'unreal/docs/parite/cso'])[1].strip()
    files = {}
    for n in sorted(os.listdir(CSO)):
        if n.endswith('.png'):
            with open(os.path.join(CSO, n), 'rb') as f:
                files[n] = hashlib.sha256(f.read()).hexdigest()
    total = hashlib.sha256(''.join(f'{n} {h}\n' for n, h in files.items()).encode()).hexdigest()
    return {'ok': code == 0 and not changed, 'commande': 'python3 scripts/unreal/parite-montage.py unreal/docs/parite/cso',
            'montage_code': code, 'fichiers_modifies_par_le_montage': changed.splitlines(), 'png': len(files),
            'empreinte_globale_sha256': total, 'empreintes_sha256': files}


def g6():
    code, out = run([sys.executable, 'scripts/unreal/build-parite.py'], 'g6-parite.log')
    m = re.search(r'(\d+) fonctions, (\d+) identiques prouvées, (\d+) partielles, (\d+) absentes ; couverture (\d+)/(\d+)', out)
    stale = run(['git', 'status', '--porcelain', '--', 'unreal/docs/PARITE.md'])[1].strip()
    res = {'ok': code == 0 and bool(m), 'commande': 'python3 scripts/unreal/build-parite.py', 'code': code,
           'parite_md_regenere_different': bool(stale)}
    if m:
        res.update(fonctions=int(m.group(1)), identiques_prouvees=int(m.group(2)), partielles=int(m.group(3)),
                   absentes=int(m.group(4)), couverture_js=f'{m.group(5)}/{m.group(6)}')
    return res


def vitest(args, log):
    cfg = os.path.join(TMP, 'vitest.monte.config.mjs')
    with open(cfg, 'w') as f:
        f.write("// Écrit par scripts/unreal/monte-base.py : configuration du dépôt, cache de Vite dans .tmp/monte.\n"
                "import { mergeConfig } from 'vitest/config';\nimport base from '../../vitest.config.js';\n"
                "export default mergeConfig(base, { cacheDir: '.tmp/monte/vite-cache' });\n")
    code, out = run(['npx', 'vitest', 'run', '--config', cfg, *args], log)
    out = re.sub(r'\x1b\[[0-9;]*m', '', out)
    files = re.search(r'Test Files\s+(\d+) passed \((\d+)\)', out)
    tests = re.search(r'Tests\s+(\d+) passed \((\d+)\)', out)
    return {'code': code, 'fichiers': int(files.group(2)) if files else None, 'tests': int(tests.group(2)) if tests else None,
            'tests_reussis': int(tests.group(1)) if tests else None}


def g7():
    diff = subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', 'src', 'public', 'tests'], cwd=ROOT).returncode
    untracked = run(['git', 'status', '--porcelain', '--untracked-files=all', '--', 'src', 'public', 'tests'])[1].strip()
    rider = vitest(['tests/unit/riderPosture.test.js'], 'g7-rider.log')
    unit = vitest([], 'g7-unit.log')
    ok = diff == 0 and not untracked and rider['code'] == 0 and unit['code'] == 0 and rider['tests'] == rider['tests_reussis']
    return {'ok': ok, 'commande': 'git diff --quiet HEAD -- src public tests ; npx vitest run tests/unit/riderPosture.test.js ; '
            'npx vitest run', 'git_diff_code': diff, 'fichiers_non_suivis': untracked.splitlines(),
            'riderPosture': rider, 'suite_unitaire': unit}


def portes():
    return {'G1': g1(), 'G5': g5(), 'G6': g6(), 'G7': g7()}


def maj_g5(motif):
    """Captures du CSO refaites volontairement (étape S2 b : monte du web par défaut) : G5 de base.json remplacé par les
    empreintes actuelles (montages refaits par parite-montage.py), ancienne empreinte globale et motif gardés ; le reste de
    la base n'est pas touché."""
    with open(BASE) as f:
        base = json.load(f)
    old = base['portes']['G5']
    new = g5()
    new['ok'] = new['montage_code'] == 0
    new['maj'] = {'date': datetime.datetime.now(ZoneInfo('Europe/Paris')).isoformat(timespec='seconds'), 'motif': motif,
                  'empreinte_globale_precedente': old.get('empreinte_globale_sha256'),
                  'png_changes': sorted(n for n, h in new['empreintes_sha256'].items() if old.get('empreintes_sha256', {}).get(n) != h)}
    base['portes']['G5'] = new
    with open(BASE, 'w') as f:
        json.dump(base, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f"G5 mis à jour : {new['png']} PNG, {len(new['maj']['png_changes'])} changés, empreinte {new['empreinte_globale_sha256'][:12]}")
    return 0 if new['ok'] else 1


def main():
    os.makedirs(TMP, exist_ok=True)
    if any(a.startswith('--maj-g5=') for a in sys.argv[1:]):
        sys.exit(maj_g5(next(a for a in sys.argv[1:] if a.startswith('--maj-g5='))[len('--maj-g5='):]))
    verifier = '--verifier' in sys.argv[1:]
    d = disque()
    if d['libre_gio'] < S3_GIO:
        print(f"S3 : {d['libre_gio']} Gio libres (< {S3_GIO}) : pause, aucune suppression, question à Julien.")
        sys.exit(2)
    p = portes()
    for k, v in p.items():
        print(f"{k} : {'vert' if v['ok'] else 'ROUGE'}")
    if not verifier:
        base = {'schema': 'strides.monte.base/1',
                'releve': datetime.datetime.now(ZoneInfo('Europe/Paris')).isoformat(timespec='seconds'),
                'commit': run(['git', 'rev-parse', 'HEAD'])[1].strip(),
                'branche': run(['git', 'branch', '--show-current'])[1].strip(),
                'versions': versions(), 'machine': machine(), 'disque': d, 'builds_depot_principal_octets': builds(),
                'portes': p,
                'non_lancees': {
                    'G2': 'compilation Unreal Build Tool : interdite dans cette phase (copie de travail isolée, chantier CSO en parallèle)',
                    'G3': 'tests moteur Automation RunTests Strides : UnrealEditor interdit dans cette phase',
                    'G4': 'mutations : aucun source CSO touché ; mutations-cso-controls.py exige UnrealEditor'}}
        os.makedirs(os.path.dirname(BASE), exist_ok=True)
        with open(BASE, 'w') as f:
            json.dump(base, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'base écrite : {os.path.relpath(BASE, ROOT)}')
        sys.exit(0 if all(v['ok'] for v in p.values()) else 1)
    with open(BASE) as f:
        b = json.load(f)['portes']
    bad = [f'{k} rouge' for k, v in p.items() if not v['ok']]
    if (p['G1'].get('verifications') or 0) < b['G1']['verifications']:
        bad.append(f"G1 : {p['G1'].get('verifications')} vérifications < base {b['G1']['verifications']}")
    if (p['G1'].get('avertissements_compilation') or 0) > b['G1']['avertissements_compilation']:
        bad.append(f"G1 : {p['G1'].get('avertissements_compilation')} avertissements > base {b['G1']['avertissements_compilation']}")
    if p['G5']['empreinte_globale_sha256'] != b['G5']['empreinte_globale_sha256']:
        diff = sorted(set(p['G5']['empreintes_sha256'].items()) ^ set(b['G5']['empreintes_sha256'].items()))
        bad.append('G5 : captures différentes de la base : ' + ', '.join(sorted({n for n, _ in diff})))
    if p['G6']['parite_md_regenere_different']:
        bad.append('G6 : PARITE.md régénéré diffère de la copie de travail (inventaire non répercuté)')
    for k in ('riderPosture', 'suite_unitaire'):
        if (p['G7'][k]['tests'] or 0) < b['G7'][k]['tests']:
            bad.append(f"G7 : {k} {p['G7'][k]['tests']} tests < base {b['G7'][k]['tests']}")
    print('portes conformes à la base' if not bad else 'RÉGRESSION : ' + ' ; '.join(bad))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
