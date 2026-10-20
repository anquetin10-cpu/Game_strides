// Sons procéduraux WebAudio : sabots, sifflet, notifications, ambiance (vent, vagues, foule), moteur, musique légère.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.master = null;
  }

  // À appeler dans un geste utilisateur (exigence iOS).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // Petit son silencieux pour déverrouiller iOS.
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
    this.noiseBuf = this._noise(2);
    this._ambient();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else if (this.enabled) ctx.resume();
    });
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  _noise(sec) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _ambient() {
    const ctx = this.ctx;
    const mk = (freq, q, type = 'lowpass') => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { g, f };
    };
    this.wind = mk(500, 0.6);
    this.waves = mk(380, 0.4);
    this.crowd = mk(900, 0.7, 'bandpass');
    // Moteur du camion.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 50;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    const eg = ctx.createGain();
    eg.gain.value = 0;
    osc.connect(lp).connect(eg).connect(this.master);
    osc.start();
    this.engine = { osc, g: eg, lp };
  }

  // Appelé à chaque image avec l'état du monde.
  ambience({ speed = 0, seaDist = 999, crowd = 0, engine = -1, night = 0 }, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const wind = 0.02 + Math.min(speed / 16, 1) * 0.12;
    this.wind.g.gain.setTargetAtTime(wind, t, 0.3);
    this.wind.f.frequency.setTargetAtTime(400 + speed * 40, t, 0.3);
    const wv = Math.max(0, 1 - seaDist / 160) * (0.1 + 0.06 * Math.sin(t * 0.6));
    this.waves.g.gain.setTargetAtTime(wv, t, 0.4);
    this.crowd.g.gain.setTargetAtTime(crowd * 0.08, t, 0.5);
    if (engine >= 0) {
      this.engine.g.gain.setTargetAtTime(0.06, t, 0.2);
      this.engine.osc.frequency.setTargetAtTime(42 + engine * 4.2, t, 0.1);
      this.engine.lp.frequency.setTargetAtTime(220 + engine * 25, t, 0.1);
    } else this.engine.g.gain.setTargetAtTime(0, t, 0.2);
    this.musicTick();
    void dt;
    void night;
  }

  _env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  hoof(surface = 'grass', intensity = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    const freqs = { grass: 260, sand: 180, road: 1300, water: 900, wood: 700 };
    f.frequency.value = (freqs[surface] || 300) * (0.9 + Math.random() * 0.2);
    f.Q.value = surface === 'road' ? 4 : 1.2;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(this.master);
    const vol = (surface === 'road' ? 0.25 : surface === 'water' ? 0.18 : 0.32) * intensity;
    this._env(g, t, 0.004, vol, surface === 'water' ? 0.18 : 0.07);
    src.start(t, Math.random() * 1.5, 0.3);
    if (surface === 'water') {
      // Éclaboussure.
      const s2 = ctx.createBufferSource();
      s2.buffer = this.noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      const g2 = ctx.createGain();
      s2.connect(hp).connect(g2).connect(this.master);
      this._env(g2, t, 0.01, 0.08 * intensity, 0.25);
      s2.start(t, Math.random(), 0.4);
    }
  }

  tone(freq, dur = 0.15, type = 'sine', vol = 0.15, when = 0, slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    o.connect(g).connect(this.master);
    this._env(g, t, 0.01, vol, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  click() {
    this.tone(1800, 0.03, 'triangle', 0.05);
  }
  notify() {
    this.tone(1318, 0.12, 'sine', 0.12);
    this.tone(1760, 0.18, 'sine', 0.12, 0.1);
  }
  whistle() {
    this.tone(1900, 0.18, 'sine', 0.12, 0, 1.35);
    this.tone(2500, 0.25, 'sine', 0.12, 0.22, 0.75);
  }
  coin() {
    this.tone(1046, 0.08, 'triangle', 0.1);
    this.tone(1568, 0.16, 'triangle', 0.1, 0.07);
  }
  success() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.11, i * 0.09));
    this.tone(1318, 0.5, 'sine', 0.08, 0.38);
  }
  fail() {
    this.tone(392, 0.3, 'triangle', 0.12);
    this.tone(311, 0.45, 'triangle', 0.12, 0.22);
  }
  levelUp() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.1, i * 0.08));
  }
  fault() {
    this.tone(220, 0.18, 'square', 0.06);
    this.thud();
  }
  thud() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.2);
    const g = ctx.createGain();
    o.connect(g).connect(this.master);
    this._env(g, t, 0.005, 0.25, 0.25);
    o.start(t);
    o.stop(t + 0.3);
  }
  snort() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(this.master);
    this._env(g, t, 0.03, 0.2, 0.4);
    src.start(t, Math.random(), 0.5);
  }
  neigh() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11;
    const lg = ctx.createGain();
    lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    o.frequency.setValueAtTime(820, t);
    o.frequency.linearRampToValueAtTime(1050, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.9);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    o.connect(bp).connect(g).connect(this.master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1);
    lfo.stop(t + 1);
  }
  cheer() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.crowd.g.gain.cancelScheduledValues(t);
    this.crowd.g.gain.setValueAtTime(0.28, t);
    this.crowd.g.gain.setTargetAtTime(0.0, t + 1.6, 0.8);
  }
  // Musique d'ambiance procédurale (pads + arpèges, discrète).
  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (!this.musicBus) {
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      this.musicBus.connect(lp).connect(this.master);
      this.nextBar = this.ctx.currentTime + 0.3;
      this.bar = 0;
    }
    this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 1.2);
  }

  _note(freq, t, dur, type, vol, attack = 0.02) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  musicTick() {
    if (!this.ctx || !this.musicBus || !this.musicOn) return;
    const ctx = this.ctx;
    const bpm = 84;
    const beat = 60 / bpm;
    const barDur = beat * 4;
    const mid = (n) => 440 * Math.pow(2, (n - 69) / 12);
    // Ré majeur 7 — Si mineur 7 — Sol majeur 7 — La 6 sus.
    const chords = [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 66]];
    while (this.nextBar < ctx.currentTime + 0.6) {
      const t0 = this.nextBar;
      const ch = chords[Math.floor(this.bar / 2) % chords.length];
      // Pad.
      for (const n of ch) {
        this._note(mid(n - 12), t0, barDur * 1.05, 'triangle', 0.018, 0.6);
        this._note(mid(n - 12) * 1.004, t0, barDur * 1.05, 'sine', 0.014, 0.8);
      }
      // Basse.
      this._note(mid(ch[0] - 24), t0, beat * 1.8, 'sine', 0.05, 0.03);
      this._note(mid(ch[0] - 24), t0 + beat * 2, beat * 1.6, 'sine', 0.04, 0.03);
      // Arpège en croches, avec respirations.
      const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
      for (let k = 0; k < 8; k++) {
        if (Math.random() < 0.22) continue;
        const n = ch[pattern[k]] + (k === 7 && Math.random() < 0.3 ? 12 : 0);
        this._note(mid(n), t0 + (k * beat) / 2, beat * 0.9, 'sine', 0.022, 0.01);
      }
      this.nextBar += barDur;
      this.bar++;
    }
  }

  horn() {
    this.tone(330, 0.35, 'square', 0.06);
    this.tone(415, 0.35, 'square', 0.05);
  }
}
