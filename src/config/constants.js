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
export const BLOCK_DAMAGE_MULTIPLIER = 0.4; // blocked hits still deal this fraction of damage ("chip")
export const BLOCK_MOVE_SPEED = 0.55; // walk speed multiplier while blocking
export const BLOCKSTUN_MULTIPLIER = 0.6; // blockstun = move hitstun * this
export const BLOCK_PUSHBACK = 0.5; // knockback multiplier on block (no launch)
// Blocking uses the same stamina as special abilities (and stops it from recharging):
export const BLOCK_STAMINA_DRAIN_PER_SECOND = 12; // while holding block
export const BLOCK_HIT_STAMINA_COST = 1.5; // per point of (unblocked) damage of each blocked hit
export const GUARD_RECOVER_STAMINA = 25; // after a guard break, blocking is disabled until stamina >= this

export const INTRO_FRAMES = 100; // "ROUND 1 / FIGHT!" duration
export const KO_FRAMES = 110; // delay between K.O. and the winner screen
