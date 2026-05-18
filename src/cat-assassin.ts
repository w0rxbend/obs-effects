import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const MODEL_URL =
  "/assets/main/cat-murdered-soul-suspect/source/cat_fbx/cat.fbx";
const TEXTURE_ROOT = "/assets/main/cat-murdered-soul-suspect/textures/";

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;cursor:grab;";
document.body.appendChild(renderer.domElement);

const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px",
  "color:rgba(210,230,255,0.88);font:500 13px/1.4 'Courier New',monospace",
  "letter-spacing:0.1em;pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.innerHTML = [
  `<div id="load-status">Loading cat assassin...</div>`,
  `<div style="width:220px;height:2px;background:rgba(210,230,255,0.15);border-radius:1px">`,
  `<div id="load-fill" style="height:100%;width:0%;background:rgba(210,230,255,0.75);border-radius:1px;transition:width 0.1s"></div>`,
  `</div>`,
].join("");
document.body.appendChild(overlay);

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
controls.minPolarAngle = THREE.MathUtils.degToRad(16);
controls.maxPolarAngle = THREE.MathUtils.degToRad(122);
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.75;

scene.add(new THREE.AmbientLight(0xd8e7ff, 0.7));

const keyLight = new THREE.DirectionalLight(0xffefe0, 2.35);
keyLight.position.set(3.8, 5.2, 4.5);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8bd5ff, 1.15);
fillLight.position.set(-4.2, 2.6, 2.8);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xd9f5ff, 1.85);
rimLight.position.set(0, 2.2, -5);
scene.add(rimLight);

interface RigEntry {
  obj: THREE.Object3D;
  bindQ: THREE.Quaternion;
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
let modelHeight = 1;

const textureLoader = new THREE.TextureLoader();

function loadTexture(path: string, color = false): THREE.Texture {
  const texture = textureLoader.load(path, undefined, undefined, (err) =>
    console.warn(`[cat-assassin] failed to load texture ${path}`, err),
  );
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const textures = {
  catColor: loadTexture(`${TEXTURE_ROOT}tx_player_cat_d.png`, true),
  catNormal: loadTexture(`${TEXTURE_ROOT}tx_player_cat_n.png`),
  hairColor: loadTexture(`${TEXTURE_ROOT}tx_player_hair_grey_d.png`, true),
};

function pose(name: string, rx: number, ry: number, rz: number): void {
  const bone = rig.get(name);
  if (!bone) return;
  tmpEuler.set(rx, ry, rz, "XYZ");
  tmpQuat.setFromEuler(tmpEuler);
  bone.obj.quaternion.copy(bone.bindQ).multiply(tmpQuat);
}

function ensureAoUv(mesh: THREE.Mesh): void {
  const uv = mesh.geometry.attributes.uv;
  if (!uv || mesh.geometry.attributes.uv2) return;
  mesh.geometry.setAttribute("uv2", uv);
}

function makeCatMaterial(
  source: THREE.Material,
  index: number,
): THREE.Material {
  const materialName = source.name;
  const isEye = materialName === "Material #105" || index === 1;
  const isHair = materialName === "Material #93" || index === 2;

  if (isEye) {
    const eye = new THREE.MeshPhysicalMaterial({
      name: materialName,
      color: 0xdad0a4,
      emissive: 0x191203,
      emissiveIntensity: 0.08,
      roughness: 0.18,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.16,
    });
    return eye;
  }

  const fur = new THREE.MeshStandardMaterial({
    name: materialName,
    map: isHair ? textures.hairColor : textures.catColor,
    normalMap: textures.catNormal,
    roughness: isHair ? 0.7 : 0.54,
    metalness: 0,
    side: isHair ? THREE.DoubleSide : THREE.FrontSide,
    transparent: isHair,
    alphaTest: isHair ? 0.28 : 0,
  });
  fur.normalScale.set(isHair ? 0.36 : 0.55, isHair ? 0.36 : 0.55);
  fur.color.setHex(isHair ? 0xffffff : 0xf4f1ea);
  return fur;
}

function applyCatMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    ensureAoUv(obj);

    const materials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    const replacement = materials.map((material, index) =>
      makeCatMaterial(material, index),
    );

    obj.material = Array.isArray(obj.material) ? replacement : replacement[0];
  });
}

function frameModel(model: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(modelCenter);
  modelHeight = Math.max(size.y, 1);

  const targetY = box.min.y + modelHeight * 0.52;
  const maxDim = Math.max(size.x, size.y, size.z);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const dist = ((maxDim / 2) * 1.65) / Math.tan(fovRad / 2);

  camera.position.set(
    modelCenter.x + size.x * 0.18,
    targetY + modelHeight * 0.05,
    modelCenter.z + dist,
  );
  camera.lookAt(modelCenter.x, targetY, modelCenter.z);
  camera.near = Math.max(dist * 0.005, 0.01);
  camera.far = dist * 8;
  camera.updateProjectionMatrix();

  controls.target.set(modelCenter.x, targetY, modelCenter.z);
  controls.minDistance = dist * 0.45;
  controls.maxDistance = dist * 2.6;
  controls.update();
}

const loadStatus = document.getElementById("load-status")!;
const loadFill = document.getElementById("load-fill") as HTMLDivElement;

