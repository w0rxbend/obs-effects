import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = `${import.meta.env.BASE_URL}assets/main/tux.glb`;

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;";
document.body.appendChild(renderer.domElement);

const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;align-items:center;justify-content:center",
  "color:rgba(255,255,255,0.74);font:500 13px/1 monospace",
  "letter-spacing:0.12em;pointer-events:none;transition:opacity 0.7s ease",
].join(";");
overlay.textContent = "Loading Tux...";
document.body.appendChild(overlay);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(
  36,
  window.innerWidth / window.innerHeight,
  0.01,
  1200,
);

scene.add(new THREE.HemisphereLight(0xf7fbff, 0x253042, 1.9));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4, 7, 9);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8fd7ff, 0.95);
fillLight.position.set(-7, 3, 5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xcaa6ff, 1.45);
rimLight.position.set(0, 4, -8);
scene.add(rimLight);

interface ComponentInfo {
  indices: number[];
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

interface VertexPose {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  original: Float32Array;
}

interface WingPose {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  vertices: number[];
  pivot: THREE.Vector3;
  side: number;
}

interface EyePose {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  vertices: number[];
  center: THREE.Vector3;
}

const vertexPoses = new Map<THREE.BufferGeometry, VertexPose>();
const wings: WingPose[] = [];
const eyes: EyePose[] = [];
const modelCenter = new THREE.Vector3();
const modelSize = new THREE.Vector3(1, 1, 1);
const modelLocalCenter = new THREE.Vector3();
const modelLocalSize = new THREE.Vector3(1, 1, 1);
const modelBasePosition = new THREE.Vector3();
const cameraLookAt = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpWing = new THREE.Vector3();
const wingAxis = new THREE.Vector3(0, 0, 1);
const wingQuat = new THREE.Quaternion();

let modelRoot: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
let blinkTimer = 1.2 + Math.random() * 1.4;
let blinkProgress = -1;
let cameraDistance = 1;
let elapsed = 0;
let previousTime = performance.now();

function getMaterialName(mesh: THREE.Mesh): string {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return mat?.name?.toLowerCase() ?? "";
}

function findParent(parent: number[], index: number): number {
  if (parent[index] !== index)
    parent[index] = findParent(parent, parent[index]);
  return parent[index];
}

function connect(parent: number[], a: number, b: number): void {
  const rootA = findParent(parent, a);
  const rootB = findParent(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}

function detectComponents(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>,
): ComponentInfo[] {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const index = geometry.index;
  const parent = Array.from({ length: position.count }, (_, i) => i);

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      connect(parent, a, b);
      connect(parent, a, c);
    }
  }

  const groups = new Map<number, { indices: number[]; box: THREE.Box3 }>();
  for (let i = 0; i < position.count; i++) {
    const root = findParent(parent, i);
    let group = groups.get(root);
    if (!group) {
      group = { indices: [], box: new THREE.Box3() };
      groups.set(root, group);
    }
    group.indices.push(i);
    tmpVec.fromBufferAttribute(position, i);
    group.box.expandByPoint(tmpVec);
  }

  return [...groups.values()]
    .map((group) => {
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      group.box.getCenter(center);
      group.box.getSize(size);
      return {
        indices: group.indices,
        box: group.box,
        center,
        size,
      };
    })
    .sort((a, b) => b.indices.length - a.indices.length);
}

function captureGeometry(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>,
): void {
  if (vertexPoses.has(mesh.geometry)) return;
  const position = mesh.geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  vertexPoses.set(mesh.geometry, {
    mesh,
    original: new Float32Array(position.array as Float32Array),
  });
}

function tuneMaterials(mesh: THREE.Mesh): void {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((mat) => {
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;
    mat.roughness = 0.52;
    mat.metalness = 0;
    mat.envMapIntensity = 0.55;

    const name = mat.name.toLowerCase();
    if (name.includes("black")) {
      mat.color.setHex(0x07080a);
      mat.roughness = 0.42;
    } else if (name.includes("white")) {
      mat.color.setHex(0xf7f7ef);
      mat.roughness = 0.48;
    } else if (name.includes("orange")) {
      mat.color.setHex(0xff8a18);
      mat.roughness = 0.56;
    }
  });
}

function measureLocalGeometry(model: THREE.Group): void {
  const box = new THREE.Box3();
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      tmpVec.fromBufferAttribute(position, i);
      box.expandByPoint(tmpVec);
    }
  });
  box.getCenter(modelLocalCenter);
  box.getSize(modelLocalSize);
}

