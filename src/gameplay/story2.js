// Chapitre 1 « Le Val en équipe » : trois missions à choix (M1 à M3) entre « Premiers pas » et les missions
// existantes. Personnages récurrents : Camille Martin (responsable du Val), Léa Morel (groom expérimentée),
// Maxime Vidal (cavalier rival, Haras de la Pommeraie). Missions, profils et sommes sont fictifs.
import { h, tap } from '../ui/dom.js';
import { HOME, HARAS, POLE, homeBoxes } from '../world/sites.js';
import { POI } from '../world/layout.js';
import { FollowAI } from '../entities/horse.js';
import { courseSteps, COURSE_LENGTH, COURSE_SPEED, timeAllowedFor } from './courses.js';
import { CSO_FINISH, CSO_START } from './obstacles.js';
import { csoHeights } from './csoCourse.js';
import { PARKS, SECRETARIAT, loadStep, unloadStep, driveStep, simulateField, rankResults, secretariatProps } from './trip.js';
import { dec, formatMoney } from '../core/math.js';

export const CAST = {
  camille: { name: 'Camille Martin', initials: 'CM', rating: 4.9, verified: true },
  antoine: { name: 'Antoine Roux', initials: 'AR', rating: 4.9, verified: true },
  lea: { name: 'Léa Morel', initials: 'LM', rating: 4.9, verified: true },
  ines: { name: 'Inès Ferrand', initials: 'IF', rating: 4.8, verified: true },
  maxime: { name: 'Maxime Vidal', initials: 'MV' },
};
const say = (who, text) => ({ who: CAST[who].name, initials: CAST[who].initials, text });

const STAFF = { top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#3a3d42', boots: '#2a2622', skin: '#e2b894', hair: '#5a3a24', logo: true };
const OUTFIT = {
  camille: { ...STAFF, skin: '#eac2a0', hair: '#7a4a28', ponytail: true },
  antoine: STAFF,
  lea: { top: '#2f5a4a', sleeve: '#2f5a4a', pants: '#3a3d42', boots: '#2a2622', skin: '#d9a98a', hair: '#2a1d14', ponytail: true },
  ines: { top: '#7a4a6a', sleeve: '#7a4a6a', pants: '#2b3442', boots: '#2a2622', skin: '#c99a74', hair: '#1d1612', ponytail: true },
  maxime: { top: '#24324a', sleeve: '#24324a', pants: '#f2f1ec', boots: '#121214', skin: '#e2b894', hair: '#c9a46a', helmet: '#16171a' },
};

// Paramètres à équilibrer (voir docs/conception-v2.md §9).
export const CHAPTER1 = {
  m1: { val: { pay: 90, rep: 60 }, haras: { pay: 140, rep: 80 }, tournee: { pay: 90 + 140 + 40, rep: 120, bonus: 40 } },
  m2: { pay: 120, rep: 100, lea: 120, ines: 200 },
  // Temps accordé réglementaire : 350 m/min (prudente) ; l'approche ambitieuse vise 375 m/min.
  m3: { participation: 150, rep: 200, leaHelp: 80, ta: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national), ambitiousCut: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national) - timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.csi), ambitiousBonus: 0.5, prizes: [220, 160, 120, 90, 70] },
  aire: { price: 350 },
};
// Durée d'une préparation regroupée (pansage, pieds, protections) : plus courte avec l'aire de pansage couverte.
export const prepTime = (game) => (game.save.data.upgrades.includes('aire') ? 4 : 6);

const npcAt = (game, run, who, x, z, heading, name) => {
  const p = game.spawnHuman(OUTFIT[who], x, z, heading, { name: name || CAST[who].name.split(' ')[0] });
  run.onCleanup(() => game.despawn(p));
  return p;
};

// Écran de choix (carte modale : la simulation est suspendue tant qu'elle est ouverte).
export function choiceCard(game, { kicker, title, body, options, note }, onPick) {
  const list = h('div.choice-list');
  let ov = null;
  for (const o of options) {
    const b = h(`button.choice${o.disabled ? '.off' : ''}`, { 'data-choice': o.id },
      h('div.c-main', {}, h('div.c-t', { text: o.label }), o.sub ? h('div.c-s', { text: o.sub }) : null),
      o.right ? h('span.c-r', { text: o.right }) : null);
    tap(b, () => {
      if (o.disabled) return game.hud.toast(o.reason || 'Indisponible');
      ov?.remove();
      onPick(o.id);
    });
    list.appendChild(b);
  }
  const extra = [list];
  if (note) extra.push(h('div.irl', { text: note }));
  ov = game.screens.card({ kicker, title, body, extra });
  return ov;
}

// Préparation regroupée d'un cheval (pansage, pieds, protections) : toucher « Préparer », puis quelques secondes.
function prepSteps(game, S, { horse, text, name }) {
  return [
    S.interact(() => horse().pos, 'Préparer', text, { r: 2.8, modes: ['foot'], icon: 'hand' }),
    S.custom({
      text: () => `Préparation de ${name} : pansage, pieds, protections…`,
      start(r) {
        r.data.prep = prepTime(game);
        game.player.locked = true;
        game.audio.click();
      },
      update: (r) => r.stepT >= r.data.prep,
      end() {
        game.player.locked = false;
        const c = horse()?.cond;
        if (c) {
          c.clean = 100;
          c.hooves = 100;
        }
        game.addSkill('preparation', 4);
        game.hud.toast(`${name} est prêt${name === 'Comète' ? 'e' : ''}.`);
      },
    }),
  ];
}

