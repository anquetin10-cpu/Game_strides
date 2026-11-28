"""Importe les décors du monde dans Unreal : textures photo (Poly Haven, CC0), cartes du sol et végétation exportées du
jeu web, matériaux maîtres et instances, maillages (architecture, arbres, haies), puis écrit le manifeste lu par le jeu
(Content/Data/World/world_assets.json).

Prérequis, dans l'ordre :
  zsh scripts/unreal/fetch-world-textures.sh                      # textures CC0 -> .tmp/unreal-import/world-textures
  python3 scripts/unreal/world-export-receiver.py &                # récepteur local
  npx vite ; ouvrir /scripts/unreal/world-export.html              # export du monde web -> .tmp/unreal-import/world-scene
  python3 scripts/unreal/prepare-world.py                          # carte des matériaux, normale de l'eau, données
Usage (commandlet, sans éditeur ouvert) :
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" \
    "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \
    -script="$PWD/scripts/unreal/import-world.py" -unattended -nosplash -nullrhi
Compte rendu : .tmp/unreal-import/import-world.log
"""

import json
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[2]
PHOTO = ROOT / ".tmp" / "unreal-import" / "world-textures"
SCENE = ROOT / ".tmp" / "unreal-import" / "world-scene"
DATA = ROOT / "unreal" / "StridesGrandTour" / "Content" / "Data" / "World"
REPORT = open(ROOT / ".tmp" / "unreal-import" / "import-world.log", "w")

TEX_PHOTO = "/Game/World/Textures/Photo"
TEX_SCENE = "/Game/World/Textures/Scene"
MAT = "/Game/World/Materials"
MESH = "/Game/World/Meshes"

at = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary


def log(*a):
    REPORT.write(" ".join(str(x) for x in a) + "\n")
    REPORT.flush()


# Couleur moyenne (sRGB) de chaque texture photo, mesurée sur l'image 2K (Blender) : le détail photo est normalisé
# par sa moyenne puis teinté par la couleur voulue (carte du sol ou couleur peinte du jeu web).
MEANS_SRGB = {
    "asphalt_02": [0.3552, 0.3526, 0.3319], "bark_brown_02": [0.3721, 0.3373, 0.2505],
    "black_painted_planks": [0.1014, 0.1073, 0.1265], "coast_sand_01": [0.508, 0.4488, 0.359],
    "cobblestone_floor_01": [0.5599, 0.5101, 0.4319], "damp_beach_sand": [0.4236, 0.3772, 0.3014],
    "dirt_floor": [0.7216, 0.5432, 0.3902], "forest_leaves_02": [0.5562, 0.4401, 0.2297],
    "gravel_floor_02": [0.6678, 0.652, 0.6094], "leafy_grass": [0.5913, 0.5152, 0.3498],
    "red_brick_03": [0.4169, 0.3279, 0.2957], "rock_face_03": [0.5132, 0.4123, 0.315],
    "roof_slates_02": [0.5631, 0.5238, 0.4606], "sand_01": [0.6519, 0.5862, 0.4364],
    "sparse_grass": [0.3116, 0.2414, 0.0846], "weathered_planks": [0.3139, 0.2637, 0.2322],
    "white_plaster_02": [0.5535, 0.5293, 0.4804],
}


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


MEANS = {k: [lin(c) for c in v] for k, v in MEANS_SRGB.items()}


def hlsl3(v):
    return "float3(%.5f, %.5f, %.5f)" % tuple(v)


# ---------------------------------------------------------------- Textures
def import_texture(path, dest, name, kind, max_size=0, clamp=False):
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(path))
    task.set_editor_property("destination_path", dest)
    task.set_editor_property("destination_name", name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", False)
    at.import_asset_tasks([task])
    tex = eal.load_asset(f"{dest}/{name}")
    assert tex, f"texture non importée : {path}"
    if kind == "normal":
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
        tex.set_editor_property("srgb", False)
        tex.set_editor_property("flip_green_channel", True)  # normales OpenGL -> DirectX (Unreal)
    elif kind == "normal_dx":
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
        tex.set_editor_property("srgb", False)
    elif kind == "mask":
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
        tex.set_editor_property("srgb", False)
    elif kind == "data":
        tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_VECTOR_DISPLACEMENTMAP)
        tex.set_editor_property("srgb", False)
    if max_size:
        tex.set_editor_property("max_texture_size", max_size)
    if clamp:
        tex.set_editor_property("address_x", unreal.TextureAddress.TA_CLAMP)
        tex.set_editor_property("address_y", unreal.TextureAddress.TA_CLAMP)
    eal.save_loaded_asset(tex)
    return tex


PHOTO_SETS = {}
TERRAIN_LAYERS = {"leafy_grass", "sparse_grass", "dirt_floor", "sand_01", "damp_beach_sand", "gravel_floor_02", "coast_sand_01"}
for d in sorted(PHOTO.iterdir()):
    if not d.is_dir():
        continue
    i = d.name
    size = 2048 if i in TERRAIN_LAYERS else 1024
    PHOTO_SETS[i] = {
        "D": import_texture(d / f"{i}_Diffuse_2k.jpg", f"{TEX_PHOTO}/{i}", f"T_{i}_D", "color", size),
        "N": import_texture(d / f"{i}_nor_gl_2k.jpg", f"{TEX_PHOTO}/{i}", f"T_{i}_N", "normal", 1024),
        "A": import_texture(d / f"{i}_arm_2k.jpg", f"{TEX_PHOTO}/{i}", f"T_{i}_ARM", "mask", 1024),
    }
