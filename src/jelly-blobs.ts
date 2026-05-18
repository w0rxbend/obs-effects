import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ── Renderer — transparent background for OBS overlay ────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ── Scene / Camera ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(0, 0, 26);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 10;
controls.maxDistance = 55;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;

// ── Lighting ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.9));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(5, 8, 8);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffddaa, 0.8);
fillLight.position.set(-6, -4, 4);
scene.add(fillLight);

// ── Blob geometry: superellipsoid-morphed subdivided box ──────────────────────
// Box vertices morphed toward a superellipsoid (N=4.5: flat faces, smooth
// edges/corners), then wave-deformed each frame for jelly wobble.

const SEG = 22;
const SUPER_N = 4.5;
const MORPH = 0.94;

function buildBlobData(size: number): {
  geo: THREE.BoxGeometry;
  posAttr: THREE.BufferAttribute;
  restPos: Float32Array;
  shapeTarget: Float32Array;
} {
  const superR = size / 2;
  const geo = new THREE.BoxGeometry(size, size, size, SEG, SEG, SEG);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const restPos = new Float32Array(posAttr.array);
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
    const k = superR / norm;
    shapeTarget[i * 3] = nx * k;
    shapeTarget[i * 3 + 1] = ny * k;
    shapeTarget[i * 3 + 2] = nz * k;
  }

  return { geo, posAttr, restPos, shapeTarget };
}

function deformBlob(
  geo: THREE.BoxGeometry,
  posAttr: THREE.BufferAttribute,
  restPos: Float32Array,
  shapeTarget: Float32Array,
  t: number,
  phase: number,
  wobble: number,
): void {
  const tp = t + phase;
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
      (Math.sin(cx * 2.8 + tp * 0.38) * Math.cos(cy * 2.6 + tp * 0.27) * 0.055 +
        Math.sin(cz * 2.4 + tp * 0.46) *
          Math.cos(cx * 2.3 + tp * 0.24) *
          0.038 +
        Math.sin(cy * 2.9 + tp * 0.32) *
          Math.cos(cz * 2.7 + tp * 0.41) *
          0.028) *
      (1.0 + wobble * 2.5);
    posAttr.setXYZ(i, bx + nx * d, by + ny * d, bz + nz * d);
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
}

// ── Blob state ────────────────────────────────────────────────────────────────
type BlobState = {
  mesh: THREE.Mesh;
  geo: THREE.BoxGeometry;
  posAttr: THREE.BufferAttribute;
  restPos: Float32Array;
  shapeTarget: Float32Array;
  size: number;
  mass: number; // size^2 — heavier blobs resist impulses
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  prevVel: THREE.Vector3;
  stretch: number;
  phase: number;
  wanderFreq: THREE.Vector3;
  wanderPhase: THREE.Vector3;
  spinAxis: THREE.Vector3;
  spinRate: number;
  impulseTimer: number;
};

// 9 blobs: varied sizes (1.1–2.8) and yellow shades from pale to deep amber
const BLOB_CONFIGS = [
  { color: 0xffe640, size: 2.2, pos: new THREE.Vector3(-3.5, 2.0, 0.5) },
  { color: 0xffd020, size: 1.5, pos: new THREE.Vector3(3.0, -1.5, -0.5) },
  { color: 0xfff580, size: 2.7, pos: new THREE.Vector3(0.0, 3.2, -1.5) },
  { color: 0xffc820, size: 1.1, pos: new THREE.Vector3(-2.0, -2.5, 1.5) },
  { color: 0xffe030, size: 1.8, pos: new THREE.Vector3(3.5, 2.0, 1.0) },
  { color: 0xffb800, size: 2.8, pos: new THREE.Vector3(-1.5, 1.0, 2.5) },
  { color: 0xfff0a0, size: 1.3, pos: new THREE.Vector3(2.0, -3.0, 0.0) },
  { color: 0xffdd00, size: 2.0, pos: new THREE.Vector3(-3.0, -1.0, -2.0) },
  { color: 0xffa800, size: 1.6, pos: new THREE.Vector3(0.5, -1.5, 3.0) },
];

