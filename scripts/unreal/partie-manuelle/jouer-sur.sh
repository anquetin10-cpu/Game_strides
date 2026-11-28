#!/bin/zsh
# jouer-sur.sh <plan> <dossier> : exécute joueur-sur.py (entrées au seul processus du jeu, garde avant chaque rafale,
# captures de la seule fenêtre du jeu) dans un job launchd transitoire (seul ce python est autorisé à poster des
# événements et à capturer l'écran) ; le job est retiré à la fin.
P=/Users/julien/.local/share/uv/python/cpython-3.11.16-macos-aarch64-none/bin/python3.11
S=${0:A:h}; LOG=$2/drive.log; mkdir -p $2
launchctl remove com.tom.gt-drive 2>/dev/null
before=$(wc -l < $LOG 2>/dev/null || echo 0)
launchctl submit -l com.tom.gt-drive -- $P -I $S/joueur-sur.py $2 $1
until grep -q "fin du plan\|ABANDON" <(tail -n +$((before+1)) $LOG 2>/dev/null); do sleep 1; done
sleep 1; launchctl remove com.tom.gt-drive; tail -n +$((before+1)) $LOG | tail -40