log("textures photo", len(PHOTO_SETS))

SC = {
    "ground_color": import_texture(SCENE / "ground_color.png", TEX_SCENE, "T_GroundColor", "color", 2048, clamp=True),
    "ground_splat": import_texture(SCENE / "ground_splat.png", TEX_SCENE, "T_GroundSplat", "data", 1024, clamp=True),
    "leaf": import_texture(SCENE / "leaf_atlas.png", TEX_SCENE, "T_LeafAtlas", "color", 1024),
    "hedge": import_texture(SCENE / "hedge.png", TEX_SCENE, "T_Hedge", "color", 512),
    "hedge_n": import_texture(SCENE / "hedge_n.png", TEX_SCENE, "T_Hedge_N", "normal", 512),
    "water_n": import_texture(SCENE / "water_normal.png", TEX_SCENE, "T_WaterNormal", "normal_dx", 512),
    "birch": import_texture(SCENE / "bark_birch.png", TEX_SCENE, "T_Bark_Birch", "color", 512),
    "birch_n": import_texture(SCENE / "bark_birch_n.png", TEX_SCENE, "T_Bark_Birch_N", "normal", 512),
}
log("textures du monde web", len(SC))


# ---------------------------------------------------------------- Matériaux
def new_asset(name, folder, cls, factory):
    path = f"{folder}/{name}"
    if eal.does_asset_exist(path):
        eal.delete_asset(path)
    return at.create_asset(name, folder, cls, factory)


def new_material(name, **props):
    m = new_asset(name, MAT, unreal.Material, unreal.MaterialFactoryNew())
    for k, v in props.items():
        m.set_editor_property(k, v)
    return m


def expr(m, cls, x, y, **props):
    e = mel.create_material_expression(m, cls, x, y)
    for k, v in props.items():
        e.set_editor_property(k, v)
    return e


def link(a, a_out, b, b_in):
    assert mel.connect_material_expressions(a, a_out, b, b_in), f"liaison {a.get_name()}.{a_out} -> {b.get_name()}.{b_in}"


def out(e, e_out, prop):
    assert mel.connect_material_property(e, e_out, prop), f"sortie {e.get_name()}.{e_out} -> {prop}"


def scalar(m, name, value, x, y):
    return expr(m, unreal.MaterialExpressionScalarParameter, x, y, parameter_name=name, default_value=value)


def vector(m, name, value, x, y):
    return expr(m, unreal.MaterialExpressionVectorParameter, x, y, parameter_name=name, default_value=unreal.LinearColor(*value))


def uv(m, index, scale_param, scale, x, y):
    tc = expr(m, unreal.MaterialExpressionTextureCoordinate, x, y, coordinate_index=index)
    if scale_param is None:
        return tc
    mul = expr(m, unreal.MaterialExpressionMultiply, x + 150, y)
    link(tc, "", mul, "A")
    link(scalar(m, scale_param, scale, x, y + 60), "", mul, "B")
    return mul


SAMPLER = {
    "color": unreal.MaterialSamplerType.SAMPLERTYPE_COLOR,
    "normal": unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL,
    "mask": unreal.MaterialSamplerType.SAMPLERTYPE_MASKS,
    "data": unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR,
}


def sample(m, name, tex, kind, coords, x, y, shared=True):
    e = expr(m, unreal.MaterialExpressionTextureSampleParameter2D, x, y, parameter_name=name, texture=tex, sampler_type=SAMPLER[kind])
    if shared:
        e.set_editor_property("sampler_source", unreal.SamplerSourceMode.SSM_WRAP_WORLD_GROUP_SETTINGS)
    if coords is not None:
        link(coords, "", e, "UVs")
    return e


def custom(m, code, inputs, outputs, x, y):
    c = expr(m, unreal.MaterialExpressionCustom, x, y, code=code, output_type=unreal.CustomMaterialOutputType.CMOT_FLOAT3, description="Strides")
    ins = []
    for n in inputs:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", n)
        ins.append(ci)
    c.set_editor_property("inputs", ins)
    outs = []
    for n, t in outputs:
        co = unreal.CustomOutput()
        co.set_editor_property("output_name", n)
        co.set_editor_property("output_type", t)
        outs.append(co)
    c.set_editor_property("additional_outputs", outs)
    return c


F1 = unreal.CustomMaterialOutputType.CMOT_FLOAT1
F3 = unreal.CustomMaterialOutputType.CMOT_FLOAT3
MP = unreal.MaterialProperty


def finish(m):
    mel.layout_material_expressions(m)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    log("matériau", m.get_name(), "expressions", mel.get_num_material_expressions(m))


