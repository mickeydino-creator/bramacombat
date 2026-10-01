import * as THREE from 'three';
import { ARENA_HALF_WIDTH } from '../config/constants.js';

/** Simple arena: floor, fighting platform, boundary pillars, backdrop. Swap freely. */
export function createArena(scene) {
  scene.background = new THREE.Color(0x1a1420);
  scene.fog = new THREE.Fog(0x1a1420, 18, 45);

  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x3a2a20, 0.9));
  const sun = new THREE.DirectionalLight(0xffe2c0, 2.2);
  sun.position.set(-6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -12; s.right = 12; s.top = 10; s.bottom = -6; s.near = 1; s.far = 40;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x2c2430, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  scene.add(ground);

  // Fighting platform (top surface at y = 0)
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_HALF_WIDTH * 2 + 1.5, 0.3, 5),
    new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.85 }),
  );
  platform.position.y = -0.15;
  platform.receiveShadow = true;
  scene.add(platform);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xc9a227 });
  const line = new THREE.Mesh(new THREE.BoxGeometry(ARENA_HALF_WIDTH * 2 + 1.5, 0.02, 0.06), lineMat);
  line.position.set(0, 0.01, 1.2);
  scene.add(line);

  // Boundary pillars
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8a2e2e, roughness: 0.7 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff7711, emissiveIntensity: 1.5 });
  for (const side of [-1, 1]) {
    for (const z of [-1.8, 1.8]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), pillarMat);
      p.position.set(side * (ARENA_HALF_WIDTH + 0.9), 2, z);
      p.castShadow = p.receiveShadow = true;
      scene.add(p);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowMat);
      flame.position.set(side * (ARENA_HALF_WIDTH + 0.9), 4.25, z);
      scene.add(flame);
    }
    const light = new THREE.PointLight(0xff8833, 8, 10);
    light.position.set(side * (ARENA_HALF_WIDTH + 0.9), 4, 0);
    scene.add(light);
  }

  // Backdrop silhouettes
  const backMat = new THREE.MeshStandardMaterial({ color: 0x3a2e3e, roughness: 1 });
  for (let i = -6; i <= 6; i++) {
    const h = 3 + ((i * 7919) % 5 + 5) % 5 * 1.2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 1.5), backMat);
    b.position.set(i * 3.2, h / 2 - 0.3, -9 - Math.abs(i) * 0.4);
    b.receiveShadow = true;
    scene.add(b);
  }

  return { sun };
}