function detectAnimatedParts(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>,
): void {
  const materialName = getMaterialName(mesh);
  const components = detectComponents(mesh);

  if (materialName.includes("black")) {
    const wingCandidates = components
      .filter(
        (part) =>
          part.indices.length > 800 &&
          Math.abs(part.center.x - modelLocalCenter.x) >
            modelLocalSize.x * 0.18 &&
          part.size.z > modelLocalSize.z * 0.22 &&
          part.size.y > modelLocalSize.y * 0.35,
      )
      .sort(
        (a, b) =>
          Math.abs(b.center.x - modelLocalCenter.x) -
          Math.abs(a.center.x - modelLocalCenter.x),
      )
      .slice(0, 2);

    wingCandidates.forEach((part) => {
      const side = part.center.x >= modelLocalCenter.x ? 1 : -1;
      wings.push({
        mesh,
        vertices: part.indices,
        side,
        pivot: new THREE.Vector3(
          modelLocalCenter.x + side * modelLocalSize.x * 0.16,
          part.center.y,
          part.box.max.z - part.size.z * 0.18,
        ),
      });
    });

    const pupilCandidates = components
      .filter(
        (part) =>
          part.indices.length > 80 &&
          part.indices.length < 500 &&
          part.center.z > modelLocalCenter.z + modelLocalSize.z * 0.22 &&
          part.center.y < modelLocalCenter.y - modelLocalSize.y * 0.18,
      )
      .sort((a, b) => b.center.y - a.center.y)
      .slice(0, 2);

    pupilCandidates.forEach((part) => {
      eyes.push({ mesh, vertices: part.indices, center: part.center.clone() });
    });
  }

  if (materialName.includes("white")) {
    const eyeWhiteCandidates = components
      .filter(
        (part) =>
          part.indices.length > 120 &&
          part.center.z > modelLocalCenter.z + modelLocalSize.z * 0.18 &&
          part.size.z < modelLocalSize.z * 0.18,
      )
      .sort((a, b) => b.center.z - a.center.z)
      .slice(0, 2);

    eyeWhiteCandidates.forEach((part) => {
      eyes.push({ mesh, vertices: part.indices, center: part.center.clone() });
    });
  }
}

function resetVertices(): void {
  vertexPoses.forEach(({ mesh, original }) => {
    const position = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    (position.array as Float32Array).set(original);
  });
}

function applyWingMotion(): void {
  wings.forEach((wing) => {
    const pose = vertexPoses.get(wing.mesh.geometry);
    if (!pose) return;
    const position = wing.mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const values = position.array as Float32Array;
    const flap =
      Math.sin(elapsed * 0.92 + wing.side * 0.28) * 0.045 +
      Math.sin(elapsed * 0.37) * 0.018;

    wingQuat.setFromAxisAngle(wingAxis, flap * wing.side);

    wing.vertices.forEach((vertexIndex) => {
      const offset = vertexIndex * 3;
      tmpWing
        .set(
          pose.original[offset],
          pose.original[offset + 1],
          pose.original[offset + 2],
        )
        .sub(wing.pivot)
        .applyQuaternion(wingQuat)
        .add(wing.pivot);

      const softness = THREE.MathUtils.clamp(
        (wing.pivot.z - pose.original[offset + 2]) / (modelLocalSize.z * 0.34),
        0.25,
        1,
      );
      values[offset] =
        pose.original[offset] + (tmpWing.x - pose.original[offset]) * softness;
      values[offset + 1] =
        pose.original[offset + 1] +
        (tmpWing.y - pose.original[offset + 1]) * softness;
      values[offset + 2] =
        pose.original[offset + 2] +
        (tmpWing.z - pose.original[offset + 2]) * softness;
    });
  });
}

