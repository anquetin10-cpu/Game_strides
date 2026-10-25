// Épreuves : parcours d'obstacles (CSO, cross), course d'hippodrome, anneaux de passage.
import * as THREE from 'three';
import { HIPPO } from '../world/layout.js';
import { CSO_FINISH } from './obstacles.js';
import { formatTime, clamp } from '../core/math.js';
import { PathAI } from '../entities/horse.js';

// ---------- Parcours d'obstacles ----------
export function courseSteps(game, run, S, opts) {
  const {
    courseId, start, finish, timeAllowed, heights, kind = 'cso',
    intro = null,
  } = opts;
  // Règlement FEI : élimination au deuxième refus en CSO, au quatrième sur un cross (ou au troisième sur un même obstacle).
  const maxRefusals = opts.maxRefusals ?? (kind === 'xc' ? 4 : 2);
  const ob = game.obstacles;
  const state = { faults: 0, refusals: 0, fenceRefusals: 0, next: 1, t: 0, running: false, finished: false, timeFaults: 0 };
  run.data.course = state;
  const list = () => ob.ofCourse(courseId);
  const approach = (o) => ({ x: o.x - o.n.x * 7, z: o.z - o.n.z * 7 });
  const steps = [];
  steps.push(S.goto(start, kind === 'xc' ? 'Rejoins le départ du cross' : 'Entre en piste : rejoins le départ', { r: 7, mode: 'ride' }));
  if (intro) steps.push(S.dialog(intro));
  steps.push(
    S.custom({
      text: 'Prends ton élan…',
      start() {
        if (heights) ob.setHeights(courseId, heights);
        ob.resetRails(courseId);
        ob.highlight(courseId, 1);
        game.audio.cheer();
      },
      update: () => true,
    })
  );
  steps.push(S.countdown());
  steps.push(
    S.custom({
      kind: 'course',
      courseId,
      finish,
      text: () => (state.next <= list().length ? `Obstacle n°${state.next} sur ${list().length}` : 'Passe la ligne d’arrivée !'),
      target: () => (state.next <= list().length ? approach(list()[state.next - 1]) : finish),
      radius: 4,
      start(r) {
        state.running = true;
        game.cam.lastManual = -10;
        const pen = kind === 'xc' ? 20 : 4;
        const offs = [
          game.bus.on('obstacle:clear', ({ obstacle, dir }) => {
            if (obstacle.course !== courseId) return;
            if (obstacle.num === state.next && dir > 0) {
              state.next++;
              state.fenceRefusals = 0;
              game.audio.tone(990, 0.08, 'sine', 0.08);
              ob.highlight(courseId, state.next);
              r.applyWaypoint();
            }
          }),
          game.bus.on('obstacle:fault', ({ obstacle, dir }) => {
            if (obstacle.course !== courseId) return;
            if (obstacle.num === state.next && dir > 0) {
              state.next++;
              state.fenceRefusals = 0;
              state.faults += 4;
              game.audio.fault();
              game.hud.toast(kind === 'xc' ? 'Touché ! +4' : 'Barre tombée ! +4');
              ob.highlight(courseId, state.next);
              r.applyWaypoint();
            }
          }),
          game.bus.on('obstacle:refusal', ({ obstacle }) => {
            if (obstacle.course !== courseId || obstacle.num !== state.next) return;
            state.refusals++;
            state.fenceRefusals++;
            state.faults += pen;
            game.audio.fault();
            game.hud.toast(`Refus ! +${pen}`);
            if (state.refusals < maxRefusals && state.fenceRefusals < 3) game.hud.hint('Fais une <b>volte</b> pour reprendre ton élan, puis représente l’obstacle.', 3500);
          }),
        ];
        r.onCleanup(() => offs.forEach((f) => f()));
        r.onCleanup(() => ob.highlight(courseId, -1));
        game.hud.hint('Appuie sur <b>SAUT</b> quand l’anneau devient <b>vert</b>.', 4000);
      },
      update(r, dt) {
        state.t += dt;
        if (game.player.mode !== 'ride') return { fail: 'Tu es descendu de cheval : éliminé.' };
        if (state.refusals >= maxRefusals) return { fail: `${maxRefusals}e refus : éliminé du parcours.` };
        if (kind === 'xc' && state.fenceRefusals >= 3) return { fail: '3e refus sur le même obstacle : éliminé du parcours.' };
        // Temps limite : le double du temps accordé.
        if (state.t > timeAllowed * 2) return { fail: 'Temps limite dépassé : éliminé.' };
        if (state.next > list().length) {
          const f = game.player.horse.pos;
          const fx = finish.x, fz = finish.z;
          const n = { x: Math.sin(finish.rot ?? 0), z: Math.cos(finish.rot ?? 0) };
          const s = (f.x - fx) * n.x + (f.z - fz) * n.z;
          const u = Math.abs((f.x - fx) * n.z - (f.z - fz) * n.x);
          // Ligne orientée : passer entre les fanions, plantés à ± w/2 de l'axe.
          if (finish.rot === undefined ? Math.hypot(f.x - fx, f.z - fz) < (finish.w || 6) : s > 0 && s < 4 && u < (finish.w || 6) / 2) {
            state.finished = true;
            return true;
          }
        }
        return false;
      },
      end() {
        state.running = false;
        const over = Math.max(0, state.t - timeAllowed);
        // CSO (barème A) : 1 point par seconde entamée ; cross : 0,4 point par seconde.
        state.timeFaults = kind === 'xc' ? Math.round(over * 0.4) : Math.ceil(over - 1e-9);
        run.resultTime = state.t;
        run.resultTimeLabel = 'Chrono';
      },
    })
  );
  run.sub = () => (state.running || state.finished ? `Pénalités : ${state.faults} · ${formatTime(state.t)} / ${formatTime(timeAllowed)}` : null);
  return steps;
}

