import * as THREE from 'three';

/** Cheap hit sparks: expanding, fading additive spheres + rings. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.sphereGeo = new THREE.SphereGeometry(0.2, 12, 8);
    this.ringGeo = new THREE.RingGeometry(0.25, 0.32, 24);
  }

  hitSpark(x, y, strength = 1, color = 0xffdd66) {
    const make = (geo, life, grow) => {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, 0.3);
      this.scene.add(m);
      this.items.push({ m, life, max: life, grow });
    };
    make(this.sphereGeo, 0.15, 6 * strength);
    make(this.ringGeo, 0.25, 9 * strength);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = 1 - it.life / it.max;
      it.m.scale.setScalar(1 + k * it.grow);
      it.m.material.opacity = Math.max(0, 1 - k);
      if (it.life <= 0) {
        this.scene.remove(it.m);
        it.m.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
