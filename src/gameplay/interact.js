// Points d'interaction contextuels (bouton Action) : monter, parler, prendre, livrer…
export class Interactions {
  constructor(game) {
    this.game = game;
    this.list = new Map();
    this.current = null;
  }
  add(id, def) {
    this.list.set(id, { r: 3, priority: 1, modes: ['foot', 'ride'], ...def, id });
    return id;
  }
  remove(id) {
    this.list.delete(id);
  }
  has(id) {
    return this.list.has(id);
  }
  update() {
    const p = this.game.player;
    const pos = p.focusPos;
    const mode = p.mode;
    let best = null;
    let bestScore = -Infinity;
    for (const it of this.list.values()) {
      if (!it.modes.includes(mode)) continue;
      const ip = it.getPos ? it.getPos() : it;
      const d = Math.hypot(ip.x - pos.x, ip.z - pos.z);
      if (d > it.r) continue;
      if (it.when && !it.when()) continue;
      const score = it.priority * 100 - d;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.current = best;
    return best;
  }
  trigger() {
    const it = this.current;
    if (!it) return false;
    it.action();
    this.game.audio?.click();
    return true;
  }
}
