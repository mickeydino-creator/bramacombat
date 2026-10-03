/*
 * Doodle Brawl multiplayer protocol - shared by the realtime server (server/) and the browser (src/net/).
 * Plain ES module, no dependencies, so Node and the browser import the very same file.
 *
 * Architecture in one paragraph: a small WebSocket server keeps ROOMS (lobby, player slots, ready flags, reconnect
 * tokens) and RELAYS messages. The gameplay itself is HOST-AUTHORITATIVE: the browser that created the room runs
 * the one and only simulation (the existing Game / Fighter / CombatSystem code, same rules for everybody) and
 * streams compact state snapshots (60/s) to the other players, who send their inputs back to the host. Rendering,
 * sounds and effects stay on each device. See docs/MULTIPLAYER.md.
 *
 * Wire format: JSON text frames, `{ t: <type>, ... }`.
 *
 *  client -> server
 *    create  { type: 'controllers'|'online', name, v }      make a room, you are the host (slot 0)
 *    join    { code, role: 'controller'|'player', name, v }
 *    rejoin  { code, id, token, resume }                      after a dropped connection / page reload
 *    ready   { ready }
 *    start   { }                                              host only: start (or restart) the match
 *    in      { sid, n, m, j, b, a }                           member -> host: input state (see sanitizeInput)
 *    snap    { f, ... }                                       host -> players: gameplay snapshot (relayed untouched)
 *    status  { ... }                                          host -> controllers: small status for the phone UI
 *    ping    { ts, rtt }
 *    leave   { }
 *
 *  server -> client
 *    joined  { code, type, you: {id, token, slot, role, name}, lobby, start?, rejoined? }
 *    lobby   { code, type, state, members: [...], hostConnected, notice? }
 *    start   { matchId, count, type, players: [{id, slot, name, role}] }
 *    in      { slot, sid, n, m, j, b, a }                     (to the host)
 *    snap / status                                            (relayed from the host)
 *    member  { slot, connected }                              (to the host: a member dropped / came back)
 *    gone    { slot, reason }                                 (to the host: a member left for good -> forfeit)
 *    host    { connected, graceMs }                           (to members: host dropped / came back)
 *    rtts    { r: { slot: ms } }                              (to the host: each member's latency to the server)
 *    closed  { reason }                                       the room no longer exists
 *    error   { code, message }
 *    pong    { ts }
 */
export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS_TO_START = 2;

export const ROOM_TYPES = Object.freeze({ CONTROLLERS: 'controllers', ONLINE: 'online' });
export const ROLES = Object.freeze({ HOST: 'host', CONTROLLER: 'controller', PLAYER: 'player' });

// Room codes: 4 characters, no look-alikes (no 0/O, 1/I/L), easy to read out loud.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
export const normalizeCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
export const isValidCode = (s) => typeof s === 'string' && s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c));

export const ACTIONS = Object.freeze(['punch', 'kick', 'strong']); // 'strong' = the strong attack, which is the special ability
export const MAX_NAME_LENGTH = 10;
export const sanitizeName = (s, fallback) => {
  const clean = String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, MAX_NAME_LENGTH);
  return clean || fallback;
};

// Timings (ms) - the server enforces them, the UI shows them.
export const TIMING = Object.freeze({
  HEARTBEAT_MS: 3000, // client ping interval
  DEAD_AFTER_MS: 15000, // server drops a connection that sent nothing for this long
  LOBBY_GRACE_MS: 30000, // a dropped member keeps its slot this long in the lobby
  MATCH_GRACE_MS: 20000, // ...and this long during a match, then it forfeits
  HOST_GRACE_MS: 30000, // the room waits this long for a dropped host, then closes
  IDLE_ROOM_MS: 10 * 60 * 1000,
});

/** Machine-readable error codes with the messages players see. */
export const ERRORS = Object.freeze({
  INVALID_CODE: 'That room code does not look right. Room codes have 4 letters or numbers.',
  ROOM_NOT_FOUND: 'Room not found. Check the code and try again.',
  ROOM_FULL: 'This room is full (4 players maximum).',
  GAME_IN_PROGRESS: 'This match has already started. Ask the host to start a new one.',
  WRONG_ROOM_TYPE: 'This room uses a different join method. Use the right option in VS FRIENDS.',
  REJOIN_FAILED: 'Could not rejoin the room. It may have closed.',
  NOT_HOST: 'Only the host can do that.',
  NEED_PLAYERS: 'At least 2 players are needed to start.',
  NOT_READY: 'Waiting for everyone to be ready.',
  PLAYER_OFFLINE: 'A player is reconnecting. Wait for them or let them go.',
  BAD_MESSAGE: 'The server did not understand that message.',
  RATE_LIMIT: 'Too many messages. Slow down.',
  VERSION: 'This game version is out of date. Reload the page.',
  SERVER_BUSY: 'The server is busy right now. Try again in a moment.',
  TIMEOUT: 'The server did not answer in time. Check your connection.',
  CONNECTION_FAILED: 'Could not reach the game server. Check your connection and try again.',
  CONNECTION_LOST: 'Connection lost.',
});
export const errorMessage = (code) => ERRORS[code] ?? 'Something went wrong.';

export const CLOSE_REASONS = Object.freeze({
  host_left: 'The host left the room.',
  host_timeout: 'The host lost connection and did not come back.',
  idle: 'The room closed because nobody was there.',
  server_shutdown: 'The server is restarting.',
});

/**
 * Validate / normalise an input message from a player. Returns null when it is garbage.
 *   sid  random id of the sender's page load (lets the host reset its duplicate filter after a reload)
 *   n    increasing message counter: the host ignores anything not newer than the last one (no duplicates)
 *   m    move -1 | 0 | 1       j  jump held 0|1      b  block held 0|1
 *   a    actions pressed since the previous message: ['punch'|'kick'|'strong', ...] (each tap is processed once)
 */
export function sanitizeInput(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const n = Number(msg.n);
  if (!Number.isFinite(n) || n < 0) return null;
  const a = Array.isArray(msg.a) ? msg.a.filter((x) => ACTIONS.includes(x)).slice(0, 4) : [];
  return {
    sid: String(msg.sid ?? '').slice(0, 16),
    n,
    m: msg.m < 0 ? -1 : msg.m > 0 ? 1 : 0,
    j: msg.j ? 1 : 0,
    b: msg.b ? 1 : 0,
    a,
  };
}
