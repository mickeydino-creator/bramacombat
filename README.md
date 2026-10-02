# Doodle Brawl - 3D fighting prototype

Playable 1v1 (player vs AI) fighting game prototype. Three.js + Vite, plain JavaScript (ES modules).

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173). `npm run build` creates a static build in `dist/`.

## Controls

The game opens on a main menu (PLAY / HOW TO PLAY / SETTINGS). PLAY opens the game-mode screen: **VS AI** (playable),
**MULTIPLAYER** and **VS FRIENDS** (locked, coming later). Modes are listed in `GAME_MODES` in `src/ui/Menu.js`. Menus work with mouse/touch, keyboard
(arrows + Enter, Esc = back) and gamepad (D-pad/stick + A, B = back). In the fight the player is **YOU**, the opponent **AI**.

- Keyboard: A / D move, W jump, J punch, K kick, L strong attack (= the special), hold Shift block, Esc pause, R restart, H hitboxes (debug).
- Xbox / standard gamepad: left stick or D-pad move, A jump, X punch, B kick, Y strong attack (= the special), hold RT block,
  Start pause. Winner screen: A/Start restart, B main menu. Press any button once if the pad isn't detected right away.
- Touch (phones/tablets, shown only on touch devices): left side = JUMP + hold the big left/right pads to move;
  right side = P (punch), K (kick), STR (strong attack = special), hold BLK (block/shield). II (top) pause.

Settings (saved in the browser): master / SFX / music volume, fullscreen, graphics quality (low/medium/high).
The graphics quality is the upper limit: on devices that can't keep ~45+ fps the render resolution steps down
automatically (`adaptResolution` in `src/core/Game.js`). Shaders and effect textures are prepared at startup so the first hit doesn't stutter.
Audio is synthesized with WebAudio (`src/audio/Sfx.js`, music in `src/audio/Music.js`) and starts after the first click/tap/key.
The background music is a relaxed generated groove mixed under the effects (it dips briefly under hits and announcer calls);
to use a recorded track instead, add `"music": "your-track.mp3"` to `public/sounds/sounds.json`.
To use your own sound files, list them in `public/sounds/sounds.json` (see `public/sounds/README.md`).
Recorded clips included: FIGHT! (round start, once per round), KNOCKOUT, FINISH HIM, sad trombone (defeat).

**HUD:** no text labels - icons only: ♥ health, ⚡ stamina, ★ special power (glows when ready, dashed red = not enough stamina).
The AI shows only its health bar; its stamina and special meters still work, they are just hidden.

**Look:** the whole game is a notebook come to life - paper page, blue rules, red margin, pen-outlined props and
stickmen, "boiling" doodles, comic POW! hits and notebook-page menus. Special: golden aura + ring + speed lines and a camera punch-in on activation, KA-POW! burst on hit;
block: hand-drawn shield (`src/fx/BlockShield.js`) with small sparks on each blocked hit. Effects: `src/fx/Effects.js`. Drawing helpers: `src/style/sketch.js`; arena: `src/arena/Arena.js`;
UI: `src/ui/hud.css`. Study-desk props (pencils, markers, erasers, paper balls, clips, ruler, shavings, scraps...) lie around the edges and background: `src/arena/Props.js` (edit `LAYOUT` to add or move things; all baked into 2 draw calls). Fonts: Permanent Marker and Patrick Hand (SIL OFL, bundled via @fontsource).

## Fight modes (PLAY -> VS AI -> number of fighters)

- **2 fighters**: the classic 1v1 (YOU vs AI), best of 3, standard arena.
- **3 fighters**: YOU + 2 AI, free-for-all in a slightly larger arena.
- **4 fighters**: YOU + 3 AI, free-for-all in a much larger arena (the camera pulls back to keep everybody in view).

In a free-for-all everybody can hit everybody (an attack hits the closest fighter it touches), every AI picks its own target
(close or hurt fighters, whoever hit it - not only YOU), and the last fighter standing wins the match (one round, no best-of-3).
The podium ranks fighters by knock-out order (last one down = 2nd, ...). HUD: YOU keep the full bars; each opponent gets one slim
health bar with its color dot on the right. If YOU are knocked out while the AIs fight on, a SKIP button (Enter / gamepad A also work) fast-forwards the rest of the fight with the same rules. With 4 fighters, 4th place gets a hole that opens under them on the podium and they fall through the page.
Everything is table-driven in `src/config/modes.js` (fighters, arena width, spawn points,
rounds to win, camera range) - add an entry there for another player count or arena size. Extra characters (colors) are in
`src/config/characters.js`; AI targeting is `AIController.chooseTarget`; the arena resizes via `arena.setHalfWidth()`.

## Match format

