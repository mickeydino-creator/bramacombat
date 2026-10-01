import {
  STEP, GRAVITY, ARENA_HALF_WIDTH, GROUND_FRICTION, INPUT_BUFFER_FRAMES,
  BLOCK_DAMAGE_MULTIPLIER, BLOCK_MOVE_SPEED, BLOCKSTUN_MULTIPLIER, BLOCK_PUSHBACK,
  BLOCK_STAMINA_DRAIN_PER_SECOND, BLOCK_HIT_STAMINA_COST, GUARD_RECOVER_STAMINA,
} from '../config/constants.js';
import { SpecialAbilities } from '../abilities/SpecialAbilities.js';
import { Stamina } from '../abilities/Stamina.js';
import { createModel } from '../models/createModel.js';

// Fighter body size used for the hurtbox (the area that can be hit).
const HURT_HALF_WIDTH = 0.35;
const HURT_HEIGHT = 1.85;

/**
 * A fighter = gameplay state + physics + a model (visuals only).
 *
 * It does not know where its input comes from: every frame it receives an
 * input object { move: -1|0|1, jump: bool, actions: ['punch', ...] } from a
 * controller (keyboard, AI, later network/replay...). Optional `block: bool` = block held.
 *
 * States: idle | walk | air | attack | hitstun | blockstun | ko | victory
 * `blocking` is true while block is held on the ground (state stays idle/walk).
 * Blocking drains stamina; at 0 the guard breaks (no blocking until stamina recovers).
 */
export class Fighter {
  constructor(def, scene) {
    this.def = def;
    this.name = def.name;
    this.maxHealth = def.maxHealth;
    this.jumpVelocity = Math.sqrt(2 * -GRAVITY * def.jumpHeight);

    this.stamina = new Stamina(def.stamina); // blocking resource
    this.specials = new SpecialAbilities(def.specials); // separate special meter (shared rules)
    // Model: either a custom factory or built from the character's `appearance` data.
    this.model = def.createModel ? def.createModel(def) : createModel(def.appearance);
    scene.add(this.model.root);

    this.listeners = {};
    this.reset(0, 1);
  }

  reset(x, facing) {
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing; // 1 = looking toward +X, -1 = toward -X
    this.health = this.maxHealth;
    this.state = 'idle';
    this.stateFrame = 0;
    this.attack = null; // { name, move, frame, hasHit }
    this.hitstun = 0;
    this.blocking = false;
    this.guardBroken = false;
    this.landFrames = 0; // short landing animation
    this.runFrames = 0; // frames spent walking forward (switches walk -> run animation)
    this.cooldowns = {};
    this.buffer = null; // { action, frames }
    this.stamina.reset();
    this.specials.reset();
    this.time = 0;
    this.model.reset?.();
  }

  // ---- small event system (used by Game for sound/effects) ----
  on(event, fn) { (this.listeners[event] ||= []).push(fn); }
  emit(event, data) { (this.listeners[event] || []).forEach((fn) => fn(data, this)); }

  get grounded() { return this.y <= 0 && this.vy <= 0; }
  get alive() { return this.health > 0; }
  get canAct() { return this.state === 'idle' || this.state === 'walk' || this.state === 'air'; }

  setState(state) {
    if (this.state !== state) {
      this.state = state;
      this.stateFrame = 0;
    }
  }

  /** Frame data scaled by the character's attack speed. */
  frames(n) { return Math.max(1, Math.round(n / this.def.attackSpeed)); }
  /** Frame count for a specific move: shared specials (`fixed`) ignore attack speed. */
  moveFrames(move, n) { return move.fixed ? n : this.frames(n); }

  /** Special meter recharge: called by Game every fixed step, even during hitstop. */
  tickMeters() { this.specials.update(); }

  /** Called once per fixed step (60/s). */
  update(input, opponent) {
    this.time += STEP;
    this.stateFrame++;
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k]--;
    this.stamina.update(!this.blocking); // stamina doesn't recharge while blocking
    // (the special meter is ticked by Game every step, see tickMeters)
    if (this.landFrames > 0) this.landFrames--;
    if (this.guardBroken && this.stamina.value >= GUARD_RECOVER_STAMINA) this.guardBroken = false;

    // Remember attack presses for a few frames so inputs during recovery aren't lost.
    // Special presses during their cooldown are ignored entirely.
    const actions = input.actions.filter((a) => !this.specials.has(a) || this.specials.isReady(a));
    if (actions.length) this.buffer = { action: actions[0], frames: INPUT_BUFFER_FRAMES };
    else if (this.buffer && --this.buffer.frames <= 0) this.buffer = null;

    if (this.state !== 'blockstun') this.blocking = false; // updateFree sets it again while held

