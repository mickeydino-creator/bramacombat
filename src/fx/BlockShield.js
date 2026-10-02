import * as THREE from 'three';
import { doodleFrames, PALETTE } from '../style/sketch.js';

/*
 * Hand-drawn blue-pen shield in front of a fighter, shown only while it blocks
 * (appears/disappears instantly). A blocked hit makes it pop and flash.
 */
export class BlockShield {
  constructor(scene, fighter) {
    this.fighter = fighter;
    this.flashTime = 0;
    this.frames = doodleFrames('shield', { color: PALETTE.blue, size: 256, frames: 2, width: 7 });
    this.hitFrames = doodleFrames('shield', { color: PALETTE.ink, size: 256, frames: 2, width: 9 });
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.frames[0], transparent: true, depthWrite: false }));
    this.sprite.renderOrder = 6;
    this.sprite.visible = false;
    scene.add(this.sprite);
    this.t = 0;
  }

  flash() { this.flashTime = 0.16; }

  update(dt) {
    const f = this.fighter;
    const on = f.blocking || f.state === 'blockstun';
    this.sprite.visible = on;
    if (this.flashTime > 0) this.flashTime -= dt;
    if (!on) return;
    this.t += dt;
    this.sprite.position.set(f.x + f.facing * 0.55, f.y + 1.2, 0.35);
    const flash = this.flashTime > 0;
    const k = flash ? 1 + (this.flashTime / 0.16) * 0.25 : 1;
    this.sprite.scale.set(0.95 * k, 1.15 * k, 1);
    const set = flash ? this.hitFrames : this.frames;
    this.sprite.material.map = set[Math.floor(this.t * 5) % set.length];
    this.sprite.material.opacity = flash ? 1 : 0.92;
  }
}
