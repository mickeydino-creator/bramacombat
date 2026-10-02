/*
 * Game audio: all sounds are synthesized with WebAudio (no files to load, nothing that can 404).
 *
 * Routing:  each sound -> sfxBus ─┐
 *           music      -> musicBus ┴-> master -> compressor -> speakers   (+ analyser, for tests)
 * Volumes come from Settings (master / sfx / music).
 *
 * Browsers start audio "suspended" until a user gesture. unlock() is attached to every kind of
 * gesture (click, touchend, pointerup, keydown...) and keeps retrying until the context is running.
 * Gamepad presses don't count as gestures in browsers, so pad-only players get sound after the
 * first click/tap/key (e.g. the START button).
 *
 * Each named sound is rate-limited (DEDUPE_SECONDS) so one action can't play it twice.
 *
 * YOUR OWN SOUND FILES: list them in public/sounds/sounds.json, e.g. { "ko": "ko.mp3", "victory": "win.ogg" }
 * (files in public/sounds/). A listed sound replaces the synthesized one with the same name.
 * Names: punch kick strong hit heavyHit block guardBreak damage jump land ko crowd bell announce victory
 * defeat airhorn boom scratch finishHim ui. Only use files you have the rights to.
 */
import { Music } from './Music.js';

const vary = (amount = 0.08) => 1 + (Math.random() * 2 - 1) * amount;
const DEDUPE_SECONDS = 0.04;
// Normal-hit variations (Hz): low thump start, body filter, faint slap
const HIT_VARIANTS = [
  { thump: 140, body: 900, snap: 1100 },
  { thump: 125, body: 780, snap: 950 },
  { thump: 155, body: 1000, snap: 1250 },
];
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown'];

