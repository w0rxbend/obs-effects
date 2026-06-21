import * as THREE from "three";
import { createThreeScene } from "./lib";

// ── Colors ────────────────────────────────────────────────────────────────────
const DISCORD_VIOLET = 0x5865f2;
const SHELL_WHITE = 0xf2f3fa;
const SHELL_MID = 0xd8dced;
const JOINT_DARK = 0x1e2248;
const SOCKET_DARK = 0x0c0e22;

// ── Materials ─────────────────────────────────────────────────────────────────
const M_CERAMIC = new THREE.MeshPhysicalMaterial({
  color: SHELL_WHITE,
  metalness: 0,
  roughness: 0.2,
  clearcoat: 0.5,
  clearcoatRoughness: 0.15,
});
const M_CERAMIC_MID = new THREE.MeshPhysicalMaterial({
  color: SHELL_MID,
  metalness: 0,
  roughness: 0.28,
  clearcoat: 0.3,
});
const M_METAL = new THREE.MeshPhysicalMaterial({
  color: JOINT_DARK,
  metalness: 0.82,
  roughness: 0.35,
});
const M_EYE = new THREE.MeshStandardMaterial({
  color: DISCORD_VIOLET,
  roughness: 0.08,
  metalness: 0.15,
});
const M_EYE_SOCKET = new THREE.MeshStandardMaterial({
  color: SOCKET_DARK,
  roughness: 0.7,
});
const M_ACCENT = new THREE.MeshStandardMaterial({
  color: DISCORD_VIOLET,
  roughness: 0.3,
  metalness: 0.15,
});
const M_CORE = new THREE.MeshStandardMaterial({
  color: DISCORD_VIOLET,
  roughness: 0.15,
  metalness: 0.1,
});
const M_VISOR = new THREE.MeshPhysicalMaterial({
  color: 0x080c1c,
  metalness: 0,
  roughness: 0.0,
  transparent: true,
  opacity: 0.78,
  clearcoat: 1.0,
  clearcoatRoughness: 0.0,
});

