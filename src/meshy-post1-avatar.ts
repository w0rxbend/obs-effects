import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "/assets/main/Meshy_AI_Character_output-Post1.glb";
const USE_AUTHORED_MODEL_POSE = true;

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

scene.add(new THREE.AmbientLight(0xd0e8ff, 0.55));

const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.8);
keyLight.position.set(3, 6, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x9ec8ff, 0.7);
fillLight.position.set(-4, 2, 3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xb0e0ff, 1.1);
rimLight.position.set(0, 3, -6);
scene.add(rimLight);

const keyPoint = new THREE.PointLight(0xffddb0, 1.8, 0, 2);
keyPoint.position.set(1.5, 2, 2);
scene.add(keyPoint);

interface BoneEntry {
  obj: THREE.Object3D;
  bindQ: THREE.Quaternion;
  bindP: THREE.Vector3;
}

type BoneKey =
  | "hips"
  | "spine"
  | "spine1"
  | "spine2"
  | "neck"
  | "head"
  | "lShoulder"
  | "lArm"
  | "lForeArm"
  | "lHand"
  | "lThumb1"
  | "lIndex1"
  | "lMiddle1"
  | "lRing1"
  | "lPinky1"
  | "rShoulder"
  | "rArm"
  | "rForeArm"
  | "rHand"
  | "rThumb1"
  | "rIndex1"
  | "rMiddle1"
  | "rRing1"
  | "rPinky1"
  | "lUpLeg"
  | "lLeg"
  | "lFoot"
  | "lToeBase"
  | "rUpLeg"
  | "rLeg"
  | "rFoot"
  | "rToeBase";

const rig = new Map<string, BoneEntry>();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function pose(
  name: string | null,
  rx: number,
  ry: number,
  rz: number,
  px = 0,
  py = 0,
  pz = 0,
): void {
  if (!name) return;
  const b = rig.get(name);
  if (!b) return;
  b.obj.position.set(b.bindP.x + px, b.bindP.y + py, b.bindP.z + pz);
  _e.set(rx, ry, rz, "XYZ");
  _q.setFromEuler(_e);
  b.obj.quaternion.copy(b.bindQ).multiply(_q);
}

function poseAdd(key: BoneKey, rx = 0, ry = 0, rz = 0): void {
  if (USE_AUTHORED_MODEL_POSE) return;
  const rest = REST_POSE[key];
  const position = REST_POSITION[key];
  pose(
    B[key],
    (rest?.[0] ?? 0) + rx,
    (rest?.[1] ?? 0) + ry,
    (rest?.[2] ?? 0) + rz,
    position?.[0] ?? 0,
    position?.[1] ?? 0,
    position?.[2] ?? 0,
  );
}

function normalizeBoneName(name: string): string {
  return name
    .replace(/^[a-z]+:/i, "")
    .replace(/^(smartrig|mixamorig|mixamo|rig|armature)/i, "")
    .replace(/[_\-.\s]/g, "")
    .toLowerCase();
}

const BONE_ALIASES: Record<BoneKey, string[]> = {
  hips: ["hips", "pelvis"],
  spine: ["spine"],
  spine1: ["spine1", "chest"],
  spine2: ["spine2", "upperchest"],
  neck: ["neck"],
  head: ["head"],
  lShoulder: ["leftshoulder", "leftclavicle", "lshoulder", "lclavicle"],
  lArm: ["leftarm", "leftupperarm", "larm", "lupperarm"],
  lForeArm: ["leftforearm", "leftlowerarm", "lforearm", "llowerarm"],
  lHand: ["lefthand", "leftwrist", "lhand", "lwrist"],
  lThumb1: ["lefthandthumb1", "leftthumb1", "lthumb1"],
  lIndex1: ["lefthandindex1", "leftindex1", "lindex1"],
  lMiddle1: ["lefthandmiddle1", "leftmiddle1", "lmiddle1"],
  lRing1: ["lefthandring1", "leftring1", "lring1"],
  lPinky1: ["lefthandpinky1", "leftpinky1", "lpinky1"],
  rShoulder: ["rightshoulder", "rightclavicle", "rshoulder", "rclavicle"],
  rArm: ["rightarm", "rightupperarm", "rarm", "rupperarm"],
  rForeArm: ["rightforearm", "rightlowerarm", "rforearm", "rlowerarm"],
  rHand: ["righthand", "rightwrist", "rhand", "rwrist"],
  rThumb1: ["righthandthumb1", "rightthumb1", "rthumb1"],
  rIndex1: ["righthandindex1", "rightindex1", "rindex1"],
  rMiddle1: ["righthandmiddle1", "rightmiddle1", "rmiddle1"],
  rRing1: ["righthandring1", "rightring1", "rring1"],
  rPinky1: ["righthandpinky1", "rightpinky1", "rpinky1"],
  lUpLeg: ["leftupleg", "leftupperleg", "leftthigh", "lupleg", "lthigh"],
  lLeg: ["leftleg", "leftlowerleg", "leftshin", "lleg", "lshin"],
  lFoot: ["leftfoot", "leftankle", "lfoot", "lankle"],
  lToeBase: ["lefttoebase", "lefttoe", "ltoebase", "ltoe"],
  rUpLeg: ["rightupleg", "rightupperleg", "rightthigh", "rupleg", "rthigh"],
  rLeg: ["rightleg", "rightlowerleg", "rightshin", "rleg", "rshin"],
  rFoot: ["rightfoot", "rightankle", "rfoot", "rankle"],
  rToeBase: ["righttoebase", "righttoe", "rtoebase", "rtoe"],
};

