// Gestionnaire de missions Strides : offres (acceptées/refusées), déroulé par étapes, notes, paiements.
import { levelFor } from '../core/save.js';
import { REPUTATION } from '../config.js';
import { formatMoney, dec } from '../core/math.js';
import { STORY } from './story.js';
import { generateJob } from './jobs.js';

// ---------- Fabriques d'étapes ----------
export function makeSteps(game) {
  const P = () => game.player;
  const dist = (pos) => {
    const f = P().focus.pos;
    return Math.hypot(f.x - pos.x, f.z - pos.z);
  };
  const resolve = (v) => (typeof v === 'function' ? v() : v);
  const modeHint = (mode) => {
    if (!mode || P().mode === mode) return null;
    if (mode === 'ride') return P().mode === 'drive' ? 'Sors du camion puis monte à cheval.' : 'Monte sur ton cheval (siffle-le si besoin).';
    if (mode === 'foot') return P().mode === 'ride' ? 'Descends de cheval (bouton ACTION à l’arrêt).' : 'Sors du camion (ACTION à l’arrêt).';
    if (mode === 'drive') return 'Monte dans le camion Strides.';
    return null;
  };
  let uid = 0;
  return {
    dialog(lines) {
      return {
        kind: 'dialog',
        text: '…',
        start(run) {
          run.flags.dlg = false;
          P().locked = true;
          game.hud.dialog(typeof lines === 'function' ? lines() : lines, () => (run.flags.dlg = true));
        },
        update(run) {
          return run.flags.dlg;
        },
        end() {
          P().locked = false;
        },
      };
    },
    goto(pos, text, { r = 6, mode = null, hint = null, beacon = true } = {}) {
      return {
        kind: 'goto',
        mode,
        text: () => modeHint(mode) || resolve(text),
        target: pos,
        radius: r,
        beacon,
        hint,
        update() {
          const p = resolve(pos);
          return dist(p) < r && (!mode || P().mode === mode);
        },
      };
    },
    interact(pos, label, text, { r = 3.2, modes = ['foot'], hint = null, icon = 'hand', onDo = null, when = null } = {}) {
      const id = `mi${uid++}`;
      return {
        kind: 'interact',
        interactId: id,
        modes,
        text: () => {
          const need = !modes.includes(P().mode) ? modeHint(modes[0]) : null;
          return need || resolve(text);
        },
        target: pos,
        radius: r,
        hint,
        start(run) {
          run.flags[id] = false;
          game.interact.add(id, {
            label,
            icon,
            r,
            priority: 3,
            modes,
            getPos: () => resolve(pos),
            when,
            action: () => {
              run.flags[id] = true;
              onDo?.(run);
            },
          });
        },
        update(run) {
          return run.flags[id];
        },
        end() {
          game.interact.remove(id);
        },
      };
    },
    wait(sec, text = '') {
      return {
        text,
        start(run) {
          run.flags.wait = sec;
        },
        update(run, dt) {
          run.flags.wait -= dt;
          return run.flags.wait <= 0;
        },
      };
    },
    countdown() {
      return {
        kind: 'countdown',
        text: 'Prépare-toi…',
        start(run) {
          run.flags.cd = 3.6;
          run.flags.cdShown = 4;
          P().locked = true;
        },
        update(run, dt) {
          run.flags.cd -= dt;
          const n = Math.ceil(run.flags.cd - 0.6);
          if (n !== run.flags.cdShown) {
            run.flags.cdShown = n;
            if (n > 0) {
              game.hud.big(String(n), '', 700);
              game.audio.tone(660, 0.12, 'sine', 0.12);
            } else {
              game.hud.big('PARTEZ !', '', 900);
              game.audio.tone(1320, 0.3, 'sine', 0.14);
            }
          }
          return run.flags.cd <= 0.6;
        },
        end() {
          P().locked = false;
        },
      };
    },
    custom(def) {
      return def;
    },
  };
}

