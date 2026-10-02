import * as THREE from 'three';

/** Side-view fighting camera: follows the midpoint and zooms out as fighters separate. */
export class FightCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 200);
    this.target = new THREE.Vector3(0, 1.2, 0);
    this.shakeTime = 0;
    this.shakeAmount = 0;
    this.camera.position.set(0, 2.6, 9);
  }

  /** Short punch-in zoom (special activation / impact), decays by itself. */
  kick(amount = 0.8) { this.kickAmount = Math.max(this.kickAmount || 0, amount); }

  shake(amount, time = 0.25) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  update(a, b, dt, snap = false) {
    const midX = (a.x + b.x) / 2;
    const midY = Math.max(a.y, b.y) * 0.4;
    const dist = Math.abs(a.x - b.x);
    const zoom = THREE.MathUtils.clamp(6.5 + dist * 0.75, 7.5, 15);

    this.kickAmount = (this.kickAmount || 0) * Math.exp(-dt * 7);
    const z = zoom - (this.kickAmount || 0);
    const desired = new THREE.Vector3(midX, 2.3 + z * 0.08 + midY, z);
    const look = new THREE.Vector3(midX, 1.1 + midY, 0);
    const t = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.camera.position.lerp(desired, t);
    this.target.lerp(look, t);

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeAmount * Math.max(0, this.shakeTime) * 4;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      if (this.shakeTime <= 0) this.shakeAmount = 0;
    }
    this.camera.lookAt(this.target);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