const BONE_KEYS = Object.keys(BONE_ALIASES) as BoneKey[];
let B = Object.fromEntries(BONE_KEYS.map((key) => [key, null])) as Record<
  BoneKey,
  string | null
>;

const REST_POSE: Partial<Record<BoneKey, [number, number, number]>> = {
  hips: [-0.012, 0, 0],
  spine: [0.025, 0, 0],
  spine1: [0.028, 0, 0],
  spine2: [0.018, 0, 0],
  neck: [0.018, 0, 0],
  head: [-0.012, 0, 0],
  lShoulder: [-0.14, 0, 0.005],
  rShoulder: [-0.14, 0, -0.005],
  lArm: [-1.18, 0, 0.1],
  rArm: [-1.18, 0, -0.1],
  lForeArm: [-0.1, 0.04, 0.015],
  rForeArm: [-0.1, -0.04, -0.015],
  lHand: [0.06, 0, 0.02],
  rHand: [0.06, 0, -0.02],
  lThumb1: [0.04, -0.1, 0.06],
  rThumb1: [0.04, 0.1, -0.06],
  lIndex1: [0.06, 0, 0],
  lMiddle1: [0.07, 0, 0],
  lRing1: [0.08, 0, 0],
  lPinky1: [0.09, 0, 0],
  rIndex1: [0.06, 0, 0],
  rMiddle1: [0.07, 0, 0],
  rRing1: [0.08, 0, 0],
  rPinky1: [0.09, 0, 0],
  lUpLeg: [0.02, 0, -0.035],
  rUpLeg: [0.02, 0, 0.035],
  lLeg: [0.03, 0, 0],
  rLeg: [0.03, 0, 0],
};

const REST_POSITION: Partial<Record<BoneKey, [number, number, number]>> = {
  lShoulder: [0.012, -0.022, 0],
  rShoulder: [-0.012, -0.022, 0],
};

function resolveBoneMap(boneNames: string[]): Record<BoneKey, string | null> {
  const byNormalizedName = new Map<string, string>();
  for (const name of boneNames) {
    byNormalizedName.set(normalizeBoneName(name), name);
  }

  return Object.fromEntries(
    BONE_KEYS.map((key) => {
      const found =
        BONE_ALIASES[key]
          .map((alias) => byNormalizedName.get(alias))
          .find(Boolean) ?? null;
      return [key, found];
    }),
  ) as Record<BoneKey, string | null>;
}

