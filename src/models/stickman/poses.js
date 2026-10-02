/*
 * Procedural stickman poses. Edit these to change how fighters look while doing things.
 *
 * Character space: the fighter faces +Z, +X is the fighter's LEFT side, +Y is up.
 *   lArm/rArm, lFore/rFore     upper arm / forearm direction, relative to the chest
 *   lThigh/rThigh, lShin/rShin thigh / shin direction, relative to the hips
 *   spine, head, hips           euler rotations {x, y, z} (spine.x > 0 leans forward)
 *   fall                        whole-body tilt backward (KO), lift: raise body while lying
 *   bounce                      extra vertical offset in world units
 * Directions don't need to be normalized. Feet are kept on the ground automatically.
 *
 * The left side is the lead side (closer to the opponent after the fighter turns).
 * Animation names come from Fighter.animState.
 */

const mirror = ([x, y, z]) => [-x, y, z];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ease = (t) => t * t * (3 - 2 * t);

/** Blend two poses (attack phase transitions). */
function mix(a, b, t) {
  const out = {};
  for (const k in a) {
    const va = a[k], vb = b[k] ?? va;
    if (Array.isArray(va)) out[k] = lerpV(va, vb, t);
    else if (typeof va === 'object') out[k] = { x: lerp(va.x, vb.x, t), y: lerp(va.y, vb.y, t), z: lerp(va.z, vb.z, t) };
    else out[k] = lerp(va, vb, t);
  }
  return out;
}

const e = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const NEUTRAL_POSE = {
  lArm: [0.2, -1, 0], lFore: [0.2, -1, 0], rArm: [-0.2, -1, 0], rFore: [-0.2, -1, 0],
  lThigh: [0.1, -1, 0], lShin: [0.1, -1, 0], rThigh: [-0.1, -1, 0], rShin: [-0.1, -1, 0],
  spine: e(), head: e(), hips: e(), fall: 0, lift: 0, bounce: 0,
};

// Fighting stance: fists up, lead leg forward, knees soft.
const GUARD = {
  ...NEUTRAL_POSE,
  lArm: [0.35, -0.7, 0.6], lFore: [-0.3, 0.85, 0.5],
  rArm: [-0.45, -0.75, 0.35], rFore: [0.3, 0.9, 0.45],
  lThigh: [0.15, -0.95, 0.35], lShin: [0.08, -1, -0.05],
  rThigh: [-0.15, -0.95, -0.3], rShin: [-0.08, -1, -0.35],
  spine: e(0.12, 0.25, 0), head: e(-0.05, -0.2, 0),
};

function walk(t, speed, amp, lean) {
  const s = Math.sin(t * speed);
  const c = Math.cos(t * speed);
  const a = s * amp;
  const knee = (v) => 0.25 + Math.max(0, v) * 0.7;
  return {
    ...GUARD,
    lThigh: [0.12, -Math.cos(a), Math.sin(a) + 0.1], lShin: [0.06, -Math.cos(a - knee(c)), Math.sin(a - knee(c))],
    rThigh: [-0.12, -Math.cos(-a), Math.sin(-a) - 0.1], rShin: [-0.06, -Math.cos(-a - knee(-c)), Math.sin(-a - knee(-c))],
    spine: e(GUARD.spine.x + lean, GUARD.spine.y, s * 0.05),
    lArm: [0.35, -0.7, 0.6 - s * amp * 0.3], rArm: [-0.45, -0.75, 0.35 + s * amp * 0.3],
    bounce: Math.abs(c) * 0.03 * amp,
  };
}

