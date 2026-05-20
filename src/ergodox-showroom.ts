import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "/assets/main/ErgoDox_EZ_keyb.glb";

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
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.documentElement.style.cssText = "margin:0;background:transparent;";
document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;";
document.body.appendChild(renderer.domElement);

const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
  "color:rgba(255,255,255,0.7);font:500 13px/1 monospace;letter-spacing:0.12em;" +
  "pointer-events:none;transition:opacity 0.8s ease";
overlay.textContent = "Loading ErgoDox...";
document.body.appendChild(overlay);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.01,
  1000,
);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const showroomRoot = new THREE.Group();
scene.add(showroomRoot);

const modelPivot = new THREE.Group();
showroomRoot.add(modelPivot);

scene.add(new THREE.AmbientLight(0xeaf4ff, 1.1));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(4.5, 7.5, 5.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const softbox = new THREE.DirectionalLight(0x9fdcff, 1.55);
softbox.position.set(-6, 3, 4);
scene.add(softbox);

const warmRim = new THREE.DirectionalLight(0xffd8b4, 1.45);
warmRim.position.set(2, 3, -7);
scene.add(warmRim);

const underGlow = new THREE.PointLight(0x73d7ff, 1.2, 18);
underGlow.position.set(0, -1.8, 3);
scene.add(underGlow);

const loader = new GLTFLoader();
let mixer: THREE.AnimationMixer | null = null;
let modelRoot: THREE.Object3D | null = null;
let modelRadius = 1;
let cameraDistance = 8;
const cameraTarget = new THREE.Vector3();
const baseCameraDirection = new THREE.Vector3(-0.85, 0.74, 1.16).normalize();

function tuneMaterial(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;

  material.roughness = THREE.MathUtils.clamp(
    material.roughness * 0.82,
    0.28,
    0.72,
  );
  material.metalness = THREE.MathUtils.clamp(
    material.metalness + 0.03,
    0,
    0.45,
  );
  material.envMapIntensity = 0.95;
}

function orientFlattestAxisUp(model: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const axes = [
    { axis: "x", value: size.x },
    { axis: "y", value: size.y },
    { axis: "z", value: size.z },
  ].sort((a, b) => a.value - b.value);

  if (axes[0].axis === "x") {
    model.rotation.z = Math.PI / 2;
  } else if (axes[0].axis === "z") {
    model.rotation.x = -Math.PI / 2;
  }
}

function frameModel(model: THREE.Object3D): void {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  model.position.sub(center);
  model.updateWorldMatrix(true, true);

  const framedBox = new THREE.Box3().setFromObject(model);
  const framedSize = new THREE.Vector3();
  framedBox.getSize(framedSize);
  modelRadius = Math.max(framedSize.x, framedSize.y, framedSize.z) * 0.5;

  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  cameraDistance = (modelRadius * 1.85) / Math.tan(fovRad / 2);
  camera.near = Math.max(cameraDistance * 0.01, 0.01);
  camera.far = cameraDistance * 12;
  camera.updateProjectionMatrix();

  keyLight.position.set(
    modelRadius * 1.8,
    modelRadius * 2.4,
    modelRadius * 1.9,
  );
  softbox.position.set(
    -modelRadius * 2.3,
    modelRadius * 1.2,
    modelRadius * 1.5,
  );
  warmRim.position.set(
    modelRadius * 0.7,
    modelRadius * 1.1,
    -modelRadius * 2.6,
  );
  underGlow.position.set(0, -modelRadius * 0.42, modelRadius * 0.8);
  underGlow.distance = modelRadius * 6;
}

function updateCamera(elapsed: number): void {
  const breathe = 1 + Math.sin(elapsed * 0.38) * 0.025;
  const orbitNudge = Math.sin(elapsed * 0.24) * 0.13;
  const aspectCompensation =
    camera.aspect < 1 ? 1 / Math.max(camera.aspect, 0.45) : 1;
  const direction = baseCameraDirection
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitNudge)
    .normalize();

  camera.position.copy(
    direction.multiplyScalar(cameraDistance * aspectCompensation * breathe),
  );
  camera.position.y += Math.sin(elapsed * 0.31) * modelRadius * 0.05;
  camera.lookAt(cameraTarget);
}

loader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;
    modelRoot = model;
    modelPivot.add(model);

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach(tuneMaterial);
    });

    orientFlattestAxisUp(model);
    frameModel(model);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
      console.log(
        `[ergodox-showroom] playing ${gltf.animations.length} animation clip(s)`,
      );
    }

    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  (xhr) => {
    if (!xhr.total) return;
    overlay.textContent = `Loading ErgoDox... ${Math.round(
      (xhr.loaded / xhr.total) * 100,
    )}%`;
  },
  (err) => {
    console.error("[ergodox-showroom] load error:", err);
    overlay.textContent = "Failed to load ErgoDox model.";
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
    showroomRoot.rotation.y = elapsed * 0.2;
    showroomRoot.rotation.x = Math.sin(elapsed * 0.46) * 0.035;
    showroomRoot.rotation.z = Math.sin(elapsed * 0.33) * 0.025;
    modelPivot.position.y = Math.sin(elapsed * 0.72) * modelRadius * 0.035;
  }

  updateCamera(elapsed);
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
