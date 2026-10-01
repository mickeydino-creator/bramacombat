/*
 * Gamepad -> fighter input, via the browser Gamepad API.
 * Uses the "standard" mapping (Xbox layout): works as soon as a pad is connected
 * or any button is pressed (browsers only expose pads after the first press).
 *
 * Produces the same input object as KeyboardController:
 *   { move: -1..1, jump: bool, actions: ['punch', ...], restart: bool }
 * Action names must match keys in the character's `moves` (src/config/characters.js).
 */

// Standard mapping button indices: 0 A, 1 B, 2 X, 3 Y, 9 Menu/Start, 12-15 D-pad up/down/left/right
export const DEFAULT_GAMEPAD_BINDINGS = {
  actions: { 2: 'punch', 1: 'kick', 3: 'strong', 5: 'special' }, // X, B, Y, RB
  jump: [0, 12], // A, D-pad up
  left: [14], // D-pad left
  right: [15], // D-pad right
  restart: [9, 0], // Menu / Start or A - only used on the winner screen (see Game.step)
  moveAxis: 0, // left stick X
  deadzone: 0.2,
};

export class GamepadController {
  /** @param {{ index?: number, bindings?: object }} options index = which pad to use (null = first connected). */
  constructor({ index = null, bindings = {} } = {}) {
    this.bindings = { ...DEFAULT_GAMEPAD_BINDINGS, ...bindings };
    this.index = index;
    this.prev = []; // previous frame's button states, for press (edge) detection
    this.connected = false;

    window.addEventListener('gamepadconnected', (e) => {
      console.info(`Gamepad connected: ${e.gamepad?.id}`);
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      console.info(`Gamepad disconnected: ${e.gamepad?.id}`);
      if (!e.gamepad || this.activeIndex === e.gamepad.index) this.release();
    });
  }

  release() {
    this.activeIndex = null;
    this.prev = [];
    this.connected = false;
  }

  findPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.index != null) return pads[this.index] || null;
    if (this.activeIndex != null && pads[this.activeIndex]?.connected) return pads[this.activeIndex];
    for (const pad of pads) {
      if (pad?.connected) { this.activeIndex = pad.index; this.prev = []; return pad; }
    }
    return null;
  }

  /** Called once per fixed step. */
  getInput() {
    const input = { move: 0, jump: false, actions: [], restart: false };
    const pad = this.findPad();
    this.connected = !!pad;
    if (!pad) return input;

    const b = this.bindings;
    const down = pad.buttons.map((btn) => btn.pressed);
    const isDown = (list) => list.some((i) => down[i]);
    // Only the frame a button goes down counts, so holding a button never repeats attacks.
    const justPressed = (i) => down[i] && !this.prev[i];

    // Left stick with deadzone, rescaled so movement starts smoothly at the deadzone edge.
    const x = pad.axes[b.moveAxis] || 0;
    const ax = Math.abs(x);
    let move = ax > b.deadzone ? Math.sign(x) * Math.min(1, (ax - b.deadzone) / (1 - b.deadzone) * 1.4) : 0;
    if (isDown(b.left)) move = -1;
    if (isDown(b.right)) move = 1;
    input.move = move;

    input.jump = isDown(b.jump);
    for (const [i, action] of Object.entries(b.actions)) if (justPressed(+i)) input.actions.push(action);
    input.restart = b.restart.some(justPressed);

    this.prev = down;
    return input;
  }
}
