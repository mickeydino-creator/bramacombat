# Custom sound files

All game sounds are synthesized by default (`src/audio/Sfx.js`). To use your own recordings,
put the files here and list them in `sounds.json`, for example:

```json
{ "ko": "ko.mp3", "victory": "victory.mp3", "defeat": "womp-womp.mp3", "airhorn": "airhorn.mp3" }
```

A listed sound replaces the synthesized sound with the same name. Available names:
punch, kick, strong, hit, heavyHit, block, guardBreak, damage, jump, land, ko, boom, crowd, bell,
announce, victory, airhorn, defeat, scratch, ui.

Only add files you have the right to use (your own recordings or properly licensed sounds).
