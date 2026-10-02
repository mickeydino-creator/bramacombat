import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, doodlePlane } from '../style/sketch.js';

/*
 * Study-desk props: simple low-poly 3D stationery lying around the arena, as if the fight were
 * happening on a student's desk. Everything stays in the background and at the far edges, away from
 * the fighting platform (x +-8.25, z +-2.5), so it never touches combat or covers the fighters.
 *
 * Performance: every prop is built from a few primitives, then ALL of them are baked into just
 * two draw calls - one mesh (vertex colors) and one pen-outline line set. No textures, no per-frame work.
 *
 * To add or move something: edit LAYOUT at the bottom (x, z on the floor, rotation, size).
 */

const GROUND = -0.3; // top of the notebook-page floor
const C = {
  yellow: '#f0c93c', wood: '#e9c99b', graphite: '#4a4a54', pink: '#f1a7ad', metal: '#b8bcc6', paper: '#f4efdf',
  paperShade: '#e6dfc8', blue: '#4f7bd8', red: '#d65a4d', green: '#5eae6d', black: '#33333c', orange: '#f1a04a',
  ruler: '#efd98a', eraser: '#f3d3d6', purple: '#8e6fc9', tape: '#dccb92', mug: '#79b8c9',
};

// Small deterministic random so the desk looks the same every time.
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const between = (a, b) => a + rnd() * (b - a);

class Builder {
  constructor() { this.parts = []; }

  /** geometry + color, placed by `local` (Matrix4) inside the prop, which is placed by `base`. */
  add(geometry, color, base, local = new THREE.Matrix4(), { outline = true, threshold = 30 } = {}) {
    this.parts.push({ geometry, color: new THREE.Color(color), matrix: base.clone().multiply(local), outline, threshold });
  }

  /** Merge everything into one colored mesh + one outline line set. */
  build() {
    const geos = [], lines = [];
    for (const p of this.parts) {
      let g = p.geometry.clone();
      g.deleteAttribute('uv');
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(p.matrix);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = p.color.r; col[i * 3 + 1] = p.color.g; col[i * 3 + 2] = p.color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
      if (p.outline) {
        const e = new THREE.EdgesGeometry(g, p.threshold).attributes.position;
        // two slightly wobbly pen passes
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < e.count; i++) lines.push(e.getX(i) + between(-0.012, 0.012), e.getY(i) + between(-0.012, 0.012), e.getZ(i) + between(-0.012, 0.012));
        }
      }
    }
    const mesh = new THREE.Mesh(
      mergeGeometries(geos),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    mesh.castShadow = true;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const outline = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.85 }));
    const group = new THREE.Group();
    group.add(mesh, outline);
    return group;
  }
}

const place = (x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s),
);
const at = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1),
);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, len, seg = 8, r2 = r) => new THREE.CylinderGeometry(r, r2, len, seg); // axis = Y
const alongX = (x = 0, y = 0, z = 0) => at(x, y, z, 0, 0, Math.PI / 2); // a cylinder lying along +X

/* ------------- the props: each draws itself around the local origin, lying on the floor ------------- */

/** Hexagonal pencil along +X, sharpened at +X. len ~3. */
function pencil(b, base, len = 3, body = C.yellow, cap = C.pink) {
  const r = 0.09, bodyLen = len * 0.76, tipLen = len * 0.15;
  const y = r;
  b.add(cyl(r, bodyLen, 6), body, base, alongX(-len / 2 + bodyLen / 2 + 0.2, y, 0));
  b.add(new THREE.ConeGeometry(r * 0.98, tipLen, 6), C.wood, base, at(len / 2 - 0.1 - tipLen / 2 + 0.0, y, 0, 0, 0, -Math.PI / 2));
  b.add(new THREE.ConeGeometry(r * 0.32, tipLen * 0.34, 6), C.graphite, base, at(len / 2 - 0.1 + tipLen * 0.17 - tipLen * 0.0, y, 0, 0, 0, -Math.PI / 2), { outline: false });
  b.add(cyl(r * 1.02, 0.12, 6), C.metal, base, alongX(-len / 2 + 0.2 - 0.04, y, 0));
  b.add(cyl(r * 0.95, 0.16, 8), cap, base, alongX(-len / 2 + 0.2 - 0.18, y, 0));
}

/** Marker/pen with a cap and a clip. */
function marker(b, base, len = 2.1, color = C.green) {
  const r = 0.11, y = r;
  b.add(cyl(r, len * 0.62, 8), color, base, alongX(0, y, 0));
  b.add(cyl(r * 1.12, len * 0.34, 8), C.black, base, alongX(len * 0.48, y, 0));
  b.add(box(len * 0.2, 0.025, 0.04), C.metal, base, at(len * 0.52, y + r * 1.12 + 0.01, 0), { outline: false });
  b.add(new THREE.ConeGeometry(r * 0.7, 0.22, 8), C.black, base, at(-len * 0.31 - 0.11, y, 0, 0, 0, Math.PI / 2));
}

