// Repos à la maison de l'Écurie du Val : le lit propose de dormir jusqu'au matin (le soir et la nuit), de faire une
// sieste (1 h 30) ou, en journée, de passer à la journée suivante. Le sommeil rend l'énergie, fait avancer l'heure,
// enregistre la partie et ouvre proprement une nouvelle journée ; la sieste rend moins qu'une nuit.
// (Maison sans intérieur : le lit est proposé à la porte, « Se reposer ».)
import { HOME } from '../world/sites.js';
import { t, T } from '../core/i18n.js';
import { LIFE, nextWake, isBedtime, PERIOD_LABEL, periodOf } from './energy.js';
import { choiceCard } from './story2.js';
import { h } from '../ui/dom.js';
import { rainTarget } from '../world/weather.js';
import { CONFIG } from '../config.js';

export const WAKE_HOUR = LIFE.sleep.wake;

// Prochain matin à 7 h (le lendemain, ou le jour même avant 7 h).
export function nextMorning(gameTime) {
  return nextWake(gameTime, WAKE_HOUR);
}

const pct = (e) => `${Math.round(e)} %`;
const dur = (h) => {
  const hh = Math.floor(h + 1e-6), mm = Math.round((h - hh) * 60);
  return mm ? T`${hh} h ${String(mm).padStart(2, '0')}` : T`${hh} h`;
};

export class Rest {
  constructor(game) {
    this.game = game;
    const g = game;
    // Porte de la maison (sans intérieur : on se repose depuis la porte).
    g.interact.add('rest', {
      label: t('Se reposer'),
      icon: 'home',
      r: 3.2,
      priority: 1,
      modes: ['foot'],
      getPos: () => this.homeDoor(),
      when: () => !g.home && !g.player.locked,
      action: () => this.openBed(),
    });
  }

  // Devant la porte de la maison.
  homeDoor() {
    const a = this.game.home?.anchor?.('door');
    if (a) return { x: a.x, z: a.z };
    return { x: HOME.house.x, z: HOME.house.z + HOME.house.d / 2 + 1.2 };
  }

  // Raison pour laquelle on ne peut pas se reposer maintenant (null : possible).
  blocked() {
    const g = this.game;
    const run = g.missions?.active;
    // Concours du Pôle engagé, en attendant l'heure de passage : on peut dormir.
    if (run && run.def?.id !== 'concours') return t('Termine ou abandonne ta mission en cours avant de te coucher.');
    if (run && (run.data?.course?.running || g.course)) return t('Pas pendant une épreuve.');
    if (g.player.locked) return t('Pas maintenant.');
    return null;
  }

  // Concours du Pôle engagé : heures jusqu'au passage (null sans concours en attente ; Infinity si déjà en retard).
  hoursToPassage() {
    const g = this.game;
    const run = g.missions?.active;
    if (run?.def?.id !== 'concours' || run.data?.startHour === undefined) return null;
    if (Number.isFinite(run.data.startAt)) {
      const left = (run.data.startAt - g.save.data.gameTime) / 3600;
      return left < 0 ? -1 : left;
    }
    const until = (((run.data.startHour - g.hour()) % 24) + 24) % 24;
    // Même règle que l'épreuve (trip.js) : passé depuis moins de 12 h = en retard.
    return until > 12 ? -1 : until;
  }
  // Raison d'empêcher un sommeil de `hours` heures (passage du concours avant le réveil) ; null sinon.
  passageConflict(hours) {
    const left = this.hoursToPassage();
    if (left === null) return null;
    const run = this.game.missions.active;
    if (left < 0) return T`Ton passage au Pôle était prévu à ${hm(run.data.startHour)} : file au concours (ou abandonne-le) avant de te reposer.`;
    // Il faut se réveiller au moins 1 h avant le passage (trajet, dossard, échauffement).
    if (hours > left - 1) return T`Ton passage au Pôle est à ${hm(run.data.startHour)} : pas le temps de dormir maintenant.`;
    return null;
  }

