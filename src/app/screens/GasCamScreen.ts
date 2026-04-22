import { Container, Graphics, Ticker } from "pixi.js";

// ── Catppuccin Mocha Palette ──────────────────────────────────────────────────
const CATT_MAUVE = 0xcba6f7;
const CATT_BLUE = 0x89b4fa;
const CATT_TEAL = 0x94e2d5;
const CATT_SKY = 0x89dceb;
const CATT_SAPPHIRE = 0x74c7ec;
const CATT_LAVENDER = 0xb4befe;

const PALETTE = [
  CATT_MAUVE,
  CATT_BLUE,
  CATT_TEAL,
  CATT_SKY,
  CATT_SAPPHIRE,
  CATT_LAVENDER,
] as const;

// ── Configuration ─────────────────────────────────────────────────────────────
const CAM_W = 480;
const CAM_H = 480;
const SUBDIVISIONS = 80;
const N_LAYERS = 12;

// ── Simple Noise ──────────────────────────────────────────────────────────────
const PERM = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 0xdeadbeef;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
})();

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function fade(t: number) {
  return t * t * t * (t * (6 * t - 15) + 10);
}
function grad(hash: number, x: number, y: number, z: number) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = PERM[X] + Y,
    AA = PERM[A] + Z,
    AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y,
    BA = PERM[B] + Z,
    BB = PERM[B + 1] + Z;

  return lerp(
    lerp(
      lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u),
      lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u),
      v,
    ),
    lerp(
      lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u),
      lerp(
        grad(PERM[AB + 1], x, y - 1, z - 1),
        grad(PERM[BB + 1], x - 1, y - 1, z - 1),
        u,
      ),
      v,
    ),
    w,
  );
}

