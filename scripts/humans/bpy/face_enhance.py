# Visage des personnages réalistes (Blender 5.3 en module Python, sans interface) — lot v3.
# Entrée : GLB intermédiaire non compressé (STAGE=raw node scripts/real/build-humans.mjs). Sortie : GLB repris par
# scripts/real/finalize-humans.mjs (compression meshopt vers public/real), et un rapport JSON.
#
# Ce que le modèle MakeHuman n'a pas, ajouté ici à partir de sa propre géométrie (méthodes des skills tiers
# blender-facial-shapekeys et character-artist) :
#  1. Expressions discrètes (formes) : sourire (commissures, joues, paupières inférieures), commissures abaissées,
#     lèvres pincées, sourcils levés, sourcils froncés, asymétrie légère (bosses aléatoires de 1 à 1,5 mm). Champs de
#     déplacement définis autour de repères mesurés sur le visage (yeux, commissures, lèvres d'après la couleur de la
#     texture de peau) et appliqués à la peau, aux sourcils et aux cils (mêmes déplacements aux mêmes endroits).
#  2. Occlusion ambiante calculée par Cycles sur la géométrie (orbites, narines, commissures, oreilles, sous le menton,
#     sous les cheveux) : du volume tiré de la forme réelle, pas peint.
#  3. Masque du cuir chevelu (peau sous les cheveux, à moins de 3 cm le long de la normale) : le jeu y teinte la peau de
#     la couleur des racines, ce qui supprime le liseré de peau claire au bord des cheveux (« bord de casque »).
#  4. Masque tête et cou (poids des os head et neck_01) : l'occlusion n'est appliquée qu'au visage et au cou (le reste
#     du corps bouge trop : bras, jambes).
# Les trois mesures sont rangées dans un attribut de couleur RGBA (R occlusion, G cuir chevelu, B tête/cou), exporté
# en COLOR_0 et renommé _FACE par finalize-humans.mjs.
# Usage : <venv>/bin/python scripts/humans/bpy/face_enhance.py <entrée.raw.glb> <sortie.glb> <rapport.json>
import bpy, sys, json, math, random
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

