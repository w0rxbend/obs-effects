import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import fontJSON from "three/examples/fonts/helvetiker_bold.typeface.json";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
document.body.style.cssText =
  "margin:0;overflow:hidden;background:transparent;";
document.body.appendChild(renderer.domElement);

// ── Scene & Camera ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 0, 17);

// ── IBL — kept minimal so it doesn't wash out the blood-red palette ───────────
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
pmrem.dispose();

// ── Lights — dark-blood red spectrum ─────────────────────────────────────────
// Dark red ambient — shadows stay blood-tinted, not dead black
scene.add(new THREE.AmbientLight(0x2a0000, 5.0));

// Key — pure saturated red, drives the dominant specular flash
const keyLight = new THREE.PointLight(0xff0000, 280, 44);
keyLight.position.set(7, 4, 9);
scene.add(keyLight);

// Fill — rich crimson from the opposite side
const fillLight = new THREE.PointLight(0xcc0000, 160, 36);
fillLight.position.set(-7, -2, 7);
scene.add(fillLight);

// Rim — dark red, traces the bevel silhouette
const rimLight = new THREE.PointLight(0x550000, 100, 28);
rimLight.position.set(1, -7, -5);
scene.add(rimLight);

// Ember — deep orange-red warmth from below
const emberLight = new THREE.PointLight(0xff3300, 90, 26);
emberLight.position.set(-3, -5, 2);
scene.add(emberLight);

// ── Geometry ──────────────────────────────────────────────────────────────────
const font = new FontLoader().parse(fontJSON);

const textGeo = new TextGeometry("WORXBEND", {
  font,
  size: 1.58,
  depth: 0.55,
  curveSegments: 20,
  bevelEnabled: true,
  bevelThickness: 0.24,
  bevelSize: 0.13,
  bevelOffset: 0,
  bevelSegments: 14,
});

textGeo.computeBoundingBox();
const bb = textGeo.boundingBox!;
textGeo.translate(-(bb.max.x - bb.min.x) / 2, -(bb.max.y - bb.min.y) / 2, 0);

const posAttr = textGeo.attributes.position as THREE.BufferAttribute;
const restPos = new Float32Array(posAttr.array as Float32Array);
const COUNT = posAttr.count;

// ── Material — dark blood red, hard gloss ─────────────────────────────────────
const material = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0x8b0000), // rich blood red — darkred
  roughness: 0.04,
  metalness: 0.18,
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,
  reflectivity: 0.95,
  emissive: new THREE.Color(0x4a0000),
  emissiveIntensity: 0.75,
  envMapIntensity: 0.06, // minimal IBL — red lights drive the look
  side: THREE.FrontSide,
});

const textMesh = new THREE.Mesh(textGeo, material);
scene.add(textMesh);

// ── Blood-red ambient halo behind text ────────────────────────────────────────
const haloCanvas = document.createElement("canvas");
haloCanvas.width = haloCanvas.height = 512;
const hctx = haloCanvas.getContext("2d")!;
const hg = hctx.createRadialGradient(256, 256, 0, 256, 256, 256);
hg.addColorStop(0, "rgba(230,0,0,0.75)");
hg.addColorStop(0.28, "rgba(180,0,0,0.38)");
hg.addColorStop(0.6, "rgba(120,0,0,0.12)");
hg.addColorStop(1, "rgba(60,0,0,0)");
hctx.fillStyle = hg;
hctx.fillRect(0, 0, 512, 512);

const halo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(haloCanvas),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  }),
);
halo.scale.set(24, 9, 1);
halo.position.set(0, 0, -0.6);
scene.add(halo);

// ── Jelly Body Physics ────────────────────────────────────────────────────────
// Spring-mass system: each vertex has independent velocity pulled toward a
// slowly-evolving target position. Displacement is keyed on rest (ox,oy) only
// so all vertices sharing the same XY footprint (front face, bevel, side wall)
// receive identical delta — mesh groups stay welded with no visible seams.
//
// K (stiffness) and D (damping) are tuned so the spring overshoots the target
// and rings back 1-2 times before settling — that's the jelly feel.

