import * as THREE from "three";

// ─── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ─── Scene / Camera ───────────────────────────────────────────────────────────
const scene = new THREE.Scene();
// Perspective: foreshortening makes the 3-D jelly form obvious.
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.z = 2.8;

// ─── Lighting — static, no colour-tinting ─────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3, 5, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
fillLight.position.set(-4, -3, 3);
scene.add(fillLight);

// Point light at camera position — gives clean front-facing specular highlights.
const camLight = new THREE.PointLight(0xffffff, 2.0, 12);
camLight.position.set(0, 0, 2.8);
scene.add(camLight);

// ─── Root group ───────────────────────────────────────────────────────────────
const root = new THREE.Group();
scene.add(root);

// ─── Blob constants ───────────────────────────────────────────────────────────
const RING_R = 0.9; // ring major radius
const N_BLOBS = 24; // blobs in the chain
const BLOB_SIZE = 0.22; // underlying BoxGeometry side length
const SEG = 8; // segments per box face — enough for smooth superellipsoid
const SUPER_N = 4.5; // superellipsoid exponent (flat faces, rounded edges)
const MORPH = 0.94; // blend fraction toward superellipsoid target
const T2 = Math.PI * 2;

// Spatial frequency for the wave deformation.
// Reference jelly-blobs uses freq ≈ 2.8 on blobs of size ~2.0.
// Our blobs are 0.22 units → scale up by 2.0 / 0.22 ≈ 9 so the same
// fraction of a wave is visible across the smaller blob.
const FREQ = 9.0;

// Amplitude: proportional to blob size, slightly boosted for visibility.
const AMP1 = 0.055 * (BLOB_SIZE / 2.0) * 1.8; // primary wave
const AMP2 = 0.038 * (BLOB_SIZE / 2.0) * 1.8;
const AMP3 = 0.028 * (BLOB_SIZE / 2.0) * 1.8;

// ─── Superellipsoid builder (one call per blob, at startup) ────────────────────
function buildBlob(size: number): {
  geo: THREE.BoxGeometry;
  posAttr: THREE.BufferAttribute;
  restPos: Float32Array;
  target: Float32Array;
} {
  const r = size / 2;
  const geo = new THREE.BoxGeometry(size, size, size, SEG, SEG, SEG);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const restPos = new Float32Array(posAttr.array);
  const target = new Float32Array(posAttr.count * 3);

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
    const k = r / norm;
    target[i * 3] = nx * k;
    target[i * 3 + 1] = ny * k;
    target[i * 3 + 2] = nz * k;
  }
  return { geo, posAttr, restPos, target };
}

// ─── Wave deformation (called every frame per blob) ───────────────────────────
// Identical logic to jelly-blobs.ts but with frequencies and amplitudes
// rescaled for BLOB_SIZE = 0.22 instead of ~2.0.
function deformBlob(
  geo: THREE.BoxGeometry,
  posAttr: THREE.BufferAttribute,
  restPos: Float32Array,
  target: Float32Array,
  t: number,
  phase: number,
  wobble: number,
): void {
  const tp = t + phase;
  for (let i = 0; i < posAttr.count; i++) {
    const cx = restPos[i * 3],
      cy = restPos[i * 3 + 1],
      cz = restPos[i * 3 + 2];
    const bx = cx + (target[i * 3] - cx) * MORPH;
    const by = cy + (target[i * 3 + 1] - cy) * MORPH;
    const bz = cz + (target[i * 3 + 2] - cz) * MORPH;
    const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
    const nx = bx / len,
      ny = by / len,
      nz = bz / len;
    const d =
      (Math.sin(cx * 2.8 * FREQ + tp * 0.95) *
        Math.cos(cy * 2.6 * FREQ + tp * 0.68) *
        AMP1 +
        Math.sin(cz * 2.4 * FREQ + tp * 1.15) *
          Math.cos(cx * 2.3 * FREQ + tp * 0.6) *
          AMP2 +
        Math.sin(cy * 2.9 * FREQ + tp * 0.8) *
          Math.cos(cz * 2.7 * FREQ + tp * 1.03) *
          AMP3) *
      (1.0 + wobble * 2.5);
    posAttr.setXYZ(i, bx + nx * d, by + ny * d, bz + nz * d);
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
}

// ─── Build blob chain ─────────────────────────────────────────────────────────
interface Blob {
  mesh: THREE.Mesh;
  geo: THREE.BoxGeometry;
  posAttr: THREE.BufferAttribute;
  restPos: Float32Array;
  target: Float32Array;
  mat: THREE.MeshPhongMaterial;
  theta0: number;
  zPhase: number;
  phase: number;
  spinAxis: THREE.Vector3;
  spinRate: number;
}

const blobs: Blob[] = [];

for (let i = 0; i < N_BLOBS; i++) {
  const theta = (i / N_BLOBS) * T2;

  const { geo, posAttr, restPos, target } = buildBlob(BLOB_SIZE);

  const mat = new THREE.MeshPhongMaterial({
    color: 0xfed90f, // Homer Simpson yellow
    emissive: 0x1a1000,
    shininess: 55,
    specular: new THREE.Color(0.6, 0.55, 0.1),
  });

  const mesh = new THREE.Mesh(geo, mat);

  // Orient each blob so its flat faces align tangentially to the ring.
  // rotation.z = theta + π/2 maps the blob's local X onto the tangent direction.
  mesh.rotation.z = theta + Math.PI / 2;
  mesh.position.set(RING_R * Math.cos(theta), RING_R * Math.sin(theta), 0);
  root.add(mesh);

  blobs.push({
    mesh,
    geo,
    posAttr,
    restPos,
    target,
    mat,
    theta0: theta,
    zPhase: (i / N_BLOBS) * T2,
    phase: i * 0.68 + Math.random() * 0.4,
    spinAxis: new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize(),
    spinRate: (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 1.2),
  });
}

// ─── Clock ────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let prevT = 0;
let ringAngle = 0;

// ─── Animation loop ───────────────────────────────────────────────────────────
function animate(): void {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(t - prevT, 0.05);
  prevT = t;

  // Continuously rotate the ring + subtle 3-D tilt to reveal blob depth.
  ringAngle += 0.25 * dt;
  root.rotation.z = ringAngle;
  root.rotation.x = Math.sin(t * 0.14) * 0.07;
  root.rotation.y = Math.cos(t * 0.1) * 0.05;

  // ── Blobs ─────────────────────────────────────────────────────────────────
  // Pulsating wobble: cycles over time so the whole chain breathes.
  const globalWobble = 0.3 + 0.25 * Math.sin(t * 1.4);

  for (const b of blobs) {
    // Z-bob: staggered phases send a ripple wave around the ring.
    const z = 0.065 * Math.sin(t * 1.35 + b.zPhase);
    b.mesh.position.set(
      RING_R * Math.cos(b.theta0),
      RING_R * Math.sin(b.theta0),
      z,
    );

    // Each blob tumbles on its own random axis.
    b.mesh.rotateOnAxis(b.spinAxis, b.spinRate * dt);

    // Per-blob wobble varies slightly around the global pulse.
    const wobble = globalWobble + 0.1 * Math.sin(t * 2.2 + b.phase);
    deformBlob(b.geo, b.posAttr, b.restPos, b.target, t, b.phase, wobble);
  }

  renderer.render(scene, camera);
}

animate();

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
