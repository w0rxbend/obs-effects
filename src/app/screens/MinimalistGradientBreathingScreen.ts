import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Texture } from "pixi.js";

type RGB = [number, number, number];

// Catppuccin Mocha palette
const CRUST: RGB = [0x11, 0x11, 0x1b];
const MAUVE: RGB = [0xcb, 0xa6, 0xf7];
const BLUE: RGB = [0x89, 0xb4, 0xfa];
const LAVENDER: RGB = [0xb4, 0xbe, 0xfe];
const SAPPHIRE: RGB = [0x74, 0xc7, 0xec];
const SKY: RGB = [0x89, 0xdc, 0xeb];
const TEAL: RGB = [0x94, 0xe2, 0xd5];
const GREEN: RGB = [0xa6, 0xe3, 0xa1];
const PEACH: RGB = [0xfa, 0xb3, 0x87];
const PINK: RGB = [0xf5, 0xc2, 0xe7];
const FLAMINGO: RGB = [0xf2, 0xcd, 0xcd];
const ROSEWATER: RGB = [0xf5, 0xe0, 0xdc];
const RED: RGB = [0xf3, 0x8b, 0xa8];
const MAROON: RGB = [0xeb, 0xa0, 0xac];
const YELLOW: RGB = [0xf9, 0xe2, 0xaf];

// Each palette defines the color for each of the 4 drifting blobs
const PALETTES: RGB[][] = [
  [MAUVE, BLUE, LAVENDER, SAPPHIRE], // Night Garden
  [PEACH, FLAMINGO, PINK, ROSEWATER], // Dawn Blush
  [SAPPHIRE, SKY, TEAL, BLUE], // Ocean Depths
  [GREEN, TEAL, SAPPHIRE, LAVENDER], // Forest Stream
  [FLAMINGO, PINK, MAROON, RED], // Ember Glow
  [YELLOW, PEACH, MAROON, FLAMINGO], // Sunset Haze
  [LAVENDER, MAUVE, BLUE, PINK], // Twilight
];

