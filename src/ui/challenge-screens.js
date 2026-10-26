// Écrans des défis rejouables : règles et conditions avant le départ, résultat (Recommencer), carte de résultat
// 1080×1350 générée sur l'appareil et partage volontaire (partage natif avec fichier, sinon téléchargement de
// l'image, sinon copie d'un texte avec l'adresse publique de la partie).
import { h, tap } from './dom.js';
import { BUILD } from '../config.js';
import {
  challengeStore, bestOf, conditionsList, rulesText, resultLine, fmtSeconds, fmtPenalties, fmtHeight, cleanPseudo, shareText, publicUrl, SIGNATURE,
} from '../gameplay/challenge.js';
import { drawStridesMark, FONT_DISPLAY, FONT_UI, FONT_MONO } from '../world/textures.js';

export const CARD_W = 1080;
export const CARD_H = 1350;

const INK = '#0f0f0e', CREAM = '#efeae0', SURFACE = '#fbfaf5', STONE = '#c8c3b5', MUTED = '#605d56', GOLD = '#b8953a';

// Retour à la ligne simple (mots) dans une largeur donnée ; renvoie la position y suivante.
function wrapText(ctx, text, x, y, maxW, lh, maxLines = 3) {
  const words = String(text).split(' ');
  let line = '';
  let n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
      if (++n >= maxLines - 1) break;
    } else line = test;
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lh;
  }
  return y;
}

function fit(ctx, text, weight, size, family, maxW) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 16) {
    s *= 0.94;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

// Carte de résultat (canvas 1080×1350) : défi, résultat, cheval, pseudonyme facultatif, signature, versions.
export function drawResultCard(cv, { cfg, res, pseudo = '', build = BUILD, date = new Date(res.at || Date.now()) }) {
  cv.width = CARD_W;
  cv.height = CARD_H;
  const ctx = cv.getContext('2d');
  const L = 90, R = CARD_W - 90, W = R - L;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Fond crème, bandeau encre.
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, CARD_W, 500);
  try {
    drawStridesMark(ctx, L, 82, 62, SURFACE);
  } catch {
    /* marque facultative */
  }
  ctx.fillStyle = STONE;
  ctx.font = `500 28px ${FONT_MONO}`;
  ctx.fillText('STRIDES GRAND TOUR · DÉFI REJOUABLE', L + 84, 124);
  ctx.fillStyle = SURFACE;
  fit(ctx, cfg.name.toUpperCase(), 600, 112, FONT_DISPLAY, W);
  ctx.fillText(cfg.name.toUpperCase(), L, 290);
  ctx.fillStyle = STONE;
  ctx.font = `400 34px ${FONT_UI}`;
  ctx.fillText(`${cfg.place} · ${cfg.obstacles.length} obstacles · ${fmtHeight(cfg.height)}`, L, 360);
  ctx.font = `500 26px ${FONT_MONO}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(`${cfg.id.toUpperCase()} · CONDITIONS FIXES`, L, 430);

  // Résultat.
  ctx.fillStyle = MUTED;
  ctx.font = `500 28px ${FONT_MONO}`;
  ctx.fillText('RÉSULTAT', L, 566);
  ctx.fillStyle = INK;
  let y;
  if (res.eliminated) {
    fit(ctx, 'ÉLIMINÉ', 600, 170, FONT_DISPLAY, W);
    ctx.fillText('ÉLIMINÉ', L, 770);
    ctx.fillStyle = MUTED;
    ctx.font = `400 36px ${FONT_UI}`;
    y = wrapText(ctx, res.eliminated, L, 836, W, 46, 2);
  } else {
    const p = fmtPenalties(res.penalties).toUpperCase();
    fit(ctx, p, 600, 170, FONT_DISPLAY, W * 0.62);
    ctx.fillText(p, L, 770);
    ctx.font = `300 96px ${FONT_DISPLAY}`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtSeconds(res.time), R, 770);
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = `400 34px ${FONT_UI}`;
    ctx.fillText(`Barres ${res.rails} · refus ${res.refusals} · pénalités de temps ${res.timeFaults}`, L, 836);
    y = 870;
  }
  ctx.fillStyle = GOLD;
  ctx.fillRect(L, Math.max(y, 884), W, 3);

  // Détails.
  const rows = [];
  const who = cleanPseudo(pseudo);
  if (who) rows.push(['Pseudonyme', who]);
  rows.push(['Cheval', `${res.horse} (fourni, statistiques fixes)`]);
  rows.push(['Temps accordé', `${cfg.timeAllowed} s · temps réalisé ${fmtSeconds(res.time)}`]);
  rows.push(['Météo', `${cfg.weather.label.toLowerCase()}, ${cfg.weather.hour} h, sol sec`]);
  let ry = Math.max(y, 884) + 62;
  for (const [k, v] of rows.slice(0, 4)) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 24px ${FONT_MONO}`;
    ctx.fillText(k.toUpperCase(), L, ry);
    ctx.fillStyle = INK;
    fit(ctx, v, 500, 34, FONT_UI, W - 300);
    ctx.fillText(v, L + 300, ry);
    ry += 62;
  }

  // Pied : signature et versions.
  ctx.fillStyle = INK;
  ctx.fillRect(0, CARD_H - 150, CARD_W, 150);
  ctx.fillStyle = SURFACE;
  ctx.font = `600 44px ${FONT_DISPLAY}`;
  ctx.fillText(SIGNATURE, L, CARD_H - 82);
  ctx.fillStyle = STONE;
  ctx.font = `500 24px ${FONT_MONO}`;
  const d = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  ctx.fillText(`Défi ${cfg.id} · jeu v${build} · ${d}`, L, CARD_H - 42);
  ctx.textAlign = 'right';
  ctx.fillText('JEU · RÉSULTAT LOCAL', R, CARD_H - 82);
  ctx.textAlign = 'left';
  return cv;
}

