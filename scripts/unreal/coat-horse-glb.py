"""Corps du cheval PJL avec les masques de robe du jeu web, pour le matériau de robe d'Unreal (C1).

Le shader de robe du web (src/entities/pjl/coat.js, makeCoatMaterial) lit, pour chaque sommet du corps, les attributs
`coatMask` (vec4) et `coatRegion` (« flat ») calculés par asset.js (buildCoatMasks, poids de peau et pose de liaison),
et deux bruits de la position de liaison `vBindPos` (bord de balzane, largeur de la liste). Aucun ne se recalcule dans
un matériau Unreal : ce script les écrit dans trois canaux d'UV supplémentaires du corps.

Entrées :
  - .tmp/unreal-import/horse-coat/body_coat.json (scripts/unreal/export-horse-coat.mjs : valeurs du jeu web, sommets
    dans l'ordre de public/real/horse_pjl.glb) ;
  - .tmp/unreal-import/horse_pjl_normalized.glb (scripts/unreal/normalize-horse-glb.py, lancé ici s'il manque) : même
    corps que le cheval importé dans Unreal (horse_pjl_normalized), mêmes sommets dans le même ordre (vérifié : indices
    identiques, UV identiques à la quantification du GLB du web près).

Sorties :
  - .tmp/unreal-import/horse_pjl_coat.glb (ignoré par Git, régénérable) : squelette et peau du GLB normalisé, corps
    seul (ni yeux, ni crins, ni clips, ni textures) avec
      TEXCOORD_1 = (coatMask.x, coatMask.y), TEXCOORD_2 = (coatMask.z, coatMask.w),
      TEXCOORD_3 = (coatRegion, bruit de la région : bord de balzane `edge` sur les membres, facteur de largeur de la
      liste `width` sur la tête, 0 sur le corps) ;
    `coatRegion` est « flat » dans le web (valeur du sommet qui la fixe, le dernier du triangle sous WebGL, relevé par
    l'export) : chaque triangle à cheval sur deux régions reçoit ses propres copies de sommets, à la région de ce
    sommet, pour qu'Unreal, qui interpole, lise la même région partout sur le triangle ;
  - unreal/core/tests/oracles/horse_coat_vertices.json (versionné) : pour chaque sommet du corps ainsi écrit, UV0 et les
    trois canaux ; relu par le test moteur Strides.Horse.Coat (canaux du maillage importé).

Usage : python3 scripts/unreal/coat-horse-glb.py
Puis : UnrealEditor-Cmd … -run=pythonscript -script=scripts/unreal/import-horse-coat.py
"""

import importlib.util
import json
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True  # pas de __pycache__ dans scripts/unreal
BODY = ROOT / ".tmp" / "unreal-import" / "horse-coat" / "body_coat.json"
NORMALIZED = ROOT / ".tmp" / "unreal-import" / "horse_pjl_normalized.glb"
OUTPUT = ROOT / ".tmp" / "unreal-import" / "horse_pjl_coat.glb"
ORACLE = ROOT / "unreal" / "core" / "tests" / "oracles" / "horse_coat_vertices.json"

spec = importlib.util.spec_from_file_location("normalize_horse_glb", ROOT / "scripts" / "unreal" / "normalize-horse-glb.py")
norm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(norm)


def f32(x):
    return struct.unpack("<f", struct.pack("<f", x))[0]


