import {
  STEP, GRAVITY, ARENA_HALF_WIDTH, GROUND_FRICTION, INPUT_BUFFER_FRAMES,
} from '../config/constants.js';
import { SpecialAbilities } from '../abilities/SpecialAbilities.js';

// Fighter body size used for the hurtbox (the area that can be hit).
const HURT_HALF_WIDTH = 0.35;
const HURT_HEIGHT = 1.85;

/**
 * A fighter = gameplay state + physics + a model (visuals only).
 *
 * It does not know where its input comes from: every frame it receives an
 * input object { move: -1|0|1, jump: bool, actions: ['punch', ...] } from a
 * controller (keyboard, AI, later network/replay...).
 *
 * States: idle | walk | air | attack | hitstun | ko | victory
 */
export class Fighter {
  constructor(def, scene) {
    this.def = def;
    this.name = def.name;
    this.maxHealth = def.maxHealth;
    this.jumpVelocity = Math.sqrt(2 * -GRAVITY * def.jumpHeight);

    this.specials = new SpecialAbilities(def.specials);
    this.model = def.createModel();
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
    this.cooldowns = {};
    this.buffer = null; // { action, frames }
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

  /** Called once per fixed step (60/s). */
  update(input, opponent) {
    this.time += STEP;
    this.stateFrame++;
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k]--;
    this.specials.update();

    // Remember attack presses for a few frames so inputs during recovery aren't lost.
    // Special presses during their cooldown are ignored entirely.
    const actions = input.actions.filter((a) => !this.specials.has(a) || this.specials.isReady(a));
    if (actions.length) this.buffer = { action: actions[0], frames: INPUT_BUFFER_FRAMES };
    else if (this.buffer && --this.buffer.frames <= 0) this.buffer = null;

    switch (this.state) {
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

    this.updatePhysics();
  }

  updateFree(input, opponent) {
    // Auto-face the opponent while on the ground.
    if (this.grounded && opponent) {
      const dx = opponent.x - this.x;
      if (Math.abs(dx) > 0.05) this.facing = Math.sign(dx);
    }

    if (this.grounded) {
      this.vx = input.move * this.def.walkSpeed;
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

    if (this.buffer && this.tryAttack(this.buffer.action)) {
      this.buffer = null;
      return;
    }

    if (!this.grounded || this.vy > 0) this.setState('air');
    else this.setState(Math.abs(this.vx) > 0.1 ? 'walk' : 'idle');
  }

  tryAttack(name) {
    const special = this.specials.has(name);
    if (special && !this.specials.isReady(name)) return false;
    const move = special ? this.specials.getMove(name) : this.def.moves[name];
    if (!move || (this.cooldowns[name] || 0) > 0) return false;
    if (special) this.specials.trigger(name); // cooldown starts on activation
    this.attack = {
      name,
      move,
      frame: 0,
      hasHit: false, // one attack can only hit once
      startup: this.frames(move.startup),
      active: this.frames(move.active),
      recovery: this.frames(move.recovery),
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
    this.cooldowns[this.attack.name] = this.frames(this.attack.move.cooldown || 0);
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
    const damage = Math.round(move.damage * attacker.def.damageMultiplier);
    this.health = Math.max(0, this.health - damage);

    this.attack = null; // getting hit interrupts your own attack
    this.buffer = null;
    this.facing = -attacker.facing; // turn toward the attacker
    this.vx = attacker.facing * move.knockback.x;
    this.vy = Math.max(this.vy, move.knockback.y);
    if (move.knockback.y > 0) this.y = Math.max(this.y, 0.01);

    if (this.health <= 0) {
      this.setState('ko');
      this.vx = attacker.facing * Math.max(6, move.knockback.x);
      this.vy = Math.max(this.vy, 7);
      this.y = Math.max(this.y, 0.01);
    } else {
      this.hitstun = move.hitstun;
      this.state = 'hitstun';
      this.stateFrame = 0;
    }
    this.model.flash?.();
    return damage;
  }

  setVictory() { if (this.state !== 'ko') { this.attack = null; this.setState('victory'); } }

  /**
   * Single animation name derived from gameplay state. Models only need to
   * understand these names: idle, walk, jump, punch, kick, strong, hit, ko, victory.
   */
  get animState() {
    switch (this.state) {
      case 'attack': return this.attack.move.anim;
      case 'air': return 'jump';
      case 'hitstun': return 'hit';
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