// ---------- Déroulé d'une mission ----------
class Run {
  constructor(game, offer, def) {
    this.game = game;
    this.offer = offer;
    this.def = def;
    this.flags = {};
    this.data = {};
    this.cleanups = [];
    this.t = 0;
    this.i = -1;
    this.stepT = 0;
    this.timer = null; // compte à rebours visible (s)
    this.finished = false;
    this.steps = def.steps(game, this, makeSteps(game));
  }
  onCleanup(fn) {
    this.cleanups.push(fn);
  }
  get step() {
    return this.steps[this.i];
  }
  begin() {
    this.next();
  }
  next() {
    const g = this.game;
    const cur = this.step;
    if (cur) cur.end?.(this);
    g.hud.clearHint();
    this.i++;
    this.stepT = 0;
    if (this.i >= this.steps.length) return g.missions.complete(this);
    const s = this.step;
    s.start?.(this);
    if (this.finished) return;
    this.applyWaypoint();
    if (s.hint) g.hud.hint(s.hint, s.hintMs || 6000);
  }
  applyWaypoint() {
    const s = this.step;
    const g = this.game;
    if (!s) return;
    if (s.target) {
      const t = typeof s.target === 'function' ? s.target() : s.target;
      g.gps.set(t, this.offer.title, { beacon: s.beacon !== false, radius: s.radius });
      if (typeof s.target === 'function') g.gps.target.follow = s.target;
    } else g.gps.clear();
  }
  text() {
    const s = this.step;
    if (!s) return '';
    return typeof s.text === 'function' ? s.text(this) : s.text;
  }
  update(dt) {
    if (this.finished) return;
    this.t += dt;
    this.stepT += dt;
    const s = this.step;
    if (!s) return;
    if (this.timer !== null && !this.timerPaused) {
      this.timer -= dt;
      if (this.timer <= 0) return this.game.missions.fail(this, this.def.timeoutText || 'Temps écoulé !');
    }
    const r = s.update ? s.update(this, dt) : true;
    if (this.finished) return;
    if (r && r.fail) return this.game.missions.fail(this, r.fail);
    if (r) this.next();
  }
  cleanup() {
    const g = this.game;
    this.step?.end?.(this);
    for (const fn of this.cleanups.splice(0)) {
      try {
        fn();
      } catch (e) {
        console.warn(e);
      }
    }
    g.player.locked = false;
    g.missions.comfort = null;
    g.missions.noWhistle = false;
    g.missions.stablePicker = null;
    g.course = null;
    g.hud.clearHint();
  }
}

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.offers = [];
    this.active = null;
    this.comfort = null;
    this.noWhistle = false;
    this.stablePicker = null;
    this.timer = 5;
    this.jobSeq = 1;
    this.refusedAt = {};
    this.paused = false;
  }

  storyList() {
    return STORY;
  }

  levelInfo() {
    return levelFor(this.game.save.data.reputation);
  }

  storyAvailable(def) {
    const d = this.game.save.data;
    if (d.completed.includes(def.id)) return false;
    if ((def.requires || []).some((r) => !d.completed.includes(r))) return false;
    return true;
  }

  _offerFromDef(def, extra = {}) {
    return {
      id: def.offerId || `story:${def.id}`,
      def,
      story: !!def.story,
      vertical: def.vertical,
      category: def.category,
      title: def.title,
      desc: def.desc,
      pay: def.pay,
      payLabel: def.payLabel,
      xp: def.xp,
      client: def.client,
      place: def.place,
      placeName: def.placeName,
      duration: def.duration,
      isNew: true,
      createdAt: this.game.time,
      receivedClock: this.game.clockText?.(),
      ...extra,
    };
  }

  refreshOffers(notify = true) {
    const g = this.game;
    const d = g.save.data;
    const lv = this.levelInfo();
    const added = [];
    // Missions de l'histoire.
    for (const def of STORY) {
      if (!this.storyAvailable(def)) continue;
      const id = `story:${def.id}`;
      if (this.offers.some((o) => o.id === id) || this.active?.offer.id === id) continue;
      if (this.refusedAt[id] !== undefined && g.time - this.refusedAt[id] < 40) continue;
      const o = this._offerFromDef(def);
      if (def.level > lv.level) o.locked = `Débloqué au palier « ${(REPUTATION[def.level - 1] || REPUTATION[REPUTATION.length - 1]).title} ».`;
      if (o.locked && this.offers.some((x) => x.locked)) continue;
      this.offers.push(o);
      if (!o.locked) added.push(o);
    }
    // Jobs ponctuels (après le tutoriel).
    if (d.completed.includes('tuto')) {
      const jobs = this.offers.filter((o) => o.id.startsWith('job:'));
      // Les offres expirent au bout d'un moment (liquidité du marché).
      for (const j of jobs) if (g.time - j.createdAt > 300 && !j.pinned) this.offers.splice(this.offers.indexOf(j), 1);
      const n = this.offers.filter((o) => o.id.startsWith('job:')).length;
      if (n < 3) {
        const def = generateJob(g, this.jobSeq++, lv.level);
        if (def) {
          const o = this._offerFromDef(def, { id: `job:${def.id}` });
          this.offers.push(o);
          added.push(o);
        }
      }
    }
    this.offers.sort((a, b) => (b.story ? 1 : 0) - (a.story ? 1 : 0) || (a.locked ? 1 : 0) - (b.locked ? 1 : 0));
    if (notify && added.length && !this.active) this.pushNotif(added.find((o) => o.story) || added[0]);
    this.updateBadge();
    g.phone?.refresh();
  }

  // Notification push « nouvelle demande » : comme dans l'app, on y répond depuis l'écran de la demande.
  pushNotif(o) {
    const g = this.game;
    if (g.state !== 'play') return;
    const d = g.distanceTo(o.place);
    g.hud.notify({
      title: `Nouvelle demande · ${o.client ? o.client.name : o.title}`,
      body: `${o.title} · ${o.pay ? `~${o.pay} €` : o.payLabel || ''} · ${dec(d / 1000)} km`,
      timeout: 11000,
      actions: [
        { label: 'Plus tard', run: () => {} },
        { label: 'Répondre à la demande', primary: true, run: () => g.phone.open('request', { id: o.id }) },
      ],
    });
  }

  // Contre-propositions : le client répond quelques secondes plus tard (accepte jusqu'à +10 %, parfois +25 %).
  _resolveCounters() {
    const g = this.game;
    // Pas de réponse pendant une mission : elle arrivera une fois la mission terminée.
    if (this.active) return;
    for (const o of this.offers) {
      const c = o.counter;
      if (!c || !o.pay || g.time - c.at < 7) continue;
      const ratio = c.amount / (o.pay || c.amount);
      const yes = ratio <= 1.1 || (ratio <= 1.25 && (o.id.length + c.amount) % 2 === 0);
      o.counter = null;
      // Réponse reçue : la demande n'est plus épinglée et repart pour une durée de vie complète.
      o.pinned = false;
      o.createdAt = g.time;
      const who = o.client ? o.client.name : 'Le client';
      if (yes) {
        o.pay = c.amount;
        o.counterAccepted = true;
      }
      g.hud.notify({
        title: yes ? 'Contre-proposition acceptée' : 'Contre-proposition déclinée',
        body: yes ? `${who} accepte ${c.amount} € · ${o.title}` : `${who} maintient ${o.pay} € · ${o.title}`,
        timeout: 9000,
        actions: [{ label: 'Plus tard', run: () => {} }, { label: 'Répondre à la demande', primary: true, run: () => g.phone.open('request', { id: o.id }) }],
      });
      g.phone?.refresh();
    }
  }

  updateBadge() {
    const n = this.offers.filter((o) => o.isNew && !o.locked).length;
    this.game.hud?.setPhoneBadge(n, n > 0 && !this.active);
  }

  accept(id) {
    const g = this.game;
    const o = this.offers.find((x) => x.id === id);
    if (!o) return false;
    if (o.locked) {
      g.hud.toast(o.locked);
      return false;
    }
    if (this.active) {
      g.hud.toast('Termine ou abandonne ta mission en cours d’abord.');
      return false;
    }
    this.offers.splice(this.offers.indexOf(o), 1);
    this.start(o);
    return true;
  }

  refuse(id, { quiet = false } = {}) {
    const o = this.offers.find((x) => x.id === id);
    if (!o) return;
    this.offers.splice(this.offers.indexOf(o), 1);
    this.refusedAt[id] = this.game.time;
    if (!quiet) this.game.hud.toast(o.story ? 'Mission refusée — elle te sera reproposée.' : 'Offre refusée.');
    this.updateBadge();
    this.timer = Math.min(this.timer, 25);
  }

  start(offer) {
    const g = this.game;
    const run = new Run(g, offer, offer.def);
    this.active = run;
    this.lastOffer = offer;
    g.hud.big(offer.title.toUpperCase(), `${offer.vertical === 'EVENEMENTS' ? 'Événement' : offer.vertical === 'TRANSPORT' ? 'Transport' : offer.vertical === 'ANNUAIRE' ? 'Annuaire' : offer.vertical === 'ECURIES' ? 'Écuries' : 'Mission'} Strides · ${offer.category}`, 2600);
    g.audio.notify();
    offer.def.setup?.(g, run);
    run.begin();
    this.updateBadge();
    g.bus.emit('mission:start', run);
  }

  abandon() {
    const run = this.active;
    if (!run) return;
    run.finished = true;
    run.cleanup();
    this.active = null;
    this.game.gps.clear();
    this.game.hud.setObjective(null);
    this.game.hud.toast('Mission abandonnée.');
    if (run.offer.story) this.refusedAt[run.offer.id] = this.game.time;
    this.timer = 20;
  }

  fail(run, reason) {
    const g = this.game;
    if (run.finished) return;
    run.finished = true;
    run.cleanup();
    this.active = null;
    g.gps.clear();
    g.hud.setObjective(null);
    g.bus.emit('mission:fail', run);
    g.screens.missionFailed(
      reason,
      () => {
        g.restoreAfterMission(run);
        this.start(run.offer);
      },
      () => {
        g.restoreAfterMission(run);
        if (run.offer.story) this.offers.unshift({ ...run.offer, isNew: false });
        this.updateBadge();
      }
    );
  }

  complete(run) {
    const g = this.game;
    if (run.finished) return;
    run.finished = true;
    const d = g.save.data;
    const def = run.def;
    const stars = Math.max(1, Math.min(5, Math.round(def.rate ? def.rate(run) : 5)));
    const before = levelFor(d.reputation);
    // Montant négocié (contre-proposition acceptée) prioritaire sur le tarif de base.
    let pay = run.payOverride ?? run.offer.pay ?? def.pay ?? 0;
    const tip = stars === 5 && pay > 0 ? Math.round(pay * 0.1) : 0;
    pay += tip;
    d.money += pay;
    d.reputation += def.xp || 0;
    if (pay > 0) d.stats.earned += pay;
    if (!def.noCount) d.stats.jobs++;
    if (def.story) d.completed.push(def.id);
    if (def.client && !def.noReview) d.ratings.push(stars);
    const after = levelFor(d.reputation);
    run.cleanup();
    this.active = null;
    g.gps.clear();
    g.hud.setObjective(null);
    g.saveNow();
    const review = def.client && !def.noReview ? { initials: def.client.initials, name: def.client.name, text: (def.review || defaultReview)(stars, run) } : null;
    const result = {
      title: run.resultTitle || 'Mission réussie',
      kicker: `${def.title} · ${def.client ? def.client.name : 'Strides'}`,
      body: run.resultBody,
      pay,
      xp: def.xp || 0,
      stars,
      time: run.resultTime ?? run.t,
      timeLabel: run.resultTimeLabel,
      review,
      irl: def.irl ? `<b>Dans la vraie vie</b> — ${def.irl}` : null,
      levelUp: after.level > before.level ? { title: after.title, perk: LEVEL_PERKS[after.level] } : null,
    };
    if (tip) g.hud.toast(`Pourboire 5★ : +${formatMoney(tip)}`, 'money');
    g.bus.emit('mission:complete', { run, result });
    g.updateWallet();
    const close = () => {
      g.restoreAfterMission(run);
      def.after?.(g, run);
      this.timer = 6;
      this.refreshOffers(true);
    };
    g.screens.missionResult(result, close);
    if (result.levelUp) setTimeout(() => g.audio.levelUp(), 600);
  }

  objectiveText() {
    return this.active ? this.active.text() : '';
  }

  refreshWaypoint() {
    this.active?.applyWaypoint();
  }

  update(dt) {
    const g = this.game;
    this._resolveCounters();
    if (this.active) {
      this.active.update(dt);
      const run = this.active;
      if (run) {
        g.hud.setObjective({
          tag: `${run.offer.vertical === 'EVENEMENTS' ? 'Événement' : 'Mission'} · ${run.offer.title}`,
          text: run.text(),
          timer: run.timer,
          sub: run.sub ? run.sub() : null,
        });
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 55 + Math.random() * 35;
        this.refreshOffers(true);
      }
    }
  }
}

const LEVEL_PERKS = {
  2: 'Nouvelles missions : Transport, sorties cavalier, plage.',
  3: 'Référence locale — les clients te recommandent entre eux.',
  4: 'Engagements en CSI ouverts au Pôle International.',
  5: 'Tu es la référence de Deauvelle.',
};

function defaultReview(stars) {
  if (stars >= 5) return 'Parfait, rapide et pro. Je recommande sans hésiter.';
  if (stars >= 4) return 'Très bon travail, merci !';
  if (stars >= 3) return 'Correct, mais peut mieux faire.';
  return 'Mission réalisée… de justesse.';
}
