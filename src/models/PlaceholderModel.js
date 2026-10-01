import * as THREE from 'three';

/*
 * MODEL INTERFACE (what Fighter expects from any model):
 *   model.root            THREE.Object3D added to the scene. Fighter sets its position/rotation.
 *                         The model should face +Z and stand on y = 0.
 *   model.update(f, dt)   Called every render frame. Read f.animState ('idle', 'walk', 'jump',
 *                         'punch', 'kick', 'strong', 'hit', 'block', 'ko', 'victory'), f.attackPhase
 *                         ('startup'|'active'|'recovery') and f.attackPhaseProgress (0..1).
 *   model.flash()         Optional. Called when the fighter gets hit.
 *   model.reset()         Optional. Called on round restart.
 *
 * This file is a primitive-shapes humanoid with procedural poses.
 * See GltfModel.js for a ready-made adapter for your own .glb characters.
 */

const box = (w, h, d, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
};

const lerp = (a, b, t) => a + (b - a) * t;

export class PlaceholderModel {
  constructor({ color = 0xcc4444, accent = 0xffffff, skin = 0xe0b090 } = {}) {
    this.mats = {
      body: new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
      accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, emissive: accent, emissiveIntensity: 0.25 }),
      skin: new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.9 }),
    };
    this.flashTimer = 0;

    this.root = new THREE.Group();
    this.body = new THREE.Group(); // whole-body pivot at the feet (used for KO fall)
    this.root.add(this.body);

    // Hips
    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.body.add(this.hips);
    const belt = box(0.46, 0.12, 0.3, this.mats.accent);
    this.hips.add(belt);

    // Torso + head
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = box(0.5, 0.62, 0.3, this.mats.body);
    chest.position.y = 0.36;
    this.torso.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), this.mats.skin);
    head.position.y = 0.86;
    head.castShadow = true;
    this.torso.add(head);
    const band = box(0.36, 0.06, 0.36, this.mats.accent);
    band.position.y = 0.92;
    this.torso.add(band);
    const eyes = box(0.2, 0.04, 0.05, this.mats.dark);
    eyes.position.set(0, 0.88, 0.15);
    this.torso.add(eyes);

    // Arms (pivot at the shoulder, hanging down along -Y)
    const makeArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.33 * side, 0.62, 0);
      const arm = box(0.14, 0.56, 0.14, this.mats.skin);
      arm.position.y = -0.28;
      const fist = box(0.17, 0.17, 0.17, this.mats.accent);
      fist.position.y = -0.6;
      pivot.add(arm, fist);
      this.torso.add(pivot);
      return pivot;
    };
    this.lArm = makeArm(1);
    this.rArm = makeArm(-1);

    // Legs (pivot at the hip)
    const makeLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.13 * side, -0.05, 0);
      const leg = box(0.18, 0.86, 0.2, this.mats.body);
      leg.position.y = -0.43;
      const foot = box(0.18, 0.08, 0.3, this.mats.dark);
      foot.position.set(0, -0.86, 0.05);
      pivot.add(leg, foot);
      this.hips.add(pivot);
      return pivot;
    };
    this.lLeg = makeLeg(1);
    this.rLeg = makeLeg(-1);

    this.pose = this.neutralPose();
  }

  neutralPose() {
    return { lArm: 0, rArm: 0, lArmZ: 0, rArmZ: 0, lLeg: 0, rLeg: 0, torso: 0, hipY: 0.95, fall: 0, lift: 0 };
  }

  reset() {
    this.pose = this.neutralPose();
    this.flashTimer = 0;
    this.applyFlash(false);
  }

  flash() { this.flashTimer = 0.12; this.applyFlash(true); }

  applyFlash(on) {
    for (const k of ['body', 'skin']) {
      this.mats[k].emissive.setHex(on ? 0xff2222 : 0x000000);
      this.mats[k].emissiveIntensity = on ? 0.9 : 0;
    }
  }

  /** Target pose for the current animation. Angles in radians; negative arm/leg X = swing forward. */
  targetPose(f) {
    const t = f.time;
    const p = this.neutralPose();
    const phase = f.attackPhase;
    const k = f.attackPhaseProgress;
    // Fighting guard
    p.lArm = -1.0; p.rArm = -0.7; p.lArmZ = -0.2; p.rArmZ = 0.2;
    p.lLeg = -0.3; p.rLeg = 0.3;
    p.hipY = 0.92 + Math.sin(t * 4) * 0.015;

    // Animations this simple model doesn't have fall back to a similar one.
    const ALIAS = { run: 'walk', fall: 'jump', land: 'idle', special: 'strong' };
    switch (ALIAS[f.animState] || f.animState) {
      case 'walk': {
        const s = Math.sin(t * 11);
        p.lLeg = -0.3 + s * 0.45; p.rLeg = 0.3 - s * 0.45;
        p.hipY = 0.92 + Math.abs(s) * 0.03;
        break;
      }
      case 'jump':
        p.lLeg = -1.1; p.rLeg = -0.4; p.torso = 0.15; p.hipY = 1.0;
        break;
      case 'punch':
        if (phase === 'startup') { p.lArm = lerp(-1.0, -0.3, k); p.torso = -0.05; }
        else if (phase === 'active') { p.lArm = -1.65; p.lArmZ = 0; p.torso = 0.25; }
        else { p.lArm = lerp(-1.65, -1.0, k); p.torso = lerp(0.25, 0, k); }
        break;
      case 'kick':
        if (phase === 'startup') { p.lLeg = lerp(-0.3, -0.9, k); p.torso = -0.1; }
        else if (phase === 'active') { p.lLeg = -1.7; p.torso = -0.35; p.rLeg = 0.15; }
        else { p.lLeg = lerp(-1.7, -0.3, k); p.torso = lerp(-0.35, 0, k); }
        break;
      case 'strong':
        if (phase === 'startup') { p.lArm = p.rArm = lerp(-1, -3.0, k); p.torso = lerp(0, -0.35, k); p.lArmZ = p.rArmZ = 0; }
        else if (phase === 'active') { p.lArm = p.rArm = -1.3; p.lArmZ = p.rArmZ = 0; p.torso = 0.55; p.lLeg = -0.7; p.hipY = 0.82; }
        else { p.lArm = p.rArm = lerp(-1.3, -0.9, k); p.torso = lerp(0.55, 0, k); p.hipY = lerp(0.82, 0.92, k); }
        break;
      case 'block':
        // Arms crossed up in front of the face, slightly crouched.
        p.lArm = -2.1; p.rArm = -2.1; p.lArmZ = 0.55; p.rArmZ = -0.55; p.torso = -0.1; p.hipY = 0.85;
        break;
      case 'hit':
        p.torso = -0.55; p.lArm = 0.6; p.rArm = 0.4; p.lArmZ = -0.6; p.rArmZ = 0.6; p.lLeg = -0.1; p.rLeg = 0.2;
        break;
      case 'ko':
        p.fall = -Math.PI / 2; p.lift = 0.16; p.torso = -0.2; p.lArm = -2.8; p.rArm = -2.6;
        p.lLeg = 0; p.rLeg = 0; p.hipY = 0.95;
        break;
      case 'victory': {
        const b = Math.abs(Math.sin(t * 6));
        p.lArm = p.rArm = -2.9; p.lArmZ = -0.3; p.rArmZ = 0.3; p.lLeg = 0; p.rLeg = 0; p.hipY = 0.95 + b * 0.08;
        break;
      }
    }
    return p;
  }

  update(f, dt) {
    const target = this.targetPose(f);
    // Attacks snap faster than idle movement so hits read clearly.
    const rate = f.state === 'attack' ? 45 : f.state === 'ko' ? 8 : 18;
    const a = 1 - Math.exp(-rate * dt);
    for (const key in target) this.pose[key] = lerp(this.pose[key], target[key], a);

    const p = this.pose;
    this.lArm.rotation.x = p.lArm; this.lArm.rotation.z = p.lArmZ;
    this.rArm.rotation.x = p.rArm; this.rArm.rotation.z = p.rArmZ;
    this.lLeg.rotation.x = p.lLeg; this.rLeg.rotation.x = p.rLeg;
    this.torso.rotation.x = p.torso;
    this.hips.position.y = p.hipY;
    this.body.rotation.x = p.fall;
    this.body.position.y = p.lift;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.applyFlash(false);
    }
  }
}
