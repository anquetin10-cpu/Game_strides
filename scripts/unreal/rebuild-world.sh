#!/bin/zsh
# Chaîne complète après un export du monde web (scripts/unreal/world-export.html) :
# préparation des images, import Unreal (commandlet), compilation de l'éditeur, puis revue visuelle -StridesShots
# (captures dans unreal/StridesGrandTour/Saved/Screenshots/Strides). Étapes : prepare, import, build, shots (défaut : toutes).
set -euo pipefail
ROOT=${0:A:h:h:h}
cd $ROOT
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
UE="/Users/Shared/Epic Games/UE_5.8"
PROJECT="$ROOT/unreal/StridesGrandTour/StridesGrandTour.uproject"
STEPS=("$@"); (( $#STEPS )) || STEPS=(prepare import build shots)
for step in $STEPS; do
  case $step in
    prepare) python3 scripts/unreal/prepare-world.py ;;
    import)
      "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PROJECT" -run=pythonscript -script="$ROOT/scripts/unreal/import-world.py" \
        -unattended -nosplash -nullrhi > .tmp/unreal-import/import-world.ue.log 2>&1 || true
      tail -1 .tmp/unreal-import/import-world.log
      grep -q "^TERMINÉ" .tmp/unreal-import/import-world.log || { grep "LogPython: Error" .tmp/unreal-import/import-world.ue.log | head -20; exit 1; } ;;
    build)
      "$UE/Engine/Build/BatchFiles/Mac/Build.sh" StridesGrandTourEditor Mac Development -project="$PROJECT" > .tmp/build-editor.log 2>&1 \
        || { grep -E "error" .tmp/build-editor.log | head -20; exit 1; }
      grep "Result:" .tmp/build-editor.log ;;
    shots)
      "$UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PROJECT" -game -windowed -ResX=1600 -ResY=900 -nosplash \
        -StridesShots -abslog="$ROOT/.tmp/shots.log" > /dev/null 2>&1 || true
      grep -E "Strides scenery|Strides shot|Fatal" .tmp/shots.log | cut -c1-200 ;;
  esac
done