// Capacités de partage du navigateur : 'share' (fichier), 'download' (lien download) ou 'copy'.
export function shareMode(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  try {
    if (nav.share && nav.canShare && typeof File !== 'undefined' && nav.canShare({ files: [new File([new Uint8Array(1)], 'carte.png', { type: 'image/png' })] })) return 'share';
  } catch {
    /* navigateur sans partage de fichiers */
  }
  if (typeof HTMLAnchorElement !== 'undefined' && 'download' in HTMLAnchorElement.prototype) return 'download';
  return 'copy';
}

const MODE_LABEL = { share: 'Partager l’image', download: 'Télécharger l’image', copy: 'Copier le texte' };

export class ChallengeUI {
  constructor(game, runner) {
    this.game = game;
    this.runner = runner;
  }

  // Règles et conditions, expliquées avant le départ.
  intro(cfg, source = 'phone') {
    const g = this.game;
    const best = bestOf(g.save.data, cfg.id);
    const grid = h('div.ch-chips', {}, ...conditionsList(cfg).map(([k, v]) => h('span.ch-chip', {}, h('b', { text: k }), h('span', { text: v }))));
    const rules = h('ol.ch-rules', {}, ...rulesText(cfg).map((t) => h('li', { text: t })));
    const rec = h('div.ch-note', { text: best ? `Ton record pour ${cfg.id} : ${resultLine(best)}.` : `Pas encore de record pour ${cfg.id}.` });
    const note = h('div.ch-note.muted', { text: 'Barème de jeu inspiré du saut d’obstacles au chrono (adaptation, pas un règlement officiel). Mêmes conditions à chaque tentative.' });
    const why = this.runner.blocker();
    const ov = g.screens.card({
      kicker: `${cfg.name} · défi rejouable · ${cfg.id}`,
      title: cfg.name,
      extra: [grid, h('div.section-t.ch-sec', { text: 'Classement : pénalités, puis chrono' }), rules, rec, note],
      buttons: [
        { label: 'Plus tard', id: 'challenge-later' },
        {
          label: why ? 'Indisponible' : 'Départ',
          primary: true,
          id: 'challenge-go',
          run: () => {
            if (source === 'phone') g.phone.close();
            this.runner.start(cfg);
          },
        },
      ],
    });
    ov.classList.add('ch-intro');
    return ov;
  }

  // Écran de fin de tentative.
  result(cfg, res, rec, close) {
    const g = this.game;
    let closed = false;
    const done = () => {
      if (closed) return;
      closed = true;
      close();
    };
    const best = bestOf(g.save.data, cfg.id);
    const stat = (k, v, cls = '') => h(`div.stat${cls}`, {}, h('div.k', { text: k }), h('div.v', { text: v }));
    const grid = h('div.result-grid', {},
      stat('Pénalités', res.eliminated ? '—' : String(res.penalties)),
      stat('Temps', fmtSeconds(res.time)),
      stat(`Record ${cfg.id.split('-').pop()}`, best ? resultLine(best) : '—', '.small'));
    const detail = res.eliminated
      ? `${res.eliminated} Le record n’est pas modifié.`
      : `Barres : ${res.rails} · refus : ${res.refusals} · pénalités de temps : ${res.timeFaults}. Cheval : ${res.horse}.`;
    const title = res.eliminated ? 'Éliminé' : rec?.isRecord ? 'Nouveau record' : res.penalties === 0 ? 'Sans faute' : 'Parcours terminé';
    const ov = g.screens.card({
      kicker: `${cfg.name} · ${cfg.id}`,
      title,
      body: detail,
      extra: [grid],
      buttons: [
        { label: 'Quitter', ghost: true, id: 'challenge-quit', run: done },
        { label: 'Carte de résultat', id: 'challenge-card', keep: true, run: () => this.share(cfg, res) },
        {
          label: 'Recommencer',
          primary: true,
          id: 'challenge-retry',
          run: () => {
            done();
            this.runner.start(cfg);
          },
        },
      ],
    });
    ov.classList.add('ch-result');
    if (res.eliminated) g.audio.fail();
    else g.audio.success();
    return ov;
  }

