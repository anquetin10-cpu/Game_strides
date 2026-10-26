// Défi rejouable à conditions fixes et versionnées (lot C). Ce module est pur (aucune dépendance au rendu) :
// configuration figée de chaque version, calcul des pénalités, classement, record personnel par version, texte de
// partage. Le déroulé en jeu (cheval fourni, météo, restauration du monde) est dans challengeRun.js.
//
// Règle de versionnage : une version publiée ne change plus. Toute modification d'une condition (parcours, hauteur,
// cheval, météo, temps accordé, règle) crée une nouvelle version (`defi-pole-v2`…) avec son propre record.
import { BUILD } from '../config.js';

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const DEFI_POLE_V1 = deepFreeze({
  id: 'defi-pole-v1',
  version: 1,
  name: 'Défi du Pôle',
  // Type de parcours (paramètre `course` de la mesure).
  course: 'cso',
  place: 'Pôle International',
  // Parcours fixe : obstacles n° 1 à 8 du tracé du Pôle (le n° 9 est retiré de la piste pendant le défi).
  courseId: 'cso',
  obstacles: [1, 2, 3, 4, 5, 6, 7, 8],
  height: 1.1,
  timeAllowed: 75,
  // Temps limite (élimination) : le double du temps accordé, comme pour les autres parcours du jeu.
  timeLimit: 150,
  // Cheval fourni : statistiques fixes, sans équipement ni amélioration, condition physique neutre.
  horse: { id: 'defi-onyx', name: 'Onyx', coat: 'black', blaze: false, socks: [true, false, false, false], speed: 1.13, jump: 1.06, stamina: 1.0, breed: 'KWPN', age: 8 },
  // Météo fixe : journée dégagée (jour 2 du cycle météo du jeu), 11 h, aucune pluie, sol sec.
  weather: { label: 'Jour dégagé', day: 2, hour: 11, rain: 0, wet: 0 },
  // Aide au saut (anneau du bouton SAUT) activée.
  jumpAid: true,
  // Barème du défi (adaptation de jeu inspirée du barème A au chrono).
  rules: { rail: 4, firstRefusal: 4, refusalsToEliminate: 2, timeFaultPerSecond: 1 },
});

export const CHALLENGES = { [DEFI_POLE_V1.id]: DEFI_POLE_V1 };
export const SIGNATURE = 'STRIDES Grand Tour';

// Pénalités de temps : 1 point par seconde entamée au-delà du temps accordé.
export function timeFaults(t, allowed, perSecond = 1) {
  const over = t - allowed;
  return over > 1e-9 ? Math.ceil(over - 1e-9) * perSecond : 0;
}

// Résultat d'une tentative à partir de l'état du parcours (courses.js : faults, refusals, t) ; `eliminated` = motif.
export function makeResult(cfg, { attempt, faults = 0, refusals = 0, rails = 0, t = 0, eliminated = null, at = Date.now(), build = BUILD }) {
  const tf = eliminated ? 0 : timeFaults(t, cfg.timeAllowed, cfg.rules.timeFaultPerSecond);
  return {
    challenge: cfg.id,
    version: cfg.version,
    attempt,
    horse: cfg.horse.name,
    eliminated: eliminated ? String(eliminated) : null,
    rails,
    refusals,
    faults: eliminated ? null : faults,
    timeFaults: eliminated ? null : tf,
    penalties: eliminated ? null : faults + tf,
    time: Math.round(t * 100) / 100,
    at,
    build,
  };
}

// Classement : un parcours terminé passe devant un éliminé ; puis le moins de pénalités ; puis le chrono le plus
// rapide. Renvoie < 0 si `a` est meilleur que `b`.
export function compareResults(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const ea = !!a.eliminated, eb = !!b.eliminated;
  if (ea !== eb) return ea ? 1 : -1;
  if (ea) return 0;
  if (a.penalties !== b.penalties) return a.penalties - b.penalties;
  return a.time - b.time;
}

export const isBetter = (a, b) => compareResults(a, b) < 0;

