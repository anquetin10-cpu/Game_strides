#!/bin/zsh
# jouer-plan.sh <plan> <dossier> : partie manuelle pilotée par entrées SYSTÈME (CGEvent niveau HID, captures screencapture),
# sans console, sans F8, sans -StridesShots. Le plan est exécuté par entrees.py dans un job launchd transitoire, parce que
# seul ce python (autorisé par Julien : Accessibilité, PostEvent, Enregistrement de l'écran) peut poster des événements ;
# lancé directement depuis le terminal, il hériterait des droits du Terminal (aucun). Le job est retiré à la fin.
# Aides : axpress.swift (appui AX sur un bouton d'une fenêtre, ex. OK d'une boîte de message), wins.swift (fenêtres et id).
# Compiler : swiftc -O axpress.swift -o axpress ; swiftc -O wins.swift -o wins (binaires hors dépôt).
P=/Users/julien/.local/share/uv/python/cpython-3.11.16-macos-aarch64-none/bin/python3.11
S=${0:A:h}; LOG=$2/drive.log; mkdir -p $2
launchctl remove com.tom.gt-drive 2>/dev/null
before=$(wc -l < $LOG 2>/dev/null || echo 0)
launchctl submit -l com.tom.gt-drive -- $P -I $S/entrees.py $1 $2 $LOG
until grep -q "fin du plan" <(tail -n +$((before+1)) $LOG 2>/dev/null); do sleep 1; done
launchctl remove com.tom.gt-drive; tail -n +$((before+1)) $LOG | tail -40
