import * as THREE from 'three';

/*
 * Simple accessories attached to stickman bones; they follow the animation.
 * Use them in appearance.accessories, e.g.:
 *   { type: 'headband', color: 0xffd23f }
 *   { type: 'belt', color: 0x222222 }
 *   { type: 'wristbands', color: 0xffffff }
 *   { type: 'custom', bone: 'Head', offset: [0, 0.5, 0], create: () => new THREE.Mesh(...) }
 * Add new types to BUILDERS below. Sizes are measured from the model, so they fit other stickman versions.
 *
 * A builder returns { bone, object, offset } with offset/sizes in model (character) units at rest.
 */
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });

const BUILDERS = {
  headband({ color = 0xcc2222, tails = true }, m) {
    const { radius, center } = m.head;
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, radius * 0.1, 8, 32), mat(color));
    band.rotation.x = Math.PI / 2;
    band.castShadow = true;
    g.add(band);
    if (tails) {
      for (const s of [-1, 1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.18, radius * 0.08, radius * 0.9), mat(color));
        tail.position.set(s * radius * 0.15, -radius * 0.15, -radius * 1.35);
        tail.rotation.set(-0.5, s * 0.25, 0);
        tail.castShadow = true;
        g.add(tail);
      }
    }
    const offset = center.clone().sub(m.rest[m.head.bone].pos).add(new THREE.Vector3(0, radius * 0.3, 0));
    return { bone: m.head.bone, object: g, offset };
  },

  belt({ color = 0x111111 }, m) {
    // Waist width from the lowest spine segment (the hips region also contains the thighs).
    const box = m.measureBone('Spine');
    const size = box.getSize(new THREE.Vector3());
    const r = (Math.max(size.x, size.z) * 0.5 || m.head.radius * 0.4) * 1.08;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.18, 8, 24), mat(color));
    belt.rotation.x = Math.PI / 2;
    belt.castShadow = true;
    return { bone: 'Hips', object: belt, offset: new THREE.Vector3(0, 0, 0) };
  },

  wristbands({ color = 0xffffff }, m) {
    const g = new THREE.Group();
    const parts = [];
    for (const side of ['Left', 'Right']) {
      const fore = m.rest[`${side}ForeArm`]?.pos;
      const hand = m.rest[`${side}Hand`]?.pos;
      if (!fore || !hand) continue;
      const box = m.measureBone(`${side}ForeArm`);
      const size = box.getSize(new THREE.Vector3());
      const r = Math.min(size.y, size.z) * 0.6 || m.head.radius * 0.2;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 1.6, 12), mat(color));
      band.rotation.z = Math.PI / 2; // arms point along X at rest (T-pose)
      band.castShadow = true;
      parts.push({ bone: `${side}ForeArm`, object: band, offset: hand.clone().sub(fore).multiplyScalar(0.85) });
    }
    return parts.length ? { multi: parts } : null;
  },

  custom({ bone, offset = [0, 0, 0], create }, m) {
    if (!create) return null;
    return { bone: bone || m.head.bone, object: create(THREE, m), offset: new THREE.Vector3(...offset) };
  },
};

export function createAccessory(def, model) {
  const build = BUILDERS[def.type];
  if (!build) { console.warn('Unknown accessory type', def.type); return null; }
  return build(def, model);
}
