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
import { AIController } from '../ai/AIController.js';
import { createArena } from '../arena/Arena.js';
import { FightCamera } from '../camera/FightCamera.js';
import { Effects } from '../fx/Effects.js';
import { Sfx } from '../audio/Sfx.js';
import { HUD } from '../ui/HUD.js';
import { DebugBoxes } from './DebugBoxes.js';

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
    createArena(this.scene);
    this.cam = new FightCamera(window.innerWidth / window.innerHeight);
    this.effects = new Effects(this.scene);
    this.sfx = new Sfx();
    this.hud = new HUD(() => this.restart());
    this.debug = new DebugBoxes(this.scene);

    // ---- Fighters: pick characters here ----
    this.p1 = new Fighter(CHARACTERS.ember, this.scene);
    this.p2 = new Fighter(CHARACTERS.volt, this.scene);
    this.fighters = [this.p1, this.p2];
    // Player 1 = keyboard + first gamepad, merged into one input.
    const player1 = new CombinedController([new KeyboardController(), new GamepadController()]);
    this.controllers = [player1, new AIController({ aggression: 0.55 })];
    this.hud.setNames(this.p1.name, this.p2.name);

    for (const f of this.fighters) {
      f.on('attackStart', () => this.sfx.swing());
      f.on('jump', () => this.sfx.jump());
    }

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.cam.resize(window.innerWidth / window.innerHeight);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' || (e.code === 'Enter' && this.phase === 'over')) this.restart();
      if (e.code === 'KeyH') this.debug.toggle();
    });

    this.restart();
  }

  restart() {
    this.p1.reset(-2.5, 1);
    this.p2.reset(2.5, -1);
    this.controllers[1].reset?.();
    this.phase = 'intro';
    this.phaseFrame = 0;
    this.hitstop = 0;
    this.winner = null;
    this.hud.hideWinner();
    this.hud.showMessage('ROUND 1');
    this.fighters.forEach((f, i) => this.hud.setHealth(i, f.health, f.maxHealth));
    this.cam.update(this.p1, this.p2, STEP, true);
    this.sfx.announce();
  }

  start() {
    this.last = performance.now();
    this.acc = 0;
    const loop = (now) => {
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
    this.phaseFrame++;

    if (this.phase === 'intro') {
      if (this.phaseFrame === Math.floor(INTRO_FRAMES * 0.55)) { this.hud.showMessage('FIGHT!'); this.sfx.announce(); }
      if (this.phaseFrame >= INTRO_FRAMES) { this.phase = 'fight'; this.hud.showMessage(''); }
    }

    // Hitstop: freeze the fighters for a few frames on impact.
    if (this.hitstop > 0) { this.hitstop--; return; }

    const fighting = this.phase === 'fight';
    // Player input is always polled so presses don't pile up between rounds.
    const raw1 = this.controllers[0].getInput(this.p1, this.p2);
    if (raw1.restart && this.phase === 'over') { this.restart(); return; }
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
        this.hud.showWinner(this.winner ? `${this.winner.name} WINS` : 'DRAW');
      }
    }
  }

  onHit({ attacker, defender, move, point }) {
    const strength = move.damage / 10;
    this.hitstop = Math.max(this.hitstop, move.hitstop || 0);
    this.effects.hitSpark(point.x, point.y, 0.6 + strength * 0.5, move.anim === 'strong' ? 0xff6633 : 0xffdd66);
    this.sfx.hit(strength);
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
    }
  }

  render(dt) {
    for (const f of this.fighters) f.syncModel(dt);
    this.cam.update(this.p1, this.p2, dt);
    this.effects.update(dt);
    this.debug.update(this.fighters);
    this.renderer.render(this.scene, this.cam.camera);
  }
}
