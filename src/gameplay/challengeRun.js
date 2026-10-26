// Déroulé en jeu des défis rejouables (lot C) : conditions fixes appliquées au départ (cheval fourni, météo, heure,
// parcours), chrono porté par le système de missions (il reçoit un dt nul quand la simulation est suspendue :
// téléphone, dialogue, écran de choix), résultat et record, puis restauration du monde du joueur (heure, météo,
// cheval actif, position, mode). Le panneau d'entrée du Pôle donne accès au défi depuis le monde.
import * as THREE from 'three';
import { CURRENT_CHALLENGE, makeResult, recordResult, challengeStore, newAttemptId } from './challenge.js';
import { courseSteps } from './courses.js';
import { CSO_START, CSO_FINISH } from './obstacles.js';
import { POLE } from '../world/sites.js';
import { conditionText } from '../world/weather.js';
import { signTexture } from '../world/textures.js';
import { box, partsToGeo } from '../world/builders.js';
import { ChallengeUI } from '../ui/challenge-screens.js';

// Panneau du défi, à droite de l'arche d'entrée du Pôle (face à l'allée d'arrivée).
export const CHALLENGE_SIGN = { x: POLE.entrance.x + 11, z: POLE.entrance.z + 2.5, rot: 0 };

const copy = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

export class Challenges {
  constructor(game) {
    this.game = game;
    this.cfg = CURRENT_CHALLENGE;
    this.active = null;
    this.lastConditions = null;
    this.ui = new ChallengeUI(game, this);
    this._recover();
    this._sign();
    // Écran de résultat propre au défi (Recommencer, carte de résultat) à la place du résultat de mission.
    game.bus.on('mission:complete', ({ run, result }) => {
      const res = run.data?.challengeResult;
      if (!run.def.challenge || !res) return;
      result.custom = (close) => this.ui.result(this.cfg, res, run.data.challengeRecord, close);
    });
  }

  list() {
    return [this.cfg];
  }

  // Page rechargée pendant un défi : le monde du joueur (heure, position, état du cheval) est rétabli.
  _recover() {
    const g = this.game;
    const d = g.save.data;
    const c = challengeStore(d);
    const r = c.resume;
    if (!r) return;
    if (Number.isFinite(r.gameTime)) d.gameTime = r.gameTime;
    if (r.pos) d.pos = r.pos;
    if (r.care) {
      (d.horseCare ||= {})[r.care.id] = r.care.cond;
      if (g.mainHorse?.id === r.care.id) Object.assign(g.mainHorse.cond, r.care.cond);
    }
    c.resume = null;
  }

  _sign() {
    const g = this.game;
    const S = CHALLENGE_SIGN;
    const y = g.terrain.getHeight(S.x, S.z);
    const w = 3.6, hh = 0.9, postH = 1.7;
    const group = new THREE.Group();
    const posts = new THREE.Mesh(
      partsToGeo([
        [box(0.12, postH + hh, 0.12), '#26272b', { x: -w / 2 + 0.25 }],
        [box(0.12, postH + hh, 0.12), '#26272b', { x: w / 2 - 0.25 }],
        [box(w + 0.1, hh + 0.1, 0.08), '#1b1c1f', { y: postH - 0.05 }],
      ]),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
    );
    posts.castShadow = true;
    group.add(posts);
    const mat = new THREE.MeshStandardMaterial({ map: signTexture('DÉFI DU PÔLE', 'DÉFI REJOUABLE · CONDITIONS FIXES · V1', { dark: true }) });
    for (const side of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
      p.position.set(0, postH + hh / 2, side * 0.05);
      if (side < 0) p.rotation.y = Math.PI;
      group.add(p);
    }
    group.position.set(S.x, y, S.z);
    group.rotation.y = S.rot;
    g.scene.add(group);
    g.world.culled.push([group, S.x, S.z, 320]);
    g.colliders.addCircle(S.x - w / 2 + 0.25, S.z, 0.2, Infinity, 'sign');
    g.colliders.addCircle(S.x + w / 2 - 0.25, S.z, 0.2, Infinity, 'sign');
    this.signMesh = group;
    g.interact.add('challenge:defi-pole', {
      label: 'Défi du Pôle',
      icon: 'target',
      r: 6,
      priority: 1.2,
      modes: ['foot', 'ride'],
      x: S.x,
      z: S.z + 2,
      when: () => !g.missions.active,
      action: () => this.ui.intro(this.cfg, 'sign'),
    });
  }

  // Le défi peut-il démarrer ? Renvoie un motif lisible sinon.
  blocker() {
    const g = this.game;
    const p = g.player;
    if (g.state !== 'play') return 'Reprends la partie d’abord.';
    if (g.missions.active) return 'Termine ou abandonne ta mission en cours d’abord.';
    if (p.transport?.busy) return 'Termine d’abord le chargement du camion.';
    if (p.transport?.leading) return 'Lâche d’abord le cheval que tu mènes en main.';
    if (p.human.carrying) return 'Pose d’abord ce que tu portes.';
    return null;
  }

