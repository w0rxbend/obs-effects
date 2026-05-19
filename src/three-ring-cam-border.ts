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
let aspect = window.innerWidth / window.innerHeight;
const H = 1.05;
const camera = new THREE.OrthographicCamera(
  -H * aspect,
  H * aspect,
  H,
  -H,
  0.1,
  20,
);
camera.position.z = 6;

// ─── Constants ────────────────────────────────────────────────────────────────
const RING_R = 0.84;
const RING_SEGS = 180;
const TUBE_SEGS = 10;
const T2 = Math.PI * 2;

// ─── Root group (unified 3-D tilt) ────────────────────────────────────────────
const root = new THREE.Group();
scene.add(root);

// ─── Geometry helpers ─────────────────────────────────────────────────────────
type WaveDef = [amp: number, freq: number, speed: number];

function makeTorBuf(rSegs: number, tSegs: number): THREE.BufferGeometry {
  const vc = (rSegs + 1) * (tSegs + 1);
  const idx: number[] = [];
  for (let i = 0; i < rSegs; i++) {
    for (let j = 0; j < tSegs; j++) {
      const a = i * (tSegs + 1) + j;
      const b = a + tSegs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vc * 3), 3),
  );
  geo.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(vc * 3), 3),
  );
  return geo;
}

// Writes an arc from theta0..theta1 into a torus geometry.
// Full ring: theta1 = theta0 + T2.
function writeArc(
  geo: THREE.BufferGeometry,
  Rmaj: number,
  rmin: number,
  rSegs: number,
  tSegs: number,
  theta0: number,
  theta1: number,
  t: number,
  radW: WaveDef[],
  zW: WaveDef[],
  hue0: number,
  hueDelta: number,
  sat: number,
  lit: number,
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let i = 0; i <= rSegs; i++) {
    const theta = theta0 + (i / rSegs) * (theta1 - theta0);
    let dR = 0,
      dZ = 0;
    for (const [a, f, s] of radW) dR += Math.sin(f * theta - s * t) * a;
    for (const [a, f, s] of zW) dZ += Math.cos(f * theta - s * t) * a;
    const Re = Rmaj + dR;
    const hue = (((hue0 + (i / rSegs) * hueDelta + t * 0.05) % 1) + 1) % 1;
    c.setHSL(hue, sat, Math.min(0.98, lit + Math.abs(dR) * 4));
    for (let j = 0; j <= tSegs; j++) {
      const phi = (j / tSegs) * T2;
      const vi = i * (tSegs + 1) + j;
      const ct = Math.cos(theta),
        st = Math.sin(theta);
      const cp = Math.cos(phi),
        sp = Math.sin(phi);
      pos.setXYZ(
        vi,
        (Re + rmin * cp) * ct,
        (Re + rmin * cp) * st,
        rmin * sp + dZ,
      );
      col.setXYZ(vi, c.r, c.g, c.b);
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

// ─── Three torus rings ────────────────────────────────────────────────────────
const outerGeo = makeTorBuf(RING_SEGS, 8);
root.add(
  new THREE.Mesh(
    outerGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ),
);

const mainGeo = makeTorBuf(RING_SEGS, TUBE_SEGS);
root.add(
  new THREE.Mesh(mainGeo, new THREE.MeshBasicMaterial({ vertexColors: true })),
);

const coreGeo = makeTorBuf(RING_SEGS, 6);
root.add(
  new THREE.Mesh(
    coreGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ),
);

// ─── Orbiting arc segments ────────────────────────────────────────────────────
const NUM_ORBITERS = 6;
const orbitGeos: THREE.BufferGeometry[] = [];
const orbitData = Array.from({ length: NUM_ORBITERS }, (_, i) => ({
  speed: 0.18 + i * 0.07,
  phase: (i / NUM_ORBITERS) * T2,
  span: (0.08 + 0.04 * (i % 3)) * T2,
  radius: RING_R + (i % 2 === 0 ? 0.078 : -0.068),
  hue: i / NUM_ORBITERS,
}));
for (let i = 0; i < NUM_ORBITERS; i++) {
  const geo = makeTorBuf(24, 4);
  orbitGeos.push(geo);
  root.add(
    new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
}

// ─── Lightning bolts ──────────────────────────────────────────────────────────
const BOLT_SEGS = 20;
interface Bolt {
  geo: THREE.BufferGeometry;
  mat: THREE.LineBasicMaterial;
  life: number;
  decay: number;
  active: boolean;
}
const bolts: Bolt[] = Array.from({ length: 10 }, () => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(BOLT_SEGS * 3), 3),
  );
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  root.add(new THREE.Line(geo, mat));
  return { geo, mat, life: 0, decay: 2, active: false };
});

