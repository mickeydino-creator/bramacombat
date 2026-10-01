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

- `src/config/characters.js` - **character definitions**: stats, move frame data, which model to use
- `src/config/constants.js` - gravity, arena width, input buffer, round timings, block tuning (chip damage, speed, blockstun)
- `src/fighter/Fighter.js` - fighter state machine, physics, attacks, getting hit
- `src/combat/CombatSystem.js` - hitbox vs hurtbox detection, push collision
- `src/models/PlaceholderModel.js` - primitive humanoid (current visuals) + the model interface
- `src/models/GltfModel.js` - ready-made adapter for your own `.glb` characters with animations
- `src/abilities/SpecialAbilities.js` - special ability stamina + cooldowns (`stamina: { max, regenPerSecond }`, `staminaCost`, `cooldown` are set per character in `characters.js`)
- `src/ai/AIController.js` - opponent AI
- `src/input/KeyboardController.js` - key bindings
- `src/input/GamepadController.js` - gamepad bindings (Gamepad API, deadzone, press detection)
- `src/input/CombinedController.js` - merges keyboard + gamepad into one player input
- `src/core/Game.js` - loop (fixed 60 steps/s), round flow, hitstop, effects/sound hooks
- `src/camera`, `src/arena`, `src/ui`, `src/fx`, `src/audio` - camera, stage, HUD, hit sparks, generated sound effects (`src/audio/Sfx.js`)

## Replacing a placeholder character

1. Put your model in `public/models/ember.glb`.
2. In `src/config/characters.js`, uncomment the `GltfModel` import and set
   `createModel: () => new GltfModel({ url: '/models/ember.glb', clips: { idle: 'Idle', punch: 'Punch' /* ... */ } })`.

The model should face +Z with its feet at y = 0. Gameplay (hitboxes, physics) does not depend on the model.
