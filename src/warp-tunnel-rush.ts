// Warp Tunnel Rush — Three.js 3-D scene
// Stylised cartoon character blasting through a cosmic pink tunnel,
// cel-shaded with GLSL toon shader + outline pass + bloom post-process.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// ── Renderer ──────────────────────────────────────────────────────────────────

const W = window.innerWidth;
const H = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W, H);
document.body.style.cssText = "margin:0;overflow:hidden;background:#1a0040";
document.body.appendChild(renderer.domElement);

// ── Scene / Camera ────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0040);

const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 120);
camera.position.set(-5.5, 2.5, 7.5);
camera.lookAt(2, -0.2, 0);

// ── Palette ───────────────────────────────────────────────────────────────────

const C_PINK = new THREE.Color(0xff1888);
const C_YELLOW = new THREE.Color(0xffee00);
const C_LAVENDER = new THREE.Color(0xb870f0);
const C_DARK = new THREE.Color(0x1a0040);
const C_PINK_SHADOW = new THREE.Color(0x8b0050);
const C_LAV_SHADOW = new THREE.Color(0x5020a0);
const C_WHITE = new THREE.Color(0xffffff);

// ── GLSL: cel / toon shader ───────────────────────────────────────────────────

const CEL_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorld  = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const CEL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uShade;
  uniform vec3 uLight;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 N   = normalize(vNormal);
    float d  = dot(N, normalize(uLight));
    // 3-step quantised diffuse
    float t  = step(-0.1, d) * 0.28 + step(0.35, d) * 0.34 + step(0.72, d) * 0.38;
    t        = clamp(t, 0.06, 1.0);
    // Rim
    vec3 V   = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(0.0, dot(N, V)), 3.5) * 0.4;
    vec3 col = mix(uShade, uColor, t) + uColor * rim;
    gl_FragColor = vec4(col, 1.0);
  }`;

function celMaterial(
  color: THREE.Color,
  shade?: THREE.Color,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CEL_VERT,
    fragmentShader: CEL_FRAG,
    uniforms: {
      uColor: { value: color.clone() },
      uShade: { value: (shade ?? color.clone().multiplyScalar(0.35)).clone() },
      uLight: { value: new THREE.Vector3(1, 1.5, 0.5) },
    },
  });
}

// ── GLSL: back-face outline ───────────────────────────────────────────────────

const OL_VERT = /* glsl */ `
  void main() {
    vec3 n   = normalize(normalMatrix * normal);
    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    pos.xyz += n * 0.045 * pos.w;
    gl_Position = pos;
  }`;

const OL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  void main() { gl_FragColor = vec4(uColor, 1.0); }`;

function addOutline(
  parent: THREE.Group | THREE.Scene,
  source: THREE.Mesh,
  color = C_DARK,
): void {
  const m = new THREE.Mesh(
    source.geometry,
    new THREE.ShaderMaterial({
      vertexShader: OL_VERT,
      fragmentShader: OL_FRAG,
      uniforms: { uColor: { value: color.clone() } },
      side: THREE.BackSide,
    }),
  );
  m.position.copy(source.position);
  m.rotation.copy(source.rotation);
  m.scale.copy(source.scale);
  parent.add(m);
}

// ── Background speed-line quad ────────────────────────────────────────────────
// A large camera-facing plane filled with radial speed lines via custom shader.

