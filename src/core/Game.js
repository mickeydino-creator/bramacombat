import * as THREE from 'three';
import {
  STEP, ARENA_HALF_WIDTH, PUSH_WIDTH, PUSH_HEIGHT, INTRO_FRAMES, KO_FRAMES,
} from '../config/constants.js';
import { CHARACTERS } from '../config/characters.js';
import { Fighter } from '../fighter/Fighter.js';
import { resolveHits, resolvePush } from '../combat/CombatSystem.js';
import { KeyboardController } from '../input/KeyboardController.js';
import { GamepadController } from '../input/GamepadController.js';
import { CombinedController } from '../input/CombinedController.js';
import { TouchController, isTouchDevice } from '../input/TouchController.js';
import { AIController } from '../ai/AIController.js';
import { createArena } from '../arena/Arena.js';
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

/**
 * Owns the scene, the fixed-timestep loop and the round flow:
 *   intro -> fight -> ko -> over (winner screen) -> restart
 */
export class Game {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.arena = createArena(this.scene);
    this.settings = new Settings();
    this.cam = new FightCamera(window.innerWidth / window.innerHeight);
    this.effects = new Effects(this.scene);
    this.sfx = new Sfx(this.settings);
    this.hud = new HUD({ onRestart: () => this.startFight(), onMainMenu: () => this.mainMenu(), onPause: () => this.pause() });
    this.debug = new DebugBoxes(this.scene);

    // ---- Fighters: pick characters here ----
    this.p1 = new Fighter(CHARACTERS.ember, this.scene);
    this.p2 = new Fighter(CHARACTERS.volt, this.scene);
    this.fighters = [this.p1, this.p2];
    this.shields = this.fighters.map((f) => new BlockShield(this.scene, f));
    this.playerIndicator = new PlayerIndicator(this.scene, this.p1); // player only, not the AI
    // Player 1 = keyboard + first gamepad, merged into one input.
    // Touch buttons are only added on touch devices.
    this.touch = isTouchDevice() ? new TouchController() : null;
    this.gamepad = new GamepadController();
    const player1 = new CombinedController([new KeyboardController(), this.gamepad, ...(this.touch ? [this.touch] : [])]);
    this.controllers = [player1, new AIController({ aggression: 0.7 })];
    // The UI always calls the player-controlled fighter YOU and the opponent AI.
    this.hud.setNames('YOU', 'AI');

    for (const f of this.fighters) {
      f.on('attackStart', (a) => this.sfx.attack(a.name));
      f.on('jump', () => this.sfx.jump());
      f.on('land', () => this.sfx.land());
      f.on('guardBreak', () => {
        this.sfx.guardBreak();
        this.effects.hitSpark(f.x + f.facing * 0.4, f.y + 1.2, 1.2, 0xff4444);
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
      else if (e.code === 'KeyR' || (e.code === 'Enter' && this.phase === 'over')) this.startFight();
      if (e.code === 'KeyH') this.debug.toggle();
    });

    this.menu = new Menu({
      settings: this.settings, sfx: this.sfx, gamepad: this.gamepad,
      onStart: () => this.startFight(), onResume: () => this.resume(),
      onRestart: () => this.startFight(), onMainMenu: () => this.mainMenu(),
    });
    this.settings.onChange((v) => this.applyQuality(v.quality));
    this.mainMenu();
  }

  /** Graphics quality: resolution and shadows (safe to change at runtime). */
  applyQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
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

  /** Show the main menu with the fighters idling in the background. */
  mainMenu() {
    this.restart();
    this.phase = 'menu';
    this.hud.setVisible(false);
    this.touch?.setVisible(false);
    this.hud.showMessage('');
    this.menu.show('main', true);
    this.sfx.setMusicMode('menu');
  }

