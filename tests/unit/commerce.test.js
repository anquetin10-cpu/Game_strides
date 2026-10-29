// Règles d'achat des commerces de Deauville City (commerce.js) : un seul débit par achat, solde insuffisant sans effet,
// consommables cumulables, équipement par emplacement, compatibilité des anciennes sauvegardes.
import { describe, it, expect, beforeEach } from 'vitest';
import { Commerce, DOUBLE_TAP_MS } from '../../src/gameplay/commerce.js';
import { SHOP } from '../../src/gameplay/data.js';
import { defaultSave } from '../../src/core/save.js';

function fakeGame(data) {
  const saved = [];
  const g = {
    save: { data },
    saved,
    toasts: [],
    hud: { toast: (t) => g.toasts.push(t) },
    audio: { coin() {} },
    updateWallet() {},
    saveNow() {
      saved.push(JSON.stringify(data));
    },
    mainHorse: { mods: {}, cond: { hydration: 40, clean: 50, hooves: 60, energy: 70 }, pos: { x: 0, z: 0 }, def: { name: 'Comète' } },
    player: { mode: 'ride', human: { pos: { x: 0, z: 0 } }, _rebuild() {} },
    applyUpgrades() {},
    refreshTack() {},
  };
  return g;
}

describe('commerce', () => {
  let g, c;
  beforeEach(() => {
    const d = defaultSave();
    d.money = 1000;
    g = fakeGame(d);
    c = new Commerce(g);
  });

  it('un achat débite le prix et attribue l’article une seule fois, et la sauvegarde contient les deux', () => {
    const r = c.purchase('selle', { now: 0 });
    expect(r.ok).toBe(true);
    expect(g.save.data.money).toBe(620);
    expect(g.save.data.upgrades).toEqual(['selle']);
    const last = JSON.parse(g.saved.at(-1));
    expect(last.money).toBe(620);
    expect(last.upgrades).toContain('selle');
  });

  it('double appui : un seul débit', () => {
    c.purchase('electrolytes', { now: 0 });
    const r = c.purchase('electrolytes', { now: DOUBLE_TAP_MS / 3 });
    expect(r.reason).toBe('dup');
    expect(c.qty('electrolytes')).toBe(1);
    expect(g.save.data.money).toBe(991);
  });

  it('consommable : un nouvel achat volontaire ajoute une unité', () => {
    c.purchase('electrolytes', { now: 0 });
    c.purchase('electrolytes', { now: DOUBLE_TAP_MS + 10 });
    expect(c.qty('electrolytes')).toBe(2);
    expect(g.save.data.money).toBe(982);
  });

  it('article unique : second achat refusé sans débit', () => {
    c.purchase('guetres', { now: 0 });
    const r = c.purchase('guetres', { now: 5000 });
    expect(r).toEqual({ ok: false, reason: 'owned' });
    expect(g.save.data.money).toBe(700);
  });

  it('solde insuffisant : ni l’argent ni l’inventaire ne changent', () => {
    g.save.data.money = 100;
    const before = JSON.stringify(g.save.data);
    const r = c.purchase('selle', { now: 0 });
    expect(r.reason).toBe('money');
    expect(JSON.stringify(g.save.data)).toBe(before);
  });

  it('restriction : la selle CSO Pro demande la selle mixte', () => {
    g.save.data.money = 5000;
    expect(c.purchase('selle_pro', { now: 0 }).reason).toBe('locked');
    c.purchase('selle', { now: 0 });
    expect(c.purchase('selle_pro', { now: 5000 }).ok).toBe(true);
  });

  it('équipement : la nouvelle selle n’écrase pas un choix ; « Équiper » change l’article actif', () => {
    g.save.data.money = 5000;
    c.purchase('selle', { now: 0 });
    c.purchase('selle_pro', { now: 5000 });
    expect(c.equipped('selle')).toBe('selle');
    c.equip('selle_pro');
    expect(c.equipped('selle')).toBe('selle_pro');
    expect(c.isActive('selle')).toBe(false);
  });

  it('ancienne sauvegarde (sans emplacements) : la dernière selle achetée est portée, bonus de saut conservé', () => {
    g.save.data.upgrades = ['selle', 'selle_pro', 'guetres'];
    delete g.save.data.equipped;
    expect(c.equipped('selle')).toBe('selle_pro');
    const jump = g.save.data.upgrades.filter((id) => c.isActive(id)).reduce((s, id) => s + (SHOP.find((x) => x.id === id).effect.jump || 0), 0);
    expect(jump).toBeCloseTo(0.24);
    expect(c.isActive('guetres')).toBe(true);
  });

  it('consommable utilisé sur le cheval monté : soin appliqué, une unité retirée', () => {
    c.purchase('electrolytes', { now: 0 });
    expect(c.use('electrolytes')).toBe(true);
    expect(g.mainHorse.cond.hydration).toBe(75);
    expect(c.qty('electrolytes')).toBe(0);
  });

  it('tenue : un haut équipé et l’essai en boutique remplacent les couleurs du haut', () => {
    c.purchase('polo_blanc', { now: 0 });
    expect(c.wear().top).toBe('#f2f1ec');
    expect(c.wear('pull_marin').top).toBe('#1f2b45');
  });

  it('catalogue : chaque article a un prix, une catégorie, un commerce et un effet décrit', () => {
    for (const s of SHOP) {
      expect(s.price).toBeGreaterThan(0);
      expect(s.cat && s.shop && s.desc).toBeTruthy();
    }
  });
});
