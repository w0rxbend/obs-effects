import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;";
document.body.appendChild(renderer.domElement);

const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
  "color:rgba(255,255,255,0.72);font:500 13px/1 monospace;letter-spacing:0.12em;" +
  "pointer-events:none;transition:opacity 0.8s ease";
overlay.textContent = "Loading Drone...";
document.body.appendChild(overlay);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.01,
  500,
);

scene.add(new THREE.AmbientLight(0xe9f6ff, 1.35));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(4, 6, 8);
keyLight.castShadow = true;
scene.add(keyLight);

const coolFill = new THREE.DirectionalLight(0x9fd7ff, 1.4);
coolFill.position.set(-7, 3, 2);
scene.add(coolFill);

const warmRim = new THREE.DirectionalLight(0xffe5c8, 1.1);
warmRim.position.set(1, 2, -6);
scene.add(warmRim);

const undersideGlow = new THREE.PointLight(0x6fdcff, 1.8, 12);
undersideGlow.position.set(0, -2.5, 2.5);
scene.add(undersideGlow);

const loader = new GLTFLoader();
let mixer: THREE.AnimationMixer | null = null;
let droneRoot: THREE.Group | null = null;
let modelHeight = 1;
const modelCenter = new THREE.Vector3();
const rotors: THREE.Object3D[] = [];

function tuneMaterial(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  material.roughness = Math.max(0.28, material.roughness * 0.75);
  material.metalness = Math.max(material.metalness, 0.18);
  material.envMapIntensity = 0.9;
}

function isRotorCandidate(object: THREE.Object3D): boolean {
  const name = object.name.toLowerCase();
  return (
    name.includes("prop") ||
    name.includes("rotor") ||
    name.includes("blade") ||
    name.includes("fan")
  );
}

function collectRotorCandidates(model: THREE.Group): void {
  model.traverse((obj) => {
    if (isRotorCandidate(obj)) rotors.push(obj);
  });
}

function frameModel(model: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(modelCenter);
  modelHeight = Math.max(size.y, 0.001);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const dist = ((maxDim / 2) * 2.15) / Math.tan(fovRad / 2);

  camera.position.set(
    modelCenter.x + size.x * 0.1,
    modelCenter.y + size.y * 0.2,
    modelCenter.z + dist,
  );
  camera.lookAt(modelCenter.x, modelCenter.y, modelCenter.z);
  camera.near = dist * 0.01;
  camera.far = dist * 12;
  camera.updateProjectionMatrix();
}

loader.load(
  "/assets/main/drone.glb",
  (gltf) => {
    const model = gltf.scene;
    droneRoot = model;
    scene.add(model);

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

    collectRotorCandidates(model);
    frameModel(model);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        mixer!.clipAction(clip).play();
      });
      console.log(
        `[drone] playing ${gltf.animations.length} animation clip(s)`,
      );
    }

    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  (xhr) => {
    if (!xhr.total) return;
    overlay.textContent = `Loading Drone... ${Math.round(
      (xhr.loaded / xhr.total) * 100,
    )}%`;
  },
  (err) => {
    console.error("[drone] load error:", err);
    overlay.textContent = "Failed to load drone model.";
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

  if (droneRoot) {
    droneRoot.position.y =
      modelCenter.y +
      Math.sin(elapsed * 1.35) * modelHeight * 0.035 +
      Math.sin(elapsed * 2.4) * modelHeight * 0.012;
    droneRoot.position.x =
      modelCenter.x + Math.sin(elapsed * 0.42) * modelHeight * 0.025;
    droneRoot.rotation.y =
      Math.sin(elapsed * 0.34) * 0.18 + Math.sin(elapsed * 0.9) * 0.035;
    droneRoot.rotation.x = Math.sin(elapsed * 0.75) * 0.045;
    droneRoot.rotation.z = Math.sin(elapsed * 0.58) * 0.055;

    rotors.forEach((rotor, index) => {
      rotor.rotation.y += dt * (index % 2 === 0 ? 36 : -36);
    });
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
