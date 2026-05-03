import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;
const BLOB_COUNT = 8;
const SHAPE_STEPS = 72;
const BG = 0x020108;

// Deep ink hues — saturated enough to read on near-black
const PALETTE = [
  0x0011cc, // cobalt
  0x4400cc, // violet
  0x0066aa, // cerulean
  0x006655, // dark teal
  0x6600aa, // purple
  0x0044cc, // royal blue
  0x880055, // dark magenta
  0x005544, // emerald
];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rBoost: number;
  phase: number;
  turbPhase: number;
  flowAngle: number;
  color: number;
}

// Slow organic base deformation
const BASE_H = [
  { freq: 3, amp: 0.11, speed: 0.29, phase: 0.0 },
  { freq: 5, amp: 0.07, speed: -0.22, phase: 1.5 },
  { freq: 7, amp: 0.045, speed: 0.38, phase: 2.8 },
  { freq: 11, amp: 0.025, speed: -0.17, phase: 0.6 },
];

// High-frequency edge turbulence — scales with audio high band
const TURB_H = [
  { freq: 13, amp: 0.06, speed: 1.7, phase: 0.5 },
  { freq: 19, amp: 0.04, speed: -2.4, phase: 2.2 },
  { freq: 25, amp: 0.025, speed: 2.1, phase: 1.0 },
];

function buildShape(
  cx: number,
  cy: number,
  r: number,
  time: number,
  blobPhase: number,
  turbPhase: number,
  turbStrength: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= SHAPE_STEPS; i++) {
    const a = (i / SHAPE_STEPS) * TAU;
    let rad = r;
    for (const h of BASE_H) {
      rad +=
        r * h.amp * Math.sin(a * h.freq + time * h.speed + h.phase + blobPhase);
    }
    for (const h of TURB_H) {
      rad +=
        r *
        h.amp *
        turbStrength *
        Math.sin(a * h.freq + time * h.speed + h.phase + turbPhase);
    }
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  return pts;
}

