import { describe, it, expect } from 'vitest';
import {
  DEFI_POLE_V1, CHALLENGES, timeFaults, makeResult, compareResults, recordResult, bestOf, cleanPseudo, shareText, publicUrl, newAttemptId, rulesText, conditionsList,
} from '../../src/gameplay/challenge.js';
import { conditionText, rainTarget } from '../../src/world/weather.js';
import { defaultSave, validateSave, SaveSystem } from '../../src/core/save.js';

const cfg = DEFI_POLE_V1;
const res = (o) => makeResult(cfg, { attempt: o.attempt || `a${Math.random()}`, faults: 0, refusals: 0, rails: 0, t: 60, ...o });

describe('défi defi-pole-v1 : configuration versionnée', () => {
  it('conditions fixes de la version 1', () => {
    expect(cfg.id).toBe('defi-pole-v1');
    expect(cfg.version).toBe(1);
    expect(CHALLENGES['defi-pole-v1']).toBe(cfg);
    expect(cfg.obstacles).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cfg.height).toBe(1.1);
    expect(cfg.timeAllowed).toBe(75);
    expect(cfg.horse).toMatchObject({ name: 'Onyx', speed: 1.13, jump: 1.06, stamina: 1 });
    expect(cfg.weather).toMatchObject({ hour: 11, rain: 0, wet: 0 });
    expect(cfg.jumpAid).toBe(true);
    expect(cfg.rules).toEqual({ rail: 4, firstRefusal: 4, refusalsToEliminate: 2, timeFaultPerSecond: 1 });
  });
  it('configuration figée (immuable)', () => {
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen(cfg.horse)).toBe(true);
    expect(Object.isFrozen(cfg.obstacles)).toBe(true);
    expect(() => {
      'use strict';
      cfg.horse.speed = 2;
    }).toThrow();
    expect(cfg.horse.speed).toBe(1.13);
  });
  it('météo fixe : jour dégagé, sans pluie, à 11 h', () => {
    expect(conditionText(cfg.weather.day, cfg.weather.hour)).toBe('Ensoleillé');
    expect(rainTarget(cfg.weather.day, cfg.weather.hour)).toBe(0);
  });
  it('règle de classement et conditions lisibles', () => {
    const t = rulesText(cfg).join(' ');
    expect(t).toMatch(/4 points par barre/);
    expect(t).toMatch(/premier refus/);
    expect(t).toMatch(/second refus/);
    expect(t).toMatch(/seconde entamée/);
    expect(t).toMatch(/chrono/);
    expect(conditionsList(cfg).map((r) => r[0])).toEqual(['Parcours', 'Cheval fourni', 'Météo', 'Temps accordé', 'Aide au saut']);
  });
});

describe('pénalités et classement', () => {
  it('1 point par seconde entamée au-delà du temps accordé', () => {
    expect(timeFaults(75, 75)).toBe(0);
    expect(timeFaults(74.99, 75)).toBe(0);
    expect(timeFaults(75.01, 75)).toBe(1);
    expect(timeFaults(76, 75)).toBe(1);
    expect(timeFaults(76.2, 75)).toBe(2);
  });
  it('résultat : barres, refus et temps ; élimination sans pénalités', () => {
    const r = makeResult(cfg, { attempt: 'x', faults: 8, refusals: 1, rails: 1, t: 77.5 });
    expect(r).toMatchObject({ challenge: 'defi-pole-v1', faults: 8, timeFaults: 3, penalties: 11, eliminated: null, horse: 'Onyx', time: 77.5 });
    const e = makeResult(cfg, { attempt: 'y', faults: 8, refusals: 2, t: 40, eliminated: '2e refus : éliminé du parcours.' });
    expect(e.penalties).toBeNull();
    expect(e.eliminated).toMatch(/refus/);
  });
  it('pénalités d’abord, puis chrono ; éliminé en dernier', () => {
    const clear70 = res({ t: 70 });
    const clear65 = res({ t: 65 });
    const four50 = res({ faults: 4, t: 50 });
    const over = res({ t: 76.5 }); // 2 pénalités de temps
    const elim = res({ eliminated: 'Éliminé', t: 20 });
    const sorted = [elim, four50, over, clear70, clear65].sort(compareResults);
    expect(sorted).toEqual([clear65, clear70, over, four50, elim]);
    expect(compareResults(clear65, clear70)).toBeLessThan(0);
    expect(compareResults(four50, clear70)).toBeGreaterThan(0);
  });
});

