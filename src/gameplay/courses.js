// Épreuves : parcours d'obstacles (CSO, cross), course d'hippodrome, anneaux de passage.
import * as THREE from 'three';
import { HIPPO, BEACH, beachWig } from '../world/layout.js';
import { tideLevel } from '../world/weather.js';
import { CSO_FINISH, CSO_LENGTH, CSO_START, CSO_GATE } from './obstacles.js';
import { CourseAids } from './courseAids.js';
import { simulateField, rankResults } from './ranking.js';
import { coursePlanSvg, coursePlanLegend } from '../ui/coursePlan.js';
import { formatMoney, dec, clamp } from '../core/math.js';
import { HORSE, CONFIG } from '../config.js';
import { PathAI } from '../entities/horse.js';

// ---------- Parcours d'obstacles ----------
// Temps accordé réglementaire : longueur du parcours (mesurée au tracé du cavalier) divisée par la vitesse imposée
// (350 m/min en épreuves nationales, 375 m/min en CSI, 400 m/min en Grand Prix CSI 5* de plein air).
export const COURSE_LENGTH = { cso: CSO_LENGTH, xc: 760 };
export const COURSE_SPEED = { national: 350, csi: 375, gp: 400, crossAmateur: 420 };
export const timeAllowedFor = (length, speed) => Math.ceil((length / speed) * 60);

// Délai réglementaire entre la cloche et le passage de la ligne de départ : au-delà, le chrono part de lui-même.
export const BELL_DELAY = 45;

// Ligne orientée franchie entre deux positions (dans le sens de la ligne, entre les fanions).
function lineCrossed(L, p0, p1) {
  if (!p0) return false;
  const n = { x: Math.sin(L.rot), z: Math.cos(L.rot) };
  const s0 = (p0.x - L.x) * n.x + (p0.z - L.z) * n.z;
  const s1 = (p1.x - L.x) * n.x + (p1.z - L.z) * n.z;
  const u = Math.abs((p1.x - L.x) * n.z - (p1.z - L.z) * n.x);
  return s0 < 0 && s1 >= 0 && u < (L.w || 6) / 2 + 0.3;
}

const difficultyOf = (h) => (h < 1.08 ? 'Facile' : h < 1.18 ? 'Moyenne' : h < 1.35 ? 'Difficile' : 'Très difficile');
const ordinal = (n) => (n === 1 ? '1re' : `${n}e`);