  /** START / RESTART: a fresh round. */
  startFight() {
    this.menu.close();
    this.controllers[0].getInput(this.p1, this.p2); // drop presses made while in menus
    this.hud.setVisible(true);
    this.touch?.setVisible(true);
    this.sfx.setMusicMode('fight');
    this.restart();
    this.sfx.bell();
    this.sfx.say('Round one');
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

  restart() {
    this.p1.reset(-2.5, 1);
    this.p2.reset(2.5, -1);
    this.playerIndicator?.snap();
    this.controllers[1].reset?.();
    this.phase = 'intro';
    this.phaseFrame = 0;
    this.hitstop = 0;
    this.winner = null;
    this.hud.hideWinner();
    this.hud.showMessage('ROUND 1');
    this.fighters.forEach((f, i) => this.hud.setHealth(i, f.health, f.maxHealth));
    this.cam.update(this.p1, this.p2, STEP, true);
  }

  start() {
    this.last = performance.now();
    this.acc = 0;
    const loop = (now) => {
      this.menu.update(); // gamepad menu navigation
      const dt = Math.min(0.1, (now - this.last) / 1000);
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
    this.phaseFrame++;

    if (this.phase === 'intro') {
      if (this.phaseFrame === Math.floor(INTRO_FRAMES * 0.55)) { this.hud.showMessage('FIGHT!'); this.sfx.announce(); this.sfx.say('Fight!'); }
      if (this.phaseFrame >= INTRO_FRAMES) { this.phase = 'fight'; this.hud.showMessage(''); }
    }

    // Special meters recharge in real time (5 seconds), hitstop included.
    for (const f of this.fighters) f.tickMeters();

    // Hitstop: freeze the fighters for a few frames on impact.
    if (this.hitstop > 0) { this.hitstop--; return; }

    const fighting = this.phase === 'fight';
    // Player input is always polled so presses don't pile up between rounds.
    const raw1 = this.controllers[0].getInput(this.p1, this.p2);
    if (raw1.restart && this.phase === 'over') { this.startFight(); return; }
    if (raw1.back && this.phase === 'over') { this.mainMenu(); return; }
    if (raw1.pause && this.phase !== 'over') { this.pause(); return; }
    const in1 = fighting ? raw1 : NEUTRAL;
    const in2 = fighting ? this.controllers[1].getInput(this.p2, this.p1) : NEUTRAL;

    this.p1.update(in1, this.p2);
    this.p2.update(in2, this.p1);
    resolvePush(this.p1, this.p2, PUSH_WIDTH, PUSH_HEIGHT, ARENA_HALF_WIDTH);

    if (fighting) {
      for (const hit of resolveHits(this.fighters)) this.onHit(hit);
    }

    if (this.phase === 'ko') {
      if (this.phaseFrame === 40 && this.winner) this.winner.setVictory();
      if (this.phaseFrame >= KO_FRAMES) {
        this.phase = 'over';
        this.hud.showMessage('');
        this.hud.showWinner(this.winner === this.p1 ? 'YOU WIN' : this.winner ? 'AI WINS' : 'DRAW');
        this.touch?.setVisible(false); // the darkened end screen has its own buttons
        if (this.winner === this.p1) { this.sfx.victory(); this.sfx.say('You win!'); }
        else { this.sfx.defeat(); this.sfx.say(this.winner ? 'You lose' : 'Draw'); }
      }
    }
  }

  onHit({ attacker, defender, move, point }) {
    if (defender.lastHitBlocked && defender.alive) {
      // Blocked: short freeze, blue spark, shield flash, no screen shake.
      this.hitstop = Math.max(this.hitstop, Math.ceil((move.hitstop || 0) / 2));
      this.effects.hitSpark(point.x, point.y, 0.5, 0x66ccff);
      this.shields[this.fighters.indexOf(defender)].flash();
      this.sfx.block();
      this.hud.setHealth(this.fighters.indexOf(defender), defender.health, defender.maxHealth);
      return;
    }
    const strength = move.damage / 10;
    this.hitstop = Math.max(this.hitstop, move.hitstop || 0);
    this.effects.hitSpark(point.x, point.y, 0.6 + strength * 0.5, move.anim === 'strong' ? 0xff6633 : 0xffdd66);
    if (move.anim === 'strong') this.sfx.heavyHit();
    else this.sfx.hit(strength);
    if (defender === this.p1) this.sfx.damage();
    this.cam.shake(move.shake || 0.05 * strength);
    this.hud.setHealth(this.fighters.indexOf(defender), defender.health, defender.maxHealth);

    if (!defender.alive) {
      const otherDown = !attacker.alive; // trade KO
      this.winner = otherDown ? null : attacker;
      this.phase = 'ko';
      this.phaseFrame = 0;
      this.hitstop = 20;
      this.cam.shake(0.4, 0.4);
      this.hud.showMessage('K.O.');
      this.sfx.ko();
      this.sfx.say('K. O.');
    }
  }

  render(dt) {
    for (const f of this.fighters) f.syncModel(dt);
    this.cam.update(this.p1, this.p2, dt);
    this.effects.update(dt);
    this.shields.forEach((s) => s.update(dt));
    this.playerIndicator.mesh.visible = this.phase !== 'menu';
    this.playerIndicator.update(dt);
    this.debug.update(this.fighters);
    this.fighters.forEach((f, i) => {
      this.hud.setStamina(i, f.stamina, f.guardBroken);
      this.hud.setSpecial(i, f.specials.status(), i === 0 ? (this.touch ? 'STR' : 'L / Y') : '');
    });
    this.touch?.setSpecialReady(this.p1.specials.full);
    this.renderer.render(this.scene, this.cam.camera);
  }
}
