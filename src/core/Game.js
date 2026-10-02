import * as THREE from 'three';
import {
  STEP, PUSH_WIDTH, PUSH_HEIGHT, INTRO_FRAMES, KO_FRAMES,
  ROUND_RESULT_FRAMES, WIPE_COVER_FRAMES, PODIUM_DELAY_FRAMES, PODIUM_FRAMES,
} from '../config/constants.js';
import { CHARACTERS } from '../config/characters.js';
import { Fighter } from '../fighter/Fighter.js';
import { resolveHits, resolvePushAll } from '../combat/CombatSystem.js';
import { FIGHT_MODES, DEFAULT_FIGHTERS, ROSTER, fighterNames } from '../config/modes.js';
import { KeyboardController } from '../input/KeyboardController.js';
import { GamepadController } from '../input/GamepadController.js';
import { CombinedController } from '../input/CombinedController.js';
import { TouchController, isTouchDevice } from '../input/TouchController.js';
import { AIController } from '../ai/AIController.js';
import { createArena } from '../arena/Arena.js';
import { PodiumScene, podiumLayout } from '../arena/PodiumScene.js';
import { FightCamera } from '../camera/FightCamera.js';
import { Effects } from '../fx/Effects.js';
import { Sfx } from '../audio/Sfx.js';
import { HUD } from '../ui/HUD.js';
import { DebugBoxes } from './DebugBoxes.js';
import { BlockShield } from '../fx/BlockShield.js';
import { Settings } from './Settings.js';
import { Menu } from '../ui/Menu.js';
import { PlayerIndicator } from '../fx/PlayerIndicator.js';

const NEUTRAL = { move: 0, jump: false, actions: [] };

/*
 * Adaptive resolution: if the device can't keep up (median frame time of the last SAMPLE_FRAMES frames above SLOW_MS,
 * i.e. below ~45 fps) the render resolution steps down, never below MIN_PIXEL_RATIO.
 * The graphics-quality setting is the upper limit. It only steps down (with vsync a fast frame
 * can't be told apart from a barely-fast-enough one), and starts again from the top when the
 * quality setting changes.
 */
const SLOW_MS = 22;
const SAMPLE_FRAMES = 30;
const MIN_PIXEL_RATIO = { low: 0.75, medium: 1, high: 1 };

/**
 * Owns the scene, the fixed-timestep loop and the round flow:
 *   intro -> fight -> ko -> over (winner screen) -> restart
 */
