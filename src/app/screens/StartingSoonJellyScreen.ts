import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BLOB_COLOR = 0xcba6f7; // Catppuccin Mocha mauve

const LINES = ["STARTING", "SOON"] as const;
const FONT_FAMILY = "Bangers";
const GRID_SPACING = 10;
const BASE_BLOB_RADIUS = 5.8;
const BOUNCE_FREQ_HZ = 0.88;
const BASE_AMP = 30;
const AMP_VAR = 22;
const ALPHA_THRESHOLD = 90;

interface JellyBlob {
  homeX: number;
  homeY: number;
  radius: number;
  phase: number;
  bounceAmp: number;
  freqMult: number;
  deformFactor: number;
  color: number;
  innerColor: number;
}

function lighten(c: number, t: number): number {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  return (
    (Math.round(r + (255 - r) * t) << 16) |
    (Math.round(g + (255 - g) * t) << 8) |
    Math.round(b + (255 - b) * t)
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StartingSoonJellyScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private blobs: JellyBlob[] = [];
  private w = 1920;
  private h = 1080;
  private time = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.buildBlobs();
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.buildBlobs();
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;
    this.draw();
  }

  private buildBlobs(): void {
    this.blobs = [];
    const rng = mulberry32(0xabc12345);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = this.w;
    canvas.height = this.h;

    // Fit font to canvas
    const maxW = this.w * 0.88;
    const maxLineH = this.h * 0.36;
    let fontSize = Math.floor(Math.min(this.w * 0.2, maxLineH));

    while (fontSize > 48) {
      ctx.font = `${fontSize}px "${FONT_FAMILY}", sans-serif`;
      const widestLine = Math.max(
        ...LINES.map((l) => ctx.measureText(l).width),
      );
      if (widestLine <= maxW) break;
      fontSize -= 6;
    }

    ctx.font = `${fontSize}px "${FONT_FAMILY}", sans-serif`;
    const lineGap = Math.round(fontSize * 0.1);
    const totalH = fontSize * LINES.length + lineGap * (LINES.length - 1);
    const startY = this.h * 0.5 - totalH * 0.5 + fontSize * 0.5;

    // Compute per-character x boundaries for each line
    const lineData: Array<{
      text: string;
      y: number;
      charBounds: Array<{ start: number; end: number }>;
    }> = [];

    for (let li = 0; li < LINES.length; li++) {
      const text = LINES[li];
      const lineWidth = ctx.measureText(text).width;
      const lineStartX = this.w * 0.5 - lineWidth * 0.5;
      const y = startY + li * (fontSize + lineGap);
      const charBounds: Array<{ start: number; end: number }> = [];
      let cx = lineStartX;
      for (const ch of text) {
        const cw = ctx.measureText(ch).width;
        charBounds.push({ start: cx, end: cx + cw });
        cx += cw;
      }
      lineData.push({ text, y, charBounds });
    }

    // Render text left-aligned from computed start positions
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    for (const line of lineData) {
      const lw = ctx.measureText(line.text).width;
      ctx.fillText(line.text, this.w * 0.5 - lw * 0.5, line.y);
    }

    const imageData = ctx.getImageData(0, 0, this.w, this.h).data;
    const halfFont = fontSize * 0.6;

    for (let py = 0; py < this.h; py += GRID_SPACING) {
      for (let px = 0; px < this.w; px += GRID_SPACING) {
        const alpha = imageData[(py * this.w + px) * 4 + 3];
        if (alpha < ALPHA_THRESHOLD) continue;

        // Reject pixels too far from any text line
        let bestLineDist = Infinity;
        for (let li = 0; li < lineData.length; li++) {
          const d = Math.abs(py - lineData[li].y);
          if (d < bestLineDist) bestLineDist = d;
        }
        if (bestLineDist > halfFont) continue;

        const color = BLOB_COLOR;
        const radius = BASE_BLOB_RADIUS * (0.82 + rng() * 0.36);
        const phase = rng() * Math.PI * 2;
        const ampMult = 0.62 + rng() * 0.76;
        const freqMult = 0.78 + rng() * 0.44;
        const deformFactor = 0.48 + rng() * 0.52;

        this.blobs.push({
          homeX: px,
          homeY: py,
          radius,
          phase,
          bounceAmp: (BASE_AMP + rng() * AMP_VAR) * ampMult,
          freqMult,
          deformFactor,
          color,
          innerColor: lighten(color, 0.62),
        });
      }
    }
  }

  private draw(): void {
    const gfx = this.gfx;
    gfx.clear();

    const baseFreq = BOUNCE_FREQ_HZ * Math.PI * 2;

    for (const blob of this.blobs) {
      const t = this.time * baseFreq * blob.freqMult + blob.phase;
      const sinT = Math.sin(t);
      const cosT = Math.cos(t);
      const rawBounce = Math.abs(sinT); // 0 = at floor, 1 = at peak

      const bx = blob.homeX;
      const by = blob.homeY - rawBounce * blob.bounceAmp;

      // velDir > 0: blob moving upward (rawBounce increasing)
      // velDir < 0: blob descending toward floor (rawBounce decreasing)
      const velDir = cosT * Math.sign(sinT + 1e-9);
      const speedFactor = Math.abs(cosT);
      const floorFactor = 1 - rawBounce; // peaks near floor

      // Squish/stretch deformation (strongest at floor, zero at peak)
      let scaleX = 1;
      let scaleY = 1;
      const deform = floorFactor * speedFactor * blob.deformFactor;

      if (velDir < 0) {
        // Descending: squish flat on impact
        scaleY = Math.max(0.58, 1 - deform * 0.38);
        scaleX = 1 + deform * 0.18;
      } else {
        // Rebounding: stretch upward with elastic tail
        scaleY = 1 + deform * 0.32;
        scaleX = Math.max(0.84, 1 - deform * 0.13);
      }

      const rx = blob.radius * scaleX;
      const ry = blob.radius * scaleY;

      // Velocity trail (behind blob in direction of travel)
      const trailStrength = speedFactor * floorFactor;
      if (trailStrength > 0.36) {
        // Trail is behind: above when descending, below when ascending
        const trailDirY = velDir < 0 ? -1 : 1;
        const trailLen = trailStrength * blob.radius * 1.2;
        gfx
          .ellipse(
            bx,
            by + trailDirY * trailLen * 0.7,
            rx * 0.58,
            blob.radius * 0.38,
          )
          .fill({ color: blob.color, alpha: 0.12 });
      }

      // Outer ambient glow (single layer for performance)
      gfx
        .ellipse(bx, by, rx * 1.55, ry * 1.55)
        .fill({ color: blob.color, alpha: 0.08 });

      // Main blob body — translucent jelly
      gfx.ellipse(bx, by, rx, ry).fill({ color: blob.color, alpha: 0.62 });

      // Inner lighter fill for depth/translucency
      gfx
        .ellipse(bx - rx * 0.07, by - ry * 0.08, rx * 0.68, ry * 0.68)
        .fill({ color: blob.innerColor, alpha: 0.2 });

      // Rim light (subtle, lower-right edge)
      gfx
        .ellipse(bx + rx * 0.2, by + ry * 0.22, rx * 0.3, ry * 0.2)
        .fill({ color: 0xffffff, alpha: 0.09 });

      // Glossy highlight — primary specular
      gfx
        .ellipse(bx - rx * 0.27, by - ry * 0.3, rx * 0.26, ry * 0.16)
        .fill({ color: 0xffffff, alpha: 0.72 });

      // Glossy highlight — secondary dot
      gfx
        .ellipse(bx - rx * 0.09, by - ry * 0.44, rx * 0.1, ry * 0.065)
        .fill({ color: 0xffffff, alpha: 0.46 });
    }
  }
}