// Épreuve sur un parcours d'obstacles. CSO : présentation (plan consultable), entrée en piste annoncée, cloche, chrono
// lancé au passage de la ligne de départ, barème A au chrono, arrivée, bilan et classement (opts.result). Cross : départ
// au compte à rebours, sans cloche ni présentation.
export function courseSteps(game, run, S, opts) {
  const { courseId, start, finish, timeAllowed, heights, kind = 'cso', intro = null } = opts;
  const cso = kind === 'cso';
  // Capacité de saut du couple (puissance du cheval, équipement) : avertissement avant d'entrer en piste si les
  // obstacles sont hors de portée — comme un entraîneur le dirait avant d'engager le cheval.
  const maxH = heights ? Math.max(...heights) : null;
  // Règlement FEI : élimination au deuxième refus en CSO, au quatrième sur un cross (ou au troisième sur un même obstacle).
  const maxRefusals = opts.maxRefusals ?? (kind === 'xc' ? 4 : 2);
  const pen = kind === 'xc' ? 20 : 4;
  const soft = opts.soft || !!opts.result;
  const ob = game.obstacles;
  const list = () => ob.ofCourse(courseId);
  const labelOf = (o) => (o ? o.label || String(o.num) : '');
  const horse = () => game.player.horse;
  const settings = () => game.save.data.settings;
  // Aide à l'appel : réglage du joueur, ou imposée par l'épreuve (défi à conditions fixes : aide complète).
  const aid = () => (opts.jumpAid === false ? 'off' : opts.jumpAid === true ? 'full' : settings().jumpAid || 'full');
  const startLine = cso && start?.rot === undefined ? CSO_START : start;
  const title = opts.title || (cso ? 'Parcours du Pôle International' : 'Cross de Saint-Gatien');
  const fresh = (attempt = 1) => ({
    faults: 0, refusals: 0, fenceRefusals: 0, next: 1, t: 0, running: false, started: false, finished: false, timeFaults: 0,
    log: [], wrong: new Set(), bell: BELL_DELAY, attempt, eliminated: null,
  });
  let state = fresh();
  run.data.course = state;
  const approach = (o) => ({ x: o.x - o.n.x * 7, z: o.z - o.n.z * 7 });
  const startApproach = startLine ? { x: startLine.x - Math.sin(startLine.rot ?? 0) * 8, z: startLine.z - Math.cos(startLine.rot ?? 0) * 8 } : start;
  const classH = opts.height ?? (heights ? heights[Math.floor(heights.length / 2)] : null);
  const introLines = () => (typeof intro === 'function' ? intro() : intro) || [];

  // ---------- Présentation et plan ----------
  const showPlan = (back) => {
    game.screens.card({
      kicker: 'Plan du parcours',
      title,
      html: `${coursePlanSvg({ heights: heights || null })}<p class="plan-legend">${coursePlanLegend()} · ${COURSE_LENGTH.cso} m · temps accordé ${timeAllowed} s</p>`,
      buttons: [{ label: 'Retour', id: 'plan-back', primary: true, run: back }],
    });
  };
  const showPresentation = (done) => {
    const h = horse();
    const rows = [
      ['Épreuve', `${opts.className ? `${opts.className} · ` : ''}barème A au chrono`],
      ['Hauteur', classH ? `${dec(classH, 2)} m · difficulté ${difficultyOf(classH).toLowerCase()}` : '—'],
      ['Cheval engagé', h ? h.name : '—'],
      ['Temps accordé', `${timeAllowed} s`],
      ['Parcours', `${list().length - 1} obstacles dont un double (7A – 7B) · ${COURSE_LENGTH.cso} m`],
    ];
    const jury = introLines().map((l) => l.text).join(' ');
    game.screens.card({
      kicker: `STRIDES · ${opts.place || 'Pôle International'}`,
      title,
      html: `<div class="cso-pres">${rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('')}</div>${jury ? `<p class="cso-jury">${jury}</p>` : ''}<p class="cso-rules">Barre ou premier refus : 4 points · deuxième refus : élimination · 1 point par seconde entamée au-delà du temps accordé.</p>`,
      buttons: [
        { label: 'Voir le plan', id: 'plan', run: () => showPlan(() => showPresentation(done)) },
        { label: 'Entrer en piste', primary: true, id: 'enter', run: done },
      ],
    });
  };

  // ---------- Informations du tableau de chrono ----------
  const hudInfo = () => {
    const over = Math.max(0, state.t - timeAllowed);
    return {
      started: state.started,
      bell: state.bell,
      t: state.t,
      ta: timeAllowed,
      pen: state.faults + (cso ? Math.ceil(over - 1e-9) : Math.round(over * 0.4)),
      over: over > 0,
      next: state.next <= list().length ? labelOf(list()[state.next - 1]) : 'Arrivée',
      finished: state.finished,
      eliminated: !!state.eliminated,
    };
  };

  // ---------- Parcours ----------
  const courseStep = () => {
    let offs = [];
    let aids = null;
    let prevP = null;
    const fin = finish;
    return S.custom({
      kind: 'course',
      courseId,
      finish: fin,
      startLine,
      text: () => {
        if (state.eliminated) return 'Éliminé';
        if (cso && !state.started) return 'Franchis la ligne de départ';
        const o = list()[state.next - 1];
        return o ? `Obstacle ${labelOf(o)}${/A$/.test(o.label || '') ? ' · double' : ''} sur ${list().length}` : 'Passe la ligne d’arrivée !';
      },
      target: () => {
        if (cso && !state.started) return startApproach;
        const o = list()[state.next - 1];
        return o ? approach(o) : fin;
      },
      radius: 4,
      beacon: false,
      start(r) {
        state.running = true;
        if (!cso) state.started = true;
        game.cam.lastManual = -10;
        game.course = { running: true, camera: true, jumpTiming: () => (aid() === 'off' ? 'none' : ob.timing(horse())), hud: hudInfo };
        aids = new CourseAids(game, courseId);
        const advance = () => {
          state.next++;
          state.fenceRefusals = 0;
          ob.highlight(courseId, state.next);
          r.applyWaypoint();
        };
        const notStarted = () => {
          if (state.started) return false;
          game.hud.hint('Le chrono n’est pas lancé : franchis d’abord la <b>ligne de départ</b>.', 3000);
          return true;
        };
        const wrongCourse = (o) => {
          if (state.wrong.has(o.num)) return;
          state.wrong.add(o.num);
          game.audio.fault();
          game.hud.toast(`Erreur de parcours : ce n’est pas le ${labelOf(list()[state.next - 1])}`);
          game.hud.hint(`Erreur de parcours : saute l’obstacle <b>${labelOf(list()[state.next - 1])}</b> (repère vert).`, 3500);
        };
        offs = [
          game.bus.on('obstacle:clear', ({ obstacle, dir }) => {
            if (obstacle.course !== courseId || state.finished || state.eliminated || notStarted()) return;
            if (obstacle.num === state.next && dir > 0) {
              state.log.push({ label: labelOf(obstacle), kind: 'clear' });
              game.audio.tone(990, 0.06, 'sine', 0.06);
              advance();
            } else if (dir > 0) wrongCourse(obstacle);
          }),
          game.bus.on('obstacle:fault', ({ obstacle, dir, cause, causeText }) => {
            if (obstacle.course !== courseId || state.finished || state.eliminated || notStarted()) return;
            if (obstacle.num === state.next && dir > 0) {
              state.faults += 4;
              state.log.push({ label: labelOf(obstacle), kind: 'rail', cause, causeText });
              game.audio.fault();
              game.audio.crowdOoh?.();
              game.hud.toast(`${kind === 'xc' ? 'Touché' : 'Barre'} au ${labelOf(obstacle)} · +4${causeText ? ` · ${causeText}` : ''}`);
              advance();
            } else if (dir > 0) wrongCourse(obstacle);
          }),
          game.bus.on('obstacle:refusal', ({ obstacle, dir }) => {
            // Refus compté seulement face à l'obstacle, dans son sens de franchissement.
            if (obstacle.course !== courseId || state.finished || state.eliminated || !state.started || dir < 0) return;
            const expected = list()[state.next - 1];
            if (obstacle !== expected) return;
            state.refusals++;
            state.fenceRefusals++;
            state.faults += pen;
            state.log.push({ label: labelOf(obstacle), kind: 'refusal' });
            game.audio.fault();
            game.audio.crowdOoh?.();
            // Refus dans une combinaison : on reprend la combinaison à son premier élément.
            let msg = 'Fais une <b>volte</b> pour reprendre ton élan, puis représente l’obstacle.';
            if (/B$/.test(obstacle.label || '')) {
              const a = list().find((o) => o.label === obstacle.label.replace(/B$/, 'A'));
              if (a) {
                state.next = a.num;
                ob.highlight(courseId, state.next);
                r.applyWaypoint();
                msg = `Refus dans le double : reprends-le au <b>${a.label}</b>.`;
              }
            }
            game.hud.toast(`Refus au ${labelOf(obstacle)} · +${pen}`);
            if (state.refusals < maxRefusals && state.fenceRefusals < 3) game.hud.hint(msg, 3500);
          }),
        ];
        if (cso) game.hud.hint('Franchis la <b>ligne de départ</b> : le chrono part. Appuie sur <b>SAUT</b> quand le bouton est <b>vert</b>.', 5000);
        else game.hud.hint('Appuie sur <b>SAUT</b> quand le bouton est <b>vert</b>.', 4000);
      },
      update(r, dt) {
        const h = horse();
        const P = { x: h.pos.x, z: h.pos.z };
        const p0 = prevP;
        prevP = P;
        if (!state.started) {
          state.bell -= dt;
          if (startLine && lineCrossed(startLine, p0, P)) {
            state.started = true;
            game.audio.tone(1568, 0.1, 'sine', 0.08);
            ob.highlight(courseId, state.next);
            r.applyWaypoint();
          } else if (state.bell <= 0) {
            state.started = true;
            game.hud.toast(`${BELL_DELAY} s écoulées : le chrono est lancé`);
            r.applyWaypoint();
          }
        } else if (!state.finished) state.t += dt;
        const next = state.started ? list()[state.next - 1] : list()[0];
        const prevO = list()[state.next - 2];
        aids.update(dt, {
          next: state.finished ? null : next,
          prevS: !state.started || !prevO ? 0 : prevO.lineS ?? 0,
          showLine: settings().courseLine !== false && aid() !== 'off',
          showZone: aid() === 'full',
        });
        // Élimination : échec de la mission, ou (épreuve « souple ») fin du parcours avec le motif, la suite continuant.
        const out = (reason) => {
          game.audio.bell?.(2);
          game.hud.big('ÉLIMINÉ', reason, 2600);
          if (!soft) return { fail: reason };
          state.eliminated = reason;
          return true;
        };
        if (game.player.mode !== 'ride') return out('Tu es descendu de cheval : éliminé.');
        if (state.refusals >= maxRefusals) return out(`${maxRefusals}e refus : éliminé du parcours.`);
        if (kind === 'xc' && state.fenceRefusals >= 3) return out('3e refus sur le même obstacle : éliminé du parcours.');
        // Temps limite : le double du temps accordé.
        if (state.t > timeAllowed * 2) return out('Temps limite dépassé : éliminé.');
        if (state.started && state.next > list().length) {
          const crossed = fin.rot === undefined ? Math.hypot(P.x - fin.x, P.z - fin.z) < (fin.w || 6) : lineCrossed(fin, p0, P);
          if (crossed) {
            state.finished = true;
            const over = Math.max(0, state.t - timeAllowed);
            const pts = state.faults + (cso ? Math.ceil(over - 1e-9) : Math.round(over * 0.4));
            game.audio.applause?.(pts === 0 ? 1.3 : 0.55, pts === 0 ? 4 : 2.6);
            if (pts === 0) game.audio.cheer();
            game.hud.big(pts === 0 ? 'SANS FAUTE !' : `${pts} POINT${pts > 1 ? 'S' : ''}`, `${dec(state.t, 2)} s`, 2600);
            return true;
          }
        }
        return false;
      },
      end() {
        offs.forEach((f) => f());
        offs = [];
        aids?.dispose();
        aids = null;
        ob.highlight(courseId, -1);
        game.course = null;
        state.running = false;
        // Notifications retenues pendant le parcours.
        if (!game.hud.notifActive) game.hud._nextNotif?.();
        const over = Math.max(0, state.t - timeAllowed);
        // CSO (barème A) : 1 point par seconde entamée ; cross : 0,4 point par seconde.
        state.timeFaults = kind === 'xc' ? Math.round(over * 0.4) : Math.ceil(over - 1e-9);
        run.resultTime = state.t;
        run.resultTimeLabel = 'Chrono';
      },
    });
  };

  // ---------- Bilan, classement, récompense ----------
  const resultStep = () =>
    S.custom({
      text: 'Résultats…',
      start(r) {
        const res = opts.result;
        const st = state;
        const out = !!st.eliminated;
        const total = st.faults + st.timeFaults;
        const me = { rider: game.save.data.playerName, horse: horse()?.name || 'Cheval', faults: total, time: Math.round(st.t * 100) / 100, me: true };
        const cls = { ta: timeAllowed, ...res.cls };
        const field = simulateField(cls, (res.seed ?? 7) + st.attempt * 31, res.n ?? 14);
        const ranked = rankResults(out ? field : [...field, me]);
        const rank = out ? null : ranked.indexOf(me) + 1;
        const prizes = cls.prizes || [];
        let prize = 0;
        let reward;
        if (out) reward = 'aucune (éliminé)';
        else if (!prizes[rank - 1]) reward = 'hors dotation';
        else if (r.data.rewarded) reward = `${formatMoney(prizes[rank - 1])} — dotation déjà reçue pour ta première manche classée`;
        else {
          prize = prizes[rank - 1];
          r.data.rewarded = true;
          r.payOverride = (r.payOverride || 0) + prize;
          reward = formatMoney(prize);
        }
        res.onResult?.({ run: r, rank, prize, me, out, ranked, state: st, total });
        const faultsTxt = st.log.filter((l) => l.kind !== 'clear').map((l) => (l.kind === 'refusal' ? `refus au ${l.label}` : `barre au ${l.label}${l.causeText ? ` (${l.causeText.toLowerCase()})` : ''}`));
        const rows = ranked.slice(0, 8);
        if (rank && !rows.includes(me)) rows.push(me);
        const table = `<table class="cso-rank">${rows.map((x) => {
          const k = ranked.indexOf(x) + 1;
          return `<tr${x.me ? ' class="me"' : ''}><td>${k}</td><td>${x.rider} · ${x.horse}</td><td>${x.faults} pt${x.faults > 1 ? 's' : ''}</td><td>${dec(x.time, 2)} s</td><td>${prizes[k - 1] ? `${prizes[k - 1]} €` : ''}</td></tr>`;
        }).join('')}</table>`;
        const bilan = [
          ['Chrono', out ? '—' : `${dec(st.t, 2)} s (accordé ${timeAllowed} s)`],
          ['Fautes aux obstacles', faultsTxt.length ? `${st.faults} pts : ${faultsTxt.join(', ')}` : '0 · aucune'],
          ['Pénalités de temps', out ? '—' : `${st.timeFaults} pt${st.timeFaults > 1 ? 's' : ''}`],
          ['Total', out ? 'Éliminé' : `${total} pt${total > 1 ? 's' : ''}`],
          ['Classement', out ? `éliminé · ${st.eliminated}` : `${ordinal(rank)} sur ${ranked.length}`],
          ['Récompense', reward],
        ];
        r.flags.res = null;
        game.screens.card({
          kicker: `Résultats · ${res.title || title}${st.attempt > 1 ? ` · manche ${st.attempt}` : ''}`,
          title: out ? 'Éliminé' : rank === 1 ? (total === 0 ? 'Victoire, sans faute !' : 'Victoire !') : total === 0 ? `Sans faute · ${ordinal(rank)}` : `${ordinal(rank)} place`,
          html: `<div class="cso-pres">${bilan.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('')}</div>${table}`,
          buttons: [
            { label: 'Recommencer', id: 'cso-retry', run: () => (r.flags.res = 'retry') },
            { label: 'S’entraîner', id: 'cso-train', run: () => (r.flags.res = 'train') },
            { label: res.continueLabel || 'Continuer', primary: true, id: 'cso-done', run: () => (r.flags.res = 'done') },
          ],
        });
      },
      update(r) {
        const v = r.flags.res;
        if (!v) return false;
        if (v === 'retry') {
          state = fresh(state.attempt + 1);
          run.data.course = state;
          r.steps.splice(r.i + 1, 0, ...attemptSteps());
          return true;
        }
        if (v === 'train') r.data.afterTrain = true;
        // Le bilan tient lieu d'écran de résultat de la mission.
        r.resultCustom = (close) => {
          if (r.payOverride) game.hud.toast(`Dotation versée : +${formatMoney(r.payOverride)}`, 'money');
          close();
          if (r.data.afterTrain) setTimeout(() => game.activities?.startTraining?.(), 300);
        };
        return true;
      },
    });

  // ---------- Une manche : entrée en piste, cloche, parcours, bilan ----------
  const attemptSteps = () => {
    const steps = [];
    if (cso) {
      steps.push(
        S.custom({
          text: 'Entrée en piste…',
          start(r) {
            if (heights) ob.setHeights(courseId, heights);
            ob.resetRails(courseId);
            ob.highlight(courseId, 1);
            const h = horse();
            const bib = opts.bib ?? run.data.bib ?? 40 + (Math.floor(game.time) % 50);
            game.hud.big(`N° ${bib} · ${game.save.data.playerName}`, `et ${h?.name || 'son cheval'}${opts.stable ? ` · ${opts.stable}` : ''}`, 2400);
            game.audio.applause?.(0.5, 2.2);
            void r;
          },
          update: (r) => r.stepT > 2.4,
        }),
        S.custom({
          text: '',
          start() {
            game.audio.bell?.();
            game.hud.big('CLOCHE', `Tu as ${BELL_DELAY} s pour franchir la ligne de départ`, 2000);
          },
          update: () => true,
        })
      );
    } else {
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
        }),
        S.countdown()
      );
    }
    steps.push(courseStep());
    if (opts.result) steps.push(resultStep());
    return steps;
  };

  const steps = [];
  if (cso) steps.push(S.goto(opts.gate ?? CSO_GATE, 'Entre en piste : rejoins l’entrée de la carrière', { r: 9, mode: 'ride' }));
  else steps.push(S.goto(start, 'Rejoins le départ du cross', { r: 7, mode: 'ride' }));
  if (!cso && intro) steps.push(S.dialog(intro));
  if (maxH) steps.push(S.custom({
    text: '',
    start(r) {
      const h = horse();
      const reach = h ? h.jumpPower + 0.2 + (h.mods?.clearance || 0) : 99;
      if (reach < maxH + 0.04) {
        r.flags.capWarn = true;
        game.hud.dialog([{ who: 'Entraîneur', initials: 'EN', text: `Obstacles jusqu’à ${maxH.toFixed(2).replace('.', ',')} m : avec ${h.name} et cet équipement, tu plafonnes vers ${reach.toFixed(2).replace('.', ',')} m. Il faudra un cheval plus puissant ou une selle adaptée (Sellerie du Port, « Mes chevaux »), sinon les barres tomberont.` }], () => (r.flags.capWarn = false));
      }
    },
    update: (r) => !r.flags.capWarn,
  }));
  if (cso && opts.present !== false) steps.push(S.custom({
    text: 'Présentation de l’épreuve',
    start(r) {
      r.flags.pres = false;
      showPresentation(() => (r.flags.pres = true));
    },
    update: (r) => r.flags.pres,
  }));
  steps.push(...attemptSteps());
  run.sub = () => null;
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
    group.add(m);
    return m;
  });
  // Pose des anneaux (refaite au départ : les points peuvent avoir été recalés entre-temps, p. ex. selon la marée).
  const place = () => meshes.forEach((m, i) => {
    const p = points[i];
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    m.rotation.y = Math.atan2(next[0] - prev[0], next[1] - prev[1]);
    m.position.set(p[0], game.terrain.getHeight(p[0], p[1]) + 3.4, p[1]);
  });
  place();
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
      place();
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

