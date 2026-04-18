import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const CRUST    = 0x11111b;
const SURFACE0 = 0x313244;

const ACCENTS = [
  0xcba6f7, // Mauve
  0xb4befe, // Lavender
  0x89b4fa, // Blue
  0x74c7ec, // Sapphire
  0x89dceb, // Sky
  0x94e2d5, // Teal
  0xa6e3a1, // Green
  0xf5c2e7, // Pink
  0xf38ba8, // Red
  0xfab387, // Peach
  0xf9e2af, // Yellow
] as const;

function collatzSeq(n: number): number[] {
  const seq = [n];
  while (n !== 1) {
    n = n % 2 === 0 ? n / 2 : 3 * n + 1;
    seq.push(n);
  }
  return seq;
}

const OUTER_N = 80;
const INNER_N = 40;

export class CollatzScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly bgGfx   = new Graphics();
  private readonly glowGfx = new Graphics();
  private readonly roseGfx = new Graphics();

  private time = 0;
  private sw = 1920;
  private sh = 1080;

  private readonly seqs:    number[][];
  private readonly maxVals: number[];

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.glowGfx);
    this.addChild(this.roseGfx);

    this.seqs    = [];
    this.maxVals = [];
    for (let i = 0; i < OUTER_N; i++) {
      const seq = collatzSeq(i + 2);
      this.seqs.push(seq);
      this.maxVals.push(Math.max(...seq));
    }
  }

  public show(): Promise<void> { return Promise.resolve(); }

  public resize(w: number, h: number): void {
    this.sw = w;
    this.sh = h;
  }

  public update(ticker: Ticker): void {
    this.time += ticker.deltaMS / 1000;
    this._draw();
  }

  private _petalPts(
    seqIdx: number,
    cx: number, cy: number,
    maxR: number,
    rot: number,
    petalSpread: number,
    totalSlots: number,
    slotIdx: number,
  ): [number, number][] {
    const seq    = this.seqs[seqIdx];
    const maxVal = this.maxVals[seqIdx];
    const base   = (slotIdx / totalSlots) * Math.PI * 2 + rot;
    const pts: [number, number][] = [];
    for (let k = 0; k < seq.length; k++) {
      const t        = k / Math.max(seq.length - 1, 1);
      const theta    = base + (t - 0.5) * petalSpread;
      const envelope = Math.sin(t * Math.PI);
      const logR     = Math.log(seq[k] + 1) / Math.log(maxVal + 1);
      const r        = (0.35 + 0.65 * logR) * envelope * maxR;
      pts.push([cx + r * Math.cos(theta), cy + r * Math.sin(theta)]);
    }
    return pts;
  }

  private _stroke(
    gfx: Graphics,
    pts: [number, number][],
    color: number,
    alpha: number,
    width: number,
  ): void {
    if (pts.length < 2) return;
    gfx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 2) {
      gfx.lineTo(pts[1][0], pts[1][1]);
    } else {
      // Catmull-Rom → cubic Bézier (tension = 0.5)
      for (let j = 1; j < pts.length; j++) {
        const p0 = pts[Math.max(j - 2, 0)];
        const p1 = pts[j - 1];
        const p2 = pts[j];
        const p3 = pts[Math.min(j + 1, pts.length - 1)];
        const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
        const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
        const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
        const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
        gfx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
      }
    }
    gfx.stroke({ color, alpha, width, join: "round", cap: "round" });
  }

  private _draw(): void {
    const { sw, sh, time } = this;
    const cx = sw / 2;
    const cy = sh / 2;
    const maxR        = Math.min(sw, sh) * 0.44;
    const outerRot    = time * 0.04;
    const innerRot    = -time * 0.07;
    const outerSpread = (Math.PI * 2 / OUTER_N) * 4;
    const innerSpread = (Math.PI * 2 / INNER_N) * 3.5;

    this.bgGfx.clear();
    this.glowGfx.clear();
    this.roseGfx.clear();

    this.bgGfx.rect(0, 0, sw, sh).fill({ color: CRUST });

    for (let i = 0; i < 5; i++) {
      const inset = i * 40;
      this.bgGfx
        .rect(inset, inset, sw - inset * 2, sh - inset * 2)
        .stroke({ color: SURFACE0, alpha: 0.018 * (5 - i), width: 40 });
    }

    const ci = Math.floor(time / 15) % ACCENTS.length;

    // Outer rose
    for (let i = 0; i < OUTER_N; i++) {
      const phase  = ((i / OUTER_N) + time / 40) % 1;
      const alpha  = 0.25 + 0.75 * Math.sin(phase * Math.PI);
      const colorA = ACCENTS[(ci + Math.floor(i * ACCENTS.length / OUTER_N)) % ACCENTS.length];
      const pts    = this._petalPts(i, cx, cy, maxR, outerRot, outerSpread, OUTER_N, i);

      this._stroke(this.glowGfx, pts, colorA, alpha * 0.04, 16);
      this._stroke(this.glowGfx, pts, colorA, alpha * 0.09,  6);
      this._stroke(this.roseGfx, pts, colorA, alpha * 0.80,  1.2);
    }

    // Inner counter-rotating rose
    const ci2    = (ci + 4) % ACCENTS.length;
    const innerR = maxR * 0.54;

    for (let i = 0; i < INNER_N; i++) {
      const seqIdx = (i * 2 + 1) % OUTER_N;
      const phase  = ((i / INNER_N) + time / 55) % 1;
      const alpha  = 0.20 + 0.65 * Math.sin(phase * Math.PI);
      const colorB = ACCENTS[(ci2 + Math.floor(i * ACCENTS.length / INNER_N)) % ACCENTS.length];
      const pts    = this._petalPts(seqIdx, cx, cy, innerR, innerRot, innerSpread, INNER_N, i);

      this._stroke(this.glowGfx, pts, colorB, alpha * 0.05, 10);
      this._stroke(this.roseGfx, pts, colorB, alpha * 0.60,  0.9);
    }

    // Center glow
    const ca = ACCENTS[ci];
    this.roseGfx.circle(cx, cy,  5).fill({ color: ca, alpha: 0.95 });
    this.roseGfx.circle(cx, cy, 14).fill({ color: ca, alpha: 0.22 });
    this.roseGfx.circle(cx, cy, 30).fill({ color: ca, alpha: 0.07 });
  }
}
