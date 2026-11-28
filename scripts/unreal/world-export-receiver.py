"""Récepteur local des fichiers produits par la page d'export du monde (scripts/unreal/world-export.html).

Écoute uniquement 127.0.0.1:8765 et écrit chaque POST /<nom> dans .tmp/unreal-import/world-scene/<nom>
(noms simples seulement : lettres, chiffres, « _ », « - », « . »). Usage : python3 scripts/unreal/world-export-receiver.py
"""

import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / ".tmp" / "unreal-import" / "world-scene"
OUT.mkdir(parents=True, exist_ok=True)
NAME = re.compile(r"^[A-Za-z0-9_.-]{1,120}$")


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        name = self.path.lstrip("/")
        if not NAME.match(name) or name.startswith("."):
            self.send_response(400)
            self._cors()
            self.end_headers()
            return
        size = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(size)
        (OUT / name).write_bytes(data)
        print(f"{name} {len(data)} octets", flush=True)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
