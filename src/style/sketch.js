import * as THREE from 'three';

/*
 * Notebook / sketchbook look: shared palette and procedural drawing helpers.
 * Everything is drawn on canvases at runtime (no image files).
 *   paperTexture()    notebook page: off-white grain, blue rules, red margin, stains
 *   doodleFrames()    hand-drawn doodles; several jittered frames for a "boiling line" effect
 *   inkEdges()        rough pen outline for any mesh (two slightly offset passes)
 */
export const PALETTE = {
  paper: '#f6f1e2',
  paperDark: '#e9e1cb',
  rule: 'rgba(98, 150, 214, 0.55)',
  margin: 'rgba(214, 74, 66, 0.75)',
  ink: '#25252e',
  pencil: '#5c5c66',
  blue: '#2a55b8',
  red: '#cf3a2c',
  yellow: '#ffd93b',
};

const rand = (a, b) => a + Math.random() * (b - a);

/** A rough pen stroke from (x1,y1) to (x2,y2). */
export function penLine(g, x1, y1, x2, y2, jitter = 1.5, passes = 2) {
  for (let p = 0; p < passes; p++) {
    g.beginPath();
    g.moveTo(x1 + rand(-jitter, jitter), y1 + rand(-jitter, jitter));
    const mx = (x1 + x2) / 2 + rand(-jitter, jitter) * 2, my = (y1 + y2) / 2 + rand(-jitter, jitter) * 2;
    g.quadraticCurveTo(mx, my, x2 + rand(-jitter, jitter), y2 + rand(-jitter, jitter));
    g.stroke();
  }
}