def make_instance(name, parent, scalars=None, vectors=None, textures=None):
    mi = new_asset(name, MAT, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    mel.set_material_instance_parent(mi, parent)
    for k, v in (scalars or {}).items():
        mel.set_material_instance_scalar_parameter_value(mi, k, v)
    for k, v in (vectors or {}).items():
        mel.set_material_instance_vector_parameter_value(mi, k, unreal.LinearColor(*v))
    for k, v in (textures or {}).items():
        mel.set_material_instance_texture_parameter_value(mi, k, v)
    mel.update_material_instance(mi)
    eal.save_loaded_asset(mi)
    return mi


# --- Sol : détail photo par matériau (carte du sol web), teinté par les couleurs peintes du jeu web.
def build_terrain():
    m = new_material("M_WorldTerrain")
    uv_d = uv(m, 0, "DetailScale", 1 / 2.6, -1800, 0)  # UV0 en mètres
    uv_b = uv(m, 0, "BreakupScale", 1 / 23.0, -1800, 300)
    uv_m = uv(m, 1, None, 0, -1800, 600)  # UV1 : carré du monde, 0..1
    P = PHOTO_SETS
    s = {}
    y = -1200
    for key, tid in [("G", "leafy_grass"), ("D", "dirt_floor"), ("S", "sand_01"), ("W", "damp_beach_sand"), ("H", "gravel_floor_02")]:
        s[key + "D"] = sample(m, f"{key}_Color", P[tid]["D"], "color", uv_d, -1300, y)
        s[key + "N"] = sample(m, f"{key}_Normal", P[tid]["N"], "normal", uv_d, -1300, y + 220)
        if key != "W":
            s[key + "A"] = sample(m, f"{key}_ARM", P[tid]["A"], "mask", uv_d, -1300, y + 440)
        y += 700
    s["G2"] = sample(m, "Breakup", P["sparse_grass"]["D"], "color", uv_b, -1300, y)
    col = sample(m, "GroundColor", SC["ground_color"], "color", uv_m, -1300, y + 250, shared=False)
    spl = sample(m, "GroundSplat", SC["ground_splat"], "data", uv_m, -1300, y + 500, shared=False)
    wpos = expr(m, unreal.MaterialExpressionWorldPosition, -1300, y + 750)
    zcm = expr(m, unreal.MaterialExpressionComponentMask, -1150, y + 750, r=False, g=False, b=True, a=False)
    link(wpos, "", zcm, "")
    zm = expr(m, unreal.MaterialExpressionMultiply, -1000, y + 750, const_b=0.01)
    link(zcm, "", zm, "A")
    prm = vector(m, "Tuning", (1.0, 1.6, 1.15, 0.92), -1300, y + 900)  # x contraste du détail, y niveau mouillé (m), z normales, w saturation
    prm2 = vector(m, "Tuning2", (0.74, 0, 0, 0), -1300, y + 1050)  # x facteur d'albédo (couleurs web -> albédos naturels)
    code = """
float4 w = max(SPL, 0.0);
float sw = w.r + w.g + w.b + w.a;
w = sw > 0.001 ? w / sw : float4(1, 0, 0, 0);
const float3 L = float3(0.2126, 0.7152, 0.0722);
float3 rg = GD / MGRASS; rg = lerp(dot(GD, L) / dot(MGRASS, L), rg, 0.45);
rg *= lerp(1.0, dot(G2, L) / dot(MBREAK, L), 0.3);
float3 rd = DD / MDIRT; rd = lerp(dot(DD, L) / dot(MDIRT, L), rd, 0.5);
float wet = saturate((P.y - WZ) / 1.4);
float3 rs = lerp(SD / MSAND, WD / MWET, wet); rs = lerp(dot(rs, L), rs, 0.5);
float3 rh = HD / MHARD;
float3 ratio = w.r * rg + w.g * rd + w.b * rs + w.a * rh;
float3 albedo = COL * lerp(1.0, ratio, P.x);
albedo *= lerp(1.0, 0.6, wet * w.b);
albedo = lerp(dot(albedo, L).xxx, albedo, P.w) * P2.x;
float3 n = w.r * GN + w.g * DN + w.b * lerp(SN, WN, wet) + w.a * HN;
n.xy *= P.z;
NRM = normalize(n);
ROUGH = saturate(w.r * GA.g + w.g * DA.g + w.b * lerp(SA.g, 0.32, wet) + w.a * HA.g);
AO = saturate(w.r * GA.r + w.g * DA.r + w.b * SA.r + w.a * HA.r);
return max(albedo, 0.0);
"""
    for k, v in {"MGRASS": MEANS["leafy_grass"], "MBREAK": MEANS["sparse_grass"], "MDIRT": MEANS["dirt_floor"], "MSAND": MEANS["sand_01"], "MWET": MEANS["damp_beach_sand"], "MHARD": MEANS["gravel_floor_02"]}.items():
        code = code.replace(k, hlsl3(v))
    names = ["GD", "GN", "GA", "DD", "DN", "DA", "SD", "SN", "SA", "WD", "WN", "HD", "HN", "HA", "G2", "COL", "SPL", "WZ", "P", "P2"]
    c = custom(m, code, names, [("NRM", F3), ("ROUGH", F1), ("AO", F1)], -600, 0)
    for n in names[:15]:
        link(s[n], "RGB", c, n)
    link(col, "RGB", c, "COL")
    link(spl, "RGBA", c, "SPL")
    link(zm, "", c, "WZ")
    link(prm, "RGBA", c, "P")
    link(prm2, "RGBA", c, "P2")
    out(c, "", MP.MP_BASE_COLOR)
    out(c, "NRM", MP.MP_NORMAL)
    out(c, "ROUGH", MP.MP_ROUGHNESS)
    out(c, "AO", MP.MP_AMBIENT_OCCLUSION)
    finish(m)
    return m


# --- Surfaces construites : couleur peinte du jeu web (couleur de sommet) x détail photo normalisé.
SURFACE_CODE = """
const float3 L = float3(0.2126, 0.7152, 0.0722);
float3 r = D / max(MEAN, 0.01);
r = lerp(dot(D, L) / max(dot(MEAN, L), 0.01), r, Q2.x);
float3 n = N; n.xy *= Q.z;
NRM = normalize(n);
ROUGH = saturate(A.g * Q.y + Q.w);
AO = lerp(1.0, A.r, 0.85);
return max(VC * TINT * lerp(1.0, r, Q.x), 0.0);
"""


def build_surface(name, instanced=False, masked=False, two_sided=False):
    props = {}
    if masked:
        props["blend_mode"] = unreal.BlendMode.BLEND_MASKED
    if two_sided:
        props["two_sided"] = True
    m = new_material(name, **props)
    if instanced:
        m.set_editor_property("used_with_instanced_static_meshes", True)
    coords = uv(m, 0, "UVScale", 0.5, -1500, 0)
    P = PHOTO_SETS["white_plaster_02"]
    d = sample(m, "Color", P["D"], "color", coords, -1100, -300)
    n = sample(m, "Normal", P["N"], "normal", coords, -1100, 0)
    a = sample(m, "ARM", P["A"], "mask", coords, -1100, 300)
    vc = expr(m, unreal.MaterialExpressionVertexColor, -1100, 600)
    mean = vector(m, "Mean", MEANS["white_plaster_02"] + [1], -1100, 750)
    q = vector(m, "Detail", (0.8, 1.0, 1.0, 0.0), -1100, 900)  # x intensité du détail, y/w rugosité (x, +), z normales
    q2 = vector(m, "Detail2", (0.5, 0, 0, 0), -1100, 1050)  # x part de teinte de la photo
    if instanced:
        # Teinte par instance (3 flottants de données d'instance) ; 1 hors instanciation.
        tint = expr(m, unreal.MaterialExpressionAppendVector, -800, 1200)
        rg = expr(m, unreal.MaterialExpressionAppendVector, -900, 1200)
        cd = [expr(m, unreal.MaterialExpressionPerInstanceCustomData, -1100, 1200 + 120 * k, data_index=k, const_default_value=1.0) for k in range(3)]
        link(cd[0], "", rg, "A")
        link(cd[1], "", rg, "B")
        link(rg, "", tint, "A")
        link(cd[2], "", tint, "B")
    else:
        tint = expr(m, unreal.MaterialExpressionConstant3Vector, -1100, 1200, constant=unreal.LinearColor(1, 1, 1, 1))
    c = custom(m, SURFACE_CODE, ["VC", "D", "N", "A", "MEAN", "Q", "Q2", "TINT"], [("NRM", F3), ("ROUGH", F1), ("AO", F1)], -500, 0)
    link(vc, "", c, "VC")
    link(d, "RGB", c, "D")
    link(n, "RGB", c, "N")
    link(a, "RGB", c, "A")
    link(mean, "", c, "MEAN")
    link(q, "RGBA", c, "Q")
    link(q2, "RGBA", c, "Q2")
    link(tint, "", c, "TINT")
    out(c, "", MP.MP_BASE_COLOR)
    out(c, "NRM", MP.MP_NORMAL)
    out(c, "ROUGH", MP.MP_ROUGHNESS)
    out(c, "AO", MP.MP_AMBIENT_OCCLUSION)
    if masked:
        out(d, "A", MP.MP_OPACITY_MASK)
    finish(m)
    return m


COLOMBAGE_CODE = """
float3 c = pow(max(VC, 0.0), 1.0 / 2.2);
float code = floor((1.0 - c.r) * 10.0 + 0.5);
float woodI = floor((1.0 - c.b) * 10.0 + 0.5);
float3 woodC = woodI < 0.5 ? float3(0.105, 0.07, 0.045) : (woodI < 1.5 ? float3(0.085, 0.11, 0.09) : float3(0.17, 0.04, 0.03));
const float3 L = float3(0.2126, 0.7152, 0.0722);
float3 woodTex = woodC * lerp(1.0, WD / WMEAN, 0.8) * 1.6;
bool vertical = abs(WNRM.z) < 0.25;
float2 uv = U;
float pxw = length(fwidth(uv));
if (code > 4.5 || !vertical)
{
    NRM = WN; ROUGH = 0.88;
    return woodTex;
}
float P = code > 3.5 ? 1.05 : 0.46;
float si = floor(uv.x / P + 0.5);
float sid = frac(sin(si * 12.9898 + 7.13 * 78.233) * 43758.5453);
float W = 0.15 + sid * 0.05;
float dS = abs(frac(uv.x / P + 0.5) - 0.5) * P;
float aa = max(pxw * 0.6, 0.003);
float stud = 1.0 - smoothstep(W * 0.5 - aa, W * 0.5 + aa, dS);
float3 fillC;
if (code > 2.5 && code < 3.5)
{
    float band = floor(uv.y / 0.15);
    float dir = fmod(band, 2.0) * 2.0 - 1.0;
    float sq = (uv.x + dir * uv.y) / 0.085;
    float bid = frac(sin(floor(sq) * 12.9898 + band * 78.233) * 43758.5453);
    float jt = 1.0 - smoothstep(0.0, 0.12, frac(sq)) * smoothstep(1.0, 0.88, frac(sq)) * smoothstep(0.0, 0.08, frac(uv.y / 0.15));
    fillC = lerp(float3(0.36, 0.12, 0.06) * lerp(0.75, 1.2, bid), float3(0.6, 0.55, 0.47), jt);
}
else
{
    fillC = code < 0.5 || code > 3.5 ? float3(0.76, 0.68, 0.53) : (code < 1.5 ? float3(0.78, 0.76, 0.7) : float3(0.66, 0.46, 0.26));
    fillC *= lerp(1.0, dot(PD, L) / dot(PMEAN, L), 0.8);
}
float lod = smoothstep(0.05, 0.14, pxw);
float3 col = lerp(fillC, woodTex, stud);
float3 avg = lerp(fillC, woodC, W / P);
// Poteaux en léger relief : la normale s'incline sur leurs arêtes.
float edge = (1.0 - smoothstep(0.0, 0.025, abs(dS - W * 0.5))) * (1.0 - lod);
float sgn = sign(frac(uv.x / P + 0.5) - 0.5);
NRM = normalize(lerp(PN, WN, stud) + float3(sgn * edge * 0.8, 0, 0));
ROUGH = lerp(0.93, 0.88, stud);
return lerp(col, avg, lod) * 0.82;
"""


def build_colombage():
    # Pans de bois normands (repère magenta du jeu web) : poteaux serrés et hourdis enduits ou briques en épi,
    # portage du shader web (surfaces.js) avec détail photo (enduit, planches).
    m = new_material("M_WorldColombage")
    coords = expr(m, unreal.MaterialExpressionTextureCoordinate, -1500, 0, coordinate_index=0)
    wuv = uv(m, 0, "WoodScale", 1 / 1.6, -1500, 200)
    puv = uv(m, 0, "PlasterScale", 1 / 2.5, -1500, 400)
    pd = sample(m, "PlasterColor", PHOTO_SETS["white_plaster_02"]["D"], "color", puv, -1100, -300)
    pn = sample(m, "PlasterNormal", PHOTO_SETS["white_plaster_02"]["N"], "normal", puv, -1100, 0)
    wd = sample(m, "WoodColor", PHOTO_SETS["weathered_planks"]["D"], "color", wuv, -1100, 300)
    wn = sample(m, "WoodNormal", PHOTO_SETS["weathered_planks"]["N"], "normal", wuv, -1100, 600)
    vc = expr(m, unreal.MaterialExpressionVertexColor, -1100, 900)
    wnrm = expr(m, unreal.MaterialExpressionVertexNormalWS, -1100, 1000)
    code = COLOMBAGE_CODE.replace("WMEAN", hlsl3(MEANS["weathered_planks"])).replace("PMEAN", hlsl3(MEANS["white_plaster_02"]))
    c = custom(m, code, ["VC", "U", "PD", "PN", "WD", "WN", "WNRM"], [("NRM", F3), ("ROUGH", F1)], -500, 0)
    link(vc, "", c, "VC")
    link(coords, "", c, "U")
    link(pd, "RGB", c, "PD")
    link(pn, "RGB", c, "PN")
    link(wd, "RGB", c, "WD")
    link(wn, "RGB", c, "WN")
    link(wnrm, "", c, "WNRM")
    out(c, "", MP.MP_BASE_COLOR)
    out(c, "NRM", MP.MP_NORMAL)
    out(c, "ROUGH", MP.MP_ROUGHNESS)
    finish(m)
    return m


def build_leaves():
    m = new_material("M_WorldLeaves", blend_mode=unreal.BlendMode.BLEND_MASKED, two_sided=True, shading_model=unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
    m.set_editor_property("used_with_instanced_static_meshes", True)
    t = sample(m, "Atlas", SC["leaf"], "color", None, -1100, 0, shared=False)
    vc = expr(m, unreal.MaterialExpressionVertexColor, -1100, 300)
    cd = [expr(m, unreal.MaterialExpressionPerInstanceCustomData, -1100, 450 + 120 * k, data_index=k, const_default_value=1.0) for k in range(3)]
    q = vector(m, "Leaf", (1.45, 0.72, 0.35, 0.0), -1100, 850)  # x luminosité, y rugosité, z spéculaire
    code = """
float3 tint = float3(T0, T1, T2);
ROUGH = Q.y; SPEC = Q.z;
float3 base = max(C * VC * tint * Q.x, 0.0);
SSS = base * float3(0.9, 1.0, 0.45) * 0.7;
return base;
"""
    c = custom(m, code, ["C", "VC", "T0", "T1", "T2", "Q"], [("ROUGH", F1), ("SPEC", F1), ("SSS", F3)], -500, 0)
    link(t, "RGB", c, "C")
    link(vc, "", c, "VC")
    for k in range(3):
        link(cd[k], "", c, f"T{k}")
    link(q, "RGBA", c, "Q")
    out(c, "", MP.MP_BASE_COLOR)
    out(c, "ROUGH", MP.MP_ROUGHNESS)
    out(c, "SPEC", MP.MP_SPECULAR)
    out(c, "SSS", MP.MP_SUBSURFACE_COLOR)
    out(t, "A", MP.MP_OPACITY_MASK)
    # Balancement léger dans le vent (plus fort en haut de l'arbre).
    wind = """
float h = saturate(LP.z / 1500.0);
float ph = dot(WP.xy, float2(0.0021, 0.0017));
float s = sin(T * 1.7 + ph) * 0.6 + sin(T * 3.1 + ph * 2.3) * 0.4;
return float3(s * 9.0, s * 6.0, 0.0) * h * h;
"""
    lp = expr(m, unreal.MaterialExpressionLocalPosition, -1100, 1000)
    wp = expr(m, unreal.MaterialExpressionWorldPosition, -1100, 1100)
    tm = expr(m, unreal.MaterialExpressionTime, -1100, 1200)
    cw = custom(m, wind, ["LP", "WP", "T"], [], -500, 600)
    link(lp, "", cw, "LP")
    link(wp, "", cw, "WP")
    link(tm, "", cw, "T")
    out(cw, "", MP.MP_WORLD_POSITION_OFFSET)
    finish(m)
    return m


def build_glass():
    m = new_material("M_WorldGlass", two_sided=True)
    vc = expr(m, unreal.MaterialExpressionVertexColor, -600, 0)
    mul = expr(m, unreal.MaterialExpressionMultiply, -400, 0, const_b=0.12)
    link(vc, "", mul, "A")
    out(mul, "", MP.MP_BASE_COLOR)
    out(expr(m, unreal.MaterialExpressionConstant, -400, 200, r=0.06), "", MP.MP_ROUGHNESS)
    out(expr(m, unreal.MaterialExpressionConstant, -400, 300, r=1.0), "", MP.MP_SPECULAR)
    finish(m)
    return m


def build_lamp():
    m = new_material("M_WorldLamp")
    vc = expr(m, unreal.MaterialExpressionVertexColor, -600, 0)
    out(vc, "", MP.MP_BASE_COLOR)
    mul = expr(m, unreal.MaterialExpressionMultiply, -400, 200, const_b=2.5)
    link(vc, "", mul, "A")
    out(mul, "", MP.MP_EMISSIVE_COLOR)
    finish(m)
    return m


def build_water():
    m = new_material("M_WorldWater", blend_mode=unreal.BlendMode.BLEND_TRANSLUCENT)
    m.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
    wp = expr(m, unreal.MaterialExpressionWorldPosition, -1500, 0)
    xy = expr(m, unreal.MaterialExpressionComponentMask, -1350, 0, r=True, g=True, b=False, a=False)
    link(wp, "", xy, "")
    tm = expr(m, unreal.MaterialExpressionTime, -1500, 200)
    df = expr(m, unreal.MaterialExpressionDepthFade, -1500, 400)
    link(expr(m, unreal.MaterialExpressionConstant, -1700, 400, r=1.0), "", df, "Opacity")
    link(scalar(m, "ShoreFade", 350.0, -1700, 500), "", df, "FadeDistance")
    nt = SC["water_n"]
    a = expr(m, unreal.MaterialExpressionTextureObjectParameter, -1500, 600, parameter_name="Waves", texture=nt, sampler_type=SAMPLER["normal"])
    prm = vector(m, "Water", (0.07, 0.032, 0.045, 0.85), -1500, 800)  # x roughness, y..z couleur profonde (G,B), w opacité max
    code = """
float2 p = XY * 0.01;
float2 u1 = p / 9.0 + float2(T * 0.011, T * 0.006);
float2 u2 = p / 23.0 + float2(-T * 0.004, T * 0.009);
float3 n1 = Texture2DSample(Tex, TexSampler, u1).xyz * 2 - 1;
float3 n2 = Texture2DSample(Tex, TexSampler, u2).xyz * 2 - 1;
float3 n = normalize(float3(n1.xy + n2.xy, n1.z * n2.z));
// Au loin, les vagues se fondent (pas de moiré des tuiles) : la normale s'aplatit avec la distance.
float far = saturate(DIST / 60000.0);
NRM = normalize(float3(n.xy * 0.6 * (1.0 - far * 0.85), 1));
ROUGH = P.x;
OPAC = lerp(0.35, P.w, DF);
return float3(0.006, P.y, P.z) * lerp(1.8, 1.0, DF);
"""
    c = custom(m, code, ["XY", "T", "DF", "Tex", "P", "DIST"], [("NRM", F3), ("ROUGH", F1), ("OPAC", F1)], -700, 0)
    cam = expr(m, unreal.MaterialExpressionCameraPositionWS, -1700, 900)
    dist = expr(m, unreal.MaterialExpressionDistance, -1500, 950)
    link(wp, "", dist, "A")
    link(cam, "", dist, "B")
    link(dist, "", c, "DIST")
    link(xy, "", c, "XY")
    link(tm, "", c, "T")
    link(df, "", c, "DF")
    link(a, "", c, "Tex")
    link(prm, "RGBA", c, "P")
    out(c, "", MP.MP_BASE_COLOR)
    out(c, "NRM", MP.MP_NORMAL)
    out(c, "ROUGH", MP.MP_ROUGHNESS)
    out(c, "OPAC", MP.MP_OPACITY)
    out(expr(m, unreal.MaterialExpressionConstant, -400, 400, r=0.9), "", MP.MP_SPECULAR)
    finish(m)
    return m


def build_road():
    # Enrobé : photo projetée (UV0 : travers, long de la route, en m), bandes de rive et axe discontinu pour les
    # routes de 9 m (comme le shader web), traces de roues plus sombres.
    m = new_material("M_WorldRoad")
    P = PHOTO_SETS["asphalt_02"]
    coords = uv(m, 0, "UVScale", 1 / 3.2, -1500, 0)
    d = sample(m, "Color", P["D"], "color", coords, -1100, -300)
    n = sample(m, "Normal", P["N"], "normal", coords, -1100, 0)
    a = sample(m, "ARM", P["A"], "mask", coords, -1100, 300)
    t0 = expr(m, unreal.MaterialExpressionTextureCoordinate, -1100, 600, coordinate_index=0)
    t1 = expr(m, unreal.MaterialExpressionTextureCoordinate, -1100, 700, coordinate_index=1)
    code = """
float w = W.x;
float x = U.x - w * 0.5;
float y = U.y;
float3 c = D / MEANA * 0.055;
float lane = abs(abs(x) - w * 0.25);
float track = smoothstep(0.45, 0.1, abs(lane - 0.85)) * step(5.0, w);
c *= 1.0 - track * 0.18;
float edge = step(5.0, w) * (smoothstep(0.08, 0.02, abs(abs(x) - (w * 0.5 - 0.45))));
float dash = step(5.0, w) * smoothstep(0.08, 0.03, abs(x)) * step(frac(y / 12.0), 0.33);
float paint = saturate(edge + dash);
c = lerp(c, float3(0.62, 0.62, 0.6), paint * 0.9);
NRM = normalize(lerp(N, float3(0, 0, 1), paint));
ROUGH = lerp(saturate(A.g * 0.95), 0.55, paint) - track * 0.08;
return c;
""".replace("MEANA", hlsl3(MEANS["asphalt_02"]))
    c = custom(m, code, ["D", "N", "A", "U", "W"], [("NRM", F3), ("ROUGH", F1)], -500, 0)
    link(d, "RGB", c, "D")
    link(n, "RGB", c, "N")
    link(a, "RGB", c, "A")
    link(t0, "", c, "U")
    link(t1, "", c, "W")
    out(c, "", MP.MP_BASE_COLOR)
    out(c, "NRM", MP.MP_NORMAL)
    out(c, "ROUGH", MP.MP_ROUGHNESS)
    finish(m)
    return m


M_TERRAIN = build_terrain()
M_SURFACE = build_surface("M_WorldSurface")
M_SURFACE_INST = build_surface("M_WorldSurfaceInstanced", instanced=True)
M_LEAVES = build_leaves()
M_GLASS = build_glass()
M_LAMP = build_lamp()
M_WATER = build_water()
M_ROAD = build_road()
M_COLOMBAGE = build_colombage()


def surf(name, tid, tiling, strength, rough_mul=1.0, rough_add=0.0, normal=1.0, hue=0.5, parent=None, textures=None, absolute=False):
    P = PHOTO_SETS[tid]
    tex = {"Color": P["D"], "Normal": P["N"], "ARM": P["A"]}
    tex.update(textures or {})
    return make_instance(name, parent or M_SURFACE, scalars={"UVScale": 1 / tiling},
                         vectors={"Mean": ([1, 1, 1] if absolute else MEANS.get(tid, [0.5, 0.5, 0.5])) + [1], "Detail": (strength, rough_mul, normal, rough_add), "Detail2": (hue, 0, 0, 0)},
                         textures=tex)


# Classes de triangles de l'export (world-export.js, classify) -> matériau.
SURF = {
    "plaster": surf("MI_Plaster", "white_plaster_02", 2.5, 0.7, 1.0, 0.05),
    "paint": surf("MI_Paint", "white_plaster_02", 3.0, 0.25, 0.6, 0.0, 0.3),
    "paving": surf("MI_Paving", "cobblestone_floor_01", 1.6, 0.55, 1.0, 0.0, 0.8, 0.2),
    "wood_dark": surf("MI_WoodDark", "black_painted_planks", 2.4, 0.9, 0.9, 0.0),
    "wood": surf("MI_Wood", "weathered_planks", 2.0, 0.8, 1.0, 0.0),
    "roof_slate": surf("MI_RoofSlate", "roof_slates_02", 2.2, 0.85, 0.8, 0.05, 1.0, 0.3),
    "roof_tile": surf("MI_RoofTile", "roof_slates_02", 2.2, 0.7, 0.9, 0.05, 1.0, 0.2),
    "brick": surf("MI_Brick", "red_brick_03", 1.8, 0.85, 1.0, 0.0, 1.0, 0.6),
    "foliage": surf("MI_Foliage", "forest_leaves_02", 1.5, 0.7, 1.0, 0.0),
    "straw": surf("MI_Straw", "sparse_grass", 1.2, 0.8, 1.0, 0.0, 1.0, 0.2),
    "stone": surf("MI_Stone", "white_plaster_02", 1.6, 0.9, 1.0, 0.0, 1.4),
    "metal": surf("MI_Metal", "white_plaster_02", 3.0, 0.2, 0.5, 0.0, 0.3),
    "colombage": M_COLOMBAGE,
    "glass": M_GLASS,
    "lamp": M_LAMP,
}
BARK = {
    "fissured": surf("MI_BarkFissured", "bark_brown_02", 2.0, 0.9, 1.0, 0.0, 1.2, 0.6, parent=M_SURFACE_INST, absolute=True),
    "smooth": surf("MI_BarkSmooth", "bark_brown_02", 2.0, 1.0, 0.9, 0.0, 0.5, 0.2, parent=M_SURFACE_INST, absolute=True),
    "pine": surf("MI_BarkPine", "bark_brown_02", 1.6, 0.9, 1.0, 0.0, 1.3, 0.6, parent=M_SURFACE_INST, absolute=True),
    "birch": make_instance("MI_BarkBirch", M_SURFACE_INST, scalars={"UVScale": 1.0}, vectors={"Mean": (1, 1, 1, 1), "Detail": (1.0, 1.0, 1.0, 0.0), "Detail2": (0.8, 0, 0, 0)},
                           textures={"Color": SC["birch"], "Normal": SC["birch_n"], "ARM": PHOTO_SETS["bark_brown_02"]["A"]}),
}
HEDGE_HULL = make_instance("MI_HedgeHull", M_SURFACE, scalars={"UVScale": 3.0}, vectors={"Mean": (1, 1, 1, 1), "Detail": (1.0, 1.0, 1.2, 0.0), "Detail2": (0.9, 0, 0, 0)},
                           textures={"Color": SC["hedge"], "Normal": SC["hedge_n"], "ARM": PHOTO_SETS["forest_leaves_02"]["A"]})
log("instances de matériaux", len(SURF) + len(BARK) + 1)


# ---------------------------------------------------------------- Maillages
def import_glb(path, dest, import_materials):
    if eal.does_directory_exist(dest):
        eal.delete_directory(dest)
    pipeline = unreal.InterchangeGenericAssetsPipeline()
    mesh = pipeline.get_editor_property("mesh_pipeline")
    cur = mesh.get_editor_property("combine_static_meshes_behavior")
    opts = [n for n in dir(type(cur)) if n.isupper()]
    keep = next((n for n in opts if any(w in n for w in ("NOT", "NONE", "NEVER", "SEPARATE", "DONT"))), None)
    log("regroupement des maillages", opts, "->", keep)
    if keep:
        mesh.set_editor_property("combine_static_meshes_behavior", getattr(type(cur), keep))
    mesh.set_editor_property("build_nanite", False)
    mesh.set_editor_property("generate_lightmap_u_vs", False)
    mesh.set_editor_property("collision", False)
    mat = pipeline.get_editor_property("material_pipeline")
    mat.set_editor_property("import_materials", import_materials)
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


def assign(sm, mapping, default=None):
    mats = sm.get_editor_property("static_materials")
    names = []
    for k, sl in enumerate(mats):
        slot = str(sl.get_editor_property("material_slot_name"))
        names.append(slot)
        key = slot.lower()
        hit = next((v for kk, v in mapping.items() if key == kk or key.startswith(kk + "_") or key.endswith("_" + kk) or kk in key), default)
        if hit is not None:
            sm.set_material(k, hit)
    return names


def collide(sm, on):
    bs = sm.get_editor_property("body_setup")
    if bs is None:
        return
    bs.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE if on else unreal.CollisionTraceFlag.CTF_USE_DEFAULT)
    if not on:
        bs.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_SIMPLE_AS_COMPLEX)


