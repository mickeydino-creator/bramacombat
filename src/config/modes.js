/*
 * FIGHT MODES (VS AI): how many fighters are in the arena.
 *
 * To add another player count or arena size later, add an entry here (and, if it needs more fighters than
 * MAX_FIGHTERS, a character in characters.js). Everything else - arena size, spawn points, camera, HUD, podium - reads
 * from this table.
 *
 *   fighters        number of fighters (YOU are always fighter 0, the rest are AI)
 *   arenaHalfWidth  fighters stay inside [-W, W]; the platform, posts and lights are built from it
 *   spawns          starting x of each fighter, left to right (YOU first)
 *   roundsToWin     rounds needed to win the match. 1v1 is best of 3 (2); a free-for-all is one round: last one standing wins
 *   cameraMaxZoom   how far the camera may pull back to keep everybody in view
 *   title/desc      text on the selection screen
 */
export const MAX_FIGHTERS = 4;
/** Characters in fight order: YOU first, then the AI opponents (keys of CHARACTERS). */
export const ROSTER = ['ember', 'volt', 'moss', 'plum'];
export const DEFAULT_FIGHTERS = 2;

export const FIGHT_MODES = {
  2: { fighters: 2, arenaHalfWidth: 7.5, spawns: [-2.5, 2.5], roundsToWin: 2, cameraMaxZoom: 15, title: '2 FIGHTERS', desc: 'YOU vs AI - best of 3' },
  3: { fighters: 3, arenaHalfWidth: 9.5, spawns: [-5, 0, 5], roundsToWin: 1, cameraMaxZoom: 21, title: '3 FIGHTERS', desc: 'YOU + 2 AI - free for all' },
  4: { fighters: 4, arenaHalfWidth: 12, spawns: [-7.5, -2.5, 2.5, 7.5], roundsToWin: 1, cameraMaxZoom: 26, title: '4 FIGHTERS', desc: 'YOU + 3 AI - free for all' },
};

/** Names shown in the HUD / end screen. With one opponent it is simply "AI" (as in the classic 1v1). */
export function fighterNames(count) {
  if (count === 2) return ['YOU', 'AI'];
  return ['YOU', ...Array.from({ length: count - 1 }, (_, i) => `AI ${i + 1}`)];
}
