// Activités libres chronométrées (entraînements) : départ sur place, meilleurs temps sauvegardés.
import * as THREE from 'three';
import { courseSteps, checkpointSteps, beachRingPoints, ovalPoint, hippoLapPoints, HIPPO_LAP, totalPenalties, COURSE_LENGTH, COURSE_SPEED, timeAllowedFor } from './courses.js';
import { CSO_FINISH, CSO_START } from './obstacles.js';
import { GATIEN } from '../world/sites.js';
import { HIPPO } from '../world/layout.js';
import { formatTime } from '../core/math.js';
import { box, cyl, partsToGeo } from '../world/builders.js';

export class Activities {
  constructor(game) {
    this.game = game;
    const lap = hippoLapPoints();
    // Départ dans la ligne droite des tribunes, 25 m avant le poteau, après les stalles de départ.
    const lapStart = ovalPoint(HIPPO.half - 25, HIPPO_LAP.r);
    this.defs = [
      {
        id: 'beach_sprint', name: 'Sprint de la plage', kind: 'Galop', desc: '8 anneaux le long de la mer, de l’Écurie des Dunes à Deauvelle, sur le sable ferme au bord de l’eau (plus loin à marée basse).',
        start: { x: 505, z: -385 },
        build: (g, run, S) => {
          const xs = [];
          for (let i = 0; i < 8; i++) xs.push(470 - i * 72);
          const pts = beachRingPoints(g, xs, { eta: (i) => 12 + i * 7, wobble: (i) => Math.sin(i * 1.7) * 4 });
          return [checkpointSteps(g, run, S, pts, { text: 'Sprint de la plage', mode: 'ride' })];
        },
      },
      {
        id: 'cso_train', name: 'Parcours du Pôle', kind: 'CSO', desc: 'Les 9 obstacles du Pôle International, hauteur entraînement.',
        start: { x: CSO_START.x, z: CSO_START.z },
        build: (g, run, S) => courseSteps(g, run, S, { courseId: 'cso', start: CSO_START, finish: CSO_FINISH, timeAllowed: timeAllowedFor(COURSE_LENGTH.cso, COURSE_SPEED.national), heights: [1.1, 1.1, 1.1, 1.15, 1.1, 1.15, 1.1, 1.15, 1.1] }),
        penalties: true,
      },
      {
        id: 'xc_train', name: 'Cross de Saint-Gatien', kind: 'Cross', desc: '10 obstacles en forêt, mare comprise.',
        start: { x: GATIEN.start.x + 4, z: GATIEN.start.z },
        build: (g, run, S) => courseSteps(g, run, S, { courseId: 'xc', kind: 'xc', start: { x: GATIEN.start.x + 4, z: GATIEN.start.z }, finish: { x: GATIEN.start.x, z: GATIEN.start.z, w: 7 }, timeAllowed: 110 }),
        penalties: true,
      },
      {
        id: 'hippo_lap', name: 'Tour de l’hippodrome', kind: 'Galop', desc: 'Un tour de piste chronométré. Gère l’endurance !',
        start: { x: lapStart[0], z: lapStart[1] },
        // Poteau du chrono derrière la lice extérieure (pas sur le sable de la piste).
        marker: { x: lapStart[0], z: HIPPO.z - HIPPO.radius - HIPPO.width / 2 - 1.5 },
        build: (g, run, S) => [checkpointSteps(g, run, S, lap, { text: 'Tour de piste', mode: 'ride', r: HIPPO_LAP.pass })],
      },
    ];
    this._markers();
  }

  list() {
    return this.defs;
  }

  _markers() {
    const g = this.game;
    const geo = partsToGeo([
      [cyl(0.06, 0.07, 3.2, 6), '#f2f1ec'],
      [box(0.04, 0.9, 1.4, false), '#15161a', { y: 2.7, z: 0.7 }],
      [box(0.045, 0.5, 0.5, false), '#f2f1ec', { y: 2.7, z: 0.7 }],
    ]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
    for (const a of this.defs) {
      const m = new THREE.Mesh(geo, mat);
      const mk = a.marker || { x: a.start.x + 3, z: a.start.z };
      m.position.set(mk.x, g.terrain.getHeight(mk.x, mk.z), mk.z);
      m.castShadow = true;
      g.scene.add(m);
      // Poteau fin : masqué au-delà de 300 m (un ou deux pixels), comme les obstacles.
      g.world.culled.push([m, m.position.x, m.position.z, 300]);
      g.interact.add(`act:${a.id}`, {
        label: 'Chrono',
        icon: 'target',
        r: 6,
        priority: 1,
        modes: ['ride'],
        x: a.start.x,
        z: a.start.z,
        when: () => !g.missions.active,
        action: () => this.start(a),
      });
    }
  }

  start(a) {
    const g = this.game;
    const best = g.save.data.bestTimes[a.id];
    // Mesure : activité lancée après au moins une mission terminée (événement unique par partie).
    const d = g.save.data;
    if (d.completed.length || d.stats.jobs) g.metrics?.track('second_activity_started', { course: a.kind === 'CSO' ? 'cso' : a.kind === 'Cross' ? 'xc' : 'galop' });
    const def = {
      id: a.id, vertical: 'EVENEMENTS', category: 'Entraînement', title: a.name, desc: a.desc, client: null, place: a.start, placeName: a.name,
      pay: 0, xp: 15, noReview: true, noCount: true,
      steps: (game, run, S) => {
        const steps = a.build(game, run, S);
        steps.push(
          S.custom({
            text: '',
            start(r) {
              const t = r.data.course ? r.data.course.t : r.t;
              const pen = a.penalties ? totalPenalties(r) : 0;
              const score = t + pen;
              const rec = !best || score < best;
              if (rec) game.save.data.bestTimes[a.id] = score;
              // Classement en ligne : chrono et pénalités de cette performance.
              game.reportScore(a.id, { pen, time: t, horse: game.player.horse?.name || '' });
              r.resultTitle = rec ? 'Nouveau record' : 'Chrono';
              r.resultTime = score;
              r.resultTimeLabel = a.penalties ? 'Temps + pénalités' : 'Chrono';
              r.resultBody = `${a.penalties ? `Pénalités : ${pen} · ` : ''}Meilleur : ${formatTime(Math.min(score, best || score))}`;
            },
            update: () => true,
          })
        );
        return steps;
      },
    };
    g.missions.start({ id: `act:${a.id}`, def, story: false, vertical: 'EVENEMENTS', category: 'Entraînement', title: a.name, pay: 0, xp: 15, place: a.start, placeName: a.name });
  }
}
