import { FPS } from '../config/constants.js';
import { SPECIAL_METER } from './specials.js';

/*
 * SPECIAL ABILITY METER (one instance per fighter, identical for player and AI).
 * Completely separate from stamina.
 *
 *   - starts full at the beginning of a round
 *   - using a special empties it instantly
 *   - it refills from empty to full in exactly SPECIAL_METER.rechargeSeconds (game time)
 *   - a special can only be used when the meter is FULL, and at most once per frame
 *
 * The capacity / recharge time come from the shared SPECIAL_METER (src/abilities/specials.js),
 * never from per-character data, so nobody can have a faster meter.
 * Charge is counted in whole frames, so "5 seconds" is exactly 300 steps at 60fps.
 * The HUD reads `meter` directly every frame.
 */
export class SpecialAbilities {
  constructor(defs = {}) {
    this.defs = defs;
    this.capacity = SPECIAL_METER.capacity;
    this.rechargeFrames = Math.round(SPECIAL_METER.rechargeSeconds * FPS);
    this.reset();
  }

  reset() {
    this.chargeFrames = this.rechargeFrames; // full
    this.tick = 0;
    this.lastTriggerTick = -1;
  }

  get meter() { return (this.capacity * this.chargeFrames) / this.rechargeFrames; }
  get full() { return this.chargeFrames >= this.rechargeFrames; }
  get secondsLeft() { return (this.rechargeFrames - this.chargeFrames) / FPS; }

  has(name) { return name in this.defs; }
  getMove(name) { return this.defs[name]?.move; }
  isReady(name) { return this.has(name) && this.full && this.lastTriggerTick !== this.tick; }

  /** Activate: only when ready. Empties the meter immediately. Returns false (no change) otherwise. */
  trigger(name) {
    if (!this.isReady(name)) return false;
    this.chargeFrames = 0;
    this.lastTriggerTick = this.tick;
    return true;
  }

  /** Called once per fixed game step (also during hitstop, so the 5 seconds are real seconds). */
  update() {
    this.tick++;
    if (this.chargeFrames < this.rechargeFrames) this.chargeFrames++;
  }

  /** For the HUD. */
  status() {
    const [name, def] = Object.entries(this.defs)[0] || [];
    return {
      meter: this.meter, capacity: this.capacity, full: this.full, secondsLeft: this.secondsLeft,
      label: def?.label || name || '', ready: name ? this.isReady(name) : false,
    };
  }
}
