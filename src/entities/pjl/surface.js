// Repris de Jumping League Sim (dépôt anquetin10-cpu/PGL_Game-, branche claude/pjl-jumping-game, commit afa56f9c,
// fichier src/render/horse/surface.ts), converti de TypeScript en JavaScript (types retirés, logique inchangée sauf
// mention « Equestrian Tour »). Modèle de cheval : « Realistic Animated Horse » par WildMesh 3D, CC BY 4.0
// (voir public/real/LICENSES.md).
import * as THREE from 'three';
export class BodySurface {
    count;
    pos; // horse space
    nrm;
    tris;
    region;
    skinIdx;
    skinW;
    weld; // canonical vertex index (positions welded across UV seams)
    skinMats;
    /**
     * @param skinMats per-bone matrices mapping the mesh's bind-space vertex to horse space at rest:
     *        inner · bone.matrixWorld · boneInverse · bindMatrix
     */
    constructor(geo, skinMats) {
        this.skinMats = skinMats;
        const P = geo.getAttribute('position');
        const N = geo.getAttribute('normal');
        const SI = geo.getAttribute('skinIndex');
        const SW = geo.getAttribute('skinWeight');
        const R = geo.getAttribute('coatRegion');
        this.count = P.count;
        this.pos = new Float32Array(P.count * 3);
        this.nrm = new Float32Array(P.count * 3);
        this.region = new Float32Array(P.count);
        this.skinIdx = new Uint16Array(P.count * 4);
        this.skinW = new Float32Array(P.count * 4);
        const v = new THREE.Vector3();
        const M = new THREE.Matrix4();
        const nm = new THREE.Matrix3();
        for (let i = 0; i < P.count; i++) {
            for (let k = 0; k < 4; k++) {
                this.skinIdx[i * 4 + k] = SI.getComponent(i, k);
                this.skinW[i * 4 + k] = SW.getComponent(i, k);
            }
            blendSkin(skinMats, this.skinIdx.subarray(i * 4, i * 4 + 4), this.skinW.subarray(i * 4, i * 4 + 4), M);
            v.fromBufferAttribute(P, i).applyMatrix4(M);
            this.pos.set([v.x, v.y, v.z], i * 3);
            v.fromBufferAttribute(N, i).applyMatrix3(nm.getNormalMatrix(M)).normalize();
            this.nrm.set([v.x, v.y, v.z], i * 3);
            this.region[i] = R ? R.getX(i) : 0;
        }
        const index = geo.getIndex();
        if (index)
            this.tris = Uint32Array.from(index.array);
        else
            this.tris = Uint32Array.from({ length: P.count }, (_, i) => i);
        // Weld by quantised position (1 mm)
        this.weld = new Int32Array(P.count);
        const map = new Map();
        for (let i = 0; i < P.count; i++) {
            const key = `${Math.round(this.pos[i * 3] * 1000)},${Math.round(this.pos[i * 3 + 1] * 1000)},${Math.round(this.pos[i * 3 + 2] * 1000)}`;
            const w = map.get(key);
            if (w === undefined) {
                map.set(key, i);
                this.weld[i] = i;
            }
            else
                this.weld[i] = w;
        }
    }
    vertex(i, out = new THREE.Vector3()) {
        return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    }
    /** Interpolate a sample from vertex indices & barycentric weights. */
    sample(ids, bary) {
        const p = new THREE.Vector3(), n = new THREE.Vector3();
        const acc = new Map();
        for (let k = 0; k < ids.length; k++) {
            const i = ids[k], b = bary[k];
            if (b === 0)
                continue;
            p.x += this.pos[i * 3] * b;
            p.y += this.pos[i * 3 + 1] * b;
            p.z += this.pos[i * 3 + 2] * b;
            n.x += this.nrm[i * 3] * b;
            n.y += this.nrm[i * 3 + 1] * b;
            n.z += this.nrm[i * 3 + 2] * b;
            for (let c = 0; c < 4; c++) {
                const w = this.skinW[i * 4 + c] * b;
                if (w <= 0)
                    continue;
                const bi = this.skinIdx[i * 4 + c];
                acc.set(bi, (acc.get(bi) ?? 0) + w);
            }
        }
        n.normalize();
        return { p, n, ...topWeights(acc) };
    }
    /**
     * Intersect the mesh with a plane → ordered polylines/loops of samples.
     * @param filter optional triangle filter (receives the 3 vertex indices)
     */
    section(point, normal, filter) {
        const d = new Float32Array(this.count);
        for (let i = 0; i < this.count; i++) {
            d[i] = (this.pos[i * 3] - point.x) * normal.x + (this.pos[i * 3 + 1] - point.y) * normal.y + (this.pos[i * 3 + 2] - point.z) * normal.z;
        }
        const segs = [];
        const edgePt = (i, j) => {
            const t = d[i] / (d[i] - d[j]);
            const wi = this.weld[i], wj = this.weld[j];
            const key = wi < wj ? `${wi}_${wj}` : `${wj}_${wi}`;
            return { key, s: this.sample([i, j], [1 - t, t]) };
        };
        const T = this.tris;
        for (let t = 0; t < T.length; t += 3) {
            const a = T[t], b = T[t + 1], c = T[t + 2];
            const sa = d[a] >= 0, sb = d[b] >= 0, sc = d[c] >= 0;
            if (sa === sb && sb === sc)
                continue;
            if (filter && !filter(a, b, c))
                continue;
            const pts = [];
            if (sa !== sb)
                pts.push(edgePt(a, b));
            if (sb !== sc)
                pts.push(edgePt(b, c));
            if (sc !== sa)
                pts.push(edgePt(c, a));
            if (pts.length === 2)
                segs.push([pts[0], pts[1]]);
        }
        // chain segments by shared edge keys
        const adj = new Map();
        segs.forEach((sg, i) => {
            for (const e of [0, 1]) {
                const k = sg[e].key;
                if (!adj.has(k))
                    adj.set(k, []);
                adj.get(k).push({ seg: i, end: e });
            }
        });
        const used = new Uint8Array(segs.length);
        const loops = [];
        for (let i = 0; i < segs.length; i++) {
            if (used[i])
                continue;
            used[i] = 1;
            const chain = [segs[i][0], segs[i][1]];
            // extend forward
            for (let dir = 0; dir < 2; dir++) {
                let guard = 0;
                while (guard++ < 100000) {
                    const tail = dir === 0 ? chain[chain.length - 1] : chain[0];
                    const next = (adj.get(tail.key) ?? []).find((x) => !used[x.seg]);
                    if (!next)
                        break;
                    used[next.seg] = 1;
                    const other = segs[next.seg][next.end === 0 ? 1 : 0];
                    if (dir === 0)
                        chain.push(other);
                    else
                        chain.unshift(other);
                }
            }
            loops.push(chain.map((c) => c.s));
        }
        loops.sort((a, b) => polyLen(b) - polyLen(a));
        return loops;
    }
    /** Closest point on the mesh surface (optionally restricted). Brute force over filtered triangles. */
    closest(q, filter) {
        const T = this.tris;
        let best = Infinity, bt = 0;
        const bb = new THREE.Vector3();
        let bestBary = [1, 0, 0];
        const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), r = new THREE.Vector3();
        const tri = new THREE.Triangle();
        for (let t = 0; t < T.length; t += 3) {
            const a = T[t], b = T[t + 1], c = T[t + 2];
            if (filter && !filter(a, b, c))
                continue;
            this.vertex(a, A);
            this.vertex(b, B);
            this.vertex(c, C);
            // quick reject
            const cx = (A.x + B.x + C.x) / 3 - q.x, cy = (A.y + B.y + C.y) / 3 - q.y, cz = (A.z + B.z + C.z) / 3 - q.z;
            if (cx * cx + cy * cy + cz * cz > best + 0.04)
                continue;
            tri.set(A, B, C);
            tri.closestPointToPoint(q, r);
            const dd = r.distanceToSquared(q);
            if (dd < best) {
                best = dd;
                bt = t;
                tri.getBarycoord(r, bb);
                bestBary = [bb.x, bb.y, bb.z];
            }
        }
        return this.sample([T[bt], T[bt + 1], T[bt + 2]], bestBary);
    }
    regionOf(a) {
        return this.region[a];
    }
}
/** Weighted blend of skinning matrices. */
export function blendSkin(mats, idx, w, out) {
    const e = out.elements;
    e.fill(0);
    let sum = 0;
    for (let k = 0; k < 4; k++) {
        const wk = w[k];
        if (wk <= 0)
            continue;
        sum += wk;
        const m = mats[idx[k]].elements;
        for (let j = 0; j < 16; j++)
            e[j] += m[j] * wk;
    }
    if (sum > 0 && Math.abs(sum - 1) > 1e-4)
        for (let j = 0; j < 16; j++)
            e[j] /= sum;
    return out;
}
export function polyLen(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++)
        s += pts[i].p.distanceTo(pts[i - 1].p);
    return s;
}
export function topWeights(acc) {
    const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    while (arr.length < 4)
        arr.push([0, 0]);
    const sum = arr.reduce((s, x) => s + x[1], 0) || 1;
    return {
        idx: arr.map((x) => x[0]),
        w: arr.map((x) => x[1] / sum),
    };
}
/** Resample a polyline of samples at fixed arc-length spacing. */
export function resample(pts, spacing, closed = false) {
    const src = closed ? [...pts, pts[0]] : pts;
    const out = [src[0]];
    let acc = 0;
    for (let i = 1; i < src.length; i++) {
        const a = src[i - 1], b = src[i];
        const seg = a.p.distanceTo(b.p);
        if (seg < 1e-6)
            continue;
        let t0 = 0;
        while (acc + seg * (1 - t0) >= spacing) {
            const need = spacing - acc;
            const t = t0 + need / seg;
            out.push(lerpSample(a, b, t));
            t0 = t;
            acc = 0;
        }
        acc += seg * (1 - t0);
    }
    return out;
}
export function lerpSample(a, b, t) {
    const acc = new Map();
    for (let k = 0; k < 4; k++) {
        acc.set(a.idx[k], (acc.get(a.idx[k]) ?? 0) + a.w[k] * (1 - t));
        acc.set(b.idx[k], (acc.get(b.idx[k]) ?? 0) + b.w[k] * t);
    }
    return { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), ...topWeights(acc) };
}
/**
 * Accumulates skinned geometry (horse space) and converts it to the body mesh's
 * local space so it can be bound to the same skeleton.
 */
