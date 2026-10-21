// Carte stylisée monochrome (minimap tournante + carte plein écran).
import { WORLD, ROADS, PATHS, XC_PATH, POND, HIPPO, FORESTS, shoreZ, isCliffRegion } from '../world/layout.js';
import { HOME, HARAS, POLE, DUNES, TOWN } from '../world/sites.js';
import { getFields } from '../world/fields.js';
import { drawLogo, LOGO_MARK } from './logo.js';

const SIZE = 1024;
const S = SIZE / WORLD.size;
const px = (x) => (x + WORLD.half) * S;
const pz = (z) => (z + WORLD.half) * S;

export function buildMapImage(world) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#2a2d32';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const { fields } = getFields();
  const tints = { grass: '#2b3034', lightgrass: '#2e3337', wheat: '#333433', plowed: '#2f2f30', colza: '#353632', orchard: '#2a312e' };
  for (const f of fields) {
    ctx.fillStyle = tints[f.type] || '#272b30';
    ctx.beginPath();
    f.poly.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), pz(p[1])) : ctx.moveTo(px(p[0]), pz(p[1]))));
    ctx.closePath();
    ctx.fill();
  }
  // Forêts.
  ctx.fillStyle = '#20282a';
  for (const f of FORESTS) {
    ctx.beginPath();
    ctx.arc(px(f.x), pz(f.z), f.r * S * 0.92, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mer et plage.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = -WORLD.half; x <= WORLD.half; x += 6) ctx.lineTo(px(x), pz(shoreZ(x)));
  ctx.lineTo(SIZE, 0);
  ctx.closePath();
  ctx.fillStyle = '#1a2630';
  ctx.fill();
  ctx.strokeStyle = '#5b6a74';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -WORLD.half; x <= WORLD.half; x += 6) ctx[x === -WORLD.half ? 'moveTo' : 'lineTo'](px(x), pz(shoreZ(x)));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(214,205,180,0.24)';
  ctx.lineWidth = 50 * S;
  ctx.beginPath();
  for (let x = -440; x <= WORLD.half; x += 6) ctx[x === -440 ? 'moveTo' : 'lineTo'](px(x), pz(shoreZ(x) + 30));
  ctx.stroke();
  // Falaises.
  ctx.fillStyle = '#2c3034';
  ctx.beginPath();
  ctx.moveTo(0, pz(shoreZ(-WORLD.half)));
  for (let x = -WORLD.half; x < -420; x += 6) ctx.lineTo(px(x), pz(shoreZ(x)));
  ctx.lineTo(px(-420), pz(-230));
  ctx.lineTo(0, pz(-230));
  ctx.closePath();
  if (isCliffRegion(-500) > 0) ctx.fill();
  // Sites.
  const rect = (r, fill, stroke) => {
    ctx.fillStyle = fill;
    ctx.fillRect(px(r.x - r.w / 2), pz(r.z - r.d / 2), r.w * S, r.d * S);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(px(r.x - r.w / 2), pz(r.z - r.d / 2), r.w * S, r.d * S);
    }
  };
  rect({ x: -30, z: -258, w: 350, d: 184 }, '#2b2e33');
  rect(POLE.arena, '#3a3a38', 'rgba(244,243,239,.5)');
  rect(POLE.warmup, '#353533', 'rgba(244,243,239,.3)');
  rect(HOME.arena, '#3a3a38', 'rgba(244,243,239,.4)');
  rect(HOME.paddock, '#2c3330', 'rgba(244,243,239,.3)');
  for (const p of HARAS.paddocks) rect(p, '#2c3330', 'rgba(244,243,239,.3)');
  rect(DUNES.paddock, '#2c3330', 'rgba(244,243,239,.3)');
  rect(TOWN.plaza, '#33363b');
  // Hippodrome.
  ctx.strokeStyle = '#3d3e40';
  ctx.lineWidth = HIPPO.width * S;
  ctx.beginPath();
  ctx.moveTo(px(HIPPO.x - HIPPO.half), pz(HIPPO.z - HIPPO.radius));
  ctx.lineTo(px(HIPPO.x + HIPPO.half), pz(HIPPO.z - HIPPO.radius));
  ctx.arc(px(HIPPO.x + HIPPO.half), pz(HIPPO.z), HIPPO.radius * S, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(px(HIPPO.x - HIPPO.half), pz(HIPPO.z + HIPPO.radius));
  ctx.arc(px(HIPPO.x - HIPPO.half), pz(HIPPO.z), HIPPO.radius * S, Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  // Chemins.
  const line = (pts, w, color, dash) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.setLineDash(dash || []);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), pz(p[1])) : ctx.moveTo(px(p[0]), pz(p[1]))));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  for (const p of PATHS) line(p, 1.4, 'rgba(244,243,239,0.28)', [3, 3]);
  line(XC_PATH, 2, 'rgba(244,243,239,0.4)', [4, 3]);
  ctx.fillStyle = '#1a2024';
  ctx.beginPath();
  ctx.arc(px(POND.x), pz(POND.z), POND.r * S, 0, Math.PI * 2);
  ctx.fill();
  // Bâtiments.
  for (const b of world.features.buildings) {
    ctx.save();
    ctx.translate(px(b.x), pz(b.z));
    ctx.rotate(-b.rot);
    ctx.fillStyle = b.kind === 'hq' ? '#f4f3ef' : '#474b52';
    ctx.fillRect((-b.w / 2) * S, (-b.d / 2) * S, b.w * S, b.d * S);
    ctx.restore();
  }
  // Routes.
  for (const r of ROADS) line(r.pts, r.w * S + 1.4, '#0f1012');
  for (const r of ROADS) line(r.pts, r.w * S, r.id.startsWith('t_') ? '#bfc0bd' : '#e4e3df');
  return cv;
}