export class InkInWaterScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;
  private blobs: Blob[] = [];

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
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.75;
      src.connect(this.analyser);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch {
      // No mic — passive animation continues at neutral audio levels
    }
  }

  private readBands(): void {
    if (!this.analyser || !this.freqData) return;
    this.analyser.getByteFrequencyData(this.freqData);

    // Bass: bins 0–5 (~0–490 Hz)
    let bassSum = 0;
    for (let i = 0; i < 6; i++) bassSum += this.freqData[i];
    const rawBass = clamp(bassSum / 6 / 255, 0, 1);

    // Mid: bins 6–39 (~490–3200 Hz)
    let midSum = 0;
    for (let i = 6; i < 40; i++) midSum += this.freqData[i];
    const rawMid = clamp(midSum / 34 / 255, 0, 1);

    // High: bins 40–99 (~3200–8100 Hz)
    let highSum = 0;
    for (let i = 40; i < 100; i++) highSum += this.freqData[i];
    const rawHigh = clamp(highSum / 60 / 255, 0, 1);

    // Fast attack, slow decay envelopes
    this.bass += (rawBass - this.bass) * (rawBass > this.bass ? 0.65 : 0.05);
    this.mid += (rawMid - this.mid) * (rawMid > this.mid ? 0.5 : 0.07);
    this.high += (rawHigh - this.high) * (rawHigh > this.high ? 0.75 : 0.09);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.initBlobs();
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  private initBlobs(): void {
    this.blobs = [];
    const pad = 0.15;
    for (let i = 0; i < BLOB_COUNT; i++) {
      this.blobs.push({
        x: this.w * (pad + Math.random() * (1 - pad * 2)),
        y: this.h * (pad + Math.random() * (1 - pad * 2)),
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        r: 110 + Math.random() * 110,
        rBoost: 0,
        phase: Math.random() * TAU,
        turbPhase: Math.random() * TAU,
        flowAngle: Math.random() * TAU,
        color: PALETTE[i % PALETTE.length],
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;
    this.readBands();
    this.updateBlobs(dt);
    this.draw();
  }

  private updateBlobs(dt: number): void {
    const { w, h, bass, mid } = this;

    // Mid → each blob's flow angle rotates faster when mids are present
    for (const b of this.blobs) {
      b.flowAngle += (mid * 2.0 + 0.18) * dt;
    }

    // Blob-blob: attract when nearby, repel when overlapping — creates merge/split
    for (let i = 0; i < this.blobs.length; i++) {
      for (let j = i + 1; j < this.blobs.length; j++) {
        const a = this.blobs[i];
        const b = this.blobs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const threshold = (a.r + b.r) * 0.75;

        if (dist < threshold) {
          const f = ((threshold - dist) / threshold) * 36;
          const nx = dx / dist;
          const ny = dy / dist;
          a.vx -= nx * f * dt;
          a.vy -= ny * f * dt;
          b.vx += nx * f * dt;
          b.vy += ny * f * dt;
        } else if (dist < threshold * 2.4) {
          const f = ((dist - threshold) / threshold) * 9;
          const nx = dx / dist;
          const ny = dy / dist;
          a.vx += nx * f * dt;
          a.vy += ny * f * dt;
          b.vx -= nx * f * dt;
          b.vy -= ny * f * dt;
        }
      }
    }

    for (const b of this.blobs) {
      // Bass → outward burst from screen center
      if (bass > 0.12) {
        const cx = b.x - w * 0.5;
        const cy = b.y - h * 0.5;
        const d = Math.sqrt(cx * cx + cy * cy) || 1;
        b.vx += (cx / d) * bass * 170 * dt;
        b.vy += (cy / d) * bass * 170 * dt;
      }

      // Bass → radius expansion: fast attack, slow decay
      const targetBoost = bass * 95;
      const boostRate = targetBoost > b.rBoost ? 30 : 2.5;
      b.rBoost += (targetBoost - b.rBoost) * clamp(boostRate * dt, 0, 1);

      // Mid → steered drift in the blob's current flow direction
      b.vx += Math.cos(b.flowAngle) * mid * 24 * dt;
      b.vy += Math.sin(b.flowAngle) * mid * 24 * dt;

      // Passive organic meander
      const drift = this.time * 0.14 + b.phase;
      b.vx += Math.cos(drift) * 6 * dt;
      b.vy += Math.sin(drift) * 6 * dt;

      // Speed cap
      const maxSpd = 100 + bass * 70;
      b.vx = clamp(b.vx, -maxSpd, maxSpd);
      b.vy = clamp(b.vy, -maxSpd, maxSpd);

      // Viscous damping
      b.vx *= 1 - 1.5 * dt;
      b.vy *= 1 - 1.5 * dt;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Soft boundary spring — push back from edges
      const mg = 160;
      if (b.x < mg) b.vx += (mg - b.x) * 180 * dt;
      if (b.x > w - mg) b.vx -= (b.x - (w - mg)) * 180 * dt;
      if (b.y < mg) b.vy += (mg - b.y) * 180 * dt;
      if (b.y > h - mg) b.vy -= (b.y - (h - mg)) * 180 * dt;

      b.x = clamp(b.x, -80, w + 80);
      b.y = clamp(b.y, -80, h + 80);
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    const t = this.time;
    // High → edge turbulence intensity; always has a small ambient amount
    const turb = this.high * 1.2 + 0.18;

    for (const b of this.blobs) {
      const r = b.r + b.rBoost;
      const col = b.color;
      const bp = b.phase;
      const tp = b.turbPhase;

      // Layer 1: wide diffusion halo — large, very transparent
      const outer = buildShape(b.x, b.y, r * 2.9, t, bp, tp, turb * 0.35);
      g.poly(outer).fill({ color: col, alpha: 0.022 });

      // Layer 2: mid diffusion
      const midRing = buildShape(
        b.x,
        b.y,
        r * 1.8,
        t,
        bp * 1.2,
        tp,
        turb * 0.6,
      );
      g.poly(midRing).fill({ color: col, alpha: 0.06 });

      // Layer 3: main ink body
      const body = buildShape(b.x, b.y, r, t, bp, tp, turb);
      g.poly(body).fill({ color: col, alpha: 0.13 });

      // Layer 4: dense pigment core
      const core = buildShape(
        b.x,
        b.y,
        r * 0.5,
        t * 1.1,
        bp + 0.9,
        tp * 0.7,
        turb * 0.55,
      );
      g.poly(core).fill({ color: col, alpha: 0.27 });
    }
  }
}