  // Carte de résultat et partage volontaire.
  share(cfg, res) {
    const g = this.game;
    const d = g.save.data;
    const store = challengeStore(d);
    const cv = h('canvas.rc-canvas', { 'aria-label': 'Carte de résultat' });
    let blob = null;
    let seq = 0;
    const draw = () => {
      drawResultCard(cv, { cfg, res, pseudo: store.pseudo });
      const my = ++seq;
      blob = null;
      cv.toBlob?.((b) => {
        if (my === seq) blob = b;
      }, 'image/png');
    };
    draw();
    // Les polices du jeu peuvent arriver après le premier dessin.
    document.fonts?.ready?.then(() => draw());
    const input = h('input.rc-input', { value: store.pseudo || '', maxlength: '20', autocomplete: 'off', placeholder: 'Facultatif', 'aria-label': 'Pseudonyme', 'data-id': 'challenge-pseudo' });
    let tm = null;
    input.addEventListener('input', () => {
      clearTimeout(tm);
      tm = setTimeout(() => {
        store.pseudo = cleanPseudo(input.value);
        g.saveSoon();
        draw();
      }, 250);
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    const mode = shareMode();
    const side = h('div.rc-side', {},
      h('label.rc-label', { text: 'Pseudonyme sur la carte' }),
      input,
      h('div.ch-note.muted', { text: 'Image créée sur ton appareil. Rien n’est envoyé sans ton action.' }),
      h('div.ch-note', { text: `${cfg.name} · ${resultLine(res)} · ${res.horse}` }));
    const run = () => {
      clearTimeout(tm);
      const p = cleanPseudo(input.value);
      if (p !== store.pseudo) {
        store.pseudo = p;
        g.saveSoon();
        draw();
      }
      this._deliver(cfg, res, cv, () => blob, mode);
    };
    const ov = g.screens.card({
      kicker: `Carte de résultat · ${cfg.id}`,
      extra: [h('div.rc-wrap', {}, cv, side)],
      buttons: [
        { label: 'Retour', id: 'challenge-card-back' },
        { label: MODE_LABEL[mode], primary: true, keep: true, id: 'challenge-share', run },
      ],
    });
    ov.classList.add('rc-overlay');
    return ov;
  }

  // Partage natif avec fichier, sinon téléchargement de l'image, sinon copie du texte avec l'adresse publique.
  _deliver(cfg, res, cv, getBlob, mode) {
    const g = this.game;
    const name = `${cfg.id}-${String(res.attempt || '').slice(-5) || 'resultat'}.png`;
    const text = shareText(cfg, res, publicUrl(location), challengeStore(g.save.data).pseudo);
    const track = (m) => g.metrics.track('result_share_requested', { challenge_version: cfg.id, mode: m });
    const blobNow = () => {
      const b = getBlob();
      if (b) return Promise.resolve(b);
      return new Promise((r) => (cv.toBlob ? cv.toBlob(r, 'image/png') : r(null)));
    };
    const copy = () => {
      track('copy');
      const ok = () => g.hud.toast('Texte du résultat copié.');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, () => this._showText(text));
      else this._showText(text);
    };
    const download = (b) => {
      if (!b) return copy();
      track('download');
      const url = URL.createObjectURL(b);
      const a = h('a', { href: url, download: name, style: { display: 'none' } });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      g.hud.toast(`Image enregistrée : ${name}`);
    };
    if (mode === 'share') {
      const b = getBlob();
      // Appel synchrone au geste (Safari) : l'image est préparée à l'ouverture de l'écran.
      if (b) {
        track('share');
        const file = new File([b], name, { type: 'image/png' });
        navigator.share({ files: [file], title: `${cfg.name} · ${SIGNATURE}`, text }).catch((e) => {
          if (e?.name !== 'AbortError') download(b);
        });
        return;
      }
      blobNow().then(download);
      return;
    }
    if (mode === 'download') {
      blobNow().then(download);
      return;
    }
    copy();
  }

  // Dernier recours : texte sélectionnable à copier à la main.
  _showText(text) {
    const area = h('textarea.save-area', { readonly: true, rows: '3' });
    area.value = text;
    this.game.screens.card({ kicker: 'Copier le résultat', extra: [area], buttons: [{ label: 'Fermer', primary: true }] });
    setTimeout(() => area.select?.(), 50);
  }
}
