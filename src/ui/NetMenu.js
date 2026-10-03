import { ROOM_TYPES, ROLES, MAX_PLAYERS, normalizeCode, isValidCode, sanitizeName, errorMessage } from '../../shared/protocol.js';
import { CHARACTERS } from '../config/characters.js';
import { ROSTER } from '../config/modes.js';
import { NetSession } from '../net/NetSession.js';
import { joinUrl, controllerUrl, isLocalAddress } from '../net/config.js';

/*
 * VS FRIENDS menus: the choice screen, online create / join, and the lobby (room code, QR code, players).
 * Screens are added to the normal Menu (same notebook look, same keyboard / gamepad navigation).
 *
 *   PLAY -> VS FRIENDS -> PHONE CONTROLLERS ---------> lobby (host) -> START -> match on this computer
 *                      -> ONLINE MULTIPLAYER -> CREATE ROOM --------> lobby (host)
 *                                            -> JOIN ROOM (code) ---> lobby (player)
 *
 * The room itself lives in NetSession; this file only draws it and forwards button presses.
 */
const NAME_KEY = 'doodle-brawl-name';
const bodyColor = (i) => `#${CHARACTERS[ROSTER[i]].appearance.colors.body.toString(16).padStart(6, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SCREENS = `
  <div class="menu-screen" data-screen="friends">
    <h2>VS FRIENDS</h2>
    <button class="mode" data-act="net-phone"><span class="mode-title">PHONE CONTROLLERS</span><span class="mode-desc">Play together on this computer. Friends use their phones as controllers.</span></button>
    <button class="mode" data-go="online"><span class="mode-title">ONLINE MULTIPLAYER</span><span class="mode-desc">Friends join from their own devices over the internet.</span></button>
    <p class="net-status" data-status="friends" aria-live="polite"></p>
    <button data-act="back" class="back">BACK</button>
  </div>
  <div class="menu-screen" data-screen="online">
    <h2>ONLINE</h2>
    <button class="mode" data-act="net-create"><span class="mode-title">CREATE ROOM</span><span class="mode-desc">You host. Share the code or QR with friends.</span></button>
    <button class="mode" data-go="join"><span class="mode-title">JOIN ROOM</span><span class="mode-desc">Enter a friend's room code.</span></button>
    <p class="net-status" data-status="online" aria-live="polite"></p>
    <button data-act="back" class="back">BACK</button>
  </div>
  <div class="menu-screen" data-screen="join">
    <h2>JOIN ROOM</h2>
    <label class="field">ROOM CODE<input class="code-input" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" aria-label="Room code"></label>
    <label class="field">YOUR NAME<input class="name-input" type="text" maxlength="10" autocomplete="off" spellcheck="false" placeholder="PLAYER" aria-label="Your name"></label>
    <p class="net-status" data-status="join" aria-live="polite"></p>
    <button data-act="net-join" class="primary">JOIN</button>
    <button data-act="back" class="back">BACK</button>
  </div>
  <div class="menu-screen wide lobby" data-screen="lobby">
    <h2>LOBBY</h2>
    <div class="lobby-grid">
      <div class="lobby-code">
        <div class="room-label">ROOM CODE</div>
        <div class="room-code" aria-live="polite">----</div>
        <canvas class="qr" width="160" height="160" aria-label="QR code to join this room"></canvas>
        <div class="room-hint"></div>
        <button data-act="net-share" class="share">SHARE</button>
      </div>
      <div class="lobby-players">
        <ul class="slots"></ul>
        <p class="net-status" data-status="lobby" aria-live="polite"></p>
        <div class="lobby-buttons">
          <button data-act="net-start" class="primary">START GAME</button>
          <button data-act="net-ready" class="toggle">READY</button>
          <button data-act="net-leave">LEAVE ROOM</button>
        </div>
      </div>
    </div>
  </div>`;

export class NetMenu {
  constructor(game) {
    this.game = game;
    this.menu = game.menu;
    this.qrFor = null;
    this.menu.addScreens(SCREENS, {
      'net-phone': () => this.createRoom(ROOM_TYPES.CONTROLLERS, 'friends'),
      'net-create': () => this.createRoom(ROOM_TYPES.ONLINE, 'online'),
      'net-join': () => this.joinFromForm(),
      'net-share': () => this.share(),
      'net-ready': () => { const me = this.session?.me; if (me) this.session.setReady(!me.ready); },
      'net-start': () => this.start(),
      'net-leave': () => this.leaveRoom(),
    }, {
      lobby: () => { this.leaveRoom(); return true; }, // BACK / Esc in the lobby = leave the room
    });
    const root = this.menu.el;
    this.codeInput = root.querySelector('.code-input');
    this.nameInput = root.querySelector('.name-input');
    this.codeInput.addEventListener('input', () => { this.codeInput.value = normalizeCode(this.codeInput.value); });
    this.nameInput.value = this.savedName();
    this.nameInput.addEventListener('change', () => this.saveName());
  }

  get session() { return this.game.session; }

  savedName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
  saveName() { try { localStorage.setItem(NAME_KEY, sanitizeName(this.nameInput.value, '')); } catch { /* private mode */ } }
  playerName(fallback) { return sanitizeName(this.nameInput.value || this.savedName(), fallback); }

  status(screen, text, tone = '') {
    const el = this.menu.el.querySelector(`[data-status="${screen}"]`);
    if (!el) return;
    el.textContent = text || '';
    el.dataset.tone = tone;
  }

  // ------------------------------------------------------------------ flows

  freshSession() {
    if (this.game.session) this.game.session.leave();
    const session = new NetSession(this.game);
    this.game.session = session;
    session.onChange(() => this.render());
    return session;
  }

  /** CREATE ROOM / PHONE CONTROLLERS: make the room, then show the lobby. Errors stay on the screen the player pressed on. */
  async createRoom(type, fromScreen) {
    this.status(fromScreen, 'Creating room...', 'busy');
    const session = this.freshSession();
    const ok = await session.createRoom(type, this.playerName('HOST'));
    if (!ok) {
      this.game.session = null;
      this.status(fromScreen, session.error?.message ?? errorMessage('CONNECTION_FAILED'), 'error');
      return;
    }
    this.status(fromScreen, '');
    this.menu.show('lobby');
    this.render();
  }

  async joinFromForm() {
    const code = normalizeCode(this.codeInput.value);
    if (!isValidCode(code)) { this.status('join', errorMessage('INVALID_CODE'), 'error'); this.codeInput.focus(); return; }
    this.saveName();
    await this.join(code);
  }

  async join(code) {
    this.status('join', `Joining room ${code}...`, 'busy');
    const session = this.freshSession();
    const ok = await session.joinRoom(code, ROLES.PLAYER, this.playerName('PLAYER'));
    if (!ok) {
      this.game.session = null;
      this.status('join', session.error?.message ?? errorMessage('CONNECTION_FAILED'), 'error');
      return;
    }
    this.status('join', '');
    this.menu.show('lobby');
    this.render();
  }

  /** Opened from a shared link (?join=ABCD): show the join screen with the code filled in and join straight away. */
  openJoin(code) {
    this.codeInput.value = normalizeCode(code);
    this.menu.show('join', true);
    this.status('join', '');
    if (isValidCode(this.codeInput.value)) this.join(this.codeInput.value);
  }

  /** Page reload while in a room: put the player back where they were. */
  async resume() {
    const session = this.freshSession();
    if (!(await session.resume())) { this.game.session = null; return false; }
    if (session.phase === 'lobby') { this.menu.show('lobby', true); this.render(); }
    return true;
  }

  start() {
    const s = this.session;
    if (!s?.isHost) return;
    const blocker = s.startBlocker();
    if (blocker) { this.status('lobby', blocker, 'error'); return; }
    s.requestStart();
  }

  leaveRoom() {
    this.game.session?.leave();
    this.game.session = null;
    this.menu.pop(); // back to the screen before the lobby (the room is already gone)
  }

  async share() {
    const s = this.session;
    if (!s?.code) return;
    const url = s.type === ROOM_TYPES.CONTROLLERS ? controllerUrl(s.code) : joinUrl(s.code);
    const text = s.type === ROOM_TYPES.CONTROLLERS ? `Use your phone as a Doodle Brawl controller! Room ${s.code}` : `Join my Doodle Brawl room ${s.code}!`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Doodle Brawl', text, url }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      this.status('lobby', 'Link copied! Send it to your friends.', 'good');
    } catch {
      this.status('lobby', url, 'good'); // (clipboard blocked: show it so it can be copied by hand)
    }
  }

  // ------------------------------------------------------------------ drawing the lobby

  render() {
    const s = this.session;
    const root = this.menu.el.querySelector('[data-screen=lobby]');
    if (!s || !root) return;
    const isHost = s.isHost;
    root.classList.toggle('is-host', isHost);
    root.querySelector('.room-code').textContent = s.code ?? '----';
    root.querySelector('.lobby-code').classList.toggle('no-qr', !isHost);
    root.querySelector('.share').style.display = isHost ? '' : 'none';

    // players
    const members = s.members;
    const me = s.me;
    root.querySelector('.slots').innerHTML = Array.from({ length: MAX_PLAYERS }, (_, i) => {
      const m = members[i];
      if (!m) return `<li class="slot empty"><i class="mdot"></i><span class="pname">waiting for a friend...</span></li>`;
      const stat = !m.connected ? ['RECONNECTING', 'bad'] : m.ready ? ['READY', 'good'] : ['NOT READY', 'warn'];
      return `<li class="slot"><i class="mdot" style="background:${bodyColor(i)}"></i><span class="pname">${esc(m.name)}${m.id === me?.id ? ' <em>(you)</em>' : ''}</span>`
        + `${m.host ? '<span class="badge host">HOST</span>' : ''}<span class="badge ${stat[1]}">${stat[0]}</span></li>`;
    }).join('');

    // how to join
    const url = s.type === ROOM_TYPES.CONTROLLERS ? controllerUrl(s.code ?? '') : joinUrl(s.code ?? '');
    const hint = root.querySelector('.room-hint');
    if (isHost) {
      const how = s.type === ROOM_TYPES.CONTROLLERS ? 'Scan with a phone camera, or open' : 'Scan, or open the game and choose JOIN ROOM. Link:';
      hint.innerHTML = `${how}<br><b>${esc(url.replace(/^https?:\/\//, ''))}</b>${isLocalAddress() ? '<br><span class="warn">Phones can\'t reach "localhost" - open this page with your computer\'s network address.</span>' : ''}`;
      this.drawQr(url);
    } else {
      hint.textContent = 'Waiting for the host to start the match.';
    }

    // buttons + status
    const start = root.querySelector('[data-act=net-start]');
    const ready = root.querySelector('[data-act=net-ready]');
    start.style.display = isHost ? '' : 'none';
    ready.style.display = isHost ? 'none' : '';
    if (me) { ready.textContent = me.ready ? 'READY!' : 'NOT READY'; ready.classList.toggle('on', me.ready); }
    const blocker = isHost ? s.startBlocker() : null;
    start.classList.toggle('disabled', !!blocker);
    const text = s.notice || (isHost ? (blocker ?? 'Everyone is ready. Press START GAME!') : `${members.length} / ${MAX_PLAYERS} players in the room.`);
    this.status('lobby', text, s.notice ? 'warn' : blocker ? '' : 'good');
  }

  async drawQr(url) {
    if (this.qrFor === url) return;
    this.qrFor = url;
    const canvas = this.menu.el.querySelector('.qr');
    try {
      const QR = await import('qrcode');
      await (QR.default ?? QR).toCanvas(canvas, url, { width: 160, margin: 1, color: { dark: '#25252e', light: '#f7f2e3' } });
    } catch {
      this.qrFor = null; // (the code and link still work without the picture)
    }
  }
}
