import { PROTOCOL_VERSION, TIMING, errorMessage } from '../../shared/protocol.js';
import { serverUrl } from './config.js';

/*
 * WebSocket connection to the room server with everything a flaky mobile connection needs:
 *   - timeouts and readable errors (every failure carries a protocol error code, see ERRORS in shared/protocol.js)
 *   - automatic reconnect with back-off, re-attaching to the same player slot with the saved token
 *   - heartbeat (round-trip time + dead connection detection)
 *   - reacts to the phone waking up / the network coming back (visibilitychange, online)
 *   - the session survives a page reload (sessionStorage), so a refresh rejoins the room
 *   - optional artificial latency / jitter / loss for testing (NetClient.simulation)
 *
 * status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'
 */
const STORE_KEY = 'doodle-brawl-session';
const CONNECT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 8000;
const GIVE_UP_AFTER_MS = 60000;
const BACKOFF_MS = [250, 600, 1200, 2500, 4000];

export class NetError extends Error {
  constructor(code, message) { super(message ?? errorMessage(code)); this.code = code; }
}

export class NetClient {
  /** Test hook: NetClient.simulation = { lagMs: 120, jitterMs: 30, loss: 0 } delays everything this client sends and receives. */
  static simulation = { lagMs: 0, jitterMs: 0, loss: 0 };