export function totalPenalties(run) {
  const c = run.data.course;
  return c ? c.faults + c.timeFaults : 0;
}

// ---------- Anneaux de passage ----------
const RING_GEO = new THREE.TorusGeometry(3.2, 0.22, 8, 32);
export function checkpointSteps(game, run, S, points, { text = 'Passe dans les anneaux', mode = 'ride', timeLimit = null, r = 5.5 } = {}) {
  const group = new THREE.Group();
  const meshes = points.map((p, i) => {
    const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: '#f4f3ef', transparent: true, opacity: i === 0 ? 0.95 : 0.35 }));
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    m.rotation.y = Math.atan2(next[0] - prev[0], next[1] - prev[1]);
    m.position.set(p[0], game.terrain.getHeight(p[0], p[1]) + 3.4, p[1]);
    group.add(m);
    return m;
  });
  const st = { i: 0 };
  return S.custom({
    kind: 'rings',
    points,
    ringState: st,
    text: () => `${text} · ${st.i}/${points.length}`,
    target: () => ({ x: points[Math.min(st.i, points.length - 1)][0], z: points[Math.min(st.i, points.length - 1)][1] }),
    radius: r,
    beacon: false,
    start(rn) {
      game.scene.add(group);
      rn.onCleanup(() => game.scene.remove(group));
      if (timeLimit) rn.timer = timeLimit;
    },
    update(rn) {
      if (mode && game.player.mode !== mode) return false;
      const f = game.player.focus.pos;
      const p = points[st.i];
      if (Math.hypot(f.x - p[0], f.z - p[1]) < r) {
        meshes[st.i].visible = false;
        game.audio.tone(880 + st.i * 60, 0.1, 'sine', 0.1);
        st.i++;
        if (st.i >= points.length) {
          if (timeLimit) rn.timer = null;
          return true;
        }
        meshes[st.i].material.opacity = 0.95;
        rn.applyWaypoint();
      }
      for (const m of meshes) m.rotation.z += 0.01;
      return false;
    },
  });
}

// ---------- Course d'hippodrome ----------
const SILKS = ['#b8322a', '#2f5f8a', '#e3b23c', '#2f6e4a', '#7a5a8a'];
const RIVAL_NAMES = ['Éclair de Lune', 'Quick Star', 'Diamant Noir', 'Belle Écume', 'Tempête'];

