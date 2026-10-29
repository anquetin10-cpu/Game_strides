// Plan du parcours de CSO (comme celui affiché à l'entrée de piste), dessiné à partir des mêmes données que la piste :
// carrière, ligne du cavalier, obstacles numérotés (vertical : une barre, oxer : deux, mur : bloc), double, lignes de
// départ et d'arrivée, entrée de piste et tribunes. Nord en haut (le nord du monde est vers -z).
import { CSO_TRACE } from '../gameplay/csoCourse.js';
import { POLE, PARIS } from '../world/sites.js';

// trace : tracé du parcours (Pôle par défaut) ; venue 'paris' : arène de Paris (80 × 40 m, entrée à l'ouest, tribunes
// sur trois côtés).
export function coursePlanSvg({ heights = null, next = 0, trace = CSO_TRACE, venue = 'pole' } = {}) {
  const paris = venue === 'paris';
  const W = paris ? PARIS.arena.w : POLE.arena.w, D = paris ? PARIS.arena.d : POLE.arena.d;
  const pad = 6;
  const vb = `${-W / 2 - pad} ${-D / 2 - pad - 4} ${W + pad * 2} ${D + pad * 2 + 8}`;
  const parts = [];
  // Carrière (sable), lice, entrée de piste au sud (+z), tribunes au nord (-z).
  parts.push(`<rect x="${-W / 2}" y="${-D / 2}" width="${W}" height="${D}" rx="1.5" fill="#e8dcc0" stroke="#1b1c1f" stroke-width="0.5"/>`);
  if (paris) {
    const gz = PARIS.gate.z - PARIS.arena.z;
    parts.push(`<rect x="${-W / 2 - 0.4}" y="${gz - 2.8}" width="0.8" height="5.6" fill="#e8dcc0"/>`);
    parts.push(`<text x="${-W / 2 - 1}" y="${gz + 6}" font-size="2.6" text-anchor="start" fill="#6b6a64">ENTRÉE</text>`);
    parts.push(`<rect x="${-W / 2 + 6}" y="${-D / 2 - 5.5}" width="${W - 6}" height="3.2" fill="#c9c6bd"/><rect x="${-W / 2 + 6}" y="${D / 2 + 2.3}" width="${W - 6}" height="3.2" fill="#c9c6bd"/>`);
    parts.push(`<text x="0" y="${-D / 2 - 3.1}" font-size="2.2" text-anchor="middle" fill="#3a3a36">TRIBUNES</text>`);
  } else {
    parts.push(`<rect x="-3.5" y="${D / 2 - 0.4}" width="7" height="0.8" fill="#e8dcc0"/>`);
    parts.push(`<text x="0" y="${D / 2 + 3.6}" font-size="2.6" text-anchor="middle" fill="#6b6a64">ENTRÉE</text>`);
    parts.push(`<rect x="${-POLE.stands.w / 2}" y="${-D / 2 - 5.5}" width="${POLE.stands.w}" height="3.2" fill="#c9c6bd"/>`);
    parts.push(`<text x="0" y="${-D / 2 - 3.1}" font-size="2.2" text-anchor="middle" fill="#3a3a36">TRIBUNES</text>`);
  }
  // Ligne du cavalier (pointillés).
  const line = trace.pts.filter((_, i) => i % 2 === 0).map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ');
  parts.push(`<polyline points="${line}" fill="none" stroke="#1b1c1f" stroke-opacity="0.45" stroke-width="0.45" stroke-dasharray="1.2 1"/>`);
  // Lignes de départ et d'arrivée.
  for (const [k, m, col] of [['D', trace.marks.start, '#2f6e4a'], ['A', trace.marks.finish, '#b8322a']]) {
    const tx = Math.cos(m.rot) * 3.5, tz = -Math.sin(m.rot) * 3.5;
    parts.push(`<line x1="${(m.x - tx).toFixed(2)}" y1="${(m.z - tz).toFixed(2)}" x2="${(m.x + tx).toFixed(2)}" y2="${(m.z + tz).toFixed(2)}" stroke="${col}" stroke-width="0.7"/>`);
    parts.push(`<text x="${(m.x + tx * 1.5).toFixed(2)}" y="${(m.z + tz * 1.5 + 1).toFixed(2)}" font-size="2.6" font-weight="700" text-anchor="middle" fill="${col}">${k === 'D' ? 'Départ' : 'Arrivée'}</text>`);
  }
  // Obstacles.
  trace.fences.forEach((f, i) => {
    const n = { x: Math.sin(f.rot), z: Math.cos(f.rot) }, t = { x: Math.cos(f.rot), z: -Math.sin(f.rot) };
    const hw = 1.9;
    const bar = (s, col) => `<line x1="${(f.x + n.x * s - t.x * hw).toFixed(2)}" y1="${(f.z + n.z * s - t.z * hw).toFixed(2)}" x2="${(f.x + n.x * s + t.x * hw).toFixed(2)}" y2="${(f.z + n.z * s + t.z * hw).toFixed(2)}" stroke="${col}" stroke-width="0.8" stroke-linecap="round"/>`;
    const hot = next === i + 1;
    const col = hot ? '#1a9b62' : '#1b1c1f';
    if (f.kind === 'o') parts.push(bar(-f.spread / 2, col), bar(f.spread / 2, col));
    else if (f.kind === 'w') parts.push(bar(0, '#a4553f').replace('stroke-width="0.8"', 'stroke-width="1.3"'));
    else parts.push(bar(0, col));
    // Flèche du sens de saut et numéro (du côté du panneau sur la piste : à droite du cavalier, fanion rouge).
    const ax = f.x - n.x * 2.4, az = f.z - n.z * 2.4;
    parts.push(`<path d="M${(ax - t.x * 0.6).toFixed(2)},${(az - t.z * 0.6).toFixed(2)} L${(ax + n.x * 1.1).toFixed(2)},${(az + n.z * 1.1).toFixed(2)} L${(ax + t.x * 0.6).toFixed(2)},${(az + t.z * 0.6).toFixed(2)}" fill="${col}" fill-opacity="0.55"/>`);
    const lx = f.x - t.x * 3.6, lz = f.z - t.z * 3.6;
    parts.push(`<circle cx="${lx.toFixed(2)}" cy="${lz.toFixed(2)}" r="1.85" fill="${hot ? '#1a9b62' : '#1b1c1f'}"/>`);
    parts.push(`<text x="${lx.toFixed(2)}" y="${(lz + 0.85).toFixed(2)}" font-size="${f.label.length > 1 ? 1.9 : 2.4}" font-weight="700" text-anchor="middle" fill="#fbfaf5">${f.label}</text>`);
    if (heights) parts.push(`<text x="${(lx).toFixed(2)}" y="${(lz + 3.6).toFixed(2)}" font-size="1.5" text-anchor="middle" fill="#55544f">${heights[i].toFixed(2).replace('.', ',')}</text>`);
  });
  return `<svg class="course-plan" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plan du parcours">${parts.join('')}</svg>`;
}

// Légende textuelle (accessibilité, et vérifiée par les tests) : ordre et nature des obstacles.
export function coursePlanLegend(trace = CSO_TRACE) {
  const names = { v: 'vertical', o: 'oxer', w: 'mur' };
  return trace.fences.map((f) => `${f.label} ${names[f.kind] || f.kind}`).join(' · ');
}
