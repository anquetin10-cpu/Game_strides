#!/usr/bin/env python3
# Étape S4 de l'essai de monte (voie A) : oracle des appuis. Posers et levers de chaque pied, image par image, dans le jeu
# web (oracle unreal/core/tests/oracles/monte/vue/, os des sabots relevés après chaque image) et sur le cheval Unreal
# rejoué par Strides.Parite.HorseView (export <dossier>/unreal-vue : passe « jeu » = vue du jeu Unreal avant l'étape S4,
# passe « web » = vue du web portée), puis comparés.
#
# Règle d'appui (src/entities/pjl/asset.js, analyse des clips de saut et gaitContacts) : un sabot est au sol quand son os
# (fingers_02_l, fingers_02_r, toes_02_l, toes_02_r) est à moins de 3,5 cm de son point le plus bas ; ici appliquée à la
# hauteur au-dessus du sol de chaque scénario (plus bas sur le scénario entier, par pied et par source). Poser : première
# image au sol après une image en l'air ; lever : première image en l'air après une image au sol.
# Appariement : pour chaque événement du web, le plus proche du même pied et du même type chez l'autre source, à 8 images
# au plus ; écart d'instant (images, 1/30 s) et écart de position du sabot dans le repère du cheval (x, z, cm) à cet instant.
#
# Usage : python3 scripts/unreal/horse-view-appuis.py --unreal=<dossier>/unreal-vue [--out=<dossier>] [--md=<fichier>]
#   défaut : écrit unreal/docs/parite/monte/appuis.md et appuis.json.
import json
import math
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ORA = os.path.join(ROOT, 'unreal/core/tests/oracles/monte/vue')
HOOFS = ['AG', 'AD', 'PG', 'PD']  # fingers_02_l, fingers_02_r, toes_02_l, toes_02_r
TOL = 0.035
WIN = 8


def arg(k, d=None):
    for a in sys.argv[1:]:
        if a.startswith('--' + k + '='):
            return a[len(k) + 3:]
    return d


def world_y(H, p):
    # Point du repère du holder → monde du web (H = [x, y, z, qx, qy, qz, qw, sol]) : seule la hauteur sert.
    qx, qy, qz, qw = H[3], H[4], H[5], H[6]
    x, y, z = p
    tx, ty, tz = 2 * (qy * z - qz * y), 2 * (qz * x - qx * z), 2 * (qx * y - qy * x)
    return H[1] + y + qw * ty + qz * tx - qx * tz


def events(h):
    lo = min(h)
    c = [x < lo + TOL for x in h]
    ev = []
    for f in range(1, len(c)):
        if c[f] and not c[f - 1]:
            ev.append(('poser', f))
        elif c[f - 1] and not c[f]:
            ev.append(('lever', f))
    return ev, c


def match(evw, evo, posw, poso):
    out = []
    for t, f in evw:
        best = None
        for t2, f2 in evo:
            if t2 != t or abs(f2 - f) > WIN:
                continue
            if best is None or abs(f2 - f) < abs(best - f):
                best = f2
        if best is None:
            out.append({'type': t, 'f': f, 'df': None, 'dpos': None})
        else:
            pw, po = posw[f], poso[best]
            out.append({'type': t, 'f': f, 'df': best - f, 'dpos': 100 * math.hypot(po[0] - pw[0], po[2] - pw[2])})
    return out


def stats(m):
    ok = [x for x in m if x['df'] is not None]
    if not m:
        return {'n': 0}
    adf = [abs(x['df']) for x in ok]
    dp = [x['dpos'] for x in ok]
    return {'n': len(m), 'apparies': len(ok), 'df_moy': sum(adf) / len(adf) if adf else None, 'df_max': max(adf) if adf else None,
            'exacts': sum(1 for x in adf if x == 0), 'pos_moy': sum(dp) / len(dp) if dp else None, 'pos_max': max(dp) if dp else None}


def fmt(x, n=1):
    return '—' if x is None else (f'{x:.{n}f}'.replace('.', ','))


