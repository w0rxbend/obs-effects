import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ── Loading overlay ───────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px",
  "color:rgba(180,255,180,0.9);font:500 13px/1.4 'Courier New',monospace",
  "letter-spacing:0.1em;pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.innerHTML = [
  `<div id="load-status">Analyzing CC4 skeleton…</div>`,
  `<div style="width:180px;height:2px;background:rgba(180,255,180,0.15);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(180,255,180,0.7);border-radius:1px;transition:width 0.1s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  32,
  window.innerWidth / window.innerHeight,
  0.01,
  2000,
);

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const key = new THREE.DirectionalLight(0xfff0d0, 1.3);
key.position.set(2, 5, 3);
key.castShadow = true;
scene.add(key);

const fillL = new THREE.PointLight(0x44ff88, 2.8, 0);
const fillR = new THREE.PointLight(0xff4422, 2.0, 0);
scene.add(fillL, fillR);

// ── CC4 bone names — extracted from szombie.glb ───────────────────────────────
// Spine chain
const HIP = "CC_Base_Hip_100";
const WAIST = "CC_Base_Waist_99";
const SPINE1 = "CC_Base_Spine01_98";
const SPINE2 = "CC_Base_Spine02_97";
// Neck / head
const NECK1 = "CC_Base_NeckTwist01_44";
const NECK2 = "CC_Base_NeckTwist02_43";
const HEAD = "CC_Base_Head_42";
// Eyes & jaw (non-joint Object3Ds — captured via name prefix)
const EYE_R = "CC_Base_R_Eye_37";
const EYE_L = "CC_Base_L_Eye_38";
const JAW = "CC_Base_JawRoot_36";
// Right arm (character's right — left side of screen when facing camera)
const R_CLAV = "CC_Base_R_Clavicle_92";
const R_UPARM = "CC_Base_R_Upperarm_91"; // non-joint
const R_FOREARM = "CC_Base_R_Forearm_90"; // non-joint
const R_HAND = "CC_Base_R_Hand_89";
const R_IDX1 = "CC_Base_R_Index1_85";
const R_MID1 = "CC_Base_R_Mid1_76";
const R_RNG1 = "CC_Base_R_Ring1_79";
const R_PKY1 = "CC_Base_R_Pinky1_88";
const R_THB1 = "CC_Base_R_Thumb1_82";
// Left arm (character's left — right side of screen when facing camera)
const L_CLAV = "CC_Base_L_Clavicle_68";
const L_UPARM = "CC_Base_L_Upperarm_67"; // non-joint
const L_FOREARM = "CC_Base_L_Forearm_64"; // non-joint
const L_HAND = "CC_Base_L_Hand_63";
// Legs — non-joint thigh/calf, joint foot
const L_THIGH = "CC_Base_L_Thigh_15"; // non-joint
const R_THIGH = "CC_Base_R_Thigh_30"; // non-joint
const L_FOOT = "CC_Base_L_Foot_8";
const R_FOOT = "CC_Base_R_Foot_25";

// ── Bone registry ─────────────────────────────────────────────────────────────
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

// ── Load ──────────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;

loader.load(
  "/assets/main/szombie.glb",
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // The GLB contains both a static mesh copy (SZombie_Variant_1_0 → Object_4)
    // and the skinned mesh (SK_SZombie_Variant_1_102). Hide the non-skinned one.
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !(obj instanceof THREE.SkinnedMesh)) {
        obj.visible = false;
      }
    });

    // Capture ALL CC4 bones — including non-joint Object3Ds that the old
    // THREE.Bone check would miss (e.g. Upperarm, Forearm, Thigh, Calf)
    let boneCount = 0;
    model.traverse((obj) => {
      if (obj.name.startsWith("CC_Base_") || obj.name.startsWith("RL_")) {
        rig.set(obj.name, { obj, bindQ: obj.quaternion.clone() });
        boneCount++;
      }
    });

    // Both embedded animations are translation-only T-pose holds — skip mixer

    // Force all materials fully opaque — the model ships with alpha blending
    // enabled on some submeshes which makes it semitransparent by default.
    model.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const m of mats) {
          m.transparent = false;
          m.opacity = 1;
          m.depthWrite = true;
          m.needsUpdate = true;
        }
      }
    });

    // ── Frame camera ──────────────────────────────────────────────────────
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const h = size.y;
    const targetY = box.min.y + h * 0.75;
    const dist = h * 1.32; // another 25% closer

    camera.position.set(center.x, targetY, center.z + dist);
    camera.lookAt(center.x, targetY, center.z);

    fillL.position.set(center.x - h * 0.6, targetY, center.z - h * 0.4);
    fillR.position.set(
      center.x + h * 0.6,
      targetY - h * 0.05,
      center.z - h * 0.3,
    );
    fillL.distance = h * 3;
    fillR.distance = h * 3;

    loadStatus.textContent = `CC4 rig loaded — ${boneCount} bones driven`;
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 1000);
  },
  (xhr) => {
    if (xhr.total > 0) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      loadStatus.textContent = `Analyzing CC4 skeleton… ${pct}%`;
      loadFill.style.width = `${pct}%`;
    }
  },
  (err) => {
    console.error(err);
    loadStatus.textContent = "Failed to load szombie.glb";
  },
);

// ── Finger bone names ─────────────────────────────────────────────────────────
const R_FINGERS = [R_IDX1, R_MID1, R_RNG1, R_PKY1];
const L_FINGERS = [
  "CC_Base_L_Index1_53",
  "CC_Base_L_Mid1_50",
  "CC_Base_L_Ring1_56",
  "CC_Base_L_Pinky1_59",
];

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime + dt;

  // ── Dance beat ~120 BPM ──────────────────────────────────────────────────
  const beatF = (120 / 60) * Math.PI; // 120 BPM → rad/s
  const rawBeat = Math.sin(t * beatF);
  const beat = Math.sign(rawBeat) * Math.pow(Math.abs(rawBeat), 0.45);

  // ── Body groove ──────────────────────────────────────────────────────────
  const bob = beat * 0.06;
  const swayZ = Math.sin(t * 1.15) * 0.07;
  const shift = Math.sin(t * 0.9 + 0.4);

  if (rig.has(HIP)) pose(HIP, -0.04 + bob * 0.7, 0, swayZ + shift * 0.04);
  if (rig.has(WAIST)) pose(WAIST, bob * 0.5, 0, swayZ * 0.65);
  if (rig.has(SPINE1)) pose(SPINE1, bob * 0.35, 0, swayZ * 0.4);
  if (rig.has(SPINE2)) pose(SPINE2, bob * 0.2, 0, swayZ * 0.25);

  if (rig.has(L_THIGH)) pose(L_THIGH, 0, 0, shift * 0.04);
  if (rig.has(R_THIGH)) pose(R_THIGH, 0, 0, shift * 0.04);
  if (rig.has(L_FOOT)) pose(L_FOOT, -shift * 0.018, 0, 0);
  if (rig.has(R_FOOT)) pose(R_FOOT, -shift * 0.018, 0, 0);

  // ── Head — zombie loll + beat nod ────────────────────────────────────────
  const headNod = beat * 0.1;
  const lookY = Math.sin(t * 0.3) * 0.12;
  const loll = Math.sin(t * 0.18 + 0.7) * 0.07;

  if (rig.has(NECK1)) pose(NECK1, headNod * 0.4, lookY * 0.35, loll * 0.4);
  if (rig.has(NECK2)) pose(NECK2, headNod * 0.35, lookY * 0.3, loll * 0.35);
  if (rig.has(HEAD)) pose(HEAD, headNod, lookY, loll);
  if (rig.has(EYE_R)) pose(EYE_R, 0.05, lookY * 0.4, 0);
  if (rig.has(EYE_L)) pose(EYE_L, 0.05, lookY * 0.4, 0);

  const jawOpen = Math.max(0, beat) * 0.05;
  if (rig.has(JAW)) pose(JAW, jawOpen, 0, 0);

  // ── Zombie arms — raised up, alternating pump on beat ────────────────────
  // rx < 0 lifts the upper arm upward from T-pose.
  // rz ≈ 1.1 keeps the arm swung forward so the forearm bends correctly.
  // Forearm rx > 0 = natural gravity droop (no backward bend).
  // Hand rx > 0 = classic zombie wrist droop.
  const rPump = Math.sin(t * beatF * 0.5) * 0.22; // arm pumps up/down
  const lPump = Math.sin(t * beatF * 0.5 + Math.PI) * 0.22; // opposite phase

  // Right arm
  if (rig.has(R_CLAV)) pose(R_CLAV, -0.06, 0, 0.22);
  if (rig.has(R_UPARM)) pose(R_UPARM, -0.55 + rPump, 0, 1.1);
  if (rig.has(R_FOREARM)) pose(R_FOREARM, 0.42, 0, 0);
  if (rig.has(R_HAND)) pose(R_HAND, 0.5, 0, 0);

  // Left arm (mirrored Z)
  if (rig.has(L_CLAV)) pose(L_CLAV, -0.06, 0, -0.22);
  if (rig.has(L_UPARM)) pose(L_UPARM, -0.55 + lPump, 0, -1.1);
  if (rig.has(L_FOREARM)) pose(L_FOREARM, 0.42, 0, 0);
  if (rig.has(L_HAND)) pose(L_HAND, 0.5, 0, 0);

  // ── Fingers — zombie curl ─────────────────────────────────────────────────
  const curl = 0.3 + Math.sin(t * 0.38) * 0.06;
  for (const bone of R_FINGERS) {
    if (rig.has(bone)) pose(bone, curl, 0, 0);
  }
  for (const bone of L_FINGERS) {
    if (rig.has(bone)) pose(bone, curl, 0, 0);
  }
  if (rig.has(R_THB1)) pose(R_THB1, 0.2, 0, 0.3);
  if (rig.has("CC_Base_L_Thumb1_62")) pose("CC_Base_L_Thumb1_62", 0.2, 0, -0.3);

  renderer.render(scene, camera);
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