export function ovalLength(r) {
  return 4 * HIPPO.half + 2 * Math.PI * r;
}

export function ovalPoint(s, r) {
  const L = HIPPO.half * 2;
  const arc = Math.PI * r;
  const total = 2 * L + 2 * arc;
  let d = (((s % total) + total) % total);
  if (d < L) return [HIPPO.x - HIPPO.half + d, HIPPO.z - r];
  d -= L;
  if (d < arc) {
    const a = -Math.PI / 2 + d / r;
    return [HIPPO.x + HIPPO.half + Math.cos(a) * r, HIPPO.z + Math.sin(a) * r];
  }
  d -= arc;
  if (d < L) return [HIPPO.x + HIPPO.half - d, HIPPO.z + r];
  d -= L;
  const a = Math.PI / 2 + d / r;
  return [HIPPO.x - HIPPO.half + Math.cos(a) * r, HIPPO.z + Math.sin(a) * r];
}

// Abscisse curviligne approchée de (x,z) sur l'ovale (rayon de référence) + écart radial.
export function ovalProject(x, z) {
  const R = HIPPO.radius;
  const L = HIPPO.half * 2;
  const arc = Math.PI * R;
  const lx = x - HIPPO.x;
  const lz = z - HIPPO.z;
  if (Math.abs(lx) <= HIPPO.half) {
    if (lz < 0) return { s: lx + HIPPO.half, off: -lz - R };
    return { s: L + arc + (HIPPO.half - lx), off: lz - R };
  }
  if (lx > HIPPO.half) {
    const a = Math.atan2(lz, lx - HIPPO.half);
    return { s: L + (a + Math.PI / 2) * R, off: Math.hypot(lx - HIPPO.half, lz) - R };
  }
  let a = Math.atan2(lz, lx + HIPPO.half);
  if (a < 0) a += Math.PI * 2;
  return { s: 2 * L + arc + (a - Math.PI / 2) * R, off: Math.hypot(lx + HIPPO.half, lz) - R };
}

