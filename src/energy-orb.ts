import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = `${import.meta.env.BASE_URL}assets/main/energy_orb.glb`;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  premultipliedAlpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

document.documentElement.style.cssText = "margin:0;background:transparent;";
document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;cursor:grab;";
document.body.appendChild(renderer.domElement);

const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
  "color:rgba(134,240,255,0.78);font:600 13px/1 monospace;letter-spacing:0.12em;" +
  "pointer-events:none;transition:opacity 0.8s ease";
overlay.textContent = "Loading Energy Orb...";
document.body.appendChild(overlay);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.01,
  1000,
);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.38;
controls.rotateSpeed = 0.45;
controls.zoomSpeed = 0.75;

const stage = new THREE.Group();
const modelPivot = new THREE.Group();
const auraPivot = new THREE.Group();
stage.add(auraPivot, modelPivot);
scene.add(stage);

scene.add(new THREE.AmbientLight(0xb9f8ff, 1.1));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4.8, 6.2, 5.6);
scene.add(keyLight);

const cyanRim = new THREE.DirectionalLight(0x69f3ff, 2.2);
cyanRim.position.set(-5.4, 2.4, -4.2);
scene.add(cyanRim);

const violetRim = new THREE.DirectionalLight(0xb992ff, 1.4);
violetRim.position.set(2.8, -1.4, -5.2);
scene.add(violetRim);

const coreLight = new THREE.PointLight(0x64eaff, 3.6, 14);
scene.add(coreLight);

let mixer: THREE.AnimationMixer | null = null;
let modelRoot: THREE.Object3D | null = null;
let modelRadius = 1;
let cameraDistance = 7;
const cameraTarget = new THREE.Vector3();
const baseCameraDirection = new THREE.Vector3(0.28, 0.2, 1).normalize();

const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0x79f7ff,
  transparent: true,
  opacity: 0.38,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const rings = [
  new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.006, 8, 160), ringMaterial),
  new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.004, 8, 160), ringMaterial),
  new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.0035, 8, 160), ringMaterial),
];
rings[0].rotation.x = THREE.MathUtils.degToRad(64);
rings[1].rotation.y = THREE.MathUtils.degToRad(68);
rings[2].rotation.set(
  THREE.MathUtils.degToRad(42),
  THREE.MathUtils.degToRad(18),
  THREE.MathUtils.degToRad(28),
);
rings.forEach((ring) => auraPivot.add(ring));

const particleCount = 180;
const particlePositions = new Float32Array(particleCount * 3);
const particleData = new Float32Array(particleCount * 4);
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(particlePositions, 3),
);
const particleMaterial = new THREE.PointsMaterial({
  color: 0xaafaff,
  size: 0.025,
  transparent: true,
  opacity: 0.66,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const particles = new THREE.Points(particleGeometry, particleMaterial);
auraPivot.add(particles);

function resetParticle(index: number): void {
  particleData[index * 4] = Math.random() * Math.PI * 2;
  particleData[index * 4 + 1] = Math.acos(THREE.MathUtils.randFloatSpread(2));
  particleData[index * 4 + 2] = THREE.MathUtils.randFloat(1.06, 1.92);
  particleData[index * 4 + 3] = THREE.MathUtils.randFloat(0.08, 0.28);
}

for (let i = 0; i < particleCount; i++) resetParticle(i);

function tuneMaterial(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;

  material.transparent = material.transparent || material.opacity < 1;
  material.roughness = THREE.MathUtils.clamp(
    material.roughness * 0.72,
    0.12,
    0.58,
  );
  material.metalness = THREE.MathUtils.clamp(
    material.metalness + 0.08,
    0,
    0.55,
  );
  material.envMapIntensity = 1.45;

  const baseColor = material.color.clone();
  material.emissive.copy(baseColor).lerp(new THREE.Color(0x67f2ff), 0.55);
  material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.65);
}

function frameModel(model: THREE.Object3D): void {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);

  model.position.sub(center);
  model.updateWorldMatrix(true, true);

  const framedBox = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  framedBox.getSize(size);
  modelRadius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  cameraDistance = (modelRadius * 2.25) / Math.tan(fovRad / 2);
  camera.near = Math.max(cameraDistance * 0.006, 0.01);
  camera.far = cameraDistance * 12;
  camera.updateProjectionMatrix();

  const auraScale = modelRadius * 1.16;
  auraPivot.scale.setScalar(auraScale);
  coreLight.distance = modelRadius * 8;
  controls.target.copy(cameraTarget);
  controls.minDistance = cameraDistance * 0.42;
  controls.maxDistance = cameraDistance * 2.6;
}