export class SkinnedBuilder {
    pos = [];
    nrm = [];
    uv = [];
    si = [];
    sw = [];
    idx = [];
    vert(p, n, s, u = 0, v = 0) {
        const i = this.pos.length / 3;
        this.pos.push(p.x, p.y, p.z);
        this.nrm.push(n.x, n.y, n.z);
        this.uv.push(u, v);
        this.si.push(...s.idx);
        this.sw.push(...s.w);
        return i;
    }
    quad(a, b, c, d, flip = false) {
        if (flip)
            this.idx.push(a, c, b, a, d, c);
        else
            this.idx.push(a, b, c, a, c, d);
    }
    /**
     * A grid of samples (rows × cols) extruded into a slab between offsets o0 (inner) and o1 (outer).
     * offset(r, c) can vary the outer thickness (e.g. a padded seat).
     */
    slab(grid, o0, o1, opts = {}) {
        const R = grid.length, C = grid[0].length;
        const top = [], bot = [];
        const us = opts.uvScale ?? 1;
        for (let r = 0; r < R; r++) {
            top.push([]);
            bot.push([]);
            for (let c = 0; c < C; c++) {
                const s = grid[r][c];
                top[r].push(this.vert(s.p.clone().addScaledVector(s.n, o1(r, c)), s.n, s, (c / (C - 1)) * us, (r / (R - 1)) * us));
                bot[r].push(this.vert(s.p.clone().addScaledVector(s.n, o0), s.n.clone().negate(), s, (c / (C - 1)) * us, (r / (R - 1)) * us));
            }
        }
        const cols = opts.closedCols ? C : C - 1;
        for (let r = 0; r < R - 1; r++) {
            for (let c = 0; c < cols; c++) {
                const c1 = (c + 1) % C;
                this.quad(top[r][c], top[r][c1], top[r + 1][c1], top[r + 1][c], true);
                this.quad(bot[r][c], bot[r][c1], bot[r + 1][c1], bot[r + 1][c], false);
            }
        }
        // rims
        const rim = (a, b, flip) => {
            for (let k = 0; k < a.length - 1; k++)
                this.quad(a[k], a[k + 1], b[k + 1], b[k], flip);
        };
        rim(top[0], bot[0], false);
        rim(top[R - 1], bot[R - 1], true);
        if (!opts.closedCols) {
            rim(top.map((row) => row[0]), bot.map((row) => row[0]), true);
            rim(top.map((row) => row[C - 1]), bot.map((row) => row[C - 1]), false);
        }
    }
    /** A strap along a polyline of samples: width w, thickness from o0 to o1 above the surface. */
    strap(line, width, o0, o1, closed = false) {
        const n = line.length;
        const rows = [];
        for (let i = 0; i < n; i++) {
            const s = line[i];
            const a = line[Math.max(0, i - 1)].p, b = line[Math.min(n - 1, i + 1)].p;
            const dir = new THREE.Vector3().subVectors(b, a).normalize();
            const side = new THREE.Vector3().crossVectors(s.n, dir).normalize().multiplyScalar(width / 2);
            rows.push([
                { ...s, p: s.p.clone().sub(side) },
                { ...s, p: s.p.clone().add(side) },
            ]);
        }
        if (closed)
            rows.push(rows[0]);
        this.slab(rows, o0, () => o1);
    }
    /** Convert horse-space vertices to the body's bind space by inverting each vertex's blended skin matrix. */
    toGeometry(skinMats) {
        const g = new THREE.BufferGeometry();
        const p = new Float32Array(this.pos);
        const n = new Float32Array(this.nrm);
        const v = new THREE.Vector3();
        const M = new THREE.Matrix4();
        const nm = new THREE.Matrix3();
        for (let i = 0, vi = 0; i < p.length; i += 3, vi++) {
            blendSkin(skinMats, this.si.slice(vi * 4, vi * 4 + 4), this.sw.slice(vi * 4, vi * 4 + 4), M);
            M.invert();
            v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(M);
            p[i] = v.x;
            p[i + 1] = v.y;
            p[i + 2] = v.z;
            v.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(nm.getNormalMatrix(M)).normalize();
            n[i] = v.x;
            n[i + 1] = v.y;
            n[i + 2] = v.z;
        }
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
        g.setIndex(this.idx);
        g.computeBoundingSphere();
        return g;
    }
}
