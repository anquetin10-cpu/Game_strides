"""Étape S5 de l'essai de monte : réimporte trot, trot_L90, trot_R90 et jump_gallop à 24 images/s, comme le web.

Constat (README de la monte, étape M2) : Interchange choisit lui-même la cadence d'échantillonnage de chaque clip du GLB
normalisé. Il a pris 24 images/s pour 13 clips et 30 images/s pour trot, ses deux virages et jump_gallop (26 et 56 clés).
Le web cuit et compare ses poses aux instants f / 24 s (cadence de cuisson du miroir, kBakeFps). À 30 images/s, Unreal
interpole entre ses clés et s'écarte du web de 2,8 à 8,1 cm. Les durées tombent juste aux deux cadences (trot 0,8333 s =
20 / 24 s ; jump_gallop 1,8333 s = 44 / 24 s) : la cadence imposée ne rééchantillonne que la grille, pas la durée.

Ce script, en deux temps :
1. hors éditeur (python3, sans Unreal) : écrit <travail>/Horse_.glb, copie du GLB normalisé
   (.tmp/unreal-import/horse_pjl_normalized.glb, produit par normalize-horse-glb.py, déterministe : refait le 25/11/2026,
   même empreinte) réduite à ces 4 animations. Les
   maillages, la peau et les tampons sont gardés tels quels. Interchange nomme un clip « <nom du fichier><animation> » :
   le fichier « Horse_.glb » redonne donc les noms du jeu (Horse_trot…), et l'import remplace les assets existants ;
2. dans l'éditeur (-run=pythonscript) : import Interchange avec les pipelines de l'import d'origine (relus dans les
   données d'import des clips), changés seulement pour importer les seuls clips (import_only_animations, squelette du
   cheval Object_426_Skeleton), sans sous-dossier, à la cadence imposée de 24 images/s (custom_bone_animation_sample_rate),
   dans le dossier des clips du jeu, en remplaçant les 4 assets. Les 13 autres
   clips, le maillage, le squelette et les matériaux ne sont pas importés.

Usage :
  python3 scripts/unreal/import-horse-clips-24.py --travail=<dossier>        # 1. écrit <dossier>/Horse_.glb
  STRIDES_CLIPS_GLB=<dossier>/Horse_.glb "$UE/Engine/Binaries/Mac/UnrealEditor-Cmd" "<uproject>" -run=pythonscript \\
    -script="<racine>/scripts/unreal/import-horse-clips-24.py" -unattended -nosplash -nullrhi   # 2. import
Compte rendu : <dossier>/import-horse-clips-24.log (cadence, clés et durée de chaque clip avant et après ; dernière ligne
« TERMINÉ »).
"""

import json
import os
import struct
import sys
from pathlib import Path

CLIPS = ["trot", "trot_L90", "trot_R90", "jump_gallop"]
FPS = 24
ROOT = Path(__file__).resolve().parents[2]
NORMALIZED = ROOT / ".tmp" / "unreal-import" / "horse_pjl_normalized.glb"


def subset_glb(source, target):
    data = source.read_bytes()
    assert data[:4] == b"glTF", "pas un GLB"
    json_len = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_len])
    binary = data[20 + json_len:]
    names = [a["name"] for a in gltf["animations"]]
    missing = [c for c in CLIPS if c not in names]
    assert not missing, f"animations absentes du GLB : {missing}"
    gltf["animations"] = [a for a in gltf["animations"] if a["name"] in CLIPS]
    text = json.dumps(gltf, separators=(",", ":")).encode()
    text += b" " * ((4 - len(text) % 4) % 4)
    out = b"glTF" + struct.pack("<II", 2, 12 + 8 + len(text) + len(binary)) + struct.pack("<I", len(text)) + b"JSON" + text + binary
    target.write_bytes(out)
    return [a["name"] for a in gltf["animations"]]


