// Carburant : plein à la station-service de Deauville City (gazole ou sans-plomb selon le véhicule, payé au litre), alerte
// de réserve, panne sèche et dépannage, niveau du camion Strides conservé dans la sauvegarde.
import { STATION } from '../world/sites.js';
import { clamp, dec } from '../core/math.js';

export const FUEL_NAMES = { diesel: 'gazole', petrol: 'sans-plomb 95-E10' };
const ASSIST = { litres: 10, price: 35, delay: 6 }; // dépannage : 10 l livrés sur place

// Litres versés et prix d'un plein (ou de ce que l'argent disponible permet).
export function fillQuote(sim, money, prices = STATION.prices) {
  const price = prices[sim.spec.fuel || 'diesel'];
  const need = Math.max(0, (sim.spec.tank || 60) - sim.fuelL);
  const litres = Math.min(need, Math.floor((Math.max(0, money) / price) * 100) / 100);
  return { litres, price, cost: Math.round(litres * price * 100) / 100, need };
}

export function nearPump(pos) {
  return STATION.islands.some((ix) => Math.abs(pos.x - ix) < 3.6 && Math.abs(pos.z - STATION.z) < 6.5);
}

export function installFuel(game) {
  const g = game;
  const veh = () => (g.player.mode === 'drive' ? g.player.vehicle : null);
  const data = () => g.save.data;

  g.interact.add('fuel-fill', {
    label: 'Faire le plein', icon: 'hand', r: 1e9, priority: 2, modes: ['drive'],
    getPos: () => g.player.focusPos,
    when: () => {
      const v = veh();
      return !!v && v.stopped && !g.player.locked && nearPump(v.pos) && v.sim.fuelL < (v.sim.spec.tank || 60) - 1;
    },
    action: () => {
      const v = veh();
      const d = data();
      const q = fillQuote(v.sim, d.money);
      if (q.litres < 1) {
        g.hud.toast('Pas assez d’argent pour faire le plein.');
        return;
      }
      const lock = { fuel: true };
      g.player.locked = lock;
      v.stopEngine();
      g.hud.toast(`Moteur coupé · ${FUEL_NAMES[v.sim.spec.fuel || 'diesel']} : plein en cours…`);
      // ~40 l/min à la pompe, temps raccourci pour le jeu.
      setTimeout(() => {
        v.sim.refuel(q.litres);
        d.money -= q.cost;
        g.updateWallet();
        if (g.player.locked === lock) g.player.locked = false;
        v._lowWarned = false;
        g.hud.toast(`${q.litres < q.need ? 'Appoint' : 'Plein'} : ${dec(q.litres, 1)} l de ${FUEL_NAMES[v.sim.spec.fuel || 'diesel']} à ${dec(q.price, 2)} €/l · ${dec(q.cost, 2)} €`, 'money');
        if (g.player.vehicle === v) v.startEngine();
        g.saveSoon?.();
      }, clamp(q.litres / 40, 1.5, 4) * 1000);
    },
  });

  // Réserve et panne sèche (vérifiées deux fois par seconde).
  let assist = null;
  setInterval(() => {
    const v = veh();
    if (!v || g.state !== 'play') return;
    const s = v.sim, tank = s.spec.tank || 60;
    if (s.fuelL < tank * 0.12 && !s.dry && !v._lowWarned) {
      v._lowWarned = true;
      g.hud.hint(`<b>Réserve de carburant</b> : ${Math.round(s.fuelL)} l, environ ${Math.round(s.rangeKm)} km. Station-service à l’entrée nord de Deauville City.`, 6000);
    }
    if (s.dry && !assist) {
      assist = v;
      g.hud.hint('<b>Panne sèche</b> : le moteur a calé. Un dépanneur t’apporte du carburant…', 5000);
      setTimeout(() => {
        const d = data();
        const pay = Math.min(Math.max(0, d.money), ASSIST.price);
        assist.sim.refuel(ASSIST.litres);
        d.money -= pay;
        g.updateWallet();
        g.message('Dépannage', 'DP', `Livraison de ${ASSIST.litres} l de ${FUEL_NAMES[assist.sim.spec.fuel || 'diesel']} sur place (${dec(pay, 2)} €). De quoi rejoindre la station-service à l’entrée nord de Deauville City.`);
        if (g.player.vehicle === assist) assist.startEngine();
        assist = null;
      }, ASSIST.delay * 1000);
    }
  }, 500);
}
