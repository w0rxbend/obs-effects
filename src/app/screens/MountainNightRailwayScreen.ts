import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Texture } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const CP_OVERLAY0 = 0x6c7086;
const CP_YELLOW = 0xf9e2af;
const CP_PEACH = 0xfab387;

// ── Sky ───────────────────────────────────────────────────────────────────────
const SKY_TOP = 0x06060f;
const SKY_HORIZON = 0x14142a;

// ── Mountains ─────────────────────────────────────────────────────────────────
const MTN_FAR = 0x10112a;
const MTN_MID = 0x0b0c20;
const MTN_NEAR = 0x080916;

// ── Scene ─────────────────────────────────────────────────────────────────────
const GROUND_COLOR = 0x06060d;
const CLOUD_COLOR = 0x131328;
const STAR_COLOR = 0xdce9ff;
const MOON_COLOR = 0xf0eadb;
const MOON_GLOW_COLOR = 0xc4deff;
const RAIL_COLOR = 0x45475a;
const TIE_COLOR = 0x28293a;
const BALLAST_COLOR = 0x13142a;

// ── Train (modern speed train) ────────────────────────────────────────────────
const TRAIN_BODY = 0x1c1e32;
const TRAIN_ROOF = 0x14162a;
const TRAIN_STRIPE = 0x2d4a88; // blue accent stripe along body
const TRAIN_UNDERBELLY = 0x101220;
const BOGIE_COLOR = 0x1a1b2c;
const BOGIE_FRAME = 0x252640;
const WHEEL_COLOR = 0x585b70;
const HEADLIGHT_COLOR = 0xeef6ff; // cool white LED
const TAILLIGHT_COLOR = 0xff4444; // red tail
const WINDOW_DARK = 0x0f1022;
const GLASS_COLOR = 0x3355aa; // cab windshield tint

// ── Trees ─────────────────────────────────────────────────────────────────────
const TREE_PALETTE = [
  [8, 9, 20],
  [9, 10, 22],
  [7, 8, 17],
  [10, 11, 24],
  [8, 10, 19],
  [6, 7, 15],
  [9, 9, 21],
  [7, 9, 18],
] as const;

const TREE_W = 175;
const TREE_H = 255;
const TREE_COLS = 16;
const TREE_ROWS = 6;
const STAR_COUNT = 280;
const TRAIN_SPEED = 520; // px/s — high-speed rail
const WIND_COUNT = 42; // atmospheric speed streaks

// Sized so (1920 + 80 + TRAIN_LENGTH + 80) / 100 ≈ 30 s
const LOCO_W = 180;
const LOCO_H = 55; // body height above wheels
const LOCO_NOSE = 44; // length of tapered nose section
const WAGON_W = 200;
const WAGON_H = 50;
const CAR_GAP = 2;
const NUM_WAGONS = 15;
const WAGON_WINDOWS = 10;
const BOGIE_OFFSET = 14; // how far bogies sit from car ends
const WHEEL_R = 8; // wheel radius (modern train, smaller than steam)
// TRAIN_LENGTH = 180 + 15*(200+2) + 2 = 3212
const TRAIN_LENGTH = LOCO_W + NUM_WAGONS * (WAGON_W + CAR_GAP) + CAR_GAP;

const WINDOW_COLORS = [CP_YELLOW, CP_PEACH, 0xffe4a0] as const;

function rand(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  phase: number;
  twinkle: number;
  bright: boolean;
}

interface CloudPuff {
  dx: number;
  dy: number;
  radius: number;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
  speed: number;
  phase: number;
  puffs: CloudPuff[];
}

interface Pt {
  x: number;
  y: number;
}

interface WindStreak {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  thickness: number;
  color: number;
}

export class MountainNightRailwayScreen extends Container {
  public static assetBundles: string[] = ["main"];

  private readonly bgGfx = new Graphics();
  private readonly treeContainer = new Container();
  private readonly fgGfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  private stars: Star[] = [];
  private clouds: Cloud[] = [];
  private farPoly: Pt[] = [];
  private midPoly: Pt[] = [];
  private nearPoly: Pt[] = [];

