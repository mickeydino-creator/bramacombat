/*
 * SHARED SPECIAL ABILITIES - defined once, used by reference.
 *
 * Every fighter (player AND AI) gets the exact same object from here, so name, damage, range,
 * knockback and animation are identical for everyone. Specials ignore the fighter's
 * damageMultiplier / attackSpeed (see `fixed`).
 *
 * Specials don't use stamina. They use the separate SPECIAL METER below
 * (rules in src/abilities/SpecialAbilities.js): full -> usable, use -> empty, refills in rechargeSeconds.
 *
 *   label  name on the HUD
 *   move   frame data, same format as normal attacks (src/config/characters.js)
 */
export const SPECIAL_METER = Object.freeze({
  capacity: 100,
  rechargeSeconds: 5, // empty -> full
});

export const SPECIALS = {
  // The STRONG ATTACK is the special: big slow hit, usable only when the special meter is full.
  strongAttack: Object.freeze({
    label: 'STRONG ATTACK',
    move: Object.freeze({
      anim: 'strong',
      fixed: true, // not scaled by character damage / attack speed
      startup: 17, active: 5, recovery: 24, cooldown: 0, // the meter is its cooldown
      damage: 14,
      hitbox: Object.freeze({ x: 1.0, y: 1.15, w: 1.1, h: 1.0 }),
      knockback: Object.freeze({ x: 8.5, y: 6.5 }),
      hitstun: 30, hitstop: 10, lunge: 4.5, shake: 0.3,
    }),
  }),
};

/** Every fighter's special, bound to the `strong` action (L / Y / STR). */
export const DEFAULT_SPECIALS = Object.freeze({ strong: SPECIALS.strongAttack });
