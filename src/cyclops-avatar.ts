import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { obsAudio } from "./lib";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.3;
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ── Loading overlay ───────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;align-items:center;justify-content:center",
  "color:rgba(203,166,247,0.9);font:500 13px/1 'Courier New',monospace",
  "letter-spacing:0.12em;pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.textContent = "Loading Cyclops…";
document.body.appendChild(overlay);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();

// IBL — minimal intensity so it doesn't wash out the red; clearcoat uses it
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
pmrem.dispose();
const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.01,
  1000,
);

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x1a0000, 2.5));

// Key — dark black crimson, at camera position after load
const camLight = new THREE.PointLight(0x3d0000, 0.9, 0);
scene.add(camLight);

// rimL — very dark purple-blue, silhouette contrast only
const rimL = new THREE.PointLight(0x080018, 1.0, 0);
// rimR — dark black rim
const rimR = new THREE.PointLight(0x150000, 2.5, 0);
scene.add(rimL, rimR);

// frontTop — bright blood red
const frontTop = new THREE.DirectionalLight(0xff0000, 0.7);
frontTop.position.set(0, 8, 10);
scene.add(frontTop);

// ── Bone rig ──────────────────────────────────────────────────────────────────
// Bones we procedurally control — all others stay fully mixer-driven.
// Bind-pose quaternion captured once at load; pose() always applies
// bindQ × deltaQ so there's no accumulation and no mixer conflict.
const CONTROLLED = [
  "Neck_8",
  "Head_7",
  "Eye_6",
  "Jaw_5",
  "ShoulderR_58",
  "UpperarmR_57",
  "ForearmR_56",
  "HandR_45",
  "ShoulderL_33",
  "UpperarmL_32",
  "ForearmL_22",
  "HandL_20",
] as const;

type ControlledBone = (typeof CONTROLLED)[number];

interface BoneEntry {
  obj: THREE.Object3D;
  bindQ: THREE.Quaternion;
}

const rig = new Map<ControlledBone, BoneEntry>();

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// Fully overrides whatever the mixer set this frame — deterministic, no drift.
function pose(name: ControlledBone, rx: number, ry: number, rz: number): void {
  const b = rig.get(name);
  if (!b) return;
  _e.set(rx, ry, rz, "XYZ");
  _q.setFromEuler(_e);
  b.obj.quaternion.copy(b.bindQ).multiply(_q);
}

// ── Animation mixer ───────────────────────────────────────────────────────────
let mixer: THREE.AnimationMixer | null = null;

// ── Load ──────────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();

loader.load(
  "/assets/main/cyclops_rig.glb",
  (gltf) => {
    const model = gltf.scene;
    model.rotation.y = THREE.MathUtils.degToRad(-15);
    scene.add(model);

    // Capture bind-pose quaternions BEFORE the mixer touches anything.
    // Arm bones live inside SkinnedMesh.skeleton.bones, not in the scene-graph
    // traversal — so we pull from both sources.
    const collectBone = (obj: THREE.Object3D) => {
      if ((CONTROLLED as readonly string[]).includes(obj.name)) {
        rig.set(obj.name as ControlledBone, {
          obj,
          bindQ: obj.quaternion.clone(),
        });
      }
    };
    model.traverse((obj) => {
      collectBone(obj);
      const sm = obj as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        // Log every skeleton's bone names so we can see exact Three.js names
        console.log(
          `[cyclops] skeleton on "${sm.name}":`,
          sm.skeleton.bones.map((b) => b.name),
        );
        sm.skeleton.bones.forEach(collectBone);
      }
    });
    console.log("[cyclops] controlled bones found:", [...rig.keys()]);

    // ── Glossy blood-red material pass ────────────────────────────────────
    // Converts every MeshStandardMaterial to MeshPhysicalMaterial with
    // clearcoat gloss + red-shifted color. Run after bone collection so we
    // don't disturb the rig; maps/normals/AO are preserved from the original.
    const toGlossy = (src: THREE.Material): THREE.MeshPhysicalMaterial => {
      const std = src instanceof THREE.MeshStandardMaterial ? src : null;
      const dst = new THREE.MeshPhysicalMaterial({
        map: std?.map ?? null,
        normalMap: std?.normalMap ?? null,
        roughnessMap: std?.roughnessMap ?? null,
        metalnessMap: std?.metalnessMap ?? null,
        aoMap: std?.aoMap ?? null,
        emissiveMap: std?.emissiveMap ?? null,
        alphaMap: std?.alphaMap ?? null,
        // Darken and push hard into blood red — green/blue channels crushed
        color: (() => {
          if (!std) return new THREE.Color(0x6b0000);
          return std.color.clone().multiply(new THREE.Color(1.1, 0.06, 0.06));
        })(),
        roughness: Math.max(0.5, (std?.roughness ?? 0.5) * 0.85),
        metalness: std?.metalness ?? 0,
        clearcoat: 0.05,
        clearcoatRoughness: 0.6,
        reflectivity: 0.3,
        emissive: new THREE.Color(0x1a0000),
        emissiveIntensity: 0.35,
        envMapIntensity: 0.15,
        transparent: src.transparent,
        opacity: src.opacity,
        side: src.side,
      });
      src.dispose();
      return dst;
    };

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(toGlossy);
      } else {
        mesh.material = toGlossy(mesh.material);
      }
    });

    // ── Eye override — keep original texture/pupil, boost to white-red ───
    const eyeMesh = model.getObjectByName("Object_9") as THREE.Mesh | undefined;
    if (eyeMesh?.isMesh) {
      const src = eyeMesh.material as THREE.MeshStandardMaterial;
      eyeMesh.material = new THREE.MeshPhysicalMaterial({
        map: src.map,
        emissiveMap: src.map, // modulates glow by texture — bright iris glows more
        color: new THREE.Color(0xff4444),
        emissive: new THREE.Color(0xff1800),
        emissiveIntensity: 7.0, // high enough that dark sclera gets red glow, iris blazes
        roughness: 0.05,
        metalness: 0.0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.05,
      });
    }

    // Auto-frame camera
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const h = size.y;
    const faceY = box.min.y + h * 0.82; // look-at: upper face area
    const camY = box.min.y + h * 0.38; // camera sits low — chest/waist level
    const dist = h * 1.15;

    camera.position.set(center.x, camY, center.z + dist);
    camera.lookAt(center.x, faceY, center.z);
    camera.near = dist * 0.01;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();

    camLight.position.copy(camera.position);

    rimL.position.set(center.x - h * 0.7, faceY, center.z - h * 0.5);
    rimR.position.set(center.x + h * 0.7, faceY - h * 0.1, center.z - h * 0.4);
    rimL.distance = h * 3;
    rimR.distance = h * 3;

    // Start baked animation for body/legs/etc.
    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        mixer!.clipAction(clip).play();
      });
    }

    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  (xhr) => {
    if (xhr.total > 0)
      overlay.textContent = `Loading Cyclops… ${Math.round((xhr.loaded / xhr.total) * 100)}%`;
  },
  (err) => {
    console.error(err);
    overlay.textContent = "Failed to load model.";
  },
);