// Anneaux de galop sur la plage : posés sur le sable ferme, `offset` m au-dessus du rivage le plus haut que la marée
// atteindra d'ici le passage prévu du cavalier (eta(i) secondes après le départ, au galop : la mer montante ne les noie
// pas pendant le galop), jamais au pied des Planches (parasols, poste de secours, à 14 m au plus du perré). À basse mer
// de vives-eaux, la mer est à ~100 m des Planches : les anneaux sont alors loin, au bord de l'eau.
export const beachRingLevel = (game, seconds) => {
  const d = game.save.data;
  const hoursPerSecond = 24 / (d.settings?.timeScale === 'reel' ? 86400 : CONFIG.dayLength);
  const t0 = d.gameTime / 3600;
  let level = -Infinity;
  for (let k = 0; k <= 8; k++) level = Math.max(level, tideLevel(t0 + (k / 8) * seconds * hoursPerSecond));
  return level;
};
export function beachRingPoints(game, xs, { eta = (i) => 25 + i * 7, offset = 14, wobble = () => 0 } = {}) {
  return xs.map((x, i) => {
    const level = beachRingLevel(game, eta(i));
    return [x, Math.min(BEACH.berm + 4 + beachWig(x), game.terrain.waterlineZ(x, level) + offset + wobble(i))];
  });
}

