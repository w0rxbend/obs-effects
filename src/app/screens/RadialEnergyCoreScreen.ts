import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;
const RING_STEPS = 200;
const MAX_RINGS = 60;
const MIC_THRESHOLD = 0.015;
const BASE_EMIT_INTERVAL = 0.5;
const MIN_EMIT_INTERVAL = 0.07;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerpHex(a: number, b: number, t: number): number {
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

function ringColor(age: number): number {
  if (age < 0.3) return lerpHex(0xffffff, 0x00e5ff, age / 0.3);
  if (age < 0.65) return lerpHex(0x00e5ff, 0x003be5, (age - 0.3) / 0.35);
  return lerpHex(0x003be5, 0x060018, (age - 0.65) / 0.35);
}

interface Ring {
  radius: number;
  birthRadius: number;
  maxRadius: number;
  speed: number;
  distAmp: number;
  distFreq: number;
  distPhase: number;
  distSpeed: number;
}

export class RadialEnergyCoreScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private cx = 960;
  private cy = 540;
  private time = 0;

  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  private bass = 0;
  private mid = 0;
  private high = 0;

  private rings: Ring[] = [];
  private emitTimer = 0;

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
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.75;
      src.connect(this.analyser);
      this.freqData = new Uint8Array(
        this.analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
    } catch {
      // no mic — idle animation runs at bass/mid/high = 0
    }
  }

  private readBands(): { bass: number; mid: number; high: number } {
    if (!this.analyser || !this.freqData) return { bass: 0, mid: 0, high: 0 };
    this.analyser.getByteFrequencyData(this.freqData);
    // fftSize=1024 → frequencyBinCount=512, bin_width ≈ 43 Hz @ 44100 Hz
    // Bass  20–300 Hz  → bins 0–6
    // Mid  300–4000 Hz → bins 7–92
    // High  4k–14k Hz  → bins 93–324
    let bass = 0;
    for (let i = 0; i <= 6; i++) bass += this.freqData[i];
    bass /= 7 * 255;

    let mid = 0;
    for (let i = 7; i <= 92; i++) mid += this.freqData[i];
    mid /= 86 * 255;

    let high = 0;
    for (let i = 93; i <= 324; i++) high += this.freqData[i];
    high /= 232 * 255;

    return { bass, mid, high };
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.cx = w / 2;
    this.cy = h / 2;
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.time += dt;

    const raw = this.readBands();
    const br = clamp((raw.bass - MIC_THRESHOLD) / (1 - MIC_THRESHOLD), 0, 1);
    const mr = clamp(raw.mid * 4 - MIC_THRESHOLD, 0, 1);
    const hr = clamp(raw.high * 5, 0, 1);

    this.bass += (br - this.bass) * (br > this.bass ? 0.75 : 0.06);
    this.mid += (mr - this.mid) * (mr > this.mid ? 0.5 : 0.08);
    this.high += (hr - this.high) * (hr > this.high ? 0.8 : 0.12);

    const maxR = Math.hypot(this.cx, this.cy) * 1.15;
    const emitInterval = Math.max(
      MIN_EMIT_INTERVAL,
      BASE_EMIT_INTERVAL * (1 - this.bass * 0.86),
    );

    this.emitTimer -= dt;
    if (this.emitTimer <= 0 && this.rings.length < MAX_RINGS) {
      const birthR = 10 + this.bass * 50;
      const speed = 140 + this.bass * 200;
      this.rings.push({
        radius: birthR,
        birthRadius: birthR,
        maxRadius: maxR,
        speed,
        distAmp: 18 + Math.random() * 22,
        distFreq: 3 + Math.floor(Math.random() * 5),
        distPhase: Math.random() * TAU,
        distSpeed: (0.3 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1),
      });
      this.emitTimer = emitInterval;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.radius += r.speed * dt;
      if (r.radius >= r.maxRadius) this.rings.splice(i, 1);
    }

    this.draw();
  }

  private buildRingPts(ring: Ring): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    const distAmp = ring.distAmp * this.mid;
    const t = this.time;
    for (let i = 0; i < RING_STEPS; i++) {
      const a = (i / RING_STEPS) * TAU;
      const d =
        distAmp *
        Math.sin(a * ring.distFreq + ring.distPhase + t * ring.distSpeed);
      const r = ring.radius + d;
      pts.push({ x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r });
    }
    return pts;
  }

  private strokeLoop(
    g: Graphics,
    pts: { x: number; y: number }[],
    color: number,
    width: number,
    alpha: number,
  ): void {
    if (alpha < 0.005) return;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath().stroke({ color, width, alpha });
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: 0x000000 });

    for (const ring of this.rings) {
      const age =
        (ring.radius - ring.birthRadius) / (ring.maxRadius - ring.birthRadius);
      const rawA = Math.max(0, 1 - age);
      const alpha = rawA * rawA;
      if (alpha < 0.005) continue;

      const color = ringColor(age);
      const pts = this.buildRingPts(ring);

      // Outer glow driven by high-freq sharpness
      const glowW = 2 + this.high * 22;
      this.strokeLoop(g, pts, color, glowW * 2.5, alpha * 0.07);
      this.strokeLoop(g, pts, color, glowW, alpha * 0.2);
      // Core ring
      this.strokeLoop(g, pts, color, 1.5, alpha * 0.75);
      // White highlight intensifies with high freq
      this.strokeLoop(
        g,
        pts,
        0xffffff,
        1,
        alpha * 0.55 * (0.2 + this.high * 0.8),
      );
    }

    // Central orb — pulses with bass, glow sharpness from high
    const pulse = Math.sin(this.time * 2.2) * 0.5 + 0.5;
    const orbR = 6 + this.bass * 28 + pulse * 4;
    const glowScale = 3 + this.high * 3;
    g.circle(this.cx, this.cy, orbR * glowScale * 1.5).fill({
      color: 0x004ccc,
      alpha: 0.04 + this.bass * 0.1,
    });
    g.circle(this.cx, this.cy, orbR * glowScale).fill({
      color: 0x0088ff,
      alpha: 0.1 + this.bass * 0.18,
    });
    g.circle(this.cx, this.cy, orbR * 1.8).fill({
      color: 0x00d4ff,
      alpha: 0.4 + this.bass * 0.35,
    });
    g.circle(this.cx, this.cy, orbR).fill({
      color: 0xaaeeff,
      alpha: 0.8 + this.bass * 0.2,
    });
    g.circle(this.cx, this.cy, orbR * 0.4).fill({
      color: 0xffffff,
      alpha: 0.95,
    });
  }
}