export class GasCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly gfx = new Graphics();
  private time = 0;

  constructor() {
    super();
    this.addChild(this.world);
    this.world.addChild(this.gfx);
  }

  public update(ticker: Ticker): void {
    this.time += ticker.deltaTime * 0.01;

    const g = this.gfx;
    g.clear();

    // 1. Static wavy line base
    this.drawGasLayer(g, -1, true);

    // 2. Main animated frame layers
    for (let i = 0; i < N_LAYERS; i++) {
      this.drawGasLayer(g, i, false);
    }

    // 3. Sharp outer border
    this.drawSharpBorder(g);

    // 4. Pins at corners
    this.drawPins(g);
  }

  private drawGasLayer(g: Graphics, layerIndex: number, isStatic: boolean): void {
    const isBig = !isStatic && layerIndex >= N_LAYERS - 4;
    const color = isStatic ? 0xffffff : PALETTE[layerIndex % PALETTE.length];
    
    // Thickness grows but layers are closer
    let thickness = isStatic ? 1.5 : 3 + (layerIndex / N_LAYERS) * 12;
    if (isBig) thickness += 8;

    let alpha = isStatic ? 0.25 : 0.6 - (layerIndex / N_LAYERS) * 0.4;
    if (isBig) alpha *= 0.7;

    // Tight Spacing: reduction from multipliers of 8/10 to 2
    const cornerRadius = 25 + (isStatic ? -5 : layerIndex * 2);
    const halfW = CAM_W / 2 - 5 + (isStatic ? -2 : layerIndex * 2);
    const halfH = CAM_H / 2 - 5 + (isStatic ? -2 : layerIndex * 2);

    const points: { x: number; y: number }[] = [];
    const stepsPerCorner = 20;
    
    // Rounded Square Construction
    // Top-Right Corner
    for (let i = 0; i <= stepsPerCorner; i++) {
      const angle = -Math.PI / 2 + (i / stepsPerCorner) * (Math.PI / 2);
      points.push({
        x: halfW - cornerRadius + Math.cos(angle) * cornerRadius,
        y: -halfH + cornerRadius + Math.sin(angle) * cornerRadius,
      });
    }
    // Right Edge
    for (let i = 1; i < SUBDIVISIONS; i++) {
      points.push({ x: halfW, y: lerp(-halfH + cornerRadius, halfH - cornerRadius, i / SUBDIVISIONS) });
    }
    // Bottom-Right Corner
    for (let i = 0; i <= stepsPerCorner; i++) {
      const angle = (i / stepsPerCorner) * (Math.PI / 2);
      points.push({
        x: halfW - cornerRadius + Math.cos(angle) * cornerRadius,
        y: halfH - cornerRadius + Math.sin(angle) * cornerRadius,
      });
    }
    // Bottom Edge
    for (let i = 1; i < SUBDIVISIONS; i++) {
      points.push({ x: lerp(halfW - cornerRadius, -halfW + cornerRadius, i / SUBDIVISIONS), y: halfH });
    }
    // Bottom-Left Corner
    for (let i = 0; i <= stepsPerCorner; i++) {
      const angle = Math.PI / 2 + (i / stepsPerCorner) * (Math.PI / 2);
      points.push({
        x: -halfW + cornerRadius + Math.cos(angle) * cornerRadius,
        y: halfH - cornerRadius + Math.sin(angle) * cornerRadius,
      });
    }
    // Left Edge
    for (let i = 1; i < SUBDIVISIONS; i++) {
      points.push({ x: -halfW, y: lerp(halfH - cornerRadius, -halfH + cornerRadius, i / SUBDIVISIONS) });
    }
    // Top-Left Corner
    for (let i = 0; i <= stepsPerCorner; i++) {
      const angle = Math.PI + (i / stepsPerCorner) * (Math.PI / 2);
      points.push({
        x: -halfW + cornerRadius + Math.cos(angle) * cornerRadius,
        y: -halfH + cornerRadius + Math.sin(angle) * cornerRadius,
      });
    }
    // Top Edge
    for (let i = 1; i < SUBDIVISIONS; i++) {
      points.push({ x: lerp(-halfW + cornerRadius, halfW - cornerRadius, i / SUBDIVISIONS), y: -halfH });
    }

    // Noise Displacement
    const displacedPoints: number[] = [];
    const noiseScale = isBig ? 0.004 : 0.008;
    const timeScale = isStatic ? 0 : 0.3 + (layerIndex / N_LAYERS) * 0.4;
    const timeVal = isStatic ? 888.888 : this.time * timeScale + layerIndex * 2.0;
    
    // Amp keeps them clustering around the line
    let amp = isStatic ? 15 : 10 + (layerIndex / N_LAYERS) * 25;
    if (isBig) amp += 15;

    for (const p of points) {
      const nx = noise3D(p.x * noiseScale, p.y * noiseScale, timeVal);
      const ny = noise3D(p.x * noiseScale + 150, p.y * noiseScale + 150, timeVal);
      
      displacedPoints.push(p.x + nx * amp, p.y + ny * amp);
    }

    g.poly(displacedPoints, true).stroke({
      color,
      width: thickness,
      alpha,
      cap: "round",
      join: "round",
    });
  }

  private drawSharpBorder(g: Graphics): void {
    const halfW = CAM_W / 2;
    const halfH = CAM_H / 2;
    
    // Outer sharp border
    g.rect(-halfW, -halfH, CAM_W, CAM_H).stroke({
      color: 0xffffff,
      width: 3,
      alpha: 1,
      join: "miter",
      miterLimit: 10,
    });

    // Inner rounded border glow
    const innerRadius = 30;
    g.roundRect(-halfW + 15, -halfH + 15, CAM_W - 30, CAM_H - 30, innerRadius).stroke({
      color: CATT_SKY,
      width: 2,
      alpha: 0.4,
    });
  }

  private drawPins(g: Graphics): void {
    const halfW = CAM_W / 2;
    const halfH = CAM_H / 2;
    const corners = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];

    for (const c of corners) {
      // Pin Glow
      g.circle(c.x, c.y, 10).fill({ color: 0xffffff, alpha: 0.15 });
      g.circle(c.x, c.y, 5).fill({ color: 0xffffff, alpha: 0.4 });
      g.circle(c.x, c.y, 2.5).fill({ color: 0xffffff, alpha: 1 });
      
      // Tech Brackets
      const len = 35;
      const xDir = c.x > 0 ? -1 : 1;
      const yDir = c.y > 0 ? -1 : 1;
      
      g.moveTo(c.x, c.y).lineTo(c.x + xDir * len, c.y).stroke({ color: 0xffffff, width: 2.5, alpha: 0.9 });
      g.moveTo(c.x, c.y).lineTo(c.x, c.y + yDir * len).stroke({ color: 0xffffff, width: 2.5, alpha: 0.9 });
    }
  }

  public resize(width: number, height: number): void {
    this.world.x = width * 0.5;
    this.world.y = height * 0.5;
  }
}
