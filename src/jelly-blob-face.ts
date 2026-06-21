import * as THREE from "three";
import { obsAudio } from "./lib";

// ── Audio ─────────────────────────────────────────────────────────────────────
void obsAudio.connect();

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ── Scene & Camera ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.z = 6.2;

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffd060, 0.85));

const key = new THREE.DirectionalLight(0xffffff, 2.7);
key.position.set(4, 6, 6);
scene.add(key);

const fill = new THREE.PointLight(0xff9933, 2.5, 22);
fill.position.set(-5, -3, 5);
scene.add(fill);

const rim = new THREE.PointLight(0xffeedd, 1.5, 18);
rim.position.set(1, 7, -4);
scene.add(rim);

// ── Blob Body ─────────────────────────────────────────────────────────────────
const blobRoot = new THREE.Group();
scene.add(blobRoot);

const SEG = 28;
const blobGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2, SEG, SEG, SEG);
const posAttr = blobGeo.attributes.position as THREE.BufferAttribute;
const restPos = new Float32Array(posAttr.array);

const MORPH = 0.94;
// Superellipsoid target: |x|^N + |y|^N + |z|^N = R^N
// N=4.5 gives a rounded cube — flat faces, smooth edges & corners, no hard angles.
const SUPER_N = 4.5;
const SUPER_R = 1.32;
const shapeTarget = new Float32Array(posAttr.count * 3);
for (let i = 0; i < posAttr.count; i++) {
  const x = restPos[i * 3],
    y = restPos[i * 3 + 1],
    z = restPos[i * 3 + 2];
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  const nx = x / len,
    ny = y / len,
    nz = z / len;
  const norm = Math.pow(
    Math.pow(Math.abs(nx), SUPER_N) +
      Math.pow(Math.abs(ny), SUPER_N) +
      Math.pow(Math.abs(nz), SUPER_N),
    1 / SUPER_N,
  );
  const k = SUPER_R / norm;
  shapeTarget[i * 3] = nx * k;
  shapeTarget[i * 3 + 1] = ny * k;
  shapeTarget[i * 3 + 2] = nz * k;
}

const blobMat = new THREE.MeshPhongMaterial({
  color: 0xffe640,
  emissive: 0x331a00,
  shininess: 88,
  specular: new THREE.Color(0.65, 0.56, 0.06),
  transparent: true,
  opacity: 0.94,
});
const blobMesh = new THREE.Mesh(blobGeo, blobMat);
blobRoot.add(blobMesh);

function deformBlob(t: number, wobble: number): void {
  for (let i = 0; i < posAttr.count; i++) {
    const cx = restPos[i * 3],
      cy = restPos[i * 3 + 1],
      cz = restPos[i * 3 + 2];
    const bx = cx + (shapeTarget[i * 3] - cx) * MORPH;
    const by = cy + (shapeTarget[i * 3 + 1] - cy) * MORPH;
    const bz = cz + (shapeTarget[i * 3 + 2] - cz) * MORPH;
    const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
    const nx = bx / len,
      ny = by / len,
      nz = bz / len;
    const d =
      (Math.sin(cx * 2.8 + t * 0.85) * Math.cos(cy * 2.6 + t * 0.62) * 0.055 +
        Math.sin(cz * 2.4 + t * 1.05) * Math.cos(cx * 2.3 + t * 0.56) * 0.038 +
        Math.sin(cy * 2.9 + t * 0.74) * Math.cos(cz * 2.7 + t * 0.92) * 0.028) *
      (1.0 + wobble * 1.8);
    posAttr.setXYZ(i, bx + nx * d, by + ny * d, bz + nz * d);
  }
  posAttr.needsUpdate = true;
  blobGeo.computeVertexNormals();
}

// ── Face Group ────────────────────────────────────────────────────────────────
const faceGroup = new THREE.Group();
faceGroup.position.z = 1.45;
faceGroup.scale.setScalar(0.62);
blobRoot.add(faceGroup);

// — Eyebrows —
function makeBrow(xOff: number): THREE.Mesh {
  const pts = [
    new THREE.Vector3(-0.18, -0.02, 0),
    new THREE.Vector3(0, 0.06, 0),
    new THREE.Vector3(0.18, -0.02, 0),
  ];
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts),
      20,
      0.038,
      8,
      false,
    ),
    new THREE.MeshPhongMaterial({ color: 0x1e1010, shininess: 15 }),
  );
  mesh.position.set(xOff, 0.74, 0);
  return mesh;
}

const leftBrow = makeBrow(-0.44);
const rightBrow = makeBrow(0.44);
faceGroup.add(leftBrow, rightBrow);

// — Eyes —
interface EyeRef {
  group: THREE.Group;
  pupil: THREE.Mesh;
}

function makeEye(xOff: number): EyeRef {
  const group = new THREE.Group();
  group.position.set(xOff, 0.3, 0);

  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.235, 28, 28),
      new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }),
    ),
  );

  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.148, 24, 24),
    new THREE.MeshPhongMaterial({ color: 0x1a1228, shininess: 40 }),
  );
  pupil.position.z = 0.16;
  group.add(pupil);

  const glint = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  glint.position.set(0.055, 0.068, 0.265);
  group.add(glint);

  return { group, pupil };
}

