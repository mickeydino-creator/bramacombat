import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  PROTOCOL_VERSION, MAX_PLAYERS, MAX_NAME_LENGTH, MIN_PLAYERS_TO_START, ROOM_TYPES, ROLES, CODE_ALPHABET, CODE_LENGTH,
  TIMING, normalizeCode, isValidCode, sanitizeName, sanitizeInput, errorMessage, CLOSE_REASONS,
} from '../shared/protocol.js';

/*
 * Realtime room server for Doodle Brawl VS FRIENDS.
 *
 * It owns everything that must not be trusted to a single browser: room codes, who sits in which slot, ready flags,
 * start gating, reconnect tokens, timeouts and rate limits. During a match it only RELAYS: inputs go player -> host,
 * snapshots go host -> players. The match itself is simulated by the host's browser (host-authoritative), using the
 * very same combat code as the single player game.
 *
 * No game logic lives here. See shared/protocol.js for the wire format.
 */
export class RoomServer {
  constructor({ maxRooms = 500, timing = {}, allowedOrigins = null, log = () => {} } = {}) {
    this.rooms = new Map();
    this.conns = new Set();
    this.maxRooms = maxRooms;
    this.timing = { ...TIMING, ...timing };
    this.allowedOrigins = allowedOrigins; // null = any origin
    this.log = log;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    this.sweeper = setInterval(() => this.sweep(), 2000);
    this.sweeper.unref?.();
    this.rttTimer = setInterval(() => this.sendRtts(), 2000);
    this.rttTimer.unref?.();
    this.createdAt = Date.now();
  }

  stats() {
    return { rooms: this.rooms.size, connections: this.conns.size, uptimeSeconds: Math.round((Date.now() - this.createdAt) / 1000) };
  }

  close() {
    clearInterval(this.sweeper); clearInterval(this.rttTimer);
    for (const room of [...this.rooms.values()]) this.closeRoom(room, 'server_shutdown');
    for (const c of this.conns) c.ws.close(1001, 'server shutdown');
    this.wss.close();
  }

  // ------------------------------------------------------------------ connections