/** Notebook page canvas. */
export function paperCanvas(w = 1024, h = 1024, { rules = 34, margin = 0.12, holes = false, stains = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.paper;
  g.fillRect(0, 0, w, h);
  // grain
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  // fibers and soft blotches
  g.globalAlpha = 0.05;
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = Math.random() < 0.5 ? '#8a7a55' : '#ffffff';
    g.lineWidth = rand(0.5, 1.5);
    const x = rand(0, w), y = rand(0, h);
    penLine(g, x, y, x + rand(-30, 30), y + rand(-8, 8), 2, 1);
  }
  if (stains) {
    for (let i = 0; i < 4; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(40, 140);
      const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      grad.addColorStop(0, 'rgba(160, 130, 70, 0.35)');
      grad.addColorStop(1, 'rgba(160, 130, 70, 0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  g.globalAlpha = 1;
  // blue rules
  if (rules) {
    g.strokeStyle = PALETTE.rule;
    g.lineWidth = Math.max(1, h / 700);
    for (let y = rules * 2; y < h; y += rules) {
      g.beginPath(); g.moveTo(0, y + rand(-0.4, 0.4)); g.lineTo(w, y + rand(-0.4, 0.4)); g.stroke();
    }
  }
  // red margin
  if (margin) {
    g.strokeStyle = PALETTE.margin;
    g.lineWidth = Math.max(1.5, w / 450);
    const x = w * margin;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
  }
  if (holes) {
    for (let y = h * 0.08; y < h; y += h / 9) {
      g.fillStyle = '#d8d0bb'; g.beginPath(); g.arc(w * 0.045, y, w * 0.014, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
}

export function canvasTexture(canvas, repeat = null) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** Graph-paper / hatched surface textures for 3D props. */
export function surfaceCanvas(kind = 'grid', size = 512) {
  const c = paperCanvas(size, size, { rules: 0, margin: 0, stains: false });
  const g = c.getContext('2d');
  g.lineCap = 'round';
  if (kind === 'grid') {
    g.strokeStyle = 'rgba(98, 150, 214, 0.45)'; g.lineWidth = 1.5;
    for (let i = 0; i <= size; i += size / 8) { penLine(g, i, 0, i, size, 0.6, 1); penLine(g, 0, i, size, i, 0.6, 1); }
  } else if (kind === 'hatch') {
    g.strokeStyle = 'rgba(40, 40, 50, 0.2)'; g.lineWidth = 1.4;
    for (let i = -size; i < size * 2; i += 18) penLine(g, i, 0, i + size * 0.5, size, 1.5, 1);
  } else if (kind === 'crosshatch') {
    g.strokeStyle = 'rgba(40, 40, 50, 0.22)'; g.lineWidth = 1.3;
    for (let i = -size; i < size * 2; i += 16) { penLine(g, i, 0, i + size * 0.5, size, 1.5, 1); penLine(g, i, size, i + size * 0.5, 0, 1.5, 1); }
  }
  return c;
}

/** Rough ink outline around a mesh's hard edges (added as a child). */
export function inkEdges(mesh, { color = PALETTE.ink, threshold = 30, jitter = 0.012 } = {}) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, threshold);
  const mat = new THREE.LineBasicMaterial({ color });
  for (let i = 0; i < 2; i++) {
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(rand(-jitter, jitter), rand(-jitter, jitter), rand(-jitter, jitter));
    lines.scale.setScalar(1 + rand(-0.004, 0.006));
    mesh.add(lines);
  }
  return mesh;
}

// ---------------- doodles ----------------

const DOODLES = {
  star(g, s) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.18 : s * 0.42, a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([s / 2 + Math.cos(a) * r + rand(-2, 2), s / 2 + Math.sin(a) * r + rand(-2, 2)]);
    }
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
  },
  arrow(g, s) {
    penLine(g, s * 0.12, s * 0.6, s * 0.82, s * 0.42, 3);
    penLine(g, s * 0.82, s * 0.42, s * 0.62, s * 0.28, 3);
    penLine(g, s * 0.82, s * 0.42, s * 0.68, s * 0.62, 3);
  },
  spiral(g, s) {
    g.beginPath();
    for (let a = 0; a < Math.PI * 7; a += 0.2) {
      const r = a * s * 0.019, x = s / 2 + Math.cos(a) * r + rand(-1, 1), y = s / 2 + Math.sin(a) * r + rand(-1, 1);
      a ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  },
  scribble(g, s) {
    g.beginPath(); g.moveTo(s * 0.15, s * 0.5);
    for (let i = 0; i < 14; i++) g.lineTo(s * (0.15 + i * 0.05) + rand(-4, 4), s * (0.35 + (i % 2) * 0.3) + rand(-6, 6));
    g.stroke();
  },
  sun(g, s) {
    g.beginPath(); g.arc(s / 2 + rand(-2, 2), s / 2 + rand(-2, 2), s * 0.18, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      penLine(g, s / 2 + Math.cos(a) * s * 0.26, s / 2 + Math.sin(a) * s * 0.26, s / 2 + Math.cos(a) * s * 0.42, s / 2 + Math.sin(a) * s * 0.42, 2, 1);
    }
  },
  cloud(g, s) {
    g.beginPath();
    for (const [x, y, r] of [[0.3, 0.55, 0.15], [0.45, 0.42, 0.18], [0.62, 0.48, 0.16], [0.75, 0.58, 0.12]]) {
      g.moveTo(s * (x + r), s * y); g.arc(s * x + rand(-1.5, 1.5), s * y + rand(-1.5, 1.5), s * r, 0, Math.PI * 2);
    }
    g.stroke();
  },
  birds(g, s) {
    for (const [x, y] of [[0.3, 0.4], [0.55, 0.3], [0.7, 0.5]]) {
      g.beginPath(); g.moveTo(s * x - 18, s * y); g.quadraticCurveTo(s * x - 9, s * y - 12 + rand(-2, 2), s * x, s * y);
      g.quadraticCurveTo(s * x + 9, s * y - 12 + rand(-2, 2), s * x + 18, s * y); g.stroke();
    }
  },
  zigzag(g, s) {
    g.beginPath(); g.moveTo(s * 0.1, s * 0.5);
    for (let i = 1; i <= 8; i++) g.lineTo(s * (0.1 + i * 0.1) + rand(-2, 2), s * (i % 2 ? 0.35 : 0.65) + rand(-3, 3));
    g.stroke();
  },
  x(g, s) { penLine(g, s * 0.25, s * 0.25, s * 0.75, s * 0.75, 3); penLine(g, s * 0.75, s * 0.25, s * 0.25, s * 0.75, 3); },
  heart(g, s) {
    g.beginPath(); g.moveTo(s * 0.5, s * 0.78);
    g.bezierCurveTo(s * 0.1 + rand(-3, 3), s * 0.5, s * 0.25, s * 0.18, s * 0.5, s * 0.36);
    g.bezierCurveTo(s * 0.75, s * 0.18, s * 0.9 + rand(-3, 3), s * 0.5, s * 0.5, s * 0.78); g.stroke();
  },
};

/** Text doodle like "POW!" with a spiky burst behind it. */
function drawBurst(g, s, word, fill) {
  const pts = 14;
  g.beginPath();
  for (let i = 0; i <= pts * 2; i++) {
    const r = (i % 2 ? 0.28 : 0.48) * s * rand(0.9, 1.08), a = (i / (pts * 2)) * Math.PI * 2;
    const x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r * 0.8;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.fillStyle = fill; g.fill(); g.stroke();
  if (word) {
    g.font = `${s * 0.2}px "Permanent Marker", "Comic Sans MS", cursive`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = PALETTE.ink;
    g.save(); g.translate(s / 2, s / 2); g.rotate(rand(-0.15, 0.15));
    g.fillText(word, 0, 0);
    g.restore();
  }
}

const cache = new Map();
/**
 * Doodle textures: `frames` slightly different hand-drawn versions (swap them for line boil).
 * kind: star | arrow | spiral | scribble | sun | cloud | birds | zigzag | x | heart | burst
 */
export function doodleFrames(kind, { color = PALETTE.ink, size = 256, frames = 3, width = 5, word = '', fill = PALETTE.yellow } = {}) {
  const key = [kind, color, size, frames, width, word, fill].join('|');
  if (cache.has(key)) return cache.get(key);
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = width * (size / 256); g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'burst') drawBurst(g, size, word, fill);
    else DOODLES[kind](g, size);
    out.push(canvasTexture(c));
  }
  cache.set(key, out);
  return out;
}

/** A camera-facing doodle that "boils" (swaps hand-drawn frames). */
export function doodleSprite(kind, opts = {}, scale = 1) {
  const frames = doodleFrames(kind, opts);
  const mat = new THREE.SpriteMaterial({ map: frames[0], transparent: true, depthWrite: false, opacity: opts.opacity ?? 0.85 });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  sprite.userData.frames = frames;
  return sprite;
}

/** Flat doodle lying on a surface (decal-like plane). */
export function doodlePlane(kind, opts = {}, scale = 1) {
  const frames = doodleFrames(kind, opts);
  const mat = new THREE.MeshBasicMaterial({ map: frames[0], transparent: true, depthWrite: false, opacity: opts.opacity ?? 0.7 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale), mat);
  m.userData.frames = frames;
  return m;
}

/** Advance the boiling-line animation for a list of doodle objects. */
export class Boil {
  constructor(objs = [], fps = 7) { this.objs = objs; this.t = 0; this.interval = 1 / fps; this.frame = 0; }
  add(o) { this.objs.push(o); return o; }
  update(dt) {
    this.t += dt;
    if (this.t < this.interval) return;
    this.t = 0; this.frame++;
    for (const o of this.objs) {
      const fr = o.userData.frames;
      if (fr) o.material.map = fr[(this.frame + (o.id % fr.length)) % fr.length];
    }
  }
}