  start(cfg = this.cfg) {
    const g = this.game;
    const why = this.blocker();
    if (why) {
      g.hud.toast(why);
      return false;
    }
    const d = g.save.data;
    const attempt = newAttemptId(cfg);
    // Deuxième activité : un défi lancé après au moins une mission terminée (événement unique par partie).
    if (d.completed.length || d.stats.jobs) g.metrics.track('second_activity_started', { course: cfg.course });
    const def = {
      id: cfg.id,
      challenge: cfg.id,
      vertical: 'EVENEMENTS',
      category: 'Défi',
      title: cfg.name,
      desc: `${cfg.obstacles.length} obstacles à ${cfg.height} m, conditions fixes.`,
      client: null,
      place: CSO_START,
      placeName: cfg.place,
      pay: 0,
      xp: 0,
      noReview: true,
      noCount: true,
      setup: (game, run) => this._enter(cfg, run, attempt),
      steps: (game, run, S) => this._steps(cfg, run, S),
    };
    g.missions.start({ id: `challenge:${cfg.id}`, def, story: false, vertical: 'EVENEMENTS', category: 'Défi', title: cfg.name, pay: 0, xp: 0, place: CSO_START, placeName: cfg.place });
    g.hud.big(cfg.name.toUpperCase(), `Défi rejouable · ${cfg.id}`, 2400);
    return true;
  }

  // Heure et météo du défi, réappliquées à chaque image (avant le ciel) : rien ne dérive pendant la tentative.
  _pin(cfg) {
    const g = this.game;
    g.save.data.gameTime = cfg.weather.day * 86400 + cfg.weather.hour * 3600;
    g.sky.rain = cfg.weather.rain;
    g.sky.wet = cfg.weather.wet;
  }

  _steps(cfg, run, S) {
    const g = this.game;
    const steps = courseSteps(g, run, S, {
      courseId: cfg.courseId,
      start: CSO_START,
      finish: CSO_FINISH,
      timeAllowed: cfg.timeAllowed,
      heights: cfg.obstacles.map(() => cfg.height),
      maxRefusals: cfg.rules.refusalsToEliminate,
    });
    // Élimination : la tentative se termine avec un résultat (et non un échec de mission).
    const course = steps.find((s) => s.kind === 'course');
    const upd = course.update;
    course.update = (r, dt) => {
      const res = upd.call(course, r, dt);
      if (res && res.fail) {
        r.data.eliminated = res.fail;
        return true;
      }
      return res;
    };
    steps.push(
      S.custom({
        text: 'Résultat',
        start: (r) => this._finish(cfg, r),
        update: () => true,
      })
    );
    for (const s of steps) {
      const u = s.update;
      s.update = (r, dt) => {
        this._pin(cfg);
        return u ? u.call(s, r, dt) : true;
      };
    }
    return steps;
  }

  _enter(cfg, run, attempt) {
    const g = this.game;
    const p = g.player;
    const d = g.save.data;
    g._storePositions();
    const main = g.mainHorse;
    const all = g.obstacles.list.filter((o) => o.course === cfg.courseId).sort((a, b) => a.num - b.num);
    const pre = {
      mode: p.mode,
      human: { x: p.human.pos.x, z: p.human.pos.z, heading: p.human.heading },
      gameTime: d.gameTime,
      rain: g.sky.rain,
      wet: g.sky.wet,
      main: main ? { frozen: main.frozen, ai: main.ai, cond: main.cond.toJSON() } : null,
      heights: all.map((o) => o.h),
      offs: all.filter((o) => o.off).map((o) => o.num),
    };
    // Monde à rétablir si la page est rechargée pendant la tentative.
    challengeStore(d).resume = { gameTime: d.gameTime, pos: copy(d.pos), care: main ? { id: main.id, cond: main.cond.toJSON() } : null };
    if (p.mode === 'drive') {
      p.truck.speed = 0;
      p.exitTruck();
    }
    if (p.mode === 'ride') {
      p.horse.speed = 0;
      p.dismount(true);
    }
    if (main) {
      main.frozen = true;
      main.ai = null;
      main.speed = 0;
      main.control.mag = 0;
    }
    // Cheval fourni : statistiques de la version, sans équipement ni effet de la condition physique.
    const sx = CSO_START.x, sz = CSO_START.z + 2.5;
    const horse = g.spawnHorse({ ...cfg.horse, socks: [...cfg.horse.socks] }, sx, sz, CSO_START.rot, { player: true });
    horse.visibleDist = 600;
    horse.mods = { speed: 0, jump: 0, stamina: 0, clearance: 0 };
    Object.defineProperties(horse.cond, { speedMul: { get: () => 1 }, jumpMul: { get: () => 1 } });
    p.setHorse(horse);
    p.human.setPosition(sx + 1, sz + 1);
    p.mount();
    p.teleport(sx, sz, CSO_START.rot);
    horse.stamina = horse.maxStamina;
    horse.exhausted = false;
    // Parcours : obstacles retenus, hauteur unique, barres en place.
    const ob = g.obstacles;
    ob.setOff(cfg.courseId, all.map((o) => o.num).filter((n) => !cfg.obstacles.includes(n)));
    ob.setHeights(cfg.courseId, cfg.obstacles.map(() => cfg.height));
    ob.resetRails(cfg.courseId);
    this._pin(cfg);
    g.missions.noWhistle = true;
    this.active = { cfg, attempt, pre, horse, run };
    run.data.challenge = { id: cfg.id, attempt };
    run.onCleanup(() => this._exit());
    this.lastConditions = this.conditions();
    g.saveNow();
    // Fondu purement visuel (les conditions sont déjà en place).
    if (!g.syncFade) {
      g.screens.fade(true);
      setTimeout(() => g.screens.fade(false), 350);
    }
  }

