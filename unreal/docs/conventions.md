# Conventions du portage Unreal (unités, axes, repères)

## Unités
| Grandeur | Jeu web (Three.js) et cœur StridesCore | Unreal |
|---|---|---|
| Longueur | mètre | centimètre (× 100) |
| Temps | seconde | seconde |
| Vitesse | m/s | cm/s (× 100) |
| Angle | radian | degré pour les rotations d'acteur (FRotator), radian dans le cœur |

Les données exportées (`Content/Data/*.json`) et le cœur `StridesCore` restent en **unités SI** : la conversion est faite
une seule fois, dans `StridesUnits.h` (module StridesGrandTour). Aucune règle sportive n'est réécrite en centimètres.

## Axes
- Web : repère droit, **y vers le haut**, x vers l'est, z vers le sud ; un cap `h` pointe vers `(sin h, cos h)` dans le
  plan (x, z).
- Unreal : repère gauche, **Z vers le haut**, X vers l'avant, Y vers la droite.
- Correspondance retenue : `UE.X = 100·web.x`, `UE.Y = 100·web.z`, `UE.Z = 100·web.y`. Échanger deux axes change la
  chiralité : un repère droit devient gauche, ce qui convient à Unreal sans retournement de géométrie.
- Cap : direction web `(sin h, cos h)` → direction UE `(X = sin h, Y = cos h)` → **lacet UE = 90° − h (en degrés)**.
  Inverse : `h = π/2 − lacet`.
- Rotation positive « vers la gauche du cavalier » dans le cœur (steerRate > 0) : diminue le lacet UE.

## Modèles importés (GLB)
- Les GLB du jeu sont en glTF (y vers le haut, mètres) : l'importeur glTF d'Unreal convertit en Z vers le haut et en
  centimètres. Vérifier à l'import : échelle (cheval ≈ 1,65 m au garrot, cavalière 1,68 m), orientation (le cheval regarde
  +X), squelette (nombre d'os : cheval PJL, 53 os pour les humains réalistes), sockets.
- Sockets à créer sur le squelette du cheval (noms utilisés par le code) : `SaddleSeat`, `Stirrup_L`, `Stirrup_R`,
  `ReinHand_L`, `ReinHand_R` ; sur le cavalier : `hand_l`, `hand_r`, `foot_l`, `foot_r` (os existants).
- Animations : les clips du cheval PJL sont sur place (in place) ; la vitesse vient de la simulation (StridesCore et
  AStridesHorse), pas du root motion.
