import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const C_BLUE = 0x89b4fa;
const C_PINK = 0xf5c2e7;
const C_LAVENDER = 0xb4befe;

// ── Geometry ──────────────────────────────────────────────────────────────────
const PAW_X_FRAC = 0.1; // paw tip is ~10 % from each horizontal edge
const PAW_Y_FRAC = 0.85; // paw bottom is ~85 % from the image top
const CAT_Y_OFFSET = 0.12; // shift silhouette down by this fraction of catHeight

// ── Dot silhouette ────────────────────────────────────────────────────────────
// Step 5 gives ~3 800 dots so each particle has breathing room at radius 2–4 px
const SAMPLE_STEP = 5; // image-pixel grid step; lower = denser
const DOT_BASE_R = 2.2; // radius at rest
const DOT_PEAK_R = 4.0; // radius at full elevation

// ── Wave ──────────────────────────────────────────────────────────────────────
const WAVE_SPEED = 0.42;
const WAVE_FREQ = 0.019; // applied to screen coords; lower = wider clusters
const LIFT_Y = 6; // max upward displacement in screen px
const DRIFT_X = 2.0; // max horizontal drift in screen px

// ── Arc ───────────────────────────────────────────────────────────────────────
const MAX_DT = 0.05;
const TICK_COUNT = 48;
const ARC_DOT_COUNT = 8;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

interface CatDot {
  fx: number; // x / naturalWidth  [0, 1] — permanent
  fy: number; // y / naturalHeight [0, 1] — permanent
  phase: number; // wave phase offset — permanent, varies smoothly across grid
}