  handleUpgrade(req, socket, head) {
    const origin = req.headers.origin;
    if (this.allowedOrigins && origin && !this.allowedOrigins.includes(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
  }

  onConnection(ws, req) {
    const conn = {
      ws, member: null, room: null, lastSeen: Date.now(),
      ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim(),
      tokens: 60, tokenAt: Date.now(), strikes: 0,
    };
    this.conns.add(conn);
    ws.on('message', (data, isBinary) => this.onMessage(conn, data, isBinary));
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => {});
  }

  send(conn, msg) {
    if (conn?.ws.readyState === 1) conn.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  error(conn, code, extra = {}) {
    this.send(conn, { t: 'error', code, message: errorMessage(code), ...extra });
  }

  /** Token bucket: ~150 messages/second sustained (60 inputs + 60 snapshots + pings fit comfortably). */
  allow(conn) {
    const now = Date.now();
    conn.tokens = Math.min(240, conn.tokens + ((now - conn.tokenAt) / 1000) * 150);
    conn.tokenAt = now;
    if (conn.tokens < 1) return false;
    conn.tokens -= 1;
    return true;
  }

  onMessage(conn, data, isBinary) {
    conn.lastSeen = Date.now();
    if (isBinary) return;
    if (!this.allow(conn)) {
      if (++conn.strikes > 200) conn.ws.close(1008, 'rate limit');
      return;
    }
    const text = data.toString();
    // Hot path: the host's snapshots are relayed untouched, without parsing them.
    if (text.startsWith('{"t":"snap"')) {
      const room = conn.room;
      if (room && conn.member?.role === ROLES.HOST && room.state === 'playing') {
        for (const m of room.members) if (m && m.role === ROLES.PLAYER && m.conn) this.send(m.conn, text);
      }
      return;
    }
    let msg;
    try { msg = JSON.parse(text); } catch { this.error(conn, 'BAD_MESSAGE'); return; }
    if (!msg || typeof msg.t !== 'string') { this.error(conn, 'BAD_MESSAGE'); return; }

    switch (msg.t) {
      case 'ping': this.onPing(conn, msg); break;
      case 'create': this.onCreate(conn, msg); break;
      case 'join': this.onJoin(conn, msg); break;
      case 'rejoin': this.onRejoin(conn, msg); break;
      case 'ready': this.onReady(conn, msg); break;
      case 'start': this.onStart(conn); break;
      case 'in': this.onInput(conn, msg); break;
      case 'status': this.onStatus(conn, msg); break;
      case 'leave': this.onLeave(conn); break;
      default: this.error(conn, 'BAD_MESSAGE');
    }
  }

  onClose(conn) {
    this.conns.delete(conn);
    const { member, room } = conn;
    if (!member || !room || member.conn !== conn) return; // replaced by a newer connection (rejoin)
    member.conn = null;
    member.connected = false;
    member.disconnectedAt = Date.now();
    if (member.role === ROLES.HOST) {
      room.hostDropAt = Date.now();
      this.broadcastMembers(room, { t: 'host', connected: false, graceMs: this.timing.HOST_GRACE_MS });
    } else {
      this.toHost(room, { t: 'member', slot: member.slot, connected: false });
    }
    this.broadcastLobby(room);
  }

  // ------------------------------------------------------------------ handlers

  onPing(conn, msg) {
    if (conn.member && Number.isFinite(msg.rtt)) conn.member.rtt = Math.max(0, Math.min(5000, Math.round(msg.rtt)));
    this.send(conn, { t: 'pong', ts: msg.ts });
  }

  newCode() {
    for (let tries = 0; tries < 50; tries++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  newMember(room, role, name, conn) {
    return {
      id: crypto.randomBytes(6).toString('hex'),
      token: crypto.randomBytes(16).toString('hex'),
      role, name, slot: -1, ready: true, // everybody starts ready; players can un-ready in the lobby
      conn, connected: true, disconnectedAt: 0, rtt: 0, gone: false,
    };
  }

  /** Names identify fighters, so two players never share one: a second "Alex" becomes "Alex 2". */
  uniqueName(room, name) {
    const taken = new Set(room.members.filter((m) => m && !m.gone).map((m) => m.name.toLowerCase()));
    let out = name;
    for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${name.slice(0, MAX_NAME_LENGTH - String(n).length - 1)} ${n}`;
    return out;
  }

  onCreate(conn, msg) {
    if (conn.room) { this.error(conn, 'BAD_MESSAGE'); return; }
    if (msg.v !== PROTOCOL_VERSION) { this.error(conn, 'VERSION'); return; }
    const type = Object.values(ROOM_TYPES).includes(msg.type) ? msg.type : null;
    if (!type) { this.error(conn, 'BAD_MESSAGE'); return; }
    if (this.rooms.size >= this.maxRooms) { this.error(conn, 'SERVER_BUSY'); return; }
    const name = sanitizeName(msg.name, '');
    if (!name) { this.error(conn, 'NAME_REQUIRED'); return; }
    const code = this.newCode();
    if (!code) { this.error(conn, 'SERVER_BUSY'); return; }
    const room = { code, type, state: 'lobby', members: [], startInfo: null, matchId: 0, createdAt: Date.now(), hostDropAt: 0, notice: null };
    const host = this.newMember(room, ROLES.HOST, name, conn);
    room.members.push(host);
    this.reindex(room);
    this.rooms.set(code, room);
    this.attach(conn, room, host);
    this.log(`room ${code} (${type}) created`);
    this.send(conn, { t: 'joined', code, type, you: this.youInfo(host), lobby: this.lobbyOf(room) });
  }

  onJoin(conn, msg) {
    if (conn.room) { this.error(conn, 'BAD_MESSAGE'); return; }
    if (msg.v !== PROTOCOL_VERSION) { this.error(conn, 'VERSION'); return; }
    const code = normalizeCode(msg.code);
    if (!isValidCode(code)) { this.error(conn, 'INVALID_CODE'); return; }
    const room = this.rooms.get(code);
    if (!room) { this.error(conn, 'ROOM_NOT_FOUND'); return; }
    const role = room.type === ROOM_TYPES.CONTROLLERS ? ROLES.CONTROLLER : ROLES.PLAYER;
    if (msg.role !== role) { this.error(conn, 'WRONG_ROOM_TYPE', { expected: role }); return; }
    if (room.state === 'playing') { this.error(conn, 'GAME_IN_PROGRESS'); return; }
    const live = room.members.filter((m) => m && !m.gone);
    if (live.length >= MAX_PLAYERS) { this.error(conn, 'ROOM_FULL'); return; }
    const name = sanitizeName(msg.name, '');
    if (!name) { this.error(conn, 'NAME_REQUIRED'); return; }
    const member = this.newMember(room, role, this.uniqueName(room, name), conn);
    room.members.push(member);
    this.reindex(room);
    this.attach(conn, room, member);
    this.log(`room ${code}: ${member.name} joined as ${role}`);
    this.send(conn, { t: 'joined', code, type: room.type, you: this.youInfo(member), lobby: this.lobbyOf(room) });
    this.broadcastLobby(room, conn);
  }

  onRejoin(conn, msg) {
    if (conn.room) { this.error(conn, 'BAD_MESSAGE'); return; }
    const room = this.rooms.get(normalizeCode(msg.code));
    const member = room?.members.find((m) => m && m.id === msg.id && !m.gone);
    if (!room || !member || typeof msg.token !== 'string' || !safeEqual(member.token, msg.token)) { this.error(conn, 'REJOIN_FAILED'); return; }
    if (member.conn && member.conn !== conn) { // the old socket is stale (phone woke up on a new connection)
      member.conn.member = null; member.conn.room = null;
      member.conn.ws.close(4000, 'replaced');
    }
    member.conn = conn; member.connected = true; member.disconnectedAt = 0;
    this.attach(conn, room, member);
    const isHost = member.role === ROLES.HOST;
    let notice = null;
    if (isHost) {
      room.hostDropAt = 0;
      if (room.state === 'playing' && !msg.resume) { // the host reloaded the page: the match it was simulating is gone
        room.state = 'lobby'; room.startInfo = null;
        room.members = room.members.filter((m) => m && !m.gone);
        this.reindex(room);
        notice = 'The host reloaded the page, so the match ended. Back in the lobby.';
        room.notice = notice;
        this.broadcastMembers(room, { t: 'ended', reason: 'host_reloaded', message: notice }, conn);
      }
      this.broadcastMembers(room, { t: 'host', connected: true });
    } else {
      this.toHost(room, { t: 'member', slot: member.slot, connected: true });
    }
    this.log(`room ${room.code}: ${member.name} rejoined`);
    this.send(conn, { t: 'joined', rejoined: true, code: room.code, type: room.type, you: this.youInfo(member), lobby: this.lobbyOf(room), start: room.state === 'playing' ? room.startInfo : null });
    this.broadcastLobby(room, conn);
  }

  onReady(conn, msg) {
    const { room, member } = conn;
    if (!room || !member) return;
    if (room.state !== 'lobby') return;
    member.ready = !!msg.ready;
    this.broadcastLobby(room);
  }

  onStart(conn) {
    const { room, member } = conn;
    if (!room || !member) return;
    if (member.role !== ROLES.HOST) { this.error(conn, 'NOT_HOST'); return; }
    const players = room.members.filter((m) => m && !m.gone);
    if (players.length < MIN_PLAYERS_TO_START) { this.error(conn, 'NEED_PLAYERS'); return; }
    if (players.some((m) => !m.connected)) { this.error(conn, 'PLAYER_OFFLINE'); return; }
    if (room.state === 'lobby' && players.some((m) => !m.ready)) { this.error(conn, 'NOT_READY'); return; }
    // Everybody present takes part; slots become 0..n-1 in join order (slot = fighter = colour).
    room.members = players;
    this.reindex(room);
    room.state = 'playing';
    room.notice = null;
    room.matchId++;
    room.startInfo = {
      t: 'start', matchId: room.matchId, type: room.type, count: players.length,
      players: players.map((m) => ({ id: m.id, slot: m.slot, name: m.name, role: m.role })),
    };
    this.log(`room ${room.code}: match ${room.matchId} starts with ${players.length} players`);
    this.broadcastMembers(room, room.startInfo);
    this.broadcastLobby(room);
  }

  onInput(conn, msg) {
    const { room, member } = conn;
    if (!room || !member || member.role === ROLES.HOST || room.state !== 'playing') return;
    const input = sanitizeInput(msg);
    if (!input) return;
    this.toHost(room, { t: 'in', slot: member.slot, ...input });
  }

  onStatus(conn, msg) {
    const { room, member } = conn;
    if (!room || member?.role !== ROLES.HOST || room.type !== ROOM_TYPES.CONTROLLERS) return;
    const out = JSON.stringify({ t: 'status', ph: msg.ph, hp: msg.hp, al: msg.al, w: msg.w });
    for (const m of room.members) if (m && m.role === ROLES.CONTROLLER && m.conn) this.send(m.conn, out);
  }

  onLeave(conn) {
    const { room, member } = conn;
    if (!room || !member) return;
    conn.room = null; conn.member = null; member.conn = null;
    if (member.role === ROLES.HOST) {
      this.closeRoom(room, 'host_left');
    } else {
      this.removeMember(room, member, 'left');
    }
  }

  // ------------------------------------------------------------------ rooms

  attach(conn, room, member) {
    conn.room = room; conn.member = member;
  }

  reindex(room) {
    room.members.forEach((m, i) => { if (m) m.slot = i; });
  }

  youInfo(m) { return { id: m.id, token: m.token, slot: m.slot, role: m.role, name: m.name }; }

  lobbyOf(room) {
    const host = room.members.find((m) => m && m.role === ROLES.HOST);
    return {
      t: 'lobby', code: room.code, type: room.type, state: room.state, notice: room.notice,
      hostConnected: !!host?.connected,
      members: room.members.filter((m) => m && !m.gone).map((m) => ({
        id: m.id, slot: m.slot, name: m.name, role: m.role, ready: m.ready, connected: m.connected, host: m.role === ROLES.HOST,
      })),
    };
  }

  broadcastLobby(room, except = null) {
    const lobby = JSON.stringify(this.lobbyOf(room));
    for (const m of room.members) if (m && m.conn && m.conn !== except) this.send(m.conn, lobby);
  }

  /** To every connected member (including the host) except `except`. */
  broadcastMembers(room, msg, except = null) {
    const text = JSON.stringify(msg);
    for (const m of room.members) if (m && m.conn && m.conn !== except) this.send(m.conn, text);
  }

  toHost(room, msg) {
    const host = room.members.find((m) => m && m.role === ROLES.HOST);
    if (host?.conn) this.send(host.conn, msg);
  }

  removeMember(room, member, reason) {
    if (room.state === 'playing') {
      member.gone = true; member.connected = false; // keep the slot so fighters keep their indices; the host forfeits them
      this.toHost(room, { t: 'gone', slot: member.slot, reason });
    } else {
      room.members = room.members.filter((m) => m !== member);
      this.reindex(room);
    }
    this.broadcastLobby(room);
    if (!room.members.some((m) => m && !m.gone && m.connected)) this.closeRoom(room, 'idle');
  }

  closeRoom(room, reason) {
    if (!this.rooms.delete(room.code)) return;
    this.log(`room ${room.code} closed (${reason})`);
    const msg = JSON.stringify({ t: 'closed', reason, message: CLOSE_REASONS[reason] ?? 'The room closed.' });
    for (const m of room.members) {
      if (m?.conn) { this.send(m.conn, msg); m.conn.room = null; m.conn.member = null; m.conn = null; }
    }
  }

  /** Periodic housekeeping: dead connections, grace periods, idle rooms. */
  sweep() {
    const now = Date.now();
    for (const conn of this.conns) {
      if (now - conn.lastSeen > this.timing.DEAD_AFTER_MS) conn.ws.terminate();
    }
    for (const room of [...this.rooms.values()]) {
      const host = room.members.find((m) => m && m.role === ROLES.HOST);
      if (host && !host.connected && now - host.disconnectedAt > this.timing.HOST_GRACE_MS) { this.closeRoom(room, 'host_timeout'); continue; }
      const grace = room.state === 'playing' ? this.timing.MATCH_GRACE_MS : this.timing.LOBBY_GRACE_MS;
      for (const m of [...room.members]) {
        if (m && m.role !== ROLES.HOST && !m.connected && !m.gone && now - m.disconnectedAt > grace) this.removeMember(room, m, 'timeout');
      }
      const anyone = room.members.some((m) => m && !m.gone && m.connected);
      if (!anyone && now - room.createdAt > this.timing.IDLE_ROOM_MS) this.closeRoom(room, 'idle');
    }
  }

  sendRtts() {
    for (const room of this.rooms.values()) {
      if (room.state !== 'playing') continue;
      const r = {};
      for (const m of room.members) if (m && !m.gone) r[m.slot] = m.rtt;
      this.toHost(room, { t: 'rtts', r });
    }
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
