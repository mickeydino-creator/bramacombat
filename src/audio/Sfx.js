/*
 * Placeholder sounds synthesized with WebAudio (no asset files, nothing to license).
 * Each sound is one small method; to use real samples later, replace a method body
 * with playback of an audio file. Small random pitch variation keeps repeats from sounding robotic.
 * Browsers only allow audio after a key press or click, so sound starts after the first input.
 */
const vary = (amount = 0.08) => 1 + (Math.random() * 2 - 1) * amount;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.8; // master volume
    const unlock = () => {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  tone({ freq = 200, endFreq = freq, time = 0.1, type = 'square', volume = 0.15, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + time);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + time);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + time);
  }

  noise(time = 0.1, volume = 0.2, filterFreq = 1500, { delay = 0, type = 'lowpass', sweepTo = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * time);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + time);
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  // ---- attacks (on attack start) ----
  /** Plays the whoosh for an attack/action name: punch | kick | strong | special. */
  attack(name) {
    if (name === 'punch') this.punch();
    else if (name === 'kick') this.kick();
    else if (name === 'strong') this.strong();
    else if (name === 'special') this.special();
    else this.swing();
  }
  swing() { this.noise(0.08, 0.08, 2500); }
  punch() { this.noise(0.07, 0.12, 3000 * vary(), { type: 'bandpass', sweepTo: 1200 }); }
  kick() { this.noise(0.12, 0.15, 1800 * vary(), { type: 'bandpass', sweepTo: 700 }); }
  strong() {
    this.noise(0.22, 0.2, 900 * vary(), { type: 'bandpass', sweepTo: 3000 });
    this.tone({ freq: 110, endFreq: 70, time: 0.2, type: 'sawtooth', volume: 0.05 });
  }
  special() {
    this.tone({ freq: 220 * vary(), endFreq: 880, time: 0.3, type: 'sawtooth', volume: 0.09 });
    this.tone({ freq: 330 * vary(), endFreq: 1320, time: 0.3, type: 'square', volume: 0.04, delay: 0.03 });
    this.noise(0.3, 0.12, 600, { type: 'bandpass', sweepTo: 4000 });
  }

  // ---- impacts ----
  hit(strength = 1) {
    this.noise(0.1 + 0.05 * strength, 0.35, (1400 + 400 * strength) * vary());
    this.tone({ freq: 200 * vary(), endFreq: 70, time: 0.1, type: 'sine', volume: 0.3 });
  }
  heavyHit() {
    this.noise(0.3, 0.5, 700 * vary());
    this.tone({ freq: 120 * vary(), endFreq: 35, time: 0.35, type: 'sine', volume: 0.5 });
    this.tone({ freq: 80, endFreq: 40, time: 0.25, type: 'square', volume: 0.08 });
  }
  block() {
    this.noise(0.08, 0.2, 3500);
    this.tone({ freq: 900 * vary(0.04), endFreq: 600, time: 0.06, type: 'square', volume: 0.06 });
  }
  /** Player took damage: short low "grunt". */
  damage() {
    this.tone({ freq: 160 * vary(), endFreq: 90, time: 0.16, type: 'sawtooth', volume: 0.07, delay: 0.02 });
  }

  // ---- movement ----
  jump() { this.tone({ freq: 300 * vary(), endFreq: 500, time: 0.08, type: 'triangle', volume: 0.05 }); }
  land() { this.noise(0.06, 0.12, 400 * vary()); }

  // ---- round ----
  ko() { this.tone({ freq: 220, endFreq: 40, time: 0.9, type: 'sawtooth', volume: 0.15 }); }
  announce() { this.tone({ freq: 440, endFreq: 880, time: 0.25, type: 'square', volume: 0.08 }); }
  victory() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, time: i === 3 ? 0.5 : 0.14, type: 'square', volume: 0.07, delay: i * 0.13 }));
  }
  defeat() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, endFreq: f * 0.97, time: i === 3 ? 0.7 : 0.22, type: 'triangle', volume: 0.12, delay: i * 0.22 }));
  }
}
