import { CONFIG, LEVELS } from '../config.js';

export function defaultSave() {
  return {
    version: 1,
    started: false,
    playerName: 'Alex',
    avatar: 'f',
    money: 0,
    xp: 0,
    completed: [],
    refused: [],
    ratings: [],
    horses: ['comete'],
    activeHorse: 'comete',
    upgrades: [],
    horseshoes: [],
    bestTimes: {},
    stats: { jobs: 0, earned: 0, distance: 0, jumps: 0, faults: 0 },
    messages: [],
    settings: { sound: true, music: true, quality: 'auto', camSens: 1 },
    gameTime: CONFIG.startHour * 3600,
    pos: null,
  };
}

function storage() {
  try {
    const s = window.localStorage;
    const k = '__strides_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

export class SaveSystem {
  constructor(key = CONFIG.saveKey) {
    this.key = key;
    this.store = typeof window !== 'undefined' ? storage() : null;
    this.data = defaultSave();
    this._timer = null;
  }
  hasSave() {
    if (!this.store) return false;
    try {
      const raw = this.store.getItem(this.key);
      return !!raw && JSON.parse(raw).started;
    } catch {
      return false;
    }
  }
  load() {
    const base = defaultSave();
    if (!this.store) return (this.data = base);
    try {
      const raw = this.store.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...base, ...parsed, stats: { ...base.stats, ...(parsed.stats || {}) }, settings: { ...base.settings, ...(parsed.settings || {}) } };
      } else this.data = base;
    } catch {
      this.data = base;
    }
    return this.data;
  }
  reset() {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.saveNow();
  }
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 400);
  }
  saveNow() {
    if (!this.store) return;
    try {
      this.store.setItem(this.key, JSON.stringify(this.data));
    } catch {
      /* quota or private mode: ignore */
    }
  }
}

export function levelFor(xp) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].xp) idx = i;
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1];
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { index: idx, level: idx + 1, ...cur, next, progress: Math.max(0, Math.min(1, progress)) };
}
