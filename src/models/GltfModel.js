import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
 * Adapter for your own rigged characters (.glb / .gltf, e.g. exported from Blender or Mixamo).
 *
 * Usage in src/config/characters.js:
 *   createModel: () => new GltfModel({
 *     url: '/models/ember.glb',          // put the file in /public/models/
 *     scale: 1,
 *     rotationY: 0,                      // adjust if your model doesn't face +Z
 *     clips: { idle: 'Idle', walk: 'Walk', punch: 'Punch', ... } // animState -> clip name in the file
 *   }),
 *
 * Attack clips are time-synced to the move's frame data, so a slow clip still lines up with the hitbox.
 */
const DEFAULT_CLIPS = {
  idle: 'Idle', walk: 'Walk', jump: 'Jump', punch: 'Punch', kick: 'Kick',
  strong: 'Strong', hit: 'Hit', block: 'Block', ko: 'KO', victory: 'Victory',
};
const ONE_SHOT = new Set(['punch', 'kick', 'strong', 'hit', 'ko', 'victory', 'jump']);

export class GltfModel {
  constructor({ url, scale = 1, rotationY = 0, clips = {} }) {
    this.root = new THREE.Group();
    this.clipNames = { ...DEFAULT_CLIPS, ...clips };
    this.actions = {};
    this.current = null;
    this.mixer = null;
    this.materials = [];

    new GLTFLoader().load(url, (gltf) => {
      const scene = gltf.scene;
      scene.scale.setScalar(scale);
      scene.rotation.y = rotationY;
      scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.material = o.material.clone();
          this.materials.push(o.material);
        }
      });
      this.root.add(scene);
      this.mixer = new THREE.AnimationMixer(scene);
      for (const [state, clipName] of Object.entries(this.clipNames)) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
        if (!clip) continue;
        const action = this.mixer.clipAction(clip);
        if (ONE_SHOT.has(state)) { action.setLoop(THREE.LoopOnce); action.clampWhenFinished = true; }
        this.actions[state] = action;
      }
    }, undefined, (err) => console.error('GltfModel: failed to load', url, err));
  }

  play(state) {
    const next = this.actions[state] || this.actions.idle;
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, 0.08, false);
    this.current = next;
  }

  update(f, dt) {
    if (!this.mixer) return;
    const state = f.animState;
    this.play(state);
    if (f.attack && this.current === this.actions[state]) {
      // Drive the attack clip by attack progress instead of wall-clock time.
      const a = f.attack;
      const total = a.startup + a.active + a.recovery;
      this.current.time = (a.frame / total) * this.current.getClip().duration;
      this.mixer.update(0);
    } else {
      this.mixer.update(dt);
    }
    if (this.flashTimer > 0 && (this.flashTimer -= dt) <= 0) this.setFlash(false);
  }

  flash() { this.flashTimer = 0.12; this.setFlash(true); }

  setFlash(on) {
    for (const m of this.materials) if (m.emissive) m.emissive.setHex(on ? 0xff2222 : 0x000000);
  }

  reset() { this.current?.stop(); this.current = null; }
}
