"""Prépare les images dérivées de l'export du monde (Python standard, sans dépendance).

Entrée : .tmp/unreal-import/world-scene/ (scripts/unreal/world-export.html).
 - ground_splat.rgba -> ground_splat.png : matériaux du sol (R herbe, G terre, B sable, A sol dur), RGBA non prémultiplié ;
 - water_normal.png : normale de vagues raccordable (somme de houles orientées), 512 px ;
 - copie terrain.bin et trees.json dans Content/Data/World (lus par le jeu, empaquetés avec Data).
Usage : python3 scripts/unreal/prepare-world.py
"""

import json
import math
import shutil
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / ".tmp" / "unreal-import" / "world-scene"
DATA = ROOT / "unreal" / "StridesGrandTour" / "Content" / "Data" / "World"


def write_png(path, width, height, rows, channels):
    """rows : bytes par ligne (channels octets par pixel)."""
    kind = {3: 2, 4: 6}[channels]
    raw = b"".join(b"\x00" + r for r in rows)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, kind, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


scene = json.loads((SRC / "world_scene.json").read_text())
size = scene["groundMaps"]["splatSize"]
data = (SRC / "ground_splat.rgba").read_bytes()
assert len(data) == size * size * 4, (len(data), size)
# Ligne 0 du tableau web = z minimal (nord) : même orientation que ground_color.png (canvas, ligne 0 en haut = nord).
write_png(SRC / "ground_splat.png", size, size, [data[j * size * 4:(j + 1) * size * 4] for j in range(size)], 4)

# Normale de vagues : houles de longueurs d'onde entières sur la tuile (raccord parfait), pentes sommées.
W = 512
waves = [(1, 3, 0.9), (4, -2, 0.55), (-5, 6, 0.4), (9, 2, 0.28), (-7, -11, 0.2), (15, -6, 0.14), (-19, 13, 0.1), (26, 21, 0.07)]
rows = []
for j in range(W):
    row = bytearray()
    for i in range(W):
        dx = dy = 0.0
        for k, (a, b, amp) in enumerate(waves):
            ph = 2 * math.pi * (a * i + b * j) / W + k * 1.7
            c = math.cos(ph) * amp
            dx += c * a * 2 * math.pi / W * 18
            dy += c * b * 2 * math.pi / W * 18
        nx, ny, nz = -dx, -dy, 1.0
        l = math.sqrt(nx * nx + ny * ny + nz * nz)
        row += bytes((int((nx / l * 0.5 + 0.5) * 255), int((ny / l * 0.5 + 0.5) * 255), int((nz / l * 0.5 + 0.5) * 255)))
    rows.append(bytes(row))
write_png(SRC / "water_normal.png", W, W, rows, 3)

DATA.mkdir(parents=True, exist_ok=True)
shutil.copy(SRC / "terrain.bin", DATA / "terrain.bin")
shutil.copy(SRC / "trees.json", DATA / "trees.json")
meta = {k: scene[k] for k in ("schema", "source", "frame", "terrain", "groundMaps", "pond", "roads")}
meta["pond"] = {k: scene["pond"][k] for k in ("x", "z", "r", "level") if k in scene["pond"]}
(DATA / "world_scene.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
print("ground_splat.png", size, "px ; water_normal.png", W, "px ; données copiées dans", DATA)
