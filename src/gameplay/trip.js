// Déplacements en camion avec un cheval : étapes réutilisables (charger, rouler, décharger) et sortie en concours
// « Aller en concours » au Pôle International (CSO, règlement FEI, classement et dotation).
import * as THREE from 'three';
import { POLE, HOME } from '../world/sites.js';
import { POI } from '../world/layout.js';
import { courseSteps, COURSE_LENGTH, COURSE_SPEED, timeAllowedFor } from './courses.js';
import { CSO_FINISH, CSO_START } from './obstacles.js';
import { FIRST_NAMES, LAST_NAMES } from './data.js';
import { box, cyl, compose } from '../world/shapes.js';
import { signTexture } from '../world/textures.js';
import { dec, formatMoney, mulberry32 } from '../core/math.js';

// Aires de stationnement des camions.
export const PARKS = {
  home: { x: HOME.truck.x, z: HOME.truck.z, r: 14, name: 'l’Écurie du Val' },
  haras: { x: -380, z: -98, r: 12, name: 'le Haras de la Pommeraie' },
  pole: { x: 311, z: -177, r: 13, name: 'le parking des camions du Pôle International' },
};
// Secrétariat du concours (sous tente, à l'entrée du Pôle).
export const SECRETARIAT = { x: 304, z: -198 };

const P = (g) => g.player;
const T = (g) => g.player.truck;
const TP = (g) => g.player.transport;

// ---------- Étapes réutilisables ----------
// Charger un cheval : étape composée dont la consigne suit la situation (rampe, cheval en main…).
export function loadStep(game, S, { horse, name }) {
  const rear = new THREE.Vector3();
  const state = () => {
    const h = horse();
    const tp = TP(game), t = T(game), p = P(game);
    if (!h) return 'wait';
    if (tp.isAboard(h) && !tp.seq) return t.rampClosed ? 'done' : 'close';
    if (tp.seq) return 'seq';
    if (p.mode === 'drive') return 'exit';
    if (Math.hypot(h.pos.x - t.pos.x, h.pos.z - t.pos.z) > 30) return 'bring';
    if (p.mode === 'ride' && p.horse === h) return 'dismount';
    if (t.rampClosed || t.ramp.target === 0) return 'open';
    if (!tp.led || tp.led.horse !== h) return 'lead';
    return 'load';
  };
  return S.custom({
    kind: 'tload',
    horse,
    text: () => {
      switch (state()) {
        case 'exit': return 'Arrête le camion et descends (ACTION)';
        case 'dismount': return `Descends de ${name} pour le charger`;
        case 'open': return 'Ouvre la rampe arrière du camion';
        case 'bring': return `Ramène ${name} jusqu’au camion (monte-le ou mène-le en main)`;
        case 'lead': return `Prends ${name} en main (« Mener en main »)`;
        case 'load': return `Amène ${name} au pied de la rampe : « Faire monter le cheval »`;
        case 'seq': return `Chargement de ${name}…`;
        case 'close': return 'Ferme la rampe';
        default: return '';
      }
    },
    target: () => {
      const st = state();
      const h = horse();
      const p = P(game);
      const carried = p.mode === 'ride' ? p.horse === h : TP(game).led?.horse === h;
      if (h && (st === 'lead' || st === 'dismount' || (st === 'bring' && !carried))) return h.pos;
      return T(game).rearPoint(rear, T(game).ramp.target === 1 ? 2.6 : 1.0);
    },
    radius: 2.5,
    beacon: false,
    hint: 'À pied derrière le camion : <b>Ouvrir la rampe</b>, puis <b>Mener en main</b> et <b>Faire monter le cheval</b>.',
    hintMs: 7000,
    update: () => state() === 'done',
  });
}

// Décharger un cheval (il finit en main à l'arrière du camion).
export function unloadStep(game, S, { horse, name }) {
  const rear = new THREE.Vector3();
  const state = () => {
    const h = horse();
    const tp = TP(game), t = T(game), p = P(game);
    if (!h) return 'wait';
    if (tp.seq) return 'seq';
    if (!tp.isAboard(h)) return 'done';
    if (p.mode === 'drive') return 'exit';
    if (t.ramp.target === 0) return 'open';
    return 'unload';
  };
  return S.custom({
    kind: 'tunload',
    horse,
    text: () => {
      switch (state()) {
        case 'exit': return 'Gare-toi et descends du camion (ACTION à l’arrêt)';
        case 'open': return 'Ouvre la rampe arrière';
        case 'unload': return `Fais descendre ${name}`;
        case 'seq': return `Déchargement de ${name}…`;
        default: return '';
      }
    },
    target: () => T(game).rearPoint(rear, T(game).ramp.target === 1 ? 2.6 : 1.0),
    radius: 2.5,
    beacon: false,
    update: () => state() === 'done',
  });
}

