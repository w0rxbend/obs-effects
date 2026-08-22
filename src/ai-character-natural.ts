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
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;cursor:grab;";
document.body.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
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

// ── Warm podcast-studio lighting ──────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xfff0dd, 0.45));

const keyLight = new THREE.DirectionalLight(0xfff4e8, 2.1);
keyLight.position.set(3, 7, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xb8d4ff, 0.5);
fillLight.position.set(-5, 2, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffd0a0, 1.0);
rimLight.position.set(0.5, 4, -7);
scene.add(rimLight);

const keyPoint = new THREE.PointLight(0xffcc80, 2.0, 0, 2);
keyPoint.position.set(1.5, 2, 2);
scene.add(keyPoint);

// ── Flexible bone rig ─────────────────────────────────────────────────────────
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

interface BoneEntry {
  obj: THREE.Object3D;
  bindQ: THREE.Quaternion;
}
const rig = new Map<string, BoneEntry>();

function registerBone(obj: THREE.Object3D): void {
  if (rig.has(obj.name)) return;
  rig.set(obj.name, { obj, bindQ: obj.quaternion.clone() });
}

function findBone(include: string[], exclude: string[] = []): BoneEntry | null {
  const clean = (s: string) => s.toLowerCase().replace(/[_\-.\s:]/g, "");
  for (const [name, entry] of rig) {
    const n = clean(name);
    if (exclude.some((e) => n.includes(clean(e)))) continue;
    if (include.some((p) => n.includes(clean(p)))) return entry;
  }
  return null;
}

function pose(b: BoneEntry | null, rx: number, ry: number, rz: number): void {
  if (!b) return;
  _e.set(rx, ry, rz, "XYZ");
  _q.setFromEuler(_e);
  b.obj.quaternion.copy(b.bindQ).multiply(_q);
}

type Slot = BoneEntry | null;
let B: Record<string, Slot> = {};

function resolveRig(): void {
  B = {
    hips: findBone(["hips", "pelvis"]),
    spine: findBone(
      ["spine"],
      ["spine1", "spine2", "spine3", "spine_1", "spine_2", "upperchest"],
    ),
    spine1: findBone(
      ["spine1", "spine_1"],
      ["spine2", "spine_2", "upperchest"],
    ),
    spine2: findBone(["spine2", "spine_2", "upperchest"]),
    neck: findBone(["neck"]),
    head: findBone(["head"]),
    lShoulder: findBone(["leftshoulder", "leftclavicle", "lclavicle"]),
    lArm: findBone(
      ["leftarm", "leftupperarm", "larm"],
      ["forearm", "lowerarm"],
    ),
    lForeArm: findBone(["leftforearm", "leftlowerarm", "lforearm"]),
    lHand: findBone(
      ["lefthand", "lwrist"],
      ["thumb", "index", "middle", "ring", "pinky"],
    ),
    lThumb1: findBone(["leftthumb1", "lefthandthumb1", "lthumb1"]),
    lIndex1: findBone(["leftindex1", "lefthandindex1", "lindex1"]),
    lMiddle1: findBone(["leftmiddle1", "lefthandmiddle1", "lmiddle1"]),
    lRing1: findBone(["leftring1", "lefthandring1", "lring1"]),
    lPinky1: findBone(["leftpinky1", "lefthandpinky1", "lpinky1"]),
    rShoulder: findBone(["rightshoulder", "rightclavicle", "rclavicle"]),
    rArm: findBone(
      ["rightarm", "rightupperarm", "rarm"],
      ["forearm", "lowerarm"],
    ),
    rForeArm: findBone(["rightforearm", "rightlowerarm", "rforearm"]),
    rHand: findBone(
      ["righthand", "rwrist"],
      ["thumb", "index", "middle", "ring", "pinky"],
    ),
    rThumb1: findBone(["rightthumb1", "righthandthumb1", "rthumb1"]),
    rIndex1: findBone(["rightindex1", "righthandindex1", "rindex1"]),
    rMiddle1: findBone(["rightmiddle1", "righthandmiddle1", "rmiddle1"]),
    rRing1: findBone(["rightring1", "righthandring1", "rring1"]),
    rPinky1: findBone(["rightpinky1", "righthandpinky1", "rpinky1"]),
    lUpLeg: findBone(["leftupleg", "leftthigh"]),
    lLeg: findBone(["leftleg", "leftshin"], ["upper", "thigh", "upleg"]),
    lFoot: findBone(["leftfoot"]),
    rUpLeg: findBone(["rightupleg", "rightthigh"]),
    rLeg: findBone(["rightleg", "rightshin"], ["upper", "thigh", "upleg"]),
    rFoot: findBone(["rightfoot"]),
  };
  const mapped = Object.entries(B)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}=${v!.obj.name}`)
    .join(", ");
  console.log("[ai-natural] rig:", mapped);
}

// ── Loading overlay ───────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px",
  "color:rgba(255,200,120,0.9);font:500 13px/1.4 'Courier New',monospace;letter-spacing:0.1em",
  "pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.innerHTML = [
  `<div id="load-status">Loading AI Character…</div>`,
  `<div style="width:220px;height:2px;background:rgba(255,200,120,0.15);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(255,200,120,0.75);border-radius:1px;transition:width 0.12s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;

