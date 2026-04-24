import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;

const N = 300;
const MAX_SPEED = 95;
const MIN_SPEED = 28;
const MAX_FORCE = 65; // px/s²

const SEP_R = 26;
const SEP_W = 2.2;
const ALI_R = 72;
const ALI_W = 1.0;
const COH_R = 85;
const COH_W = 0.75;

// Gentle central attractor (like a star/planet)
const ATTRACTOR_R = 220; // orbit radius
const ATTRACTOR_W = 0.18; // weight of orbital pull

const TRAIL_LEN = 7;

// Comet swarm color: diverse themes for different flocks
const SINGLE_COLOR = 0x45475a; // Surface1 (subtle)
const THEMES = [
  [0xcba6f7, 0xf5c2e7, 0xeba0ac, 0xf2cdcd], // Mauve/Pink
  [0x89b4fa, 0x74c7ec, 0x89dceb, 0x94e2d5], // Blue/Teal
  [0xa6e3a1, 0xf9e2af, 0xfab387, 0xf38ba8], // Green/Yellow/Red
] as const;

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  r: number;
  g: number;
  b: number;
  index: number;
  trail: Array<[number, number]>;
}

export class BoidsScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;

  private boids: Boid[] = [];

  // Spatial grid for O(n) neighbor lookup
  private cellSize = ALI_R;
  private grid = new Map<number, number[]>();

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.init();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.init();
  }

  private init(): void {
    this.boids = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
      const startColor = SINGLE_COLOR;
      this.boids.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        index: i,
        color: startColor,
        r: (startColor >> 16) & 0xff,
        g: (startColor >> 8) & 0xff,
        b: startColor & 0xff,
        trail: [],
      });
    }
  }

  private cellKey(x: number, y: number): number {
    const cs = this.cellSize;
    return Math.floor(x / cs) * 10000 + Math.floor(y / cs);
  }

  private buildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.boids.length; i++) {
      const k = this.cellKey(this.boids[i].x, this.boids[i].y);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(i);
    }
  }

  private neighbors(b: Boid, radius: number): Boid[] {
    const cs = this.cellSize;
    const cx = Math.floor(b.x / cs);
    const cy = Math.floor(b.y / cs);
    const range = Math.ceil(radius / cs);
    const res: Boid[] = [];
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        const k = (cx + dx) * 10000 + (cy + dy);
        const cell = this.grid.get(k);
        if (!cell) continue;
        for (const idx of cell) {
          const n = this.boids[idx];
          if (n === b) continue;
          const ddx = n.x - b.x;
          const ddy = n.y - b.y;
          if (ddx * ddx + ddy * ddy < radius * radius) res.push(n);
        }
      }
    }
    return res;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.033);
    const cx = this.w / 2;
    const cy = this.h / 2;

    this.buildGrid();

    for (const b of this.boids) {
      if (b.trail.length >= TRAIL_LEN) b.trail.shift();
      b.trail.push([b.x, b.y]);

      let sx = 0,
        sy = 0; // separation
      let ax = 0,
        ay = 0; // alignment
      let cohX = 0,
        cohY = 0,
        nCoh = 0; // cohesion

      const sepN = this.neighbors(b, SEP_R);
      for (const n of sepN) {
        const dx = b.x - n.x;
        const dy = b.y - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0) {
          sx += dx / d2;
          sy += dy / d2;
        }
      }

      const aliN = this.neighbors(b, ALI_R);
      for (const n of aliN) {
        ax += n.vx;
        ay += n.vy;
      }
      if (aliN.length > 0) {
        ax /= aliN.length;
        ay /= aliN.length;
      }

      const cohN = this.neighbors(b, COH_R);
      for (const n of cohN) {
        cohX += n.x;
        cohY += n.y;
        nCoh++;
      }
      if (nCoh > 0) {
        cohX = cohX / nCoh - b.x;
        cohY = cohY / nCoh - b.y;
      }

      // Color logic: flocking vs single
      let targetHex = SINGLE_COLOR;
      if (aliN.length > 0) {
        // We are in a flock. Determine flock "identity" based on neighbors.
        let avgIndex = b.index;
        for (const n of aliN) avgIndex += n.index;
        avgIndex /= aliN.length + 1;

        // Use avgIndex to pick a theme, ensuring different flocks have different themes
        const themeIdx = Math.floor(avgIndex / 15) % THEMES.length;
        const theme = THEMES[themeIdx];
        // Use individual index to pick color within theme for diversity
        targetHex = theme[b.index % theme.length];
      }

      // Smooth color transition
      const tr = (targetHex >> 16) & 0xff;
      const tg = (targetHex >> 8) & 0xff;
      const tb = targetHex & 0xff;
      const lerpSpeed = dt * 2.5;
      b.r += (tr - b.r) * lerpSpeed;
      b.g += (tg - b.g) * lerpSpeed;
      b.b += (tb - b.b) * lerpSpeed;
      b.color =
        (Math.round(b.r) << 16) | (Math.round(b.g) << 8) | Math.round(b.b);

      // Orbital attractor: steer toward a ring at ATTRACTOR_R from center
      const adx = cx - b.x;
      const ady = cy - b.y;
      const adist = Math.sqrt(adx * adx + ady * ady) + 0.01;
      const orbitErr = adist - ATTRACTOR_R;
      const orbFx = (adx / adist) * orbitErr * 0.4;
      const orbFy = (ady / adist) * orbitErr * 0.4;
      // Tangential component to maintain orbit direction
      const tangX = -ady / adist;
      const tangY = adx / adist;
      const tangFx = tangX * 15;
      const tangFy = tangY * 15;

      // Combine steering
      const steerX =
        sx * SEP_W + ax * ALI_W + cohX * COH_W + (orbFx + tangFx) * ATTRACTOR_W;
      const steerY =
        sy * SEP_W + ay * ALI_W + cohY * COH_W + (orbFy + tangFy) * ATTRACTOR_W;

      // Clamp steering force
      const sLen = Math.sqrt(steerX * steerX + steerY * steerY) + 0.0001;
      const fCap = Math.min(sLen, MAX_FORCE) / sLen;
      b.vx += steerX * fCap * dt;
      b.vy += steerY * fCap * dt;

      // Speed clamp
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy) + 0.0001;
      if (spd > MAX_SPEED) {
        b.vx = (b.vx / spd) * MAX_SPEED;
        b.vy = (b.vy / spd) * MAX_SPEED;
      }
      if (spd < MIN_SPEED) {
        b.vx = (b.vx / spd) * MIN_SPEED;
        b.vy = (b.vy / spd) * MIN_SPEED;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Wrap
      if (b.x < -10) b.x += this.w + 20;
      else if (b.x > this.w + 10) b.x -= this.w + 20;
      if (b.y < -10) b.y += this.h + 20;
      else if (b.y > this.h + 10) b.y -= this.h + 20;
    }

    // Draw
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    // Orbit guide ring
    g.circle(cx, cy, ATTRACTOR_R).stroke({
      width: 0.5,
      color: 0x313244,
      alpha: 0.4,
    });

    // Boid trails + dots
    for (const b of this.boids) {
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const bright = Math.min(spd / MAX_SPEED, 1);

      for (let i = 1; i < b.trail.length; i++) {
        const [x1, y1] = b.trail[i - 1];
        const [x2, y2] = b.trail[i];

        // Skip drawing if distance is too large (indicates a wrap-around)
        if (
          Math.abs(x1 - x2) > this.w * 0.5 ||
          Math.abs(y1 - y2) > this.h * 0.5
        ) {
          continue;
        }

        const t = i / b.trail.length;
        g.moveTo(x1, y1)
          .lineTo(x2, y2)
          .stroke({ width: 1, color: b.color, alpha: t * bright * 0.5 });
      }

      g.circle(b.x, b.y, 3.5).fill({ color: b.color, alpha: 0.1 });
      g.circle(b.x, b.y, 2).fill({ color: b.color, alpha: 0.5 + bright * 0.5 });
    }

    // Central attractor (dim planet/star)
    g.circle(cx, cy, 10).fill({ color: 0xfab387, alpha: 0.15 });
    g.circle(cx, cy, 5).fill({ color: 0xfab387, alpha: 0.5 });
  }
}