// Longueur d'un tracé [[x, z], …].
export const pathLength = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

// ---------- Course d'hippodrome ----------
const SILKS = ['#b8322a', '#2f5f8a', '#e3b23c', '#2f6e4a', '#7a5a8a'];
const RIVAL_NAMES = ['Éclair de Lune', 'Quick Star', 'Diamant Noir', 'Belle Écume', 'Tempête'];
// Stalles de départ (géométrie dans world.js) : rayon de l'ovale au milieu du couloir k (0 = corde extérieure).
const stallR = (k) => HIPPO.radius + HIPPO.width / 2 - (HIPPO.width / 8) * (k + 0.5);
const STALLS = [5, 4, 2, 1, 0]; // couloirs des concurrents ; le joueur prend le n°3

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

// Tour de l'hippodrome : anneaux sur la piste en sable, entre les deux lices (corde à 61 m, anneau de 3,2 m de rayon :
// de 57,8 à 64,2 m pour une piste de 54 à 70 m), du poteau d'arrivée (x = HIPPO.x) au poteau, loin des stalles de
// départ fixes (x ≈ HIPPO.x − 40, couloirs extérieurs).
export const HIPPO_LAP = { r: 61, pass: 6, n: 12 };
export function hippoLapPoints(n = HIPPO_LAP.n, r = HIPPO_LAP.r) {
  const L = ovalLength(r);
  const post = HIPPO.half; // abscisse curviligne du poteau d'arrivée (x = HIPPO.x, ligne droite des tribunes)
  const pts = [];
  for (let i = 1; i <= n; i++) pts.push(ovalPoint(post + (i / n) * L, r));
  return pts;
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
    // Le cavalier à l'entraînement libère la piste le temps de la course : il regarde le départ depuis la pelouse
    // intérieure et reprend ses tours ensuite.
    const tr = game.ambient?.trainer;
    if (tr) {
      const tx = HIPPO.x - 30, tz = HIPPO.z - HIPPO.radius + HIPPO.width / 2 + 16;
      tr.frozen = true;
      tr.setPosition(tx, tz, Math.atan2(sp[0] - tx, sp[1] - tz));
      run.onCleanup(() => {
        tr.frozen = false;
        tr.ai.i = 0;
        tr.setPosition(tr.ai.points[0][0], tr.ai.points[0][1], Math.PI / 2);
      });
    }
    RIVAL_NAMES.forEach((name, i) => {
      const lane = stallR(STALLS[i]);
      const h = game.spawnHorse({ id: `rival${i}`, name, coat: ['chestnut', 'black', 'grey', 'darkbay', 'bay'][i], speed: 1, jump: 1, stamina: 1 }, sp[0], HIPPO.z - lane, Math.PI / 2, { pad: SILKS[i], padTrim: '#f2f1ec' });
      const jockey = game.spawnHuman({ top: SILKS[i], sleeve: SILKS[i], pants: '#f2f1ec', boots: '#121214', skin: ['#e2b894', '#c99a74', '#8d5e3c', '#f0cfb0', '#a8754e'][i], hair: '#2a1d14', helmet: SILKS[(i + 2) % 5] }, sp[0], HIPPO.z - lane, 0);
      jockey.mount(h);
      h.frozen = true;
      const pts = [];
      const laneR = HIPPO.radius + (i - 2) * 1.6;
      for (let k = 0; k <= 64; k++) pts.push(ovalPoint(startS + 12 + (k / 64) * (total + 60), laneR));
      // Adversaires proportionnés au grand galop d'un cheval de sport (14 m/s) : de 67 à 76 % de sa vitesse de pointe.
      const base = [0.76, 0.74, 0.72, 0.7, 0.67][i] * HORSE.gaits[4].speed * (0.98 + Math.random() * 0.04);
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
    game.player.horse.setPosition(p[0], HIPPO.z - stallR(3), Math.PI / 2);
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
    // Rendez-vous sur la piste, dans la ligne droite des tribunes, juste avant les stalles de départ.
    S.goto({ x: HIPPO.x - 70, z: HIPPO.z - HIPPO.radius }, 'Rejoins la piste de l’hippodrome (ligne droite des tribunes)', { r: 8, mode: 'ride' }),
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
        game.hud.hint('Maintiens <b>BOOST</b> par à-coups : l’endurance se recharge au galop normal.', 5000);
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
