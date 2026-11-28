"""Importe dans Unreal la géométrie du parcours CSO du Pôle exportée du jeu web (tranche T5) : maillages des obstacles,
des lignes de départ et d'arrivée et du poteau « Chrono » (cso_fences.glb), textures des panneaux (sign_*.png),
matériaux, puis écrit la table des ressources lue par le jeu (Content/World/Cso/cso_assets.json).

Prérequis : export du jeu web en cours d'exécution (serveur Vite sur http://127.0.0.1:5173) :
  node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --fences
    -> .tmp/unreal-import/cso/ (cso_fences.glb, sign_*.png) et Content/World/Cso/cso_fences.json (manifeste)
Usage (commandlet, sans éditeur ouvert) :
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" \\
    "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \\
    -script="$PWD/scripts/unreal/import-cso-fences.py" -unattended -nosplash -nullrhi
Compte rendu : .tmp/unreal-import/import-cso-fences.log (dernière ligne « TERMINÉ … » si tout est importé).

Matériaux (valeurs du manifeste, lues dans le jeu web) : bois peint des obstacles et des lignes (couleur de sommet,
rugosité 0,42), poteau mat (rugosité 1, normales de face exportées), panneaux sans éclairage et double face (texture x
teinte : surlignage du numéro attendu). Mur : instances de matériaux du monde (MI_Brick pour les briques, MI_Plaster pour
la couvertine), le shader de surfaces du jeu web relevant de l'inventaire du monde.
"""

import json
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / ".tmp" / "unreal-import" / "cso"
CONTENT = ROOT / "unreal" / "StridesGrandTour" / "Content" / "World" / "Cso"
REPORT = open(ROOT / ".tmp" / "unreal-import" / "import-cso-fences.log", "w")

BASE = "/Game/World/Cso"
MAT = f"{BASE}/Materials"
TEX = f"{BASE}/Textures"
MESH = f"{BASE}/Meshes"

at = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary
MP = unreal.MaterialProperty


def log(*a):
    REPORT.write(" ".join(str(x) for x in a) + "\n")
    REPORT.flush()


manifest = json.loads((CONTENT / "cso_fences.json").read_text())
log("manifeste", manifest["schema"], len(manifest["meshes"]), "maillages,", len(manifest["textures"]), "textures")


