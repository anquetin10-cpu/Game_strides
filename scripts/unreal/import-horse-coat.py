"""Importe le corps du cheval PJL avec ses masques de robe et crée les matériaux de robe et de crins (C1).

Prérequis : node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-horse-coat.mjs, puis
python3 scripts/unreal/coat-horse-glb.py (produit .tmp/unreal-import/horse_pjl_coat.glb).

Usage (éditeur sans rendu) :
  "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \
    -script="$PWD/scripts/unreal/import-horse-coat.py" -unattended -nosplash -nullrhi

Résultat sous /Game/Characters/Horse/horse_pjl_coat :
  - SK_HorseCoatBody : corps importé par Interchange avec le squelette du cheval déjà importé (Object_426_Skeleton : mêmes
    clips), échelle 0,01 comme import-horse-glb.py, UV en pleine précision (canaux 1 à 3 : masques et région), sans
    clips, sans asset physique, sans matériau importé ;
  - M_HorseCoat : port HLSL du shader de robe de src/entities/pjl/coat.js (makeCoatMaterial : #include <map_fragment>
    remplacé, satiné de #include <opaque_fragment> en émissif), deux faces, spéculaire 0 ;
  - M_HorseHair : port de makeHairMaterial (couleur des crins × luminance de la texture, masque à 0,35, deux faces).
Les valeurs par défaut des paramètres sont celles de la robe « bay » sans marque (palette de Content/Data/horse_coats.json) ;
le jeu pose celles du cheval engagé (strides::coatUniforms) sur des instances dynamiques.
Compte rendu : .tmp/unreal-import/import-horse-coat.log (dernière ligne « TERMINÉ »).
"""

import json
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".tmp" / "unreal-import" / "horse_pjl_coat.glb"
DATA = ROOT / "unreal" / "StridesGrandTour" / "Content" / "Data" / "horse_coats.json"
LOG = ROOT / ".tmp" / "unreal-import" / "import-horse-coat.log"
DEST = "/Game/Characters/Horse/horse_pjl_coat"
HORSE = "/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized"
lines = []


def log(msg):
    lines.append(msg)
    unreal.log(f"HORSE_COAT {msg}")
    LOG.write_text("\n".join(lines) + "\n")


assert SOURCE.exists(), f"Lancer d'abord coat-horse-glb.py : {SOURCE} absent"
coats = json.loads(DATA.read_text())
shader = coats["shader"]