def editor_import():
    import unreal

    source = Path(os.environ["STRIDES_CLIPS_GLB"])
    assert source.name == "Horse_.glb", "le fichier doit s'appeler Horse_.glb (nom des clips du jeu)"
    log_path = source.parent / "import-horse-clips-24.log"
    lines = []

    def log(msg):
        lines.append(msg)
        unreal.log(f"HORSE_CLIPS_24 {msg}")
        log_path.write_text("\n".join(lines) + "\n")

    dest = "/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes"
    skeleton = unreal.load_asset(f"{dest}/Object_426_Skeleton")
    assert skeleton, "squelette Object_426_Skeleton introuvable"

    def state(clip):
        s = unreal.load_asset(f"{dest}/Horse_{clip}")
        if not s:
            return None
        n = unreal.AnimationLibrary.get_num_frames(s)
        return {"images": n, "duree": round(s.get_play_length(), 6), "cadence": round(n / s.get_play_length(), 4) if s.get_play_length() else None}

    every = ["walk", "walk_L90", "walk_R90", "trot", "trot_L90", "trot_R90", "canter", "canter_L90", "canter_R90", "gallop",
             "gallop_L90", "gallop_R90", "brake", "gallop_to_idle", "idle", "jump_canter", "jump_gallop"]
    before = {c: state(c) for c in every}
    listed = set(unreal.EditorAssetLibrary.list_assets("/Game/Characters/Horse", True, False))
    log("avant : " + json.dumps(before, ensure_ascii=False))

    # Pipelines de l'import d'origine, relus dans les données d'import du clip (InterchangeGenericAssetsPipeline : échelle 1,
    # cadence choisie par Interchange ; InterchangeGLTFPipeline). Un pipeline passé seul en « options » est ignoré par
    # Interchange (constaté le 25/11/2026 : sous-dossiers, squelette, cadence et import des seuls clips sans effet ; même
    # constat pour l'import d'origine, dont l'échelle 0,01 demandée n'a pas été appliquée) : on passe la pile par
    # InterchangePipelineStackOverride. Seuls changent : import des seuls clips, squelette du cheval, cadence 24 images/s,
    # pas de sous-dossier (le dossier de destination est celui des clips).
    stored = unreal.load_asset(f"{dest}/Horse_canter").get_editor_property("asset_import_data").get_pipelines()
    names = [x.get_class().get_name() for x in stored]
    log("pipelines d'origine (relus sur Horse_canter) : " + json.dumps(names))
    assert names == ["InterchangeGenericAssetsPipeline", "InterchangeGLTFPipeline"], names
    generic = stored[0]
    assert abs(generic.get_editor_property("import_offset_uniform_scale") - 1.0) < 1e-9
    generic.set_editor_property("asset_type_sub_folders", False)
    generic.set_editor_property("scene_name_sub_folder", False)
    common = generic.get_editor_property("common_skeletal_meshes_and_animations_properties")
    common.set_editor_property("import_only_animations", True)
    common.set_editor_property("skeleton", skeleton)
    animation = generic.get_editor_property("animation_pipeline")
    assert animation.get_editor_property("custom_bone_animation_sample_rate") == 0
    animation.set_editor_property("import_animations", True)
    animation.set_editor_property("import_bone_tracks", True)
    animation.set_editor_property("use30_hz_to_bake_bone_animation", False)
    animation.set_editor_property("custom_bone_animation_sample_rate", FPS)
    pipeline = unreal.InterchangePipelineStackOverride()
    for x in stored:
        pipeline.add_pipeline(x)

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(source))
    task.set_editor_property("destination_path", dest)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("options", pipeline)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = sorted(o.get_path_name() for o in task.get_objects())
    log("importés : " + json.dumps(imported))
    unreal.EditorAssetLibrary.save_directory(dest)

    after = {c: state(c) for c in every}
    log("après : " + json.dumps(after, ensure_ascii=False))
    for c in every:
        if c in CLIPS:
            a, b = before[c], after[c]
            assert b and abs(b["duree"] - a["duree"]) < 1e-5, f"{c} : durée changée {a} → {b}"
            assert abs(b["cadence"] - FPS) < 1e-3, f"{c} : cadence {b['cadence']} au lieu de {FPS}"
        else:
            assert after[c] == before[c], f"{c} : clip non visé modifié {before[c]} → {after[c]}"
    stray = sorted(set(unreal.EditorAssetLibrary.list_assets("/Game/Characters/Horse", True, False)) - listed)
    log("assets inattendus : " + json.dumps(stray))
    assert not stray, "assets inattendus créés"
    log("TERMINÉ")


if __name__ == "__main__" and not os.environ.get("STRIDES_CLIPS_GLB"):
    travail = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--travail=")), None)
    if not travail:
        print(__doc__)
        sys.exit(2)
    out = Path(travail) / "Horse_.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    kept = subset_glb(NORMALIZED, out)
    print("HORSE_CLIPS_24_GLB", out, kept, out.stat().st_size)
else:
    editor_import()
