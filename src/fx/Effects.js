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
    // a single pen speed line, only for big (worded) hits - keep the screen clean
    for (let i = 0; i < (text ? 1 : 0); i++) {
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: doodleFrames('zigzag', { color: PALETTE.ink, size: 128, frames: 2, width: 6 })[i % 2], transparent: true, depthTest: false }));
      l.position.set(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, 0.45);
      l.material.rotation = Math.random() * Math.PI;
      l.renderOrder = 19;
      this.scene.add(l);
      this.items.push({ obj: l, life: 0.18, max: 0.18, base: 0.35 * strength, drift: (Math.random() - 0.5) * 3 });
    }
  }

  /** Generic short-lived sprite. follow = fighter to stay attached to (offset in world units). */
  sprite(kind, opts, { x, y, z = 0.4, size = 1, life = 0.3, grow = 0.5, follow = null, ox = 0, oy = 0, rot = 0, order = 18 }) {
    const frames = doodleFrames(kind, { size: 256, frames: 2, ...opts });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], transparent: true, depthTest: false, depthWrite: false }));
    s.material.rotation = rot;
    s.position.set(x, y, z);
    s.renderOrder = order;
    this.scene.add(s);
    this.items.push({ obj: s, life, max: life, base: size, frames, grow, follow, ox, oy, custom: true });
    return s;
  }

  /** Special activation: pen-ray aura that pops around the fighter + motion lines behind it. */
  specialActivate(f) {
    this.sprite('rays', { color: PALETTE.ink, width: 6 }, { x: f.x, y: f.y + 1.1, size: 2.2, life: 0.35, grow: 0.35, follow: f, oy: 1.1 });
    this.sprite('ring', { color: '#e0a800', width: 7 }, { x: f.x, y: f.y + 1.1, size: 1.2, life: 0.3, grow: 1.1, follow: f, oy: 1.1, order: 17 });
    this.sprite('speedlines', { color: PALETTE.ink, width: 6 }, {
      x: f.x - f.facing * 0.9, y: f.y + 1.0, size: 1.3, life: 0.4, grow: 0.1, follow: f, ox: -f.facing * 0.9, oy: 1.0, rot: f.facing > 0 ? 0 : Math.PI,
    });
  }

  /** Special landing: big worded burst + expanding shockwave ring. */
  specialImpact(x, y) {
    this.hitSpark(x, y, 1.25, 0xff7a45, 'KA-POW!');
    this.sprite('ring', { color: PALETTE.ink, width: 6 }, { x, y, z: 0.45, size: 0.8, life: 0.35, grow: 2.2, order: 19 });
  }

  /** Blocked hit: small blue sparks at the shield. */
  blockSparks(x, y) {
    this.sprite('sparks', { color: PALETTE.blue, width: 6 }, { x, y, z: 0.5, size: 0.75, life: 0.18, grow: 0.6, rot: Math.random() * Math.PI, order: 21 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = 1 - it.life / it.max;
      if (it.custom) {
        it.obj.scale.setScalar(it.base * (0.7 + k * it.grow + (k < 0.15 ? 0.3 * (k / 0.15) : 0.3)));
        it.obj.material.opacity = k < 0.5 ? 1 : Math.max(0, 1 - (k - 0.5) / 0.5);
        if (it.follow) it.obj.position.set(it.follow.x + it.ox, it.follow.y + it.oy, it.obj.position.z);
      } else {
        const pop = k < 0.2 ? 0.6 + (k / 0.2) * 0.6 : 1.2 - (k - 0.2) * 0.25; // quick pop, slow shrink
        it.obj.scale.setScalar(it.base * pop);
        it.obj.material.opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
      }
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
