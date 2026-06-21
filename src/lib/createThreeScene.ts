import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { obsAudio } from "./obsAudio";

export interface ThreeSceneOptions {
  shadowMap?: false | "PCF" | "PCFSoft";
  toneMapping?: THREE.ToneMapping;
  toneMappingExposure?: number;
  outputColorSpace?: THREE.ColorSpace;
  premultipliedAlpha?: boolean;
  camera: { fov: number; near: number; far: number };
  controls?: "orbit" | "none";
  orbitOptions?: {
    damping?: number;
    autoRotate?: boolean;
    enablePan?: boolean;
    polarMin?: number;
    polarMax?: number;
    minDistance?: number;
    maxDistance?: number;
  };
  /**
   * Called after the factory has resized the renderer, camera projection, and
   * default composer. Page callbacks should resize only page-owned targets.
   */
  onResize?: (
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    composer?: EffectComposer,
  ) => void;
  loop?: "performance" | "clock";
  postProcessing?: boolean;
  ibl?: boolean;
  /**
   * Connects and updates the shared obsAudio singleton during the render loop.
   * Consumers that need band values should import obsAudio from the lib barrel.
   */
  audio?: boolean;
  onInit?: (ctx: ThreeSceneContext) => Promise<void> | void;
  onFrame?: (ctx: ThreeSceneContext, dt: number) => void;
}

export interface ThreeSceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer?: EffectComposer;
  controls?: OrbitControls;
}

function applyDefaultBodyStyles(): void {
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
}

async function createDefaultComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): Promise<EffectComposer> {
  const [{ EffectComposer }, { RenderPass }, { OutputPass }] =
    await Promise.all([
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/OutputPass.js"),
    ]);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  return composer;
}

async function applyRoomEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): Promise<void> {
  const { RoomEnvironment } =
    await import("three/addons/environments/RoomEnvironment.js");
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

function showDiagnosticOverlay(text: string): void {
  const message = document.createElement("pre");
  message.textContent = text;
  message.style.position = "fixed";
  message.style.inset = "16px";
  message.style.zIndex = "2147483647";
  message.style.margin = "0";
  message.style.color = "rgba(255, 230, 230, 0.94)";
  message.style.background = "rgba(24, 0, 0, 0.82)";
  message.style.border = "1px solid rgba(255, 120, 120, 0.45)";
  message.style.padding = "12px";
  message.style.font = "13px/1.45 monospace";
  message.style.pointerEvents = "none";
  message.style.whiteSpace = "pre-wrap";
  document.body.appendChild(message);
}

function reportInitFailure(error: unknown): void {
  console.error(
    "[createThreeScene] initialization failed; render loop was not started.",
    error,
  );

  showDiagnosticOverlay(
    "Three.js scene failed to initialize. See browser console for details.",
  );
}

function reportFrameFailure(error: unknown): void {
  console.error("[createThreeScene] frame failed", error);

  showDiagnosticOverlay(
    "Three.js scene failed during rendering. See browser console for details.",
  );
}

async function createOrbitControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  orbitOptions: ThreeSceneOptions["orbitOptions"],
): Promise<OrbitControls> {
  const { OrbitControls } =
    await import("three/addons/controls/OrbitControls.js");
  const orbitControls = new OrbitControls(camera, domElement);
  orbitControls.enableDamping = true;
  const o = orbitOptions ?? {};
  if (o.damping !== undefined) orbitControls.dampingFactor = o.damping;
  if (o.autoRotate !== undefined) orbitControls.autoRotate = o.autoRotate;
  if (o.enablePan !== undefined) orbitControls.enablePan = o.enablePan;
  if (o.polarMin !== undefined) orbitControls.minPolarAngle = o.polarMin;
  if (o.polarMax !== undefined) orbitControls.maxPolarAngle = o.polarMax;
  if (o.minDistance !== undefined) orbitControls.minDistance = o.minDistance;
  if (o.maxDistance !== undefined) orbitControls.maxDistance = o.maxDistance;
  return orbitControls;
}

function startRenderLoop(
  opts: ThreeSceneOptions,
  ctx: ThreeSceneContext,
  orbitControls: OrbitControls | undefined,
): void {
  const render = (): void => {
    if (ctx.composer) ctx.composer.render();
    else ctx.renderer.render(ctx.scene, ctx.camera);
  };

  let stopped = false;
  const runFrame = (dt: number): boolean => {
    if (stopped) return false;

    try {
      if (opts.audio) obsAudio.update(dt);
      if (orbitControls) orbitControls.update();
      if (opts.onFrame) opts.onFrame(ctx, dt);
      render();
      return true;
    } catch (error) {
      stopped = true;
      reportFrameFailure(error);
      return false;
    }
  };

  if (opts.loop === "performance") {
    let last = performance.now();
    const animPerf = (): void => {
      const now = performance.now();
      const dt = Math.min((now - last) * 0.001, 0.05);
      last = now;
      if (runFrame(dt)) requestAnimationFrame(animPerf);
    };
    animPerf();
    return;
  }

  const clock = new THREE.Clock();
  const animClock = (): void => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (runFrame(dt)) requestAnimationFrame(animClock);
  };
  animClock();
}

export async function createThreeScene(opts: ThreeSceneOptions): Promise<void> {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    ...(opts.premultipliedAlpha !== undefined
      ? { premultipliedAlpha: opts.premultipliedAlpha }
      : {}),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  applyDefaultBodyStyles();
  document.body.appendChild(renderer.domElement);

  if (opts.shadowMap !== undefined) {
    if (opts.shadowMap === false) {
      renderer.shadowMap.enabled = false;
    } else {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type =
        opts.shadowMap === "PCF" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    }
  }
  if (opts.toneMapping !== undefined) renderer.toneMapping = opts.toneMapping;
  if (opts.toneMappingExposure !== undefined)
    renderer.toneMappingExposure = opts.toneMappingExposure;
  if (opts.outputColorSpace !== undefined)
    renderer.outputColorSpace = opts.outputColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    opts.camera.fov,
    window.innerWidth / window.innerHeight,
    opts.camera.near,
    opts.camera.far,
  );

  const ctx: ThreeSceneContext = {
    scene,
    camera,
    renderer,
  };

  let orbitControls: OrbitControls | undefined;
  let initialized = false;

  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (ctx.composer) ctx.composer.setSize(w, h);
    if (initialized && opts.onResize) {
      opts.onResize(renderer, camera, ctx.composer);
    }
  };

  window.addEventListener("resize", resize);
  resize();

  try {
    if (opts.controls === "orbit") {
      orbitControls = await createOrbitControls(
        camera,
        renderer.domElement,
        opts.orbitOptions,
      );
      ctx.controls = orbitControls;
    }

    if (opts.postProcessing) {
      ctx.composer = await createDefaultComposer(renderer, scene, camera);
      resize();
    }

    if (opts.ibl) await applyRoomEnvironment(scene, renderer);

    if (opts.onInit) await opts.onInit(ctx);

    if (opts.audio) void obsAudio.connect();

    initialized = true;
    resize();
    startRenderLoop(opts, ctx, orbitControls);
  } catch (error) {
    reportInitFailure(error);
    throw error;
  }
}
