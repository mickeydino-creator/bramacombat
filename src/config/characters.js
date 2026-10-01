import { DEFAULT_SPECIALS } from '../abilities/specials.js';

/*
 * CHARACTER CONFIGURATION
 * =======================
 * Every fighter is plain data. To add a new fighter, add an entry to CHARACTERS using
 * `defineFighter({...})`: you only list what differs from BASE_FIGHTER below.
 * Nothing in the combat / AI / input code needs to change.
 *
 *   name              shown on the HUD
 *   maxHealth
 *   walkSpeed         units / second
 *   jumpHeight        units (jump strength)
 *   damageMultiplier  scales all of this fighter's attack damage
 *   attackSpeed       >1 = faster startup/recovery on all attacks, <1 = slower
 *   stamina           { max, regenPerSecond } - shared by special abilities AND blocking
 *   moves             normal attacks (frame data below); override single values with
 *                     moves: { punch: { damage: 7 } }
 *   specials          special abilities. Everyone shares DEFAULT_SPECIALS (src/abilities/specials.js) so the
 *                     player and AI have the exact same ability; define new ones there, not per fighter.
 *   appearance        the 3D model, see "APPEARANCE" below
 *
 * MOVE FRAME DATA (frames @ 60fps):
 *   startup / active / recovery   before the hitbox / hitbox live / after it
 *   cooldown   extra frames before this move can be used again
 *   hitstun    frames the victim can't act;  hitstop: freeze frames on impact
 *   damage     health removed;  knockback: { x: push speed, y: launch speed }
 *   hitbox     { x: forward distance, y: height of center, w, h }
 *   lunge      forward speed when the attack becomes active;  shake: camera shake on hit
 *   anim       animation to play (punch, kick, strong, special, ...)
 *
 * SPECIALS: defined once in src/abilities/specials.js (staminaCost, cooldown, frame data).
 * Stamina/cooldown rules live in src/abilities/SpecialAbilities.js and apply equally to player and AI.
 *
 * APPEARANCE (src/models/createModel.js):
 *   type: 'stickman'  url, height, colors: { body, emissive }, face, accessories
 *        face:        { texture: '/faces/name.png' } or generated { eyes, brows, mouth: 'grin'|'flat'|'frown' }
 *                     (see src/models/stickman/face.js)
 *        accessories: [{ type: 'headband'|'belt'|'wristbands'|'custom', color, ... }]
 *                     (see src/models/stickman/accessories.js)
 *   type: 'gltf'      url, scale, clips - any model with its own animation clips (GltfModel.js)
 *   type: 'placeholder' color, accent, skin - primitive shapes (PlaceholderModel.js)
 *
 * Put model files in public/models/ and face images in public/faces/.
 *
 * BALANCE INTENT: normal attacks are the main damage source, blocking is a defensive
 * tool (it costs stamina and lets some damage through), specials are a limited opportunity.
 */

const BASE_MOVES = {
  punch: {
    anim: 'punch',
    startup: 5, active: 3, recovery: 9, cooldown: 2,
    damage: 6,
    hitbox: { x: 0.8, y: 1.4, w: 0.75, h: 0.4 },
    knockback: { x: 3.5, y: 0 },
    hitstun: 15, hitstop: 4, lunge: 1.0,
  },
  kick: {
    anim: 'kick',
    startup: 9, active: 4, recovery: 15, cooldown: 6,
    damage: 9,
    hitbox: { x: 1.0, y: 0.85, w: 0.95, h: 0.5 },
    knockback: { x: 5.5, y: 2.5 },
    hitstun: 19, hitstop: 6, lunge: 1.5,
  },
  strong: {
    anim: 'strong',
    startup: 17, active: 5, recovery: 24, cooldown: 35,
    damage: 14,
    hitbox: { x: 1.0, y: 1.15, w: 1.1, h: 1.0 },
    knockback: { x: 8.5, y: 6.5 },
    hitstun: 30, hitstop: 10, lunge: 4.5, shake: 0.3,
  },
};

/** Defaults every fighter starts from. */
export const BASE_FIGHTER = {
  name: 'FIGHTER',
  maxHealth: 100,
  walkSpeed: 4.0,
  jumpHeight: 2.2,
  damageMultiplier: 1.0,
  attackSpeed: 1.0,
  stamina: { max: 100, regenPerSecond: 6 }, // shared by everyone: 0 -> full in ~17s
  moves: BASE_MOVES,
  specials: DEFAULT_SPECIALS, // same object for every fighter
  appearance: {
    type: 'stickman',
    url: '/models/stickman.glb',
    height: 1.9,
    colors: { body: 0x1b1b1f },
    face: { eyes: 0x111111, brows: true, mouth: 'flat' },
    accessories: [],
  },
};

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = isPlainObject(v) && isPlainObject(base[k]) ? merge(base[k], v) : v;
  return out;
}

/** Create a fighter definition from partial data (deep-merged over BASE_FIGHTER). */
export function defineFighter(data) {
  return merge(BASE_FIGHTER, data);
}

export const CHARACTERS = {
  ember: defineFighter({
    name: 'EMBER',
    walkSpeed: 4.2,
    jumpHeight: 2.3,
    appearance: {
      colors: { body: 0xc8401e, emissive: 0x2a0800 },
      face: { eyes: 0x111111, brows: true, mouth: 'grin' },
      accessories: [{ type: 'headband', color: 0xffd23f }, { type: 'wristbands', color: 0xffd23f }],
    },
  }),

  volt: defineFighter({
    name: 'VOLT',
    walkSpeed: 3.8,
    jumpHeight: 2.1,
    damageMultiplier: 1.05,
    attackSpeed: 0.95,
    appearance: {
      colors: { body: 0x1f5fc8, emissive: 0x000a22 },
      face: { eyes: 0x0a0a0a, brows: true, mouth: 'frown' },
      accessories: [{ type: 'headband', color: 0x7cf2ff, tails: false }, { type: 'belt', color: 0x7cf2ff }],
    },
  }),
};

/*
 * TEMPLATE - copy, rename, and add to CHARACTERS:
 *
 *   shade: defineFighter({
 *     name: 'SHADE',
 *     maxHealth: 90, walkSpeed: 4.6, jumpHeight: 2.5, damageMultiplier: 0.95, attackSpeed: 1.1,
 *     moves: { kick: { damage: 10 } },
 *     // specials: shared by default; to change everyone's special, edit src/abilities/specials.js
 *     appearance: { url: '/models/stickman.glb', colors: { body: 0x333333 }, face: { texture: '/faces/shade.png' } },
 *   }),
 *
 * Then pick who fights in src/core/Game.js (CHARACTERS.ember / CHARACTERS.volt).
 */