  constructor({ url = null, storage = safeStorage() } = {}) {
    this.url = url;
    this.storage = storage;
    this.status = 'idle';
    this.creds = null; // { code, id, token, role, type, name } of the room we are in
    this.rtt = 0;
    this.sid = Math.random().toString(36).slice(2, 10); // identifies this page load (input duplicate filter on the host)
    this.handlers = new Map();
    this.statusListeners = new Set();
    this.ws = null;
    this.intentionalClose = false;
    this.lastRx = 0;
    this.resumeFlag = () => true; // host session: "my match is still running in this page"
    this.outDue = 0; this.inDue = 0;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.wake(); });
    window.addEventListener('online', () => this.wake());
    window.addEventListener('pageshow', () => this.wake());
  }

  // ---------------------------------------------------------------- events

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  onStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }

  setStatus(status, info = {}) {
    if (this.status === status && !info.force) return;
    this.status = status;
    for (const fn of this.statusListeners) fn(status, info);
  }

  dispatch(msg) {
    this.handlers.get(msg.t)?.forEach((fn) => fn(msg));
    this.handlers.get('*')?.forEach((fn) => fn(msg));
  }

  // ---------------------------------------------------------------- joining / leaving

  /** Create a room (you become the host). Resolves with the `joined` message. */
  async create(type, name) {
    this.intentionalClose = false;
    const joined = await this.request({ t: 'create', type, name, v: PROTOCOL_VERSION });
    this.adopt(joined, name);
    return joined;
  }

  async join(code, role, name) {
    this.intentionalClose = false;
    const joined = await this.request({ t: 'join', code, role, name, v: PROTOCOL_VERSION });
    this.adopt(joined, name);
    return joined;
  }

  /** After a page reload: rejoin the room saved in sessionStorage. Resolves with `joined`, or null when there is nothing to resume. */
  async resumeSaved(resume = false) {
    const saved = this.loadCreds();
    if (!saved) return null;
    this.intentionalClose = false;
    this.creds = saved;
    // A refresh while the network hiccups must not lose the room: retry transient failures, forget only when the server says the room is gone.
    for (let attempt = 0; ; attempt++) {
      try {
        const joined = await this.request({ t: 'rejoin', code: saved.code, id: saved.id, token: saved.token, resume });
        this.adopt(joined, saved.name);
        return joined;
      } catch (e) {
        const transient = e.code === 'TIMEOUT' || e.code === 'CONNECTION_FAILED';
        if (!transient || attempt >= 3) { if (!transient) this.forget(); throw e; }
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      }
    }
  }

  adopt(joined, name) {
    this.creds = { code: joined.code, id: joined.you.id, token: joined.you.token, role: joined.you.role, type: joined.type, name: joined.you.name ?? name };
    this.saveCreds();
    this.setStatus('open', { force: true });
    this.startHeartbeat();
  }

  /** Leave the room for good (tells the server, forgets the saved session, closes the socket). */
  leave() {
    this.intentionalClose = true;
    try { this.send({ t: 'leave' }); } catch { /* socket already gone */ }
    this.forget();
    this.stopHeartbeat();
    clearTimeout(this.reconnectTimer);
    const ws = this.ws;
    this.ws = null;
    setTimeout(() => ws?.close(1000, 'leave'), 100); // let the leave message flush
    this.setStatus('idle');
  }

  forget() {
    this.creds = null;
    try { this.storage?.removeItem(STORE_KEY); } catch { /* ignore */ }
  }

  saveCreds() { try { this.storage?.setItem(STORE_KEY, JSON.stringify(this.creds)); } catch { /* private mode */ } }
  loadCreds() { try { return JSON.parse(this.storage?.getItem(STORE_KEY) || 'null'); } catch { return null; } }

  // ---------------------------------------------------------------- requests

  /** Send a message that is answered with `joined` or `error`. Opens the socket first. */
  async request(msg) {
    this.setStatus('connecting');
    try {
      await this.openSocket();
    } catch (e) {
      this.setStatus('idle');
      throw e;
    }
    return new Promise((resolve, reject) => {
      const done = (fn, v) => { off1(); off2(); clearTimeout(timer); fn(v); };
      const off1 = this.on('joined', (m) => done(resolve, m));
      const off2 = this.on('error', (m) => done(reject, new NetError(m.code, m.message)));
      const timer = setTimeout(() => done(reject, new NetError('TIMEOUT')), REQUEST_TIMEOUT_MS);
      this.sendRaw(JSON.stringify(msg));
    }).catch((e) => { if (this.status === 'connecting') this.setStatus('idle'); throw e; });
  }

  openSocket() {
    if (this.isOpen) return Promise.resolve(); // reuse the socket after a rejected join
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url ?? serverUrl()); } catch { reject(new NetError('CONNECTION_FAILED')); return; }
      const timer = setTimeout(() => { ws.close(); reject(new NetError('TIMEOUT')); }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        this.lastRx = performance.now();
        ws.onmessage = (e) => this.onRaw(e.data);
        ws.onclose = () => this.onSocketClosed(ws);
        ws.onerror = () => {};
        resolve();
      };
      ws.onerror = () => { clearTimeout(timer); reject(new NetError('CONNECTION_FAILED')); };
      ws.onclose = () => { clearTimeout(timer); };
    });
  }

  // ---------------------------------------------------------------- sending / receiving

  get isOpen() { return this.ws?.readyState === 1; }

  send(obj) { this.sendRaw(JSON.stringify(obj)); }

  sendRaw(text) {
    const sim = NetClient.simulation;
    if (!sim.lagMs && !sim.loss) { if (this.isOpen) this.ws.send(text); return; }
    if (sim.loss && Math.random() < sim.loss && !text.includes('"t":"create"') && !text.includes('"t":"join"') && !text.includes('"t":"rejoin"')) return;
    const due = Math.max(this.outDue, performance.now() + sim.lagMs + Math.random() * sim.jitterMs); // keeps order, like TCP
    this.outDue = due;
    setTimeout(() => { if (this.isOpen) this.ws.send(text); }, due - performance.now());
  }

  onRaw(data) {
    this.lastRx = performance.now();
    const sim = NetClient.simulation;
    if (!sim.lagMs) { this.parse(data); return; }
    const due = Math.max(this.inDue, performance.now() + sim.lagMs + Math.random() * sim.jitterMs);
    this.inDue = due;
    setTimeout(() => this.parse(data), due - performance.now());
  }

  parse(data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.t === 'pong') { this.onPong(msg); return; }
    this.dispatch(msg);
  }

  // ---------------------------------------------------------------- heartbeat

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.isOpen) return;
      if (performance.now() - this.lastRx > TIMING.DEAD_AFTER_MS * 0.55) { this.ws.close(); return; } // silent socket -> reconnect
      this.send({ t: 'ping', ts: performance.now(), rtt: Math.round(this.rtt) });
    }, TIMING.HEARTBEAT_MS);
  }

  stopHeartbeat() { clearInterval(this.pingTimer); }

  onPong(msg) {
    const rtt = performance.now() - msg.ts;
    this.rtt = this.rtt ? this.rtt * 0.7 + rtt * 0.3 : rtt;
    this.dispatch({ t: 'rtt', rtt: this.rtt });
  }

  // ---------------------------------------------------------------- reconnecting

  onSocketClosed(ws) {
    if (ws !== this.ws) return;
    this.ws = null;
    if (this.intentionalClose || !this.creds) return;
    this.reconnect();
  }

  /** Called when the phone wakes up / the network returns: check the socket right away. */
  wake() {
    if (!this.creds || this.intentionalClose) return;
    if (this.status === 'reconnecting') { clearTimeout(this.reconnectTimer); this.attemptReconnect(0); return; }
    if (this.status === 'open' && !this.isOpen) { this.reconnect(); return; }
    if (this.isOpen) this.send({ t: 'ping', ts: performance.now(), rtt: Math.round(this.rtt) });
  }

  reconnect() {
    if (this.status === 'reconnecting') return;
    this.setStatus('reconnecting', { since: performance.now() });
    this.reconnectStart = performance.now();
    this.attemptReconnect(0);
  }

  async attemptReconnect(attempt) {
    if (this.intentionalClose || !this.creds) return;
    if (performance.now() - this.reconnectStart > GIVE_UP_AFTER_MS) { this.giveUp('CONNECTION_LOST'); return; }
    try {
      await this.openSocket();
      const c = this.creds;
      const joined = await new Promise((resolve, reject) => {
        const done = (fn, v) => { off1(); off2(); clearTimeout(timer); fn(v); };
        const off1 = this.on('joined', (m) => done(resolve, m));
        const off2 = this.on('error', (m) => done(reject, new NetError(m.code, m.message)));
        const timer = setTimeout(() => done(reject, new NetError('TIMEOUT')), REQUEST_TIMEOUT_MS);
        this.send({ t: 'rejoin', code: c.code, id: c.id, token: c.token, resume: !!this.resumeFlag() });
      });
      this.setStatus('open', { force: true, reconnected: true });
      this.dispatch({ t: 'reconnected', joined });
    } catch (e) {
      if (e.code === 'REJOIN_FAILED') { this.giveUp('REJOIN_FAILED'); return; } // the room is gone: stop trying
      const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      this.reconnectTimer = setTimeout(() => this.attemptReconnect(attempt + 1), wait);
    }
  }

  giveUp(code) {
    this.forget();
    this.stopHeartbeat();
    this.setStatus('closed', { code, message: errorMessage(code) });
    this.dispatch({ t: 'gaveup', code, message: errorMessage(code) });
  }
}

// Test aid: open the game with ?netlag=150&netjitter=40 (milliseconds, added to everything sent and received) to feel a bad connection.
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search);
  if (q.get('netlag')) NetClient.simulation = { lagMs: Number(q.get('netlag')) || 0, jitterMs: Number(q.get('netjitter')) || 0, loss: Number(q.get('netloss')) || 0 };
}

function safeStorage() {
  try { return window.sessionStorage; } catch { return null; }
}
