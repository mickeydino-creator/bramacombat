import '@fontsource/permanent-marker';
import '@fontsource/patrick-hand';
import { Game } from './core/Game.js';
import { CHARACTERS } from './config/characters.js';
import { preloadStickman } from './models/StickmanModel.js';

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
    // Handy for debugging in the browser console.
    window.game = game;
  });
