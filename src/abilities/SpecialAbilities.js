import { FPS } from '../config/constants.js';

/*
 * Special abilities: stamina + cooldowns (one instance per fighter, same rules for player and AI).
 *
 * The abilities themselves are shared definitions (src/abilities/specials.js); fighters only
 * reference them. This class is the ONLY place stamina changes:
 *   - activation (trigger): spends staminaCost immediately, starts the cooldown, and pauses
 *     regeneration for REGEN_DELAY_SECONDS so the drop is clearly visible
 *   - blocking (spend): see Fighter.drainGuard
 *   - regeneration (update): regenPerSecond, capped at max
 * An ability is usable only with enough stamina AND off cooldown, and at most once per frame.
 * The HUD reads `stamina` directly from here every frame (no separate UI value).
 */
const DEFAULT_STAMINA = { max: 100, regenPerSecond: 6 };
const REGEN_DELAY_SECONDS = 0.75;

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
    this.regenDelay = 0;
    this.tick = 0;
    this.lastTriggerTick = -1;
  }

  has(name) { return name in this.defs; }
  cost(name) { return this.defs[name]?.staminaCost ?? 0; }
  isReady(name) {
    return this.has(name) && this.remaining[name] <= 0 && this.stamina >= this.cost(name)
      && this.lastTriggerTick !== this.tick; // never twice in one frame
  }
  getMove(name) { return this.defs[name]?.move; }

  /**
   * Activate: re-checks readiness, spends the stamina cost and starts the cooldown.
   * Returns false (and changes nothing) if the ability isn't ready.
   */
  trigger(name) {
    if (!this.isReady(name)) return false;
    this.stamina -= this.cost(name);
    this.remaining[name] = Math.round(this.defs[name].cooldown * FPS);
    this.regenDelay = Math.round(REGEN_DELAY_SECONDS * FPS);
    this.lastTriggerTick = this.tick;
    return true;
  }

  /** Spend stamina for something else (e.g. blocking). */
  spend(amount) { this.stamina = Math.max(0, this.stamina - amount); }

  /** Called once per fixed step. */
  update(regen = true) {
    this.tick++;
    for (const name in this.remaining) if (this.remaining[name] > 0) this.remaining[name]--;
    if (this.regenDelay > 0) this.regenDelay--;
    else if (regen) this.stamina = Math.min(this.maxStamina, this.stamina + this.regenPerFrame);
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
