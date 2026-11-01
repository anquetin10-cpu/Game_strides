// Rythme de vie : périodes de la journée, énergie du personnage (fatigue), effets légers de la fatigue, récupération
// (nuit, sieste, café) et disponibilité des missions selon l'heure et l'énergie.
// Unités : énergie de 0 à 100 ; les dépenses sont exprimées par HEURE DE JEU (une journée de jeu = 20 min par défaut,
// ou 24 h en temps réel dans Réglages), d'après l'écoulement réel de l'heure du jeu : rien ne se dépense quand le jeu est
// en pause (téléphone, menus, cartes ouvertes).
import { clamp } from '../core/math.js';
import { t, T, LANG } from '../core/i18n.js';
import { h } from '../ui/dom.js';

// ---------- Réglages (équilibrage) ----------
export const LIFE = {
  // Dépense de base, éveillé (par heure de jeu) : une journée de 16 h sans rien faire ≈ 32 points.
  base: 2.0,
  // La nuit (22 h – 6 h), on se fatigue plus vite : on ne peut pas enchaîner jour et nuit indéfiniment.
  nightMul: 1.5,
  // Dépense supplémentaire selon l'activité (par heure de jeu).
  act: { idle: 0, walk: 0.1, run: 0.8, sprint: 1.5, ride: 0.4, canter: 0.8, gallop: 1.5, drive: 0.4 },
  // Saut temporel sans sommeil (trajet, attente d'une épreuve) : compté au plus sur 6 h.
  maxSkipH: 6,
  // Coût d'une mission terminée selon son effort (une mission échouée ou abandonnée en coûte la moitié).
  mission: { light: 3, normal: 5, heavy: 8 },
  // Paliers : en forme ≥ 60, légère fatigue 35–60, fatigue 15–35, épuisement < 15.
  tiers: { high: 60, medium: 35, low: 15 },
  // Café : gain dégressif depuis la dernière nuit (12, 7, 3, puis plus rien), jamais au-delà de 70 %.
  coffee: { gains: [12, 7, 3], cap: 70 },
  // Sieste d'1 h 30 : gain dégressif depuis la dernière nuit (25, 15, 8), jamais au-delà de 80 %.
  nap: { hours: 1.5, gains: [25, 15, 8], cap: 80 },
  // Nuit : réveil à 7 h ; énergie pleine après 6 h de sommeil, sinon 14 points par heure dormie.
  sleep: { wake: 7, fullAfter: 6, perHour: 14, from: 19, to: 6 },
  // Effets de la fatigue (hors épreuves de concours) : course à pied et vitesse du cheval monté en monde ouvert.
  malus: {
    high: { run: 1, sprint: 1, horse: 1 },
    medium: { run: 1, sprint: 1, horse: 1 },
    low: { run: 0.95, sprint: 0.9, horse: 1 },
    critical: { run: 0.9, sprint: 0.8, horse: 0.93 },
  },
};

// ---------- Périodes de la journée ----------
export const PERIOD_IDS = ['matin', 'apresmidi', 'soir', 'nuit'];
export const PERIOD_LABEL = { matin: t('Matin'), apresmidi: t('Après-midi'), soir: t('Soir'), nuit: t('Nuit') };
export const wrapHour = (h) => ((h % 24) + 24) % 24;
export function periodOf(hour) {
  const h = wrapHour(hour);
  if (h >= 6 && h < 12) return 'matin';
  if (h >= 12 && h < 18) return 'apresmidi';
  if (h >= 18 && h < 22) return 'soir';
  return 'nuit';
}

// ---------- Paliers ----------
export const TIER_LABEL = { high: t('En forme'), medium: t('Légère fatigue'), low: t('Fatigue'), critical: t('Épuisement') };
export function tierOf(e) {
  const T0 = LIFE.tiers;
  return e >= T0.high ? 'high' : e >= T0.medium ? 'medium' : e >= T0.low ? 'low' : 'critical';
}
export const malusOf = (e) => LIFE.malus[tierOf(e)];

