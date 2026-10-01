/*
 * Simple fighting-game AI. Produces the same input object as the keyboard,
 * so the AI plays by exactly the same rules as the player.
 *
 * Behaviour, checked once per fixed step:
 *   - Spacing: walks in when too far, steps back when too close, and shuffles
 *     back and forth ("footsies") at fighting distance instead of standing still.
 *   - Attacks when the player is in range, choosing the move by distance, then
 *     pauses for a random time so it doesn't attack nonstop.
 *   - Punishes: likes to use the strong attack while the player is recovering.
 *   - Defense: when the player starts an attack nearby it sometimes blocks (after a short,
 *     random reaction delay, held briefly), or backs off / jumps away.
 *   - After getting hit it backs off and won't attack for a moment.
 *   - Jumps in occasionally.
 *   - Uses its special ability (same stamina + cooldown rules as the player) mostly when it
 *     can realistically land: player in range and recovering, stunned, or not blocking.
 * Every decision has random timing so it isn't fully predictable. Tune with the options below.
 */
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.round(rand(a, b));

// Distances (center to center). Punch reaches ~1.5, kick ~1.8, strong ~1.9 + lunge.
const FAR = 2.0; // farther than this -> walk in
const IDEAL_MIN = 1.1; // closer than this -> tends to step back
const IDEAL_MAX = 1.6;

export class AIController {
  constructor({
    aggression = 0.55, // 0..1, chance to attack when an opening appears
    defense = 0.35, // 0..1, chance to back off from an incoming attack
    blockChance = 0.3, // 0..1, chance to block an incoming attack (checked first)
    blockReaction = [2, 7], // frames before the block comes up (can be too late vs fast moves)
    blockHold = [18, 32], // frames to hold block before returning to normal behaviour
    reactionFrames = [8, 16], // delay before re-thinking the current plan
    attackPause = [22, 50], // frames to wait between own attacks
    specialChance = 0.15, // 0..1, chance to use the special on a neutral opening (punishes are likelier)
  } = {}) {
    Object.assign(this, { aggression, defense, blockChance, blockReaction, blockHold, reactionFrames, attackPause, specialChance });
    this.reset();
  }

  reset() {
    this.plan = 'wait';
    this.planTimer = 20;
    this.attackCooldown = randInt(20, 40); // own pause between attacks
    this.avoidTimer = 0; // > 0 after being hit: no attacking
    this.lastSeenAttack = null; // opponent attack we already reacted (or not) to
    this.lastPunished = null; // opponent attack we already tried to punish
    this.wasHit = false;
    this.footsieDir = 1;
    this.blockDelay = 0;
    this.blockTimer = 0;
    this.pendingAction = null; // forced action for the next 'attack' plan (used for the special)
  }

  getInput(self, opponent) {
    const input = { move: 0, jump: false, actions: [] };
    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const toward = Math.sign(dx) || self.facing;

    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.avoidTimer > 0) this.avoidTimer--;

    // Got hit: back off and don't attack for a short while.
    const hitNow = self.state === 'hitstun';
    if (hitNow && !this.wasHit) {
      this.avoidTimer = randInt(25, 45);
      this.setPlan(Math.random() < 0.7 ? 'retreat' : 'footsie', randInt(20, 40));
    }
    this.wasHit = hitNow;
    if (hitNow || self.guardBroken) this.blockTimer = 0; // got hit / guard broken: drop the block

    // Holding block: keep it up (also through blockstun) until the timer runs out.
    if (this.blockTimer > 0) {
      if (this.blockDelay > 0) {
        this.blockDelay--; // reaction delay: about to block, do nothing else
        return input;
      } else {
        input.block = true;
        if (--this.blockTimer <= 0) this.setPlan('footsie', randInt(...this.reactionFrames));
        return input;
      }
    }
    if (!self.canAct) return input; // busy (attacking / hitstun): nothing to decide

    // React once to each new attack the player starts close by.
    const oppAttack = opponent.state === 'attack' ? opponent.attack : null;
    if (oppAttack && oppAttack !== this.lastSeenAttack) {
      this.lastSeenAttack = oppAttack;
      const r = Math.random();
      // Blocking costs stamina: don't try when low (same rules as the player).
      const canBlock = !self.guardBroken && self.stamina.value > 20;
      if (dist < 2.2 && canBlock && r < this.blockChance) {
        this.blockDelay = randInt(...this.blockReaction);
        this.blockTimer = randInt(...this.blockHold);
      } else if (dist < 2.2 && r < this.blockChance + this.defense) {
        this.setPlan(Math.random() < 0.75 ? 'retreat' : 'jumpBack', randInt(14, 26));
      }
    }

    // Punish: the first time we see a nearby player attack in recovery, maybe hit back.
    if (oppAttack && opponent.attackPhase === 'recovery' && oppAttack !== this.lastPunished) {
      this.lastPunished = oppAttack;
      if (this.specialLooksGood(self, opponent, dist) && Math.random() < 0.45) {
        this.pendingAction = this.specialName(self);
        this.setPlan('attack', 2);
      } else if (dist < 1.7 && this.attackCooldown < 15 && Math.random() < this.aggression * 0.7) this.setPlan('attack', 2);
    }

    if (--this.planTimer <= 0) this.decide(self, opponent, dist);