# Port HLSL de coat.js (makeCoatMaterial, fragment). Correspondance des attributs : vCoatMask.xy = UV1, vCoatMask.zw = UV2,
# vRegion = UV3.x (constante sur chaque triangle, sommets dédoublés par coat-horse-glb.py), et pour la région :
# membres edge = UV3.y (0.04 + 0.03 * vnoise(vBindPos * 0.7)), tête halfW = uBlaze.w * UV3.y (0.85 + 0.3 * vnoise(…)).
COAT_HLSL = f"""// Port de src/entities/pjl/coat.js, makeCoatMaterial (GLSL {shader['bodyFragmentSha1']}).
// edge = {shader['edgeExpr']} ; halfW = uBlaze.w * ({shader['widthExpr']}) : évalués par sommet (UV3.y).
float L = dot(Tex.rgb, float3(0.299, 0.587, 0.114));
float region = M3.x;
float isLeg = (region > 0.5 && region < 4.5) ? 1.0 : 0.0;
float hoof = isLeg * (1.0 - smoothstep(0.035, 0.075, M1.y));
float detail = clamp(pow(L / 0.72, Detail), 0.35, 1.35);
float3 col = CoatColor;
// Pommelage (uDapples, robe dapplegrey) non porté : bruit de vBindPos sans canal (aucun cheval du jeu en dapplegrey).
float pts = M1.x * PointsAmt;
col = lerp(col, PointsColor, smoothstep(0.25, 0.85, pts));
float sock = 0.0;
if (isLeg > 0.5) {{
  float h = region < 1.5 ? Socks.x : region < 2.5 ? Socks.y : region < 3.5 ? Socks.z : Socks.w;
  float edge = M3.y;
  sock = (h > 0.0) ? 1.0 - smoothstep(h - edge, h + edge, M1.y) : 0.0;
}}
float blaze = 0.0;
if (Blaze.x > 0.5 && region > 4.5) {{
  float along = M1.y;
  float halfW = Blaze.w * M3.y;
  float inLen = smoothstep(Blaze.y - 0.03, Blaze.y + 0.03, along) * (1.0 - smoothstep(Blaze.z - 0.03, Blaze.z + 0.03, along));
  blaze = inLen * (1.0 - smoothstep(halfW - 0.08, halfW + 0.04, M2.y)) * smoothstep(0.15, 0.4, M2.x);
}}
float3 white = float3(0.93, 0.92, 0.9);
col = lerp(col, white, max(sock, blaze));
float3 recol = col * detail;
float3 horn = float3(0.09, 0.08, 0.075) * (0.7 + 0.6 * L);
return lerp(recol, horn, hoof);
"""
# #include <opaque_fragment> précédé du satiné : outgoingLight += (diffuseColor.rgb * 0.6 + 0.12) * fres * 0.22, avec
# fres = pow(1 - saturate(dot(normal, -V)), 3.5), V = direction de la surface vers la caméra (vViewPosition normalisé) ;
# terme ajouté à la lumière sortante, indépendant de l'éclairage : émissif.
SHEEN_HLSL = """float fres = pow(1.0 - saturate(dot(N, -V)), 3.5);
return (Base * 0.6 + 0.12) * fres * 0.22;
"""
HAIR_HLSL = f"""// Port de src/entities/pjl/coat.js, makeHairMaterial (GLSL {shader['hairFragmentSha1']}).
float L = dot(Tex.rgb, float3(0.299, 0.587, 0.114));
return HairColor * clamp(L / 0.7, 0.45, 1.4);
"""


def srgb_to_linear(hex_):
    out = []
    for k in range(3):
        c = int(hex_[1 + 2 * k:3 + 2 * k], 16) / 255
        out.append(c * 0.0773993808 if c < 0.04045 else (c * 0.9478672986 + 0.0521327014) ** 2.4)
    return out


bay = coats["palette"]["bay"]

# ---- 1. Corps (Interchange, squelette existant) ----
skeleton = unreal.load_asset(f"{HORSE}/SkeletalMeshes/Object_426_Skeleton")
assert skeleton, "squelette Object_426_Skeleton introuvable"
pipeline = unreal.InterchangeGenericAssetsPipeline()
# Échelle 1 : le corps d'origine (import-horse-glb.py) est à l'échelle du GLB (~100 fois trop grand ; l'option d'échelle
# 0,01 de sa tâche d'import n'a pas été appliquée) et le jeu le réduit par l'échelle 0,01 du composant
# (StridesHorse.cpp) ; le corps à masques doit avoir la même taille que le squelette partagé (vérifié ci-dessous).
pipeline.set_editor_property("import_offset_uniform_scale", 1.0)
pipeline.set_editor_property("asset_type_sub_folders", False)
common = pipeline.get_editor_property("common_skeletal_meshes_and_animations_properties")
common.set_editor_property("skeleton", skeleton)
meshes = pipeline.get_editor_property("common_meshes_properties")
meshes.set_editor_property("use_full_precision_u_vs", True)
mesh_pipeline = pipeline.get_editor_property("mesh_pipeline")
mesh_pipeline.set_editor_property("create_physics_asset", False)
mesh_pipeline.set_editor_property("import_static_meshes", False)
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
    ("sous-dossier de scène", pipeline.get_editor_property("scene_name_sub_folder")),
    ("sous-dossiers par type", pipeline.get_editor_property("asset_type_sub_folders")),
    ("squelette", common.get_editor_property("skeleton").get_path_name()),
    ("UV pleine précision", meshes.get_editor_property("use_full_precision_u_vs")),
    ("asset physique", mesh_pipeline.get_editor_property("create_physics_asset")),
    ("clips", animation.get_editor_property("import_animations")),
    ("matériaux", material.get_editor_property("import_materials")))))