// Dépense par heure de jeu pour une activité, à une heure donnée.
export function drainPerHour(act, hour) {
  return (LIFE.base + (LIFE.act[act] || 0)) * (periodOf(hour) === 'nuit' ? LIFE.nightMul : 1);
}

// ---------- Récupération ----------
// Gain d'un café (le n-ième depuis la dernière nuit, à partir de 0) : dégressif, plafonné à 70 %.
export function coffeeGain(energy, cups) {
  const g = LIFE.coffee.gains[cups] ?? 0;
  return Math.max(0, Math.min(energy + g, Math.max(energy, LIFE.coffee.cap)) - energy);
}
// Gain d'une sieste (la n-ième depuis la dernière nuit) : dégressif, plafonné à 80 %.
export function napGain(energy, naps) {
  const g = LIFE.nap.gains[naps] ?? LIFE.nap.gains[LIFE.nap.gains.length - 1] / 2;
  return Math.max(0, Math.min(energy + g, Math.max(energy, LIFE.nap.cap)) - energy);
}
// Énergie au réveil après `hours` heures de sommeil.
export function sleepEnergy(energy, hours) {
  if (hours >= LIFE.sleep.fullAfter) return 100;
  return clamp(energy + hours * LIFE.sleep.perHour, 0, 100);
}
// Prochain réveil (7 h) : le lendemain, ou le matin même avant 7 h.
export function nextWake(gameTime, wake = LIFE.sleep.wake) {
  const day = Math.floor(gameTime / 86400);
  let tw = day * 86400 + wake * 3600;
  if (tw <= gameTime) tw += 86400;
  return tw;
}
// Heure du coucher pour une vraie nuit (de 19 h à 6 h).
export const isBedtime = (hour) => {
  const h = wrapHour(hour);
  return h >= LIFE.sleep.from || h < LIFE.sleep.to;
};

// ---------- Missions : effort et horaires ----------
// Durée annoncée (« ~4 min », « ~2 à 6 min ») → la plus grande valeur, en minutes.
function durationMin(s) {
  const m = String(s || '').match(/\d+/g);
  return m ? Math.max(...m.map(Number)) : 4;
}
// Effort d'une mission : léger, normal ou important (concours, transports, longues missions).
export function missionDemand(def) {
  if (!def) return 'normal';
  if (def.demand) return def.demand;
  if (def.category === 'Entraînement') return 'light';
  if (def.vertical === 'EVENEMENTS' || def.vertical === 'TRANSPORT') return 'heavy';
  const m = durationMin(def.duration);
  return m >= 7 ? 'heavy' : m <= 2 ? 'light' : 'normal';
}
export const DEMAND_LABEL = { light: t('Léger'), normal: t('Normal'), heavy: t('Important') };
export const missionCost = (def) => LIFE.mission[missionDemand(def)];

// Horaires où l'on peut accepter une mission : [de, à[ en heures (à > 24 : après minuit), ou null (toute heure).
// La plupart des missions se font en journée, quelques-unes en soirée, très peu la nuit.
export function missionHours(def) {
  if (!def) return null;
  if (def.hours !== undefined) return def.hours;
  // Premiers pas, engagement au concours du Pôle (son heure de passage, le lendemain matin si besoin), entraînements.
  if (def.id === 'tuto' || def.id === 'concours' || def.category === 'Entraînement') return null;
  if (def.category === 'Urgence') return def.id === 'fugueur' ? null : [6, 23];
  if (def.vertical === 'EVENEMENTS') return [7, 21];
  if (def.vertical === 'TRANSPORT') return [6, 21];
  if (def.category === 'Coursier') return [8, 19];
  if (def.category === 'Cavalier') return [7, 20];
  return [6, 23];
}
export function inHours(hours, hour) {
  if (!hours) return true;
  const [a, b] = hours;
  const h = wrapHour(hour);
  return b > 24 ? h >= a || h < b - 24 : h >= a && h < b;
}
// « 8 h », « 19 h 30 » (anglais : « 8:00 », « 19:30 »).
export const hhLabel = (h) => {
  const x = wrapHour(h);
  const hh = Math.floor(x), mm = Math.round((x - hh) * 60);
  if (LANG !== 'fr') return `${hh}:${String(mm).padStart(2, '0')}`;
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
};

