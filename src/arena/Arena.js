import * as THREE from 'three';
import {
  PALETTE, paperCanvas, surfaceCanvas, canvasTexture, inkEdges, doodleSprite, doodlePlane, Boil,
} from '../style/sketch.js';
import { addDeskProps } from './Props.js';

/*
 * Notebook-page arena: the whole world is drawn on a school notebook.
 * - background: the notebook page itself (paper grain, blue rules, red margin)
 * - floor: ruled paper that fades into the page; fighting platform: graph paper
 * - props: white "paper" boxes with rough ink outlines and pencil hatching
 * - doodles: stars, arrows, scribbles... that "boil" like hand-drawn animation
 * Returns { sun, stage, boil, setHalfWidth(w), update(dt) }.
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

  // Everything that belongs to the fighting stage (platform, posts, backdrop buildings, front line) lives in one
  // group so the end-of-match transition can fold it away into the page.
  const stage = new THREE.Group();
  scene.add(stage);

  const paperMat = (kind, repeat) => new THREE.MeshLambertMaterial({ map: canvasTexture(surfaceCanvas(kind), repeat) });

  // Floor: ruled notebook paper
  const floorTex = canvasTexture(paperCanvas(1024, 1024, { rules: 64, margin: 0, stains: true }), [10, 10]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ map: floorTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  scene.add(ground);

  const boil = new Boil([], 4); // gentle line boil

  // The part of the stage that depends on the fight mode's arena width: platform, front line, posts, floor arrows.
  // setHalfWidth() rebuilds it (1v1 = 7.5, bigger for 3 / 4 fighters - see src/config/modes.js).
  const flex = new THREE.Group();
  stage.add(flex);
  let halfWidth = null;
  const owned = []; // geometries / materials / textures of the current build, disposed on rebuild

  function build(hw) {
    for (const child of [...flex.children]) {
      flex.remove(child);
      child.traverse((o) => { o.geometry?.dispose(); if (o.userData.frames) boil.objs.splice(boil.objs.indexOf(o), 1); });
    }
    for (const d of owned.splice(0)) d.dispose();
    halfWidth = hw;
    const f = (hw * 2 + 1.5) / (7.5 * 2 + 1.5); // texture repeat grows with the platform, so paper cells keep their size
    const mat = (kind, repeat) => {
      const tex = canvasTexture(surfaceCanvas(kind), repeat && [repeat[0] * f, repeat[1]]);
      const m = new THREE.MeshLambertMaterial({ map: tex });
      owned.push(tex, m);
      return m;
    };

    // Fighting platform: a sheet of graph paper with an inked border
    const platform = inkEdges(new THREE.Mesh(
      new THREE.BoxGeometry(hw * 2 + 1.5, 0.3, 5),
      [mat('hatch', [6, 0.4]), mat('hatch', [6, 0.4]), mat('grid', [8, 3]), mat('grid', [f, 1]), mat('hatch', [6, 0.4]), mat('hatch', [6, 0.4])],
    ), { jitter: 0.02 });
    platform.position.y = -0.15;
    platform.receiveShadow = true;
    flex.add(platform);

    // Red pen "front line" across the floor
    const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.red });
    owned.push(lineMat);
    const line = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.5, 0.02, 0.05), lineMat);
    line.position.set(0, 0.01, 1.2);
    flex.add(line);

    // Boundary posts: pencil-sketched columns with doodle stars on top
    const postMat = mat('crosshatch', [1, 4]);
    for (const side of [-1, 1]) {
      for (const z of [-1.8, 1.8]) {
        const p = inkEdges(new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), postMat));
        p.position.set(side * (hw + 0.9), 2, z);
        p.castShadow = p.receiveShadow = true;
        flex.add(p);
        const star = boil.add(doodleSprite('star', { color: PALETTE.ink, fill: PALETTE.yellow }, 0.8));
        star.position.set(side * (hw + 0.9), 4.5, z);
        flex.add(star);
      }
    }

    // Floor doodles on the platform (arrows, X mark)
    const floor = [
      ['arrow', [-hw + 1, 2.0], 1.4, PALETTE.blue, 0.2], ['arrow', [hw - 1, 2.0], 1.4, PALETTE.blue, Math.PI - 0.2],
      ['x', [0, 2.1], 0.6, PALETTE.red, 0],
    ];
    for (const [kind, [x, z], scale, color, rot] of floor) {
      const d = boil.add(doodlePlane(kind, { color, width: 6, opacity: 0.6 }, scale));
      d.rotation.set(-Math.PI / 2, 0, rot);
      d.position.set(x, 0.012, z);
      flex.add(d);
    }

    // A wider arena shows more of the backdrop: a few extra sketched buildings further out
    if (hw > 10) {
      const bm = mat('hatch', [1, 2]);
      for (const i of [-10, -8, 8, 10]) {
        const h = 1.8 + ((Math.abs(i) * 7919) % 5) * 0.6;
        const b = inkEdges(new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 1.5), bm), { jitter: 0.03 });
        b.position.set(i * 3.4, h / 2 - 0.3, -12 - Math.abs(i) * 0.3);
        flex.add(b);
      }
    }

    // The shadow camera has to cover the whole platform
    const sc = sun.shadow.camera;
    sc.left = -(hw + 4.5); sc.right = hw + 4.5;
    sc.updateProjectionMatrix();
  }
  build(7.5);

  // Backdrop: sketched buildings / hills drawn on the page
  const bldgMat = paperMat('hatch', [1, 2]);
  for (let i = -6; i <= 6; i += 2) {
    const h = 1.6 + ((i * 7919) % 5 + 5) % 5 * 0.7;
    const b = inkEdges(new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 1.5), bldgMat), { jitter: 0.03 });
    b.position.set(i * 3.4, h / 2 - 0.3, -12 - Math.abs(i) * 0.3);
    // no receiveShadow: at this sun angle no shadow can reach the backdrop, so skip the shadow lookups
    stage.add(b);
  }

  // Sky doodles (sun, clouds, birds, scribbles) and floor doodles (arrows, X marks, stars)
  const sky = [
    // kept to a few quiet doodles so the fighters stay the focus
    ['sun', [-8, 6.5, -10], 2.4, PALETTE.pencil], ['cloud', [-1.5, 6.8, -11], 2.6, PALETTE.blue], ['cloud', [6.5, 6.2, -11], 2.3, PALETTE.blue],
    ['birds', [2.5, 5.2, -10], 1.8, PALETTE.pencil],
  ];
  for (const [kind, pos, scale, color] of sky) {
    const d = boil.add(doodleSprite(kind, { color, width: 6, opacity: 0.55 }, scale));
    d.position.set(...pos);
    scene.add(d);
  }
  addDeskProps(scene, boil); // stationery lying around the edges and background

  return {
    sun, stage, boil,
    /** Resize the playing area (platform, posts, shadows). Rebuilds only when the width changes. */
    setHalfWidth(hw) { if (hw !== halfWidth) build(hw); },
    update: (dt) => boil.update(dt),
  };
}
