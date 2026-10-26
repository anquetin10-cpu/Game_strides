// Jobs ponctuels générés (le « marché » Strides vit en continu).
import { FIRST_NAMES, LAST_NAMES } from './data.js';
import { POI } from '../world/layout.js';
import { HOME, homeBoxes } from '../world/sites.js';
import { checkpointSteps } from './courses.js';
import { pick } from '../core/math.js';

const SPOTS = [
  { id: 'sellerie', name: 'Sellerie du Port', x: POI.sellerie.x, z: POI.sellerie.z },
  { id: 'vet', name: 'Clinique vétérinaire', x: POI.vet.x, z: POI.vet.z },
  { id: 'forge', name: 'Forge Lemaire', x: POI.forge.x, z: POI.forge.z },
  { id: 'hq', name: 'Strides HQ', x: POI.hq.x, z: POI.hq.z },
  { id: 'home', name: 'Écurie du Val', x: -92, z: 170 },
  { id: 'haras', name: 'Haras de la Pommeraie', x: -380, z: -98 },
  { id: 'dunes', name: 'Écurie des Dunes', x: 500, z: -318 },
  { id: 'gatien', name: 'Domaine de Saint-Gatien', x: -200, z: 300 },
  { id: 'pole', name: 'Pôle International', x: 405, z: -226 },
  { id: 'hippo', name: 'Hippodrome', x: 330, z: 138 },
];

const ITEMS = [
  { from: 'vet', name: 'Vermifuges', to: ['home', 'haras', 'dunes', 'gatien'] },
  { from: 'sellerie', name: 'Licol sur-mesure', to: ['home', 'dunes', 'pole', 'gatien'] },
  { from: 'sellerie', name: 'Tapis de selle', to: ['pole', 'hippo', 'haras'] },
  { from: 'forge', name: 'Fers de rechange', to: ['pole', 'hippo', 'haras', 'dunes'] },
  { from: 'hq', name: 'Contrat de vente', to: ['haras', 'pole', 'gatien'] },
  { from: 'haras', name: 'Paillettes d’étalon (glacière)', to: ['vet', 'dunes'] },
  { from: 'pole', name: 'Plaques de vainqueur', to: ['hq', 'sellerie'] },
];

const RECO = [
  { name: 'Plage est', pts: [[520, -387], [450, -388], [380, -386], [300, -386], [240, -387]] },
  { name: 'Bocage de la Touques', pts: [[160, 120], [200, 200], [140, 260], [60, 220], [60, 140]] },
  { name: 'Plateau du phare', pts: [[-440, -300], [-480, -360], [-520, -340], [-560, -300], [-520, -250]] },
  { name: 'Lisière de Saint-Gatien', pts: [[-170, 350], [-130, 420], [-90, 470], [-60, 420], [-100, 360]] },
  { name: 'Vergers du haras', pts: [[-300, 80], [-250, 140], [-320, 170], [-400, 140], [-460, 90]] },
];

const spot = (id) => SPOTS.find((s) => s.id === id);
const client = (rnd = Math.random) => {
  const f = pick(FIRST_NAMES, rnd);
  const l = pick(LAST_NAMES, rnd);
  return { name: `${f} ${l}`, initials: `${f[0]}${l[0]}`, rating: 4.4 + Math.round(rnd() * 6) / 10, verified: rnd() < 0.85 };
};
const round5 = (v) => Math.round(v / 5) * 5;

