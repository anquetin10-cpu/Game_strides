// Grand Prix de Paris Indoor (hommage fictif au format des grands concours en salle de type « Formule 1 » : aucun nom,
// logo ni identité visuelle réels). Finale du jeu, débloquée après le Grand Prix CSI 5★ du Pôle :
//   invitation → camion jusqu'à l'autoroute A13 → Paris (écran de voyage) → accréditation → échauffement au paddock →
//   Sprint à 1,50 m (barème C : chrono, +4 s par barre) qui fixe la grille du Grand Prix (le plus rapide part en
//   dernier) → présentation des 40 cavaliers sur écrans géants → Grand Prix à 1,60 m (barème A au chrono, barrage
//   des sans-faute) → podium. Les 39 autres couples sont simulés (résultats reproductibles par graine).
import { PARIS } from '../world/sites.js';
import { PARIS_COURSES, PARIS_WARM } from './parisCourse.js';
import { courseSteps, timeAllowedFor, COURSE_SPEED } from './courses.js';
import { loadStep, unloadStep, driveStep } from './trip.js';
import { A13 } from './travel.js';
import { FIRST_NAMES, LAST_NAMES } from './data.js';
import { HORSE_NAMES } from './ranking.js';
import { dec, formatMoney, mulberry32 } from '../core/math.js';

// Réglages de l'épreuve.
export const PARIS_GP = {
  riders: 40,
  sprint: { h: 1.5, ta: timeAllowedFor(PARIS_COURSES.paris_sprint.length, COURSE_SPEED.csi), railSeconds: 4 },
  gp: { h: 1.6, ta: timeAllowedFor(PARIS_COURSES.paris_gp.length, COURSE_SPEED.national) },
  // Dotation du Grand Prix (10 premiers) et prime du Sprint (vainqueur).
  prizes: [12000, 8000, 5500, 4000, 3000, 2400, 1900, 1500, 1200, 1000],
  sprintPrize: 1500,
  gpHour: 20,
};

const ORG = { who: 'Margot Delaunay · Grand Prix de Paris Indoor', initials: 'MD' };
const ordinal = (n) => (n === 1 ? '1re' : `${n}e`);
const say = (text) => ({ ...ORG, text });

// Concurrents simulés : 39 couples de niveau international (noms du jeu, fictifs).
export function parisRivals(seed, n = PARIS_GP.riders - 1) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const rider = `${FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)][0]}. ${LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]}`;
    out.push({ rider, horse: HORSE_NAMES[(i * 7 + seed) % HORSE_NAMES.length], form: 0.85 + rnd() * 0.3 });
  }
  return out;
}

// Sprint (barème C) : chrono + 4 s par barre ; le meilleur couple part en dernier au Grand Prix.
export function sprintField(rivals, seed, ta = PARIS_GP.sprint.ta) {
  const rnd = mulberry32(seed + 101);
  return rivals.map((r) => {
    const x = rnd();
    const rails = x < 0.56 ? 0 : x < 0.86 ? 1 : 2;
    const t = Math.round((ta * (0.86 + (rnd() + rnd() - 1) * 0.06) / r.form ** 0.4) * 100) / 100;
    return { ...r, rails, time: t, score: Math.round((t + rails * PARIS_GP.sprint.railSeconds) * 100) / 100 };
  });
}
export const rankSprint = (list) => [...list].sort((a, b) => a.score - b.score);

// Grand Prix (barème A au chrono), puis barrage des sans-faute.
export function gpField(rivals, seed, ta = PARIS_GP.gp.ta) {
  const rnd = mulberry32(seed + 202);
  return rivals.map((r) => {
    const x = rnd() / r.form;
    const faults = x < 0.24 ? 0 : x < 0.62 ? 4 : x < 0.86 ? 8 : 12;
    const t = Math.round((ta * (0.93 + (rnd() + rnd() - 1) * 0.05)) * 100) / 100;
    const tf = Math.max(0, Math.ceil(t - ta - 1e-9));
    return { ...r, faults: faults + tf, time: t };
  });
}
export function barrageField(clear, seed, ta) {
  const rnd = mulberry32(seed + 303);
  return clear.map((r) => {
    const x = rnd();
    const faults = x < 0.62 ? 0 : x < 0.92 ? 4 : 8;
    return { ...r, joFaults: faults, joTime: Math.round(ta * (0.8 + (rnd() + rnd() - 1) * 0.05) * 100) / 100 };
  });
}

