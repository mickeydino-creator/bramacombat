/*
 * A remote player's input on the HOST, with the same interface as the keyboard / gamepad / AI controllers
 * (getInput() -> { move, jump, block, actions }), so the fighter code cannot tell a friend from the AI.
 * Used for phone controllers and for online players.
 *
 * The wire format is "state + taps": held buttons (move / jump / block) are a state, attacks are one-shot taps.
 * Every message carries a counter `n`; anything not newer than the last one is ignored, so a duplicated or replayed
 * message can never fire an attack twice. Each tap sits in a queue and is handed to the fighter exactly once.
 */
export class NetController {
  constructor(slot) {
    this.slot = slot;
    this.connected = true;
    this.sid = null;
    this.lastN = -1;
    this.move = 0; this.jump = false; this.block = false;
    this.queue = [];
    this.jumpPulse = false; // a jump tap shorter than one frame still jumps
    this.lastRxAt = 0;
  }

  /** Returns false when the message was a duplicate / out of date. */
  receive(msg) {
    if (msg.sid !== this.sid) { this.sid = msg.sid; this.lastN = -1; } // the player reloaded their page: new counter
    if (!(msg.n > this.lastN)) return false;
    this.lastN = msg.n;
    this.lastRxAt = performance.now();
    this.move = msg.m; this.jump = !!msg.j; this.block = !!msg.b;
    if (msg.j) this.jumpPulse = true;
    for (const a of msg.a) this.queue.push(a);
    return true;
  }

  /** The player dropped: stand still, release everything. */
  neutralize() {
    this.move = 0; this.jump = false; this.block = false; this.queue = []; this.jumpPulse = false;
  }

  /** Called while the fighter can't act (between rounds, knocked out): throw away pending taps. */
  drain() { this.queue = []; this.jumpPulse = false; }

  /** Called by Game at the start of every round: pending taps from the last round must not carry over. Held buttons stay. */
  reset() { this.queue = []; this.jumpPulse = false; }

  getInput() {
    const input = { move: this.move, jump: this.jump || this.jumpPulse, block: this.block, actions: this.queue };
    this.queue = [];
    this.jumpPulse = false;
    return input;
  }
}

/**
 * Delays the host's own input by a few frames so the host does not get a latency advantage over remote players
 * (a remote fighter's input needs a network round trip before it takes effect, the host's would not).
 * Taps are never lost, even when the delay shrinks.
 */
export class InputDelay {
  constructor() { this.q = []; this.delay = 0; }

  setDelay(frames) { this.delay = Math.max(0, Math.round(frames)); }

  push(input) {
    this.q.push(input);
    if (this.q.length <= this.delay) return { move: 0, jump: false, block: false, actions: [] }; // (still filling up)
    let out = this.q.shift();
    while (this.q.length > this.delay) { // the delay shrank: merge instead of dropping taps
      const extra = this.q.shift();
      out = { ...extra, actions: [...out.actions, ...extra.actions] };
    }
    return out;
  }

  clear() { this.q.length = 0; }
}
