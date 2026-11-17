"""Crée sept clips squelettiques de cavalière et les exporte en FBX animation-only.

La pose source est déjà montée. Des cibles IK placent les poignets sur les
rênes et les chevilles dans les étriers ; les allures ajoutent respiration,
trot enlevé, suspension et accompagnement du saut.

Usage : blender -b --factory-startup --python scripts/unreal/export-rider-animations.py
"""

from math import pi, sin
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "unreal" / "ImportSource" / "rider_f_unreal.glb"
OUTPUT = ROOT / ".tmp" / "unreal-import" / "rider-animations"
OUTPUT.mkdir(parents=True, exist_ok=True)
FPS = 30


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS
bpy.context.scene.unit_settings.system = "METRIC"
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
armature = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")


def empty(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    return obj


targets = {name: empty(name) for name in ("hand_l", "hand_r", "foot_l", "foot_r")}
poles = {name: empty("pole_" + name) for name in targets}
for bone_name in targets:
    constraint = armature.pose.bones[bone_name].constraints.new("IK")
    constraint.name = "StridesIK"
    constraint.target = targets[bone_name]
    constraint.pole_target = poles[bone_name]
    constraint.chain_count = 2
    constraint.use_tail = False
    constraint.iterations = 64


CLIPS = {
    "idle": (60, 0.0, False),
    "walk": (36, 0.08, False),
    "trot": (24, 0.16, False),
    "canter": (30, 0.28, False),
    "gallop": (24, 0.40, False),
    "jump_canter": (42, 0.55, True),
    "jump_gallop": (34, 0.62, True),
}


def smoothstep(a, b, x):
    if x <= a:
        return 0.0
    if x >= b:
        return 1.0
    t = (x - a) / (b - a)
    return t * t * (3.0 - 2.0 * t)


def set_pose(frame, count, energy, jumping):
    phase = (frame - 1) / max(1, count - 1)
    wave = sin(phase * 2 * pi)
    if jumping:
        fold = smoothstep(0.0, 0.28, phase) * (1.0 - 0.55 * smoothstep(0.55, 1.0, phase))
        release = smoothstep(0.12, 0.42, phase)
    else:
        fold = energy * (0.72 + 0.16 * wave)
        release = 0.0

    # Repère du modèle : X latéral, Y vertical, Z avant. Les valeurs viennent
    # des points de selle/rênes/étriers du cheval source, ramenés au siège.
    hand_y = 1.02 + 0.018 * wave
    hand_z = 0.30 + 0.05 * energy + 0.18 * release
    foot_y = 0.292 + (0.008 * wave if not jumping else 0.015 * fold)
    foot_z = 0.22 - 0.018 * energy
    for side, sign in (("l", 1.0), ("r", -1.0)):
        hand = targets["hand_" + side]
        hand.location = (sign * 0.14, hand_y, hand_z)
        hand.keyframe_insert("location", frame=frame)
        foot = targets["foot_" + side]
        foot.location = (sign * 0.39, foot_y, foot_z)
        foot.keyframe_insert("location", frame=frame)

        elbow = poles["hand_" + side]
        elbow.location = (sign * 0.62, 0.92, 0.02)
        elbow.keyframe_insert("location", frame=frame)
        knee = poles["foot_" + side]
        knee.location = (sign * 0.56, 0.58, 0.55)
        knee.keyframe_insert("location", frame=frame)

    breath = sin(phase * 2 * pi) * (0.012 if energy < 0.1 else 0.006)
    armature.pose.bones["spine_01"].rotation_mode = "XYZ"
    armature.pose.bones["spine_02"].rotation_mode = "XYZ"
    armature.pose.bones["neck_01"].rotation_mode = "XYZ"
    armature.pose.bones["spine_01"].rotation_euler.x = fold * 0.30 + breath
    armature.pose.bones["spine_02"].rotation_euler.x = fold * 0.24 - breath * 0.5
    armature.pose.bones["neck_01"].rotation_euler.x = -fold * 0.34
    for name in ("spine_01", "spine_02", "neck_01"):
        armature.pose.bones[name].keyframe_insert("rotation_euler", frame=frame)


exported = []
for clip, (count, energy, jumping) in CLIPS.items():
    for obj in [armature, *targets.values(), *poles.values()]:
        obj.animation_data_clear()
    action = bpy.data.actions.new("Rider_" + clip)
    armature.animation_data_create()
    armature.animation_data.action = action
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = count
    sample_frames = sorted(set([1, count] + list(range(1, count + 1, 3))))
    for frame in sample_frames:
        bpy.context.scene.frame_set(frame)
        set_pose(frame, count, energy, jumping)

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    target = OUTPUT / f"rider_{clip}.fbx"
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
    exported.append((clip, target.stat().st_size))

print("RIDER_ANIMATIONS_EXPORTED", exported)
