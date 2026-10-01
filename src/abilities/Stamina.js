import { FPS } from '../config/constants.js';

/*
 * Stamina (one instance per fighter). Used by BLOCKING only - special abilities have their
 * own separate meter (SpecialAbilities.js).
 *   - drained while holding block and by blocked hits (Fighter.drainGuard)
 *   - recharges at regenPerSecond, except while blocking
 * The HUD reads `value` directly every frame.
 */
const DEFAULT_STAMINA = { max: 100, regenPerSecond: 6 };

export class Stamina {
  constructor(config = DEFAULT_STAMINA) {
    this.max = config.max ?? DEFAULT_STAMINA.max;
    this.regenPerFrame = (config.regenPerSecond ?? DEFAULT_STAMINA.regenPerSecond) / FPS;
    this.reset();
  }

  reset() { this.value = this.max; } // rounds start full

  spend(amount) { this.value = Math.max(0, this.value - amount); }

  /** Called once per fixed step. */
  update(regen = true) {
    if (regen) this.value = Math.min(this.max, this.value + this.regenPerFrame);
  }
}
