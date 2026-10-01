/*
 * SHARED SPECIAL ABILITIES - defined once, used by reference.
 *
 * Every fighter (player AND AI) gets the exact same object from here, so name, damage, range,
 * knockback, animation, stamina cost and cooldown are identical for everyone.
 * Specials ignore the fighter's damageMultiplier / attackSpeed (see `fixed`), so character
 * stats can't make one fighter's version stronger or faster.
 *
 *   label        name on the HUD
 *   staminaCost  spent the instant the ability activates; it can't activate with less
 *   cooldown     seconds, starts the instant the ability activates
 *   move         frame data, same format as normal attacks (src/config/characters.js)
 */
export const SPECIALS = {
  surgeStrike: Object.freeze({
    label: 'SURGE STRIKE',
    staminaCost: 80,
    cooldown: 12,
    move: Object.freeze({
      anim: 'special',
      fixed: true, // not scaled by character damage / attack speed
      startup: 12, active: 6, recovery: 26, cooldown: 0,
      damage: 10,
      hitbox: Object.freeze({ x: 0.9, y: 1.2, w: 1.0, h: 0.8 }),
      knockback: Object.freeze({ x: 5.5, y: 3 }),
      hitstun: 24, hitstop: 12, lunge: 9, shake: 0.3,
    }),
  }),
};

/** The default special every fighter uses, bound to the `special` action (I / RB). */
export const DEFAULT_SPECIALS = Object.freeze({ special: SPECIALS.surgeStrike });
