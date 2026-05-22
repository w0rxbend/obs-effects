import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;cursor:grab;";
document.body.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();

// IBL — neutral room environment drives reflections on glossy surfaces
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.01,
  2000,
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.8;
controls.minPolarAngle = THREE.MathUtils.degToRad(5);
controls.maxPolarAngle = THREE.MathUtils.degToRad(155);

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xd0e8ff, 0.55));

// Key — warm directional from front-right above
const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.8);
keyLight.position.set(3, 6, 5);
keyLight.castShadow = true;
scene.add(keyLight);

// Fill — cool from opposite side, softer
const fillLight = new THREE.DirectionalLight(0x9ec8ff, 0.7);
fillLight.position.set(-4, 2, 3);
scene.add(fillLight);

// Rim — cold-blue edge light from behind
const rimLight = new THREE.DirectionalLight(0xb0e0ff, 1.1);
rimLight.position.set(0, 3, -6);
scene.add(rimLight);

// Key point light — warm close source that creates sharp specular highlights
// Position is updated after the model loads so it sits near the character's face.
const keyPoint = new THREE.PointLight(0xffddb0, 1.8, 0, 2);
keyPoint.position.set(1.5, 2, 2);
scene.add(keyPoint);

// ── Rig ───────────────────────────────────────────────────────────────────────
interface BoneEntry {
  obj: THREE.Object3D;
  bindQ: THREE.Quaternion;
}

const rig = new Map<string, BoneEntry>();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function pose(name: string, rx: number, ry: number, rz: number): void {
  const b = rig.get(name);
  if (!b) return;
  _e.set(rx, ry, rz, "XYZ");
  _q.setFromEuler(_e);
  b.obj.quaternion.copy(b.bindQ).multiply(_q);
}

// ── Exact bone names as Three.js registers them (colon stripped from namespace) ─
// GLB stores "smartrig:Head" but Three.js sanitizes to "smartrigHead".
const B = {
  hips: "smartrigHips",
  spine: "smartrigSpine",
  spine1: "smartrigSpine1",
  spine2: "smartrigSpine2",
  neck: "smartrigNeck",
  head: "smartrigHead",

  lShoulder: "smartrigLeftShoulder",
  lArm: "smartrigLeftArm",
  lForeArm: "smartrigLeftForeArm",
  lHand: "smartrigLeftHand",
  lThumb1: "smartrigLeftHandThumb1",
  lIndex1: "smartrigLeftHandIndex1",
  lMiddle1: "smartrigLeftHandMiddle1",
  lRing1: "smartrigLeftHandRing1",
  lPinky1: "smartrigLeftHandPinky1",

  rShoulder: "smartrigRightShoulder",
  rArm: "smartrigRightArm",
  rForeArm: "smartrigRightForeArm",
  rHand: "smartrigRightHand",
  rThumb1: "smartrigRightHandThumb1",
  rIndex1: "smartrigRightHandIndex1",
  rMiddle1: "smartrigRightHandMiddle1",
  rRing1: "smartrigRightHandRing1",
  rPinky1: "smartrigRightHandPinky1",

  lUpLeg: "smartrigLeftUpLeg",
  lLeg: "smartrigLeftLeg",
  lFoot: "smartrigLeftFoot",
  lToeBase: "smartrigLeftToeBase",

  rUpLeg: "smartrigRightUpLeg",
  rLeg: "smartrigRightLeg",
  rFoot: "smartrigRightFoot",
  rToeBase: "smartrigRightToeBase",
} as const;

// ── Bone panel classification ─────────────────────────────────────────────────
const boneGroups = {
  hips: [] as string[],
  spine: [] as string[],
  neck: [] as string[],
  head: [] as string[],
  leftShoulder: [] as string[],
  leftArm: [] as string[],
  leftForearm: [] as string[],
  leftHand: [] as string[],
  rightShoulder: [] as string[],
  rightArm: [] as string[],
  rightForearm: [] as string[],
  rightHand: [] as string[],
  leftThigh: [] as string[],
  leftShin: [] as string[],
  leftFoot: [] as string[],
  rightThigh: [] as string[],
  rightShin: [] as string[],
  rightFoot: [] as string[],
  fingers: [] as string[],
  toes: [] as string[],
  other: [] as string[],
};
type BoneGroup = keyof typeof boneGroups;

