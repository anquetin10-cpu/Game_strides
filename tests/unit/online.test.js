import { describe, it, expect } from 'vitest';
import { scoreOf, rankBoard, cleanName, BOARDS, Online } from '../../src/core/online.js';

describe('classements en ligne', () => {
  it('barème A : les pénalités passent avant le chrono', () => {
    expect(scoreOf(0, 59.9)).toBeLessThan(scoreOf(4, 40));
    expect(scoreOf(4, 40)).toBeLessThan(scoreOf(4, 40.01));
    expect(scoreOf(0, 41.234)).toBeCloseTo(41.23, 6);
  });
  it('classe les joueurs, ignore ceux sans résultat, départage à l’ancienneté', () => {
    const rows = [
      { id: 'a', pseudo: 'Alice', boards: { x: { pen: 4, time: 38, score: scoreOf(4, 38), at: 5 } } },
      { id: 'b', pseudo: 'Bob', boards: { x: { pen: 0, time: 45, score: scoreOf(0, 45), at: 9 } } },
      { id: 'c', pseudo: '', boards: { y: { pen: 0, time: 30, score: scoreOf(0, 30), at: 1 } } },
      { id: 'd', pseudo: '<b>Dan</b>', boards: { x: { pen: 0, time: 45, score: scoreOf(0, 45), at: 2 } } },
    ];
    const r = rankBoard(rows, 'x');
    expect(r.map((e) => e.id)).toEqual(['d', 'b', 'a']);
    expect(r.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(r[0].pseudo).toBe('bDan/b');
    expect(rankBoard(rows, 'y')[0].pseudo).toBe('Cavalier anonyme');
  });
  it('pseudonymes nettoyés et courts', () => {
    expect(cleanName('  Léa\u0007 <script> ')).toBe('Léa script');
    expect(cleanName('x'.repeat(40)).length).toBe(24);
  });
  it('épreuves classées uniques', () => {
    expect(new Set(BOARDS.map((b) => b.id)).size).toBe(BOARDS.length);
  });
  it('chronos impossibles refusés (plus rapides que le grand galop sur la distance)', async () => {
    const o = new Online({ save: { data: { started: true, meta: {} } } });
    o.state = 'online';
    o.uid = 'u1';
    const r = await o.submit('beach_sprint', { pen: 0, time: 0.5 });
    expect(r.rejected).toBe(true);
    expect(o.mine).toBe(null);
    for (const b of BOARDS) expect(b.minTime).toBeGreaterThan(10);
  });
  it('hors ligne : aucun envoi, le résultat reste local', async () => {
    const o = new Online({ save: { data: { started: true, meta: {} } } });
    const r = await o.submit('beach_sprint', { pen: 0, time: 61.2 });
    expect(r.rank).toBe(null);
    expect(o.state).toBe('local');
  });
});