export class Sfx {
  constructor(settings) {
    this.ctx = null;
    this.last = {};
    this.played = {}; // name -> count (debugging / tests)
    this.volumes = { master: 0.8, sfx: 0.9, music: 0.5 };
    this.unlock = this.unlock.bind(this);
    // Listeners stay attached for the whole session: browsers (especially iOS) can suspend/interrupt
    // audio later (app switch, lock screen, call, background tab) and it can only resume in a gesture.
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, this.unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.ctx && !this.running) this.ctx.resume().catch(() => {}); });
    // Download sound files right away (decoding needs the AudioContext, which needs a gesture).
    this.sampleFiles = this.fetchSamples();
    settings?.onChange((v) => { this.setVolumes(v); this.voiceOn = v.voice !== false; });
    this.voiceOn = true;
  }

  get running() { return this.ctx?.state === 'running'; }

  /** Create / resume the AudioContext. Safe to call any time; only works inside a user gesture. */
  unlock() {
    try {
      if (!this.ctx) this.create();
      if (this.ctx.state !== 'running') {
        this.ctx.resume().then(() => this.onRunning()).catch(() => {}); // retried on the next gesture
        // iOS only unlocks when a sound actually starts inside the gesture: play one silent sample.
        const src = this.ctx.createBufferSource();
        src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        src.connect(this.ctx.destination);
        src.start(0);
      }
      if (this.running) this.onRunning();
    } catch (e) {
      console.warn('Audio unavailable:', e);
    }
  }

  onRunning() {
    if (!this.running) return;
    this.music?.start();
    if (!this.samplesDecoded) { this.samplesDecoded = true; this.decodeSamples(); }
  }

  create() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('WebAudio not supported');
    // iOS: play through the silent switch like a game would.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.002; this.comp.release.value = 0.15;
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.sfxBus.connect(this.master);
    // Echo send (big moments: K.O., bell, fanfare)
    this.echoIn = ctx.createGain();
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.19;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400;
    this.echoIn.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(this.sfxBus);
    this.musicBus.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.comp.connect(this.analyser);
    // One shared noise buffer (1s) instead of generating noise for every sound.
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.music = new Music(ctx, this.musicBus, this.noiseBuf);
    this.applyVolumes();
    ctx.addEventListener?.('statechange', () => this.onRunning());
  }

  setVolumes(v) {
    this.volumes = { master: v.master, sfx: v.sfx, music: v.music };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.6, t, 0.02);
  }

  /** Music mood: 'menu' (soft, filtered) or 'fight'. */
  setMusicMode(mode) { this.music?.setMode(mode); }

  /** Current output level (0..1), used by the audio test. */
  level() {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const s of buf) peak = Math.max(peak, Math.abs(s));
    return peak;
  }

  // ---------- building blocks ----------

  /** Download the sound files listed in public/sounds/sounds.json (at page load). name -> ArrayBuffer */
  async fetchSamples() {
    const out = {};
    try {
      const base = import.meta.env?.BASE_URL ?? '/';
      const res = await fetch(`${base}sounds/sounds.json`, { cache: 'no-cache' });
      if (!res.ok) return out;
      const list = await res.json();
      await Promise.all(Object.entries(list).map(async ([name, file]) => {
        try {
          const r = await fetch(`${base}sounds/${file}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          out[name] = await r.arrayBuffer();
        } catch (e) { console.warn(`Sound "${name}" (${file}) failed to download`, e); }
      }));
    } catch { /* no manifest: synthesized sounds only */ }
    return out;
  }

  /** Decode the downloaded files once the AudioContext runs (works on old Safari's callback API too). */
  async decodeSamples() {
    this.samples = this.samples || {};
    const files = await this.sampleFiles;
    await Promise.all(Object.entries(files).map(([name, data]) => new Promise((resolve) => {
      const ok = (buf) => { this.samples[name] = buf; resolve(); };
      const fail = (e) => { console.warn(`Sound "${name}" failed to decode`, e); resolve(); };
      try {
        const p = this.ctx.decodeAudioData(data.slice(0), ok, fail);
        p?.catch?.(fail);
      } catch (e) { fail(e); }
    })));
    this.samplesReady = true;
  }

  playSample(buf, delay = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxBus);
    src.start(this.ctx.currentTime + delay);
  }

  /** True when a recorded file replaces the synthesized sound `name`. */
  hasSample(name) { return !!this.samples?.[name]; }

  /**
   * Rate-limited play: returns false if this sound just played (prevents double triggers),
   * or if a sound file replaced it (then the file is played instead).
   */
  gate(name, sampleDelay = 0) {
    if (!this.running) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < DEDUPE_SECONDS) return false;
    this.last[name] = now;
    this.played[name] = (this.played[name] || 0) + 1;
    if (this.samples?.[name]) { this.playSample(this.samples[name], sampleDelay); return false; }
    return true;
  }

  env(gainNode, t, vol, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(vol, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone({ freq = 200, endFreq = freq, time = 0.1, type = 'square', volume = 0.2, delay = 0, attack = 0.003, dest, echo = 0, vibrato = 0, lowpass = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + time);
    this.env(g, t, volume, attack, time);
    let out = osc;
    if (lowpass) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; out = out.connect(f); }
    if (vibrato) { // pitch wobble (sad trombone)
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = 6; depth.gain.value = freq * vibrato;
      lfo.connect(depth).connect(osc.frequency); lfo.start(t); lfo.stop(t + attack + time + 0.02);
    }
    out.connect(g).connect(dest || this.sfxBus);
    if (echo) { const e = c.createGain(); e.gain.value = echo; g.connect(e).connect(this.echoIn); }
    osc.start(t);
    osc.stop(t + attack + time + 0.02);
  }

  noise({ time = 0.1, volume = 0.3, freq = 1500, endFreq = null, type = 'lowpass', q = 1, delay = 0, attack = 0.002, echo = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + time);
    const g = c.createGain();
    this.env(g, t, volume, attack, time);
    src.connect(f).connect(g).connect(this.sfxBus);
    if (echo) { const e = c.createGain(); e.gain.value = echo; g.connect(e).connect(this.echoIn); }
    src.loop = true; // the noise buffer is 1s; long sounds (crowd, crashes) used to cut off early
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + time + 0.02);
  }

  // ---------- attacks (on attack start) ----------
  /** Whoosh for an attack/action name: punch | kick | strong | special. */
  attack(name) {
    if (name === 'punch') this.punch();
    else if (name === 'kick') this.kick();
    else if (name === 'strong') this.strong();
    else if (name === 'special') this.special();
  }
  punch() {
    if (!this.gate('punch')) return;
    this.noise({ time: 0.09, volume: 0.35, freq: 2600 * vary(), endFreq: 900, type: 'bandpass', q: 1.2 });
  }
  kick() {
    if (!this.gate('kick')) return;
    this.noise({ time: 0.15, volume: 0.4, freq: 1600 * vary(), endFreq: 450, type: 'bandpass', q: 1.4 });
  }
  strong() {
    if (!this.gate('strong')) return;
    this.noise({ time: 0.28, volume: 0.45, freq: 500 * vary(), endFreq: 2600, type: 'bandpass', q: 1.5, attack: 0.05 });
    this.tone({ freq: 110, endFreq: 65, time: 0.25, type: 'sawtooth', volume: 0.12, attack: 0.04 });
  }
  special() {
    if (!this.gate('special')) return;
    this.tone({ freq: 180 * vary(), endFreq: 900, time: 0.32, type: 'sawtooth', volume: 0.18, attack: 0.02 });
    this.tone({ freq: 270 * vary(), endFreq: 1350, time: 0.32, type: 'square', volume: 0.08, attack: 0.02, delay: 0.02 });
    this.noise({ time: 0.35, volume: 0.3, freq: 500, endFreq: 5000, type: 'bandpass', q: 2, attack: 0.03 });
  }

  // ---------- impacts ----------
  /**
   * Normal hit: a short, soft, low "thud" - a body punch, nothing bright or clicky, so it doesn't
   * get tiring when repeated. Three slightly different variations are picked at random.
   */
  hit(strength = 1) {
    if (!this.gate('hit')) return;
    const v = HIT_VARIANTS[Math.floor(Math.random() * HIT_VARIANTS.length)];
    const s = Math.min(1.3, Math.max(0.7, strength));
    this.tone({ freq: v.thump * vary(0.05), endFreq: 48, time: 0.09, type: 'sine', volume: 0.55 * s, attack: 0.002 }); // thump
    this.noise({ time: 0.06, volume: 0.32 * s, freq: v.body * vary(0.06), endFreq: 220, type: 'lowpass', q: 0.6 }); // body
    this.noise({ time: 0.025, volume: 0.07, freq: v.snap, type: 'bandpass', q: 1.2 }); // a hint of slap, kept soft
  }
  /** Heavy hit (strong attack): deeper and fuller version of the same thud, slightly longer. */
  heavyHit() {
    if (!this.gate('heavyHit')) return;
    this.tone({ freq: 105 * vary(0.05), endFreq: 38, time: 0.2, type: 'sine', volume: 0.75, attack: 0.002 });
    this.tone({ freq: 62, endFreq: 34, time: 0.26, type: 'sine', volume: 0.35, attack: 0.005 }); // sub
    this.noise({ time: 0.12, volume: 0.42, freq: 650 * vary(0.06), endFreq: 160, type: 'lowpass', q: 0.6 });
    this.noise({ time: 0.04, volume: 0.08, freq: 900, type: 'bandpass', q: 1 });
  }
  block() {
    if (!this.gate('block')) return;
    this.tone({ freq: 1250 * vary(0.03), endFreq: 1100, time: 0.12, type: 'square', volume: 0.12 });
    this.tone({ freq: 1870 * vary(0.03), endFreq: 1700, time: 0.1, type: 'triangle', volume: 0.12 });
    this.noise({ time: 0.07, volume: 0.35, freq: 4000, type: 'highpass' });
  }
  guardBreak() {
    if (!this.gate('guardBreak')) return;
    this.noise({ time: 0.3, volume: 0.6, freq: 3000, endFreq: 300, type: 'bandpass', q: 1.5 });
    this.tone({ freq: 520, endFreq: 110, time: 0.35, type: 'square', volume: 0.18 });
  }
  /** Player took damage: short "grunt". */
  damage() {
    if (!this.gate('damage')) return;
    this.tone({ freq: 170 * vary(), endFreq: 95, time: 0.18, type: 'sawtooth', volume: 0.16, delay: 0.03, attack: 0.01 });
    this.tone({ freq: 340 * vary(), endFreq: 190, time: 0.14, type: 'triangle', volume: 0.08, delay: 0.03, attack: 0.01 });
  }

  // ---------- movement ----------
  jump() {
    if (!this.gate('jump')) return;
    this.tone({ freq: 280 * vary(), endFreq: 620, time: 0.1, type: 'triangle', volume: 0.22 });
    this.noise({ time: 0.07, volume: 0.12, freq: 1200, type: 'bandpass' });
  }
  land() {
    if (!this.gate('land')) return;
    this.noise({ time: 0.08, volume: 0.35, freq: 500 * vary(), type: 'lowpass' });
    this.tone({ freq: 110, endFreq: 60, time: 0.08, type: 'sine', volume: 0.3 });
  }

  // ---------- round ----------
  /** K.O.: huge impact + boom with echo, then the crowd goes wild. */
  ko() {
    this.boom();
    this.crowd(1.1); // the crowd goes wild after the call
    if (!this.gate('ko')) return; // recorded "KNOCKOUT" plays here when available
    this.noise({ time: 0.15, volume: 0.9, freq: 2800, type: 'highpass', echo: 0.4 }); // crack
    this.noise({ time: 1.2, volume: 0.8, freq: 900, endFreq: 80, type: 'lowpass', echo: 0.5 }); // crash
    this.tone({ freq: 90, endFreq: 28, time: 1.4, type: 'sine', volume: 1, echo: 0.3 }); // boom
    this.tone({ freq: 180, endFreq: 45, time: 0.6, type: 'square', volume: 0.12, lowpass: 900 });
  }
  /** "FINISH HIM!" when a fighter is almost out of health (recorded file, or announcer voice fallback). */
  finishHim() {
    if (!this.gate('finishHim')) return;
    this.tone({ freq: 70, endFreq: 50, time: 1.2, type: 'sawtooth', volume: 0.15, lowpass: 400, echo: 0.3 });
    this.say('Finish him!');
  }
  /** The famous deep "boom" meme-style hit: saturated sub drop. */
  boom(delay = 0) {
    if (!this.gate('boom')) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(), sh = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
    sh.curve = curve;
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(sh).connect(g).connect(this.sfxBus);
    const e = c.createGain(); e.gain.value = 0.35; g.connect(e).connect(this.echoIn);
    o.start(t); o.stop(t + 1.7);
  }
  /** Classic party air horn: "BWAAA BWA BWA BWAAAAA". */
  airhorn(delay = 0) {
    if (!this.gate('airhorn')) return;
    const blasts = [[0, 0.32], [0.4, 0.12], [0.56, 0.12], [0.72, 0.9]];
    for (const [d, len] of blasts) {
      for (const [f, v] of [[466, 0.12], [470, 0.12], [698, 0.07], [932, 0.05]]) {
        this.tone({ freq: f * 0.97, endFreq: f, time: len, type: 'sawtooth', volume: v, delay: delay + d, attack: 0.015, lowpass: 3200, echo: 0.15 });
      }
    }
  }
  /** Record scratch (the "wait, what?" moment before losing). */
  scratch(delay = 0) {
    if (!this.gate('scratch')) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    const g = c.createGain();
    const pts = [[0, 600], [0.07, 3200], [0.14, 500], [0.24, 2800], [0.36, 300]];
    pts.forEach(([d, fr]) => f.frequency.linearRampToValueAtTime(fr, t + d));
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(f).connect(g).connect(this.sfxBus); src.start(t); src.stop(t + 0.42);
    this.tone({ freq: 300, endFreq: 900, time: 0.08, type: 'sawtooth', volume: 0.12, delay, lowpass: 2000 });
    this.tone({ freq: 900, endFreq: 200, time: 0.14, type: 'sawtooth', volume: 0.12, delay: delay + 0.1, lowpass: 2000 });
  }
  /** Crowd cheer: a swell of band-passed noise with scattered claps. */
  crowd(delay = 0) {
    if (!this.gate('crowd')) return;
    for (const [f, v] of [[700, 0.35], [1500, 0.3], [2800, 0.18]]) {
      this.noise({ time: 2.2, volume: v, freq: f, type: 'bandpass', q: 0.8, attack: 0.35, delay });
    }
    for (let i = 0; i < 18; i++) this.noise({ time: 0.04, volume: 0.25, freq: 2500, type: 'bandpass', q: 1.5, delay: delay + 0.2 + Math.random() * 1.8 });
  }
  /** Boxing bell "ding ding" (round start). */
  bell() {
    if (!this.gate('bell')) return;
    for (const d of [0, 0.22]) {
      for (const [m, v] of [[1, 0.3], [2.76, 0.12], [5.4, 0.06]]) {
        this.tone({ freq: 830 * m, endFreq: 830 * m * 0.995, time: 1.1, type: 'sine', volume: v, delay: d, echo: 0.25 });
      }
    }
  }
  /** "FIGHT!" stinger. */
  announce() {
    if (!this.gate('announce')) return;
    this.tone({ freq: 440, endFreq: 880, time: 0.22, type: 'square', volume: 0.14, lowpass: 3000 });
    this.tone({ freq: 660, endFreq: 1320, time: 0.22, type: 'triangle', volume: 0.1 });
    this.noise({ time: 0.3, volume: 0.25, freq: 600, endFreq: 4000, type: 'bandpass', q: 1.5 });
  }
  /** YOU win: brass fanfare - rising arpeggio into a big chord. */
  victory() {
    if (!this.gate('victory')) return;
    const brass = (f, d, len, v = 0.16) => {
      this.tone({ freq: f, time: len, type: 'sawtooth', volume: v, delay: d, attack: 0.02, lowpass: 2200, echo: 0.25 });
      this.tone({ freq: f * 1.003, time: len, type: 'square', volume: v * 0.4, delay: d, attack: 0.02, lowpass: 1800 });
    };
    [392, 523, 659, 784].forEach((f, i) => brass(f, i * 0.14, 0.13));
    brass(659, 0.6, 0.12); brass(784, 0.74, 0.12);
    for (const f of [523, 659, 784, 1047]) brass(f, 0.9, 1.1, 0.12); // final chord
    this.tone({ freq: 131, time: 1.2, type: 'sawtooth', volume: 0.14, delay: 0.9, lowpass: 600 });
    this.crowd(0.9);
    this.airhorn(2.0);
  }
  /** YOU lose: "womp womp womp wommmp" sad trombone. */
  defeat() {
    this.scratch();
    if (!this.gate('defeat', 0.45)) return; // recorded sad trombone plays after the scratch when available
    const notes = [[293.7, 0.5], [277.2, 0.92], [261.6, 1.34], [246.9, 1.76]];
    notes.forEach(([f, d], i) => {
      const last = i === notes.length - 1;
      const len = last ? 1.3 : 0.36;
      this.tone({ freq: f, endFreq: f * (last ? 0.94 : 0.97), time: len, type: 'sawtooth', volume: 0.24, delay: d, attack: 0.05,
        lowpass: 1100, vibrato: last ? 0.025 : 0 });
      this.tone({ freq: f / 2, endFreq: f / 2 * 0.97, time: len, type: 'triangle', volume: 0.16, delay: d, attack: 0.05 });
    });
  }

  /** Announcer voice (browser speech). Respects master/sfx volume and the "Announcer voice" setting. */
  say(text) {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !this.voiceOn || !this.running) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85; u.pitch = 0.55;
      u.volume = Math.min(1, this.volumes.master * this.volumes.sfx * 1.2);
      const voice = synth.getVoices().find((v) => /en[-_]?(US|GB)/i.test(v.lang) && /male|daniel|fred|alex|david/i.test(v.name))
        || synth.getVoices().find((v) => /^en/i.test(v.lang));
      if (voice) u.voice = voice;
      synth.speak(u);
      this.played['voice:' + text] = (this.played['voice:' + text] || 0) + 1;
    } catch { /* speech not available */ }
  }

  /** UI click for menus. */
  ui() {
    if (!this.gate('ui')) return;
    this.tone({ freq: 900, endFreq: 1200, time: 0.05, type: 'triangle', volume: 0.12 });
  }
}
