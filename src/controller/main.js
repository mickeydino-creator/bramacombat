import '@fontsource/permanent-marker';
import '@fontsource/patrick-hand';
import '../ui/hud.css';
import './controller.css';
import { TouchController } from '../input/TouchController.js';
import { NetClient } from '../net/NetClient.js';
import { InputSender } from '../net/InputSender.js';
import { NetBanner } from '../ui/NetBanner.js';
import { CHARACTERS } from '../config/characters.js';
import { ROSTER } from '../config/modes.js';
import { ROLES, ROOM_TYPES, normalizeCode, isValidCode, sanitizeName, errorMessage } from '../../shared/protocol.js';

/*
 * PHONE CONTROLLER page (/controller.html?room=ABCD).
 *
 * Joins a PHONE CONTROLLERS room and turns the phone into a gamepad for one fighter. The buttons are the game's own
 * on-screen touch controls (TouchController: LEFT / RIGHT, JUMP, PUNCH, KICK, STR = strong attack = the special,
 * BLK = block), so a phone sends exactly the same actions as the keyboard, an Xbox pad or the touch controls inside the
 * game. Only the input travels; the match itself runs on the host computer (host-authoritative, see docs/MULTIPLAYER.md).
 *
 * It survives what phones do: the screen locking, switching apps, losing Wi-Fi (automatic reconnect to the same fighter)
 * and page reloads (the room is remembered for this tab).
 */
const NAME_KEY = 'doodle-brawl-name';
const root = document.getElementById('ctl');
const color = (i) => `#${CHARACTERS[ROSTER[i]].appearance.colors.body.toString(16).padStart(6, '0')}`;
const $ = (sel) => root.querySelector(sel);

root.innerHTML = `
  <section class="ctl-screen" data-s="join">
    <h1 class="logo">DOODLE<span>BRAWL</span></h1>
    <p class="ctl-sub">PHONE CONTROLLER</p>
    <label class="field">ROOM CODE<input class="code-input" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" aria-label="Room code"></label>
    <label class="field">YOUR NAME<input class="name-input" type="text" maxlength="10" autocomplete="off" spellcheck="false" placeholder="Enter your name" aria-label="Your name" required></label>
    <p class="net-status" data-status></p>
    <button class="primary join-btn">JOIN</button>
  </section>
  <section class="ctl-screen" data-s="wait">
    <div class="you-badge"><i class="mdot big"></i><div><div class="you-name"></div><div class="you-sub">your fighter</div></div></div>
    <div class="room-label">ROOM <b class="room-code-small">----</b></div>
    <ul class="slots mini"></ul>
    <p class="net-status" data-status-wait>Waiting for the host to start the match...</p>
    <div class="ctl-buttons"><button class="ready-btn toggle on">READY!</button><button class="leave-btn">LEAVE</button></div>
  </section>
  <section class="ctl-screen" data-s="play">
    <div class="play-head"><i class="mdot"></i><b class="play-name"></b><div class="hp"><div class="hp-fill"></div></div><span class="play-state"></span><button class="menu-btn" aria-label="Leave room">&times;</button></div>
    <div class="ctl-center"><i class="mdot huge"></i><div class="ctl-me"></div><div class="ctl-hint">Hold the arrows to move. Tap to attack.</div></div>
    <div class="over-note">MATCH OVER<br><small>Waiting for the host...</small></div>
    <div class="leave-confirm"><p>Leave the room?</p><button class="primary yes">LEAVE</button><button class="no">STAY</button></div>
  </section>`;

const banner = new NetBanner();
const client = new NetClient();
let touch = null; // created when the match starts (it adds the on-screen buttons to the page)
let sender = null;
let loop = 0;
let me = null; // { id, slot, ... }
let lobby = null;
let wakeLock = null;

function show(screen) {
  for (const s of root.querySelectorAll('.ctl-screen')) s.classList.toggle('active', s.dataset.s === screen);
  document.body.dataset.screen = screen;
}

// -------------------------------------------------------------------- joining

