import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { obsAudio } from "./lib";

const MODEL_URL = "/assets/main/zombie/source/Zombie/Zombie1.FBX";
const WALK_ANIM_URL =
  "/assets/main/zombie/source/Zombie/animations/Zombie@Z_Walk_InPlace.FBX";
const TEXTURE_ROOT = "/assets/main/zombie/textures/";

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;cursor:grab;";
document.body.appendChild(renderer.domElement);

const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px",
  "color:rgba(190,255,210,0.88);font:500 13px/1.4 'Courier New',monospace",
  "letter-spacing:0.1em;pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.innerHTML = [
  `<div id="load-status">Loading zombie...</div>`,
  `<div style="width:220px;height:2px;background:rgba(190,255,210,0.14);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(190,255,210,0.75);border-radius:1px;transition:width 0.1s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.01,
  3000,
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minPolarAngle = THREE.MathUtils.degToRad(12);
controls.maxPolarAngle = THREE.MathUtils.degToRad(125);
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.75;

scene.add(new THREE.AmbientLight(0xcfe2d8, 0.62));

const keyLight = new THREE.DirectionalLight(0xe9ffe6, 2.25);
keyLight.position.set(3.8, 5.5, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8fd9ff, 0.95);
fillLight.position.set(-4.4, 2.2, 2.8);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xb6ffca, 1.8);
rimLight.position.set(0, 2.8, -5.5);
scene.add(rimLight);

// Front face fill — soft white from far ahead
const frontLight = new THREE.DirectionalLight(0xfff8f0, 1.4);
frontLight.position.set(0, 1, 80);
scene.add(frontLight);

const modelCenter = new THREE.Vector3();
const bindPosition = new THREE.Vector3();
const bindScale = new THREE.Vector3(1, 1, 1);

let mixer: THREE.AnimationMixer | null = null;
let modelRoot: THREE.Group | null = null;
let skeletonHelper: THREE.SkeletonHelper | null = null;
const jawBones: Array<{ bone: THREE.Object3D; bindQ: THREE.Quaternion }> = [];

// Finger bones for typing animation — {bone, bindQ, phaseOffset}
interface FingerEntry {
  bone: THREE.Object3D;
  bindQ: THREE.Quaternion;
  phase: number;
}
const fingerBones: FingerEntry[] = [];
let modelHeight = 1;

// --- Audio ---
let syllablePhase = 0; // oscillator phase for chatter
let jawAngle = 0; // final jaw rotation in radians

function updateAudio(dt: number): void {
  obsAudio.update(dt);
  const level = obsAudio.level;

  // Syllable oscillator — advances only while speaking
  if (level > 0.02) {
    const rate = 3.5 + level * 2.0;
    syllablePhase = (syllablePhase + dt * rate) % 1;
  } else {
    syllablePhase = 0;
  }

  // Jaw: smooth open driven by syllable pulse on top of envelope
  const syllablePulse = Math.max(0, Math.sin(syllablePhase * Math.PI * 2));
  const targetAngle =
    level > 0.02 ? level * (0.4 + syllablePulse * 0.6) * 0.18 : 0;
  jawAngle += (targetAngle - jawAngle) * Math.min(1, dt * 14);
}

// --- Textures & materials ---
const textureLoader = new THREE.TextureLoader();

function loadTexture(path: string, color = false): THREE.Texture {
  const texture = textureLoader.load(path, undefined, undefined, (err) =>
    console.warn(`[zombie-fbx] failed to load texture ${path}`, err),
  );
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const textures = {
  color: loadTexture(`${TEXTURE_ROOT}Zombie.png`, true),
  ao: loadTexture(`${TEXTURE_ROOT}Zombie_ao.png`),
  normal: loadTexture(`${TEXTURE_ROOT}Zombie_nm.png`),
  emission: loadTexture(`${TEXTURE_ROOT}zombie_emission.png`, true),
};

function ensureAoUv(mesh: THREE.Mesh): void {
  const uv = mesh.geometry.attributes.uv;
  if (!uv || mesh.geometry.attributes.uv2) return;
  mesh.geometry.setAttribute("uv2", uv);
}

function applyZombieMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    ensureAoUv(obj);

    const material = new THREE.MeshStandardMaterial({
      name: "Zombie",
      map: textures.color,
      normalMap: textures.normal,
      aoMap: textures.ao,
      emissiveMap: textures.emission,
      emissive: new THREE.Color(0x284221),
      emissiveIntensity: 0.2,
      roughness: 0.45,
      metalness: 0.08,
      side: THREE.FrontSide,
    });
    material.normalScale.set(0.62, 0.62);
    material.color.setHex(0xdfe3d5);
    obj.material = material;
  });
}

function frameModel(model: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(modelCenter);
  modelHeight = Math.max(size.y, 1);

  const targetY = box.min.y + modelHeight * 0.7;
  const maxDim = Math.max(size.x, size.y, size.z);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const dist = ((maxDim / 2) * 1.0) / Math.tan(fovRad / 2);

  camera.position.set(
    modelCenter.x + size.x * 0.14,
    targetY + modelHeight * 0.04,
    modelCenter.z + dist,
  );
  camera.lookAt(modelCenter.x, targetY, modelCenter.z);
  camera.near = Math.max(dist * 0.005, 0.01);
  camera.far = dist * 8;
  camera.updateProjectionMatrix();

  controls.target.set(modelCenter.x, targetY, modelCenter.z);
  controls.minDistance = dist * 0.45;
  controls.maxDistance = dist * 2.7;
  controls.update();
}

function loadFbx(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.setResourcePath(TEXTURE_ROOT);
    loader.load(url, resolve, undefined, reject);
  });
}

const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;
let prevTime = performance.now();
let elapsedTime = 0;

void obsAudio.connect();

loadFbx(MODEL_URL)
  .then(async (fbx) => {
    modelRoot = fbx;

    const originalBox = new THREE.Box3().setFromObject(fbx);
    const originalCenter = new THREE.Vector3();
    originalBox.getCenter(originalCenter);
    fbx.position.sub(originalCenter);
    fbx.rotation.y = 0;
    bindPosition.copy(fbx.position);
    bindScale.copy(fbx.scale);

    // Finger phase offsets per digit index (0=thumb … 4=pinky), staggered for typing feel
    const digitPhases = [0.0, 0.62, 1.25, 1.88, 2.51];

    fbx.traverse((obj) => {
      if (!(obj instanceof THREE.Bone)) return;
      const n = obj.name;

      if (/jaw/i.test(n)) {
        jawBones.push({ bone: obj, bindQ: obj.quaternion.clone() });
      }

      // Collect base joints of each finger (e.g. RArmDigit11, LArmDigit21 …)
      const fingerMatch = n.match(/[LR]ArmDigit([1-5])1$/);
      if (fingerMatch) {
        const digit = parseInt(fingerMatch[1]) - 1;
        fingerBones.push({
          bone: obj,
          bindQ: obj.quaternion.clone(),
          phase: digitPhases[digit],
        });
      }
    });

    applyZombieMaterials(fbx);
    scene.add(fbx);

    skeletonHelper = new THREE.SkeletonHelper(fbx);
    const helperMaterial = skeletonHelper.material;
    if (helperMaterial instanceof THREE.Material) {
      helperMaterial.transparent = true;
      helperMaterial.opacity = 0.1;
      helperMaterial.depthWrite = false;
      if (
        "color" in helperMaterial &&
        helperMaterial.color instanceof THREE.Color
      ) {
        helperMaterial.color.setHex(0x91ffb2);
      }
    }
    scene.add(skeletonHelper);

    mixer = new THREE.AnimationMixer(fbx);

    loadStatus.textContent = "Loading walk animation...";
    loadFill.style.width = "60%";

    const animFbx = await loadFbx(WALK_ANIM_URL);
    if (animFbx.animations.length > 0) {
      const clip = animFbx.animations[0];
      // Strip jaw tracks so we can drive the jaw manually via audio
      clip.tracks = clip.tracks.filter((track) => !/jaw/i.test(track.name));
      const action = mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.play();
    }

    frameModel(fbx);

    loadStatus.textContent = "Zombie loaded";
    loadFill.style.width = "100%";
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 950);
  })
  .catch((err) => {
    console.error("[zombie-fbx] load error:", err);
    loadStatus.textContent = "Failed to load zombie FBX";
  });

const _tmpEuler = new THREE.Euler();
const _tmpQuat = new THREE.Quaternion();

function animateRig(t: number, dt: number): void {
  if (mixer) mixer.update(dt);

  updateAudio(dt);

  // Jaw — drive all instances (model has two skeletons sharing the same bone name)
  for (const { bone, bindQ } of jawBones) {
    _tmpEuler.set(0, 0, -jawAngle, "XYZ");
    _tmpQuat.setFromEuler(_tmpEuler);
    bone.quaternion.copy(bindQ).multiply(_tmpQuat);
  }

  // Finger typing — staggered curl/uncurl at ~7 Hz
  const typingRate = 7.0;
  for (const { bone, bindQ, phase } of fingerBones) {
    const curl =
      Math.pow(Math.max(0, Math.sin(t * typingRate + phase)), 3) * 0.55;
    _tmpEuler.set(curl, 0, 0, "XYZ");
    _tmpQuat.setFromEuler(_tmpEuler);
    bone.quaternion.copy(bindQ).multiply(_tmpQuat);
  }

  const breathe = Math.sin(t * 1.1);
  const sway = Math.sin(t * 0.52);

  if (modelRoot) {
    modelRoot.position.set(
      bindPosition.x + Math.sin(t * 0.28) * modelHeight * 0.01,
      bindPosition.y + breathe * modelHeight * 0.006,
      bindPosition.z,
    );
    modelRoot.rotation.y = sway * 0.06;
    modelRoot.scale.copy(bindScale);
  }
}

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  elapsedTime += dt;
  const t = elapsedTime;

  animateRig(t, dt);

  if (skeletonHelper) skeletonHelper.updateMatrixWorld(true);

  controls.update();
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
