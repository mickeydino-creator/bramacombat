// Run with:  npm test   (node --test)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { attachRoomServer } from '../attach.js';
import { PROTOCOL_VERSION } from '../../shared/protocol.js';

async function boot(timing = {}) {
  const server = http.createServer();
  const rooms = attachRoomServer(server, { timing });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  return { server, rooms, url, stop: () => { rooms.close(); server.close(); } };
}

class C {
  constructor(url) {
    this.msgs = []; this.waiters = [];
    this.ws = new WebSocket(url);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m); else this.msgs.push(m);
    });
    this.opened = new Promise((r) => this.ws.on('open', r));
  }
  send(m) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  next(type, ms = 1500) {
    const pred = (m) => m.t === type;
    const i = this.msgs.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.msgs.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => { const k = this.waiters.indexOf(w); if (k >= 0) { this.waiters.splice(k, 1); reject(new Error(`timeout waiting for ${type}`)); } }, ms);
    });
  }
  async none(type, ms = 150) { await new Promise((r) => setTimeout(r, ms)); assert.equal(this.msgs.find((m) => m.t === type), undefined, `unexpected ${type}`); }
  close() { this.ws.close(); }
}
const connect = async (url) => { const c = new C(url); await c.opened; return c; };
const mkRoom = async (url, type = 'online') => {
  const h = await connect(url);
  h.send({ t: 'create', type, name: 'Host', v: PROTOCOL_VERSION });
  const joined = await h.next('joined');
  return { h, joined };
};
const joinRoom = async (url, code, role = 'player', name = 'Friend') => {
  const c = await connect(url);
  c.send({ t: 'join', code, role, name, v: PROTOCOL_VERSION });
  return c;
};

test('create + join + lobby, slots and colours by join order', async () => {
  const s = await boot();
  try {
    const { h, joined } = await mkRoom(s.url);
    assert.match(joined.code, /^[A-HJ-KM-NP-Z2-9]{4}$/);
    assert.equal(joined.you.slot, 0); assert.equal(joined.you.role, 'host');
    const a = await joinRoom(s.url, joined.code);
    const ja = await a.next('joined');
    assert.equal(ja.you.slot, 1);
    const lobby = await h.next('lobby');
    assert.equal(lobby.members.length, 2);
    assert.deepEqual(lobby.members.map((m) => m.slot), [0, 1]);
  } finally { s.stop(); }
});

test('errors: invalid code, room not found, wrong room type, full room', async () => {
  const s = await boot();
  try {
    const bad = await joinRoom(s.url, 'A');
    assert.equal((await bad.next('error')).code, 'INVALID_CODE');
    const nf = await joinRoom(s.url, 'ZZZZ');
    assert.equal((await nf.next('error')).code, 'ROOM_NOT_FOUND');
    const { joined } = await mkRoom(s.url, 'online');
    const wrong = await joinRoom(s.url, joined.code, 'controller');
    assert.equal((await wrong.next('error')).code, 'WRONG_ROOM_TYPE');
    for (let i = 0; i < 3; i++) { const p = await joinRoom(s.url, joined.code); await p.next('joined'); }
    const extra = await joinRoom(s.url, joined.code);
    assert.equal((await extra.next('error')).code, 'ROOM_FULL');
  } finally { s.stop(); }
});

test('start rules: host only, needs 2+, everybody ready; start info compacts slots', async () => {
  const s = await boot();
  try {
    const { h, joined } = await mkRoom(s.url);
    h.send({ t: 'start' });
    assert.equal((await h.next('error')).code, 'NEED_PLAYERS');
    const a = await joinRoom(s.url, joined.code); const ja = await a.next('joined');
    const b = await joinRoom(s.url, joined.code); await b.next('joined');
    a.send({ t: 'start' });
    assert.equal((await a.next('error')).code, 'NOT_HOST');
    b.send({ t: 'ready', ready: false });
    await h.next('lobby');
    h.send({ t: 'start' });
    assert.equal((await h.next('error')).code, 'NOT_READY');
    b.send({ t: 'ready', ready: true });
    await new Promise((r) => setTimeout(r, 100));
    h.send({ t: 'start' });
    const st = await a.next('start');
    assert.equal(st.count, 3);
    assert.deepEqual(st.players.map((p) => p.slot), [0, 1, 2]);
    const late = await joinRoom(s.url, joined.code);
    assert.equal((await late.next('error')).code, 'GAME_IN_PROGRESS');
    assert.ok(ja.you.id);
  } finally { s.stop(); }
});

test('inputs go to the host only, with the sender slot; garbage is sanitised; snapshots reach players untouched', async () => {
  const s = await boot();
  try {
    const { h, joined } = await mkRoom(s.url);
    const a = await joinRoom(s.url, joined.code); await a.next('joined');
    const b = await joinRoom(s.url, joined.code); await b.next('joined');
    h.send({ t: 'start' }); await a.next('start'); await b.next('start');
    a.send({ t: 'in', sid: 'x', n: 5, m: 7, j: 1, b: 0, a: ['punch', 'hack', 'strong'] });
    const got = await h.next('in');
    assert.equal(got.slot, 1); assert.equal(got.m, 1); assert.deepEqual(got.a, ['punch', 'strong']);
    await b.none('in');
    a.send({ t: 'in', n: -3 }); a.send('not json');
    assert.equal((await a.next('error')).code, 'BAD_MESSAGE');
    const snap = JSON.stringify({ t: 'snap', f: 9, fs: [[1, 2]] });
    h.send(snap);
    assert.equal(JSON.stringify(await a.next('snap')), snap);
    assert.equal(JSON.stringify(await b.next('snap')), snap);
    a.send(JSON.stringify({ t: 'snap', f: 1 })); // a non-host cannot inject snapshots
    await b.none('snap');
  } finally { s.stop(); }
});