function classify(name: string): BoneGroup {
  // Strip namespace prefixes like "smartrig:", "mixamorig:", etc.
  const stripped = name.replace(/^[a-z]+:/i, "");
  const n = stripped.toLowerCase().replace(/[_\-.\s]/g, "");
  const isLeft = /^l(?=[A-Z])/.test(stripped) || /left/i.test(stripped);
  const isRight = /^r(?=[A-Z])/.test(stripped) || /right/i.test(stripped);

  if (/hips?|pelvis/i.test(n) && !/(leg|thigh|arm)/i.test(n)) return "hips";
  if (/spine|chest|upperbody/i.test(n) && !/(arm|leg|hand|foot)/i.test(n))
    return "spine";
  if (/neck/i.test(n)) return "neck";
  if (/head/i.test(n)) return "head";
  if (/finger|thumb|index|middle|ring|pinky/i.test(n)) return "fingers";
  if (/toe/i.test(n)) return "toes";

  if (isLeft) {
    if (/shoulder|clavicle|collar/i.test(n)) return "leftShoulder";
    if (/forearm|lowerarm/i.test(n)) return "leftForearm";
    if (/arm/i.test(n)) return "leftArm";
    if (/hand|wrist/i.test(n)) return "leftHand";
    if (/upleg|thigh|upperleg/i.test(n)) return "leftThigh";
    if (/leg|shin|knee/i.test(n) && !/upper/i.test(n)) return "leftShin";
    if (/foot|ankle/i.test(n)) return "leftFoot";
  }
  if (isRight) {
    if (/shoulder|clavicle|collar/i.test(n)) return "rightShoulder";
    if (/forearm|lowerarm/i.test(n)) return "rightForearm";
    if (/arm/i.test(n)) return "rightArm";
    if (/hand|wrist/i.test(n)) return "rightHand";
    if (/upleg|thigh|upperleg/i.test(n)) return "rightThigh";
    if (/leg|shin|knee/i.test(n) && !/upper/i.test(n)) return "rightShin";
    if (/foot|ankle/i.test(n)) return "rightFoot";
  }
  return "other";
}

