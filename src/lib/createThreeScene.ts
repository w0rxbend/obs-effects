import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
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
  onResize?: (
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    composer?: EffectComposer,
  ) => void;
  loop?: "performance" | "clock";
  postProcessing?: boolean;
  ibl?: boolean;
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
  document.body.style.cssText = "margin:0;overflow:hidden;";
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

  let orbitControls: OrbitControls | undefined;
  if (opts.controls === "orbit") {
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    const o = opts.orbitOptions ?? {};
    if (o.damping !== undefined) orbitControls.dampingFactor = o.damping;
    if (o.autoRotate !== undefined) orbitControls.autoRotate = o.autoRotate;
    if (o.enablePan !== undefined) orbitControls.enablePan = o.enablePan;
    if (o.polarMin !== undefined) orbitControls.minPolarAngle = o.polarMin;
    if (o.polarMax !== undefined) orbitControls.maxPolarAngle = o.polarMax;
    if (o.minDistance !== undefined) orbitControls.minDistance = o.minDistance;
    if (o.maxDistance !== undefined) orbitControls.maxDistance = o.maxDistance;
  }

  let composer: EffectComposer | undefined;
  if (opts.postProcessing) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new OutputPass());
  }

  if (opts.ibl) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  const ctx: ThreeSceneContext = {
    scene,
    camera,
    renderer,
    composer,
    controls: orbitControls,
  };

  if (opts.audio) void obsAudio.connect();

  if (opts.onInit) await opts.onInit(ctx);

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
    if (opts.onResize) opts.onResize(renderer, camera, composer);
  });

  if (opts.loop === "performance") {
    let last = performance.now();
    const animPerf = (): void => {
      requestAnimationFrame(animPerf);
      const now = performance.now();
      const dt = Math.min((now - last) * 0.001, 0.05);
      last = now;
      if (opts.audio) obsAudio.update(dt);
      if (orbitControls) orbitControls.update();
      if (opts.onFrame) opts.onFrame(ctx, dt);
      if (composer) composer.render();
      else renderer.render(scene, camera);
    };
    animPerf();
  } else {
    const clock = new THREE.Clock();
    const animClock = (): void => {
      requestAnimationFrame(animClock);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (opts.audio) obsAudio.update(dt);
      if (orbitControls) orbitControls.update();
      if (opts.onFrame) opts.onFrame(ctx, dt);
      if (composer) composer.render();
      else renderer.render(scene, camera);
    };
    animClock();
  }
}