// ── Microphone ────────────────────────────────────────────────────────────────
void obsAudio.connect();

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

// 20 s super-cycle — non-overlapping gesture windows:
function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // Advance baked animation (body, legs, tail chains, etc.)
  mixer?.update(dt);

  // ── Controlled bones — pose() fully overrides mixer for these ─────────

  // Head: slow dual-frequency look left/right + gentle tilt
  const lookY = Math.sin(t * 0.28) * 0.22 + Math.sin(t * 0.11) * 0.08;
  const lookX = Math.sin(t * 0.41 + 1.2) * 0.04;
  pose("Neck_8", lookX * 0.4, lookY * 0.4, 0);
  pose("Head_7", lookX, lookY, 0);

  // ── Eye — center focus when talking, slow random wander when silent ─────
  // smoothstep threshold: below 0.15 = fully silent, above 0.4 = talking
  // This ignores mic background noise and only reacts to real speech
  const silence = 1 - THREE.MathUtils.smoothstep(obsAudio.level, 0.15, 0.4);

  const eyeY =
    Math.sin(t * 0.11) * 0.38 +
    Math.sin(t * 0.07 + 1.7) * 0.2 +
    Math.sin(t * 0.19 + 0.9) * 0.1;
  const eyeX = Math.sin(t * 0.09 + 2.3) * 0.22 + Math.sin(t * 0.15 + 0.4) * 0.1;
  pose("Eye_6", eyeX * silence, eyeY * silence, 0);

  // ── Idle arms — hanging down, elbows ~30°, independent random sway ─────
  const breathe = Math.sin(t * 1.1) * 0.02;

  // Each arm gets two incommensurate sinusoids so they never lock in sync
  const rFwd =
    Math.sin(t * 0.37 + 0.4) * 0.06 + Math.sin(t * 0.71 + 1.1) * 0.03;
  const rSide = Math.sin(t * 0.53 + 2.2) * 0.07 + Math.sin(t * 0.29) * 0.04;
  const rElbow = 0.52 + Math.sin(t * 0.61 + 0.8) * 0.06;

  const lFwd =
    Math.sin(t * 0.43 + 1.7) * 0.06 + Math.sin(t * 0.67 + 0.5) * 0.03;
  const lSide =
    Math.sin(t * 0.48 + 3.1) * 0.07 + Math.sin(t * 0.31 + 1.4) * 0.04;
  const lElbow = 0.52 + Math.sin(t * 0.58 + 2.3) * 0.06;

  pose("ShoulderR_58", 0, 0, -0.1);
  pose("UpperarmR_57", breathe + rFwd, 0, -0.15 + rSide);
  pose("ForearmR_56", rElbow, 0, 0);
  pose("HandR_45", 0.08 + rFwd * 0.3, 0, 0);

  pose("ShoulderL_33", 0, 0, 0.1);
  pose("UpperarmL_32", breathe + lFwd, 0, 0.15 + lSide);
  pose("ForearmL_22", lElbow, 0, 0);
  pose("HandL_20", 0.08 + lFwd * 0.3, 0, 0);

  // Jaw — driven only by audio input.
  obsAudio.update(dt);
  const syllable = (Math.sin(t * 8.5) * 0.3 + 0.7) * obsAudio.level;
  const jaw = syllable * 0.35;
  pose("Jaw_5", jaw, 0, 0);

  renderer.render(scene, camera);
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
