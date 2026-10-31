// États de test privés (sauvegardes) pour la contre-recette Hermès : chacun est produit à partir d'une partie neuve
// (navigateur vierge, ?autostart), par une mise en place technique décrite dans `origine`, puis exporté tel que le jeu
// l'écrit dans le stockage local (clé strides-grand-tour-v1). Rien n'est ajouté au jeu public : un état se charge en
// écrivant cette clé (console du navigateur, Playwright — voir HERMES_CORRECTIF/ETATS_TEST/LISEZMOI.md et charger-etat.mjs).
// Usage : BASE=http://127.0.0.1:5173 node tests/e2e/make-test-states.mjs [E01,E05,...]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'HERMES_CORRECTIF/ETATS_TEST';
mkdirSync(OUT, { recursive: true });
const AUTO = readFileSync('tests/e2e/autopilot.js', 'utf8');
const commit = execSync('git rev-parse --short HEAD').toString().trim();
const only = process.argv[2] ? process.argv[2].split(',') : null;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// Mise en place commune : partie neuve, cartes fermées, journée, aucune mission en cours.
const fresh = async () => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem('strides-lang', 'fr'));
  const page = await ctx.newPage();
  await page.goto(`${base}/?autostart`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 240000 });
  await page.addScriptTag({ content: AUTO });
  await page.evaluate(() => {
    const A = window.__auto, g = window.__game;
    A.stopLoop();
    A.closeCards();
    while (g.hud.dialogActive) g.hud.advanceDialog();
    g.save.data.playerName = 'Hermès';
    g.save.data.gameTime = Math.floor(g.save.data.gameTime / 86400) * 86400 + 10.5 * 3600;
    A.tick(2);
  });
  return { ctx, page };
};
const exportState = async (page, meta) => {
  const raw = await page.evaluate(() => {
    const g = window.__game;
    g.saveNow();
    return localStorage.getItem(g.save.key);
  });
  const d = JSON.parse(raw);
  const doc = {
    id: meta.id,
    titre: meta.titre,
    usage: meta.usage,
    origine: meta.origine,
    prerequis: meta.prerequis,
    remiseAZero: 'Recharger ce fichier (même clé, même contenu) : l’état repart à l’identique. Supprimer la clé strides-grand-tour-v1 pour revenir à une partie neuve.',
    build: { commit, version: d.meta?.build, sauvegarde: d.version, creeLe: new Date().toISOString() },
    resume: meta.resume(d),
    cle: 'strides-grand-tour-v1',
    sauvegarde: raw,
  };
  writeFileSync(`${OUT}/${meta.id}.json`, JSON.stringify(doc, null, 1));
  console.log(`${meta.id} · ${meta.titre} — ${JSON.stringify(doc.resume)}`);
};
const brief = (d) => ({ argent: d.money, reputation: d.reputation, terminees: d.completed, pointDeReprise: d.checkpoint, van: d.van, camion: d.truck || null, joueur: d.pos && { x: Math.round(d.pos.x), z: Math.round(d.pos.z) } });

