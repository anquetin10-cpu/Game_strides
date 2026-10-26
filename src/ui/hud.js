// HUD en jeu : minimap, portefeuille, objectif, télémétrie, boutons tactiles, notifications, dialogues.
import { h, tap } from './dom.js';
import { icon } from './icons.js';
import { Minimap } from './minimap.js';
import { formatMoney, formatTime, dec } from '../core/math.js';
import { HORSE } from '../config.js';

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.el = h('div.hud');
    root.appendChild(this.el);
    this._build();
    this.notifQueue = [];
    this.notifActive = null;
    this.dialogActive = null;
    // Téléphone ouvert : une bannière passerait dessous, hors d'atteinte ; elle attend sa fermeture.
    game.bus.on('phone:open', () => this._holdNotif());
    game.bus.on('phone:close', () => {
      if (!this.notifActive) this._nextNotif();
    });
  }

  _build() {
    const g = this.game;
    // Minimap.
    this.mmCanvas = h('canvas');
    this.zoneEl = h('div.zone-name', { text: '' });
    const mmWrap = h('div.minimap-wrap', {}, h('div.minimap.clickable', {}, this.mmCanvas), this.zoneEl);
    tap(mmWrap.firstChild, () => g.phone.open('map'));
    this.minimap = new Minimap(this.mmCanvas, g);

    // Portefeuille + téléphone.
    this.moneyEl = h('div.money.tab-num', { text: '0 €' });
    this.levelEl = h('span', { text: 'GROOM' });
    this.xpEl = h('i');
    this.starsEl = h('div.stars-line', { text: '' });
    this.phoneBtn = h('button.phone-btn.clickable', { 'aria-label': 'Téléphone', html: icon('phone') }, h('span.badge', { text: '1' }));
    this.pauseBtn = h('button.icon-btn.clickable', { 'aria-label': 'Pause', html: icon('pause') });
    const wallet = h('div.wallet', {}, this.moneyEl, h('div.level-line', {}, this.levelEl, h('div.xpbar', {}, this.xpEl)), this.starsEl);
    g.input.bindButton(this.phoneBtn, 'phone');
    g.input.bindButton(this.pauseBtn, 'pause');

    // Objectif : mission, consigne, détail éventuel, et le chrono à droite.
    this.objTag = h('div.tag');
    this.objText = h('div.text');
    this.objSub = h('div.sub.hidden');
    this.objTimer = h('div.timer.tab-num.hidden');
    this.objMain = h('div.obj-main', {}, this.objTag, this.objText, this.objSub);
    this.objEl = h('div.objective.off', {}, this.objMain, this.objTimer);
    this.hintEl = h('div.hint.off');
    this.toastsEl = h('div.toasts');

    // Bandeau du haut : minimap | objectif, astuce, toasts | portefeuille. Le centre de l'écran reste dégagé.
    this.topMid = h('div.top-mid', {}, this.objEl, this.hintEl, this.toastsEl);
    this.el.appendChild(h('div.top-bar', {}, mmWrap, this.topMid, h('div.top-right', {}, wallet, this.phoneBtn, this.pauseBtn)));

    // Télémétrie.
    this.gearEl = h('div.gear', { text: 'N' });
    this.gaitEl = h('div.gait-name', { text: 'ARRÊT' });
    this.speedEl = h('div.speed.tab-num', { html: '0<small>km/h</small>' });
    this.staminaEl = h('div.stamina', {}, ...Array.from({ length: 10 }, () => h('i')));
    this.comfortEl = h('div.comfort.hidden');
    // Cardiofréquencemètre (comme les capteurs de sangle utilisés en entraînement).
    this.hrVal = h('span.tab-num', { text: '36' });
    this.hrEl = h('div.hr-line.hidden', {}, h('i.heart'), this.hrVal, h('small', { text: ' bpm' }));
    this.comfortBar = h('i');
    this.comfortTxt = h('span');
    this.comfortEl.append(this.comfortTxt, h('b', {}, this.comfortBar));
    this.teleEl = h('div.telemetry.hidden', {}, this.gearEl, h('div.tele-col', {}, h('div.tele-row', {}, this.gaitEl, this.speedEl), this.staminaEl, this.hrEl, this.comfortEl));
    this.el.appendChild(this.teleEl);

    // Boutons d'action.
    const mk = (cls, name, ic, label) => {
      const b = h(`button.btn-round.${cls}`, { 'aria-label': label }, h('div', { html: icon(ic) }), h('span', { text: label }));
      g.input.bindButton(b, name);
      return b;
    };
    this.btnJump = mk('btn-jump', 'jump', 'jump', 'Saut');
    this.btnJump.prepend(h('div.ring'));
    this.btnGallop = mk('btn-gallop', 'gallop', 'boost', 'Boost');
    // Jauge d'endurance autour du bouton BOOST (grand galop).
    this.btnGallop.prepend(h('div.ring'));
    this.btnAction = mk('btn-action.hide', 'action', 'hand', 'Action');
    this.btnWhistle = mk('btn-whistle', 'whistle', 'whistle', '');
    this.btnWhistle.querySelector('span').remove();
    // Action secondaire contextuelle (mener en main, rampe…), à la place du bouton de saut quand on est à pied.
    this.btnAction2 = mk('btn-action2.hide', 'action2', 'hand', '');
    this.actionsEl = h('div.actions', {}, this.btnGallop, this.btnJump, this.btnAction, this.btnAction2, this.btnWhistle);
    this.el.appendChild(this.actionsEl);

    // Message central.
    this.bigEl = h('div.big-msg.hidden', {}, h('div.t'), h('div.s'));
    this.el.appendChild(this.bigEl);

    // Notification (un seul écouteur : l'action dépend de la notification affichée).
    this.notifEl = h('div.notif');
    this.root.appendChild(this.notifEl);
    tap(this.notifEl, () => this._notifTap?.());

    // Dialogue.
    this.dialogEl = h('div.dialog.hidden');
    this.root.appendChild(this.dialogEl);
    tap(this.dialogEl, () => this.advanceDialog());
    this._lastAction = '';
    this._lastMode = '';
  }

  resize() {
    this.minimap.resize();
  }

  setMoney(v) {
    this.moneyEl.textContent = formatMoney(v);
  }

  setLevel(info, rating) {
    this.levelEl.textContent = info.short;
    this.xpEl.style.width = `${Math.round(info.progress * 100)}%`;
    this.starsEl.textContent = rating ? `★ ${dec(rating)} · STRIDES` : '';
  }

  setZone(name) {
    if (this.zoneEl.textContent !== name) this.zoneEl.textContent = name;
  }

  // L'astuce se loge dans la carte de l'objectif (une ligne) quand il y en a une : un seul bloc en haut de l'écran.
  _placeHint() {
    const inline = !this.objEl.classList.contains('off');
    if (this.hintEl.classList.contains('inline') === inline && this.hintEl.parentNode) return;
    this.hintEl.classList.toggle('inline', inline);
    if (inline) this.objMain.appendChild(this.hintEl);
    else this.topMid.insertBefore(this.hintEl, this.toastsEl);
  }

  setObjective(o) {
    if (!o) {
      if (!this.objEl.classList.contains('off')) {
        this.objEl.classList.add('off');
        this._placeHint();
      }
      return;
    }
    if (this.objEl.classList.contains('off')) {
      this.objEl.classList.remove('off');
      this._placeHint();
    }
    // Appelé à chaque image : n'écrire dans le DOM que ce qui change.
    const set = (el, v) => el.textContent !== v && (el.textContent = v);
    set(this.objTag, o.tag || '');
    const text = o.text || '';
    if (this.objText.textContent !== text) {
      this.objText.textContent = text;
      // Nouvelle consigne : petit flash pour attirer l'œil sans masquer l'action.
      this.objEl.classList.remove('changed');
      void this.objEl.offsetWidth;
      this.objEl.classList.add('changed');
    }
    this.objSub.classList.toggle('hidden', !o.sub);
    if (o.sub) set(this.objSub, o.sub);
    const timed = o.timer !== undefined && o.timer !== null;
    this.objTimer.classList.toggle('hidden', !timed);
    if (timed) {
      set(this.objTimer, formatTime(o.timer));
      this.objTimer.classList.toggle('warn', o.timer < 10);
    }
  }

  setPhoneBadge(n, ringing = false) {
    this.phoneBtn.classList.toggle('has-badge', n > 0);
    this.phoneBtn.querySelector('.badge').textContent = String(n);
    this.phoneBtn.classList.toggle('ring', ringing);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const mode = p.mode;
    // Télémétrie.
    if (mode === 'ride' || mode === 'drive') {
      this.teleEl.classList.remove('hidden');
      const sp = Math.abs(p.speed) * 3.6;
      this.speedEl.innerHTML = `${Math.round(sp)}<small>km/h</small>`;
      if (mode === 'ride') {
        const gi = p.horse.gait;
        const gd = HORSE.gaits[gi];
        if (this.gearEl.textContent !== gd.short) {
          this.gearEl.textContent = gd.short;
          // Après le camion : le rapport (D3…) était en petit, l'allure reprend la grande taille.
          this.gearEl.classList.remove('small');
        }
        this.gaitEl.textContent = gd.name;
        const st = p.horse.stamina / p.horse.maxStamina;
        const on = Math.ceil(st * 10);
        this.staminaEl.classList.remove('hidden');
        this.staminaEl.classList.toggle('low', p.horse.exhausted || st < 0.25);
        [...this.staminaEl.children].forEach((c, i) => c.classList.toggle('on', i < on));
        // Bouton BOOST : anneau d'endurance, allumé pendant le grand galop, éteint quand le cheval est essoufflé.
        const pct = Math.round(st * 100);
        if (pct !== this._boostPct) {
          this._boostPct = pct;
          this.btnGallop.style.setProperty('--st', `${pct}%`);
        }
        this.btnGallop.classList.toggle('boosting', gi === 4);
        this.btnGallop.classList.toggle('empty', !!p.horse.exhausted);
        const cond = p.horse.cond;
        if (cond && (this._hrT = (this._hrT || 0) - dt) <= 0) {
          this._hrT = 0.5;
          const bpm = Math.round(cond.hr);
          this.hrVal.textContent = String(bpm);
          this.hrEl.classList.remove('hidden');
          this.hrEl.classList.toggle('high', bpm > 180);
          this.hrEl.style.setProperty('--beat', `${(60 / bpm).toFixed(2)}s`);
        }
      } else {
        this.hrEl.classList.add('hidden');
        // Véhicule conduit : rapport engagé (boîte auto), régime moteur en barregraphe (zone rouge au régime maxi).
        const t = p.vehicle || p.truck;
        const gl = t.gearLabel;
        if (this.gearEl.textContent !== gl) {
          this.gearEl.textContent = gl;
          this.gearEl.classList.toggle('small', gl.length > 1);
        }
        const rpm = Math.round(t.rpm / 50) * 50;
        const rt = `${rpm.toLocaleString('fr-FR')} tr/min`;
        if (this.gaitEl.textContent !== rt) this.gaitEl.textContent = rt;
        this.staminaEl.classList.remove('hidden', 'low');
        this.staminaEl.classList.add('rpm');
        const on = Math.round((t.rpm / ((t.redline || 2450) * 1.06)) * 10);
        [...this.staminaEl.children].forEach((c, i) => {
          c.classList.toggle('on', i < on);
          c.classList.toggle('red', i >= 9);
        });
        if (t.blockedT > 0.5 && !this._blockedHint) {
          this._blockedHint = true;
          this.hint(t.door.t > 0 ? 'Porte de service ouverte.' : 'Rampe ouverte : <b>ferme-la</b> à l’arrière du camion avant de rouler.', 3500);
        } else if (!t.blockedT) this._blockedHint = false;
      }
      if (mode !== 'drive') this.staminaEl.classList.remove('rpm');
      // Confort du cheval transporté (mission de transport ou cheval à bord).
      const tp = p.transport;
      const mc = g.missions?.comfort;
      const aboard = tp && tp.aboard.length ? tp.aboard[0].horse : null;
      const comfort = mc !== undefined && mc !== null ? mc : aboard ? tp.comfort : null;
      if (comfort !== null && mode === 'drive') {
        this.comfortEl.classList.remove('hidden');
        const txt = `CONFORT${aboard ? ` · ${aboard.name.toUpperCase()}` : ' DU CHEVAL'} ${Math.round(comfort)} %`;
        if (this.comfortTxt.textContent !== txt) this.comfortTxt.textContent = txt;
        this.comfortBar.style.width = `${Math.round(comfort)}%`;
        this.comfortEl.classList.toggle('warn', comfort < 70);
        this.comfortEl.classList.toggle('bad', comfort < 45);
      } else this.comfortEl.classList.add('hidden');
    } else this.teleEl.classList.add('hidden');

    // Boutons selon le mode.
    if (mode !== this._lastMode) {
      this._lastMode = mode;
      this.teleEl.classList.toggle('drive', mode === 'drive');
      this.btnJump.classList.toggle('hide', mode !== 'ride');
      this.btnGallop.classList.toggle('hide', mode === 'drive');
      this.btnGallop.classList.toggle('boost', mode === 'ride');
      if (mode !== 'ride') this.btnGallop.classList.remove('boosting', 'empty');
      this.btnGallop.querySelector('span').textContent = mode === 'ride' ? 'Boost' : 'Courir';
      this.btnGallop.querySelector('div:not(.ring)').innerHTML = icon(mode === 'ride' ? 'boost' : 'run');
    }
    this.btnWhistle.classList.toggle('hide', !(mode === 'foot' && p.horse && !p.horse.hiddenInTruck && !g.missions?.noWhistle));
    // Action secondaire du transport (calculée après l'action principale).
    const sec = mode === 'foot' && p.transport ? p.transport.secondary() : null;
    const l2 = sec ? sec.label : '';
    if (l2 !== this._lastAction2) {
      this._lastAction2 = l2;
      this.btnAction2.classList.toggle('hide', !sec);
      if (sec) {
        this.btnAction2.querySelector('span').textContent = l2;
        this.btnAction2.querySelector('div').innerHTML = icon(sec.icon || 'hand');
      }
    }
    const cur = g.interact.current;
    const label = cur ? `${cur.label}\u200b${cur.icon || ''}` : '';
    if (label !== this._lastAction) {
      this._lastAction = label;
      this.btnAction.classList.toggle('hide', !cur);
      if (cur) {
        this.btnAction.querySelector('span').textContent = cur.label;
        this.btnAction.querySelector('div').innerHTML = icon(cur.icon || 'hand');
      }
    }
    // Indicateur d'appel de saut.
    const jt = g.course?.jumpTiming?.() || 'none';
    this.btnJump.classList.toggle('good', jt === 'good');
    this.btnJump.classList.toggle('near', jt === 'near');
    this.minimap.draw(dt);
  }

  toast(text, kind = '') {
    const t = h(`div.toast${kind ? `.${kind}` : ''}`, { text });
    this.toastsEl.appendChild(t);
    // Écran bas : un seul toast à la fois, pour laisser le centre de l'écran libre.
    while (this.toastsEl.children.length > (innerHeight <= 420 ? 1 : 2)) this.toastsEl.firstChild.remove();
    setTimeout(() => t.remove(), 3200);
  }

  big(title, sub = '', ms = 2200) {
    const el = this.bigEl;
    el.querySelector('.t').textContent = title;
    el.querySelector('.s').textContent = sub;
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth;
    el.classList.add('pop');
    // L'objectif s'efface le temps du grand message (ils se chevauchent sur écran court), puis réapparaît.
    this.el.classList.add('big-on');
    clearTimeout(this._bigT);
    this._bigT = setTimeout(() => {
      el.classList.add('hidden');
      // Les cartes ne reviennent qu'après une courte marge : un compte à rebours (3-2-1) ne les fait pas clignoter.
      this._bigT = setTimeout(() => this.el.classList.remove('big-on'), 400);
    }, ms);
  }

  hint(html, ms = 4500) {
    this.hintEl.innerHTML = html;
    this.hintEl.classList.remove('off');
    this._placeHint();
    clearTimeout(this._hintT);
    if (ms) this._hintT = setTimeout(() => this.hintEl.classList.add('off'), ms);
  }
  clearHint() {
    this.hintEl.classList.add('off');
  }

  // Notification façon iOS. actions: [{ label, primary, run }]
  notify(n) {
    this.notifQueue.push(n);
    if (!this.notifActive) this._nextNotif();
  }
  _nextNotif() {
    // Téléphone ouvert : la file attend sa fermeture (voir le constructeur).
    const n = this.game.phone?.isOpen ? null : this.notifQueue.shift();
    if (!n) {
      this.notifActive = null;
      return;
    }
    this.notifActive = n;
    const el = this.notifEl;
    el.innerHTML = '';
    el.append(
      h('div.n-head', {}, h('div.n-app', { html: icon('strides') }), h('span', { text: n.app || 'STRIDES' }), h('span.when', { text: 'maintenant' })),
      h('div.n-title', { text: n.title }),
      n.body ? h('div.n-body', { text: n.body }) : null
    );
    if (n.actions?.length) {
      const row = h('div.n-actions');
      for (const a of n.actions) {
        const b = h(`button${a.primary ? '.primary' : ''}`, { text: a.label });
        tap(b, () => {
          this._closeNotif();
          a.run?.();
        });
        row.appendChild(b);
      }
      el.appendChild(row);
      this._notifTap = null;
    } else {
      this._notifTap = () => {
        this._notifTap = null;
        this._closeNotif();
        n.onTap?.();
      };
    }
    this.game.audio.notify();
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(this._notifT);
    // Sur écran bas, la notification couvre une part plus grande de l'écran : elle reste moins longtemps.
    const ms = n.timeout || 9000;
    this._notifT = setTimeout(() => this._closeNotif(), innerHeight <= 420 ? Math.min(ms, 7000) : ms);
  }
  _closeNotif() {
    clearTimeout(this._notifT);
    this._notifTap = null;
    this.notifEl.classList.remove('show');
    const n = this.notifActive;
    setTimeout(() => {
      if (this.notifActive === n) this._nextNotif();
    }, 420);
  }
  // Bannière affichée quand le téléphone s'ouvre : elle repasse en tête de file et reviendra à la fermeture.
  _holdNotif() {
    const n = this.notifActive;
    if (!n || !this.notifEl.classList.contains('show')) return;
    clearTimeout(this._notifT);
    this._notifTap = null;
    this.notifEl.classList.remove('show');
    this.notifActive = null;
    this.notifQueue.unshift(n);
  }

  // Dialogue : lines = [{ who, initials, text }]
  dialog(lines, onDone) {
    this.dialogActive = { lines: [...lines], onDone };
    this.dialogEl.classList.remove('hidden');
    // Cheval à l'arrêt pendant un dialogue : la télémétrie s'efface (le dialogue la recouvrait sur écran court).
    this.el.classList.add('dialog-on');
    this._showLine();
  }
  _showLine() {
    const d = this.dialogActive;
    const l = d.lines[0];
    this.dialogEl.innerHTML = '';
    this.dialogEl.append(
      h('div.who', {}, h('div.av', { text: l.initials || (l.who || '?').slice(0, 2).toUpperCase() }), h('span', { text: l.who }), h('span.next', { text: d.lines.length > 1 ? 'Toucher pour continuer' : 'Toucher pour fermer' })),
      h('div.line', { text: l.text })
    );
    // Écran court, texte long : si le dialogue remonte jusqu'à la plaque de zone, celle-ci s'efface le temps de la lecture.
    const dr = this.dialogEl.getBoundingClientRect(), zr = this.zoneEl.getBoundingClientRect();
    this.el.classList.toggle('dialog-high', dr.top < zr.bottom && dr.left < zr.right);
  }
  advanceDialog() {
    const d = this.dialogActive;
    if (!d) return false;
    d.lines.shift();
    this.game.audio.click();
    if (d.lines.length) this._showLine();
    else {
      this.closeDialog();
      d.onDone?.();
    }
    return true;
  }
  // Ferme le dialogue sans le « terminer » (mission abandonnée, retour à l'écran titre).
  closeDialog() {
    this.dialogActive = null;
    this.dialogEl.classList.add('hidden');
    this.el.classList.remove('dialog-on', 'dialog-high');
  }
}
