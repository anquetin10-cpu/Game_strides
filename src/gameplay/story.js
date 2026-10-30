// Missions de l'histoire : de groom à vainqueur du Grand Prix. Les textes « Dans la vraie vie » ne décrivent que ce
// que propose réellement l'application Strides (mise en relation avec des professionnels du cheval).
import { HOME, HARAS, POLE, DUNES, GATIEN, TOWN, homeBoxes, HIPPO_SITE, SHOPS3D } from '../world/sites.js';
import { shopAnchor } from '../world/shopInteriors.js';
import { HOME_BOX } from './stabling.js';
import { POI, HIPPO } from '../world/layout.js';
import { courseSteps, totalPenalties, checkpointSteps, beachRingPoints, pathLength, raceSteps, COURSE_LENGTH, COURSE_SPEED, timeAllowedFor } from './courses.js';
import { CSO_FINISH, CSO_START } from './obstacles.js';
import { csoHeights } from './csoCourse.js';
import { GrazeAI, FollowAI, FleeAI } from '../entities/horse.js';
import { HORSES } from './data.js';
import { formatMoney, dec } from '../core/math.js';
import { PARKS, loadStep, unloadStep, driveStep } from './trip.js';
import { CHAPTER1_MISSIONS } from './story2.js';
import { PARIS_MISSION } from './parisGP.js';
import { t, T } from '../core/i18n.js';

const C = {
  camille: { name: 'Camille Martin', initials: 'CM', rating: 4.9, verified: true },
  margaux: { name: 'Margaux Leroy', initials: 'ML', rating: 4.8, verified: true },
  antoine: { name: 'Antoine Roux', initials: 'AR', rating: 4.9, verified: true },
  helene: { name: 'Hélène Duval', initials: 'HD', rating: 4.7, verified: true },
  paul: { name: 'Paul Faure', initials: 'PF', rating: 4.8, verified: true },
  chloe: { name: 'Chloé Mercier', initials: 'CM', rating: 4.6, verified: true },
  victor: { name: 'Victor Girard', initials: 'VG', rating: 4.8, verified: true },
  julie: { name: 'Julie Bonnet', initials: 'JB', rating: 5.0, verified: true },
  hugo: { name: 'Hugo Lemaire', initials: 'HL', rating: 4.9, verified: true },
};

