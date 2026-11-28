"""Crée les matériaux des aides à l'appel du parcours CSO (tranche T9) : tracé au sol, bandes de la zone d'appel et
repère au-dessus de l'obstacle suivant, rendus dans le jeu web par des MeshBasicMaterial transparents (courseAids.js:15-22 :
couleur, opacité, sans écriture de profondeur ; tracé en double face, bandes et repère en face avant).

Deux matériaux de base, translucides et sans éclairage, paramètres Color (couleur linéaire) et Opacity :
  /Game/World/Cso/Materials/M_CsoAid          (une face)
  /Game/World/Cso/Materials/M_CsoAidTwoSided  (deux faces)
Couleurs, opacités, faces et ordre de rendu ne sont pas écrits ici : le jeu les lit dans Content/Data/cso_aids.json
(scripts/unreal/export-cso-runs.mjs --aids, relevés dans la scène du jeu web) et pose des instances dynamiques
(AStridesCourseAids). Ce script vérifie seulement que ce fichier existe et décrit des matériaux transparents sans
écriture de profondeur.

Usage (commandlet, sans éditeur ouvert) :
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" \\
    "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \\
    -script="$PWD/scripts/unreal/import-cso-aids.py" -unattended -nosplash -nullrhi
Compte rendu : .tmp/unreal-import/import-cso-aids.log (dernière ligne « TERMINÉ … »).
"""

import json
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "unreal" / "StridesGrandTour" / "Content" / "Data" / "cso_aids.json"
(ROOT / ".tmp" / "unreal-import").mkdir(parents=True, exist_ok=True)
REPORT = open(ROOT / ".tmp" / "unreal-import" / "import-cso-aids.log", "w")
MAT = "/Game/World/Cso/Materials"

at = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary
MP = unreal.MaterialProperty


def log(*a):
    REPORT.write(" ".join(str(x) for x in a) + "\n")
    REPORT.flush()


data = json.loads(DATA.read_text())
for k, m in data["materials"].items():
    assert m["type"] == "MeshBasicMaterial" and m["transparent"] and not m["depthWrite"] and m["depthTest"], f"matériau {k} inattendu : {m}"
    log("matériau du web", k, m["color"], "opacité", m["opacity"], "face", m["side"])


def new_material(name, two_sided):
    path = f"{MAT}/{name}"
    if eal.does_asset_exist(path):
        eal.delete_asset(path)
    m = at.create_asset(name, MAT, unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    m.set_editor_property("two_sided", two_sided)
    color = mel.create_material_expression(m, unreal.MaterialExpressionVectorParameter, -500, 0)
    color.set_editor_property("parameter_name", "Color")
    color.set_editor_property("default_value", unreal.LinearColor(1, 1, 1, 1))
    opacity = mel.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -500, 250)
    opacity.set_editor_property("parameter_name", "Opacity")
    opacity.set_editor_property("default_value", 1.0)
    assert mel.connect_material_property(color, "", MP.MP_EMISSIVE_COLOR)
    assert mel.connect_material_property(opacity, "", MP.MP_OPACITY)
    mel.layout_material_expressions(m)
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    log("matériau", name, "deux faces" if two_sided else "une face", "expressions", mel.get_num_material_expressions(m))
    return m


new_material("M_CsoAid", False)
new_material("M_CsoAidTwoSided", True)
log("TERMINÉ 2 matériaux")
REPORT.close()