function updateCamera(elapsed: number): void {
  const aspectCompensation =
    camera.aspect < 1 ? 1 / Math.max(camera.aspect, 0.48) : 1;
  const orbitNudge = Math.sin(elapsed * 0.22) * 0.16;
  const breathe = 1 + Math.sin(elapsed * 0.5) * 0.035;
  const direction = baseCameraDirection
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitNudge)
    .normalize();

  camera.position.copy(
    direction.multiplyScalar(cameraDistance * aspectCompensation * breathe),
  );
  camera.position.y += Math.sin(elapsed * 0.37) * modelRadius * 0.08;
  camera.lookAt(cameraTarget);
}

const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  (gltf) => {
    modelRoot = gltf.scene;
    modelPivot.add(modelRoot);

    modelRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach(tuneMaterial);
    });

    frameModel(modelRoot);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(modelRoot);
      gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
    }

    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  (xhr) => {
    if (!xhr.total) return;
    overlay.textContent = `Loading Energy Orb... ${Math.round(
      (xhr.loaded / xhr.total) * 100,
    )}%`;
  },
  (err) => {
    console.error("[energy-orb] load error:", err);
    overlay.textContent = "Failed to load Energy Orb.";
  },
);

let prevTime = performance.now();
let elapsed = 0;

function animate(): void {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  elapsed += dt;

  mixer?.update(dt);

  if (modelRoot) {
    modelPivot.rotation.y += dt * 0.22;
    modelPivot.rotation.x = Math.sin(elapsed * 0.42) * 0.045;
    modelPivot.position.y = Math.sin(elapsed * 0.7) * modelRadius * 0.035;
  }

  const pulse =
    1 + Math.sin(elapsed * 0.9) * 0.025 + Math.sin(elapsed * 2.7) * 0.01;
  auraPivot.scale.setScalar(modelRadius * 1.16 * pulse);
  auraPivot.rotation.y -= dt * 0.12;
  rings[0].rotation.z += dt * 0.18;
  rings[1].rotation.x += dt * 0.13;
  rings[2].rotation.y -= dt * 0.11;
  ringMaterial.opacity = 0.3 + Math.sin(elapsed * 1.6) * 0.08;

  for (let i = 0; i < particleCount; i++) {
    const offset = i * 4;
    particleData[offset] += dt * particleData[offset + 3];
    particleData[offset + 2] += dt * 0.025;
    if (particleData[offset + 2] > 2.08) particleData[offset + 2] = 1.06;

    const theta = particleData[offset];
    const phi = particleData[offset + 1];
    const radius = particleData[offset + 2] * modelRadius;
    const pos = i * 3;
    particlePositions[pos] = Math.sin(phi) * Math.cos(theta) * radius;
    particlePositions[pos + 1] = Math.cos(phi) * radius;
    particlePositions[pos + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }
  particleGeometry.attributes.position.needsUpdate = true;
  particleMaterial.size = Math.max(modelRadius * 0.018, 0.012);

  coreLight.intensity =
    3.4 + Math.sin(elapsed * 1.4) * 0.65 + Math.sin(elapsed * 5.1) * 0.2;

  updateCamera(elapsed);
  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
