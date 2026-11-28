# Humains v3 — état au 17/11/2026 (chantier interrompu par la décision de portage Unreal)

Branche `claude/gt-humains-v3`, partie de `claude/gt-humains-v2` (`757dfbd`). Non fusionnée, non publiée.
**Chantier NON terminé** : arrêté sur décision de Julien (portage natif Unreal prioritaire).

## Fait (commité)
- Pieds posés au sol (verrouillage monde, pas forcés, pas à l'arrêt, recalage après téléportation) — `src/entities/human/anim.js`.
  Mesure (`tests/e2e/human-walk-video.mjs`, glissement d'un pied posé, max cm/image) : marche 20,7 → 1,6 ; arrêt 13 → 1,5 ;
  course 3,9 → 2,7 ; pivot sur place 3,0 → 7,4 (pas forcés, à revoir).
- Jambe du cavalier continue dans le temps (`hugMemory`) + contrôle de la cuisse : rotation max d'un os par image en
  régime établi < 15° (à-coups restants à l'image de départ des scénarios) ; cuisse : 1,7 cm résiduel au changement de pied.
- Visages : chaîne Blender (`scripts/humans/build-real-humans.sh`, `bpy/face_enhance.py`) : 6 formes d'expression,
  occlusion géométrique, cuir chevelu, âge adulte, diversité (âge, poitrine, asymétrie), peau (albédo plafonné, reflets).
- Public assis anatomique (`src/world/world.js`, même suite aléatoire du monde).

## Non fait / non vérifié
- Série de preuves complète (vidéos v3 finales, audit allures/CSO, legs, montée, non-régressions, perf `tests/e2e/perf-humans.mjs`)
  interrompue ; CI de la branche à lire sur le dernier commit.
- PNJ procéduraux lointains : non retravaillés ce lot. Bouche ouverte (pas de cavité buccale) : non faite.
- Cheval : aucun fichier modifié par ce chantier (empreintes inchangées) ; diff hérité du lot cavalier isolé :
  `docs/humains-v3/diff-herite-pjlHorse.patch`.
