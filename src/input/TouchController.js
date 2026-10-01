/*
 * On-screen touch controls (only created on touch devices).
 * Produces the same input object as KeyboardController / GamepadController and is merged
 * with them in CombinedController, so it drives exactly the same fighter actions.
 *
 * Left side: a move pad (hold the left or right half; sliding between them works).
 * Right side: JUMP, PUNCH, KICK, STRONG, BLOCK (hold), SPECIAL.
 *
 * One touch = one action: attacks fire on the touch's first contact only (one pointerdown
 * per finger), mouse/click emulation is suppressed, and the fighter's own rules (special
 * meter, cooldowns, input buffer) still apply on top.
 */
const BUTTONS = [
  // [action, label, kind] - kind: 'tap' (fires once per touch) or 'hold'
  ['special', 'SP', 'tap'],
  ['strong', 'STR', 'tap'],
  ['jump', 'JUMP', 'tap'],
  ['block', 'BLK', 'hold'],
  ['punch', 'P', 'tap'],
  ['kick', 'K', 'tap'],
];

export function isTouchDevice() {
  return (window.matchMedia?.('(pointer: coarse)').matches ?? false) || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

export class TouchController {
  constructor() {
    this.pressed = []; // attack taps since last poll
    this.jumpQueued = false; // a tap shorter than one frame still jumps
    this.held = { block: new Set(), jump: new Set() }; // pointer ids holding a button
    this.movePointers = new Map(); // pointer id -> -1 | 1

    document.body.classList.add('touch');
    const root = document.createElement('div');
    root.className = 'touch-controls';
    root.innerHTML = `
      <div class="touch-move"><div class="touch-half" data-dir="-1">&#9664;</div><div class="touch-half" data-dir="1">&#9654;</div></div>
      <div class="touch-actions">${BUTTONS.map(([a, label]) => `<div class="touch-btn" data-action="${a}">${label}</div>`).join('')}</div>
      <div class="touch-rotate">Rotate your phone for the best experience</div>`;
    document.body.appendChild(root);
    this.root = root;
    this.specialBtn = root.querySelector('[data-action="special"]');

    // No scrolling / zooming / long-press menus while playing.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.target.closest?.('.touch-controls')) e.preventDefault(); }, { passive: false });

    this.setupMovePad(root.querySelector('.touch-move'));
    for (const el of root.querySelectorAll('.touch-btn')) this.setupButton(el);
  }

  setupMovePad(pad) {
    const dirAt = (e) => {
      const r = pad.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? -1 : 1;
    };
    const update = () => {
      const dirs = new Set(this.movePointers.values());
      for (const half of pad.children) half.classList.toggle('active', dirs.has(+half.dataset.dir));
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      this.movePointers.set(e.pointerId, dirAt(e));
      update();
    });
    pad.addEventListener('pointermove', (e) => {
      if (!this.movePointers.has(e.pointerId)) return;
      this.movePointers.set(e.pointerId, dirAt(e)); // slide between left and right
      update();
    });
    const end = (e) => { this.movePointers.delete(e.pointerId); update(); };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  setupButton(el) {
    const action = el.dataset.action;
    const kind = BUTTONS.find(([a]) => a === action)[2];
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // also stops the emulated mouse/click events
      el.setPointerCapture(e.pointerId);
      el.classList.add('active');
      if (action === 'jump') { this.held.jump.add(e.pointerId); this.jumpQueued = true; }
      else if (action === 'block') this.held.block.add(e.pointerId);
      else if (kind === 'tap') this.pressed.push(action); // exactly once per touch
    });
    const end = (e) => {
      if (action === 'jump') this.held.jump.delete(e.pointerId);
      if (action === 'block') this.held.block.delete(e.pointerId);
      const stillHeld = (action === 'jump' && this.held.jump.size) || (action === 'block' && this.held.block.size);
      if (!stillHeld) el.classList.remove('active');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  setVisible(v) { this.root.classList.toggle('hidden', !v); }

  /** Dim the SP button while the special meter is recharging (visual hint only). */
  setSpecialReady(ready) { this.specialBtn.classList.toggle('ready', ready); }

  /** Called once per fixed step. */
  getInput() {
    const actions = this.pressed;
    this.pressed = [];
    let move = 0;
    for (const d of this.movePointers.values()) move += d;
    const jump = this.jumpQueued || this.held.jump.size > 0;
    this.jumpQueued = false;
    return { move: Math.max(-1, Math.min(1, move)), jump, block: this.held.block.size > 0, actions };
  }
}