const leftEye = makeEye(-0.44);
const rightEye = makeEye(0.44);
faceGroup.add(leftEye.group, rightEye.group);

// — Mouth area —
const mouthGroup = new THREE.Group();
mouthGroup.position.set(0, -0.34, 0);
faceGroup.add(mouthGroup);

// Horseshoe mustache: arch across the top, two prongs hanging down each side
const mustacheMat = new THREE.MeshPhongMaterial({
  color: 0x1e1010,
  shininess: 20,
});
const mustacheCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.46, -0.24, 0),
  new THREE.Vector3(-0.46, -0.04, 0),
  new THREE.Vector3(-0.42, 0.1, 0),
  new THREE.Vector3(-0.22, 0.2, 0),
  new THREE.Vector3(0, 0.22, 0),
  new THREE.Vector3(0.22, 0.2, 0),
  new THREE.Vector3(0.42, 0.1, 0),
  new THREE.Vector3(0.46, -0.04, 0),
  new THREE.Vector3(0.46, -0.24, 0),
]);
const mustacheMesh = new THREE.Mesh(
  new THREE.TubeGeometry(mustacheCurve, 80, 0.068, 12, false),
  mustacheMat,
);
mouthGroup.add(mustacheMesh);

// Dark mouth cavity — scales open in Y when speaking
const mouthInterior = new THREE.Mesh(
  new THREE.CircleGeometry(0.3, 40),
  new THREE.MeshBasicMaterial({ color: 0x140608, side: THREE.DoubleSide }),
);
mouthInterior.position.set(0, -0.04, -0.01);
mouthInterior.scale.set(1, 0.02, 1);
mouthGroup.add(mouthInterior);

// ── Blink & Gaze ──────────────────────────────────────────────────────────────
function ss(x: number): number {
  return x * x * (3 - 2 * x);
}

let blinkTimer = 0,
  nextBlink = 2.0 + Math.random() * 1.5,
  blinkProg = 0;

function stepBlink(dt: number): void {
  nextBlink -= dt;
  if (nextBlink <= 0 && blinkTimer <= 0) {
    blinkTimer = 0.18;
    nextBlink = 2.0 + Math.random() * 2.5;
  }
  blinkTimer = Math.max(0, blinkTimer - dt);
  if (blinkTimer > 0) {
    const p = blinkTimer / 0.18;
    blinkProg = ss(p > 0.5 ? (1 - p) * 2 : p * 2);
  } else {
    blinkProg = 0;
  }
}

let gazeX = 0,
  gazeY = 0,
  gazeTargetX = 0,
  gazeTargetY = 0,
  nextGaze = 1.5;

function stepGaze(dt: number): void {
  nextGaze -= dt;
  if (nextGaze <= 0) {
    gazeTargetX = (Math.random() - 0.5) * 0.18;
    gazeTargetY = (Math.random() - 0.5) * 0.08;
    nextGaze = 1.5 + Math.random() * 2.0;
  }
  const e = 1 - Math.exp(-dt * 5.5);
  gazeX += (gazeTargetX - gazeX) * e;
  gazeY += (gazeTargetY - gazeY) * e;
}

// ── Animate ───────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let t = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  obsAudio.update(dt);
  const smoothVol = obsAudio.level;
  const smoothMid = obsAudio.mid;

  // Body sway & breathe — no full rotation so face stays front-facing
  blobRoot.position.y = Math.sin(t * 1.1) * 0.13 + Math.cos(t * 0.68) * 0.055;
  blobRoot.rotation.y = Math.sin(t * 0.42) * 0.11;
  blobRoot.rotation.z = Math.sin(t * 0.37) * 0.055;
  blobRoot.scale.setScalar(
    (1 + Math.sin(t * 1.15) * 0.022) * (1 + smoothVol * 0.09),
  );

  deformBlob(t, smoothVol * 0.9);

  // Blink
  stepBlink(dt);
  const eyeOpenY = 1 - blinkProg;
  const eyeExcite = 1 + smoothVol * 0.18;
  leftEye.group.scale.set(eyeExcite, eyeOpenY * eyeExcite, eyeExcite);
  rightEye.group.scale.set(eyeExcite, eyeOpenY * eyeExcite, eyeExcite);

  // Gaze
  stepGaze(dt);
  leftEye.pupil.position.set(gazeX * 0.06, gazeY * 0.045, 0.16);
  rightEye.pupil.position.set(gazeX * 0.06, gazeY * 0.045, 0.16);

  // Brows raise with excitement
  const browLift = smoothVol * 0.22;
  leftBrow.position.y = 0.74 + browLift;
  rightBrow.position.y = 0.74 + browLift;

  const mouthOpen = Math.min(1, smoothMid * 5.0);
  mouthInterior.scale.set(1, mouthOpen * 0.8, 1);

  renderer.render(scene, camera);
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