const loader = new FBXLoader();
loader.setResourcePath(`${TEXTURE_ROOT}`);
loader.load(
  MODEL_URL,
  (fbx) => {
    modelRoot = fbx;

    const originalBox = new THREE.Box3().setFromObject(fbx);
    const originalCenter = new THREE.Vector3();
    originalBox.getCenter(originalCenter);
    fbx.position.sub(originalCenter);
    fbx.rotation.y = Math.PI;
    bindPosition.copy(fbx.position);
    bindScale.copy(fbx.scale);

    fbx.traverse((obj) => {
      if (obj instanceof THREE.Bone) {
        rig.set(obj.name, { obj, bindQ: obj.quaternion.clone() });
      }
    });

    applyCatMaterials(fbx);
    scene.add(fbx);

    skeletonHelper = new THREE.SkeletonHelper(fbx);
    const helperMaterial = skeletonHelper.material;
    if (helperMaterial instanceof THREE.Material) {
      helperMaterial.transparent = true;
      helperMaterial.opacity = 0.12;
      helperMaterial.depthWrite = false;
      if (
        "color" in helperMaterial &&
        helperMaterial.color instanceof THREE.Color
      ) {
        helperMaterial.color.setHex(0x9bdcff);
      }
    }
    scene.add(skeletonHelper);

    if (fbx.animations.length > 0) {
      mixer = new THREE.AnimationMixer(fbx);
      fbx.animations.forEach((clip) => {
        const action = mixer!.clipAction(clip);
        action.setEffectiveWeight(0.34);
        action.play();
      });
    }

    frameModel(fbx);

    loadStatus.textContent = `Cat assassin loaded - ${rig.size} bones, ${fbx.animations.length} clip`;
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 950);
  },
  (xhr) => {
    if (xhr.total <= 0) return;
    const pct = Math.round((xhr.loaded / xhr.total) * 100);
    loadStatus.textContent = `Loading cat assassin... ${pct}%`;
    loadFill.style.width = `${pct}%`;
  },
  (err) => {
    console.error("[cat-assassin] load error:", err);
    loadStatus.textContent = "Failed to load cat.fbx";
  },
);

const clock = new THREE.Clock();

function animateRig(t: number, dt: number): void {
  const breathe = Math.sin(t * 1.8);
  const alert = Math.sin(t * 0.58);
  const scan = Math.sin(t * 0.42);
  const tailWave = t * 2.3;
  const pawShift = Math.sin(t * 1.2);
  const blink = Math.pow(Math.max(0, Math.sin(t * 2.05 - 0.8)), 20);

  if (mixer) mixer.update(dt);

  if (modelRoot) {
    modelRoot.position.set(
      bindPosition.x + Math.sin(t * 0.28) * modelHeight * 0.012,
      bindPosition.y + breathe * modelHeight * 0.01,
      bindPosition.z,
    );
    modelRoot.rotation.y = Math.PI + Math.sin(t * 0.24) * 0.08;
    modelRoot.rotation.z = Math.sin(t * 0.21 + 0.5) * 0.012;
    modelRoot.scale.set(
      bindScale.x * (1 - breathe * 0.003),
      bindScale.y * (1 + breathe * 0.007),
      bindScale.z * (1 - breathe * 0.003),
    );
  }

  pose("j_spine_1", breathe * 0.018, scan * 0.025, 0);
  pose("j_spine_2", breathe * 0.022, scan * 0.035, alert * 0.018);
  pose("j_spine_3", breathe * 0.028, scan * 0.045, alert * 0.024);
  pose("j_spine_4", breathe * 0.03, scan * 0.052, alert * 0.03);
  pose("j_chest", breathe * 0.025, scan * 0.04, alert * 0.024);

  pose("j_neck_base", -0.02 + breathe * 0.018, scan * 0.07, alert * 0.035);
  pose("j_neck_1", -0.04 + breathe * 0.018, scan * 0.1, alert * 0.05);
  pose(
    "j_head",
    -0.03 + Math.sin(t * 0.83) * 0.035,
    scan * 0.16,
    alert * 0.075,
  );
  pose("j_jaw", 0.035 + Math.max(0, Math.sin(t * 1.6)) * 0.035, 0, 0);

  pose("j_l_ear", -0.12 + blink * 0.08, 0.08 + alert * 0.08, 0.08);
  pose("j_r_ear", -0.12 + blink * 0.08, -0.08 + alert * 0.08, -0.08);
  pose("j_l_eye", -0.02 + blink * 0.08, scan * 0.1, 0);
  pose("j_r_eye", -0.02 + blink * 0.08, scan * 0.1, 0);
  pose("j_l_upper_eyelid", blink * 0.18, 0, 0);
  pose("j_r_upper_eyelid", blink * 0.18, 0, 0);

  for (let i = 1; i <= 6; i++) {
    const falloff = i / 6;
    pose(
      `j_tail_${i}`,
      Math.sin(tailWave + i * 0.42) * 0.08 * falloff,
      Math.sin(tailWave * 0.72 + i * 0.58) * 0.2 * falloff,
      Math.cos(tailWave * 0.62 + i * 0.35) * 0.12 * falloff,
    );
  }

  pose("j_l_scap", 0.02 + pawShift * 0.018, 0, 0.015);
  pose("j_r_scap", 0.02 - pawShift * 0.018, 0, -0.015);
  pose("j_l_humerous", pawShift * 0.028, 0, 0.02);
  pose("j_r_humerous", -pawShift * 0.028, 0, -0.02);
  pose("j_l_elbow", Math.max(0, pawShift) * 0.03, 0, 0);
  pose("j_r_elbow", Math.max(0, -pawShift) * 0.03, 0, 0);

  pose("j_l_femur", -pawShift * 0.02, 0, 0.018);
  pose("j_r_femur", pawShift * 0.02, 0, -0.018);
  pose("j_l_knee", Math.max(0, -pawShift) * 0.025, 0, 0);
  pose("j_r_knee", Math.max(0, pawShift) * 0.025, 0, 0);
}

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime + dt;

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
