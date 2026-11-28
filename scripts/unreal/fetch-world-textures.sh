#!/bin/zsh
# Télécharge les textures PBR des décors (Poly Haven, licence CC0, https://polyhaven.com/license) en 2K JPG :
# couleur (Diffuse), normale OpenGL (nor_gl) et ARM (occlusion, rugosité, métal). Sortie hors dépôt :
# .tmp/unreal-import/world-textures/<id>/<id>_<map>_2k.jpg ; import Unreal : scripts/unreal/import-world.py.
# Usage : zsh scripts/unreal/fetch-world-textures.sh
set -euo pipefail
ROOT=${0:A:h:h:h}
OUT=$ROOT/.tmp/unreal-import/world-textures
mkdir -p $OUT
IDS=(leafy_grass sparse_grass forest_leaves_02 gravel_floor_02 coast_sand_01 damp_beach_sand sand_01 asphalt_02
  dirt_floor rock_face_03 white_plaster_02 roof_slates_02 black_painted_planks weathered_planks red_brick_03
  cobblestone_floor_01 bark_brown_02)
for id in $IDS; do
  mkdir -p $OUT/$id
  meta=$OUT/$id/files.json
  [[ -s $meta ]] || curl -sfL -A strides-asset-fetch "https://api.polyhaven.com/files/$id" -o $meta
  for map in Diffuse nor_gl arm; do
    dest=$OUT/$id/${id}_${map}_2k.jpg
    [[ -s $dest ]] && continue
    url=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]]['2k']['jpg']['url'])" $meta $map)
    case $url in https://dl.polyhaven.org/*) ;; *) echo "URL inattendue pour $id/$map : $url" >&2; exit 1;; esac
    curl -sfL -A strides-asset-fetch "$url" -o $dest.part && mv $dest.part $dest
  done
  echo "$id ok"
done
du -sh $OUT