export function generateJob(game, seq, level) {
  const types = ['coursier', 'coursier', 'reco', 'groom'];
  if (level >= 2) types.push('transport', 'transport');
  const type = pick(types);
  const c = client();
  if (type === 'coursier') {
    const it = pick(ITEMS);
    const A = spot(it.from);
    const B = spot(pick(it.to));
    const dist = Math.hypot(A.x - B.x, A.z - B.z);
    const limit = Math.round(dist / 8 + 30);
    return {
      id: `c${seq}`, vertical: 'JOBS', category: 'Coursier', title: `Livraison : ${it.name}`,
      desc: `${A.name} → ${B.name} · ${Math.round(limit)} s pour livrer.`,
      client: c, place: A, placeName: A.name, pay: round5(45 + dist * 0.09), xp: 70, duration: `~${Math.ceil((dist / 10 + 30) / 60)} min`,
      irl: 'les écuries et cavaliers trouvent rapidement un professionnel disponible pour un besoin ponctuel.',
      timeoutText: 'Livraison en retard : le client a annulé.',
      rate: (run) => (run.data.left > limit * 0.35 ? 5 : run.data.left > limit * 0.2 ? 4 : run.data.left > limit * 0.08 ? 3 : 2),
      steps(g, run, S) {
        return [
          S.interact(A, `Récupérer`, `Récupère « ${it.name} » — ${A.name}`, { modes: ['foot', 'ride', 'drive'], r: 6, icon: 'bag' }),
          S.custom({ text: '', start: (r) => (r.timer = limit), update: () => true }),
          S.interact(B, 'Livrer', `Livre « ${it.name} » — ${B.name}`, {
            modes: ['foot', 'ride', 'drive'],
            r: 6,
            icon: 'bag',
            onDo: (r) => {
              r.data.left = r.timer;
              r.timer = null;
            },
          }),
        ];
      },
    };
  }
  if (type === 'transport') {
    const opts = SPOTS.filter((s) => !['sellerie', 'vet', 'forge', 'hq'].includes(s.id));
    const A = pick(opts);
    let B = pick(opts);
    while (B === A) B = pick(opts);
    const dist = Math.hypot(A.x - B.x, A.z - B.z);
    return {
      id: `t${seq}`, vertical: 'TRANSPORT', category: 'Transport', title: `Transport : ${A.name.split(' ').slice(-1)[0]} → ${B.name.split(' ').slice(-1)[0]}`,
      desc: `Charger un cheval à ${A.name} et le livrer à ${B.name}.`,
      client: c, place: A, placeName: A.name, pay: round5(110 + dist * 0.16), xp: 140, duration: `~${Math.ceil(dist / 300 + 2)} min`,
      irl: '« Besoin d’un chauffeur pour partir en concours ? » Sur Strides, des chauffeurs proposent le transport des chevaux vers les concours, aller-retour.',
      rate: (run) => (run.data.comfort >= 90 ? 5 : run.data.comfort >= 75 ? 4 : run.data.comfort >= 55 ? 3 : 2),
      steps(g, run, S) {
        const truck = g.player.truck;
        g.missions.noWhistle = true;
        return [
          S.custom({ text: () => (g.player.inTruck ? '' : 'Monte dans le camion Strides'), target: () => truck.pos, radius: 4, update: () => g.player.inTruck }),
          S.custom({ text: `Va charger le cheval — ${A.name}`, target: A, radius: 10, update: () => g.player.inTruck && Math.hypot(truck.pos.x - A.x, truck.pos.z - A.z) < 12 && Math.abs(truck.speed) < 1.5 }),
          S.custom({
            text: 'Chargement…',
            start: () => (g.player.locked = true),
            update: (r) => r.stepT > 1.8,
            end: () => (g.player.locked = false),
          }),
          S.custom({
            text: `Livre le cheval — ${B.name}`,
            target: B,
            radius: 10,
            start(r) {
              g.missions.comfort = 100;
              r.onCleanup(g.bus.on('truck:bump', ({ speed }) => (g.missions.comfort = Math.max(0, g.missions.comfort - Math.min(30, 6 + speed * 1.5)))));
            },
            update(r, dt) {
              if (truck.lateral > 5.5) g.missions.comfort = Math.max(0, g.missions.comfort - (truck.lateral - 5.5) * 2.2 * dt);
              if (g.missions.comfort <= 0) return { fail: 'Cheval trop secoué : transport interrompu.' };
              return Math.hypot(truck.pos.x - B.x, truck.pos.z - B.z) < 12 && Math.abs(truck.speed) < 1.5;
            },
            end(r) {
              r.data.comfort = g.missions.comfort ?? 0;
            },
          }),
        ];
      },
    };
  }
  if (type === 'reco') {
    const area = pick(RECO);
    return {
      id: `r${seq}`, vertical: 'JOBS', category: 'Cavalier', title: `Reconnaissance : ${area.name}`,
      desc: 'Reconnaître un tracé de balade pour un organisateur : 5 balises à cheval.',
      client: c, place: { x: area.pts[0][0], z: area.pts[0][1] }, placeName: area.name, pay: round5(85 + Math.random() * 40), xp: 90, duration: '~3 min',
      irl: 'sur Strides, les agents de concours prennent en charge des missions d’organisation et de fonctionnement des concours.',
      rate: (run) => (run.t < 70 ? 5 : run.t < 100 ? 4 : 3),
      steps(g, run, S) {
        return [checkpointSteps(g, run, S, area.pts, { text: `Balises — ${area.name}`, mode: 'ride', r: 7 })];
      },
    };
  }
  // Groom à l'Écurie du Val.
  const boxes = homeBoxes();
  const chosen = [boxes[0], boxes[2], boxes[5]];
  const hay = { x: HOME.hay.x - HOME.hay.w / 2 + 5.6, z: HOME.hay.z };
  return {
    id: `g${seq}`, vertical: 'JOBS', category: 'Groom', title: 'Soins du soir', desc: 'Distribuer le foin à trois chevaux.',
    client: { name: 'Camille Martin', initials: 'CM', rating: 4.9, verified: true }, place: { x: -110, z: 172 }, placeName: 'Écurie du Val', pay: 70, xp: 60, duration: '~2 min',
    irl: 'les grooms indépendants remplissent leur planning grâce aux missions publiées par les écuries.',
    rate: (run) => (run.t < 70 ? 5 : run.t < 95 ? 4 : 3),
    steps(g, run, S) {
      const steps = [];
      chosen.forEach((b, i) => {
        steps.push(S.interact(hay, 'Prendre du foin', `Prends du foin (${i + 1}/3)`, { r: 3.4, onDo: () => g.player.human.carry('hay') }));
        steps.push(S.interact({ x: b.x, z: b.z + 1.2 }, 'Donner le foin', 'Apporte le foin au box indiqué', { r: 2.8, onDo: () => g.player.human.drop() }));
      });
      run.onCleanup(() => g.player.human.drop());
      return steps;
    },
  };
}