export function raceSteps(game, run, S, { onFinish } = {}) {
  const total = ovalLength(HIPPO.radius);
  const startS = 60; // x = HIPPO.x - 40
  const finishS = total + 100; // ligne d'arrivée au poteau (x = HIPPO.x)
  const race = { rivals: [], player: { prog: startS, lastS: startS, finished: false }, order: [], started: false, done: false, t: 0 };
  run.data.race = race;
  const setup = () => {
    const sp = ovalPoint(startS, HIPPO.radius);
    const lanes = [-6, -3.5, 3.5, 6, 8.5];
    RIVAL_NAMES.forEach((name, i) => {
      const lane = HIPPO.radius + lanes[i] * 0.9;
      const h = game.spawnHorse({ id: `rival${i}`, name, coat: ['chestnut', 'black', 'grey', 'darkbay', 'bay'][i], speed: 1, jump: 1, stamina: 1 }, sp[0], HIPPO.z - lane, Math.PI / 2, { pad: SILKS[i], padTrim: '#f2f1ec' });
      const jockey = game.spawnHuman({ top: SILKS[i], sleeve: SILKS[i], pants: '#f2f1ec', boots: '#121214', skin: ['#e2b894', '#c99a74', '#8d5e3c', '#f0cfb0', '#a8754e'][i], hair: '#2a1d14', helmet: SILKS[(i + 2) % 5] }, sp[0], HIPPO.z - lane, 0);
      jockey.mount(h);
      h.frozen = true;
      const pts = [];
      const laneR = HIPPO.radius + (i - 2) * 1.6;
      for (let k = 0; k <= 64; k++) pts.push(ovalPoint(startS + 12 + (k / 64) * (total + 60), laneR));
      const base = [12.6, 12.3, 11.9, 11.5, 11.1][i] * (0.98 + Math.random() * 0.04);
      const r = { horse: h, jockey, name, prog: startS, lastS: startS, finished: false, base };
      h.ai = new PathAI(pts, {
        loop: false,
        lookahead: 7,
        speed: () => {
          if (!race.started) return 0;
          const lead = r.prog - race.player.prog;
          let k = 1;
          if (lead > 45) k = 0.9;
          else if (lead < -45) k = 1.06;
          const surge = r.prog > finishS - 220 ? 1.06 : 1;
          return r.base * k * surge;
        },
      });
      race.rivals.push(r);
      run.onCleanup(() => {
        game.despawn(jockey);
        game.despawn(h);
      });
    });
    const p = ovalPoint(startS, HIPPO.radius);
    game.player.horse.setPosition(p[0], HIPPO.z - HIPPO.radius, Math.PI / 2);
    game.player.horse.stamina = game.player.horse.maxStamina;
    game.cam.snap(game.player.horse.pos, Math.PI / 2);
  };
  const progress = (entity, st, dt) => {
    const pos = entity.pos;
    const pr = ovalProject(pos.x, pos.z);
    let ds = pr.s - (st.lastS % total);
    if (ds < -total / 2) ds += total;
    if (ds > total / 2) ds -= total;
    st.lastS = st.lastS + ds;
    const onTrack = Math.abs(pr.off) < HIPPO.width / 2 + 2.5;
    if (onTrack && ds > 0) st.prog += Math.min(ds, (entity.speed + 2) * dt * 1.3);
    else if (!onTrack) st.prog += 0;
    return onTrack;
  };
  return [
    S.goto({ x: HIPPO.x - 70, z: HIPPO.z - HIPPO.radius - 14 }, 'Rejoins l’hippodrome (entrée côté tribunes)', { r: 14, mode: 'ride' }),
    S.dialog([
      { who: 'Victor Girard', initials: 'VG', text: 'Un tour de piste, cinq adversaires. Le grand galop ne dure pas : garde de l’endurance pour la dernière ligne droite !' },
    ]),
    S.custom({
      text: 'Place-toi dans les stalles…',
      start(r) {
        r.flags.setup = false;
        game.fade(() => {
          setup();
          r.flags.setup = true;
        });
      },
      update(r) {
        return r.flags.setup && r.stepT > 1.2;
      },
    }),
    S.countdown(),
    S.custom({
      kind: 'race',
      text: () => {
        const pos = 1 + race.rivals.filter((r) => r.prog > race.player.prog).length;
        return race.player.offTrack ? 'Reste sur la piste !' : `Position ${pos}/6 · Termine dans le top 3`;
      },
      start(r) {
        race.started = true;
        race.rivals.forEach((x) => (x.horse.frozen = false));
        game.audio.cheer();
        game.hud.hint('Maintiens <b>GALOP</b> par à-coups : l’endurance se recharge au galop normal.', 5000);
        r.data.finishPos = null;
        void r;
      },
      update(r, dt) {
        race.t += dt;
        if (game.player.mode !== 'ride') return { fail: 'Tu es descendu de cheval.' };
        const onTrack = progress(game.player.horse, race.player, dt);
        race.player.offTrack = !onTrack;
        for (const rv of race.rivals) {
          progress(rv.horse, rv, dt);
          if (!rv.finished && rv.prog >= finishS) {
            rv.finished = true;
            race.order.push(rv.name);
          }
        }
        if (!race.player.finished && race.player.prog >= finishS) {
          race.player.finished = true;
          race.order.push('player');
          r.data.finishPos = race.order.length;
          r.resultTime = race.t;
          r.resultTimeLabel = 'Chrono';
          game.audio.cheer();
          return true;
        }
        if (race.t > 160) return { fail: 'Course terminée sans toi…' };
        return false;
      },
    }),
    S.custom({
      text: 'Ralentis après la ligne',
      update(r) {
        onFinish?.(r.data.finishPos);
        if (r.data.finishPos > 3) return { fail: `Tu termines ${r.data.finishPos}e. Il faut finir dans le top 3.` };
        return r.stepT > 1.5;
      },
    }),
  ];
}

export { clamp, CSO_FINISH };
