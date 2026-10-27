// Jeu en ligne : sauvegarde de la partie dans le nuage et classements partagés entre joueurs.
//
// S'appuie sur la base de données de la page publiée sur claude.ai (capacités `db` et `user` de l'artefact) :
// - sauvegarde : `data/users/<id>/save`, privée (personne d'autre, pas même le propriétaire, ne la lit) ;
// - classements : `scores/<id>`, une ligne par joueur (pseudonyme et meilleur résultat de chaque épreuve), lisible
//   par tous, chacun n'écrivant que la sienne.
// Hors de claude.ai (fichier local, autre hébergement, visiteur déconnecté), tout reste local et rien n'échoue :
// le jeu affiche ses records personnels et explique où jouer en ligne.
import { BUILD } from '../config.js';

// Épreuves classées : `cso` = barème A (pénalités puis chrono), `time` = chrono seul.
// minTime : temps le plus court physiquement possible (longueur de l'épreuve au grand galop, 14 m/s, sans les
// virages ni les sauts) ; un chrono plus court n'est pas inscrit au classement (le record reste sur l'appareil).
export const BOARDS = [
  { id: 'defi-pole-v3', title: 'Défi du Pôle', sub: '8 obstacles à 1,10 m, même cheval et mêmes conditions pour tous', kind: 'cso', minTime: 17 },
  { id: 'concours-am2', title: 'Concours Amateur 2', sub: 'CSO au Pôle International, 1,05 m', kind: 'cso', minTime: 17 },
  { id: 'concours-am1', title: 'Concours Amateur 1', sub: 'CSO au Pôle International, 1,15 m', kind: 'cso', minTime: 17 },
  { id: 'concours-pro2', title: 'Concours Pro 2', sub: 'CSO au Pôle International, 1,25 m', kind: 'cso', minTime: 17 },
  { id: 'cso_train', title: 'Parcours du Pôle', sub: 'Entraînement chronométré, 9 obstacles', kind: 'cso', minTime: 17 },
  { id: 'xc_train', title: 'Cross de Saint-Gatien', sub: 'Entraînement chronométré, 10 obstacles', kind: 'cso', minTime: 54 },
  { id: 'beach_sprint', title: 'Sprint de la plage', sub: '8 anneaux au bord de l’eau', kind: 'time', minTime: 38 },
  { id: 'hippo_lap', title: 'Tour de l’hippodrome', sub: 'Un tour de piste', kind: 'time', minTime: 50 },
];
export const boardById = (id) => BOARDS.find((b) => b.id === id) || null;

// Note de classement (plus petite = meilleure) : pénalités d'abord, puis chrono au centième.
export function scoreOf(pen, time) {
  return Math.max(0, Math.round(pen || 0)) * 100000 + Math.round((time || 0) * 100) / 100;
}

// Classement d'une épreuve à partir des lignes des joueurs : meilleurs d'abord, à égalité le plus ancien devant.
export function rankBoard(rows, boardId) {
  const out = [];
  for (const r of rows) {
    const b = r.boards?.[boardId];
    if (!b || !Number.isFinite(b.score)) continue;
    out.push({ id: r.id, pseudo: cleanName(r.pseudo) || 'Cavalier anonyme', horse: cleanName(b.horse), pen: b.pen || 0, time: b.time, score: b.score, at: b.at || 0 });
  }
  out.sort((a, b) => a.score - b.score || a.at - b.at);
  out.forEach((e, i) => (e.rank = i + 1));
  return out;
}

// Texte venu d'autres joueurs : court, sans caractères de contrôle ni balises (affiché avec textContent de toute façon).
export function cleanName(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 24);
}

const SAVE_MIN_INTERVAL = 30000; // au plus une écriture de la sauvegarde en ligne toutes les 30 s
const CLOUD_NEWER = 60000; // une sauvegarde en ligne plus récente d'au moins 1 min est proposée à la reprise

export class Online {
  constructor(game) {
    this.game = game;
    this.state = 'local'; // local | connecting | online | readonly
    this.uid = null;
    this.db = null;
    this.rows = [];
    this.mine = null; // ma ligne de classement (corps du document)
    this.cloudSavedAt = 0;
    this.lastSync = 0;
    this._queue = Promise.resolve();
    this._saveTimer = null;
    this._pendingSave = false;
    this.listeners = [];
  }

  get online() {
    return this.state === 'online' || this.state === 'readonly';
  }

  _emit() {
    for (const fn of this.listeners) fn(this);
  }