def main():
    assert BODY.exists(), f"Lancer d'abord export-horse-coat.mjs : {BODY} absent"
    if not NORMALIZED.exists():
        subprocess.run([sys.executable, str(ROOT / "scripts" / "unreal" / "normalize-horse-glb.py")], check=True)
    web = json.loads(BODY.read_text())
    gltf, binary = norm.read_glb(NORMALIZED)
    n = web["count"]
    body_mesh = next(i for i, m in enumerate(gltf["meshes"]) if gltf["materials"][m["primitives"][0]["material"]]["name"] == "horse_body")
    prim = gltf["meshes"][body_mesh]["primitives"][0]
    attrs = {k: norm.read_accessor(gltf, binary, v) for k, v in prim["attributes"].items()}
    index = [r[0] for r in norm.read_accessor(gltf, binary, prim["indices"])]
    assert len(attrs["POSITION"]) == n, f"sommets : {len(attrs['POSITION'])} dans le GLB normalisé, {n} dans le web"
    assert index == web["index"], "indices du corps différents de ceux du GLB du web"
    # UV du web : Uint16 normalisés (quantification du GLB du web) ; UV du GLB normalisé : flottants d'origine.
    duv = max(abs(attrs["TEXCOORD_0"][i][k] - web["uv"][i * 2 + k]) for i in range(n) for k in range(2))
    assert duv <= 0.5 / 65535 + 1e-6, f"UV : écart {duv} au-delà de la quantification"
    # Position de liaison du web (Int16 normalisé, vBindPos) → position de repos du GLB normalisé : application affine
    # (moindres carrés sur les 12 coefficients) ; résidu rapporté à la taille du cheval.
    X = [(web["pos"][i * 3], web["pos"][i * 3 + 1], web["pos"][i * 3 + 2], 1.0) for i in range(n)]
    XtX = [[sum(x[a] * x[b] for x in X) for b in range(4)] for a in range(4)]
    fit = 0.0
    span = max(max(attrs["POSITION"][i][k] for i in range(n)) - min(attrs["POSITION"][i][k] for i in range(n)) for k in range(3))
    for k in range(3):
        rhs = [sum(X[i][a] * attrs["POSITION"][i][k] for i in range(n)) for a in range(4)]
        M = [row[:] + [r] for row, r in zip(XtX, rhs)]
        for c in range(4):
            piv = max(range(c, 4), key=lambda r: abs(M[r][c]))
            M[c], M[piv] = M[piv], M[c]
            for r in range(4):
                if r != c:
                    f = M[r][c] / M[c][c]
                    M[r] = [a - f * b for a, b in zip(M[r], M[c])]
        coef = [M[r][4] / M[r][r] for r in range(4)]
        fit = max(fit, max(abs(sum(coef[a] * X[i][a] for a in range(4)) - attrs["POSITION"][i][k]) for i in range(n)) / span)

    region = [int(r) for r in web["region"]]
    assert all(0 <= r <= 5 and r == v for r, v in zip(region, web["region"])), "coatRegion : entier de 0 à 5 attendu"
    prov = {"last": 2, "first": 0}.get(web["provoking"])
    assert prov is not None, f"sommet « flat » indéterminé ({web['provoking']})"

    def channel(i, reg):
        noise = web["edge"][i] if 1 <= reg <= 4 else web["width"][i] if reg == 5 else 0.0
        m = web["mask"][i * 4:i * 4 + 4]
        return (m[0], m[1]), (m[2], m[3]), (float(reg), noise)

    # Sommets du corps écrits : les n d'origine (région propre), puis les copies des triangles à cheval sur deux régions.
    src = list(range(n))
    regs = list(region)
    copies = {}
    new_index = []
    split = 0
    for t in range(len(index) // 3):
        tri = index[t * 3:t * 3 + 3]
        r = region[tri[prov]]
        if all(region[v] == r for v in tri):
            new_index.extend(tri)
            continue
        split += 1
        for v in tri:
            if region[v] == r:
                new_index.append(v)
                continue
            key = (v, r)
            if key not in copies:
                copies[key] = len(src)
                src.append(v)
                regs.append(r)
            new_index.append(copies[key])
    m = len(src)

    # Nouveau glTF : nœuds et peau du corps du GLB normalisé, un seul maillage, un seul tampon.
    out = {"asset": {"version": "2.0", "generator": "scripts/unreal/coat-horse-glb.py"}, "scene": gltf.get("scene", 0),
           "scenes": gltf["scenes"], "nodes": [], "meshes": [], "materials": [{"name": "horse_body", "doubleSided": True,
           "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.48}}], "skins": [], "accessors": [],
           "bufferViews": [], "buffers": []}
    buf = bytearray()
    body_node = None
    for i, node in enumerate(gltf["nodes"]):
        nd = {k: v for k, v in node.items() if k not in ("mesh", "skin")}
        if node.get("mesh") == body_mesh:
            nd["mesh"] = 0
            nd["skin"] = 0
            body_node = i
        out["nodes"].append(nd)
    assert body_node is not None, "nœud du corps introuvable"
    skin = dict(gltf["skins"][gltf["nodes"][body_node]["skin"]])
    ibm = norm.read_accessor(gltf, binary, skin["inverseBindMatrices"])
    skin["inverseBindMatrices"] = norm.append_floats(out, buf, ibm, "MAT4")
    out["skins"].append(skin)

    def append_u16(rows, kind, target=None):
        while len(buf) % 4:
            buf.append(0)
        off = len(buf)
        flat = [v for row in rows for v in row]
        buf.extend(struct.pack("<%dH" % len(flat), *flat))
        view = {"buffer": 0, "byteOffset": off, "byteLength": len(flat) * 2}
        if target:
            view["target"] = target
        out["bufferViews"].append(view)
        out["accessors"].append({"bufferView": len(out["bufferViews"]) - 1, "componentType": 5123, "count": len(rows), "type": kind})
        return len(out["accessors"]) - 1

    def append_u32_index(values):
        while len(buf) % 4:
            buf.append(0)
        off = len(buf)
        buf.extend(struct.pack("<%dI" % len(values), *values))
        out["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(values) * 4, "target": 34963})
        out["accessors"].append({"bufferView": len(out["bufferViews"]) - 1, "componentType": 5125, "count": len(values), "type": "SCALAR"})
        return len(out["accessors"]) - 1

    p = {}
    kinds = {"POSITION": "VEC3", "NORMAL": "VEC3", "TEXCOORD_0": "VEC2", "WEIGHTS_0": "VEC4"}
    for k, kind in kinds.items():
        p[k] = norm.append_floats(out, buf, [attrs[k][v] for v in src], kind, 34962)
    joints_acc = gltf["accessors"][prim["attributes"]["JOINTS_0"]]
    assert joints_acc["componentType"] in (5121, 5123), "JOINTS_0 : entiers non signés attendus"
    p["JOINTS_0"] = append_u16([attrs["JOINTS_0"][v] for v in src], "VEC4", 34962)
    ch = [channel(src[j], regs[j]) for j in range(m)]
    for c in range(3):
        p[f"TEXCOORD_{c + 1}"] = norm.append_floats(out, buf, [row[c] for row in ch], "VEC2", 34962)
    out["meshes"].append({"name": gltf["meshes"][body_mesh].get("name", "body"), "primitives": [{"attributes": p, "indices": append_u32_index(new_index), "material": 0, "mode": 4}]})
    while len(buf) % 4:
        buf.append(0)
    out["buffers"].append({"byteLength": len(buf)})
    payload = json.dumps(out, separators=(",", ":")).encode()
    while len(payload) % 4:
        payload += b" "
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(payload) + 8 + len(buf)))
        fh.write(struct.pack("<I4s", len(payload), b"JSON") + payload)
        fh.write(struct.pack("<I4s", len(buf), b"BIN\x00") + bytes(buf))

    # Oracle versionné : sommets écrits (flottants 32 bits, comme dans le GLB), arrondis à 7 chiffres significatifs.
    def g7(x):
        return float("%.7g" % f32(x))

    verts = []
    for j in range(m):
        uv0 = attrs["TEXCOORD_0"][src[j]]
        (a, b), (c, d), (r, e) = ch[j]
        verts.append([g7(uv0[0]), g7(uv0[1]), g7(a), g7(b), g7(c), g7(d), r, g7(e)])
    count = [0] * 6
    for r in regs:
        count[r] += 1
    doc = {
        "schema": "strides.oracle.horse_coat_vertices/1",
        "generator": "scripts/unreal/coat-horse-glb.py",
        "source": ["src/entities/pjl/asset.js", "src/entities/pjl/coat.js", "public/real/horse_pjl.glb"],
        "note": "sommets du corps de .tmp/unreal-import/horse_pjl_coat.glb : [u0, v0, coatMask.x, coatMask.y, coatMask.z, coatMask.w, coatRegion, bruit de la région] (UV0, TEXCOORD_1, TEXCOORD_2, TEXCOORD_3), flottants 32 bits arrondis à 7 chiffres ; bruit = edge (membres), width (tête), 0 (corps) ; triangles à cheval sur deux régions dédoublés à la région du sommet « flat » du web",
        "provoking": web["provoking"],
        "shader": web["shader"],
        "interpolationMaxError": web["interpolationMaxError"],
        "webVertices": n,
        "vertices": m,
        "triangles": len(new_index) // 3,
        "splitTriangles": split,
        "regionCount": count,
        "verts": verts,
    }
    text = "{\n" + ",\n".join(f' {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in doc.items() if k != "verts")
    text += ',\n "verts": [\n' + ",\n".join("  " + json.dumps(v, separators=(",", ":")) for v in verts) + "\n ]\n}\n"
    prev = ORACLE.read_text() if ORACLE.exists() else None
    if prev != text:
        ORACLE.write_text(text)
    print(f"HORSE_COAT_GLB {OUTPUT} {OUTPUT.stat().st_size} octets ; sommets {n} → {m} ({m - n} copies, {split} triangles à cheval) ; "
          f"régions {count} ; UV : écart max {duv:.3g} ; position web → GLB normalisé : résidu affine {fit:.2g} de la taille du cheval ; "
          f"oracle {ORACLE.name} {'inchangé' if prev == text else 'écrit'} ({len(text)} octets)")


if __name__ == "__main__":
    main()
