import * as THREE from "three";

// ─── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ─── Scene / Camera ───────────────────────────────────────────────────────────
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  150,
);
camera.position.set(0, 11, 17);
camera.lookAt(0, 0, 0);

// ─── Lights ───────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x1a2a44, 1.2));

const sun = new THREE.DirectionalLight(0xfff0dd, 2.0);
sun.position.set(8, 14, 6);
scene.add(sun);

const rim = new THREE.DirectionalLight(0x4488bb, 0.6);
rim.position.set(-7, 3, -8);
scene.add(rim);

const glow = new THREE.PointLight(0x0066aa, 3.5, 18);
glow.position.set(0, -1.5, 0);
scene.add(glow);

// ─── Wave definitions ─────────────────────────────────────────────────────────
interface Wave {
  dx: number;
  dz: number;
  amp: number;
  freq: number;
  speed: number;
  phase: number;
}

const WAVES: Wave[] = [
  { dx: 1.0, dz: 0.55, amp: 0.13, freq: 0.65, speed: 0.62, phase: 0.0 },
  { dx: -0.6, dz: 1.0, amp: 0.09, freq: 1.05, speed: 0.88, phase: 1.5 },
  { dx: 0.75, dz: -0.8, amp: 0.065, freq: 1.55, speed: 1.18, phase: 2.8 },
  { dx: -0.45, dz: -0.55, amp: 0.04, freq: 2.2, speed: 1.65, phase: 0.7 },
  { dx: 0.3, dz: 0.95, amp: 0.028, freq: 3.1, speed: 2.0, phase: 1.9 },
  { dx: -0.9, dz: 0.3, amp: 0.018, freq: 4.2, speed: 2.6, phase: 3.4 },
];

function waveY(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of WAVES) {
    const len = Math.hypot(w.dx, w.dz);
    h +=
      w.amp *
      Math.sin(
        ((w.dx / len) * x + (w.dz / len) * z) * w.freq - t * w.speed + w.phase,
      );
  }
  return h;
}

// ─── Water geometry ───────────────────────────────────────────────────────────
const WATER_SIZE = 40;
const WATER_SEGS = 96;
const waterGeo = new THREE.PlaneGeometry(
  WATER_SIZE,
  WATER_SIZE,
  WATER_SEGS,
  WATER_SEGS,
);
waterGeo.rotateX(-Math.PI / 2);

const waterPosAttr = waterGeo.attributes.position as THREE.BufferAttribute;
const VERT_COUNT = waterPosAttr.count;

const bx = new Float32Array(VERT_COUNT);
const bz = new Float32Array(VERT_COUNT);
for (let i = 0; i < VERT_COUNT; i++) {
  bx[i] = waterPosAttr.getX(i);
  bz[i] = waterPosAttr.getZ(i);
}

const waterColors = new Float32Array(VERT_COUNT * 3);
waterGeo.setAttribute("color", new THREE.BufferAttribute(waterColors, 3));

const waterMat = new THREE.MeshPhongMaterial({
  vertexColors: true,
  specular: new THREE.Color(0.45, 0.65, 0.85),
  shininess: 140,
  transparent: true,
  opacity: 0.87,
  side: THREE.FrontSide,
  depthWrite: false,
});
const waterMesh = new THREE.Mesh(waterGeo, waterMat);
scene.add(waterMesh);

// ─── Hex island ───────────────────────────────────────────────────────────────
const HEX_R = 0.5;
const HEX_SPACING = HEX_R * 2 * 1.055;
const ISLAND_RINGS = 6;
const COLUMN_BASE = -4.0;

// Smooth radial falloff with pseudo-noise for organic terrain shape
function terrainH(q: number, r: number): number {
  const s = -(q + r);
  const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
  const t = Math.max(0, 1 - dist / (ISLAND_RINGS - 0.2));
  const smooth = t * t * (3 - 2 * t);
  const n =
    Math.sin(q * 1.83 + r * 2.17) * 0.18 +
    Math.cos(q * 2.61 - r * 1.54) * 0.12 +
    Math.sin((q - r) * 3.07 + q * 0.5) * 0.07 +
    Math.cos((q + r) * 1.4 - r * 1.8) * 0.05;
  return smooth * 2.9 + n * smooth;
}

// Colors by elevation
const C_SUBMERGED = new THREE.Color(0x152840);
const C_WATERLINE = new THREE.Color(0x263b52);
const C_ROCK = new THREE.Color(0x423848);
const C_DIRT = new THREE.Color(0x5c4830);
const C_GRASS = new THREE.Color(0x2f6028);
const C_GRASS2 = new THREE.Color(0x3a7030);
const C_STONE_TOP = new THREE.Color(0x7a7068);

function columnColor(h: number): THREE.Color {
  if (h < -0.6)
    return C_SUBMERGED.clone().lerp(C_WATERLINE, Math.min(1, (h + 2) / 1.4));
  if (h < 0.2) return C_WATERLINE.clone().lerp(C_ROCK, (h + 0.6) / 0.8);
  if (h < 0.7) return C_ROCK.clone().lerp(C_DIRT, (h - 0.2) / 0.5);
  if (h < 1.4) return C_DIRT.clone().lerp(C_GRASS, (h - 0.7) / 0.7);
  if (h < 2.2) return C_GRASS.clone().lerp(C_GRASS2, (h - 1.4) / 0.8);
  return C_GRASS2.clone().lerp(C_STONE_TOP, Math.min(1, (h - 2.2) / 0.7));
}

