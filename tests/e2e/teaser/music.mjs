// Musique du teaser, synthétisée ici (libre de droits) et calée sur le montage : nappes et arpèges (ré mineur → fa
// majeur, 96 pulsations/min), rythme de galop (toms, basse, shaker) pendant les plans d'action, montée et impact au
// saut, accalmie de nuit, accord final sur le carton titre. WAV 48 kHz stéréo 16 bits.
// Usage : node tests/e2e/teaser/music.mjs <sortie.wav> '<repères JSON>'
//   repères (secondes) : { dur, calm, gallop, drive, rise, jump, paris, phone, night, end }
import { writeFileSync } from 'node:fs';

const [out = 'tests/e2e/out/teaser/music.wav', cuesArg = '{}'] = process.argv.slice(2);
const Q = { dur: 50, calm: 3, gallop: 12, drive: 17, rise: 25, jump: 27, paris: 30, phone: 34, night: 37.5, end: 41.5, ...JSON.parse(cuesArg) };
const SR = 48000, N = Math.ceil(Q.dur * SR);
const L = new Float32Array(N), R = new Float32Array(N), SL = new Float32Array(N), SR_ = new Float32Array(N); // direct + envoi réverbération
const BPM = 96, BEAT = 60 / BPM;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const hz = (n) => 440 * 2 ** ((n - 69) / 12); // numéro MIDI → fréquence

// Ajoute un échantillon (gain, panoramique -1..1, envoi réverbération 0..1).
function put(i, v, pan = 0, send = 0.3) {
  if (i < 0 || i >= N) return;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
  L[i] += v * gl; R[i] += v * gr;
  SL[i] += v * gl * send; SR_[i] += v * gr * send;
}
// Enveloppe ADSR simple.
const env = (t, a, d, s, len, r) => (t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : t < len ? s : Math.max(0, s * (1 - (t - len) / r)));