// Rouler jusqu'à une aire de stationnement (camion à l'arrêt dans l'aire, rampe fermée).
export function driveStep(game, S, { to, text, timer = null, comfort = false, onArrive = null }) {
  return S.custom({
    kind: 'tdrive',
    to,
    text: () => {
      const p = P(game), t = T(game);
      if (p.mode !== 'drive') return t.rampClosed ? 'Monte au volant du camion' : 'Ferme la rampe et monte au volant';
      const d = Math.hypot(t.pos.x - to.x, t.pos.z - to.z);
      return d < to.r + 4 ? 'Gare le camion et arrête-toi' : text;
    },
    target: () => (P(game).mode === 'drive' ? to : T(game).pos),
    radius: to.r,
    hint: comfort ? 'Accélère et freine en douceur, ralentis dans les virages : le <b>confort du cheval</b> compte.' : 'Joystick vers le haut : accélérer · vers le bas : freiner puis reculer.',
    hintMs: 6000,
    start(r) {
      if (timer) r.timer = timer;
      if (comfort) TP(game).comfort = 100;
    },
    update(r) {
      const t = T(game);
      const ok = P(game).mode === 'drive' && Math.hypot(t.pos.x - to.x, t.pos.z - to.z) < to.r && Math.abs(t.speed) < 0.3;
      if (ok) {
        if (timer) r.timer = null;
        if (comfort) r.data.comfort = TP(game).comfort;
        onArrive?.(r);
      }
      return ok;
    },
  });
}

// ---------- Sortie en concours (CSO au Pôle International) ----------
const CLASSES = [
  { id: 'am2', name: 'Amateur 2', h: 1.05, ta: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national), heights: [1.0, 1.05, 1.0, 1.05, 1.05, 1.1, 1.05, 1.1, 1.05], prizes: [260, 180, 130, 100, 80], fee: 22 },
  { id: 'am1', name: 'Amateur 1', h: 1.15, ta: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national), heights: [1.1, 1.15, 1.1, 1.15, 1.15, 1.2, 1.15, 1.2, 1.15], prizes: [420, 290, 210, 160, 120, 90], fee: 28 },
  { id: 'pro2', name: 'Pro 2', h: 1.25, ta: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.csi), heights: [1.2, 1.25, 1.2, 1.25, 1.25, 1.3, 1.25, 1.3, 1.25], prizes: [650, 450, 320, 240, 180, 140], fee: 36 },
];
const HORSE_NAMES = ['Quartz du Val', 'Ubris de Mai', 'Vendôme', 'Tiara du Ter', 'Diamant Rouge', 'Saphir des Bois', 'Oural', 'Ninja Z', 'Belle d’Auge', 'Utopie', 'Kalimba', 'Rubis Blanc', 'Galaxie', 'Hermès du Lac'];
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (h) => {
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t);
  const mm = Math.round(((t - hh) * 60) / 5) * 5;
  return mm === 60 ? `${pad2((hh + 1) % 24)}:00` : `${pad2(hh)}:${pad2(mm)}`;
};
const classFor = (level) => CLASSES[level >= 4 ? 2 : level >= 3 ? 1 : 0];
const ordinal = (n) => (n === 1 ? '1re' : `${n}e`);

// Classement simulé des autres engagés (barème A au chrono).
export function simulateField(cls, seed, n = 14) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rnd();
    let faults = r < 0.34 ? 0 : r < 0.68 ? 4 : r < 0.86 ? 8 : r < 0.95 ? 12 : 16;
    if (cls.id === 'am2' && faults > 0 && rnd() < 0.25) faults -= 4;
    const t = cls.ta - 4 + (rnd() + rnd() + rnd() - 1.5) * 4.2 + faults * 0.15;
    const timeFaults = Math.max(0, Math.ceil(t - cls.ta - 1e-9));
    const rider = `${FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)][0]}. ${LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]}`;
    out.push({ rider, horse: HORSE_NAMES[(i + Math.floor(seed)) % HORSE_NAMES.length], faults: faults + timeFaults, time: Math.round(t * 100) / 100 });
  }
  return out;
}