/** Eraser block with a paper sleeve. */
function eraser(b, base, s = 1) {
  b.add(box(0.7 * s, 0.24 * s, 0.34 * s), C.eraser, base, at(0, 0.12 * s, 0));
  b.add(box(0.38 * s, 0.26 * s, 0.36 * s), C.blue, base, at(0.05 * s, 0.13 * s, 0));
}

/** Pencil sharpener with its hole. */
function sharpener(b, base) {
  b.add(box(0.5, 0.22, 0.3), C.blue, base, at(0, 0.11, 0));
  b.add(cyl(0.07, 0.03, 8), C.black, base, at(0.1, 0.23, 0), { outline: false });
  b.add(box(0.08, 0.02, 0.06), C.metal, base, at(-0.14, 0.23, 0.04), { outline: false });
}

/** A few curled wood shavings. */
function shavings(b, base, n = 5) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.TorusGeometry(between(0.06, 0.1), 0.014, 4, 7, between(3.2, 5));
    b.add(g, C.wood, base, at(between(-0.5, 0.5), 0.03, between(-0.4, 0.4), -Math.PI / 2 + between(-0.4, 0.4), between(0, 6.28), 0), { outline: false });
  }
}

/** Ruler lying flat with tick marks. */
function ruler(b, base, len = 5) {
  b.add(box(len, 0.04, 0.55), C.ruler, base, at(0, 0.02, 0));
  const ticks = Math.floor(len / 0.25);
  for (let i = 0; i <= ticks; i++) {
    const long = i % 4 === 0;
    b.add(box(0.014, 0.012, long ? 0.2 : 0.11), C.black, base, at(-len / 2 + 0.1 + i * 0.25, 0.046, 0.275 - (long ? 0.11 : 0.07)), { outline: false });
  }
}

/** Paper clip (double loop). */
function paperClip(b, base) {
  const pts = [[-0.15, -0.4], [-0.15, 0.35], [-0.05, 0.5], [0.1, 0.45], [0.15, 0.3], [0.15, -0.45], [0.05, -0.6], [-0.1, -0.55], [-0.25, -0.4], [-0.25, 0.25], [-0.2, 0.38]]
    .map(([x, y]) => new THREE.Vector3(x * 1.1, y * 1.1, 0));
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3), 36, 0.022, 4);
  b.add(tube, C.metal, base, at(0, 0.03, 0, -Math.PI / 2, 0, 0), { outline: false });
}

/** Crumpled paper ball: a jittered low-poly sphere whose creases show as pen lines. */
function paperBall(b, base, r = 0.34) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < p.count; i++) { // same displacement for shared corners, so there are no holes
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, between(0.78, 1.18));
    v.multiplyScalar(seen.get(key));
    p.setXYZ(i, v.x, v.y * 0.9, v.z);
  }
  g.computeVertexNormals();
  b.add(g, rnd() > 0.5 ? C.paper : C.paperShade, base, at(0, r * 0.82, 0, between(0, 6), between(0, 6), 0), { threshold: 14 });
}

/** Paper airplane that landed on the desk (nose toward +X). */
function paperPlane(b, base) {
  const N = [1, 0.06, 0], T = [-0.7, 0.2, 0], W1 = [-0.7, 0.04, 0.62], W2 = [-0.7, 0.04, -0.62], K = [-0.7, -0.05, 0];
  const tri = (a, c, d) => [...a, ...c, ...d];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...tri(N, W1, T), ...tri(N, T, W2), ...tri(N, T, K)], 3));
  g.computeVertexNormals();
  b.add(g, C.paper, base, at(0, 0.12, 0, 0.18, 0, 0));
}

/** Folded card standing like a little tent. */
function foldedCard(b, base) {
  b.add(box(0.75, 0.02, 0.5), C.paper, base, at(0, 0.2, 0.2, 0.72, 0, 0));
  b.add(box(0.75, 0.02, 0.5), C.paperShade, base, at(0, 0.2, -0.2, -0.72, 0, 0));
}

/** Torn scrap of paper with a few pencil scribbles. */
function scrap(b, base, size = 0.7, lines = 3) {
  const pts = [[-1, -0.7], [-0.2, -0.85], [0.9, -0.6], [1, 0.1], [0.55, 0.8], [-0.4, 0.6], [-0.95, 0.75]].map(([x, y]) => new THREE.Vector2(x * size * 0.5, y * size * 0.5));
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.012, bevelEnabled: false });
  b.add(g, C.paper, base, at(0, 0.012, 0, Math.PI / 2, 0, 0));
  for (let i = 0; i < lines; i++) {
    b.add(box(size * between(0.4, 0.7), 0.004, 0.012), C.graphite, base, at(between(-0.08, 0.08) * size, 0.03, (i - (lines - 1) / 2) * size * 0.17, 0, between(-0.06, 0.06), 0), { outline: false });
  }
}