const K = 0.048; // spring stiffness — lower = more floppy / slow response
const D = 0.905; // velocity damping — higher = more viscous, less bounce
const AMP_Z = 0.14; // max depth swell amplitude
const AMP_XY = 0.042; // max lateral squish (kept small so letters stay readable)

const velX = new Float32Array(COUNT);
const velY = new Float32Array(COUNT);
const velZ = new Float32Array(COUNT);
const curX = new Float32Array(COUNT);
const curY = new Float32Array(COUNT);
const curZ = new Float32Array(COUNT);

function deform(t: number): void {
  for (let i = 0; i < COUNT; i++) {
    const ox = restPos[i * 3];
    const oy = restPos[i * 3 + 1];
    const oz = restPos[i * 3 + 2];

    // Z target — layered wave crests travelling across the surface
    const tZ =
      AMP_Z * Math.sin(ox * 2.0 + t * 1.0) * Math.cos(oy * 1.7 + t * 0.72) +
      AMP_Z *
        0.55 *
        Math.sin(oy * 2.8 + t * 1.45) *
        Math.cos(ox * 2.2 + t * 0.82) +
      AMP_Z * 0.32 * Math.sin((ox + oy) * 1.5 + t * 1.85) +
      AMP_Z *
        0.2 *
        Math.cos(ox * 3.8 + t * 2.3) *
        Math.sin(oy * 2.5 + t * 0.55);

    // XY targets — subtle lateral squish; keyed on (oy,t) and (ox,t) only
    // so every vertex at the same XY gets the same lateral pull → no seams
    const tX =
      AMP_XY * Math.sin(oy * 1.6 + t * 1.1) * Math.cos(ox * 0.7 + t * 0.68);
    const tY =
      AMP_XY *
      0.7 *
      Math.sin(ox * 1.9 + t * 0.88) *
      Math.cos(oy * 0.85 + t * 1.05);

    // Spring step: accumulate force, damp, integrate
    velZ[i] = (velZ[i] + (tZ - curZ[i]) * K) * D;
    curZ[i] += velZ[i];
    velX[i] = (velX[i] + (tX - curX[i]) * K) * D;
    curX[i] += velX[i];
    velY[i] = (velY[i] + (tY - curY[i]) * K) * D;
    curY[i] += velY[i];

    posAttr.setXYZ(i, ox + curX[i], oy + curY[i], oz + curZ[i]);
  }
  posAttr.needsUpdate = true;
  // Normals NOT recomputed — baked TextGeometry normals give clean front-face
  // hard edges and smooth bevel transitions; averaging them every frame turns
  // every triangle edge into a visible shading seam.
}

// ── Animation ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Hovering float
  textMesh.position.y = Math.sin(t * 0.5) * 0.22;

  // Gentle rocking — stays legible, no full spin
  textMesh.rotation.y = Math.sin(t * 0.26) * 0.17;
  textMesh.rotation.x = Math.sin(t * 0.36) * 0.058;

  // Subtle breathing pulse
  textMesh.scale.setScalar(1 + Math.sin(t * 0.65) * 0.018);

  // Orbit lights — sweeping specular flash across the gloss
  const lp = t * 0.3;
  keyLight.position.set(
    Math.cos(lp) * 11,
    4 + Math.sin(lp * 0.52) * 3,
    Math.sin(lp) * 7 + 6,
  );
  fillLight.position.set(
    Math.cos(lp + Math.PI) * 9,
    -2 + Math.cos(lp * 0.43) * 3,
    Math.sin(lp + Math.PI) * 6 + 4,
  );
  emberLight.position.set(
    Math.sin(lp * 0.68) * 6,
    -5 + Math.cos(lp * 0.5) * 2,
    Math.cos(lp * 0.68) * 4,
  );

  halo.position.y = textMesh.position.y;

  deform(t);
  renderer.render(scene, camera);
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
