# VS FRIENDS - multiplayer guide

Two ways to play, both started from PLAY -> VS FRIENDS:

- **Phone controllers** - everyone sits at one computer. The computer runs the match; each friend's phone is a controller.
- **Online multiplayer** - every player opens the game on their own device. One browser hosts the match.

Rules are the same as everywhere else: 2 players = 1v1 best of 3, 3 or 4 players = free-for-all (last one standing wins), podium at the end.

## Running it

```bash
npm install
npm run dev -- --host        # development: game + room server on one port (the room server is attached to Vite at /ws)
# or, for a real deployment:
npm run build && npm start   # serves dist/ and the room server on PORT (default 8080)
```

Phones and friends must be able to reach the address, so open the game with the computer's network address
(for example `http://192.168.1.20:5173`), not `localhost`. The lobby warns you when it sees `localhost`.
Camera/wake-lock features on phones need HTTPS on a real deployment (the wake lock is optional, the game works without it).

If the page and the room server live on different hosts, build with `VITE_SERVER_URL=wss://...` (see `.env.example`).
Server settings (`PORT`, `HOST`, `ALLOWED_ORIGINS`, `MAX_ROOMS`, `NET_LOG`) are read from the environment. `GET /health` answers `ok`.

## Names and the shared HUD

- Everyone types a name before joining (phones and online players, and the host when creating a room). The server rejects an empty
  name and numbers duplicates ("Alex", "Alex 2"). There are no P1 / P2 labels anywhere.
- In a VS FRIENDS match every screen shows one card per player - name, health, stamina and special meter - in room order. Your own
  card has a YOU badge and a coloured frame; a knocked-out player's card is dimmed with OUT, a reconnecting player shows "...".
  Small name tags float above the other fighters (you have the YOU arrow).
- The cards read the real fighter state (`HUD.configureShared` in `src/ui/HUD.js`, fed from `Game.render`). On the host that is
  the simulation; on online clients it is the host's snapshot. There is no second HUD state. VS AI keeps its own HUD.
- The phone controller only shows your name, a health strip and the buttons: the main screen is the match HUD.

## Architecture

- `shared/protocol.js` - wire protocol (documented in its header), limits, timings, error texts. Used by server and browser.
- `server/rooms.js` - the room server (`ws`). It only manages rooms: slots, ready flags, who may start, reconnect tokens, grace
  periods, rate limits. It relays messages; it does not simulate the fight.
- `src/net/HostMatch.js` - the host browser runs the **normal** `Game` / `Fighter` / `CombatSystem`. Remote players are
  `NetController`s with the same `getInput()` as keyboard / gamepad / AI, so there is a single combat implementation.
- `src/net/ClientMatch.js` - other players mirror the match from snapshots (positions, states, health, stamina, special meter,
  events such as hits, knockouts, round/match phase). The Three.js scene is never synced - only gameplay state.
- `src/net/NetClient.js` - connection: timeouts, readable errors, automatic reconnect with backoff, heartbeat / RTT, page
  refresh and phone sleep recovery (session kept in `sessionStorage`).
- `src/net/InputSender.js` - sends held state (move / jump / block) and attack taps; sequence numbers reject duplicates.
- `src/ui/NetMenu.js` - choice screens and the notebook-style lobby (code, QR, players, ready, host badge, Start, Leave).
- `controller.html` + `src/controller/` - the phone controller page (reuses `TouchController`; landscape, safe areas, no scroll/zoom).

Flow: host sends 60 Hz snapshots -> server relays -> clients render with a small jitter buffer. Clients send inputs -> server -> host.
Attacks, jumps and blocks go through the same input path as the keyboard, so there are no separate combat rules.

## Reliability

Handled with a friendly message: room not found, invalid code, room full (4 max), match already running, host left,
host connection lost, player disconnected (their fighter stays for a grace period, then is forfeited), connection timeout,
failed connection, reconnecting (banner), browser refresh (rejoins automatically), phone sleep/background (reconnects on wake).

- Player drops during a match: 20 s to come back, then forfeit. Lobby: 30 s.
- Host drops: players see "waiting for host" for 30 s, then the room closes.
- Host refreshes the page mid-match: the match cannot survive (it lives in that page), so everyone returns to the lobby.
- Host presses LEAVE / MAIN MENU: the room is closed and everyone is told.

## Known limitations (honest notes)

- **Host-authoritative, not server-authoritative.** The host's browser decides hits. A modified host client could cheat; this is
  fine for friends, not for ranked play. The server validates input shape and rate only.
- No client-side prediction: a remote player sees their own actions after about one round trip (plus ~50 ms buffer). The host's
  own input is delayed slightly (from the measured latency of the other players, up to 5 frames) so the host has less of an advantage.
- Strong attack and Special Ability are one action in this game, so the phone has one button for both.
- The phone controller needs the host page to stay open; the room server keeps no match state.
- Latency testing aid: open the game with `?netlag=150&netjitter=40&netloss=2` to simulate a poor connection.

## Tests

`npm test` runs the server / protocol / input-delay unit tests. End-to-end behaviour (2 and 4 phone controllers, online 1v1 / 3 / 4
FFA, reconnect, host leaving, round transitions, podium, latency) was verified with Playwright against the dev server.
