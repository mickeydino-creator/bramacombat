# Custom sound files

All game sounds are synthesized by default (`src/audio/Sfx.js`). To use your own recordings,
put the files here and list them in `sounds.json`, for example:

```json
{ "ko": "ko.mp3", "victory": "victory.mp3", "defeat": "womp-womp.mp3", "airhorn": "airhorn.mp3" }
```

A listed sound replaces the synthesized sound with the same name. Available names:
punch, kick, strong, hit, heavyHit, block, guardBreak, damage, jump, land, ko, boom, crowd, bell,
announce, victory, airhorn, defeat, scratch, finishHim, fight, ui.
Special name: `music` - a background track, looped in place of the generated music (Music Volume setting applies).

Currently included: `knockout.mp3` (K.O.), `sad-trombone.mp3` (you lose), `finish-him.mp3`
(when a fighter first drops to 25% health) and `fight.mp3` (round start), trimmed from recordings supplied by the project owner.

Only add files you have the right to use (your own recordings or properly licensed sounds).
