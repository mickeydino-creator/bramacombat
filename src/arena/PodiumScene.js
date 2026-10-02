import * as THREE from 'three';
import {
  PALETTE, canvasTexture, surfaceCanvas, inkEdges, doodleSprite, doodlePlane,
} from '../style/sketch.js';
import { buildProps, PROP_BUILDERS as P } from './Props.js';

/*
 * Victory podium, built inside the same notebook world. When the match is decided, the fighting stage
 * (platform, posts, buildings) folds down into the page while the podium rises out of it, a few paper
 * scraps flutter up, and the camera glides to the podium shot. The notebook page, floor and desk props stay
 * where they are, so it feels like the same page rearranging itself.
 *
 *   setProgress(t)   0 = arena, 1 = podium (drives everything; Game calls it every frame of the transition)
 *   reset()          back to the normal arena
 */
const GROUND = -0.3;
const BLOCK_W = 2, BLOCK_D = 1.8;

/*
 * Podium layouts. slots[rank] = where the fighter in that rank stands: x of the block center and the height of its top
 * (= where the feet stand). 'duel' (2 fighters) has 1st in the middle and 2nd beside it; 'crowd' (3-4 fighters) adds a
 * 3rd block on the other side, and a 4th place fighter simply stands on the floor next to it.
 */
const PODIUM_LAYOUTS = {
  duel: {
    slots: [{ x: 0, top: 1.5 }, { x: 2.05, top: 0.9 }],
    camera: { pos: new THREE.Vector3(1.05, 3.0, 11.4), look: new THREE.Vector3(1.05, 2.0, 0) },
    decorX: 0,
  },
  crowd: {
    slots: [{ x: 0, top: 1.5 }, { x: 2.05, top: 0.9 }, { x: -2.05, top: 0.5 }, { x: -4.3, top: GROUND }],
    camera: { pos: new THREE.Vector3(0, 3.1, 12.6), look: new THREE.Vector3(0, 2.0, 0) },
    decorX: -1.05,
  },
};
export const podiumLayout = (fighterCount) => (fighterCount > 2 ? PODIUM_LAYOUTS.crowd : PODIUM_LAYOUTS.duel);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeInOut = (t) => t * t * (3 - 2 * t);
const easeOutBack = (t) => { const c = 1.9; const x = t - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

/** A big hand-drawn marker numeral on a transparent canvas, 2 slightly different frames (line boil). */
function numeralFrames(char, color) {
  return [0, 1].map(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.font = '215px "Permanent Marker", "Comic Sans MS", cursive';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const j = () => (Math.random() - 0.5) * 6;
    g.strokeStyle = PALETTE.ink; g.lineWidth = 11; g.strokeText(char, 128 + j(), 138 + j());
    g.fillStyle = color; g.fillText(char, 128 + j() * 0.4, 138 + j() * 0.4);
    g.strokeStyle = PALETTE.ink; g.lineWidth = 3.5; g.strokeText(char, 128 + j(), 138 + j());
    return canvasTexture(c);
  });
}

