import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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
controls.minPolarAngle = THREE.MathUtils.degToRad(10);
controls.maxPolarAngle = THREE.MathUtils.degToRad(150);

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xd0e8ff, 0.9));

const keyLight = new THREE.DirectionalLight(0xffeedd, 2.4);
keyLight.position.set(3, 6, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x80c8ff, 1.2);
fillLight.position.set(-4, 2, 3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xc0f0ff, 1.6);
rimLight.position.set(0, 3, -6);
scene.add(rimLight);

// ── Rig helpers ───────────────────────────────────────────────────────────────
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

// ── Bone classification ───────────────────────────────────────────────────────
// Populated at load time by categorizing every bone name.
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
  const n = name.toLowerCase().replace(/[_\-.\s]/g, "");
  const isLeft = /^(l|left|mixamorigl)/.test(n) || /left/.test(n);
  const isRight = /^(r|right|mixamorigr)/.test(n) || /right/.test(n);

  if (/hips?|pelvis|root/i.test(n) && !/(leg|thigh|arm)/i.test(n))
    return "hips";
  if (
    /spine|chest|torso|back|upperbody/i.test(n) &&
    !/(arm|leg|hand|foot)/i.test(n)
  )
    return "spine";
  if (/neck/i.test(n)) return "neck";
  if (/head/i.test(n) && !/headband|headphone/i.test(n)) return "head";

  if (/finger|thumb|index|middle|ring|pinky|little/i.test(n)) return "fingers";
  if (/toe/i.test(n)) return "toes";

  if (isLeft) {
    if (/clavicle|collar|shoulder(?!.*(upper|arm))/i.test(n))
      return "leftShoulder";
    if (/upperarm|arm(?!ature)|shoulder.*arm/i.test(n)) return "leftArm";
    if (/forearm|lowerarm|elbow/i.test(n)) return "leftForearm";
    if (/hand|wrist/i.test(n) && !/upper/i.test(n)) return "leftHand";
    if (/upleg|thigh|upperleg|hip(?!s)/i.test(n)) return "leftThigh";
    if (/leg|shin|knee|lowerleg/i.test(n) && !/upper/i.test(n))
      return "leftShin";
    if (/foot|ankle/i.test(n)) return "leftFoot";
  }

  if (isRight) {
    if (/clavicle|collar|shoulder(?!.*(upper|arm))/i.test(n))
      return "rightShoulder";
    if (/upperarm|arm(?!ature)|shoulder.*arm/i.test(n)) return "rightArm";
    if (/forearm|lowerarm|elbow/i.test(n)) return "rightForearm";
    if (/hand|wrist/i.test(n) && !/upper/i.test(n)) return "rightHand";
    if (/upleg|thigh|upperleg|hip(?!s)/i.test(n)) return "rightThigh";
    if (/leg|shin|knee|lowerleg/i.test(n) && !/upper/i.test(n))
      return "rightShin";
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
  `<div id="load-status">Analyzing Meshy AI Character…</div>`,
  `<div style="width:220px;height:2px;background:rgba(100,210,255,0.15);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(100,210,255,0.75);border-radius:1px;transition:width 0.12s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

// ── Skeleton info panel ───────────────────────────────────────────────────────
const panel = document.createElement("div");
panel.style.cssText = [
  "position:fixed;top:14px;left:14px;padding:12px 15px",
  "color:rgba(100,210,255,0.82);font:400 10.5px/1.65 'Courier New',monospace;letter-spacing:0.04em",
  "background:rgba(0,8,18,0.58);border:1px solid rgba(100,210,255,0.18);border-radius:6px",
  "max-width:250px;max-height:75vh;overflow-y:auto",
  "pointer-events:none;opacity:0;transition:opacity 0.8s ease",
  "scrollbar-width:thin;scrollbar-color:rgba(100,210,255,0.2) transparent",
].join(";");
document.body.appendChild(panel);

// ── Runtime state ─────────────────────────────────────────────────────────────
let mixer: THREE.AnimationMixer | null = null;
let modelRoot: THREE.Group | null = null;
let skeletonHelper: THREE.SkeletonHelper | null = null;
let modelHeight = 1;
const modelCenter = new THREE.Vector3();

// ── Load ──────────────────────────────────────────────────────────────────────
const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;

const loader = new GLTFLoader();
loader.load(
  "/assets/main/Meshy_AI_Character_output-Avatar.glb",
  (gltf) => {
    modelRoot = gltf.scene;

    // Collect every bone from scene-graph and skeleton arrays.
    const allBoneNames: string[] = [];
    const seenNames = new Set<string>();

    const registerBone = (obj: THREE.Object3D) => {
      if (seenNames.has(obj.name)) return;
      seenNames.add(obj.name);
      rig.set(obj.name, { obj, bindQ: obj.quaternion.clone() });
      allBoneNames.push(obj.name);
      const group = classify(obj.name);
      boneGroups[group].push(obj.name);
    };

    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Bone) registerBone(obj);
      const sm = obj as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) sm.skeleton.bones.forEach(registerBone);
    });

    console.log("[meshy-avatar] total bones:", allBoneNames.length);
    console.log("[meshy-avatar] bone names:", allBoneNames);
    console.log("[meshy-avatar] groups:", boneGroups);

    // Build info panel HTML
    const LABELS: Record<BoneGroup, string> = {
      hips: "HIPS / ROOT",
      spine: "SPINE",
      neck: "NECK",
      head: "HEAD",
      leftShoulder: "L SHOULDER",
      leftArm: "L ARM",
      leftForearm: "L FOREARM",
      leftHand: "L HAND",
      rightShoulder: "R SHOULDER",
      rightArm: "R ARM",
      rightForearm: "R FOREARM",
      rightHand: "R HAND",
      leftThigh: "L THIGH",
      leftShin: "L SHIN",
      leftFoot: "L FOOT",
      rightThigh: "R THIGH",
      rightShin: "R SHIN",
      rightFoot: "R FOOT",
      fingers: "FINGERS",
      toes: "TOES",
      other: "OTHER",
    };

    const rows: string[] = [
      `<div style="color:rgba(180,235,255,0.95);font-weight:600;font-size:11.5px;margin-bottom:6px">MESHY AI CHARACTER</div>`,
      `<div style="color:rgba(100,210,255,0.55);margin-bottom:10px;font-size:10px">${allBoneNames.length} joints detected · ${gltf.animations.length} animation${gltf.animations.length !== 1 ? "s" : ""}</div>`,
    ];

    for (const [group, names] of Object.entries(boneGroups) as [
      BoneGroup,
      string[],
    ][]) {
      if (names.length === 0) continue;
      const color =
        group === "other"
          ? "rgba(100,210,255,0.38)"
          : group.startsWith("left")
            ? "rgba(120,220,180,0.72)"
            : group.startsWith("right")
              ? "rgba(255,170,120,0.72)"
              : "rgba(200,220,255,0.72)";
      rows.push(
        `<div style="color:${color};font-weight:600;margin-top:7px;font-size:9.5px;letter-spacing:0.08em">${LABELS[group]} (${names.length})</div>`,
      );
      rows.push(
        ...names.map(
          (n) =>
            `<div style="color:rgba(100,210,255,0.6);padding-left:6px;font-size:9.5px">${n}</div>`,
        ),
      );
    }
    panel.innerHTML = rows.join("");

    scene.add(gltf.scene);

    // Skeleton helper — cyan holographic look
    skeletonHelper = new THREE.SkeletonHelper(gltf.scene);
    const helperMat = skeletonHelper.material;
    if (helperMat instanceof THREE.LineBasicMaterial) {
      helperMat.color.set(0x00d4ff);
      helperMat.transparent = true;
      helperMat.opacity = 0.5;
      helperMat.depthWrite = false;
    }
    scene.add(skeletonHelper);

    // Baked animations blended at low weight so procedural layer dominates
    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltf.scene);
      gltf.animations.forEach((clip) => {
        const action = mixer!.clipAction(clip);
        action.setEffectiveWeight(0.25);
        action.play();
      });
    }

    // Frame camera to fit the full model
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(modelCenter);
    modelHeight = Math.max(size.y, 1);

    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const maxSpan = Math.max(size.x, size.z) * 0.5;
    const dist = (modelHeight * 0.5 + maxSpan) / Math.tan(fovRad / 2);
    const targetY = box.min.y + modelHeight * 0.52;

    camera.position.set(modelCenter.x, targetY + modelHeight * 0.04, dist);
    camera.lookAt(modelCenter.x, targetY, modelCenter.z);
    camera.near = Math.max(dist * 0.004, 0.01);
    camera.far = dist * 12;
    camera.updateProjectionMatrix();

    controls.target.set(modelCenter.x, targetY, modelCenter.z);
    controls.minDistance = dist * 0.28;
    controls.maxDistance = dist * 3.2;
    controls.update();

    loadStatus.textContent = `${allBoneNames.length} joints · ${gltf.animations.length} anims`;
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      panel.style.opacity = "1";
    }, 900);
  },
  (xhr) => {
    if (xhr.total > 0) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      loadStatus.textContent = `Analyzing skeleton… ${pct}%`;
      loadFill.style.width = `${pct}%`;
    }
  },
  (err) => {
    console.error("[meshy-avatar] load error:", err);
    loadStatus.textContent = "Failed to load model.";
  },
);

// ── Procedural idle animation ─────────────────────────────────────────────────
// Uses the first bone found in each group; gracefully skips missing groups.
function firstOf(arr: string[]): string | undefined {
  return arr[0];
}

const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  mixer?.update(dt);

  const breathe = Math.sin(t * 1.08);
  const sway = Math.sin(t * 0.44);
  const nod = Math.sin(t * 0.31);

  // Hips — subtle float
  const hips = firstOf(boneGroups.hips);
  if (hips) pose(hips, breathe * 0.006, sway * 0.01, 0);

  // Spine — layered sway
  for (const name of boneGroups.spine) {
    pose(name, breathe * 0.007, sway * 0.012, 0);
  }

  // Neck / Head
  const neck = firstOf(boneGroups.neck);
  const head = firstOf(boneGroups.head);
  if (neck) pose(neck, nod * 0.028, sway * 0.035, 0);
  if (head) pose(head, nod * 0.038, sway * 0.07, 0);

  // Left arm chain
  const lShoulder = firstOf(boneGroups.leftShoulder);
  const lArm = firstOf(boneGroups.leftArm);
  const lFore = firstOf(boneGroups.leftForearm);
  const lHand = firstOf(boneGroups.leftHand);
  const lSwing =
    Math.sin(t * 0.39 + 0.4) * 0.05 + Math.sin(t * 0.73 + 1.1) * 0.025;
  const lSide = Math.sin(t * 0.54 + 2.2) * 0.04;
  const lElbow = 0.42 + Math.sin(t * 0.61 + 2.3) * 0.04;
  if (lShoulder) pose(lShoulder, 0, 0, 0.05);
  if (lArm) pose(lArm, breathe * 0.008 + lSwing, 0, 0.1 + lSide);
  if (lFore) pose(lFore, lElbow, 0, 0);
  if (lHand) pose(lHand, 0.06 + lSwing * 0.25, 0, 0);

  // Right arm chain
  const rShoulder = firstOf(boneGroups.rightShoulder);
  const rArm = firstOf(boneGroups.rightArm);
  const rFore = firstOf(boneGroups.rightForearm);
  const rHand = firstOf(boneGroups.rightHand);
  const rSwing =
    Math.sin(t * 0.45 + 1.7) * 0.05 + Math.sin(t * 0.69 + 0.5) * 0.025;
  const rSide = Math.sin(t * 0.5 + 3.1) * 0.04;
  const rElbow = 0.42 + Math.sin(t * 0.57 + 0.8) * 0.04;
  if (rShoulder) pose(rShoulder, 0, 0, -0.05);
  if (rArm) pose(rArm, breathe * 0.008 + rSwing, 0, -0.1 + rSide);
  if (rFore) pose(rFore, rElbow, 0, 0);
  if (rHand) pose(rHand, 0.06 + rSwing * 0.25, 0, 0);

  // Legs — minimal shift weight
  const lThigh = firstOf(boneGroups.leftThigh);
  const rThigh = firstOf(boneGroups.rightThigh);
  if (lThigh) pose(lThigh, 0, 0, -0.02 + breathe * 0.005);
  if (rThigh) pose(rThigh, 0, 0, 0.02 - breathe * 0.005);

  // Root body sway
  if (modelRoot) {
    modelRoot.rotation.y = sway * 0.055;
  }

  if (skeletonHelper) skeletonHelper.updateMatrixWorld(true);

  controls.update();
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
