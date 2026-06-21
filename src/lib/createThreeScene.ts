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
  /**
   * "clock" is kept as a compatibility alias for the clamped performance.now()
   * loop; the factory no longer uses deprecated THREE.Clock.
   */
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

export interface ThreeSceneHandle {
  destroy(): void;
}

interface RenderLoopHandle {
  stop(): void;
}

let diagnosticOverlay: HTMLPreElement | undefined;
let diagnosticOwner: symbol | undefined;

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

function showDiagnosticOverlay(text: string, owner: symbol): void {
  if (!diagnosticOverlay?.isConnected) {
    diagnosticOverlay = document.createElement("pre");
    diagnosticOverlay.style.position = "fixed";
    diagnosticOverlay.style.inset = "16px";
    diagnosticOverlay.style.zIndex = "2147483647";
    diagnosticOverlay.style.margin = "0";
    diagnosticOverlay.style.color = "rgba(255, 230, 230, 0.94)";
    diagnosticOverlay.style.background = "rgba(24, 0, 0, 0.82)";
    diagnosticOverlay.style.border = "1px solid rgba(255, 120, 120, 0.45)";
    diagnosticOverlay.style.padding = "12px";
    diagnosticOverlay.style.font = "13px/1.45 monospace";
    diagnosticOverlay.style.pointerEvents = "none";
    diagnosticOverlay.style.whiteSpace = "pre-wrap";
    document.body.appendChild(diagnosticOverlay);
  }

  diagnosticOwner = owner;
  diagnosticOverlay.textContent = text;
}

function removeDiagnosticOverlay(owner: symbol): void {
  if (diagnosticOwner !== owner) return;
  diagnosticOverlay?.remove();
  diagnosticOverlay = undefined;
  diagnosticOwner = undefined;
}

function reportInitFailure(error: unknown, owner: symbol): void {
  console.error(
    "[createThreeScene] initialization failed; render loop was not started.",
    error,
  );

  showDiagnosticOverlay(
    "Three.js scene failed to initialize. See browser console for details.",
    owner,
  );
}

function reportFrameFailure(error: unknown, owner: symbol): void {
  console.error("[createThreeScene] frame failed", error);

  showDiagnosticOverlay(
    "Three.js scene failed during rendering. See browser console for details.",
    owner,
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
  owner: symbol,
): RenderLoopHandle {
  const render = (): void => {
    if (ctx.composer) ctx.composer.render();
    else ctx.renderer.render(ctx.scene, ctx.camera);
  };

  let stopped = false;
  let frameId: number | undefined;
  let last = performance.now();

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
      reportFrameFailure(error, owner);
      return false;
    }
  };

  const animate = (): void => {
    frameId = undefined;
    const now = performance.now();
    const dt = Math.min((now - last) * 0.001, 0.05);
    last = now;
    if (runFrame(dt)) frameId = requestAnimationFrame(animate);
  };

  animate();

  return {
    stop(): void {
      stopped = true;
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
        frameId = undefined;
      }
    },
  };
}

export async function createThreeScene(
  opts: ThreeSceneOptions,
): Promise<ThreeSceneHandle> {
  const owner = Symbol("createThreeScene");
  let renderer: THREE.WebGLRenderer | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let ctx: ThreeSceneContext | undefined;
  let orbitControls: OrbitControls | undefined;
  let renderLoop: RenderLoopHandle | undefined;
  let resize: (() => void) | undefined;
  let resizeRegistered = false;
  let canvasAppended = false;
  let initialized = false;
  let destroyed = false;

  const cleanup = (removeDiagnostic: boolean): void => {
    if (destroyed) return;
    destroyed = true;

    renderLoop?.stop();
    renderLoop = undefined;

    if (resizeRegistered && resize) {
      window.removeEventListener("resize", resize);
      resizeRegistered = false;
    }

    orbitControls?.dispose();
    orbitControls = undefined;

    ctx?.composer?.dispose();
    ctx = undefined;

    renderer?.dispose();
    if (renderer && canvasAppended) {
      renderer.domElement.remove();
      canvasAppended = false;
    }
    renderer = undefined;

    if (removeDiagnostic) removeDiagnosticOverlay(owner);
  };

  try {
    renderer = new THREE.WebGLRenderer({
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
    canvasAppended = true;

    if (opts.shadowMap !== undefined) {
      if (opts.shadowMap === false) {
        renderer.shadowMap.enabled = false;
      } else {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type =
          opts.shadowMap === "PCF"
            ? THREE.PCFShadowMap
            : THREE.PCFSoftShadowMap;
      }
    }
    if (opts.toneMapping !== undefined) renderer.toneMapping = opts.toneMapping;
    if (opts.toneMappingExposure !== undefined)
      renderer.toneMappingExposure = opts.toneMappingExposure;
    if (opts.outputColorSpace !== undefined)
      renderer.outputColorSpace = opts.outputColorSpace;

    const scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      opts.camera.fov,
      window.innerWidth / window.innerHeight,
      opts.camera.near,
      opts.camera.far,
    );

    ctx = {
      scene,
      camera,
      renderer,
    };

    resize = (): void => {
      if (!renderer || !camera || !ctx) return;

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
    resizeRegistered = true;
    resize();

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

    initialized = true;
    resize();
    if (opts.audio) void obsAudio.connect();
    renderLoop = startRenderLoop(opts, ctx, orbitControls, owner);

    return {
      destroy(): void {
        cleanup(true);
      },
    };
  } catch (error) {
    reportInitFailure(error, owner);
    cleanup(false);
    throw error;
  }
}
