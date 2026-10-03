import * as THREE from 'three';
import { PALETTE } from '../style/sketch.js';

/*
 * Small hand-drawn name tags (the players' own names) above the OTHER fighters in a multiplayer match (your own fighter has the red
 * YOU arrow). A "..." is added while that player is reconnecting. One sprite per fighter, textures drawn once.
 */
function tagTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 80;
  const g = c.getContext('2d');
  let size = 54; // long names shrink to fit the tag
  g.font = `${size}px "Permanent Marker", "Comic Sans MS", cursive`;
  const w = g.measureText(text).width;
  if (w > 290) { size = Math.floor(size * 290 / w); g.font = `${size}px "Permanent Marker", "Comic Sans MS", cursive`; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.strokeStyle = PALETTE.ink; g.lineWidth = 12; g.strokeText(text, 160, 44);
  g.fillStyle = color; g.fillText(text, 160, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class NameTags {
  constructor(scene, count = 4) {
    this.sprites = Array.from({ length: count }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      s.scale.set(1.9, 0.475, 1);
      s.renderOrder = 9;
      s.visible = false;
      scene.add(s);
      return s;
    });
    this.cache = new Map();
    this.enabled = false;
    this.items = [];
  }

  /** items: [{ fighter, label, color, show }] for every fighter in the match; set enabled=false to hide all. */
  configure(items) {
    this.items = items;
    this.enabled = items.length > 0;
    items.forEach((it, i) => { it.key = `${it.label}|${it.color}`; this.sprites[i].visible = false; });
  }

  texture(label, color) {
    const key = `${label}|${color}`;
    if (!this.cache.has(key)) this.cache.set(key, tagTexture(label, color));
    return this.cache.get(key);
  }

  /** `visible`: false during menus / podium. */
  update(visible = true) {
    this.items.forEach((it, i) => {
      const s = this.sprites[i];
      const f = it.fighter;
      const show = this.enabled && visible && it.show && f.alive && f.model.root.visible;
      s.visible = show;
      if (!show) return;
      const label = f.disconnected ? `${it.label} ...` : it.label;
      s.material.map = this.texture(label, it.color);
      s.position.set(f.x, f.y + 2.35, 0.2);
    });
  }
}
