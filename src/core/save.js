// Sauvegarde locale versionnée : migration avec copie de secours, validation, échec explicite (jamais remplacée
// en silence par une partie vide), export / import pour la récupération, registre des récompenses versées.
import { CONFIG, REPUTATION, BUILD } from '../config.js';

export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    started: false,
    playerName: 'Alex',
    avatar: 'f',
    money: 0,
    // Réputation commune (points) : remplace les anciens points d'expérience et la hiérarchie de statuts.
    reputation: 0,
    // Compétences (0 à 100) : préparation, équitation, transport, organisation.
    skills: { preparation: 0, equitation: 0, transport: 0, organisation: 0 },
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
    settings: { sound: true, music: true, quality: 'auto', camSens: 1, timeScale: 'jeu', characters: 'auto', horses: 'classic' },
    gameTime: CONFIG.startHour * 3600,
    pos: null,
    // Récompenses déjà versées (clé = offre ou tentative) : un double appui ou un rechargement ne paie jamais deux fois.
    rewards: {},
    // Drapeaux (mention fictive vue, invitation vers la vraie app affichée…), choix narratifs, souvenirs des personnages.
    flags: {},
    choices: {},
    relations: {},
    // Prestations fictives réellement réalisées (distinctes des missions terminées).
    hired: {},
    // Point de reprise de la mission en cours (missions à étapes) ; null sinon.
    checkpoint: null,
    metrics: { unique: {} },
    // Défis rejouables (lot C) : record personnel et dernier résultat par version de défi, pseudonyme facultatif
    // de la carte de résultat ; `resume` = monde du joueur à rétablir si la page est rechargée pendant un défi.
    challenges: { records: {}, last: null, pseudo: '', resume: null },
    meta: { savedAt: 0, build: BUILD },
  };
}

export class SaveError extends Error {
  constructor(kind, detail = '') {
    super(detail ? `${kind} : ${detail}` : kind);
    this.kind = kind;
    this.detail = detail;
  }
}

// Migrations d'une version à la suivante (appliquées en chaîne). La copie de secours est prise avant.
const MIGRATIONS = {
  // 1 → 2 : la réputation remplace les points d'expérience ; les nouveaux registres prennent leurs valeurs par défaut.
  1: (d) => {
    d.reputation = Number(d.xp) || 0;
    delete d.xp;
  },
};

