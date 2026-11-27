#!/bin/zsh
# jouer-viser.sh <dossier-preuves> <durée_s> <cx> <cy> <r> [appui_s] [cadence_s] : lance viser.py (jalon J2d, entraînement au paddock)
# dans un job launchd transitoire, comme jouer-suivre.sh (seul ce python a les droits d'entrée et de capture).
P=/Users/julien/.local/share/uv/python/cpython-3.11.16-macos-aarch64-none/bin/python3.11
S=${0:A:h}; LOG=$1/drive.log; mkdir -p $1
T=/Volumes/Stockage-Qualification/Mac-Mini-Migration/Active-Projects/grand-tour-unreal/.ue-cache/travail/livraison/outils
launchctl remove com.tom.gt-viser 2>/dev/null
before=$(wc -l < $LOG 2>/dev/null || echo 0)
launchctl submit -l com.tom.gt-viser -- $P -I $S/viser.py $1 $LOG $T $2 $3 $4 $5 ${6:-0.15} ${7:-0}
until grep -q "fin du plan" <(tail -n +$((before+1)) $LOG 2>/dev/null); do sleep 1; done
launchctl remove com.tom.gt-viser; tail -n +$((before+1)) $LOG | tail -20
