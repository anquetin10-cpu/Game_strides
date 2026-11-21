"""Importe les sons de l'épreuve du Pôle (tranche T12) rendus hors ligne par scripts/unreal/export-cso-sounds.mjs.

Entrées : .tmp/unreal-import/cso-sounds/*.wav (PCM 16 bits mono 48 kHz) et le manifeste
unreal/StridesGrandTour/Content/Data/cso_sounds.json (clé, fichier, actif, nombre d'échantillons, SHA-1 du PCM).
Sorties : un USoundWave par son sous /Game/Audio/Cso (nom = clé), compression PCM (aucune perte), boucle du bus du
public en lecture bouclée, jouée même silencieuse ; rien
d'autre n'est écrit (le jeu lit le manifeste). Chaque WAV est contrôlé avant l'import (SHA-1 du PCM et nombre
d'échantillons = manifeste) et chaque actif après (durée, voies) ; l'identité du PCM importé est contrôlée dans le
moteur par le test Strides.Cso.Audio (USoundWave::GetImportedSoundWaveData, SHA-1 = manifeste).

Usage (commandlet, sans éditeur ouvert) :
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" \\
    "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \\
    -script="$PWD/scripts/unreal/import-cso-sounds.py" -unattended -nosplash -nullrhi
Compte rendu : .tmp/unreal-import/import-cso-sounds.log (dernière ligne « TERMINÉ … »).
"""

import hashlib
import json
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "unreal" / "StridesGrandTour" / "Content" / "Data" / "cso_sounds.json"
SRC = ROOT / ".tmp" / "unreal-import" / "cso-sounds"
(ROOT / ".tmp" / "unreal-import").mkdir(parents=True, exist_ok=True)
REPORT = open(ROOT / ".tmp" / "unreal-import" / "import-cso-sounds.log", "w")
DEST = "/Game/Audio/Cso"

at = unreal.AssetToolsHelpers.get_asset_tools()
eal = unreal.EditorAssetLibrary


def log(*a):
    REPORT.write(" ".join(str(x) for x in a) + "\n")
    REPORT.flush()


man = json.loads(MANIFEST.read_text())
rate = man["rate"]
tasks, ok = [], 0
for s in man["sounds"]:
    wav = SRC / s["file"]
    b = wav.read_bytes()
    assert b[:4] == b"RIFF" and b[8:12] == b"WAVE" and b[36:40] == b"data", f"{wav} : en-tête inattendu"
    data = b[44:]
    assert hashlib.sha1(data).hexdigest() == s["pcmSha1"], f"{wav} : SHA-1 du PCM ≠ manifeste (réexporter)"
    assert len(data) // 2 == s["samples"], f"{wav} : {len(data) // 2} échantillons ≠ {s['samples']}"
    assert s["asset"] == f"{DEST}/{s['nom']}.{s['nom']}", f"chemin d'actif inattendu : {s['asset']}"
    t = unreal.AssetImportTask()
    t.set_editor_property("filename", str(wav))
    t.set_editor_property("destination_path", DEST)
    t.set_editor_property("destination_name", s["nom"])
    t.set_editor_property("replace_existing", True)
    t.set_editor_property("automated", True)
    t.set_editor_property("save", False)
    tasks.append((t, s))
at.import_asset_tasks([t for t, _ in tasks])
for t, s in tasks:
    path = f"{DEST}/{s['nom']}"
    w = unreal.load_asset(path)
    assert isinstance(w, unreal.SoundWave), f"{path} : actif absent ou d'un autre type ({type(w)})"
    w.set_editor_property("looping", bool(s.get("loop")))
    # Lecture sans compression avec perte (PCM) : les échantillons joués sont ceux du rendu du web (1,8 Mo en tout).
    w.set_editor_property("sound_asset_compression_type", unreal.SoundAssetCompressionType.PCM)
    if s.get("loop"):
        # Boucle du bus du public lancée à volume 0 (gain du bus à 0 hors de portée) : jouée même silencieuse.
        w.set_editor_property("virtualization_mode", unreal.VirtualizationMode.PLAY_WHEN_SILENT)
    dur = w.get_editor_property("duration")
    ch = w.get_editor_property("num_channels")
    assert ch == 1, f"{path} : {ch} voies"
    assert abs(dur - s["samples"] / rate) < 1e-3, f"{path} : durée {dur} ≠ {s['samples'] / rate}"
    eal.save_asset(path, only_if_is_dirty=False)
    assert w.get_editor_property("sound_asset_compression_type") == unreal.SoundAssetCompressionType.PCM, f"{path} : compression"
    log("importé", path, "échantillons", s["samples"], "durée", round(dur, 6), "boucle", bool(s.get("loop")), "compression PCM", "sha1", s["pcmSha1"])
    ok += 1
log(f"TERMINÉ : {ok} sons importés sous {DEST}")
REPORT.close()
