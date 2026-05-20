import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

import earthModelUrl from "../../../raw-assets/main{m}/earth/source/Earth.fbx?url";
import earthTextureUrl from "../../../raw-assets/main{m}/earth/textures/1_earth_8k.jpg?url";
import moonTextureUrl from "../../../raw-assets/main{m}/earth/textures/moon-generated.png?url";

const TAU = Math.PI * 2;
const STAR_COUNT = 520;
const DUST_COUNT = 90;
const CAMERA_Y = 2.15;
const CAMERA_LOOK_Y = -0.18;
const MOON_ORBIT_X = 2.55;
const MOON_ORBIT_Y = 1.38;
const MOON_ORBIT_Z = 0.95;
const NEBULA_COLORS = [0x5b21b6, 0x0e7490, 0x1d4ed8, 0xbe185d, 0x7c3aed];
const STAR_COLORS = [0xffffff, 0xdbeafe, 0xc4b5fd, 0xbae6fd, 0xfef3c7];

interface Star {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
  drift: number;
  color: number;
}

interface Dust {
  x: number;
  y: number;
  radius: number;
  phase: number;
  color: number;
}

interface NebulaBlob {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
  phase: number;
  dx: number;
  dy: number;
}

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function softCircle(
  graphics: Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha: number,
  layers = 7,
): void {
  for (let i = layers; i >= 1; i--) {
    const p = i / layers;
    graphics.circle(x, y, radius * p).fill({
      color,
      alpha: alpha * Math.pow(1 - p, 1.8),
    });
  }
}