export function rankResults(list) {
  return [...list].sort((a, b) => a.faults - b.faults || a.time - b.time);
}

// Décor du concours : tente du secrétariat et panneau (le temps de la mission).
export function secretariatProps(game) {
  const s = SECRETARIAT;
  const y = game.terrain.getHeight(s.x, s.z);
  const parts = [
    [box(2.2, 0.06, 0.9), '#f2f1ec', { y: 0.74 }],
    [box(2.2, 0.72, 0.04), '#1b1c1f', { y: 0.02, z: 0.43 }],
    [cyl(0.04, 0.04, 2.5, 6), '#1b1c1f', { x: -1.5, z: -1.2 }],
    [cyl(0.04, 0.04, 2.5, 6), '#1b1c1f', { x: 1.5, z: -1.2 }],
    [cyl(0.04, 0.04, 2.5, 6), '#1b1c1f', { x: -1.5, z: 1.2 }],
    [cyl(0.04, 0.04, 2.5, 6), '#1b1c1f', { x: 1.5, z: 1.2 }],
    [box(3.3, 0.08, 2.7), '#f2f1ec', { y: 2.5 }],
    [box(3.34, 0.32, 0.02), '#1b1c1f', { y: 2.2, z: 1.36 }],
  ];
  const g = new THREE.Group();
  const m = new THREE.Mesh(compose(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.3), new THREE.MeshStandardMaterial({ map: signTexture('SECRÉTARIAT', '', { dark: true, w: 1024, h: 102 }) }));
  sign.position.set(0, 2.2, 1.375);
  g.add(sign);
  g.position.set(s.x, y, s.z);
  g.rotation.y = 0.15;
  game.scene.add(g);
  const col = game.colliders.addBox(s.x, s.z, 1.15, 0.5, 0.15, y + 1, 'secretariat');
  return () => {
    game.scene.remove(g);
    m.geometry.dispose();
    col.enabled = false;
  };
}

