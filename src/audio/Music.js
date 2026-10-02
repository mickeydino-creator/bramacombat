/*
 * Background music: a relaxed, bouncy "notebook doodle" groove - warm electric-piano chords, a round
 * bass, soft brushed drums and a small plucked melody that changes from phrase to phrase, so the loop
 * doesn't sound like the same 2 bars over and over. Scheduled ahead on the AudioContext clock.
 *
 *   'menu'  mode: just keys + bass, muffled and quiet
 *   'fight' mode: full groove (still mixed low so hits and calls stay clear)
 *
 * Volume = Settings "music". To use a recorded track instead, add  "music": "my-track.mp3"  to
 * public/sounds/sounds.json - it then loops in place of the generated music (same volume/modes).
 */
const BPM = 98;
const STEP = 60 / BPM / 4; // 16th notes
const SWING = 0.12; // late off-beat 16ths, laid-back feel

const n = (semi) => 440 * 2 ** ((semi - 9) / 12); // semitones from middle C (C4 = 0)
// Chords as semitones (C4 = 0). Each is one bar.
const CHORDS = {
  Fmaj7: { root: -7, notes: [-7, -3, 0, 4] }, // F A C E
  Em7: { root: -8, notes: [-8, -5, -1, 2] }, // E G B D
  Dm7: { root: -10, notes: [-10, -7, -3, 0] }, // D F A C
  Cmaj7: { root: -12, notes: [-12, -8, -5, -1] }, // C E G B
  Bbmaj7: { root: -14, notes: [-14, -10, -7, -3] }, // Bb D F A
  Am7: { root: -15, notes: [-15, -12, -8, -5] }, // A C E G
  Gm7: { root: -17, notes: [-17, -14, -10, -7] }, // G Bb D F
  C7: { root: -12, notes: [-12, -8, -5, -2] }, // C E G Bb
};
// 4-bar phrases; the song walks through them so it takes 32 bars (~78s) before anything repeats exactly.
const PHRASES = [
  ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
  ['Fmaj7', 'Em7', 'Dm7', 'C7'],
  ['Bbmaj7', 'Am7', 'Gm7', 'C7'],
  ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
];

// Rhythm patterns (16 steps). Several per instrument; one is picked per bar.
const KEYS_STABS = [
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
];
const BASS_LINES = [ // [step, interval from root (semitones), length in steps]; only root / 5th / octave so it fits every chord
  [[0, 0, 3], [6, 0, 2], [8, 7, 2], [10, 0, 2], [14, 12, 2]],
  [[0, 0, 4], [6, 7, 2], [8, 0, 3], [12, 12, 2], [14, 7, 2]],
  [[0, 0, 3], [3, 0, 1], [6, 12, 2], [8, 7, 3], [11, 7, 1], [14, 12, 2]],
];
const KICK = [[1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0]];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const FILL = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1];

