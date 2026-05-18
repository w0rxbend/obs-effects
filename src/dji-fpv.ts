import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL =
  "/assets/main/dji-fpv/source/e4e0a592c53ea71bfc3cd948397e31a1.glb";

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;cursor:grab;";
document.body.appendChild(renderer.domElement);

const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px",
  "color:rgba(130,220,255,0.88);font:500 13px/1.4 'Courier New',monospace",
  "letter-spacing:0.1em;pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.innerHTML = [
  `<div id="load-status">Loading DJI FPV...</div>`,
  `<div style="width:220px;height:2px;background:rgba(130,220,255,0.14);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(130,220,255,0.75);border-radius:1px;transition:width 0.1s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.001,
  500,
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minPolarAngle = THREE.MathUtils.degToRad(10);
controls.maxPolarAngle = THREE.MathUtils.degToRad(130);
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.8;

// Lighting — cool tech palette
scene.add(new THREE.AmbientLight(0xd0eeff, 0.85));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(4, 7, 6);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x7fc8ff, 1.6);
fillLight.position.set(-6, 3, 3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffd580, 1.2);
rimLight.position.set(2, 1, -7);
scene.add(rimLight);

const underGlow = new THREE.PointLight(0x40c0ff, 2.2, 20);
underGlow.position.set(0, -3, 2);
scene.add(underGlow);

const modelCenter = new THREE.Vector3();
const modelSize = new THREE.Vector3();
let droneRoot: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
const rotors: THREE.Object3D[] = [];
let cameraPivot: THREE.Object3D | null = null;
let cameraBindQ: THREE.Quaternion | null = null;

// --- Audio ---
let audioAnalyser: AnalyserNode | null = null;
let audioFreqData: Uint8Array<ArrayBuffer> | null = null;
let audioNoiseFloor = 0.02;
let rotorSpeed = 4; // rad/s — driven by audio level

async function initAudio(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    audioAnalyser = ctx.createAnalyser();
    audioAnalyser.fftSize = 512;
    audioAnalyser.smoothingTimeConstant = 0.75;
    source.connect(audioAnalyser);
    audioFreqData = new Uint8Array(
      audioAnalyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    if (ctx.state === "suspended") {
      window.addEventListener("pointerdown", () => ctx.resume(), {
        once: true,
      });
    }
  } catch {
    console.warn("[dji-fpv] mic unavailable, using idle rotor speed");
  }
}

function updateRotorSpeed(dt: number): void {
  const IDLE = 4;
  const MAX = 55;

  if (!audioAnalyser || !audioFreqData) {
    rotorSpeed += (IDLE - rotorSpeed) * Math.min(1, dt * 3);
    return;
  }

  audioAnalyser.getByteFrequencyData(audioFreqData);

  const len = audioFreqData.length;
  let sum = 0;
  for (let i = 0; i < Math.floor(len * 0.6); i++) sum += audioFreqData[i] / 255;
  const rawLevel = sum / Math.floor(len * 0.6);

  if (rawLevel < audioNoiseFloor * 1.6) {
    audioNoiseFloor += (rawLevel - audioNoiseFloor) * Math.min(1, dt * 0.5);
  } else {
    audioNoiseFloor += (0.02 - audioNoiseFloor) * Math.min(1, dt * 0.05);
  }

  const gated = Math.max(0, rawLevel - audioNoiseFloor * 1.4);
  const level = THREE.MathUtils.clamp(gated * 14.0, 0, 1);
  const target = IDLE + level * (MAX - IDLE);

  // Attack fast, decay slow — like real motor throttle response
  const rate = target > rotorSpeed ? 12 : 3;
  rotorSpeed += (target - rotorSpeed) * Math.min(1, dt * rate);
}

function tuneMaterial(mat: THREE.Material): void {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  mat.roughness = Math.min(mat.roughness, 0.55);
  mat.metalness = Math.max(mat.metalness, 0.22);
  mat.envMapIntensity = 1.1;
}

function frameModel(model: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(model);
  box.getCenter(modelCenter);
  box.getSize(modelSize);

  const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const dist = ((maxDim / 2) * 1.55) / Math.tan(fovRad / 2);

  camera.position.set(
    modelCenter.x + dist * 0.35,
    modelCenter.y + modelSize.y * 1.4,
    modelCenter.z + dist * 0.85,
  );
  camera.lookAt(modelCenter.x, modelCenter.y, modelCenter.z);
  camera.near = dist * 0.005;
  camera.far = dist * 15;
  camera.updateProjectionMatrix();

  controls.target.copy(modelCenter);
  controls.minDistance = dist * 0.35;
  controls.maxDistance = dist * 3.5;
  controls.update();
}

const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;

const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;
    droneRoot = model;

    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(tuneMaterial);
    });

    // jiangye (桨叶) = propeller blades group; its direct children are the per-rotor pivot nodes
    const propGroup = model.getObjectByName("jiangye");
    if (propGroup) {
      propGroup.children.forEach((pivot) => rotors.push(pivot));
    }

    // glass (node with children) = camera pivot — tilt and pan it independently
    model.traverse((obj) => {
      if (cameraPivot) return;
      if (obj.name === "glass" && obj.children.length > 0) {
        cameraPivot = obj;
        cameraBindQ = obj.quaternion.clone();
      }
    });

    scene.add(model);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
    }

    frameModel(model);

    loadStatus.textContent = `DJI FPV loaded`;
    loadFill.style.width = "100%";
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  (xhr) => {
    if (!xhr.total) return;
    const pct = Math.round((xhr.loaded / xhr.total) * 100);
    loadStatus.textContent = `Loading DJI FPV... ${pct}%`;
    loadFill.style.width = `${pct}%`;
  },
  (err) => {
    console.error("[dji-fpv] load error:", err);
    loadStatus.textContent = "Failed to load model";
  },
);

const _camEuler = new THREE.Euler();
const _camQuat = new THREE.Quaternion();

// Gimbal periodic movement — picks a new target every 2.5–5 s and lerps toward it
let camTiltCurrent = 20;
let camPanCurrent = 0;
let camTiltTarget = 20;
let camPanTarget = 0;
let camNextChange = 0;

function pickNextGimbalTarget(now: number): void {
  camTiltTarget = 5 + Math.random() * 48; // 5°–53° forward tilt
  camPanTarget = (Math.random() - 0.5) * 36; // ±18° pan
  camNextChange = now + 2.5 + Math.random() * 2.5;
}

void initAudio();

let prevTime = performance.now();
let elapsed = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  elapsed += dt;

  mixer?.update(dt);

  if (droneRoot) {
    // Gentle hover and drift
    droneRoot.position.set(
      modelCenter.x + Math.sin(elapsed * 0.38) * modelSize.x * 0.018,
      modelCenter.y +
        Math.sin(elapsed * 1.2) * modelSize.y * 0.04 +
        Math.sin(elapsed * 2.1) * modelSize.y * 0.012,
      modelCenter.z,
    );
    droneRoot.rotation.y =
      Math.sin(elapsed * 0.3) * 0.14 + Math.sin(elapsed * 0.8) * 0.04;
    droneRoot.rotation.x = Math.sin(elapsed * 0.65) * 0.04;
    droneRoot.rotation.z = Math.sin(elapsed * 0.52) * 0.05;

    // Spin rotors — speed driven by audio level
    updateRotorSpeed(dt);
    rotors.forEach((rotor, i) => {
      rotor.rotation.y += dt * (i % 2 === 0 ? rotorSpeed : -rotorSpeed);
    });
  }

  // Gimbal — pick new target periodically, smooth lerp toward it
  if (elapsed > camNextChange) pickNextGimbalTarget(elapsed);
  const lerpSpeed = 1.8;
  camTiltCurrent +=
    (camTiltTarget - camTiltCurrent) * Math.min(1, dt * lerpSpeed);
  camPanCurrent += (camPanTarget - camPanCurrent) * Math.min(1, dt * lerpSpeed);

  if (cameraPivot && cameraBindQ) {
    _camEuler.set(
      THREE.MathUtils.degToRad(camTiltCurrent),
      THREE.MathUtils.degToRad(camPanCurrent),
      0,
      "XYZ",
    );
    _camQuat.setFromEuler(_camEuler);
    cameraPivot.quaternion.copy(cameraBindQ).multiply(_camQuat);
  }

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