/** Square sticky note with a doodled line. */
function stickyNote(b, base, color = '#fbe56b') {
  b.add(box(0.62, 0.014, 0.62), color, base, at(0, 0.008, 0, 0, 0, 0));
  b.add(box(0.38, 0.004, 0.014), C.red, base, at(0, 0.02, -0.12), { outline: false });
  b.add(box(0.3, 0.004, 0.014), C.red, base, at(-0.04, 0.02, 0.04), { outline: false });
}

/** Black binder clip. */
function binderClip(b, base) {
  b.add(new THREE.CylinderGeometry(0.17, 0.3, 0.3, 4), C.black, base, at(0, 0.15, 0, 0, Math.PI / 4, 0));
  for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.15, 0.014, 4, 8, Math.PI), C.metal, base, at(s * 0.2, 0.34, 0, 0, 0, s > 0 ? -0.5 : Math.PI + 0.5), { outline: false });
}

/** Drawing pin. */
function thumbtack(b, base) {
  b.add(cyl(0.12, 0.025, 8), C.red, base, at(0, 0.013, 0));
  b.add(cyl(0.05, 0.1, 8), C.red, base, at(0, 0.07, 0));
}

/** Roll of tape lying flat. */
function tapeRoll(b, base) {
  b.add(new THREE.TorusGeometry(0.26, 0.09, 5, 12), C.tape, base, at(0, 0.09, 0, Math.PI / 2, 0, 0));
}

/** Glue stick. */
function glueStick(b, base) {
  b.add(cyl(0.13, 0.9, 8), C.purple, base, alongX(0, 0.13, 0));
  b.add(cyl(0.14, 0.45, 8), C.paper, base, alongX(0.62, 0.13, 0));
}

/** Short crayon. */
function crayon(b, base, color = C.orange) {
  b.add(cyl(0.07, 0.6, 6), color, base, alongX(0, 0.07, 0));
  b.add(new THREE.ConeGeometry(0.07, 0.16, 6), color, base, at(0.38, 0.07, 0, 0, 0, -Math.PI / 2));
}

/** Pencil mug with pencils sticking out (far corner). */
function pencilMug(b, base) {
  b.add(cyl(0.55, 0.95, 10), C.mug, base, at(0, 0.475, 0));
  const cols = [C.yellow, C.red, C.blue, C.green, C.orange];
  cols.forEach((c, i) => {
    const a = (i / cols.length) * Math.PI * 2;
    const tilt = 0.22 + (i % 2) * 0.1;
    b.add(cyl(0.07, 1.5, 6), c, base, at(Math.cos(a) * 0.2, 1.4, Math.sin(a) * 0.2, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt));
    b.add(new THREE.ConeGeometry(0.07, 0.22, 6), C.wood, base, at(Math.cos(a) * (0.2 + 0.4 * tilt), 2.25, Math.sin(a) * (0.2 + 0.4 * tilt), Math.sin(a) * tilt, 0, -Math.cos(a) * tilt));
  });
}

/** Stack of notebooks. */
function notebooks(b, base) {
  const covers = [C.red, C.blue, C.green];
  let y = 0;
  covers.forEach((c, i) => {
    const h = 0.24 + (i % 2) * 0.06;
    b.add(box(2.2, h, 1.6), c, base, at(0.05 * i, y + h / 2, 0.03 * i, 0, 0.1 * (i - 1), 0));
    b.add(box(2.12, h * 0.55, 1.52), C.paper, base, at(0.05 * i + 0.05, y + h / 2, 0.03 * i, 0, 0.1 * (i - 1), 0), { outline: false });
    y += h;
  });
}

/* ------------- layout: x/z on the floor, away from the platform (x +-8.25, z +-2.5) ------------- */