// ── Runtime state ─────────────────────────────────────────────────────────────
let modelRoot: THREE.Group | null = null;
let camOrbit: { dist: number; targetY: number; center: THREE.Vector3 } | null =
  null;

// ── Load model ────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
loader.load(
  `${import.meta.env.BASE_URL}assets/main/ai-character-natural-pose.glb`,
  (gltf) => {
    modelRoot = gltf.scene;
    const seen = new Set<string>();

    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Bone && !seen.has(obj.name)) {
        seen.add(obj.name);
        registerBone(obj);
      }
      const sm = obj as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.skeleton.bones.forEach((b) => {
          if (!seen.has(b.name)) {
            seen.add(b.name);
            registerBone(b);
          }
        });
      }
    });

    console.log("[ai-natural] all bones:", [...rig.keys()].join(", "));
    resolveRig();
    scene.add(gltf.scene);

    // Gloss material upgrade
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const mats = Array.isArray(src)
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
          roughness: Math.max((m.roughness ?? 0.8) * 0.88, 0.45),
          metalness: m.metalness ?? 0,
          clearcoat: 0.08,
          clearcoatRoughness: 0.45,
          envMapIntensity: 0.35,
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

    keyPoint.position.set(
      center.x + h * 0.35,
      box.min.y + h * 0.78,
      dist * 0.38,
    );
    keyPoint.distance = h * 5;

    loadStatus.textContent = `${rig.size} joints loaded`;
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  (xhr) => {
    if (xhr.total > 0) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      loadStatus.textContent = `Loading… ${pct}%`;
      loadFill.style.width = `${pct}%`;
    }
  },
  (err) => {
    console.error("[ai-natural]", err);
    loadStatus.textContent = "Failed to load model.";
  },
);