const codeInput = $('.code-input'), nameInput = $('.name-input');
const param = new URLSearchParams(location.search).get('room');
codeInput.value = normalizeCode(param ?? '');
try { nameInput.value = localStorage.getItem(NAME_KEY) || ''; } catch { /* private mode */ }
codeInput.addEventListener('input', () => { codeInput.value = normalizeCode(codeInput.value); });
const status = (text, tone = '') => { const el = $('[data-status]'); el.textContent = text; el.dataset.tone = tone; };

async function join() {
  const code = normalizeCode(codeInput.value);
  if (!isValidCode(code)) { status(errorMessage('INVALID_CODE'), 'error'); return; }
  const name = sanitizeName(nameInput.value, '');
  if (!name) { status(errorMessage('NAME_REQUIRED'), 'error'); nameInput.focus(); return; }
  try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
  status(`Joining room ${code}...`, 'busy');
  $('.join-btn').disabled = true;
  try {
    const joined = await client.join(code, ROLES.CONTROLLER, name);
    entered(joined);
  } catch (e) {
    status(e.code === 'WRONG_ROOM_TYPE' ? 'That room is for online players. Open the game and use ONLINE MULTIPLAYER - JOIN ROOM.' : e.message, 'error');
  }
  $('.join-btn').disabled = false;
}
$('.join-btn').addEventListener('click', join);
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function entered(joined) {
  me = joined.you;
  lobby = joined.lobby;
  status('');
  paintBadge();
  paintLobby();
  if (joined.start) startMatch(joined.start); else show('wait');
}

// -------------------------------------------------------------------- lobby

function paintBadge() {
  if (!me) return;
  const slot = lobby?.members.find((m) => m.id === me.id)?.slot ?? me.slot;
  me.slot = slot;
  for (const dot of root.querySelectorAll('.you-badge .mdot, .play-head .mdot, .ctl-center .mdot')) dot.style.background = color(slot);
  const name = lobby?.members.find((m) => m.id === me.id)?.name ?? me.name ?? '';
  $('.you-name').textContent = name;
  $('.play-name').textContent = name;
  $('.ctl-me').textContent = name;
}

function paintLobby() {
  if (!lobby) return;
  paintBadge();
  $('.room-code-small').textContent = lobby.code;
  $('.slots').innerHTML = lobby.members.map((m, i) => {
    const stat = !m.connected ? ['RECONNECTING', 'bad'] : m.ready ? ['READY', 'good'] : ['NOT READY', 'warn'];
    return `<li class="slot"><i class="mdot" style="background:${color(i)}"></i><span class="pname">${m.name.replace(/[<>&"]/g, '')}${m.id === me?.id ? ' (you)' : ''}</span>${m.host ? '<span class="badge host">HOST</span>' : ''}<span class="badge ${stat[1]}">${stat[0]}</span></li>`;
  }).join('');
  const mine = lobby.members.find((m) => m.id === me?.id);
  const btn = $('.ready-btn');
  if (mine) { btn.textContent = mine.ready ? 'READY!' : 'NOT READY'; btn.classList.toggle('on', mine.ready); }
  const w = $('[data-status-wait]');
  w.textContent = lobby.notice || 'Waiting for the host to start the match...';
}

client.on('lobby', (m) => { lobby = m; paintLobby(); });
$('.ready-btn').addEventListener('click', () => {
  const mine = lobby?.members.find((x) => x.id === me?.id);
  client.send({ t: 'ready', ready: !(mine?.ready) });
});

// -------------------------------------------------------------------- playing

client.on('start', (info) => startMatch(info));

function startMatch(info) {
  const mine = info.players.find((p) => p.id === me.id);
  if (!mine) return;
  me.slot = mine.slot;
  paintBadge();
  show('play');
  document.body.classList.remove('match-over');
  $('.leave-confirm').classList.remove('show');
  if (!touch) {
    touch = new TouchController(); // the game's own on-screen controls: the same actions as keyboard / Xbox pad
    const label = (action, html) => { const el = touch.root.querySelector(`[data-action="${action}"]`); if (el) el.innerHTML = html; };
    label('punch', 'PUNCH'); label('kick', 'KICK'); label('block', 'BLOCK'); label('strong', 'STRONG<small>SPECIAL</small>'); // (strong attack = special ability)
  }
  touch.setVisible(true);
  sender = new InputSender(client);
  clearInterval(loop);
  loop = setInterval(() => sender.send(touch.getInput()), 1000 / 60);
  updateHp(100, true);
  $('.play-state').textContent = '';
  holdScreenAwake();
}