export class CatCircleCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();

  private catDots: CatDot[] = [];
  private catAspect = 0.515; // nh / nw — set once the image loads

  // Current layout cache — recomputed on radius/position change
  private catLeft = 0;
  private catTop = 0;
  private catWidth = 0;
  private catHeight = 0;

  private time = 0;
  private cx = 960;
  private cy = 540;
  private R = 270;
  private pawAngle = 0.644; // canvas angle (rad) from x-axis to paw attachment

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.cx = (window.innerWidth || 1920) / 2;
    this.cy = (window.innerHeight || 1080) / 2;
    this.computeRadius();
    await this.loadCatDots();
    this.updateCatLayout();
  }

  public resize(width: number, height: number): void {
    this.cx = width / 2;
    this.cy = height / 2;
    this.computeRadius(); // also calls updateCatLayout
  }

  public update(ticker: Ticker): void {
    this.time += clamp(ticker.deltaMS * 0.001, 0, MAX_DT) * WAVE_SPEED;
    this.draw();
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  private computeRadius(): void {
    const w = window.innerWidth || 1920;
    const h = window.innerHeight || 1080;
    this.R = Math.min(w, h) * 0.27;
    const pawXHalf = (0.5 - PAW_X_FRAC) * 2.0 * this.R;
    this.pawAngle = Math.acos(clamp(pawXHalf / this.R, 0, 1));
    this.updateCatLayout();
  }

  private updateCatLayout(): void {
    const { R, cx, cy, pawAngle, catAspect } = this;
    this.catWidth = 2.0 * R;
    this.catHeight = this.catWidth * catAspect;
    this.catLeft = cx - this.catWidth / 2;
    // Place the image so PAW_Y_FRAC of its height lands on the circle rim,
    // then shift down by CAT_Y_OFFSET so the silhouette sits slightly lower.
    const pawYFromCenter = -R * Math.sin(pawAngle);
    this.catTop =
      cy +
      pawYFromCenter -
      PAW_Y_FRAC * this.catHeight +
      CAT_Y_OFFSET * this.catHeight;
  }

  private loadCatDots(): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.catAspect = img.naturalHeight / img.naturalWidth;

        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);

        const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
        const nw = cv.width,
          nh = cv.height;

        this.catDots = [];
        for (let py = 0; py < nh; py += SAMPLE_STEP) {
          const row = Math.floor(py / SAMPLE_STEP);
          for (let px = 0; px < nw; px += SAMPLE_STEP) {
            const col = Math.floor(px / SAMPLE_STEP);
            const i = (py * nw + px) * 4;
            const r = data[i],
              gv = data[i + 1],
              b = data[i + 2],
              a = data[i + 3];
            if (a > 128 && r + gv + b < 192) {
              // Phase varies smoothly across the grid → neighbouring dots share
              // similar phases → they move as a coherent cluster in the wave.
              const phase = ((row * 0.37 + col * 0.19) % 1) * Math.PI * 2;
              this.catDots.push({ fx: px / nw, fy: py / nh, phase });
            }
          }
        }
        resolve();
      };
      img.onerror = reject;
      img.src = "/assets/main/cat-border-top.png";
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  private draw(): void {
    const g = this.gfx;
    const { cx, cy, R, time, pawAngle } = this;
    g.clear();

    // Arc endpoints in canvas convention (0 = right, clockwise = positive)
    const arcStart = -pawAngle; // right paw — above centre, right side
    const arcEnd = Math.PI + pawAngle; // left paw  — above centre, left side
    const arcSpan = arcEnd - arcStart; // ≈ 254 °

    // ── Shared animated color ─────────────────────────────────────────────────
    const hueT = (Math.sin(time * 0.4) + 1) * 0.5;
    const mainColor = lerpColor(0xcba6f7, C_BLUE, hueT);

    // ── Outer breathing halo ──────────────────────────────────────────────────
    const haloBreath = (Math.sin(time * 0.17 + 0.5) + 1) * 0.5;
    this.strokeWavyArc(
      g,
      cx,
      cy,
      R + 60 + haloBreath * 12,
      arcStart,
      arcEnd,
      C_BLUE,
      12,
      0.03 + haloBreath * 0.02,
      7,
      3.1,
      time * 0.27,
    );

    // ── Fluid animated border rings ───────────────────────────────────────────
    // Each ring breathes (radius, width, alpha) and carries a travelling wave
    // along its contour — outer rings travel clockwise, inner counter-clockwise.
    for (const cfg of [
      {
        rOff: 42,
        bAmp: 5,
        bFreq: 0.22,
        bPh: 2.6,
        wAmp: 4.0,
        wK: 5.4,
        col: C_BLUE,
        bW: 1.0,
        bA: 0.09,
      },
      {
        rOff: 27,
        bAmp: 7,
        bFreq: 0.31,
        bPh: 1.3,
        wAmp: 5.5,
        wK: 6.1,
        col: mainColor,
        bW: 1.3,
        bA: 0.15,
      },
      {
        rOff: 14,
        bAmp: 5,
        bFreq: 0.43,
        bPh: 0.0,
        wAmp: 4.0,
        wK: 4.8,
        col: C_LAVENDER,
        bW: 1.2,
        bA: 0.2,
      },
      {
        rOff: -14,
        bAmp: 5,
        bFreq: 0.39,
        bPh: 0.7,
        wAmp: 4.0,
        wK: 5.1,
        col: C_LAVENDER,
        bW: 1.2,
        bA: 0.2,
      },
      {
        rOff: -27,
        bAmp: 7,
        bFreq: 0.27,
        bPh: 2.0,
        wAmp: 5.5,
        wK: 6.4,
        col: mainColor,
        bW: 1.3,
        bA: 0.12,
      },
      {
        rOff: -42,
        bAmp: 5,
        bFreq: 0.19,
        bPh: 3.4,
        wAmp: 4.0,
        wK: 4.7,
        col: C_BLUE,
        bW: 1.0,
        bA: 0.07,
      },
    ]) {
      const breath = Math.sin(time * cfg.bFreq + cfg.bPh);
      const r = R + cfg.rOff + breath * cfg.bAmp;
      const w = cfg.bW * (0.6 + (breath + 1) * 0.35);
      const a = cfg.bA * (0.5 + (breath + 1) * 0.25);
      const wPh = cfg.rOff > 0 ? time * 1.1 + cfg.bPh : -time * 0.9 + cfg.bPh;
      // Soft glow beneath the crisp line — gives the ring a floating, elevated look
      this.strokeWavyArc(
        g,
        cx,
        cy,
        r,
        arcStart,
        arcEnd,
        cfg.col,
        w * 5,
        a * 0.18,
        cfg.wAmp,
        cfg.wK,
        wPh,
      );
      this.strokeWavyArc(
        g,
        cx,
        cy,
        r,
        arcStart,
        arcEnd,
        cfg.col,
        w,
        a,
        cfg.wAmp,
        cfg.wK,
        wPh,
      );
    }

    // ── Main arc ──────────────────────────────────────────────────────────────
    this.strokeArc(g, cx, cy, R, arcStart, arcEnd, mainColor, 5, 0.95);
    this.strokeArc(g, cx, cy, R, arcStart, arcEnd, mainColor, 22, 0.08);

    // ── Tick marks ────────────────────────────────────────────────────────────
    for (let i = 0; i <= TICK_COUNT; i++) {
      const angle = arcStart + (i / TICK_COUNT) * arcSpan;
      const isLong = i % 8 === 0;
      const isMid = i % 4 === 0;
      const outLen = isLong ? 12 : isMid ? 7 : 3;
      const inLen = isLong ? 6 : isMid ? 3 : 1;
      const coA = Math.cos(angle),
        sinA = Math.sin(angle);
      g.moveTo(cx + (R - inLen) * coA, cy + (R - inLen) * sinA)
        .lineTo(cx + (R + outLen) * coA, cy + (R + outLen) * sinA)
        .stroke({
          color: C_LAVENDER,
          width: isLong ? 1.5 : 1.0,
          alpha: isLong ? 0.9 : isMid ? 0.55 : 0.3,
        });
    }

    // ── Cat silhouette — elevated dot clusters ─────────────────────────────────
    if (this.catDots.length > 0) {
      const { catLeft, catTop, catWidth, catHeight } = this;

      for (const dot of this.catDots) {
        const baseX = catLeft + dot.fx * catWidth;
        const baseY = catTop + dot.fy * catHeight;
        const bx = baseX * WAVE_FREQ;
        const by = baseY * WAVE_FREQ;
        const ph = dot.phase;

        // Layered wave — same approach as CatMeshScreen for coherent cluster motion
        const primary =
          Math.sin(bx * 1.6 - time * 1.05 + ph) *
          Math.cos(by * 1.25 + time * 0.75);
        const secondary =
          Math.sin((bx + by) * 0.8 - time * 0.65 + ph * 0.6) * 0.5;
        const micro = Math.sin(bx * 3.1 + time * 1.9 + ph * 1.3) * 0.15;

        const elev = clamp(primary * 0.65 + secondary * 0.25 + micro, -1, 1);
        const lift = Math.max(0, elev);
        const x = baseX + Math.cos(ph + time * 0.2) * lift * DRIFT_X;
        const y = baseY - lift * LIFT_Y;

        // Radius and alpha scale with elevation
        const ne = (elev + 1) * 0.5; // normalised 0..1
        const radius = DOT_BASE_R + lift * (DOT_PEAK_R - DOT_BASE_R);
        const alpha = clamp(0.35 + ne * 0.6, 0, 1);

        // Match the border arc colour exactly
        const dotColor = mainColor;

        // Soft rounded particle — three concentric layers simulate a gaussian falloff
        // Outer soft halo
        g.circle(x, y, radius * 2.6).fill({
          color: dotColor,
          alpha: alpha * 0.07,
        });
        // Mid glow body
        g.circle(x, y, radius * 1.55).fill({
          color: dotColor,
          alpha: alpha * 0.22,
        });
        // Solid core
        g.circle(x, y, radius).fill({ color: dotColor, alpha: alpha * 0.9 });
        // Specular highlight on elevated particles
        if (lift > 0.25) {
          g.circle(x, y, radius * 0.38).fill({
            color: 0xffffff,
            alpha: lift * 0.55,
          });
        }
      }
    }

    // ── Paw-point accents ─────────────────────────────────────────────────────
    const rpX = cx + R * Math.cos(arcStart),
      rpY = cy + R * Math.sin(arcStart);
    const lpX = cx + R * Math.cos(arcEnd),
      lpY = cy + R * Math.sin(arcEnd);
    for (const [px, py] of [
      [rpX, rpY],
      [lpX, lpY],
    ]) {
      g.circle(px, py, 5).fill({ color: C_PINK, alpha: 0.95 });
      g.circle(px, py, 10).stroke({ color: C_PINK, width: 1.5, alpha: 0.4 });
      g.circle(px, py, 16).stroke({ color: C_PINK, width: 1.0, alpha: 0.15 });
    }

    // ── Dots flowing along the arc ────────────────────────────────────────────
    for (let i = 0; i < ARC_DOT_COUNT; i++) {
      const phase = (((time * 0.08 + i / ARC_DOT_COUNT) % 1) + 1) % 1;
      const angle = arcStart + phase * arcSpan;
      const dx = cx + R * Math.cos(angle);
      const dy = cy + R * Math.sin(angle);
      const pulse =
        (Math.sin(time * 2.2 + (i * Math.PI * 2) / ARC_DOT_COUNT) + 1) * 0.5;
      const dotR = 2.0 + pulse * 2.8;

      g.circle(dx, dy, dotR).fill({
        color: C_PINK,
        alpha: 0.55 + pulse * 0.45,
      });
      if (pulse > 0.5) {
        g.circle(dx, dy, dotR * 2.8).fill({
          color: C_PINK,
          alpha: (pulse - 0.5) * 0.2,
        });
      }
    }
  }

  private strokeArc(
    g: Graphics,
    cx: number,
    cy: number,
    r: number,
    start: number,
    end: number,
    color: number,
    width: number,
    alpha: number,
  ): void {
    g.moveTo(cx + r * Math.cos(start), cy + r * Math.sin(start));
    g.arc(cx, cy, r, start, end, false);
    g.stroke({ color, width, alpha });
  }

  private strokeWavyArc(
    g: Graphics,
    cx: number,
    cy: number,
    rBase: number,
    start: number,
    end: number,
    color: number,
    width: number,
    alpha: number,
    waveAmp: number,
    waveK: number,
    wavePhase: number,
    segs = 140,
  ): void {
    const span = end - start;
    for (let i = 0; i <= segs; i++) {
      const angle = start + (i / segs) * span;
      const r = rBase + Math.sin(angle * waveK + wavePhase) * waveAmp;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke({ color, width, alpha });
  }
}
