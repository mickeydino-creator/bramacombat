import { QUALITY_LEVELS } from '../core/Settings.js';
import { SPECIAL_METER } from '../abilities/specials.js';

/*
 * Main menu / pause menu / how to play / settings.
 * Works with mouse/touch (buttons), keyboard (arrows/WASD + Enter/Space, Esc = back)
 * and gamepad (D-pad/left stick, A = select, B = back, Start = resume when paused).
 * Game actions are passed in as callbacks; the menu doesn't touch gameplay itself.
 */
const fullscreenSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function toggleFullscreen() {
  try {
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const p = req.call(el, { navigationUI: 'hide' });
      p?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  } catch { /* not allowed here */ }
}

const HOW_TO_PLAY = `
  <div class="howto-grid">
    <section><h3>KEYBOARD</h3>
      <p><kbd>A</kbd> <kbd>D</kbd> Move</p><p><kbd>W</kbd> Jump</p>
      <p><kbd>J</kbd> Punch</p><p><kbd>K</kbd> Kick</p><p><kbd>L</kbd> Strong attack</p>
      <p><kbd>Shift</kbd> (hold) Block</p><p><kbd>I</kbd> Special</p><p><kbd>Esc</kbd> Pause</p></section>
    <section><h3>XBOX CONTROLLER</h3>
      <p><kbd>Left stick</kbd> / <kbd>D-pad</kbd> Move</p><p><kbd>A</kbd> Jump</p>
      <p><kbd>X</kbd> Punch</p><p><kbd>B</kbd> Kick</p><p><kbd>Y</kbd> Strong attack</p>
      <p><kbd>RT</kbd> (hold) Block</p><p><kbd>RB</kbd> Special</p><p><kbd>Start</kbd> Pause</p></section>
    <section><h3>MOBILE</h3>
      <p><kbd>&#9664;</kbd> <kbd>&#9654;</kbd> (hold) Move</p><p><kbd>JUMP</kbd> Jump</p>
      <p><kbd>P</kbd> Punch</p><p><kbd>K</kbd> Kick</p><p><kbd>STR</kbd> Strong attack</p>
      <p><kbd>BLK</kbd> (hold) Block</p><p><kbd>SP</kbd> Special</p><p><kbd>II</kbd> Pause</p></section>
  </div>
  <div class="howto-rules">
    <p><b>Attacks</b> - Punch is fast, kick reaches further, strong attack is slow but hits hard. Every attack has a wind-up, so time it.</p>
    <p><b>Blocking</b> - Hold block to reduce damage from the front (attacks from behind still hurt). Blocking slows you down and drains <b>STAMINA</b>; at zero your guard breaks.</p>
    <p><b>Jumping</b> - Jump over attacks or over your opponent to hit them from behind.</p>
    <p><b>Special</b> - Usable when the gold <b>SPECIAL</b> meter is full. Using it empties the meter; it refills in ${SPECIAL_METER.rechargeSeconds} seconds. The AI follows the same rules.</p>
  </div>`;

