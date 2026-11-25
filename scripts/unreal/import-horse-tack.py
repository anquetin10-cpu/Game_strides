"""Importe la sellerie du cheval WildMesh (étape S1) et crée son matériau.

Prérequis : export-rider-rules.mjs --sellerie-maillage=<travail>, puis tack-horse-glb.py --travail=<travail> (produit
<travail>/horse_pjl_tack.glb et Content/Data/pjl_horse_tack_mesh.json).

Usage (éditeur sans rendu ; dossier de travail par la variable d'environnement STRIDES_TACK_GLB) :
  STRIDES_TACK_GLB=<travail>/horse_pjl_tack.glb "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "<uproject>" -run=pythonscript \
    -script="<racine>/scripts/unreal/import-horse-tack.py" -unattended -nosplash -nullrhi

Résultat sous /Game/Characters/Horse/horse_pjl_tack :
  - SK_Tack_<pièce> (pad, padTrim, saddle, girth, bridle, bit, boots, bonnet) : une pièce par maillage, importée par
    Interchange avec le squelette du cheval (Object_426_Skeleton, comme le corps à masques de robe : même échelle 1, le jeu
    réduit par l'échelle 0,01 du composant), sans clips, sans asset physique, sans matériau importé ;
  - M_StridesTack : matériau de la sellerie, deux faces : couleur (VectorParameter Color, linéaire), rugosité, métal ; motif
    matelassé du tapis de pjl/view.js quiltMaterial (diffuseColor *= mix(0.78, 1, smoothstep(0, 0.06, min(l1, l2))),
    q = uv × (14, 12)) quand Quilt = 1 ;
  - MI_Tack_<pièce>, MI_Tack_iron, MI_Tack_leather, MI_Tack_rein : instances aux valeurs du web (pjl_horse_tack_mesh.json).
Compte rendu : <travail>/import-horse-tack.log (dernière ligne « TERMINÉ »).
"""

import json
import os
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get("STRIDES_TACK_GLB", str(ROOT / ".ue-cache" / "travail" / "sellerie" / "horse_pjl_tack.glb")))
DATA = ROOT / "unreal" / "StridesGrandTour" / "Content" / "Data" / "pjl_horse_tack_mesh.json"
LOG = SOURCE.parent / "import-horse-tack.log"
DEST = "/Game/Characters/Horse/horse_pjl_tack"
HORSE = "/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized"
lines = []


def log(msg):
    lines.append(msg)
    unreal.log(f"HORSE_TACK {msg}")
    LOG.write_text("\n".join(lines) + "\n")


assert SOURCE.exists(), f"Lancer d'abord tack-horse-glb.py : {SOURCE} absent"
data = json.loads(DATA.read_text())
skeleton = unreal.load_asset(f"{HORSE}/SkeletalMeshes/Object_426_Skeleton")
assert skeleton, "squelette Object_426_Skeleton introuvable"
pipeline = unreal.InterchangeGenericAssetsPipeline()
pipeline.set_editor_property("import_offset_uniform_scale", 1.0)
pipeline.set_editor_property("asset_type_sub_folders", False)
common = pipeline.get_editor_property("common_skeletal_meshes_and_animations_properties")
common.set_editor_property("skeleton", skeleton)
mesh_pipeline = pipeline.get_editor_property("mesh_pipeline")
mesh_pipeline.set_editor_property("create_physics_asset", False)
mesh_pipeline.set_editor_property("import_static_meshes", False)
# Une pièce par asset (setTackVisible du web masque les pièces une à une).
mesh_pipeline.set_editor_property("combine_skeletal_meshes_behavior", unreal.InterchangeCombineSkeletalMeshesBehavior.DO_NOT_COMBINE)
# Poids de peau sur 16 bits (le web les garde en flottants 32 bits).
mesh_pipeline.set_editor_property("use_high_precision_skin_weights", True)
animation = pipeline.get_editor_property("animation_pipeline")
animation.set_editor_property("import_animations", False)
material = pipeline.get_editor_property("material_pipeline")
material.set_editor_property("import_materials", False)
for prop in ("scene_name_sub_folder", "asset_type_sub_folders"):
    cur = pipeline.get_editor_property(prop)
    if isinstance(cur, bool):
        pipeline.set_editor_property(prop, False)
log("réglages : " + ", ".join(f"{k}={v}" for k, v in (
    ("échelle", pipeline.get_editor_property("import_offset_uniform_scale")),
    ("squelette", common.get_editor_property("skeleton").get_path_name()),
    ("maillages combinés", mesh_pipeline.get_editor_property("combine_skeletal_meshes_behavior")),
    ("poids 16 bits", mesh_pipeline.get_editor_property("use_high_precision_skin_weights")),
    ("asset physique", mesh_pipeline.get_editor_property("create_physics_asset")),
    ("clips", animation.get_editor_property("import_animations")),
    ("matériaux", material.get_editor_property("import_materials")))))
if unreal.EditorAssetLibrary.does_directory_exist(DEST):
    for old_asset in unreal.EditorAssetLibrary.list_assets(DEST, True, False):
        assert unreal.EditorAssetLibrary.delete_asset(old_asset), f"remplacement impossible : {old_asset}"
    unreal.EditorAssetLibrary.delete_directory(DEST)
params = unreal.ImportAssetParameters()
params.set_editor_property("is_automated", True)
params.set_editor_property("replace_existing", True)
ov = params.get_editor_property("override_pipelines")
try:
    ov.append(unreal.SoftObjectPath(pipeline.get_path_name()))
except Exception as e:
    log(f"override_pipelines : chemin refusé ({e}), objet passé")
    ov.append(pipeline)
