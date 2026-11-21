# Analyse (bpy, Blender en module Python) du squelette d'un personnage réaliste : axes des os de la main et des doigts
# en pose de repos, pour poser les doigts autour des rênes dans le jeu (src/entities/realistic.js).
# Usage : <venv>/bin/python scripts/humans/bpy/hand_axes.py public/real/rider_f.glb
import bpy, sys, json
from mathutils import Vector
path = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
out = {"blender": bpy.app.version_string, "armature": arm.name, "bones": len(arm.data.bones), "meshes": [], "fingers": {}}
for o in bpy.data.objects:
    if o.type == 'MESH':
        sk = o.data.shape_keys
        out["meshes"].append({"name": o.name, "verts": len(o.data.vertices), "shape_keys": len(sk.key_blocks) - 1 if sk else 0,
                              "groups": len(o.vertex_groups), "armature_mod": any(m.type == 'ARMATURE' for m in o.modifiers)})
for side in ('l', 'r'):
    hand = arm.data.bones.get('hand_' + side)
    if not hand:
        continue
    for f in ('thumb', 'index', 'middle', 'ring', 'pinky'):
        b = arm.data.bones.get(f'{f}_01_{side}')
        if not b:
            continue
        m = b.matrix_local.to_3x3()
        out["fingers"][f'{f}_{side}'] = {"x": [round(v, 3) for v in m.col[0]], "y": [round(v, 3) for v in m.col[1]], "z": [round(v, 3) for v in m.col[2]],
                                          "head": [round(v, 3) for v in b.head_local], "tail": [round(v, 3) for v in b.tail_local]}
print(json.dumps(out, indent=1))
