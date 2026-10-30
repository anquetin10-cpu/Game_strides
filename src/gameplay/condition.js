// Physiologie et soins du cheval : fréquence cardiaque, énergie, température, sudation, hydratation,
// alimentation, propreté et pieds ; effets sur la performance ; gestes de soin à l'écurie.
import { clamp, smoothstep } from '../core/math.js';
import { HOME } from '../world/sites.js';
import { t } from '../core/i18n.js';

// Fréquence cardiaque d'effort selon la vitesse (m/s), d'après des mesures sur chevaux de sport.
const HR_CURVE = [[0, 36], [1.7, 72], [4, 118], [7.5, 158], [11, 185], [14, 205], [17, 222]];
function hrForSpeed(v) {
  for (let i = 1; i < HR_CURVE.length; i++) {
    const [v1, h1] = HR_CURVE[i];
    if (v <= v1) {
      const [v0, h0] = HR_CURVE[i - 1];
      return h0 + ((h1 - h0) * (v - v0)) / (v1 - v0);
    }
  }
  return HR_CURVE[HR_CURVE.length - 1][1];
}

const DEFAULTS = { energy: 100, hydration: 100, satiety: 100, clean: 100, hooves: 100, temp: 37.8 };

// Simulation suspendue (dialogue, téléphone, écran de choix) : les besoins et l'effort ne progressent plus.
export const SIM = { paused: false };

export class HorseCondition {
  constructor(horse, saved = null) {
    this.horse = horse;
    Object.assign(this, DEFAULTS, saved || {});
    this.hr = 36 + Math.random() * 4;
    this.sweat = 0;
    this.jumpBoost = 0;
    this._dist = 0;
  }

  // Fitness (endurance propre du cheval) : récupération plus rapide.
  get fitness() {
    return clamp(this.horse.def.stamina || 1, 0.7, 1.4);
  }

  update(dt) {
    const h = this.horse;
    const v = Math.max(0, h.speed || 0);
    // Cible cardiaque : vitesse, saut, montée, fatigue et chaleur.
    let target = hrForSpeed(v);
    target += this.jumpBoost;
    if (h._slope > 0.05) target += h._slope * v * 9;
    target *= 1 + (1 - this.energy / 100) * 0.15;
    if (this.temp > 39) target += (this.temp - 39) * 10;
    // Montée rapide (~8 s) ; récupération en deux temps : chute rapide jusqu'à ~120 bpm, puis lente
    // (un cheval en bonne condition repasse sous ~64 bpm en une dizaine de minutes).
    const tau = target > this.hr ? 8 : (this.hr > 120 ? 22 : 160) / this.fitness;
    this.hr += (target - this.hr) * (1 - Math.exp(-dt / tau));
    this.jumpBoost *= Math.exp(-dt / 10);
    // Énergie : dépense au-delà de ~90 bpm, récupération au repos.
    const work = Math.max(0, (this.hr - 90) / 130);
    this.energy -= work * work * 0.3 * dt / this.fitness;
    if (this.hr < 80) this.energy += (this.resting ? 0.25 : 0.06) * dt;
    this.energy = clamp(this.energy, 0, 100);
    // Température interne et sudation.
    const tTarget = 37.8 + Math.max(0, (this.hr - 100) / 120) * 2.6;
    this.temp += (tTarget - this.temp) * (1 - Math.exp(-dt / (tTarget > this.temp ? 90 : 260)));
    this.sweat = smoothstep(38.5, 39.7, this.temp);
    // Besoins : eau (aggravée par la sueur), fourrage, propreté, pieds.
    this.hydration = clamp(this.hydration - (0.002 + this.sweat * 0.02) * dt, 0, 100);
    this.satiety = clamp(this.satiety - 0.0016 * dt - work * 0.004 * dt, 0, 100);
    this.clean = clamp(this.clean - (0.0006 + this.sweat * 0.004) * dt, 0, 100);
    this._dist += v * dt;
    if (this._dist > 400) {
      this._dist = 0;
      this.hooves = clamp(this.hooves - 2, 0, 100);
    }
  }

  onJump() {
    this.jumpBoost = Math.min(30, this.jumpBoost + 18);
    this.energy = Math.max(0, this.energy - 0.5);
  }

  // Bonus/malus de performance.
  get speedMul() {
    return 0.86 + 0.14 * smoothstep(0, 40, this.energy) - (this.hydration < 25 ? 0.04 : 0);
  }
  get jumpMul() {
    const care = (this.clean > 70 ? 0.008 : 0) + (this.hooves > 70 ? 0.008 : 0) + (this.satiety > 60 ? 0.006 : 0);
    return 0.92 + 0.08 * smoothstep(10, 60, this.energy) + care;
  }