params.set_editor_property("override_pipelines", ov)
source = unreal.InterchangeManager.create_source_data(str(SOURCE))
manager = unreal.InterchangeManager.get_interchange_manager_scripted()
log(f"import_asset : {manager.import_asset(DEST, source, params)}")
imported = [unreal.load_asset(p) for p in unreal.EditorAssetLibrary.list_assets(DEST, True, False)]
log("importés : " + ", ".join(f"{a.get_name()} ({type(a).__name__})" for a in imported if a))
meshes = {}
for a in imported:
    if isinstance(a, unreal.SkeletalMesh):
        assert a.get_editor_property("skeleton") == skeleton, f"{a.get_name()} n'utilise pas le squelette du cheval"
        names = [str(m.get_editor_property("material_slot_name")) for m in a.get_editor_property("materials")]
        piece = next((p["name"] for p in data["pieces"] if p["name"] in names or a.get_name().endswith(p["name"])), None)
        assert piece, f"{a.get_name()} : pièce inconnue (emplacements {names})"
        meshes[piece] = a
missing = [p["name"] for p in data["pieces"] if p["name"] not in meshes]
assert not missing, f"pièces non importées : {missing}"
for piece, a in list(meshes.items()):
    target = f"{DEST}/SK_Tack_{piece[5:]}"
    if a.get_path_name().split(".")[0] != target:
        assert unreal.EditorAssetLibrary.rename_asset(a.get_path_name().split(".")[0], target), f"renommage impossible : {piece}"
        meshes[piece] = unreal.load_asset(target)
for a in imported:
    if a and not isinstance(a, (unreal.SkeletalMesh, unreal.Skeleton)):
        log(f"autre asset importé : {a.get_path_name()} ({type(a).__name__})")

# ---- Matériau ----
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
QUILT_HLSL = """// pjl/view.js quiltMaterial : diffuseColor.rgb *= mix(0.78, 1.0, quilt) quand Quilt = 1.
float2 q = UV * float2(14.0, 12.0);
float l1 = abs(frac(q.x + q.y) - 0.5);
float l2 = abs(frac(q.x - q.y) - 0.5);
float quilt = smoothstep(0.0, 0.06, min(l1, l2));
return Color * lerp(1.0, lerp(0.78, 1.0, quilt), Quilt);"""
m = tools.create_asset("M_StridesTack", DEST, unreal.Material, unreal.MaterialFactoryNew())
m.set_editor_property("two_sided", True)
m.set_editor_property("used_with_skeletal_mesh", True)


def param(cls, name, value, x, y):
    p = mel.create_material_expression(m, cls, x, y)
    p.set_editor_property("parameter_name", name)
    p.set_editor_property("default_value", value)
    return p


p_col = param(unreal.MaterialExpressionVectorParameter, "Color", unreal.LinearColor(0.5, 0.5, 0.5, 1), -900, 0)
p_q = param(unreal.MaterialExpressionScalarParameter, "Quilt", 0.0, -900, 200)
p_r = param(unreal.MaterialExpressionScalarParameter, "Roughness", 0.5, -500, 300)
p_m = param(unreal.MaterialExpressionScalarParameter, "Metallic", 0.0, -500, 400)
uv = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -900, 300)
c = mel.create_material_expression(m, unreal.MaterialExpressionCustom, -500, 0)
c.set_editor_property("code", QUILT_HLSL)
c.set_editor_property("description", "Quilt (pjl/view.js quiltMaterial)")
c.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
ins = []
for nm in ("Color", "UV", "Quilt"):
    ci = unreal.CustomInput()
    ci.set_editor_property("input_name", nm)
    ins.append(ci)
c.set_editor_property("inputs", ins)
assert mel.connect_material_expressions(p_col, "", c, "Color")
assert mel.connect_material_expressions(uv, "", c, "UV")
assert mel.connect_material_expressions(p_q, "", c, "Quilt")
assert mel.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
assert mel.connect_material_property(p_r, "", unreal.MaterialProperty.MP_ROUGHNESS)
assert mel.connect_material_property(p_m, "", unreal.MaterialProperty.MP_METALLIC)
mel.recompile_material(m)
unreal.EditorAssetLibrary.save_loaded_asset(m, False)


def instance(name, spec, quilt=False):
    mi = tools.create_asset(name, DEST, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mel.set_material_instance_parent(mi, m)
    col = spec["color"]
    mel.set_material_instance_vector_parameter_value(mi, "Color", unreal.LinearColor(col[0], col[1], col[2], 1))
    mel.set_material_instance_scalar_parameter_value(mi, "Roughness", spec["roughness"])
    mel.set_material_instance_scalar_parameter_value(mi, "Metallic", spec["metalness"])
    mel.set_material_instance_scalar_parameter_value(mi, "Quilt", 1.0 if quilt else 0.0)
    unreal.EditorAssetLibrary.save_loaded_asset(mi, False)
    return mi


for p in data["pieces"]:
    mi = instance(f"MI_Tack_{p['name'][5:]}", p["material"], p["material"]["quilt"])
    a = meshes[p["name"]]
    mats = a.get_editor_property("materials")
    for sm in mats:
        sm.set_editor_property("material_interface", mi)
    a.set_editor_property("materials", mats)
    unreal.EditorAssetLibrary.save_loaded_asset(a, False)
    b = a.get_imported_bounds()
    log(f"{a.get_path_name()} : {p['vertices']} sommets dans le web, demi-étendue {[round(v, 2) for v in (b.box_extent.x, b.box_extent.y, b.box_extent.z)]}, matériau {mi.get_name()}")
for k in ("iron", "leather", "rein"):
    instance(f"MI_Tack_{k}", data[k]["material"])
log("TERMINÉ")
