import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.style.cssText = "margin:0;overflow:hidden;background:#000";
document.body.appendChild(renderer.domElement);

// ── Scene / Camera ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);
camera.position.set(0, 80, 180);

// ── Lighting ──────────────────────────────────────────────────────────────────
// decay=0 keeps all planets uniformly lit regardless of orbital distance
scene.add(new THREE.PointLight(0xfff8e0, 6.0, 0, 0));
scene.add(new THREE.AmbientLight(0x223355, 0.6));

// ── Starfield ─────────────────────────────────────────────────────────────────
{
  const N = 8000;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = THREE.MathUtils.randFloat(400, 2000);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(
    new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.5,
        sizeAttenuation: true,
      }),
    ),
  );
}

// ── Rim-glow helper (BackSide + AdditiveBlending, unit sphere) ────────────────
const RIM_VERT = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function makeRimGlow(color: THREE.Color, rimPow = 3.0): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 32),
    new THREE.ShaderMaterial({
      vertexShader: RIM_VERT,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 glowColor;
        uniform float rimPow;
        void main() {
          float b = clamp(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
          gl_FragColor = vec4(glowColor, pow(b, rimPow));
        }`,
      uniforms: { glowColor: { value: color }, rimPow: { value: rimPow } },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
}

// ── Sun ───────────────────────────────────────────────────────────────────────
const SUN_R = 5;
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_R, 64, 64),
  new THREE.MeshStandardMaterial({
    color: 0xffee80,
    emissive: 0xffcc00,
    emissiveIntensity: 3.5,
    roughness: 1,
    metalness: 0,
  }),
);
scene.add(sunMesh);

const sunCorona = makeRimGlow(new THREE.Color(1.0, 0.65, 0.1), 1.5);
sunCorona.scale.setScalar(SUN_R * 2.5);
scene.add(sunCorona);

// ── Orbit line ────────────────────────────────────────────────────────────────
function orbitLine(r: number): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({
      color: 0x1a2a3a,
      transparent: true,
      opacity: 0.5,
    }),
  );
}

// ── Orbital mechanics ─────────────────────────────────────────────────────────
// Earth orbits in EARTH_PERIOD real seconds; others scale by Kepler a^(3/2).
const EARTH_ORBIT = 48;
const EARTH_PERIOD = 30;
const BASE_W = (Math.PI * 2) / EARTH_PERIOD;
const kw = (a: number) => BASE_W * Math.pow(EARTH_ORBIT / a, 1.5);

// ── Planet definitions ────────────────────────────────────────────────────────
interface PlanetDef {
  r: number;
  orbit: number;
  omega: number;
  color: number;
  roughness: number;
  metalness?: number;
  rings?: boolean;
  moon?: boolean;
}

const DEFS: PlanetDef[] = [
  { r: 0.35, orbit: 22, omega: kw(22), color: 0xaaaaaa, roughness: 0.8 },
  { r: 0.7, orbit: 34, omega: kw(34), color: 0xf0b030, roughness: 0.7 },
  {
    r: 0.75,
    orbit: 48,
    omega: kw(48),
    color: 0x2878e8,
    roughness: 0.55,
    moon: true,
  },
  { r: 0.5, orbit: 68, omega: kw(68), color: 0xe03010, roughness: 0.85 },
  { r: 2.2, orbit: 125, omega: kw(125), color: 0xf09040, roughness: 0.55 },
  {
    r: 1.9,
    orbit: 170,
    omega: kw(170),
    color: 0xf8e060,
    roughness: 0.6,
    rings: true,
  },
  {
    r: 1.3,
    orbit: 218,
    omega: kw(218),
    color: 0x40e8f8,
    roughness: 0.4,
    metalness: 0.2,
  },
  {
    r: 1.25,
    orbit: 263,
    omega: kw(263),
    color: 0x2040f8,
    roughness: 0.4,
    metalness: 0.2,
  },
];

type PEntry = {
  mesh: THREE.Mesh;
  def: PlanetDef;
  angle: number;
  moonPivot?: THREE.Object3D;
};
const planets: PEntry[] = [];

for (const def of DEFS) {
  scene.add(orbitLine(def.orbit));

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(def.r, 64, 64),
    new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: def.roughness,
      metalness: def.metalness ?? 0,
    }),
  );
  const a0 = Math.random() * Math.PI * 2;
  mesh.position.set(Math.cos(a0) * def.orbit, 0, Math.sin(a0) * def.orbit);
  scene.add(mesh);

  if (def.rings) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(def.r * 1.4, def.r * 2.7, 128),
      new THREE.MeshBasicMaterial({
        color: 0xe0d090,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    mesh.add(ring);
  }

  let moonPivot: THREE.Object3D | undefined;
  if (def.moon) {
    moonPivot = new THREE.Object3D();
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9 }),
    );
    moonMesh.position.set(def.r * 2.5, 0, 0);
    moonPivot.add(moonMesh);
    mesh.add(moonPivot);
  }

  planets.push({ mesh, def, angle: a0, moonPivot });
}

// ── Asteroid belt (instanced) ─────────────────────────────────────────────────
{
  const N = 3000;
  const belt = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.06, 0),
    new THREE.MeshStandardMaterial({ color: 0x776655, roughness: 0.95 }),
    N,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = THREE.MathUtils.randFloat(82, 105);
    dummy.position.set(
      Math.cos(a) * r,
      THREE.MathUtils.randFloat(-0.35, 0.35),
      Math.sin(a) * r,
    );
    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
    dummy.scale.setScalar(THREE.MathUtils.randFloat(0.4, 2.8));
    dummy.updateMatrix();
    belt.setMatrixAt(i, dummy.matrix);
  }
  belt.instanceMatrix.needsUpdate = true;
  scene.add(belt);
}

// ── Camera controls ───────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 700;

// ── Post-processing ───────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2, // strength
    0.8, // radius
    0.6, // threshold — sun's emissive 3.5 >> 0.6, planets stay clean
  ),
);

// ── Animation ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const MOON_W = BASE_W * 13.4; // Moon orbits ~13.4× faster than Earth

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  sunMesh.rotation.y += dt * 0.04;

  for (const p of planets) {
    p.angle += p.def.omega * dt;
    p.mesh.position.set(
      Math.cos(p.angle) * p.def.orbit,
      0,
      Math.sin(p.angle) * p.def.orbit,
    );
    p.mesh.rotation.y += dt * 0.3;
    if (p.moonPivot) p.moonPivot.rotation.y += MOON_W * dt;
  }

  controls.update();
  composer.render();
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