// ── Glance state machine ──────────────────────────────────────────────────────
type GlancePhase = "idle" | "turning" | "holding" | "returning";
let glancePhase: GlancePhase = "idle";
let glanceCooldown = 1.5 + Math.random() * 2.5;
let glanceTargetY = 0;
let glanceHoldTimer = 0;
let headYSmooth = 0;

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

  // ── Oscillators ────────────────────────────────────────────────────────
  const breathe = (Math.sin(t * 1.05) + 1) * 0.5;
  const sway = Math.sin(t * 0.65) * 0.5 + Math.sin(t * 0.25 + 1.1) * 0.32;
  const microNod = Math.sin(t * 0.28) * 0.5 + Math.sin(t * 0.51 + 0.8) * 0.35;
  const microTilt =
    Math.sin(t * 0.22 + 1.0) * 0.5 + Math.sin(t * 0.17 + 2.4) * 0.3;

  const leftWeight = Math.max(0, -sway);
  const rightWeight = Math.max(0, sway);

  // Slow incommensurate arm swings for organic feel
  const lArmSwing =
    Math.sin(t * 0.32 + 0.4) * 0.4 + Math.sin(t * 0.61 + 1.0) * 0.2;
  const rArmSwing =
    Math.sin(t * 0.35 + 1.8) * 0.4 + Math.sin(t * 0.58 + 0.2) * 0.2;

  // ── Core body ──────────────────────────────────────────────────────────
  pose(B.hips, 0, 0, sway * 0.035);
  pose(B.spine, breathe * 0.025, 0, sway * -0.01);
  pose(B.spine1, breathe * 0.032, 0, sway * -0.007);
  pose(B.spine2, breathe * 0.022, 0, sway * -0.005);
  pose(B.lShoulder, 0, 0, breathe * 0.045 + sway * 0.01);
  pose(B.rShoulder, 0, 0, -(breathe * 0.045 + sway * 0.01));

  // ── Glance state machine ───────────────────────────────────────────────
  if (glancePhase === "idle") {
    glanceCooldown -= dt;
    headYSmooth += (0 - headYSmooth) * Math.min(1, dt * 1.2);
    if (glanceCooldown <= 0) {
      glancePhase = "turning";
      const side = Math.random() < 0.5 ? -1 : 1;
      glanceTargetY = side * (0.012 + Math.random() * 0.01);
      glanceHoldTimer = 1.2 + Math.random() * 2.2;
    }
  } else if (glancePhase === "turning") {
    headYSmooth += (glanceTargetY - headYSmooth) * Math.min(1, dt * 6.0);
    if (Math.abs(headYSmooth - glanceTargetY) < 0.001) {
      headYSmooth = glanceTargetY;
      glancePhase = "holding";
    }
  } else if (glancePhase === "holding") {
    glanceTargetY += Math.sin(t * 1.7) * 0.0003;
    headYSmooth += (glanceTargetY - headYSmooth) * Math.min(1, dt * 1.8);
    glanceHoldTimer -= dt;
    if (glanceHoldTimer <= 0) glancePhase = "returning";
  } else {
    headYSmooth += (0 - headYSmooth) * Math.min(1, dt * 3.0);
    if (Math.abs(headYSmooth) < 0.0005) {
      headYSmooth = 0;
      glancePhase = "idle";
      glanceCooldown = 3.5 + Math.random() * 5.0;
    }
  }

  // Head nod during holding (thoughtful listening nod)
  const holdNod = glancePhase === "holding" ? Math.sin(t * 2.0) * 0.012 : 0;

  pose(
    B.neck,
    microNod * 0.003 + holdNod * 0.4,
    headYSmooth * 0.4,
    microTilt * 0.001,
  );
  pose(
    B.head,
    microNod * 0.004 + holdNod * 0.6 + breathe * 0.002,
    headYSmooth * 0.6,
    microTilt * 0.002,
  );

  // ── Arms — hold bind pose, add only micro organic sway ────────────────
  pose(B.lArm, lArmSwing * 0.008, 0, 0);
  pose(B.rArm, rArmSwing * 0.008, 0, 0);
  pose(B.lForeArm, 0, 0, 0);
  pose(B.rForeArm, 0, 0, 0);
  pose(B.lHand, 0, 0, 0);
  pose(B.rHand, 0, 0, 0);

  // ── Fingers — natural relaxed curl ────────────────────────────────────
  pose(B.lIndex1, 0.18, 0, 0);
  pose(B.lMiddle1, 0.2, 0, 0);
  pose(B.lRing1, 0.22, 0, 0);
  pose(B.lPinky1, 0.24, 0, 0);
  pose(B.lThumb1, 0.06, -0.25, 0.18);

  pose(B.rIndex1, 0.18, 0, 0);
  pose(B.rMiddle1, 0.2, 0, 0);
  pose(B.rRing1, 0.22, 0, 0);
  pose(B.rPinky1, 0.24, 0, 0);
  pose(B.rThumb1, 0.06, 0.25, -0.18);

  // ── Legs ───────────────────────────────────────────────────────────────
  pose(B.lUpLeg, lArmSwing * 0.007, 0, sway * -0.04);
  pose(B.rUpLeg, rArmSwing * 0.007, 0, sway * 0.04);
  pose(B.lLeg, 0.03 + leftWeight * 0.05, 0, 0);
  pose(B.rLeg, 0.03 + rightWeight * 0.05, 0, 0);
  pose(B.lFoot, leftWeight * -0.025, 0, 0);
  pose(B.rFoot, rightWeight * -0.025, 0, 0);

  // ── Root micro-sway ────────────────────────────────────────────────────
  if (modelRoot) modelRoot.rotation.y = sway * 0.04;

  // ── Camera — slow cinematic orbit from front-right ─────────────────────
  if (camOrbit) {
    const { dist, targetY: ty, center: ctr } = camOrbit;
    const az =
      THREE.MathUtils.degToRad(18) +
      THREE.MathUtils.degToRad(8) * Math.sin(t * 0.38);
    const el =
      THREE.MathUtils.degToRad(18) +
      THREE.MathUtils.degToRad(3.5) * Math.sin(t * 0.25 + 0.9);
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