export class PodiumScene {
  constructor(scene, arena) {
    this.scene = scene;
    this.stage = arena.stage;
    this.boil = arena.boil;
    this.textures = [];
    this.root = new THREE.Group();
    scene.add(this.root);

    const tex = (kind, repeat) => { const t = canvasTexture(surfaceCanvas(kind), repeat); this.textures.push(t); return t; };
    const mat = (kind, repeat) => new THREE.MeshLambertMaterial({ map: tex(kind, repeat) });
    this.blocks = {};
    const crowd = PODIUM_LAYOUTS.crowd.slots;
    for (const [key, spec, numeral, color, size] of [
      ['first', crowd[0], '1', PALETTE.red, 1.25], ['second', crowd[1], '2', PALETTE.blue, 0.95], ['third', crowd[2], '3', '#2f8a46', 0.7],
    ]) {
      const h = spec.top - GROUND;
      const g = new THREE.Group();
      g.position.x = spec.x;
      const block = inkEdges(new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_W, h, BLOCK_D),
        [mat('hatch', [2, 1.2]), mat('hatch', [2, 1.2]), mat('grid', [2, 2]), mat('hatch', [2, 1.2]), mat('hatch', [2, 1.2]), mat('hatch', [2, 1.2])],
      ), { jitter: 0.02 });
      block.position.y = GROUND + h / 2;
      block.castShadow = block.receiveShadow = true;
      g.add(block);
      const frames = numeralFrames(numeral, color);
      this.textures.push(...frames);
      const n = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: frames[0], transparent: true, depthWrite: false }));
      n.position.set(0, GROUND + h / 2, BLOCK_D / 2 + 0.015);
      n.userData.frames = frames;
      this.boil.add(n);
      g.add(n);
      this.root.add(g);
      this.blocks[key] = { group: g, hidden: -(h + 0.3), active: key !== 'third' };
    }

    // decor: doodles, stars, a few paper balls and pencils around the podium
    this.decor = new THREE.Group();
    const rays = this.boil.add(doodleSprite('rays', { color: '#e0a800', width: 6, opacity: 0.32 }, 8.5));
    rays.position.set(1.0, 2.6, -2.4);
    this.decor.add(rays);
    for (const [x, y, z, s] of [[-1.9, 3.9, -1.2, 0.85], [3.9, 4.1, -1.2, 0.95], [1.0, 5.0, -1.8, 0.65], [-3.3, 2.6, -1, 0.55], [5.2, 2.9, -1, 0.5]]) {
      const star = this.boil.add(doodleSprite('star', { color: PALETTE.ink, fill: PALETTE.yellow, opacity: 0.9 }, s));
      star.position.set(x, y, z);
      this.decor.add(star);
    }
    for (const [kind, x, z, size, color, rot] of [['scribble', -3.0, 0.5, 1.5, PALETTE.pencil, 0.2], ['arrow', 4.9, 0.6, 1.2, PALETTE.red, Math.PI - 0.3], ['x', -1.2, 2.2, 0.5, PALETTE.red, 0], ['spiral', 5.6, 3.1, 0.9, PALETTE.pencil, 0]]) {
      const d = this.boil.add(doodlePlane(kind, { color, width: 6, opacity: 0.5 }, size));
      d.rotation.set(-Math.PI / 2, 0, rot);
      d.position.set(x, GROUND + 0.012, z);
      this.decor.add(d);
    }
    this.decor.add(buildProps([
      [P.paperBall, -2.3, 1.9, 0, 1, [0.34]], [P.paperBall, -1.5, 2.9, 0, 1, [0.25]], [P.paperBall, 4.5, 1.8, 0, 1, [0.3]],
      [P.pencil, -3.7, 1.3, 0.35, 1, [2.8, '#f0c93c', '#f1a7ad']], [P.pencil, 3.9, 2.9, -0.3, 0.85, [2.6, '#4f7bd8', '#f1a7ad']],
      [P.eraser, 5.1, 1.0, 0.5, 0.9], [P.crayon, -2.6, 2.7, 0.9, 1, ['#f1a04a']], [P.scrap, 0.4, 2.8, 0.3, 1.2, [0.7, 3]], [P.paperClip, 5.7, 2.4, 0.5, 1],
    ], 23));
    this.root.add(this.decor);

    // The hole that opens under the 4th-place fighter (hand-drawn dark ellipse on the page)
    const hc = document.createElement('canvas');
    hc.width = 256; hc.height = 180;
    const hg = hc.getContext('2d');
    hg.lineCap = 'round';
    hg.fillStyle = '#17171f'; hg.beginPath(); hg.ellipse(128, 90, 112, 72, 0, 0, Math.PI * 2); hg.fill();
    hg.strokeStyle = 'rgba(255,255,255,0.12)'; hg.lineWidth = 3;
    for (let i = 0; i < 9; i++) { hg.beginPath(); hg.moveTo(40 + i * 22, 40); hg.lineTo(26 + i * 22, 140); hg.stroke(); } // pencil hatching inside
    hg.strokeStyle = PALETTE.ink; hg.lineWidth = 7;
    for (let pass = 0; pass < 2; pass++) { // wobbly double pen outline
      hg.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.2) {
        const x = 128 + Math.cos(a) * (112 + Math.random() * 5), y = 90 + Math.sin(a) * (72 + Math.random() * 4);
        if (a === 0) hg.moveTo(x, y); else hg.lineTo(x, y);
      }
      hg.stroke();
    }
    const holeTex = canvasTexture(hc);
    this.textures.push(holeTex);
    this.hole = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.34), new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false }));
    this.hole.rotation.x = -Math.PI / 2;
    this.hole.position.set(PODIUM_LAYOUTS.crowd.slots[3].x, GROUND + 0.016, 0);
    this.hole.renderOrder = 3;
    this.root.add(this.hole);

    // paper scraps that flutter up while the page rearranges
    this.scraps = [];
    const geo = new THREE.PlaneGeometry(0.4, 0.52);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 3 ? '#f4efdf' : '#e8dfc4', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.renderOrder = 8;
      m.userData = { x: -7 + (i / 9) * 14 + (Math.random() - 0.5) * 2, z: (Math.random() - 0.3) * 4, vy: 3 + Math.random() * 3, sway: 0.4 + Math.random() * 0.6, spin: 2 + Math.random() * 4, ph: Math.random() * 6 };
      this.root.add(m);
      this.scraps.push(m);
    }
    this.reset();
  }

  /** Pick the layout for this many fighters (the 3rd block and the decor position depend on it). */
  configure(fighterCount) {
    const layout = podiumLayout(fighterCount);
    this.blocks.third.active = fighterCount > 2;
    this.decor.position.x = layout.decorX;
    this.layout = layout;
  }

  /** Make everything visible once so the renderer compiles shaders / uploads textures before the first transition. */
  prime(renderer, camera) {
    this.blocks.third.active = true;
    this.setProgress(0.5);
    for (const m of this.scraps) m.visible = true;
    renderer.compile(this.scene, camera);
    for (const t of this.textures) renderer.initTexture?.(t);
    this.blocks.third.active = false;
    this.layout = PODIUM_LAYOUTS.duel;
    this.reset();
  }

  reset() {
    this.setProgress(0);
    this.setHole(0);
  }

  /** The hole under the 4th place: 0 = closed, 1 = fully open (it grows from its center). */
  setHole(p) {
    this.hole.visible = p > 0;
    this.hole.scale.setScalar(Math.max(1e-3, p * (2 - p))); // ease-out
  }

  setProgress(t) {
    // 1. the stage folds down into the page
    const s = easeInOut(clamp01(t / 0.55));
    this.stage.position.y = -3.6 * s;
    this.stage.rotation.x = -0.1 * s;
    this.stage.visible = s < 0.999;

    // 2. podium blocks rise (runner-up first, then the winner's block, with a little paper "pop")
    this.root.visible = t > 0;
    for (const [key, from, len] of [['third', 0.14, 0.5], ['second', 0.22, 0.5], ['first', 0.34, 0.52]]) {
      const b = this.blocks[key];
      const p = clamp01((t - from) / len);
      b.group.visible = p > 0 && b.active;
      b.group.position.y = b.hidden * (1 - easeOutBack(p));
    }

    // 3. doodles, stars and paper balls pop in last
    const d = clamp01((t - 0.62) / 0.38);
    this.decor.visible = d > 0;
    this.decor.scale.setScalar(Math.max(1e-3, easeOutBack(d)));

    // 4. paper scraps flutter up and fade out
    const time = t * 1.6;
    for (const m of this.scraps) {
      const u = m.userData;
      m.visible = t > 0.02 && t < 0.97;
      m.position.set(u.x + Math.sin(time * 4 + u.ph) * u.sway, 0.2 + u.vy * time - 1.7 * time * time, u.z);
      m.rotation.set(time * u.spin, time * u.spin * 0.7 + u.ph, time * u.spin * 0.5);
      m.material.opacity = Math.min(1, t / 0.12) * (1 - easeInOut(clamp01((t - 0.55) / 0.4)));
    }
  }
}