const BLIP_COLORS = { mission: '#f4f3ef', story: '#f4f3ef', home: '#f4f3ef', shop: '#d9b46a', event: '#f4f3ef', stable: '#9b9da4', pro: '#9b9da4', strides: '#f4f3ef', view: '#9b9da4', beach: '#9b9da4', town: '#9b9da4' };

export function drawBlip(ctx, x, y, kind, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  if (kind === 'mission' || kind === 'story') {
    // Pastille encre avec le « S » en tête de cheval du logo STRIDES.
    ctx.fillStyle = '#0f0f0e';
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f7f4ed';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const lh = 11.5;
    drawLogo(ctx, (-lh * LOGO_MARK.w) / LOGO_MARK.h / 2, -lh / 2, lh, '#f7f4ed', true);
  } else if (kind === 'waypoint') {
    ctx.fillStyle = '#f4f3ef';
    ctx.strokeStyle = '#121316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'horse') {
    ctx.fillStyle = '#c8a46a';
    ctx.strokeStyle = '#121316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'truck') {
    ctx.fillStyle = '#f4f3ef';
    ctx.strokeStyle = '#121316';
    ctx.fillRect(-4, -5, 8, 10);
    ctx.strokeRect(-4, -5, 8, 10);
  } else if (kind === 'shoe') {
    ctx.strokeStyle = '#d9b46a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 1, 4, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
  } else if (kind === 'npc') {
    ctx.fillStyle = '#f4f3ef';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#121316';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BLIP_COLORS[kind] || '#9b9da4';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = BLIP_COLORS[kind] || '#9b9da4';
    const glyph = { home: 'H', shop: '€', event: '★', stable: 'É', pro: '+', strides: 'S', view: '◆', beach: '~', town: 'D' }[kind] || '•';
    ctx.font = '600 8px Geist, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 0, 0.5);
  }
  ctx.restore();
}