// Small seeded random so a given bar always sounds the same (musical), but bars differ.
function rand(seed) {
  let x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class Music {
  constructor(ctx, dest, noiseBuf) {
    this.ctx = ctx;
    this.noiseBuf = noiseBuf;
    this.out = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1400;
    this.filter.Q.value = 0.5;
    this.drums = ctx.createGain();
    this.drums.gain.value = 0;
    this.lead = ctx.createGain();
    this.lead.gain.value = 0;
    this.drums.connect(this.filter);
    this.lead.connect(this.filter);
    this.filter.connect(this.out);
    this.out.connect(dest);
    // soft room echo for keys/lead
    this.echo = ctx.createDelay(1); this.echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.25;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800;
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0.18;
    this.echoSend.connect(this.echo); this.echo.connect(tone); tone.connect(fb); fb.connect(this.echo); tone.connect(this.filter);
    this.step = 0;
    this.mode = 'menu';
    this.track = null; // AudioBuffer of a recorded track (sounds.json "music")
  }

  start() {
    if (this.timer || this.trackSrc) return;
    if (this.track) { this.startTrack(); return; }
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    this.setMode(this.mode);
  }

  /** Use a recorded track (looped) instead of the generated music. */
  useTrack(buffer) {
    this.track = buffer;
    if (this.timer) { clearInterval(this.timer); this.timer = null; this.startTrack(); }
  }

  startTrack() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.track; src.loop = true;
    src.connect(this.filter);
    src.start(this.ctx.currentTime + 0.05);
    this.trackSrc = src;
    this.setMode(this.mode);
  }

  get playing() { return !!(this.timer || this.trackSrc); }

  setMode(mode) {
    this.mode = mode;
    if (!this.playing) return;
    const t = this.ctx.currentTime, fight = mode === 'fight';
    this.filter.frequency.setTargetAtTime(fight ? (this.track ? 18000 : 5200) : 1100, t, 0.4);
    this.drums.gain.setTargetAtTime(fight ? 1 : 0, t, 0.4);
    this.lead.gain.setTargetAtTime(fight ? 1 : 0.4, t, 0.4);
    this.out.gain.setTargetAtTime(fight ? 1 : 0.75, t, 0.4);
  }

  schedule() {
    if (this.ctx.state !== 'running') { this.next = this.ctx.currentTime + 0.1; return; }
    while (this.next < this.ctx.currentTime + 0.2) {
      const s = this.step % 16;
      const t = this.next + (s % 2 ? STEP * SWING : 0);
      this.playStep(Math.floor(this.step / 16), s, t);
      this.next += STEP;
      this.step++;
    }
  }

  playStep(bar, s, t) {
    const phraseIdx = Math.floor(bar / 4) % PHRASES.length;
    const chord = CHORDS[PHRASES[phraseIdx][bar % 4]];
    const lastBarOfPhrase = bar % 4 === 3;
    const r = (k) => rand(bar * 97 + s * 13 + k);

    // keys: sustained chord on beat 1 (menu) or light stabs (fight)
    if (this.mode === 'fight') {
      const pat = KEYS_STABS[Math.floor(rand(bar) * KEYS_STABS.length)];
      if (pat[s]) this.keys(chord.notes, t, s === 0 ? 0.6 : 0.3, s === 0 ? 0.075 : 0.05);
    } else if (s === 0) this.keys(chord.notes, t, STEP * 15, 0.07);

    // bass
    for (const [st, iv, len] of BASS_LINES[Math.floor(rand(bar + 0.5) * BASS_LINES.length)]) {
      if (st === s) this.bass(n(chord.root - 12 + iv), t, STEP * len);
    }

    // drums (only heard in fight mode)
    if (this.drumsOn()) {
      if (KICK[bar % 2][s]) this.kick(t);
      if ((lastBarOfPhrase && s >= 8 ? FILL : SNARE)[s]) this.snare(t, lastBarOfPhrase && s >= 10 ? 0.11 : 0.16);
      if (s % 2 === 0) this.shaker(t, s % 4 === 2 ? 0.05 : 0.03);
      else if (r(1) > 0.6) this.shaker(t, 0.018);
    }

    // melody: short phrases on some bars, built from chord tones + scale steps, different every phrase
    const melodyBar = (bar % 8) >= 4 || phraseIdx === 2;
    if (melodyBar && s % 2 === 0 && r(2) > 0.55) {
      const tone = chord.notes[Math.floor(r(3) * 4)] + (r(4) > 0.5 ? 12 : 24); // chord tones only: always consonant
      this.pluck(n(tone), t, r(6) > 0.7 ? 0.05 : 0.035);
    }
  }

  drumsOn() { return this.mode === 'fight'; }

  // ---------- instruments ----------
  /** Electric-piano-ish chord: sine + soft bell partial per note, gentle decay. */
  keys(notes, t, len, vol) {
    const c = this.ctx;
    for (const semi of notes) {
      const f = n(semi);
      for (const [mult, v, type] of [[1, vol, 'sine'], [2, vol * 0.18, 'triangle']]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = f * mult; o.detune.value = (Math.random() - 0.5) * 8;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.012);
        g.gain.exponentialRampToValueAtTime(v * 0.4, t + Math.min(0.3, len * 0.5));
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
        o.connect(g); g.connect(this.filter); g.connect(this.echoSend);
        o.start(t); o.stop(t + len + 0.3);
      }
    }
  }

  /** Round, warm bass: triangle through a lowpass. */
  bass(f, t, len) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = 520;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.14, t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.06);
    o.connect(lp).connect(g).connect(this.filter);
    o.start(t); o.stop(t + len + 0.1);
  }

  /** Little plucked note (marimba-like). */
  pluck(f, t, vol) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 4;
    const g2 = c.createGain(); g2.gain.value = 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.lead); g.connect(this.echoSend);
    o.start(t); o2.start(t); o.stop(t + 0.4); o2.stop(t + 0.4);
  }

  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    g.gain.setValueAtTime(0.42, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.drums); o.start(t); o.stop(t + 0.25);
  }

  noiseHit(t, freq, type, vol, len, q = 0.7) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(this.drums); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.01);
  }
  /** Brushed snare: soft, wide noise instead of a sharp crack. */
  snare(t, vol) { this.noiseHit(t, 2200, 'bandpass', vol, 0.16, 0.5); this.noiseHit(t, 600, 'lowpass', vol * 0.5, 0.08); }
  shaker(t, vol) { this.noiseHit(t, 6500, 'highpass', vol, 0.045); }
}
