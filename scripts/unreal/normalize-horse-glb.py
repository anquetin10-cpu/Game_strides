"""Normalise le GLB du cheval pour qu'Unreal (Interchange) importe un rig cohérent.

Constat (18/11/2026) : dans `horse_pjl_unreal.glb`, la pose de bind encodée dans les matrices de bind
inverses (échelles 127,5 et 12 750) ne correspond pas à la pose de repos des nœuds. three.js applique
la formule glTF et obtient un cheval cohérent mais ~100 fois trop grand ; le site le réduit ensuite au
garrot. Interchange prend les sommets à la taille du bind et les os à la taille de repos : les os sont
100 fois trop loin des sommets, et toute animation est amplifiée d'autant au skinning.

Ce script :
1. calcule pour chaque sommet sa position à la pose de repos, avec la formule glTF
   (somme des poids x matrice monde de l'articulation x matrice de bind inverse) ;
2. remplace chaque matrice de bind inverse par l'inverse de la matrice monde de repos ;
3. retire, comme le site (src/entities/pjl/asset.js), les pistes de `root_04`, `_rootJoint` et
   `rootmountpoint_01_0289`, pour des clips sur place.

Le cheval reste à l'échelle du GLB (~100 fois trop grand) ; Unreal applique l'échelle uniforme.

Usage : python3 scripts/unreal/normalize-horse-glb.py
Sortie : .tmp/unreal-import/horse_pjl_normalized.glb (ignoré par Git, régénérable).
"""

import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "unreal" / "ImportSource" / "horse_pjl_unreal.glb"
OUTPUT = ROOT / ".tmp" / "unreal-import" / "horse_pjl_normalized.glb"
STRIPPED_NODES = {"root_04", "_rootJoint", "rootmountpoint_01_0289"}

COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
FORMATS = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}


def read_glb(path):
    data = path.read_bytes()
    assert data[:4] == b"glTF", "pas un GLB"
    json_len = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_len])
    offset = 20 + json_len
    bin_len = struct.unpack_from("<I", data, offset)[0]
    return gltf, bytearray(data[offset + 8:offset + 8 + bin_len])


def read_accessor(gltf, binary, index):
    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    count, width = acc["count"], COMPONENTS[acc["type"]]
    fmt = FORMATS[acc["componentType"]]
    size = struct.calcsize(fmt)
    stride = view.get("byteStride", size * width)
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    out = []
    for i in range(count):
        values = struct.unpack_from("<" + fmt * width, binary, base + i * stride)
        if acc.get("normalized"):
            scale = {5121: 255.0, 5123: 65535.0, 5120: 127.0, 5122: 32767.0}[acc["componentType"]]
            values = tuple(max(v / scale, -1.0) for v in values)
        out.append(values)
    return out


def append_floats(gltf, binary, rows, kind, target=None):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    flat = [v for row in rows for v in row]
    binary.extend(struct.pack("<%df" % len(flat), *flat))
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(flat) * 4}
    if target:
        view["target"] = target
    gltf["bufferViews"].append(view)
    acc = {"bufferView": len(gltf["bufferViews"]) - 1, "componentType": 5126, "count": len(rows), "type": kind}
    if kind == "VEC3":
        acc["min"] = [min(r[i] for r in rows) for i in range(3)]
        acc["max"] = [max(r[i] for r in rows) for i in range(3)]
    gltf["accessors"].append(acc)
    return len(gltf["accessors"]) - 1


# Matrices 4x4 en colonnes (convention glTF), stockées comme listes de 16 flottants.
def mat_mul(a, b):
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]


def trs(node):
    if "matrix" in node:
        return list(node["matrix"])
    tx, ty, tz = node.get("translation", (0, 0, 0))
    qx, qy, qz, qw = node.get("rotation", (0, 0, 0, 1))
    sx, sy, sz = node.get("scale", (1, 1, 1))
    r = [
        1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw),
        2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw),
        2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy),
    ]
    return [r[0] * sx, r[1] * sx, r[2] * sx, 0, r[3] * sy, r[4] * sy, r[5] * sy, 0,
            r[6] * sz, r[7] * sz, r[8] * sz, 0, tx, ty, tz, 1]


