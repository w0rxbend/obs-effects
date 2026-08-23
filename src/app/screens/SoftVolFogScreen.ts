import type { Ticker } from "pixi.js";
import { BlurFilter, Container, Graphics } from "pixi.js";
import { clamp, TAU } from "../../lib/math";

// Cool blue-white mist palette — unobtrusive over game/code content
const COLORS = [0xcad8f0, 0xd6e4ff, 0xb8ccec, 0xdce8fc, 0xe4eeff, 0xc4d4f8];

function rng(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

interface Blob {
  bx: number; // base x normalized [0..1]
  by: number; // base y normalized [0..1]
  dax: number; // drift amplitude x (normalized)
  day: number; // drift amplitude y (normalized)
  sp: number; // oscillation speed rad/s
  ph: number; // phase offset
  rFrac: number; // radius as fraction of min(w,h)
  ba: number; // base alpha
  gfx: Graphics;
}

export class SoftVolFogScreen extends Container {
  public static assetBundles: string[] = [];

  // lo: large heavy-blur blobs anchored at edges
  // hi: smaller medium-blur wisps slightly inside the edge
  private readonly layerLo = new Container();
  private readonly layerHi = new Container();

  private blobs: Blob[] = [];
  private w = 1920;
  private h = 1080;
  private t = 0;

  private mx = -9999;
  private my = -9999;
  private typing = 0; // 0..1, decays after keydown

  private readonly onMove: (e: MouseEvent) => void;
  private readonly onKey: () => void;

  constructor() {
    super();
    this.addChild(this.layerLo);
    this.addChild(this.layerHi);

    // lo: heavy diffusion — makes fog look volumetric
    // hi: lighter pass — adds depth and inner wisps
    this.layerLo.filters = [new BlurFilter({ strength: 58, quality: 3 })];
    this.layerHi.filters = [new BlurFilter({ strength: 26, quality: 2 })];

    this.onMove = (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
    };
    this.onKey = () => {
      this.typing = clamp(this.typing + 0.5, 0, 1);
    };
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.spawn();
    window.addEventListener("mousemove", this.onMove);
    window.addEventListener("keydown", this.onKey);
  }

  public async hide(): Promise<void> {
    window.removeEventListener("mousemove", this.onMove);
    window.removeEventListener("keydown", this.onKey);
    this.kill();
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  public update(ticker: Ticker): void {
    const dt = clamp(ticker.deltaMS * 0.001, 0, 0.05);
    this.t += dt;
    // Typing boost decays to ~12% per second, gone in ~1.5 s
    this.typing *= Math.pow(0.12, dt);
    this.tick();
  }

  // ── Blob construction ───────────────────────────────────────────────────────

  private spawn(): void {
    this.kill();

    const add = (
      bx: number,
      by: number,
      dax: number,
      day: number,
      sp: number,
      r: number,
      a: number,
      layer: "lo" | "hi",
    ) => {
      const g = new Graphics();
      const c = COLORS[Math.floor(Math.random() * COLORS.length)];
      // Unit circle; scaled per-frame so geometry never rebuilds on resize
      g.circle(0, 0, 1).fill({ color: c, alpha: 1 });
      g.alpha = a;
      const b: Blob = {
        bx,
        by,
        dax,
        day,
        sp,
        ph: Math.random() * TAU,
        rFrac: r,
        ba: a,
        gfx: g,
      };
      this.blobs.push(b);
      (layer === "lo" ? this.layerLo : this.layerHi).addChild(g);
    };

    // TOP — lo blobs hugging the top edge
    for (let i = 0; i < 8; i++) {
      add(
        (i + 0.5) / 8,
        0.01,
        rng(0.03, 0.06),
        rng(0.01, 0.03),
        rng(0.04, 0.09),
        rng(0.16, 0.22),
        rng(0.07, 0.12),
        "lo",
      );
    }
    // TOP — hi wisps slightly inside
    for (let i = 0; i < 6; i++) {
      add(
        (i + 0.5) / 6,
        0.09,
        rng(0.04, 0.08),
        rng(0.02, 0.05),
        rng(0.07, 0.13),
        rng(0.08, 0.13),
        rng(0.04, 0.07),
        "hi",
      );
    }

    // BOTTOM — lo
    for (let i = 0; i < 8; i++) {
      add(
        (i + 0.5) / 8,
        0.99,
        rng(0.03, 0.06),
        rng(0.01, 0.03),
        rng(0.04, 0.09),
        rng(0.16, 0.22),
        rng(0.07, 0.12),
        "lo",
      );
    }
    // BOTTOM — hi
    for (let i = 0; i < 6; i++) {
      add(
        (i + 0.5) / 6,
        0.91,
        rng(0.04, 0.08),
        rng(0.02, 0.05),
        rng(0.07, 0.13),
        rng(0.08, 0.13),
        rng(0.04, 0.07),
        "hi",
      );
    }

    // LEFT — lo
    for (let i = 0; i < 6; i++) {
      add(
        0.01,
        (i + 0.5) / 6,
        rng(0.01, 0.03),
        rng(0.03, 0.06),
        rng(0.04, 0.09),
        rng(0.15, 0.21),
        rng(0.07, 0.12),
        "lo",
      );
    }
    // LEFT — hi
    for (let i = 0; i < 4; i++) {
      add(
        0.09,
        (i + 0.5) / 4,
        rng(0.02, 0.05),
        rng(0.04, 0.07),
        rng(0.06, 0.12),
        rng(0.08, 0.13),
        rng(0.04, 0.07),
        "hi",
      );
    }

    // RIGHT — lo
    for (let i = 0; i < 6; i++) {
      add(
        0.99,
        (i + 0.5) / 6,
        rng(0.01, 0.03),
        rng(0.03, 0.06),
        rng(0.04, 0.09),
        rng(0.15, 0.21),
        rng(0.07, 0.12),
        "lo",
      );
    }
    // RIGHT — hi
    for (let i = 0; i < 4; i++) {
      add(
        0.91,
        (i + 0.5) / 4,
        rng(0.02, 0.05),
        rng(0.04, 0.07),
        rng(0.06, 0.12),
        rng(0.08, 0.13),
        rng(0.04, 0.07),
        "hi",
      );
    }
  }

  private kill(): void {
    for (const b of this.blobs) b.gfx.destroy();
    this.blobs = [];
    this.layerLo.removeChildren();
    this.layerHi.removeChildren();
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────

  private tick(): void {
    const { w, h, t, typing, mx, my } = this;
    const minD = Math.min(w, h);
    const MOUSE_R = 300; // px radius of cursor disturbance

    for (const b of this.blobs) {
      // Slow sinusoidal drift anchored to edge position
      const px = b.bx * w + Math.cos(b.sp * t + b.ph) * b.dax * w;
      const py = b.by * h + Math.sin(b.sp * t + b.ph * 1.37) * b.day * h;

      // Cursor: nearby fog disperses outward and fades — cursor "burns" through mist
      const dx = px - mx;
      const dy = py - my;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let rx = 0,
        ry = 0,
        alphaScale = 1;
      if (dist < MOUSE_R) {
        const s = Math.pow(1 - dist / MOUSE_R, 2);
        rx = (dx / dist) * s * 90;
        ry = (dy / dist) * s * 90;
        // Fog dims near cursor, restores linearly with distance
        alphaScale = 0.45 + 0.55 * (dist / MOUSE_R);
      }

      // Typing: blobs push outward from screen center (heat disturbance)
      let tx = 0,
        ty = 0;
      if (typing > 0.005) {
        const cxd = px - w * 0.5;
        const cyd = py - h * 0.5;
        const cd = Math.sqrt(cxd * cxd + cyd * cyd) || 1;
        tx = (cxd / cd) * typing * 0.045 * w;
        ty = (cyd / cd) * typing * 0.045 * h;
      }

      b.gfx.position.set(px + rx + tx, py + ry + ty);
      b.gfx.scale.set(b.rFrac * minD);

      // Slow alpha breathing + event-driven modulation
      const breathe = 0.82 + 0.18 * Math.sin(t * 0.25 + b.ph);
      b.gfx.alpha = b.ba * breathe * alphaScale * (1 + typing * 0.45);
    }
  }
}
