import { InputSender } from './InputSender.js';
import { STEP, PODIUM_DELAY_FRAMES, PODIUM_FRAMES } from '../config/constants.js';
import { PHASES, applyFighter } from './snapshot.js';

/*
 * MIRROR side of a VS FRIENDS online match (every player except the host).
 *
 * This screen does not simulate anything. Every game step it
 *   1. sends the local player's input to the host (only when it changed, plus a short keep-alive),
 *   2. takes the next snapshot from a small jitter buffer and writes it into the fighters,
 *   3. plays the events that came with it (attacks, hits, sound cues) through the SAME handlers the host uses.
 * Rendering, effects, sounds, the HUD and the camera all run locally on top of the mirrored state, so the existing
 * look and feel is unchanged. Snapshots are replayed in order, one per step, which keeps motion smooth; the buffer
 * (about 3 snapshots = 50 ms) absorbs network jitter, and it catches up by taking extra snapshots when it grows.
 */
const MIN_TARGET = 2, MAX_TARGET = 6; // snapshots kept in the jitter buffer: grows with network jitter (see onSnap)
const MAX_TAKE = 6;
const STALL_MS = 1200;

export class ClientMatch {
  constructor(game, session, info) {
    this.role = 'client';
    this.game = game;
    this.session = session;
    this.info = info;
    this.buffer = [];
    this.started = false;
    this.lastRecv = -1;
    this.lastRid = -1;
    this.lastPh = null;
    this.lastWins = '';
    this.lastSnapAt = performance.now();
    this.jitter = 0; // smoothed deviation of snapshot arrival times from the 16.7 ms rhythm (ms)
    this.target = 3;
    this.sender = new InputSender(session.client);
    this.stalled = false;
    this.offs = [session.client.on('snap', (m) => this.onSnap(m))];
    session.client.resumeFlag = () => true;
  }

  controllerFor() { return null; }
  emit() {} // events come from the host
  localInput(raw) { return raw; }
  requestRestart() {}
  dispose() { this.offs.forEach((off) => off()); this.offs = []; this.session.setStall(false); }

  // -------------------------------------------------------------- input -> host

  sendInput(input) { this.sender.send(input); }

  // -------------------------------------------------------------- snapshots <- host

  onSnap(snap) {
    if (!(snap.f > this.lastRecv)) return; // duplicate or old: ignore
    this.lastRecv = snap.f;
    const now = performance.now();
    this.jitter = this.jitter * 0.95 + Math.abs(now - this.lastSnapAt - 16.7) * 0.05;
    this.target = Math.max(MIN_TARGET, Math.min(MAX_TARGET, 1 + Math.ceil((this.jitter * 2) / 16.7))); // calm line: ~33 ms of buffer, shaky line: more
    this.lastSnapAt = now;
    this.buffer.push(snap);
    if (this.buffer.length > 120) this.buffer.splice(0, this.buffer.length - 60); // far behind (tab was asleep): skip ahead
    if (this.stalled) { this.stalled = false; this.session.setStall(false); }
  }

  /** Called once per game step. */
  consume() {
    const buf = this.buffer;
    if (!this.started) {
      if (buf.length < this.target) { this.checkStall(); return; }
      this.started = true;
    }
    if (!buf.length) { this.started = false; this.checkStall(); return; } // ran dry: re-buffer, don't stutter
    let take = 1;
    if (buf.length > this.target + 3) take = Math.min(MAX_TAKE, buf.length - this.target);
    for (let k = 0; k < take; k++) this.apply(buf.shift());
  }

  checkStall() {
    if (!this.stalled && performance.now() - this.lastSnapAt > STALL_MS) { this.stalled = true; this.session.setStall(true); }
  }

  apply(snap) {
    const g = this.game;
    if (snap.fs.length !== g.fighters.length) return;
    const phase = PHASES[snap.ph] ?? 'fight';
    const firstOfRound = snap.rid !== this.lastRid;
    if (firstOfRound) { // a new round started on the host (also true for the very first snapshot)
      this.lastRid = snap.rid;
      g.match = { wins: snap.wn.slice(), round: snap.rd };
      g.restart();
      g.touch?.setVisible(true);
    }
    g.phase = phase;
    g.phaseFrame = snap.pf;
    g.match.round = snap.rd;
    g.match.wins = snap.wn;
    g.winner = snap.w >= 0 ? g.fighters[snap.w] : null;
    g.downOrder = snap.dn.map((i) => g.fighters[i]);
    snap.fs.forEach((a, i) => { applyFighter(g.fighters[i], a); g.fighters[i].time += STEP; });
    g.fighters.forEach((f) => g.hudHealth(f));
    const wins = snap.wn.join(',');
    if (wins !== this.lastWins) { this.lastWins = wins; snap.wn.forEach((w, i) => g.hud.setWins(g.hudMap[i], w)); }
    if (firstOfRound && phase !== 'intro') { g.hud.showMessage(''); } // joined mid-round: nothing to announce
    this.present(snap, phase);
    for (const ev of snap.ev) g.playNetEvent(ev);
    this.lastPh = phase;
  }

  /** Phase-driven presentation (podium glide, winner screen, the hole). Idempotent, so a missed event cannot break it. */
  present(snap, phase) {
    const g = this.game;
    if (phase === 'podium' || phase === 'over') g.touch?.setVisible(false);
    if (phase === 'podium' && snap.pf >= PODIUM_DELAY_FRAMES) {
      g.podiumVisuals();
      g.podiumScene.setProgress(Math.min(1, (snap.pf - PODIUM_DELAY_FRAMES) / PODIUM_FRAMES));
    } else if (phase === 'over') {
      g.podiumVisuals();
      g.podiumScene.setProgress(1);
      g.finishVisuals(snap.w, this.lastPh === null); // (quiet = this screen just joined)
      g.podiumScene.setHole(snap.ho);
      if (snap.fl >= 0) g.fallVisuals(snap.fl);
    }
  }
}