def mat_inverse(m):
    # Inverse affine : bloc 3x3 général puis translation.
    a, b, c = m[0], m[4], m[8]
    d, e, f = m[1], m[5], m[9]
    g, h, i = m[2], m[6], m[10]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    assert abs(det) > 1e-20, "matrice non inversible"
    inv = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
           (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
           (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]
    t = (m[12], m[13], m[14])
    it = [-(inv[r * 3] * t[0] + inv[r * 3 + 1] * t[1] + inv[r * 3 + 2] * t[2]) for r in range(3)]
    return [inv[0], inv[3], inv[6], 0, inv[1], inv[4], inv[7], 0, inv[2], inv[5], inv[8], 0, it[0], it[1], it[2], 1]


def transform(m, v, w):
    return tuple(m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * w for r in range(3))


def main():
    gltf, binary = read_glb(SOURCE)
    nodes = gltf["nodes"]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    world = {}

    def world_of(i):
        if i not in world:
            local = trs(nodes[i])
            world[i] = mat_mul(world_of(parent[i]), local) if i in parent else local
        return world[i]

    new_ibm = {}
    for skin_index, skin in enumerate(gltf["skins"]):
        ibms = [list(m) for m in read_accessor(gltf, binary, skin["inverseBindMatrices"])]
        skinning = [mat_mul(world_of(j), ibm) for j, ibm in zip(skin["joints"], ibms)]
        new_ibm[skin_index] = ([mat_inverse(world_of(j)) for j in skin["joints"]], skinning)

    for node in nodes:
        if "mesh" not in node or "skin" not in node:
            continue
        _, skinning = new_ibm[node["skin"]]
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            attrs = prim["attributes"]
            pos = read_accessor(gltf, binary, attrs["POSITION"])
            nor = read_accessor(gltf, binary, attrs["NORMAL"])
            joints = read_accessor(gltf, binary, attrs["JOINTS_0"])
            weights = read_accessor(gltf, binary, attrs["WEIGHTS_0"])
            new_pos, new_nor = [], []
            for p, n, js, ws in zip(pos, nor, joints, weights):
                total = sum(ws) or 1.0
                acc_p, acc_n = [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]
                for j, w in zip(js, ws):
                    if w <= 0:
                        continue
                    tp, tn = transform(skinning[j], p, 1.0), transform(skinning[j], n, 0.0)
                    for k in range(3):
                        acc_p[k] += tp[k] * w / total
                        acc_n[k] += tn[k] * w / total
                length = math.sqrt(sum(x * x for x in acc_n)) or 1.0
                new_pos.append(tuple(acc_p))
                new_nor.append(tuple(x / length for x in acc_n))
            attrs["POSITION"] = append_floats(gltf, binary, new_pos, "VEC3", 34962)
            attrs["NORMAL"] = append_floats(gltf, binary, new_nor, "VEC3", 34962)
            attrs.pop("TANGENT", None)

    for skin_index, skin in enumerate(gltf["skins"]):
        skin["inverseBindMatrices"] = append_floats(gltf, binary, new_ibm[skin_index][0], "MAT4")

    for anim in gltf.get("animations", []):
        anim["channels"] = [c for c in anim["channels"]
                            if nodes[c["target"]["node"]].get("name") not in STRIPPED_NODES]
        used = sorted({c["sampler"] for c in anim["channels"]})
        remap = {old: new for new, old in enumerate(used)}
        anim["samplers"] = [anim["samplers"][i] for i in used]
        for c in anim["channels"]:
            c["sampler"] = remap[c["sampler"]]

    while len(binary) % 4:
        binary.append(0)
    gltf["buffers"][0]["byteLength"] = len(binary)
    payload = json.dumps(gltf, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("wb") as out:
        out.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(payload) + 8 + len(binary)))
        out.write(struct.pack("<I4s", len(payload), b"JSON") + payload)
        out.write(struct.pack("<I4s", len(binary), b"BIN\x00") + bytes(binary))
    print("HORSE_GLB_NORMALIZED", OUTPUT, OUTPUT.stat().st_size)


if __name__ == "__main__":
    main()
