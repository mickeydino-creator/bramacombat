import { ACTIONS } from '../../shared/protocol.js';

/*
 * Turns the local player's input (same object as keyboard / gamepad / touch produce) into network messages for the host.
 * Held buttons are sent when they change (plus a short keep-alive, so a missed message heals itself); attack taps are
 * sent immediately and exactly once, carrying a message counter the host uses to drop duplicates.
 * Used by online players (ClientMatch) and by the phone controller page.
 */
const KEEPALIVE_MS = 100;

export class InputSender {
  constructor(client) {
    this.client = client;
    this.n = 0;
    this.sent = { m: 0, j: 0, b: 0 };
    this.sentAt = 0;
  }

  send(input) {
    const m = input.move < 0 ? -1 : input.move > 0 ? 1 : 0;
    const j = input.jump ? 1 : 0, b = input.block ? 1 : 0;
    const a = input.actions.filter((x) => ACTIONS.includes(x));
    const now = performance.now();
    const changed = m !== this.sent.m || j !== this.sent.j || b !== this.sent.b;
    if (!changed && !a.length && now - this.sentAt < KEEPALIVE_MS) return;
    this.sent = { m, j, b };
    this.sentAt = now;
    this.client.send({ t: 'in', sid: this.client.sid, n: ++this.n, m, j, b, a });
  }

  /** Release everything on the host (e.g. the page is going to the background). */
  release() {
    this.sent = { m: 9, j: 9, b: 9 }; // force the next send()
    this.send({ move: 0, jump: false, block: false, actions: [] });
  }
}
