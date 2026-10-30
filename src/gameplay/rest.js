// Repos : à la maison de l'Écurie du Val, le soir ou la nuit, « Dormir jusqu'au matin » avance l'heure à 7 h (cheval
// reposé). Possible sans mission en cours, ou en attendant un passage en concours programmé le lendemain matin.
import { HOME } from '../world/sites.js';
import { t } from '../core/i18n.js';

export const WAKE_HOUR = 7;

// Temps de jeu (s) du prochain réveil à WAKE_HOUR.
export function nextMorning(gameTime) {
  const day = Math.floor(gameTime / 86400);
  let t = day * 86400 + WAKE_HOUR * 3600;
  if (t <= gameTime) t += 86400;
  return t;
}

export function installRest(game) {
  const g = game;
  const door = { x: HOME.house.x, z: HOME.house.z + HOME.house.d / 2 + 1.2 };
  g.interact.add('rest', {
    label: t('Dormir jusqu’au matin'), icon: 'hand', r: 3.2, priority: 1.4, modes: ['foot'],
    getPos: () => door,
    when: () => {
      const h = g.hour();
      const run = g.missions.active;
      return (h >= 19.5 || h < 6) && !g.player.locked && (!run || run.def?.id === 'concours');
    },
    action: () => {
      g.player.locked = true;
      g.fade(() => {
        const d = g.save.data;
        d.gameTime = nextMorning(d.gameTime);
        const c = g.mainHorse?.cond;
        if (c) {
          c.energy = 100;
          c.resting = false;
        }
        g.player.locked = false;
        g.hud.toast(t('Bonne nuit… Il est 7 h : le jour se lève.'));
        g.saveNow();
      }, 1.2);
    },
  });
}
