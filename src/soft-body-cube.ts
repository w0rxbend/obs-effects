import * as THREE from "three";

// ── Renderer ─────────────────────────────────────────────────────────────────
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
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.z = 5.5;

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.45));

const sun = new THREE.DirectionalLight(0xfff8e8, 1.1);
sun.position.set(5, 8, 5);
scene.add(sun);

const fill = new THREE.PointLight(0xcba6f7, 3.5, 18); // mauve
fill.position.set(-5, -4, 4);
scene.add(fill);

const rim = new THREE.PointLight(0x74c7ec, 2.0, 18); // sky
rim.position.set(4, -5, -4);
scene.add(rim);

const top = new THREE.PointLight(0xa6e3a1, 1.5, 14); // green
top.position.set(0, 6, 0);
scene.add(top);

// ── Geometry ──────────────────────────────────────────────────────────────────
const SEG = 12;
const SPHERE_R = 1.25; // visual radius that roughly matches the cube's face-centre radius

const geo = new THREE.BoxGeometry(2, 2, 2, SEG, SEG, SEG);
const posAttr = geo.attributes.position as THREE.BufferAttribute;

// Snapshot cube rest positions
const cubePos = new Float32Array(posAttr.array);

// Precompute sphere target: project every cube vertex outward to SPHERE_R
const spherePos = new Float32Array(posAttr.count * 3);
for (let i = 0; i < posAttr.count; i++) {
  const ox = cubePos[i * 3];
  const oy = cubePos[i * 3 + 1];
  const oz = cubePos[i * 3 + 2];
  const len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
  spherePos[i * 3] = (ox / len) * SPHERE_R;
  spherePos[i * 3 + 1] = (oy / len) * SPHERE_R;
  spherePos[i * 3 + 2] = (oz / len) * SPHERE_R;
}

// Per-vertex colours — full hue sweep
const colBuf = new THREE.Float32BufferAttribute(posAttr.count * 3, 3);
const hc = new THREE.Color();
for (let i = 0; i < posAttr.count; i++) {
  hc.setHSL(
    ((i / posAttr.count) * 1.6 + 0.55) % 1,
    0.88,
    0.6 + Math.sin(i * 0.8) * 0.08,
  );
  colBuf.setXYZ(i, hc.r, hc.g, hc.b);
}
geo.setAttribute("color", colBuf);

const mat = new THREE.MeshPhongMaterial({
  vertexColors: true,
  shininess: 120,
  specular: new THREE.Color(0x606060),
  side: THREE.FrontSide,
});

const mesh = new THREE.Mesh(geo, mat);
scene.add(mesh);

// Cube edge wireframe — fades away as the shape morphs toward sphere
const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
const edgeMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.18,
});
const edges = new THREE.LineSegments(edgeGeo, edgeMat);
mesh.add(edges);

// ── Helpers ───────────────────────────────────────────────────────────────────
function smoothstep(x: number): number {
  return x * x * (3 - 2 * x);
}

// ── Deform + Morph ────────────────────────────────────────────────────────────
function deform(t: number, morph: number): void {
  for (let i = 0; i < posAttr.count; i++) {
    const cx = cubePos[i * 3];
    const cy = cubePos[i * 3 + 1];
    const cz = cubePos[i * 3 + 2];

    // Lerp base position between cube and sphere
    const bx = cx + (spherePos[i * 3] - cx) * morph;
    const by = cy + (spherePos[i * 3 + 1] - cy) * morph;
    const bz = cz + (spherePos[i * 3 + 2] - cz) * morph;

    // Outward unit normal of the interpolated shape
    const blen = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
    const nx = bx / blen;
    const ny = by / blen;
    const nz = bz / blen;

    // Wobble noise — always keyed on cube positions so the field is stable
    const d =
      Math.sin(cx * 4.0 + t * 1.5) * Math.cos(cy * 3.5 + t * 1.1) * 0.1 +
      Math.sin(cz * 3.2 + t * 1.8) * Math.cos(cx * 3.0 + t * 0.9) * 0.07 +
      Math.sin(cy * 3.8 + t * 1.3) * Math.cos(cz * 3.5 + t * 1.6) * 0.06 +
      Math.sin((cx + cy + cz) * 2.2 + t * 0.7) * 0.04;

    posAttr.setXYZ(i, bx + nx * d, by + ny * d, bz + nz * d);
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
}

// ── Animate ───────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  mesh.rotation.x = t * 0.38;
  mesh.rotation.y = t * 0.55;
  mesh.rotation.z = Math.sin(t * 0.22) * 0.28;

  const breathe = 1 + Math.sin(t * 1.1) * 0.025;
  mesh.scale.setScalar(breathe);

  // morph 0 = cube, 1 = sphere — period ~6 s, smoothstepped to dwell at extremes
  const raw = (Math.sin((t * Math.PI) / 3) + 1) / 2;
  const morph = smoothstep(raw);

  edgeMat.opacity = 0.18 * (1 - morph);

  deform(t, morph);
  renderer.render(scene, camera);
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