# Import précédent retiré asset par asset (delete_directory seul a laissé le corps en place au deuxième essai).
if unreal.EditorAssetLibrary.does_directory_exist(DEST):
    for old_asset in unreal.EditorAssetLibrary.list_assets(DEST, True, False):
        assert unreal.EditorAssetLibrary.delete_asset(old_asset), f"suppression impossible : {old_asset}"
    unreal.EditorAssetLibrary.delete_directory(DEST)
# Import par le gestionnaire Interchange, pipeline imposé (l'option d'une AssetImportTask n'a pas été appliquée : sous-
# dossiers, nouveau squelette et asset physique créés au premier essai, 20/11/2026).
params = unreal.ImportAssetParameters()
params.set_editor_property("is_automated", True)
params.set_editor_property("replace_existing", True)
ov = params.get_editor_property("override_pipelines")
try:
    ov.append(unreal.SoftObjectPath(pipeline.get_path_name()))
except Exception as e:  # tableau d'objets pipeline (anciennes versions)
    log(f"override_pipelines : chemin refusé ({e}), objet passé")
    ov.append(pipeline)
params.set_editor_property("override_pipelines", ov)
source = unreal.InterchangeManager.create_source_data(str(SOURCE))
manager = unreal.InterchangeManager.get_interchange_manager_scripted()
log(f"import_asset : {manager.import_asset(DEST, source, params)}")
imported = [unreal.load_asset(p) for p in unreal.EditorAssetLibrary.list_assets(DEST, True, False)]
log("importés : " + ", ".join(f"{a.get_name()} ({type(a).__name__})" for a in imported if a))
body = next((a for a in imported if isinstance(a, unreal.SkeletalMesh)), None)
assert body, "aucun maillage squelettique importé"
if body.get_name() != "SK_HorseCoatBody":
    assert unreal.EditorAssetLibrary.rename_asset(body.get_path_name(), f"{DEST}/SK_HorseCoatBody"), "renommage impossible"
    body = unreal.load_asset(f"{DEST}/SK_HorseCoatBody")
assert body.get_editor_property("skeleton") == skeleton, "le corps n'utilise pas le squelette du cheval"
for a in imported:
    if a and not isinstance(a, unreal.SkeletalMesh) and not isinstance(a, unreal.Skeleton):
        log(f"autre asset importé laissé tel quel : {a.get_path_name()}")
orig = unreal.load_asset(f"{HORSE}/SkeletalMeshes/Object_426")
bo, bc = orig.get_imported_bounds(), body.get_imported_bounds()
ext = lambda b: [b.box_extent.x, b.box_extent.y, b.box_extent.z]
eo, ec = ext(bo), ext(bc)
gap = max(abs(a - b) for a, b in zip(eo, ec)) / max(eo)
log(f"corps : {body.get_path_name()}, squelette {skeleton.get_path_name()} ; demi-étendue {['%.2f' % x for x in ec]} contre {['%.2f' % x for x in eo]} pour le corps d'origine (écart {gap:.2e})")
assert gap < 1e-3, "corps à masques et corps d'origine de tailles différentes"

# ---- 2. Matériaux ----
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()


