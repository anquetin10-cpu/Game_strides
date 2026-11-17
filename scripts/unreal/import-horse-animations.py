"""Importe les FBX animation-only sur le squelette GLB correct du cheval."""

from pathlib import Path

import unreal


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".tmp" / "unreal-import" / "horse-animations"
DESTINATION = "/Game/Characters/Horse/horse_pjl_unreal/AnimationsFBX"
SKELETON = "/Game/Characters/Horse/horse_pjl_unreal/SkeletalMeshes/Object_426_Skeleton"

skeleton = unreal.load_asset(SKELETON)
assert skeleton, f"Squelette introuvable : {SKELETON}"
files = sorted(SOURCE.glob("horse_*.fbx"))
assert len(files) == 17, f"17 animations attendues, {len(files)} trouvées dans {SOURCE}"

tasks = []
for source in files:
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", False)
    options.set_editor_property("import_animations", True)
    options.set_editor_property("import_as_skeletal", True)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_ANIMATION)
    options.set_editor_property("skeleton", skeleton)
    options.anim_sequence_import_data.set_editor_property("import_bone_tracks", True)
    options.anim_sequence_import_data.set_editor_property("remove_redundant_keys", False)

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(source))
    task.set_editor_property("destination_path", DESTINATION)
    task.set_editor_property("destination_name", f"Horse_{source.stem.removeprefix('horse_')}")
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("options", options)
    tasks.append(task)

unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
objects = [obj.get_path_name() for task in tasks for obj in task.get_objects()]
assert len(objects) == 17, f"17 actifs attendus, {len(objects)} importés : {objects}"
print("HORSE_ANIMATIONS_IMPORTED", objects)
