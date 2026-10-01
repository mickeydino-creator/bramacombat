import * as THREE from 'three';

/*
 * Face decal for the stickman head: a curved patch slightly in front of the head surface.
 *
 * appearance.face options:
 *   { texture: '/faces/ember.png' }  your own image (PNG with transparency works best),
 *                                    mapped onto the front of the head
 *   { eyes: 0x111111, brows: true, mouth: 'grin' | 'flat' | 'frown' | 'none', color } generated face
 *   false                            no face
 *   width / height                   angular size of the patch in radians (default 1.9 / 1.5)
 */
export function createFace(opts = {}, head) {
  if (opts === false) return null;
  const width = opts.width ?? 1.9;
  const height = opts.height ?? 1.5;
  const r = head.radius * 1.03;
  const geo = new THREE.SphereGeometry(r, 24, 16, Math.PI / 2 - width / 2, width, Math.PI / 2 - height / 2, height);

  let map;
  if (opts.texture) {
    map = new THREE.TextureLoader().load(opts.texture);
  } else {
    map = new THREE.CanvasTexture(drawFace(opts));
  }
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  // Non-spherical heads: stretch the patch to the head's proportions.
  mesh.scale.set(head.size.x / (2 * head.radius), head.size.y / (2 * head.radius), head.size.z / (2 * head.radius));
  mesh.renderOrder = 2;
  return mesh;
}

function drawFace({ eyes = 0x111111, brows = true, mouth = 'flat', color } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const ink = `#${new THREE.Color(color ?? eyes).getHexString()}`;
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineCap = 'round';
  // eyes
  for (const x of [88, 168]) {
    g.beginPath();
    g.ellipse(x, 118, 20, 27, 0, 0, Math.PI * 2);
    g.fill();
  }
  // brows (angled = determined fighter look)
  if (brows) {
    g.lineWidth = 15;
    g.beginPath(); g.moveTo(62, 82); g.lineTo(110, 96); g.stroke();
    g.beginPath(); g.moveTo(194, 82); g.lineTo(146, 96); g.stroke();
  }
  // mouth
  g.lineWidth = 12;
  g.beginPath();
  if (mouth === 'grin') g.arc(128, 160, 34, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mouth === 'frown') g.arc(128, 205, 30, 1.2 * Math.PI, 1.8 * Math.PI);
  else if (mouth === 'flat') { g.moveTo(104, 180); g.lineTo(152, 180); }
  g.stroke();
  return c;
}
