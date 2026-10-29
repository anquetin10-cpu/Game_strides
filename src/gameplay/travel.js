// Voyage en camion Deauville ↔ Paris (Grand Prix de Paris Indoor) : au bout de l'autoroute (sortie est de la route
// Est-Ouest, côté Deauville ; voie d'accès du parking, côté Paris), le camion Strides à l'arrêt se voit proposer le
// trajet. Écran de voyage (200 km, 2 h 10, gazole consommé), puis arrivée au parking de l'autre région, chevaux à bord.
import { PARIS } from '../world/sites.js';
import { regionOf } from '../world/layout.js';

// Bretelles d'autoroute : là où l'on part, et où l'on arrive (camion tourné vers l'intérieur de la région).
export const A13 = {
  deauville: { x: 546, z: -118, r: 12, name: 'la bretelle de l’autoroute A13 (sortie est)', arrive: { x: 536, z: -117, h: -Math.PI / 2 } },
  paris: { x: PARIS.exit.x, z: PARIS.exit.z, r: 12, name: 'la bretelle de l’autoroute A13 (Paris)', arrive: { x: PARIS.park.x - 4, z: PARIS.park.z, h: Math.PI / 2 } },
};
export const TRIP = { km: 200, minutes: 130, fuelL: 46 };

export class Travel {
  constructor(game) {
    this.game = game;
    this.prompted = false;
    this.busy = false;
  }

  // Bretelle de la région où se trouve le camion (ou null).
  exitHere() {
    const t = this.game.truck;
    const r = regionOf(t.pos.x);
    const e = A13[r];
    return Math.hypot(t.pos.x - e.x, t.pos.z - e.z) < e.r ? r : null;
  }

  update() {
    const g = this.game;
    if (this.busy || g.state !== 'play' || !g.player.inTruck) return;
    const here = this.exitHere();
    if (!here) {
      this.prompted = false;
      return;
    }
    if (this.prompted || Math.abs(g.truck.speed) > 4) return;
    this.prompted = true;
    this.prompt(here);
  }

  // Motif qui empêche le départ (ou null).
  blocker(from) {
    const g = this.game;
    const t = g.truck;
    if (!g.player.inTruck) return 'Monte au volant du camion Strides.';
    if (t.sim.fuelL < TRIP.fuelL + 2) return `Pas assez de gazole pour ${TRIP.km} km (${TRIP.fuelL} l nécessaires) : fais le plein à la station-service.`;
    const h = g.mainHorse;
    // Le cheval ne reste pas seul à Paris.
    if (from === 'paris' && h && regionOf(h.pos.x) === 'paris' && !g.player.transport.isAboard(h)) return `Charge d’abord ${h.name} dans le camion : il ne rentre pas sans toi.`;
    return null;
  }

  prompt(from) {
    const g = this.game;
    const to = from === 'paris' ? 'deauville' : 'paris';
    const why = this.blocker(from);
    const aboard = g.player.transport.aboard.map((a) => a.horse.name);
    const dest = to === 'paris' ? 'Paris · Grand Prix de Paris Indoor' : 'Deauville City · Côte Fleurie';
    this.card?.remove();
    this.card = g.screens.card({
      kicker: 'Autoroute A13',
      title: to === 'paris' ? 'Direction Paris' : 'Retour en Normandie',
      body: why || `${dest} : ${TRIP.km} km, environ 2 h 10 de route. ${aboard.length ? `À bord : ${aboard.join(', ')}.` : 'Aucun cheval à bord.'} Gazole : environ ${TRIP.fuelL} l.`,
      buttons: why
        ? [{ label: 'Compris', primary: true, id: 'travel-no' }]
        : [
            { label: 'Rester ici', id: 'travel-no' },
            { label: to === 'paris' ? 'Partir pour Paris' : 'Rentrer à Deauville', primary: true, id: 'travel-go', run: () => this.go(to) },
          ],
    });
  }

  // Trajet : fondu, route (heure, gazole), arrivée au parking de l'autre région.
  go(to) {
    const g = this.game;
    if (this.busy) return;
    this.busy = true;
    // Proposition encore affichée (départ lancé autrement) : refermée.
    this.card?.remove();
    this.card = null;
    const t = g.truck;
    const arrive = A13[to].arrive;
    const run = () => {
      t.speed = 0;
      t.setPosition(arrive.x, arrive.z, arrive.h);
      t.sim.fuelL = Math.max(0, t.sim.fuelL - TRIP.fuelL);
      g.save.data.gameTime += TRIP.minutes * 60;
      g.setRegion(to);
      g.cam.snap(g.player.focus.pos, t.heading);
      g.cam.yaw = t.heading + Math.PI;
      this.prompted = true;
      this.busy = false;
      g.bus.emit('travel', { to });
      g.saveNow?.();
    };
    if (g.syncFade) {
      run();
      return;
    }
    g.screens.fade(true);
    g.audio?.truckEngine?.({ on: true, rpm: 1400, load: 0.5, speed: 25, dist: 0, inside: true });
    setTimeout(() => {
      run();
      g.screens.card({
        kicker: `Autoroute A13 · ${TRIP.km} km`,
        title: to === 'paris' ? 'Bienvenue à Paris' : 'De retour en Normandie',
        body: to === 'paris' ? 'Arrivée au parking des camions du Grand Prix de Paris Indoor. Écuries provisoires et paddock à l’est, l’arène derrière.' : 'Retour sur la Côte Fleurie par la sortie est : l’Écurie du Val est à l’ouest.',
        buttons: [{ label: 'Continuer', primary: true, id: 'travel-ok' }],
      });
      setTimeout(() => g.screens.fade(false), 200);
    }, 500);
  }
}
