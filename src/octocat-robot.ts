import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.cssText = "margin:0;overflow:hidden;";
document.body.appendChild(renderer.domElement);

// ── Loading overlay ───────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
  "color:rgba(255,255,255,0.7);font:500 13px/1 monospace;letter-spacing:0.12em;" +
  "pointer-events:none;transition:opacity 0.8s ease";
overlay.textContent = "Loading Octocat…";
document.body.appendChild(overlay);

// ── Scene / Camera ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.01,
  500,
);

// ── Lighting ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 1.2));

const keyLight = new THREE.DirectionalLight(0xfff8f0, 2.4);
keyLight.position.set(4, 8, 6);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd0e4ff, 1.0);
fillLight.position.set(-5, 3, 2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
rimLight.position.set(0, -3, -6);
scene.add(rimLight);

const topLight = new THREE.DirectionalLight(0xfff0e8, 0.6);
topLight.position.set(0, 10, 2);
scene.add(topLight);

// ── State ─────────────────────────────────────────────────────────────────────
let mixer: THREE.AnimationMixer | null = null;
let modelRoot: THREE.Group | null = null;
const modelCenter = new THREE.Vector3();
let modelHeight = 1;

let eyeNode: THREE.Object3D | null = null;
const pupils: THREE.Mesh[] = [];
let blinkTimer = 3.0 + Math.random() * 2;
let blinkT = -1;

// Gaze state – pupils smoothly pick random focus points
const gazeTarget = new THREE.Vector2(0, 0);
const gazeCurrent = new THREE.Vector2(0, 0);
let gazeHoldTimer = 1.0;
let gazeRangeX = 0;
let gazeRangeY = 0;

// ── Load GLB ──────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();

loader.load(
  "/assets/main/octocat.glb",
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    modelRoot = model;

    // Material → color from GLB binary analysis (material names are stable across loaders)
    const MAT_COLORS: Record<
      string,
      { color: number; roughness: number; metalness: number }
    > = {
      octocat19lambert2SG: { color: 0xf7c8d0, roughness: 0.55, metalness: 0 },
      octocat19lambert3SG: { color: 0x000000, roughness: 0.5, metalness: 0 },
      octocat19lambert4SG: { color: 0xffffff, roughness: 0.5, metalness: 0 },
      octocat19lambert5SG: { color: 0x2b161a, roughness: 0.1, metalness: 0 },
      octocat19lambert6SG: { color: 0xffffff, roughness: 0.1, metalness: 0 },
      octocat19rampShader1SG: {
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0,
      },
    };

    // Node name → color override for eye components (bounding-box confirmed tiny meshes)
    // Object_4 = pupil, Object_5 = sclera
    const NODE_COLORS: Record<
      string,
      { color: number; roughness: number; metalness: number }
    > = {
      Object_4: { color: 0x2b161a, roughness: 0.1, metalness: 0 },
      Object_5: { color: 0xffffff, roughness: 0.1, metalness: 0 },
    };

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => {
        const mat = m as THREE.MeshStandardMaterial;
        if (!("color" in mat)) return;
        const byNode = NODE_COLORS[obj.name];
        const byMat = MAT_COLORS[mat.name];
        const spec = byNode ?? byMat;
        if (!spec) return;
        mat.color.setHex(spec.color);
        mat.roughness = spec.roughness;
        mat.metalness = spec.metalness;
      });
    });

    // Find eye node
    model.traverse((obj) => {
      if (obj.name === "Object_9") eyeNode = obj;
    });

    if (eyeNode) {
      // Force world matrices so Box3 measures are accurate at load time
      model.updateWorldMatrix(true, true);
      const eyeBox = new THREE.Box3().setFromObject(eyeNode);
      const spanX = eyeBox.max.x - eyeBox.min.x;
      const spanY = eyeBox.max.y - eyeBox.min.y;
      const r = spanX * 0.07;
      gazeRangeX = r * 0.8;
      gazeRangeY = r * 0.4;
      const geo = new THREE.SphereGeometry(r, 12, 12);
      const pMat = new THREE.MeshStandardMaterial({
        color: 0x120508,
        roughness: 0.1,
        metalness: 0,
      });
      // Parent to model root (avoids eyeNode rotation issues with worldToLocal).
      // Y at 65% of the eye mesh height — eye centres sit above the bbox midpoint.
      // Z at front face of the eye mesh.
      [0.15, 0.85].forEach((fx) => {
        const pupil = new THREE.Mesh(geo, pMat);
        pupil.position.set(
          eyeBox.min.x + spanX * fx,
          eyeBox.min.y + spanY * 0.52,
          eyeBox.max.z,
        );
        pupil.userData.base = pupil.position.clone();
        model.add(pupil);
        pupils.push(pupil);
      });
    }

    // Auto-frame camera from bounding box
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(modelCenter);
    modelHeight = size.y;

    // Top point light positioned just above the model's head
    const topPointLight = new THREE.PointLight(0xfff5e0, 3.5, size.y * 3.5);
    topPointLight.position.set(
      modelCenter.x,
      box.max.y + size.y * 0.25,
      modelCenter.z,
    );
    scene.add(topPointLight);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const dist = ((maxDim / 2) * 1.85) / Math.tan(fovRad / 2);

    // Fixed perspective: slightly elevated front view matching the screenshot
    camera.position.set(
      modelCenter.x,
      modelCenter.y + size.y * 0.18,
      modelCenter.z + dist * 1.05,
    );
    camera.lookAt(modelCenter.x, modelCenter.y - size.y * 0.05, modelCenter.z);
    camera.near = dist * 0.01;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();

    // Play all built-in animation clips if present
    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        mixer!.clipAction(clip).play();
      });
      console.log(
        `[octocat] playing ${gltf.animations.length} animation clip(s)`,
      );
    }

    // Fade out loading overlay
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  undefined,
  (err) => {
    console.error("[octocat] load error:", err);
    overlay.textContent = "Failed to load model";
  },
);

