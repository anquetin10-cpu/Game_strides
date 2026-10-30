// Voyage en camion Deauville ↔ Paris (Grand Prix de Paris Indoor) : au bout de l'autoroute (sortie est de la route
// Est-Ouest, côté Deauville ; voie d'accès du parking, côté Paris), le camion Strides à l'arrêt se voit proposer le
// trajet. Écran de voyage (200 km, 2 h 10, gazole consommé), puis arrivée au parking de l'autre région, chevaux à bord.
import { PARIS } from '../world/sites.js';
import { regionOf } from '../world/layout.js';
import { t, T } from '../core/i18n.js';
import { STATION } from '../world/sites.js';
import { fillQuote, FUEL_NAMES } from './fuel.js';
import { dec } from '../core/math.js';

// Bretelles d'autoroute : là où l'on part, et où l'on arrive (camion tourné vers l'intérieur de la région).
export const A13 = {
  deauville: { x: 546, z: -118, r: 12, name: t('la bretelle de l’autoroute A13 (sortie est)'), arrive: { x: 536, z: -117, h: -Math.PI / 2 } },
  paris: { x: PARIS.exit.x, z: PARIS.exit.z, r: 12, name: t('la bretelle de l’autoroute A13 (Paris)'), arrive: { x: PARIS.park.x - 4, z: PARIS.park.z, h: Math.PI / 2 } },
};
export const TRIP = { km: 200, minutes: 130, fuelL: 46 };
// Aire de service de l'A13, à chaque bretelle : gazole un peu plus cher qu'à la station de Deauville City. Sans elle, le
// réservoir du camion (80 l) ne permet pas l'aller-retour (2 × 46 l + réserve).
export const AIRE = { name: t('l’aire de service de l’A13'), prices: { diesel: Math.round(STATION.prices.diesel * 1.08 * 100) / 100, petrol: Math.round(STATION.prices.petrol * 1.08 * 100) / 100 } };

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
    const tk = g.truck;
    if (!g.player.inTruck) return t('Monte au volant du camion Strides.');
    if (tk.sim.fuelL < TRIP.fuelL + 2) {
      // Plein possible à l'aire de service (proposé sur la carte) ; sinon, solde insuffisant.
      const q = fillQuote(tk.sim, g.save.data.money, AIRE.prices);
      if (tk.sim.fuelL + q.litres >= TRIP.fuelL + 2) return null;
      return T`Pas assez de gazole pour ${TRIP.km} km (${TRIP.fuelL} l nécessaires) et pas assez d’argent pour le plein à l’aire de service (${dec(AIRE.prices.diesel, 2)} €/l).`;
    }
    const h = g.mainHorse;
    // Le cheval ne reste pas seul à Paris.
    if (from === 'paris' && h && regionOf(h.pos.x) === 'paris' && !g.player.transport.isAboard(h)) return T`Charge d’abord ${h.name} dans le camion : il ne rentre pas sans toi.`;
    return null;
  }

  prompt(from) {
    const g = this.game;
    const to = from === 'paris' ? 'deauville' : 'paris';
    const why = this.blocker(from);
    const aboard = g.player.transport.aboard.map((a) => a.horse.name);
    const dest = to === 'paris' ? 'Paris · Grand Prix de Paris Indoor' : 'Deauville City · Côte Fleurie';
    this.card?.remove();
    // Réservoir trop bas pour le trajet : plein à l'aire de service, puis la proposition de départ.
    const tk = g.truck;
    if (!why && tk.sim.fuelL < TRIP.fuelL + 2) {
      const q = fillQuote(tk.sim, g.save.data.money, AIRE.prices);
      this.card = g.screens.card({
        kicker: t('Autoroute A13'),
        title: t('Plein avant la route'),
        body: T`${Math.round(tk.sim.fuelL)} l dans le réservoir, ${TRIP.fuelL} l nécessaires pour ${TRIP.km} km. Plein à ${AIRE.name} : ${dec(q.litres, 1)} l de ${FUEL_NAMES.diesel} à ${dec(q.price, 2)} €/l, soit ${dec(q.cost, 2)} €.`,
        buttons: [
          { label: t('Rester ici'), id: 'travel-no' },
          {
            label: t('Faire le plein'), primary: true, id: 'travel-fuel',
            run: () => {
              tk.sim.refuel(q.litres);
              g.save.data.money -= q.cost;
              g.updateWallet();
              g.hud.toast(T`Plein : ${dec(q.litres, 1)} l à ${dec(q.price, 2)} €/l · ${dec(q.cost, 2)} €`, 'money');
              g.saveSoon?.();
              setTimeout(() => this.prompt(from), 250);
            },
          },
        ],
      });
      return;
    }
    this.card = g.screens.card({
      kicker: t('Autoroute A13'),
      title: to === 'paris' ? t('Direction Paris') : t('Retour en Normandie'),
      body: why || T`${dest} : ${TRIP.km} km, environ 2 h 10 de route. ${aboard.length ? T`À bord : ${aboard.join(', ')}.` : t('Aucun cheval à bord.')} Gazole : environ ${TRIP.fuelL} l.`,
      buttons: why
        ? [{ label: t('Compris'), primary: true, id: 'travel-no' }]
        : [
            { label: t('Rester ici'), id: 'travel-no' },
            { label: to === 'paris' ? t('Partir pour Paris') : t('Rentrer à Deauville'), primary: true, id: 'travel-go', run: () => this.go(to) },
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
    const tk = g.truck;
    const arrive = A13[to].arrive;
    const run = () => {
      tk.speed = 0;
      tk.setPosition(arrive.x, arrive.z, arrive.h);
      tk.sim.fuelL = Math.max(0, tk.sim.fuelL - TRIP.fuelL);
      g.save.data.gameTime += TRIP.minutes * 60;
      g.setRegion(to);
      g.cam.snap(g.player.focus.pos, tk.heading);
      g.cam.yaw = tk.heading + Math.PI;
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
        kicker: T`Autoroute A13 · ${TRIP.km} km`,
        title: to === 'paris' ? t('Bienvenue à Paris') : t('De retour en Normandie'),
        body: to === 'paris' ? t('Arrivée au parking des camions du Grand Prix de Paris Indoor. Écuries provisoires et paddock à l’est, l’arène derrière.') : t('Retour sur la Côte Fleurie par la sortie est : l’Écurie du Val est à l’ouest.'),
        buttons: [{ label: t('Continuer'), primary: true, id: 'travel-ok' }],
      });
      setTimeout(() => g.screens.fade(false), 200);
    }, 500);
  }
}
