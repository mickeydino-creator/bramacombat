import { NetClient } from './NetClient.js';
import { NetBanner } from '../ui/NetBanner.js';
import { MIN_PLAYERS_TO_START, errorMessage, ROLES } from '../../shared/protocol.js';

/*
 * One VS FRIENDS room as the game sees it: connection, lobby, and the hand-over to the match.
 *
 *   NetSession   (this file)    room + lobby + reconnect messages -> UI (src/ui/NetMenu.js) and Game
 *   HostMatch / ClientMatch     the running match (simulate+send, or mirror)        -> src/net/
 *
 * UI code subscribes with onChange(); everything it needs to draw is public state:
 *   phase    'idle' | 'connecting' | 'lobby' | 'playing' | 'closed'
 *   code, type, you, lobby (members), notice (a message to show in the lobby), error (last failure)
 */
let banner = null;

export class NetSession {
  constructor(game) {
    this.game = game;
    this.client = new NetClient();
    this.banner = banner ??= new NetBanner();
    this.listeners = new Set();
    this.phase = 'idle';
    this.code = null; this.type = null; this.you = null; this.lobby = null;
    this.notice = null; this.error = null;
    this.hostDownUntil = 0;
    this.startInfo = null;

    const c = this.client;
    c.on('lobby', (m) => { this.lobby = m; this.notice = m.notice ?? this.notice; this.change(); });
    c.on('start', (m) => this.onStart(m));
    c.on('closed', (m) => this.onClosed(m));
    c.on('ended', (m) => this.onEnded(m));
    c.on('host', (m) => this.onHost(m));
    c.on('reconnected', (m) => this.onReconnected(m.joined));
    c.on('gaveup', (m) => this.onGaveUp(m));
    c.onStatus((status) => this.onStatus(status));
    this.ticker = setInterval(() => this.tick(), 500);
  }

  get isHost() { return this.you?.role === ROLES.HOST; }
  get members() { return this.lobby?.members ?? []; }
  get me() { return this.members.find((m) => m.id === this.you?.id) ?? null; }

  /** Host may start when 2+ players are here, all connected and ready. Returns null or the reason it can't. */
  startBlocker() {
    const m = this.members;
    if (m.length < MIN_PLAYERS_TO_START) return 'Waiting for friends to join...';
    const off = m.find((x) => !x.connected);
    if (off) return `${off.name} is reconnecting...`;
    const waiting = m.find((x) => !x.ready);
    if (waiting) return `Waiting for ${waiting.name} to be ready...`;
    return null;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  change() { for (const fn of this.listeners) fn(this); }

  // ---------------------------------------------------------------- user actions

  async createRoom(type, name) {
    return this.enter(() => this.client.create(type, name));
  }

  async joinRoom(code, role, name) {
    return this.enter(() => this.client.join(code, role, name));
  }

  /** After a page reload: rejoin the saved room. Resolves true when we are back in it. */
  async resume() {
    if (!this.client.loadCreds()) return false;
    return this.enter(() => this.client.resumeSaved(false), { quiet: true });
  }

  async enter(fn, { quiet = false } = {}) {
    this.error = null; this.phase = 'connecting'; this.change();
    try {
      const joined = await fn();
      this.adopt(joined);
      return true;
    } catch (e) {
      this.phase = 'idle';
      this.error = quiet ? null : { code: e.code ?? 'CONNECTION_FAILED', message: e.code ? e.message : errorMessage('CONNECTION_FAILED') };
      this.change();
      return false;
    }
  }

  adopt(joined) {
    this.code = joined.code; this.type = joined.type; this.you = joined.you; this.lobby = joined.lobby;
    this.notice = joined.lobby?.notice ?? null;
    this.phase = joined.lobby?.state === 'playing' ? 'playing' : 'lobby';
    this.change();
    if (joined.start && joined.you) this.onStart(joined.start); // rejoined into a running match
  }

  setReady(ready) { this.client.send({ t: 'ready', ready }); }

  /** Host: start the match (or the next one, from the end screen). The server answers every player with `start`. */
  requestStart() { this.client.send({ t: 'start' }); }

  leave() {
    clearInterval(this.ticker);
    this.client.leave();
    this.banner.set('conn', null); this.banner.set('host', null); this.banner.set('stall', null);
    this.phase = 'idle'; this.lobby = null; this.code = null; this.you = null;
    this.change();
  }

  // ---------------------------------------------------------------- server messages

  onStart(info) {
    this.startInfo = info;
    this.phase = 'playing';
    this.notice = null;
    this.change();
    this.game.startNetMatch(this, info);
  }

  onClosed(msg) {
    this.banner.set('host', null);
    this.game.mainMenu(); // leaves the network state too
    this.banner.set('closed', msg.message || 'The room closed.', { seconds: 6, priority: 5 });
  }

  /** The host reloaded its page, so the match it was simulating is gone: everybody is back in the lobby. */
  onEnded(msg) {
    this.notice = msg.message;
    this.phase = 'lobby';
    this.game.returnToLobby();
    this.change();
  }

  onHost(msg) {
    this.hostDownUntil = msg.connected ? 0 : performance.now() + (msg.graceMs ?? 30000);
    if (msg.connected) this.banner.set('host', null);
    this.tick();
  }

  onReconnected(joined) {
    this.banner.set('conn', 'Reconnected!', { seconds: 2, tone: 'good', priority: 2 });
    this.you = joined.you; this.lobby = joined.lobby;
    this.change();
  }

  onGaveUp(msg) {
    this.banner.set('conn', null);
    this.game.mainMenu();
    this.banner.set('closed', msg.code === 'REJOIN_FAILED' ? 'The room is no longer available.' : 'Connection lost. Could not get back into the room.', { seconds: 7, priority: 5 });
  }

  onStatus(status) {
    if (status === 'reconnecting') this.banner.set('conn', 'Connection lost. Reconnecting...', { priority: 4 });
    else if (status === 'open') this.banner.set('conn', null);
  }

  setStall(on) { this.banner.set('stall', on ? 'Waiting for the host...' : null, { priority: 3 }); }

  tick() {
    if (this.hostDownUntil) {
      const s = Math.max(0, Math.ceil((this.hostDownUntil - performance.now()) / 1000));
      this.banner.set('host', `The host lost connection. Waiting for them... ${s}s`, { priority: 4 });
    }
  }
}