def main():
    udir = arg('unreal')
    if not udir:
        print(__doc__ if __doc__ else 'usage : --unreal=<dossier>/unreal-vue')
        return 2
    idx = json.load(open(os.path.join(ORA, 'index.json')))
    res = {'schema': 'strides.monte.appuis/1', 'generator': 'scripts/unreal/horse-view-appuis.py', 'regle': f'sabot au sol à moins de {TOL} m de son point le plus bas du scénario ; appariement à {WIN} images au plus',
           'scenarios': []}
    tot = {'jeu': [], 'web': []}
    body = []
    for r in idx['runs']:
        rid = r['id']
        W = json.load(open(os.path.join(ORA, r['file'])))
        up = os.path.join(udir, rid + '.json')
        if not os.path.exists(up):
            print(f'{rid} : export Unreal absent')
            continue
        U = json.load(open(up))
        fr = W['frames']
        n = len(fr)
        uf = {'jeu': [None] * n, 'web': [None] * n}
        for x in U['frames']:
            uf[x['m']][x['f']] = x
        sc = {'id': rid, 'desc': W.get('desc', ''), 'images': n, 'pieds': {}}
        for k, name in enumerate(HOOFS):
            hw = [f['vu']['hoof'][k][1] - f['vu']['hoof'][k][3] for f in fr]
            pw = [f['vu']['hoof'][k][4:7] for f in fr]
            evw, _ = events(hw)
            ent = {'oracle': [list(e) for e in evw]}
            for m in ('jeu', 'web'):
                # Hauteur du sabot Unreal au-dessus du sol du web : repère du cheval → monde par le holder du web de l'image,
                # moins le sol sous le sabot du web (le rivage n'est pas plat ; les sabots sont à quelques cm l'un de l'autre).
                hu = [world_y(fr[i]['vu']['H'], uf[m][i]['hoof'][k][0:3]) - fr[i]['vu']['hoof'][k][3] for i in range(n)]
                pu = [uf[m][i]['hoof'][k][0:3] for i in range(n)]
                evu, _ = events(hu)
                mm = match(evw, evu, pw, pu)
                ent['unreal_' + m] = {'evenements': [list(e) for e in evu], 'appariement': mm, 'stats': stats(mm)}
                tot[m] += [dict(x, id=rid, pied=name) for x in mm]
            sc['pieds'][name] = ent
        # Corps (passe web) contre le web : hauteur et bascule après _barClear, inclinaison.
        dby = max(abs(uf['web'][i]['body'][0] - fr[i]['vu']['bar']['out']['by']) for i in range(n))
        drx = max(abs(uf['web'][i]['body'][2] - fr[i]['vu']['bar']['out']['rx']) for i in range(n))
        drz = max(abs(uf['web'][i]['body'][3] - fr[i]['vu']['view']['rz']) for i in range(n))
        rzmax = max(abs(fr[i]['vu']['view']['rz']) for i in range(n))
        rxmax = max(abs(fr[i]['vu']['bar']['out']['rx']) for i in range(n))
        bymin = min(fr[i]['vu']['bar']['out']['by'] for i in range(n))
        sc['corps'] = {'dby_cm': 100 * dby, 'drx_deg': math.degrees(drx), 'drz_deg': math.degrees(drz), 'web_rz_max_deg': math.degrees(rzmax),
                       'web_rx_max_deg': math.degrees(rxmax), 'web_by_min_cm': 100 * bymin}
        body.append(sc['corps'] | {'id': rid})
        res['scenarios'].append(sc)
    res['total'] = {m: stats(tot[m]) for m in tot}
    for m in tot:
        for t in ('poser', 'lever'):
            res['total'][m + '_' + t] = stats([x for x in tot[m] if x['type'] == t])
    out = arg('out')
    jpath = os.path.join(out, 'appuis.json') if out else os.path.join(ROOT, 'unreal/docs/parite/monte/appuis.json')
    mpath = arg('md') or (os.path.join(out, 'appuis.md') if out else os.path.join(ROOT, 'unreal/docs/parite/monte/appuis.md'))
    os.makedirs(os.path.dirname(jpath), exist_ok=True)
    with open(jpath, 'w') as f:
        json.dump(res, f, indent=1, ensure_ascii=False)
        f.write('\n')
    L = ['# Appuis du cheval : web, cheval Unreal avant (vue du jeu) et après (vue du web portée)', '',
         'Écrit par `scripts/unreal/horse-view-appuis.py` (jamais à la main) à partir de l’oracle `unreal/core/tests/oracles/monte/vue/` '
         '(jeu web) et de l’export de `Strides.Parite.HorseView` (cheval Unreal à la taille du web, mêmes entrées du cheval du jeu, même '
         'repère du cheval, même sol). ' + res['regle'] + '. Écarts d’instant en images (1/30 s), de position en cm (repère du cheval, x et z).', '',
         '## Ensemble', '', '| Source | Événements du web | Appariés | Instant exact | Écart moyen (images) | Écart max (images) | Position moyenne (cm) | Position max (cm) |',
         '|---|---|---|---|---|---|---|---|']
    for m, lab in (('jeu', 'avant (vue du jeu)'), ('web', 'après (vue du web)')):
        for t in ('', '_poser', '_lever'):
            s = res['total'][m + t] if t else res['total'][m]
            L.append(f"| {lab}{' ' + t[1:] + 's' if t else ''} | {s['n']} | {s.get('apparies', 0)} | {s.get('exacts', 0)} | {fmt(s.get('df_moy'), 2)} | {s.get('df_max', '—')} | {fmt(s.get('pos_moy'))} | {fmt(s.get('pos_max'))} |")
    L += ['', '## Par scénario', '', '| Scénario | Images | Avant : appariés / web, écart moyen (images), position moyenne (cm) | Après : idem | Corps après : Δ hauteur max (cm), Δ bascule max (°), Δ inclinaison max (°) | Web : inclinaison max (°), bascule max (°) |',
          '|---|---|---|---|---|---|']
    for sc in res['scenarios']:
        def agg(m):
            mm = [x for p in sc['pieds'].values() for x in p['unreal_' + m]['appariement']]
            s = stats(mm)
            return f"{s.get('apparies', 0)} / {s['n']}, {fmt(s.get('df_moy'), 2)}, {fmt(s.get('pos_moy'))}"
        c = sc['corps']
        L.append(f"| {sc['id']} | {sc['images']} | {agg('jeu')} | {agg('web')} | {fmt(c['dby_cm'], 2)}, {fmt(c['drx_deg'], 2)}, {fmt(c['drz_deg'], 3)} | {fmt(c['web_rz_max_deg'], 2)}, {fmt(c['web_rx_max_deg'], 2)} |")
    L += ['', '## Sauts : posers des postérieurs après la réception', '', '| Scénario | Pied | Web (image) | Avant (écart) | Après (écart) |', '|---|---|---|---|---|']
    for sc in res['scenarios']:
        if not (sc['id'].startswith('E3') or sc['id'].startswith('V3')):
            continue
        for p in ('PG', 'PD'):
            ent = sc['pieds'][p]
            for i, (t, f) in enumerate(ent['oracle']):
                if t != 'poser':
                    continue
                a = ent['unreal_jeu']['appariement'][i]
                b = ent['unreal_web']['appariement'][i]
                L.append(f"| {sc['id']} | {p} | {f} | {'non apparié' if a['df'] is None else str(a['df']) + ' im., ' + fmt(a['dpos']) + ' cm'} | {'non apparié' if b['df'] is None else str(b['df']) + ' im., ' + fmt(b['dpos']) + ' cm'} |")
    with open(mpath, 'w') as f:
        f.write('\n'.join(L) + '\n')
    print(f"écrit {jpath} et {mpath}")
    for m in tot:
        s = res['total'][m]
        print(m, json.dumps(s))
    return 0


if __name__ == '__main__':
    sys.exit(main())
