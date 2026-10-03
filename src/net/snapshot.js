import { ACTIONS } from '../../shared/protocol.js';

/*
 * Compact gameplay snapshot: the host's authoritative state, sent 60 times a second to online players.
 *
 * Only what the other screens need to DRAW the match is included (no meshes, no textures, no effects):
 * where each fighter is, what it is doing (state + attack frame), its health / stamina / special meter, and the
 * match flow (phase, round wins, winner). One-shot happenings (an attack starts, a hit lands, a sound cue) travel
 * separately as events inside the snapshot that produced them, so every client plays them exactly once.
 *
 *   { t:'snap', f: frame, ph: phase, pf: phaseFrame, w: winner|-1, wn: [round wins], rd: round,
 *     dn: [knock-out order], ho: hole 0..1, fs: [fighter arrays], ev: [events] }
 */
export const PHASES = ['menu', 'intro', 'fight', 'ko', 'roundend', 'podium', 'over', 'paused'];
const STATES = ['idle', 'walk', 'air', 'attack', 'hitstun', 'blockstun', 'ko', 'victory', 'defeat', 'startled', 'plunge'];

const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;

export function encodeFighter(f, disconnected = false) {
  const flags = (f.blocking ? 1 : 0) | (f.guardBroken ? 2 : 0) | (f.model.root.visible ? 4 : 0) | (f.yawOverride != null ? 8 : 0) | (disconnected ? 16 : 0);
  return [
    r3(f.x), r3(f.y), r1(f.vy), f.facing, Math.max(0, STATES.indexOf(f.state)), flags,
    f.attack ? ACTIONS.indexOf(f.attack.name) : -1, f.attack ? f.attack.frame : 0,
    f.landFrames, f.runFrames, f.health, r1(f.stamina.value), f.specials.chargeFrames,
    f.yawOverride != null ? r3(f.yawOverride) : 0, f.hitstun,
  ];
}

/** Write a received fighter array into a (non-simulating) Fighter object. */
export function applyFighter(f, a) {
  f.x = a[0]; f.y = a[1]; f.vy = a[2]; f.vx = 0; f.facing = a[3];
  f.state = STATES[a[4]] ?? 'idle';
  const flags = a[5];
  f.blocking = !!(flags & 1); f.guardBroken = !!(flags & 2);
  f.model.root.visible = !!(flags & 4);
  f.yawOverride = flags & 8 ? a[13] : null;
  f.disconnected = !!(flags & 16);
  f.landFrames = a[8]; f.runFrames = a[9];
  f.health = a[10]; f.stamina.value = a[11]; f.specials.chargeFrames = a[12]; f.hitstun = a[14];
  const name = ACTIONS[a[6]];
  if (name) {
    const move = f.specials.has(name) ? f.specials.getMove(name) : f.def.moves[name];
    f.attack = { name, move, frame: a[7], hasHit: false, startup: f.moveFrames(move, move.startup), active: f.moveFrames(move, move.active), recovery: f.moveFrames(move, move.recovery) };
  } else f.attack = null;
  if (f.state === 'attack' && !f.attack) f.state = 'idle';
}

export const actionIndex = (name) => ACTIONS.indexOf(name);
export const actionName = (i) => ACTIONS[i];