manifest = {"schema": "strides.world_assets/1", "terrainMaterial": M_TERRAIN.get_path_name(), "roadMaterial": M_ROAD.get_path_name(),
            "waterMaterial": M_WATER.get_path_name(), "architecture": [], "trees": [], "hedges": []}

arch = import_glb(SCENE / "architecture.glb", f"{MESH}/Architecture", True)
slots_seen = set()
for name, sm in sorted(arch.items()):
    sign = "sign" in name.lower()
    if not sign:
        slots_seen.update(assign(sm, SURF, SURF["paint"]))
    solid = name.lower().replace("sm_", "").startswith("static")
    collide(sm, solid)
    eal.save_loaded_asset(sm)
    manifest["architecture"].append({"mesh": sm.get_path_name(), "collide": solid, "shadow": not (sign or "glass" in name.lower() or "lights" in name.lower())})
log("créneaux d'architecture", sorted(slots_seen))

trees = import_glb(SCENE / "trees.glb", f"{MESH}/Trees", False)
tree_meta = json.loads((SCENE / "trees.json").read_text())
for v in tree_meta["variants"]:
    sm = next((s for n, s in trees.items() if n.lower().endswith(v["name"].lower())), None)
    assert sm, f"variante d'arbre absente : {v['name']} ({sorted(trees)})"
    mats = sm.get_editor_property("static_materials")
    for k, sl in enumerate(mats):
        slot = str(sl.get_editor_property("material_slot_name")).lower()
        sm.set_material(k, M_LEAVES if "leaves" in slot else BARK.get(v["bark"], BARK["fissured"]))
    collide(sm, False)
    eal.save_loaded_asset(sm)
    manifest["trees"].append({"mesh": sm.get_path_name(), "kind": v["kind"], "height": v["H"], "radius": v["R"]})

hedges = import_glb(SCENE / "hedges.glb", f"{MESH}/Hedges", False)
for name, sm in sorted(hedges.items()):
    mats = sm.get_editor_property("static_materials")
    leafy = False
    for k, sl in enumerate(mats):
        slot = str(sl.get_editor_property("material_slot_name")).lower()
        leafy = leafy or "leaves" in slot
        sm.set_material(k, M_LEAVES if "leaves" in slot else HEDGE_HULL)
    collide(sm, not leafy)
    eal.save_loaded_asset(sm)
    manifest["hedges"].append({"mesh": sm.get_path_name(), "collide": not leafy})

eal.save_directory("/Game/World")
(DATA / "world_assets.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
log("TERMINÉ", len(manifest["architecture"]), "architecture,", len(manifest["trees"]), "arbres,", len(manifest["hedges"]), "haies")
REPORT.close()
