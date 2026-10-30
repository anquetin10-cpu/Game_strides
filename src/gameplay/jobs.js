// Jobs ponctuels générés (le « marché » Strides vit en continu).
import { FIRST_NAMES, LAST_NAMES } from './data.js';
import { POI } from '../world/layout.js';
import { HOME, homeBoxes, SHOPS3D } from '../world/sites.js';
import { shopAnchor } from '../world/shopInteriors.js';
import { checkpointSteps } from './courses.js';
import { pick } from '../core/math.js';
import { t, T } from '../core/i18n.js';

const SPOTS = [
  // Commerces de Deauville City : retrait et dépôt au comptoir, à l'intérieur (à pied).
  { id: 'sellerie', name: 'Sellerie du Port', inShop: true, ...shopAnchor(SHOPS3D.sellerie, 'comptoir') },
  { id: 'cafe', name: t('Le Galop (café-boulangerie)'), inShop: true, ...shopAnchor(SHOPS3D.cafe, 'comptoir') },
  { id: 'vet', name: t('Clinique vétérinaire'), x: POI.vet.x, z: POI.vet.z },
  { id: 'forge', name: 'Forge Lemaire', x: POI.forge.x, z: POI.forge.z },
  { id: 'hq', name: 'Strides HQ', x: POI.hq.x, z: POI.hq.z },
  { id: 'home', name: 'Écurie du Val', x: -92, z: 170 },
  { id: 'haras', name: 'Haras de la Pommeraie', x: -380, z: -98 },
  { id: 'dunes', name: 'Écurie des Dunes', x: 500, z: -318 },
  { id: 'gatien', name: 'Domaine de Saint-Gatien', x: -200, z: 300 },
  { id: 'pole', name: 'Pôle International', x: 405, z: -226 },
  { id: 'hippo', name: t('Hippodrome'), x: 330, z: 138 },
];

const ITEMS = [
  { from: 'vet', name: t('Vermifuges'), to: ['home', 'haras', 'dunes', 'gatien'] },
  { from: 'sellerie', name: t('Licol sur-mesure'), to: ['home', 'dunes', 'pole', 'gatien'] },
  { from: 'sellerie', name: t('Tapis de selle'), to: ['pole', 'hippo', 'haras'] },
  { from: 'forge', name: t('Fers de rechange'), to: ['pole', 'hippo', 'haras', 'dunes'] },
  { from: 'hq', name: t('Contrat de vente'), to: ['haras', 'pole', 'gatien'] },
  { from: 'haras', name: t('Paillettes d’étalon (glacière)'), to: ['vet', 'dunes'] },
  { from: 'pole', name: t('Plaques de vainqueur'), to: ['hq', 'sellerie'] },
  { from: 'cafe', name: t('Viennoiseries pour l’équipe'), to: ['home', 'pole', 'dunes', 'haras'] },
  { from: 'cafe', name: t('Plateau de sandwichs'), to: ['pole', 'hippo', 'gatien'] },
];