  // Météo et lumière recalées après un saut de temps (sinon pluie et sol mouillé suivent avec plusieurs minutes de
  // retard) : pluie du moment, sol séché ou mouillé selon le temps écoulé, éclairage d'ambiance recalculé.
  _afterJump(hours) {
    const g = this.game;
    const sky = g.sky;
    if (!sky) return;
    const d = g.save.data;
    const day = Math.floor(d.gameTime / 86400), hr = g.hour();
    sky.setDay?.(day);
    const rain = rainTarget(day, hr);
    const secs = hours * (d.settings.timeScale === 'reel' ? 3600 : CONFIG.dayLength / 24);
    sky.rain = rain;
    sky.wet = Math.max(0, Math.min(1, rain > 0.08 ? sky.wet + secs / 35 : sky.wet - secs / 420));
    g._tideT = 0;
    try {
      sky.update(hr, g.player.focus.pos, 0);
      sky.updateEnvironment(g.renderer, performance.now() / 1000, true);
    } catch (e) {
      console.warn('[rest] ciel non recalé', e);
    }
  }

  // Menu du lit.
  openBed() {
    const g = this.game;
    const why = this.blocked();
    if (why) return g.hud.toast(why);
    const E = g.energy;
    const hr = g.hour();
    const e = E.value;
    const run = g.missions?.active;
    const bed = isBedtime(hr);
    const wake = nextWake(g.save.data.gameTime);
    const sleepH = (wake - g.save.data.gameTime) / 3600;
    const nightE = Math.max(e, sleepH >= LIFE.sleep.fullAfter ? 100 : Math.min(100, e + sleepH * LIFE.sleep.perHour));
    const nap = E.nextNap();
    // Concours engagé : pas de sommeil qui ferait manquer le passage.
    const sleepClash = this.passageConflict(sleepH);
    const napClash = this.passageConflict(LIFE.nap.hours);
    const options = [];
    if (bed) {
      options.push({
        id: 'night',
        label: t('Dormir jusqu’au matin'),
        sub: sleepClash || T`Réveil à 7 h (${dur(sleepH)} de sommeil) · énergie ${pct(e)} → ${pct(nightE)} · partie sauvegardée`,
        right: '7:00',
        disabled: !!sleepClash,
        reason: sleepClash,
      });
    } else {
      options.push({
        id: 'nextday',
        label: t('Passer à la journée suivante'),
        sub: sleepClash || T`La journée se termine : réveil demain à 7 h, énergie ${pct(e)} → ${pct(nightE)} · partie sauvegardée`,
        right: '7:00',
        disabled: !!sleepClash,
        reason: sleepClash,
      });
    }
    options.push({
      id: 'nap',
      label: t('Faire une sieste'),
      sub: napClash || (nap > 0 ? T`1 h 30 · énergie ${pct(e)} → ${pct(e + nap)} (une sieste ne vaut pas une nuit)` : t('1 h 30 · tu as déjà assez d’énergie : une sieste n’apporterait rien de plus')),
      right: '+1 h 30',
      disabled: nap <= 0 || !!napClash,
      reason: napClash || t('Une sieste n’apporterait rien de plus maintenant.'),
    });
    if (!bed) {
      options.push({
        id: 'night',
        label: t('Dormir jusqu’au matin'),
        sub: t('À partir de 19 h. En journée : sieste, ou passer à la journée suivante.'),
        disabled: true,
        reason: t('Trop tôt pour une nuit complète : fais plutôt une sieste.'),
      });
    }
    options.push({ id: 'cancel', label: t('Rester debout') });
    const passage = run?.def?.id === 'concours' && run.data?.startHour !== undefined ? T` · passage au Pôle à ${hm(run.data.startHour)}` : '';
    choiceCard(g, {
      kicker: `${g.home?.inside ? t('Ta chambre') : t('Ta maison')} · ${PERIOD_LABEL[periodOf(hr)]} ${g.clockText()}`,
      title: T`Énergie ${pct(e)}`,
      body: `${t('Une nuit complète (6 h ou plus) rend toute ton énergie ; une sieste en rend un peu.')}${passage}`,
      options,
    }, (id) => {
      if (id === 'night' || id === 'nextday') this.sleep(id);
      else if (id === 'nap') this.nap();
    });
  }

