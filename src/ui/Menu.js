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
      <p><kbd>J</kbd> Punch</p><p><kbd>K</kbd> Kick</p><p><kbd>L</kbd> Strong attack (special)</p>
      <p><kbd>Shift</kbd> (hold) Block</p><p><kbd>Esc</kbd> Pause</p></section>
    <section><h3>XBOX CONTROLLER</h3>
      <p><kbd>Left stick</kbd> / <kbd>D-pad</kbd> Move</p><p><kbd>A</kbd> Jump</p>
      <p><kbd>X</kbd> Punch</p><p><kbd>B</kbd> Kick</p><p><kbd>Y</kbd> Strong attack (special)</p>
      <p><kbd>RT</kbd> (hold) Block</p><p><kbd>Start</kbd> Pause</p></section>
    <section><h3>MOBILE</h3>
      <p><i>Left side</i></p><p><kbd>&#9664;</kbd> <kbd>&#9654;</kbd> (hold) Move</p><p><kbd>JUMP</kbd> Jump</p>
      <p><i>Right side</i></p><p><kbd>P</kbd> Punch</p><p><kbd>K</kbd> Kick</p><p><kbd>STR</kbd> Strong attack (special)</p>
      <p><kbd>BLK</kbd> (hold) Block / shield</p><p><kbd>II</kbd> Pause</p></section>
  </div>
  <div class="howto-rules">
    <p><b>Attacks</b> - Punch is fast, kick reaches further. Every attack has a wind-up, so time it.</p>
    <p><b>Blocking</b> - Hold block to reduce damage from the front (attacks from behind still hurt). Blocking slows you down and drains <b>STAMINA</b>; at zero your guard breaks.</p>
    <p><b>Jumping</b> - Jump over attacks or over your opponent to hit them from behind.</p>
    <p><b>Strong attack = special</b> - A slow, hard-hitting blow. Usable only when the gold <b>SPECIAL</b> meter is full; using it empties the meter and it refills in ${SPECIAL_METER.rechargeSeconds} seconds. The AI follows the same rules.</p>
  </div>`;

/*
 * GAME MODES (PLAY screen). To add a mode later: set `available: true` and give it an `act`
 * that Menu.act() handles (and a callback from Game). Locked modes are shown but can't be entered.
 */
export const GAME_MODES = [
  { id: 'ai', title: 'VS AI', desc: 'Fight the computer', available: true, act: 'start' },
  { id: 'multiplayer', title: 'MULTIPLAYER', desc: 'Coming later', available: false },
  { id: 'friends', title: 'VS FRIENDS', desc: 'Coming later', available: false },
];

// Hand-drawn padlock (ink outline, uneven strokes)
const LOCK_ICON = `<svg class="lock" viewBox="0 0 32 36" aria-hidden="true">
  <path d="M9.5 15.5 C9 9.5 10.5 4.2 16.2 4 C21.8 3.9 23.2 9 22.6 15.4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="M5.2 15.8 C12 14.6 20 14.9 27 15.4 C27.6 21 27.4 27 26.8 32.2 C19.5 33 12.6 32.8 5.6 32.3 C4.9 26.6 4.8 21 5.2 15.8 Z" fill="#ffd93b" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M16 21.5 L16 26.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
</svg>`;

const modeButton = (m) => m.available
  ? `<button class="mode" data-act="${m.act}" data-mode="${m.id}"><span class="mode-title">${m.title}</span><span class="mode-desc">${m.desc}</span></button>`
  : `<button class="mode locked" data-locked="${m.id}" aria-disabled="true"><span class="mode-title">${m.title}</span>`
    + `<span class="mode-desc">${LOCK_ICON}${m.desc}</span></button>`;

export class Menu {
  constructor({ settings, sfx, gamepad, onStart, onResume, onRestart, onMainMenu }) {
    Object.assign(this, { settings, sfx, gamepad, onStart, onResume, onRestart, onMainMenu });
    this.stack = [];
    const el = document.createElement('div');
    el.className = 'menu-root';
    el.innerHTML = `
      <div class="menu-screen" data-screen="main">
        <h1 class="logo">BRAMA<span>COMBAT</span></h1>
        <button data-go="modes" class="primary">PLAY</button>
        <button data-go="howto">HOW TO PLAY</button>
        <button data-go="settings">SETTINGS</button>
      </div>
      <div class="menu-screen" data-screen="modes">
        <h2>GAME MODE</h2>
        ${GAME_MODES.map(modeButton).join('\n        ')}
        <p class="mode-note" aria-live="polite"></p>
        <button data-act="back" class="back">BACK</button>
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
        <div class="setting"><label>ANNOUNCER VOICE</label><button data-act="voice" class="toggle">ON</button></div>
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
      if (b.dataset.locked) this.locked(b);
      else if (b.dataset.go) this.show(b.dataset.go);
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
    else if (a === 'voice') this.settings.set('voice', !this.settings.get('voice'));
  }

  /** A locked mode was picked: shake it and say it's coming later; nothing else happens. */
  locked(b) {
    const m = GAME_MODES.find((x) => x.id === b.dataset.locked);
    b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
    const note = this.el.querySelector('.mode-note');
    note.textContent = `${m.title} is locked - coming in a later update!`;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => { note.textContent = ''; }, 2200);
  }

  /** Open a screen on top of the current one (BACK returns). `reset` starts a new stack. */
  show(name, reset = false) {
    if (reset) this.stack = [];
    const note = this.el.querySelector('.mode-note'); if (note) note.textContent = '';
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
    const vb = this.el.querySelector('[data-act=voice]');
    vb.textContent = v.voice ? 'ON' : 'OFF'; vb.classList.toggle('on', !!v.voice);
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
