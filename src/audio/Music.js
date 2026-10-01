/*
 * Small procedural background loop (bass + drums), scheduled ahead on the AudioContext clock.
 * 'menu' mode is muffled and drum-less, 'fight' mode is full. Volume = Settings "music".
 */
const BPM = 122;
const STEP = 60 / BPM / 4; // 16th notes
// A minor riff (Hz), 0 = rest
const BASS = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 61.7, 0];
const KICK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const HAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1];

export class Music {
  constructor(ctx, dest, noiseBuf) {
    this.ctx = ctx;
    this.noiseBuf = noiseBuf;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.drums = ctx.createGain();
    this.drums.gain.value = 0;
    this.filter.connect(dest);
    this.drums.connect(this.filter);
    this.step = 0;
    this.mode = 'menu';
  }

  start() {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    this.setMode(this.mode);
  }

  setMode(mode) {
    this.mode = mode;
    if (!this.timer) return;
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(mode === 'fight' ? 6000 : 700, t, 0.3);
    this.drums.gain.setTargetAtTime(mode === 'fight' ? 1 : 0, t, 0.3);
  }

  schedule() {
    if (this.ctx.state !== 'running') { this.next = this.ctx.currentTime + 0.1; return; }
    while (this.next < this.ctx.currentTime + 0.15) {
      const i = this.step % 16, t = this.next;
      if (BASS[i]) this.bass(BASS[i], t);
      if (KICK[i]) this.kick(t);
      if (SNARE[i]) this.snare(t);
      if (HAT[i]) this.hat(t);
      this.next += STEP;
      this.step++;
    }
  }

  bass(f, t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(200, t + STEP * 1.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.9);
    o.connect(lp).connect(g).connect(this.filter);
    o.start(t); o.stop(t + STEP * 2);
  }

  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.drums); o.start(t); o.stop(t + 0.2);
  }

  noiseHit(t, freq, type, vol, len) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(this.drums); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.01);
  }
  snare(t) { this.noiseHit(t, 1800, 'bandpass', 0.35, 0.14); }
  hat(t) { this.noiseHit(t, 7000, 'highpass', 0.12, 0.04); }
}
