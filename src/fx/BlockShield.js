import * as THREE from 'three';

/** Translucent hex shield in front of a fighter while it blocks; flashes when a hit is blocked. */
export class BlockShield {
  constructor(scene, fighter) {
    this.fighter = fighter;
    this.flashTime = 0;
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x66ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 6), this.mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  flash() { this.flashTime = 0.15; }

  update(dt) {
    const f = this.fighter;
    const on = f.blocking || f.state === 'blockstun';
    if (this.flashTime > 0) this.flashTime -= dt;
    this.mesh.visible = on;
    if (!on) return;
    this.mesh.position.set(f.x + f.facing * 0.5, f.y + 1.15, 0);
    this.mesh.rotation.y = f.facing * 0.9; // angled between the opponent and the camera
    this.mat.opacity = this.flashTime > 0 ? 0.85 : 0.28 + Math.sin(f.time * 10) * 0.05;
    this.mesh.scale.setScalar(this.flashTime > 0 ? 1.15 : 1);
  }
}
