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
const DRONE_BASE_YAW = Math.PI;

interface MeshComponent {
  triangleIndices: number[];
  center: THREE.Vector3;
  size: THREE.Vector3;
}

function tuneMaterial(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  material.roughness = Math.max(0.28, material.roughness * 0.75);
  material.metalness = Math.max(material.metalness, 0.18);
  material.envMapIntensity = 0.9;
}

function vertexKey(position: THREE.BufferAttribute, index: number): string {
  return `${position.getX(index).toFixed(5)},${position
    .getY(index)
    .toFixed(5)},${position.getZ(index).toFixed(5)}`;
}

function findMeshComponents(geometry: THREE.BufferGeometry): MeshComponent[] {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.getAttribute("position") as THREE.BufferAttribute;
  const triangleCount = position.count / 3;
  const vertexToTriangles = new Map<string, number[]>();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const key = vertexKey(position, triangle * 3 + corner);
      const triangles = vertexToTriangles.get(key) ?? [];
      triangles.push(triangle);
      vertexToTriangles.set(key, triangles);
    }
  }

  const visited = new Uint8Array(triangleCount);
  const components: MeshComponent[] = [];

  for (let start = 0; start < triangleCount; start += 1) {
    if (visited[start]) continue;

    const stack = [start];
    const triangleIndices: number[] = [];
    const box = new THREE.Box3();
    visited[start] = 1;

    while (stack.length > 0) {
      const triangle = stack.pop()!;
      triangleIndices.push(triangle);

      for (let corner = 0; corner < 3; corner += 1) {
        const vertexIndex = triangle * 3 + corner;
        box.expandByPoint(
          new THREE.Vector3(
            position.getX(vertexIndex),
            position.getY(vertexIndex),
            position.getZ(vertexIndex),
          ),
        );

        const key = vertexKey(position, vertexIndex);
        const neighbors = vertexToTriangles.get(key) ?? [];
        neighbors.forEach((neighbor) => {
          if (visited[neighbor]) return;
          visited[neighbor] = 1;
          stack.push(neighbor);
        });
      }
    }

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    components.push({ triangleIndices, center, size });
  }

  return components;
}

function componentGeometry(
  source: THREE.BufferGeometry,
  triangleIndices: number[],
  pivot: THREE.Vector3,
): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const result = new THREE.BufferGeometry();
  const attributes = Object.entries(geometry.attributes);

  attributes.forEach(([name, attribute]) => {
    const buffer = attribute as THREE.BufferAttribute;
    const values: number[] = [];

    triangleIndices.forEach((triangle) => {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertexIndex = triangle * 3 + corner;
        for (let axis = 0; axis < buffer.itemSize; axis += 1) {
          let value = buffer.getComponent(vertexIndex, axis);
          if (name === "position") {
            if (axis === 0) value -= pivot.x;
            if (axis === 1) value -= pivot.y;
            if (axis === 2) value -= pivot.z;
          }
          values.push(value);
        }
      }
    });

    result.setAttribute(
      name,
      new THREE.Float32BufferAttribute(values, buffer.itemSize),
    );
  });

  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function distanceXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function splitPropellers(model: THREE.Group): void {
  const target = model.getObjectByName("Propellor_Lowpoly_lambert1_0");

  if (!(target instanceof THREE.Mesh) || !target.parent) return;

  const propellerMesh = target;
  const parent = target.parent;
  const components = findMeshComponents(propellerMesh.geometry);
  const hubComponents = components.filter(
    (component) =>
      Math.max(component.size.x, component.size.z) < 1.1 &&
      component.triangleIndices.length >= 80,
  );
  const hubCenters: THREE.Vector3[] = [];

  hubComponents.forEach((component) => {
    const existing = hubCenters.find(
      (center) => distanceXZ(center, component.center) < 0.25,
    );
    if (existing) {
      existing.add(component.center).multiplyScalar(0.5);
    } else {
      hubCenters.push(component.center.clone());
    }
  });

  if (hubCenters.length !== 4) {
    console.warn(
      `[drone] expected 4 propeller hubs, found ${hubCenters.length}`,
    );
    return;
  }

  const grouped = hubCenters.map((center) => ({
    center,
    components: [] as MeshComponent[],
  }));

  components.forEach((component) => {
    const nearest = grouped.reduce(
      (best, group, index) => {
        const distance = distanceXZ(component.center, group.center);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    );
    grouped[nearest.index].components.push(component);
  });

  grouped.forEach((group, rotorIndex) => {
    const pivot = new THREE.Object3D();
    pivot.name = `DronePropellerPivot_${rotorIndex + 1}`;
    pivot.position.copy(group.center);
    parent.add(pivot);
    rotors.push(pivot);

    group.components.forEach((component) => {
      const mesh = new THREE.Mesh(
        componentGeometry(
          propellerMesh!.geometry,
          component.triangleIndices,
          group.center,
        ),
        propellerMesh!.material,
      );
      mesh.castShadow = propellerMesh!.castShadow;
      mesh.receiveShadow = propellerMesh!.receiveShadow;
      pivot.add(mesh);
    });
  });

  propellerMesh.visible = false;
}

function frameModel(model: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(modelCenter);
  modelHeight = Math.max(size.y, 0.001);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const dist = ((maxDim / 2) * 1.3) / Math.tan(fovRad / 2);

  camera.position.set(
    modelCenter.x - dist * 0.46,
    modelCenter.y + size.y * 1.65,
    modelCenter.z - dist * 0.72,
  );
  camera.lookAt(modelCenter.x, modelCenter.y - size.y * 0.12, modelCenter.z);
  camera.near = dist * 0.01;
  camera.far = dist * 12;
  camera.updateProjectionMatrix();
}

loader.load(
  `${import.meta.env.BASE_URL}assets/main/drone.glb`,
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

    splitPropellers(model);
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
      DRONE_BASE_YAW +
      Math.sin(elapsed * 0.34) * 0.18 +
      Math.sin(elapsed * 0.9) * 0.035;
    droneRoot.rotation.x = Math.sin(elapsed * 0.75) * 0.045;
    droneRoot.rotation.z = Math.sin(elapsed * 0.58) * 0.055;

    rotors.forEach((rotor, index) => {
      rotor.rotation.y += dt * (index % 2 === 0 ? 12 : -12);
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
