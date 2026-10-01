import { FPS } from '../config/constants.js';

/*
 * Special abilities: stamina + cooldowns (one instance per fighter).
 *
 * Defined per character in src/config/characters.js:
 *   stamina: { max: 100, regenPerSecond: 16 },
 *   specials: {
 *     special: { label: 'FLAME RUSH', staminaCost: 100, cooldown: 5, move: { ...frame data } },
 *   }
 * The key (`special`) is the action name the input sends (see KeyboardController / GamepadController).
 * Using an ability spends `staminaCost` immediately and starts its `cooldown` (seconds).
 * Stamina recharges continuously at `regenPerSecond`. An ability can only be used when
 * there is enough stamina AND it is off cooldown; otherwise presses are ignored completely.
 */
const DEFAULT_STAMINA = { max: 100, regenPerSecond: 16 };

export class SpecialAbilities {
  constructor(defs = {}, stamina = DEFAULT_STAMINA) {
    this.defs = defs;
    this.maxStamina = stamina.max ?? DEFAULT_STAMINA.max;
    this.regenPerFrame = (stamina.regenPerSecond ?? DEFAULT_STAMINA.regenPerSecond) / FPS;
    this.remaining = {}; // action name -> cooldown frames left
    this.reset();
  }

  reset() {
    for (const name in this.defs) this.remaining[name] = 0;
    this.stamina = this.maxStamina; // rounds start with a full meter
  }

  has(name) { return name in this.defs; }
  cost(name) { return this.defs[name]?.staminaCost ?? 0; }
  isReady(name) { return this.has(name) && this.remaining[name] <= 0 && this.stamina >= this.cost(name); }
  getMove(name) { return this.defs[name]?.move; }

  /** Spend stamina and start the cooldown (call when the ability successfully activates). */
  trigger(name) {
    this.stamina = Math.max(0, this.stamina - this.cost(name));
    this.remaining[name] = Math.round(this.defs[name].cooldown * FPS);
  }

  /** Called once per fixed step. */
  update() {
    for (const name in this.remaining) if (this.remaining[name] > 0) this.remaining[name]--;
    this.stamina = Math.min(this.maxStamina, this.stamina + this.regenPerFrame);
  }

  /** For the HUD: stamina meter + per-ability readiness. */
  status() {
    return {
      stamina: this.stamina,
      max: this.maxStamina,
      abilities: Object.entries(this.defs).map(([name, def]) => ({
        name,
        label: def.label || name,
        cost: this.cost(name),
        ready: this.isReady(name),
      })),
    };
  }
}
