import { NetController, InputDelay } from './NetController.js';
import { PHASES, encodeFighter } from './snapshot.js';
import { hostDelayMode } from './config.js';

/*
 * HOST side of a VS FRIENDS match - the machine that runs the one authoritative simulation.
 *
 * The existing Game / Fighter / CombatSystem code runs unchanged; the only difference to a game against the AI is
 * where the opponents' input comes from: remote players are NetControllers (same interface as keyboard / AI).
 * After every simulation step this class
 *   - online rooms:      sends a compact snapshot of the match (src/net/snapshot.js) + this step's events to the players
 *   - controller rooms:  sends a small status to the phones now and then (health, phase) for their screen
 * and it evens out the host's latency advantage by delaying the host's own input a few frames (InputDelay).
 */
export class HostMatch {
  constructor(game, session, info) {
    this.role = 'host';
    this.game = game;
    this.session = session;
    this.info = info;
    this.type = info.type;
    this.controllers = new Map();
    for (const p of info.players) if (p.id !== session.you.id) this.controllers.set(p.slot, new NetController(p.slot));
    this.frame = 0;
    this.events = [];
    this.delay = new InputDelay();
    this.rtts = {};
    this.statusClock = 0;
    this.offs = [
      session.client.on('in', (m) => this.onInput(m)),
      session.client.on('member', (m) => this.setConnected(m.slot, m.connected)),
      session.client.on('gone', (m) => this.onGone(m)),
      session.client.on('rtts', (m) => this.onRtts(m.r)),
    ];
    session.client.resumeFlag = () => true; // the match lives in this page: a reconnect just continues it
  }

  controllerFor(slot) { return this.controllers.get(slot); }

  dispose() { this.offs.forEach((off) => off()); this.offs = []; }

  /** Events that happened during this step (hits, attacks, sound cues): delivered with the next snapshot. */
  emit(ev) { this.events.push(ev); }

  // -------------------------------------------------------------- remote players

  onInput(msg) {
    this.controllers.get(msg.slot)?.receive(msg);
  }

  setConnected(slot, connected) {
    const c = this.controllers.get(slot);
    if (!c) return;
    c.connected = connected;
    if (!connected) c.neutralize(); // a dropped player stands still (and can be hit) until they return or time out
  }

  /** The server says this player is gone for good: their fighter is out of the match. */
  onGone(msg) {
    const fighter = this.game.fighters[msg.slot];
    this.controllers.delete(msg.slot);
    if (fighter) this.game.forfeit(fighter);
  }

  /** Round-trip times of the other players to the server: used to pick the host's own input delay. */
  onRtts(r) {
    this.rtts = r;
    const mode = hostDelayMode();
    if (mode !== 'auto') { this.delay.setDelay(mode); return; }
    const others = Object.entries(r).filter(([slot]) => this.controllers.has(Number(slot))).map(([, ms]) => ms);
    if (!others.length) { this.delay.setDelay(0); return; }
    // A remote player's total lag is about (their RTT + the host's RTT); the host delays itself by half of that (max 5 frames).
    const total = others.reduce((a, b) => a + b, 0) / others.length + (this.session.client.rtt || 0);
    this.delay.setDelay(Math.min(5, Math.round(total * 0.5 / 16.7)));
  }

  /** The host player's own input, delayed like the others'. While a menu is open they stand still. */
  localInput(raw, menuOpen) {
    const input = menuOpen ? { move: 0, jump: false, block: false, actions: [] } : raw;
    return { ...this.delay.push(input), pause: raw.pause, restart: raw.restart, back: raw.back };
  }

  requestRestart() { this.session.requestStart(); }

  // -------------------------------------------------------------- output

  afterStep() {
    const g = this.game;
    this.frame++;
    if (this.type === 'online') {
      const snap = {
        t: 'snap', f: this.frame, ph: PHASES.indexOf(g.phase), pf: g.phaseFrame, w: g.winner ? g.fighters.indexOf(g.winner) : -1,
        wn: g.match.wins, rd: g.match.round, rid: g.restartId ?? 0, ho: Math.round((g.holeProgress ?? 0) * 100) / 100, fl: g.fallIdx ?? -1,
        dn: g.downOrder.map((f) => g.fighters.indexOf(f)),
        fs: g.fighters.map((f, i) => encodeFighter(f, !!this.controllers.get(i) && !this.controllers.get(i).connected)),
        ev: this.events,
      };
      this.session.client.sendRaw(JSON.stringify(snap));
    } else if (++this.statusClock >= 12) { // phone controllers: ~5 updates a second are plenty
      this.statusClock = 0;
      this.session.client.send({
        t: 'status', ph: g.phase, hp: g.fighters.map((f) => Math.round(f.health)), al: g.fighters.map((f) => (f.alive ? 1 : 0)),
        w: g.winner ? g.fighters.indexOf(g.winner) : -1,
      });
    }
    this.events = [];
  }
}