// ── Loading overlay ───────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px",
  "color:rgba(100,210,255,0.9);font:500 13px/1.4 'Courier New',monospace;letter-spacing:0.1em",
  "pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.innerHTML = [
  `<div id="load-status">Loading Meshy AI Character…</div>`,
  `<div style="width:220px;height:2px;background:rgba(100,210,255,0.15);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(100,210,255,0.75);border-radius:1px;transition:width 0.12s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

// ── Runtime state ─────────────────────────────────────────────────────────────
let modelRoot: THREE.Group | null = null;

let camOrbit: { dist: number; targetY: number; center: THREE.Vector3 } | null =
  null;

// ── Load ──────────────────────────────────────────────────────────────────────
const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;

const loader = new GLTFLoader();
loader.load(
  "/assets/main/Meshy_AI_Character_output-Avatar.glb",
  (gltf) => {
    modelRoot = gltf.scene;

    const allBoneNames: string[] = [];
    const seen = new Set<string>();

    const registerBone = (obj: THREE.Object3D) => {
      if (seen.has(obj.name)) return;
      seen.add(obj.name);
      rig.set(obj.name, { obj, bindQ: obj.quaternion.clone() });
      allBoneNames.push(obj.name);
      boneGroups[classify(obj.name)].push(obj.name);
    };

    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Bone) registerBone(obj);
      const sm = obj as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) sm.skeleton.bones.forEach(registerBone);
    });

    console.log("[meshy-avatar] bones:", allBoneNames);
    console.log("[meshy-avatar] groups:", boneGroups);

    scene.add(gltf.scene);

    // ── Gloss pass — upgrade every mesh material to MeshPhysicalMaterial ──
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const mats: THREE.MeshStandardMaterial[] = Array.isArray(src)
        ? (src as unknown as THREE.MeshStandardMaterial[])
        : [src];
      const upgraded = mats.map((m) => {
        const p = new THREE.MeshPhysicalMaterial({
          map: m.map ?? null,
          normalMap: m.normalMap ?? null,
          roughnessMap: m.roughnessMap ?? null,
          metalnessMap: m.metalnessMap ?? null,
          aoMap: m.aoMap ?? null,
          emissiveMap: m.emissiveMap ?? null,
          color: m.color.clone(),
          roughness: Math.max((m.roughness ?? 0.8) * 0.85, 0.5),
          metalness: m.metalness ?? 0,
          clearcoat: 0.06,
          clearcoatRoughness: 0.5,
          envMapIntensity: 0.3,
          transparent: m.transparent,
          opacity: m.opacity,
          side: m.side,
        });
        m.dispose();
        return p;
      });
      mesh.material = Array.isArray(src) ? upgraded : upgraded[0];
    });

    // Frame camera
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const h = Math.max(size.y, 1);

    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const span = Math.max(size.x, size.z) * 0.5;
    const dist = (h * 0.5 + span) / Math.tan(fovRad / 2);
    const targetY = box.min.y + h * 0.52;

    camera.near = Math.max(dist * 0.004, 0.01);
    camera.far = dist * 12;
    camera.updateProjectionMatrix();

    controls.target.set(center.x, targetY, center.z);
    controls.minDistance = dist * 0.28;
    controls.maxDistance = dist * 3.2;
    controls.enabled = false;
    controls.update();

    camOrbit = { dist, targetY, center: center.clone() };

    // Place key point light near the character's upper chest / face level
    keyPoint.position.set(
      center.x + h * 0.35,
      box.min.y + h * 0.78,
      dist * 0.38,
    );
    keyPoint.distance = h * 5;

    // ── Split keyboard ────────────────────────────────────────────────────
    // GLB contains both halves in one mesh (left half X<0, right half X>0).
    // Scale to ~35% of character height and position at hand level in front.
    new GLTFLoader().load(
      "/assets/main/ErgoDox_EZ_keyb.glb",
      (kbGltf) => {
        // keyboard native half-width ≈ 0.95 units; target span ≈ 38% of h
        const kbScale = (h * 0.38) / 1.9;
        const kb = kbGltf.scene;
        kb.scale.setScalar(kbScale);
        // Y: roughly at hand height (~43% up from feet)
        // Z: slightly forward toward camera
        kb.rotation.y = Math.PI;
        kb.position.set(center.x, box.min.y + h * 0.5, center.z + dist * 0.12);
        scene.add(kb);
      },
      undefined,
      (err) => console.error("[keyboard]", err),
    );

    loadStatus.textContent = `${allBoneNames.length} joints loaded`;
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
    }, 900);
  },
  (xhr) => {
    if (xhr.total > 0) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      loadStatus.textContent = `Loading… ${pct}%`;
      loadFill.style.width = `${pct}%`;
    }
  },
  (err) => {
    console.error("[meshy-avatar]", err);
    loadStatus.textContent = "Failed to load model.";
  },
);

// ── Glance state machine ──────────────────────────────────────────────────────
// Drives where the head is looking — idle (forward), turn, hold, return.
type GlancePhase = "idle" | "turning" | "holding" | "returning";

let glancePhase: GlancePhase = "idle";
let glanceCooldown = 1.5 + Math.random() * 2.5; // time until first glance
let glanceTargetY = 0; // signed radians: negative = right, positive = left
let glanceHoldTimer = 0;
let headYSmooth = 0; // current smoothed head Y value

// ── Render loop ───────────────────────────────────────────────────────────────
let prevMs = performance.now();
let elapsedSec = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dt = Math.min((nowMs - prevMs) / 1000, 0.05);
  prevMs = nowMs;
  elapsedSec += dt;
  const t = elapsedSec;

  // ── Oscillator bank ────────────────────────────────────────────────────
  // Breathing: ~10 breaths/min (1.08 rad/s ≈ 5.8 s/cycle)
  const breatheSin = Math.sin(t * 1.08);
  const breathe = (breatheSin + 1) * 0.5; // 0..1

  // Weight shift: ~9 s primary cycle + slower secondary drift
  const sway = Math.sin(t * 0.7) * 0.55 + Math.sin(t * 0.27 + 1.3) * 0.35;

  // Micro-motion for organic feel
  const microNod = Math.sin(t * 0.29) * 0.5 + Math.sin(t * 0.53 + 0.8) * 0.35;
  const microTilt =
    Math.sin(t * 0.23 + 1.1) * 0.5 + Math.sin(t * 0.18 + 2.5) * 0.3;

  // Arm pendulum signals — slow incommensurate for organic feel
  const lArmSwing =
    Math.sin(t * 0.36 + 0.5) * 0.6 + Math.sin(t * 0.73 + 1.2) * 0.3;
  const rArmSwing =
    Math.sin(t * 0.39 + 1.9) * 0.6 + Math.sin(t * 0.68 + 0.3) * 0.3;

  // Weight on each foot — drives knee flex and foot tilt
  const leftWeight = Math.max(0, -sway);
  const rightWeight = Math.max(0, sway);

  // ── Hips — lateral roll follows weight shift ───────────────────────────
  pose(B.hips, 0, 0, sway * 0.038);

  // ── Spine — breathing chest rise + lateral counter-sway ───────────────
  pose(B.spine, breathe * 0.028, 0, sway * -0.012);
  pose(B.spine1, breathe * 0.036, 0, sway * -0.008);
  pose(B.spine2, breathe * 0.025, 0, sway * -0.006);

  // ── Clavicles — rise on inhale, drift with body lean ──────────────────
  pose(B.lShoulder, 0, 0, breathe * 0.055 + sway * 0.012);
  pose(B.rShoulder, 0, 0, -(breathe * 0.055 + sway * 0.012));

  // ── Glance state machine ──────────────────────────────────────────────
  if (glancePhase === "idle") {
    glanceCooldown -= dt;
    // Drift slowly back to center while waiting
    headYSmooth += (0 - headYSmooth) * Math.min(1, dt * 1.2);
    if (glanceCooldown <= 0) {
      glancePhase = "turning";
      const side = Math.random() < 0.5 ? -1 : 1;
      // ~1–2 degrees sideways
      glanceTargetY = side * (0.012 + Math.random() * 0.008);
      glanceHoldTimer = 1.4 + Math.random() * 2.0;
    }
  } else if (glancePhase === "turning") {
    // Quick saccade-like movement toward target
    headYSmooth += (glanceTargetY - headYSmooth) * Math.min(1, dt * 6.0);
    if (Math.abs(headYSmooth - glanceTargetY) < 0.001) {
      headYSmooth = glanceTargetY;
      glancePhase = "holding";
    }
  } else if (glancePhase === "holding") {
    // Very gentle drift during hold — eyes aren't perfectly still
    glanceTargetY += Math.sin(t * 1.8) * 0.0003;
    headYSmooth += (glanceTargetY - headYSmooth) * Math.min(1, dt * 1.8);
    glanceHoldTimer -= dt;
    if (glanceHoldTimer <= 0) glancePhase = "returning";
  } else {
    // returning — smooth ease back to center
    headYSmooth += (0 - headYSmooth) * Math.min(1, dt * 3.2);
    if (Math.abs(headYSmooth) < 0.0005) {
      headYSmooth = 0;
      glancePhase = "idle";
      glanceCooldown = 3.0 + Math.random() * 4.5;
    }
  }

  // Distribute the glance across the neck–head chain so total world rotation
  // equals headYSmooth exactly. Neck (parent) takes 40%, head bone takes 60%.
  // Both use the same headYSmooth value directly — no lag between them —
  // so the neck-head boundary vertices never get sheared during the turn.
  pose(B.neck, microNod * 0.003, headYSmooth * 0.4, microTilt * 0.001);
  pose(B.head, microNod * 0.004, headYSmooth * 0.6, microTilt * 0.002);

  // ── Arms — keyboard typing pose ───────────────────────────────────────
  // Axis calibration (confirmed from user feedback):
  //   lArm Z negative  = elbow spreads outward (left)
  //   rArm Z positive  = elbow spreads outward (right)
  //   arm X negative   = forward raise

  // Left upper arm: X smaller = arm lower; Z spread keeps elbows out
  pose(
    B.lArm,
    -(0.35 + lArmSwing * 0.05 + breathe * 0.018),
    lArmSwing * 0.025,
    -0.02,
  );
  // Left forearm: less flex → forearm angles more downward from elbow
  pose(B.lForeArm, -(0.6 + Math.abs(lArmSwing) * 0.03), 1.32, 0);
  // Left wrist: positive X droops palm down
  pose(B.lHand, 0.25 + lArmSwing * 0.02, 0, lArmSwing * 0.01);

  // Right upper arm (mirror)
  pose(
    B.rArm,
    -(0.35 + rArmSwing * 0.05 + breathe * 0.018),
    rArmSwing * -0.025,
    0.02,
  );
  // Right forearm: mirror
  pose(B.rForeArm, -(0.6 + Math.abs(rArmSwing) * 0.03), -1.32, 0);
  pose(B.rHand, 0.25 + rArmSwing * 0.02, 0, rArmSwing * -0.01);

  // ── Fingers — typing animation: staggered taps per finger ─────────────
  // tap(phase) returns 0..1 with a quick downstroke and slower release
  const typingFreq = 5.5;
  const tap = (phase: number) =>
    Math.max(0, Math.sin(t * typingFreq + phase)) * 0.38;

  // Resting curl base + tap on top; each finger at a different phase
  pose(B.lIndex1, 0.14 + tap(0.0), 0, 0);
  pose(B.lMiddle1, 0.16 + tap(2.1), 0, 0);
  pose(B.lRing1, 0.18 + tap(4.2), 0, 0);
  pose(B.lPinky1, 0.2 + tap(1.4), 0, 0);
  pose(B.lThumb1, 0.05, -0.3, 0.2);

  pose(B.rIndex1, 0.14 + tap(1.0), 0, 0);
  pose(B.rMiddle1, 0.16 + tap(3.1), 0, 0);
  pose(B.rRing1, 0.18 + tap(5.2), 0, 0);
  pose(B.rPinky1, 0.2 + tap(2.4), 0, 0);
  pose(B.rThumb1, 0.05, 0.3, -0.2);

  // ── Legs — weight shift with visible knee flex ────────────────────────
  pose(B.lUpLeg, lArmSwing * 0.008, 0, sway * -0.05);
  pose(B.rUpLeg, rArmSwing * 0.008, 0, sway * 0.05);
  pose(B.lLeg, 0.04 + leftWeight * 0.06 - rightWeight * 0.03, 0, 0);
  pose(B.rLeg, 0.04 + rightWeight * 0.06 - leftWeight * 0.03, 0, 0);
  pose(B.lFoot, leftWeight * -0.035, 0, 0);
  pose(B.rFoot, rightWeight * -0.035, 0, 0);
  pose(B.lToeBase, leftWeight * 0.015, 0, 0);
  pose(B.rToeBase, rightWeight * 0.015, 0, 0);

  // ── Root model micro-sway ─────────────────────────────────────────────
  if (modelRoot) modelRoot.rotation.y = sway * 0.045;

  if (camOrbit) {
    const { dist, targetY: ty, center: ctr } = camOrbit;
    const az =
      THREE.MathUtils.degToRad(20) +
      THREE.MathUtils.degToRad(10) * Math.sin(t * 0.42);
    const el =
      THREE.MathUtils.degToRad(20) +
      THREE.MathUtils.degToRad(4) * Math.sin(t * 0.27 + 1.1);
    camera.position.set(
      ctr.x + dist * Math.sin(az) * Math.cos(el),
      ty + dist * Math.sin(el),
      ctr.z + dist * Math.cos(az) * Math.cos(el),
    );
    camera.lookAt(ctr.x, ty, ctr.z);
  } else {
    controls.update();
  }
  renderer.render(scene, camera);
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.domElement.addEventListener("pointerdown", () => {
  document.body.style.cursor = "grabbing";
});
window.addEventListener("pointerup", () => {
  document.body.style.cursor = "grab";
});
