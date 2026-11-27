// Jalon J3 (correction après contrôle adverse) : missions de l'histoire et paliers de réputation lus dans le jeu web
// lui-même (src/gameplay/story.js STORY, story2.js CHAPTER1_MISSIONS, parisGP.js, src/config.js REPUTATION), et offres
// calculées par la vraie MissionManager.refreshOffers du web. Aucune valeur recopiée à la main : titres, catégories,
// paliers, lieux, sommes, réputation et prérequis viennent des objets du web. Rien n'est modifié dans src/, public/, tests/.
//
// Le portage n'a pas encore le déroulé complet des missions (dialogues, préparations, camion, choix : jalon J4-C). Chaque
// mission reçoit donc un ITINÉRAIRE : les étapes du web qui ont une position fixe dans le monde (S.goto, S.interact sur
// un personnage posé à une position connue, anneaux de checkpointSteps, reconnaissance des obstacles, épreuve du Pôle),
// dans l'ordre du web, avec le texte et le rayon du web. Les étapes d'action sans position (dialogues, préparation au box,
// conduite du camion, choix) sont listées dans « skipped » pour que la réduction soit visible, jamais silencieuse.
//
// Sorties (déterministes ; --check compare sans écrire, code 1 si différent) :
//  - unreal/StridesGrandTour/Content/Data/story_missions.json : lu par le jeu (UStridesDataSubsystem) ;
//  - unreal/core/tests/oracles/story_missions.json : oracle du ctest « carriere » (offres du web après chaque mission,
//    paliers de réputation).
// Usage : node --import ./scripts/unreal/node-web/register.mjs scripts/unreal/export-missions.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = process.argv.includes('--check');
const web = (p) => import(pathToFileURL(join(ROOT, p)).href);
const git = (...a) => execFileSync('git', a, { cwd: ROOT }).toString().trim();

const { STORY } = await web('src/gameplay/story.js');
const { PARIS_MISSION } = await web('src/gameplay/parisGP.js');
const { REPUTATION } = await web('src/config.js');
const { reputationTier } = await web('src/core/save.js');
const { MissionManager } = await web('src/gameplay/missions.js');
const { POI } = await web('src/world/layout.js');
const { HOME, HARAS, DUNES, homeBoxes } = await web('src/world/sites.js');
const { PARKS, SECRETARIAT } = await web('src/gameplay/trip.js');
const { CSO_LAYOUT, CSO_GATE } = await web('src/gameplay/obstacles.js');

const r2 = (v) => Math.round(v * 100) / 100;
const poiId = (p) => Object.entries(POI).find(([, v]) => v === p)?.[0] ?? null;
const go = (p, text, r) => ({ kind: 'goto', text, x: r2(p.x), z: r2(p.z), r });

// ---- Itinéraires (positions et textes relevés dans les étapes du web ; fichier:ligne pour chaque mission) ----
const A = HOME.arena;
const boxes = homeBoxes();
const CAMILLE_VAL = { x: -100, z: 166 }; // story.js:74, story2.js:137 et :270 (npcAt camille)
const recon = (nums) =>
  nums.map((n) => {
    const o = CSO_LAYOUT.find((f) => f.label.replace(/[A-C]$/, '') === String(n));
    return go(o, `Reconnais le parcours du Pôle à pied : obstacle n°${o.label} (${nums.indexOf(n) + 1}/${nums.length})`, 4.5);
  });