// ── Animation loop ────────────────────────────────────────────────────────────
let prevTime = performance.now();
let elapsed = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  elapsed += dt;

  if (mixer) mixer.update(dt);

  if (modelRoot) {
    // Primary float — bigger amplitude, two sine layers for organic feel
    modelRoot.position.y =
      modelCenter.y +
      Math.sin(elapsed * 1.1) * modelHeight * 0.045 +
      Math.sin(elapsed * 1.9) * modelHeight * 0.012;
    // Lateral drift
    modelRoot.position.x =
      modelCenter.x + Math.sin(elapsed * 0.6) * modelHeight * 0.018;
    // Body sway — more pronounced
    modelRoot.rotation.y =
      Math.sin(elapsed * 0.55) * 0.18 + Math.sin(elapsed * 1.3) * 0.04;
    modelRoot.rotation.x =
      Math.sin(elapsed * 0.7) * 0.06 + Math.sin(elapsed * 1.1) * 0.02;
    // Subtle roll
    modelRoot.rotation.z = Math.sin(elapsed * 0.45) * 0.03;
    // Breathing scale
    const breathe = 1 + Math.sin(elapsed * 1.05) * 0.015;
    modelRoot.scale.setScalar(breathe);
  }

  // ── Gaze: smoothly shift pupils toward a new focus point ─────────────────
  gazeHoldTimer -= dt;
  if (gazeHoldTimer <= 0) {
    gazeHoldTimer = 0.6 + Math.random() * 2.2;
    gazeTarget.set(
      (Math.random() - 0.5) * 2 * gazeRangeX,
      (Math.random() - 0.5) * 2 * gazeRangeY,
    );
  }
  gazeCurrent.lerp(gazeTarget, Math.min(dt * 10, 1));
  pupils.forEach((p) => {
    p.position.x = (p.userData.base as THREE.Vector3).x + gazeCurrent.x;
    p.position.y = (p.userData.base as THREE.Vector3).y + gazeCurrent.y;
  });

  // ── Blink ─────────────────────────────────────────────────────────────────
  blinkTimer -= dt;
  if (blinkTimer <= 0 && blinkT < 0) {
    blinkTimer = 2.5 + Math.random() * 3.5;
    blinkT = 0;
  }
  if (blinkT >= 0) {
    blinkT += dt / 0.1;
    const sy = Math.max(
      1 - Math.sin(Math.min(blinkT, 1) * Math.PI) * 0.94,
      0.04,
    );
    if (eyeNode) eyeNode.scale.y = sy;
    pupils.forEach((p) => {
      p.scale.y = sy;
    });
    if (blinkT >= 1) {
      blinkT = -1;
      if (eyeNode) eyeNode.scale.y = 1;
      pupils.forEach((p) => {
        p.scale.y = 1;
      });
    }
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
