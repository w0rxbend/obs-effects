import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

// ── Loading overlay ───────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed;inset:0;display:flex;align-items:center;justify-content:center",
  "color:rgba(137,220,235,0.9);font:500 13px/1 'Courier New',monospace",
  "letter-spacing:0.12em;pointer-events:none;transition:opacity 0.8s ease",
].join(";");
overlay.textContent = "Loading city…";
document.body.appendChild(overlay);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
// Wide FOV feels like a drone camera
const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  100000,
);

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xcce0ff, 0.75));

const sun = new THREE.DirectionalLight(0xfff4d6, 1.5);
sun.position.set(1, 2, 1.5);
scene.add(sun);

const fill = new THREE.DirectionalLight(0x4488ff, 0.4);
fill.position.set(-1, 0.5, -1);
scene.add(fill);

scene.add(new THREE.HemisphereLight(0x88bbff, 0x223322, 0.3));

// ── Drone flight parameters (set after model loads) ──────────────────────────
let orbitR = 1;
let orbitH = 1;
let cityH = 1;
let ready = false;

// ── Load ──────────────────────────────────────────────────────────────────────
const loader = new FBXLoader();
loader.setResourcePath("/assets/main/");

loader.load(
  "/assets/main/tq3280_hd_zero.fbx",
  (fbx) => {
    const box = new THREE.Box3().setFromObject(fbx);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    // Centre model at world origin
    fbx.position.sub(center);
    scene.add(fbx);

    const footprint = Math.max(size.x, size.z);
    cityH = size.y;

    // Drone flies at ~70 % of building height, orbits at 55 % of footprint
    orbitR = footprint * 0.55;
    orbitH = cityH * 0.7;

    camera.near = footprint * 0.001;
    camera.far = footprint * 10;
    camera.updateProjectionMatrix();

    sun.position.set(footprint * 0.8, cityH * 2, footprint * 0.6);

    // Place camera at start position before first frame
    camera.position.set(orbitR, orbitH, 0);
    camera.lookAt(0, cityH * 0.15, 0);

    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 900);
    ready = true;
  },
  (xhr) => {
    if (xhr.total > 0)
      overlay.textContent = `Loading city… ${Math.round((xhr.loaded / xhr.total) * 100)}%`;
  },
  (err) => {
    console.error(err);
    overlay.textContent = "Failed to load model.";
  },
);

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (ready) {
    // Drone orbit — full lap every 80 s, slightly elliptical path
    const angle = t * ((Math.PI * 2) / 80);
    const rx = orbitR * 1.0;
    const rz = orbitR * 0.82; // ellipse gives parallax variation

    const px = Math.cos(angle) * rx;
    const pz = Math.sin(angle) * rz;

    // Altitude gently oscillates ±12 % so it dips and climbs naturally
    const py = orbitH + Math.sin(t * 0.28) * orbitH * 0.12;

    camera.position.set(px, py, pz);

    // Look at a point slightly ahead in the orbit direction and near rooftop level
    const ahead = angle + 0.35;
    const tx = Math.cos(ahead) * rx * 0.25;
    const tz = Math.sin(ahead) * rz * 0.25;
    camera.lookAt(tx, cityH * 0.15, tz);
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
