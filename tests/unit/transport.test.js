import { describe, it, expect, vi } from 'vitest';

// Modèle de cheval simulé : seule compte la présence de setHorseTack (sellerie modifiable).
const calls = [];
vi.mock('../../src/entities/horseModel.js', () => ({
  setHorseTack: (mesh, cfg) => {
    calls.push(cfg);
    const c = mesh.userData.tack.userData.cfg;
    mesh.userData.tack.userData.cfg = { saddle: cfg.saddle ?? c.saddle, mounted: cfg.mounted ?? c.mounted, boots: cfg.boots ?? c.boots };
  },
}));

const { Transport } = await import('../../src/gameplay/transport.js');

const horse = (saddle = true) => ({ mesh: { userData: { tack: { userData: { cfg: { saddle, mounted: false, boots: saddle } } } } } });

describe('tenue de voyage', () => {
  it('licol seul à bord, sellerie d’origine rendue en remontant', () => {
    const h = horse(true);
    const tp = Object.create(Transport.prototype);
    tp.travelTack(h, true);
    expect(h.mesh.userData.tack.userData.cfg.saddle).toBe(false);
    // Deux passages (début de chargement puis mise à bord) : l'état d'origine est conservé.
    tp.travelTack(h, true);
    tp.travelTack(h, false);
    expect(h.mesh.userData.tack.userData.cfg).toMatchObject({ saddle: true, boots: true });
    expect(h._tpTack).toBe(null);
    // Rien à rendre si le cheval n'a pas voyagé.
    const n = calls.length;
    tp.travelTack(h, false);
    expect(calls.length).toBe(n);
  });
  it('un cheval sans selle (licol) le reste après le voyage', () => {
    const h = horse(false);
    const tp = Object.create(Transport.prototype);
    tp.travelTack(h, true);
    tp.travelTack(h, false);
    expect(h.mesh.userData.tack.userData.cfg.saddle).toBe(false);
  });
  it('sans sellerie modifiable : aucun effet', () => {
    const tp = Object.create(Transport.prototype);
    expect(() => tp.travelTack({ mesh: { userData: {} } }, true)).not.toThrow();
    expect(() => tp.travelTack(null, false)).not.toThrow();
  });
});