// Cheval de box attaché devant sa porte, le temps d'une mission.
function tiedHorse(game, run, def, x, z, heading) {
  const hh = game.spawnHorse(def, x, z, heading, { saddle: false });
  hh.frozen = true;
  hh.ai = null;
  if (hh.cond) {
    hh.cond.clean = 35;
    hh.cond.hooves = 40;
  }
  run.onCleanup(() => game.despawn(hh));
  return hh;
}

// Reprise : branche enregistrée au point de reprise de la mission (sinon null).
const resumeOf = (game, id) => {
  const cp = game.save.data.checkpoint;
  return cp && cp.mission === id ? cp : null;
};

// ---------- M1 « Deux écuries, une matinée » ----------
const M1 = {
  id: 'm1', story: true, vertical: 'JOBS', category: 'Groom', title: 'Deux écuries, une matinée', level: 1, requires: ['tuto'],
  desc: 'Deux propositions pour ce matin : préparer deux chevaux au Val (Camille) et sortir en main un cheval du Haras (Antoine). L’une, l’autre, ou les deux en tournée.',
  client: { name: 'Camille Martin · Antoine Roux', initials: 'CA', rating: 4.9 },
  place: POI.home, placeName: 'Écurie du Val · Haras de la Pommeraie', pay: 90, payLabel: '90 à 270 €', xp: 60, duration: '~2 à 6 min',
  irl: 'sur Strides, les écuries et cavaliers envoient leurs propositions de missions aux professionnels, libres d’accepter celles qui leur conviennent.',
  rate: () => 5,
  review: (s, run) => ({ val: 'Deux chevaux impeccables, à l’heure. Je note.', haras: 'Sortie calme et sans histoire. Merci !', tournee: 'Deux écuries dans la matinée sans rien bâcler : chapeau.' })[run.data.choice] || 'Merci !',
  steps(game, run, S) {
    const d = game.save.data;
    const cp = resumeOf(game, 'm1');
    const boxes = homeBoxes();
    const valSteps = () => {
      const a = tiedHorse(game, run, { id: 'val-a', name: 'Iris', coat: 'grey', blaze: false }, boxes[2].x, boxes[2].z + 3.2, Math.PI / 2);
      const b = tiedHorse(game, run, { id: 'val-b', name: 'Narval', coat: 'chestnut', blaze: true }, boxes[5].x, boxes[5].z + 3.2, Math.PI / 2);
      const camille = npcAt(game, run, 'camille', -100, 166, Math.PI);
      return [
        S.goto({ x: boxes[3].x, z: boxes[3].z + 6 }, 'Rejoins les boxes de l’Écurie du Val', { r: 7 }),
        S.dialog([say('camille', 'Iris et Narval sortent à 11 h. Pansage complet, pieds curés, protections. Pas de poussière sur Narval : son propriétaire inspecte avec un gant blanc. Je plaisante. À moitié.')]),
        ...prepSteps(game, S, { horse: () => a, text: 'Prépare Iris (devant le box n°3)', name: 'Iris' }),
        ...prepSteps(game, S, { horse: () => b, text: 'Prépare Narval (devant le box n°6)', name: 'Narval' }),
        S.interact(() => camille.pos, 'Parler', 'Préviens Camille', { modes: ['foot', 'ride'], r: 4, icon: 'talk' }),
        S.dialog([say('camille', 'Impeccable. Même les crins sont démêlés… Tu es sûr·e de ne pas vouloir rester ici pour toujours ?')]),
      ];
    };
    const harasSteps = () => {
      const C = HARAS.court;
      const antoine = npcAt(game, run, 'antoine', HARAS.gate.x + 3, HARAS.gate.z - 6, Math.PI);
      const maxime = npcAt(game, run, 'maxime', HARAS.gate.x - 4, HARAS.gate.z - 7, Math.PI * 0.8);
      const bonheur = tiedHorse(game, run, { id: 'bonheur', name: 'Bonheur', coat: 'darkbay', blaze: true, speed: 0.9 }, C.x, C.z + 6, 0);
      const out = { x: -332, z: -196 };
      const follows = () => Math.hypot(bonheur.pos.x - game.player.focus.pos.x, bonheur.pos.z - game.player.focus.pos.z) < 14;
      const slow = () => !follows() && game.player.focus.speed > 6 && game.hud.hint('Doucement : Bonheur doit pouvoir suivre.', 2000);
      return [
        S.goto({ x: HARAS.gate.x, z: HARAS.gate.z - 8 }, 'Rejoins le Haras de la Pommeraie', { r: 9 }),
        S.dialog([
          say('antoine', 'Bonheur se remet d’une petite boiterie : vingt minutes au pas, en main, jusqu’à la lisière du bois et retour. Rien de plus.'),
          say('maxime', 'Une sortie en main ? Moi, je monte trois chevaux avant midi. Chacun son niveau.'),
          say('antoine', 'Maxime, va donc détendre ton gris au lieu de commenter. Bonheur est dans la cour.'),
        ]),
        S.interact(() => bonheur.pos, 'Prendre en main', 'Prends Bonheur en main dans la cour', {
          modes: ['foot', 'ride'], r: 4, icon: 'hand',
          onDo: () => {
            bonheur.frozen = false;
            bonheur.ai = new FollowAI(() => game.player.focus.pos, { stopDist: 3.2, run: false });
            maxime.pose = 'stand';
          },
        }),
        S.custom({
          text: 'Marche avec Bonheur jusqu’à la lisière du bois (il te suit)',
          target: out, radius: 7,
          update: () => (slow(), Math.hypot(game.player.focus.pos.x - out.x, game.player.focus.pos.z - out.z) < 8 && follows()),
        }),
        S.custom({
          text: 'Ramène Bonheur dans la cour du Haras',
          target: { x: C.x, z: C.z + 6 }, radius: 7,
          update() {
            slow();
            const f = game.player.focus.pos;
            if (Math.hypot(f.x - C.x, f.z - (C.z + 6)) < 9 && follows()) {
              bonheur.ai = null;
              bonheur.frozen = true;
              bonheur.setPosition(C.x, C.z + 6, 0);
              return true;
            }
            return false;
          },
        }),
        S.interact(() => antoine.pos, 'Parler', 'Rends compte à Antoine', { modes: ['foot', 'ride'], r: 4, icon: 'talk' }),
        S.dialog([
          say('antoine', 'Il revient détendu, c’est exactement ce qu’il fallait. Au fait : si un jour il te faut un renfort, Léa Morel est une excellente groom. Elle est sur Strides.'),
        ]),
      ];
    };
    const branch = (choice) => {
      run.data.choice = choice;
      d.choices.m1 = choice;
      const p = CHAPTER1.m1[choice];
      run.payOverride = p.pay;
      run.xpOverride = p.rep;
      game.missions.checkpoint(run, 'chosen', { choice });
      if (choice === 'val') return valSteps();
      if (choice === 'haras') return harasSteps();
      return [...valSteps(), S.custom({ text: '', start: () => game.hud.toast('Tournée : direction le Haras de la Pommeraie'), update: () => true }), ...harasSteps()];
    };
    return [
      S.custom({
        text: 'Choisis ta matinée',
        start(r) {
          if (cp?.data?.choice) return (r.flags.choice = cp.data.choice);
          const m = CHAPTER1.m1;
          choiceCard(game, {
            kicker: 'Strides · deux propositions pour ce matin',
            title: 'Deux écuries, une matinée',
            body: 'Choisir l’une revient à refuser l’autre, sans pénalité. La tournée enchaîne les deux (Val puis Haras).',
            options: [
              { id: 'val', label: 'Préparation (Val)', sub: 'Camille Martin · deux chevaux à préparer au box · ~2 min', right: `${m.val.pay} €` },
              { id: 'haras', label: 'Sortie (Haras)', sub: 'Antoine Roux · sortie en main d’un cheval · ~4 min · moins de temps libre pour Comète', right: `${m.haras.pay} €` },
              { id: 'tournee', label: 'Les deux : tournée', sub: `Val puis Haras · ~6 min · bonus tournée ${m.tournee.bonus} €`, right: `${m.tournee.pay} €` },
              { id: 'none', label: 'Refuser les deux', sub: 'Aucune pénalité : elles te seront reproposées plus tard.' },
            ],
            note: 'Missions, clients et montants fictifs.',
          }, (id) => (r.flags.choice = id));
        },
        update(r) {
          const c = r.flags.choice;
          if (!c) return false;
          if (c === 'none') {
            game.missions.decline(r, 'Demandes déclinées, sans pénalité. Elles te seront reproposées.');
            return false;
          }
          r.steps.splice(r.i + 1, 0, ...branch(c));
          return true;
        },
      }),
    ];
  },
  after(game, run) {
    const d = game.save.data;
    const ch = run.data.choice;
    (d.relations.lea ||= { met: false, missions: 0 }).met = true;
    if (ch !== 'tournee') {
      // Mission unique : du temps libre pour une activité personnelle.
      game.hud.notify({
        title: 'Temps libre',
        body: 'Il te reste du temps ce matin : un galop sur la plage avec Comète ?',
        timeout: 10000,
        actions: [{ label: 'Plus tard', run: () => {} }, { label: 'Itinéraire plage', primary: true, run: () => game.gps.set(POI.beach, 'Plage de Deauvelle') }],
      });
    }
    if (ch === 'val') game.message(CAST.camille.name, 'CM', 'Au fait, Antoine m’a parlé d’une groom, Léa Morel, si un jour on manque de bras. Elle est sur Strides.');
  },
};