    switch (this.state) {
      case 'blockstun':
        // Still blocking while held; becomes free when blockstun ends.
        this.blocking = !!input.block && !this.guardBroken;
        if (this.grounded) this.vx *= GROUND_FRICTION;
        if (--this.hitstun <= 0) this.setState('idle');
        break;

      case 'ko':
      case 'victory':
        this.vx *= this.grounded ? GROUND_FRICTION : 1;
        break;

      case 'hitstun':
        if (this.grounded) this.vx *= GROUND_FRICTION;
        if (--this.hitstun <= 0 && this.grounded) this.setState('idle');
        break;

      case 'attack':
        this.updateAttack();
        break;

      default:
        this.updateFree(input, opponent);
    }

    if (this.blocking) this.drainGuard(BLOCK_STAMINA_DRAIN_PER_SECOND * STEP);
    this.updatePhysics();
  }

  updateFree(input, opponent) {
    this.blocking = !!input.block && this.grounded && !input.jump && !this.guardBroken;

    // Auto-face the opponent while on the ground. Not while blocking, so a
    // cross-up (opponent jumping over you) hits from behind.
    if (this.grounded && opponent && !this.blocking) {
      const dx = opponent.x - this.x;
      if (Math.abs(dx) > 0.05) this.facing = Math.sign(dx);
    }

    if (this.grounded) {
      this.vx = input.move * this.def.walkSpeed * (this.blocking ? BLOCK_MOVE_SPEED : 1);
      if (input.jump) {
        this.vy = this.jumpVelocity;
        this.vx = input.move * this.def.walkSpeed * 1.1;
        this.emit('jump');
      }
    } else {
      // A little air control.
      this.vx += input.move * this.def.walkSpeed * 0.04;
      const max = this.def.walkSpeed * 1.2;
      this.vx = Math.max(-max, Math.min(max, this.vx));
    }

    if (this.blocking) {
      this.buffer = null; // can't attack while blocking; presses are dropped
    } else if (this.buffer && this.tryAttack(this.buffer.action)) {
      this.buffer = null;
      return;
    }

    if (!this.grounded || this.vy > 0) this.setState('air');
    else this.setState(Math.abs(this.vx) > 0.1 ? 'walk' : 'idle');
    const forward = this.state === 'walk' && Math.sign(this.vx) === this.facing && Math.abs(this.vx) > this.def.walkSpeed * 0.8;
    this.runFrames = forward ? this.runFrames + 1 : 0;
  }

  tryAttack(name) {
    const special = this.specials.has(name);
    const move = special ? this.specials.getMove(name) : this.def.moves[name];
    if (!move || (this.cooldowns[name] || 0) > 0) return false;
    // Specials: the meter must be full and is emptied right here, or the attack doesn't happen.
    if (special && !this.specials.trigger(name)) return false;
    this.attack = {
      name,
      move,
      frame: 0,
      hasHit: false, // one attack can only hit once
      startup: this.moveFrames(move, move.startup),
      active: this.moveFrames(move, move.active),
      recovery: this.moveFrames(move, move.recovery),
    };
    if (this.grounded) this.vx = 0;
    this.setState('attack');
    this.emit('attackStart', this.attack);
    return true;
  }

  updateAttack() {
    const a = this.attack;
    a.frame++;
    if (this.grounded) this.vx *= GROUND_FRICTION;
    if (a.frame === a.startup && a.move.lunge) {
      this.vx = this.facing * a.move.lunge;
      this.emit('attackActive', a);
    }
    if (a.frame >= a.startup + a.active + a.recovery) this.endAttack();
  }

  endAttack() {
    this.cooldowns[this.attack.name] = this.moveFrames(this.attack.move, this.attack.move.cooldown || 0);
    this.attack = null;
    this.setState(this.grounded ? 'idle' : 'air');
  }

  /** 'startup' | 'active' | 'recovery' | null */
  get attackPhase() {
    const a = this.attack;
    if (!a) return null;
    if (a.frame < a.startup) return 'startup';
    if (a.frame < a.startup + a.active) return 'active';
    return 'recovery';
  }

  /** 0..1 progress inside the current attack phase (used for animation). */
  get attackPhaseProgress() {
    const a = this.attack;
    if (!a) return 0;
    if (a.frame < a.startup) return a.frame / a.startup;
    if (a.frame < a.startup + a.active) return (a.frame - a.startup) / a.active;
    return (a.frame - a.startup - a.active) / a.recovery;
  }

  updatePhysics() {
    this.vy += GRAVITY * STEP;
    this.x += this.vx * STEP;
    this.y += this.vy * STEP;

    if (this.y <= 0) {
      const wasAirborne = this.vy < -1;
      this.y = 0;
      this.vy = 0;
      if (wasAirborne) {
        this.emit('land');
        this.landFrames = 8;
        if (this.state === 'air') this.setState('idle');
        // Landing cancels aerial attacks.
        if (this.state === 'attack' && this.attack && this.stateFrame > 2) this.endAttack();
      }
    }

    const limit = ARENA_HALF_WIDTH;
    if (this.x < -limit) { this.x = -limit; this.vx = Math.max(0, this.vx); }
    if (this.x > limit) { this.x = limit; this.vx = Math.min(0, this.vx); }
  }

  // ---- combat ----

  getHurtbox() {
    return {
      minX: this.x - HURT_HALF_WIDTH, maxX: this.x + HURT_HALF_WIDTH,
      minY: this.y, maxY: this.y + HURT_HEIGHT,
    };
  }

  /** World-space hitbox of the current attack, only during active frames and before it has hit. */
  getActiveHitbox() {
    if (this.state !== 'attack' || this.attackPhase !== 'active' || this.attack.hasHit) return null;
    const hb = this.attack.move.hitbox;
    const cx = this.x + this.facing * hb.x;
    const cy = this.y + hb.y;
    return { minX: cx - hb.w / 2, maxX: cx + hb.w / 2, minY: cy - hb.h / 2, maxY: cy + hb.h / 2 };
  }

  /** Apply a hit from `attacker` with `move`. Returns the damage dealt. */
  takeHit(move, attacker) {
    // Blocking only protects against attacks from the front.
    const fromFront = Math.sign(attacker.x - this.x) === this.facing;
    const blocked = this.blocking && fromFront;
    this.lastHitBlocked = blocked;
    const raw = move.damage * (move.fixed ? 1 : attacker.def.damageMultiplier); // shared specials: same damage for everyone
    const damage = Math.round(blocked ? raw * BLOCK_DAMAGE_MULTIPLIER : raw);
    this.health = Math.max(0, this.health - damage);

    this.attack = null; // getting hit interrupts your own attack
    this.buffer = null;
    this.facing = -attacker.facing; // turn toward the attacker
    if (blocked) {
      this.vx = attacker.facing * move.knockback.x * BLOCK_PUSHBACK;
    } else {
      this.vx = attacker.facing * move.knockback.x;
      this.vy = Math.max(this.vy, move.knockback.y);
      if (move.knockback.y > 0) this.y = Math.max(this.y, 0.01);
    }

    if (this.health <= 0) {
      this.setState('ko');
      this.vx = attacker.facing * Math.max(6, move.knockback.x);
      this.vy = Math.max(this.vy, 7);
      this.y = Math.max(this.y, 0.01);
    } else if (blocked) {
      this.hitstun = Math.max(1, Math.round(move.hitstun * BLOCKSTUN_MULTIPLIER));
      this.state = 'blockstun';
      this.stateFrame = 0;
      this.drainGuard(raw * BLOCK_HIT_STAMINA_COST); // blocked hits cost stamina
      return damage; // no red flash on block
    } else {
      this.blocking = false;
      this.hitstun = move.hitstun;
      this.state = 'hitstun';
      this.stateFrame = 0;
    }
    this.blocking = false;
    this.model.flash?.();
    return damage;
  }

  /** Spend stamina for blocking; breaks the guard when it runs out. */
  drainGuard(amount) {
    this.stamina.spend(amount);
    if (this.stamina.value <= 0 && !this.guardBroken) {
      this.guardBroken = true;
      this.blocking = false;
      this.emit('guardBreak');
    }
  }

  setVictory() { if (this.state !== 'ko') { this.attack = null; this.setState('victory'); } }

  /**
   * Single animation name derived from gameplay state. Models only need to
   * understand these names: idle, walk, run, jump, fall, land, punch, kick, strong, special,
   * hit, block, ko (defeat), victory. Attack names come from each move's `anim`.
   */
  get animState() {
    if (this.blocking || this.state === 'blockstun') return 'block';
    switch (this.state) {
      case 'attack': return this.attack.move.anim;
      case 'air': return this.vy > 0 ? 'jump' : 'fall';
      case 'hitstun': return 'hit';
      case 'walk': return this.landFrames > 0 ? 'land' : this.runFrames > 20 ? 'run' : 'walk';
      case 'idle': return this.landFrames > 0 ? 'land' : 'idle';
      default: return this.state;
    }
  }

  /** Called every rendered frame: pushes position/facing to the model and animates it. */
  syncModel(dt) {
    const root = this.model.root;
    root.position.set(this.x, this.y, 0);
    // Models face +Z by default. Turn them sideways toward the opponent,
    // slightly angled to the camera so they read better.
    const target = this.facing * (Math.PI / 2 - 0.35);
    root.rotation.y += (target - root.rotation.y) * Math.min(1, dt * 20);
    this.model.update(this, dt);
  }
}
