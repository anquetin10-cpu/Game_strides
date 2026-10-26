// Collisions 2D (plan XZ) avec hauteur : cercles et boîtes orientées dans une grille spatiale.
export class Colliders {
  constructor(cell = 24) {
    this.cell = cell;
    this.grid = new Map();
    this.all = [];
    this.stamp = 0;
  }
  _cells(minX, minZ, maxX, maxZ, fn) {
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) fn(`${i},${j}`);
  }
  _insert(col) {
    this.all.push(col);
    const r = col.bound;
    this._cells(col.x - r, col.z - r, col.x + r, col.z + r, (k) => {
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(col);
    });
    return col;
  }
  // top: hauteur absolue du sommet (Infinity = infranchissable).
  addCircle(x, z, r, top = Infinity, tag = '') {
    return this._insert({ type: 'c', x, z, r, top, tag, bound: r, enabled: true });
  }
  addBox(x, z, hw, hd, rot = 0, top = Infinity, tag = '') {
    return this._insert({ type: 'b', x, z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot), top, tag, bound: Math.hypot(hw, hd), enabled: true });
  }
  addSegment(x1, z1, x2, z2, thick, top, tag = '') {
    const x = (x1 + x2) / 2;
    const z = (z1 + z2) / 2;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    return this.addBox(x, z, thick / 2, len / 2, rot, top, tag);
  }
  query(x, z, r, fn) {
    this.stamp++;
    const st = this.stamp;
    this._cells(x - r, z - r, x + r, z + r, (k) => {
      const list = this.grid.get(k);
      if (!list) return;
      for (const col of list) {
        if (col._st === st) continue;
        col._st = st;
        if (col.enabled) fn(col);
      }
    });
  }
  // Repousse un cercle (pos.x/pos.z, rayon r) hors des obstacles plus hauts que feetY.
  resolve(pos, r, feetY = -Infinity, ignoreTag = null) {
    let hit = null;
    this.query(pos.x, pos.z, r + 1, (col) => {
      if (feetY > col.top - 0.05) return;
      if (ignoreTag && col.tag === ignoreTag) return;
      if (col.type === 'c') {
        const dx = pos.x - col.x;
        const dz = pos.z - col.z;
        const d = Math.hypot(dx, dz);
        const min = r + col.r;
        if (d < min) {
          const nx = d > 1e-5 ? dx / d : 1;
          const nz = d > 1e-5 ? dz / d : 0;
          pos.x = col.x + nx * min;
          pos.z = col.z + nz * min;
          hit = { col, nx, nz };
        }
      } else {
        // Repère local de la boîte (rotation autour de Y).
        const dx = pos.x - col.x;
        const dz = pos.z - col.z;
        const lx = dx * col.c - dz * col.s;
        const lz = dx * col.s + dz * col.c;
        const cx = Math.max(-col.hw, Math.min(col.hw, lx));
        const cz = Math.max(-col.hd, Math.min(col.hd, lz));
        let ox = lx - cx;
        let oz = lz - cz;
        let d = Math.hypot(ox, oz);
        let nlx, nlz;
        if (d < 1e-5) {
          // Centre à l'intérieur : sortir par le côté le plus proche.
          const px = col.hw - Math.abs(lx);
          const pz = col.hd - Math.abs(lz);
          if (px < pz) {
            nlx = Math.sign(lx) || 1;
            nlz = 0;
            ox = nlx * (px + r);
            oz = 0;
          } else {
            nlx = 0;
            nlz = Math.sign(lz) || 1;
            ox = 0;
            oz = nlz * (pz + r);
          }
          const wx = ox * col.c + oz * col.s;
          const wz = -ox * col.s + oz * col.c;
          pos.x += wx;
          pos.z += wz;
          hit = { col, nx: nlx * col.c + nlz * col.s, nz: -nlx * col.s + nlz * col.c };
        } else if (d < r) {
          nlx = ox / d;
          nlz = oz / d;
          const push = r - d;
          const wx = (nlx * col.c + nlz * col.s) * push;
          const wz = (-nlx * col.s + nlz * col.c) * push;
          pos.x += wx;
          pos.z += wz;
          hit = { col, nx: nlx * col.c + nlz * col.s, nz: -nlx * col.s + nlz * col.c };
        }
      }
    });
    return hit;
  }
  // Sommet du plus haut obstacle volumineux et bas (camion, van…) qui contient le point, sinon -Infinity
  // (pour que la caméra passe au-dessus plutôt qu'à travers).
  volumeTopAt(x, z, y = 0, maxAbove = 5) {
    let top = -Infinity;
    this.query(x, z, 1, (col) => {
      if (col.type === 'c' || !Number.isFinite(col.top) || col.hw < 0.9 || col.hd < 0.9) return;
      if (y > col.top || col.top - y > maxAbove) return;
      const dx = x - col.x;
      const dz = z - col.z;
      const lx = dx * col.c - dz * col.s;
      const lz = dx * col.s + dz * col.c;
      if (Math.abs(lx) < col.hw + 0.3 && Math.abs(lz) < col.hd + 0.3) top = Math.max(top, col.top);
    });
    return top;
  }
  // Point interdit à la caméra (à la hauteur y où elle serait) : obstacles hauts gonflés de `pad` (marge devant les
  // murs et les troncs, plan proche compris), débord de toit (col.eave au-delà de l'emprise, sous-face à col.eaveY)
  // dès que la caméra approche de sa hauteur — un piéton passe sous l'auvent, la caméra de conduite ne s'y glisse pas.
  cameraBlocked(x, z, y, pad = 0.45) {
    let res = false;
    this.query(x, z, 2.2, (col) => {
      if (res || y - 0.5 > col.top) return;
      if (col.type === 'c') {
        if (Math.hypot(x - col.x, z - col.z) < col.r + pad) res = true;
      } else {
        const e = col.eave && y > col.eaveY - 0.9 ? col.eave : 0;
        const dx = x - col.x;
        const dz = z - col.z;
        const lx = dx * col.c - dz * col.s;
        const lz = dx * col.s + dz * col.c;
        if (Math.abs(lx) < col.hw + pad + e && Math.abs(lz) < col.hd + pad + e) res = true;
      }
    });
    return res;
  }
  // Point à l'intérieur d'un obstacle haut (pour la caméra).
  blocked(x, z, y = 0) {
    let res = false;
    this.query(x, z, 1, (col) => {
      if (res || y > col.top) return;
      if (col.type === 'c') {
        if (Math.hypot(x - col.x, z - col.z) < col.r) res = true;
      } else {
        const dx = x - col.x;
        const dz = z - col.z;
        const lx = dx * col.c - dz * col.s;
        const lz = dx * col.s + dz * col.c;
        if (Math.abs(lx) < col.hw && Math.abs(lz) < col.hd) res = true;
      }
    });
    return res;
  }
}
