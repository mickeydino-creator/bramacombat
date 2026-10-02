import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { stickmanPose, NEUTRAL_POSE } from './stickman/poses.js';
import { createFace } from './stickman/face.js';
import { createAccessory } from './stickman/accessories.js';

/*
 * Stickman fighter model: a rigged (Mixamo-style) .glb animated procedurally.
 *
 * The model file only needs a standard humanoid rig (Hips, Spine, Spine1, Spine2, Neck, Head,
 * Left/Right Arm, ForeArm, Hand, UpLeg, Leg, Foot). Bone names may carry a "mixamorig" prefix
 * and/or a "_NN" suffix. No animation clips are needed: poses are generated in
 * src/models/stickman/poses.js from the fighter's state, so a T-pose model works as-is.
 *
 * Options (set per character in src/config/characters.js -> appearance):
 *   url          path to the .glb (default /models/stickman.glb)
 *   height       standing height in world units (hurtbox is ~1.85)
 *   colors       { body, emissive }
 *   face         see stickman/face.js ({ texture: '/faces/x.png' } or a generated face)
 *   accessories  list, see stickman/accessories.js
 *
 * Implements the model interface described in PlaceholderModel.js.
 */

const cache = new Map(); // url -> Promise<gltf>
const loader = new GLTFLoader();