  // Bilan lisible (application « Chevaux »).
  get status() {
    if (this.energy < 20) return t('Épuisé : repos au box nécessaire');
    if (this.hydration < 30) return t('Assoiffé : à abreuver');
    if (this.satiety < 30) return t('A faim : donner du foin');
    if (this.temp > 39.2) return t('En sueur : à détendre au pas');
    if (this.clean < 40) return t('Sale : à panser');
    return t('En pleine forme');
  }

  toJSON() {
    const r = (x) => Math.round(x * 10) / 10;
    return { energy: r(this.energy), hydration: r(this.hydration), satiety: r(this.satiety), clean: r(this.clean), hooves: r(this.hooves), temp: r(this.temp) };
  }
}

// Gestes de soin à l'écurie (bouton Action) : panser, curer les pieds, abreuver, donner du foin.
export function installCare(game) {
  const g = game;
  const horse = () => g.player.horse;
  const near = (p, x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
  const busy = () => g.player.locked || g.player.human.carrying;
  const ready = () => {
    const h = horse();
    return h && !h.rider && !h.hiddenInTruck && !h.frozen && h.speed < 0.3 && !busy();
  };
  // Le geste s'applique au cheval soigné au départ, et ne libère le joueur que si personne d'autre ne l'a verrouillé entre-temps.
  const care = (label, secs, apply, sound, groom = null) => {
    const p = g.player;
    const c = horse().cond;
    const lock = { care: label };
    p.locked = lock;
    // Pansage, pieds : le personnage fait les gestes contre le cheval pendant toute la durée du soin.
    if (groom) p.startGroom?.(horse(), groom, secs);
    g.hud.toast(`${label}…`);
    sound?.();
    setTimeout(() => {
      if (p.locked === lock) p.locked = false;
      apply(c);
      g.addSkill?.('preparation', 1);
      // Cheval changé entre-temps (application « Chevaux ») : le soin reste acquis dans la sauvegarde.
      const saved = g.save?.data.horseCare;
      if (c.horse !== g.mainHorse && saved?.[c.horse.id]) saved[c.horse.id] = c.toJSON();
      g.saveSoon?.();
    }, secs * 1000);
  };
  const atHome = () => {
    const h = horse();
    return h && near(h.pos, HOME.yard.x, HOME.yard.z, 75);
  };
  // Un cheval sale ou aux pieds non curés se soigne avant d'être monté (priorité sur « Monter »).
  g.interact.add('care-groom', {
    label: t('Panser'), icon: 'hand', r: 2.8, priority: 2.5, modes: ['foot'],
    getPos: () => horse()?.pos || { x: 1e9, z: 1e9 },
    when: () => ready() && horse().cond.clean < 50,
    action: () => care(t('Pansage : étrille, bouchon, brosse douce'), g.save?.data.upgrades?.includes('aire') ? 3 : 4, (c) => { c.clean = 100; c.resting = false; g.hud.toast(t('Robe propre et brillante.')); }, null, 'brush'),
  });
  g.interact.add('care-hooves', {
    label: t('Curer les pieds'), icon: 'shoe', r: 2.8, priority: 2.4, modes: ['foot'],
    getPos: () => horse()?.pos || { x: 1e9, z: 1e9 },
    when: () => ready() && horse().cond.hooves < 50 && horse().cond.clean >= 50,
    action: () => care(t('Curage des quatre pieds'), 3, (c) => { c.hooves = 100; g.hud.toast(t('Pieds propres, fers bien en place.')); }, null, 'hooves'),
  });
  g.interact.add('care-water', {
    label: t('Abreuver'), icon: 'hand', r: 3.2, priority: 1.3, modes: ['foot'],
    getPos: () => ({ x: -141, z: 161.5 }),
    when: () => ready() && atHome() && near(horse().pos, -141, 161.5, 6) && horse().cond.hydration < 90,
    action: () => care(t('Le cheval boit (une vingtaine de litres)'), 4, (c) => { c.hydration = 100; }),
  });
  g.interact.add('care-hay', {
    label: t('Donner du foin'), icon: 'hand', r: 4, priority: 1.25, modes: ['foot'],
    getPos: () => ({ x: HOME.hay.x + 7, z: HOME.hay.z }),
    when: () => ready() && near(horse().pos, HOME.hay.x + 7, HOME.hay.z, 9) && horse().cond.satiety < 90,
    action: () => care(t('Une brassée de foin'), 3, (c) => {
      c.satiety = 100;
      c.resting = true;
      // Une nouvelle brassée relance la minute de repos.
      clearTimeout(c._restT);
      c._restT = setTimeout(() => (c.resting = false), 60000);
    }),
  });
}