const STATES = [
  {
    id: 'E01-devant-defender',
    titre: 'Devant le Defender 110 (Écurie du Val)',
    usage: 'COR-V01 : montée / descente, conduite, ouvertures du Defender.',
    origine: 'Partie neuve ; joueur placé à 2,5 m de la portière conducteur du Defender garé à l’Écurie du Val.',
    prerequis: 'Aucun. Pas de mission en cours.',
    setup: () => {
      const g = window.__game, v = g.defender, p = g.player;
      const dp = v.doorPoint(1);
      p.human.setPosition(dp.x + Math.sin(v.heading) * -1.5, dp.z + Math.cos(v.heading) * -1.5, v.heading);
    },
  },
  {
    id: 'E02-devant-master',
    titre: 'Devant le van Renault Master (portière conducteur)',
    usage: 'COR-V01 / COR-M : monter, conduire le Master.',
    origine: 'Partie neuve ; joueur placé devant la portière conducteur du Master garé à l’Écurie du Val.',
    prerequis: 'Aucun.',
    setup: () => {
      const g = window.__game, v = g.van, p = g.player;
      const dp = v.doorPoint(1);
      p.human.setPosition(dp.x, dp.z, v.heading - Math.PI / 2);
    },
  },
  {
    id: 'E03-devant-scania',
    titre: 'Devant le camion Scania (portière conducteur)',
    usage: 'COR-V01 : transport Scania (rampe, chargement, conduite).',
    origine: 'Partie neuve ; joueur placé devant la portière conducteur du Scania garé à l’Écurie du Val.',
    prerequis: 'Aucun.',
    setup: () => {
      const g = window.__game, v = g.truck, p = g.player;
      const dp = v.doorPoint ? v.doorPoint(1) : v.pos;
      p.human.setPosition(dp.x, dp.z, v.heading - Math.PI / 2);
    },
  },
  {
    id: 'E04-master-avant-chargement',
    titre: 'Master : Comète au pied du pont latéral (fermé), avant chargement',
    usage: 'COR-M01 : « Mener en main » (bouton secondaire), « Ouvrir le pont latéral », « Faire monter Comète », fermer, partir.',
    origine: 'Partie neuve ; Comète et le joueur placés à 4–5 m du pied du pont latéral droit du Master, pont fermé.',
    prerequis: 'Aucun. Comète n’est pas tenue en main au chargement de la partie (prise en main non sauvegardée).',
    setup: () => {
      const g = window.__game, v = g.van, p = g.player, h = g.mainHorse;
      v.setPartsInstant(false, false);
      const a = v.groundPoint(-6.5, 1.2), b = v.groundPoint(-6.5, 2.4);
      h.setPosition(b.x, b.z, v.heading);
      p.human.setPosition(a.x, a.z, v.heading + Math.PI / 2);
      g.vanLoading._persist();
    },
  },
  {
    id: 'E05-master-apres-chargement-pont-ouvert',
    titre: 'Master : Comète chargée, pont latéral encore ouvert (situation d’AUD-02)',
    usage: 'COR-M01 à M05 : au pied du pont, ACTION « Fermer le pont latéral », secondaire « Faire descendre Comète ».',
    origine: 'Partie neuve ; pont ouvert et Comète chargée par le jeu (chargement immédiat, comme une reprise de partie), joueur au pied du pont.',
    prerequis: 'Aucun.',
    setup: () => {
      const g = window.__game, v = g.van, p = g.player, h = g.mainHorse;
      v.setPartsInstant(true, false);
      g.vanLoading.loadInstant(h);
      const a = v.groundPoint(-3.4, 0.6);
      p.human.setPosition(a.x, a.z, v.heading + Math.PI / 2);
      g.vanLoading._persist();
    },
  },
  {
    id: 'E06-tuto-accepte',
    titre: '« Premiers pas » acceptée (juste après l’acceptation)',
    usage: 'COR-S01 : à « Continuer », carte « Mission en cours · Premiers pas » ; « Reprendre » relance la mission (consignes).',
    origine: 'Partie neuve ; Comète mise au box ; « Premiers pas » acceptée par l’API des missions (point de reprise « start » écrit par le jeu).',
    prerequis: 'Aucun.',
    setup: () => {
      const g = window.__game, A = window.__auto;
      g.stabling.putIn(g.mainHorse, true);
      g.missions.offers = [];
      g.missions.refreshOffers(false);
      g.missions.accept('story:tuto');
      A.closeCards();
      g.player.human.setPosition(-104, 168, 0);
    },
  },
  {
    id: 'E07-avant-choix-payant-m2',
    titre: 'M2 « Un renfort avant le concours » acceptée, 400 €, avant le recrutement payant',
    usage: 'COR-S03 / R05 : reprendre M2, aller jusqu’au choix Léa (120 €) / Inès (200 €) / seul·e, recharger après le choix.',
    origine: 'Partie neuve ; « Premiers pas » et M1 marquées terminées, solde 400 €, réputation 160 ; M2 acceptée par l’API (point « start »).',
    prerequis: 'Aucun.',
    setup: () => {
      const g = window.__game, d = g.save.data, A = window.__auto;
      d.completed.push('tuto', 'm1');
      d.money = 400;
      d.reputation = 160;
      g.updateWallet();
      g.missions.offers = [];
      g.missions.refreshOffers(false);
      g.missions.accept('story:m2');
      A.closeCards();
      while (g.hud.dialogActive) g.hud.advanceDialog();
    },
  },
  {
    id: 'E08-avant-concours-pole',
    titre: 'Avant le concours du Pôle : camion garé au parking du Pôle, Comète à bord',
    usage: 'COR-P01 : l’offre « Concours du Pôle » arrive dans Strides 15 à 35 s après « Continuer » ; accepter, monter au volant, décharger, dossard, échauffement, parcours, résultats.',
    origine: 'Partie neuve ; chapitre 1 marqué terminé (tuto, M1–M3), solde 300 €, réputation 300 ; camion Scania placé au parking des camions du Pôle, Comète chargée (chargement immédiat), rampe fermée ; joueur à côté de la cabine ; Comète soignée (état par défaut d’une partie neuve), selle de base.',
    prerequis: 'Aucun. L’engagement (22 € en Amateur 1) est débité à l’acceptation, remboursé si la page est rechargée avant la fin (BUG-08).',
    setup: async () => {
      const g = window.__game, d = g.save.data, A = window.__auto, h = g.mainHorse;
      const { PARKS } = await import('/src/gameplay/trip.js');
      d.completed.push('tuto', 'm1', 'm2', 'm3');
      d.money = 300;
      d.reputation = 300;
      g.updateWallet();
      const tk = g.truck;
      tk.setPosition(PARKS.pole.x, PARKS.pole.z, tk.heading);
      A.tick(2);
      A.loadHorse(h);
      A.tick(2);
      const side = tk.doorPoint ? tk.doorPoint(1) : { x: tk.pos.x + 3, z: tk.pos.z };
      g.player.human.setPosition(side.x, side.z, 0);
      g.player.transport._persist?.();
    },
  },
  {
    id: 'E09-apres-reservation-chauffeur',
    titre: 'Après une réservation de chauffeur (Strides › Recruter › Chauffeur)',
    usage: 'COR-R01 : vérifier un seul débit et l’état après le trajet (joueur et Comète arrivés).',
    origine: 'Partie neuve ; solde 100 € ; dans le téléphone, Strides › Recruter, premier « Réserver » de la liste « Chauffeur » vers une autre destination que l’Écurie du Val (bouton du jeu, déclenché par le script) ; trajet effectué par le jeu.',
    prerequis: 'Aucun.',
    setup: async () => {
      const g = window.__game, d = g.save.data, A = window.__auto;
      d.money = 100;
      g.updateWallet();
      g.phone.open('strides', { tab: 'recruter' });
      A.tick(2);
      // Première destination réelle (hors Écurie du Val, où l'on est déjà) : bouton « Réserver · n € » avec n > 15.
      const btn = [...document.querySelectorAll('.phone button')].find((b) => /^Réserver/.test(b.textContent) && Number((b.textContent.match(/(\d+)/) || [])[1]) > 15);
      window.__resa = { label: btn?.textContent || null, before: d.money };
      if (btn) A.tap(btn);
      for (let i = 0; i < 200; i++) A.tick(1);
      await new Promise((r) => setTimeout(r, 2500));
      for (let i = 0; i < 60; i++) A.tick(1);
      window.__resa.after = d.money;
    },
  },
];

for (const S of STATES) {
  if (only && !only.some((k) => S.id.startsWith(k))) continue;
  const { ctx, page } = await fresh();
  await page.evaluate(`(${S.setup.toString()})()`);
  await page.evaluate(() => window.__auto.tick(10));
  const extra = S.id.startsWith('E09') ? await page.evaluate(() => window.__resa) : null;
  await exportState(page, { ...S, resume: (d) => ({ ...brief(d), ...(extra ? { reservation: extra } : {}) }) });
  await ctx.close();
}
await browser.close();