// Nappe : 6 harmoniques par voix (1/n), trois voix légèrement désaccordées, attaque lente.
function pad(t0, len, notes, gain = 0.05, pan = 0) {
  for (const n of notes) {
    const f = hz(n);
    for (const det of [-0.12, 0, 0.12]) {
      const ff = f * 2 ** (det / 12), ph = Math.random() * 6.28;
      const i0 = Math.floor(t0 * SR), i1 = Math.floor((t0 + len + 1.5) * SR);
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SR, e = env(t, 1.4, 0.8, 0.8, len, 1.5);
        if (e <= 0) continue;
        let v = 0;
        for (let h = 1; h <= 6; h++) v += Math.sin(6.2832 * ff * h * t + ph * h) / (h * h * 0.6 + 0.4);
        put(i, v * e * gain / 3, pan + det * 2, 0.55);
      }
    }
  }
}
// Note de piano / pincée : fondamentale + harmoniques, décroissance exponentielle.
function pluck(t0, n, gain = 0.09, pan = 0, decay = 1.3) {
  const f = hz(n), i0 = Math.floor(t0 * SR), len = Math.floor((decay * 3) * SR);
  for (let k = 0; k < len; k++) {
    const t = k / SR, e = Math.exp(-t / decay) * Math.min(1, t / 0.004);
    const v = Math.sin(6.2832 * f * t) + 0.45 * Math.sin(6.2832 * f * 2.001 * t) * Math.exp(-t / (decay * 0.5)) + 0.2 * Math.sin(6.2832 * f * 3.003 * t) * Math.exp(-t / (decay * 0.3));
    put(i0 + k, v * e * gain, pan, 0.45);
  }
}
// Basse : sinus + octave, courte.
function bass(t0, n, gain = 0.16, len = 0.45) {
  const f = hz(n), i0 = Math.floor(t0 * SR);
  for (let k = 0; k < (len + 0.2) * SR; k++) {
    const t = k / SR, e = env(t, 0.008, 0.1, 0.7, len, 0.15);
    put(i0 + k, (Math.sin(6.2832 * f * t) + 0.3 * Math.sin(6.2832 * f * 2 * t)) * e * gain, 0, 0.08);
  }
}
// Tom / grosse caisse : sinus glissant (f0 → f1), clic.
function tom(t0, gain = 0.35, f0 = 120, f1 = 48, decay = 0.32, pan = 0) {
  const i0 = Math.floor(t0 * SR);
  let ph = 0;
  for (let k = 0; k < decay * 5 * SR; k++) {
    const t = k / SR, f = f1 + (f0 - f1) * Math.exp(-t / 0.05);
    ph += (6.2832 * f) / SR;
    const v = Math.sin(ph) * Math.exp(-t / decay) + (t < 0.004 ? rnd() * 0.5 : 0);
    put(i0 + k, v * gain, pan, 0.2);
  }
}
// Shaker / cymbale charleston : bruit filtré passe-haut, très court.
function shaker(t0, gain = 0.05, decay = 0.05, pan = 0.3) {
  const i0 = Math.floor(t0 * SR);
  let prev = 0;
  for (let k = 0; k < decay * 6 * SR; k++) {
    const t = k / SR, x = rnd(), hp = x - prev;
    prev = x;
    put(i0 + k, hp * Math.exp(-t / decay) * gain, pan, 0.15);
  }
}
// Montée : bruit à filtre résonant qui s'ouvre + sinus qui monte, jusqu'à t1.
function riser(t0, t1, gain = 0.12) {
  const i0 = Math.floor(t0 * SR), i1 = Math.floor(t1 * SR);
  let lp = 0, bp = 0, ph = 0;
  for (let i = i0; i < i1; i++) {
    const u = (i - i0) / (i1 - i0), fc = 300 + 5200 * u * u, q = 0.25;
    const f = (2 * Math.sin((Math.PI * fc) / SR));
    const x = rnd();
    lp += f * bp; const hp = x - lp - q * bp; bp += f * hp;
    ph += (6.2832 * (110 + 330 * u * u)) / SR;
    put(i, (bp * 0.6 + Math.sin(ph) * 0.25) * u * u * gain, Math.sin(u * 6) * 0.3, 0.6);
  }
}
// Impact : grosse caisse grave, souffle, sous-grave long.
function impact(t0, gain = 0.6) {
  tom(t0, gain, 90, 34, 0.9);
  const i0 = Math.floor(t0 * SR);
  for (let k = 0; k < 2.5 * SR; k++) {
    const t = k / SR;
    put(i0 + k, (rnd() * 0.25 * Math.exp(-t / 0.25) + Math.sin(6.2832 * 38 * t) * 0.5 * Math.exp(-t / 1.4)) * gain, 0, 0.7);
  }
}
// Cloche douce (nuit) : sinus inharmoniques.
function bell(t0, n, gain = 0.05, pan = 0) {
  const f = hz(n), i0 = Math.floor(t0 * SR);
  for (let k = 0; k < 4 * SR; k++) {
    const t = k / SR, e = Math.exp(-t / 1.4) * Math.min(1, t / 0.003);
    put(i0 + k, (Math.sin(6.2832 * f * t) + 0.5 * Math.sin(6.2832 * f * 2.76 * t) + 0.25 * Math.sin(6.2832 * f * 5.4 * t)) * e * gain, pan, 0.7);
  }
}

// Harmonie : Rém(add9) – Si♭maj7 – Fa – Do, puis Rém – Si♭ – Fa – Do (une mesure de 4 temps par accord).
const CH = [[50, 57, 62, 64, 65], [46, 53, 57, 62, 65], [41, 48, 57, 60, 65], [48, 55, 60, 64, 67]];
const ROOT = [38, 34, 41, 36];
const BAR = BEAT * 4;
const chordAt = (t) => Math.floor(t / BAR) % 4;