const byTime = (t, five, four, three) => (t < five ? 5 : t < four ? 4 : t < three ? 3 : 2);
const npcAt = (game, run, outfit, x, z, heading, name) => {
  const h = game.spawnHuman(outfit, x, z, heading, { name });
  run.onCleanup(() => game.despawn(h));
  return h;
};
const STAFF = { top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#3a3d42', boots: '#2a2622', skin: '#e2b894', hair: '#5a3a24', logo: true };
const STAFF_F = { ...STAFF, skin: '#eac2a0', hair: '#7a4a28', ponytail: true };
const OFFICIAL = { top: '#f2f1ec', sleeve: '#f2f1ec', pants: '#1b1c1f', boots: '#121214', skin: '#c99a74', hair: '#2a1d14' };

// Compétitions : le jeu les met en scène, mais Strides ne gère ni engagements ni résultats (vérifié sur la page officielle).
const EVENT_IRL = t('les concours se gèrent hors de Strides ; sur Strides, on recrute en revanche les grooms de concours, chauffeurs et agents de concours qui les rendent possibles.');

export const STORY = [
  // 0 — Tutoriel : une mission courte qui montre seulement la boucle du jeu (demande reçue sur Strides → acceptée →
  // réalisée → payée et notée) et les gestes de base (monter, avancer, diriger). Le saut s'apprend plus tard, à
  // l'échauffement du premier concours (M3).
  {
    id: 'tuto', story: true, vertical: 'JOBS', category: 'Prise en main', title: t('Premiers pas'), level: 1,
    desc: t('Sors Comète de son box, fais un petit tour de carrière et reviens voir Camille.'),
    client: C.camille, place: POI.home, placeName: 'Écurie du Val', pay: 50, xp: 60, duration: '~2 min',
    irl: t('sur Strides, les écuries et cavaliers envoient des propositions de missions aux professionnels, qui acceptent celles qui leur conviennent — comme tu viens de le faire.'),
    review: () => t('Bienvenue dans l’équipe ! Belle prise en main.'),
    // Comète attend dans son box : on va la chercher, on la sort en main de l'écurie, puis on monte.
    keepInBox: true,
    setup(game) {
      const h = game.mainHorse;
      if (h && !h.inBox && !h.rider && !h.hiddenInTruck) game.stabling?.putIn(h, true);
    },
    steps(game, run, S) {
      const camille = npcAt(game, run, STAFF_F, -100, 166, Math.PI, 'Camille');
      const A = HOME.arena;
      const B = HOME.barn;
      const horse = () => game.mainHorse;
      // Sortie de l'allée par le pignon ouest, à deux pas du box de Comète (bout ouest de l'allée).
      const out = { x: B.x - B.w / 2 - 6, z: B.z };
      // Petit tour de carrière à l'écart des deux obstacles posés au milieu : entrée par la porte (5 m de large), piste
      // de gauche, puis retour par l'allée centrale, dans l'axe de la porte pour ressortir sans buter dans la lice.
      const tour = [[A.x, A.z - 7.5], [A.x - 16, A.z - 5], [A.x - 16, A.z + 6], [A.x - 4, A.z + 7], [A.x, A.z - 3]];
      return [
        S.dialog([
          { who: 'Camille Martin', initials: 'CM', text: T`Salut ${game.save.data.playerName} ! Bienvenue à l’Écurie du Val. Ta première mission est simple : un petit tour avec Comète.` },
          { who: 'Camille Martin', initials: 'CM', text: t('Elle est dans son box, tout au bout de l’allée de l’écurie. Va la chercher, sors-la, puis monte en selle dehors.') },
        ]),
        S.custom({
          text: t('Va chercher Comète dans son box (bout de l’allée)'),
          target: HOME_BOX.door,
          radius: 2.6,
          hint: t('Joystick gauche : marcher · glisse à droite : tourner la caméra. Devant la porte du box : <b>ACTION</b>.'),
          hintMs: 9000,
          update: () => !horse()?.inBox,
          end() {
            // Elle sort au licol et suit le joueur en main.
            const h = horse();
            if (h && game.player.mode === 'foot') game.player.transport?.lead(h);
          },
        }),
        S.goto(out, t('Sors de l’écurie avec Comète (elle te suit en main)'), { r: 3, hint: t('Comète marche à ton pas, à ta droite.'), hintMs: 6000 }),
        S.custom({
          text: t('Monte sur Comète'),
          target: () => horse().pos,
          radius: 3,
          beacon: false,
          hint: t('Près de Comète : <b>ACTION</b> pour monter en selle.'),
          hintMs: 7000,
          update: () => game.player.mode === 'ride',
        }),
        S.goto({ x: A.x, z: A.z - 13 }, t('Suis la balise jusqu’à la carrière'), { r: 5, mode: 'ride', hint: t('Un peu de joystick = <b>pas</b>, plus = <b>trot</b>. La balise et le GPS montrent toujours où aller.'), hintMs: 9000 }),
        checkpointSteps(game, run, S, tour, { text: t('Fais le tour de la carrière dans les anneaux'), r: 4.5 }),
        S.interact(() => camille.pos, t('Parler'), t('Reviens voir Camille devant les boxes'), { modes: ['foot', 'ride'], r: 4, icon: 'talk' }),
        S.dialog([
          { who: 'Camille Martin', initials: 'CM', text: t('Parfait, tu as la main ! Voilà comment ça marche ici : les demandes arrivent sur ton téléphone, dans Strides.') },
          { who: 'Camille Martin', initials: 'CM', text: t('Tu acceptes, tu réalises la mission, tu es payé et noté. Avis après avis, ta réputation grandit. Garde ton téléphone à l’œil !') },
        ]),
      ];
    },
  },

  // Chapitre 1 (M1 à M3) : voir story2.js.
  ...CHAPTER1_MISSIONS,

  // 1 — Groom du matin
  {
    id: 'groom', story: true, vertical: 'JOBS', category: 'Groom', title: t('Groom du matin'), level: 1, requires: ['m3'],
    desc: t('Distribuer le foin à quatre chevaux avant la reprise de 10 h.'),
    client: C.camille, place: POI.home, placeName: 'Écurie du Val', pay: 90, xp: 120, duration: '~2 min',
    irl: t('les écuries trouvent un groom maison ou un palefrenier au profil vérifié, avec des disponibilités à la journée ou à la demi-journée.'),
    review: (s) => (s >= 5 ? t('Rapide et soigneux. Je recommande !') : s >= 4 ? t('Efficace, les chevaux étaient ravis.') : t('Le travail est fait, merci.')),
    rate: (run) => byTime(run.t, 80, 105, 130),
    steps(game, run, S) {
      const boxes = homeBoxes();
      const targets = [boxes[1], boxes[3], boxes[4], boxes[6]];
      const hay = { x: HOME.hay.x - HOME.hay.w / 2 + 5.6, z: HOME.hay.z };
      // Dans leur box, la tête passée par-dessus la porte : poitrail et antérieurs restent derrière le mur de façade
      // (bâtiment plein, façade 0,5 m devant la ligne des boxes).
      const horses = targets.map((b, i) => {
        const hh = game.spawnHorse({ id: `box${i}`, coat: ['grey', 'chestnut', 'black', 'palomino'][i], blaze: i % 2 === 0 }, b.x, b.z - 1.4, 0, { saddle: false });
        hh.frozen = true;
        hh.ai = null;
        run.onCleanup(() => game.despawn(hh));
        return hh;
      });
      const steps = [
        S.dialog([{ who: 'Camille Martin', initials: 'CM', text: t('Quatre chevaux attendent leur foin. La réserve est dans la grange, à l’ouest. Chrono !') }]),
        S.custom({ text: '', start: (r) => (r.timer = 150), update: () => true }),
      ];
      targets.forEach((b, i) => {
        steps.push(
          S.interact(hay, t('Prendre du foin'), T`Prends une botte de foin (${i + 1}/4)`, { r: 3.4, onDo: () => game.player.human.carry('hay') })
        );
        steps.push(
          S.interact({ x: b.x, z: b.z + 1.2 }, t('Donner le foin'), T`Apporte le foin au box n°${[2, 4, 5, 7][i]}`, {
            r: 2.8,
            onDo: () => {
              game.player.human.drop();
              game.audio.snort();
              horses[i].anim.graze = 0.6;
              game.hud.toast(T`Box ${[2, 4, 5, 7][i]} servi ✓`);
            },
          })
        );
      });
      run.onCleanup(() => game.player.human.drop());
      return steps;
    },
  },

  // 2 — Coursier : selle sur-mesure
  {
    id: 'livraison', story: true, vertical: 'JOBS', category: 'Coursier', title: t('Selle sur-mesure'), level: 1, requires: ['groom'],
    desc: t('Récupérer une selle à la Sellerie du Port et la livrer au Pôle International avant l’épreuve.'),
    client: C.margaux, place: POI.sellerie, placeName: 'Sellerie du Port', pay: 120, xp: 150, duration: '~3 min',
    irl: t('une selle à livrer n’est pas une mission Strides : la plateforme concerne les métiers du cheval — grooms, palefreniers, cavaliers, chauffeurs, enseignants, agents de concours et d’entretien.'),
    timeoutText: t('Trop tard : l’épreuve a commencé sans la selle.'),
    rate: (run) => (run.data.left > 40 ? 5 : run.data.left > 25 ? 4 : run.data.left > 10 ? 3 : 2),
    steps(game, run, S) {
      // Margaux remet la selle au comptoir de la Sellerie du Port : on entre dans la boutique (à pied, le cheval
      // attaché dehors) et on la retire au comptoir.
      const counter = shopAnchor(SHOPS3D.sellerie, 'comptoir');
      const rider = npcAt(game, run, { top: '#1b1c1f', sleeve: '#1b1c1f', pants: '#f2f1ec', boots: '#121214', skin: '#c99a74', hair: '#2a1d14', helmet: '#16171a', logo: true }, POLE.stables.x - 11, POLE.stables.z - 8, -Math.PI / 2, 'Clara');
      return [
        S.interact(counter, t('Retirer la selle'), t('Retire la selle au comptoir de la Sellerie du Port, à Deauville City'), { modes: ['foot'], r: 2.2, icon: 'bag' }),
        S.custom({
          text: '',
          start(r) {
            game.hud.dialog([{ who: 'Margaux Leroy', initials: 'ML', text: t('La selle de Clara, faite sur-mesure. Elle rentre en piste dans 1 min 45 au Pôle International — file !') }], () => (r.flags.go = true));
          },
          update: (r) => r.flags.go,
        }),
        S.custom({ text: '', start: (r) => (r.timer = 105), update: () => true }),
        S.interact(() => rider.pos, t('Livrer la selle'), t('Livre la selle à Clara, aux écuries du Pôle'), {
          modes: ['foot', 'ride'],
          r: 4.5,
          icon: 'bag',
          onDo: (r) => {
            r.data.left = r.timer;
            r.timer = null;
            rider.pose = 'wave';
          },
        }),
        S.dialog([{ who: 'Clara Fournier', initials: 'CF', text: t('Juste à temps ! Merci, je file à l’échauffement.') }]),
      ];
    },
  },

  // 3 — Le fugueur
  {
    id: 'fugueur', story: true, vertical: 'JOBS', category: 'Urgence', title: t('Le fugueur'), level: 1, requires: ['livraison'],
    desc: t('Un étalon s’est échappé du haras. Le rattraper et le ramener au paddock.'),
    client: C.antoine, place: POI.haras, placeName: 'Haras de la Pommeraie', pay: 160, xp: 200, duration: '~4 min',
    irl: t('« la solution aux urgences du quotidien » : sur Strides, on trouve rapidement un professionnel disponible.'),
    timeoutText: t('Tonnerre s’est enfui trop loin…'),
    rate: (run) => byTime(run.data.catchT || 99, 35, 55, 80),
    review: (s) => (s >= 4 ? t('Sang-froid impressionnant. Tonnerre est rentré sans une égratignure.') : t('Merci d’avoir ramené Tonnerre !')),
    steps(game, run, S) {
      const P = HARAS.paddocks[0];
      const antoine = npcAt(game, run, STAFF, HARAS.gate.x + 3, HARAS.gate.z - 6, Math.PI, 'Antoine');
      void antoine;
      let tonnerre = null;
      const bounds = { x: -330, z: 60, w: 300, d: 260 };
      return [
        S.goto({ x: HARAS.gate.x, z: HARAS.gate.z - 8 }, t('Rejoins le Haras de la Pommeraie'), { r: 9, mode: 'ride' }),
        S.dialog([
          { who: 'Antoine Roux', initials: 'AR', text: t('Tonnerre a sauté la clôture du paddock ! Il galope vers les champs, au sud.') },
          { who: 'Antoine Roux', initials: 'AR', text: t('Rattrape-le à cheval, approche-toi et touche ACTION pour saisir sa longe. Vite !') },
        ]),
        S.custom({
          text: t('Rattrape Tonnerre !'),
          target: () => (tonnerre ? tonnerre.pos : { x: -380, z: 80 }),
          radius: 2,
          beacon: false,
          start(r) {
            tonnerre = game.spawnHorse({ id: 'tonnerre', name: 'Tonnerre', coat: 'darkbay', blaze: true, socks: [true, true, false, false], speed: 1, stamina: 1 }, -385, 70, Math.PI, { saddle: false });
            tonnerre.ai = new FleeAI(() => game.player.focus.pos, bounds);
            tonnerre.visibleDist = 400;
            r.onCleanup(() => game.despawn(tonnerre));
            r.timer = 130;
            r.flags.caught = false;
            game.interact.add('catch', {
              label: t('Attraper'),
              icon: 'hand',
              r: 4.2,
              priority: 4,
              modes: ['ride', 'foot'],
              getPos: () => tonnerre.pos,
              action: () => (r.flags.caught = true),
            });
            r.onCleanup(() => game.interact.remove('catch'));
            game.gps.target && (game.gps.target.sticky = true);
          },
          update: (r) => {
            if (r.flags.caught) {
              r.data.catchT = r.stepT;
              r.timer = null;
              game.interact.remove('catch');
              tonnerre.ai = new FollowAI(() => game.player.focus.pos, { stopDist: 3.5 });
              game.hud.big(t('ATTRAPÉ !'), t('Ramène Tonnerre au paddock'), 1800);
              game.audio.neigh();
              return true;
            }
            return false;
          },
        }),
        S.custom({
          text: t('Ramène Tonnerre au paddock n°1 (il te suit)'),
          target: { x: P.x, z: P.z - P.d / 2 - 4 },
          radius: 6,
          update() {
            const f = game.player.focus.pos;
            const near = Math.hypot(f.x - P.x, f.z - (P.z - P.d / 2 - 4)) < 7;
            const follows = Math.hypot(tonnerre.pos.x - f.x, tonnerre.pos.z - f.z) < 14;
            if (!follows && game.player.focus.speed > 9) game.hud.hint(t('Pas trop vite : Tonnerre doit pouvoir suivre !'), 2000);
            if (near && follows) {
              tonnerre.setPosition(P.x, P.z, 0);
              tonnerre.ai = new GrazeAI(P);
              return true;
            }
            return false;
          },
        }),
        S.dialog([{ who: 'Antoine Roux', initials: 'AR', text: t('Bravo ! Je garde ton contact. Pour les urgences, c’est toi que j’appelle.') }]),
      ];
    },
  },

  // 4 — Galop sur la plage (cavalier, cheval de client)
  {
    id: 'plage', story: true, vertical: 'JOBS', category: 'Cavalier', title: t('Galop sur la plage'), level: 2, requires: ['fugueur'],
    desc: t('Travailler Tornade en bord de mer : 7 anneaux sur la plage, puis retour à l’écurie.'),
    client: C.helene, place: POI.dunes, placeName: 'Écurie des Dunes', pay: 180, xp: 250, duration: '~4 min',
    irl: t('« Vous cherchez un cavalier pour travailler vos chevaux ? » Les cavaliers maison et d’entraînement proposent leurs services sur Strides.'),
    timeoutText: t('Trop lent : Tornade n’a pas eu le travail prévu.'),
    rate: (run) => (run.data.left > 25 ? 5 : run.data.left > 15 ? 4 : run.data.left > 6 ? 3 : 2),
    steps(game, run, S) {
      const helene = npcAt(game, run, { ...STAFF_F, top: '#2f5f8a', sleeve: '#2f5f8a', hair: '#c9a46a' }, DUNES.barn.x - 6, DUNES.barn.z + 9, Math.PI, 'Hélène');
      const tornade = game.spawnHorse({ id: 'tornade', name: 'Tornade', coat: 'palomino', blaze: true, speed: 1.05, jump: 1, stamina: 1.1 }, DUNES.barn.x + 4, DUNES.barn.z + 10, -Math.PI / 2, { pad: '#f2f1ec', padTrim: '#15161a' });
      tornade.frozen = true;
      const main = game.player.horse;
      run.onCleanup(() => {
        if (game.player.horse === tornade) {
          if (game.player.mode === 'ride') game.player.dismount(true);
          game.player.setHorse(main);
        }
        game.despawn(tornade);
      });
      // Anneaux sur le sable ferme au bord de l'eau, posés selon la marée au départ du galop (plus loin à marée basse :
      // le temps imparti tient compte du chemin en plus).
      const xs = [], rings = [];
      for (let i = 0; i < 7; i++) {
        xs.push(420 - i * 70);
        rings.push([420 - i * 70, -390 + Math.sin(i * 1.3) * 2]);
      }
      const barn = [DUNES.barn.x, DUNES.barn.z + 12];
      const baseLen = pathLength([barn, ...rings, barn]);
      const tideLine = () => {
        const lv = game.tide?.level ?? 0;
        if (lv < -1.2) return t('La mer est basse : les anneaux sont posés loin, sur le sable ferme au bord de l’eau. Idéal pour galoper !');
        if (lv > 1.8) return t('La mer est haute : les anneaux sont sur la bande de sable au bord de l’eau. Reste sur le sable ferme.');
        return game.tide?.rising ? t('La marée monte : les anneaux suivent le bord de l’eau, sur le sable ferme.') : t('La marée descend : les anneaux suivent le bord de l’eau, sur le sable ferme.');
      };
      return [
        S.goto({ x: DUNES.barn.x - 4, z: DUNES.barn.z + 12 }, t('Rejoins l’Écurie des Dunes'), { r: 9 }),
        S.dialog(() => [
          { who: 'Hélène Duval', initials: 'HD', text: t('Voici Tornade. Elle a besoin de se dépenser avant le concours de dimanche.') },
          { who: 'Hélène Duval', initials: 'HD', text: t('Un galop sur la plage, sept anneaux, et tu me la ramènes. Ta jument reste ici en attendant.') },
          { who: 'Hélène Duval', initials: 'HD', text: tideLine() },
        ]),
        S.custom({
          text: () => (game.player.mode === 'ride' && game.player.horse !== tornade ? t('Descends de ta jument') : t('Monte sur Tornade')),
          target: () => tornade.pos,
          radius: 3,
          beacon: false,
          start() {
            tornade.frozen = false;
          },
          update() {
            if (game.player.mode === 'ride' && game.player.horse === tornade) return true;
            if (game.player.mode === 'foot' && game.player.horse !== tornade) {
              main.ai = null;
              game.player.setHorse(tornade);
            }
            return false;
          },
        }),
        S.custom({
          text: '',
          start(r) {
            beachRingPoints(game, xs, { wobble: (i) => Math.sin(i * 1.3) * 4 }).forEach((p, i) => (rings[i][1] = p[1]));
            r.timer = 95 + Math.ceil(Math.max(0, pathLength([barn, ...rings, barn]) - baseLen) / 11);
          },
          update: () => true,
        }),
        checkpointSteps(game, run, S, rings, { text: t('Galop sur la plage : passe les anneaux'), mode: 'ride' }),
        S.custom({ text: '', start: (r) => (r.data.left = r.timer), update: () => true }),
        S.goto({ x: DUNES.barn.x - 2, z: DUNES.barn.z + 12 }, t('Ramène Tornade à l’Écurie des Dunes'), { r: 7, mode: 'ride' }),
        S.custom({
          text: '',
          start(r) {
            r.data.left = r.timer;
            r.timer = null;
            game.player.dismount(true);
            game.player.setHorse(main);
            main.setPosition(DUNES.barn.x - 10, DUNES.barn.z + 14, Math.PI / 2);
            tornade.setPosition(DUNES.barn.x + 4, DUNES.barn.z + 10, -Math.PI / 2);
            tornade.frozen = true;
            helene.pose = 'wave';
          },
          update: () => true,
        }),
        S.dialog([{ who: 'Hélène Duval', initials: 'HD', text: t('Elle est détendue et heureuse. Je te réserve pour dimanche !') }]),
      ];
    },
  },

  // 5 — Transport express : charger Quabar au haras, le livrer au Pôle en douceur, le décharger et le confier.
  {
    id: 'transport', story: true, vertical: 'TRANSPORT', category: 'Transport', title: t('Transport express'), level: 2, requires: ['fugueur'],
    desc: t('Conduire le camion Strides : charger Quabar au haras et le livrer au Pôle International, en douceur.'),
    client: C.antoine, place: POI.home, placeName: t('Écurie du Val (camion)'), pay: 260, xp: 300, duration: '~6 min',
    irl: t('« Besoin d’un chauffeur pour partir en concours ? » Sur Strides, des chauffeurs proposent le transport des chevaux vers les concours, aller-retour.'),
    timeoutText: t('Quabar est arrivé trop tard pour son épreuve.'),
    rate: (run) => (run.data.comfort >= 90 ? 5 : run.data.comfort >= 75 ? 4 : run.data.comfort >= 55 ? 3 : 2),
    review: (s) => (s >= 5 ? t('Quabar est descendu du camion frais comme un gardon. Conduite parfaite.') : s >= 4 ? t('Bonne conduite, cheval serein.') : t('Arrivé, mais un peu secoué…')),
    steps(game, run, S) {
      const truck = game.player.truck;
      const tp = game.player.transport;
      game.missions.noWhistle = true;
      let quabar = null;
      let groom = null;
      const H = PARKS.haras;
      return [
        S.custom({
          text: () => (game.player.inTruck ? '' : t('Monte dans le camion Strides (Écurie du Val)')),
          target: () => truck.pos,
          radius: 5,
          hint: t('Au volant : joystick vers le haut = accélérer, vers le bas = freiner puis reculer. Rampe fermée pour rouler.'),
          update: () => game.player.inTruck,
        }),
        driveStep(game, S, {
          to: H,
          text: t('Va chercher Quabar au Haras de la Pommeraie'),
          onArrive: (r) => {
            if (quabar) return;
            // Antoine attend avec Quabar, protections de transport mises.
            quabar = game.spawnHorse({ id: 'quabar', name: 'Quabar', coat: 'grey', speed: 1 }, H.x + 9, H.z + 7, -Math.PI / 2, { saddle: false });
            quabar.frozen = true;
            quabar.leadable = true;
            quabar.visibleDist = 300;
            r.onCleanup(() => game.despawn(quabar));
            const a = npcAt(game, run, STAFF, H.x + 9.6, H.z + 8.4, -Math.PI / 2, 'Antoine');
            a.pose = 'wave';
          },
        }),
        S.dialog([
          { who: 'Antoine Roux', initials: 'AR', text: t('Voilà Quabar, protections de transport mises. Ouvre la rampe, prends-le en main et fais-le monter calmement.') },
          { who: 'Antoine Roux', initials: 'AR', text: t('Il a un concours au Pôle : roule en souplesse, il doit arriver frais.') },
        ]),
        loadStep(game, S, { horse: () => quabar, name: 'Quabar' }),
        driveStep(game, S, { to: PARKS.pole, text: t('Livre Quabar au Pôle International — parking des camions'), timer: 170, comfort: true }),
        S.custom({
          text: '',
          start() {
            groom = npcAt(game, run, { ...STAFF_F, top: '#2f5f8a', sleeve: '#2f5f8a' }, PARKS.pole.x - 9, PARKS.pole.z - 6, Math.PI / 2, 'Manon');
          },
          update: () => true,
        }),
        unloadStep(game, S, { horse: () => quabar, name: 'Quabar' }),
        S.interact(() => groom.pos, t('Confier Quabar'), t('Confie Quabar à Manon, sa groom'), {
          modes: ['foot'],
          r: 3.6,
          icon: 'hand',
          when: () => tp.led?.horse === quabar,
          onDo: () => {
            tp.release(true);
            quabar.ai = null;
            quabar.frozen = true;
            quabar.leadable = false;
            groom.pose = 'wave';
            game.audio.snort();
          },
        }),
        S.dialog(() => [{ who: t('Manon · Groom de Quabar'), initials: 'MB', text: T`Merci ! Confort du cheval pendant le trajet : ${Math.round(run.data.comfort ?? 100)} %. Il est arrivé frais.` }]),
      ];
    },
  },

  // 6 — Fer perdu (Annuaire)
  {
    id: 'fer', story: true, vertical: 'ANNUAIRE', category: 'Urgence', title: t('Fer perdu'), level: 2, requires: ['transport', 'plage'],
    desc: t('Comète a perdu un fer. Trouver un maréchal-ferrant dans le Guide local du téléphone.'),
    client: null, place: POI.forge, placeName: t('Guide local'), pay: 0, payLabel: t('Soins : 60 €'), xp: 220, duration: '~3 min', noReview: true,
    irl: t('le Guide local (maréchaux, vétérinaires…) est une fonction du jeu : ces métiers ne sont pas proposés sur Strides.'),
    steps(game, run, S) {
      const horse = game.player.horse;
      horse.lame = true;
      run.onCleanup(() => (horse.lame = false));
      const hugo = npcAt(game, run, { top: '#3a3d42', sleeve: '#3a3d42', pants: '#2b3442', boots: '#2a2622', skin: '#c99a74', hair: '#2a1d14', logo: false }, TOWN.forge.x + TOWN.forge.w / 2 + 3, TOWN.forge.z + 2, Math.PI / 2, 'Hugo');
      return [
        S.dialog([{ who: 'Comète', initials: '🐴', text: t('(Comète boite. Un fer s’est détaché — impossible de travailler comme ça.)') }]),
        S.custom({
          text: t('Ouvre le Guide local et contacte un maréchal-ferrant'),
          hint: t('Touche le <b>téléphone</b> en haut à droite → <b>Guide local</b> → <b>Santé et soins</b>.'),
          hintMs: 9000,
          start(r) {
            r.flags.contact = false;
            const off = game.bus.on('pro:contact', (p) => {
              if (p.id === 'lemaire') r.flags.contact = true;
              else game.hud.toast(T`${p.name} : « Désolé, ce n’est pas ma spécialité ! »`);
            });
            r.onCleanup(off);
          },
          update: (r) => r.flags.contact,
        }),
        S.dialog([
          { who: t('Hugo Lemaire · Maréchal-ferrant'), initials: 'HL', text: t('Hugo Lemaire, j’ai bien eu ton appel. Je suis à la forge, à Deauville City.') },
          { who: t('Hugo Lemaire · Maréchal-ferrant'), initials: 'HL', text: t('Viens au pas, sans forcer. Je te la referre en dix minutes.') },
        ]),
        S.interact(() => hugo.pos, t('Faire ferrer'), t('Rejoins la Forge Lemaire (au pas)'), {
          modes: ['ride', 'foot'],
          r: 5,
          icon: 'horse',
          when: () => Math.hypot(horse.pos.x - hugo.pos.x, horse.pos.z - hugo.pos.z) < 12,
        }),
        S.custom({
          text: t('Ferrure en cours…'),
          start() {
            game.fade(() => {
              horse.lame = false;
              game.save.data.money = Math.max(0, game.save.data.money - 60);
              game.updateWallet();
            }, 1.6);
          },
          update: (r) => r.stepT > 2.2,
        }),
        S.dialog([
          { who: t('Hugo Lemaire · Maréchal-ferrant'), initials: 'HL', text: t('Et voilà, quatre fers neufs. Tu me règles 60 €, facture dans ta boîte.') },
          { who: t('Toi'), initials: game.save.data.playerName.slice(0, 2).toUpperCase(), text: t('Merci Hugo ! Comète marche comme une horloge.') },
        ]),
      ];
    },
    after(game) {
      game.message('Hugo Lemaire', 'HL', t('Merci ! N’hésite pas à me rappeler pour la prochaine ferrure. Bonne saison !'));
    },
  },

  // 7 — Cross de Saint-Gatien
  {
    id: 'cross', story: true, vertical: 'EVENEMENTS', category: 'Cross', title: t('Cross de Saint-Gatien'), level: 3, requires: ['fer'],
    desc: t('10 obstacles fixes en forêt. Refus : +20 pénalités. Temps accordé : 1:50.'),
    client: C.paul, place: POI.gatien, placeName: 'Domaine de Saint-Gatien', pay: 320, xp: 350, duration: '~3 min',
    irl: EVENT_IRL,
    rate: (run) => {
      const p = totalPenalties(run);
      return p === 0 ? 5 : p <= 8 ? 4 : p <= 24 ? 3 : 2;
    },
    review: (s) => (s >= 5 ? t('Sans faute et dans le temps. Du grand art.') : s >= 4 ? t('Très beau parcours !') : t('Parcours terminé, bravo pour le courage.')),
    steps(game, run, S) {
      const paul = npcAt(game, run, OFFICIAL, GATIEN.start.x + 6, GATIEN.start.z - 7, -Math.PI / 2, 'Paul');
      void paul;
      return courseSteps(game, run, S, {
        courseId: 'xc',
        kind: 'xc',
        start: { x: GATIEN.start.x + 4, z: GATIEN.start.z },
        finish: { x: GATIEN.start.x, z: GATIEN.start.z, w: 7 },
        timeAllowed: 110,
        intro: [{ who: 'Paul Faure', initials: 'PF', text: t('Dix obstacles en forêt, dont l’entrée dans la mare. Suis les numéros, attention aux refus. Bonne chance !') }],
      }).concat([
        S.custom({
          text: '',
          start(r) {
            r.resultBody = T`Pénalités : ${totalPenalties(r)} · Chrono ${Math.round(r.data.course.t)} s`;
          },
          update: () => true,
        }),
      ]);
    },
  },

  // 8 — La pension parfaite (Écuries)
  {
    id: 'pension', story: true, vertical: 'ECURIES', category: 'Recherche', title: t('La pension parfaite'), level: 3, requires: ['fer'],
    desc: t('Trouver une pension pour Galant : box + paddock, accès plage, moins de 500 €/mois. Puis l’y conduire.'),
    client: C.chloe, place: POI.haras, placeName: t('Guide local › Pensions'), pay: 170, xp: 250, duration: '~4 min',
    irl: t('la recherche de pension est une fonction du jeu (Guide local) : elle n’est pas proposée sur Strides.'),
    rate: (run) => (run.data.wrong ? 4 : 5) - (run.t > 220 ? 1 : 0),
    steps(game, run, S) {
      let galant = null;
      return [
        S.custom({
          text: t('Ouvre le Guide local › Pensions et choisis la bonne pension'),
          hint: t('Critères : <b>box + paddock</b>, <b>accès plage</b>, <b>moins de 500 €/mois</b>.'),
          hintMs: 9000,
          start(r) {
            game.message('Chloé Mercier', 'CM', t('Bonjour ! Je cherche une pension pour Galant : box + paddock, accès plage idéalement, moins de 500 €/mois. Tu connais le coin, tu peux m’aider ?'));
            game.missions.stablePicker = {
              prompt: t('Galant : box + paddock · plage · < 500 €'),
              onPick: (s) => {
                if (s.id === 'dunes') {
                  r.flags.ok = true;
                  game.missions.stablePicker = null;
                  game.phone.close();
                  game.hud.toast(t('Écurie des Dunes : parfait !'));
                } else {
                  r.data.wrong = true;
                  game.hud.toast(s.price >= 500 ? t('Trop cher pour Chloé.') : t('Pas d’accès plage…'));
                }
              },
            };
          },
          update: (r) => r.flags.ok,
        }),
        S.custom({
          text: t('Récupère Galant au Haras de la Pommeraie'),
          target: { x: HARAS.court.x, z: HARAS.court.z + 6 },
          radius: 5,
          start(r) {
            galant = game.spawnHorse({ id: 'galant', name: 'Galant', coat: 'chestnut', blaze: false, socks: [false, true, false, true] }, HARAS.court.x, HARAS.court.z + 6, 0, { saddle: false });
            galant.frozen = true;
            r.onCleanup(() => game.despawn(galant));
            r.flags.lead = false;
            game.interact.add('lead', { label: t('Prendre en longe'), icon: 'hand', r: 4, priority: 4, modes: ['ride', 'foot'], getPos: () => galant.pos, action: () => (r.flags.lead = true) });
            r.onCleanup(() => game.interact.remove('lead'));
          },
          update(r) {
            if (r.flags.lead) {
              game.interact.remove('lead');
              galant.frozen = false;
              galant.ai = new FollowAI(() => game.player.focus.pos, { stopDist: 3.5 });
              return true;
            }
            return false;
          },
        }),
        S.custom({
          text: t('Conduis Galant à l’Écurie des Dunes (il te suit)'),
          target: { x: DUNES.paddock.x, z: DUNES.paddock.z - DUNES.paddock.d / 2 - 3 },
          radius: 7,
          update() {
            const f = game.player.focus.pos;
            const tg = { x: DUNES.paddock.x, z: DUNES.paddock.z - DUNES.paddock.d / 2 - 3 };
            const follows = Math.hypot(galant.pos.x - f.x, galant.pos.z - f.z) < 16;
            if (!follows && game.player.focus.speed > 9) game.hud.hint(t('Doucement : Galant n’arrive pas à suivre !'), 2000);
            if (Math.hypot(f.x - tg.x, f.z - tg.z) < 8 && follows) {
              galant.setPosition(DUNES.paddock.x, DUNES.paddock.z, 0);
              galant.ai = new GrazeAI(DUNES.paddock);
              return true;
            }
            return false;
          },
        }),
        S.dialog([{ who: 'Chloé Mercier', initials: 'CM', text: t('Galant a l’air ravi ! Je signe le contrat de pension avec l’écurie. Merci !') }]),
      ];
    },
  },

  // 9 — Derby de la Touques
  {
    id: 'derby', story: true, vertical: 'EVENEMENTS', category: 'Course', title: t('Derby de la Touques'), level: 3, requires: ['cross'],
    desc: t('Course de galop, un tour d’hippodrome contre cinq concurrents. Top 3 obligatoire.'),
    client: C.victor, place: POI.hippo, placeName: 'Hippodrome de la Touques', pay: 420, xp: 400, duration: '~3 min',
    irl: EVENT_IRL,
    rate: (run) => [5, 5, 4, 3][run.data.finishPos - 1] || 2,
    review: (s) => (s >= 5 ? t('Une victoire tactique, magnifique !') : t('Belle course, sur le podium !')),
    steps(game, run, S) {
      return raceSteps(game, run, S, {
        onFinish: (pos) => {
          // Gains au prorata du montant convenu (contre-proposition comprise) : 100 %, ~60 %, ~36 %.
          const base = run.offer.pay || 420;
          run.payOverride = [base, Math.round((base * 250) / 420), Math.round((base * 150) / 420)][pos - 1] ?? 0;
          run.resultTitle = pos === 1 ? t('Victoire !') : pos === 2 ? t('2e place') : pos === 3 ? t('3e place') : T`${pos}e place`;
        },
      });
    },
  },

  // 10 — Qualificative CSI 3★
  {
    id: 'csi3', story: true, vertical: 'EVENEMENTS', category: 'CSO', title: t('Qualificative CSI 3★'), level: 4, requires: ['derby', 'pension'],
    desc: t('Parcours de 9 obstacles jusqu’à 1,45 m au Pôle International. 8 pénalités maximum pour se qualifier au Grand Prix.'),
    client: C.julie, place: POI.pole, placeName: 'Pôle International', pay: 500, xp: 450, duration: '~2 min',
    irl: EVENT_IRL,
    rate: (run) => {
      const p = totalPenalties(run);
      return p === 0 ? 5 : p <= 4 ? 4 : 3;
    },
    review: (s) => (s >= 5 ? t('Sans faute ! Qualification brillante.') : t('Qualifié(e) — rendez-vous au Grand Prix.')),
    steps(game, run, S) {
      const judge = npcAt(game, run, OFFICIAL, POLE.arena.x - POLE.arena.w / 2 - 3, POLE.arena.z + 20, Math.PI / 2, 'Julie');
      void judge;
      return courseSteps(game, run, S, {
        courseId: 'cso',
        start: { x: CSO_START.x, z: CSO_START.z },
        finish: CSO_FINISH,
        timeAllowed: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.csi),
        heights: csoHeights(1.4),
        intro: [{ who: t('Julie Bonnet · Comité CSI'), initials: 'JB', text: T`Neuf obstacles jusqu’à 1,45 m, ${COURSE_LENGTH.cso} m à 375 m/min : temps accordé ${timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.csi)} s. Suis les numéros et franchis la ligne d’arrivée après le 9. À toi !` }],
      }).concat([
        S.custom({
          text: '',
          update(r) {
            const p = totalPenalties(r);
            r.resultBody = T`Pénalités : ${p} · Chrono ${dec(r.data.course.t, 2)} s`;
            if (p > 8) return { fail: T`${p} pénalités : non qualifié(e). Il en faut 8 au maximum.` };
            return true;
          },
        }),
      ]);
    },
  },

  // 11 — Grand Prix CSI 5★
  {
    id: 'gp', story: true, vertical: 'EVENEMENTS', category: 'Grand Prix', title: t('Grand Prix CSI 5★'), level: 4, requires: ['csi3'],
    desc: t('La finale. Obstacles de 1,50 m à 1,60 m, meilleurs cavaliers du circuit. Il faut gagner. Un cheval et un équipement à la hauteur sont indispensables.'),
    client: C.julie, place: POI.pole, placeName: 'Pôle International', pay: 1500, xp: 900, duration: '~2 min',
    irl: EVENT_IRL,
    rate: (run) => (totalPenalties(run) === 0 ? 5 : 4),
    review: () => t('Un Grand Prix d’anthologie. Deauville City se souviendra de ce parcours.'),
    steps(game, run, S) {
      const bestRival = { name: 'K. Van Dijk', faults: 4, time: Math.round((timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.gp) - 3.6) * 10) / 10 };
      return courseSteps(game, run, S, {
        courseId: 'cso',
        start: { x: CSO_START.x, z: CSO_START.z },
        finish: CSO_FINISH,
        timeAllowed: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.gp),
        heights: csoHeights(1.55),
        intro: [
          { who: t('Julie Bonnet · Comité CSI'), initials: 'JB', text: T`Grand Prix CSI 5★. Le meilleur temps provisoire : Van Dijk, 4 points en ${dec(bestRival.time)} s.` },
          { who: t('Julie Bonnet · Comité CSI'), initials: 'JB', text: t('Un sans-faute, ou 4 points plus vite que lui, et la victoire est à toi.') },
        ],
      }).concat([
        S.custom({
          text: '',
          update(r) {
            const p = totalPenalties(r);
            const ct = r.data.course.t;
            const win = p < bestRival.faults || (p === bestRival.faults && ct < bestRival.time);
            r.resultBody = T`Pénalités : ${p} · Chrono ${dec(ct, 2)} s — Meilleur adversaire : ${bestRival.faults} pts en ${dec(bestRival.time)} s`;
            if (!win) return { fail: T`${p} pénalités en ${dec(ct)} s : ${bestRival.name} reste devant. Retente ta chance !` };
            r.resultTitle = t('Victoire en Grand Prix');
            game.audio.cheer();
            return true;
          },
        }),
      ]);
    },
    after(game) {
      game.celebrate();
      setTimeout(() => game.screens.ending(() => {}), 1800);
    },
  },

  // Finale : Grand Prix de Paris Indoor (voir parisGP.js).
  PARIS_MISSION,
];

export { HORSES, formatMoney, HIPPO, HIPPO_SITE };
