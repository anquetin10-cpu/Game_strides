"""Importe la cavalière animée (maillages, squelette, matériaux, sept clips) avec Interchange.

Prérequis : blender -b --factory-startup --python scripts/unreal/export-rider-animations.py
(produit .tmp/unreal-import/rider-animations/rider_f_animated.glb).

Les anciens FBX animation-only étaient importés sur le squelette du GLB d'origine, dont la pose de bind
ne correspond pas à la pose de repos (os Root à l'échelle 1,165, décalé de 94 cm). Les clips donnaient
à Root une échelle 100 et des translations en mètres : la cavalière gonflait à ~100 m. Un GLB unique
exporté par Blender garde une seule convention pour le maillage et les clips.

Usage (éditeur ouvert, via Monolith ou la console Python) :
    exec(open('<racine>/scripts/unreal/import-rider-animations.py').read())
Interchange importe de façon asynchrone : appeler `rename_clips()` une fois l'import terminé.
"""

from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".tmp" / "unreal-import" / "rider-animations" / "rider_f_animated.glb"
DESTINATION = "/Game/Characters/Riders/Female/rider_f_animated"
MESHES = DESTINATION + "/rider_f_animated/SkeletalMeshes"
assert SOURCE.exists(), f"Lancer d'abord export-rider-animations.py : {SOURCE} absent"


def rename_clips():
    """Renomme « rider_f_animatedRider_<clip> » en « Rider_<clip> »."""
    renamed = 0
    for path in unreal.EditorAssetLibrary.list_assets(MESHES, False, False):
        asset = unreal.load_asset(path)
        if isinstance(asset, unreal.AnimSequence) and asset.get_name().startswith("rider_f_animated"):
            target = MESHES + "/" + asset.get_name().removeprefix("rider_f_animated")
            renamed += bool(unreal.EditorAssetLibrary.rename_asset(path, target))
    unreal.EditorAssetLibrary.save_directory(DESTINATION)
    print("RIDER_CLIPS_RENAMED", renamed, sorted(p.split(".")[-1] for p in unreal.EditorAssetLibrary.list_assets(MESHES, False, False)))


task = unreal.AssetImportTask()
task.set_editor_property("filename", str(SOURCE))
task.set_editor_property("destination_path", DESTINATION)
task.set_editor_property("automated", True)
task.set_editor_property("save", True)
task.set_editor_property("replace_existing", True)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
print("RIDER_IMPORT_STARTED", SOURCE)
