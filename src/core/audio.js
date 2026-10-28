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
    if (this._engs) {
      // Moteurs des véhicules gérés par vehicleEngine() (régime, charge, distance).
      this.engine.g.gain.setTargetAtTime(0, t, 0.2);
    } else if (engine >= 0) {
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

  // Bruit filtré bref (brique de base des sons de sabots).
  _burst(t, { type = 'bandpass', freq = 400, q = 1, vol = 0.2, a = 0.003, d = 0.06, len = 0.25 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq * (0.9 + Math.random() * 0.2);
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(this.master);
    this._env(g, t, a, Math.max(0.0002, vol), d);
    src.start(t, Math.random() * 1.5, len);
  }

  // Pose de sabot selon le sol : fer qui claque sur le bitume, gravier qui crisse, herbe sourde, sable feutré, bois creux.
  hoof(surface = 'grass', intensity = 1) {
    if (!this.ctx) return;
    // Pont et plancher du camion : son creux dédié.
    if (surface === 'ramp' || surface === 'truck') return this._hoofTruck(surface, intensity);
    const t = this.ctx.currentTime + Math.random() * 0.01;
    const v = intensity;
    if (surface === 'road') {
      this._burst(t, { freq: 3200, q: 7, vol: 0.16 * v, a: 0.001, d: 0.025 });
      this._burst(t + 0.004, { freq: 520, q: 3, vol: 0.22 * v, a: 0.002, d: 0.07 });
    } else if (surface === 'gravel') {
      this._burst(t, { freq: 180, q: 1, vol: 0.18 * v, d: 0.06 });
      for (let i = 0; i < 4; i++) this._burst(t + 0.006 + Math.random() * 0.045, { type: 'highpass', freq: 1800 + Math.random() * 1500, q: 0.7, vol: 0.06 * v, a: 0.001, d: 0.012 });
    } else if (surface === 'sand') {
      this._burst(t, { freq: 140, q: 1, vol: 0.2 * v, a: 0.004, d: 0.08 });
      this._burst(t + 0.01, { freq: 900, q: 0.6, vol: 0.05 * v, a: 0.01, d: 0.1 });
    } else if (surface === 'wood') {
      this._burst(t, { freq: 240, q: 9, vol: 0.3 * v, a: 0.002, d: 0.12 });
      this._burst(t, { freq: 760, q: 5, vol: 0.12 * v, a: 0.001, d: 0.05 });
    } else if (surface === 'mud') {
      // Terre détrempée : choc mou puis succion quand le sabot se dégage.
      this._burst(t, { type: 'lowpass', freq: 170, q: 0.8, vol: 0.3 * v, a: 0.004, d: 0.09 });
      this._burst(t + 0.05 + Math.random() * 0.02, { freq: 620, q: 2.2, vol: 0.07 * v, a: 0.012, d: 0.06 });
    } else if (surface === 'water') {
      this._burst(t, { freq: 900, q: 1.2, vol: 0.16 * v, d: 0.18 });
      this._burst(t, { type: 'highpass', freq: 2500, q: 0.7, vol: 0.08 * v, a: 0.01, d: 0.25, len: 0.4 });
    } else {
      // Herbe / terre : choc sourd et léger arrachement.
      this._burst(t, { type: 'lowpass', freq: surface === 'soil' ? 260 : 200, q: 0.9, vol: 0.32 * v, a: 0.003, d: 0.07 });
      this._burst(t + 0.008, { freq: 1400, q: 0.8, vol: 0.025 * v, a: 0.005, d: 0.05 });
    }
  }

  // Chant d'oiseau (merle, fauvette) : trilles en glissandos rapides.
  birdsong(vol = 0.05) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.05;
    const notes = 3 + Math.floor(Math.random() * 6);
    const base = 2000 + Math.random() * 1800;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      const f0 = base * (0.8 + Math.random() * 0.5), f1 = f0 * (0.7 + Math.random() * 0.7);
      const d = 0.05 + Math.random() * 0.09;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + d);
      o.connect(g).connect(this.master);
      this._env(g, t, 0.008, vol, d);
      o.start(t);
      o.stop(t + d + 0.05);
      t += d + 0.02 + Math.random() * 0.06;
    }
  }

  // Cri de goéland : « kiaou » descendant, voix rauque (harmoniques).
  gull(vol = 0.05) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const calls = 1 + Math.floor(Math.random() * 3);
    for (let c = 0; c < calls; c++) {
      const t0 = t + c * 0.32;
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1350, t0);
      o.frequency.exponentialRampToValueAtTime(760, t0 + 0.24);
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 2.5;
      o.connect(f).connect(g).connect(this.master);
      this._env(g, t0, 0.02, vol, 0.24);
      o.start(t0);
      o.stop(t0 + 0.3);
    }
  }

  // Pluie : bruit large bande (gouttes) et grondement sourd, selon l'intensité.
  setRain(level = 0) {
    if (!this.ctx) return;
    if (!this.rainNode) {
      if (level < 0.02) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 3200;
      hp.Q.value = 0.4;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      g.gain.value = g2.gain.value = 0;
      src.connect(hp).connect(g).connect(this.master);
      src.connect(lp).connect(g2).connect(this.master);
      src.start();
      this.rainNode = { g, g2 };
    }
    const t = this.ctx.currentTime;
    this.rainNode.g.gain.setTargetAtTime(level * 0.09, t, 1.5);
    this.rainNode.g2.gain.setTargetAtTime(level * 0.05, t, 1.5);
  }

  // Expiration au galop (souffle nasal rythmé).
  breath(intensity = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._burst(t, { freq: 520, q: 1.4, vol: 0.06 * intensity, a: 0.03, d: 0.16, len: 0.3 });
    this._burst(t, { type: 'lowpass', freq: 240, q: 0.7, vol: 0.05 * intensity, a: 0.03, d: 0.14, len: 0.3 });
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
  // Cloche du jury (autorisation de départ, élimination) : bronze, partiels inharmoniques.
  bell(n = 1) {
    if (!this.ctx) return;
    for (let k = 0; k < n; k++) {
      const w = k * 0.55;
      [[880, 0.16], [1210, 0.07], [1780, 0.05], [2340, 0.03]].forEach(([f, v]) => this.tone(f, 1.6, 'sine', v, w));
      this._noiseBurst({ type: 'highpass', freq: 3500, vol: 0.04, attack: 0.002, decay: 0.05, when: w });
    }
  }
  // Applaudissements : nuée de claquements secs, plus ou moins nourris, qui retombent.
  applause(intensity = 1, dur = 3.2) {
    if (!this.ctx) return;
    const n = Math.round(90 * intensity * dur);
    for (let i = 0; i < n; i++) {
      const when = Math.random() * dur * (0.4 + 0.6 * Math.random());
      const fade = 1 - when / dur;
      this._noiseBurst({ type: 'bandpass', freq: 1400 + Math.random() * 1800, q: 1.4, vol: 0.05 * intensity * fade + 0.004, attack: 0.002, decay: 0.03 + Math.random() * 0.03, when });
    }
    this.cheer();
  }
  // « Oh ! » du public sur une barre : murmure grave qui monte puis retombe.
  crowdOoh() {
    if (!this.ctx) return;
    this._noiseBurst({ type: 'bandpass', freq: 380, q: 2.2, vol: 0.12, attack: 0.18, decay: 0.9, sweep: 0.7 });
    this._noiseBurst({ type: 'bandpass', freq: 620, q: 2.5, vol: 0.06, attack: 0.2, decay: 0.8, sweep: 0.75 });
  }
  // Barre effleurée : le bois tinte sur ses taquets ; barre qui tombe : choc mat sur le sable.
  railTouch() {
    this.tone(620, 0.09, 'triangle', 0.07);
    this._noiseBurst({ type: 'bandpass', freq: 2200, q: 3, vol: 0.05, attack: 0.002, decay: 0.05 });
  }
  railFall() {
    this.tone(420, 0.12, 'triangle', 0.08);
    this._noiseBurst({ type: 'lowpass', freq: 900, vol: 0.14, attack: 0.004, decay: 0.22, when: 0.18 });
    this.thud();
  }
  // Réception du saut : antérieurs puis postérieurs dans le sable.
  landing(intensity = 1) {
    if (!this.ctx) return;
    this._noiseBurst({ type: 'lowpass', freq: 520, vol: 0.2 * intensity, attack: 0.003, decay: 0.09 });
    this._noiseBurst({ type: 'lowpass', freq: 460, vol: 0.16 * intensity, attack: 0.003, decay: 0.09, when: 0.11 });
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

  // ---------- Camion ----------
  // Sabot sur le pont (bois/caoutchouc creux, résonance de la caisse) ou sur le plancher du box.
  _hoofTruck(surface, intensity = 1) {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.01;
    const ramp = surface === 'ramp';
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = ramp ? 900 : 420;
    const g = ctx.createGain();
    src.connect(lp).connect(g).connect(this.master);
    this._env(g, t, 0.003, (ramp ? 0.36 : 0.26) * intensity, 0.09);
    src.start(t, Math.random() * 1.5, 0.25);
    // Résonance creuse.
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(ramp ? 150 + Math.random() * 30 : 95, t);
    o.frequency.exponentialRampToValueAtTime(ramp ? 90 : 60, t + 0.18);
    const og = ctx.createGain();
    o.connect(og).connect(this.master);
    this._env(og, t, 0.004, (ramp ? 0.22 : 0.14) * intensity, ramp ? 0.22 : 0.15);
    o.start(t);
    o.stop(t + 0.3);
  }

  _noiseBurst({ type = 'bandpass', freq = 1000, q = 1, vol = 0.1, attack = 0.01, decay = 0.3, when = 0, sweep = 0, dur = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(this.master);
    this._env(g, t, attack, vol, decay);
    src.start(t, Math.random() * 0.8, dur || attack + decay + 0.05);
  }

  // Diesel 4 cylindres : impulsions d'allumage (2 par tour), cliquetis de combustion, turbo.
  _engineNodes() {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 2400;
    bus.connect(muffle).connect(this.master);
    const fire = ctx.createOscillator();
    fire.type = 'sawtooth';
    const fireLp = ctx.createBiquadFilter();
    fireLp.type = 'lowpass';
    fireLp.Q.value = 1.4;
    const fireG = ctx.createGain();
    fireG.gain.value = 0.55;
    fire.connect(fireLp).connect(fireG).connect(bus);
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const subLp = ctx.createBiquadFilter();
    subLp.type = 'lowpass';
    subLp.frequency.value = 110;
    const subG = ctx.createGain();
    subG.gain.value = 0.35;
    sub.connect(subLp).connect(subG).connect(bus);
    // Cliquetis : bruit filtré modulé au rythme des explosions.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.9;
    const clat = ctx.createGain();
    clat.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.05;
    lfo.connect(lfoG).connect(clat.gain);
    noise.connect(bp).connect(clat).connect(bus);
    const turbo = ctx.createOscillator();
    turbo.type = 'sine';
    const turboG = ctx.createGain();
    turboG.gain.value = 0;
    turbo.connect(turboG).connect(bus);
    // Bip de recul.
    const beep = ctx.createOscillator();
    beep.type = 'square';
    beep.frequency.value = 1180;
    const beepLp = ctx.createBiquadFilter();
    beepLp.type = 'lowpass';
    beepLp.frequency.value = 2500;
    const beepG = ctx.createGain();
    beepG.gain.value = 0;
    beep.connect(beepLp).connect(beepG).connect(this.master);
    for (const o of [fire, sub, noise, lfo, turbo, beep]) o.start();
    return { bus, muffle, fire, fireLp, sub, clat, lfo, lfoG, turbo, turboG, beepG, bp };
  }

  // Appelé à chaque image par le camion : { on, rpm, load, speed, dist, inside, reverse, brake }.
  truckEngine(st) {
    st.beep = true;
    this.vehicleEngine('truck', st);
  }

  // Moteur d'un véhicule (un jeu de nœuds par clé : camion, voiture conduite) : impulsions d'allumage selon le nombre
  // de cylindres (moteur 4 temps : cyl / 2 explosions par tour), diesel (claquement, turbo) ou essence (plus aigu).
  // st : { on, rpm, load, speed, dist, inside, reverse, brake, beep?, fuel?, cyl?, tractor? }.
  vehicleEngine(key, st) {
    if (!this.ctx) return;
    const engs = (this._engs ||= {});
    const e = (engs[key] ||= this._engineNodes());
    const t = this.ctx.currentTime;
    const petrol = st.fuel === 'petrol';
    const near = st.inside ? 1 : Math.max(0, 1 - st.dist / 70) ** 1.6;
    const vol = st.on ? (st.tractor ? 0.07 + st.load * 0.08 : petrol ? 0.035 + st.load * 0.06 : 0.04 + st.load * 0.06) * near : 0;
    e.bus.gain.setTargetAtTime(vol, t, st.on ? 0.08 : 0.35);
    if (!st.on && !e.wasOn) {
      e.beepG.gain.setTargetAtTime(0, t, 0.02);
      return;
    }
    e.wasOn = st.on;
    const rpm = Math.max(300, st.rpm);
    const f = (rpm / 60) * ((st.cyl || 4) / 2);
    e.fire.frequency.setTargetAtTime(f, t, 0.05);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.05);
    e.lfo.frequency.setTargetAtTime(f, t, 0.05);
    e.fireLp.frequency.setTargetAtTime(petrol ? 260 + rpm * 0.32 + st.load * 900 : 140 + rpm * 0.18 + st.load * 520, t, 0.08);
    e.lfoG.gain.setTargetAtTime(petrol ? 0.008 : 0.025 + st.load * 0.05, t, 0.08);
    e.bp.frequency.setTargetAtTime(1400 + rpm * 0.35, t, 0.1);
    e.turbo.frequency.setTargetAtTime(1800 + rpm * 1.1, t, 0.15);
    e.turboG.gain.setTargetAtTime(st.on && !petrol ? Math.max(0, rpm - 1100) / 1500 * (0.15 + st.load * 0.5) * (st.beep ? 0.06 : 0.03) : 0, t, 0.25);
    e.muffle.frequency.setTargetAtTime(st.inside ? 1500 + st.load * 1200 : 900 + near * 2200, t, 0.2);
    // Bip de recul des poids lourds (0,4 s / 0,4 s).
    const on = st.beep && st.reverse && near > 0.05 && (t % 0.8) < 0.4;
    e.beepG.gain.setTargetAtTime(on ? 0.05 * Math.max(near, 0.4) : 0, t, 0.006);
  }

  // Démarreur puis mise en route (diesel par défaut ; essence : démarreur plus aigu, moteur qui prend plus vite).
  engineStart(fuel = 'diesel') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const petrol = fuel === 'petrol';
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(petrol ? 150 : 95, t);
    o.frequency.linearRampToValueAtTime(petrol ? 230 : 140, t + 0.7);
    const am = ctx.createOscillator();
    am.frequency.value = 11;
    const amG = ctx.createGain();
    amG.gain.value = 0.04;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    am.connect(amG).connect(g.gain);
    o.connect(lp).connect(g).connect(this.master);
    g.gain.setValueAtTime(0.05, t);
    g.gain.setTargetAtTime(0, t + 0.75, 0.05);
    o.start(t);
    am.start(t);
    o.stop(t + 1.0);
    am.stop(t + 1.0);
    this._noiseBurst({ type: 'lowpass', freq: 220, vol: 0.12, attack: 0.02, decay: 0.5, when: 0.72 });
  }

  // « Pschitt » des freins à air (arrêt, frein de parc).
  airBrake(k = 0.6) {
    this._noiseBurst({ type: 'highpass', freq: 2600, q: 0.5, vol: 0.06 * k, attack: 0.015, decay: 0.55 + k * 0.4 });
    this._noiseBurst({ type: 'bandpass', freq: 5200, q: 0.8, vol: 0.035 * k, attack: 0.01, decay: 0.35 });
  }

  gearShift(dir) {
    if (dir === 2) {
      this._noiseBurst({ type: 'bandpass', freq: 900, q: 2, vol: 0.05, attack: 0.005, decay: 0.08 });
      return;
    }
    this._noiseBurst({ type: 'bandpass', freq: 3400, q: 1.5, vol: 0.025, attack: 0.004, decay: 0.07 });
    this._noiseBurst({ type: 'lowpass', freq: 260, vol: 0.05, attack: 0.005, decay: 0.12, when: 0.05 });
  }

  // Pont : grincement des vérins à ressort, puis choc au sol / fermeture.
  rampStart() {
    this._noiseBurst({ type: 'bandpass', freq: 520, q: 6, vol: 0.035, attack: 0.3, decay: 2.2, sweep: 0.7, dur: 2.7 });
    this._noiseBurst({ type: 'bandpass', freq: 3100, q: 3, vol: 0.03, attack: 0.005, decay: 0.05 });
  }
  rampDown() {
    this.thud();
    this._noiseBurst({ type: 'bandpass', freq: 950, q: 4, vol: 0.12, attack: 0.004, decay: 0.45 });
    this._noiseBurst({ type: 'bandpass', freq: 2400, q: 6, vol: 0.06, attack: 0.004, decay: 0.6 });
  }
  rampShut() {
    this.thud();
    this._noiseBurst({ type: 'bandpass', freq: 700, q: 3, vol: 0.1, attack: 0.004, decay: 0.3 });
    this.latch(0.12);
  }
  latch(when = 0) {
    this._noiseBurst({ type: 'bandpass', freq: 3200, q: 4, vol: 0.09, attack: 0.002, decay: 0.035, when });
    this._noiseBurst({ type: 'bandpass', freq: 2600, q: 4, vol: 0.07, attack: 0.002, decay: 0.04, when: when + 0.09 });
  }
  truckDoor(open) {
    if (open) {
      this.latch();
      this._noiseBurst({ type: 'bandpass', freq: 640, q: 8, vol: 0.025, attack: 0.1, decay: 0.4, sweep: 1.3, when: 0.08 });
    } else {
      this._noiseBurst({ type: 'lowpass', freq: 300, vol: 0.14, attack: 0.004, decay: 0.18 });
      this.latch(0.02);
    }
  }
  tick() {
    this._noiseBurst({ type: 'bandpass', freq: 1700, q: 3, vol: 0.02, attack: 0.002, decay: 0.03 });
  }

  horn() {
    this.tone(330, 0.35, 'square', 0.06);
    this.tone(415, 0.35, 'square', 0.05);
  }
}