// Introduction : bourdon et scintillement.
pad(0, Q.calm + 1.5, [38, 45], 0.05, 0);
for (let t = 0.6; t < Q.calm; t += 0.75) pluck(t, 86 + (Math.round(t * 4) % 3) * 2, 0.012, 0.5, 2.2);
// Nappes : toute la durée jusqu'au carton final (plus denses pendant l'action).
for (let t = Q.calm - 0.6; t < Q.end; t += BAR) {
  const c = chordAt(t), dense = t >= Q.gallop && t < Q.phone && !(t >= Q.night);
  pad(t, BAR, CH[c].slice(0, dense ? 5 : 3), dense ? 0.03 : 0.035, -0.2);
}
// Arpèges de piano (calme : ouverture, écurie, téléphone, nuit).
for (let t = Q.calm + 0.8; t < Q.end - 0.2; t += BEAT / 2) {
  const inAction = t >= Q.gallop && t < Q.phone;
  if (inAction && Math.round(t / (BEAT / 2)) % 2) continue;
  const c = chordAt(t), notes = CH[c], k = Math.round(t / (BEAT / 2)) % 5;
  pluck(t, notes[k] + 12, t >= Q.night ? 0.05 : 0.07, k % 2 ? 0.35 : -0.35, t >= Q.night ? 1.8 : 1.1);
}
// Galop : motif ternaire « ta-ta-TAM » (toms), basse sur les temps, shaker en croches.
for (let t = Q.gallop; t < Q.phone - 0.1; t += BEAT) {
  if (t >= Q.rise && t < Q.jump + 0.4) continue; // suspension pendant la montée et le saut
  const c = chordAt(t), boost = t >= Q.paris ? 1.2 : t >= Q.drive ? 1.1 : 1;
  tom(t, 0.22 * boost, 140, 70, 0.18, -0.25);
  tom(t + BEAT / 3, 0.18 * boost, 150, 75, 0.16, 0.25);
  tom(t + (2 * BEAT) / 3, 0.34 * boost, 110, 46, 0.3, 0);
  bass(t, ROOT[c], 0.14 * boost, BEAT * 0.45);
  if (t >= Q.drive) bass(t + BEAT / 2, ROOT[c] + 12, 0.08 * boost, BEAT * 0.3);
  shaker(t + BEAT / 2, 0.04 * boost);
  shaker(t, 0.025 * boost, 0.04, -0.3);
}
// Saut : montée puis impact, accord ouvert tenu pendant le ralenti.
riser(Q.rise, Q.jump, 0.16);
impact(Q.jump, 0.55);
pad(Q.jump, 3, [41, 48, 57, 60, 65, 69], 0.03, 0.1);
// Paris : impact d'entrée.
impact(Q.paris, 0.35);
// Nuit : cloches.
for (let t = Q.night + 0.3, k = 0; t < Q.end - 0.5; t += BEAT * 2, k++) bell(t, [74, 77, 81, 79][k % 4], 0.04, k % 2 ? 0.4 : -0.4);
// Carton final : impact, accord de fa majeur (add9) long, arpège descendant.
impact(Q.end, 0.6);
pad(Q.end, Q.dur - Q.end - 1.6, [41, 48, 53, 57, 60, 67], 0.045, 0);
[89, 84, 81, 77, 72, 69].forEach((n, k) => pluck(Q.end + 0.4 + k * 0.32, n, 0.06, k % 2 ? 0.3 : -0.3, 2.4));

// Réverbération (Schroeder : 4 peignes + 2 passe-tout par canal), mélange, saturation douce, normalisation, fondus.
function reverb(x, d0) {
  const y = new Float32Array(N);
  for (const [d, g] of [[1557, 0.82], [1617, 0.81], [1491, 0.83], [1422, 0.84]].map(([d, g]) => [d + d0, g])) {
    const buf = new Float32Array(d);
    let p = 0, lp = 0;
    for (let i = 0; i < N; i++) {
      const o = buf[p];
      lp = o * 0.6 + lp * 0.4;
      buf[p] = x[i] + lp * g;
      y[i] += o * 0.25;
      p = (p + 1) % d;
    }
  }
  for (const d of [225 + d0, 556 + d0]) {
    const buf = new Float32Array(d);
    let p = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[p], v = -y[i] * 0.5 + b;
      buf[p] = y[i] + b * 0.5;
      y[i] = v;
      p = (p + 1) % d;
    }
  }
  return y;
}
const RL = reverb(SL, 0), RR = reverb(SR_, 23);
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh((L[i] + RL[i] * 0.9) * 1.2);
  R[i] = Math.tanh((R[i] + RR[i] * 0.9) * 1.2);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / (peak || 1), fadeIn = 0.4 * SR, fadeOut = 2.2 * SR;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const g = norm * Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
}
writeFileSync(out, pcm);
console.log(`musique ${Q.dur} s → ${out}`);