export function competitionDef(level, startHour) {
  const cls = classFor(level);
  const total = cls.prizes.reduce((a, b) => a + b, 0);
  return {
    id: 'concours',
    offerId: 'event:concours',
    story: false,
    vertical: 'EVENEMENTS',
    category: 'CSO',
    title: `Concours du Pôle — ${cls.name} ${dec(cls.h, 2)} m`,
    desc: `CSO au Pôle International, barème A au chrono (règlement FEI). Charge ton cheval dans le camion Strides, gare-toi au parking des camions, retire ton dossard au secrétariat, échauffe-toi puis entre en piste. Heure de passage vers ${hhmm(startHour)}. Engagement ${cls.fee} €.`,
    client: { name: 'Pôle International', initials: 'PI', rating: 4.9, verified: true },
    place: { x: POI.pole.x, z: POI.pole.z },
    placeName: 'Pôle International',
    pay: 0,
    payLabel: `Dotation ${formatMoney(total)}`,
    xp: 240,
    duration: '~10 min',
    cls,
    startHour,
    irl: 'les concours se gèrent hors de Strides ; sur Strides, on recrute en revanche les grooms de concours, chauffeurs et agents de concours qui les rendent possibles.',
    rate: (run) => {
      const rk = run.data.rank || 99;
      return Math.max(2, (rk <= 3 ? 5 : rk <= 6 ? 4 : 3) - (run.data.late ? 1 : 0));
    },
    review: (s, run) => (run.data.rank === 1 ? 'Victoire au Pôle ! Un parcours de très haut niveau.' : s >= 4 ? 'Très beau parcours, classé(e) dans la dotation. Revenez vite !' : 'Merci pour votre participation, à bientôt sur nos terrains.'),
    setup(game) {
      const d = game.save.data;
      if (d.money >= cls.fee) {
        d.money -= cls.fee;
        game.updateWallet();
        game.hud.toast(`Engagement réglé au secrétariat du concours : ${cls.fee} €`);
      }
    },
    after(game) {
      game.hud.hint('Pour rentrer : <b>Mener en main</b> ton cheval jusqu’au camion, <b>Faire monter le cheval</b>, puis cap sur l’Écurie du Val.', 8000);
    },
    steps(game, run, S) {
      run.data.startHour ??= (game.hour() + 5) % 24;
      run.data.bib ??= 30 + Math.floor(Math.random() * 60);
      const main = () => game.mainHorse;
      const nm = () => game.mainHorse?.name || 'ton cheval';
      let official = null;
      const late = () => {
        const dh = (((game.hour() - run.data.startHour) % 24) + 24) % 24;
        return dh > 0 && dh < 12;
      };
      run.sub = () => (run.data.course?.running || run.data.course?.finished ? null : `Heure de passage ${hhmm(run.data.startHour)} · il est ${hhmm(game.hour())}${late() ? ' · en retard !' : ''}`);
      const subPre = run.sub;
      const course = courseSteps(game, run, S, {
        courseId: 'cso',
        start: { x: CSO_START.x, z: CSO_START.z },
        finish: CSO_FINISH,
        timeAllowed: cls.ta,
        maxRefusals: 2,
        heights: cls.heights,
        intro: () => [{ who: 'Jury · Pôle International', initials: 'PI', text: `Concurrent n° ${run.data.bib}, ${game.save.data.playerName} et ${nm()}. Barème A au chrono, temps accordé ${Math.floor(cls.ta / 60)}:${pad2(cls.ta % 60)}. Barre tombée ou premier refus : 4 points ; deuxième refus : élimination. La cloche va sonner !` }],
      });
      const courseSub = run.sub;
      run.sub = subPre;
      return [
        S.custom({
          text: '',
          start(r) {
            game.message('Pôle International', 'PI', `Engagement confirmé : ${main()?.name || 'ton cheval'} et ${game.save.data.playerName}, épreuve ${cls.name} (${dec(cls.h, 2)} m), dossard n° ${r.data.bib}. Heure de passage ${hhmm(r.data.startHour)}. Dossard à retirer au secrétariat, à l’entrée du Pôle.`);
            const clean = secretariatProps(game);
            r.onCleanup(clean);
            official = game.spawnHuman({ top: '#f2f1ec', sleeve: '#f2f1ec', pants: '#1b1c1f', boots: '#121214', skin: '#c99a74', hair: '#2a1d14' }, SECRETARIAT.x - 0.2, SECRETARIAT.z - 0.9, 0.15, { name: 'Secrétariat' });
            r.onCleanup(() => game.despawn(official));
          },
          update: () => true,
        }),
        loadStep(game, S, { horse: main, name: nm() }),
        driveStep(game, S, { to: PARKS.pole, text: 'Roule jusqu’au Pôle International — parking des camions', comfort: true }),
        unloadStep(game, S, { horse: main, name: nm() }),
        S.interact(() => official.pos, 'Retirer le dossard', 'Secrétariat — retire ton dossard', {
          modes: ['foot', 'ride'],
          r: 3.6,
          icon: 'talk',
          onDo: (r) => {
            r.data.late = late();
            official.pose = 'wave';
          },
        }),
        S.dialog(() => [
          { who: 'Secrétariat du concours', initials: 'SC', text: `Bonjour ! ${main()?.name || 'Ton cheval'}, épreuve ${cls.name}, dossard n° ${run.data.bib}. ${run.data.late ? 'Tu as manqué ton heure : tu partiras en fin d’épreuve.' : 'Tu passes à l’heure prévue.'}` },
          { who: 'Secrétariat du concours', initials: 'SC', text: 'Paddock d’échauffement à l’ouest de la carrière. Deux sauts pour te mettre en jambes, puis présente-toi à l’entrée de piste.' },
        ]),
        S.custom({
          text: () => (P(game).mode === 'ride' ? '' : `Selle et monte ${nm()}`),
          target: () => main()?.pos,
          radius: 3,
          beacon: false,
          update: () => P(game).mode === 'ride' && P(game).horse === main(),
        }),
        S.custom({
          text: () => `Échauffe-toi au paddock : sauts ${Math.min(2, run.data.warm || 0)}/2`,
          target: { x: POLE.warmup.x + 12, z: POLE.warmup.z },
          radius: 6,
          beacon: false,
          hint: 'Saute les deux obstacles du paddock d’échauffement (au trot ou au galop).',
          start(r) {
            r.data.warm = 0;
            const on = ({ obstacle }) => {
              if (obstacle.course === 'warmup') r.data.warm++;
            };
            r.onCleanup(game.bus.on('obstacle:clear', on));
            r.onCleanup(game.bus.on('obstacle:fault', on));
          },
          update: (r) => r.data.warm >= 2,
        }),
        S.custom({
          text: '',
          start(r) {
            r.sub = courseSub;
            game.audio.cheer?.();
          },
          update: () => true,
        }),
        ...course,
        S.custom({
          text: 'Résultats officiels…',
          start(r) {
            const st = r.data.course;
            // Règlement FEI : 1 point par seconde entamée au-delà du temps accordé.
            st.timeFaults = Math.max(0, Math.ceil(st.t - cls.ta - 1e-9));
            const me = { rider: game.save.data.playerName, horse: main()?.name || 'Cheval', faults: st.faults + st.timeFaults, time: Math.round(st.t * 100) / 100, me: true };
            const field = simulateField(cls, Math.floor(game.time * 7 + r.data.bib));
            const ranked = rankResults([...field, me]);
            const rank = ranked.indexOf(me) + 1;
            r.data.rank = rank;
            const prize = cls.prizes[rank - 1] || 0;
            r.payOverride = prize;
            r.resultTitle = rank === 1 ? 'Victoire au Pôle !' : `${ordinal(rank)} place — ${cls.name}`;
            r.resultBody = `${me.faults} pt${me.faults > 1 ? 's' : ''} en ${dec(me.time, 2)} s · ${ordinal(rank)} sur ${ranked.length}${prize ? ` · dotation ${formatMoney(prize)}` : ' · hors dotation'}`;
            const rows = ranked.slice(0, 8);
            if (!rows.includes(me)) rows.push(me);
            const html = `<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:13px">${rows
              .map((x) => {
                const k = ranked.indexOf(x) + 1;
                const st2 = x.me ? 'font-weight:700;background:rgba(201,162,74,.18)' : '';
                return `<tr style="${st2}"><td style="padding:4px 6px">${k}</td><td style="padding:4px 6px">${x.rider} · ${x.horse}</td><td style="padding:4px 6px;text-align:right">${x.faults} pts</td><td style="padding:4px 6px;text-align:right">${dec(x.time, 2)} s</td><td style="padding:4px 6px;text-align:right">${cls.prizes[k - 1] ? `${cls.prizes[k - 1]} €` : ''}</td></tr>`;
              })
              .join('')}</table>`;
            r.flags.results = false;
            game.screens.card({
              kicker: `Résultats officiels · ${cls.name} ${dec(cls.h, 2)} m`,
              title: rank === 1 ? 'Victoire !' : `${ordinal(rank)} place`,
              body: `Barème A au chrono · temps accordé ${cls.ta} s · ${ranked.length} partants.`,
              html,
              buttons: [{ label: 'Continuer', primary: true, id: 'results', run: () => (r.flags.results = true) }],
            });
          },
          update: (r) => r.flags.results,
        }),
      ];
    },
  };
}

// Offres « Événements » : un concours du Pôle est proposé régulièrement dans l'app Strides.
export class CompetitionOffers {
  constructor(game) {
    this.game = game;
    this.t = 12;
    this.notified = false;
    this.lastDone = -1e9;
    const done = (run) => {
      if (run?.offer?.id === 'event:concours') this.lastDone = game.time;
    };
    game.bus.on('mission:complete', ({ run }) => done(run));
    game.bus.on('mission:fail', (run) => done(run));
  }
  update(dt) {
    const g = this.game;
    const m = g.missions;
    if (!m || g.state !== 'play') return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 20;
    const d = g.save.data;
    if (!d.completed.includes('tuto') || m.active) return;
    if (m.offers.some((o) => o.id === 'event:concours')) return;
    if (m.refusedAt['event:concours'] !== undefined && g.time - m.refusedAt['event:concours'] < 120) return;
    if (g.time - this.lastDone < 90) return;
    const def = competitionDef(m.levelInfo().level, (g.hour() + 5) % 24);
    const o = m._offerFromDef(def, { id: 'event:concours' });
    m.offers.push(o);
    m.updateBadge();
    g.phone?.refresh();
    if (!this.notified) {
      this.notified = true;
      m.pushNotif(o);
    }
  }
}
