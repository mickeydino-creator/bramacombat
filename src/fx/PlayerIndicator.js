import * as THREE from 'three';

/**
 * Small downward-pointing arrow floating above the player-controlled fighter.
 * Unlit and drawn on top of everything, so it stays visible from any camera angle.
 */
export class PlayerIndicator {
  constructor(scene, fighter, { color = 0xffd23f, height = 2.3, size = 0.13 } = {}) {
    this.fighter = fighter;
    this.height = height; // above the fighter's feet
    this.mesh = new THREE.Mesh(
      new THREE.ConeGeometry(size, size * 1.6, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
    );
    this.mesh.rotation.x = Math.PI; // point down
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.time = 0;
    this.snap();
  }

  /** Jump straight to the fighter (used on restart). */
  snap() { this.mesh.position.set(this.fighter.x, this.fighter.y + this.height, 0); }

  update(dt) {
    this.time += dt;
    const f = this.fighter;
    const target = new THREE.Vector3(f.x, f.y + this.height + Math.sin(this.time * 4) * 0.05, 0);
    this.mesh.position.lerp(target, 1 - Math.exp(-dt * 18)); // smooth follow
    this.mesh.rotation.y += dt * 1.5; // slow spin so the diamond-shaped arrow catches the light
  }
}
