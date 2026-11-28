#!/bin/zsh
# jouer-pilote.sh <dossier-preuves> <mode> <durée_s> [options] : lance pilote.py (joueur de l'agent qui lit l'écran) dans un job
# launchd transitoire, comme jouer-plan.sh (seul ce python a les droits d'entrée et de capture) ; attend sa fin.
# Outil (hors dépôt) : oeil, compilé depuis oeil.swift (swiftc -O -parse-as-library oeil.swift -o <outils>/oeil).
P=/Users/julien/.local/share/uv/python/cpython-3.11.16-macos-aarch64-none/bin/python3.11
S=${0:A:h}; LOG=$1/drive.log; mkdir -p $1
T=/Volumes/Stockage-Qualification/Mac-Mini-Migration/Active-Projects/grand-tour-unreal/.ue-cache/travail/livraison/outils
launchctl remove com.tom.gt-pilote 2>/dev/null
before=$(wc -l < $LOG 2>/dev/null || echo 0)
[[ -n $APP ]] && /usr/bin/open "$APP"
launchctl submit -l com.tom.gt-pilote -- $P -I $S/pilote.py $1 $LOG $T $2 $3 ${@:4}
until grep -q "fin du plan" <(tail -n +$((before+1)) $LOG 2>/dev/null); do sleep 1; done
launchctl remove com.tom.gt-pilote; tail -n +$((before+1)) $LOG | tail -${TAILN:-30}
