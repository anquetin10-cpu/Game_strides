#!/usr/bin/env python3
"""Contrôle J1-F : les outils de développement sont absents du binaire Shipping.

Usage : python3 scripts/unreal/check-shipping-tools.py <binaire StridesGrandTour-Mac-Shipping> [<binaire Development>]

Cherche, dans le binaire, les chaînes des outils de capture, de démonstration et des options -Strides* de débogage,
encodées comme le moteur les range (TCHAR : UTF-16LE ou UTF-32LE selon la version du moteur) et en UTF-8. Sortie 0 si aucune n'est trouvée dans le
Shipping. Le binaire Development, s'il est donné, sert de témoin : les mêmes chaînes doivent y être (sinon la recherche
ne prouve rien).
"""
import sys

CHAINES = [
    'StridesShotsDir', 'StridesShots=', 'StridesPerfSansCapture', 'StridesPerfWarm', 'StridesMontePoses',
    'StridesHorseView=', 'StridesHorseScale=', 'StridesMonte=', 'StridesRider=', 'StridesTack=',
    'Démo parcours', 'DÉMONSTRATION AUTOMATIQUE', 'F5 sauvegarder', 'Strides souris',
]


def trouve(data, s):
    return [enc for enc in ('utf-16-le', 'utf-32-le', 'utf-8') if s.encode(enc) in data]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    ship = open(sys.argv[1], 'rb').read()
    dev = open(sys.argv[2], 'rb').read() if len(sys.argv) > 2 else None
    mauvais = 0
    for s in CHAINES:
        t = trouve(ship, s)
        temoin = '' if dev is None else (' ; Development : ' + (','.join(trouve(dev, s)) or 'absente'))
        print(f'{s!r:32} Shipping : {",".join(t) or "absente"}{temoin}')
        mauvais += bool(t)
    print(f'{mauvais} chaîne(s) d\'outils trouvée(s) dans le Shipping sur {len(CHAINES)}')
    return 1 if mauvais else 0


if __name__ == '__main__':
    sys.exit(main())
