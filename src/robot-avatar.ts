import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ── Loading overlay ───────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;align-items:center;justify-content:center",
  "color:rgba(100,220,255,0.9);font:500 13px/1 'Courier New',monospace",
  "letter-spacing:0.14em;pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.textContent = "Initializing Robot…";
document.body.appendChild(overlay);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.01,
  2000,
);

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.4);
keyLight.position.set(3, 8, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const rimL = new THREE.PointLight(0x44aaff, 5.0, 0);
scene.add(rimL);

const rimR = new THREE.PointLight(0x00ffcc, 3.5, 0);
scene.add(rimR);

const topLight = new THREE.DirectionalLight(0xaaddff, 0.35);
topLight.position.set(0, 12, 0);
scene.add(topLight);

const frontFill = new THREE.DirectionalLight(0xffffff, 0.8);
frontFill.position.set(0, 4, 10);
scene.add(frontFill);

// ── Pivot groups — populated after model loads ────────────────────────────────
// The model has no skeleton.  We sort mesh container nodes into named groups,
// then animate the groups directly.
let headGroup: THREE.Group | null = null;
let bodyGroup: THREE.Group | null = null;
let modelRoot: THREE.Object3D | null = null;
let bodyGroupInitY = 0;

// Build a pivot Group whose local origin sits at the given position in `parent`
// space.  All `objs` are moved from `parent` into the group with their world
// positions preserved.
function makePivot(
  parent: THREE.Object3D,
  objs: THREE.Object3D[],
  pivotPos: THREE.Vector3,
): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pivotPos);
  parent.add(g);
  for (const obj of objs) {
    parent.remove(obj);
    g.add(obj);
    // Shift each object so its world position stays the same after re-parenting.
    obj.position.x -= pivotPos.x;
    obj.position.y -= pivotPos.y;
    obj.position.z -= pivotPos.z;
  }
  return g;
}

// ── Load ──────────────────────────────────────────────────────────────────────
const loader = new GLTFLoader();

