import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { obsAudio } from "./lib/obsAudio";

// Renderer
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

// Loading overlay
const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px",
  "color:rgba(170,230,255,0.86);font:500 13px/1.4 'Courier New',monospace",
  "letter-spacing:0.1em;pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.innerHTML = [
  `<div id="load-status">Loading Gunan bust...</div>`,
  `<div style="width:210px;height:2px;background:rgba(170,230,255,0.15);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(170,230,255,0.75);border-radius:1px;transition:width 0.1s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

// Scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.01,
  2000,
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minPolarAngle = THREE.MathUtils.degToRad(18);
controls.maxPolarAngle = THREE.MathUtils.degToRad(118);
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.75;

scene.add(new THREE.AmbientLight(0xdce9ff, 0.72));

const keyLight = new THREE.DirectionalLight(0xfff0dd, 2.2);
keyLight.position.set(3, 5, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8fd8ff, 1.1);
fillLight.position.set(-4, 2.5, 3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xd7f5ff, 1.6);
rimLight.position.set(0, 2, -5);
scene.add(rimLight);

interface RigEntry {
  obj: THREE.Object3D;
  bindQ: THREE.Quaternion;
}

interface TexturedMaterial extends THREE.Material {
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
  specularMap?: THREE.Texture | null;
  color?: THREE.Color;
  shininess?: number;
  roughness?: number;
  metalness?: number;
}

const rig = new Map<string, RigEntry>();
const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const modelCenter = new THREE.Vector3();
const bindPosition = new THREE.Vector3();
const bindScale = new THREE.Vector3(1, 1, 1);

let mixer: THREE.AnimationMixer | null = null;
let modelRoot: THREE.Group | null = null;
let skeletonHelper: THREE.SkeletonHelper | null = null;
let headMesh: THREE.SkinnedMesh | null = null;
let morphs: Record<string, number> = {};
let modelHeight = 1;

let audioPeak = 0;
let mouthEnvelope = 0;
let jawOpen = 0;
let jawVelocity = 0;
let syllablePhase = 0;
let syllableOpen = 0;
let lipRound = 0;
let lipWide = 0;
let consonantEnergy = 0;

const MIC_OPEN_THRESHOLD = 0.16;

function loadTexture(path: string, color = false): THREE.Texture {
  const texture = new THREE.TextureLoader().load(path);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const textures = {
  eyeColor: loadTexture("/assets/main/gunan/textures/eye_diff.png", true),
  eyeNormal: loadTexture("/assets/main/gunan/textures/Eye_normal.png"),
  eyeSpec: loadTexture("/assets/main/gunan/textures/eye_glossy.png"),
  headAo: loadTexture("/assets/main/gunan/textures/head_ao.png"),
  headColor: loadTexture("/assets/main/gunan/textures/head_diffuse.png", true),
  headNormal: loadTexture("/assets/main/gunan/textures/head_normal.png"),
  headSpec: loadTexture("/assets/main/gunan/textures/head_spec.png"),
  teethAo: loadTexture("/assets/main/gunan/textures/teeth_ao.png"),
};

function pose(name: string, rx: number, ry: number, rz: number): void {
  const bone = rig.get(name);
  if (!bone) return;
  tmpEuler.set(rx, ry, rz, "XYZ");
  tmpQuat.setFromEuler(tmpEuler);
  bone.obj.quaternion.copy(bone.bindQ).multiply(tmpQuat);
}

function morph(name: string, value: number): void {
  if (!headMesh?.morphTargetInfluences) return;
  const index = morphs[`ExpressionBlendshapes.${name}`];
  if (index === undefined) return;
  headMesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
}

function ensureAoUv(mesh: THREE.Mesh): void {
  const uv = mesh.geometry.attributes.uv;
  if (!uv || mesh.geometry.attributes.uv2) return;
  mesh.geometry.setAttribute("uv2", uv);
}

function applyGunanMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    ensureAoUv(obj);

    const materials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    for (const material of materials) {
      const mat = material as TexturedMaterial;
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.color?.setHex(0xffffff);

      if (material.name === "Skin") {
        mat.map = textures.headColor;
        mat.normalMap = textures.headNormal;
        mat.aoMap = textures.headAo;
        mat.specularMap = textures.headSpec;
        mat.shininess = 18;
      } else if (material.name === "Eyes") {
        mat.map = textures.eyeColor;
        mat.normalMap = textures.eyeNormal;
        mat.specularMap = textures.eyeSpec;
        mat.shininess = 42;
      } else if (material.name === "Teeth" || material.name === "Teethridge") {
        mat.aoMap = textures.teethAo;
        mat.shininess = material.name === "Teeth" ? 10 : 14;
        mat.color?.lerp(
          new THREE.Color(material.name === "Teeth" ? 0xfff2df : 0xa94a4a),
          0.55,
        );
      }

      mat.roughness = Math.max(mat.roughness ?? 0.38, 0.34);
      mat.metalness = 0;
      material.needsUpdate = true;
    }
  });
}

function frameModel(model: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(modelCenter);
  modelHeight = Math.max(size.y, 1);

  const targetY = box.min.y + modelHeight * 0.58;
  const maxDim = Math.max(size.x, size.y, size.z);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const dist = ((maxDim / 2) * 1.52) / Math.tan(fovRad / 2);

  camera.position.set(modelCenter.x, targetY + modelHeight * 0.04, dist);
  camera.lookAt(modelCenter.x, targetY, modelCenter.z);
  camera.near = Math.max(dist * 0.005, 0.01);
  camera.far = dist * 8;
  camera.updateProjectionMatrix();

  controls.target.set(modelCenter.x, targetY, modelCenter.z);
  controls.minDistance = dist * 0.45;
  controls.maxDistance = dist * 2.4;
  controls.update();
}

function updateAudio(dt: number): void {
  obsAudio.update(dt);
  const level = obsAudio.level;
  const vocal = obsAudio.vocal;
  const high = obsAudio.high;
  const bass = obsAudio.bass;
  const mid = obsAudio.mid;

  const micGate = THREE.MathUtils.smoothstep(
    level,
    MIC_OPEN_THRESHOLD,
    MIC_OPEN_THRESHOLD + 0.1,
  );
  const isTalking = level > 0.015;

  audioPeak += (obsAudio.beat ? 1 : 0) * 5.5 * dt;
  audioPeak += (0 - audioPeak) * Math.min(1, dt * 12);

  const targetEnvelope = THREE.MathUtils.clamp(level * micGate, 0, 1);
  const envelopeRate = targetEnvelope > mouthEnvelope ? 28 : 9;
  mouthEnvelope +=
    (targetEnvelope - mouthEnvelope) * Math.min(1, dt * envelopeRate);

  const roundTarget = THREE.MathUtils.clamp(
    (bass - mid * 0.25) * 1.35 * mouthEnvelope * micGate,
    0,
    0.9,
  );
  const wideTarget = THREE.MathUtils.clamp(
    (mid - bass * 0.18) * 0.95 * mouthEnvelope * micGate,
    0,
    0.8,
  );
  const consonantTarget = THREE.MathUtils.clamp(
    high * 2.4 * (0.3 + mouthEnvelope * 0.7),
    0,
    1,
  );

  lipRound += (roundTarget - lipRound) * Math.min(1, dt * 11);
  lipWide += (wideTarget - lipWide) * Math.min(1, dt * 10);
  consonantEnergy += (consonantTarget - consonantEnergy) * Math.min(1, dt * 18);

  if (isTalking) {
    const syllablesPerSecond = 3.4 + mouthEnvelope * 3.4 + audioPeak * 1.2;
    syllablePhase = (syllablePhase + dt * syllablesPerSecond) % 1;
  } else {
    syllablePhase = 0;
  }

  const pulse = Math.sin(syllablePhase * Math.PI);
  const plosiveClosure = Math.pow(consonantEnergy, 1.35) * 0.42;
  const syllableTarget = isTalking
    ? THREE.MathUtils.clamp(
        (0.16 + pulse * 0.84) * mouthEnvelope * (1 - plosiveClosure),
        0,
        1,
      )
    : 0;
  syllableOpen +=
    (syllableTarget - syllableOpen) *
    Math.min(1, dt * (syllableTarget > syllableOpen ? 24 : 16));

  const jawTarget = THREE.MathUtils.clamp(
    syllableOpen * 0.92 +
      mouthEnvelope * 0.08 +
      audioPeak * 0.06 * micGate -
      consonantEnergy * 0.12,
    0,
    0.92,
  );
  const stiffness = 72;
  const damping = 15;
  jawVelocity += (jawTarget - jawOpen) * stiffness * dt;
  jawVelocity *= Math.exp(-damping * dt);
  jawOpen = THREE.MathUtils.clamp(jawOpen + jawVelocity * dt, 0, 1);

  // Keep these locals suppressed for unused variable warnings
  void vocal;
}

const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;
void obsAudio.connect();

const loader = new FBXLoader();
loader.setResourcePath("/assets/main/gunan/textures/");
loader.load(
  "/assets/main/gunan/source/Gunan_animated.fbx",
  (fbx) => {
    modelRoot = fbx;

    const originalBox = new THREE.Box3().setFromObject(fbx);
    const originalCenter = new THREE.Vector3();
    originalBox.getCenter(originalCenter);
    fbx.position.sub(originalCenter);
    bindPosition.copy(fbx.position);
    bindScale.copy(fbx.scale);

    fbx.traverse((obj) => {
      if (obj instanceof THREE.Bone) {
        rig.set(obj.name, { obj, bindQ: obj.quaternion.clone() });
      }

      if (obj instanceof THREE.SkinnedMesh && obj.name === "Head_Mesh") {
        headMesh = obj;
        morphs = obj.morphTargetDictionary ?? {};
      }
    });

    applyGunanMaterials(fbx);
    scene.add(fbx);

    skeletonHelper = new THREE.SkeletonHelper(fbx);
    const helperMaterial = skeletonHelper.material;
    if (helperMaterial instanceof THREE.Material) {
      helperMaterial.transparent = true;
      helperMaterial.opacity = 0.16;
      helperMaterial.depthWrite = false;
    }
    skeletonHelper.visible = true;
    scene.add(skeletonHelper);

    if (fbx.animations.length > 0) {
      mixer = new THREE.AnimationMixer(fbx);
      fbx.animations.forEach((clip) => {
        const action = mixer!.clipAction(clip);
        action.setEffectiveWeight(0.55);
        action.play();
      });
    }

    frameModel(fbx);

    loadStatus.textContent = `Gunan bust loaded - ${rig.size} bones, ${Object.keys(morphs).length} blendshapes`;
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 950);
  },
  (xhr) => {
    if (xhr.total <= 0) return;
    const pct = Math.round((xhr.loaded / xhr.total) * 100);
    loadStatus.textContent = `Loading Gunan bust... ${pct}%`;
    loadFill.style.width = `${pct}%`;
  },
  (err) => {
    console.error("[gunan] load error:", err);
    loadStatus.textContent = "Failed to load Gunan_animated.fbx";
  },
);

const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime + dt;

  if (mixer) mixer.update(dt);
  updateAudio(dt);

  const breathe = Math.sin(t * 1.05);
  const look = Math.sin(t * 0.52);
  const listen = Math.sin(t * 0.37);
  const blinkPulse = Math.pow(Math.max(0, Math.sin(t * 2.05 - 0.5)), 18);
  const speech = Math.max(
    0,
    Math.sin(t * 3.2) * 0.55 + Math.sin(t * 6.4 + 0.8) * 0.35,
  );
  const voice = THREE.MathUtils.clamp(
    obsAudio.vocal * 0.68 + mouthEnvelope * 0.42,
    0,
    1,
  );
  const mouthOpen = THREE.MathUtils.clamp(jawOpen, 0, 1);
  const eyeReact = THREE.MathUtils.clamp(
    obsAudio.high * 0.45 + audioPeak * 0.35,
    0,
    1,
  );
  const audioLook =
    Math.sin(t * 8.5) * obsAudio.high * 0.08 +
    Math.sin(t * 13.0) * audioPeak * 0.04;
  void speech;

  if (modelRoot) {
    modelRoot.position.set(
      bindPosition.x + Math.sin(t * 0.34) * modelHeight * 0.012,
      bindPosition.y + breathe * modelHeight * 0.014,
      bindPosition.z,
    );
    modelRoot.rotation.y = Math.sin(t * 0.28) * 0.12;
    modelRoot.rotation.z = Math.sin(t * 0.23 + 0.6) * 0.018;
    modelRoot.scale.set(
      bindScale.x * (1 - breathe * 0.004),
      bindScale.y * (1 + breathe * 0.008),
      bindScale.z * (1 - breathe * 0.004),
    );
  }

  // Layered over the embedded clip so the bust keeps a calmer human idle.
  pose("Neck", breathe * 0.025, look * 0.06, listen * 0.035);
  pose(
    "Head",
    -0.02 + breathe * 0.025 + voice * 0.025,
    look * 0.12 + audioLook,
    listen * 0.055 + audioPeak * 0.035,
  );
  pose(
    "Jaw",
    mouthOpen * 0.18,
    Math.sin(t * 1.4) * 0.01 + lipWide * 0.018 - lipRound * 0.014,
    0,
  );
  pose(
    "EyeL",
    -0.025 + Math.sin(t * 0.75) * 0.02 - eyeReact * 0.035,
    look * 0.16 + audioLook,
    0,
  );
  pose(
    "EyeR",
    -0.025 + Math.sin(t * 0.75) * 0.02 - eyeReact * 0.035,
    look * 0.16 + audioLook,
    0,
  );

  morph("EyeBlink_L", blinkPulse);
  morph("EyeBlink_R", blinkPulse * (0.9 + Math.sin(t * 1.2) * 0.08));
  morph("EyeSquint_L", 0.04 + Math.max(0, listen) * 0.08 + eyeReact * 0.16);
  morph("EyeSquint_R", 0.04 + Math.max(0, -listen) * 0.08 + eyeReact * 0.16);
  morph("BrowsU_C", 0.04 + voice * 0.06 + audioPeak * 0.12);
  morph("BrowsU_L", eyeReact * 0.12 + Math.max(0, audioLook) * 0.5);
  morph("BrowsU_R", eyeReact * 0.12 + Math.max(0, -audioLook) * 0.5);
  morph("JawOpen", mouthOpen * 0.62);
  morph(
    "LipsTogether",
    THREE.MathUtils.clamp(
      0.1 - mouthOpen * 0.32 + consonantEnergy * 0.16,
      0,
      1,
    ),
  );
  morph("LipsPucker", lipRound * 0.42 + consonantEnergy * 0.08);
  morph("LipsFunnel", lipRound * 0.28 + audioPeak * 0.07);
  morph("LipsStretch_L", lipWide * 0.34);
  morph("LipsStretch_R", lipWide * 0.34);
  morph("LipsUpperUp_L", mouthOpen * 0.12 + lipWide * 0.08);
  morph("LipsUpperUp_R", mouthOpen * 0.12 + lipWide * 0.08);
  morph("LipsLowerDown_L", mouthOpen * 0.3 + lipWide * 0.06);
  morph("LipsLowerDown_R", mouthOpen * 0.3 + lipWide * 0.06);
  morph("MouthSmile_L", 0.035 + Math.max(0, listen) * 0.035 + lipWide * 0.08);
  morph("MouthSmile_R", 0.035 + Math.max(0, -listen) * 0.035 + lipWide * 0.08);
  morph("MouthPress_L", consonantEnergy * 0.16 * (1 - mouthOpen));
  morph("MouthPress_R", consonantEnergy * 0.16 * (1 - mouthOpen));
  morph("MouthLeft", Math.max(0, look) * 0.04 + lipWide * 0.03);
  morph("MouthRight", Math.max(0, -look) * 0.04 + lipWide * 0.03);

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
