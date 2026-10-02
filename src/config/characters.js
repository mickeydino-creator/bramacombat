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
 *   stamina           { max, regenPerSecond } - used by blocking (specials have their own meter)
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
 * SPECIALS: defined once in src/abilities/specials.js (frame data + the shared SPECIAL METER:
 * full -> usable, use -> empty, refills in 5s). Rules: src/abilities/SpecialAbilities.js, same for player and AI.
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
 * tool (it costs stamina and lets some damage through), specials are a limited opportunity
 * (special meter, refills every 5 seconds).
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
    // A normal attack: a bit more damage and reach than the punch, far below the strong attack (14).
    anim: 'kick',
    startup: 9, active: 4, recovery: 15, cooldown: 6,
    damage: 7, // was 9
    hitbox: { x: 1.0, y: 0.85, w: 0.95, h: 0.5 },
    knockback: { x: 3.8, y: 0.8 }, // was { x: 5.5, y: 2.5 } - no more launch
    hitstun: 17, hitstop: 5, lunge: 1.2,
  },
  // strong: the STRONG ATTACK is the shared special - see src/abilities/specials.js
};

/** Defaults every fighter starts from. */
export const BASE_FIGHTER = {
  name: 'FIGHTER',
  maxHealth: 100,
  walkSpeed: 4.0,
  jumpHeight: 2.2,
  damageMultiplier: 1.0,
  attackSpeed: 1.0,
  stamina: { max: 100, regenPerSecond: 6 }, // blocking resource; 0 -> full in ~17s
  moves: BASE_MOVES,
  specials: DEFAULT_SPECIALS, // same object for every fighter
  appearance: {
    type: 'stickman',
    url: '/models/stickman.glb',
    height: 1.9,
    colors: { body: 0x1b1b1f },
    face: false, // plain stickman: no eyes / mouth (face.js supports textures or generated faces later)
    accessories: [], // none for now (see accessories.js)
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

// For now every fighter is the same plain stickman with the same stats; only the color differs.
export const CHARACTERS = {
  ember: defineFighter({
    name: 'EMBER',
    appearance: { colors: { body: 0xc8401e } },
  }),

  volt: defineFighter({
    name: 'VOLT',
    appearance: { colors: { body: 0x1f5fc8 } },
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