  private treeTextures: Texture[] = [];
  private texturesBuilt = false;

  // Wind
  private windStreaks: WindStreak[] = [];

  // Train
  private trainX = 0;
  private readonly locoLit: boolean[] = [];
  private readonly wagonLit: boolean[][] = [];
  private readonly winTimer: number[][] = [];

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.treeContainer);
    this.addChild(this.fgGfx);

    // Locomotive cab: one big window, always lit
    this.locoLit.push(true);
    for (let w = 0; w < NUM_WAGONS; w++) {
      const lit: boolean[] = [];
      const timers: number[] = [];
      for (let i = 0; i < WAGON_WINDOWS; i++) {
        lit.push(Math.random() < 0.72);
        timers.push(rand(2, 9));
      }
      this.wagonLit.push(lit);
      this.winTimer.push(timers);
    }
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth || 1920;
    this.h = window.innerHeight || 1080;
    this.trainX = this.w + 120;
    this.buildScene();
    await this.buildTreeTextures();
    this.placeForest();
  }

  public resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.buildScene();
    if (this.texturesBuilt) this.placeForest();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.moveTrain(dt);
    this.driftClouds(dt);
    this.flickerWindows(dt);
    this.moveWindStreaks(dt);
    this.draw();
  }

  // ── Scene geometry ──────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stars = [];
    this.clouds = [];
    this.windStreaks = [];
    this.buildStars();
    this.buildClouds();
    this.buildMountains();
    this.buildWindStreaks();
  }

  private buildWindStreaks(): void {
    const streakColors = [0xdce9ff, 0xb8d0f4, 0xffffff, 0x8fb8e8];
    for (let i = 0; i < WIND_COUNT; i++) {
      const yFrac = Math.random();
      // Distribute: most near ground/train level, some mid-sky
      const y =
        yFrac < 0.55
          ? rand(this.h * 0.78, this.h * 0.9) // near railway
          : yFrac < 0.8
            ? rand(this.h * 0.55, this.h * 0.78) // mid-scene
            : rand(this.h * 0.3, this.h * 0.55); // high, sparse

      const nearGround = y > this.h * 0.78;
      this.windStreaks.push({
        x: rand(-this.w * 0.3, this.w * 1.3),
        y,
        len: nearGround ? rand(80, 260) : rand(30, 120),
        speed: nearGround ? rand(700, 1100) : rand(350, 650),
        alpha: nearGround ? rand(0.18, 0.42) : rand(0.06, 0.18),
        thickness: nearGround ? rand(0.6, 1.4) : rand(0.4, 0.9),
        color: streakColors[Math.floor(Math.random() * streakColors.length)],
      });
    }
  }

  private buildStars(): void {
    const n = Math.round(((this.w * this.h) / (1920 * 1080)) * STAR_COUNT);
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: rand(0, this.w),
        y: rand(0, this.h * 0.74),
        size: rand(0.4, 1.7),
        alpha: rand(0.28, 0.92),
        phase: rand(0, Math.PI * 2),
        twinkle: rand(0.3, 1.6),
        bright: Math.random() < 0.12,
      });
    }
  }

  private buildClouds(): void {
    const specs = [
      { count: 4, yLo: 0.09, yHi: 0.26, speed: 5, alpha: 0.16 },
      { count: 6, yLo: 0.24, yHi: 0.45, speed: 9, alpha: 0.21 },
      { count: 7, yLo: 0.41, yHi: 0.65, speed: 14, alpha: 0.28 },
    ];
    for (const s of specs) {
      for (let i = 0; i < s.count; i++) {
        const puffs: CloudPuff[] = [];
        const n = 4 + Math.floor(Math.random() * 5);
        for (let p = 0; p < n; p++) {
          puffs.push({
            dx: rand(-0.5, 0.5),
            dy: rand(-0.24, 0.24),
            radius: rand(0.18, 0.45),
          });
        }
        this.clouds.push({
          x: rand(-this.w * 0.2, this.w * 1.2),
          y: this.h * rand(s.yLo, s.yHi),
          w: rand(160, 440),
          h: rand(44, 128),
          alpha: s.alpha * rand(0.7, 1.22),
          speed: s.speed * rand(0.7, 1.4),
          phase: rand(0, Math.PI * 2),
          puffs,
        });
      }
    }
  }

  private buildMountains(): void {
    this.farPoly = this.genMtn(this.h * 0.22, this.h * 0.44, this.h * 0.65, 15);
    this.midPoly = this.genMtn(this.h * 0.3, this.h * 0.54, this.h * 0.7, 12);
    this.nearPoly = this.genMtn(
      this.h * 0.39,
      this.h * 0.62,
      this.h * 0.76,
      10,
    );
  }

  private genMtn(
    peakMin: number,
    peakMax: number,
    baseY: number,
    n: number,
  ): Pt[] {
    const pts: Pt[] = [{ x: -90, y: baseY }];

    // Subdivide range into peaks and saddles
    for (let i = 1; i <= n; i++) {
      const x = (i / n) * (this.w + 180) - 90;
      const isPeak = i % 2 === 1;
      const y = isPeak
        ? rand(peakMin, peakMin + (peakMax - peakMin) * 0.55)
        : rand(peakMin + (peakMax - peakMin) * 0.45, peakMax);

      // Add sub-detail point between previous and this
      if (i > 1) {
        const prev = pts[pts.length - 1];
        const mx = (prev.x + x) / 2;
        const my = (prev.y + y) / 2 + rand(-18, 18);
        pts.push({ x: mx, y: my });
      }
      pts.push({ x, y });
    }

    pts.push({ x: this.w + 90, y: baseY });
    pts.push({ x: this.w + 90, y: this.h + 10 });
    pts.push({ x: -90, y: this.h + 10 });
    return pts;
  }

  // ── Trees ───────────────────────────────────────────────────────────────────

  private async buildTreeTextures(): Promise<void> {
    if (this.texturesBuilt) return;

    const img = await this.loadImage("/assets/main/forest-175-255.png");

    for (let row = 0; row < TREE_ROWS; row++) {
      for (let col = 0; col < TREE_COLS; col++) {
        const cv = document.createElement("canvas");
        cv.width = TREE_W;
        cv.height = TREE_H;
        const ctx = cv.getContext("2d")!;
        ctx.drawImage(
          img,
          col * TREE_W,
          row * TREE_H,
          TREE_W,
          TREE_H,
          0,
          0,
          TREE_W,
          TREE_H,
        );

        const imgData = ctx.getImageData(0, 0, TREE_W, TREE_H);
        const data = imgData.data;
        const pal = TREE_PALETTE[(row * TREE_COLS + col) % TREE_PALETTE.length];

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2],
            a = data[i + 3];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          if (lum > 8 || a > 24) {
            const glow = Math.min(1, lum / 60);
            data[i] = Math.min(255, pal[0] + Math.round(glow * 14));
            data[i + 1] = Math.min(255, pal[1] + Math.round(glow * 12));
            data[i + 2] = Math.min(255, pal[2] + Math.round(glow * 22));
            data[i + 3] =
              lum > 8 ? Math.min(255, 170 + Math.round(lum * 1.2)) : a;
          } else {
            data[i + 3] = 0;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        this.treeTextures.push(Texture.from(cv));
      }
    }

    this.texturesBuilt = true;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private placeForest(): void {
    this.treeContainer.removeChildren();
    if (this.treeTextures.length === 0) return;

    // Three rows — use all 96 sprites: 0–31 far, 32–63 mid, 64–95 front
    const rows = [
      { start: 0, count: 32, baseY: this.h * 0.72, scLo: 0.29, scHi: 0.4 },
      { start: 32, count: 32, baseY: this.h * 0.76, scLo: 0.43, scHi: 0.56 },
      { start: 64, count: 32, baseY: this.h * 0.82, scLo: 0.58, scHi: 0.72 },
    ];

    for (const row of rows) {
      // Spread trees to fill screen width
      const scaleAvg = (row.scLo + row.scHi) / 2;
      const avgW = TREE_W * scaleAvg * 0.68; // overlap factor
      const totalSpan = this.w + TREE_W * row.scHi;
      const spacing = totalSpan / row.count;

      for (let i = 0; i < row.count; i++) {
        const idx = row.start + i;
        if (idx >= this.treeTextures.length) break;

        const sc = rand(row.scLo, row.scHi);
        const spr = new Sprite(this.treeTextures[idx]);
        spr.scale.set(sc);
        spr.x =
          i * spacing -
          TREE_W * row.scLo * 0.3 +
          rand(-avgW * 0.18, avgW * 0.18);
        spr.y = row.baseY - spr.height + rand(-6, 6);
        spr.alpha = 0.88 + rand(0, 0.12);
        this.treeContainer.addChild(spr);
      }
    }
  }

  // ── Animation updates ───────────────────────────────────────────────────────

  private moveTrain(dt: number): void {
    this.trainX -= TRAIN_SPEED * dt;
    if (this.trainX < -(TRAIN_LENGTH + 200)) {
      this.trainX = this.w + 200;
    }
  }

  private moveWindStreaks(dt: number): void {
    for (const s of this.windStreaks) {
      s.x -= s.speed * dt;
      if (s.x + s.len < -20) {
        s.x = this.w + rand(0, 200);
        s.y =
          s.y > this.h * 0.78
            ? rand(this.h * 0.78, this.h * 0.9)
            : rand(this.h * 0.3, this.h * 0.78);
      }
    }
  }

  private driftClouds(dt: number): void {
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x - c.w > this.w + 80) {
        c.x = -c.w - rand(40, 180);
      }
    }
  }

  private flickerWindows(dt: number): void {
    for (let w = 0; w < NUM_WAGONS; w++) {
      for (let i = 0; i < WAGON_WINDOWS; i++) {
        this.winTimer[w][i] -= dt;
        if (this.winTimer[w][i] <= 0) {
          this.winTimer[w][i] = rand(2, 10);
          if (Math.random() < 0.22) {
            this.wagonLit[w][i] = !this.wagonLit[w][i];
          }
        }
      }
    }
  }

  // ── Draw ────────────────────────────────────────────────────────────────────

  private draw(): void {
    this.drawBg();
    this.drawFg();
  }

  private drawBg(): void {
    const g = this.bgGfx;
    g.clear();
    this.drawSky(g);
    this.drawStars(g);
    this.drawMoon(g);
    this.drawMountains(g);
    this.drawClouds(g);
  }

  private drawFg(): void {
    const g = this.fgGfx;
    g.clear();
    this.drawGround(g);
    this.drawRailway(g);
    this.drawWindStreaks(g, true); // background streaks (behind train)
    this.drawTrain(g);
    this.drawWindStreaks(g, false); // foreground streaks (in front of train)
  }

  private drawSky(g: Graphics): void {
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const y = t * this.h;
      g.rect(0, y, this.w, this.h / bands + 2).fill({
        color: mix(SKY_TOP, SKY_HORIZON, Math.pow(t, 1.6)),
      });
    }
  }

  private drawStars(g: Graphics): void {
    for (const s of this.stars) {
      const t = 0.48 + 0.52 * Math.sin(this.time * s.twinkle + s.phase);
      const a = s.alpha * t;

      if (s.bright) {
        g.circle(s.x, s.y, s.size * 4.5).fill({
          color: MOON_GLOW_COLOR,
          alpha: a * 0.07,
        });
        const r = s.size * (2 + t * 1.2);
        g.moveTo(s.x - r, s.y)
          .lineTo(s.x + r, s.y)
          .stroke({ color: 0xd4e8ff, width: 0.65, alpha: a * 0.2 });
        g.moveTo(s.x, s.y - r)
          .lineTo(s.x, s.y + r)
          .stroke({ color: 0xd4e8ff, width: 0.65, alpha: a * 0.17 });
      }
      g.circle(s.x, s.y, s.size).fill({ color: STAR_COLOR, alpha: a });
    }
  }

  private drawMoon(g: Graphics): void {
    const mx = this.w * 0.8;
    const my = this.h * 0.12;
    const r = Math.min(this.w, this.h) * 0.055;
    const bob = Math.sin(this.time * 0.06) * 4;

    g.circle(mx, my + bob, r * 3.2).fill({
      color: MOON_GLOW_COLOR,
      alpha: 0.04,
    });
    g.circle(mx, my + bob, r * 2.1).fill({
      color: MOON_GLOW_COLOR,
      alpha: 0.08,
    });
    g.circle(mx, my + bob, r * 1.45).fill({
      color: MOON_GLOW_COLOR,
      alpha: 0.13,
    });
    g.circle(mx, my + bob, r).fill({ color: MOON_COLOR, alpha: 0.97 });
    // Subtle crater tint
    g.circle(mx + r * 0.28, my + bob - r * 0.16, r * 0.8).fill({
      color: 0x1a1a38,
      alpha: 0.07,
    });
  }

  private drawMountains(g: Graphics): void {
    this.fillPoly(g, this.farPoly, MTN_FAR);
    this.fillPoly(g, this.midPoly, MTN_MID);
    this.fillPoly(g, this.nearPoly, MTN_NEAR);

    // Subtle snow gleam on tallest far-mountain peaks
    for (const pt of this.farPoly) {
      if (pt.y < this.h * 0.3) {
        const pulse = 0.03 + 0.02 * Math.sin(this.time * 0.18);
        g.circle(pt.x, pt.y, 14).fill({ color: 0x8aaad4, alpha: pulse });
        g.circle(pt.x, pt.y, 6).fill({ color: 0xb8d0f0, alpha: pulse * 0.9 });
      }
    }
  }

  private fillPoly(g: Graphics, pts: Pt[], color: number): void {
    if (pts.length < 3) return;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.fill({ color });
  }

  private drawClouds(g: Graphics): void {
    for (const c of this.clouds) {
      const a = c.alpha * (0.78 + 0.22 * Math.sin(this.time * 0.14 + c.phase));
      for (const p of c.puffs) {
        g.circle(c.x + p.dx * c.w, c.y + p.dy * c.h, p.radius * c.w).fill({
          color: CLOUD_COLOR,
          alpha: a,
        });
      }
    }
  }

  // bg=true → draw slower/dimmer streaks that sit behind the train;
  // bg=false → draw fast/bright streaks that fly in front of the train.
  private drawWindStreaks(g: Graphics, bg: boolean): void {
    for (const s of this.windStreaks) {
      const isFg = s.speed > 800;
      if (bg === isFg) continue; // skip this pass

      // Fade the streak: bright at tail (right), transparent at head (left)
      const x0 = s.x + s.len; // tail (where it comes from)
      const x1 = s.x; // head (moving direction)
      g.moveTo(x0, s.y).lineTo(x1, s.y).stroke({
        color: s.color,
        width: s.thickness,
        alpha: s.alpha,
        cap: "round",
      });

      // Short bright core at the tail for a leading-edge glint
      const coreLen = s.len * 0.18;
      g.moveTo(x0, s.y)
        .lineTo(x0 - coreLen, s.y)
        .stroke({
          color: 0xffffff,
          width: s.thickness * 0.6,
          alpha: s.alpha * 0.55,
          cap: "round",
        });
    }
  }

  private drawGround(g: Graphics): void {
    const top = this.h * 0.82;
    g.rect(0, top, this.w, this.h - top).fill({ color: GROUND_COLOR });
    // Subtle fringe line
    g.rect(0, top, this.w, 2).fill({ color: 0x18182e, alpha: 0.5 });
  }

  private drawRailway(g: Graphics): void {
    // Side-view railway: you see the elevation profile, not the plan.
    // One visible rail (near side) at the wheel contact line.
    const railSurface = this.h * 0.858; // where wheels touch the rail
    const railH = 4; // rail cross-section height
    const ballastTop = railSurface + railH;
    const ballastBot = this.h * 0.876;
    const ballastH = ballastBot - ballastTop;

    // Ballast bed (trapezoid silhouette: slightly wider at foot)
    g.rect(0, ballastTop, this.w, ballastH).fill({ color: BALLAST_COLOR });
    // Ballast toe — a thin darker strip at the very base
    g.rect(0, ballastBot - 3, this.w, 3).fill({ color: 0x0c0d1a });

    // Tie ends: small dark bars visible along the top of the ballast bed,
    // protruding outward from under the rail (side-view cross-ties).
    const tieStep = 25;
    const tieCount = Math.ceil(this.w / tieStep) + 1;
    for (let i = 0; i <= tieCount; i++) {
      const tx = i * tieStep;
      // Tie top surface (pokes up through the ballast slightly)
      g.rect(tx, ballastTop, 14, 5).fill({ color: TIE_COLOR });
    }

    // Rail head (near side): single horizontal T-profile bar
    g.rect(0, railSurface, this.w, railH).fill({ color: RAIL_COLOR });
    // Rail foot (base flange)
    g.rect(0, railSurface + railH - 1, this.w, 2).fill({
      color: mix(RAIL_COLOR, BALLAST_COLOR, 0.55),
    });
    // Specular highlight on the top running surface of the rail
    g.rect(0, railSurface, this.w, 1).fill({ color: 0x8090b8, alpha: 0.55 });
  }

  private drawTrain(g: Graphics): void {
    // Rail surface → wheels sit on it, body is above
    const railSurface = this.h * 0.858;
    const wheelR = WHEEL_R;
    const botY = railSurface - wheelR * 2; // bottom of train body (wheel tops)

    // Wheel spin angle from travel distance
    const spinAngle = -(this.time * TRAIN_SPEED) / wheelR;

    // Draw wagons first so loco renders on top
    let carX = this.trainX + LOCO_W + CAR_GAP;
    for (let wi = 0; wi < NUM_WAGONS; wi++) {
      this.drawWagon(g, carX, botY, railSurface, wheelR, spinAngle, wi);
      carX += WAGON_W + CAR_GAP;
    }

    // Tail-light on the rear of the last wagon
    const tailX = carX - CAR_GAP; // right edge of last wagon
    const tailY = botY - WAGON_H * 0.42;
    g.circle(tailX - 5, tailY, 4).fill({ color: TAILLIGHT_COLOR, alpha: 0.9 });
    g.circle(tailX - 5, tailY, 9).fill({ color: TAILLIGHT_COLOR, alpha: 0.18 });
    g.circle(tailX - 5, tailY, 18).fill({
      color: TAILLIGHT_COLOR,
      alpha: 0.06,
    });

    // Locomotive
    this.drawLoco(g, this.trainX, botY, railSurface, wheelR, spinAngle);
  }

  private drawLoco(
    g: Graphics,
    lx: number,
    botY: number,
    railSurface: number,
    wheelR: number,
    spinAngle: number,
  ): void {
    const topY = botY - LOCO_H;
    const noseTipY = topY + LOCO_H * 0.4; // where the nose point sits (40% down)

    // ── Body polygon (tapered bullet nose on the left) ──────────────────
    g.moveTo(lx + LOCO_NOSE, topY) // top: where nose meets body
      .lineTo(lx, noseTipY) // nose tip
      .lineTo(lx + 5, botY) // front bottom (slight splay)
      .lineTo(lx + LOCO_NOSE, botY) // bottom: where nose meets body
      .lineTo(lx + LOCO_W, botY) // tail bottom
      .lineTo(lx + LOCO_W, topY) // tail top
      .fill({ color: TRAIN_BODY });

    // Roof: slightly darker strip along the top
    g.rect(lx + LOCO_NOSE, topY, LOCO_W - LOCO_NOSE, 5).fill({
      color: TRAIN_ROOF,
    });

    // Accent stripe: blue band along the lower third of the body
    const stripeY = botY - LOCO_H * 0.32;
    g.moveTo(lx + LOCO_NOSE, stripeY)
      .lineTo(lx + 6, botY - 4) // follows nose angle at front
      .lineTo(lx + LOCO_W, botY - 4)
      .lineTo(lx + LOCO_W, stripeY)
      .fill({ color: TRAIN_STRIPE, alpha: 0.85 });

    // Underbelly (below stripe, above wheels)
    g.rect(lx + LOCO_NOSE, botY - 4, LOCO_W - LOCO_NOSE, 4).fill({
      color: TRAIN_UNDERBELLY,
    });

    // ── Windshield / cab glass on the nose face ──────────────────────────
    g.moveTo(lx + LOCO_NOSE * 0.78, topY + 3) // top-right of glass
      .lineTo(lx + 3, noseTipY + 2) // near nose tip top
      .lineTo(lx + 7, botY - LOCO_H * 0.3) // near nose bottom
      .lineTo(lx + LOCO_NOSE * 0.7, botY - LOCO_H * 0.3) // bottom-right of glass
      .fill({ color: GLASS_COLOR, alpha: 0.55 });

    // Glass sheen
    g.moveTo(lx + LOCO_NOSE * 0.5, topY + 6)
      .lineTo(lx + 5, noseTipY - 2)
      .lineTo(lx + 7, noseTipY + 6)
      .lineTo(lx + LOCO_NOSE * 0.52, topY + 16)
      .fill({ color: 0x8fb8ff, alpha: 0.12 });

    // ── Passenger windows along the body ─────────────────────────────────
    const winBodyX = lx + LOCO_NOSE + 6;
    const winBodyW = LOCO_W - LOCO_NOSE - 10;
    const winH = 12;
    const winY = topY + 7;
    const nWin = Math.floor(winBodyW / 22);
    const winSpacing = winBodyW / nWin;
    for (let i = 0; i < nWin; i++) {
      const wx = winBodyX + i * winSpacing;
      const lit = this.locoLit[0]; // all body windows match cab state
      const col = lit ? WINDOW_COLORS[i % WINDOW_COLORS.length] : WINDOW_DARK;
      const ga = lit ? 0.9 + 0.1 * Math.sin(this.time * 1.8 + i * 0.7) : 1;
      if (lit)
        g.rect(wx - 1, winY - 1, 14, winH + 2).fill({
          color: col,
          alpha: 0.2 * ga,
        });
      g.rect(wx, winY, 13, winH).fill({ color: col, alpha: lit ? ga : 0.7 });
    }

    // ── LED headlights (two stacked, on nose tip area) ──────────────────
    const pulse = 0.9 + 0.1 * Math.sin(this.time * 2.4);
    const hlX = lx + 4;
    const hlY1 = noseTipY - 5;
    const hlY2 = noseTipY + 8;

    for (const hy of [hlY1, hlY2]) {
      g.rect(hlX, hy, 5, 4).fill({
        color: HEADLIGHT_COLOR,
        alpha: 0.95 * pulse,
      });
      g.circle(hlX + 2, hy + 2, 7).fill({
        color: HEADLIGHT_COLOR,
        alpha: 0.15 * pulse,
      });
    }

    // Headlight beam cone (wider spread for high-speed train)
    const beamMidY = (hlY1 + hlY2) / 2 + 2;
    g.moveTo(hlX + 4, beamMidY)
      .lineTo(lx - 160, beamMidY - 50)
      .lineTo(lx - 160, beamMidY + 50)
      .fill({ color: HEADLIGHT_COLOR, alpha: 0.028 * pulse });
    // Inner brighter core
    g.moveTo(hlX + 4, beamMidY)
      .lineTo(lx - 80, beamMidY - 18)
      .lineTo(lx - 80, beamMidY + 18)
      .fill({ color: HEADLIGHT_COLOR, alpha: 0.055 * pulse });

    // ── Bogies (two wheel trucks under the loco) ─────────────────────────
    const bogiePositions = [lx + 22, lx + LOCO_W - 28];
    for (const bx of bogiePositions) {
      this.drawBogie(g, bx, railSurface, wheelR, spinAngle, true);
    }

    // ── Coupler at tail ──────────────────────────────────────────────────
    g.rect(lx + LOCO_W, botY - 10, 5, 3).fill({ color: CP_OVERLAY0 });
  }

  private drawWagon(
    g: Graphics,
    wx: number,
    botY: number,
    railSurface: number,
    wheelR: number,
    spinAngle: number,
    wi: number,
  ): void {
    const topY = botY - WAGON_H;

    // ── Body ──────────────────────────────────────────────────────────────
    g.rect(wx, topY, WAGON_W, WAGON_H).fill({ color: TRAIN_BODY });

    // Roof strip
    g.rect(wx, topY, WAGON_W, 4).fill({ color: TRAIN_ROOF });

    // Accent stripe (lower third)
    const stripeY = botY - WAGON_H * 0.3;
    g.rect(wx, stripeY, WAGON_W, botY - stripeY - 4).fill({
      color: TRAIN_STRIPE,
      alpha: 0.82,
    });

    // Underbelly
    g.rect(wx, botY - 4, WAGON_W, 4).fill({ color: TRAIN_UNDERBELLY });

    // Thin separation lines between wagons (realistic inter-car gap)
    g.rect(wx - 1, topY, 1, WAGON_H).fill({ color: 0x0a0b18 });

    // ── Windows ───────────────────────────────────────────────────────────
    const winW = 8;
    const winH = 10;
    const margin = 4;
    const slot = (WAGON_W - margin * 2) / WAGON_WINDOWS;
    for (let i = 0; i < WAGON_WINDOWS; i++) {
      const wix = wx + margin + i * slot + (slot - winW) * 0.5;
      const wiy = topY + 7;
      const lit = this.wagonLit[wi][i];
      const col = lit
        ? WINDOW_COLORS[(wi * WAGON_WINDOWS + i) % WINDOW_COLORS.length]
        : WINDOW_DARK;
      const ga = lit
        ? 0.88 + 0.12 * Math.sin(this.time * 2.2 + wi * 0.5 + i)
        : 1;
      if (lit)
        g.rect(wix - 1, wiy - 1, winW + 2, winH + 2).fill({
          color: col,
          alpha: 0.22 * ga,
        });
      g.rect(wix, wiy, winW, winH).fill({ color: col, alpha: lit ? ga : 0.7 });
    }

    // ── Bogie under each end ─────────────────────────────────────────────
    this.drawBogie(g, wx + BOGIE_OFFSET, railSurface, wheelR, spinAngle, false);
    this.drawBogie(
      g,
      wx + WAGON_W - BOGIE_OFFSET,
      railSurface,
      wheelR,
      spinAngle,
      false,
    );
  }

  // One bogie / wheel truck with two wheels and animated hub spoke
  private drawBogie(
    g: Graphics,
    cx: number,
    railSurface: number,
    wheelR: number,
    spinAngle: number,
    isLoco: boolean,
  ): void {
    const frameH = 5;
    const frameY = railSurface - wheelR * 2 - frameH;
    const w1x = cx - wheelR - 1;
    const w2x = cx + wheelR + 1;
    const wy = railSurface - wheelR; // wheel center Y

    // Bogie frame bar
    g.rect(w1x - 2, frameY, w2x - w1x + 4 + wheelR, frameH).fill({
      color: BOGIE_FRAME,
    });

    // Draw two wheels per bogie
    for (const wkx of [w1x, w2x]) {
      const r = isLoco ? wheelR + 1 : wheelR; // slightly larger on loco
      g.circle(wkx, wy, r).fill({ color: WHEEL_COLOR });
      // Hub disc
      g.circle(wkx, wy, r * 0.44).fill({ color: BOGIE_COLOR });
      // Animated spoke (single line, rotates with travel)
      const sa = spinAngle + wkx * 0.07;
      const sr = r * 0.8;
      g.moveTo(wkx + Math.cos(sa) * sr * 0.35, wy + Math.sin(sa) * sr * 0.35)
        .lineTo(wkx + Math.cos(sa) * sr, wy + Math.sin(sa) * sr)
        .stroke({ color: BOGIE_FRAME, width: 1.5 });
      g.moveTo(
        wkx + Math.cos(sa + Math.PI) * sr * 0.35,
        wy + Math.sin(sa + Math.PI) * sr * 0.35,
      )
        .lineTo(
          wkx + Math.cos(sa + Math.PI) * sr,
          wy + Math.sin(sa + Math.PI) * sr,
        )
        .stroke({ color: BOGIE_FRAME, width: 1.5 });
    }
  }
}