loader.load(
  "/assets/main/nuirter.glb",
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // Locate RootNode — all mesh containers live as its direct children.
    let rootNode: THREE.Object3D = model;
    model.traverse((o) => {
      if (o.name === "RootNode") rootNode = o;
    });
    modelRoot = rootNode;
    // Ensure world matrices are current before bbox queries below.
    model.updateWorldMatrix(true, true);

    // ── Classify direct children ──────────────────────────────────────────
    // Pass 1: sort by name where unambiguous.
    // Pass 2: for nodes that could be head- OR body-mounted (Cam*, Rec*,
    //         pnts*, Circle*) use world-space bbox centre Y vs the bottom
    //         of the definite head geometry to decide.
    const headObjs: THREE.Object3D[] = [];
    const hndObjs: THREE.Object3D[] = [];
    const bodyObjs: THREE.Object3D[] = [];
    const ambiguous: THREE.Object3D[] = [];

    for (const child of [...rootNode.children]) {
      const n = child.name;
      if (/^(head|hat_|roundcube|glass)/i.test(n)) {
        headObjs.push(child);
      } else if (/^hnd/i.test(n)) {
        hndObjs.push(child);
      } else if (/^(sh|clo|body)/i.test(n)) {
        bodyObjs.push(child);
      } else {
        // Circle.*, Cam*, Rec*, pnts* — resolved by world Y in pass 2
        ambiguous.push(child);
      }
    }

    // Neck threshold = lowest world-bbox minY across definite head nodes.
    let neckY = Infinity;
    for (const obj of headObjs) {
      const bb = new THREE.Box3().setFromObject(obj);
      if (!bb.isEmpty()) neckY = Math.min(neckY, bb.min.y);
    }
    if (!isFinite(neckY)) neckY = 0;

    for (const obj of ambiguous) {
      const bb = new THREE.Box3().setFromObject(obj);
      const cy = bb.isEmpty() ? 0 : (bb.min.y + bb.max.y) * 0.5;
      (cy >= neckY ? headObjs : bodyObjs).push(obj);
    }

    console.log(
      "[robot] head parts:",
      headObjs.length,
      "| hand parts:",
      hndObjs.length,
      "| body parts:",
      bodyObjs.length,
    );

    // ── Compute pivots ────────────────────────────────────────────────────
    // Helper: centroid of a node set by averaging their local positions.
    const centroid = (objs: THREE.Object3D[]): THREE.Vector3 => {
      const v = new THREE.Vector3();
      if (objs.length === 0) return v;
      for (const o of objs) v.add(o.position);
      return v.divideScalar(objs.length);
    };

    // Head pivot: use X/Z centroid but set Y to the MINIMUM Y of head nodes
    // (bottom of the head assembly ≈ neck joint) so the head nods from the neck.
    const headCentroid = centroid(headObjs);
    const headNeckY = headObjs.reduce(
      (mn, o) => Math.min(mn, o.position.y),
      Infinity,
    );
    const headPivotPos = new THREE.Vector3(
      headCentroid.x,
      isFinite(headNeckY) ? headNeckY : headCentroid.y,
      headCentroid.z,
    );
    if (headObjs.length > 0) {
      headGroup = makePivot(rootNode, headObjs, headPivotPos);
    }

    // Body pivot: centroid
    if (bodyObjs.length > 0) {
      bodyGroup = makePivot(rootNode, bodyObjs, centroid(bodyObjs));
    }

    // Reparent headGroup into bodyGroup so head moves with the neck/body
    if (headGroup && bodyGroup) {
      rootNode.remove(headGroup);
      bodyGroup.add(headGroup);
      headGroup.position.sub(bodyGroup.position);
    }
    bodyGroupInitY = bodyGroup?.position.y ?? 0;

    // ── Auto-frame camera ─────────────────────────────────────────────────
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const h = size.y;
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    // Bust frame: target upper chest (+10% down shift), frame ~45% of total height
    const targetY = box.min.y + h * 0.78;
    const bustH = h * 0.45;
    const dist = (bustH * 0.56) / Math.tan(fovRad / 2);

    camera.position.set(center.x + size.x * 0.04, targetY, center.z + dist);
    camera.lookAt(center.x, targetY, center.z);
    camera.near = dist * 0.01;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();

    rimL.position.set(
      center.x - h * 0.7,
      targetY + h * 0.2,
      center.z - h * 0.4,
    );
    rimR.position.set(
      center.x + h * 0.55,
      targetY - h * 0.25,
      center.z + h * 0.1,
    );
    rimL.distance = h * 4;
    rimR.distance = h * 4;

    // Slight Y rotation so the robot presents a 3/4 angle
    model.rotation.y = THREE.MathUtils.degToRad(-8);

    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
  },
  (xhr) => {
    if (xhr.total > 0) {
      overlay.textContent = `Initializing Robot… ${Math.round((xhr.loaded / xhr.total) * 100)}%`;
    }
  },
  (err) => {
    console.error("[robot] load error:", err);
    overlay.textContent = "Failed to load robot model.";
  },
);

// ── Microphone ────────────────────────────────────────────────────────────────
let micLevel = 0; // smoothed RMS [0, 1]
let micPeak = 0; // short-term peak
const micBands = { low: 0, mid: 0 }; // band energy
let sampleMic: (() => void) | null = null;

navigator.mediaDevices
  .getUserMedia({ audio: true, video: false })
  .then((stream) => {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    src.connect(analyser);
    const timeBuf = new Uint8Array(analyser.frequencyBinCount);
    const freqBuf = new Uint8Array(analyser.frequencyBinCount);
    const binHz = ctx.sampleRate / analyser.fftSize;

    sampleMic = () => {
      analyser.getByteTimeDomainData(timeBuf);
      analyser.getByteFrequencyData(freqBuf);

      let sum = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeBuf.length);
      const target = Math.min(1, rms * 16);
      micLevel += (target - micLevel) * (target > micLevel ? 0.6 : 0.1);
      micPeak = micPeak > target ? micPeak * 0.9 : target;

      const lowEnd = Math.round(300 / binHz);
      const midEnd = Math.round(3000 / binHz);
      let low = 0,
        lc = 0,
        mid = 0,
        mc = 0;
      for (let i = 0; i < freqBuf.length; i++) {
        const v = freqBuf[i] / 255;
        if (i <= lowEnd) {
          low += v;
          lc++;
        } else if (i <= midEnd) {
          mid += v;
          mc++;
        }
      }
      micBands.low = lc > 0 ? low / lc : 0;
      micBands.mid = mc > 0 ? mid / mc : 0;
    };
  })
  .catch((e) => console.warn("[robot] mic denied:", e));

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

