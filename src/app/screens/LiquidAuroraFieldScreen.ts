import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x030508;
const TAU = Math.PI * 2;
const SCAN_STEP = 4;

// Teal → electric blue → violet cycle
const AC = [
  { r: 0x00, g: 0xd8, b: 0xb4 },
  { r: 0x00, g: 0x99, b: 0xff },
  { r: 0x99, g: 0x44, b: 0xff },
];

function auroraColor(phase: number): number {
  const p = ((phase % 3) + 3) % 3;
  const i = Math.floor(p);
  const t = p - i;
  const a = AC[i];
  const b = AC[(i + 1) % 3];
  return (
    (Math.round(a.r + (b.r - a.r) * t) << 16) |
    (Math.round(a.g + (b.g - a.g) * t) << 8) |
    Math.round(a.b + (b.b - a.b) * t)
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

interface WaveComp {
  freq: number;
  amp: number;
  phase: number;
  speed: number;
}

interface Ribbon {
  baseCyFrac: number;
  cy: number;
  driftAmp: number;
  driftSpeed: number;
  driftPhase: number;
  baseCore: number;
  baseGlow: number;
  comps: WaveComp[];
  colorPhase: number;
  colorSpeed: number;
  flickerPhase: number;
}

const RIBBON_DEFS = [
  { cyFrac: 0.12, baseCore: 7, baseGlow: 50, colorOffset: 0.0 },
  { cyFrac: 0.25, baseCore: 9, baseGlow: 65, colorOffset: 0.45 },
  { cyFrac: 0.38, baseCore: 11, baseGlow: 75, colorOffset: 0.9 },
  { cyFrac: 0.5, baseCore: 13, baseGlow: 80, colorOffset: 1.4 },
  { cyFrac: 0.63, baseCore: 11, baseGlow: 72, colorOffset: 1.9 },
  { cyFrac: 0.76, baseCore: 9, baseGlow: 62, colorOffset: 2.35 },
  { cyFrac: 0.88, baseCore: 7, baseGlow: 52, colorOffset: 0.7 },
] as const;

export class LiquidAuroraFieldScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;
  private ribbons: Ribbon[] = [];

  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private bass = 0;
  private mid = 0;
  private high = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
    void this.initAudio();
  }

  private async initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      src.connect(this.analyser);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch {
      // No mic — runs as ambient animation
    }
  }

  private readBands(): void {
    if (!this.analyser || !this.freqData) return;
    this.analyser.getByteFrequencyData(this.freqData);

    // fftSize 2048 → 1024 bins, ~21.5 Hz each at 44100 Hz
    // Bass: bins 0-11 (~20-237 Hz)
    let rawBass = 0;
    for (let i = 0; i < 12; i++) rawBass += this.freqData[i];
    rawBass /= 12 * 255;

    // Mid: bins 12-116 (~258-2497 Hz)
    let rawMid = 0;
    for (let i = 12; i <= 116; i++) rawMid += this.freqData[i];
    rawMid /= 105 * 255;

    // High: bins 117-464 (~2518-9991 Hz)
    let rawHigh = 0;
    for (let i = 117; i <= 464; i++) rawHigh += this.freqData[i];
    rawHigh /= 348 * 255;

    const smooth = (
      prev: number,
      raw: number,
      boost: number,
      attack: number,
      decay: number,
    ) => {
      const r = clamp(raw * boost, 0, 1);
      return prev + (r - prev) * (r > prev ? attack : decay);
    };

    this.bass = smooth(this.bass, rawBass, 3.0, 0.6, 0.06);
    this.mid = smooth(this.mid, rawMid, 2.5, 0.5, 0.07);
    this.high = smooth(this.high, rawHigh, 3.5, 0.7, 0.1);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.initRibbons();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.initRibbons();
  }

  private initRibbons(): void {
    const H = this.h;
    this.ribbons = RIBBON_DEFS.map((def) => ({
      baseCyFrac: def.cyFrac,
      cy: def.cyFrac * H,
      driftAmp: rand(H * 0.025, H * 0.048),
      driftSpeed: rand(0.06, 0.13),
      driftPhase: rand(0, TAU),
      baseCore: def.baseCore,
      baseGlow: def.baseGlow,
      comps: [
        {
          freq: rand(0.0015, 0.003),
          amp: rand(H * 0.065, H * 0.1),
          phase: rand(0, TAU),
          speed: rand(0.1, 0.25),
        },
        {
          freq: rand(0.006, 0.012),
          amp: rand(H * 0.028, H * 0.048),
          phase: rand(0, TAU),
          speed: rand(0.28, 0.6),
        },
        {
          freq: rand(0.018, 0.035),
          amp: rand(H * 0.011, H * 0.02),
          phase: rand(0, TAU),
          speed: rand(0.6, 1.3),
        },
      ],
      colorPhase: def.colorOffset,
      colorSpeed: rand(0.05, 0.11),
      flickerPhase: rand(0, TAU),
    }));
  }

  private ribbonY(ribbon: Ribbon, x: number, ampMul: number): number {
    let y = ribbon.cy;
    for (const c of ribbon.comps) {
      y += c.amp * ampMul * Math.sin(c.freq * x + c.phase);
    }
    return y;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    this.readBands();

    // Mid drives lateral drift speed
    const driftMul = 1 + this.mid * 2.5;

    for (const r of this.ribbons) {
      for (const c of r.comps) c.phase += c.speed * driftMul * dt;
      r.colorPhase += r.colorSpeed * dt;
      r.cy =
        r.baseCyFrac * this.h +
        r.driftAmp * Math.sin(this.time * r.driftSpeed + r.driftPhase);
    }

    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    const W = this.w;
    const H = this.h;
    const t = this.time;
    const bass = this.bass;
    const high = this.high;

    // Bass widens and amplifies ribbons
    const ampMul = 1 + bass * 1.8;

    for (const r of this.ribbons) {
      const color = auroraColor(r.colorPhase);
      const coreW = r.baseCore * (1 + bass * 2.2);
      const glowW = r.baseGlow * (1 + bass * 1.4);

      for (let x = 0; x <= W; x += SCAN_STEP) {
        const cy = this.ribbonY(r, x, ampMul);

        if (cy < -glowW * 1.5 || cy > H + glowW * 1.5) continue;

        // High-freq flicker along the ribbon (edges shimmer)
        const flicker =
          high * Math.sin(x * 0.1 + t * 16 + r.flickerPhase) * 0.5;

        // Outer glow
        g.moveTo(x, cy - glowW)
          .lineTo(x, cy + glowW)
          .stroke({
            width: SCAN_STEP,
            color,
            alpha: clamp(0.022 + flicker * 0.015, 0.004, 0.12),
          });

        // Inner glow
        g.moveTo(x, cy - coreW * 2.8)
          .lineTo(x, cy + coreW * 2.8)
          .stroke({
            width: SCAN_STEP,
            color,
            alpha: clamp(0.1 + flicker * 0.07, 0.015, 0.32),
          });

        // Bright core
        g.moveTo(x, cy - coreW)
          .lineTo(x, cy + coreW)
          .stroke({
            width: SCAN_STEP,
            color,
            alpha: clamp(0.52 + flicker * 0.2, 0.08, 0.88),
          });

        // Luminous center thread — flickers white on high frequencies
        const threadAlpha = clamp(0.18 + high * 0.45 * flicker, 0, 0.65);
        if (threadAlpha > 0.02) {
          g.moveTo(x, cy - 2)
            .lineTo(x, cy + 2)
            .stroke({ width: SCAN_STEP, color: 0xffffff, alpha: threadAlpha });
        }
      }
    }
  }
}
