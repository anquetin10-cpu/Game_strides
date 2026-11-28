#!/bin/zsh
# jouer-cercle.sh <dossier-preuves> <durée_s> <appui_s> [cadence_s] : lance cercle.py (jalon J2c, entraînement au paddock)
# dans un job launchd transitoire, comme jouer-suivre.sh (seul ce python a les droits d'entrée et de capture).
P=/Users/julien/.local/share/uv/python/cpython-3.11.16-macos-aarch64-none/bin/python3.11
S=${0:A:h}; LOG=$1/drive.log; mkdir -p $1
T=/Volumes/Stockage-Qualification/Mac-Mini-Migration/Active-Projects/grand-tour-unreal/.ue-cache/travail/livraison/outils
launchctl remove com.tom.gt-cercle 2>/dev/null
before=$(wc -l < $LOG 2>/dev/null || echo 0)
launchctl submit -l com.tom.gt-cercle -- $P -I $S/cercle.py $1 $LOG $T $2 $3 ${4:-0}
until grep -q "fin du plan" <(tail -n +$((before+1)) $LOG 2>/dev/null); do sleep 1; done
launchctl remove com.tom.gt-cercle; tail -n +$((before+1)) $LOG | tail -20