function spawnBolt(): void {
  const b = bolts.find((x) => !x.active);
  if (!b) return;
  const t0 = Math.random() * T2;
  const span = (0.25 + Math.random() * 0.45) * T2;
  const t1 = t0 + (Math.random() > 0.5 ? 1 : -1) * span;
  const pos = b.geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < BOLT_SEGS; i++) {
    const frac = i / (BOLT_SEGS - 1);
    const theta = t0 + (t1 - t0) * frac;
    const jitter =
      i > 0 && i < BOLT_SEGS - 1 ? (Math.random() - 0.5) * 0.072 : 0;
    const zj = (Math.random() - 0.5) * 0.055;
    pos.setXYZ(
      i,
      (RING_R + jitter) * Math.cos(theta),
      (RING_R + jitter) * Math.sin(theta),
      zj,
    );
  }
  pos.needsUpdate = true;
  b.geo.setDrawRange(0, BOLT_SEGS);
  b.mat.color.setHSL(0.5 + Math.random() * 0.15, 1, 0.88);
  b.life = 1;
  b.decay = 1.5 + Math.random() * 2.0;
  b.active = true;
}

// ─── Radial spikes ────────────────────────────────────────────────────────────
interface Spike {
  geo: THREE.BufferGeometry;
  mat: THREE.LineBasicMaterial;
  life: number;
  decay: number;
  active: boolean;
}
const spikes: Spike[] = Array.from({ length: 16 }, () => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(6), 3),
  );
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  root.add(new THREE.Line(geo, mat));
  return { geo, mat, life: 0, decay: 3, active: false };
});

function spawnSpike(): void {
  const s = spikes.find((x) => !x.active);
  if (!s) return;
  const theta = Math.random() * T2;
  const ct = Math.cos(theta),
    st = Math.sin(theta);
  const z0 = (Math.random() - 0.5) * 0.04;
  const len = 0.06 + Math.random() * 0.1;
  const pos = s.geo.attributes.position as THREE.BufferAttribute;
  pos.setXYZ(0, RING_R * ct, RING_R * st, z0);
  pos.setXYZ(
    1,
    (RING_R + len) * ct,
    (RING_R + len) * st,
    z0 + (Math.random() - 0.5) * 0.05,
  );
  pos.needsUpdate = true;
  s.geo.setDrawRange(0, 2);
  s.mat.color.setHSL(Math.random(), 1, 0.95);
  s.life = 1;
  s.decay = 3 + Math.random() * 3;
  s.active = true;
}

// ─── Spark particles ──────────────────────────────────────────────────────────
interface Spark {
  theta: number;
  r: number;
  z: number;
  vr: number;
  vz: number;
  vt: number;
  age: number;
  decay: number;
  hue: number;
}
const NSPARKS = 420;
const sparkPool: Spark[] = Array.from({ length: NSPARKS }, () => ({
  theta: Math.random() * T2,
  r: RING_R,
  z: 0,
  vr: (Math.random() - 0.5) * 0.1,
  vz: (Math.random() - 0.5) * 0.05,
  vt: (Math.random() - 0.5) * 0.6,
  age: Math.random(),
  decay: 0.5 + Math.random() * 0.8,
  hue: Math.random(),
}));

const sparkPos = new Float32Array(NSPARKS * 3);
const sparkCol = new Float32Array(NSPARKS * 3);
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
root.add(
  new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      size: 0.018,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  ),
);
const sparkC = new THREE.Color();

function resetSpark(s: Spark): void {
  s.theta = Math.random() * T2;
  s.r = RING_R + (Math.random() - 0.5) * 0.03;
  s.z = (Math.random() - 0.5) * 0.02;
  s.vr = (Math.random() - 0.5) * 0.12;
  s.vz = (Math.random() - 0.5) * 0.05;
  s.vt = (Math.random() - 0.5) * 0.8;
  s.age = 0;
  s.decay = 0.4 + Math.random() * 1.0;
  s.hue = Math.random();
}

