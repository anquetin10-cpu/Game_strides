#!/usr/bin/env bash
# Construction complète des personnages réalistes (lot v3) : formes MakeHuman (Node), visage dans Blender (bpy :
# expressions, occlusion, cuir chevelu), compression vers public/real.
# Usage : BLENDER_PY=<python d'un environnement où « import bpy » fonctionne> bash scripts/humans/build-real-humans.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${BLENDER_PY:?BLENDER_PY : interpréteur Python avec le module bpy (Blender 5.x)}"
B=node_modules/.cache/real-build
STAGE=raw node scripts/real/build-humans.mjs
for id in rider_f rider_m; do
  "$BLENDER_PY" scripts/humans/bpy/face_enhance.py "$B/$id.raw.glb" "$B/$id.face.glb" "$B/$id.face.json" 2>&1 | grep '^{' 
done
node scripts/real/finalize-humans.mjs rider_f rider_m