const blobs: BlobState[] = BLOB_CONFIGS.map((cfg, idx) => {
  const { geo, posAttr, restPos, shapeTarget } = buildBlobData(cfg.size);
  const mat = new THREE.MeshPhongMaterial({
    color: cfg.color,
    emissive: 0x110800,
    shininess: 60,
    specular: new THREE.Color(0.3, 0.28, 0.0),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(cfg.pos);
  scene.add(mesh);

  return {
    mesh,
    geo,
    posAttr,
    restPos,
    shapeTarget,
    size: cfg.size,
    mass: cfg.size * cfg.size,
    pos: cfg.pos.clone(),
    vel: new THREE.Vector3(
      (Math.random() - 0.5) * 1.0,
      (Math.random() - 0.5) * 1.0,
      (Math.random() - 0.5) * 1.0,
    ),
    prevVel: new THREE.Vector3(),
    stretch: 0,
    phase: idx * 1.3,
    wanderFreq: new THREE.Vector3(
      0.06 + Math.random() * 0.08,
      0.05 + Math.random() * 0.07,
      0.05 + Math.random() * 0.06,
    ),
    wanderPhase: new THREE.Vector3(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    ),
    spinAxis: new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize(),
    spinRate: (Math.random() > 0.5 ? 1 : -1) * (0.04 + Math.random() * 0.1),
    impulseTimer: 4.0 + Math.random() * 6.0,
  };
});

// ── Physics ───────────────────────────────────────────────────────────────────
// No gravity — blobs float and drift organically, only colliding when paths cross
const DAMPING = 0.992;
const MAX_VEL = 1.6;
const STRETCH_DECAY = 0.9;
const CONTAIN_RADIUS = 7.0;
const CONTAIN_SOFT = 4.5;
const WANDER_STR = 0.9;
const IMPULSE_MAG = 1.2;

function stepPhysics(dt: number, t: number): void {
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const bi = blobs[i],
        bj = blobs[j];
      const dx = bj.pos.x - bi.pos.x;
      const dy = bj.pos.y - bi.pos.y;
      const dz = bj.pos.z - bi.pos.z;
      const dist2 = dx * dx + dy * dy + dz * dz + 0.1;
      const dist = Math.sqrt(dist2);
      const invD = 1 / dist;
      const nx = dx * invD,
        ny = dy * invD,
        nz = dz * invD;

      // Impulse-based collision only — no gravity, blobs float freely
      const repR = (bi.size + bj.size) * 0.5 + 0.16;
      if (dist < repR) {
        const penetration = repR - dist;
        const totalMass = bi.mass + bj.mass;

        // Position correction: push blobs apart, mass-weighted (Baumgarte)
        const corrI = (penetration * 0.7 * bj.mass) / totalMass;
        const corrJ = (penetration * 0.7 * bi.mass) / totalMass;
        bi.pos.x -= nx * corrI;
        bi.pos.y -= ny * corrI;
        bi.pos.z -= nz * corrI;
        bj.pos.x += nx * corrJ;
        bj.pos.y += ny * corrJ;
        bj.pos.z += nz * corrJ;

        // Velocity impulse — only when blobs are approaching each other
        const rvn =
          (bi.vel.x - bj.vel.x) * nx +
          (bi.vel.y - bj.vel.y) * ny +
          (bi.vel.z - bj.vel.z) * nz;
        if (rvn < 0) {
          const e = 0.55; // restitution: 0=inelastic, 1=perfectly elastic
          const j = (-(1 + e) * rvn) / (1 / bi.mass + 1 / bj.mass);
          bi.vel.x += (nx * j) / bi.mass;
          bi.vel.y += (ny * j) / bi.mass;
          bi.vel.z += (nz * j) / bi.mass;
          bj.vel.x -= (nx * j) / bj.mass;
          bj.vel.y -= (ny * j) / bj.mass;
          bj.vel.z -= (nz * j) / bj.mass;
        }
      }
    }
  }

  for (const b of blobs) {
    // Sine-wave wander: three independent axes drift the blob along its own path
    const wx = Math.sin(t * b.wanderFreq.x + b.wanderPhase.x) * WANDER_STR * dt;
    const wy = Math.sin(t * b.wanderFreq.y + b.wanderPhase.y) * WANDER_STR * dt;
    const wz = Math.sin(t * b.wanderFreq.z + b.wanderPhase.z) * WANDER_STR * dt;
    b.vel.x += wx;
    b.vel.y += wy;
    b.vel.z += wz;

    // Periodic random impulse — breaks predictable orbits
    b.impulseTimer -= dt;
    if (b.impulseTimer <= 0) {
      b.vel.x += (Math.random() - 0.5) * IMPULSE_MAG;
      b.vel.y += (Math.random() - 0.5) * IMPULSE_MAG;
      b.vel.z += (Math.random() - 0.5) * IMPULSE_MAG;
      b.impulseTimer = 3.0 + Math.random() * 5.0;
    }

    const speed = b.vel.length();
    if (speed > MAX_VEL) b.vel.multiplyScalar(MAX_VEL / speed);

    b.vel.multiplyScalar(DAMPING);

    // Progressive spring — ramps up as blob leaves the soft zone,
    // hard clamp at CONTAIN_RADIUS prevents escape entirely
    const dist = b.pos.length();
    if (dist > CONTAIN_SOFT) {
      const excess = (dist - CONTAIN_SOFT) / (CONTAIN_RADIUS - CONTAIN_SOFT);
      const fac = -Math.min(excess * excess * 8.0, 14.0) * dt;
      b.vel.x += (b.pos.x / dist) * fac;
      b.vel.y += (b.pos.y / dist) * fac;
      b.vel.z += (b.pos.z / dist) * fac;
    }
    if (b.pos.length() > CONTAIN_RADIUS) {
      b.pos.setLength(CONTAIN_RADIUS);
      b.vel.multiplyScalar(-0.4);
    }

    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);

    // Idle spin — each blob tumbles on its own axis
    b.mesh.rotateOnAxis(b.spinAxis, b.spinRate * dt);

    b.stretch *= STRETCH_DECAY;
    b.prevVel.copy(b.vel);
  }
}

// ── Animation loop ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let elapsed = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  stepPhysics(dt, elapsed);

  for (const b of blobs) {
    deformBlob(
      b.geo,
      b.posAttr,
      b.restPos,
      b.shapeTarget,
      elapsed,
      b.phase,
      b.stretch,
    );
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
