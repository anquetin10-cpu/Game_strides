// HUD en jeu : minimap, portefeuille, objectif, télémétrie, boutons tactiles, notifications, dialogues.
import { h, tap } from './dom.js';
import { icon } from './icons.js';
import { Minimap } from './minimap.js';
import { formatMoney, formatTime } from '../core/math.js';
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
  }

  _build() {
    const g = this.game;
    // Minimap.
    this.mmCanvas = h('canvas');
    this.zoneEl = h('div.zone-name', { text: '' });
    const mmWrap = h('div.minimap-wrap', {}, h('div.minimap.clickable', {}, this.mmCanvas), this.zoneEl);
    tap(mmWrap.firstChild, () => g.phone.open('map'));
    this.el.appendChild(mmWrap);
    this.minimap = new Minimap(this.mmCanvas, g);

    // Portefeuille + téléphone.
    this.moneyEl = h('div.money.tab-num', { text: '0 €' });
    this.levelEl = h('span', { text: 'GROOM' });
    this.xpEl = h('i');
    this.starsEl = h('div.stars-line', { text: '' });
    this.phoneBtn = h('button.phone-btn.clickable', { 'aria-label': 'Téléphone', html: icon('phone') }, h('span.badge', { text: '1' }));
    this.pauseBtn = h('button.icon-btn.clickable', { 'aria-label': 'Pause', html: icon('pause') });
    const wallet = h('div.wallet', {}, this.moneyEl, h('div.level-line', {}, this.levelEl, h('div.xpbar', {}, this.xpEl)), this.starsEl);
    this.el.appendChild(h('div.top-right', {}, wallet, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' } }, this.phoneBtn, this.pauseBtn)));
    g.input.bindButton(this.phoneBtn, 'phone');
    g.input.bindButton(this.pauseBtn, 'pause');

    // Objectif.
    this.objTag = h('div.tag');
    this.objText = h('div.text');
    this.objTimer = h('div.timer.tab-num.hidden');
    this.objSub = h('div.sub.hidden');
    this.objEl = h('div.objective.off', {}, this.objTag, this.objText, this.objSub, this.objTimer);
    this.el.appendChild(this.objEl);

    // Télémétrie.
    this.gearEl = h('div.gear', { text: 'N' });
    this.gaitEl = h('div.gait-name', { text: 'ARRÊT' });
    this.speedEl = h('div.speed.tab-num', { html: '0<small>km/h</small>' });
    this.staminaEl = h('div.stamina', {}, ...Array.from({ length: 10 }, () => h('i')));
    this.comfortEl = h('div.comfort.hidden');
    this.teleEl = h('div.telemetry.hidden', {}, this.gearEl, h('div.tele-col', {}, h('div.tele-row', {}, this.gaitEl, this.speedEl), this.staminaEl, this.comfortEl));
    this.el.appendChild(this.teleEl);

    // Boutons d'action.
    const mk = (cls, name, ic, label) => {
      const b = h(`button.btn-round.${cls}`, { 'aria-label': label }, h('div', { html: icon(ic) }), h('span', { text: label }));
      g.input.bindButton(b, name);
      return b;
    };
    this.btnJump = mk('btn-jump', 'jump', 'jump', 'Saut');
    this.btnJump.prepend(h('div.ring'));
    this.btnGallop = mk('btn-gallop', 'gallop', 'gallop', 'Galop');
    this.btnAction = mk('btn-action', 'action', 'hand', 'Action');
    this.btnWhistle = mk('btn-whistle', 'whistle', 'whistle', '');
    this.btnWhistle.querySelector('span').remove();
    this.actionsEl = h('div.actions', {}, this.btnGallop, this.btnJump, this.btnAction, this.btnWhistle);
    this.el.appendChild(this.actionsEl);

    // Toasts, message central, astuce.
    this.toastsEl = h('div.toasts');
    this.bigEl = h('div.big-msg.hidden', {}, h('div.t'), h('div.s'));
    this.hintEl = h('div.hint.off');
    this.el.append(this.toastsEl, this.bigEl, this.hintEl);

    // Notification.
    this.notifEl = h('div.notif');
    this.root.appendChild(this.notifEl);

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
    this.starsEl.textContent = rating ? `★ ${rating.toFixed(1)} · STRIDES` : '';
  }

  setZone(name) {
    if (this.zoneEl.textContent !== name) this.zoneEl.textContent = name;
  }

  setObjective(o) {
    if (!o) {
      this.objEl.classList.add('off');
      return;
    }
    this.objEl.classList.remove('off');
    this.objTag.textContent = o.tag || '';
    this.objText.textContent = o.text || '';
    if (o.sub) {
      this.objSub.textContent = o.sub;
      this.objSub.classList.remove('hidden');
    } else this.objSub.classList.add('hidden');
    if (o.timer !== undefined && o.timer !== null) {
      this.objTimer.classList.remove('hidden');
      this.objTimer.textContent = formatTime(o.timer);
      this.objTimer.classList.toggle('warn', o.timer < 10);
    } else this.objTimer.classList.add('hidden');
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
        this.gearEl.textContent = gd.short;
        this.gaitEl.textContent = gd.name;
        const st = p.horse.stamina / p.horse.maxStamina;
        const on = Math.ceil(st * 10);
        this.staminaEl.classList.remove('hidden');
        this.staminaEl.classList.toggle('low', p.horse.exhausted || st < 0.25);
        [...this.staminaEl.children].forEach((c, i) => c.classList.toggle('on', i < on));
      } else {
        const v = p.truck.speed;
        this.gearEl.textContent = v < -0.3 ? 'R' : Math.abs(v) < 0.3 ? 'N' : String(Math.min(5, 1 + Math.floor(Math.abs(v) / 5)));
        this.gaitEl.textContent = 'CAMION';
        this.staminaEl.classList.add('hidden');
      }
      const comfort = g.missions?.comfort;
      if (comfort !== undefined && comfort !== null && mode === 'drive') {
        this.comfortEl.classList.remove('hidden');
        this.comfortEl.textContent = `CONFORT DU CHEVAL ${Math.round(comfort)} %`;
      } else this.comfortEl.classList.add('hidden');
    } else this.teleEl.classList.add('hidden');

    // Boutons selon le mode.
    if (mode !== this._lastMode) {
      this._lastMode = mode;
      this.btnJump.classList.toggle('hide', mode !== 'ride');
      this.btnGallop.classList.toggle('hide', mode === 'drive');
      this.btnGallop.querySelector('span').textContent = mode === 'ride' ? 'Galop' : 'Courir';
      this.btnGallop.querySelector('div').innerHTML = icon(mode === 'ride' ? 'gallop' : 'run');
    }
    this.btnWhistle.classList.toggle('hide', !(mode === 'foot' && p.horse && !p.horse.hiddenInTruck && !g.missions?.noWhistle));
    const cur = g.interact.current;
    const label = cur ? cur.label : '';
    if (label !== this._lastAction) {
      this._lastAction = label;
      this.btnAction.classList.toggle('hide', !cur);
      if (cur) {
        this.btnAction.querySelector('span').textContent = label;
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
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => t.remove(), 3200);
  }

  big(title, sub = '', ms = 2200) {
    const el = this.bigEl;
    el.querySelector('.t').textContent = title;
    el.querySelector('.s').textContent = sub;
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(this._bigT);
    this._bigT = setTimeout(() => el.classList.add('hidden'), ms);
  }

  hint(html, ms = 4500) {
    this.hintEl.innerHTML = html;
    this.hintEl.classList.remove('off');
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
    const n = this.notifQueue.shift();
    if (!n) {
      this.notifActive = null;
      return;
    }
    this.notifActive = n;
    const el = this.notifEl;
    el.innerHTML = '';
    el.append(
      h('div.n-head', {}, h('div.app', { html: icon('strides'), style: { color: '#121316' } }), h('span', { text: n.app || 'STRIDES' }), h('span.when', { text: 'maintenant' })),
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
    } else {
      tap(el, () => {
        this._closeNotif();
        n.onTap?.();
      });
    }
    this.game.audio.notify();
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(this._notifT);
    this._notifT = setTimeout(() => this._closeNotif(), n.timeout || 9000);
  }
  _closeNotif() {
    clearTimeout(this._notifT);
    this.notifEl.classList.remove('show');
    const n = this.notifActive;
    setTimeout(() => {
      if (this.notifActive === n) this._nextNotif();
    }, 420);
  }

  // Dialogue : lines = [{ who, initials, text }]
  dialog(lines, onDone) {
    this.dialogActive = { lines: [...lines], onDone };
    this.dialogEl.classList.remove('hidden');
    this._showLine();
  }
  _showLine() {
    const d = this.dialogActive;
    const l = d.lines[0];
    this.dialogEl.innerHTML = '';
    this.dialogEl.append(
      h('div.who', {}, h('div.av', { text: l.initials || (l.who || '?').slice(0, 2).toUpperCase() }), h('span', { text: l.who })),
      h('div.line', { text: l.text }),
      h('div.next', { text: d.lines.length > 1 ? 'TOUCHER POUR CONTINUER' : 'TOUCHER POUR FERMER' })
    );
  }
  advanceDialog() {
    const d = this.dialogActive;
    if (!d) return false;
    d.lines.shift();
    this.game.audio.click();
    if (d.lines.length) this._showLine();
    else {
      this.dialogActive = null;
      this.dialogEl.classList.add('hidden');
      d.onDone?.();
    }
    return true;
  }
}