// Internal gradient canvas resolution — upscaled to fill screen
const GW = 128;
const GH = 128;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerpC(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

interface BlobDef {
  xFrac: number;
  yFrac: number;
  driftAmp: number;
  driftSpeedX: number;
  driftSpeedY: number;
  driftPhaseX: number;
  driftPhaseY: number;
}

const BLOBS: BlobDef[] = [
  {
    xFrac: 0.25,
    yFrac: 0.25,
    driftAmp: 0.12,
    driftSpeedX: 0.071,
    driftSpeedY: 0.057,
    driftPhaseX: 0.0,
    driftPhaseY: 1.2,
  },
  {
    xFrac: 0.76,
    yFrac: 0.22,
    driftAmp: 0.1,
    driftSpeedX: 0.053,
    driftSpeedY: 0.079,
    driftPhaseX: 2.1,
    driftPhaseY: 0.5,
  },
  {
    xFrac: 0.27,
    yFrac: 0.77,
    driftAmp: 0.13,
    driftSpeedX: 0.065,
    driftSpeedY: 0.043,
    driftPhaseX: 4.4,
    driftPhaseY: 3.1,
  },
  {
    xFrac: 0.74,
    yFrac: 0.74,
    driftAmp: 0.11,
    driftSpeedX: 0.083,
    driftSpeedY: 0.061,
    driftPhaseX: 1.7,
    driftPhaseY: 5.5,
  },
];

export class MinimalistGradientBreathingScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly grainGfx = new Graphics();
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private sprite!: Sprite;
  private texture!: Texture;

  private w = 1920;
  private h = 1080;
  private time = 0;

  private paletteA = 0;
  private paletteB = 1;
  private morphT = 0;

  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private bass = 0;
  private mid = 0;
  private high = 0;

  constructor() {
    super();
    this.addChild(this.grainGfx);
    void this.initAudio();
  }

  private async initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const actx = new AudioContext();
      const src = actx.createMediaStreamSource(stream);
      this.analyser = actx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.88;
      src.connect(this.analyser);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch {
      // No mic — runs as ambient animation
    }
  }

  private readBands(): void {
    if (!this.analyser || !this.freqData) return;
    this.analyser.getByteFrequencyData(this.freqData);

    // fftSize 1024 → 512 bins, ~43 Hz each at 44100 Hz
    // Bass: bins 0-5 (~0-215 Hz)
    let rBass = 0;
    for (let i = 0; i < 6; i++) rBass += this.freqData[i];
    const rawBass = rBass / (6 * 255);

    // Mid: bins 6-72 (~258-3096 Hz)
    let rMid = 0;
    for (let i = 6; i <= 72; i++) rMid += this.freqData[i];
    const rawMid = rMid / (67 * 255);

    // High: bins 73-290 (~3139-12470 Hz)
    let rHigh = 0;
    for (let i = 73; i <= 290; i++) rHigh += this.freqData[i];
    const rawHigh = rHigh / (218 * 255);

    const smooth = (
      prev: number,
      raw: number,
      boost: number,
      atk: number,
      rel: number,
    ) => {
      const r = clamp(raw * boost, 0, 1);
      return prev + (r - prev) * (r > prev ? atk : rel);
    };

    this.bass = smooth(this.bass, rawBass, 3.5, 0.55, 0.05);
    this.mid = smooth(this.mid, rawMid, 2.5, 0.45, 0.07);
    this.high = smooth(this.high, rawHigh, 3.0, 0.65, 0.1);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;

    this.canvas = document.createElement("canvas");
    this.canvas.width = GW;
    this.canvas.height = GH;
    this.ctx = this.canvas.getContext("2d")!;

    this.texture = Texture.from(this.canvas);
    this.sprite = new Sprite(this.texture);
    this.sprite.anchor.set(0, 0);
    this.addChildAt(this.sprite, 0);
    this._applySize();
  }

  public async hide(): Promise<void> {
    this.sprite?.destroy();
    this.texture?.destroy();
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this._applySize();
  }

  private _applySize(): void {
    if (!this.sprite) return;
    this.sprite.width = this.w;
    this.sprite.height = this.h;
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;
    this.readBands();

    // Mid controls how fast palettes cycle
    const morphSpeed = 0.025 + this.mid * 0.12;
    this.morphT += morphSpeed * dt;
    if (this.morphT >= 1) {
      this.morphT -= 1;
      this.paletteA = this.paletteB;
      this.paletteB = (this.paletteB + 1) % PALETTES.length;
    }

    this.drawGradient();
    this.drawGrain();
  }

  private drawGradient(): void {
    const { ctx, time: t, bass, mid, morphT } = this;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${CRUST[0]},${CRUST[1]},${CRUST[2]})`;
    ctx.fillRect(0, 0, GW, GH);

    // Additive blend so overlapping blobs mix like colored lights
    ctx.globalCompositeOperation = "lighter";

    const baseRadius = GW * 0.52;
    // Mid widens blob drift range for livelier transitions
    const driftMul = 1 + mid * 1.5;

    for (let i = 0; i < BLOBS.length; i++) {
      const def = BLOBS[i];

      const x =
        (def.xFrac +
          def.driftAmp *
            Math.sin(t * def.driftSpeedX * driftMul + def.driftPhaseX)) *
        GW;
      const y =
        (def.yFrac +
          def.driftAmp *
            Math.sin(t * def.driftSpeedY * driftMul + def.driftPhaseY)) *
        GH;

      const colA = PALETTES[this.paletteA][i];
      const colB = PALETTES[this.paletteB][i];
      const r = lerpC(colA[0], colB[0], morphT);
      const g = lerpC(colA[1], colB[1], morphT);
      const b = lerpC(colA[2], colB[2], morphT);

      // Bass expands blobs (breathing swell)
      const radius = baseRadius * (1 + bass * 0.42);
      const alpha = 0.22 + bass * 0.09;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0.0, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
      grad.addColorStop(
        0.45,
        `rgba(${r},${g},${b},${(alpha * 0.48).toFixed(3)})`,
      );
      grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GW, GH);
    }

    ctx.globalCompositeOperation = "source-over";
    this.texture.source.update();
  }

  private drawGrain(): void {
    const g = this.grainGfx;
    g.clear();
    if (this.high < 0.04) return;

    const count = Math.floor(120 + this.high * 550);
    const dotAlpha = 0.028 + this.high * 0.065;

    for (let i = 0; i < count; i++) {
      const x = Math.random() * this.w;
      const y = Math.random() * this.h;
      // Catppuccin Text color for grain — slight blue-white tint
      g.rect(x, y, 1.5, 1.5).fill({ color: 0xcdd6f4, alpha: dotAlpha });
    }
  }
}
