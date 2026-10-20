// Écrans : chargement, titre, création du personnage, pause, résultats de mission, fin, mode photo.
import { h, tap, stars } from './dom.js';
import { icon } from './icons.js';
import { formatMoney, formatTime } from '../core/math.js';
import { CONFIG } from '../config.js';

const TIPS = [
  'Sur Strides, chaque professionnel est vérifié avant de pouvoir proposer ses services.',
  'Maintiens GALOP pour passer au grand galop. Surveille l’endurance de ton cheval.',
  'Appuie sur SAUT au bon moment : l’anneau devient vert quand l’appel est idéal.',
  'Touche la minimap pour ouvrir la carte et placer un repère GPS.',
  'Les fers d’or sont cachés dans tout Deauvelle. Trouve-les tous !',
  'Ton téléphone vibre ? Une nouvelle mission Strides t’attend.',
  'Le transport Strides peut t’emmener où tu veux, toi et ton cheval.',
];

export class Screens {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.fadeEl = h('div.fade');
    document.body.appendChild(this.fadeEl);
    document.body.appendChild(
      h('div.rotate', {}, h('div', {}, h('div', { html: icon('phone') }), h('div.t', { text: 'Tourne ton téléphone' }), h('div.s', { text: 'STRIDES Grand Tour se joue à l’horizontale.' })))
    );
  }

  brand() {
    return h('div.brandmark', {}, h('div', { html: icon('strides'), style: { height: '28px', width: '44px' } }), h('div.wm', { text: 'STRIDES' }));
  }

  // ---------- Chargement ----------
  showLoading() {
    this.loadBar = h('i');
    this.loadMsg = h('div.load-msg', { text: 'Chargement…' });
    this.loadEl = h('div.screen.loading', {},
      this.brand(),
      h('div.game-title', { style: { marginTop: '18px' } }, CONFIG.title, h('span', { text: 'UN JEU EN MONDE OUVERT · CÔTE FLEURIE' })),
      h('div.progress', {}, this.loadBar),
      this.loadMsg,
      h('div.load-tip', { text: TIPS[Math.floor(Math.random() * TIPS.length)] }));
    document.body.appendChild(this.loadEl);
  }
  setLoading(p, msg) {
    if (!this.loadEl) return;
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (msg) this.loadMsg.textContent = msg;
  }
  hideLoading() {
    this.loadEl?.remove();
    this.loadEl = null;
  }

  // ---------- Titre ----------
  showTitle({ hasSave, onPlay, onNew }) {
    const menu = h('div.menu');
    const add = (label, primary, fn, id) => {
      const b = h(`button.btn${primary ? '.primary' : ''}`, { 'data-id': id }, h('span', { text: label }), h('span', { html: icon('back'), style: { transform: 'rotate(180deg)', width: '16px', height: '16px', display: 'inline-block' } }));
      tap(b, fn);
      menu.appendChild(b);
    };
    if (hasSave) {
      add('Continuer', true, onPlay, 'continue');
      add('Nouvelle partie', false, onNew, 'new');
    } else add('Jouer', true, onNew, 'play');
    const learn = h('button.btn.ghost', { 'data-id': 'learn' }, h('span', { text: 'Découvrir l’app Strides' }), h('span', { html: icon('external'), style: { width: '16px', height: '16px', display: 'inline-block' } }));
    tap(learn, () => this.game.openDownload('title'));
    menu.appendChild(learn);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone;
    this.titleEl = h('div.screen.title-screen', {},
      this.brand(),
      h('div.game-title', { style: { marginTop: '14px' } }, CONFIG.title, h('span', { text: 'LE MONDE ÉQUESTRE EN MONDE OUVERT' })),
      menu,
      h('div.foot', { html: ios ? 'Astuce : <b>Partager → Sur l’écran d’accueil</b> pour jouer en plein écran.' : 'Clavier : ZQSD/WASD · Espace = saut · Maj = galop · E = action · P = téléphone' }));
    document.body.appendChild(this.titleEl);
  }
  hideTitle() {
    this.titleEl?.remove();
    this.titleEl = null;
  }

  // ---------- Création du personnage ----------
  showSetup(onDone) {
    const d = this.game.save.data;
    let avatar = d.avatar || 'f';
    const input = h('input', { value: d.playerName || 'Alex', maxlength: '16', autocomplete: 'off', 'aria-label': 'Prénom' });
    const seg = h('div.seg');
    for (const [v, l] of [['f', 'Cavalière'], ['m', 'Cavalier']]) {
      const b = h(`button${avatar === v ? '.on' : ''}`, { text: l });
      tap(b, () => {
        avatar = v;
        [...seg.children].forEach((c) => c.classList.remove('on'));
        b.classList.add('on');
      });
      seg.appendChild(b);
    }
    const go = h('button.btn.primary', { text: 'C’est parti', 'data-id': 'start' });
    const card = h('div.card.setup', {},
      h('div.kicker', { text: 'Ton profil Strides' }),
      h('h2', { text: 'Qui monte en selle ?' }),
      h('div.field', {}, h('label', { text: 'Prénom' }), input),
      h('div.field', {}, h('label', { text: 'Personnage' }), seg),
      h('div.row', {}, go));
    const ov = h('div.overlay', {}, card);
    tap(go, () => {
      const name = input.value.trim().slice(0, 16) || 'Alex';
      ov.remove();
      onDone({ name, avatar });
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    document.body.appendChild(ov);
  }

  // ---------- Carte générique ----------
  card({ kicker, title, body, html, buttons = [], extra = [] }) {
    const row = h('div.row');
    const ov = h('div.overlay');
    for (const b of buttons) {
      const el = h(`button.btn${b.primary ? '.primary' : b.ghost ? '.ghost' : ''}`, { text: b.label, 'data-id': b.id || '' });
      tap(el, () => {
        if (!b.keep) ov.remove();
        b.run?.();
      });
      row.appendChild(el);
    }
    const card = h('div.card', {}, kicker ? h('div.kicker', { text: kicker }) : null, title ? h('h2', { text: title }) : null, body ? h('p', { text: body }) : null, html ? h('div', { html }) : null, ...extra, buttons.length ? row : null);
    ov.appendChild(card);
    document.body.appendChild(ov);
    this.game.input.releaseAll();
    return ov;
  }

  // ---------- Résultat de mission ----------
  missionResult(r, onClose) {
    const g = this.game;
    const extra = [];
    const stat = (k, v) => h('div.stat', {}, h('div.k', { text: k }), h('div.v', { text: v }));
    extra.push(h('div.result-grid', {}, stat('Paiement', r.pay ? formatMoney(r.pay) : '—'), stat('Réputation', `+${r.xp} XP`), stat(r.timeLabel || 'Temps', r.time !== undefined ? formatTime(r.time) : r.extraValue || '—')));
    if (r.review) {
      extra.push(h('div.review', {}, h('div.av', { text: r.review.initials }), h('div', {}, h('div.who', { text: r.review.name }), h('div.stars', { text: stars(r.stars) }), h('div.q', { text: `« ${r.review.text} »` }))));
    }
    if (r.levelUp) extra.push(h('div.levelup', {}, h('span', { text: 'Nouveau statut Strides' }), h('big', { text: r.levelUp.title.toUpperCase() }), h('span', { text: r.levelUp.perk || '' })));
    if (r.irl) extra.push(h('div.irl', { html: r.irl }));
    this.card({
      kicker: r.kicker || 'Mission Strides',
      title: r.title || 'MISSION RÉUSSIE',
      body: r.body,
      extra,
      buttons: [{ label: 'Continuer', primary: true, id: 'continue', run: onClose }],
    });
    g.audio.success();
  }

  missionFailed(reason, onRetry, onLater) {
    this.card({
      kicker: 'Mission',
      title: 'MISSION ÉCHOUÉE',
      body: reason,
      buttons: [
        { label: 'Plus tard', run: onLater, id: 'later' },
        { label: 'Réessayer', primary: true, run: onRetry, id: 'retry' },
      ],
    });
    this.game.audio.fail();
  }

  // ---------- Pause ----------
  pause({ onResume, onTitle }) {
    const g = this.game;
    const controls = h('div', { html: `<p style="margin-top:12px"><b>Tactile</b> — joystick à gauche (glisser), caméra : glisser à droite. Boutons : <b>Saut</b>, <b>Galop</b> (maintenir), <b>Action</b>, sifflet.<br><b>Clavier</b> — ZQSD/WASD, Espace (saut), Maj (galop), E (action), Q (siffler), P (téléphone), M (carte), Échap (pause).</p>` });
    return this.card({
      kicker: 'Pause',
      title: 'STRIDES GRAND TOUR',
      extra: [controls, g.phone.promo()],
      buttons: [
        { label: 'Écran titre', ghost: true, run: onTitle, id: 'title' },
        { label: 'Partager', run: () => g.share('pause'), keep: true, id: 'share' },
        { label: 'Reprendre', primary: true, run: onResume, id: 'resume' },
      ],
    });
  }

  // ---------- Fin ----------
  ending(onClose) {
    const g = this.game;
    const d = g.save.data;
    const promo = g.phone.promo();
    promo.style.marginTop = '16px';
    this.card({
      kicker: 'Grand Prix CSI 5★ de Deauvelle',
      title: 'LÉGENDE DE DEAUVELLE',
      body: `${d.playerName}, de groom à vainqueur du Grand Prix : ta carrière s’est construite mission après mission, avis après avis. Dans la vraie vie aussi, c’est sur STRIDES que les pros du cheval se trouvent, se font confiance et avancent.`,
      extra: [promo, h('div.irl', { text: 'Le monde reste ouvert : continue les missions, les chronos et la chasse aux fers d’or.' })],
      buttons: [
        { label: 'Partager le jeu', run: () => g.share('ending'), keep: true, id: 'share' },
        { label: 'Continuer à explorer', primary: true, run: onClose, id: 'continue' },
      ],
    });
  }

  fade(on) {
    this.fadeEl.classList.toggle('on', on);
  }

  photoFrame(on, onExit) {
    if (on) {
      const exit = h('button.btn.small.primary', { text: 'Quitter le mode photo' });
      tap(exit, onExit);
      const share = h('button.btn.small', { text: 'Partager le jeu', style: { background: 'rgba(18,19,22,.7)' } });
      tap(share, () => this.game.share('photo'));
      this.photoEl = h('div.photo-frame', {}, h('div.exit', { style: { display: 'flex', gap: '8px' } }, exit, share), h('div.wm', {}, h('span', { html: icon('strides'), style: { width: '34px', display: 'inline-block' } }), h('span', { text: 'STRIDES · GRAND TOUR' })));
      document.body.appendChild(this.photoEl);
    } else this.photoEl?.remove();
  }
}
