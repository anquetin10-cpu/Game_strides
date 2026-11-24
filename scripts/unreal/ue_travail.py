"""Chemins et lancements communs aux scripts de mutations (après la migration du 23/11/2026).

Le projet et le moteur sont sur le disque externe ; les chemins habituels sont des liens symboliques. On n'utilise que des
chemins RÉELS :
- dépôt : realpath du dossier de ce script (lancé par le lien ~/.openclaw/workspace/projects/grand-tour-unreal, l'éditeur
  calculerait sinon un chemin relatif du projet faux) ;
- moteur : variable UE si donnée, sinon /Volumes/Stockage-Qualification/Mac-Mini-Migration/Applications/UE_5.8, puis realpath
  (par le lien /Users/Shared/Epic Games/UE_5.8, l'éditeur ne trouve pas le projet) ;
- sorties (copies mutées, journaux, rapports) : sous <dépôt>/.ue-cache/travail, exclu de git par .git/info/exclude
  (consigne de Julien : rien de lourd ailleurs, ni /private/tmp ni le disque interne).
L'éditeur est lancé sans rendu, journal dans un fichier (-abslog) et -trace=none : le démon UnrealTraceServer hériterait
sinon d'un tube de sortie et le garderait ouvert (constaté le 23/11/2026 : éditeur zombie, script bloqué).
"""
import json
import os
import re
import subprocess

REPO = os.path.realpath(os.path.join(os.path.dirname(os.path.realpath(__file__)), '../..'))
UE = os.path.realpath(os.environ.get('UE', '/Volumes/Stockage-Qualification/Mac-Mini-Migration/Applications/UE_5.8'))
UPROJECT = os.path.join(REPO, 'unreal/StridesGrandTour/StridesGrandTour.uproject')
TRAVAIL = os.path.join(REPO, '.ue-cache/travail')
BUILD_SH = os.path.join(UE, 'Engine/Build/BatchFiles/Mac/Build.sh')
EDITOR = os.path.join(UE, 'Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor')


def sortie(nom):
    """Dossier de travail par défaut d'un script : <dépôt>/.ue-cache/travail/<nom>."""
    return os.path.join(TRAVAIL, nom)


def ubt(journal=None):
    """Compile StridesGrandTourEditor ; rend (code, fin du journal). Journal complet dans `journal` s'il est donné."""
    env = dict(os.environ, DEVELOPER_DIR=os.environ.get('DEVELOPER_DIR', '/Applications/Xcode.app/Contents/Developer'))
    c = subprocess.run([BUILD_SH, 'StridesGrandTourEditor', 'Mac', 'Development', f'-project={UPROJECT}', '-WaitMutex'],
                       capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL)
    if journal:
        with open(journal, 'w') as f:
            f.write(c.stdout + c.stderr)
    return c.returncode, (c.stdout + c.stderr)[-1500:]


def editor_test(test, out, tag, extra=()):
    """Joue un test Automation dans l'éditeur sans rendu ; rend (état, erreurs, chemin du journal).

    Rapport dans <out>/auto-<tag>, journal dans <out>/editeur-<tag>.log, captures éventuelles dans <out>/shots."""
    slug = re.sub(r'[^a-z0-9]+', '-', tag.lower())[:40]
    rep = os.path.join(out, 'auto-' + slug)
    log = os.path.join(out, 'editeur-' + slug + '.log')
    c = subprocess.run([EDITOR, UPROJECT, f'-ExecCmds=Automation RunTests {test}; Quit', '-unattended', '-nullrhi', '-nosplash',
                        '-trace=none', f'-abslog={log}', f'-StridesShotsDir={os.path.join(out, "shots")}',
                        f'-ReportExportPath={rep}', *extra], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    try:
        d = json.load(open(os.path.join(rep, 'index.json'), encoding='utf-8-sig'))
        t = [x for x in d['tests'] if x['fullTestPath'] == test]
        if not t:
            return f'test absent du rapport (code {c.returncode})', [], log
        errs = [e['event']['message'] for e in t[0]['entries'] if e['event']['type'] == 'Error']
        return t[0]['state'], errs, log
    except Exception as ex:  # pas de rapport : éditeur en échec
        return f'sans rapport ({ex}; code {c.returncode})', [], log
