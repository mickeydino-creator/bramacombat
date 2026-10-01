/*
 * Very simple opponent AI. Produces the same input object as the keyboard,
 * so the AI plays by exactly the same rules as the player.
 *
 * Every few frames it picks a "plan": approach, retreat, wait, attack or jump.
 * Tune difficulty with the options below.
 */
const rand = (a, b) => a + Math.random() * (b - a);

export class AIController {
  constructor({ aggression = 0.6, reactionFrames = 14 } = {}) {
    this.aggression = aggression; // 0..1, how often it attacks when in range
    this.reactionFrames = reactionFrames; // how long a plan lasts at minimum
    this.reset();
  }

  reset() {
    this.plan = 'wait';
    this.timer = 30;
  }

  getInput(self, opponent) {
    const input = { move: 0, jump: false, actions: [] };
    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const toward = Math.sign(dx) || 1;

    if (--this.timer <= 0) this.decide(self, opponent, dist);

    switch (this.plan) {
      case 'approach':
        input.move = toward;
        if (dist < 1.3) this.timer = 0; // in range -> decide again right away
        break;
      case 'retreat':
        input.move = -toward;
        break;
      case 'jump':
        input.jump = true;
        input.move = Math.random() < 0.5 ? toward : 0;
        this.plan = 'wait';
        break;
      case 'attack':
        input.actions.push(this.pickAttack(self, dist));
        this.plan = 'wait';
        this.timer = Math.round(rand(8, 22));
        break;
    }
    return input;
  }

  decide(self, opponent, dist) {
    const r = Math.random();
    this.timer = Math.round(rand(this.reactionFrames, this.reactionFrames * 2.5));

    // React to an incoming attack sometimes.
    if (opponent.state === 'attack' && dist < 2 && r < 0.3) {
      this.plan = Math.random() < 0.6 ? 'retreat' : 'jump';
      return;
    }
    if (dist > 1.6) {
      this.plan = r < 0.8 ? 'approach' : r < 0.9 ? 'wait' : 'jump';
      if (this.plan === 'approach') this.timer = Math.round(rand(20, 50));
    } else if (r < this.aggression) {
      this.plan = 'attack';
    } else if (r < this.aggression + 0.2) {
      this.plan = 'retreat';
      this.timer = Math.round(rand(12, 35));
    } else if (r < this.aggression + 0.27) {
      this.plan = 'jump';
    } else {
      this.plan = 'wait';
    }
  }

  pickAttack(self, dist) {
    const r = Math.random();
    if ((self.cooldowns.strong || 0) <= 0 && r < 0.18) return 'strong';
    if (dist > 1.25) return r < 0.7 ? 'kick' : 'punch';
    return r < 0.6 ? 'punch' : 'kick';
  }
}
