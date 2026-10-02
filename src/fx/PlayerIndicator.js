import * as THREE from 'three';
import { PALETTE, penLine } from '../style/sketch.js';

/**
 * Hand-drawn red-pen arrow with "YOU" floating above the player-controlled fighter.
 * Drawn on top of everything, so it stays visible from any camera angle.
 */
function drawArrow(frame) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d');
  g.strokeStyle = PALETTE.red; g.fillStyle = PALETTE.red; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.font = '44px "Permanent Marker", "Comic Sans MS", cursive'; g.textAlign = 'center';
  g.fillText('YOU', 64 + (frame - 1) * 1.5, 46);
  penLine(g, 64, 62, 64, 140, 2.5);
  penLine(g, 64, 142, 40, 112, 2.5);
  penLine(g, 64, 142, 88, 112, 2.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _target = new THREE.Vector3();

export class PlayerIndicator {
  constructor(scene, fighter, { height = 2.45, size = 0.55 } = {}) {
    this.fighter = fighter;
    this.height = height;
    this.frames = [0, 1, 2].map(drawArrow);
    this.mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.frames[0], transparent: true, depthTest: false, depthWrite: false }));
    this.mesh.scale.set(size, size * 1.25, 1);
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.time = 0;
    this.snap();
  }

  snap() { this.mesh.position.set(this.fighter.x, this.fighter.y + this.height, 0); }

  update(dt) {
    this.time += dt;
    const f = this.fighter;
    const target = _target.set(f.x, f.y + this.height + Math.sin(this.time * 4) * 0.05, 0);
    this.mesh.position.lerp(target, 1 - Math.exp(-dt * 18)); // smooth follow
    this.mesh.material.map = this.frames[Math.floor(this.time * 7) % 3]; // hand-drawn boil
  }
}
