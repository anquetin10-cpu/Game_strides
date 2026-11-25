"""Sellerie complète du cheval WildMesh pour Unreal (étape S1) : pièces skinnées en GLB, données des lanières et des étriers.

Le jeu web construit sa sellerie au chargement (src/entities/pjl/tack.js buildTack : tapis, liseré, selle, sangle, filet,
mors, guêtres, bonnet ; géométries skinnées sur le squelette du corps, en espace de liaison) et dessine à chaque image les
étriers, les étrivières et les rênes (src/entities/pjlHorse.js : ironGeometry, Strap, _straps ; src/entities/horse.js
_stirrupsFollow). Rien n'est recalculé ici : les géométries viennent de la page (export-rider-rules.mjs
--sellerie-maillage), les constantes du dessin des lanières sont relues dans le source du web (une seule occurrence
exigée), et le cœur C++ (StridesCore/HorseStraps) est prouvé contre l'oracle sellerie/ (ctest « monte-sellerie »).

Entrées :
  - <dossier de travail>/tack_mesh.json (export-rider-rules.mjs --sellerie-maillage=<dossier>) ;
  - .tmp/unreal-import/horse_pjl_normalized.glb (normalize-horse-glb.py, lancé ici s'il manque) : squelette et peau du
    cheval importé dans Unreal (horse_pjl_normalized : mêmes nœuds, matrices inverses de liaison = repos).
Sorties :
  - <dossier de travail>/horse_pjl_tack.glb (fichier de travail, hors dépôt) : nœuds et peau du GLB normalisé, une pièce
    par maillage (nom tack_<pièce>), sommets à la pose de repos de la scène du GLB (formule de pjl/view.js anchorWorld,
    évaluée dans la page) : la peau du GLB normalisé (inverse de liaison = inverse du repos) les replace exactement ;
  - unreal/StridesGrandTour/Content/Data/pjl_horse_tack_mesh.json (versionné) : pièces (visibilité dans le scénario E1,
    matériau, nombres de sommets et de triangles, sommets témoins : position de repos et os porteurs par nom et poids),
    lanières (segments, demi-largeur, matériaux), étriers (géométrie locale, matériau), constantes de _straps et de
    _stirrupsFollow relues dans le source ; lu par UStridesHorseTackMesh et le test Strides.Parite.HorseTackMesh.

Contrôle : la même formule appliquée par la page à des sommets du corps redonne le corps du GLB normalisé (écart écrit).
Usage : python3 scripts/unreal/tack-horse-glb.py --travail=<dossier de travail sous .ue-cache/travail>
Puis : UnrealEditor-Cmd … -run=pythonscript -script=scripts/unreal/import-horse-tack.py (même dossier de travail par
STRIDES_TACK_GLB).
"""

import importlib.util
import json
import re
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
NORMALIZED = ROOT / ".tmp" / "unreal-import" / "horse_pjl_normalized.glb"
DATA = ROOT / "unreal" / "StridesGrandTour" / "Content" / "Data" / "pjl_horse_tack_mesh.json"
SAMPLE_STRIDE = 97  # sommets témoins : un sur 97 (le même pas que l'oracle sellerie/, relu dans tack_mesh.json)

spec = importlib.util.spec_from_file_location("normalize_horse_glb", ROOT / "scripts" / "unreal" / "normalize-horse-glb.py")
norm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(norm)


def arg(name, default=None):
    for a in sys.argv[1:]:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


def once(text, pattern, what):
    m = re.findall(pattern, text)
    assert len(m) == 1, f"{what} : {len(m)} occurrences de {pattern!r} (une seule attendue)"
    return m[0]


def constants():
    """Constantes du dessin de la sellerie, relues dans le source du web (jamais recopiées)."""
    pjl = (ROOT / "src" / "entities" / "pjlHorse.js").read_text()
    horse = (ROOT / "src" / "entities" / "horse.js").read_text()
    leather = once(pjl, r"this\.leathers = \[new Strap\((\d+), ([\d.]+), this\.mats\.leather\)", "étrivières")
    rein = once(pjl, r"this\.reins = \[new Strap\((\d+), ([\d.]+), this\.mats\.rein\)", "rênes")
    sag = once(pjl, r"hands \? Math\.min\(([\d.]+), len \* ([\d.]+)\) : ([\d.]+)", "flèche des rênes")
    return {
        "detailDist": float(once(pjl, r"const DETAIL_DIST = ([\d.]+);", "DETAIL_DIST")),
        "leather": {"n": int(leather[0]), "w": float(leather[1])},
        "rein": {"n": int(rein[0]), "w": float(rein[1])},
        "ironEye": float(once(pjl, r"_v\.y \+= ([\d.]+);", "œil de l'étrier")),
        "toeDrop": float(once(horse, r"_sv\.y -= ([\d.]+) \* \(R\.scale \|\| 1\);", "étrier sous l'orteil")),
        "reinSagMax": float(sag[0]), "reinSagPerLen": float(sag[1]), "reinSagFree": float(sag[2]),
        "crestSide": float(once(pjl, r"_b\.addScaledVector\(lat, k \? -([\d.]+) : \1\)", "rênes sur l'encolure")),
        "source": ["src/entities/pjlHorse.js (Strap, _straps, DETAIL_DIST)", "src/entities/horse.js (_stirrupsFollow)"],
    }


