/** Placeholder sounds synthesized with WebAudio (no asset files). Replace with real samples later. */
export class Sfx {
  constructor() {
    this.ctx = null;
    const unlock = () => {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  tone({ freq = 200, endFreq = freq, time = 0.1, type = 'square', volume = 0.15 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + time);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + time);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + time);
  }

  noise(time = 0.1, volume = 0.2, filterFreq = 1500) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * time);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(t);
  }

  swing() { this.noise(0.08, 0.08, 2500); }
  hit(strength = 1) {
    this.noise(0.12 + 0.1 * strength, 0.35, 900 + 600 * strength);
    this.tone({ freq: 180 / strength, endFreq: 50, time: 0.15, type: 'sine', volume: 0.3 });
  }
  block() {
    this.noise(0.08, 0.2, 3500);
    this.tone({ freq: 900, endFreq: 600, time: 0.06, type: 'square', volume: 0.06 });
  }
  jump() { this.tone({ freq: 300, endFreq: 500, time: 0.08, type: 'triangle', volume: 0.05 }); }
  ko() { this.tone({ freq: 220, endFreq: 40, time: 0.9, type: 'sawtooth', volume: 0.15 }); }
  announce() { this.tone({ freq: 440, endFreq: 880, time: 0.25, type: 'square', volume: 0.08 }); }
}
