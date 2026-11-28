# Aller-retour Blender (bpy en module Python, sans interface) d'un personnage réaliste du jeu : import du GLB décompressé,
# contrôles (os, influences, formes du visage et du corps, taille, matières), export GLB. Le GLB exporté est ensuite
# comparé à l'original par scripts/humans/bpy/roundtrip-check.mjs, puis peut être chargé dans le jeu (variable REAL_GLB
# de tests/e2e/human-look.mjs) pour vérifier qu'il s'affiche et s'anime comme l'original.
# Ce script ne modifie pas les fichiers du jeu : il écrit seulement le rapport et le GLB exporté là où on le lui demande.
# Usage : <venv>/bin/python scripts/humans/bpy/roundtrip.py <entrée décompressée.glb> <sortie.glb> <rapport.json>
import bpy, sys, json
from mathutils import Vector

src, dst, rep = sys.argv[-3:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
out = {"blender": bpy.app.version_string, "source": src, "armature": arm.name, "bones": len(arm.data.bones), "meshes": [], "materials": sorted(m.name for m in bpy.data.materials), "problems": []}
lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    me = o.data
    sk = me.shape_keys
    keys = [k.name for k in sk.key_blocks[1:]] if sk else []
    over4 = unweighted = 0
    for v in me.vertices:
        ws = [g.weight for g in v.groups if g.weight > 1e-4]
        if len(ws) > 4:
            over4 += 1
        if not ws:
            unweighted += 1
        w = o.matrix_world @ v.co
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    out["meshes"].append({"name": o.name, "verts": len(me.vertices), "tris": sum(len(p.vertices) - 2 for p in me.polygons),
                          "shape_keys": keys, "groups": len(o.vertex_groups), "armature": any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers),
                          "over4": over4, "unweighted": unweighted, "materials": [m.name for m in me.materials if m]})
    if over4:
        out["problems"].append(f"{o.name}: {over4} sommets à plus de 4 influences")
out["bbox"] = {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi], "height": round(hi.z - lo.z, 3)}
# Formes conservées par build-humans.mjs : visage (signées), yeux (clignement, regard), corps (poids, muscles).
need = ["face_nose_width", "face_jaw_width", "blink_left", "blink_right", "look_left", "look_up", "body_weight", "body_muscle"]
allk = {k for m in out["meshes"] for k in m["shape_keys"]}
out["missing_keys"] = [k for k in need if k not in allk]
if out["missing_keys"]:
    out["problems"].append("formes absentes : " + ", ".join(out["missing_keys"]))
# Essai de déformation dans Blender : une forme à 1 doit déplacer des sommets du maillage principal.
base = max((o for o in bpy.data.objects if o.type == 'MESH' and o.data.shape_keys), key=lambda o: len(o.data.vertices), default=None)
if base:
    kb = base.data.shape_keys.key_blocks
    probe = {}
    for name in ("face_jaw_width", "blink_left", "body_weight"):
        k = kb.get(name)
        if k:
            d = max(((a.co - b.co).length for a, b in zip(k.data, kb[0].data)), default=0)
            probe[name] = round(d * 1000, 1)
    out["shape_probe_mm"] = probe
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_skins=True, export_morph=True, export_extras=True, export_animations=False, export_apply=False, export_yup=True)
out["exported"] = dst
json.dump(out, open(rep, "w"), indent=1, ensure_ascii=False)
print(json.dumps({k: out[k] for k in ("blender", "bones", "bbox", "missing_keys", "problems", "shape_probe_mm")}, ensure_ascii=False))