export function migrate(parsed) {
  let v = Number(parsed.version) || 1;
  if (v > SAVE_VERSION) throw new SaveError('version', `sauvegarde v${v} plus récente que le jeu (v${SAVE_VERSION})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError('migration', `aucune migration depuis la v${v}`);
    m(parsed);
    v++;
    parsed.version = v;
  }
  return parsed;
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Fusion avec les valeurs par défaut : un niveau de profondeur pour les sous-objets connus.
function merge(base, parsed) {
  const out = { ...base, ...parsed };
  for (const k of Object.keys(base)) if (isObj(base[k]) && isObj(parsed[k])) out[k] = { ...base[k], ...parsed[k] };
  return out;
}

// Liste des champs invalides (vide si la sauvegarde est saine).
export function validateSave(d) {
  const errs = [];
  const num = (k) => (typeof d[k] === 'number' && Number.isFinite(d[k])) || errs.push(k);
  const arr = (k) => Array.isArray(d[k]) || errs.push(k);
  const obj = (k) => isObj(d[k]) || errs.push(k);
  ['money', 'reputation', 'gameTime'].forEach(num);
  ['completed', 'horses', 'upgrades', 'ratings', 'horseshoes', 'messages', 'refused'].forEach(arr);
  ['stats', 'settings', 'skills', 'rewards', 'flags', 'choices', 'bestTimes', 'hired'].forEach(obj);
  if (Array.isArray(d.horses) && !d.horses.length) errs.push('horses');
  if (typeof d.playerName !== 'string') errs.push('playerName');
  if (typeof d.started !== 'boolean') errs.push('started');
  return errs;
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
    // Problème au chargement : { kind: 'corrupt' | 'invalid' | 'migration' | 'version', detail, copy } ; tant qu'il
    // n'est pas levé (nouvelle partie explicite ou restauration), rien n'est écrit par-dessus la sauvegarde.
    this.loadIssue = null;
    this.locked = false;
  }
  _get(k) {
    try {
      return this.store ? this.store.getItem(k) : null;
    } catch {
      return null;
    }
  }
  _set(k, v) {
    try {
      this.store?.setItem(k, v);
    } catch {
      /* quota ou navigation privée : ignoré */
    }
  }
  hasSave() {
    if (!this.store || this.loadIssue) return false;
    try {
      const raw = this._get(this.key);
      return !!raw && JSON.parse(raw).started;
    } catch {
      return false;
    }
  }
  backupKey(version) {
    return `${this.key}.backup.v${version}`;
  }
  get invalidKey() {
    return `${this.key}.invalid`;
  }
  // Copies disponibles pour une récupération : secours avant migration et dernière sauvegarde illisible.
  backups() {
    const out = [];
    for (let v = 1; v < SAVE_VERSION; v++) if (this._get(this.backupKey(v))) out.push({ key: this.backupKey(v), label: `Copie de secours (v${v})` });
    if (this._get(this.invalidKey)) out.push({ key: this.invalidKey, label: 'Dernière sauvegarde illisible' });
    return out;
  }
  _quarantine(raw, kind, detail = '') {
    this._set(this.invalidKey, raw);
    this.loadIssue = { kind, detail, copy: this.invalidKey };
    this.locked = true;
    if (typeof console !== 'undefined') console.warn(`[sauvegarde] ${kind} : ${detail} — copie conservée sous ${this.invalidKey}`);
  }
  // Transforme une chaîne JSON en données de jeu valides (migration comprise) ou lève une SaveError.
  parse(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new SaveError('corrupt', e.message);
    }
    if (!isObj(parsed)) throw new SaveError('corrupt', 'format inattendu');
    migrate(parsed);
    const merged = merge(defaultSave(), parsed);
    const errs = validateSave(merged);
    if (errs.length) throw new SaveError('invalid', errs.join(', '));
    return merged;
  }
  load() {
    this.loadIssue = null;
    this.locked = false;
    const base = defaultSave();
    if (!this.store) return (this.data = base);
    const raw = this._get(this.key);
    if (!raw) return (this.data = base);
    let from = 1;
    try {
      from = Number(JSON.parse(raw).version) || 1;
    } catch {
      /* traité par parse() */
    }
    // Copie récupérable de l'ancien format avant toute migration (conservée ensuite).
    if (from < SAVE_VERSION && !this._get(this.backupKey(from))) this._set(this.backupKey(from), raw);
    try {
      this.data = this.parse(raw);
    } catch (e) {
      this._quarantine(raw, e.kind || 'corrupt', e.detail || e.message);
      this.data = base;
      return this.data;
    }
    if (from < SAVE_VERSION) this.saveNow(true);
    return this.data;
  }
  // Nouvelle partie explicite : lève le verrou (les réglages sont conservés).
  reset() {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.loadIssue = null;
    this.locked = false;
    this.saveNow(true);
  }
  // Restauration depuis une copie (clé de backups()) ou un export ; renvoie true si la partie est de nouveau jouable.
  restore(key) {
    const raw = this._get(key);
    return !!raw && this.importSave(raw);
  }
  exportSave() {
    return JSON.stringify(this.data);
  }
  importSave(json) {
    try {
      this.data = this.parse(json);
    } catch {
      return false;
    }
    this.loadIssue = null;
    this.locked = false;
    this.saveNow(true);
    return true;
  }
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 400);
  }
  // Écrit la sauvegarde. Une partie non commencée n'écrit rien (une nouvelle partie est une action explicite :
  // reset() force l'écriture) ; une sauvegarde verrouillée (illisible) n'est jamais écrasée.
  saveNow(force = false) {
    if (!this.store || this.locked) return;
    if (!force && !this.data.started) return;
    this.data.meta = { ...(this.data.meta || {}), savedAt: Date.now(), build: BUILD };
    this._set(this.key, JSON.stringify(this.data));
    // Copie en ligne (online.js) : planifiée, jamais bloquante.
    this.onSaved?.();
  }
  // Récompense versée une seule fois par clé (offre, tentative, achat) : vrai si `fn` a été exécutée.
  grantOnce(key, fn) {
    const r = this.data.rewards || (this.data.rewards = {});
    if (r[key]) return false;
    r[key] = true;
    fn();
    return true;
  }
}

// Palier de réputation atteint pour un nombre de points.
export function reputationTier(points) {
  const p = Number(points) || 0;
  let idx = 0;
  for (let i = 0; i < REPUTATION.length; i++) if (p >= REPUTATION[i].xp) idx = i;
  const cur = REPUTATION[idx];
  const next = REPUTATION[idx + 1];
  const progress = next ? (p - cur.xp) / (next.xp - cur.xp) : 1;
  return { index: idx, level: idx + 1, ...cur, next, progress: Math.max(0, Math.min(1, progress)) };
}
export const levelFor = reputationTier; // alias de compatibilité