const RECO = [
  { name: t('Plage est'), pts: [[520, -387], [450, -388], [380, -386], [300, -386], [240, -387]] },
  { name: t('Bocage de la Touques'), pts: [[160, 120], [200, 200], [140, 260], [60, 220], [60, 140]] },
  { name: t('Plateau du phare'), pts: [[-440, -300], [-480, -360], [-520, -340], [-560, -300], [-520, -250]] },
  { name: t('Lisière de Saint-Gatien'), pts: [[-170, 350], [-130, 420], [-90, 470], [-60, 420], [-100, 360]] },
  { name: t('Vergers du haras'), pts: [[-300, 80], [-250, 140], [-320, 170], [-400, 140], [-460, 90]] },
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
    // Dépôt dans un commerce : le temps d'attacher son cheval et d'entrer.
    const limit = Math.round(dist / 8 + 30 + (B.inShop ? 25 : 0));
    const reach = (P) => (P.inShop ? { modes: ['foot'], r: 2.2 } : { modes: ['foot', 'ride', 'drive'], r: 6 });
    return {
      id: `c${seq}`, vertical: 'JOBS', category: 'Coursier', title: T`Livraison : ${it.name}`,
      desc: T`${A.name} → ${B.name} · ${Math.round(limit)} s pour livrer.`,
      client: c, place: A, placeName: A.name, pay: round5(45 + dist * 0.09), xp: 70, duration: `~${Math.ceil((dist / 10 + 30) / 60)} min`,
      irl: t('les écuries et cavaliers trouvent rapidement un professionnel disponible pour un besoin ponctuel.'),
      timeoutText: t('Livraison en retard : le client a annulé.'),
      rate: (run) => (run.data.left > limit * 0.35 ? 5 : run.data.left > limit * 0.2 ? 4 : run.data.left > limit * 0.08 ? 3 : 2),
      steps(g, run, S) {
        return [
          S.interact(A, t('Récupérer'), T`Récupère « ${it.name} » — ${A.name}${A.inShop ? t(' (au comptoir)') : ''}`, { ...reach(A), icon: 'bag' }),
          S.custom({ text: '', start: (r) => (r.timer = limit), update: () => true }),
          S.interact(B, t('Livrer'), T`Livre « ${it.name} » — ${B.name}${B.inShop ? t(' (au comptoir)') : ''}`, {
            ...reach(B),
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
    const opts = SPOTS.filter((s) => !s.inShop && !['vet', 'forge', 'hq'].includes(s.id));
    const A = pick(opts);
    let B = pick(opts);
    while (B === A) B = pick(opts);
    const dist = Math.hypot(A.x - B.x, A.z - B.z);
    return {
      id: `t${seq}`, vertical: 'TRANSPORT', category: 'Transport', title: T`Transport : ${A.name.split(' ').slice(-1)[0]} → ${B.name.split(' ').slice(-1)[0]}`,
      desc: T`Charger un cheval à ${A.name} et le livrer à ${B.name}.`,
      client: c, place: A, placeName: A.name, pay: round5(110 + dist * 0.16), xp: 140, duration: `~${Math.ceil(dist / 300 + 2)} min`,
      irl: t('« Besoin d’un chauffeur pour partir en concours ? » Sur Strides, des chauffeurs proposent le transport des chevaux vers les concours, aller-retour.'),
      rate: (run) => (run.data.comfort >= 90 ? 5 : run.data.comfort >= 75 ? 4 : run.data.comfort >= 55 ? 3 : 2),
      steps(g, run, S) {
        const truck = g.player.truck;
        g.missions.noWhistle = true;
        return [
          S.custom({ text: () => (g.player.inTruck ? '' : t('Monte dans le camion Strides')), target: () => truck.pos, radius: 4, update: () => g.player.inTruck }),
          S.custom({ text: T`Va charger le cheval — ${A.name}`, target: A, radius: 10, update: () => g.player.inTruck && Math.hypot(truck.pos.x - A.x, truck.pos.z - A.z) < 12 && Math.abs(truck.speed) < 1.5 }),
          S.custom({
            text: t('Chargement…'),
            start: () => (g.player.locked = true),
            update: (r) => r.stepT > 1.8,
            end: () => (g.player.locked = false),
          }),
          S.custom({
            text: T`Livre le cheval — ${B.name}`,
            target: B,
            radius: 10,
            start(r) {
              g.missions.comfort = 100;
              r.onCleanup(g.bus.on('truck:bump', ({ speed }) => (g.missions.comfort = Math.max(0, g.missions.comfort - Math.min(30, 6 + speed * 1.5)))));
            },
            update(r, dt) {
              if (truck.lateral > 5.5) g.missions.comfort = Math.max(0, g.missions.comfort - (truck.lateral - 5.5) * 2.2 * dt);
              if (g.missions.comfort <= 0) return { fail: t('Cheval trop secoué : transport interrompu.') };
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
      id: `r${seq}`, vertical: 'JOBS', category: 'Cavalier', title: T`Reconnaissance : ${area.name}`,
      desc: t('Reconnaître un tracé de balade pour un organisateur : 5 balises à cheval.'),
      client: c, place: { x: area.pts[0][0], z: area.pts[0][1] }, placeName: area.name, pay: round5(85 + Math.random() * 40), xp: 90, duration: '~3 min',
      irl: t('sur Strides, les agents de concours prennent en charge des missions d’organisation et de fonctionnement des concours.'),
      rate: (run) => (run.t < 70 ? 5 : run.t < 100 ? 4 : 3),
      steps(g, run, S) {
        return [checkpointSteps(g, run, S, area.pts, { text: T`Balises — ${area.name}`, mode: 'ride', r: 7 })];
      },
    };
  }
  // Groom à l'Écurie du Val.
  const boxes = homeBoxes();
  const chosen = [boxes[0], boxes[2], boxes[5]];
  const hay = { x: HOME.hay.x - HOME.hay.w / 2 + 5.6, z: HOME.hay.z };
  return {
    id: `g${seq}`, vertical: 'JOBS', category: 'Groom', title: t('Soins du soir'), desc: t('Distribuer le foin à trois chevaux.'),
    client: { name: 'Camille Martin', initials: 'CM', rating: 4.9, verified: true }, place: { x: -110, z: 172 }, placeName: 'Écurie du Val', pay: 70, xp: 60, duration: '~2 min',
    irl: t('les grooms indépendants remplissent leur planning grâce aux missions publiées par les écuries.'),
    rate: (run) => (run.t < 70 ? 5 : run.t < 95 ? 4 : 3),
    steps(g, run, S) {
      const steps = [];
      chosen.forEach((b, i) => {
        steps.push(S.interact(hay, t('Prendre du foin'), T`Prends du foin (${i + 1}/3)`, { r: 3.4, onDo: () => g.player.human.carry('hay') }));
        steps.push(S.interact({ x: b.x, z: b.z + 1.2 }, t('Donner le foin'), t('Apporte le foin au box indiqué'), { r: 2.8, onDo: () => g.player.human.drop() }));
      });
      run.onCleanup(() => g.player.human.drop());
      return steps;
    },
  };
}
