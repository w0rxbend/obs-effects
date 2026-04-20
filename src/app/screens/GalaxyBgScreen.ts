import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Texture } from "pixi.js";

const W = 1920;
const H = 1080;
const CX = W / 2;
const CY = H / 2;
const TAU = Math.PI * 2;

// Catppuccin Mocha
const CRUST = 0x11111b;
const MANTLE = 0x181825;
const SURFACE1 = 0x45475a;
const SURFACE2 = 0x585b70;
const LAVENDER = 0xb4befe;
const BLUE = 0x89b4fa;
const SAPPHIRE = 0x74c7ec;
const TEAL = 0x94e2d5;
const GREEN = 0xa6e3a1;
const MAUVE = 0xcba6f7;
const PINK = 0xf38ba8;
const FLAMINGO = 0xf2cdcd;
const PEACH = 0xfab387;
const YELLOW = 0xf9e2af;

const N_ARM = 6000;
const N_HALO = 2000;
const N_BG = 1500;
const N_BRIGHT = 40;
const N_CORE = 800;

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function gaussian(): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

// Pre-bake a soft radial dot texture for a given solid color
function makeDotTex(hexColor: number, radius: number): Texture {
  const r = (hexColor >> 16) & 0xff;
  const g = (hexColor >> 8) & 0xff;
  const b = hexColor & 0xff;
  const sz = radius * 2 + 2;
  const cv = document.createElement("canvas");
  cv.width = sz;
  cv.height = sz;
  const ctx = cv.getContext("2d")!;
  const mid = sz / 2;
  const grad = ctx.createRadialGradient(mid, mid, 0, mid, mid, radius);
  grad.addColorStop(0.0, `rgba(${r},${g},${b},1.0)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.75)`);
  grad.addColorStop(1.0, `rgba(${r},${g},${b},0.0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sz, sz);
  return Texture.from(cv);
}

// Flattened galaxy rotation curve: angular velocity in rad/ms
function angVel(r: number): number {
  const vc = 0.000045; // rad·px/ms — controls overall rotation speed
  const r0 = 120; // core solid-body boundary
  return vc / Math.max(r, r0);
}

export class GalaxyBgScreen extends Container {
  public static assetBundles: string[] = [];

  // Layers back → front
  private readonly bgG = new Graphics(); // solid fill + static stars
  private readonly haloLayer = new Container(); // 2000 slow solid-body halo stars
  private readonly dustLayer = new Container(); // 4 dark dust lanes
  private readonly armLayer = new Container(); // 6000 orbital arm particles
  private readonly nebulaLayer = new Container(); // 7 additive-blend nebula pockets
  private readonly coreGlowG = new Graphics(); // additive core bloom
  private readonly coreLayer = new Container(); // 800 core particles
  private readonly spikeG = new Graphics(); // static diffraction spike stars

  // Arm particle state in typed arrays (index-aligned with armSprites)
  private armAngles!: Float32Array;
  private armRadii!: Float32Array;
  private armAngVels!: Float32Array;
  private armSprites: Sprite[] = [];

  // Rotation accumulators
  private haloAngle = 0;
  private dustAngle = 0;
  private spikeAngle = 0;
  private armAngle = 0;
  private coreAngle = 0;
  private readonly HALO_ANG_VEL = TAU / 75_000; // 75 s / rev
  private readonly DUST_ANG_VEL = angVel(360); // mid-arm speed
  private readonly SPIKE_ANG_VEL = TAU / 55_000; // 55 s / rev
  private readonly ARM_ANG_VEL = TAU / 90_000; // slow base sweep added on top of orbital mechanics
  private readonly CORE_ANG_VEL = TAU / 35_000; // 35 s / rev — fast, matches dense inner region

  private elapsed = 0;
  private nebMeta: { c: Container; phase: number; period: number }[] = [];
  private texMap!: Map<number, Texture>;
  private dustTex!: Texture;
  private ready = false;

  constructor() {
    super();
    [
      this.bgG,
      this.haloLayer,
      this.dustLayer,
      this.armLayer,
      this.nebulaLayer,
      this.coreGlowG,
      this.coreLayer,
      this.spikeG,
    ].forEach((l) => this.addChild(l));

    // All rotating layers pivot around canvas center
    for (const layer of [
      this.haloLayer,
      this.dustLayer,
      this.nebulaLayer,
      this.armLayer,
      this.coreGlowG,
      this.coreLayer,
      this.spikeG,
    ]) {
      layer.pivot.set(CX, CY);
      layer.position.set(CX, CY);
    }
  }

  public async show(): Promise<void> {
    const palette = [
      PINK,
      MAUVE,
      LAVENDER,
      BLUE,
      SAPPHIRE,
      TEAL,
      YELLOW,
      PEACH,
      FLAMINGO,
      GREEN,
      SURFACE2,
    ];
    this.texMap = new Map();
    for (const c of palette) {
      if (!this.texMap.has(c)) this.texMap.set(c, makeDotTex(c, 3));
    }
    this.dustTex = makeDotTex(MANTLE, 4);

    this.buildBg();
    this.buildHalo();
    this.buildArms();
    this.buildDust();
    this.buildNebulae();
    this.buildCoreGlow();
    this.buildCore();
    this.buildSpikes();
    this.ready = true;
  }

  public update(time: Ticker): void {
    if (!this.ready) return;
    this.elapsed += time.deltaMS;
    const dt = time.deltaMS;

    // Each layer rotates at its own speed around canvas center
    this.haloAngle += this.HALO_ANG_VEL * dt;
    this.dustAngle += this.DUST_ANG_VEL * dt;
    this.spikeAngle += this.SPIKE_ANG_VEL * dt;
    this.armAngle += this.ARM_ANG_VEL * dt;
    this.coreAngle += this.CORE_ANG_VEL * dt;

    this.haloLayer.rotation = this.haloAngle;
    this.dustLayer.rotation = this.dustAngle;
    this.nebulaLayer.rotation = this.dustAngle;
    this.spikeG.rotation = this.spikeAngle;
    this.armLayer.rotation = this.armAngle;
    this.coreGlowG.rotation = this.coreAngle;
    this.coreLayer.rotation = this.coreAngle;

    // Arm orbital mechanics — per-particle angle integration
    for (let i = 0; i < N_ARM; i++) {
      this.armAngles[i] += this.armAngVels[i] * dt;
      const s = this.armSprites[i];
      const a = this.armAngles[i];
      const r = this.armRadii[i];
      s.x = CX + Math.cos(a) * r;
      s.y = CY + Math.sin(a) * r;
    }

    // Core brightness pulse (6 s cycle)
    const pulse = 0.75 + 0.25 * Math.sin((TAU * this.elapsed) / 6000);
    this.coreGlowG.alpha = pulse;
    this.coreLayer.alpha = 0.6 + 0.4 * pulse;

    // Nebula independent alpha pulses
    for (const nb of this.nebMeta) {
      nb.c.alpha =
        0.04 +
        0.05 *
          (0.5 + 0.5 * Math.sin((TAU * this.elapsed) / nb.period + nb.phase));
    }
  }

  public resize(width: number, height: number): void {
    this.x = Math.round((width - W) / 2);
    this.y = Math.round((height - H) / 2);
  }

  // ── Layer builders ────────────────────────────────────────────────────────

  private buildBg(): void {
    const g = this.bgG;
    g.rect(0, 0, W, H).fill({ color: CRUST });
    for (let i = 0; i < N_BG; i++) {
      g.circle(rnd(0, W), rnd(0, H), 0.6).fill({
        color: i % 2 === 0 ? SURFACE1 : SURFACE2,
        alpha: rnd(0.1, 0.4),
      });
    }
    for (let i = 0; i < N_BRIGHT; i++) {
      g.circle(rnd(0, W), rnd(0, H), 0.9).fill({
        color: SURFACE2,
        alpha: rnd(0.45, 0.75),
      });
    }
  }

  private buildHalo(): void {
    const cols = [SURFACE2, LAVENDER];
    for (let i = 0; i < N_HALO; i++) {
      const angle = rnd(0, TAU);
      // Density falls off with radius: r ~ 200 + (1-√u)·600
      const r = 200 + (1 - Math.sqrt(Math.random())) * 600;
      const s = new Sprite(this.texMap.get(cols[i % 2])!);
      s.anchor.set(0.5);
      s.x = CX + Math.cos(angle) * r;
      s.y = CY + Math.sin(angle) * r;
      s.alpha = rnd(0.12, 0.32);
      s.scale.set(rnd(0.28, 0.44));
      this.haloLayer.addChild(s);
    }
  }

  private buildArms(): void {
    const offsets = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
    const counts = [2000, 2000, 1000, 1000];

    this.armAngles = new Float32Array(N_ARM);
    this.armRadii = new Float32Array(N_ARM);
    this.armAngVels = new Float32Array(N_ARM);

    let idx = 0;
    for (let a = 0; a < 4; a++) {
      const secondary = a >= 2;
      for (let p = 0; p < counts[a]; p++) {
        const t = Math.random();
        const theta = t * 1.5 * TAU;
        const r_base = 80 + t * 600;
        const sw = 15 + t * 45;
        const radius = Math.max(50, r_base + gaussian() * sw);
        const angle =
          offsets[a] + theta + (gaussian() * sw * 0.25) / Math.max(r_base, 80);

        this.armAngles[idx] = angle;
        this.armRadii[idx] = radius;
        this.armAngVels[idx] = angVel(radius);

        let color: number;
        let al: number;
        let sc: number;
        if (t < 0.3) {
          color = Math.random() < 0.5 ? PINK : MAUVE;
          al = rnd(0.45, 0.82);
          sc = rnd(0.38, 0.68);
        } else if (t < 0.65) {
          color = Math.random() < 0.5 ? LAVENDER : BLUE;
          al = rnd(0.35, 0.72);
          sc = rnd(0.28, 0.52);
        } else {
          color = Math.random() < 0.5 ? SAPPHIRE : TEAL;
          al = rnd(0.22, 0.52);
          sc = rnd(0.22, 0.42);
        }
        if (secondary) al *= 0.55;

        const s = new Sprite(this.texMap.get(color)!);
        s.anchor.set(0.5);
        s.x = CX + Math.cos(angle) * radius;
        s.y = CY + Math.sin(angle) * radius;
        s.alpha = al;
        s.scale.set(sc);
        this.armLayer.addChild(s);
        this.armSprites.push(s);
        idx++;
      }
    }
  }

  private buildDust(): void {
    for (let lane = 0; lane < 4; lane++) {
      const base = (lane / 4) * TAU + rnd(0.2, 0.9);
      const n = Math.floor(rnd(600, 800));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const r = 100 + t * 380 + gaussian() * 16;
        const angle = base + t * Math.PI * 0.85 + gaussian() * 0.04;
        const s = new Sprite(this.dustTex);
        s.anchor.set(0.5);
        s.x = CX + Math.cos(angle) * r;
        s.y = CY + Math.sin(angle) * r;
        s.alpha = rnd(0.33, 0.56);
        s.scale.set(rnd(1.0, 2.1));
        this.dustLayer.addChild(s);
      }
    }
  }

  private buildNebulae(): void {
    const pairs: [number, number][] = [
      [PINK, FLAMINGO],
      [TEAL, GREEN],
      [BLUE, SAPPHIRE],
      [MAUVE, LAVENDER],
      [PINK, MAUVE],
      [TEAL, SAPPHIRE],
      [FLAMINGO, PEACH],
    ];
    for (let n = 0; n < 7; n++) {
      const t = rnd(0.1, 0.9);
      const theta = t * 1.5 * TAU;
      const r_arm = 80 + t * 600;
      const off = Math.random() < 0.5 ? 0 : Math.PI;
      const nx = CX + Math.cos(off + theta) * r_arm;
      const ny = CY + Math.sin(off + theta) * r_arm;

      const nb = new Container();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (nb as any).blendMode = "add";
      const g = new Graphics();
      const [c1, c2] = pairs[n];
      for (let i = 0; i < Math.floor(rnd(80, 120)); i++) {
        g.circle(nx + gaussian() * 55, ny + gaussian() * 55, rnd(15, 35)).fill({
          color: Math.random() < 0.5 ? c1 : c2,
          alpha: 1.0,
        });
      }
      nb.addChild(g);
      nb.alpha = rnd(0.04, 0.08);
      this.nebulaLayer.addChild(nb);
      this.nebMeta.push({
        c: nb,
        phase: rnd(0, TAU),
        period: rnd(5000, 12000),
      });
    }
  }

  private buildCoreGlow(): void {
    const g = this.coreGlowG;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g as any).blendMode = "add";
    const radii = [20, 50, 90, 140, 190];
    const alphas = [0.09, 0.07, 0.05, 0.04, 0.03];
    for (let i = 0; i < 5; i++) {
      g.circle(CX, CY, radii[i]).fill({ color: YELLOW, alpha: alphas[i] });
    }
  }

  private buildCore(): void {
    for (let i = 0; i < N_CORE; i++) {
      const r = Math.abs(gaussian()) * 50;
      const angle = rnd(0, TAU);
      const t = Math.min(r / 120, 1);
      const color =
        t < 0.5
          ? Math.random() < 0.5
            ? YELLOW
            : PEACH
          : Math.random() < 0.5
            ? MAUVE
            : PINK;
      const s = new Sprite(this.texMap.get(color)!);
      s.anchor.set(0.5);
      s.x = CX + Math.cos(angle) * r;
      s.y = CY + Math.sin(angle) * r;
      s.alpha = rnd(0.65, 1.0) * (1 - t * 0.45);
      s.scale.set(rnd(0.32, 0.72));
      this.coreLayer.addChild(s);
    }
  }

  private buildSpikes(): void {
    const g = this.spikeG;
    const N = Math.floor(rnd(12, 19));
    for (let i = 0; i < N; i++) {
      let x: number, y: number;
      do {
        x = rnd(60, W - 60);
        y = rnd(60, H - 60);
      } while (Math.hypot(x - CX, y - CY) < 200);

      const color = i % 2 === 0 ? YELLOW : LAVENDER;
      const al = rnd(0.7, 1.0);
      const len = rnd(20, 40);
      g.circle(x, y, rnd(1.0, 1.5)).fill({ color, alpha: al });
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI;
        for (const dir of [-1, 1] as const) {
          g.moveTo(x, y)
            .lineTo(
              x + Math.cos(ang) * dir * len,
              y + Math.sin(ang) * dir * len,
            )
            .stroke({ color, width: 0.5, alpha: al * 0.55 });
        }
      }
    }
  }
}
