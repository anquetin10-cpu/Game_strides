# Décors du monde (Unreal) — chaîne de production et état vérifié

Mise à jour : 18 novembre 2026.

## Principe
Le jeu web reste la référence du monde : relief, routes, bâtiments, clôtures, enseignes, haies, arbres et leur
placement ne sont jamais recopiés à la main. Ils sont **exportés du `World` web tel qu'il se construit** (mêmes graines,
mêmes règles), puis rhabillés dans Unreal avec des **matériaux photo PBR** (Poly Haven, licence CC0) et l'éclairage du
moteur. Avant : un plan vert et des boîtes colorées.

| Élément | Source web | Unreal |
|---|---|---|
| Relief 1,2 km (collines, plage à marnage, falaises, zones aplanies) | `analyticHeight` (terrain.js), grille de 2 m | maillage procédural à collisions (`AStridesScenery`), prolongé jusqu'à 4,2 km vers l'horizon |
| Sol (prés, cultures, labours, carrières, cour, plage) | carte peinte + carte des matériaux du shader de sol | `M_WorldTerrain` : détail photo (herbe, terre, sable sec/mouillé, gravier) teinté par la carte web |
| Routes (14 tracés) | `ROADS` (layout.js) | reconstruites sur le relief, enrobé photo, rives et axe discontinu |
| Architecture (1,07 M triangles : écuries, maison, Pôle, ville, plage) | lots statiques du `World` | 14 matériaux selon la logique du shader web (colombage normand porté en HLSL, ardoise, tuiles, brique, bardage, enduit, pierre…) |
| Arbres (2 541, 26 variantes, 9 essences) et haies | `Vegetation` (treeGen.js) | instances hiérarchiques, feuillage translucide et vent, troncs à collisions |
| Mer et étang | niveau moyen 0 m, `POND` | eau translucide, houle, fondu sur la plage |

Le cheval suit le relief (`AStridesHorse::GroundAt`), les obstacles sont posés au sol, et le parcours du Pôle est désormais
calé sur le **centre de la carrière** (`cso_course_pole.json`, `arena`) : il était décalé de 44 m vers l'entrée du site.

## Régénérer
```
zsh scripts/unreal/fetch-world-textures.sh                 # 17 jeux de textures CC0 (≈ 155 Mo, hors dépôt)
python3 scripts/unreal/world-export-receiver.py &          # récepteur local 127.0.0.1:8765
npx vite                                                   # puis ouvrir /scripts/unreal/world-export.html
zsh scripts/unreal/rebuild-world.sh                        # préparation, import Unreal, compilation, captures
```
`rebuild-world.sh` accepte les étapes `prepare import build shots` séparément.

## Vérifications
- `-StridesShots` (jeu lancé en ligne de commande) : 8 points de vue fixes du monde, la vue de jeu, puis la cavalière
  monte et le cheval joue le parcours de démonstration du Pôle (captures toutes les 4 s) ; images dans
  `Saved/Screenshots/Strides/`, journal `.tmp/shots.log`.
- Test d'automatisation `Strides.World.Scenery` : relief identique à `analyticHeight` aux nœuds (écurie 3 m, Pôle 3 m, fond
  marin -13,98 m, colline 59,28 m), 14 routes, étang, et chaque maillage du manifeste chargeable.
- Vérifié sur Mac le 18/11/2026 : compilation, 6 tests sur 6, parcours complet joué à cheval sur le décor (10 obstacles,
  arrivée en 86,6 s ; 63 points de pénalité avec la conduite automatique de démonstration, non comparé à un relevé antérieur).

## Non vérifié / limites connues
- **iPhone/iPad** : non testé. Charge de rendu à mesurer sur appareil (≈ 1,07 M triangles d'architecture, 2 541 arbres sans
  niveaux de détail, 17 jeux de textures limités à 1–2 K). Prévoir LOD des arbres et des tuiles si la cadence ne tient pas.
- Occlusion ambiante, halo et ombres à 3 cascades : rendu Mac ; le rendu mobile en ignore une partie.
- Lucarnes du toit de l'écurie : quelques triangles clairs résiduels (géométrie web coplanaire au toit).
- Pas encore d'herbe en volume au premier plan, ni de nuages ; marée fixe au niveau moyen.

## Licences
Textures photo : Poly Haven (https://polyhaven.com), CC0 — aucune attribution requise. Les autres textures (feuillage,
écorce de bouleau, haies) et toute la géométrie proviennent du jeu web.