src, dst, rep = sys.argv[-3:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
report = {"blender": bpy.app.version_string, "source": src.split('/')[-1]}
body = bpy.data.objects['Body']
eyes = bpy.data.objects['Eyes']
hair = next(o for o in bpy.data.objects if o.name.startswith('Hair_'))
for o in bpy.data.objects:
    if o.type == 'MESH' and not o.data.materials:  # forme d'affichage des os créée par l'importeur
        o.hide_render = True

# ---------- Repères ----------
ev = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
eyeL = sum((v for v in ev if v.x > 0), Vector()) / max(1, sum(1 for v in ev if v.x > 0))
eyeR = sum((v for v in ev if v.x < 0), Vector()) / max(1, sum(1 for v in ev if v.x < 0))
eyeZ, eyeY = (eyeL.z + eyeR.z) / 2, (eyeL.y + eyeR.y) / 2
me = body.data
P = [body.matrix_world @ v.co for v in me.vertices]
N = [(body.matrix_world.to_3x3() @ v.normal).normalized() for v in me.vertices]
# Couleur de la texture de peau sous chaque sommet (moyenne des coins de faces qui le touchent).
img = next(n.image for n in bpy.data.materials['Skin'].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image.name.endswith('albedo'))
W_, H_ = img.size
px = np.empty(W_ * H_ * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(H_, W_, 4)
uv = me.uv_layers.active.data
col = [None] * len(me.vertices)
for poly in me.polygons:
    if me.materials[poly.material_index].name != 'Skin':
        continue
    for li in poly.loop_indices:
        vi = me.loops[li].vertex_index
        u, v = uv[li].uv
        c = px[min(H_ - 1, max(0, int(v * H_))), min(W_ - 1, max(0, int(u * W_)))]
        col[vi] = c[:3]
# Lèvres : sommets de la face avant entre le nez et le menton, nettement plus rouges que la peau voisine.
cand = [i for i, p in enumerate(P) if col[i] is not None and abs(p.x) < 0.04 and eyeZ - 0.10 < p.z < eyeZ - 0.035 and p.y < eyeY - 0.005]
red = {i: float(col[i][0] - (col[i][1] + col[i][2]) / 2) for i in cand}
vals = sorted(red.values())
thr = vals[int(len(vals) * 0.5)] + (vals[-1] - vals[int(len(vals) * 0.5)]) * 0.45
lips = [i for i in cand if red[i] > thr]
report["lips"] = {"candidats": len(cand), "levres": len(lips), "seuil": round(thr, 4)}
if len(lips) < 20:
    raise SystemExit("lèvres non trouvées : " + json.dumps(report))
lipP = [P[i] for i in lips]
mouthC = sum(lipP, Vector()) / len(lipP)
# Commissures : extrêmes latéraux des lèvres près de leur hauteur médiane (les ailes du nez, rougeâtres, sont plus haut).
zs = sorted(p.z for p in lipP)
zMid = zs[len(zs) // 2]
band = [p for p in lipP if abs(p.z - zMid) < 0.007]
cornerL = max(band, key=lambda p: p.x)
cornerR = min(band, key=lambda p: p.x)
report["reperes"] = {k: [round(c, 4) for c in v] for k, v in {"oeil_g": eyeL, "oeil_d": eyeR, "commissure_g": cornerL, "commissure_d": cornerR, "bouche": mouthC}.items()}

# ---------- Champs de déplacement (m, repère Blender : x gauche du personnage, -y avant, z haut) ----------
def fall(r, R):
    if r >= R:
        return 0.0
    q = 1 - (r / R) ** 2
    return q * q
def ell(p, c, rx, ry, rz):
    return math.sqrt(((p.x - c.x) / rx) ** 2 + ((p.y - c.y) / ry) ** 2 + ((p.z - c.z) / rz) ** 2)
lipSet = set(lips)
def f_smile(p, i):
    d = Vector()
    for s, c in ((1, cornerL), (-1, cornerR)):
        w = fall((p - c).length, 0.026)
        d += w * Vector((s * 0.003, 0.0014, 0.0038))
        cc = c + Vector((s * 0.012, -0.004, 0.024))  # pommette : remonte à peine (sans gonfler la joue)
        d += fall((p - cc).length, 0.024) * Vector((s * 0.0003, -0.0007, 0.0012))
    for e in (eyeL, eyeR):  # paupière inférieure (yeux qui sourient)
        le = e + Vector((0, -0.006, -0.012))
        d += fall(ell(p, le, 0.018, 0.012, 0.007), 1) * Vector((0, 0, 0.0011))
    return d
def f_frown(p, i):
    d = Vector()
    for s, c in ((1, cornerL), (-1, cornerR)):
        d += fall((p - c).length, 0.026) * Vector((-s * 0.0008, 0.0006, -0.0026))
    return d
def f_press(p, i):
    if i is None or i not in lipSet:
        w = fall(ell(p, mouthC, 0.03, 0.02, 0.014), 1) * 0.4
    else:
        w = 1.0
    up = 1 if p.z > mouthC.z else -1
    return w * Vector((0, 0.0011, -up * 0.0007))
def f_brow_up(p, i):
    d = Vector()
    for e in (eyeL, eyeR):
        b = e + Vector((0, -0.004, 0.026))
        w = fall(ell(p, b, 0.034, 0.03, 0.024), 1)
        if p.z < e.z + 0.006:
            w *= max(0.0, (p.z - (e.z - 0.004)) / 0.01)  # paupière supérieure à peine, globe jamais
        d += w * Vector((0, 0, 0.0038))
    return d
def f_brow_frown(p, i):
    d = Vector()
    for s, e in ((1, eyeL), (-1, eyeR)):
        b = Vector((s * 0.017, e.y - 0.006, e.z + 0.022))
        w = fall(ell(p, b, 0.02, 0.025, 0.018), 1)
        d += w * Vector((-s * 0.0016, -0.0004, -0.0026))
    return d
rng = random.Random(7)
bumps = [(Vector((rng.uniform(-0.05, 0.05), eyeY - 0.01, eyeZ + rng.uniform(-0.09, 0.04))), rng.uniform(0.012, 0.022), rng.choice((-1, 1)) * rng.uniform(0.0008, 0.0014)) for _ in range(7)]
def f_asym(p, i, n=None):
    d = 0.0
    for c, R, a in bumps:
        d += fall((p - c).length, R) * a
    return (n or Vector((0, -1, 0))) * d
FIELDS = [("face_smile", f_smile), ("face_frown", f_frown), ("lips_press", f_press), ("brow_up", f_brow_up), ("brow_frown", f_brow_frown), ("face_asym", f_asym)]

def add_keys(obj, isBody):
    if not obj.data.shape_keys:
        obj.shape_key_add(name="Basis", from_mix=False)
    basis = obj.data.shape_keys.key_blocks[0]
    mw = obj.matrix_world
    inv = mw.inverted().to_3x3()
    out = {}
    for name, fn in FIELDS:
        k = obj.shape_key_add(name=name, from_mix=False)
        mx = 0.0
        for vi, v in enumerate(obj.data.vertices):
            p = mw @ basis.data[vi].co
            if fn is f_asym:
                d = fn(p, vi if isBody else None, (mw.to_3x3() @ v.normal).normalized())
            else:
                d = fn(p, vi if isBody else None)
            k.data[vi].co = basis.data[vi].co + inv @ d
            mx = max(mx, d.length)
        out[name] = round(mx * 1000, 2)
    return out
report["formes_mm"] = {o.name: add_keys(o, o is body) for o in (body, bpy.data.objects['Eyebrows'], bpy.data.objects['Eyelashes'])}

# ---------- Occlusion ambiante (Cycles), cuir chevelu, masque tête/cou ----------
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 96
attr = me.color_attributes.new(name="FACE", type='FLOAT_COLOR', domain='POINT')
me.color_attributes.active_color = attr
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
sc.render.bake.target = 'VERTEX_COLORS'
sc.world = sc.world or bpy.data.worlds.new("W")
# Portée de 8 cm : seulement les creux du visage (orbites, narines, commissures, oreilles, sous le menton), pas l'ombre
# des épaules ou des vêtements.
sc.world.light_settings.distance = 0.08
bpy.ops.object.bake(type='AO')
ao = [attr.data[i].color[0] for i in range(len(me.vertices))]
# Cuir chevelu : rayon le long de la normale jusqu'aux cheveux.
hb = BVHTree.FromObject(hair, bpy.context.evaluated_depsgraph_get())
scalp = []
for p, n in zip(P, N):
    hit = hb.ray_cast(p + n * 0.0005, n, 0.03)
    scalp.append(0.0 if hit[0] is None else max(0.0, 1 - hit[3] / 0.03) ** 0.5)
# Tête et cou : poids des os.
gi = {g.name: g.index for g in body.vertex_groups}
hn = [gi.get('head'), gi.get('neck_01')]
headw = []
for v in me.vertices:
    w = sum(g.weight for g in v.groups if g.group in hn)
    headw.append(min(1.0, w))
for i in range(len(me.vertices)):
    attr.data[i].color = (ao[i], scalp[i], headw[i], 1.0)
face_ao = [ao[i] for i in range(len(ao)) if headw[i] > 0.5]
report["occlusion"] = {"tete_moy": round(sum(face_ao) / max(1, len(face_ao)), 3), "tete_min": round(min(face_ao), 3) if face_ao else None}
report["cuir_chevelu"] = {"sommets": sum(1 for s in scalp if s > 0.05)}

bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_skins=True, export_morph=True, export_extras=True,
                          export_animations=False, export_apply=False, export_yup=True,
                          export_vertex_color='ACTIVE', export_all_vertex_colors=False)
json.dump(report, open(rep, "w"), indent=1, ensure_ascii=False)
print(json.dumps(report, ensure_ascii=False))
