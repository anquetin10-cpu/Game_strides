// Entrées unifiées : joystick tactile flottant, glisser pour la caméra, boutons, clavier et souris.
export class Input {
  constructor(surface, layer) {
    this.surface = surface; // élément qui reçoit les gestes (canvas)
    this.layer = layer; // calque des contrôles tactiles
    this.move = { x: 0, y: 0, mag: 0 };
    this.look = { dx: 0, dy: 0 };
    this.held = new Set();
    this.pressed = new Set();
    this.enabled = true;
    this.lastLookTime = -1e9;
    this.keys = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookPtr = { id: null, x: 0, y: 0 };
    this.R = 58;
    this._buildJoystick();
    this._bind();
  }

  _buildJoystick() {
    const base = document.createElement('div');
    base.className = 'joy-base';
    const knob = document.createElement('div');
    knob.className = 'joy-knob';
    base.appendChild(knob);
    this.layer.appendChild(base);
    this.joyEl = base;
    this.knobEl = knob;
    this._restJoy();
  }

  _restJoy() {
    this.joyEl.classList.remove('active');
    this.joyEl.style.left = '';
    this.joyEl.style.top = '';
    this.knobEl.style.transform = 'translate(-50%, -50%)';
  }

  _inJoyZone(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    return x < w * 0.45 && y > h * 0.3;
  }

  _bind() {
    const s = this.surface;
    const opts = { passive: false };
    s.addEventListener('pointerdown', (e) => this._down(e), opts);
    window.addEventListener('pointermove', (e) => this._moveEvt(e), opts);
    window.addEventListener('pointerup', (e) => this._up(e), opts);
    window.addEventListener('pointercancel', (e) => this._up(e), opts);
    // iOS : empêcher défilement, zoom et loupe.
    document.addEventListener('touchmove', (e) => { if (e.target.closest && !e.target.closest('.scrollable')) e.preventDefault(); }, opts);
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    document.addEventListener('dblclick', (e) => e.preventDefault(), opts);
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    // Passage en arrière-plan (autre app, notification, écran verrouillé) : aucune commande ne reste active.
    document.addEventListener('visibilitychange', () => document.hidden && this.releaseAll());
    s.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    if (e.pointerType !== 'mouse' && this.joy.id === null && this._inJoyZone(x, y)) {
      this.joy.id = e.pointerId;
      this.joy.ox = x;
      this.joy.oy = y;
      this.joy.x = x;
      this.joy.y = y;
      this.joyEl.classList.add('active');
      this.joyEl.style.left = `${x}px`;
      this.joyEl.style.top = `${y}px`;
      this._updJoy();
      return;
    }
    if (this.lookPtr.id === null) {
      this.lookPtr.id = e.pointerId;
      this.lookPtr.x = x;
      this.lookPtr.y = y;
    }
  }

  _moveEvt(e) {
    if (e.pointerId === this.joy.id) {
      e.preventDefault();
      this.joy.x = e.clientX;
      this.joy.y = e.clientY;
      this._updJoy();
    } else if (e.pointerId === this.lookPtr.id) {
      e.preventDefault();
      const k = e.pointerType === 'mouse' ? 1 : 1.25;
      this.look.dx += (e.clientX - this.lookPtr.x) * k;
      this.look.dy += (e.clientY - this.lookPtr.y) * k;
      this.lookPtr.x = e.clientX;
      this.lookPtr.y = e.clientY;
      this.lastLookTime = performance.now();
    }
  }

  _up(e) {
    if (e.pointerId === this.joy.id) {
      this.joy.id = null;
      this.move.x = this.move.y = this.move.mag = 0;
      this._restJoy();
    }
    if (e.pointerId === this.lookPtr.id) this.lookPtr.id = null;
  }

  _updJoy() {
    let dx = this.joy.x - this.joy.ox;
    let dy = this.joy.y - this.joy.oy;
    const d = Math.hypot(dx, dy);
    // La base suit le doigt si on dépasse le rayon (joystick flottant).
    if (d > this.R) {
      const k = (d - this.R) / d;
      this.joy.ox += dx * k;
      this.joy.oy += dy * k;
      dx = this.joy.x - this.joy.ox;
      dy = this.joy.y - this.joy.oy;
      this.joyEl.style.left = `${this.joy.ox}px`;
      this.joyEl.style.top = `${this.joy.oy}px`;
    }
    const mag = Math.min(1, Math.hypot(dx, dy) / this.R);
    this.move.x = dx / this.R;
    this.move.y = -dy / this.R;
    this.move.mag = mag;
    this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  bindButton(el, name) {
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled && name !== 'phone' && name !== 'pause') return;
      el.setPointerCapture?.(e.pointerId);
      this.held.add(name);
      this.pressed.add(name);
      el.classList.add('down');
    };
    const up = (e) => {
      e.preventDefault();
      this.held.delete(name);
      el.classList.remove('down');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  _key(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.code;
    const map = {
      Space: 'jump', ShiftLeft: 'gallop', ShiftRight: 'gallop', KeyE: 'action', KeyF: 'action', Enter: 'action',
      KeyQ: 'whistle', KeyR: 'whistle', KeyP: 'phone', Tab: 'phone', KeyM: 'map', Escape: 'pause', KeyC: 'camera', KeyH: 'horn',
    };
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    const name = map[k];
    if (name) {
      if (down && !e.repeat) {
        if (this.enabled || name === 'phone' || name === 'pause' || name === 'map') this.pressed.add(name);
      }
      if (down && this.enabled) this.held.add(name);
      if (!down) this.held.delete(name);
    }
  }

  // Combine clavier et joystick (y = avant).
  poll() {
    if (this.joy.id === null) {
      const K = this.keys;
      let x = 0, y = 0;
      if (K.has('KeyW') || K.has('ArrowUp')) y += 1;
      if (K.has('KeyS') || K.has('ArrowDown')) y -= 1;
      if (K.has('KeyD') || K.has('ArrowRight')) x += 1;
      if (K.has('KeyA') || K.has('ArrowLeft')) x -= 1;
      const walk = K.has('AltLeft') || K.has('ControlLeft');
      const m = Math.hypot(x, y);
      if (m > 0) {
        const s = walk ? 0.4 : 0.8;
        this.move.x = (x / m) * s;
        this.move.y = (y / m) * s;
        this.move.mag = s;
      } else if (this.move.mag && !this._virtual) {
        this.move.x = this.move.y = this.move.mag = 0;
      }
    }
    if (!this.enabled) {
      this.move.x = this.move.y = this.move.mag = 0;
      this.look.dx = this.look.dy = 0;
    }
  }

  // Pour les tests automatisés.
  setVirtualMove(x, y) {
    this._virtual = x !== 0 || y !== 0;
    const m = Math.min(1, Math.hypot(x, y));
    this.move.x = x;
    this.move.y = y;
    this.move.mag = m;
  }

  wasPressed(name) {
    return this.pressed.has(name);
  }
  isHeld(name) {
    return this.held.has(name);
  }

  endFrame() {
    this.pressed.clear();
    this.look.dx = 0;
    this.look.dy = 0;
  }

  releaseAll() {
    this.held.clear();
    this.keys.clear();
    this.joy.id = null;
    this.lookPtr.id = null;
    this.move.x = this.move.y = this.move.mag = 0;
    this._restJoy();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.releaseAll();
  }
}
