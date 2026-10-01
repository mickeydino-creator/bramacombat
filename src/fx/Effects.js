import * as THREE from 'three';
import { doodleFrames, PALETTE } from '../style/sketch.js';

/*
 * Hit effects in comic / sketchbook style: an inked burst that pops and fades,
 * optional comic word ("POW!", "BAM!") for big hits, and a few pen speed lines.
 */
const WORDS = ['POW!', 'BAM!', 'WHAM!', 'KAPOW!', 'BOOM!'];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  /**
   * @param word  true = random comic word, string = that word, falsy = no word
   */
  hitSpark(x, y, strength = 1, color = 0xffdd66, word = null) {
    const fill = `#${new THREE.Color(color).getHexString()}`;
    const text = word === true ? WORDS[Math.floor(Math.random() * WORDS.length)] : word || '';
    const frames = doodleFrames('burst', { fill, word: text, size: 256, frames: 3, width: 7 });
    const mat = new THREE.SpriteMaterial({ map: frames[Math.floor(Math.random() * frames.length)], transparent: true, depthTest: false, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, 0.5);
    s.material.rotation = (Math.random() - 0.5) * 0.6;
    s.renderOrder = 20;
    this.scene.add(s);
    const base = (text ? 1.15 : 0.7) * Math.max(0.7, strength);
    this.items.push({ obj: s, life: text ? 0.55 : 0.3, max: text ? 0.55 : 0.3, base, frames });
    // pen speed lines
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: doodleFrames('zigzag', { color: PALETTE.ink, size: 128, frames: 2, width: 6 })[i % 2], transparent: true, depthTest: false }));
      l.position.set(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, 0.45);
      l.material.rotation = Math.random() * Math.PI;
      l.renderOrder = 19;
      this.scene.add(l);
      this.items.push({ obj: l, life: 0.18, max: 0.18, base: 0.35 * strength, drift: (Math.random() - 0.5) * 3 });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = 1 - it.life / it.max;
      const pop = k < 0.2 ? 0.6 + (k / 0.2) * 0.6 : 1.2 - (k - 0.2) * 0.25; // quick pop, slow shrink
      it.obj.scale.setScalar(it.base * pop);
      it.obj.material.opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
      if (it.frames && Math.random() < 0.3) it.obj.material.map = it.frames[Math.floor(Math.random() * it.frames.length)];
      if (it.drift) it.obj.position.x += it.drift * dt;
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
