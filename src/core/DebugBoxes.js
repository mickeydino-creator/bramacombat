import * as THREE from 'three';

/** Press H in game to see hurtboxes (green) and active hitboxes (red). Useful when tuning moves. */
export class DebugBoxes {
  constructor(scene) {
    this.enabled = false;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const geo = new THREE.BoxGeometry(1, 1, 0.05);
    const mk = (color) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, wireframe: true }));
      this.group.add(m);
      return m;
    };
    this.hurt = [0, 1, 2, 3].map(() => mk(0x33ff66));
    this.hit = [0, 1, 2, 3].map(() => mk(0xff3333));
  }

  toggle() { this.enabled = !this.enabled; this.group.visible = this.enabled; }

  place(mesh, b) {
    mesh.visible = !!b;
    if (!b) return;
    mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0.5);
    mesh.scale.set(b.maxX - b.minX, b.maxY - b.minY, 1);
  }

  update(fighters) {
    if (!this.enabled) return;
    fighters.forEach((f, i) => {
      this.place(this.hurt[i], f.getHurtbox());
      this.place(this.hit[i], f.getActiveHitbox());
    });
  }
}
