// Mesure des résultats : adaptateur local. Aucun envoi externe tant que METRICS.endpoint est vide (l'envoi par
// sendBeacon est prêt mais inactif) ; les événements sont gardés en mémoire pour la vérification locale
// (window.__metrics.log, console avec ?metrics=1) et dédoublonnés quand ils sont uniques par partie.
import { METRICS, BUILD } from '../config.js';

// Nom → règle de dédoublonnage : `session` (une fois par session), `unique` (une fois par partie),
// `key` (une fois par identifiant : tentative de défi), sinon chaque occurrence compte (affichages, clics, partages).
export const EVENTS = {
  game_started: { session: true },
  first_mission_completed: { unique: true },
  second_activity_started: { unique: true },
  hiring_mission_completed: { unique: true },
  first_hire_completed: { unique: true },
  challenge_completed: { key: 'attempt' },
  strides_cta_shown: {},
  strides_cta_clicked: {},
  result_share_requested: {},
};

// Paramètres admis (identifiant de mission, type de parcours, emplacement du bouton, version du défi, tentative,
// mode de résolution) ; la version du jeu est ajoutée. Jamais de nom, de message, de position ni d'empreinte.
const PARAMS = ['mission', 'course', 'placement', 'challenge_version', 'attempt', 'mode'];

export class Metrics {
  constructor(save, opts = {}) {
    this.save = save;
    this.enabled = opts.enabled ?? METRICS.enabled;
    this.endpoint = opts.endpoint ?? METRICS.endpoint;
    this.log = [];
    this.session = new Set();
    this.listeners = [];
  }
  // Envoi externe réellement actif ? (faux dans cette version : adaptateur désactivé)
  get external() {
    return !!this.endpoint;
  }
  _unique() {
    const d = this.save?.data;
    if (!d) return null;
    d.metrics ||= { unique: {} };
    d.metrics.unique ||= {};
    return d.metrics.unique;
  }
  // Enregistre un événement ; renvoie vrai s'il a été retenu (faux si inconnu, désactivé ou déjà compté).
  track(name, params = {}) {
    const def = EVENTS[name];
    if (!def || !this.enabled) return false;
    const p = {};
    for (const k of PARAMS) if (params[k] !== undefined && params[k] !== null) p[k] = String(params[k]).slice(0, 64);
    p.game_version = BUILD;
    if (def.session) {
      if (this.session.has(name)) return false;
      this.session.add(name);
    } else if (def.unique || def.key) {
      const u = this._unique();
      if (!u) return false;
      const id = def.key ? p[def.key] : '';
      if (def.key && !id) return false;
      const k = def.key ? `${name}:${id}` : name;
      if (u[k]) return false;
      u[k] = true;
      this.save.save?.();
    }
    const ev = { name, params: p, at: Date.now() };
    this.log.push(ev);
    if (this.log.length > 200) this.log.shift();
    for (const fn of this.listeners) fn(ev);
    this._send(ev);
    return true;
  }
  _send(ev) {
    if (!this.endpoint || typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    try {
      navigator.sendBeacon(this.endpoint, JSON.stringify(ev));
    } catch {
      /* jamais bloquant */
    }
  }
}