  // Conditions effectives de la tentative en cours (vérification : deux tentatives doivent être identiques).
  conditions() {
    const g = this.game;
    const a = this.active;
    if (!a) return null;
    const h = a.horse;
    const t = g.save.data.gameTime;
    const day = Math.floor(t / 86400), hour = (t / 3600) % 24;
    const list = g.obstacles.ofCourse(a.cfg.courseId);
    return {
      challenge: a.cfg.id,
      horse: { name: h.name, speedMul: h.speedMul, jumpPower: h.jumpPower, maxStamina: h.maxStamina, stamina: h.stamina, mods: { ...h.mods } },
      day,
      hour,
      weather: conditionText(day, hour),
      rain: g.sky.rain,
      wet: g.sky.wet,
      obstacles: list.map((o) => o.num),
      heights: list.map((o) => o.h),
      timeAllowed: a.cfg.timeAllowed,
      start: { x: h.pos.x, z: h.pos.z, heading: h.heading },
    };
  }

  _finish(cfg, r) {
    const g = this.game;
    const a = this.active;
    const st = r.data.course;
    const elim = r.data.eliminated || null;
    const rails = Math.max(0, Math.round((st.faults - st.refusals * cfg.rules.firstRefusal) / cfg.rules.rail));
    const res = makeResult(cfg, { attempt: a?.attempt || r.data.challenge?.attempt, faults: st.faults, refusals: st.refusals, rails, t: st.t, eliminated: elim });
    const rec = recordResult(g.save.data, res);
    // Une fois par tentative (identifiant unique, dédoublonné dans la sauvegarde : un rechargement ne recompte pas).
    g.metrics.track('challenge_completed', { attempt: res.attempt, challenge_version: cfg.id, course: cfg.course, mode: elim ? 'eliminated' : 'finished' });
    r.data.challengeResult = res;
    r.data.challengeRecord = rec;
    r.resultTitle = elim ? 'Éliminé' : rec.isRecord ? 'Nouveau record' : 'Parcours terminé';
    r.resultTime = st.t;
    r.resultTimeLabel = 'Chrono';
  }

  // Restauration du monde du joueur (appelée au nettoyage de la tentative : fin, élimination ou abandon).
  _exit() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    const g = this.game;
    const p = g.player;
    const d = g.save.data;
    const { pre, cfg } = a;
    if (p.mode === 'ride') {
      p.horse.speed = 0;
      p.dismount(true);
    }
    g.despawn(a.horse);
    const main = g.mainHorse;
    if (main) {
      p.setHorse(main);
      if (pre.main) {
        main.frozen = pre.main.frozen;
        main.ai = pre.main.ai;
        Object.assign(main.cond, pre.main.cond);
      }
    }
    p.human.setPosition(pre.human.x, pre.human.z, pre.human.heading);
    if (pre.mode === 'ride' && main && !main.hiddenInTruck) p.mount();
    else if (pre.mode === 'drive') p.enterTruck();
    d.gameTime = pre.gameTime;
    g.sky.rain = pre.rain;
    g.sky.wet = pre.wet;
    const ob = g.obstacles;
    ob.setOff(cfg.courseId, pre.offs);
    ob.setHeights(cfg.courseId, pre.heights);
    ob.resetRails(cfg.courseId);
    ob.highlight(cfg.courseId, -1);
    challengeStore(d).resume = null;
    g.cam.snap(p.focus.pos, p.heading);
    g.saveSoon();
  }
}