const ROUTES = {
  // story.js:67-128 : box, sortie en main et mise en selle (cheval déjà monté au départ du portage), puis carrière,
  // anneaux du petit tour (checkpointSteps r 4.5) et retour vers Camille.
  tuto: {
    route: [
      go({ x: A.x, z: A.z - 13 }, 'Suis la balise jusqu’à la carrière', 5),
      ...[[A.x, A.z - 7.5], [A.x - 16, A.z - 5], [A.x - 16, A.z + 6], [A.x - 4, A.z + 7], [A.x, A.z - 3]].map((p, i) =>
        go({ x: p[0], z: p[1] }, `Fais le tour de la carrière dans les anneaux (${i + 1}/5)`, 4.5)),
      go(CAMILLE_VAL, 'Reviens voir Camille devant les boxes', 4),
    ],
    skipped: ['dialogues de Camille', 'aller chercher Comète au box, la sortir en main, monter en selle'],
  },
  // story2.js:133-146 (option « Préparation (Val) », celle du tarif de base du web : 90 €, 60 points).
  m1: {
    choice: 'val',
    route: [
      go({ x: boxes[3].x, z: boxes[3].z + 6 }, 'Rejoins les boxes de l’Écurie du Val', 7),
      go({ x: boxes[2].x, z: boxes[2].z + 3.2 }, 'Prépare Iris (devant le box n°3)', 2.8),
      go({ x: boxes[5].x, z: boxes[5].z + 3.2 }, 'Prépare Narval (devant le box n°6)', 2.8),
      go(CAMILLE_VAL, 'Préviens Camille', 4),
    ],
    skipped: ['carte de choix (Val, Haras, tournée, refuser) : option Val retenue', 'préparation au box (6 s, à pied)', 'dialogues'],
  },
  // story2.js:366-400 (option « s'organiser seul·e », sans renfort payé) : reconnaissance 1 à 5, retour, accueil d'Opale.
  m2: {
    choice: 'solo',
    route: [
      ...recon([1, 2, 3, 4, 5]),
      go({ x: -104, z: 168 }, 'Rentre à l’Écurie du Val', 9),
      go({ x: HOME.truck.x - 4, z: HOME.truck.z + 9 }, 'Accueille Opale, la nouvelle pensionnaire (près du camion)', 3.4),
    ],
    skipped: ['recrutement dans Strides › Recruter (Léa 120 €, Inès 200 €) : option seul·e retenue', 'préparation de Comète', 'reconnaissance à pied (le portage l’accepte à cheval)', 'installation d’Opale au box n°8, dialogues'],
  },
  // story2.js:466-700 : préparation, camion (embarquer, conduire, débarquer), secrétariat, épreuve Amateur au Pôle,
  // retour vers l'équipe au parking des camions. Le trajet se fait à cheval (pas de véhicule dans le portage).
  m3: {
    route: [
      go(PARKS.pole, 'Rejoins le parking des camions du Pôle International', PARKS.pole.r),
      go({ x: SECRETARIAT.x - 0.2, z: SECRETARIAT.z - 0.9 }, 'Secrétariat — retire ton dossard', 3.6),
      // Étape « épreuve » : départ de l'activité « Parcours du Pôle » du web (activities.js cso_train, start = CSO_GATE,
      // Amateur 1,10 m comme l'épreuve de M3), franchie quand le parcours lancé pendant l'étape est terminé. Texte du portage.
      { kind: 'course', text: 'Épreuve du Pôle (Amateur 1,10 m) : présente-toi au départ, « Chrono », et termine le parcours', x: r2(CSO_GATE.x), z: r2(CSO_GATE.z), r: 6 },
      go({ x: PARKS.pole.x - 8, z: PARKS.pole.z - 2 }, 'Retrouve l’équipe du Val au parking des camions', 4),
    ],
    skipped: ['préparation de Comète, embarquement, conduite et débarquement du camion', 'dotation selon le classement (simulateField) : participation seule'],
  },
  // story.js:142-176 : foin pris à la réserve puis donné à quatre boxes.
  groom: {
    route: [[1, 2], [3, 4], [4, 5], [6, 7]].flatMap(([i, n], k) => [
      go({ x: HOME.hay.x - HOME.hay.w / 2 + 5.6, z: HOME.hay.z }, `Prends une botte de foin (${k + 1}/4)`, 3.4),
      go({ x: boxes[i].x, z: boxes[i].z + 1.2 }, `Apporte le foin au box n°${n}`, 3.4),
    ]),
    skipped: ['chrono de 150 s', 'porter la botte à pied'],
  },
  // story.js:397-460 : camion → Haras → Pôle (parking) → Manon. À cheval dans le portage (pas de camion).
  transport: {
    route: [
      go(PARKS.haras, 'Va chercher Quabar au Haras de la Pommeraie', PARKS.haras.r),
      go(PARKS.pole, 'Livre Quabar au Pôle International — parking des camions', PARKS.pole.r),
      go({ x: PARKS.pole.x - 9, z: PARKS.pole.z - 6 }, 'Confie Quabar à Manon, sa groom', 4),
    ],
    skipped: ['camion (monter, conduire, confort du cheval), embarquement et débarquement de Quabar'],
  },
};
// Missions sans itinéraire relevé dans cette étape : rejoindre le lieu du web (POI), rayon 18 m du portage.
const reduced = (def) => {
  const id = poiId(def.place);
  const p = def.place;
  return { route: [go(p, `Rejoins ${id && POI[id].name ? POI[id].name : def.placeName}`, 18)], skipped: ['déroulé du web non porté (J4-C)'] };
};