def main():
    work = Path(arg("travail", str(ROOT / ".ue-cache" / "travail" / "sellerie")))
    src = work / "tack_mesh.json"
    out_glb = work / "horse_pjl_tack.glb"
    assert src.exists(), f"Lancer d'abord export-rider-rules.mjs --sellerie-maillage={work} : {src} absent"
    if not NORMALIZED.exists():
        subprocess.run([sys.executable, str(ROOT / "scripts" / "unreal" / "normalize-horse-glb.py")], check=True)
    web = json.loads(src.read_text())
    gltf, binary = norm.read_glb(NORMALIZED)
    body_mesh = next(i for i, m in enumerate(gltf["meshes"]) if gltf["materials"][m["primitives"][0]["material"]]["name"] == "horse_body")
    body_node = next(i for i, n in enumerate(gltf["nodes"]) if n.get("mesh") == body_mesh)
    skin = gltf["skins"][gltf["nodes"][body_node]["skin"]]
    joint_names = [gltf["nodes"][j].get("name") for j in skin["joints"]]
    assert joint_names == web["bones"], "os du squelette du corps du web différents des articulations de la peau du GLB normalisé"
    # Contrôle de la pose de repos : la formule de la page sur des sommets du corps = corps du GLB normalisé.
    prim = gltf["meshes"][body_mesh]["primitives"][0]
    body_pos = norm.read_accessor(gltf, binary, prim["attributes"]["POSITION"])
    assert len(body_pos) == web["body"]["vertexCount"], "corps : nombre de sommets différent"
    span = max(max(p[k] for p in body_pos) - min(p[k] for p in body_pos) for k in range(3))
    rest_gap = max(max(abs(c[1 + k] - body_pos[c[0]][k]) for k in range(3)) for c in web["body"]["check"])

    out = {"asset": {"version": "2.0", "generator": "scripts/unreal/tack-horse-glb.py"}, "scene": gltf.get("scene", 0),
           "scenes": json.loads(json.dumps(gltf["scenes"])), "nodes": [], "meshes": [], "materials": [], "skins": [],
           "accessors": [], "bufferViews": [], "buffers": []}
    buf = bytearray()
    for node in gltf["nodes"]:
        out["nodes"].append({k: v for k, v in node.items() if k not in ("mesh", "skin")})
    sk = dict(skin)
    sk["inverseBindMatrices"] = norm.append_floats(out, buf, norm.read_accessor(gltf, binary, skin["inverseBindMatrices"]), "MAT4")
    out["skins"].append(sk)
    parent = next((i for i, n in enumerate(gltf["nodes"]) if body_node in n.get("children", [])), None)
    body_nd = {k: v for k, v in gltf["nodes"][body_node].items() if k not in ("mesh", "skin", "children", "name")}

    def append_u16(rows):
        while len(buf) % 4:
            buf.append(0)
        off = len(buf)
        flat = [v for row in rows for v in row]
        buf.extend(struct.pack("<%dH" % len(flat), *flat))
        out["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(flat) * 2, "target": 34962})
        out["accessors"].append({"bufferView": len(out["bufferViews"]) - 1, "componentType": 5123, "count": len(rows), "type": "VEC4"})
        return len(out["accessors"]) - 1

    def append_u32(values):
        while len(buf) % 4:
            buf.append(0)
        off = len(buf)
        buf.extend(struct.pack("<%dI" % len(values), *values))
        out["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(values) * 4, "target": 34963})
        out["accessors"].append({"bufferView": len(out["bufferViews"]) - 1, "componentType": 5125, "count": len(values), "type": "SCALAR"})
        return len(out["accessors"]) - 1

    rows3 = lambda a: [tuple(a[i:i + 3]) for i in range(0, len(a), 3)]
    rows2 = lambda a: [tuple(a[i:i + 2]) for i in range(0, len(a), 2)]
    rows4 = lambda a: [tuple(a[i:i + 4]) for i in range(0, len(a), 4)]
    pieces = []
    for k, p in enumerate(web["pieces"]):
        n = p["count"]
        assert len(p["restPos"]) == 3 * n and len(p["restNormal"]) == 3 * n and len(p["uv"]) == 2 * n, f"{p['name']} : attributs incomplets"
        joints = rows4([int(j) for j in p["skinIndex"]])
        weights = rows4(p["skinWeight"])
        attrs = {
            "POSITION": norm.append_floats(out, buf, rows3(p["restPos"]), "VEC3", 34962),
            "NORMAL": norm.append_floats(out, buf, rows3(p["restNormal"]), "VEC3", 34962),
            "TEXCOORD_0": norm.append_floats(out, buf, rows2(p["uv"]), "VEC2", 34962),
            "JOINTS_0": append_u16(joints),
            "WEIGHTS_0": norm.append_floats(out, buf, weights, "VEC4", 34962),
        }
        m = p["material"]
        out["materials"].append({"name": p["name"], "doubleSided": True,
                                 "pbrMetallicRoughness": {"baseColorFactor": m["color"] + [1], "metallicFactor": m["metalness"], "roughnessFactor": m["roughness"]}})
        out["meshes"].append({"name": p["name"], "primitives": [{"attributes": attrs, "indices": append_u32([int(i) for i in p["index"]]), "material": k, "mode": 4}]})
        nd = dict(body_nd)
        nd.update({"name": p["name"], "mesh": k, "skin": 0})
        out["nodes"].append(nd)
        idx = len(out["nodes"]) - 1
        if parent is None:
            out["scenes"][out["scene"]]["nodes"].append(idx)
        else:
            out["nodes"][parent].setdefault("children", []).append(idx)
        samples = []
        for i in range(0, n, SAMPLE_STRIDE):
            bones = [[web["bones"][joints[i][c]], round(weights[i][c], 7)] for c in range(4) if weights[i][c] > 0]
            samples.append({"i": i, "rest": [round(x, 7) for x in p["restPos"][3 * i:3 * i + 3]], "bones": bones})
        pieces.append({"name": p["name"], "visible": p["visible"], "vertices": n, "triangles": len(p["index"]) // 3,
                       "material": {"color": [round(c, 9) for c in m["color"]], "roughness": m["roughness"], "metalness": m["metalness"],
                                    "quilt": m["quilt"], "twoSided": m["side"] == 2, "envMapIntensity": m["envMapIntensity"]},
                       "samples": samples})
    while len(buf) % 4:
        buf.append(0)
    out["buffers"].append({"byteLength": len(buf)})
    payload = json.dumps(out, separators=(",", ":")).encode()
    while len(payload) % 4:
        payload += b" "
    work.mkdir(parents=True, exist_ok=True)
    with out_glb.open("wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(payload) + 8 + len(buf)))
        fh.write(struct.pack("<I4s", len(payload), b"JSON") + payload)
        fh.write(struct.pack("<I4s", len(buf), b"BIN\x00") + bytes(buf))

    c = constants()
    for key in ("leather", "rein"):
        assert c[key]["n"] == web[key]["n"] and abs(c[key]["w"] - web[key]["w"]) < 1e-12, f"{key} : source {c[key]} contre page {web[key]['n']}, {web[key]['w']}"
    assert web["sampleStride"] == SAMPLE_STRIDE, "pas des sommets témoins différent de celui de l'oracle"
    mat = lambda m: {"color": [round(x, 9) for x in m["color"]], "roughness": m["roughness"], "metalness": m["metalness"], "twoSided": m["side"] == 2}
    doc = {
        "schema": "strides.pjl_horse_tack_mesh/1",
        "generator": "scripts/unreal/tack-horse-glb.py",
        "srcTree": web.get("srcTree"),
        "source": ["src/entities/pjl/tack.js", "src/entities/pjl/view.js (buildTackMeshes, setTackVisible, quiltMaterial)",
                   "src/entities/pjlHorse.js (Strap, ironGeometry, _straps)", "src/entities/horse.js (_stirrupsFollow)"],
        "doc": "sellerie du cheval WildMesh pour Unreal : pièces skinnées (assets SK_Tack_<pièce> importés de horse_pjl_tack.glb par import-horse-tack.py ; visibilité de setTackVisible dans le scénario E1 d'O1 ; couleurs linéaires ; samples : sommets témoins, position de repos dans la scène du GLB et os porteurs) ; étriers (géométrie locale du web, repère du holder : x à gauche, y vers le haut, z vers l'avant, m ; triangles du web), étrivières et rênes (Strap : n segments, demi-largeur w, m) ; constantes de _straps et _stirrupsFollow relues dans le source.",
        "restCheck": {"maxGap": rest_gap, "span": span, "vertices": len(web["body"]["check"])},
        "cfg": web["cfg"],
        "constants": c,
        "pieces": pieces,
        "iron": {"material": mat(web["iron"]["material"]), "position": [round(x, 9) for x in web["iron"]["position"]],
                 "normal": [round(x, 9) for x in web["iron"]["normal"]], "index": web["iron"]["index"]},
        "leather": {"n": web["leather"]["n"], "w": web["leather"]["w"], "material": mat(web["leather"]["material"])},
        "rein": {"n": web["rein"]["n"], "w": web["rein"]["w"], "material": mat(web["rein"]["material"])},
    }
    text = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
    prev = DATA.read_text() if DATA.exists() else None
    if prev != text:
        DATA.write_text(text)
    print(f"HORSE_TACK_GLB {out_glb} {out_glb.stat().st_size} octets ; pièces {', '.join(p['name'] + ('' if p['visible'] else ' (masquée)') for p in pieces)} ; "
          f"repos du corps par la formule de la page : écart {rest_gap:.3g} (taille {span:.1f}) ; {DATA.name} {'inchangé' if prev == text else 'écrit'} ({len(text)} octets)")
    assert rest_gap <= 1e-4 * span, "pose de repos de la page différente du corps du GLB normalisé"


if __name__ == "__main__":
    main()