Best of 3: the first fighter to win 2 rounds wins the match (`ROUNDS_TO_WIN` in `src/config/constants.js`), so a match has 2 or 3 rounds.
The small circles next to YOU / AI show round wins. After each round the result ("YOU WIN!" / "AI WINS!") shows briefly, then a notebook
page sweeps across and the next round starts behind it (no podium between rounds). A drawn round (both fighters knocked out together)
awards no point and is replayed. When a fighter reaches 2 wins, the arena folds down into the page, a victory podium rises
(`src/arena/PodiumScene.js`: 1st place in the center and higher, the winner on top; the loser on 2nd), the camera glides over, and the end
screen (RESTART / MAIN MENU) appears over the podium. Match flow lives in `src/core/Game.js` (`endRound`, `stepRoundEnd`, `stepPodium`).

## Project layout

- `src/config/characters.js` - **character configuration**: stats, moves, specials, appearance (see Characters below)
- `src/config/constants.js` - gravity, arena width, input buffer, round timings, block tuning (chip damage, speed, blockstun, stamina drain, guard break)
- `src/fighter/Fighter.js` - fighter state machine, physics, attacks, getting hit
- `src/combat/CombatSystem.js` - hitbox vs hurtbox detection, push collision
- `src/models/StickmanModel.js` + `src/models/stickman/` - rigged stickman model, procedural poses, face, accessories
- `src/models/createModel.js` - builds a fighter's model from its `appearance`
- `src/models/PlaceholderModel.js` - primitive humanoid + the model interface description
- `src/models/GltfModel.js` - ready-made adapter for your own `.glb` characters with animations
- `src/abilities/specials.js` - **the special** (the STRONG ATTACK) and the special meter settings, defined once and shared by player and AI
- `src/abilities/SpecialAbilities.js` - special meter rules: full -> usable, use -> empty, refills in exactly 5s
- `src/abilities/Stamina.js` - stamina (blocking resource), separate from the special meter
- `src/ai/AIController.js` - opponent AI
- `src/input/KeyboardController.js` - key bindings
- `src/input/GamepadController.js` - gamepad bindings (Gamepad API, deadzone, press detection)
- `src/input/TouchController.js` - on-screen touch buttons (touch devices only)
- `src/input/CombinedController.js` - merges keyboard + gamepad + touch into one player input
- `src/core/Game.js` - loop (fixed 60 steps/s), round flow (menu / intro / fight / pause / KO), hitstop, effects/sound hooks
- `src/core/Settings.js` - saved settings (volumes, graphics)
- `src/ui/Menu.js` - main menu, how to play, settings, pause
- `src/camera`, `src/arena`, `src/ui`, `src/fx`, `src/audio` - camera, stage, HUD, hit sparks, generated sound effects (`src/audio/Sfx.js`)

## Characters

All fighters are data in **`src/config/characters.js`**. `defineFighter({...})` deep-merges your values over
`BASE_FIGHTER`, so a new fighter only lists what's different: name, health, walk speed, jump height,
damage multiplier, attack speed, stamina and
`appearance` (model file, colors, face, accessories). Right now both fighters are the same plain stickman
with identical stats; only the body color differs. A copy-paste template is at the bottom of the file.
Pick who fights in `src/core/Game.js`.

- Model: put a rigged humanoid `.glb` (Mixamo-style bone names, T-pose is fine) in `public/models/` and set
  `appearance.url`. No animation clips are needed - poses are procedural (`src/models/stickman/poses.js`).
- Face: `appearance.face = { texture: '/faces/name.png' }` (image in `public/faces/`) or a generated face
  (`src/models/stickman/face.js`).
- Accessories: `appearance.accessories = [{ type: 'headband' | 'belt' | 'wristbands' | 'custom', color }]`
  (`src/models/stickman/accessories.js`).
- Other model kinds: `appearance.type = 'gltf'` (own animation clips, `GltfModel.js`) or `'placeholder'`;
  see `src/models/createModel.js`.

## Balance

Normal attacks are the main damage source; blocking is a defensive tool; specials are a limited opportunity.
Blocking lets 40% of damage through, drains stamina while held and on every blocked hit, stops stamina
regeneration, and breaks at 0 stamina (no blocking until it refills to 25). The strong attack is the special and does NOT use stamina: it has
its own SPECIAL POWER meter that empties on use and refills in exactly 5 seconds, and each use also costs a little
stamina (`SPECIAL_STAMINA_COST` in `src/abilities/specials.js`, default 12); no use without enough stamina. Same rules for player and AI.
Block tuning is in `src/config/constants.js`; per-fighter values in `characters.js`. The AI follows the same rules.

## Credits

"Stickman - Mixamo Rig (2025/2026)" by Robloxian Models
(https://sketchfab.com/3d-models/stickman-mixamo-rig-20252026-0a00e15ca71d400e905e6f4d5a862fb0),
licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Used as `public/models/stickman.glb`.