export class Minimap {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.ctx = canvas.getContext('2d');
    this.image = null;
    this.range = 170;
    this._acc = 0;
  }
  setImage(img) {
    this.image = img;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
  }
  draw(dt) {
    this._acc += dt;
    if (this._acc < 1 / 30) return;
    this._acc = 0;
    const g = this.game;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    if (!W || !this.image) return;
    const R = W / 2;
    const focus = g.player.focus;
    const yaw = g.cam.yaw;
    const speed = Math.abs(focus.speed);
    this.range += ((g.player.mode === 'drive' ? 260 : 150 + Math.min(speed, 16) * 6) - this.range) * 0.05;
    const scale = R / this.range; // px par mètre
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#16191d';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(R, R);
    ctx.rotate(yaw);
    const k = scale / S;
    ctx.drawImage(this.image, -px(focus.pos.x) * k, -pz(focus.pos.z) * k, SIZE * k, SIZE * k);
    ctx.restore();
    // Itinéraire GPS.
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const toScreen = (x, z) => {
      const dx = x - focus.pos.x, dz = z - focus.pos.z;
      return [R + (dx * rx + dz * rz) * scale, R - (dx * fx + dz * fz) * scale];
    };
    const route = g.gps?.route;
    if (route && route.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(244,243,239,0.95)';
      ctx.lineWidth = 3.2 * (W / 132);
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      route.forEach((p, i) => {
        const [sx, sy] = toScreen(p[0], p[1]);
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      });
      ctx.stroke();
      ctx.restore();
    }
    // Blips.
    const blips = g.getBlips();
    for (const b of blips) {
      let [sx, sy] = toScreen(b.x, b.z);
      const dx = sx - R, dy = sy - R;
      const d = Math.hypot(dx, dy);
      const edge = R - 10;
      if (d > edge) {
        if (!b.sticky) continue;
        sx = R + (dx / d) * edge;
        sy = R + (dy / d) * edge;
      }
      drawBlip(ctx, sx, sy, b.kind, (W / 132) * (b.small ? 0.8 : 1));
    }
    // Joueur (flèche).
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(-(focus.heading - yaw + Math.PI));
    ctx.scale(W / 132, W / 132);
    ctx.fillStyle = '#f4f3ef';
    ctx.strokeStyle = '#121316';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Nord.
    const [Nx, Ny] = toScreen(focus.pos.x, focus.pos.z - 10000);
    const nd = Math.hypot(Nx - R, Ny - R) || 1;
    const nnx = R + ((Nx - R) / nd) * (R - 9), nny = R + ((Ny - R) / nd) * (R - 9);
    ctx.fillStyle = '#121316';
    ctx.beginPath();
    ctx.arc(nnx, nny, 7 * (W / 132), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f3ef';
    ctx.font = `600 ${9 * (W / 132)}px Geist, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nnx, nny + 0.5);
  }
}

// Priorité des repères sur la carte : GPS, histoire, missions, lieux, cheval et camion, pros et boutique.
const MAP_RANK = { waypoint: 0, mission: 2, home: 3, event: 3, stable: 3, strides: 3, horse: 4, truck: 4, pro: 5, shop: 5 };

// Carte plein écran (application Carte du téléphone).
export function drawFullMap(canvas, game, view) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#16191d';
  ctx.fillRect(0, 0, W, H);
  const img = game.mapImage;
  const scale = view.scale; // px écran par mètre
  const cx = view.x, cz = view.z;
  const toScreen = (x, z) => [W / 2 + (x - cx) * scale, H / 2 + (z - cz) * scale];
  const [ox, oy] = toScreen(-WORLD.half, -WORLD.half);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, ox, oy, WORLD.size * scale, WORLD.size * scale);
  const route = game.gps?.route;
  if (route && route.length > 1) {
    ctx.strokeStyle = '#f4f3ef';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    route.forEach((p, i) => {
      const [sx, sy] = toScreen(p[0], p[1]);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const dpr = view.dpr || 1;
  // Repères du plus au moins important : icônes peintes en ordre inverse (missions au-dessus des lieux), puis libellés
  // posés sous, au-dessus, à droite ou à gauche du repère, seulement s'ils tiennent dans le canvas sans toucher
  // une icône, la flèche du joueur, un libellé déjà posé ou un bouton de la carte (view.avoid). Recalculé à chaque déplacement ou zoom.
  const rank = (b) => (MAP_RANK[b.kind] ?? 6) - (b.sticky && b.kind === 'mission' ? 1 : 0);
  const list = game.getBlips(true).map((b) => ({ b, r: rank(b), p: toScreen(b.x, b.z) })).sort((u, v) => u.r - v.r);
  for (let i = list.length - 1; i >= 0; i--) drawBlip(ctx, list[i].p[0], list[i].p[1], list[i].b.kind, dpr * 1.1);
  const f = game.player.focus;
  const [px2, py2] = toScreen(f.pos.x, f.pos.z);
  const boxes = [...(view.avoid || []), { x0: px2 - 10 * dpr, x1: px2 + 10 * dpr, y0: py2 - 10 * dpr, y1: py2 + 10 * dpr }];
  for (const { r, p: [x, y] } of list) if (r < 6) boxes.push({ x0: x - 7 * dpr, x1: x + 7 * dpr, y0: y - 7 * dpr, y1: y + 7 * dpr });
  const proZoom = scale >= (4 * Math.min(W, H)) / WORLD.size; // pros et boutique : à partir de 4× la vue d'ensemble
  const seen = new Set();
  ctx.font = `500 ${10 * dpr}px Geist, Arial`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = 'rgba(18,19,22,0.85)';
  ctx.fillStyle = 'rgba(244,243,239,0.92)';
  for (const { b, p: [sx, sy] } of list) {
    if (!b.label || !view.labels || ((b.kind === 'pro' || b.kind === 'shop') && !proZoom)) continue;
    const key = `${b.label}|${Math.round(b.x / 10)}|${Math.round(b.z / 10)}`; // offres identiques au même endroit : un seul libellé
    if (seen.has(key)) continue;
    seen.add(key);
    const w = ctx.measureText(b.label).width + 4 * dpr;
    for (const [x, y] of [[sx, sy + 18 * dpr], [sx, sy - 14 * dpr], [sx + 13 * dpr + w / 2, sy + 4 * dpr], [sx - 13 * dpr - w / 2, sy + 4 * dpr]]) {
      const q = { x0: x - w / 2, x1: x + w / 2, y0: y - 8 * dpr, y1: y + 3 * dpr };
      if (q.x0 < 0 || q.x1 > W || q.y0 < 0 || q.y1 > H || boxes.some((o) => q.x0 < o.x1 && q.x1 > o.x0 && q.y0 < o.y1 && q.y1 > o.y0)) continue;
      boxes.push(q);
      ctx.strokeText(b.label, x, y);
      ctx.fillText(b.label, x, y);
      break;
    }
  }
  ctx.save();
  ctx.translate(px2, py2);
  ctx.rotate(Math.PI - f.heading);
  ctx.scale(dpr * 1.2, dpr * 1.2);
  ctx.fillStyle = '#f4f3ef';
  ctx.strokeStyle = '#121316';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  return { toWorld: (sx, sy) => ({ x: cx + (sx - W / 2) / scale, z: cz + (sy - H / 2) / scale }) };
}