function applyBlink(dt: number): void {
  blinkTimer -= dt;
  if (blinkTimer <= 0 && blinkProgress < 0) {
    blinkTimer = 2.6 + Math.random() * 2.8;
    blinkProgress = 0;
  }

  let eyeScale = 1;
  if (blinkProgress >= 0) {
    blinkProgress += dt / 0.12;
    eyeScale = Math.max(0.035, 1 - Math.sin(blinkProgress * Math.PI) * 0.965);
    if (blinkProgress >= 1) {
      blinkProgress = -1;
      eyeScale = 1;
    }
  }

  const lookX = Math.sin(elapsed * 0.77) * modelLocalSize.x * 0.006;
  const lookZ = Math.sin(elapsed * 0.53 + 1.6) * modelLocalSize.z * 0.004;

  eyes.forEach((eye) => {
    const pose = vertexPoses.get(eye.mesh.geometry);
    if (!pose) return;
    const materialName = getMaterialName(eye.mesh);
    const position = eye.mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const values = position.array as Float32Array;
    const isPupil = materialName.includes("black");

    eye.vertices.forEach((vertexIndex) => {
      const offset = vertexIndex * 3;
      const baseX = pose.original[offset];
      const baseY = pose.original[offset + 1];
      const baseZ = pose.original[offset + 2];

      values[offset] = baseX + (isPupil ? lookX : 0);
      values[offset + 1] = baseY;
      values[offset + 2] =
        eye.center.z +
        (baseZ - eye.center.z) * eyeScale +
        (isPupil ? lookZ : 0);
    });
  });
}

function markVerticesDirty(): void {
  vertexPoses.forEach(({ mesh }) => {
    const position = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });
}

function frameModel(model: THREE.Group): void {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  box.getSize(modelSize);
  box.getCenter(modelCenter);

  model.position.sub(modelCenter);
  modelBasePosition.copy(model.position);
  model.updateWorldMatrix(true, true);

  const framedBox = new THREE.Box3().setFromObject(model);
  framedBox.getSize(modelSize);
  framedBox.getCenter(modelCenter);

  const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const dist = ((maxDim / 2) * 1.68) / Math.tan(fovRad / 2);
  cameraDistance = dist;
  cameraLookAt.set(
    modelCenter.x,
    modelCenter.y + modelSize.y * 0.12,
    modelCenter.z + modelSize.z * 0.02,
  );
  camera.position.set(
    cameraLookAt.x,
    modelCenter.y + modelSize.y * 0.08,
    cameraLookAt.z + cameraDistance,
  );
  camera.lookAt(cameraLookAt);
  camera.near = dist * 0.01;
  camera.far = dist * 10;
  camera.updateProjectionMatrix();

  keyLight.position.set(
    modelCenter.x + modelSize.x * 0.85,
    modelCenter.y + modelSize.y * 1.2,
    modelCenter.z + modelSize.z * 1.2,
  );
}

function updateCameraOrbit(): void {
  if (!modelRoot) return;
  const angle = Math.sin(elapsed * 0.18) * 0.18;
  camera.position.set(
    cameraLookAt.x + Math.sin(angle) * cameraDistance,
    modelCenter.y +
      modelSize.y * 0.08 +
      Math.sin(elapsed * 0.11) * modelSize.y * 0.01,
    cameraLookAt.z + Math.cos(angle) * cameraDistance,
  );
  camera.lookAt(cameraLookAt);
}

const loader = new GLTFLoader();

loader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;
    modelRoot = model;
    scene.add(model);

    frameModel(model);
    measureLocalGeometry(model);

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.geometry = mesh.geometry.clone();
      captureGeometry(mesh);
      tuneMaterials(mesh);
      detectAnimatedParts(mesh);
    });

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
    }

    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 800);
  },
  (xhr) => {
    if (xhr.total > 0) {
      overlay.textContent = `Loading Tux... ${Math.round(
        (xhr.loaded / xhr.total) * 100,
      )}%`;
    }
  },
  (err) => {
    console.error("[tux] load error:", err);
    overlay.textContent = "Failed to load Tux.";
  },
);

function animate(): void {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  elapsed += dt;

  if (mixer) mixer.update(dt);

  if (modelRoot) {
    const breathe = 1 + Math.sin(elapsed * 0.82) * 0.009;
    modelRoot.scale.setScalar(breathe);
    modelRoot.position.y =
      modelBasePosition.y +
      Math.sin(elapsed * 0.72) * modelSize.y * 0.012 +
      Math.sin(elapsed * 1.31) * modelSize.y * 0.003;
    modelRoot.position.x =
      modelBasePosition.x + Math.sin(elapsed * 0.33) * modelSize.x * 0.002;
    modelRoot.position.z = modelBasePosition.z;
    modelRoot.rotation.y =
      Math.sin(elapsed * 0.24) * 0.045 + Math.sin(elapsed * 0.63) * 0.01;
    modelRoot.rotation.x = Math.sin(elapsed * 0.31) * 0.012;
    modelRoot.rotation.z = Math.sin(elapsed * 0.28) * 0.01;

    resetVertices();
    applyWingMotion();
    applyBlink(dt);
    markVerticesDirty();
    updateCameraOrbit();
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
