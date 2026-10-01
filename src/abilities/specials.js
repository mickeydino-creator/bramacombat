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
  surgeStrike: Object.freeze({
    label: 'SURGE STRIKE',
    move: Object.freeze({
      anim: 'special',
      fixed: true, // not scaled by character damage / attack speed
      // Usable every 5s, so it hits hard but is slow and very punishable if blocked or whiffed.
      startup: 14, active: 6, recovery: 30, cooldown: 0,
      damage: 8,
      hitbox: Object.freeze({ x: 0.9, y: 1.2, w: 1.0, h: 0.8 }),
      knockback: Object.freeze({ x: 5, y: 3 }),
      hitstun: 22, hitstop: 12, lunge: 9, shake: 0.3,
    }),
  }),
};

/** The default special every fighter uses, bound to the `special` action (I / RB). */
export const DEFAULT_SPECIALS = Object.freeze({ special: SPECIALS.surgeStrike });