const POSES = {
  idle: (f) => ({ ...GUARD, bounce: Math.sin(f.time * 4) * 0.012, spine: e(0.12 + Math.sin(f.time * 4) * 0.02, 0.25, 0) }),
  walk: (f) => walk(f.time, 10, 0.45, 0),
  run: (f) => ({
    ...walk(f.time, 15, 0.85, 0.3),
    lArm: [0.25, -0.5 + Math.sin(f.time * 15) * 0.6, 0.6], lFore: [0, 0.6, 0.8],
    rArm: [-0.25, -0.5 - Math.sin(f.time * 15) * 0.6, 0.6], rFore: [0, 0.6, 0.8],
  }),
  jump: () => ({
    ...GUARD,
    lThigh: [0.1, -0.35, 1], lShin: [0.05, -1, 0.1], rThigh: [-0.1, -0.6, 0.8], rShin: [-0.05, -1, -0.2],
    lArm: [0.5, -0.2, 0.6], rArm: [-0.5, -0.2, 0.5], spine: e(0.25, 0.2, 0),
  }),
  fall: () => ({
    ...GUARD,
    lThigh: [0.15, -0.9, 0.4], lShin: [0.05, -1, 0], rThigh: [-0.15, -0.95, -0.1], rShin: [-0.05, -1, -0.2],
    lArm: [0.9, 0.2, 0.3], lFore: [0.6, 0.7, 0.3], rArm: [-0.9, 0.2, 0.2], rFore: [-0.6, 0.7, 0.3], spine: e(0.05, 0.1, 0),
  }),
  land: () => ({
    ...GUARD,
    lThigh: [0.2, -0.6, 0.8], lShin: [0.05, -1, -0.25], rThigh: [-0.2, -0.65, 0.5], rShin: [-0.05, -0.9, -0.5],
    spine: e(0.4, 0.2, 0),
  }),

  punch: (f) => attack(f, {
    startup: { ...GUARD, lArm: [0.4, -0.6, 0.2], lFore: [-0.2, 0.6, 0.8], spine: e(0.1, 0.45, 0) },
    active: {
      ...GUARD, lArm: [0.05, 0.1, 1], lFore: [0, 0.1, 1], spine: e(0.25, -0.35, 0), head: e(0, 0.2, 0),
      lThigh: [0.15, -0.85, 0.55], rThigh: [-0.15, -0.9, -0.45],
    },
  }),
  kick: (f) => attack(f, {
    startup: { ...GUARD, lThigh: [0.1, -0.2, 1], lShin: [0.05, -1, 0.15], spine: e(-0.1, 0.2, 0) },
    active: {
      ...GUARD, lThigh: [0.05, 0.15, 1], lShin: [0, 0.2, 1], rThigh: [-0.1, -1, -0.1], rShin: [-0.05, -1, -0.2],
      spine: e(-0.35, 0.1, 0), lArm: [0.7, -0.3, -0.4], rArm: [-0.6, -0.2, 0.5],
    },
  }),
  strong: (f) => attack(f, {
    startup: {
      ...GUARD, lArm: [0.25, 1, -0.3], lFore: [0.1, 0.5, -0.9], rArm: [-0.25, 1, -0.3], rFore: [-0.1, 0.5, -0.9],
      spine: e(-0.35, 0, 0), head: e(-0.2, 0, 0),
    },
    active: {
      ...GUARD, lArm: [0.2, -0.1, 1], lFore: [0.05, -0.55, 0.85], rArm: [-0.2, -0.1, 1], rFore: [-0.05, -0.55, 0.85],
      spine: e(0.6, 0, 0), lThigh: [0.15, -0.6, 0.8], lShin: [0.05, -1, -0.1], rThigh: [-0.15, -0.85, -0.5],
    },
  }),
  special: (f) => attack(f, {
    // Charge: crouch, both hands drawn back to the hip. Release: double palm thrust with a lunge.
    startup: {
      ...GUARD, lArm: [0.5, -0.6, -0.6], lFore: [0, 0.3, 1], rArm: [-0.5, -0.6, -0.6], rFore: [0, 0.3, 1],
      lThigh: [0.2, -0.6, 0.75], lShin: [0.05, -1, -0.3], rThigh: [-0.2, -0.7, -0.4], rShin: [-0.05, -0.8, -0.6],
      spine: e(0.25, 0.6, 0), bounce: -0.05,
    },
    active: {
      ...GUARD, lArm: [0.15, 0.05, 1], lFore: [0.05, 0.05, 1], rArm: [-0.15, 0.0, 1], rFore: [-0.05, 0.0, 1],
      lThigh: [0.15, -0.55, 0.85], lShin: [0.05, -1, -0.1], rThigh: [-0.15, -0.75, -0.65], rShin: [-0.05, -0.5, -0.9],
      spine: e(0.35, 0, 0), head: e(0.1, 0, 0),
    },
  }),

  hit: () => ({
    ...GUARD, spine: e(-0.55, -0.2, 0.1), head: e(-0.4, 0, 0),
    lArm: [0.8, 0.1, -0.4], lFore: [0.5, 0.7, -0.3], rArm: [-0.8, 0, -0.3], rFore: [-0.5, 0.6, -0.3],
    lThigh: [0.15, -1, 0.1], rThigh: [-0.15, -0.9, -0.4],
  }),
  block: () => ({
    ...GUARD,
    // Forearms crossed in front of the face.
    lArm: [0.4, -0.35, 0.85], lFore: [-0.8, 0.55, 0.2], rArm: [-0.4, -0.3, 0.85], rFore: [0.8, 0.65, 0.15],
    spine: e(0.25, 0.05, 0), head: e(0.15, 0, 0),
    lThigh: [0.2, -0.85, 0.5], lShin: [0.05, -1, -0.2], rThigh: [-0.2, -0.85, -0.4], rShin: [-0.05, -0.9, -0.5],
  }),
  victory: (f) => {
    const b = Math.abs(Math.sin(f.time * 6));
    return {
      ...NEUTRAL_POSE,
      lArm: [0.6, 0.85, 0.1], lFore: [0.4, 1, 0], rArm: [-0.6, 0.85, 0.1], rFore: [-0.4, 1, 0],
      lThigh: [0.2, -1, 0], rThigh: [-0.2, -1, 0], lShin: [0.1, -1, 0], rShin: [-0.1, -1, 0],
      head: e(-0.2, 0, 0), bounce: b * 0.12,
    };
  },
  // 4th place when the hole opens under them: frozen stiff, staring down, hands up, trembling.
  startled: (f) => {
    const sh = Math.sin(f.time * 38);
    return {
      ...NEUTRAL_POSE,
      lArm: [0.55, 0.5, 0.25], lFore: [0.25, 0.95, 0.2], rArm: [-0.55, 0.5, 0.25], rFore: [-0.25, 0.95, 0.2],
      lThigh: [0.15, -1, 0.1], rThigh: [-0.15, -1, 0.1], lShin: [0.05, -1, 0],
      head: e(0.6, 0, 0), spine: e(-0.12, 0, sh * 0.05), bounce: sh * 0.012,
    };
  },
  // Falling through the hole: arms windmilling, legs pedalling, head thrown back.
  plunge: (f) => {
    const s = Math.sin(f.time * 17), c = Math.cos(f.time * 17);
    return {
      ...NEUTRAL_POSE,
      lArm: [0.5 + s * 0.35, 1, 0.3 + c * 0.2], lFore: [0.25, 1, c * 0.6], rArm: [-0.5 - s * 0.35, 1, 0.3 - c * 0.2], rFore: [-0.25, 1, -c * 0.6],
      lThigh: [0.25, -0.75, 0.55 + s * 0.45], lShin: [0.1, -0.95, -0.45 + c * 0.2], rThigh: [-0.25, -0.75, -0.55 - s * 0.45], rShin: [-0.1, -0.95, 0.45 - c * 0.2],
      head: e(-0.4, 0, 0), spine: e(-0.18, 0, s * 0.14),
    };
  },
  // Runner-up on the podium: standing, shoulders slumped, head down, arms hanging.
  defeat: (f) => ({
    ...NEUTRAL_POSE,
    lArm: [0.15, -1, 0.1], lFore: [0.1, -1, 0.1], rArm: [-0.15, -1, 0.1], rFore: [-0.1, -1, 0.1],
    lThigh: [0.1, -1, 0], rThigh: [-0.1, -1, 0], lShin: [0.05, -1, 0], rShin: [-0.05, -1, 0],
    spine: e(0.28, 0, Math.sin(f.time * 1.5) * 0.02), head: e(0.45, 0, 0), bounce: Math.sin(f.time * 1.5) * 0.006,
  }),
  // Defeat: knocked flat on the back, limbs sprawled.
  ko: () => ({
    ...NEUTRAL_POSE, fall: -Math.PI / 2, lift: 0.12,
    lArm: [1, 0.3, 0], lFore: [1, 0.5, 0], rArm: [-1, 0.2, 0], rFore: [-1, 0.4, 0],
    lThigh: [0.3, -1, 0.1], lShin: [0.3, -1, 0], rThigh: [-0.25, -1, 0], rShin: [-0.2, -1, -0.2],
    head: e(-0.3, 0.5, 0),
  }),
};

/** startup: lerp guard -> windup; active: strike; recovery: strike -> guard. */
function attack(f, { startup, active }) {
  const k = ease(Math.min(1, f.attackPhaseProgress));
  switch (f.attackPhase) {
    case 'startup': return mix(GUARD, startup, k);
    case 'active': return active;
    default: return mix(active, GUARD, k);
  }
}

export function stickmanPose(f) {
  const fn = POSES[f.animState] || POSES.idle;
  return fn(f);
}