const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px",
  "color:rgba(100,210,255,0.9);font:500 13px/1.4 'Courier New',monospace;letter-spacing:0.1em",
  "pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.innerHTML = [
  `<div id="load-status">Loading Meshy Post1 Character...</div>`,
  `<div style="width:220px;height:2px;background:rgba(100,210,255,0.15);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(100,210,255,0.75);border-radius:1px;transition:width 0.12s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;

let modelRoot: THREE.Group | null = null;
let camOrbit: { dist: number; targetY: number; center: THREE.Vector3 } | null =
  null;

function upgradeMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    const source = mesh.material;
    const materials = Array.isArray(source) ? source : [source];
    const upgraded = materials.map((material) => {
      const m = material as THREE.MeshStandardMaterial;
      if (!(m instanceof THREE.MeshStandardMaterial)) return material;

      const physical = new THREE.MeshPhysicalMaterial({
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
      return physical;
    });

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.material = Array.isArray(source) ? upgraded : upgraded[0];
  });
}

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    modelRoot = gltf.scene;
    scene.add(modelRoot);

    const boneNames: string[] = [];
    const seen = new Set<string>();
    const registerBone = (obj: THREE.Object3D) => {
      if (!obj.name || seen.has(obj.name)) return;
      seen.add(obj.name);
      rig.set(obj.name, {
        obj,
        bindQ: obj.quaternion.clone(),
        bindP: obj.position.clone(),
      });
      boneNames.push(obj.name);
    };

    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Bone) registerBone(obj);
      const skinned = obj as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) skinned.skeleton.bones.forEach(registerBone);
    });
    B = resolveBoneMap(boneNames);

    upgradeMaterials(gltf.scene);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const h = Math.max(size.y, 1);
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const span = Math.max(size.x, size.z) * 0.5;
    const dist = (h * 0.5 + span) / Math.tan(fovRad / 2);
    const targetY = box.min.y + h * 0.4;

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

    console.log("[meshy-post1-avatar] bones:", boneNames);
    console.log("[meshy-post1-avatar] resolved bones:", B);
    loadStatus.textContent = `${boneNames.length} joints loaded`;
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  (xhr) => {
    if (xhr.total > 0) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      loadStatus.textContent = `Loading... ${pct}%`;
      loadFill.style.width = `${pct}%`;
    }
  },
  (err) => {
    console.error("[meshy-post1-avatar]", err);
    loadStatus.textContent = "Failed to load model.";
  },
);

type GlancePhase = "idle" | "turning" | "holding" | "returning";

let glancePhase: GlancePhase = "idle";
let glanceCooldown = 1.5 + Math.random() * 2.5;
let glanceTargetY = 0;
let glanceHoldTimer = 0;
let headYSmooth = 0;
let prevMs = performance.now();
let elapsedSec = 0;

function animate(): void {
  requestAnimationFrame(animate);

  const nowMs = performance.now();
  const dt = Math.min((nowMs - prevMs) / 1000, 0.05);
  prevMs = nowMs;
  elapsedSec += dt;
  const t = elapsedSec;

  const breatheSin = Math.sin(t * 1.08);
  const breathe = (breatheSin + 1) * 0.5;
  const sway = Math.sin(t * 0.7) * 0.55 + Math.sin(t * 0.27 + 1.3) * 0.35;
  const microNod = Math.sin(t * 0.29) * 0.5 + Math.sin(t * 0.53 + 0.8) * 0.35;
  const microTilt =
    Math.sin(t * 0.23 + 1.1) * 0.5 + Math.sin(t * 0.18 + 2.5) * 0.3;
  const lArmSwing =
    Math.sin(t * 0.36 + 0.5) * 0.6 + Math.sin(t * 0.73 + 1.2) * 0.3;
  const rArmSwing =
    Math.sin(t * 0.39 + 1.9) * 0.6 + Math.sin(t * 0.68 + 0.3) * 0.3;
  const leftWeight = Math.max(0, -sway);
  const rightWeight = Math.max(0, sway);

  if (!USE_AUTHORED_MODEL_POSE) {
    poseAdd("hips", 0, 0, sway * 0.038);
    poseAdd("spine", breathe * 0.028, 0, sway * -0.012);
    poseAdd("spine1", breathe * 0.036, 0, sway * -0.008);
    poseAdd("spine2", breathe * 0.025, 0, sway * -0.006);
    poseAdd("lShoulder", breathe * 0.003, 0, breathe * 0.004 + sway * 0.004);
    poseAdd("rShoulder", breathe * 0.003, 0, -(breathe * 0.004 + sway * 0.004));
  }

  if (glancePhase === "idle") {
    glanceCooldown -= dt;
    headYSmooth += (0 - headYSmooth) * Math.min(1, dt * 1.2);
    if (glanceCooldown <= 0) {
      glancePhase = "turning";
      glanceTargetY =
        (Math.random() < 0.5 ? -1 : 1) * (0.012 + Math.random() * 0.008);
      glanceHoldTimer = 1.4 + Math.random() * 2.0;
    }
  } else if (glancePhase === "turning") {
    headYSmooth += (glanceTargetY - headYSmooth) * Math.min(1, dt * 6.0);
    if (Math.abs(headYSmooth - glanceTargetY) < 0.001) {
      headYSmooth = glanceTargetY;
      glancePhase = "holding";
    }
  } else if (glancePhase === "holding") {
    glanceTargetY += Math.sin(t * 1.8) * 0.0003;
    headYSmooth += (glanceTargetY - headYSmooth) * Math.min(1, dt * 1.8);
    glanceHoldTimer -= dt;
    if (glanceHoldTimer <= 0) glancePhase = "returning";
  } else {
    headYSmooth += (0 - headYSmooth) * Math.min(1, dt * 3.2);
    if (Math.abs(headYSmooth) < 0.0005) {
      headYSmooth = 0;
      glancePhase = "idle";
      glanceCooldown = 3.0 + Math.random() * 4.5;
    }
  }

  if (!USE_AUTHORED_MODEL_POSE) {
    poseAdd("neck", microNod * 0.003, headYSmooth * 0.4, microTilt * 0.001);
    poseAdd("head", microNod * 0.004, headYSmooth * 0.6, microTilt * 0.002);

    poseAdd(
      "lArm",
      -(lArmSwing * 0.035 + breathe * 0.012),
      lArmSwing * 0.018,
      -0.015,
    );
    poseAdd("lForeArm", -(Math.abs(lArmSwing) * 0.02), 0.04, -0.01);
    poseAdd("lHand", lArmSwing * 0.012, 0, lArmSwing * 0.008);
    poseAdd(
      "rArm",
      -(rArmSwing * 0.035 + breathe * 0.012),
      rArmSwing * -0.018,
      0.015,
    );
    poseAdd("rForeArm", -(Math.abs(rArmSwing) * 0.02), -0.04, 0.01);
    poseAdd("rHand", rArmSwing * 0.012, 0, rArmSwing * -0.008);
  }

  const typingFreq = 2.2;
  const tap = (phase: number) =>
    Math.max(0, Math.sin(t * typingFreq + phase)) * 0.08;

  if (!USE_AUTHORED_MODEL_POSE) {
    poseAdd("lIndex1", tap(0.0), 0, 0);
    poseAdd("lMiddle1", tap(2.1), 0, 0);
    poseAdd("lRing1", tap(4.2), 0, 0);
    poseAdd("lPinky1", tap(1.4), 0, 0);
    poseAdd("lThumb1", 0, 0, 0);
    poseAdd("rIndex1", tap(1.0), 0, 0);
    poseAdd("rMiddle1", tap(3.1), 0, 0);
    poseAdd("rRing1", tap(5.2), 0, 0);
    poseAdd("rPinky1", tap(2.4), 0, 0);
    poseAdd("rThumb1", 0, 0, 0);

    poseAdd("lUpLeg", lArmSwing * 0.008, 0, sway * -0.05);
    poseAdd("rUpLeg", rArmSwing * 0.008, 0, sway * 0.05);
    poseAdd("lLeg", leftWeight * 0.045 - rightWeight * 0.02, 0, 0);
    poseAdd("rLeg", rightWeight * 0.045 - leftWeight * 0.02, 0, 0);
    poseAdd("lFoot", leftWeight * -0.025, 0, 0);
    poseAdd("rFoot", rightWeight * -0.025, 0, 0);
    poseAdd("lToeBase", leftWeight * 0.012, 0, 0);
    poseAdd("rToeBase", rightWeight * 0.012, 0, 0);
  }

  if (modelRoot) {
    modelRoot.rotation.y = USE_AUTHORED_MODEL_POSE
      ? Math.sin(t * 0.38) * THREE.MathUtils.degToRad(45)
      : sway * 0.045;
  }

  if (camOrbit) {
    const { dist, targetY, center } = camOrbit;
    const az = THREE.MathUtils.degToRad(0.5) * Math.sin(t * 0.28);
    const el =
      THREE.MathUtils.degToRad(4) +
      THREE.MathUtils.degToRad(1.5) * Math.sin(t * 0.27 + 1.1);
    camera.position.set(
      center.x + dist * Math.sin(az) * Math.cos(el),
      targetY + dist * Math.sin(el),
      center.z + dist * Math.cos(az) * Math.cos(el),
    );
    camera.lookAt(center.x, targetY, center.z);
  } else {
    controls.update();
  }

  renderer.render(scene, camera);
}

animate();

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