// Registre local des défis (sauvegarde v2 : `save.data.challenges`).
export function challengeStore(data) {
  const c = (data.challenges ||= {});
  c.records ||= {};
  if (typeof c.pseudo !== 'string') c.pseudo = '';
  if (c.last === undefined) c.last = null;
  return c;
}

// Enregistre une tentative terminée : dernier résultat, nombre de tentatives, record personnel de CETTE version
// (une élimination n'est jamais un record). Une même tentative n'est comptée qu'une fois.
export function recordResult(data, res) {
  const c = challengeStore(data);
  const r = (c.records[res.challenge] ||= { best: null, attempts: 0, last: null, seen: [] });
  r.seen ||= [];
  if (res.attempt && r.seen.includes(res.attempt)) return { isRecord: false, previous: r.best, duplicate: true };
  if (res.attempt) {
    r.seen.push(res.attempt);
    if (r.seen.length > 30) r.seen.shift();
  }
  r.attempts++;
  r.last = res;
  c.last = res;
  const previous = r.best;
  const isRecord = !res.eliminated && (!previous || isBetter(res, previous));
  if (isRecord) r.best = res;
  return { isRecord, previous, duplicate: false };
}

export function bestOf(data, id) {
  return data.challenges?.records?.[id]?.best || null;
}

// Pseudonyme facultatif affiché sur la carte : texte court, sans caractères de contrôle.
export function cleanPseudo(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

// Affichages.
export const fmtSeconds = (t) => `${(Math.round(t * 100) / 100).toFixed(2).replace('.', ',')} s`;
export const fmtHeight = (m) => `${m.toFixed(2).replace('.', ',')} m`;
export const fmtPenalties = (p) => `${p} ${p > 1 ? 'pts' : 'pt'}`;

export function resultLine(res) {
  if (!res) return '—';
  if (res.eliminated) return 'Éliminé';
  return `${fmtPenalties(res.penalties)} · ${fmtSeconds(res.time)}`;
}

// Conditions lisibles (écran de départ, carte de résultat).
export function conditionsList(cfg) {
  return [
    ['Parcours', `${cfg.obstacles.length} obstacles · ${fmtHeight(cfg.height)}`],
    ['Cheval fourni', `${cfg.horse.name} · statistiques fixes`],
    ['Météo', `${cfg.weather.label} · ${cfg.weather.hour} h · sol sec`],
    ['Temps accordé', `${cfg.timeAllowed} s`],
    ['Aide au saut', cfg.jumpAid ? 'activée' : 'désactivée'],
  ];
}

// Règle de classement expliquée avant le départ.
export function rulesText(cfg) {
  const r = cfg.rules;
  return [
    `Pénalités d’abord : ${r.rail} points par barre tombée, ${r.firstRefusal} points au premier refus, élimination au ${r.refusalsToEliminate === 2 ? 'second' : `${r.refusalsToEliminate}e`} refus, ${r.timeFaultPerSecond} point par seconde entamée au-delà du temps accordé (${cfg.timeAllowed} s).`,
    'Puis le chrono : à pénalités égales, le temps le plus court l’emporte.',
    `Éliminé aussi si tu descends de cheval ou si tu dépasses ${cfg.timeLimit} s.`,
  ];
}

// Texte de partage (copie) : adresse publique de la partie sans paramètres ni ancre.
export function shareText(cfg, res, url, pseudo = '') {
  const who = cleanPseudo(pseudo);
  return `${cfg.name} (${cfg.id}) — ${res.eliminated ? 'éliminé' : `${fmtPenalties(res.penalties)} en ${fmtSeconds(res.time)}`} avec ${res.horse}${who ? ` · ${who}` : ''}. ${SIGNATURE} ${url}`;
}

export function publicUrl(loc) {
  return `${loc.origin}${loc.pathname}`;
}

// Identifiant unique de tentative (mesure, dédoublonnage, registre).
export function newAttemptId(cfg, now = Date.now(), rnd = Math.random) {
  return `${cfg.id}-${now.toString(36)}-${Math.floor(rnd() * 36 ** 5).toString(36).padStart(5, '0')}`;
}
