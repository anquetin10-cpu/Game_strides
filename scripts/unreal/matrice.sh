#!/bin/zsh
# Matrice de fin de jalon du portage Unreal (plan de livraison, « Règles communes ») :
#   1) ctest de toutes les cibles du cœur (unreal/core) ;
#   2) Automation « Strides » complet dans l'éditeur (-nullrhi) ;
#   3) contrôle des chaînes d'outils du binaire Shipping (lot J1-F) contre le témoin Development.
# Usage : zsh scripts/unreal/matrice.sh <dossier de travail> <binaire Shipping> <binaire Development>
#   (npm run unreal:matrice -- <dossier> <Shipping> <Development>). Sortie non nulle au premier échec.
# Le dossier de travail reçoit le build du cœur et les journaux (hors dépôt, ex. .ue-cache/travail/livraison).
set -u
setopt pipefail
R=${0:A:h:h:h}
W=${1:?dossier de travail}; SHIP=${2:?binaire Shipping}; DEV=${3:?binaire Development}
E=/Volumes/Stockage-Qualification/Mac-Mini-Migration/Applications/UE_5.8/Engine
mkdir -p $W/journaux
echo "== ctest"
cmake -S $R/unreal/core -B $W/core-build >/dev/null && cmake --build $W/core-build -j8 >/dev/null && ctest --test-dir $W/core-build 2>&1 | tail -3 || exit 1
echo "== Automation Strides"
J=$W/journaux/matrice-automation.log
"$E/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" $R/unreal/StridesGrandTour/StridesGrandTour.uproject \
  -ExecCmds="Automation RunTests Strides; Quit" -unattended -nullrhi -nosplash -trace=none -abslog=$J >/dev/null 2>&1
grep -c "Result={Success}" $J | sed 's/^/succès : /'; grep -c "Result={Fail}" $J | sed 's/^/échecs : /'
grep -q "EXIT CODE: 0" $J || { echo "Automation : échec (journal $J)"; exit 1; }
echo "== Outils absents du Shipping"
python3 $R/scripts/unreal/check-shipping-tools.py $SHIP $DEV | tail -1 || exit 1
echo "matrice verte"
