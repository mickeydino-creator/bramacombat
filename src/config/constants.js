// Global tuning values. Gameplay runs at a fixed 60 steps per second, so all
// frame data (startup/active/recovery/hitstun...) is expressed in frames.
export const FPS = 60;
export const STEP = 1 / FPS;

export const GRAVITY = -38; // units / s^2
export const ARENA_HALF_WIDTH = 7.5; // fighters stay inside [-W, W] on X
export const PUSH_WIDTH = 0.75; // minimum X distance between two fighters (pushbox)
export const PUSH_HEIGHT = 1.5; // vertical size of the pushbox

export const GROUND_FRICTION = 0.82; // velocity multiplier per frame when not walking
export const INPUT_BUFFER_FRAMES = 8; // attack presses are remembered this long

export const INTRO_FRAMES = 100; // "ROUND 1 / FIGHT!" duration
export const KO_FRAMES = 110; // delay between K.O. and the winner screen
