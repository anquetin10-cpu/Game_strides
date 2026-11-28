"""Import incrémental des maillages CSO (jalon J2c, lot J2-D) : ajoute à Content/World/Cso/Meshes les seuls maillages du
manifeste cso_fences.json absents de la table cso_assets.json (vertical et oxer du paddock d'échauffement du Pôle), sans
toucher aux maillages, matériaux et textures déjà importés par scripts/unreal/import-cso-fences.py (pas de réimport
complet : les ressources existantes restent octet pour octet).

Prérequis : node --import ./scripts/unreal/pw-chrome.mjs scripts/unreal/export-cso-runs.mjs --fences (BASE=… du Vite)
  -> .tmp/unreal-import/cso/cso_fences.glb et Content/World/Cso/cso_fences.json
Usage (commandlet, sans autre éditeur ouvert) :
  "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/unreal/StridesGrandTour/StridesGrandTour.uproject" -run=pythonscript \\
    -script="$PWD/scripts/unreal/import-cso-fences-add.py" -unattended -nosplash -nullrhi
Compte rendu : .tmp/unreal-import/import-cso-fences-add.log (dernière ligne « TERMINÉ … »).
"""

import json
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / ".tmp" / "unreal-import" / "cso"
CONTENT = ROOT / "unreal" / "StridesGrandTour" / "Content" / "World" / "Cso"
REPORT = open(ROOT / ".tmp" / "unreal-import" / "import-cso-fences-add.log", "w")
MESH = "/Game/World/Cso/Meshes/cso_fences/StaticMeshes"
TMP = "/Game/World/Cso/_ImportAjout"

at = unreal.AssetToolsHelpers.get_asset_tools()
eal = unreal.EditorAssetLibrary


def log(*a):
    REPORT.write(" ".join(str(x) for x in a) + "\n")
    REPORT.flush()


manifest = json.loads((CONTENT / "cso_fences.json").read_text())
assets = json.loads((CONTENT / "cso_assets.json").read_text())
missing = sorted(m for m in manifest["meshes"] if m not in assets["meshes"])
log("maillages du manifeste", len(manifest["meshes"]), "; déjà importés", len(assets["meshes"]), "; à ajouter", len(missing), missing)
SLOT = {k: eal.load_asset(v) for k, v in assets["materials"].items()}
assert all(SLOT.values()), "matériau de la table introuvable"

if missing:
    if eal.does_directory_exist(TMP):
        eal.delete_directory(TMP)
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
    task.set_editor_property("filename", str(SRC / manifest["glb"]))
    task.set_editor_property("destination_path", TMP)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", False)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("options", pipeline)
    at.import_asset_tasks([task])
    imported = {}
    for p in eal.list_assets(TMP, True, False):
        a = eal.load_asset(p)
        if isinstance(a, unreal.StaticMesh):
            imported[a.get_name()] = a
    log("import temporaire", len(imported), "maillages")
    worst = 0.0
    for mid in missing:
        sm = imported.get(mid) or imported.get(f"SM_{mid}")
        assert sm, f"maillage absent après import : {mid}"
        info = manifest["meshes"][mid]
        mats = sm.get_editor_property("static_materials")
        for k, sl in enumerate(mats):
            slot = str(sl.get_editor_property("material_slot_name")).lower()
            hit = next((v for kk, v in SLOT.items() if kk in slot), None)
            assert hit, f"créneau de matériau inconnu {slot} ({mid})"
            sm.set_material(k, hit)
        bb = sm.get_bounding_box()
        want = [info["min"][0] * 100, info["min"][2] * 100, info["min"][1] * 100, info["max"][0] * 100, info["max"][2] * 100, info["max"][1] * 100]
        got = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]
        err = max(abs(a - b) for a, b in zip(got, want))
        worst = max(worst, err)
        dest = f"{MESH}/{mid}"
        assert not eal.does_asset_exist(dest), f"déjà présent : {dest}"
        assert eal.rename_asset(sm.get_path_name(), dest), f"déplacement refusé : {mid}"
        moved = eal.load_asset(dest)
        eal.save_loaded_asset(moved)
        assets["meshes"][mid] = moved.get_path_name()
        log("ajouté", mid, "écart de boîte (cm)", round(err, 4))
    assert worst <= 0.05, "repère d'import différent de x -> X, z -> Y, y -> Z"
    eal.delete_directory(TMP)
    assets["meshes"] = dict(sorted(assets["meshes"].items()))
    (CONTENT / "cso_assets.json").write_text(json.dumps(assets, ensure_ascii=False, indent=1) + "\n")
log("TERMINÉ", len(missing), "maillages ajoutés ;", len(assets["meshes"]), "dans la table")
REPORT.close()