// ── Mesh factory ──────────────────────────────────────────────────────────────
function mk(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  parent: THREE.Object3D,
  px = 0,
  py = 0,
  pz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(px, py, pz);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

// ── Arm builder ───────────────────────────────────────────────────────────────
type ArmRefs = { armG: THREE.Group; lowerG: THREE.Group };

function buildArm(side: 1 | -1, bodyGroup: THREE.Group): ArmRefs {
  const armG = new THREE.Group();
  armG.position.set(side * 1.04, 0.62, 0);
  bodyGroup.add(armG);

  mk(
    new THREE.CapsuleGeometry(0.155, 0.44, 6, 16),
    M_CERAMIC,
    armG,
    side * 0.1,
    -0.35,
    0.04,
  );
  mk(
    new THREE.SphereGeometry(0.175, 16, 12),
    M_METAL,
    armG,
    side * 0.1,
    -0.72,
    0.06,
  );
  mk(
    new THREE.TorusGeometry(0.2, 0.03, 8, 22),
    M_ACCENT,
    armG,
    side * 0.1,
    -0.72,
    0.06,
    1,
    1,
    1,
    Math.PI / 2,
    0,
    0,
  );

  const lowerG = new THREE.Group();
  lowerG.position.set(side * 0.1, -0.72, 0.06);
  armG.add(lowerG);

  mk(
    new THREE.CapsuleGeometry(0.125, 0.38, 6, 16),
    M_CERAMIC,
    lowerG,
    side * 0.06,
    -0.28,
    0.04,
  );
  mk(
    new THREE.SphereGeometry(0.14, 14, 10),
    M_METAL,
    lowerG,
    side * 0.1,
    -0.56,
    0.06,
  );
  mk(
    new THREE.SphereGeometry(0.17, 16, 12),
    M_CERAMIC,
    lowerG,
    side * 0.12,
    -0.66,
    0.06,
    1.1,
    0.85,
    0.78,
  );

  for (let k = 0; k < 3; k++) {
    mk(
      new THREE.SphereGeometry(0.04, 8, 6),
      M_ACCENT,
      lowerG,
      side * 0.04,
      -0.72 + k * 0.02,
      0.13,
    );
  }

  return { armG, lowerG };
}

// ── Animation types ───────────────────────────────────────────────────────────
const MAX_BODY_ROT = 0.18;

type BehaviorKey =
  | "idle"
  | "typing"
  | "nod"
  | "headShake"
  | "waveL"
  | "waveR"
  | "lookAround"
  | "thinking"
  | "excited"
  | "stretch"
  | "reachForward"
  | "shrug";

interface Joints {
  bodyRotX: number;
  bodyRotY: number;
  headRotX: number;
  headRotY: number;
  aLx: number;
  aLz: number;
  aRx: number;
  aRz: number;
  eLz: number;
  eRz: number;
  bounce: number;
}

const tgt: Joints = {
  bodyRotX: 0,
  bodyRotY: 0,
  headRotX: 0,
  headRotY: 0,
  aLx: 0,
  aLz: 0,
  aRx: 0,
  aRz: 0,
  eLz: -0.12,
  eRz: 0.12,
  bounce: 0,
};
const cur: Joints = { ...tgt };

function lerpJoints(dt: number): void {
  const k = 1 - Math.pow(1 - 0.08, dt * 60);
  const keys = Object.keys(tgt) as (keyof Joints)[];
  for (const key of keys) {
    cur[key] += (tgt[key] - cur[key]) * k;
  }
}

const WEIGHTS: Record<BehaviorKey, number> = {
  idle: 5,
  typing: 8,
  nod: 3,
  headShake: 2,
  waveL: 2,
  waveR: 2,
  lookAround: 3,
  thinking: 4,
  excited: 2,
  stretch: 2,
  reachForward: 3,
  shrug: 2,
};

const DURATIONS: Record<BehaviorKey, [number, number]> = {
  idle: [3, 8],
  typing: [6, 15],
  nod: [2, 3],
  headShake: [1.5, 2.5],
  waveL: [3, 5],
  waveR: [3, 5],
  lookAround: [3, 6],
  thinking: [4, 9],
  excited: [2, 3.5],
  stretch: [3, 5],
  reachForward: [3, 6],
  shrug: [2, 3],
};

function pickBehavior(): BehaviorKey {
  const entries = Object.entries(WEIGHTS) as [BehaviorKey, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return "idle";
}

function updateBehavior(key: BehaviorKey, bt: number, ph: number): void {
  switch (key) {
    case "idle":
      tgt.bodyRotY = Math.sin(bt * 0.28 + ph) * 0.06;
      tgt.bodyRotX = 0;
      tgt.headRotY = Math.sin(bt * 0.35 + ph) * 0.14;
      tgt.headRotX = Math.sin(bt * 0.27 + ph * 0.8) * 0.07;
      tgt.aLx = 0;
      tgt.aLz = 0;
      tgt.aRx = 0;
      tgt.aRz = 0;
      tgt.eLz = -0.12;
      tgt.eRz = 0.12;
      tgt.bounce = 0;
      break;

    case "typing":
      tgt.aLx = -0.52 + Math.sin(bt * 7.2 + ph) * 0.1;
      tgt.aRx = -0.52 + Math.sin(bt * 7.2 + ph + 1.3) * 0.1;
      tgt.aLz = 0.2;
      tgt.aRz = -0.2;
      tgt.eLz = -0.44;
      tgt.eRz = 0.44;
      tgt.headRotX = -0.15 + Math.sin(bt * 0.45 + ph) * 0.04;
      tgt.headRotY = Math.sin(bt * 0.25 + ph) * 0.08;
      tgt.bodyRotX = 0.08;
      tgt.bodyRotY = Math.sin(bt * 0.18 + ph) * 0.04;
      tgt.bounce = 0;
      break;

    case "nod":
      tgt.headRotX = Math.sin(bt * 4.0 + ph) * 0.3;
      tgt.bodyRotX = Math.sin(bt * 4.0 + ph) * 0.04;
      tgt.headRotY = 0;
      tgt.bodyRotY = 0;
      tgt.aLx = 0;
      tgt.aLz = 0;
      tgt.aRx = 0;
      tgt.aRz = 0;
      tgt.eLz = -0.12;
      tgt.eRz = 0.12;
      tgt.bounce = 0;
      break;

    case "headShake":
      tgt.headRotY = Math.sin(bt * 5.0 + ph) * 0.35;
      tgt.headRotX = 0.04;
      tgt.bodyRotX = 0;
      tgt.bodyRotY = 0;
      tgt.aLx = 0;
      tgt.aLz = 0;
      tgt.aRx = 0;
      tgt.aRz = 0;
      tgt.eLz = -0.12;
      tgt.eRz = 0.12;
      tgt.bounce = 0;
      break;

    case "waveL":
      tgt.aLz = 2.15 + Math.sin(bt * 4.5 + ph) * 0.28;
      tgt.aLx = -0.2;
      tgt.aRx = 0;
      tgt.aRz = 0;
      tgt.eLz = -0.28;
      tgt.eRz = 0.12;
      tgt.headRotY = -0.18;
      tgt.headRotX = 0.06;
      tgt.bodyRotY = -0.12;
      tgt.bodyRotX = 0;
      tgt.bounce = 0;
      break;

    case "waveR":
      tgt.aRz = -2.15 + Math.sin(bt * 4.5 + ph) * -0.28;
      tgt.aRx = -0.2;
      tgt.aLx = 0;
      tgt.aLz = 0;
      tgt.eLz = -0.12;
      tgt.eRz = 0.28;
      tgt.headRotY = 0.18;
      tgt.headRotX = 0.06;
      tgt.bodyRotY = 0.12;
      tgt.bodyRotX = 0;
      tgt.bounce = 0;
      break;

    case "lookAround":
      tgt.headRotY = Math.sin(bt * 0.72 + ph) * 0.42;
      tgt.headRotX = Math.cos(bt * 0.48 + ph * 0.9) * 0.22;
      tgt.bodyRotY = Math.sin(bt * 0.72 + ph) * 0.06;
      tgt.bodyRotX = 0;
      tgt.aLx = 0;
      tgt.aLz = 0;
      tgt.aRx = 0;
      tgt.aRz = 0;
      tgt.eLz = -0.12;
      tgt.eRz = 0.12;
      tgt.bounce = 0;
      break;

    case "thinking":
      tgt.aRx = -0.38 + Math.sin(bt * 0.32 + ph) * 0.07;
      tgt.aRz = -0.28;
      tgt.eRz = 0.4;
      tgt.aLx = 0;
      tgt.aLz = 0;
      tgt.eLz = -0.12;
      tgt.headRotX = 0.12;
      tgt.headRotY = Math.sin(bt * 0.38 + ph) * 0.14;
      tgt.bodyRotX = 0.05;
      tgt.bodyRotY = Math.sin(bt * 0.22 + ph) * 0.05;
      tgt.bounce = 0;
      break;

    case "excited":
      tgt.bounce = Math.sin(bt * 5.5 + ph) * 0.15;
      tgt.aLz = 0.38 + Math.sin(bt * 5.5 + ph) * 0.12;
      tgt.aRz = -0.38 + Math.sin(bt * 5.5 + ph + Math.PI) * 0.12;
      tgt.aLx = 0;
      tgt.aRx = 0;
      tgt.headRotX = Math.sin(bt * 5.5 + ph) * 0.07;
      tgt.headRotY = Math.sin(bt * 2.8 + ph) * 0.14;
      tgt.bodyRotX = Math.sin(bt * 5.5 + ph) * 0.05;
      tgt.bodyRotY = Math.sin(bt * 2.8 + ph) * 0.06;
      tgt.eLz = -0.12;
      tgt.eRz = 0.12;
      break;

    case "stretch":
      tgt.aLz = 1.9 + Math.sin(bt * 0.5 + ph) * 0.1;
      tgt.aRz = -1.9 + Math.sin(bt * 0.5 + ph + Math.PI) * 0.1;
      tgt.aLx = 0.18;
      tgt.aRx = 0.18;
      tgt.eLz = -0.5;
      tgt.eRz = 0.5;
      tgt.bodyRotX = -0.12;
      tgt.headRotX = -0.1;
      tgt.headRotY = 0;
      tgt.bodyRotY = 0;
      tgt.bounce = 0;
      break;

    case "reachForward":
      if (ph < Math.PI) {
        tgt.aLx = -0.8;
        tgt.aLz = 0.1;
        tgt.eLz = -0.38;
        tgt.aRx = 0;
        tgt.aRz = 0;
        tgt.eRz = 0.12;
      } else {
        tgt.aRx = -0.8;
        tgt.aRz = -0.1;
        tgt.eRz = 0.38;
        tgt.aLx = 0;
        tgt.aLz = 0;
        tgt.eLz = -0.12;
      }
      tgt.bodyRotX = 0.1;
      tgt.bodyRotY = 0;
      tgt.headRotX = 0.05;
      tgt.headRotY = 0;
      tgt.bounce = 0;
      break;

    case "shrug": {
      const shrug = Math.max(0, Math.sin(bt * 2.2 + ph));
      tgt.aLz = shrug * 0.7;
      tgt.aRz = -shrug * 0.7;
      tgt.aLx = 0;
      tgt.aRx = 0;
      tgt.eLz = -0.12 - shrug * 0.15;
      tgt.eRz = 0.12 + shrug * 0.15;
      tgt.headRotX = shrug * 0.08;
      tgt.headRotY = 0;
      tgt.bodyRotX = 0;
      tgt.bodyRotY = 0;
      tgt.bounce = 0;
      break;
    }
  }
}

let curBehavior: BehaviorKey = "idle";
let behaviorTimer = 0;
let behaviorDuration =
  DURATIONS.idle[0] + Math.random() * (DURATIONS.idle[1] - DURATIONS.idle[0]);
let behaviorPhase = Math.random() * Math.PI * 2;

function advanceBehavior(dt: number): void {
  behaviorTimer += dt;
  if (behaviorTimer >= behaviorDuration) {
    curBehavior = pickBehavior();
    behaviorTimer = 0;
    const [lo, hi] = DURATIONS[curBehavior];
    behaviorDuration = lo + Math.random() * (hi - lo);
    behaviorPhase = Math.random() * Math.PI * 2;
  }
  updateBehavior(curBehavior, behaviorTimer, behaviorPhase);
}

// ── Scene object refs (assigned in onInit, used in onFrame) ───────────────────
let robot!: THREE.Group;
let head!: THREE.Group;
let body!: THREE.Group;
let armL!: THREE.Group;
let armR!: THREE.Group;
let lowerL!: THREE.Group;
let lowerR!: THREE.Group;
let torso!: THREE.Mesh;
let coreOuter!: THREE.Mesh;
let hoverRing!: THREE.Mesh;
let hoverInner!: THREE.Mesh;
let orbit1!: THREE.Mesh;
let orbit2!: THREE.Mesh;
let eyeL!: THREE.Mesh;
let eyeR!: THREE.Mesh;

let elapsed = 0;
let blinkTimer = 0;
let nextBlink = 2.5 + Math.random() * 2.5;
let isBlinking = false;
let blinkPhase = 0;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
void createThreeScene({
  shadowMap: false,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.1,
  outputColorSpace: THREE.SRGBColorSpace,
  camera: { fov: 54, near: 0.1, far: 200 },
  controls: "orbit",
  orbitOptions: {
    damping: 0.06,
    minDistance: 4,
    maxDistance: 22,
  },
  loop: "clock",
  postProcessing: true,
  ibl: false,
  audio: false,

  onInit(ctx) {
    const { scene, camera, controls } = ctx;

    camera.position.set(0, 1.6, 14);
    if (controls) {
      controls.autoRotate = false;
      controls.target.set(0, 0.5, 0);
    }

    // ── Robot root ────────────────────────────────────────────────────────────
    robot = new THREE.Group();
    scene.add(robot);

    // ── HEAD ─────────────────────────────────────────────────────────────────
    head = new THREE.Group();
    head.position.set(0, 2.35, 0);
    robot.add(head);

    mk(
      new THREE.SphereGeometry(1.05, 42, 32),
      M_CERAMIC,
      head,
      0,
      0,
      0,
      1.15,
      1.0,
      0.95,
    );

    const earGeo = new THREE.SphereGeometry(0.22, 18, 14);
    mk(earGeo, M_CERAMIC, head, -0.74, 0.83, 0, 1.0, 0.92, 0.78);
    mk(earGeo, M_CERAMIC, head, 0.74, 0.83, 0, 1.0, 0.92, 0.78);

    mk(
      new THREE.CircleGeometry(0.58, 36),
      M_VISOR,
      head,
      0,
      0.0,
      1.02,
      1.15,
      0.88,
      1.0,
    );

    const sockGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.07, 32);
    mk(
      sockGeo,
      M_EYE_SOCKET,
      head,
      -0.3,
      0.02,
      0.94,
      1,
      1,
      1,
      Math.PI / 2,
      0,
      0,
    );
    mk(
      sockGeo,
      M_EYE_SOCKET,
      head,
      0.3,
      0.02,
      0.94,
      1,
      1,
      1,
      Math.PI / 2,
      0,
      0,
    );

    const eyeGeo = new THREE.CylinderGeometry(0.178, 0.178, 0.055, 32);
    eyeL = mk(
      eyeGeo,
      M_EYE,
      head,
      -0.3,
      0.02,
      0.97,
      1,
      1,
      1,
      Math.PI / 2,
      0,
      0,
    );
    eyeR = mk(eyeGeo, M_EYE, head, 0.3, 0.02, 0.97, 1, 1, 1, Math.PI / 2, 0, 0);

    const eyeLitL = new THREE.PointLight(DISCORD_VIOLET, 0.5, 3.0);
    eyeLitL.position.set(-0.3, 0.02, 1.12);
    head.add(eyeLitL);
    const eyeLitR = new THREE.PointLight(DISCORD_VIOLET, 0.5, 3.0);
    eyeLitR.position.set(0.3, 0.02, 1.12);
    head.add(eyeLitR);

    mk(new THREE.BoxGeometry(0.82, 0.04, 0.04), M_ACCENT, head, 0, 0.72, 0.92);
    mk(
      new THREE.BoxGeometry(0.04, 0.42, 0.04),
      M_ACCENT,
      head,
      -1.1,
      0.18,
      0.2,
    );
    mk(new THREE.BoxGeometry(0.04, 0.42, 0.04), M_ACCENT, head, 1.1, 0.18, 0.2);
    mk(
      new THREE.BoxGeometry(0.52, 0.035, 0.04),
      M_ACCENT,
      head,
      0,
      -0.52,
      0.88,
    );
    mk(
      new THREE.TorusGeometry(0.26, 0.055, 8, 26),
      M_ACCENT,
      head,
      0,
      -1.02,
      0,
      1,
      1,
      1,
      Math.PI / 2,
      0,
      0,
    );

    // ── NECK ─────────────────────────────────────────────────────────────────
    mk(
      new THREE.CylinderGeometry(0.19, 0.24, 0.46, 18),
      M_METAL,
      robot,
      0,
      1.48,
      0,
    );

    // ── BODY ─────────────────────────────────────────────────────────────────
    body = new THREE.Group();
    body.position.set(0, -0.15, 0);
    robot.add(body);

    torso = mk(
      new THREE.CapsuleGeometry(0.7, 0.9, 8, 26),
      M_CERAMIC,
      body,
      0,
      0.35,
      0,
    );

    mk(
      new THREE.BoxGeometry(0.94, 0.74, 0.27),
      M_CERAMIC_MID,
      body,
      0,
      0.48,
      0.6,
    );

    coreOuter = mk(
      new THREE.SphereGeometry(0.21, 20, 16),
      M_CORE,
      body,
      0,
      0.48,
      0.78,
    );
    mk(
      new THREE.SphereGeometry(0.1, 14, 10),
      new THREE.MeshStandardMaterial({ color: SHELL_WHITE, roughness: 0.1 }),
      body,
      0,
      0.48,
      0.81,
    );

    mk(new THREE.BoxGeometry(0.68, 0.035, 0.04), M_ACCENT, body, 0, 0.83, 0.74);
    mk(new THREE.BoxGeometry(0.5, 0.035, 0.04), M_ACCENT, body, 0, 0.14, 0.74);

    mk(
      new THREE.BoxGeometry(0.2, 0.52, 0.22),
      M_CERAMIC_MID,
      body,
      -0.78,
      0.35,
      0.28,
      1,
      1,
      1,
      0,
      0.18,
      0,
    );
    mk(
      new THREE.BoxGeometry(0.2, 0.52, 0.22),
      M_CERAMIC_MID,
      body,
      0.78,
      0.35,
      0.28,
      1,
      1,
      1,
      0,
      -0.18,
      0,
    );

    mk(new THREE.SphereGeometry(0.3, 20, 16), M_METAL, body, -0.96, 0.72, 0);
    mk(new THREE.SphereGeometry(0.3, 20, 16), M_METAL, body, 0.96, 0.72, 0);

    // ── ARMS ─────────────────────────────────────────────────────────────────
    ({ armG: armL, lowerG: lowerL } = buildArm(-1, body));
    ({ armG: armR, lowerG: lowerR } = buildArm(1, body));

    // ── LOWER BODY / HOVER SKIRT ──────────────────────────────────────────────
    const lower = new THREE.Group();
    lower.position.set(0, -0.48, 0);
    body.add(lower);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.sin(a) * 0.58;
      const pz = Math.cos(a) * 0.58;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.23, 0.46, 0.18),
        M_CERAMIC_MID,
      );
      panel.position.set(px, -0.24, pz);
      panel.rotation.y = a;
      lower.add(panel);
      const accent = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.034, 0.04),
        M_ACCENT,
      );
      accent.position.set(px * 1.02, -0.08, pz * 1.02);
      accent.rotation.y = a;
      lower.add(accent);
    }

    mk(
      new THREE.ConeGeometry(0.42, 0.52, 22, 1, true),
      M_CERAMIC_MID,
      lower,
      0,
      -0.48,
      0,
      1,
      1,
      1,
      Math.PI,
      0,
      0,
    );

    hoverRing = mk(
      new THREE.TorusGeometry(0.58, 0.085, 10, 46),
      M_ACCENT,
      lower,
      0,
      -0.8,
      0,
      1,
      1,
      1,
      Math.PI / 2,
      0,
      0,
    );
    hoverInner = mk(
      new THREE.TorusGeometry(0.42, 0.04, 8, 34),
      M_METAL,
      lower,
      0,
      -0.8,
      0,
      1,
      1,
      1,
      Math.PI / 2,
      0,
      0,
    );

    // ── ORBIT RINGS ───────────────────────────────────────────────────────────
    const orbitMat1 = new THREE.MeshStandardMaterial({
      color: DISCORD_VIOLET,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.75,
    });
    const orbitMat2 = new THREE.MeshStandardMaterial({
      color: DISCORD_VIOLET,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
    });

    orbit1 = mk(
      new THREE.TorusGeometry(3.8, 0.025, 8, 80),
      orbitMat1,
      scene,
      0,
      0.3,
      0,
      1,
      1,
      1,
      Math.PI * 0.3,
      0,
      0,
    );
    orbit2 = mk(
      new THREE.TorusGeometry(4.6, 0.02, 8, 80),
      orbitMat2,
      scene,
      0,
      0.3,
      0,
      1,
      1,
      1,
      -Math.PI * 0.45,
      0,
      Math.PI * 0.2,
    );

    // ── LIGHTING ──────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);

    const sideLight = new THREE.DirectionalLight(0xcdd0ff, 1.2);
    sideLight.position.set(-5, 3, 2);
    scene.add(sideLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.position.set(0, -4, -6);
    scene.add(rimLight);
  },

  onFrame(_ctx, dt) {
    elapsed += dt;

    advanceBehavior(dt);
    lerpJoints(dt);

    const baseSway = Math.sin(elapsed * 0.22) * 0.08;
    const clampedBodyY = Math.max(
      -MAX_BODY_ROT,
      Math.min(MAX_BODY_ROT, baseSway + cur.bodyRotY),
    );
    robot.rotation.y = clampedBodyY;
    robot.rotation.x = cur.bodyRotX;

    head.rotation.y = cur.headRotY;
    head.rotation.x = cur.headRotX;

    armL.rotation.x = cur.aLx;
    armL.rotation.z = cur.aLz;
    armR.rotation.x = cur.aRx;
    armR.rotation.z = cur.aRz;
    lowerL.rotation.z = cur.eLz;
    lowerR.rotation.z = cur.eRz;

    robot.position.y = Math.sin(elapsed * 0.78) * 0.18 + cur.bounce;

    const breathe = 1.0 + Math.sin(elapsed * 1.1) * 0.011;
    torso.scale.set(breathe, breathe, breathe);

    const pulse = 1.0 + Math.sin(elapsed * 2.3) * 0.14;
    coreOuter.scale.setScalar(pulse);

    hoverRing.rotation.z = elapsed * 1.6;
    hoverInner.rotation.z = -elapsed * 2.2;

    orbit1.rotation.z = elapsed * 0.38;
    orbit1.rotation.y = elapsed * 0.14;
    orbit2.rotation.z = -elapsed * 0.28;
    orbit2.rotation.y = elapsed * 0.2;

    blinkTimer += dt;
    if (!isBlinking && blinkTimer >= nextBlink) {
      isBlinking = true;
      blinkPhase = 0;
    }
    if (isBlinking) {
      blinkPhase += dt * 9;
      const blink =
        blinkPhase < Math.PI ? Math.max(0.04, 1 - Math.sin(blinkPhase)) : 1.0;
      eyeL.scale.z = blink;
      eyeR.scale.z = blink;
      if (blinkPhase >= Math.PI) {
        isBlinking = false;
        blinkTimer = 0;
        nextBlink = 2.0 + Math.random() * 3.5;
        eyeL.scale.z = 1;
        eyeR.scale.z = 1;
      }
    }
  },
});
