"""Importe le cheval normalisé (maillages, squelette, matériaux, 17 clips) avec Interchange.

Prérequis : python3 scripts/unreal/normalize-horse-glb.py (produit .tmp/unreal-import/horse_pjl_normalized.glb).
Le GLB normalisé est à l'échelle glTF du modèle (~100 fois trop grand) : l'échelle uniforme 0,01
ramène le cheval à ~2,5 m de long, et s'applique de la même façon au maillage et aux clips.

Usage (éditeur ouvert, via Monolith ou la console Python) :
    exec(open('<racine>/scripts/unreal/import-horse-glb.py').read())
"""

from pathlib import Path

import unreal

ROOT = Path("/Users/julien/.openclaw/workspace/projects/grand-tour-unreal-monolith-spike")
SOURCE = ROOT / ".tmp" / "unreal-import" / "horse_pjl_normalized.glb"
DESTINATION = "/Game/Characters/Horse/horse_pjl_normalized"
assert SOURCE.exists(), f"Lancer d'abord normalize-horse-glb.py : {SOURCE} absent"

pipeline = unreal.InterchangeGenericAssetsPipeline()
pipeline.set_editor_property("import_offset_uniform_scale", 0.01)
pipeline.set_editor_property("asset_type_sub_folders", False)
animation = pipeline.get_editor_property("animation_pipeline")
animation.set_editor_property("import_animations", True)
animation.set_editor_property("import_bone_tracks", True)

task = unreal.AssetImportTask()
task.set_editor_property("filename", str(SOURCE))
task.set_editor_property("destination_path", DESTINATION)
task.set_editor_property("automated", True)
task.set_editor_property("save", True)
task.set_editor_property("replace_existing", True)
task.set_editor_property("options", pipeline)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

# Les clips arrivent nommés « horse_pjl_normalized<clip> » : on les renomme « Horse_<clip> ».
renamed = []
for path in unreal.EditorAssetLibrary.list_assets(DESTINATION, False, False):
    asset = unreal.load_asset(path)
    if not isinstance(asset, unreal.AnimSequence):
        continue
    name = asset.get_name()
    clip = name.removeprefix("horse_pjl_normalized")
    if clip != name:
        target = f"{DESTINATION}/Horse_{clip}"
        assert unreal.EditorAssetLibrary.rename_asset(path, target), f"Renommage impossible : {path}"
        renamed.append(target)
unreal.EditorAssetLibrary.save_directory(DESTINATION)
assets = sorted(unreal.EditorAssetLibrary.list_assets(DESTINATION, False, False))
print("HORSE_NORMALIZED_IMPORTED", len(assets), assets)