  // Nuit (ou fin de journée) : réveil à 7 h, énergie selon la durée, cheval reposé, nouvelle journée enregistrée.
  sleep(kind = 'night') {
    const g = this.game;
    if (this.blocked() || this.busy) return false;
    if (this.passageConflict((nextWake(g.save.data.gameTime) - g.save.data.gameTime) / 3600)) return false;
    this.busy = true;
    const d = g.save.data;
    const before = g.energy.value;
    g.player.locked = true;
    g.home?.lieDown?.(true);
    g.fade(() => {
      const wake = nextWake(d.gameTime);
      const hours = (wake - d.gameTime) / 3600;
      d.gameTime = wake;
      g.energy.sleep(hours);
      this._afterJump(hours);
      const c = g.mainHorse?.cond;
      if (c) {
        c.energy = 100;
        c.resting = false;
      }
      g.home?.lieDown?.(false);
      g.player.locked = false;
      this.busy = false;
      // Nouvelles demandes du matin bientôt.
      if (g.missions) g.missions.timer = Math.min(g.missions.timer, 4);
      g.saveNow();
      this._newDay(before, hours, kind);
    }, 1.2);
    return true;
  }

  // Sieste d'1 h 30 : un peu d'énergie (moins à chaque sieste), jamais au-delà de 80 %.
  nap() {
    const g = this.game;
    if (this.blocked() || this.busy) return false;
    if (this.passageConflict(LIFE.nap.hours)) return false;
    this.busy = true;
    const d = g.save.data;
    const before = g.energy.value;
    g.player.locked = true;
    g.home?.lieDown?.(true);
    g.fade(() => {
      d.gameTime += LIFE.nap.hours * 3600;
      g.energy.sync();
      this._afterJump(LIFE.nap.hours);
      const got = g.energy.nap();
      const c = g.mainHorse?.cond;
      if (c) c.energy = Math.min(100, c.energy + 15);
      g.home?.lieDown?.(false);
      g.player.locked = false;
      this.busy = false;
      g.saveNow();
      g.hud.toast(T`Sieste de 1 h 30 · énergie ${pct(before)} → ${pct(before + got)} · il est ${g.clockText()}`, 'home');
    }, 0.9);
    return true;
  }

  _newDay(before, hours, kind) {
    const g = this.game;
    const d = g.save.data;
    const day = Math.floor(d.gameTime / 86400) + 1;
    const after = g.energy.value;
    const lines = [
      T`Énergie ${pct(before)} → ${pct(after)}${after < 100 ? t(' (nuit trop courte : il faut 6 h pour récupérer complètement)') : ''}.`,
      g.mainHorse ? T`${g.mainHorse.name} a récupéré aussi.` : null,
      t('Les cafés et les siestes retrouvent tout leur effet.'),
      t('Partie sauvegardée.'),
    ].filter(Boolean);
    g.screens.card({
      kicker: T`Jour ${day} · ${g.clockText()}`,
      title: kind === 'nextday' ? t('Une nouvelle journée commence') : t('Bonjour !'),
      body: T`Tu as dormi ${dur(hours)}.`,
      extra: [h('ul.newday', {}, ...lines.map((l) => h('li', { text: l })))],
      buttons: [{ label: t('Commencer la journée'), primary: true, id: 'newday-ok' }],
    });
    g.audio?.success?.();
  }
}

const hm = (h) => {
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x), mm = Math.round((x - hh) * 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
};

export function installRest(game) {
  game.rest = new Rest(game);
  return game.rest;
}