const LAYOUT = [
  // [builder, x, z, rotationY, scale, extra args]
  // ---- behind the arena (the band between the platform and the sketched buildings) ----
  [pencil, -10.6, -5.2, 0.28, 1, [3.4, C.yellow, C.pink]],
  [pencil, -8.9, -4.4, -0.12, 0.85, [3, C.blue, C.pink]],
  [marker, 10.2, -4.6, 0.5, 1, [2.1, C.green]],
  [marker, 8.1, -9.2, -0.35, 1, [2.1, C.red]],
  [ruler, 5.4, -7.6, 0.1, 1, [5.2]],
  [eraser, -3.8, -6.6, 0.4, 1],
  [eraser, 13, -6.2, -0.5, 0.9],
  [paperBall, -12.4, -3.8, 0, 1, [0.38]],
  [paperBall, 3.6, -9.2, 0, 1, [0.26]],
  [paperBall, 9.4, -3.6, 0, 1, [0.32]],
  [paperClip, -1.8, -9.0, 0.6, 1],
  [paperClip, 11.2, -8.4, -0.4, 1],
  [sharpener, -6.2, -8.0, 0.3, 1],
  [shavings, -5.2, -7.6, 0, 1, [6]],
  [scrap, 1.4, -5.8, 0.5, 1, [0.7, 3]],
  [scrap, -10.6, -8.2, -0.3, 1.2, [0.7, 4]],
  [scrap, 7.6, -5.2, 1.1, 0.9, [0.7, 2]],
  [stickyNote, -13.6, -5.4, 0.35, 1.1],
  [stickyNote, 14.4, -4.2, -0.2, 1, ['#f6a9b8']],
  [paperPlane, 0.6, -10.4, 0.7, 1],
  [foldedCard, -4.6, -10.2, 0.25, 1],
  [binderClip, 12.6, -3.6, 0.6, 1],
  [tapeRoll, -14.4, -7.4, 0, 1],
  [glueStick, 15.4, -7, -0.3, 1],
  [crayon, -8.4, -3.6, 0.8, 1],
  [crayon, 4.3, -4.0, -0.6, 0.9, [C.blue]],
  [thumbtack, 2.4, -4.4, 0, 1],
  [pencilMug, -16, -9, 0, 1],
  [notebooks, 17, -11, 0.2, 1],
  [notebooks, -19, -12, -0.15, 1.1],
  // ---- in front, low and only at the screen edges ----
  [eraser, -6.4, 4.2, 0.3, 0.9],
  [paperBall, 5.6, 4.6, 0, 1, [0.28]],
  [paperClip, 9.2, 3.9, 0.9, 1],
  [sharpener, -10, 4.0, -0.2, 1],
  [shavings, -9.2, 4.3, 0, 1, [5]],
  [scrap, 11.4, 4.6, 0.5, 1, [0.7, 3]],
];

/* ------------- doodles drawn on the page around the props ------------- */

const FLOOR_DOODLES = [
  // [kind, x, z, size, color, rotation]
  ['star', -6.8, -6.0, 0.9, PALETTE.blue, 0.2],
  ['arrow', 8.8, -6.4, 1.5, PALETTE.red, Math.PI - 0.3],
  ['scribble', 2.2, -7.6, 1.5, PALETTE.pencil, 0],
  ['spiral', -11.2, -5.8, 1.0, PALETTE.pencil, 0],
  ['heart', 12.2, -9.2, 0.8, PALETTE.red, 0.3],
  ['x', 0.6, -6.6, 0.55, PALETTE.red, 0],
  ['star', 15.2, -4.6, 0.7, PALETTE.blue, -0.3],
  ['arrow', -3.4, 4.5, 1.2, PALETTE.blue, 0.1],
];

/** Build a merged group from [builder, x, z, rotationY, scale, args] entries (used for the podium decor too). */
export function buildProps(entries, startSeed = 7) {
  const b = new Builder();
  seed = startSeed;
  for (const [fn, x, z, ry = 0, sc = 1, args = []] of entries) fn(b, place(x, GROUND, z, ry, sc), ...args);
  return b.build();
}
export const PROP_BUILDERS = { pencil, marker, eraser, paperBall, paperClip, crayon, scrap, stickyNote, sharpener, shavings };

/** Add the desk props and floor doodles to the scene; doodles join the `boil` so they wobble like the rest. */
export function addDeskProps(scene, boil) {
  const b = new Builder();
  seed = 7;
  for (const [fn, x, z, ry, s, args = []] of LAYOUT) fn(b, place(x, GROUND, z, ry, s), ...args);
  const props = b.build();
  scene.add(props);

  for (const [kind, x, z, size, color, rot] of FLOOR_DOODLES) {
    const d = boil.add(doodlePlane(kind, { color, width: 6, opacity: 0.5 }, size));
    d.rotation.set(-Math.PI / 2, 0, rot);
    d.position.set(x, GROUND + 0.012, z);
    scene.add(d);
  }
  // a coffee-cup ring stain on the page
  const ring = doodlePlane('ring', { color: '#a9835a', width: 5 }, 1.5);
  ring.material.opacity = 0.3;
  ring.rotation.set(-Math.PI / 2, 0, 0);
  ring.position.set(-2.2, GROUND + 0.011, -7.4);
  scene.add(ring);
  return props;
}
