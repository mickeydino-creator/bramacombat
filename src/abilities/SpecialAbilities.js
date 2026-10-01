import { FPS } from '../config/constants.js';

/*
 * Cooldowns for special abilities (one instance per fighter).
 *
 * Specials are defined per character in src/config/characters.js:
 *   specials: {
 *     special: { label: 'FLAME RUSH', cooldown: 5, move: { ...same frame data as normal moves } },
 *   }
 * The key (`special`) is the action name the input sends (see KeyboardController / GamepadController).
 * `cooldown` is in seconds and starts the moment the ability activates.
 * While on cooldown, presses are ignored completely.
 */
export class SpecialAbilities {
  constructor(defs = {}) {
    this.defs = defs;
    this.remaining = {}; // action name -> frames left
    this.reset();
  }

  reset() {
    for (const name in this.defs) this.remaining[name] = 0;
  }

  has(name) { return name in this.defs; }
  isReady(name) { return this.has(name) && this.remaining[name] <= 0; }
  getMove(name) { return this.defs[name]?.move; }

  /** Start the cooldown (call when the ability successfully activates). */
  trigger(name) { this.remaining[name] = Math.round(this.defs[name].cooldown * FPS); }

  /** Called once per fixed step. */
  update() {
    for (const name in this.remaining) if (this.remaining[name] > 0) this.remaining[name]--;
  }

  /** For the HUD: [{ name, label, ready, secondsLeft, progress (0 = just used, 1 = ready) }] */
  status() {
    return Object.entries(this.defs).map(([name, def]) => {
      const left = this.remaining[name];
      const total = def.cooldown * FPS;
      return { name, label: def.label || name, ready: left <= 0, secondsLeft: left / FPS, progress: total ? 1 - left / total : 1 };
    });
  }
}