// Peut-on accepter cette offre maintenant ? { ok } ou { ok: false, kind: 'hours' | 'fatigue', reason, short }.
// Une mission à reprendre (point de reprise enregistré) n'est jamais bloquée.
export function missionAvailability(offer, { hour, energy }) {
  const def = offer?.def;
  if (!def || offer.resume || def.id === 'tuto') return { ok: true };
  const hrs = missionHours(def);
  if (hour !== undefined && !inHours(hrs, hour)) {
    const later = wrapHour(hour) < hrs[0];
    return {
      ok: false,
      kind: 'hours',
      short: T`Disponible de ${hhLabel(hrs[0])} à ${hhLabel(hrs[1])}`,
      reason: later
        ? T`Disponible de ${hhLabel(hrs[0])} à ${hhLabel(hrs[1])} : le client te recontactera dans la matinée.`
        : T`Disponible de ${hhLabel(hrs[0])} à ${hhLabel(hrs[1])} : il est tard, le client te recontactera demain.`,
    };
  }
  if (energy !== undefined && tierOf(energy) === 'critical' && missionDemand(def) === 'heavy') {
    return {
      ok: false,
      kind: 'fatigue',
      short: t('Trop fatigant pour l’instant'),
      reason: T`Énergie trop basse (${Math.round(energy)} %) pour une mission aussi exigeante. Repose-toi d’abord : une nuit à la maison de l’Écurie du Val, ou au moins une sieste.`,
    };
  }
  return { ok: true };
}

// ---------- Gestionnaire (en jeu) ----------
// État enregistré dans la sauvegarde (save.data.life) ; une ancienne sauvegarde prend les valeurs par défaut.
export const defaultLife = () => ({ energy: 100, coffees: 0, naps: 0, lastSleep: null, notified: '' });

export class Energy {
  constructor(game) {
    this.game = game;
    this.lastT = null;
    this._tier = null;
    this._eveningDay = -1;
    this.paused = false;
    game.bus?.on('mission:complete', ({ run }) => this._afterMission(run, 1));
    game.bus?.on('mission:fail', (run) => this._afterMission(run, 0.5));
  }
  get life() {
    const d = this.game.save.data;
    if (!d.life || typeof d.life !== 'object') d.life = defaultLife();
    if (!Number.isFinite(d.life.energy)) d.life.energy = 100;
    return d.life;
  }
  get value() {
    return this.life.energy;
  }
  get tier() {
    return tierOf(this.life.energy);
  }
  get malus() {
    return malusOf(this.life.energy);
  }
  // Recale l'horloge sans rien dépenser (sommeil, chargement, défi rejouable, retour d'un saut de temps).
  sync() {
    this.lastT = this.game.save.data.gameTime;
  }
  set(v) {
    this.life.energy = clamp(v, 0, 100);
    this._checkTier();
  }
  spend(n) {
    if (n > 0) this.set(this.life.energy - n);
  }
  gain(n) {
    if (n > 0) this.set(this.life.energy + n);
  }

  // Activité du moment (pour la dépense) : à pied (marche, course, sprint), à cheval (allures), au volant.
  activity() {
    const p = this.game.player;
    if (!p) return 'idle';
    if (p.mode === 'drive') return 'drive';
    if (p.mode === 'ride') {
      const v = Math.abs(p.horse?.speed || 0);
      return v > 10.5 ? 'gallop' : v > 5.5 ? 'canter' : v > 0.5 ? 'ride' : 'idle';
    }
    const v = Math.abs(p.human?.speed || 0);
    return v > 6.2 ? 'sprint' : v > 4 ? 'run' : v > 0.5 ? 'walk' : 'idle';
  }