const all = [...STORY];
if (!all.some((d) => d.id === PARIS_MISSION.id)) all.push(PARIS_MISSION);
const missions = all.map((def) => {
  const R = ROUTES[def.id] || reduced(def);
  return {
    id: def.id, title: def.title, category: def.category, level: def.level || 1,
    place: poiId(def.place) ?? 'paris', placeName: def.placeName,
    pay: def.pay || 0, payLabel: def.payLabel || '', xp: def.xp || 0, cost: def.cost || 0,
    requires: def.requires || [], hours: def.hours || null,
    full: !!ROUTES[def.id], choice: R.choice || null, route: R.route, skipped: R.skipped,
  };
});
const tiers = REPUTATION.map((r) => ({ xp: r.xp, title: r.title, short: r.short }));

// ---- Oracle : offres de l'histoire calculées par la vraie MissionManager du web ----
// Partie fictive : chaque mission terminée dans l'ordre de l'histoire, réputation cumulée (+xp) ; à chaque palier, les
// offres « story: » (identifiant, verrou de palier) après refreshOffers(false). Les jobs ponctuels (« job: ») ne sont pas
// portés (hors V1) et sont écartés.
const order = missions.map((m) => m.id);
const fakeGame = () => {
  const g = { save: { data: { completed: [], reputation: 0, money: 0, checkpoint: null } }, time: 0, simClock: 0, hud: { toast() {}, notify() {}, setPhoneBadge() {} } };
  return g;
};
const offersAfter = [];
{
  const g = fakeGame();
  const mm = new MissionManager(g);
  mm.pushNotif = () => {};
  const snap = () => {
    mm.offers = [];
    mm.refreshOffers(false);
    return mm.offers.filter((o) => o.id.startsWith('story:')).map((o) => ({ id: o.def.id, locked: !!o.locked }));
  };
  offersAfter.push({ completed: [], reputation: 0, offers: snap() });
  for (const id of order) {
    const m = missions.find((x) => x.id === id);
    g.save.data.completed.push(id);
    g.save.data.reputation += m.xp;
    offersAfter.push({ completed: [...g.save.data.completed], reputation: g.save.data.reputation, offers: snap() });
  }
  // Verrous de palier (def.level > palier) : mêmes missions terminées, réputation réduite ; une seule offre verrouillée
  // gardée (« if (o.locked && this.offers.some((x) => x.locked)) continue »).
  for (const [k, rep] of [[7, 0], [7, 299], [10, 300], [10, 899], [13, 900], [13, 1799]]) {
    g.save.data.completed = order.slice(0, k);
    g.save.data.reputation = rep;
    offersAfter.push({ completed: [...g.save.data.completed], reputation: rep, offers: snap() });
  }
}
const tierProbe = [0, 1, 299, 300, 301, 899, 900, 1799, 1800, 3199, 3200, 9999].map((p) => ({ points: p, level: reputationTier(p).level, title: reputationTier(p).title, progress: r2(reputationTier(p).progress) }));

const source = { webCommit: git('rev-parse', '--short', 'HEAD'), files: ['src/gameplay/story.js', 'src/gameplay/story2.js', 'src/gameplay/parisGP.js', 'src/config.js', 'src/gameplay/missions.js'] };
const out = [
  [join(ROOT, 'unreal/StridesGrandTour/Content/Data/story_missions.json'), { schema: 'strides.story.v1', source, tiers, missions }],
  [join(ROOT, 'unreal/core/tests/oracles/story_missions.json'), { schema: 'strides.story.oracle.v1', source, offersAfter, tierProbe }],
];
let diff = 0;
for (const [path, obj] of out) {
  const text = JSON.stringify(obj, null, 1) + '\n';
  const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
  // L'empreinte du commit web change à chaque commit du dépôt : comparée hors « source ».
  const strip = (s) => s.replace(/"webCommit": "[^"]*"/, '');
  if (strip(old) === strip(text)) { console.log('inchangé', path); continue; }
  diff++;
  if (CHECK) console.log('DIFFÉRENT', path);
  else { writeFileSync(path, text); console.log('écrit', path); }
}
console.log(`${missions.length} missions, ${missions.filter((m) => m.full).length} avec itinéraire relevé, ${tiers.length} paliers, ${offersAfter.length} relevés d'offres`);
if (CHECK && diff) process.exit(1);
