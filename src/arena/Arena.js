import * as THREE from 'three';
import { ARENA_HALF_WIDTH } from '../config/constants.js';
import {
  PALETTE, paperCanvas, surfaceCanvas, canvasTexture, inkEdges, doodleSprite, doodlePlane, Boil,
} from '../style/sketch.js';

/*
 * Notebook-page arena: the whole world is drawn on a school notebook.
 * - background: the notebook page itself (paper grain, blue rules, red margin)
 * - floor: ruled paper that fades into the page; fighting platform: graph paper
 * - props: white "paper" boxes with rough ink outlines and pencil hatching
 * - doodles: stars, arrows, scribbles... that "boil" like hand-drawn animation
 * Returns { sun, update(dt) }.
 */
export function createArena(scene) {
  const paperHex = new THREE.Color(PALETTE.paper);
  scene.background = canvasTexture(paperCanvas(2048, 1152, { rules: 40, margin: 0.09, holes: true }));
  scene.fog = new THREE.Fog(paperHex, 20, 48);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfb8, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  const s = sun.shadow.camera;
  s.left = -12; s.right = 12; s.top = 10; s.bottom = -6; s.near = 1; s.far = 40;
  scene.add(sun);

  const paperMat = (kind, repeat) => new THREE.MeshLambertMaterial({ map: canvasTexture(surfaceCanvas(kind), repeat) });

  // Floor: ruled notebook paper
  const floorTex = canvasTexture(paperCanvas(1024, 1024, { rules: 64, margin: 0, stains: true }), [10, 10]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ map: floorTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  scene.add(ground);

  // Fighting platform: a sheet of graph paper with an inked border
  const platform = inkEdges(new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_HALF_WIDTH * 2 + 1.5, 0.3, 5),
    [paperMat('hatch', [6, 0.4]), paperMat('hatch', [6, 0.4]), paperMat('grid', [8, 3]), paperMat('grid'), paperMat('hatch', [6, 0.4]), paperMat('hatch', [6, 0.4])],
  ), { jitter: 0.02 });
  platform.position.y = -0.15;
  platform.receiveShadow = true;
  scene.add(platform);

  // Red pen "front line" across the floor
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.red });
  const line = new THREE.Mesh(new THREE.BoxGeometry(ARENA_HALF_WIDTH * 2 + 1.5, 0.02, 0.05), lineMat);
  line.position.set(0, 0.01, 1.2);
  scene.add(line);

  const boil = new Boil();

  // Boundary posts: pencil-sketched columns with doodle stars on top
  const postMat = paperMat('crosshatch', [1, 4]);
  for (const side of [-1, 1]) {
    for (const z of [-1.8, 1.8]) {
      const p = inkEdges(new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), postMat));
      p.position.set(side * (ARENA_HALF_WIDTH + 0.9), 2, z);
      p.castShadow = p.receiveShadow = true;
      scene.add(p);
      const star = boil.add(doodleSprite('star', { color: PALETTE.ink, fill: PALETTE.yellow }, 0.8));
      star.position.set(side * (ARENA_HALF_WIDTH + 0.9), 4.5, z);
      scene.add(star);
    }
  }

  // Backdrop: sketched buildings / hills drawn on the page
  const bldgMat = paperMat('hatch', [1, 2]);
  for (let i = -6; i <= 6; i += 2) {
    const h = 1.6 + ((i * 7919) % 5 + 5) % 5 * 0.7;
    const b = inkEdges(new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 1.5), bldgMat), { jitter: 0.03 });
    b.position.set(i * 3.4, h / 2 - 0.3, -12 - Math.abs(i) * 0.3);
    b.receiveShadow = true;
    scene.add(b);
  }

  // Sky doodles (sun, clouds, birds, scribbles) and floor doodles (arrows, X marks, stars)
  const sky = [
    ['sun', [-8, 6.5, -10], 2.6, PALETTE.ink], ['cloud', [-1.5, 6.8, -11], 3, PALETTE.blue], ['cloud', [6.5, 6.2, -11], 2.6, PALETTE.blue],
    ['birds', [2.5, 5.2, -10], 2, PALETTE.ink], ['spiral', [10.5, 5.5, -10], 1.4, PALETTE.pencil], ['zigzag', [-12, 4.8, -10], 2, PALETTE.red],
    ['heart', [9.5, 2.6, -7], 0.9, PALETTE.red], ['scribble', [-10.5, 2.4, -7], 1.4, PALETTE.pencil],
  ];
  for (const [kind, pos, scale, color] of sky) {
    const d = boil.add(doodleSprite(kind, { color, width: 6 }, scale));
    d.position.set(...pos);
    scene.add(d);
  }
  const floor = [
    ['arrow', [-ARENA_HALF_WIDTH + 1, 2.0], 1.4, PALETTE.blue, 0.2], ['arrow', [ARENA_HALF_WIDTH - 1, 2.0], 1.4, PALETTE.blue, Math.PI - 0.2],
    ['x', [0, 2.1], 0.7, PALETTE.red, 0], ['star', [-4.5, -1.9], 0.8, PALETTE.ink, 0.3], ['scribble', [4.8, -1.9], 1.4, PALETTE.pencil, 0],
    ['spiral', [ARENA_HALF_WIDTH + 2.5, 1], 1.4, PALETTE.pencil, 0], ['star', [-ARENA_HALF_WIDTH - 2.5, 0.5], 1, PALETTE.red, 0],
  ];
  for (const [kind, [x, z], scale, color, rot] of floor) {
    const d = boil.add(doodlePlane(kind, { color, width: 6, opacity: 0.6 }, scale));
    d.rotation.set(-Math.PI / 2, 0, rot);
    d.position.set(x, 0.012, z);
    scene.add(d);
  }

  return { sun, update: (dt) => boil.update(dt) };
}