  update() {
    const g = this.game;
    const d = g.save.data;
    // Défi rejouable (monde figé, heure imposée) : l'énergie ne bouge pas.
    if (this.paused || g.challenge?.active || g.state !== 'play') return this.sync();
    if (this.lastT === null) return this.sync();
    const dh = (d.gameTime - this.lastT) / 3600;
    this.lastT = d.gameTime;
    if (dh <= 0) return;
    // Saut de temps (trajet en camion, attente d'une épreuve) : dépense de base sur au plus 6 h.
    const big = dh > 0.5;
    const h = Math.min(dh, LIFE.maxSkipH);
    this.spend(h * drainPerHour(big ? 'idle' : this.activity(), g.hour()));
    this._applyMalus();
    this._evening();
  }

  // Effets de la fatigue en monde ouvert : le cheval monté va un peu moins vite quand on est épuisé (jamais en épreuve).
  _applyMalus() {
    const g = this.game;
    const h = g.player?.mode === 'ride' ? g.player.horse : null;
    const comp = !!g.course || !!g.challenge?.active;
    if (this._fatH && this._fatH !== h) this._fatH.riderFatigue = 1;
    if (h) h.riderFatigue = comp ? 1 : this.malus.horse;
    this._fatH = h;
  }

  _afterMission(run, k) {
    if (!run?.def || this.game.challenge?.active) return;
    const before = this.life.energy;
    this.spend(missionCost(run.def) * k);
    this.game.saveSoon?.();
    const lost = Math.round(before - this.life.energy);
    if (lost > 0) setTimeout(() => this.game.hud?.toast(T`Énergie −${lost} · ${Math.round(this.life.energy)} %`, 'run'), 1800);
  }

  // Changement de palier : un avertissement léger, puis plus net, puis une incitation claire à rentrer (une fois par
  // palier et par journée ; remis à zéro après une nuit).
  _checkTier() {
    const tier = tierOf(this.life.energy);
    const prev = this._tier;
    this._tier = tier;
    if (!prev || tier === prev) return;
    const order = ['high', 'medium', 'low', 'critical'];
    if (order.indexOf(tier) <= order.indexOf(prev)) return;
    const L = this.life;
    if (L.notified.includes(tier)) return;
    L.notified += `${tier},`;
    const g = this.game;
    if (!g.hud || g.state !== 'play') return;
    if (tier === 'medium') g.hud.toast(t('Un peu de fatigue : pense à rentrer te reposer ce soir.'), 'run');
    else if (tier === 'low') g.hud.hint(t('<b>Fatigue</b> : tu cours un peu moins vite. Une sieste ou une nuit à la maison de l’Écurie du Val te remettra d’aplomb.'), 7000);
    else if (tier === 'critical') {
      g.hud.notify?.({
        title: t('Épuisement'),
        body: t('Les missions exigeantes (concours, transports) attendront : rentre dormir à la maison de l’Écurie du Val.'),
        timeout: 12000,
        actions: [
          { label: t('Plus tard'), run: () => {} },
          { label: t('Itinéraire vers la maison'), primary: true, run: () => this.routeHome() },
        ],
      });
    }
  }

  // Le soir, une fois par journée : rappel discret que la maison attend (sans mission en cours).
  _evening() {
    const g = this.game;
    const h = g.hour();
    const day = Math.floor(g.save.data.gameTime / 86400);
    if (h < 21.5 || h >= 23.5 || this._eveningDay === day || g.missions?.active || g.home?.inside) return;
    this._eveningDay = day;
    if (this.life.energy < 70) g.hud?.toast(t('La soirée avance : ton lit t’attend à la maison de l’Écurie du Val.'), 'home');
  }

  routeHome() {
    const g = this.game;
    const p = g.rest?.homeDoor?.();
    if (p && g.gps?.set) g.gps.set(p, t('Maison · Écurie du Val'), { beacon: true });
  }