// Fautes aux obstacles d'une manche (barres et refus), d'après le relevé du parcours.
const railsOf = (st) => st.log.filter((l) => l.kind === 'rail').length;

function table(rows, cols, me) {
  return `<table class="cso-rank">${rows.map((x, i) => `<tr${x === me ? ' class="me"' : ''}><td>${i + 1}</td><td>${x.rider} · ${x.horse}</td>${cols.map((c) => `<td>${c(x)}</td>`).join('')}</tr>`).join('')}</table>`;
}

export const PARIS_MISSION = {
  id: 'gpparis', story: true, vertical: 'EVENEMENTS', category: 'Grand Prix', title: 'Grand Prix de Paris Indoor', level: 4, requires: ['gp'],
  desc: 'L’invitation de ta carrière : 40 couples d’élite dans une arène couverte à Paris. Un Sprint à 1,50 m fixe la grille de départ, puis le Grand Prix à 1,60 m le soir, sous les projecteurs. Route en camion par l’autoroute A13.',
  client: { name: 'Grand Prix de Paris Indoor', initials: 'GP', rating: 5.0, verified: true },
  place: { x: A13.deauville.x, z: A13.deauville.z }, placeName: 'Paris · arène couverte', pay: 0, payLabel: `Dotation ${formatMoney(PARIS_GP.prizes.reduce((a, b) => a + b, 0) + PARIS_GP.sprintPrize)}`, xp: 1500, duration: '~15 min',
  irl: 'les concours se gèrent hors de Strides ; sur Strides, on recrute en revanche les grooms de concours, chauffeurs et agents de concours qui les rendent possibles.',
  rate: (run) => (run.data.final === 1 ? 5 : run.data.final <= 3 ? 5 : run.data.final <= 10 ? 4 : 3),
  review: (s, run) => (run.data.final === 1 ? 'Paris debout pour toi : une victoire historique.' : run.data.final <= 3 ? 'Sur le podium à Paris ! Un très grand moment.' : 'Merci d’avoir fait le spectacle à Paris. À l’année prochaine !'),
  steps(game, run, S) {
    const main = () => game.mainHorse;
    const nm = () => game.mainHorse?.name || 'ton cheval';
    const inParis = () => game.region === 'paris';
    const paris = () => game.world.paris;
    const seed = (run.data.seed ??= 4000 + Math.floor(Math.random() * 5000));
    const rivals = parisRivals(seed);
    // Étapes du trajet sautées si l'on est déjà à Paris (camion venu plus tôt).
    const notInParis = (st) => ({ ...st, text: () => (inParis() ? '' : typeof st.text === 'function' ? st.text() : st.text), update: (r, dt) => inParis() || st.update(r, dt) });
    let official = null;
    const sprintSteps = courseSteps(game, run, S, {
      courseId: 'paris_sprint', start: PARIS_COURSES.paris_sprint.start, finish: PARIS_COURSES.paris_sprint.finish, gate: PARIS.gate, gateText: 'Entre en piste : passe la porte des cavaliers, à l’ouest de l’arène',
      timeAllowed: PARIS_GP.sprint.ta, heights: PARIS_COURSES.paris_sprint.heights(PARIS_GP.sprint.h), height: PARIS_GP.sprint.h,
      length: PARIS_COURSES.paris_sprint.length, trace: PARIS_COURSES.paris_sprint.trace, venue: 'paris', soft: true,
      title: 'Sprint · Grand Prix de Paris Indoor', className: 'Sprint 1,50 m', place: 'Grand Prix de Paris Indoor', table: 'barème C (vitesse)',
      rulesText: 'Barème C : chaque barre ajoute 4 secondes au chrono · deuxième refus : élimination. Le classement fixe la grille du Grand Prix : le plus rapide part en dernier.',
      stable: 'Écurie du Val', bib: run.data.bib,
    });
    const gpSteps = (barrage = false) => courseSteps(game, run, S, {
      courseId: 'paris_gp', start: PARIS_COURSES.paris_gp.start, finish: PARIS_COURSES.paris_gp.finish, gate: PARIS.gate, gateText: 'Entre en piste : passe la porte des cavaliers',
      timeAllowed: barrage ? Math.ceil(PARIS_GP.gp.ta * 0.86) : PARIS_GP.gp.ta, heights: PARIS_COURSES.paris_gp.heights(PARIS_GP.gp.h), height: PARIS_GP.gp.h,
      length: PARIS_COURSES.paris_gp.length, trace: PARIS_COURSES.paris_gp.trace, venue: 'paris', soft: true, present: !barrage,
      title: barrage ? 'Barrage · Grand Prix de Paris Indoor' : 'Grand Prix de Paris Indoor', className: 'Grand Prix 1,60 m', place: 'Grand Prix de Paris Indoor',
      table: barrage ? 'barrage au chrono' : 'barème A au chrono, barrage',
      stable: 'Écurie du Val', bib: run.data.bib,
    });
    const screen = (info) => {
      if (paris()) paris().screenInfo = info;
    };
    return [
      S.dialog([
        say(`${game.save.data.playerName}, après ta victoire au Grand Prix CSI 5★, le Grand Prix de Paris Indoor t’invite : 40 couples d’élite, une arène couverte et un format pensé comme une course de Formule 1.`),
        say('Le principe : un Sprint à 1,50 m, au chrono pur, décide de la grille de départ. Le soir, le Grand Prix à 1,60 m : le plus rapide du Sprint part en dernier. Barrage pour les sans-faute.'),
        say(`Charge ${nm()} dans le camion Strides et prends l’autoroute A13, au bout de la route Est-Ouest. On t’attend au parking des camions.`),
      ]),
      notInParis(loadStep(game, S, { horse: main, name: nm() })),
      notInParis(driveStep(game, S, { to: A13.deauville, text: 'Roule jusqu’à l’autoroute A13 — au bout de la route Est-Ouest', comfort: true })),
      S.custom({
        text: () => (inParis() ? '' : 'Arrêté sur la bretelle : prends l’autoroute vers Paris (bouton « Autoroute A13 »)'),
        target: { x: A13.deauville.x, z: A13.deauville.z },
        radius: 10,
        update: () => inParis(),
      }),
      unloadStep(game, S, { horse: main, name: nm() }),
      S.custom({
        text: '',
        start(r) {
          r.data.bib ??= 100 + Math.floor(Math.random() * 40);
          official = game.spawnHuman({ top: '#15161a', sleeve: '#15161a', pants: '#15161a', boots: '#121214', skin: '#d9a982', hair: '#2a1d14', ponytail: true }, PARIS.secretariat.x, PARIS.secretariat.z, Math.PI / 2, { name: 'Accréditations' });
          r.onCleanup(() => game.despawn(official));
          screen({ title: 'GRAND PRIX DE PARIS INDOOR', line1: 'CE SOIR · 20 H', line2: '40 couples · Sprint puis Grand Prix' });
        },
        update: () => true,
      }),
      S.interact(() => official.pos, 'Accréditation', 'Accréditations — retire ton dossard (entrée du parking)', { modes: ['foot', 'ride'], r: 3.6, icon: 'talk', onDo: () => (official.pose = 'wave') }),
      S.dialog(() => [
        say(`Bienvenue à Paris ! ${nm()}, dossard n° ${run.data.bib}. Ton box est sous la tente des écuries provisoires.`),
        say('Échauffement au paddock, à l’ouest de l’arène : deux sauts, puis passe la porte des cavaliers. Le Sprint commence dès que tu entres en piste.'),
      ]),
      S.custom({
        text: () => (game.player.mode === 'ride' && game.player.horse === main() ? '' : `Selle et monte ${nm()}`),
        target: () => main()?.pos,
        radius: 3,
        beacon: false,
        update: () => game.player.mode === 'ride' && game.player.horse === main(),
      }),
      S.custom({
        text: () => `Échauffe-toi au paddock de Paris : sauts ${Math.min(2, run.data.warm || 0)}/2`,
        target: { x: PARIS.warmup.x, z: PARIS.warmup.z },
        radius: 8,
        beacon: false,
        hint: 'Saute le vertical et l’oxer du paddock (au galop), puis rejoins la porte des cavaliers.',
        start(r) {
          r.data.warm = 0;
          game.obstacles.resetRails(PARIS_WARM);
          const on = ({ obstacle }) => {
            if (obstacle.course === PARIS_WARM) r.data.warm++;
          };
          r.onCleanup(game.bus.on('obstacle:clear', on));
          r.onCleanup(game.bus.on('obstacle:fault', on));
        },
        update: (r) => r.data.warm >= 2,
      }),
      // ---------- Sprint ----------
      S.custom({
        text: '',
        start() {
          game.obstacles.showParisCourse('paris_sprint');
          paris().showTarget = 0.4;
          screen({ title: 'SPRINT · 1,50 M', line1: `${game.save.data.playerName} · ${nm()}`, line2: 'Barème C · grille du Grand Prix' });
        },
        update: () => true,
      }),
      ...sprintSteps,
      S.custom({
        text: 'Classement du Sprint…',
        start(r) {
          const st = r.data.course;
          const me = { rider: game.save.data.playerName, horse: nm(), me: true, rails: railsOf(st), time: Math.round(st.t * 100) / 100 };
          me.score = st.eliminated ? 999 : Math.round((me.time + me.rails * PARIS_GP.sprint.railSeconds) * 100) / 100;
          const ranked = rankSprint([...sprintField(rivals, seed), me]);
          const rank = ranked.indexOf(me) + 1;
          r.data.sprintRank = rank;
          // Grille du Grand Prix : ordre inverse du Sprint (le plus rapide part en dernier).
          r.data.order = PARIS_GP.riders + 1 - rank;
          if (rank === 1) {
            r.payOverride = (r.payOverride || 0) + PARIS_GP.sprintPrize;
            game.audio.cheer();
          }
          const rows = ranked.slice(0, 8);
          if (!rows.includes(me)) rows.push(me);
          r.flags.ok = false;
          game.screens.card({
            kicker: 'Sprint · Grand Prix de Paris Indoor',
            title: st.eliminated ? 'Éliminé du Sprint' : rank === 1 ? 'Vainqueur du Sprint !' : `${ordinal(rank)} du Sprint`,
            html: `<div class="cso-pres"><div class="k">Chrono</div><div class="v">${st.eliminated ? '—' : `${dec(me.time, 2)} s`}</div><div class="k">Barres</div><div class="v">${me.rails} (+${me.rails * PARIS_GP.sprint.railSeconds} s)</div><div class="k">Temps retenu</div><div class="v">${st.eliminated ? 'éliminé' : `${dec(me.score, 2)} s`}</div><div class="k">Grille du Grand Prix</div><div class="v">départ en ${ordinal(r.data.order)} position sur ${PARIS_GP.riders}${rank === 1 ? ' (le dernier : la meilleure place)' : ''}</div></div>${table(ranked.filter((x) => rows.includes(x)), [(x) => `${x.rails} b.`, (x) => (x.score > 900 ? 'élim.' : `${dec(x.score, 2)} s`)], me)}`,
            buttons: [{ label: 'Vers le Grand Prix', primary: true, id: 'sprint-ok', run: () => (r.flags.ok = true) }],
          });
          screen({ title: 'SPRINT · RÉSULTATS', line1: `1. ${ranked[0].rider} · ${dec(ranked[0].score, 2)} s`, line2: `${game.save.data.playerName} : ${ordinal(rank)}` });
        },
        update: (r) => r.flags.ok,
      }),
      // ---------- Soirée : présentation des cavaliers ----------
      S.custom({
        text: 'Présentation des cavaliers…',
        start(r) {
          const d = game.save.data;
          const day = Math.floor(d.gameTime / 86400);
          if (game.hour() < PARIS_GP.gpHour) d.gameTime = day * 86400 + PARIS_GP.gpHour * 3600;
          game.obstacles.showParisCourse('paris_gp');
          game.obstacles.resetRails('paris_gp');
          paris().showTarget = 1;
          paris().cheer = 6;
          game.audio.applause?.(1.2, 5);
          r.data.intro = 0;
          const names = [...rivals.slice(0, 3).map((x) => `${x.rider} · ${x.horse}`), `${d.playerName} · ${nm()}`];
          r.data.names = names;
          game.hud.big('GRAND PRIX DE PARIS INDOOR', '20 h · Présentation des 40 cavaliers', 2600);
        },
        update(r) {
          const k = Math.floor(r.stepT / 1.6);
          if (k !== r.data.intro && k >= 1 && k <= r.data.names.length) {
            r.data.intro = k;
            const n = r.data.names[k - 1];
            screen({ title: 'PRÉSENTATION DES CAVALIERS', line1: n, line2: k === r.data.names.length ? `Départ en ${ordinal(r.data.order)} position` : '' });
            game.hud.big(n.split(' · ')[0].toUpperCase(), n.split(' · ')[1], 1500);
            game.audio.applause?.(0.7, 1.4);
          }
          if (r.stepT > 1.6 * (r.data.names.length + 1)) {
            paris().showTarget = 0.35;
            return true;
          }
          return false;
        },
      }),
      S.dialog(() => {
        const before = gpField(rivals, seed).slice(0, r0(run.data.order - 1));
        const clear = before.filter((x) => x.faults === 0);
        run.data.before = before;
        return [say(`Tu pars en ${ordinal(run.data.order)} position. ${before.length ? `${before.length} couple${before.length > 1 ? 's sont passés' : ' est passé'} : ${clear.length} sans-faute${clear.length > 1 ? 's' : ''} pour le barrage.` : 'Tu ouvres le bal !'} Un sans-faute et tu es au barrage.`)];
      }),
      // ---------- Grand Prix ----------
      S.custom({
        text: '',
        start(r) {
          screen({ title: 'GRAND PRIX · 1,60 M', line1: `${game.save.data.playerName} · ${nm()}`, line2: `Départ n° ${run.data.order} sur ${PARIS_GP.riders}` });
          // Étapes du Grand Prix créées maintenant (le relevé du Sprint reste lu jusque-là dans run.data.course).
          r.steps.splice(r.i + 1, 0, ...gpSteps(false));
        },
        update: () => true,
      }),
      S.custom({
        text: 'Résultats du Grand Prix…',
        start(r) {
          const st = r.data.course;
          const me = { rider: game.save.data.playerName, horse: nm(), me: true, faults: st.eliminated ? 99 : st.faults + st.timeFaults, time: Math.round(st.t * 100) / 100 };
          r.data.gpMe = me;
          const field = gpField(rivals, seed);
          r.data.gpField = field;
          const clear = field.filter((x) => x.faults === 0);
          if (me.faults === 0 && clear.length) {
            // Barrage : on remonte en piste, au chrono.
            r.data.barrage = true;
            game.hud.big('BARRAGE !', `${clear.length + 1} sans-faute · au chrono`, 2600);
            game.audio.cheer();
            screen({ title: 'BARRAGE', line1: `${clear.length + 1} couples sans faute`, line2: 'Le chrono décide' });
            r.steps.splice(r.i + 1, 0, ...gpSteps(true));
          }
        },
        update: () => true,
      }),
      S.custom({
        text: 'Podium…',
        start(r) {
          const me = r.data.gpMe;
          const field = r.data.gpField;
          let ranked;
          if (r.data.barrage) {
            const st = r.data.course;
            me.joFaults = st.eliminated ? 99 : st.faults + st.timeFaults;
            me.joTime = Math.round(st.t * 100) / 100;
            const jo = barrageField(field.filter((x) => x.faults === 0), seed, Math.ceil(PARIS_GP.gp.ta * 0.86));
            const rest = field.filter((x) => x.faults > 0);
            ranked = [...[...jo, me].sort((a, b) => a.joFaults - b.joFaults || a.joTime - b.joTime), ...rest.sort((a, b) => a.faults - b.faults || a.time - b.time)];
          } else ranked = [...field, me].sort((a, b) => a.faults - b.faults || a.time - b.time);
          const rank = ranked.indexOf(me) + 1;
          r.data.final = rank;
          const prize = PARIS_GP.prizes[rank - 1] || 0;
          if (prize) r.payOverride = (r.payOverride || 0) + prize;
          game.reportScore?.('paris-gp', { pen: me.faults, time: me.time, horse: me.horse });
          const top = rank <= 3;
          paris().showTarget = top ? 1 : 0.5;
          paris().cheer = top ? 10 : 3;
          if (top) {
            game.celebrate();
            game.hud.big(rank === 1 ? 'VAINQUEUR DU GRAND PRIX DE PARIS' : `${ordinal(rank)} PLACE · PODIUM`, `${game.save.data.playerName} et ${nm()}`, 3600);
          }
          screen({ title: rank === 1 ? 'VAINQUEUR' : 'GRAND PRIX · CLASSEMENT', line1: `1. ${ranked[0].rider} · ${ranked[0].horse}`, line2: `${game.save.data.playerName} : ${ordinal(rank)}`, big: rank === 1 ? 'PARIS !' : '' });
          const rows = ranked.slice(0, 10);
          if (!rows.includes(me)) rows.push(me);
          r.resultTitle = rank === 1 ? 'Vainqueur du Grand Prix de Paris Indoor !' : `${ordinal(rank)} du Grand Prix de Paris Indoor`;
          r.resultBody = `${r.data.barrage ? `Barrage : ${me.joFaults > 90 ? 'éliminé' : `${me.joFaults} pt en ${dec(me.joTime, 2)} s`} · ` : ''}Manche : ${me.faults > 90 ? 'éliminé' : `${me.faults} pt en ${dec(me.time, 2)} s`} · dotation ${formatMoney(r.payOverride || 0)}`;
          r.flags.ok = false;
          game.screens.card({
            kicker: 'Grand Prix de Paris Indoor · 1,60 m',
            title: rank === 1 ? 'Victoire à Paris !' : rank <= 3 ? `${ordinal(rank)} place : sur le podium !` : `${ordinal(rank)} place`,
            html: `<div class="cso-pres"><div class="k">Grille</div><div class="v">départ en ${ordinal(r.data.order)} position (Sprint : ${ordinal(r.data.sprintRank)})</div><div class="k">Manche</div><div class="v">${me.faults > 90 ? 'éliminé' : `${me.faults} pt · ${dec(me.time, 2)} s`}</div>${r.data.barrage ? `<div class="k">Barrage</div><div class="v">${me.joFaults > 90 ? 'éliminé' : `${me.joFaults} pt · ${dec(me.joTime, 2)} s`}</div>` : ''}<div class="k">Dotation</div><div class="v">${formatMoney(r.payOverride || 0)}</div></div>${table(rows.sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b)), [(x) => (x.joTime !== undefined ? `JO ${x.joFaults} pt ${dec(x.joTime, 2)} s` : x.faults > 90 ? 'élim.' : `${x.faults} pt`), (x) => `${dec(x.time, 2)} s`], me)}`,
            buttons: [{ label: 'Continuer', primary: true, id: 'gpparis-ok', run: () => (r.flags.ok = true) }],
          });
        },
        update: (r) => r.flags.ok,
      }),
    ];
  },
  after(game) {
    game.hud.hint('Pour rentrer : charge ton cheval dans le camion, puis roule jusqu’à l’autoroute A13, à l’ouest du parking.', 9000);
    game.message('Grand Prix de Paris Indoor', 'GP', 'Merci pour ce Grand Prix ! Le parcours reste ouvert : retrouve-le dans l’app Activités, en défi à conditions fixes.');
  },
};
const r0 = (n) => Math.max(0, n);
