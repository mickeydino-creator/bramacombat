import * as THREE from 'three';
import { PALETTE } from '../style/sketch.js';

/** Blue-pen hexagon shield in front of a fighter while it blocks; flashes when a hit is blocked. */
export class BlockShield {
  constructor(scene, fighter) {
    this.fighter = fighter;
    this.flashTime = 0;
    this.group = new THREE.Group();
    const geo = new THREE.CircleGeometry(0.75, 6);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    this.group.add(new THREE.Mesh(geo, this.mat));
    // double pen outline
    const edge = new THREE.EdgesGeometry(geo);
    this.lineMat = new THREE.LineBasicMaterial({ color: PALETTE.blue, transparent: true });
    for (const s of [1, 1.06]) { const l = new THREE.LineSegments(edge, this.lineMat); l.scale.setScalar(s); l.rotation.z = (s - 1) * 2; this.group.add(l); }
    this.group.visible = false;
    scene.add(this.group);
  }

  flash() { this.flashTime = 0.15; }

  update(dt) {
    const f = this.fighter;
    const on = f.blocking || f.state === 'blockstun';
    if (this.flashTime > 0) this.flashTime -= dt;
    this.group.visible = on;
    if (!on) return;
    this.group.position.set(f.x + f.facing * 0.5, f.y + 1.15, 0);
    this.group.rotation.y = f.facing * 0.9; // angled between the opponent and the camera
    const flash = this.flashTime > 0;
    this.mat.opacity = flash ? 0.6 : 0.22 + Math.sin(f.time * 10) * 0.04;
    this.group.scale.setScalar(flash ? 1.15 : 1);
  }
}
