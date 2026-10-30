// Box du cheval à l'Écurie du Val : on y rentre son cheval (« Rentrer au box »), il y récupère (repos, foin à volonté,
// abreuvoir automatique), on va l'y chercher (« Sortir du box »). Le box est celui du bout ouest de l'allée, côté prés ;
// la plaque porte le nom du cheval. Le cheval au box ne vient pas au sifflet.
import { HOME } from '../world/sites.js';
import { t, T } from '../core/i18n.js';

// Box n° 1 côté prés (repère de l'écurie du Val : boxes de 3,6 m depuis le pignon ouest, allée de 3,6 m).
export const HOME_BOX = {
  x: HOME.barn.x - HOME.barn.w / 2 + 0.25 + 1.8,
  z: HOME.barn.z - 3.1, // cheval dans le box, tête au-dessus de la porte
  door: { x: HOME.barn.x - HOME.barn.w / 2 + 0.25 + 1.8, z: HOME.barn.z - 1.1 }, // devant la porte, dans l'allée
};

// Récupération au box (par seconde de jeu) : eau et foin à volonté.
export function boxCare(c, dt) {
  c.hydration = Math.min(100, c.hydration + 0.5 * dt);
  c.satiety = Math.min(100, c.satiety + 0.15 * dt);
  c.resting = true;
}

export function installStabling(game) {
  const g = game;
  const horse = () => g.mainHorse;
  const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
  const putIn = (h, quiet = false) => {
    g.player.transport?.release?.(true);
    h.ai = null;
    h.frozen = true;
    h.inBox = true;
    h.setPosition(HOME_BOX.x, HOME_BOX.z, 0);
    h.cond.resting = true;
    g.save.data.horseInBox = h.id;
    if (!quiet) g.hud.toast(T`${h.name} est au box : repos, foin et eau à volonté.`);
  };
  const takeOut = (h, quiet = false) => {
    h.inBox = false;
    h.frozen = false;
    h.cond.resting = false;
    h.setPosition(HOME_BOX.door.x + 1.2, HOME_BOX.door.z + 0.3, Math.PI / 2);
    delete g.save.data.horseInBox;
    if (!quiet) g.hud.toast(T`${h.name} sort du box.`);
  };
  g.stabling = { putIn, takeOut };

  g.interact.add('box-in', {
    label: t('Rentrer au box'), icon: 'horse', r: 2.6, priority: 2.2, modes: ['foot'],
    getPos: () => HOME_BOX.door,
    when: () => {
      const h = horse();
      return !!h && !h.inBox && !h.rider && !h.hiddenInTruck && !g.player.locked && !g.missions.active && near(h.pos, HOME_BOX.door, 8);
    },
    action: () => g.fade(() => {
      putIn(horse());
      g.saveSoon?.();
    }, 0.4),
  });
  g.interact.add('box-out', {
    label: t('Sortir du box'), icon: 'horse', r: 2.6, priority: 2.2, modes: ['foot'],
    getPos: () => HOME_BOX.door,
    when: () => !!horse()?.inBox && !g.player.locked,
    action: () => g.fade(() => {
      takeOut(horse());
      g.saveSoon?.();
    }, 0.4),
  });
  // Une mission a besoin du cheval : il est sorti du box (prêt dans l'allée).
  // (Sauf mission qui fait aller chercher le cheval au box : « Premiers pas ».)
  g.bus.on('mission:start', (run) => {
    const h = horse();
    if (h?.inBox && !run?.offer?.def?.keepInBox) {
      takeOut(h, true);
      g.hud.hint(T`${h.name} est sorti(e) du box : il ou elle t’attend dans l’allée de l’Écurie du Val.`, 5000);
    }
  });
}