for (let q = -ISLAND_RINGS; q <= ISLAND_RINGS; q++) {
  for (let r = -ISLAND_RINGS; r <= ISLAND_RINGS; r++) {
    if (Math.abs(q + r) > ISLAND_RINGS) continue;

    const topY = terrainH(q, r);
    const colH = topY - COLUMN_BASE;
    const wx = HEX_SPACING * (q + r * 0.5);
    const wz = HEX_SPACING * r * Math.sqrt(3) * 0.5;

    const geo = new THREE.CylinderGeometry(HEX_R, HEX_R, colH, 6, 1, false);
    const col = columnColor(topY);

    // Darken side faces slightly vs. top for depth
    const matArr: THREE.Material[] = [
      new THREE.MeshPhongMaterial({
        color: col.clone().multiplyScalar(0.7),
        specular: new THREE.Color(0.04, 0.04, 0.06),
        shininess: topY > 1.8 ? 6 : 22,
      }),
      new THREE.MeshPhongMaterial({
        color: col,
        specular: new THREE.Color(0.06, 0.06, 0.09),
        shininess: topY > 1.8 ? 8 : 28,
      }),
      new THREE.MeshPhongMaterial({
        color: col.clone().multiplyScalar(0.72),
        specular: new THREE.Color(0.04, 0.04, 0.06),
        shininess: topY > 1.8 ? 6 : 22,
      }),
    ];

    const mesh = new THREE.Mesh(geo, matArr);
    mesh.position.set(wx, COLUMN_BASE + colH / 2, wz);
    scene.add(mesh);
  }
}

// ─── Foam particles ───────────────────────────────────────────────────────────
const FOAM_COUNT = 600;
const foamPositions = new Float32Array(FOAM_COUNT * 3);
const foamData: Array<{ x: number; z: number; phase: number; speed: number }> =
  [];

for (let i = 0; i < FOAM_COUNT; i++) {
  const r = Math.random() * WATER_SIZE * 0.45;
  const a = Math.random() * Math.PI * 2;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  foamData.push({
    x,
    z,
    phase: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 0.6,
  });
  foamPositions[i * 3] = x;
  foamPositions[i * 3 + 1] = 0;
  foamPositions[i * 3 + 2] = z;
}

const foamGeo = new THREE.BufferGeometry();
foamGeo.setAttribute("position", new THREE.BufferAttribute(foamPositions, 3));
const foamMat = new THREE.PointsMaterial({
  color: 0xaaccdd,
  size: 0.18,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});
scene.add(new THREE.Points(foamGeo, foamMat));

// ─── Reusable color objects ────────────────────────────────────────────────────
const W_DEEP = new THREE.Color(0x031624);
const W_MID = new THREE.Color(0x094c7c);
const W_SHALLOW = new THREE.Color(0x1878a2);
const W_CREST = new THREE.Color(0x5aaabf);
const tmpC = new THREE.Color();

const waterColAttr = waterGeo.attributes.color as THREE.BufferAttribute;
const foamPosAttr = foamGeo.attributes.position as THREE.BufferAttribute;

// ─── Clock & loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Camera slow orbit
  const oa = t * 0.07;
  const orbitR = 19;
  camera.position.x = Math.sin(oa) * orbitR;
  camera.position.z = Math.cos(oa) * orbitR;
  camera.position.y = 11 + Math.sin(t * 0.12) * 0.8;
  camera.lookAt(0, 0.4, 0);

  // Animate underwater glow
  glow.intensity = 3.0 + Math.sin(t * 1.3) * 0.5;

  // Update water vertices + colors
  for (let i = 0; i < VERT_COUNT; i++) {
    const x = bx[i];
    const z = bz[i];
    const y = waveY(x, z, t);
    waterPosAttr.setY(i, y);

    const ny = (y + 0.3) / 0.55;
    if (ny < 0.33) {
      tmpC.copy(W_DEEP).lerp(W_MID, ny * 3);
    } else if (ny < 0.67) {
      tmpC.copy(W_MID).lerp(W_SHALLOW, (ny - 0.33) * 3);
    } else {
      tmpC.copy(W_SHALLOW).lerp(W_CREST, Math.min(1, (ny - 0.67) * 3));
    }
    waterColAttr.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
  }
  waterPosAttr.needsUpdate = true;
  waterColAttr.needsUpdate = true;
  waterGeo.computeVertexNormals();

  // Update foam particles
  for (let i = 0; i < FOAM_COUNT; i++) {
    const d = foamData[i];
    const y = waveY(d.x, d.z, t) + 0.04;
    foamPosAttr.setY(i, y);
  }
  foamPosAttr.needsUpdate = true;

  renderer.render(scene, camera);
}

animate();

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