const BG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const BG_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uBgColor;
  uniform vec3  uLineColor;
  void main() {
    vec2  uv  = vUv - vec2(0.46, 0.50);
    float r   = length(uv);
    float a   = atan(uv.y, uv.x);

    // Primary tight radial lines
    float n1  = step(0.84 + 0.08 * sin(a * 24.0 - uTime * 0.8), sin(a * 52.0 + uTime * 1.8));
    // Secondary wider streaks
    float n2  = step(0.90, sin(a * 22.0 - uTime * 1.2 + 1.0));
    // Outer fade
    float fade = 1.0 - smoothstep(0.30, 1.0, r);

    float line = clamp(n1 * 0.5 + n2 * 0.7, 0.0, 1.0) * fade;
    vec3  col  = mix(uBgColor, uLineColor, line * 0.50);
    gl_FragColor = vec4(col, 1.0);
  }`;

const bgUniforms = {
  uTime: { value: 0 },
  uBgColor: { value: new THREE.Color(0x1a0040) },
  uLineColor: { value: new THREE.Color(0x7020c0) },
};

const bgPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 50),
  new THREE.ShaderMaterial({
    vertexShader: BG_VERT,
    fragmentShader: BG_FRAG,
    uniforms: bgUniforms,
  }),
);
bgPlane.position.set(3, 0, -10);
bgPlane.lookAt(camera.position);
scene.add(bgPlane);

// ── Tunnel rings ──────────────────────────────────────────────────────────────
// 8 pink torus rings receding along the X axis — the portal / warp tunnel.

const tunnelGroup = new THREE.Group();
scene.add(tunnelGroup);
tunnelGroup.position.set(5, 0, 0);
tunnelGroup.rotation.y = Math.PI / 2; // rings face along X

const N_RINGS = 8;
for (let i = 0; i < N_RINGS; i++) {
  const frac = i / (N_RINGS - 1);
  const ringR = THREE.MathUtils.lerp(3.8, 0.9, frac);
  const tubeR = THREE.MathUtils.lerp(0.28, 0.1, frac);
  const zPos = -i * 1.5;

  const geo = new THREE.TorusGeometry(ringR, tubeR, 18, 90);
  const mesh = new THREE.Mesh(geo, celMaterial(C_PINK, C_PINK_SHADOW));
  mesh.position.z = zPos;
  tunnelGroup.add(mesh);
  addOutline(tunnelGroup, mesh, new THREE.Color(0x55002a));

  // Additive glow on the front ring
  if (i < 3) {
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(ringR, tubeR * 3.0, 18, 90),
      new THREE.MeshBasicMaterial({
        color: C_PINK,
        transparent: true,
        opacity: 0.08 * (1 - frac),
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.z = zPos;
    tunnelGroup.add(glow);
  }
}

// ── Character ─────────────────────────────────────────────────────────────────
// A Kirby-like blob: round body, eye, fists, feet — all cel-shaded.

const charGroup = new THREE.Group();
charGroup.position.set(-1.5, 0, 0);
scene.add(charGroup);

// Body
const body = new THREE.Mesh(
  new THREE.SphereGeometry(0.72, 36, 36),
  celMaterial(C_LAVENDER, C_LAV_SHADOW),
);
charGroup.add(body);
addOutline(charGroup, body);

// Eye (white sclera)
const eyeW = new THREE.Mesh(
  new THREE.SphereGeometry(0.24, 18, 18),
  celMaterial(C_WHITE, new THREE.Color(0xcccccc)),
);
eyeW.position.set(0.58, 0.18, 0.28);
charGroup.add(eyeW);
addOutline(charGroup, eyeW);

// Pupil
const pupil = new THREE.Mesh(
  new THREE.SphereGeometry(0.13, 14, 14),
  celMaterial(C_DARK, C_DARK),
);
pupil.position.set(0.66, 0.17, 0.38);
charGroup.add(pupil);

// Eye shine
const shine = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
shine.position.set(0.7, 0.24, 0.44);
charGroup.add(shine);

// Fists (arms stretched forward toward ring)
const fistGeo = new THREE.SphereGeometry(0.22, 16, 16);
const fistMat = celMaterial(
  new THREE.Color(0xff70a0),
  new THREE.Color(0xcc1850),
);

for (const [y, z] of [
  [0.28, 0.14],
  [-0.25, 0.14],
] as [number, number][]) {
  const f = new THREE.Mesh(fistGeo, fistMat);
  f.position.set(0.78, y, z);
  f.scale.set(1.4, 0.85, 0.85); // elongated forward
  charGroup.add(f);
  addOutline(charGroup, f);
}

// Feet
for (const z of [-0.32, 0.32]) {
  const foot = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 14, 14),
    celMaterial(new THREE.Color(0xff70a0)),
  );
  foot.position.set(-0.15, -0.55, z);
  charGroup.add(foot);
  addOutline(charGroup, foot);
}

// ── Energy beam (yellow, trails from character toward ring) ───────────────────

const beamGroup = new THREE.Group();
scene.add(beamGroup);

const beamMat = new THREE.MeshBasicMaterial({
  color: C_YELLOW,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

// Core shaft: narrow cylinder pointing right (+X → toward ring)
const shaft = new THREE.Mesh(
  new THREE.CylinderGeometry(0.06, 0.06, 7.5, 10),
  beamMat,
);
shaft.rotation.z = Math.PI / 2;
shaft.position.set(1.5, 0, 0); // centred between character and ring
beamGroup.add(shaft);

// Cone expanding backward (trail behind character toward camera)
const trail = new THREE.Mesh(
  new THREE.CylinderGeometry(0.0, 0.9, 5.5, 16, 1, true),
  new THREE.MeshBasicMaterial({
    color: C_YELLOW,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
trail.rotation.z = -Math.PI / 2; // opens toward camera
trail.position.set(-4.5, 0, 0);
beamGroup.add(trail);

// Outer glow (bigger, dimmer)
const beamGlow = new THREE.Mesh(
  new THREE.CylinderGeometry(0.3, 0.3, 7.5, 10),
  new THREE.MeshBasicMaterial({
    color: C_YELLOW,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
beamGlow.rotation.z = Math.PI / 2;
beamGlow.position.set(1.5, 0, 0);
beamGroup.add(beamGlow);

// ── Speed lines (3-D radial geometry around character) ───────────────────────

const speedGeo = new THREE.BufferGeometry();
const N_LINES = 90;
const spPos: number[] = [];
const spCol: number[] = [];

for (let i = 0; i < N_LINES; i++) {
  const theta = (i / N_LINES) * Math.PI * 2;
  const phi = (Math.random() - 0.5) * Math.PI * 0.9;
  const r0 = 0.85 + Math.random() * 0.35;
  const r1 = r0 + 1.8 + Math.random() * 4.5;
  const dx = Math.cos(theta) * Math.cos(phi);
  const dy = Math.sin(phi);
  const dz = Math.sin(theta) * Math.cos(phi);
  spPos.push(dx * r0, dy * r0, dz * r0, dx * r1, dy * r1, dz * r1);
  // White at start, purple at tip
  spCol.push(1, 0.9, 1, 0.7, 0.3, 1);
}

speedGeo.setAttribute(
  "position",
  new THREE.BufferAttribute(new Float32Array(spPos), 3),
);
speedGeo.setAttribute(
  "color",
  new THREE.BufferAttribute(new Float32Array(spCol), 3),
);

const speedMat = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const speedLines = new THREE.LineSegments(speedGeo, speedMat);
scene.add(speedLines);

// ── Impact flash at tunnel mouth ──────────────────────────────────────────────

const flashGroup = new THREE.Group();
flashGroup.position.set(5, 0, 0);
scene.add(flashGroup);

const flashCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.55, 20, 20),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
flashGroup.add(flashCore);

// Star-burst spikes (octahedron)
const burstMesh = new THREE.Mesh(
  new THREE.OctahedronGeometry(2.2, 0),
  new THREE.MeshBasicMaterial({
    color: 0xffff88,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
flashGroup.add(burstMesh);

// Outer halo ring
const haloMesh = new THREE.Mesh(
  new THREE.TorusGeometry(1.2, 0.12, 10, 60),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
flashGroup.add(haloMesh);

// ── Lighting ──────────────────────────────────────────────────────────────────

scene.add(new THREE.AmbientLight(0x3a0870, 2.0));
const key = new THREE.DirectionalLight(0xffe0ff, 3.5);
key.position.set(3, 5, 4);
scene.add(key);

// ── Post-processing ───────────────────────────────────────────────────────────

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(
    new THREE.Vector2(W, H),
    1.6, // strength — makes emissives glow
    0.75,
    0.55,
  ),
);

// ── Animation loop ────────────────────────────────────────────────────────────

const clock = new THREE.Clock();
let elapsed = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;

  // Background speed-line shader
  bgUniforms.uTime.value = t;

  // Character bobs and tilts
  charGroup.position.y = Math.sin(t * 2.0) * 0.2;
  charGroup.rotation.z = Math.sin(t * 1.4) * 0.08;
  charGroup.rotation.y = Math.sin(t * 0.9) * 0.1;

  // Sync beam + speed lines to character Y
  beamGroup.position.y = charGroup.position.y;
  speedLines.position.set(-1.5, charGroup.position.y, 0);

  // Speed lines gently pulse
  speedMat.opacity = 0.55 + 0.25 * Math.sin(t * 5.0);

  // Tunnel rings rotate slowly on their axis
  tunnelGroup.rotation.x = t * 0.22;

  // Flash pulses
  const fp = 0.5 + 0.5 * Math.abs(Math.sin(t * 7.5));
  flashCore.scale.setScalar(0.7 + fp * 0.55);
  burstMesh.rotation.x = t * 2.8;
  burstMesh.rotation.y = t * 1.9;
  burstMesh.scale.setScalar(0.8 + fp * 0.35);
  haloMesh.rotation.x += dt * 3.0;
  (burstMesh.material as THREE.MeshBasicMaterial).opacity = 0.28 + fp * 0.3;

  // Gentle camera drift
  camera.position.x = -5.5 + Math.sin(t * 0.38) * 0.35;
  camera.position.y = 2.5 + Math.sin(t * 0.27) * 0.22;
  camera.lookAt(2, -0.2 + Math.sin(t * 0.44) * 0.12, 0);

  composer.render();
}

animate();

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});