  // ---------- Récupération ----------
  // Café : renvoie le gain obtenu (0 : plus d'effet aujourd'hui, ou déjà au-delà de 70 %).
  coffee() {
    const L = this.life;
    const g0 = coffeeGain(L.energy, L.coffees);
    L.coffees++;
    this.gain(g0);
    return g0;
  }
  // Gain qu'apporterait le prochain café (affichage).
  nextCoffee() {
    return coffeeGain(this.life.energy, this.life.coffees);
  }
  nap() {
    const L = this.life;
    const g0 = napGain(L.energy, L.naps);
    L.naps++;
    this.gain(g0);
    return g0;
  }
  nextNap() {
    return napGain(this.life.energy, this.life.naps);
  }
  // Nuit de sommeil : énergie selon la durée, compteurs du café et des siestes remis à zéro.
  sleep(hours) {
    const L = this.life;
    L.energy = sleepEnergy(L.energy, hours);
    L.coffees = 0;
    L.naps = 0;
    L.notified = '';
    L.lastSleep = this.game.save.data.gameTime;
    this._tier = tierOf(L.energy);
    this.sync();
  }
  // Fiche « Énergie » (toucher la jauge du HUD) : niveau, effets du moment, comment récupérer.
  openCard() {
    const g = this.game;
    if (!g.screens || document.querySelector('.overlay')) return;
    const e = Math.round(this.value);
    const tier = this.tier;
    const L = this.life;
    const cof = this.nextCoffee(), nap = this.nextNap();
    const row = (k, v) => h('div.kv', {}, h('span', { text: k }), h('b', { text: v }));
    const bar = h('div.en-meter', { 'data-tier': tier }, h('i', { style: { width: `${e}%` } }));
    g.screens.card({
      kicker: `${PERIOD_LABEL[periodOf(g.hour())]} · ${g.clockText()}`,
      title: T`Énergie ${e} % · ${TIER_LABEL[tier]}`,
      extra: [
        bar,
        h('div.kvs.life-kvs', {},
          row(t('Effets'), this.effectsText()),
          row(t('Une nuit à la maison'), t('toute l’énergie (6 h de sommeil ou plus)')),
          row(t('Une sieste (1 h 30)'), nap > 0 ? T`+${Math.round(nap)} (jusqu’à 80 %)` : t('plus d’effet maintenant')),
          row(t('Un café au Galop'), cof > 0 ? T`+${Math.round(cof)} (jusqu’à 70 %, moins à chaque tasse)` : t('plus d’effet avant la prochaine nuit')),
          row(t('Aujourd’hui'), T`${L.coffees} café(s) · ${L.naps} sieste(s)`)),
        h('div.irl', { text: t('Les missions se font surtout en journée, quelques-unes le soir. En cas d’épuisement, les missions exigeantes (concours, transports) attendent une bonne nuit.') }),
      ],
      buttons: [
        { label: t('Itinéraire vers la maison'), id: 'life-home', run: () => this.routeHome() },
        { label: t('Fermer'), primary: true, id: 'life-close' },
      ],
    });
  }

  // Note du téléphone (app Strides) : épuisement, ou soirée avancée / nuit (peu de demandes).
  statusNote() {
    const hr = this.game.hour();
    if (this.tier === 'critical') return { kind: 'fatigue', text: T`Énergie ${Math.round(this.value)} % : les missions exigeantes (concours, transports) attendront une bonne nuit à la maison.` };
    const p = periodOf(hr);
    if (p === 'nuit') return { kind: 'hours', text: t('C’est la nuit : les clients te recontacteront demain matin. Ton lit t’attend à la maison de l’Écurie du Val.') };
    if (wrapHour(hr) >= 20) return { kind: 'hours', text: t('La soirée avance : peu de nouvelles demandes avant demain matin.') };
    return null;
  }

  // Texte des effets du moment (fiche « Énergie »).
  effectsText() {
    const m = this.malus;
    const out = [];
    if (m.sprint < 1) out.push(T`sprint −${Math.round((1 - m.sprint) * 100)} %`);
    if (m.run < 1) out.push(T`course −${Math.round((1 - m.run) * 100)} %`);
    if (m.horse < 1) out.push(T`cheval monté −${Math.round((1 - m.horse) * 100)} % (hors concours)`);
    if (this.tier === 'critical') out.push(t('missions exigeantes impossibles'));
    return out.length ? out.join(' · ') : t('aucun');
  }
}