// Persistent look-direction state — avoids frame-to-frame jumps.
let lookX = 0; // current head tilt (X rotation, nod)
let lookY = 0; // current head pan  (Y rotation, yaw)
let lookTgtX = 0;
let lookTgtY = 0;
let nextLookAt = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (sampleMic) sampleMic();

  // Nothing is animated until the model finishes loading.
  if (!modelRoot) {
    renderer.render(scene, camera);
    return;
  }

  // ── Voice detection ─────────────────────────────────────────────────────
  // smoothstep: fully silent < 0.06, fully speaking > 0.32
  const voiceLevel = THREE.MathUtils.smoothstep(micLevel, 0.06, 0.32);
  const isTalking = voiceLevel > 0.08;

  // ── Head look target — scans a wide monitor when idle ──────────────────
  if (t >= nextLookAt) {
    if (isTalking) {
      // Facing roughly forward, small syllabic jitter
      lookTgtX = (Math.random() - 0.5) * 0.09;
      lookTgtY = (Math.random() - 0.5) * 0.08;
      nextLookAt = t + 0.22 + Math.random() * 0.3;
    } else {
      // Wide-monitor scan: 55% chance of a big sweep, 45% micro-adjustment
      if (Math.random() < 0.55) {
        lookTgtX = (Math.random() - 0.5) * 0.32;
        lookTgtY = (Math.random() - 0.5) * 0.78;
      } else {
        lookTgtX = THREE.MathUtils.clamp(
          lookTgtX + (Math.random() - 0.5) * 0.18,
          -0.28,
          0.28,
        );
        lookTgtY = THREE.MathUtils.clamp(
          lookTgtY + (Math.random() - 0.5) * 0.3,
          -0.72,
          0.72,
        );
      }
      // Pause between glances: 0.8–2.2 s normal, 3–6 s long fixation
      nextLookAt =
        Math.random() < 0.18
          ? t + 3.0 + Math.random() * 3.0
          : t + 0.8 + Math.random() * 1.4;
    }
  }
  // Smooth but deliberate — slow enough to feel natural, fast enough to read
  const headLag = 2.8 + voiceLevel * 2.5;
  lookX += (lookTgtX - lookX) * dt * headLag;
  lookY += (lookTgtY - lookY) * dt * headLag;

  // Minimal residual drift so gaze targets drive the motion
  const driftY = Math.sin(t * 0.13) * 0.025 + Math.sin(t * 0.07 + 1.5) * 0.015;
  const driftX = Math.sin(t * 0.19 + 0.8) * 0.01;

  // ── Head group ──────────────────────────────────────────────────────────
  if (headGroup) {
    headGroup.rotation.x = lookX + driftX;
    headGroup.rotation.y = lookY + driftY;
    headGroup.rotation.z =
      Math.sin(t * 0.22 + 1.1) * 0.025 + voiceLevel * 0.015;
  }

  // ── Body group — breathing + rhythmic sway ───────────────────────────
  const breathAmp = 0.016 + micBands.low * 0.035;
  const breathe = Math.sin(t * 1.08) * breathAmp;
  const bodySwayY =
    Math.sin(t * 0.27) * 0.03 + Math.sin(t * 0.17 + 1.2) * 0.018;
  const bodySwayZ =
    Math.sin(t * 0.34 + 0.5) * 0.012 + Math.sin(t * 0.21 + 2.1) * 0.008;
  // Small vertical bob on the whole body
  const bodyBob = Math.sin(t * 1.08) * 0.004 * breathAmp * 80;

  if (bodyGroup) {
    bodyGroup.rotation.x = breathe * 0.5;
    bodyGroup.rotation.y = bodySwayY;
    bodyGroup.rotation.z = bodySwayZ;
    bodyGroup.position.y = bodyGroupInitY + bodyBob * 0.01;
  }

  // ── Slow body orbit so OBS viewers see a slight turntable angle ──────
  // Oscillates ±4° — never loses front-face presentation
  if (modelRoot) {
    modelRoot.rotation.y =
      THREE.MathUtils.degToRad(-8) + Math.sin(t * 0.05) * 0.07;
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
