import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.start();

// Handy for debugging in the browser console.
window.game = game;
