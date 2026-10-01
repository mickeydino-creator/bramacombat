import { PlaceholderModel } from '../models/PlaceholderModel.js';
// import { GltfModel } from '../models/GltfModel.js';

/*
 * CHARACTER DEFINITIONS
 * ---------------------
 * Everything that makes a fighter unique lives here: stats, moves and the 3D model.
 *
 * Move frame data (all values in frames @ 60fps):
 *   startup   - frames before the hitbox appears
 *   active    - frames the hitbox can hit
 *   recovery  - frames after the hitbox disappears before you can act again
 *   cooldown  - extra frames before THIS move can be used again
 *   hitstun   - frames the victim can't act after being hit
 *   hitstop   - frames both fighters freeze on hit (impact feel)
 * Other fields:
 *   damage    - health removed (multiplied by the character's damageMultiplier)
 *   hitbox    - x: forward distance from fighter center, y: height of box center, w/h: size
 *   knockback - x: horizontal push speed, y: upward launch speed
 *   lunge     - forward speed applied when the attack becomes active
 *   anim      - animation name the model plays (see models/PlaceholderModel.js / GltfModel.js)
 *
 * Adding a special move: add an entry to `moves` (e.g. `special: {...}`) and bind a key
 * to the action name in src/input/KeyboardController.js (ACTION_KEYS).
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
    damage: 10,
    hitbox: { x: 1.0, y: 0.85, w: 0.95, h: 0.5 },
    knockback: { x: 5.5, y: 2.5 },
    hitstun: 19, hitstop: 6, lunge: 1.5,
  },
  strong: {
    anim: 'strong',
    startup: 17, active: 5, recovery: 24, cooldown: 35,
    damage: 18,
    hitbox: { x: 1.0, y: 1.15, w: 1.1, h: 1.0 },
    knockback: { x: 10, y: 8 },
    hitstun: 30, hitstop: 10, lunge: 4.5, shake: 0.3,
  },
};

export const CHARACTERS = {
  ember: {
    name: 'EMBER',
    maxHealth: 100,
    walkSpeed: 4.2, // units / second
    jumpHeight: 2.3, // units
    damageMultiplier: 1.0,
    attackSpeed: 1.0, // >1 = faster startup/recovery, <1 = slower
    moves: BASE_MOVES,
    // Replace this with your own model, e.g.:
    //   createModel: () => new GltfModel({ url: '/models/ember.glb', scale: 1 }),
    createModel: () => new PlaceholderModel({ color: 0xd9532b, accent: 0xffd23f, skin: 0xe8b48a }),
  },

  volt: {
    name: 'VOLT',
    maxHealth: 100,
    walkSpeed: 3.8,
    jumpHeight: 2.1,
    damageMultiplier: 1.05,
    attackSpeed: 0.95,
    moves: BASE_MOVES,
    createModel: () => new PlaceholderModel({ color: 0x2f7fd8, accent: 0x7cf2ff, skin: 0xa8784f }),
  },
};