export class Menu {
  constructor({ settings, sfx, gamepad, onStart, onResume, onRestart, onMainMenu }) {
    Object.assign(this, { settings, sfx, gamepad, onStart, onResume, onRestart, onMainMenu });
    this.stack = [];
    const el = document.createElement('div');
    el.className = 'menu-root';
    el.innerHTML = `
      <div class="menu-screen" data-screen="main">
        <h1 class="logo">BRAMA<span>COMBAT</span></h1>
        <button data-act="start" class="primary">START</button>
        <button data-go="howto">HOW TO PLAY</button>
        <button data-go="settings">SETTINGS</button>
      </div>
      <div class="menu-screen" data-screen="pause">
        <h2>PAUSED</h2>
        <button data-act="resume" class="primary">RESUME</button>
        <button data-act="restart">RESTART</button>
        <button data-go="howto">HOW TO PLAY</button>
        <button data-go="settings">SETTINGS</button>
        <button data-act="mainmenu">MAIN MENU</button>
      </div>
      <div class="menu-screen wide" data-screen="howto">
        <h2>HOW TO PLAY</h2>
        <div class="menu-scroll">${HOW_TO_PLAY}</div>
        <button data-act="back" class="back">BACK</button>
      </div>
      <div class="menu-screen" data-screen="settings">
        <h2>SETTINGS</h2>
        <div class="setting"><label>MASTER VOLUME</label><input type="range" min="0" max="1" step="0.05" data-setting="master"><span class="val"></span></div>
        <div class="setting"><label>SFX VOLUME</label><input type="range" min="0" max="1" step="0.05" data-setting="sfx"><span class="val"></span></div>
        <div class="setting"><label>MUSIC VOLUME</label><input type="range" min="0" max="1" step="0.05" data-setting="music"><span class="val"></span></div>
        <div class="setting fs-row"><label>FULLSCREEN</label><button data-act="fullscreen" class="toggle">OFF</button></div>
        <div class="setting"><label>GRAPHICS</label><div class="segmented">${QUALITY_LEVELS.map((q) => `<button data-quality="${q}">${q.toUpperCase()}</button>`).join('')}</div></div>
        <button data-act="back" class="back">BACK</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    if (!fullscreenSupported()) el.querySelector('.fs-row').remove();

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.sfx.ui();
      if (b.dataset.go) this.show(b.dataset.go);
      else if (b.dataset.quality) this.settings.set('quality', b.dataset.quality);
      else this.act(b.dataset.act);
    });
    for (const input of el.querySelectorAll('input[type=range]')) {
      input.addEventListener('input', () => this.settings.set(input.dataset.setting, +input.value));
    }
    settings.onChange((v) => this.syncSettings(v));
    document.addEventListener('fullscreenchange', () => this.syncSettings(settings.values));
    document.addEventListener('webkitfullscreenchange', () => this.syncSettings(settings.values));
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.padPrev = [];
  }

  get visible() { return this.stack.length > 0; }
  get current() { return this.stack[this.stack.length - 1]; }

  act(a) {
    if (a === 'start') { this.close(); this.onStart(); }
    else if (a === 'resume') { this.close(); this.onResume(); }
    else if (a === 'restart') { this.close(); this.onRestart(); }
    else if (a === 'mainmenu') this.onMainMenu();
    else if (a === 'back') this.back();
    else if (a === 'fullscreen') toggleFullscreen();
  }

  /** Open a screen on top of the current one (BACK returns). `reset` starts a new stack. */
  show(name, reset = false) {
    if (reset) this.stack = [];
    this.stack.push(name);
    this.render();
  }

  back() {
    if (this.stack.length > 1) { this.stack.pop(); this.render(); }
    else if (this.current === 'pause') { this.close(); this.onResume(); }
  }

  close() { this.stack = []; this.render(); }

  render() {
    this.el.classList.toggle('show', this.visible);
    for (const s of this.el.querySelectorAll('.menu-screen')) s.classList.toggle('active', s.dataset.screen === this.current);
    this.padPrev = this.readPad(); // a held button doesn't immediately act on the new screen
    if (this.visible) this.focusables()[0]?.focus({ preventScroll: true });
  }

  syncSettings(v) {
    for (const input of this.el.querySelectorAll('input[type=range]')) {
      input.value = v[input.dataset.setting];
      input.nextElementSibling.textContent = `${Math.round(v[input.dataset.setting] * 100)}%`;
    }
    for (const b of this.el.querySelectorAll('[data-quality]')) b.classList.toggle('on', b.dataset.quality === v.quality);
    const fs = this.el.querySelector('[data-act=fullscreen]');
    if (fs) { fs.textContent = isFullscreen() ? 'ON' : 'OFF'; fs.classList.toggle('on', isFullscreen()); }
  }

  focusables() {
    const screen = this.el.querySelector('.menu-screen.active');
    return screen ? [...screen.querySelectorAll('button, input')] : [];
  }

  moveFocus(dir) {
    const list = this.focusables();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    list[(i + dir + list.length) % list.length].focus({ preventScroll: false });
    this.sfx.ui();
  }

  /** Left/right on a slider or the graphics selector. */
  adjust(dir) {
    const a = document.activeElement;
    if (a?.type === 'range') {
      const v = Math.max(0, Math.min(1, +a.value + dir * 0.05));
      this.settings.set(a.dataset.setting, Math.round(v * 20) / 20);
    } else if (a?.dataset.quality) {
      const i = QUALITY_LEVELS.indexOf(this.settings.get('quality'));
      const q = QUALITY_LEVELS[Math.max(0, Math.min(QUALITY_LEVELS.length - 1, i + dir))];
      this.settings.set('quality', q);
      this.el.querySelector(`[data-quality="${q}"]`).focus();
    } else return;
    this.sfx.ui();
  }

  onKey(e) {
    if (!this.visible) return;
    const k = e.code;
    if (k === 'ArrowUp' || k === 'KeyW') this.moveFocus(-1);
    else if (k === 'ArrowDown' || k === 'KeyS') this.moveFocus(1);
    else if (k === 'ArrowLeft' || k === 'KeyA') this.adjust(-1);
    else if (k === 'ArrowRight' || k === 'KeyD') this.adjust(1);
    else if (k === 'Enter' || k === 'Space') document.activeElement?.tagName === 'BUTTON' && document.activeElement.click();
    else if (k === 'Escape' || k === 'Backspace') this.back();
    else return;
    e.preventDefault(); // also stops the native Enter -> click, so a press never fires twice
    e.stopImmediatePropagation();
  }

  readPad() {
    const pad = this.gamepad?.findPad();
    if (!pad) return [];
    const b = pad.buttons.map((x) => x.pressed);
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    return { up: b[12] || ay < -0.6, down: b[13] || ay > 0.6, left: b[14] || ax < -0.6, right: b[15] || ax > 0.6, a: b[0], b: b[1], start: b[9] };
  }

  /** Gamepad navigation; called every frame by Game. */
  update() {
    if (!this.visible) return;
    const now = this.readPad();
    const prev = this.padPrev || {};
    const pressed = (k) => now[k] && !prev[k];
    this.padPrev = now;
    if (pressed('up')) this.moveFocus(-1);
    if (pressed('down')) this.moveFocus(1);
    if (pressed('left')) this.adjust(-1);
    if (pressed('right')) this.adjust(1);
    if (pressed('a') && document.activeElement?.tagName === 'BUTTON') document.activeElement.click();
    if (pressed('b')) this.back();
    if (pressed('start') && this.current === 'pause') { this.close(); this.onResume(); }
  }
}
