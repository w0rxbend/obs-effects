import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createThreeScene } from "./lib";
import { obsAudio } from "./lib";

const MODEL_URL =
  "/assets/main/dji-fpv/source/e4e0a592c53ea71bfc3cd948397e31a1.glb";

// Loading overlay — injected before factory creates the canvas
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

let rotorSpeed = 4;

const modelCenter = new THREE.Vector3();
const modelSize = new THREE.Vector3();
let droneRoot: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
const rotors: THREE.Object3D[] = [];
let cameraPivot: THREE.Object3D | null = null;
let cameraBindQ: THREE.Quaternion | null = null;

const _camEuler = new THREE.Euler();
const _camQuat = new THREE.Quaternion();
let camTiltCurrent = 20;
let camPanCurrent = 0;
let camTiltTarget = 20;
let camPanTarget = 0;
let camNextChange = 0;
let elapsed = 0;

function updateRotorSpeed(dt: number): void {
  const IDLE = 4;
  const MAX = 55;
  const level = obsAudio.level;
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

function pickNextGimbalTarget(now: number): void {
  camTiltTarget = 5 + Math.random() * 48;
  camPanTarget = (Math.random() - 0.5) * 36;
  camNextChange = now + 2.5 + Math.random() * 2.5;
}

void createThreeScene({
  shadowMap: "PCF",
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.15,
  outputColorSpace: THREE.SRGBColorSpace,
  camera: { fov: 38, near: 0.001, far: 500 },
  controls: "orbit",
  orbitOptions: {
    damping: 0.07,
    enablePan: false,
    polarMin: THREE.MathUtils.degToRad(10),
    polarMax: THREE.MathUtils.degToRad(130),
  },
  loop: "performance",
  audio: true,
  onInit: (ctx) => {
    document.body.style.background = "transparent";
    document.body.style.cursor = "grab";

    if (ctx.controls) {
      ctx.controls.rotateSpeed = 0.55;
      ctx.controls.zoomSpeed = 0.8;
    }

    // Lighting — cool tech palette
    ctx.scene.add(new THREE.AmbientLight(0xd0eeff, 0.85));

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(4, 7, 6);
    keyLight.castShadow = true;
    ctx.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7fc8ff, 1.6);
    fillLight.position.set(-6, 3, 3);
    ctx.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffd580, 1.2);
    rimLight.position.set(2, 1, -7);
    ctx.scene.add(rimLight);

    const underGlow = new THREE.PointLight(0x40c0ff, 2.2, 20);
    underGlow.position.set(0, -3, 2);
    ctx.scene.add(underGlow);

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
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
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

        ctx.scene.add(model);

        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
        }

        const box = new THREE.Box3().setFromObject(model);
        box.getCenter(modelCenter);
        box.getSize(modelSize);

        const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
        const fovRad = THREE.MathUtils.degToRad(ctx.camera.fov);
        const dist = ((maxDim / 2) * 1.55) / Math.tan(fovRad / 2);

        ctx.camera.position.set(
          modelCenter.x + dist * 0.35,
          modelCenter.y + modelSize.y * 1.4,
          modelCenter.z + dist * 0.85,
        );
        ctx.camera.lookAt(modelCenter.x, modelCenter.y, modelCenter.z);
        ctx.camera.near = dist * 0.005;
        ctx.camera.far = dist * 15;
        ctx.camera.updateProjectionMatrix();

        if (ctx.controls) {
          ctx.controls.target.copy(modelCenter);
          ctx.controls.minDistance = dist * 0.35;
          ctx.controls.maxDistance = dist * 3.5;
          ctx.controls.update();
        }

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

    ctx.renderer.domElement.addEventListener("pointerdown", () => {
      document.body.style.cursor = "grabbing";
    });
    window.addEventListener("pointerup", () => {
      document.body.style.cursor = "grab";
    });
  },
  onFrame: (_ctx, dt) => {
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
    camPanCurrent +=
      (camPanTarget - camPanCurrent) * Math.min(1, dt * lerpSpeed);

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
  },
});
