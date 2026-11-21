#!/usr/bin/env python3
"""Génère unreal/docs/PARITE.md à partir de l'inventaire unreal/docs/parite/inventaire/*.json.

Une ligne d'inventaire = une fonction du jeu web (spécification) et son état dans le portage Unreal. On met à jour le
JSON (jamais PARITE.md à la main), puis on relance : python3 scripts/unreal/build-parite.py
Contrôles bloquants (code de sortie 1) : JSON invalide, champ manquant, état ou niveau inconnu, identifiant en double,
fichier JS de src/ couvert par aucune ligne, fichier JS cité qui n'existe pas.
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INV = os.path.join(ROOT, 'unreal', 'docs', 'parite', 'inventaire')
OUT = os.path.join(ROOT, 'unreal', 'docs', 'PARITE.md')
# Méta (référence, niveaux globaux) : unreal/docs/parite/etat.json, tenu à la main avec preuves.
META = os.path.join(ROOT, 'unreal', 'docs', 'parite', 'etat.json')

CHAMPS = ['id', 'domaine', 'fonction', 'js', 'unreal', 'etat', 'niveau', 'preuve', 'ecart', 'tranche']
ETATS = {'absent': 'absent', 'partiel': 'partiel', 'identique_prouve': '**identique prouvé**'}
NIVEAUX = {'aucun': '—', 'code_ecrit': 'code écrit', 'compile': 'compilé', 'teste': 'testé',
           'joue_ecran': 'joué à l\'écran'}
TRANCHES = {
    'a': 'a. Parcours CSO du Pôle (HUD, caméra, appel, barres, refus, chrono, résultat)',
    'b': 'b. Cavalière en selle et à pied',
    'c': 'c. Monde',
    'd': 'd. Jour et nuit, météo, énergie, rythme de vie',
    'e': 'e. Missions, histoire, téléphone, réputation, compétences, progression',
    'f': 'f. Véhicules et transport du cheval',
    'g': 'g. PNJ et foule',
    'h': 'h. Interface tactile, langues, sons',
    'socle': 'Socle (boucle, sauvegarde, entrées, outils)',
}


def cell(v):
    if isinstance(v, list):
        v = ', '.join(f'`{x}`' for x in v)
    return str(v).replace('|', '\\|').replace('\n', ' ').strip() or '—'


def main():
    erreurs, lignes, vus = [], [], set()
    fichiers = sorted(glob.glob(os.path.join(INV, '*.json')))
    if not fichiers:
        erreurs.append(f'aucun inventaire dans {INV}')
    for f in fichiers:
        try:
            data = json.load(open(f, encoding='utf-8'))
        except Exception as e:  # noqa: BLE001
            erreurs.append(f'{os.path.basename(f)} : JSON invalide ({e})')
            continue
        for i, r in enumerate(data):
            ref = f'{os.path.basename(f)}[{i}]'
            manque = [c for c in CHAMPS if c not in r]
            if manque:
                erreurs.append(f'{ref} : champs manquants {manque}')
                continue
            if r['etat'] not in ETATS:
                erreurs.append(f'{ref} : état inconnu {r["etat"]!r}')
            if r['niveau'] not in NIVEAUX:
                erreurs.append(f'{ref} : niveau inconnu {r["niveau"]!r}')
            if r['tranche'] not in TRANCHES:
                erreurs.append(f'{ref} : tranche inconnue {r["tranche"]!r}')
            if r['id'] in vus:
                erreurs.append(f'{ref} : identifiant en double {r["id"]!r}')
            vus.add(r['id'])
            for js in r['js']:
                if '*' not in js and not os.path.exists(os.path.join(ROOT, js)):
                    erreurs.append(f'{ref} : fichier cité introuvable {js}')
            r['_source'] = os.path.basename(f)
            lignes.append(r)

    # Couverture : chaque fichier JS de src/ apparaît dans au moins une ligne (motifs glob acceptés).
    tous = sorted(os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'src', '**', '*.js'), recursive=True))
    cites = set()
    for r in lignes:
        for js in r['js']:
            cites.update(os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, js), recursive=True))
    non_couverts = [p for p in tous if p not in cites]
    if non_couverts:
        erreurs.append(f'{len(non_couverts)} fichier(s) JS de src/ non couverts : ' + ', '.join(non_couverts))

    meta = json.load(open(META, encoding='utf-8')) if os.path.exists(META) else {}
    out = ['# Parité jeu web → Unreal', '',
           '> Fichier généré par `scripts/unreal/build-parite.py` depuis `unreal/docs/parite/inventaire/*.json` '
           'et `unreal/docs/parite/etat.json`. Ne pas éditer à la main : modifier le JSON puis relancer le script.', '']
    for bloc in meta.get('entete', []):
        out += [bloc, '']

    out += ['## Définitions', '',
            '- **absent** : aucun code Unreal ne fait cette fonction.',
            '- **partiel** : du code Unreal existe, mais il n\'est pas prouvé identique (écarts connus, valeurs recopiées, '
            'test écrit à la main sans oracle, provisoire, non vu à l\'écran).',
            '- **identique prouvé** : un oracle exporté du JS est comparé par un test C++ qui passe, ou une capture côte à '
            'côte web/Unreal (même lieu, même heure, même caméra) est rangée dans `unreal/docs/parite/<système>/`.',
            '- **Niveau** (partie Unreal, le plus haut prouvé) : code écrit → compilé → testé → joué à l\'écran. La scène, '
            'le package iOS et l\'appareil réel sont suivis globalement ci-dessous.', '']

    if meta.get('niveaux_globaux'):
        out += ['## Niveaux globaux du portage', '', '| Niveau | État | Preuve |', '|---|---|---|']
        out += [f'| {cell(n["niveau"])} | {cell(n["etat"])} | {cell(n["preuve"])} |' for n in meta['niveaux_globaux']]
        out.append('')

    out += ['## Synthèse par tranche', '', '| Tranche | Fonctions | Identique prouvé | Partiel | Absent |',
            '|---|---:|---:|---:|---:|']
    tot = {'n': 0, 'identique_prouve': 0, 'partiel': 0, 'absent': 0}
    for t, titre in TRANCHES.items():
        rs = [r for r in lignes if r.get('tranche') == t]
        if not rs:
            continue
        c = {e: sum(1 for r in rs if r.get('etat') == e) for e in ETATS}
        tot['n'] += len(rs)
        for e in ETATS:
            tot[e] += c[e]
        out.append(f'| {titre} | {len(rs)} | {c["identique_prouve"]} | {c["partiel"]} | {c["absent"]} |')
    out += [f'| **Total** | **{tot["n"]}** | **{tot["identique_prouve"]}** | **{tot["partiel"]}** | '
            f'**{tot["absent"]}** |', '',
            f'Couverture : {len(tous) - len(non_couverts)} / {len(tous)} fichiers JS de `src/` cités par au moins une ligne.',
            '']

    for t, titre in TRANCHES.items():
        rs = [r for r in lignes if r.get('tranche') == t]
        if not rs:
            continue
        out += [f'## {titre}', '', '| Fonction (jeu web) | Source JS | Unreal | État | Niveau | Preuve | Écart |',
                '|---|---|---|---|---|---|---|']
        ordre = {'identique_prouve': 0, 'partiel': 1, 'absent': 2}
        for r in sorted(rs, key=lambda r: (r['domaine'], ordre.get(r['etat'], 3), r['id'])):
            out.append(f'| {cell(r["fonction"])} <sub>`{r["id"]}`</sub> | {cell(r["js"])} | {cell(r["unreal"])} | '
                       f'{ETATS.get(r["etat"], r["etat"])} | {NIVEAUX.get(r["niveau"], r["niveau"])} | '
                       f'{cell(r["preuve"])} | {cell(r["ecart"])} |')
        out.append('')

    for bloc in meta.get('pied', []):
        out += [bloc, '']

    if erreurs:
        print('\n'.join('ERREUR ' + e for e in erreurs), file=sys.stderr)
        return 1
    open(OUT, 'w', encoding='utf-8').write('\n'.join(out).rstrip() + '\n')
    print(f'{OUT} : {tot["n"]} fonctions, {tot["identique_prouve"]} identiques prouvées, {tot["partiel"]} partielles, '
          f'{tot["absent"]} absentes ; couverture {len(tous)}/{len(tous)} fichiers JS.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
