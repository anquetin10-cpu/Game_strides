"""Exporte les 17 actions du cheval GLB en FBX animation-only pour Unreal.

Usage : blender -b --factory-startup --python scripts/unreal/export-horse-animations.py
"""

from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public" / "real" / "horse_pjl.glb"
OUTPUT = ROOT / ".tmp" / "unreal-import" / "horse-animations"
OUTPUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 0.01
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

armature = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
bpy.ops.object.select_all(action="DESELECT")
armature.select_set(True)
bpy.context.view_layer.objects.active = armature

exported = []
for action in sorted(bpy.data.actions, key=lambda item: item.name):
    armature.animation_data.action = action
    bpy.context.scene.frame_start = int(action.frame_range[0])
    bpy.context.scene.frame_end = int(action.frame_range[1])
    target = OUTPUT / f"horse_{action.name}.fbx"
    bpy.ops.export_scene.fbx(
        filepath=str(target),
        use_selection=True,
        object_types={"ARMATURE"},
        axis_forward="-Z",
        axis_up="Y",
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False,
        bake_anim_force_startend_keying=True,
        bake_anim_simplify_factor=0.0,
    )
    exported.append((action.name, target.stat().st_size))

print("HORSE_ANIMATIONS_EXPORTED", exported)