    switch (this.plan) {
      case 'approach':
        input.move = toward;
        if (dist < IDEAL_MAX) this.planTimer = 0; // arrived -> re-think next frame
        break;
      case 'retreat':
        input.move = -toward;
        break;
      case 'jumpIn':
        input.jump = true;
        input.move = toward;
        this.setPlan('wait', randInt(10, 20));
        break;
      case 'jumpBack':
        input.jump = true;
        input.move = -toward;
        this.setPlan('wait', randInt(10, 20));
        break;
      case 'footsie':
        // Small steps in and out around fighting distance.
        if (dist < IDEAL_MIN) this.footsieDir = -1;
        else if (dist > IDEAL_MAX) this.footsieDir = 1;
        else if (Math.random() < 0.04) this.footsieDir *= -1;
        input.move = this.footsieDir * toward;
        break;
      case 'attack':
        input.actions.push(this.pendingAction || this.pickAttack(self, opponent, dist));
        this.pendingAction = null;
        this.attackCooldown = randInt(...this.attackPause);
        this.setPlan('footsie', randInt(...this.reactionFrames));
        break;
      // 'wait': stand for a short moment
    }
    return input;
  }

  setPlan(plan, frames) {
    if (plan !== 'attack') this.pendingAction = null;
    this.plan = plan;
    this.planTimer = frames;
  }

  decide(self, opponent, dist) {
    const r = Math.random();
    const think = randInt(...this.reactionFrames);
    const canAttack = this.attackCooldown <= 0 && this.avoidTimer <= 0;
    // Player is stuck in recovery or hitstun: a good moment to attack.
    const opening = (opponent.state === 'attack' && opponent.attackPhase === 'recovery') || opponent.state === 'hitstun';

    if (this.avoidTimer > 0 && opening && dist < 1.6 && r < 0.35) {
      // Even while backing off, sometimes counter a clear opening.
      this.setPlan('attack', 1);
    } else if (this.avoidTimer > 0) {
      // Recovering from being hit: keep some distance.
      this.setPlan(dist < IDEAL_MAX + 0.3 ? 'retreat' : 'footsie', think);
    } else if (canAttack && this.specialLooksGood(self, opponent, dist) && Math.random() < (opening ? 0.5 : this.specialChance)) {
      // Special ability: also works from a bit outside normal range thanks to its lunge.
      this.pendingAction = this.specialName(self);
      this.setPlan('attack', 1);
    } else if (dist > FAR) {
      if (r < 0.06) this.setPlan('jumpIn', 1);
      else if (r < 0.85) this.setPlan('approach', randInt(20, 45));
      else this.setPlan('wait', randInt(6, 14));
    } else if (canAttack && dist < 1.95 && (opening ? r < 0.85 : r < this.aggression)) {
      this.setPlan('attack', 1);
    } else if (r < 0.05) {
      this.setPlan('jumpIn', 1);
    } else if (r < 0.15) {
      this.setPlan('retreat', randInt(10, 22));
    } else if (r < 0.2) {
      this.setPlan('wait', randInt(5, 12));
    } else {
      this.setPlan('footsie', think);
    }
  }

  specialName(self) { return Object.keys(self.def.specials || {})[0]; }

  /** Special is usable (stamina + cooldown) and would realistically connect. */
  specialLooksGood(self, opponent, dist) {
    const name = this.specialName(self);
    if (!name || !self.canUseSpecial(name)) return false; // full meter + enough stamina, like the player
    const move = self.specials.getMove(name);
    // Approximate reach: hitbox front edge + opponent body + distance covered by the lunge.
    const reach = move.hitbox.x + move.hitbox.w / 2 + 0.35 + (move.lunge || 0) * 0.09;
    if (dist > reach * 0.9 || opponent.y > 0.6) return false; // out of range or high in the air
    if (opponent.blocking || opponent.state === 'blockstun') return Math.random() < 0.1; // would be blocked
    // If the player is mid-attack, only go for it when their recovery outlasts our startup.
    if (opponent.state === 'attack' && this.framesLeft(opponent) < self.moveFrames(move, move.startup)) return false;
    return true;
  }

  /** Frames until the opponent's current attack ends (0 if not attacking). */
  framesLeft(opponent) {
    const a = opponent.attack;
    return a ? a.startup + a.active + a.recovery - a.frame : 0;
  }

  pickAttack(self, opponent, dist) {
    const strongReady = self.canUseSpecial('strong'); // strong attack = special (full meter + stamina)
    const punishing = opponent.state === 'attack' && opponent.attackPhase === 'recovery';
    const pressured = opponent.state === 'attack' || this.avoidTimer > 0;
    // Slow strong attack as a punish only when the player's recovery is long enough, rarely raw.
    const strongMove = self.specials.getMove('strong');
    const strongFits = strongMove && this.framesLeft(opponent) > self.moveFrames(strongMove, strongMove.startup);
    if (strongReady && (punishing ? strongFits && Math.random() < 0.6 : !pressured && Math.random() < 0.12)) return 'strong';
    if (punishing) return dist > 1.45 ? 'kick' : 'punch'; // short window: fastest move that reaches
    if (dist > 1.45) return Math.random() < 0.8 ? 'kick' : 'punch'; // punch barely reaches here
    // Under pressure, prefer the fast punch so it doesn't get interrupted.
    return Math.random() < (pressured ? 0.85 : 0.55) ? 'punch' : 'kick';
  }
}