export class SpaceEarthScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly background = new Graphics();
  private readonly nebula = new Graphics();
  private readonly starLayer = new Graphics();
  private readonly foreground = new Graphics();

  private readonly stars: Star[] = [];
  private readonly dust: Dust[] = [];
  private readonly blobs: NebulaBlob[] = [];

  private w = 1920;
  private h = 1080;
  private time = 0;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private earthRoot?: THREE.Group;
  private earthTexture?: THREE.Texture;
  private moonTexture?: THREE.Texture;
  private atmosphere?: THREE.Mesh;
  private moon?: THREE.Mesh;
  private pixiCanvas?: HTMLCanvasElement;
  private threeCanvas?: HTMLCanvasElement;

  constructor() {
    super();
    this.addChild(
      this.background,
      this.nebula,
      this.starLayer,
      this.foreground,
    );
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.seedSpace();
    this.setupThree();
    await this.loadEarth();
    this.resize(this.w, this.h);
  }

  public async hide(): Promise<void> {
    this.threeCanvas?.remove();
    this.renderer?.dispose();
    this.scene?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.earthTexture?.dispose();
    this.moonTexture?.dispose();
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;

    if (this.renderer && this.camera) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.position.set(0, CAMERA_Y, this.cameraDistance);
      this.camera.lookAt(0, CAMERA_LOOK_Y, 0);
      this.camera.updateProjectionMatrix();
    }

    if (this.threeCanvas) {
      this.threeCanvas.style.width = `${width}px`;
      this.threeCanvas.style.height = `${height}px`;
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.drawSpace();
    this.renderThree(dt);
  }

  private get cameraDistance(): number {
    return this.w < this.h ? 6.15 : 5.55;
  }

  private seedSpace(): void {
    this.stars.length = 0;
    this.dust.length = 0;
    this.blobs.length = 0;

    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        radius: random(0.45, 2.2),
        phase: random(0, TAU),
        speed: random(0.3, 1.25),
        drift: random(-0.012, 0.018),
        color: pick(STAR_COLORS),
      });
    }

    for (let i = 0; i < DUST_COUNT; i++) {
      this.dust.push({
        x: Math.random(),
        y: Math.random(),
        radius: random(1.5, 5.5),
        phase: random(0, TAU),
        color: pick([0x67e8f9, 0xa78bfa, 0xf0abfc, 0xbfdbfe]),
      });
    }

    for (let i = 0; i < 11; i++) {
      this.blobs.push({
        x: random(-0.08, 1.08),
        y: random(-0.08, 1.05),
        radius: random(0.16, 0.34),
        color: NEBULA_COLORS[i % NEBULA_COLORS.length],
        alpha: random(0.035, 0.085),
        phase: random(0, TAU),
        dx: random(-0.018, 0.02),
        dy: random(-0.014, 0.014),
      });
    }
  }

  private setupThree(): void {
    const mount = document.getElementById("pixi-container");
    if (!mount) return;

    mount.style.position = "relative";
    mount.style.width = "100vw";
    mount.style.height = "100vh";
    mount.style.overflow = "hidden";

    this.pixiCanvas = mount.querySelector("canvas") ?? undefined;
    if (this.pixiCanvas) {
      this.pixiCanvas.style.position = "absolute";
      this.pixiCanvas.style.inset = "0";
      this.pixiCanvas.style.zIndex = "0";
    }

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.w, this.h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.threeCanvas = this.renderer.domElement;
    this.threeCanvas.style.position = "absolute";
    this.threeCanvas.style.inset = "0";
    this.threeCanvas.style.zIndex = "1";
    this.threeCanvas.style.pointerEvents = "none";
    mount.appendChild(this.threeCanvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, this.w / this.h, 0.1, 100);
    this.camera.position.set(0, CAMERA_Y, this.cameraDistance);
    this.camera.lookAt(0, CAMERA_LOOK_Y, 0);

    const key = new THREE.DirectionalLight(0xdbeafe, 4.4);
    key.position.set(-3.4, 1.8, 4.6);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x67e8f9, 2.6);
    rim.position.set(3.2, 1.2, -2.2);
    this.scene.add(rim);

    this.scene.add(new THREE.AmbientLight(0x26304f, 0.85));
    this.earthRoot = new THREE.Group();
    this.earthRoot.rotation.set(-0.18, -0.4, 0.12);
    this.scene.add(this.earthRoot);
    this.addAtmosphere();
    this.addMoon();
  }

  private async loadEarth(): Promise<void> {
    if (!this.earthRoot) return;

    try {
      const [earth, texture] = await Promise.all([
        new FBXLoader().loadAsync(earthModelUrl),
        this.loadEarthTexture(),
      ]);
      const bounds = new THREE.Box3().setFromObject(earth);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxAxis = Math.max(size.x, size.y, size.z) || 1;

      earth.position.sub(center);
      earth.scale.setScalar(2.25 / maxAxis);
      this.earthTexture = texture;
      earth.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = false;
          object.material = this.createEarthMaterial(texture);
        }
      });

      this.earthRoot.add(earth);
    } catch (error) {
      console.warn(
        "Failed to load Earth.fbx; using procedural fallback.",
        error,
      );
      this.earthRoot.add(this.createFallbackEarth());
    }
  }

  private async loadEarthTexture(): Promise<THREE.Texture> {
    const texture = await new THREE.TextureLoader().loadAsync(earthTextureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = this.renderer?.capabilities.getMaxAnisotropy() ?? 1;
    return texture;
  }

  private createEarthMaterial(
    texture: THREE.Texture,
  ): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      emissive: 0x071833,
      emissiveIntensity: 0.2,
      roughness: 0.68,
      metalness: 0,
    });
  }

  private createFallbackEarth(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 96, 64),
      new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        emissive: 0x0f172a,
        roughness: 0.74,
      }),
    );
  }

  private addAtmosphere(): void {
    if (!this.earthRoot) return;

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.22, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.4);
            gl_FragColor = vec4(0.32, 0.84, 1.0, rim * 0.58);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.earthRoot.add(this.atmosphere);
  }

  private addMoon(): void {
    if (!this.scene) return;

    this.moonTexture = new THREE.TextureLoader().load(moonTextureUrl);
    this.moonTexture.colorSpace = THREE.SRGBColorSpace;
    this.moonTexture.wrapS = THREE.RepeatWrapping;
    this.moonTexture.wrapT = THREE.RepeatWrapping;
    this.moonTexture.magFilter = THREE.LinearFilter;
    this.moonTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.moonTexture.anisotropy =
      this.renderer?.capabilities.getMaxAnisotropy() ?? 1;

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 32, 24),
      new THREE.MeshStandardMaterial({
        map: this.moonTexture,
        color: 0xd8dee9,
        emissive: 0x111827,
        emissiveIntensity: 0.08,
        roughness: 1,
      }),
    );

    this.scene.add(this.moon);
  }

  private drawSpace(): void {
    const w = this.w;
    const h = this.h;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const span = Math.max(w, h);

    this.background.clear();
    this.background.rect(0, 0, w, h).fill({ color: 0x02040d });
    softCircle(
      this.background,
      cx * 0.78,
      cy * 0.45,
      span * 0.62,
      0x111827,
      0.5,
    );
    softCircle(
      this.background,
      w * 0.72,
      h * 0.34,
      span * 0.45,
      0x0f172a,
      0.42,
    );
    softCircle(
      this.background,
      w * 0.48,
      h * 0.58,
      span * 0.42,
      0x1e1b4b,
      0.22,
    );

    this.nebula.clear();
    for (const blob of this.blobs) {
      const wave = Math.sin(this.time * 0.12 + blob.phase);
      const x = (blob.x + blob.dx * wave) * w;
      const y =
        (blob.y + blob.dy * Math.cos(this.time * 0.11 + blob.phase)) * h;
      softCircle(
        this.nebula,
        x,
        y,
        blob.radius * span,
        blob.color,
        blob.alpha * (0.78 + wave * 0.18),
        8,
      );
    }

    this.starLayer.clear();
    for (const star of this.stars) {
      const twinkle =
        0.55 + Math.sin(this.time * star.speed + star.phase) * 0.35;
      const x = ((star.x + this.time * star.drift * 0.01) % 1) * w;
      const y = star.y * h;
      this.starLayer.circle(x < 0 ? x + w : x, y, star.radius).fill({
        color: star.color,
        alpha: 0.35 + twinkle * 0.55,
      });
    }

    for (const mote of this.dust) {
      const y = ((mote.y + this.time * 0.006) % 1) * h;
      const alpha =
        0.04 + 0.08 * (0.5 + Math.sin(this.time * 0.45 + mote.phase) * 0.5);
      this.starLayer.circle(mote.x * w, y, mote.radius).fill({
        color: mote.color,
        alpha,
      });
    }

    this.foreground.clear();
    softCircle(
      this.foreground,
      cx,
      cy,
      Math.min(w, h) * 0.3,
      0x38bdf8,
      0.055,
      6,
    );
    this.foreground
      .ellipse(w * 0.5, h * 0.51, w * 0.26, h * 0.055)
      .stroke({ color: 0x93c5fd, alpha: 0.16, width: 1.4 });
    this.foreground
      .ellipse(w * 0.5, h * 0.51, w * 0.34, h * 0.075)
      .stroke({ color: 0xc4b5fd, alpha: 0.08, width: 1 });
  }

  private renderThree(dt: number): void {
    if (!this.renderer || !this.scene || !this.camera) return;

    if (this.earthRoot) {
      this.earthRoot.rotation.y += dt * 0.16;
      this.earthRoot.rotation.x = -0.18 + Math.sin(this.time * 0.16) * 0.025;
      this.earthRoot.position.y = Math.sin(this.time * 0.35) * 0.035;
    }

    if (this.atmosphere) {
      const pulse = 1 + Math.sin(this.time * 0.7) * 0.018;
      this.atmosphere.scale.setScalar(pulse);
      this.atmosphere.rotation.y -= dt * 0.05;
    }

    if (this.moon) {
      const centerY = this.earthRoot?.position.y ?? 0;
      const a = this.time * 0.14 + 0.85;
      this.moon.position.set(
        Math.cos(a) * MOON_ORBIT_X,
        centerY + Math.sin(a) * MOON_ORBIT_Y,
        Math.sin(a) * MOON_ORBIT_Z,
      );
    }

    this.renderer.render(this.scene, this.camera);
  }
}
