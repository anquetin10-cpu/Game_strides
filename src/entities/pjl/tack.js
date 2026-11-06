// Repris de Jumping League Sim (dépôt anquetin10-cpu/PGL_Game-, branche claude/pjl-jumping-game, commit afa56f9c,
// fichier src/render/horse/tack.ts), converti de TypeScript en JavaScript (types retirés, logique inchangée sauf
// mention « Equestrian Tour »). Modèle de cheval : « Realistic Animated Horse » par WildMesh 3D, CC BY 4.0
// (voir public/real/LICENSES.md).
import * as THREE from 'three';
import { BodySurface, SkinnedBuilder, resample, lerpSample, polyLen, blendSkin } from './surface.js';
import { baseName } from './names.js';
export function buildTack(mesh, inner) {
    mesh.updateMatrixWorld(true);
    const bones = mesh.skeleton.bones;
    const skinMats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(inner, b.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));
    const S = new BodySurface(mesh.geometry, skinMats);
    {
        const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        for (let i = 0; i < S.count; i++)
            for (let k = 0; k < 3; k++) {
                mn[k] = Math.min(mn[k], S.pos[i * 3 + k]);
                mx[k] = Math.max(mx[k], S.pos[i * 3 + k]);
            }
        console.info('[tack] body bbox', mn.map((x) => x.toFixed(2)).join(','), '→', mx.map((x) => x.toFixed(2)).join(','), 'regions', [0, 1, 2, 3, 4, 5].map((r) => S.region.filter((x) => x === r).length).join('/'));
    }
    const boneH = (base) => {
        const b = bones.find((x) => baseName(x.name) === base);
        if (!b)
            return new THREE.Vector3();
        return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inner, b.matrixWorld));
    };
    const isRegion = (r) => (a, b, c) => S.region[a] === r || S.region[b] === r || S.region[c] === r;
    const near = (p, rad, f) => (a, b, c) => {
        const dx = S.pos[a * 3] - p.x, dy = S.pos[a * 3 + 1] - p.y, dz = S.pos[a * 3 + 2] - p.z;
        return dx * dx + dy * dy + dz * dz < rad * rad && (!f || f(a, b, c));
    };
    const notLeg = (a, b, c) => S.region[a] < 0.5 || S.region[a] > 4.5;
    // ------------------------------------------------------------------ barrel sections
    const centreX = (boneH('upperarm_l').x + boneH('upperarm_r').x) / 2;
    const zFrom = -0.5, zTo = 0.42, dz = 0.02;
    const sections = [];
    for (let z = zFrom; z <= zTo + 1e-6; z += dz) {
        const loops = S.section(new THREE.Vector3(0, 0, z), new THREE.Vector3(0, 0, 1), notLeg);
        if (!loops.length)
            continue;
        const loop = loops[0];
        // top point (max y)
        let top = 0;
        for (let i = 1; i < loop.length; i++)
            if (loop[i].p.y > loop[top].p.y)
                top = i;
        // bottom point (min y): each side is walked from the top down to the belly midline
        let bot = 0;
        for (let i = 1; i < loop.length; i++)
            if (loop[i].p.y < loop[bot].p.y)
                bot = i;
        // walk both directions from the top to the bottom, sampling every 1 cm (closed loop assumed). The whole
        // half-section is needed: the girth goes right round under the belly (it used to stop 80 cm down the side,
        // leaving a hanging plate on each flank that read as an empty stirrup)
        const walk = (dir) => {
            const seq = [];
            const n = loop.length;
            for (let k = 0; k < n; k++) {
                const i = (top + dir * k + n * 4) % n;
                seq.push(loop[i]);
                if (i === bot && k > 0)
                    break;
            }
            return resample(seq, 0.01);
        };
        let a = walk(1), b = walk(-1);
        // left = +x side
        if ((a[5]?.p.x ?? 0) < (b[5]?.p.x ?? 0))
            [a, b] = [b, a];
        sections.push({ z, left: a, right: b });
    }
    /** Surface sample at (z, s): s = arc length from the top midline (+ left, − right). */
    const at = (z, s) => {
        const f = Math.max(0, Math.min(sections.length - 1.001, (z - sections[0].z) / dz));
        const i = Math.floor(f), t = f - i;
        const pick = (sec) => {
            const arr = s >= 0 ? sec.left : sec.right;
            const g = Math.min(arr.length - 1.001, Math.abs(s) / 0.01);
            const j = Math.floor(g), u = g - j;
            return lerpSample(arr[j], arr[Math.min(arr.length - 1, j + 1)], u);
        };
        return lerpSample(pick(sections[i]), pick(sections[i + 1]), t);
    };
    // ------------------------------------------------------------------ saddle pad
    const pad = new SkinnedBuilder();
    const padTrim = new SkinnedBuilder();
    {
        const zb = -0.4, zf = 0.25;
        const rows = 26, cols = 30;
        const grid = [];
        for (let r = 0; r < rows; r++) {
            const v = r / (rows - 1); // 0 back .. 1 front
            const z = zb + (zf - zb) * v;
            // depth profile: rounded corners, longer at the front-centre (shaped pad)
            const corner = Math.min(1, Math.sin(Math.PI * Math.min(1, v * 1.15)) * 1.6);
            const depth = 0.3 + 0.13 * Math.pow(Math.max(0, corner), 0.35);
            const row = [];
            for (let c = 0; c < cols; c++) {
                const u = c / (cols - 1);
                row.push(at(z, (u * 2 - 1) * depth));
            }
            grid.push(row);
        }
        pad.slab(grid, 0.004, () => 0.022, { uvScale: 1 });
        // piping along the outline
        const outline = [];
        for (let c = 0; c < cols; c++)
            outline.push(grid[0][c]);
        for (let r = 1; r < rows; r++)
            outline.push(grid[r][cols - 1]);
        for (let c = cols - 2; c >= 0; c--)
            outline.push(grid[rows - 1][c]);
        for (let r = rows - 2; r > 0; r--)
            outline.push(grid[r][0]);
        padTrim.strap(resample(outline, 0.012, true), 0.018, 0.012, 0.026, true);
    }
    // ------------------------------------------------------------------ saddle
    const saddle = new SkinnedBuilder();
    const seatZ0 = -0.3, seatZ1 = 0.09;
    {
        // Seat + panels: padded shell on top of the pad
        const rows = 22, cols = 18, half = 0.17;
        const grid = [];
        for (let r = 0; r < rows; r++) {
            const v = r / (rows - 1);
            const z = seatZ0 + (seatZ1 - seatZ0) * v;
            const row = [];
            for (let c = 0; c < cols; c++)
                row.push(at(z, ((c / (cols - 1)) * 2 - 1) * half));
            grid.push(row);
        }
        saddle.slab(grid, 0.02, (r, c) => {
            const v = r / (rows - 1), u = (c / (cols - 1)) * 2 - 1;
            // seat dip, cantle and pommel rises, rounded sides
            const cantle = Math.pow(Math.max(0, 1 - v / 0.22), 2) * 0.065;
            const pommel = Math.pow(Math.max(0, (v - 0.8) / 0.2), 2) * 0.06;
            const side = 1 - Math.pow(Math.abs(u), 6) * 0.6;
            return 0.04 + (0.035 + cantle + pommel) * side;
        });
        // Flaps (forward-cut), both sides
        for (const sgn of [1, -1]) {
            const fr = 16, fc = 14;
            const fg = [];
            for (let r = 0; r < fr; r++) {
                const v = r / (fr - 1); // 0 top .. 1 bottom
                const s = 0.12 + 0.31 * v;
                const zBack = -0.21 + 0.05 * v;
                const zFront = 0.07 + 0.2 * Math.pow(v, 0.8);
                const row = [];
                for (let c = 0; c < fc; c++) {
                    const u = c / (fc - 1);
                    // rounded bottom: narrower at the very bottom
                    const shrink = v > 0.85 ? (v - 0.85) / 0.15 : 0;
                    const zz = zBack + (zFront - zBack) * (shrink * 0.15 + u * (1 - shrink * 0.3));
                    row.push(at(zz, sgn * s));
                }
                fg.push(sgn > 0 ? row : row.reverse());
            }
            saddle.slab(fg, 0.026, () => 0.034);
            // knee block along the front edge
            const edge = [];
            for (let r = 2; r < fr - 3; r++)
                edge.push(fg[r][sgn > 0 ? fc - 2 : 1]);
            saddle.strap(resample(edge, 0.015), 0.055, 0.03, 0.07);
            // thigh block at the back
            const back = [];
            for (let r = 3; r < fr - 6; r++)
                back.push(fg[r][sgn > 0 ? 1 : fc - 2]);
            saddle.strap(resample(back, 0.015), 0.04, 0.03, 0.058);
        }
    }
    // ------------------------------------------------------------------ girth with belly guard
    const girth = new SkinnedBuilder();
    {
        const z = 0.2;
        // arc length from the spine to the belly midline on each side at the girth line
        const fz = Math.max(0, Math.min(sections.length - 1, Math.round((z - sections[0].z) / dz)));
        const reachL = (sections[fz].left.length - 1) * 0.01, reachR = (sections[fz].right.length - 1) * 0.01;
        const line = [];
        for (let s = -reachR; s <= reachL + 1e-6; s += 0.012) {
            if (Math.abs(s) < 0.36)
                continue; // under the flaps → hidden
            line.push(at(z + Math.min(Math.abs(s), 0.75) * -0.02, s));
        }
        // reorder: left side down, under the belly, up the right side
        const left = line.filter((x) => x.p.x - centreX > 0).sort((a, b) => b.p.y - a.p.y);
        const right = line.filter((x) => x.p.x - centreX <= 0).sort((a, b) => a.p.y - b.p.y);
        const all = [...left, ...right];
        girth.strap(all, 0.075, 0.003, 0.012);
        // belly guard: a little wider, strictly UNDER the belly (it used to climb 16 cm up each side at 20 cm wide
        // and showed in side/backlit views as a black block beside the boot, read as an empty stirrup)
        const under = all.filter((x) => x.p.y < Math.min(...all.map((q) => q.p.y)) + 0.05);
        if (under.length > 3)
            girth.strap(under, 0.11, 0.002, 0.014);
    }
    // ------------------------------------------------------------------ bridle
    const bridle = new SkinnedBuilder();
    const bit = new SkinnedBuilder();
    const earL = boneH('ear_01_l'), earR = boneH('ear_01_r');
    const earMid = earL.clone().add(earR).multiplyScalar(0.5);
    const eyeMid = boneH('eye_l').add(boneH('eye_r')).multiplyScalar(0.5);
    const mouthL = boneH('mouthcorner_l'), mouthR = boneH('mouthcorner_r');
    const mouthMid = mouthL.clone().add(mouthR).multiplyScalar(0.5);
    const headAxis = new THREE.Vector3().subVectors(mouthMid, eyeMid).normalize();
    const headF = isRegion(5);
    const headOrNeck = (a, b, c) => S.region[a] === 5 || S.region[a] === 0;
    let bitL = mouthL.clone(), bitR = mouthR.clone();
    {
        // noseband (cavesson)
        const pN = eyeMid.clone().lerp(mouthMid, 0.42);
        const nose = S.section(pN, headAxis, near(pN, 0.3, headF))[0];
        if (nose && nose.length > 8)
            bridle.strap(resample(nose, 0.01, true), 0.028, 0.004, 0.011, true);
        // headpiece + throatlatch (just behind the ears)
        const pH = earMid.clone().addScaledVector(headAxis, -0.03);
        const hn = new THREE.Vector3().subVectors(earMid, mouthMid).normalize().negate().lerp(new THREE.Vector3(0, 0, 1), 0.35).normalize();
        const head = S.section(pH, hn, near(pH, 0.34, headOrNeck))[0];
        if (head && head.length > 8)
            bridle.strap(resample(head, 0.01, true), 0.024, 0.004, 0.011, true);
        // browband: front of the forehead, between the ears
        const pB = earMid.clone().addScaledVector(headAxis, 0.07);
        const brow = S.section(pB, headAxis, near(pB, 0.16, headF))[0];
        if (brow) {
            const upper = brow.filter((x) => x.p.y > eyeMid.y + 0.02);
            upper.sort((a, b) => a.p.x - b.p.x);
            if (upper.length > 4)
                bridle.strap(resample(upper, 0.01), 0.022, 0.004, 0.012);
        }
        // cheekpieces: from the headpiece (cheek level) to the bit rings
        for (const side of [1, -1]) {
            const mouth = side > 0 ? mouthL : mouthR;
            const out = new THREE.Vector3(side, 0, 0);
            const ring = mouth.clone().addScaledVector(out, 0.025);
            if (side > 0)
                bitL = ring.clone();
            else
                bitR = ring.clone();
            const top = head ? head.reduce((best, x) => (Math.sign(x.p.x - centreX) === side && Math.abs(x.p.y - (eyeMid.y - 0.02)) < Math.abs(best.p.y - (eyeMid.y - 0.02)) ? x : best), head[0]) : S.closest(eyeMid.clone().addScaledVector(out, 0.1));
            const pts = [];
            for (let k = 0; k <= 14; k++) {
                const q = top.p.clone().lerp(ring, k / 14);
                pts.push(S.closest(q, near(q, 0.2, headF)));
            }
            bridle.strap(resample(pts, 0.012), 0.02, 0.005, 0.012);
            // loose ring (torus) attached to the mouth corner sample
            const sk = S.closest(mouth, near(mouth, 0.15, headF));
            const R = 0.032, r = 0.0045;
            const segU = 18, segV = 6;
            const base = bit.pos.length / 3;
            for (let i = 0; i <= segU; i++) {
                const a = (i / segU) * Math.PI * 2;
                for (let j = 0; j <= segV; j++) {
                    const b2 = (j / segV) * Math.PI * 2;
                    // ring in the sagittal plane (normal = lateral)
                    const cx = (R + r * Math.cos(b2)) * Math.cos(a), cy = (R + r * Math.cos(b2)) * Math.sin(a), cz = r * Math.sin(b2);
                    const p = new THREE.Vector3(ring.x + side * cz, ring.y + cy, ring.z + cx);
                    const nn = new THREE.Vector3(side * Math.sin(b2), Math.cos(b2) * Math.sin(a), Math.cos(b2) * Math.cos(a));
                    bit.vert(p, nn, sk);
                }
            }
            for (let i = 0; i < segU; i++)
                for (let j = 0; j < segV; j++) {
                    const a0 = base + i * (segV + 1) + j, a1 = a0 + segV + 1;
                    bit.quad(a0, a1, a1 + 1, a0 + 1);
                }
        }
    }
    // ------------------------------------------------------------------ boots
    const boots = new SkinnedBuilder();
    for (const leg of [1, 2, 3, 4]) {
        const fore = leg <= 2;
        const y0 = fore ? 0.17 : 0.14, y1 = fore ? 0.4 : 0.28;
        const rings = [];
        for (let y = y0; y <= y1 + 1e-6; y += 0.02) {
            const loops = S.section(new THREE.Vector3(0, y, 0), new THREE.Vector3(0, 1, 0), (a) => S.region[a] === leg);
            if (!loops.length || loops[0].length < 6)
                continue;
            const lp = resample(loops[0], polyLen(loops[0]) / 24, true).slice(0, 24);
            if (lp.length < 24)
                continue;
            // consistent start (front-most point) & winding
            let s0 = 0;
            for (let i = 1; i < lp.length; i++)
                if (lp[i].p.z > lp[s0].p.z)
                    s0 = i;
            const rot = [...lp.slice(s0), ...lp.slice(0, s0)];
            if (rings.length) {
                // keep winding consistent with the previous ring
                const prev = rings[rings.length - 1];
                const d1 = prev[1].p.distanceTo(rot[1].p), d2 = prev[1].p.distanceTo(rot[rot.length - 1].p);
                if (d2 < d1)
                    rot.splice(1, rot.length - 1, ...rot.slice(1).reverse());
            }
            rings.push(rot);
        }
        if (rings.length >= 3)
            boots.slab(rings, 0.004, (r) => (r === 0 || r === rings.length - 1 ? 0.012 : 0.017), { closedCols: true });
    }
    // ------------------------------------------------------------------ ear bonnet
    const bonnet = new SkinnedBuilder();
    {
        const earBones = new Set();
        bones.forEach((b, i) => {
            if (/^ear_/.test(baseName(b.name)))
                earBones.add(i);
        });
        const earW = (v) => {
            let w = 0;
            for (let k = 0; k < 4; k++)
                if (earBones.has(S.skinIdx[v * 4 + k]))
                    w += S.skinW[v * 4 + k];
            return w;
        };
        const vmap = new Map();
        const T = S.tris;
        const crownR = 0.12;
        const inCrown = (v) => {
            const dx = S.pos[v * 3] - earMid.x, dy = S.pos[v * 3 + 1] - earMid.y, dz2 = S.pos[v * 3 + 2] - (earMid.z + 0.03);
            return dx * dx + dy * dy * 1.6 + dz2 * dz2 < crownR * crownR && S.pos[v * 3 + 1] > eyeMid.y + 0.03;
        };
        const getV = (v) => {
            let id = vmap.get(v);
            if (id === undefined) {
                const p = S.vertex(v).clone();
                const n = new THREE.Vector3(S.nrm[v * 3], S.nrm[v * 3 + 1], S.nrm[v * 3 + 2]);
                p.addScaledVector(n, earW(v) > 0.5 ? 0.0045 : 0.006);
                id = bonnet.vert(p, n, { idx: Array.from(S.skinIdx.slice(v * 4, v * 4 + 4)), w: Array.from(S.skinW.slice(v * 4, v * 4 + 4)) });
                vmap.set(v, id);
            }
            return id;
        };
        for (let t = 0; t < T.length; t += 3) {
            const a = T[t], b = T[t + 1], c = T[t + 2];
            const ear = earW(a) > 0.35 && earW(b) > 0.35 && earW(c) > 0.35;
            const crown = inCrown(a) && inCrown(b) && inCrown(c);
            if (!ear && !crown)
                continue;
            bonnet.idx.push(getV(a), getV(b), getV(c));
        }
    }
    const seat = at(-0.1, 0).p.clone().add(new THREE.Vector3(0, 0.07, 0));
    const barL = at(0.04, 0.13).p, barR = at(0.04, -0.13).p;
    const L = skinMats;
    const anchorSkins = {
        seat: at(-0.1, 0),
        barL: at(0.04, 0.13),
        barR: at(0.04, -0.13),
        bitL: S.closest(bitL),
        bitR: S.closest(bitR),
        withers: at(0.22, 0),
        crest: at(0.36, 0),
    };
    // knee contact (front of the flap) and stirrup iron positions, offset outward from the barrel
    for (const [side, sgn] of [['L', 1], ['R', -1]]) {
        const knee = at(0.13, sgn * 0.3);
        anchorSkins['knee' + side] = { ...knee, p: knee.p.clone().addScaledVector(knee.n, 0.08) };
        const iron = at(0.06, sgn * 0.6);
        anchorSkins['iron' + side] = { ...iron, p: iron.p.clone().addScaledVector(iron.n, 0.1) };
    }
    // the bit ring itself is offset outward from the surface
    anchorSkins.bitL = { ...anchorSkins.bitL, p: bitL.clone() };
    anchorSkins.bitR = { ...anchorSkins.bitR, p: bitR.clone() };
    anchorSkins.seat = { ...anchorSkins.seat, p: seat.clone() };
    const anchorLocal = {};
    const M = new THREE.Matrix4();
    for (const [k, sk] of Object.entries(anchorSkins)) {
        blendSkin(skinMats, sk.idx, sk.w, M);
        anchorLocal[k] = { p: sk.p.clone().applyMatrix4(M.clone().invert()), idx: [...sk.idx], w: [...sk.w] };
    }
    return {
        anchorLocal,
        pad: pad.toGeometry(L),
        padTrim: padTrim.toGeometry(L),
        saddle: saddle.toGeometry(L),
        girth: girth.toGeometry(L),
        bridle: bridle.toGeometry(L),
        bit: bit.toGeometry(L),
        boots: boots.toGeometry(L),
        bonnet: bonnet.toGeometry(L),
        anchors: { seat, stirrupBarL: barL, stirrupBarR: barR, bitL, bitR },
        anchorSkins,
    };
}