// ─── Clock & spawn timers ─────────────────────────────────────────────────────
const clock = new THREE.Clock();
let prevT = 0,
  nextBolt = 0,
  nextSpike = 0;

// ─── Animation loop ───────────────────────────────────────────────────────────
function animate(): void {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(t - prevT, 0.05);
  prevT = t;

  // Subtle 3-D tilt reveals depth
  root.rotation.x = Math.sin(t * 0.16) * 0.18;
  root.rotation.y = Math.cos(t * 0.12) * 0.12;

  // ── Torus rings ───────────────────────────────────────────────────────────
  writeArc(
    outerGeo,
    RING_R + 0.045,
    0.09,
    RING_SEGS,
    8,
    0,
    T2,
    t,
    [
      [0.04, 4, 2.0],
      [0.018, 9, 3.2],
    ],
    [[0.028, 3, 1.6]],
    0.55,
    0.28,
    0.9,
    0.38,
  );
  writeArc(
    mainGeo,
    RING_R,
    0.052,
    RING_SEGS,
    TUBE_SEGS,
    0,
    T2,
    t,
    [
      [0.028, 5, 2.8],
      [0.014, 11, 4.5],
      [0.007, 19, 7.0],
    ],
    [
      [0.022, 4, 2.1],
      [0.011, 8, 3.8],
    ],
    0.5,
    0.32,
    0.92,
    0.48,
  );
  writeArc(
    coreGeo,
    RING_R - 0.058,
    0.02,
    RING_SEGS,
    6,
    0,
    T2,
    t,
    [
      [0.018, 8, 4.2],
      [0.009, 16, 6.8],
    ],
    [[0.016, 5, 3.0]],
    0.62,
    0.18,
    1.0,
    0.68,
  );

  // ── Orbiting arc segments ─────────────────────────────────────────────────
  for (let i = 0; i < NUM_ORBITERS; i++) {
    const od = orbitData[i];
    const center = od.phase + t * od.speed;
    const t0 = center - od.span / 2;
    const t1 = center + od.span / 2;
    const h = (od.hue + t * 0.04) % 1;
    writeArc(
      orbitGeos[i],
      od.radius,
      0.014,
      24,
      4,
      t0,
      t1,
      t,
      [[0.01, 3, 2.0]],
      [[0.012, 2, 1.8]],
      h,
      0.08,
      0.95,
      0.58,
    );
  }

  // ── Lightning bolts ───────────────────────────────────────────────────────
  if (t >= nextBolt) {
    spawnBolt();
    nextBolt = t + 0.3 + Math.random() * 0.6;
  }
  for (const b of bolts) {
    if (!b.active) continue;
    b.life -= b.decay * dt;
    b.mat.opacity = Math.max(0, b.life) * 0.88;
    if (b.life <= 0) {
      b.active = false;
      b.geo.setDrawRange(0, 0);
    }
  }

  // ── Spikes ────────────────────────────────────────────────────────────────
  if (t >= nextSpike) {
    const burst = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < burst; k++) spawnSpike();
    nextSpike = t + 0.15 + Math.random() * 0.35;
  }
  for (const s of spikes) {
    if (!s.active) continue;
    s.life -= s.decay * dt;
    s.mat.opacity = Math.max(0, s.life);
    if (s.life <= 0) {
      s.active = false;
      s.geo.setDrawRange(0, 0);
    }
  }

  // ── Sparks ────────────────────────────────────────────────────────────────
  const sPosAttr = sparkGeo.attributes.position as THREE.BufferAttribute;
  const sColAttr = sparkGeo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < NSPARKS; i++) {
    const s = sparkPool[i];
    s.age += s.decay * dt;
    if (s.age >= 1) resetSpark(s);
    const fade = Math.sin(s.age * Math.PI);
    s.r += s.vr * dt;
    s.z += s.vz * dt;
    s.theta += s.vt * dt;
    sPosAttr.setXYZ(i, s.r * Math.cos(s.theta), s.r * Math.sin(s.theta), s.z);
    sparkC.setHSL(s.hue, 1, 0.65 + 0.35 * fade);
    sColAttr.setXYZ(i, sparkC.r * fade, sparkC.g * fade, sparkC.b * fade);
  }
  sPosAttr.needsUpdate = true;
  sColAttr.needsUpdate = true;

  renderer.render(scene, camera);
}

animate();

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  aspect = window.innerWidth / window.innerHeight;
  camera.left = -H * aspect;
  camera.right = H * aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
