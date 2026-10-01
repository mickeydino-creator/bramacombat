# Bramacombat - 3D fighting prototype

Playable 1v1 (player vs AI) fighting game prototype. Three.js + Vite, plain JavaScript (ES modules).

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173). `npm run build` creates a static build in `dist/`.

## Controls

Keyboard: A / D move, W jump, J punch, K kick, L strong attack, I special, hold Shift block, R restart, H show hitboxes (debug).

Xbox / standard gamepad: left stick or D-pad move, A jump, X punch, B kick, Y strong attack, RB special, hold RT block, Menu/Start or A restart (winner screen only). Press any button once if the browser doesn't detect the pad right away.

## Project layout

- `src/config/characters.js` - **character configuration**: stats, moves, specials, appearance (see Characters below)
- `src/config/constants.js` - gravity, arena width, input buffer, round timings, block tuning (chip damage, speed, blockstun, stamina drain, guard break)
- `src/fighter/Fighter.js` - fighter state machine, physics, attacks, getting hit
- `src/combat/CombatSystem.js` - hitbox vs hurtbox detection, push collision
- `src/models/StickmanModel.js` + `src/models/stickman/` - rigged stickman model, procedural poses, face, accessories
- `src/models/createModel.js` - builds a fighter's model from its `appearance`
- `src/models/PlaceholderModel.js` - primitive humanoid + the model interface description
- `src/models/GltfModel.js` - ready-made adapter for your own `.glb` characters with animations
- `src/abilities/specials.js` - **the special ability** and the special meter settings, defined once and shared by player and AI
- `src/abilities/SpecialAbilities.js` - special meter rules: full -> usable, use -> empty, refills in exactly 5s
- `src/abilities/Stamina.js` - stamina (blocking resource), separate from the special meter
- `src/ai/AIController.js` - opponent AI
- `src/input/KeyboardController.js` - key bindings
- `src/input/GamepadController.js` - gamepad bindings (Gamepad API, deadzone, press detection)
- `src/input/CombinedController.js` - merges keyboard + gamepad into one player input
- `src/core/Game.js` - loop (fixed 60 steps/s), round flow, hitstop, effects/sound hooks
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
regeneration, and breaks at 0 stamina (no blocking until it refills to 25). Specials do NOT use stamina: they have
their own SPECIAL meter that empties on use and refills in exactly 5 seconds (same for player and AI).
Block tuning is in `src/config/constants.js`; per-fighter values in `characters.js`. The AI follows the same rules.

## Credits

"Stickman - Mixamo Rig (2025/2026)" by Robloxian Models
(https://sketchfab.com/3d-models/stickman-mixamo-rig-20252026-0a00e15ca71d400e905e6f4d5a862fb0),
licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Used as `public/models/stickman.glb`.