describe('record personnel local par version', () => {
  it('record conservé par version, jamais battu par un parcours moins bon ou une élimination', () => {
    const d = defaultSave();
    let r = recordResult(d, res({ attempt: 'a1', faults: 4, t: 60 }));
    expect(r.isRecord).toBe(true);
    r = recordResult(d, res({ attempt: 'a2', t: 70 }));
    expect(r.isRecord).toBe(true);
    expect(bestOf(d, 'defi-pole-v1').time).toBe(70);
    r = recordResult(d, res({ attempt: 'a3', faults: 4, t: 50 }));
    expect(r.isRecord).toBe(false);
    r = recordResult(d, res({ attempt: 'a4', eliminated: 'Éliminé', t: 10 }));
    expect(r.isRecord).toBe(false);
    expect(bestOf(d, 'defi-pole-v1').attempt).toBe('a2');
    expect(d.challenges.records['defi-pole-v1'].attempts).toBe(4);
    expect(d.challenges.last.attempt).toBe('a4');
    // Autre version : registre séparé.
    recordResult(d, { ...res({ attempt: 'b1', t: 90 }), challenge: 'defi-pole-v2' });
    expect(bestOf(d, 'defi-pole-v2').time).toBe(90);
    expect(bestOf(d, 'defi-pole-v1').time).toBe(70);
  });
  it('une même tentative n’est comptée qu’une fois', () => {
    const d = defaultSave();
    const r1 = res({ attempt: 'same', t: 66 });
    recordResult(d, r1);
    const again = recordResult(d, r1);
    expect(again.duplicate).toBe(true);
    expect(d.challenges.records['defi-pole-v1'].attempts).toBe(1);
  });
  it('sauvegarde v2 : champ challenges par défaut, validation intacte, fusion d’une ancienne sauvegarde', () => {
    const d = defaultSave();
    expect(d.challenges).toEqual({ records: {}, last: null, pseudo: '', resume: null });
    expect(validateSave(d)).toEqual([]);
    const s = new SaveSystem('test-key');
    const old = { ...defaultSave(), started: true };
    delete old.challenges;
    const parsed = s.parse(JSON.stringify(old));
    expect(parsed.challenges.records).toEqual({});
    recordResult(parsed, res({ attempt: 'z', t: 61 }));
    const back = s.parse(JSON.stringify(parsed));
    expect(bestOf(back, 'defi-pole-v1').time).toBe(61);
  });
});

describe('carte et partage', () => {
  it('pseudonyme facultatif nettoyé', () => {
    expect(cleanPseudo('  Jo  <b>  ')).toBe('Jo b');
    expect(cleanPseudo('x'.repeat(40))).toHaveLength(20);
    expect(cleanPseudo(null)).toBe('');
  });
  it('texte de partage : adresse publique sans paramètres', () => {
    const url = publicUrl({ origin: 'https://exemple.test', pathname: '/jeu/', search: '?autostart=1', hash: '#x' });
    expect(url).toBe('https://exemple.test/jeu/');
    const t = shareText(cfg, res({ t: 68.42, faults: 4 }), url, 'Jo');
    expect(t).toContain('defi-pole-v1');
    expect(t).toContain('4 pts en 68,42 s');
    expect(t).toContain('STRIDES Grand Tour https://exemple.test/jeu/');
    expect(t).not.toContain('?');
  });
  it('identifiants de tentative uniques', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newAttemptId(cfg)));
    expect(ids.size).toBe(200);
    expect([...ids][0]).toMatch(/^defi-pole-v1-/);
  });
});
