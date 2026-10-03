import '@fontsource/permanent-marker';
import '@fontsource/patrick-hand';
import { Game } from './core/Game.js';
import { CHARACTERS } from './config/characters.js';
import { preloadStickman } from './models/StickmanModel.js';
import { NetMenu } from './ui/NetMenu.js';

// Load stickman model files up front so fighters don't pop in.
const urls = new Set(Object.values(CHARACTERS)
  .filter((c) => c.appearance?.type === 'stickman')
  .map((c) => c.appearance.url));

// Handwriting fonts must be ready before canvases (doodles, arrow) draw text with them.
const fonts = ['40px "Permanent Marker"', '20px "Patrick Hand"'].map((f) => document.fonts?.load(f).catch(() => {}));
Promise.all([...fonts, ...[...urls].map((u) => preloadStickman(u).catch((e) => console.error('Model failed to load', u, e)))])
  .finally(() => {
    const game = new Game(document.getElementById('app'));
    game.start();
    // VS FRIENDS menus; also handles a shared invite link (/?join=ABCD) and a page reload while in a room.
    game.netMenu = new NetMenu(game);
    const params = new URLSearchParams(location.search);
    const invite = params.get('join');
    if (invite) {
      history.replaceState(null, '', location.pathname); // (a refresh must not re-join by itself: the saved session does that)
      game.netMenu.openJoin(invite);
    } else {
      game.netMenu.resume();
    }
    // Handy for debugging in the browser console.
    window.game = game;
  });