// ---------- M2 « Un renfort avant le concours » ----------
const M2 = {
  id: 'm2', story: true, vertical: 'JOBS', category: 'Groom', title: 'Un renfort avant le concours', level: 1, requires: ['m1'],
  desc: 'Reconnaître le parcours du Pôle et préparer Comète, alors que l’aide prévue a un empêchement et qu’un cheval arrive en pension. Trouver un renfort sur Strides ou s’organiser seul.',
  client: CAST.camille, place: POI.home, placeName: 'Écurie du Val', pay: CHAPTER1.m2.pay, xp: CHAPTER1.m2.rep, duration: '~5 min',
  irl: 'côté écurie et cavalier, Strides permet de décrire son besoin, de comparer des profils vérifiés (avis, tarifs) et de confirmer ; le paiement est sécurisé et libéré une fois la mission accomplie.',
  rate: () => 5,
  review: (s, run) => (run.data.hire === 'solo' ? 'Tout fait seul·e, et bien fait. Respect.' : 'Bonne décision, et bon choix de renfort.'),
  steps(game, run, S) {
    const d = game.save.data;
    const cp = resumeOf(game, 'm2');
    const m1 = d.choices.m1;
    const camille = npcAt(game, run, 'camille', -100, 166, Math.PI);
    const comete = () => game.mainHorse;
    const open = () => game.phone.open('strides', { tab: 'recruter' });
    const recon = (nums) => {
      const obs = () => game.obstacles.ofCourse('cso').filter((o) => nums.includes(o.num));
      return S.custom({
        text: () => {
          const left = obs().filter((o) => !run.data.seen?.includes(o.num));
          return left.length ? `Reconnais le parcours du Pôle à pied : obstacle n°${left[0].label} (${nums.length - left.length + 1}/${nums.length})` : '';
        },
        target: () => {
          const left = obs().filter((o) => !run.data.seen?.includes(o.num));
          return left.length ? { x: left[0].x, z: left[0].z } : POI.pole;
        },
        radius: 4,
        hint: 'Comme en vrai : on marche le parcours à pied, dans l’ordre des numéros, en suivant la trajectoire et en comptant les foulées.',
        start(r) {
          r.data.seen ||= [];
        },
        update(r) {
          const f = game.player.focus.pos;
          // Dans l'ordre du parcours : seul l'obstacle suivant compte (comme une vraie reconnaissance, numéro après numéro).
          const next = obs().find((o) => !r.data.seen.includes(o.num));
          for (const o of next ? [next] : []) {
            if (game.player.mode !== 'foot') continue;
            if (Math.hypot(f.x - o.x, f.z - o.z) < 4.5) {
              r.data.seen.push(o.num);
              game.audio.tone(990, 0.08, 'sine', 0.08);
              game.hud.toast(`Obstacle n°${o.label} reconnu`);
              r.applyWaypoint();
            }
          }
          if (game.player.mode !== 'foot' && Math.hypot(f.x - POLE.arena.x, f.z - POLE.arena.z) < 60) game.hud.hint('Reconnaissance <b>à pied</b> : descends de cheval.', 2500);
          return nums.every((n) => r.data.seen.includes(n));
        },
      });
    };
    const backHome = S.goto({ x: -104, z: 168 }, 'Rentre à l’Écurie du Val', { r: 9 });
    const hiredSteps = (who) => {
      const p = CAST[who];
      let pro = null;
      let newcomer = null;
      return [
        S.custom({
          text: '',
          start() {
            game.message(p.name, p.initials, who === 'lea'
              ? 'Mission confirmée ! J’arrive au Val dans la demi-heure. Je m’occupe de Comète, file reconnaître ton parcours.'
              : 'C’est confirmé : préparation de Comète et accueil du cheval qui arrive. Je suis là dans une demi-heure.');
          },
          update: () => true,
        }),
        recon([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        backHome,
        S.custom({
          text: '',
          start(r) {
            pro = npcAt(game, run, who, -108, 167, Math.PI / 2);
            const c = comete()?.cond;
            if (c) {
              c.clean = 100;
              c.hooves = 100;
            }
            if (who === 'ines') {
              const b = homeBoxes()[7];
              newcomer = game.spawnHorse({ id: 'pension-new', name: 'Opale', coat: 'palomino' }, b.x, b.z - 1.4, 0, { saddle: false });
              newcomer.frozen = true;
              newcomer.ai = null;
              r.onCleanup(() => game.despawn(newcomer));
            }
            pro.pose = 'wave';
          },
          update: () => true,
        }),
        S.interact(() => pro.pos, 'Parler', `Retrouve ${p.name.split(' ')[0]} devant les boxes`, { modes: ['foot', 'ride'], r: 4, icon: 'talk' }),
        S.dialog(() => [
          who === 'lea'
            ? say('lea', 'Comète est prête : pansée, pieds faits, protections au propre. Elle a un caractère, hein ? On va bien s’entendre.')
            : say('ines', 'Comète est prête, et Opale est installée au box n°8, foin et eau. Elle a fait le voyage sans stress.'),
          say('camille', who === 'ines' ? 'Tout est en ordre. Un peu plus cher, mais je n’ai rien eu à faire. J’adore ne rien avoir à faire.' : 'Parfait. Le cheval qui arrive, je m’en charge. Bon choix.'),
        ]),
        S.custom({
          text: '',
          start(r) {
            d.hired.m2 = who;
            const rel = (d.relations[who] ||= { met: true, missions: 0 });
            rel.met = true;
            rel.missions++;
            game.metrics.track('first_hire_completed', { mission: 'm2', mode: who });
            game.addSkill('organisation', 5);
            r.data.hire = who;
          },
          update: () => true,
        }),
      ];
    };
    const soloSteps = () => {
      let newcomer = null;
      let driver = null;
      const park = { x: HOME.truck.x - 4, z: HOME.truck.z + 9 };
      return [
        ...prepSteps(game, S, { horse: comete, text: 'Préparation rapide de Comète (pansage, pieds)', name: 'Comète' }),
        recon([1, 2, 3, 4, 5]),
        backHome,
        S.custom({
          text: '',
          start(r) {
            newcomer = game.spawnHorse({ id: 'pension-new', name: 'Opale', coat: 'palomino' }, park.x, park.z, Math.PI / 2, { saddle: false });
            newcomer.frozen = true;
            newcomer.ai = null;
            r.onCleanup(() => game.despawn(newcomer));
            driver = game.spawnHuman(STAFF, park.x + 1.6, park.z + 1.2, Math.PI / 2, { name: 'Transporteur' });
            r.onCleanup(() => game.despawn(driver));
          },
          update: () => true,
        }),
        S.interact(() => newcomer.pos, 'Accueillir', 'Accueille Opale, la nouvelle pensionnaire (près du camion)', { r: 3.4, modes: ['foot'], icon: 'hand' }),
        S.custom({
          text: 'Installe Opale au box n°8',
          start() {
            game.fade(() => {
              const b = homeBoxes()[7];
              newcomer.setPosition(b.x, b.z - 1.4, 0);
            }, 0.6);
          },
          update: (r) => r.stepT > 1.4,
        }),
        S.dialog([say('camille', 'Reconnaissance express, préparation express, accueil express. Tu as un frère jumeau caché ? Bon travail, vraiment.')]),
        S.custom({
          text: '',
          start(r) {
            d.hired.m2 = 'solo';
            game.addSkill('organisation', 3);
            r.data.hire = 'solo';
          },
          update: () => true,
        }),
      ];
    };
    const decide = (r, choice) => {
      r.data.hire = choice;
      d.choices.m2 = choice;
      game.missions.hirePicker = null;
      game.missions.checkpoint(run, 'hired', { hire: choice });
      r.steps.splice(r.i + 1, 0, ...(choice === 'solo' ? soloSteps() : hiredSteps(choice)));
    };
    return [
      S.dialog(() => [
        say('camille', m1 === 'tournee' ? 'Tu as assuré la tournée l’autre matin, alors je te confie le gros morceau.' : m1 === 'haras' ? 'Antoine m’a dit du bien de ta sortie. Aujourd’hui, j’ai besoin de toi ici.' : 'Tes préparations étaient nickel. On passe à la vitesse supérieure.'),
        say('camille', 'Le concours du Pôle approche : il faut reconnaître le parcours à pied et préparer Comète. Sauf que mon aide a un empêchement… et qu’un cheval arrive en pension cet après-midi.'),
        say('camille', 'Cherche un renfort dans Strides, côté client cette fois : « Recruter ». Ou organise-toi seul·e. C’est toi qui vois, c’est ton budget.'),
      ]),
      S.custom({
        text: 'Ouvre Strides › Recruter : trouve un renfort, ou organise-toi seul·e',
        hint: 'Téléphone → <b>Strides</b> → <b>Recruter</b>.',
        hintMs: 8000,
        start(r) {
          if (cp?.data?.hire) return decide(r, cp.data.hire), (r.flags.done = true);
          game.missions.hirePicker = {
            mission: 'm2',
            need: 'Groom · aujourd’hui · Écurie du Val — préparation de Comète pour le concours (et accueil d’un cheval qui arrive en pension).',
            profiles: [
              { id: 'lea', ...CAST.lea, job: 'Groom maison et concours', reviews: 37, offer: 'Préparation de Comète', price: CHAPTER1.m2.lea, avail: 'Disponible maintenant', bio: 'Huit ans de concours, du club au CSI. Directe, rapide, toujours joignable.' },
              { id: 'ines', ...CAST.ines, job: 'Groom freelance', reviews: 22, offer: 'Préparation de Comète + accueil du cheval arrivant', price: CHAPTER1.m2.ines, avail: 'Disponible cet après-midi', bio: 'Groom indépendante, spécialiste des arrivées et des chevaux stressés.' },
            ],
            onConfirm: (p) => {
              decide(r, p.id);
              r.flags.done = true;
            },
            onSolo: () => {
              decide(r, 'solo');
              r.flags.done = true;
            },
          };
          r.onCleanup(() => (game.missions.hirePicker = null));
          game.hud.notify({
            app: 'STRIDES', title: 'Recruter un professionnel', body: 'Décris ton besoin et compare deux profils, ou organise-toi seul·e.', timeout: 9000,
            actions: [{ label: 'Plus tard', run: () => {} }, { label: 'Ouvrir Strides', primary: true, run: open }],
          });
        },
        update: (r) => !!r.flags.done,
      }),
    ];
  },
  after(game, run) {
    if (run.data.hire && run.data.hire !== 'solo') game.message(CAST.lea.name, 'LM', run.data.hire === 'lea' ? 'Merci pour la mission ! Si tu as besoin de moi au concours, je suis dans le coin.' : 'Inès m’a dit que tout s’était bien passé au Val. Si tu as besoin de moi au concours, fais signe !');
    else game.message(CAST.lea.name, 'LM', 'Salut ! Antoine m’a parlé de toi. Si tu cherches un coup de main au concours, je serai sur place.');
  },
};

// ---------- M3 « Le premier concours en équipe » ----------
const AMATEUR = { id: 'm3', name: 'Amateur', h: 1.1, heights: csoHeights(1.1) };
const MAXIME = { rider: 'M. Vidal', horse: 'Ubris de Mai', faults: 4 };
const ordinal = (n) => (n === 1 ? '1re' : `${n}e`);

const M3 = {
  id: 'm3', story: true, vertical: 'JOBS', category: 'CSO', title: 'Le premier concours en équipe', level: 1, requires: ['m2'],
  desc: 'Le Val engage Comète au concours local du Pôle (Amateur, 1,10 m). Préparer, embarquer, conduire, débarquer, concourir, puis retrouver l’équipe : la participation compte plus que le classement.',
  client: CAST.camille, place: POI.home, placeName: 'Écurie du Val → Pôle International', pay: CHAPTER1.m3.participation, payLabel: `${CHAPTER1.m3.participation} € + dotation`, xp: CHAPTER1.m3.rep, duration: '~10 min',
  irl: '« Besoin d’un chauffeur pour partir en concours ? » Sur Strides, on trouve aussi des grooms de concours et des chauffeurs pour les sorties en compétition.',
  rate: (run) => (run.data.eliminated ? 3 : run.data.rank <= 3 ? 5 : 4),
  review: (s, run) => (run.data.eliminated ? 'Un premier concours, ça forme. On revient plus fort·es.' : run.data.rank <= 3 ? 'Sur le podium pour un premier concours ! Le Val est fier.' : 'Belle première sortie en équipe. On recommence vite.'),
  steps(game, run, S) {
    const d = game.save.data;
    const cp = resumeOf(game, 'm3');
    const st = (run.data.m3 = { ...(cp?.data || {}) });
    const order = ['start', 'chosen', 'prepared', 'loaded', 'arrived', 'unloaded', 'result'];
    const at = order.indexOf(cp?.step || 'start');
    const mark = (step, data = {}) => {
      Object.assign(st, data);
      game.missions.checkpoint(run, step, { ...st });
    };
    const main = () => game.mainHorse;
    const nm = () => game.mainHorse?.name || 'Comète';
    const P = () => game.player;
    const cfg = CHAPTER1.m3;
    const ta = () => cfg.ta - (st.approach === 'ambitieuse' ? cfg.ambitiousCut : 0);
    let lea = null, camille = null, maxime = null, official = null;
    const leaAt = (x, z, heading) => {
      if (!st.help) return;
      if (lea) game.despawn(lea);
      lea = game.spawnHuman(OUTFIT.lea, x, z, heading, { name: 'Léa' });
      run.onCleanup(() => game.despawn(lea));
    };

    const choose = S.custom({
      text: 'Organise ton concours',
      start(r) {
        const pickHelp = () => {
          const known = d.relations.lea?.met;
          const paid = !!d.rewards['hire:m3-lea'];
          const afford = paid || d.money >= cfg.leaHelp;
          choiceCard(game, {
            kicker: 'Organisation · aide sur place',
            title: 'Léa au concours ?',
            body: `${known ? 'Léa Morel' : 'Une groom, Léa Morel,'} peut t’aider sur place : préparation de Comète au Val et présence au paddock. Débit à la confirmation, une seule fois.`,
            options: [
              { id: 'lea', label: paid ? 'Avec Léa (déjà réglé)' : 'Avec Léa', sub: afford ? 'Préparation faite pour toi, soutien au paddock' : 'Solde insuffisant : tu peux y aller sans aide.', right: `${cfg.leaHelp} €`, disabled: !afford, reason: 'Solde insuffisant : choisis « Sans aide ».' },
              { id: 'solo', label: 'Sans aide', sub: 'Tu prépares Comète toi-même', right: '0 €' },
            ],
            note: 'Profil et somme fictifs — aucun paiement réel.',
          }, (id) => {
            if (id === 'lea') {
              const res = game.hire('hire:m3-lea', cfg.leaHelp);
              if (res !== 'ok' && res !== 'already') {
                game.hud.toast(res === 'funds' ? 'Solde insuffisant : rien n’a été débité.' : 'Échec technique : rien n’a été débité. Réessaie.');
                return pickHelp();
              }
              if (res === 'ok') game.hud.toast(`Léa réservée : ${cfg.leaHelp} € débités`, 'money');
            }
            st.help = id === 'lea';
            r.flags.ok = true;
          });
        };
        choiceCard(game, {
          kicker: 'Concours du Pôle · Amateur 1,10 m',
          title: 'Quelle approche ?',
          body: 'Barème A au chrono : pénalités d’abord, puis le temps. Terminer le concours suffit pour avancer ; le classement n’apporte que la dotation.',
          options: [
            { id: 'prudente', label: 'Prudente', sub: `Temps accordé ${cfg.ta} s · dotation normale` },
            { id: 'ambitieuse', label: 'Ambitieuse', sub: `Temps accordé ${cfg.ta - cfg.ambitiousCut} s · dotation +${Math.round(cfg.ambitiousBonus * 100)} %` },
          ],
        }, (id) => {
          st.approach = id;
          pickHelp();
        });
      },
      update: (r) => !!r.flags.ok,
      end: () => {
        d.choices.m3 = { approach: st.approach, help: !!st.help };
        mark('chosen');
      },
    });

    // Préparation selon le choix (connu seulement après l'écran de choix, ou repris du point de reprise).
    const prepareSteps = () => (st.help
      ? [
          S.custom({ text: '', start: () => leaAt(main().pos.x + 1.6, main().pos.z + 1.2, -Math.PI / 2), update: () => true }),
          S.interact(() => lea?.pos || main().pos, 'Parler', 'Retrouve Léa près de Comète', { modes: ['foot', 'ride'], r: 4, icon: 'talk' }),
          S.dialog([say('lea', 'Je m’occupe de Comète : pansage, pieds, protections de transport. Toi, va ouvrir le camion.')]),
          S.custom({
            text: 'Léa prépare Comète…',
            update: (r) => r.stepT > prepTime(game) / 2,
            end() {
              const c = main()?.cond;
              if (c) {
                c.clean = 100;
                c.hooves = 100;
              }
              if (!(d.relations.lea ||= { met: true, missions: 0 }).helpedM3) {
                d.relations.lea.helpedM3 = true;
                d.relations.lea.missions++;
                game.metrics.track('first_hire_completed', { mission: 'm3', mode: 'lea' });
              }
            },
          }),
        ]
      : prepSteps(game, S, { horse: main, text: 'Prépare Comète pour le concours', name: 'Comète' }));
    const prepare = [S.custom({ text: '', start: (r) => r.steps.splice(r.i + 1, 0, ...prepareSteps()), update: () => true })];

    const attempt = () => {
      const steps = courseSteps(game, run, S, {
        courseId: 'cso',
        start: { x: CSO_START.x, z: CSO_START.z },
        finish: CSO_FINISH,
        timeAllowed: ta(),
        maxRefusals: 2,
        heights: AMATEUR.heights,
        soft: true,
        intro: () => [{ who: 'Jury · Pôle International', initials: 'PI', text: `Concurrent n° ${st.bib}, ${d.playerName} et ${nm()}, pour l’Écurie du Val. Barème A au chrono, temps accordé ${ta()} s. Barre tombée ou premier refus : 4 points ; deuxième refus : élimination.` }],
      });
      return [
        S.custom({
          text: () => (P().mode === 'ride' && P().horse === main() ? '' : `Monte ${nm()}`),
          target: () => main()?.pos,
          radius: 3,
          beacon: false,
          update: () => P().mode === 'ride' && P().horse === main(),
        }),
        ...steps,
        S.custom({
          text: 'Résultats officiels…',
          start(r) {
            const c = r.data.course;
            const out = !!c.eliminated;
            st.attempts = (st.attempts || 0) + 1;
            const cls = { ...AMATEUR, ta: ta() };
            const me = { rider: d.playerName, horse: nm(), faults: c.faults + c.timeFaults, time: Math.round(c.t * 100) / 100, me: true };
            const field = simulateField(cls, 977 + st.attempts * 31, 11);
            const mx = { ...MAXIME, time: Math.round((ta() - 5.3) * 100) / 100, rival: true };
            const ranked = rankResults(out ? [...field, mx] : [...field, mx, me]);
            const rank = out ? null : ranked.indexOf(me) + 1;
            const mxRank = ranked.indexOf(mx) + 1;
            const base = cfg.prizes[(rank || 99) - 1] || 0;
            const prize = Math.round(base * (st.approach === 'ambitieuse' ? 1 + cfg.ambitiousBonus : 1));
            Object.assign(r.data, { eliminated: out, rank, mxRank, prize });
            r.payOverride = cfg.participation + prize;
            r.resultTitle = out ? 'Premier concours terminé' : rank === 1 ? 'Victoire au premier concours !' : `${ordinal(rank)} place — premier concours`;
            r.resultBody = out
              ? `${c.eliminated} Participation ${formatMoney(cfg.participation)}.`
              : `${me.faults} pt${me.faults > 1 ? 's' : ''} en ${dec(me.time, 2)} s · ${ordinal(rank)} sur ${ranked.length} · participation ${formatMoney(cfg.participation)}${prize ? ` + dotation ${formatMoney(prize)}` : ''}`;
            r.flags.next = null;
            const rows = ranked.slice(0, 6);
            if (!out && !rows.includes(me)) rows.push(me);
            if (!rows.includes(mx)) rows.push(mx);
            const html = `<table class="res-table">${rows.map((x) => `<tr class="${x.me ? 'me' : x.rival ? 'rival' : ''}"><td>${ranked.indexOf(x) + 1}</td><td>${x.rider} · ${x.horse}</td><td>${x.faults} pts</td><td>${dec(x.time, 2)} s</td></tr>`).join('')}</table>`;
            game.screens.card({
              kicker: `Résultats · ${AMATEUR.name} ${dec(AMATEUR.h, 2)} m · temps accordé ${ta()} s`,
              title: out ? 'Éliminé·e' : rank === 1 ? 'Victoire !' : `${ordinal(rank)} place`,
              body: out ? `${c.eliminated} Ce n’est pas grave : la participation est acquise.` : `Barème A au chrono · ${ranked.length} partants. Dotation ${prize ? formatMoney(prize) : 'non classée'}.`,
              html,
              buttons: out
                ? [{ label: 'Nouvelle tentative', id: 'retry-course', run: () => (r.flags.next = 'retry') }, { label: 'Retrouver l’équipe', primary: true, id: 'results', run: () => (r.flags.next = 'team') }]
                : [{ label: 'Retrouver l’équipe', primary: true, id: 'results', run: () => (r.flags.next = 'team') }],
            });
          },
          update(r) {
            if (!r.flags.next) return false;
            if (r.flags.next === 'retry') r.steps.splice(r.i + 1, 0, ...attempt());
            else mark('result', { eliminated: r.data.eliminated, rank: r.data.rank, mxRank: r.data.mxRank, prize: r.data.prize, pay: r.payOverride });
            return true;
          },
        }),
      ];
    };

    const compete = [
      S.custom({
        text: '',
        start(r) {
          st.bib ||= 40 + Math.floor(Math.random() * 50);
          r.onCleanup(secretariatProps(game));
          official = game.spawnHuman({ top: '#f2f1ec', sleeve: '#f2f1ec', pants: '#1b1c1f', boots: '#121214', skin: '#c99a74', hair: '#2a1d14' }, SECRETARIAT.x - 0.2, SECRETARIAT.z - 0.9, 0.15, { name: 'Secrétariat' });
          r.onCleanup(() => game.despawn(official));
          leaAt(PARKS.pole.x - 6, PARKS.pole.z - 5, Math.PI / 2);
          maxime = game.spawnHuman(OUTFIT.maxime, POLE.warmup.x + 22, POLE.warmup.z - 20, 0, { name: 'Maxime' });
          r.onCleanup(() => game.despawn(maxime));
        },
        update: () => true,
      }),
      S.interact(() => official.pos, 'Retirer le dossard', 'Secrétariat — retire ton dossard', { modes: ['foot', 'ride'], r: 3.6, icon: 'talk', onDo: () => (official.pose = 'wave') }),
      S.dialog(() => [
        { who: 'Secrétariat du concours', initials: 'SC', text: `Écurie du Val, ${nm()}, épreuve Amateur 1,10 m : dossard n° ${st.bib}. Paddock d’échauffement à l’ouest de la carrière.` },
        st.help ? say('lea', 'Je reste au paddock avec toi. Deux sauts pour la mettre en jambes, pas plus.') : say('camille', '(message) Pense à respirer. Et à sauter les obstacles dans l’ordre. Surtout le deuxième point.'),
        say('maxime', 'Tiens, la groom du Val en piste ? Ça va être instructif. Pour toi.'),
      ]),
      S.custom({
        text: () => (P().mode === 'ride' && P().horse === main() ? `Échauffe-toi au paddock : sauts ${Math.min(2, run.data.warm || 0)}/2` : `Monte ${nm()} pour t’échauffer`),
        target: { x: POLE.warmup.x + 12, z: POLE.warmup.z },
        radius: 6,
        beacon: false,
        hint: 'Saute les deux obstacles du paddock d’échauffement.',
        start(r) {
          r.data.warm = 0;
          const on = ({ obstacle }) => obstacle.course === 'warmup' && r.data.warm++;
          r.onCleanup(game.bus.on('obstacle:clear', on));
          r.onCleanup(game.bus.on('obstacle:fault', on));
        },
        update: (r) => r.data.warm >= 2,
      }),
      ...attempt(),
    ];

    const team = [
      S.custom({
        text: '',
        start() {
          camille = game.spawnHuman(OUTFIT.camille, PARKS.pole.x - 8, PARKS.pole.z - 2, Math.PI / 2, { name: 'Camille' });
          run.onCleanup(() => game.despawn(camille));
          leaAt(PARKS.pole.x - 8, PARKS.pole.z - 4.4, Math.PI / 2);
          if (!maxime) {
            maxime = game.spawnHuman(OUTFIT.maxime, PARKS.pole.x - 14, PARKS.pole.z + 3, Math.PI, { name: 'Maxime' });
            run.onCleanup(() => game.despawn(maxime));
          }
          if (run.payOverride === undefined && st.pay) run.payOverride = st.pay;
          if (run.data.eliminated === undefined) Object.assign(run.data, { eliminated: st.eliminated, rank: st.rank, mxRank: st.mxRank, prize: st.prize });
        },
        update: () => true,
      }),
      S.interact(() => camille.pos, 'Parler', 'Retrouve l’équipe du Val au parking des camions', { modes: ['foot', 'ride'], r: 4, icon: 'talk' }),
      S.dialog(() => {
        const r = run.data;
        const beatMax = !r.eliminated && r.rank < r.mxRank;
        return [
          say('maxime', beatMax ? 'Pas mal… pour une première. Profite, ça ne durera pas.' : r.eliminated ? 'Le Pôle, c’est pas une carrière de club. Reviens quand tu seras prêt·e.' : 'Faudra t’accrocher pour me suivre. Mais c’était propre.'),
          say('camille', r.eliminated ? 'Éliminé·e, et alors ? Tu as tout fait : préparer, embarquer, conduire, débarquer, entrer en piste. Le reste, c’est de l’entraînement.' : r.rank <= 3 ? 'Sur le podium à ton premier concours. Je vais devoir augmenter mes exigences. Ça va être terrible pour toi.' : 'Premier concours bouclé, cheval content, camion entier. C’est exactement ce que je voulais.'),
          ...(st.help ? [say('lea', 'Comète a été top au paddock. On refait équipe quand tu veux.')] : []),
          say('camille', 'Bilan du chapitre : avec tes premiers gains, on peut s’offrir une aire de pansage couverte au Val. Regarde dans « Mon écurie ». Et de nouvelles missions t’attendent.'),
        ];
      }),
      S.custom({
        text: '',
        start() {
          d.flags.chapter1Done = true;
          game.addSkill('organisation', 6);
        },
        update: () => true,
      }),
    ];

    const transport = [
      ...(at <= order.indexOf('prepared') ? [loadStep(game, S, { horse: main, name: nm() }), S.custom({ text: '', start: () => mark('loaded'), update: () => true })] : []),
      ...(at <= order.indexOf('loaded') ? [
        loadStep(game, S, { horse: main, name: nm() }),
        driveStep(game, S, { to: PARKS.pole, text: 'Roule jusqu’au Pôle International — parking des camions', comfort: true }),
        S.custom({ text: '', start: () => mark('arrived'), update: () => true }),
      ] : []),
      ...(at <= order.indexOf('arrived') ? [unloadStep(game, S, { horse: main, name: nm() }), S.custom({ text: '', start: () => mark('unloaded'), update: () => true })] : []),
    ];
    const intro = S.dialog(() => [
      say('camille', 'Grand jour : le Val engage Comète au concours local du Pôle, Amateur 1,10 m. Ton premier concours avec l’équipe.'),
      say('camille', d.hired.m2 === 'lea' || d.hired.m2 === 'ines' ? 'Léa propose de venir aider sur place. À toi de voir selon ton budget.' : 'Léa Morel, la groom dont Antoine parlait, peut venir aider sur place. À toi de voir selon ton budget.'),
    ]);

    if (at >= order.indexOf('result')) return team;
    const steps = [];
    if (at < order.indexOf('chosen')) steps.push(intro, choose);
    if (at < order.indexOf('prepared')) steps.push(...prepare, S.custom({ text: '', start: () => mark('prepared'), update: () => true }));
    steps.push(...transport, ...compete, ...team);
    if (cp && at > 0) game.hud.toast('Reprise de la mission au dernier point enregistré.');
    return steps;
  },
  after(game) {
    game.message(CAST.camille.name, 'CM', `L’aire de pansage couverte est disponible dans « Mon écurie » (${CHAPTER1.aire.price} €). Pour rentrer : Comète en main jusqu’au camion, « Faire monter le cheval », puis cap sur le Val.`);
    game.inviteStrides('bilan');
  },
};

export const CHAPTER1_MISSIONS = [M1, M2, M3];
export { formatMoney };