/** Load (once) and cache a model file. Call before creating fighters to avoid pop-in. */
export function preloadStickman(url = '/models/stickman.glb') {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

const BONE_NAMES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

// Bones driven by an euler rotation (pose key), in character space.
const EULER_BONES = { Hips: 'hips', Spine1: 'spine', Head: 'head' };
// Limb bones driven by a target direction (pose key), measured in the frame of `ref`.
const LIMB_BONES = {
  LeftArm: { key: 'lArm', tip: 'LeftForeArm', ref: 'Spine2' },
  LeftForeArm: { key: 'lFore', tip: 'LeftHand', ref: 'Spine2' },
  RightArm: { key: 'rArm', tip: 'RightForeArm', ref: 'Spine2' },
  RightForeArm: { key: 'rFore', tip: 'RightHand', ref: 'Spine2' },
  LeftUpLeg: { key: 'lThigh', tip: 'LeftLeg', ref: 'Hips' },
  LeftLeg: { key: 'lShin', tip: 'LeftFoot', ref: 'Hips' },
  RightUpLeg: { key: 'rThigh', tip: 'RightLeg', ref: 'Hips' },
  RightLeg: { key: 'rShin', tip: 'RightFoot', ref: 'Hips' },
};
// Parents before children.
const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'];

const boneKey = (name) => {
  const m = name.replace(/^mixamorig[:_]?/i, '').match(/^([A-Za-z0-9]+?)(?:_\d+)?$/);
  return m ? m[1] : name;
};

const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const IDENTITY = new THREE.Quaternion();

export class StickmanModel {
  constructor(options = {}) {
    this.options = { url: '/models/stickman.glb', height: 1.9, colors: {}, accessories: [], ...options };
    this.root = new THREE.Group(); // positioned/rotated by Fighter
    this.body = new THREE.Group(); // pivot at the feet (KO fall, grounding offset)
    this.root.add(this.body);
    this.ready = false;
    this.flashTimer = 0;
    this.pose = structuredClone(NEUTRAL_POSE);
    preloadStickman(this.options.url).then((gltf) => this.build(gltf));
  }

  build(gltf) {
    const scene = SkeletonUtils.clone(gltf.scene);
    scene.updateMatrixWorld(true);

    // ---- material / colors ----
    const c = this.options.colors;
    this.material = new THREE.MeshStandardMaterial({
      color: c.body ?? 0x222222, roughness: c.roughness ?? 0.55, metalness: 0,
      emissive: c.emissive ?? 0x000000,
    });
    this.baseEmissive = new THREE.Color(c.emissive ?? 0x000000);
    let skinned = null;
    scene.traverse((o) => {
      if (o.isMesh) {
        o.material = this.material;
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds don't follow poses
        if (o.isSkinnedMesh) skinned = o;
      }
    });

    // ---- bones + rest data (character space = model file space, facing +Z) ----
    this.bones = {};
    scene.traverse((o) => { if (o.isBone) { const k = boneKey(o.name); if (BONE_NAMES.includes(k) && !this.bones[k]) this.bones[k] = o; } });
    this.rest = {};
    for (const [name, b] of Object.entries(this.bones)) {
      const parentWorld = b.parent.getWorldQuaternion(new THREE.Quaternion());
      this.rest[name] = {
        local: b.quaternion.clone(),
        parentWorld,
        parentWorldInv: parentWorld.clone().invert(),
        pos: b.getWorldPosition(new THREE.Vector3()),
        scale: b.getWorldScale(new THREE.Vector3()).x, // rigs often carry a unit scale (e.g. 0.01 from FBX)
      };
    }
    for (const [name, limb] of Object.entries(LIMB_BONES)) {
      if (!this.bones[name] || !this.bones[limb.tip]) continue;
      this.rest[name].dir = this.rest[limb.tip].pos.clone().sub(this.rest[name].pos).normalize();
    }

    // ---- size: scale so the model is `height` tall when standing ----
    // Rest-pose vertex positions as rendered (vertex data can be in a different space than the bones).
    this.skinned = skinned;
    skinned.skeleton.update(); // bone matrices are otherwise only computed at first render
    const count = skinned.geometry.attributes.position.count;
    this.restVerts = new Float32Array(count * 3);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      skinned.getVertexPosition(i, _v).applyMatrix4(skinned.matrixWorld);
      _v.toArray(this.restVerts, i * 3);
      minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y);
    }
    // The T-pose is roughly standing height; arms down doesn't change it.
    this.scale = this.options.height / (maxY - minY);
    // Distance from the lowest foot bone down to the sole, for ground contact.
    const footBones = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].filter((n) => this.bones[n]);
    this.footBones = footBones;
    this.footPad = Math.min(...footBones.map((n) => this.rest[n].pos.y)) - minY;

    this.head = this.measureHead();

    // ---- ink outline (inverted hull): makes the 3D stickman look drawn with a pen ----
    const ol = this.options.outline ?? { color: 0x1f1f27, width: 0.022 };
    if (ol) {
      // geometry units -> world units, so the outline width is given in world units
      const meshScale = new THREE.Vector3(); skinned.getWorldScale(meshScale);
      const thickness = ol.width / (meshScale.x * this.scale);
      const mat = new THREE.MeshBasicMaterial({ color: ol.color, side: THREE.BackSide });
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>\n  transformed += normalize(normal) * ${thickness.toFixed(5)};`);
      };
      const outline = new THREE.SkinnedMesh(skinned.geometry, mat);
      outline.bind(skinned.skeleton, skinned.bindMatrix);
      outline.position.copy(skinned.position); outline.quaternion.copy(skinned.quaternion); outline.scale.copy(skinned.scale);
      outline.frustumCulled = false;
      skinned.parent.add(outline);
    }

    // ---- assemble ----
    this.inner = new THREE.Group(); // grounding offset (char units)
    this.inner.add(scene);
    this.scaler = new THREE.Group();
    this.scaler.scale.setScalar(this.scale);
    this.scaler.add(this.inner);
    this.body.add(this.scaler);
    this.scene = scene;

    this.attachFace();
    for (const acc of this.options.accessories) {
      const res = createAccessory(acc, this);
      for (const part of res?.multi || (res ? [res] : [])) this.attachToBone(part.bone, part.object, part.offset);
    }
    this.ready = true;
  }

  /** Bounding box (character space, rest pose) of the vertices mostly driven by a bone. */
  measureBone(name, minWeight = 0.5) {
    const box = new THREE.Box3();
    const skinned = this.skinned;
    const idx = skinned.skeleton.bones.indexOf(this.bones[name]);
    if (idx < 0) return box;
    const si = skinned.geometry.attributes.skinIndex;
    const sw = skinned.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) {
      for (let k = 0; k < 4; k++) {
        if (si.getComponent(i, k) === idx && sw.getComponent(i, k) > minWeight) {
          box.expandByPoint(_v.fromArray(this.restVerts, i * 3));
          break;
        }
      }
    }
    return box;
  }

  /**
   * Find the head: vertices above the neck that belong to the spine/neck/head chain.
   * Returns { center, radius, size, bone } where `bone` is the bone that actually moves the head
   * (some rigs skin the head to the chest). Works for any head size.
   */
  measureHead() {
    const neckY = (this.rest.Neck || this.rest.Head || this.rest.Spine2).pos.y;
    const chain = new Set(['Spine2', 'Neck', 'Head', 'HeadTop', 'HeadTopEnd', 'HeadTop_End']);
    const sk = this.skinned;
    const si = sk.geometry.attributes.skinIndex;
    const sw = sk.geometry.attributes.skinWeight;
    const box = new THREE.Box3();
    const votes = {};
    for (let i = 0; i < si.count; i++) {
      const y = this.restVerts[i * 3 + 1];
      if (y < neckY) continue;
      let best = 0, bi = 0;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > best) { best = sw.getComponent(i, k); bi = si.getComponent(i, k); }
      const name = boneKey(sk.skeleton.bones[bi].name);
      if (!chain.has(name)) continue;
      votes[name] = (votes[name] || 0) + 1;
      box.expandByPoint(_v.fromArray(this.restVerts, i * 3));
    }
    const bone = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Head';
    if (box.isEmpty()) {
      const r = 0.15 / this.scale;
      return { center: this.rest.Head.pos.clone().add(new THREE.Vector3(0, r, 0)), radius: r, size: new THREE.Vector3(2 * r, 2 * r, 2 * r), bone };
    }
    const size = box.getSize(new THREE.Vector3());
    const radius = (size.x + size.z) / 4;
    const center = box.getCenter(new THREE.Vector3());
    center.y = box.max.y - radius; // sphere touching the top of the head
    return { center, radius, size: new THREE.Vector3(size.x, Math.min(size.y, radius * 2), size.z), bone };
  }

  /**
   * Attach an object to a bone so it follows the animation. `offset` is a position in
   * character space at rest (relative to the bone); the object keeps character-space orientation at rest.
   */
  attachToBone(boneName, object, offset = new THREE.Vector3()) {
    const bone = this.bones[boneName];
    if (!bone) return;
    const r = this.rest[boneName];
    const inv = r.parentWorld.clone().multiply(r.local).invert(); // bone rest orientation, char space
    object.position.copy(offset).applyQuaternion(inv).divideScalar(r.scale);
    object.quaternion.premultiply(inv); // keep the object's own rotation, in character space
    object.scale.multiplyScalar(1 / r.scale);
    bone.add(object);
  }

  attachFace() {
    const face = createFace(this.options.face, this.head);
    if (!face) return;
    const offset = this.head.center.clone().sub(this.rest[this.head.bone].pos);
    this.attachToBone(this.head.bone, face, offset);
  }

  reset() {
    this.pose = structuredClone(NEUTRAL_POSE);
    this.flashTimer = 0;
    if (this.material) this.material.emissive.copy(this.baseEmissive);
  }

  /** Brief glow: red when hit (default), other colors for e.g. special activation. */
  flash(color = 0xff2222, time = 0.12) {
    this.flashTimer = time;
    if (this.material) this.material.emissive.setHex(color);
  }

  update(f, dt) {
    if (!this.ready) return;
    const target = stickmanPose(f);
    const rate = f.state === 'attack' ? 40 : f.state === 'ko' ? 7 : 16;
    const a = 1 - Math.exp(-rate * dt);
    for (const key in target) {
      const t = target[key];
      const cur = this.pose[key];
      if (Array.isArray(t)) for (let i = 0; i < 3; i++) cur[i] += (t[i] - cur[i]) * a;
      else if (typeof t === 'object') for (const ax of ['x', 'y', 'z']) cur[ax] += ((t[ax] || 0) - cur[ax]) * a;
      else this.pose[key] += (t - this.pose[key]) * a;
    }
    this.applyPose(this.pose);

    if (this.flashTimer > 0 && (this.flashTimer -= dt) <= 0) this.material.emissive.copy(this.baseEmissive);
  }

  applyPose(p) {
    const acc = {}; // bone name -> accumulated character-space rotation
    const accOf = (bone) => {
      for (let b = bone.parent; b; b = b.parent) {
        const k = boneKey(b.name);
        if (acc[k] && this.bones[k] === b) return acc[k];
      }
      return IDENTITY;
    };
    for (const name of ORDER) {
      const bone = this.bones[name];
      if (!bone) continue;
      const rest = this.rest[name];
      const parentAcc = accOf(bone);
      const D = new THREE.Quaternion();
      if (EULER_BONES[name]) {
        const e = p[EULER_BONES[name]];
        D.setFromEuler(_e.set(e.x, e.y, e.z));
      } else if (LIMB_BONES[name] && rest.dir) {
        const limb = LIMB_BONES[name];
        const dir = p[limb.key];
        _v.set(dir[0], dir[1], dir[2]).normalize().applyQuaternion(acc[limb.ref] || IDENTITY); // target, char space
        _v.applyQuaternion(_q2.copy(parentAcc).invert()); // into the parent's rest-relative frame
        D.setFromUnitVectors(rest.dir, _v);
      }
      acc[name] = parentAcc.clone().multiply(D);
      // local = parentRestWorld^-1 * D * parentRestWorld * restLocal
      bone.quaternion.copy(rest.parentWorldInv).multiply(D).multiply(rest.parentWorld).multiply(rest.local);
    }

    // Whole-body fall (KO) and bounce.
    this.body.rotation.x = p.fall;
    this.body.position.y = p.lift;

    // Keep the feet on the ground (crouches, lunges...) unless lying down.
    this.root.updateMatrixWorld(true);
    if (p.fall > -0.3) {
      let lowest = Infinity;
      for (const n of this.footBones) {
        this.bones[n].getWorldPosition(_v2);
        this.inner.worldToLocal(_v2);
        lowest = Math.min(lowest, _v2.y);
      }
      const groundY = lowest - this.footPad; // sole height in char units, relative to inner
      this.inner.position.y = -groundY + p.bounce / this.scale;
    } else {
      this.inner.position.y = 0;
    }
  }
}