export class Game {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.localClippingEnabled = true; // the 4th-place fighter sinks into the podium hole through a clip plane
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.arena = createArena(this.scene);
    this.podiumScene = new PodiumScene(this.scene, this.arena);
    this.settings = new Settings();
    this.cam = new FightCamera(window.innerWidth / window.innerHeight);
    this.effects = new Effects(this.scene);
    this.sfx = new Sfx(this.settings);
    this.hud = new HUD({ onRestart: () => this.startFight(), onMainMenu: () => this.mainMenu(), onPause: () => this.pause(), onSkip: () => this.skipFight() });
    this.floorClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.3); // keeps everything above the page (y >= -0.3)
    this.debug = new DebugBoxes(this.scene);

    // ---- Fighters: all possible fighters exist from the start (characters: see ROSTER in src/config/modes.js);
    // setFightCount() decides who takes part in the current fight. YOU (p1) is always fighter 0, p2 the first AI. ----
    this.allFighters = ROSTER.map((key) => new Fighter(CHARACTERS[key], this.scene));
    this.p1 = this.allFighters[0];
    this.fighters = this.allFighters.slice(0, DEFAULT_FIGHTERS);
    this.shields = this.allFighters.map((f) => new BlockShield(this.scene, f));
    this.playerIndicator = new PlayerIndicator(this.scene, this.p1); // player only, not the AI
    // Player 1 = keyboard + first gamepad, merged into one input.
    // Touch buttons are only added on touch devices.
    this.touch = isTouchDevice() ? new TouchController() : null;
    this.gamepad = new GamepadController();
    const player1 = new CombinedController([new KeyboardController(), this.gamepad, ...(this.touch ? [this.touch] : [])]);
    this.playerController = player1;
    // One independent AI brain per possible opponent (the first one is the classic 1v1 opponent).
    this.aiControllers = [0.7, 0.62, 0.66].map((aggression) => new AIController({ aggression }));
    this.fightCount = 0;
    this.setFightCount(DEFAULT_FIGHTERS);

    for (const f of this.allFighters) {
      f.on('attackStart', (a) => {
        this.sfx.attack(a.name);
        if (a.name === 'strong') this.onSpecialActivate(f); // strong attack = the special
      });
      f.on('jump', () => this.sfx.jump());
      f.on('land', () => this.sfx.land());
      f.on('guardBreak', () => {
        this.sfx.guardBreak();
        this.effects.hitSpark(f.x + f.facing * 0.4, f.y + 1.2, 1.2, 0xff6b6b, 'CRACK!');
        this.cam.shake(0.15);
      });
    }

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.cam.resize(window.innerWidth / window.innerHeight);
    });
    window.addEventListener('keydown', (e) => {
      if (this.menu.visible) return; // the menu handles its own keys
      if (e.code === 'Escape' && this.phase === 'over') { this.mainMenu(); e.stopImmediatePropagation(); }
      else if (e.code === 'Escape' || e.code === 'KeyP') {
        this.pause();
        e.stopImmediatePropagation(); // the menu that just opened must not also handle this Esc (= resume)
      }
      else if (e.code === 'Enter' && this.skipAvailable()) this.skipFight();
      else if (e.code === 'KeyR' || (e.code === 'Enter' && this.phase === 'over')) this.startFight();
      if (e.code === 'KeyH') this.debug.toggle();
    });

    this.menu = new Menu({
      settings: this.settings, sfx: this.sfx, gamepad: this.gamepad,
      onStart: (count) => this.startFight(count), onResume: () => this.resume(),
      onRestart: () => this.startFight(), onMainMenu: () => this.mainMenu(),
    });
    this.settings.onChange((v) => this.applyQuality(v.quality));
    this.mainMenu();
    // Compile every shader now and pre-draw the effect textures in idle time (no first-hit stutter).
    this.renderer.compile(this.scene, this.cam.camera);
    this.podiumScene.prime(this.renderer, this.cam.camera); // podium shaders/textures too: no hitch at the first transition
    this.setClip(this.p1, this.floorClip); this.renderer.compile(this.scene, this.cam.camera); this.setClip(this.p1, null); // clipped-material shader variant
    this.effects.prewarm(this.renderer);
  }

  /** Graphics quality: resolution and shadows (safe to change at runtime). */
  applyQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    this.quality = q;
    this.maxPixelRatio = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.minPixelRatio = Math.min(this.maxPixelRatio, MIN_PIXEL_RATIO[q] ?? 1);
    this.frameTimes = [];
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const sun = this.arena.sun;
    const size = q === 'high' ? 2048 : 1024;
    sun.castShadow = q !== 'low';
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(size, size);
    }
  }

  /** Adaptive resolution (see SLOW_MS): called every rendered frame with its duration. */
  adaptResolution(ms) {
    const ft = this.frameTimes;
    if (!ft || document.hidden) return;
    ft.push(ms);
    if (ft.length < SAMPLE_FRAMES) return;
    const median = ft.sort((a, b) => a - b)[ft.length >> 1]; // median: ignores one-off hitches
    ft.length = 0;
    const pr = this.renderer.getPixelRatio();
    if (median > SLOW_MS && pr > this.minPixelRatio + 0.01) {
      this.renderer.setPixelRatio(Math.max(this.minPixelRatio, pr * 0.8));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  /** Show the main menu with the fighters idling in the background. */
  mainMenu() {
    this.setFightCount(DEFAULT_FIGHTERS); // the menu always shows the classic duel arena
    this.newMatch();
    this.restart();
    this.phase = 'menu';
    this.hud.setVisible(false);
    this.touch?.setVisible(false);
    this.hud.showMessage('');
    this.menu.show('main', true);
    this.sfx.setMusicMode('menu');
  }

  /** START / RESTART: a fresh match. `count` = number of fighters (omitted: same as the last fight). */
  startFight(count) {
    if (['menu', 'paused', 'over', 'podium', 'roundend'].includes(this.phase)) this.hud.pageTurn();
    if (count) this.setFightCount(count);
    this.newMatch();
    this.menu.close();
    this.controllers[0].getInput(this.p1, this.p2); // drop presses made while in menus
    this.hud.setVisible(true);
    this.touch?.setVisible(true);
    this.sfx.setMusicMode('fight');
    this.restart();
    this.sfx.bell();
    this.sfx.say(this.mode.roundsToWin === 1 ? 'Free for all' : 'Round one');
  }

  /**
   * Switch to a fight with `count` fighters: who takes part, arena size, camera range, HUD and podium layout
   * (all read from FIGHT_MODES in src/config/modes.js). Does nothing when the count is unchanged.
   */
  setFightCount(count) {
    const mode = FIGHT_MODES[count] ?? FIGHT_MODES[DEFAULT_FIGHTERS];
    if (mode.fighters === this.fightCount) return;
    this.mode = mode;
    this.fightCount = mode.fighters;
    this.fighters = this.allFighters.slice(0, mode.fighters);
    this.p2 = this.fighters[1];
    for (const f of this.allFighters) {
      f.model.root.visible = this.fighters.includes(f);
      f.arenaLimit = mode.arenaHalfWidth;
    }
    this.controllers = [this.playerController, ...this.aiControllers.slice(0, mode.fighters - 1)];
    this.arena.setHalfWidth(mode.arenaHalfWidth);
    this.cam.maxZoom = mode.cameraMaxZoom;
    this.podiumScene.configure(mode.fighters);
    this.names = fighterNames(mode.fighters);
    const css = (key) => `#${CHARACTERS[key].appearance.colors.body.toString(16).padStart(6, '0')}`;
    this.hud.configure(this.names, ROSTER.slice(0, mode.fighters).map(css));
    this.newMatch();
  }

  /** A match = rounds until somebody has won `mode.roundsToWin` of them (1v1: best of 3; free-for-all: one round, last one standing wins). */
  newMatch() {
    this.match = { wins: this.fighters.map(() => 0), round: 1 };
    this.fighters.forEach((_, i) => this.hud.setWins(i, 0));
  }

  roundLabel() {
    if (this.mode.roundsToWin === 1) return 'FREE FOR ALL';
    const { wins, round } = this.match;
    const last = this.mode.roundsToWin - 1;
    return wins[0] === last && wins[1] === last ? 'FINAL ROUND' : `ROUND ${round}`;
  }

  /** Closest living opponent (who a fighter faces by default). */
  nearestEnemy(f) {
    let best = null, bestDist = Infinity;
    for (const o of this.fighters) {
      if (o === f || !o.alive) continue;
      const d = Math.abs(o.x - f.x);
      if (d < bestDist) { best = o; bestDist = d; }
    }
    return best ?? this.fighters.find((o) => o !== f);
  }

  /** What the camera has to keep in view: [leftmost, rightmost, highest y] of the living fighters (everybody in a duel). */
  camView() {
    const alive = this.fighters.filter((f) => f.alive);
    const list = this.fighters.length > 2 && alive.length ? alive : this.fighters;
    let l = list[0], r = list[0], y = 0;
    for (const f of list) { if (f.x < l.x) l = f; if (f.x > r.x) r = f; y = Math.max(y, f.y); }
    return [l, r, y];
  }

  pause() {
    if (!['intro', 'fight', 'ko'].includes(this.phase)) return;
    this.pausedPhase = this.phase;
    this.phase = 'paused';
    this.touch?.setVisible(false);
    this.menu.show('pause', true);
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.pausedPhase;
    this.controllers[0].getInput(this.p1, this.p2); // drop presses made while paused
    this.touch?.setVisible(true);
  }

  /** Set up the current round: fighters back in place, arena back to normal (also undoes the podium). */
  restart() {
    this.podiumScene.reset();
    this.cam.setPodium(null);
    this.hud.setBarsVisible(true);
    for (const f of this.fighters) f.yawOverride = null;
    this.fighters.forEach((f, i) => f.reset(this.mode.spawns[i], 1));
    for (const f of this.fighters) f.facing = Math.sign(this.nearestEnemy(f).x - f.x) || 1; // everybody starts facing the nearest opponent
    this.downOrder = []; // knocked-out fighters in order (decides the podium places)
    this.fallAnim = null;
    for (const f of this.fighters) { this.setClip(f, null); f.model.root.visible = true; } // (the 4th place may have fallen through the page)
    this.playerIndicator?.snap();
    this.controllers.forEach((c) => c.reset?.());
    this.phase = 'intro';
    this.phaseFrame = 0;
    this.hitstop = 0;
    this.winner = null;
    this.finishHimDone = false;
    this.clearMessageAt = 0;
    this.hud.hideWinner();
    this.hud.showMessage(this.roundLabel());
    this.fighters.forEach((f, i) => this.hud.setHealth(i, f.health, f.maxHealth));
    const [camL, camR, camY] = this.camView();
    this.cam.update(camL, camR, STEP, true, camY);
  }

  start() {
    this.last = performance.now();
    this.acc = 0;
    const loop = (now) => {
      this.menu.update(); // gamepad menu navigation
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.adaptResolution(now - this.last);
      this.last = now;
      this.acc += dt;
      while (this.acc >= STEP) {
        this.step();
        this.acc -= STEP;
      }
      this.render(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** One fixed gameplay frame (60/s). */
  step() {
    if (this.phase === 'menu' || this.phase === 'paused') return; // game frozen behind the menu
    if (this.skipRequested) { this.skipRequested = false; this.runSkip(); return; }
    this.phaseFrame++;
    if (this.phase === 'podium' || this.phase === 'over') { this.stepPodium(); return; }

    if (this.phase === 'intro') {
      if (this.phaseFrame === Math.floor(INTRO_FRAMES * 0.55)) { this.hud.showMessage('FIGHT!'); this.sfx.fight(); } // once per round
      if (this.phaseFrame >= INTRO_FRAMES) { this.phase = 'fight'; this.hud.showMessage(''); }
    }

    // Special meters recharge in real time (5 seconds), hitstop included.
    for (const f of this.fighters) f.tickMeters();

    // Hitstop: freeze the fighters for a few frames on impact.
    if (this.hitstop > 0) { this.hitstop--; return; }

    const fighting = this.phase === 'fight';
    // Player input is always polled so presses don't pile up between rounds.
    const raw1 = this.controllers[0].getInput(this.p1, this.nearestEnemy(this.p1));
    if (raw1.pause && this.phase !== 'over') { this.pause(); return; }
    if (raw1.restart && this.skipAvailable()) { this.skipFight(); return; } // gamepad A / Start

    // Every fighter gets its own input and its own target (the opponent it faces). AIs choose theirs in a free-for-all.
    const ffa = this.fightCount > 2;
    const targets = this.fighters.map((f, i) => (ffa && i > 0 && fighting && f.alive
      ? this.controllers[i].chooseTarget?.(f, this.fighters.filter((o) => o !== f)) ?? this.nearestEnemy(f)
      : this.nearestEnemy(f)));
    const inputs = this.fighters.map((f, i) => {
      if (!fighting) return NEUTRAL;
      if (i === 0) return raw1;
      if (!f.alive) return NEUTRAL;
      return this.controllers[i].getInput(f, targets[i], ffa ? this.fighters.filter((o) => o !== f && o !== targets[i]) : []);
    });
    this.fighters.forEach((f, i) => f.update(inputs[i], targets[i]));
    resolvePushAll(this.fighters, PUSH_WIDTH, PUSH_HEIGHT, this.mode.arenaHalfWidth, ffa ? (f) => f.alive : undefined);

    if (fighting) {
      for (const hit of resolveHits(this.fighters)) this.onHit(hit);
    }

    if (this.clearMessageAt && this.phaseFrame >= this.clearMessageAt && this.phase === 'fight') { this.hud.showMessage(''); this.clearMessageAt = 0; }

    if (this.phase === 'ko') {
      if (this.phaseFrame === 40 && this.winner) this.winner.setVictory();
      if (this.phaseFrame >= KO_FRAMES) this.endRound();
    } else if (this.phase === 'roundend') {
      this.stepRoundEnd();
    }
  }

  /** The round is over (after the K.O. animation): count the win, then next round or podium. */
  endRound() {
    const w = this.winner ? this.fighters.indexOf(this.winner) : -1;
    if (w >= 0) {
      this.match.wins[w]++;
      this.hud.setWins(w, this.match.wins[w]);
    }
    this.phaseFrame = 0;
    if (w >= 0 && this.match.wins[w] >= this.mode.roundsToWin) { // match decided: arena -> podium
      this.phase = 'podium';
      this.podiumStarted = false;
      this.hud.showMessage('');
      this.touch?.setVisible(false);
      return;
    }
    if (w >= 0) this.match.round++; // (a drawn round is replayed with the same number)
    this.phase = 'roundend';
    this.hud.showMessage(w < 0 ? 'DRAW' : w === 0 ? 'YOU WIN!' : `${this.names[w]} WINS!`);
  }

  /** Between rounds: show the result for a moment, then a notebook page sweeps across and the next round starts behind it. */
  stepRoundEnd() {
    const f = this.phaseFrame;
    if (f === ROUND_RESULT_FRAMES) { this.hud.pageWipe(); this.sfx.pageFlip(); }
    if (f === ROUND_RESULT_FRAMES + WIPE_COVER_FRAMES) {
      this.controllers[0].getInput(this.p1, this.p2); // drop presses made during the transition
      this.restart();
      this.sfx.bell();
      this.sfx.say(this.mode.roundsToWin === 1 ? 'Free for all' : this.roundLabel() === 'FINAL ROUND' ? 'Final round' : `Round ${['one', 'two', 'three'][this.match.round - 1] ?? this.match.round}`);
    }
  }

  /**
   * Match over. 'podium' = the arena rearranges into the victory podium (PODIUM_FRAMES), 'over' = podium shown with the
   * end-screen buttons. Fighters are moved by hand here (no physics): the winner hops to 1st place, the loser stands up and
   * hops to 2nd.
   */
  stepPodium() {
    const raw1 = this.controllers[0].getInput(this.p1, this.p2);
    if (this.phase === 'over') {
      if (raw1.restart) this.startFight();
      else if (raw1.back) this.mainMenu();
      else this.stepFall();
      return;
    }
    const f = this.phaseFrame;
    if (f === PODIUM_DELAY_FRAMES && !this.podiumStarted) this.beginPodium();
    if (!this.podiumStarted) return;
    const t = Math.min(1, (f - PODIUM_DELAY_FRAMES) / PODIUM_FRAMES);
    this.podiumScene.setProgress(t);
    const k = t * t * (3 - 2 * t);
    for (const p of this.podiumMoves) {
      const { fighter } = p;
      fighter.x = p.fromX + (p.toX - p.fromX) * k;
      fighter.y = p.fromY + (p.toY - p.fromY) * k + Math.sin(Math.PI * k) * p.hop;
      fighter.vy = t < 0.5 ? 1 : -1;
      if (t >= 0.92) fighter.state = p.final;
    }
    if (t >= 1) this.finishMatch();
  }

  /** Clip a fighter's model at the page (floorClip) or remove the clipping (null). */
  setClip(fighter, plane) {
    fighter.model.root.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        m.clippingPlanes = plane ? [plane] : null;
        m.clipShadows = !!plane;
        m.needsUpdate = true;
      }
    });
  }

  /** 4th place: after the podium is complete a hole opens under them, they drop and sink into it. */
  stepFall() {
    const fall = this.fallAnim;
    if (!fall) return;
    const f = fall.fighter, n = ++fall.frame;
    const HOLE_AT = 45, OPEN = 18, DROP_AT = HOLE_AT + OPEN + 12;
    this.podiumScene.setHole(Math.min(1, Math.max(0, (n - HOLE_AT) / OPEN)));
    if (n === DROP_AT) {
      this.setClip(f, this.floorClip); // only what is above the page stays visible: the body disappears into the hole
      f.state = 'air'; f.vy = -1.5; f.attack = null;
      this.sfx.fall();
    }
    if (n > DROP_AT && f.model.root.visible) {
      f.vy -= 16 * STEP;
      f.y += f.vy * STEP;
      if (f.y < -3.6) f.model.root.visible = false;
    }
  }

  /** SKIP is offered when YOU are out of a free-for-all and the AIs are still fighting. */
  skipAvailable() { return this.fightCount > 2 && this.phase === 'fight' && !this.p1.alive; }

  skipFight() { if (this.skipAvailable()) this.skipRequested = true; }

  /** Fast-forward the rest of the fight (same rules, no rendering/sound in between) until the winner is decided. */
  runSkip() {
    this.sfx.suppress = true;
    try {
      for (let n = 0; this.phase === 'fight' && n < 60 * 600; n++) this.step();
    } finally {
      this.sfx.suppress = false;
    }
    this.effects.clear(); // sparks and word bursts from the skipped part
    this.cam.shakeTime = 0; this.cam.shakeAmount = 0; this.cam.kickAmount = 0;
    const [l, r, y] = this.camView();
    this.cam.update(l, r, STEP, true, y);
    if (this.phase === 'ko') { // the final K.O. happened while muted: play its cues now
      this.sfx.ko();
      if (!this.sfx.hasSample('ko')) this.sfx.say('K. O.');
    }
  }

  beginPodium() {
    this.podiumStarted = true;
    // Places: the winner, then the fighters in reverse order of knock-out (last one knocked out = 2nd place).
    const win = this.winner;
    const ranking = [win, ...this.downOrder.slice().reverse().filter((f) => f !== win)];
    for (const f of this.fighters) if (!ranking.includes(f)) ranking.push(f);
    const layout = podiumLayout(this.fightCount);
    this.podiumMoves = ranking.map((fighter, rank) => {
      const slot = layout.slots[Math.min(rank, layout.slots.length - 1)];
      return {
        fighter, fromX: fighter.x, fromY: fighter.y, toX: slot.x, toY: slot.top,
        final: rank === 0 ? 'victory' : 'defeat', hop: rank === 0 ? 1.5 : 0.9,
        yaw: slot.x > 0 ? -0.22 : 0.22, // everybody turns slightly toward the winner in the middle
      };
    });
    for (const p of this.podiumMoves) {
      p.fighter.yawOverride = p.yaw; // turn toward the camera
      p.fighter.attack = null;
      p.fighter.vx = 0;
      p.fighter.state = 'air'; // jump / fall pose while hopping onto the podium
    }
    this.cam.setPodium(layout.camera);
    this.hud.setBarsVisible(false);
    this.sfx.pageFlip();
  }

  finishMatch() {
    this.phase = 'over';
    this.phaseFrame = 0;
    // 4th place (4 fighters): a hole opens under them and they fall through the page
    this.fallAnim = this.fightCount === 4 ? { fighter: this.podiumMoves[3].fighter, frame: 0 } : null;
    this.hud.showWinner(this.winner === this.p1 ? 'YOU WIN' : `${this.names[this.fighters.indexOf(this.winner)]} WINS`, true);
    if (this.winner === this.p1) { this.sfx.victory(); this.sfx.say('You win!'); }
    else { this.sfx.defeat(); if (!this.sfx.hasSample('defeat')) this.sfx.say('You lose'); }
  }

  /** Special activation feedback - identical for YOU and AI (both fighters go through here). */
  onSpecialActivate(f) {
    this.effects.specialActivate(f);
    f.model.flash?.(0xffc21a, 0.25); // golden glow
    this.cam.kick(0.9);
    this.cam.shake(0.08, 0.15);
  }

  onHit({ attacker, defender, move, point }) {
    if (defender.lastHitBlocked && defender.alive) {
      // Blocked: short freeze, blue spark, shield flash, no screen shake.
      this.hitstop = Math.max(this.hitstop, Math.ceil((move.hitstop || 0) / 2));
      this.effects.blockSparks(point.x, point.y);
      this.shields[this.fighters.indexOf(defender)].flash();
      this.sfx.block();
      this.hud.setHealth(this.fighters.indexOf(defender), defender.health, defender.maxHealth);
      return;
    }
    const strength = move.damage / 10;
    this.hitstop = Math.max(this.hitstop, move.hitstop || 0);
    if (move.anim === 'strong') { // special landing: distinct impact
      this.effects.specialImpact(point.x, point.y);
      this.sfx.heavyHit();
      this.sfx.specialHit();
      this.cam.kick(0.7);
    } else {
      this.effects.hitSpark(point.x, point.y, 0.6 + strength * 0.5, 0xffd93b, !defender.alive);
      this.sfx.hit(strength, move.anim);
    }
    if (defender === this.p1) this.sfx.damage();
    this.cam.shake(move.shake || 0.05 * strength);
    this.hud.setHealth(this.fighters.indexOf(defender), defender.health, defender.maxHealth);

    // FINISH HIM! once per round, when a fighter first drops to 25% health or less.
    if (this.fightCount === 2 && defender.alive && !this.finishHimDone && defender.health <= defender.maxHealth * 0.25) {
      this.finishHimDone = true;
      this.sfx.finishHim();
      this.hud.showMessage('FINISH HIM!');
      this.clearMessageAt = this.phaseFrame + 90;
    }

    if (!defender.alive) {
      if (!this.downOrder.includes(defender)) this.downOrder.push(defender);
      const alive = this.fighters.filter((f) => f.alive);
      this.clearMessageAt = 0;
      if (alive.length > 1) { // free-for-all: this fighter is out, the others keep fighting
        this.hitstop = Math.max(this.hitstop, 10);
        this.cam.shake(0.25, 0.3);
        this.hud.showMessage('K.O.');
        this.clearMessageAt = this.phaseFrame + 55;
        this.sfx.boom();
        return;
      }
      this.winner = alive[0] ?? null; // last one standing (nobody left = both knocked out together)
      this.phase = 'ko';
      this.phaseFrame = 0;
      this.hitstop = 20;
      this.cam.shake(0.4, 0.4);
      this.hud.showMessage('K.O.');
      this.sfx.ko();
      if (!this.sfx.hasSample('ko')) this.sfx.say('K. O.'); // the recorded KNOCKOUT already says it
    }
  }

  render(dt) {
    if (this.phase === 'podium' || this.phase === 'over') for (const f of this.fighters) f.time += dt; // podium poses keep animating
    for (const f of this.fighters) f.syncModel(dt);
    const [camL, camR, camY] = this.camView();
    this.cam.update(camL, camR, dt, false, camY);
    this.effects.update(dt);
    this.arena.update(dt);
    this.shields.forEach((s) => s.update(dt));
    this.playerIndicator.mesh.visible = this.phase !== 'menu' && this.p1.model.root.visible;
    this.hud.setSkipVisible(this.skipAvailable());
    this.playerIndicator.update(dt);
    this.debug.update(this.fighters);
    this.fighters.forEach((f, i) => {
      this.hud.setStamina(i, f.stamina, f.guardBroken);
      this.hud.setSpecial(i, f.specials.status(), i === 0 ? (this.touch ? 'STR' : 'L / Y') : '', f.hasStaminaForSpecial);
    });
    this.touch?.setSpecialReady(this.p1.canUseSpecial('strong'));
    this.renderer.render(this.scene, this.cam.camera);
  }
}