test('reconnect: rejoin with the token restores the slot, replaces a stale socket; wrong token fails', async () => {
  const s = await boot({ LOBBY_GRACE_MS: 400, MATCH_GRACE_MS: 400 });
  try {
    const { h, joined } = await mkRoom(s.url);
    const a = await joinRoom(s.url, joined.code); const ja = await a.next('joined');
    h.send({ t: 'start' }); await a.next('start');
    a.close();
    assert.deepEqual(await h.next('member'), { t: 'member', slot: 1, connected: false });
    const a2 = await connect(s.url);
    a2.send({ t: 'rejoin', code: joined.code, id: ja.you.id, token: 'nope' });
    assert.equal((await a2.next('error')).code, 'REJOIN_FAILED');
    const a3 = await connect(s.url);
    a3.send({ t: 'rejoin', code: joined.code, id: ja.you.id, token: ja.you.token });
    const back = await a3.next('joined');
    assert.equal(back.rejoined, true); assert.equal(back.you.slot, 1); assert.equal(back.start.count, 2);
    assert.deepEqual(await h.next('member'), { t: 'member', slot: 1, connected: true });
    // inputs flow again on the new socket
    a3.send({ t: 'in', sid: 's', n: 1, m: -1, j: 0, b: 0, a: [] });
    assert.equal((await h.next('in')).m, -1);
  } finally { s.stop(); }
});

test('a member that stays away past the grace period is reported gone (forfeit); explicit leave is immediate', async () => {
  const s = await boot({ MATCH_GRACE_MS: 300 });
  try {
    const { h, joined } = await mkRoom(s.url);
    const a = await joinRoom(s.url, joined.code); await a.next('joined');
    const b = await joinRoom(s.url, joined.code); await b.next('joined');
    h.send({ t: 'start' }); await a.next('start');
    a.close();
    await h.next('member');
    const gone = await h.next('gone', 4000);
    assert.equal(gone.slot, 1); assert.equal(gone.reason, 'timeout');
    b.send({ t: 'leave' });
    assert.equal((await h.next('gone')).reason, 'left');
  } finally { s.stop(); }
});

test('host leaving closes the room; a dropped host gets a grace period, then the room closes', async () => {
  const s = await boot({ HOST_GRACE_MS: 300 });
  try {
    const r1 = await mkRoom(s.url);
    const a = await joinRoom(s.url, r1.joined.code); await a.next('joined');
    r1.h.send({ t: 'leave' });
    assert.equal((await a.next('closed')).reason, 'host_left');
    const r2 = await mkRoom(s.url);
    const b = await joinRoom(s.url, r2.joined.code); await b.next('joined');
    r2.h.close();
    const dropped = await b.next('host');
    assert.equal(dropped.connected, false);
    assert.equal((await b.next('closed', 4000)).reason, 'host_timeout');
    const gone = await joinRoom(s.url, r2.joined.code);
    assert.equal((await gone.next('error')).code, 'ROOM_NOT_FOUND');
  } finally { s.stop(); }
});

test('host reload during a match returns everybody to the lobby; resume keeps the match', async () => {
  const s = await boot();
  try {
    const { h, joined } = await mkRoom(s.url);
    const a = await joinRoom(s.url, joined.code); await a.next('joined');
    h.send({ t: 'start' }); await a.next('start');
    h.close(); await a.next('host');
    const h2 = await connect(s.url);
    h2.send({ t: 'rejoin', code: joined.code, id: joined.you.id, token: joined.you.token, resume: true });
    const ok = await h2.next('joined');
    assert.equal(ok.lobby.state, 'playing');
    h2.close(); await a.next('host');
    const h3 = await connect(s.url);
    h3.send({ t: 'rejoin', code: joined.code, id: joined.you.id, token: joined.you.token, resume: false });
    const reset = await h3.next('joined');
    assert.equal(reset.lobby.state, 'lobby');
    assert.equal((await a.next('ended')).reason, 'host_reloaded');
  } finally { s.stop(); }
});

test('controllers rooms: phones join as controllers and get host status; only the host sends it', async () => {
  const s = await boot();
  try {
    const { h, joined } = await mkRoom(s.url, 'controllers');
    const p = await joinRoom(s.url, joined.code, 'controller'); await p.next('joined');
    h.send({ t: 'start' }); await p.next('start');
    h.send({ t: 'status', ph: 'fight', hp: [100, 80], al: [1, 1], w: -1 });
    assert.equal((await p.next('status')).hp[1], 80);
    p.send({ t: 'status', ph: 'x' });
    await h.none('status');
    p.send({ t: 'in', sid: 'q', n: 1, m: 1, j: 0, b: 1, a: ['kick'] });
    const got = await h.next('in'); assert.equal(got.b, 1); assert.deepEqual(got.a, ['kick']);
  } finally { s.stop(); }
});

test('version mismatch and ping/pong', async () => {
  const s = await boot();
  try {
    const c = await connect(s.url);
    c.send({ t: 'create', type: 'online', v: 999 });
    assert.equal((await c.next('error')).code, 'VERSION');
    c.send({ t: 'ping', ts: 42 });
    assert.equal((await c.next('pong')).ts, 42);
  } finally { s.stop(); }
});