  // Connexion à la base de la page (sans effet hors de claude.ai). Ne bloque jamais le démarrage du jeu.
  async init() {
    const c = typeof window !== 'undefined' ? window.claude : null;
    if (!c || typeof c.use !== 'function') return;
    this.state = 'connecting';
    let db = null, user = null;
    try {
      [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    } catch {
      db = user = null;
    }
    if (!db) {
      this.state = 'local';
      this._emit();
      return;
    }
    this.db = db;
    this.uid = user ? await user.id() : null;
    const canWrite = user ? await user.can('data.write') : null;
    this.state = this.uid && canWrite !== false ? 'online' : 'readonly';
    this._subscribeScores();
    if (this.uid) await this._checkCloudSave();
    this._emit();
  }

  _subscribeScores() {
    if (this._unsub) return;
    this._unsub = this.db.collection('scores').limit(1000).onSnapshot(
      (snap) => {
        this.rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const me = this.uid && this.rows.find((r) => r.id === this.uid);
        if (me && !this._writingScores) this.mine = { pseudo: me.pseudo || '', boards: { ...(me.boards || {}) } };
        this._emit();
      },
      () => {
        this._unsub = null;
      }
    );
  }

  // Écritures une à une (une seule en cours par document, dans l'ordre).
  _enqueue(fn) {
    this._queue = this._queue.then(fn).catch((e) => {
      // Refus d'écriture (visiteur en lecture seule) : on passe en lecture seule pour le reste de la visite.
      if (e && e.code === 'invalid_argument') this.state = 'readonly';
      this.lastError = e?.code || 'error';
      this._emit();
    });
    return this._queue;
  }

  // ---------- Sauvegarde ----------
  _saveRef() {
    return this.db.doc(`data/users/${this.uid}/save`);
  }

  async _checkCloudSave() {
    let snap;
    try {
      snap = await this._saveRef().get();
    } catch {
      return;
    }
    if (!snap.exists) return;
    const doc = snap.data();
    this.cloudSavedAt = Number(doc.savedAt) || 0;
    this.lastSync = this.cloudSavedAt;
    const local = this.game.save.data.meta?.savedAt || 0;
    if (doc.json && this.cloudSavedAt > local + CLOUD_NEWER) this.cloudNewer = { savedAt: this.cloudSavedAt, json: doc.json, build: doc.build };
    this.game.onCloudSave?.(this);
  }

  // Reprend la sauvegarde en ligne (copie de secours de la partie locale avant de la remplacer).
  adoptCloudSave() {
    const c = this.cloudNewer;
    if (!c) return false;
    const s = this.game.save;
    try {
      if (s.store) s._set(`${s.key}.backup.local`, JSON.stringify(s.data));
    } catch {
      /* stockage local indisponible : la reprise se fait quand même */
    }
    const ok = s.importSave(c.json);
    if (ok) this.cloudNewer = null;
    return ok;
  }

  // Appelée après chaque sauvegarde locale : copie en ligne au plus toutes les 30 s (et tout de suite si `now`).
  scheduleSave(now = false) {
    if (this.state !== 'online' || !this.uid || !this.game.save.data.started || this.cloudNewer) return;
    this._pendingSave = true;
    const wait = now ? 0 : Math.max(0, SAVE_MIN_INTERVAL - (Date.now() - (this._lastWrite || 0)));
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._writeSave(), wait);
  }

  _writeSave() {
    if (!this._pendingSave) return this._queue;
    this._pendingSave = false;
    const data = this.game.save.data;
    const json = JSON.stringify(data);
    // Limite d'un document : 256 Kio.
    if (json.length > 240000) return this._queue;
    const savedAt = data.meta?.savedAt || Date.now();
    if (savedAt === this.cloudSavedAt) return this._queue;
    this._lastWrite = Date.now();
    return this._enqueue(async () => {
      await this._saveRef().set({ json, savedAt, build: BUILD, version: data.version || 0 });
      this.cloudSavedAt = savedAt;
      this.lastSync = Date.now();
      this._emit();
    });
  }

  // ---------- Classements ----------
  pseudo() {
    const d = this.game.save.data;
    return cleanName(d.challenges?.pseudo) || cleanName(d.playerName) || 'Cavalier';
  }

  myBest(boardId) {
    return this.mine?.boards?.[boardId] || null;
  }

  // Enregistre une performance ; n'écrit que si c'est mon meilleur résultat sur l'épreuve (ou si le pseudo a changé).
  // Résout { rank, total, improved } (rank null hors ligne).
  submit(boardId, { pen = 0, time, horse = '' }) {
    const board = boardById(boardId);
    if (!board || !Number.isFinite(time) || time <= 0) return Promise.resolve(null);
    // Chrono physiquement impossible : pas d'inscription (protection minimale du classement).
    if (time < board.minTime) return Promise.resolve({ rank: null, total: 0, improved: false, rejected: true });
    const entry = { pen: Math.round(pen), time: Math.round(time * 100) / 100, score: scoreOf(pen, time), horse: cleanName(horse), at: Date.now() };
    const prev = this.myBest(boardId);
    const improved = !prev || entry.score < prev.score;
    if (this.state !== 'online' || !this.uid) return Promise.resolve({ rank: null, total: 0, improved });
    if (!improved) return Promise.resolve(this._rankOf(boardId, improved));
    this.mine = { pseudo: this.pseudo(), boards: { ...(this.mine?.boards || {}), [boardId]: entry } };
    // Vue locale immédiate (le rang s'affiche sans attendre le serveur).
    this._mergeMine();
    return this._enqueue(() => this._writeScores()).then(() => this._rankOf(boardId, true));
  }

  // Changement de pseudonyme : réécrit ma ligne (si j'en ai une).
  renamed() {
    if (this.state !== 'online' || !this.uid || !this.mine) return;
    this.mine = { ...this.mine, pseudo: this.pseudo() };
    this._mergeMine();
    this._enqueue(() => this._writeScores());
  }

  async _writeScores() {
    this._writingScores = true;
    try {
      await this.db.doc(`scores/${this.uid}`).set({ pseudo: this.mine.pseudo, boards: this.mine.boards, updatedAt: Date.now() });
    } finally {
      this._writingScores = false;
    }
  }

  _mergeMine() {
    const i = this.rows.findIndex((r) => r.id === this.uid);
    const row = { id: this.uid, pseudo: this.mine.pseudo, boards: this.mine.boards };
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
    this._emit();
  }

  _rankOf(boardId, improved) {
    const list = rankBoard(this.rows, boardId);
    const me = list.find((e) => e.id === this.uid);
    return { rank: me ? me.rank : null, total: list.length, improved };
  }

  board(boardId) {
    return rankBoard(this.rows, boardId);
  }
}