function updateHp(hp, alive) {
  $('.hp-fill').style.width = `${Math.max(0, Math.min(100, hp))}%`;
  $('.hp').classList.toggle('low', hp <= 25);
}

client.on('status', (m) => {
  if (!me || document.body.dataset.screen !== 'play') return;
  const hp = m.hp?.[me.slot] ?? 100;
  const alive = m.al?.[me.slot] !== 0;
  updateHp(hp, alive);
  const over = m.ph === 'podium' || m.ph === 'over';
  document.body.classList.toggle('match-over', over);
  touch?.setVisible(!over);
  $('.play-state').textContent = over ? (m.w === me.slot ? 'WINNER!' : '') : !alive ? 'K.O.' : '';
  if (over) sender?.release();
});

// leaving
function leave() {
  clearInterval(loop);
  client.leave();
  touch?.setVisible(false);
  me = null; lobby = null;
  banner.set('host', null);
  show('join');
}
$('.leave-btn').addEventListener('click', leave);
$('.menu-btn').addEventListener('click', () => $('.leave-confirm').classList.add('show'));
$('.leave-confirm .no').addEventListener('click', () => $('.leave-confirm').classList.remove('show'));
$('.leave-confirm .yes').addEventListener('click', leave);

// -------------------------------------------------------------------- connection problems

client.on('closed', (m) => { leave(); status(m.message || 'The room closed.', 'error'); });
client.on('ended', (m) => { clearInterval(loop); touch?.setVisible(false); show('wait'); lobby && (lobby.notice = m.message); paintLobby(); });
client.on('host', (m) => {
  clearTimeout(hostTimer);
  if (m.connected) { banner.set('host', null); return; }
  const until = performance.now() + (m.graceMs ?? 30000);
  const tick = () => {
    const s = Math.max(0, Math.ceil((until - performance.now()) / 1000));
    banner.set('host', `The host lost connection. Waiting... ${s}s`, { priority: 4 });
    hostTimer = setTimeout(tick, 500);
  };
  tick();
});
let hostTimer = 0;
client.on('reconnected', (m) => {
  me = m.joined.you; lobby = m.joined.lobby;
  banner.set('conn', 'Reconnected!', { seconds: 2, tone: 'good', priority: 2 });
  paintLobby();
  if (m.joined.start && document.body.dataset.screen !== 'play') startMatch(m.joined.start);
});
client.on('gaveup', (m) => { leave(); status(m.code === 'REJOIN_FAILED' ? 'The room is no longer available.' : 'Connection lost. Could not get back into the room.', 'error'); });
client.onStatus((s) => {
  if (s === 'reconnecting') { banner.set('conn', 'Connection lost. Reconnecting...', { priority: 4 }); sender?.release?.(); }
  else if (s === 'open') banner.set('conn', null);
});

// -------------------------------------------------------------------- phone behaviour

/** Keep the screen on while playing (and get it back after the phone was locked). */
async function holdScreenAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed / not supported */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sender?.release?.();
  else if (document.body.dataset.screen === 'play') holdScreenAwake();
});
// No page scrolling, pinch zoom, double-tap zoom or pull-to-refresh while the buttons are in use.
document.addEventListener('touchmove', (e) => { if (!e.target.closest?.('input, .slots')) e.preventDefault(); }, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault());

// A reload keeps the player in their room (same fighter): rejoin automatically.
(async () => {
  show('join');
  if (!client.loadCreds()) return;
  status('Reconnecting to your room...', 'busy');
  try {
    const joined = await client.resumeSaved(true);
    if (joined) { entered(joined); return; }
  } catch { /* the room is gone: fall through to the join form */ }
  status('');
})();