def new_material(name):
    path = f"{DEST}/{name}"
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
    m = tools.create_asset(name, DEST, unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("two_sided", True)
    m.set_editor_property("used_with_skeletal_mesh", True)
    return m


def custom(m, desc, code, inputs, out_type, x, y):
    c = mel.create_material_expression(m, unreal.MaterialExpressionCustom, x, y)
    c.set_editor_property("code", code)
    c.set_editor_property("description", desc)
    c.set_editor_property("output_type", out_type)
    ins = []
    for nm in inputs:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", nm)
        ins.append(ci)
    c.set_editor_property("inputs", ins)
    return c


def link(a, out, b, inp):
    assert mel.connect_material_expressions(a, out, b, inp), f"liaison {out} → {inp} refusée"


def vec_param(m, name, value, x, y):
    p = mel.create_material_expression(m, unreal.MaterialExpressionVectorParameter, x, y)
    p.set_editor_property("parameter_name", name)
    p.set_editor_property("default_value", unreal.LinearColor(*value))
    return p


def scal_param(m, name, value, x, y):
    p = mel.create_material_expression(m, unreal.MaterialExpressionScalarParameter, x, y)
    p.set_editor_property("parameter_name", name)
    p.set_editor_property("default_value", value)
    return p


def const(m, value, x, y):
    c = mel.create_material_expression(m, unreal.MaterialExpressionConstant, x, y)
    c.set_editor_property("r", value)
    return c


def tex_param(m, name, texture, x, y):
    t = mel.create_material_expression(m, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
    t.set_editor_property("parameter_name", name)
    t.set_editor_property("texture", texture)
    t.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
    return t


def uv(m, index, x, y):
    t = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, x, y)
    t.set_editor_property("coordinate_index", index)
    return t


body_tex = unreal.load_asset(f"{HORSE}/Textures/horse_pjl_normalized_texture_0")
hair_tex = unreal.load_asset(f"{HORSE}/Textures/horse_pjl_normalized_texture_2")
# Textures du GLB des matériaux d'origine (horse_body, horse_hair : paramètre BaseColorTexture).
for mi, tex in (("horse_body", body_tex), ("horse_hair", hair_tex)):
    inst = unreal.load_asset(f"{HORSE}/Materials/{mi}")
    used = [tp.parameter_value for tp in inst.get_editor_property("texture_parameter_values") if str(tp.parameter_info.name) == "BaseColorTexture"]
    assert used and used[0] == tex, f"{mi} : texture inattendue"

coat = new_material("M_HorseCoat")
t = tex_param(coat, "BaseColorTexture", body_tex, -1400, -200)
u1, u2, u3 = uv(coat, 1, -1400, 100), uv(coat, 2, -1400, 200), uv(coat, 3, -1400, 300)
p_coat = vec_param(coat, "CoatColor", srgb_to_linear(bay["body"]) + [1], -1400, 400)
p_points = vec_param(coat, "PointsColor", srgb_to_linear(bay["points"]) + [1], -1400, 520)
p_socks = vec_param(coat, "Socks", [0, 0, 0, 0], -1400, 640)
p_blaze = vec_param(coat, "Blaze", coats["blaze"]["none"], -1400, 760)
p_amt = scal_param(coat, "PointsAmt", bay["pointsAmt"], -1400, 880)
p_detail = scal_param(coat, "Detail", bay["detail"], -1400, 960)
p_rough = scal_param(coat, "Roughness", 0.48, -1400, 1040)
p_wet = scal_param(coat, "Wet", 0.0, -1400, 1120)
shade = custom(coat, "CoatShade (coat.js makeCoatMaterial)", COAT_HLSL, ["Tex", "M1", "M2", "M3", "CoatColor", "PointsColor", "PointsAmt", "Detail", "Socks", "Blaze"],
               unreal.CustomMaterialOutputType.CMOT_FLOAT3, -800, 0)
link(t, "RGB", shade, "Tex")
link(u1, "", shade, "M1")
link(u2, "", shade, "M2")
link(u3, "", shade, "M3")
link(p_coat, "", shade, "CoatColor")
link(p_points, "", shade, "PointsColor")
link(p_amt, "", shade, "PointsAmt")
link(p_detail, "", shade, "Detail")
# Paramètres vectoriels : sortie RGBA (4 composantes) pour les balzanes et la liste.
for p, name in ((p_socks, "Socks"), (p_blaze, "Blaze")):
    if not mel.connect_material_expressions(p, "RGBA", shade, name):
        app = mel.create_material_expression(coat, unreal.MaterialExpressionAppendVector, -1100, 700 if name == "Socks" else 800)
        link(p, "", app, "A")
        link(p, "A", app, "B")
        link(app, "", shade, name)
sheen = custom(coat, "Satiné (coat.js, opaque_fragment)", SHEEN_HLSL, ["Base", "N", "V"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -400, 300)
n_ws = mel.create_material_expression(coat, unreal.MaterialExpressionPixelNormalWS, -700, 400)
v_ws = mel.create_material_expression(coat, unreal.MaterialExpressionCameraVectorWS, -700, 500)
link(shade, "", sheen, "Base")
link(n_ws, "", sheen, "N")
link(v_ws, "", sheen, "V")
# Rugosité : roughnessFactor = mix(roughnessFactor, 0.32, uWet).
lerp = mel.create_material_expression(coat, unreal.MaterialExpressionLinearInterpolate, -700, 700)
link(p_rough, "", lerp, "A")
link(const(coat, 0.32, -900, 760), "", lerp, "B")
link(p_wet, "", lerp, "Alpha")
assert mel.connect_material_property(shade, "", unreal.MaterialProperty.MP_BASE_COLOR)
assert mel.connect_material_property(sheen, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
assert mel.connect_material_property(lerp, "", unreal.MaterialProperty.MP_ROUGHNESS)
assert mel.connect_material_property(const(coat, 0.0, -400, 800), "", unreal.MaterialProperty.MP_METALLIC)
# GLB : KHR_materials_specular, specularColorFactor (0, 0, 0) : réflectance F0 nulle (le facteur F90 de three.js, 1, n'a
# pas d'équivalent séparé dans Unreal).
assert mel.connect_material_property(const(coat, 0.0, -400, 880), "", unreal.MaterialProperty.MP_SPECULAR)
mel.recompile_material(coat)

hair = new_material("M_HorseHair")
hair.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
hair.set_editor_property("opacity_mask_clip_value", 0.35)
ht = tex_param(hair, "HairTexture", hair_tex, -900, 0)
p_hair = vec_param(hair, "HairColor", srgb_to_linear(bay["hair"]) + [1], -900, 300)
hshade = custom(hair, "HairShade (coat.js makeHairMaterial)", HAIR_HLSL, ["Tex", "HairColor"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -500, 0)
link(ht, "RGB", hshade, "Tex")
link(p_hair, "", hshade, "HairColor")
assert mel.connect_material_property(hshade, "", unreal.MaterialProperty.MP_BASE_COLOR)
assert mel.connect_material_property(ht, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
assert mel.connect_material_property(scal_param(hair, "Roughness", 0.62, -500, 300), "", unreal.MaterialProperty.MP_ROUGHNESS)
assert mel.connect_material_property(const(hair, 0.0, -500, 400), "", unreal.MaterialProperty.MP_METALLIC)
assert mel.connect_material_property(const(hair, 0.0, -500, 480), "", unreal.MaterialProperty.MP_SPECULAR)
mel.recompile_material(hair)

# Matériau du corps importé : robe (paramètres par défaut).
mats = body.get_editor_property("materials")
for sm in mats:
    sm.set_editor_property("material_interface", coat)
body.set_editor_property("materials", mats)
for a in (coat, hair, body):
    unreal.EditorAssetLibrary.save_loaded_asset(a, False)
log(f"matériaux : {coat.get_path_name()} ({mel.get_num_material_expressions(coat)} nœuds), {hair.get_path_name()} ({mel.get_num_material_expressions(hair)} nœuds)")
log("TERMINÉ")
