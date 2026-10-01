/*
 * Keyboard -> fighter input. Change bindings here.
 * Action names must match keys in the character's `moves` (src/config/characters.js).
 */
const ACTION_KEYS = {
  KeyJ: 'punch',
  KeyK: 'kick',
  KeyL: 'strong', // strong attack = the special (needs a full special meter)
};
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const JUMP = ['KeyW', 'ArrowUp', 'Space'];
const BLOCK = ['ShiftLeft', 'ShiftRight']; // hold

export class KeyboardController {
  constructor() {
    this.down = new Set();
    this.pressed = [];
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat && ACTION_KEYS[e.code]) this.pressed.push(ACTION_KEYS[e.code]);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(codes) { return codes.some((c) => this.down.has(c)); }

  /** Called once per fixed step. */
  getInput() {
    const actions = this.pressed;
    this.pressed = [];
    return {
      move: (this.isDown(RIGHT) ? 1 : 0) - (this.isDown(LEFT) ? 1 : 0),
      jump: this.isDown(JUMP),
      block: this.isDown(BLOCK),
      actions,
    };
  }
}