# ---------------------------------------------------------------- Textures des panneaux
def import_texture(path, name):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(path))
    task.set_editor_property("destination_path", TEX)
    task.set_editor_property("destination_name", name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", False)
    at.import_asset_tasks([task])
    tex = eal.load_asset(f"{TEX}/{name}")
    assert tex, f"texture non importée : {path}"
    tex.set_editor_property("srgb", True)
    tex.set_editor_property("address_x", unreal.TextureAddress.TA_CLAMP)
    tex.set_editor_property("address_y", unreal.TextureAddress.TA_CLAMP)
    eal.save_loaded_asset(tex)
    return tex


if eal.does_directory_exist(TEX):
    eal.delete_directory(TEX)
textures = {}
for name, t in sorted(manifest["textures"].items()):
    textures[name] = import_texture(SRC / t["file"], f"T_{name}")
log("textures", len(textures))


# ---------------------------------------------------------------- Matériaux
def new_asset(name, folder, cls, factory):
    path = f"{folder}/{name}"
    if eal.does_asset_exist(path):
        eal.delete_asset(path)
    return at.create_asset(name, folder, cls, factory)


def expr(m, cls, x, y, **props):
    e = mel.create_material_expression(m, cls, x, y)
    for k, v in props.items():
        e.set_editor_property(k, v)
    return e


def link(a, a_out, b, b_in):
    assert mel.connect_material_expressions(a, a_out, b, b_in), f"liaison {a.get_name()}.{a_out} -> {b.get_name()}.{b_in}"


def out(e, e_out, prop):
    assert mel.connect_material_property(e, e_out, prop), f"sortie {e.get_name()}.{e_out} -> {prop}"


def finish(m):
    mel.layout_material_expressions(m)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    log("matériau", m.get_name(), "expressions", mel.get_num_material_expressions(m))


def make_instance(name, parent, scalars=None, vectors=None, tex=None):
    mi = new_asset(name, MAT, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mel.set_material_instance_parent(mi, parent)
    for k, v in (scalars or {}).items():
        mel.set_material_instance_scalar_parameter_value(mi, k, v)
    for k, v in (vectors or {}).items():
        mel.set_material_instance_vector_parameter_value(mi, k, unreal.LinearColor(*v))
    for k, v in (tex or {}).items():
        mel.set_material_instance_texture_parameter_value(mi, k, v)
    mel.update_material_instance(mi)
    eal.save_loaded_asset(mi)
    return mi


# Bois peint (MeshStandardMaterial à couleurs de sommet du jeu web) : couleur de sommet, rugosité et métal en paramètres.
paint = new_asset("M_CsoPaint", MAT, unreal.Material, unreal.MaterialFactoryNew())
vc = expr(paint, unreal.MaterialExpressionVertexColor, -600, 0)
out(vc, "", MP.MP_BASE_COLOR)
out(expr(paint, unreal.MaterialExpressionScalarParameter, -600, 200, parameter_name="Roughness", default_value=0.5), "", MP.MP_ROUGHNESS)
out(expr(paint, unreal.MaterialExpressionScalarParameter, -600, 300, parameter_name="Metallic", default_value=0.0), "", MP.MP_METALLIC)
finish(paint)

# Panneaux (MeshBasicMaterial, double face) : sans éclairage, texture x teinte (blanc, ou couleur du numéro attendu).
sign = new_asset("M_CsoSign", MAT, unreal.Material, unreal.MaterialFactoryNew())
sign.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
sign.set_editor_property("two_sided", bool(manifest["materials"]["sign"]["doubleSided"]))
first_tex = textures[sorted(textures)[0]]
tx = expr(sign, unreal.MaterialExpressionTextureSampleParameter2D, -700, 0, parameter_name="Label", texture=first_tex,
          sampler_type=unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
tint = expr(sign, unreal.MaterialExpressionVectorParameter, -700, 250, parameter_name="Tint", default_value=unreal.LinearColor(1, 1, 1, 1))
mul = expr(sign, unreal.MaterialExpressionMultiply, -300, 0)
link(tx, "RGB", mul, "A")
link(tint, "", mul, "B")
out(mul, "", MP.MP_EMISSIVE_COLOR)
finish(sign)

M = manifest["materials"]
SLOT = {
    "cso_paint": make_instance("MI_CsoPaint", paint, scalars={"Roughness": M["paint"]["roughness"], "Metallic": M["paint"]["metalness"]}),
    "cso_matte": make_instance("MI_CsoMatte", paint, scalars={"Roughness": M["matte"]["roughness"], "Metallic": M["matte"]["metalness"]}),
    "cso_wall_brick": eal.load_asset("/Game/World/Materials/MI_Brick"),
    "cso_wall_cap": eal.load_asset("/Game/World/Materials/MI_Plaster"),
    "cso_sign": make_instance("MI_CsoSign", sign),
}
for k, v in SLOT.items():
    assert v, f"matériau absent pour {k}"
signs = {}
for name, t in textures.items():
    signs[name] = make_instance(f"MI_Cso_{name}", sign, tex={"Label": t})
log("instances de panneaux", len(signs))


# ---------------------------------------------------------------- Maillages
def import_glb(path, dest):
    if eal.does_directory_exist(dest):
        eal.delete_directory(dest)
    pipeline = unreal.InterchangeGenericAssetsPipeline()
    mesh = pipeline.get_editor_property("mesh_pipeline")
    cur = mesh.get_editor_property("combine_static_meshes_behavior")
    opts = [n for n in dir(type(cur)) if n.isupper()]
    keep = next((n for n in opts if any(w in n for w in ("NOT", "NONE", "NEVER", "SEPARATE", "DONT"))), None)
    if keep:
        mesh.set_editor_property("combine_static_meshes_behavior", getattr(type(cur), keep))
    mesh.set_editor_property("build_nanite", False)
    mesh.set_editor_property("generate_lightmap_u_vs", False)
    mesh.set_editor_property("collision", False)
    pipeline.get_editor_property("material_pipeline").set_editor_property("import_materials", False)
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(path))
    task.set_editor_property("destination_path", dest)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", False)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("options", pipeline)
    at.import_asset_tasks([task])
    meshes = {}
    for p in eal.list_assets(dest, True, False):
        a = eal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            meshes[a.get_name()] = a
    log("import", path.name, "->", dest, len(meshes), "maillages")
    return meshes


imported = import_glb(SRC / manifest["glb"], MESH)
assets = {"schema": "strides.cso_assets/1", "source": "scripts/unreal/import-cso-fences.py", "meshes": {}, "materials": {}, "signs": {}}
worst = 0.0
for mid, info in sorted(manifest["meshes"].items()):
    sm = imported.get(mid) or imported.get(f"SM_{mid}")
    assert sm, f"maillage absent après import : {mid} ({len(imported)} importés)"
    mats = sm.get_editor_property("static_materials")
    for k, sl in enumerate(mats):
        slot = str(sl.get_editor_property("material_slot_name")).lower()
        hit = next((v for kk, v in SLOT.items() if kk in slot), None)
        assert hit, f"créneau de matériau inconnu {slot} ({mid})"
        sm.set_material(k, hit)
    # Repère : boîte englobante Unreal (cm) = boîte du manifeste (m, repère web) passée par x -> X, z -> Y, y -> Z.
    bb = sm.get_bounding_box()
    want_min = [info["min"][0] * 100, info["min"][2] * 100, info["min"][1] * 100]
    want_max = [info["max"][0] * 100, info["max"][2] * 100, info["max"][1] * 100]
    got_min = [bb.min.x, bb.min.y, bb.min.z]
    got_max = [bb.max.x, bb.max.y, bb.max.z]
    err = max(abs(a - b) for a, b in zip(got_min + got_max, want_min + want_max))
    worst = max(worst, err)
    if err > 0.05:
        log("ÉCART de boîte", mid, "attendu", want_min, want_max, "obtenu", got_min, got_max)
    eal.save_loaded_asset(sm)
    assets["meshes"][mid] = sm.get_path_name()
log("écart max des boîtes englobantes (cm)", round(worst, 4))
assert worst <= 0.05, "repère d'import différent de x -> X, z -> Y, y -> Z"
# Matériaux vides créés par Interchange pour les créneaux du GLB : remplacés ci-dessus, plus référencés.
for p in eal.list_assets(MESH, True, False):
    a = eal.load_asset(p)
    if isinstance(a, unreal.MaterialInterface):
        assert eal.delete_asset(p), f"matériau d'import non supprimé : {p}"
        log("matériau d'import supprimé", p)
for k, v in SLOT.items():
    assets["materials"][k] = v.get_path_name()
for name, mi in signs.items():
    assets["signs"][name] = mi.get_path_name()
eal.save_directory(BASE)
(CONTENT / "cso_assets.json").write_text(json.dumps(assets, ensure_ascii=False, indent=1) + "\n")
log("TERMINÉ", len(assets["meshes"]), "maillages,", len(assets["signs"]), "panneaux,", len(assets["materials"]), "matériaux")
REPORT.close()
