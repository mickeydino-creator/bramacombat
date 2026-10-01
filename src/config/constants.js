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

// Blocking (hold block while on the ground; only stops attacks from the front)
export const BLOCK_DAMAGE_MULTIPLIER = 0.15; // blocked hits deal this fraction of damage ("chip")
export const BLOCK_MOVE_SPEED = 0.55; // walk speed multiplier while blocking
export const BLOCKSTUN_MULTIPLIER = 0.6; // blockstun = move hitstun * this
export const BLOCK_PUSHBACK = 0.5; // knockback multiplier on block (no launch)

export const INTRO_FRAMES = 100; // "ROUND 1 / FIGHT!" duration
export const KO_FRAMES = 110; // delay between K.O. and the winner screen
