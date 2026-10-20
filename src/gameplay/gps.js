// GPS : repère, balise lumineuse 3D, itinéraire (par la route en camion, direct à cheval).
import * as THREE from 'three';
import { ROADS } from '../world/layout.js';
import { segDist } from '../core/math.js';

const beamVert = /* glsl */ `
varying float vH;
void main() { vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const beamFrag = /* glsl */ `
uniform vec3 color; uniform float time; uniform float opacity;
varying float vH;
void main() {
  float a = (1.0 - smoothstep(0.0, 60.0, vH)) * (0.55 + 0.15 * sin(time * 3.0 - vH * 0.2));
  gl_FragColor = vec4(color, a * opacity);
}`;

export class GPS {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.route = null;
    this.uniforms = { color: { value: new THREE.Color('#f4f3ef') }, time: { value: 0 }, opacity: { value: 1 } };
    const geo = new THREE.CylinderGeometry(1.3, 1.3, 60, 16, 1, true);
    geo.translate(0, 30, 0);
    this.beam = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam.frustumCulled = false;
    const ringGeo = new THREE.RingGeometry(2.2, 2.7, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#f4f3ef', transparent: true, opacity: 0.8, depthWrite: false }));
    this.marker = new THREE.Group();
    this.marker.add(this.beam, this.ring);
    this.marker.visible = false;
    game.scene.add(this.marker);
    this._buildGraph();
    this._routeTimer = 0;
  }

  // Graphe routier : découpe des polylignes aux intersections.
  _buildGraph() {
    const nodes = [];
    const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
    const index = new Map();
    const node = (x, z) => {
      const k = key(x, z);
      if (index.has(k)) return index.get(k);
      const id = nodes.length;
      nodes.push({ x, z, edges: [] });
      index.set(k, id);
      return id;
    };
    const segs = [];
    for (const r of ROADS) for (let i = 0; i < r.pts.length - 1; i++) segs.push([r.pts[i], r.pts[i + 1]]);
    // Points de coupe par segment.
    const cuts = segs.map((s) => [0, 1]);
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const [a, b] = segs[i];
        const [c, d] = segs[j];
        const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
        if (Math.abs(den) < 1e-6) continue;
        const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
        const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
        if (t > -0.02 && t < 1.02 && u > -0.02 && u < 1.02) {
          cuts[i].push(Math.min(1, Math.max(0, t)));
          cuts[j].push(Math.min(1, Math.max(0, u)));
        }
      }
      // Extrémités proches d'un autre segment (raccords en T).
      for (let j = 0; j < segs.length; j++) {
        if (i === j) continue;
        for (const p of segs[j]) {
          const r = segDist(p[0], p[1], segs[i][0][0], segs[i][0][1], segs[i][1][0], segs[i][1][1]);
          if (r.d < 3) cuts[i].push(r.t);
        }
      }
    }
    segs.forEach(([a, b], i) => {
      const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1000) / 1000))].sort((x, y) => x - y);
      let prev = null;
      for (const t of ts) {
        const id = node(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        if (prev !== null && prev !== id) {
          const n1 = nodes[prev], n2 = nodes[id];
          const w = Math.hypot(n1.x - n2.x, n1.z - n2.z);
          n1.edges.push([id, w]);
          n2.edges.push([prev, w]);
        }
        prev = id;
      }
    });
    // Souder les nœuds très proches.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (d < 4) {
          nodes[i].edges.push([j, d]);
          nodes[j].edges.push([i, d]);
        }
      }
    }
    this.nodes = nodes;
  }

  _nearestNode(x, z) {
    let best = 0, bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return [best, bd];
  }

  roadRoute(from, to) {
    const [s, ds] = this._nearestNode(from.x, from.z);
    const [e, de] = this._nearestNode(to.x, to.z);
    const direct = Math.hypot(to.x - from.x, to.z - from.z);
    if (ds + de > direct * 0.9) return null;
    const N = this.nodes;
    const g = new Float64Array(N.length).fill(Infinity);
    const prev = new Int32Array(N.length).fill(-1);
    const open = new Set([s]);
    g[s] = 0;
    const hfun = (i) => Math.hypot(N[i].x - N[e].x, N[i].z - N[e].z);
    while (open.size) {
      let cur = -1, best = Infinity;
      for (const i of open) {
        const f = g[i] + hfun(i);
        if (f < best) {
          best = f;
          cur = i;
        }
      }
      if (cur === e) break;
      open.delete(cur);
      for (const [nb, w] of N[cur].edges) {
        const ng = g[cur] + w;
        if (ng < g[nb]) {
          g[nb] = ng;
          prev[nb] = cur;
          open.add(nb);
        }
      }
    }
    if (g[e] === Infinity) return null;
    const path = [];
    for (let i = e; i !== -1; i = prev[i]) path.push([N[i].x, N[i].z]);
    path.reverse();
    return path;
  }

  set(pos, label = '', opts = {}) {
    if (!pos) return this.clear();
    this.target = { x: pos.x, z: pos.z, label, radius: opts.radius || 6, sticky: true };
    this.marker.visible = opts.beacon !== false;
    this._routeTimer = 0;
    this.updateRoute(true);
  }

  clear() {
    this.target = null;
    this.route = null;
    this.marker.visible = false;
  }

  updateRoute(force = false) {
    const t = this.target;
    if (!t) return;
    const f = this.game.player.focus.pos;
    const driving = this.game.player.mode === 'drive';
    let path = null;
    if (driving) path = this.roadRoute(f, t);
    this.route = path ? [[f.x, f.z], ...path, [t.x, t.z]] : [[f.x, f.z], [t.x, t.z]];
    void force;
  }

  update(dt) {
    this.uniforms.time.value += dt;
    const t = this.target;
    if (!t) return;
    // Cible mobile (cheval en fuite…).
    if (t.follow) {
      const p = t.follow();
      if (p) {
        t.x = p.x;
        t.z = p.z;
      }
    }
    const y = this.game.terrain.getHeight(t.x, t.z);
    this.marker.position.set(t.x, y + 0.05, t.z);
    const s = 1 + Math.sin(this.uniforms.time.value * 3) * 0.08;
    this.ring.scale.set(s, 1, s);
    const f = this.game.player.focus.pos;
    const d = Math.hypot(f.x - t.x, f.z - t.z);
    this.uniforms.opacity.value = Math.min(1, Math.max(0.15, (d - 4) / 30));
    this._routeTimer -= dt;
    if (this._routeTimer <= 0) {
      this._routeTimer = this.game.player.mode === 'drive' ? 0.8 : 0.15;
      this.updateRoute();
    } else if (this.route) this.route[0] = [f.x, f.z];
  }
}
