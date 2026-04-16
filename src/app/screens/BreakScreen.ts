import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const TOXIC_GREEN = 0x39ff14;
const CATT_GREEN  = 0xa6e3a1;
const CATT_TEAL   = 0x94e2d5;
const CATT_SKY    = 0x89dceb;
const CATT_BLUE   = 0x89b4fa;
const CATT_YELLOW = 0xf9e2af;
const CATT_PEACH  = 0xfab387;
const WHITE       = 0xffffff;

const PALETTE = [TOXIC_GREEN, CATT_GREEN, CATT_TEAL, CATT_SKY, CATT_BLUE, CATT_YELLOW, CATT_PEACH, WHITE] as const;

// ── Nerd Font symbols ─────────────────────────────────────────────────────────
const SYMS = [
  '\uF0F4', '\uF17B', '\uF120', '\uF11B', '\uF001',
  '\uF1FC', '\uF135', '\uF0EB', '\uF017', '\uF108',
  '\uF10C', '\uF075', '\uF086', '\uF0C0', '\uF007',
  '\uF236', '\uF013', '\uF09B', '\uF0F3', '\uF0E7',
  '\uF185', '\uF186', '\uF0C2', '\uF0F4', '\uF11B',
  '\uF001', '\uF236', '\uF017',
] as const;

// ── Text phrases — randomly assigned to floating labels ───────────────────────
const PHRASES = [
  // status
  "BRB",
  "AFK",
  "BE RIGHT BACK",
  "LOADING...",
  "RESPAWNING",
  "PLEASE WAIT",
  "STAND BY",
  "ONE MOMENT",
  // activities
  "TOUCHING GRASS",
  "COFFEE BREAK",
  "SNACK RUN",
  "HYDRATING",
  "BATHROOM BREAK",
  "PHONE CALL",
  "STRETCHING",
  "PETTING THE CAT",
  "TAKING A WALK",
  "SKILL ISSUE: IRL",
  // developer humour
  "DEBUGGING LIFE",
  "GIT COMMIT --SELF",
  "COFFEE.EXE RUNNING",
  "SNACK.EXE INITIATED",
  "SLEEP.EXE CRASHED",
  "CTRL+ALT+BREAK",
  "REBOOT IN PROGRESS",
  "BRAIN.EXE UPDATING",
  "404: STREAMER",
  "NULL POINTER IRL",
  "STACK OVERFLOW",
  "SUDO MAKE COFFEE",
  "rm -rf /procrastination",
  "git stash && go eat",
  "yarn add caffeine",
  "npm install sleep",
  // misc
  "GRASS NOT FOUND",
  "UNLOCKING OUTSIDE",
  "FRESH AIR SPEEDRUN",
  "SOCIAL INTERACTION",
  "SUNLIGHT DETECTED",
  "ACHIEVEMENT: MOVED",
] as const;

// ── Background line definition ────────────────────────────────────────────────
interface BgLine {
  angle:  number;   // radians
  offset: number;   // perpendicular shift from centre
  drift:  number;   // slow drift speed (px/s along perpendicular)
  color:  number;
  alpha:  number;
  width:  number;
}

// ── Floating text label ───────────────────────────────────────────────────────
interface FloatingText {
  node:          Text;
  baseX:         number;
  baseY:         number;
  // bounce — slow large oscillation
  bounceAmpX:    number;
  bounceAmpY:    number;
  bounceFreqX:   number;
  bounceFreqY:   number;
  bouncePhaseX:  number;
  bouncePhaseY:  number;
  // vibration — fast tiny jitter
  vibeAmp:       number;
  vibeFreq:      number;
  vibePhaseX:    number;
  vibePhaseY:    number;
  // alpha pulse
  alphaBase:     number;
  alphaAmp:      number;
  alphaFreq:     number;
  alphaPhase:    number;
  // text cycling
  changeTimer:   number;
  changeInterval: number;
  color:         number;
}

// ── Network dot ───────────────────────────────────────────────────────────────
interface NetDot {
  x: number; y: number;
  vx: number; vy: number;
  size: number; color: number; alpha: number; phase: number;
}

// ── Particle ──────────────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number; color: number;
  twinklePhase: number; twinkleSpeed: number;
}

// ── Floating symbol ───────────────────────────────────────────────────────────
interface FloatingSymbol {
  node:        Text;
  angle:       number; orbitSpeed: number; orbitR: number;
  driftX:      number; driftY: number;
  driftSpeedX: number; driftSpeedY: number;
  alphaBase:   number; alphaAmp: number; alphaSpeed: number; alphaPhase: number;
  scaleBase:   number; scaleAmp: number; scaleSpeed: number; scalePhase: number;
  spinSpeed:   number;
  wx: number; wy: number; color: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const NET_DOT_COUNT  = 55;
const NET_MAX_DIST   = 200;
const PARTICLE_COUNT = 180;
const SYM_COUNT      = 48;
const TEXT_COUNT     = 10;  // floating text labels
const BG_LINE_COUNT  = 18;  // diagonal background lines

// ── Helpers ───────────────────────────────────────────────────────────────────

function lerpColor(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8)  |
     Math.round(ab + (bb - ab) * t)
  );
}

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhrase(): string {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

// ── Predefined scatter positions (normalised, applied after resize) ────────────
// Spread across the screen avoiding dead-centre cluster
const BASE_POSITIONS: [number, number][] = [
  [-0.72, -0.60],
  [ 0.10, -0.68],
  [ 0.68, -0.48],
  [-0.82,  0.05],
  [ 0.78,  0.10],
  [-0.55,  0.55],
  [ 0.45,  0.58],
  [-0.20, -0.30],
  [ 0.60,  0.30],
  [-0.35,  0.72],
];

export class BreakScreen extends Container {
  public static assetBundles = ["main"];

  // ── Layers ─────────────────────────────────────────────────────────────────
  private readonly bgGfx       = new Graphics(); // radial haze
  private readonly bgLinesGfx  = new Graphics(); // diagonal accent lines
  private readonly netGfx      = new Graphics(); // network dots
  private readonly particleGfx = new Graphics(); // particles
  private readonly connGfx     = new Graphics(); // symbol connections
  private readonly symbolCont  = new Container();
  private readonly textCont    = new Container(); // floating text labels

  private readonly bgLines:   BgLine[]        = [];
  private readonly netDots:   NetDot[]         = [];
  private readonly particles: Particle[]       = [];
  private readonly symbols:   FloatingSymbol[] = [];
  private readonly texts:     FloatingText[]   = [];

  private time = 0;
  private w    = 0;
  private h    = 0;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.bgLinesGfx);
    this.addChild(this.netGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.connGfx);
    this.addChild(this.symbolCont);
    this.addChild(this.textCont);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.spawnBgLines();
    this.spawnSymbols();
    this.spawnNetDots();
    this.spawnParticles();
    this.spawnTexts();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    const breathe = 1 + 0.030 * Math.sin(this.time * 0.55);

    this.drawBackground(breathe);
    this.drawBgLines(dt);
    this.drawNetwork(dt);
    this.drawParticles(dt);
    this.updateSymbols(dt, breathe);
    this.drawSymbolConnections();
    this.updateTexts(dt);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width  * 0.5;
    this.y = height * 0.5;
    // Reposition text base positions when screen size changes
    for (let i = 0; i < this.texts.length; i++) {
      const [nx, ny] = BASE_POSITIONS[i % BASE_POSITIONS.length];
      this.texts[i].baseX = nx * width  * 0.48;
      this.texts[i].baseY = ny * height * 0.48;
    }
  }

  // ── Background radial haze ────────────────────────────────────────────────

  private drawBackground(breathe: number): void {
    this.bgGfx.clear();
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    const r  = Math.max(hw, hh);

    this.bgGfx.circle(0, 0, r * 2.0 * breathe).fill({ color: CATT_TEAL,   alpha: 0.018 });
    this.bgGfx.circle(0, 0, r * 1.4 * breathe).fill({ color: TOXIC_GREEN, alpha: 0.028 });
    this.bgGfx.circle(0, 0, r * 0.9 * breathe).fill({ color: CATT_GREEN,  alpha: 0.038 });
    this.bgGfx.circle(0, 0, r * 0.5 * breathe).fill({ color: CATT_GREEN,  alpha: 0.048 });
    this.bgGfx.circle(0, 0, r * 0.22 * breathe).fill({ color: WHITE,      alpha: 0.012 });
  }

  // ── Background diagonal lines ─────────────────────────────────────────────

  private spawnBgLines(): void {
    for (let i = 0; i < BG_LINE_COUNT; i++) {
      this.bgLines.push({
        angle:  (Math.random() * Math.PI),               // 0–180°
        offset: (Math.random() - 0.5) * 1200,            // spread across screen
        drift:  (Math.random() - 0.5) * 18,              // slow perpendicular drift
        color:  randomFrom(PALETTE),
        alpha:  0.04 + Math.random() * 0.10,
        width:  0.5  + Math.random() * 2.0,
      });
    }
  }

  private drawBgLines(dt: number): void {
    this.bgLinesGfx.clear();
    if (this.w === 0) return;

    const diag = Math.sqrt(this.w * this.w + this.h * this.h) * 0.5 + 40;

    for (const l of this.bgLines) {
      // Drift offset slowly
      l.offset += l.drift * dt;
      // Wrap offset
      if (Math.abs(l.offset) > diag * 1.2) l.drift *= -1;

      // Perpendicular direction (normal to the line)
      const nx = -Math.sin(l.angle);
      const ny =  Math.cos(l.angle);
      // Centre of the line (shifted perpendicularly by offset)
      const cx = nx * l.offset;
      const cy = ny * l.offset;
      // Line direction
      const dx = Math.cos(l.angle);
      const dy = Math.sin(l.angle);

      const x1 = cx - dx * diag, y1 = cy - dy * diag;
      const x2 = cx + dx * diag, y2 = cy + dy * diag;

      // Glow pass
      this.bgLinesGfx.moveTo(x1, y1).lineTo(x2, y2)
        .stroke({ color: l.color, alpha: l.alpha * 0.35, width: l.width * 6, cap: "butt" });
      // Core
      this.bgLinesGfx.moveTo(x1, y1).lineTo(x2, y2)
        .stroke({ color: l.color, alpha: l.alpha,        width: l.width,     cap: "butt" });
    }
  }

  // ── Floating text labels ──────────────────────────────────────────────────

  private spawnTexts(): void {
    const sizes = [52, 38, 64, 32, 48, 42, 56, 36, 44, 60];

    for (let i = 0; i < TEXT_COUNT; i++) {
      const color   = randomFrom(PALETTE);
      const fontSize = sizes[i % sizes.length];
      const phrase  = randomPhrase();

      const node = new Text({
        text: phrase,
        style: new TextStyle({
          fontFamily: "'Rock Salt', cursive",
          fontSize,
          fill:       color,
          stroke:     { color: 0x000000, width: Math.max(4, fontSize * 0.14) },
          align:      "center",
          padding:    40,
          dropShadow: { color, blur: 22, distance: 0, alpha: 0.80, angle: 0 },
        }),
      });
      node.anchor.set(0.5);
      this.textCont.addChild(node);

      const [nx, ny] = BASE_POSITIONS[i % BASE_POSITIONS.length];

      this.texts.push({
        node,
        baseX:         nx * (this.w > 0 ? this.w : 1920) * 0.48,
        baseY:         ny * (this.h > 0 ? this.h : 1080) * 0.48,
        bounceAmpX:    12 + Math.random() * 28,
        bounceAmpY:    18 + Math.random() * 38,
        bounceFreqX:   0.30 + Math.random() * 0.50,
        bounceFreqY:   0.25 + Math.random() * 0.55,
        bouncePhaseX:  Math.random() * Math.PI * 2,
        bouncePhaseY:  Math.random() * Math.PI * 2,
        vibeAmp:       1.2 + Math.random() * 2.0,
        vibeFreq:      8  + Math.random() * 14,
        vibePhaseX:    Math.random() * Math.PI * 2,
        vibePhaseY:    Math.random() * Math.PI * 2,
        alphaBase:     0.65 + Math.random() * 0.25,
        alphaAmp:      0.20 + Math.random() * 0.25,
        alphaFreq:     0.35 + Math.random() * 0.80,
        alphaPhase:    Math.random() * Math.PI * 2,
        changeTimer:   2.0  + Math.random() * 6.0,
        changeInterval: 3.0 + Math.random() * 7.0,
        color,
      });
    }
  }

  private updateTexts(dt: number): void {
    const t = this.time;

    for (const ft of this.texts) {
      // ── Random phrase cycling ──────────────────────────────────────────────
      ft.changeTimer -= dt;
      if (ft.changeTimer <= 0) {
        ft.changeTimer    = ft.changeInterval + Math.random() * 4.0;
        ft.changeInterval = 3.0 + Math.random() * 7.0;
        ft.node.text      = randomPhrase();
        // Pick a new colour on change
        ft.color = randomFrom(PALETTE);
        (ft.node.style as TextStyle).fill       = ft.color;
        (ft.node.style as TextStyle).dropShadow = {
          color: ft.color, blur: 22, distance: 0, alpha: 0.80, angle: 0,
        };
      }

      // ── Bounce (slow large wave) ───────────────────────────────────────────
      ft.bouncePhaseX += ft.bounceFreqX * dt;
      ft.bouncePhaseY += ft.bounceFreqY * dt;
      const bx = Math.sin(ft.bouncePhaseX) * ft.bounceAmpX;
      const by = Math.sin(ft.bouncePhaseY) * ft.bounceAmpY;

      // ── Vibration (fast tiny jitter) ──────────────────────────────────────
      ft.vibePhaseX += ft.vibeFreq * dt;
      ft.vibePhaseY += ft.vibeFreq * dt * 1.31; // slightly offset
      const vx = Math.sin(ft.vibePhaseX) * ft.vibeAmp;
      const vy = Math.sin(ft.vibePhaseY) * ft.vibeAmp;

      ft.node.x = ft.baseX + bx + vx;
      ft.node.y = ft.baseY + by + vy;

      // ── Alpha pulse ───────────────────────────────────────────────────────
      ft.alphaPhase += ft.alphaFreq * dt;
      ft.node.alpha  = Math.min(1, Math.max(0.1,
        ft.alphaBase + ft.alphaAmp * Math.sin(ft.alphaPhase + t * 0.2),
      ));

      // ── Subtle scale pulse ────────────────────────────────────────────────
      const scale = 1 + 0.04 * Math.sin(ft.bouncePhaseY * 1.3 + 0.5);
      ft.node.scale.set(scale);
    }
  }

  // ── Network dots ──────────────────────────────────────────────────────────

  private spawnNetDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < NET_DOT_COUNT; i++) {
      this.netDots.push({
        x:     (Math.random() - 0.5) * hw * 1.8,
        y:     (Math.random() - 0.5) * hh * 1.8,
        vx:    (Math.random() - 0.5) * 22,
        vy:    (Math.random() - 0.5) * 22,
        size:  1.0 + Math.random() * 2.2,
        color: randomFrom(PALETTE),
        alpha: 0.20 + Math.random() * 0.40,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private drawNetwork(dt: number): void {
    this.netGfx.clear();
    if (this.w === 0) return;

    const hw   = this.w * 0.5, hh = this.h * 0.5;
    const drag = 0.98;

    for (const d of this.netDots) {
      d.vx *= drag; d.vy *= drag;
      d.x  += d.vx * dt; d.y += d.vy * dt;
      if (d.x >  hw - 8) { d.x =  hw - 8; d.vx *= -0.8; }
      if (d.x < -hw + 8) { d.x = -hw + 8; d.vx *= -0.8; }
      if (d.y >  hh - 8) { d.y =  hh - 8; d.vy *= -0.8; }
      if (d.y < -hh + 8) { d.y = -hh + 8; d.vy *= -0.8; }
    }

    for (let i = 0; i < this.netDots.length; i++) {
      const a = this.netDots[i];
      for (let j = i + 1; j < this.netDots.length; j++) {
        const b    = this.netDots[j];
        const dx   = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= NET_MAX_DIST) continue;
        const t   = 1 - dist / NET_MAX_DIST;
        const col = lerpColor(a.color, b.color, 0.5);
        this.netGfx.moveTo(a.x, a.y).lineTo(b.x, b.y)
          .stroke({ color: col, alpha: t * t * 0.28, width: 0.5 + t * 0.7, cap: "round" });
      }
    }

    for (const d of this.netDots) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 1.2 + d.phase);
      const a  = d.alpha * tw;
      this.netGfx.circle(d.x, d.y, d.size * 3.2).fill({ color: d.color, alpha: a * 0.10 });
      this.netGfx.circle(d.x, d.y, d.size).fill({ color: d.color, alpha: Math.min(1, a) });
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private spawnParticles(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        x:            (Math.random() - 0.5) * hw * 2,
        y:            (Math.random() - 0.5) * hh * 2,
        vx:           (Math.random() - 0.5) * 20,
        vy:           (Math.random() - 0.5) * 20 - 5,
        size:         0.5 + Math.random() * 2.2,
        alpha:        0.12 + Math.random() * 0.45,
        color:        randomFrom(PALETTE),
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.6  + Math.random() * 2.2,
      });
    }
  }

  private drawParticles(dt: number): void {
    this.particleGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5, hh = this.h * 0.5;

    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x >  hw + 40) p.x = -hw - 40;
      if (p.x < -hw - 40) p.x =  hw + 40;
      if (p.y >  hh + 40) p.y = -hh - 40;
      if (p.y < -hh - 40) p.y =  hh + 40;

      p.twinklePhase += p.twinkleSpeed * dt;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(p.twinklePhase));
      const a  = p.alpha * tw;

      this.particleGfx.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: Math.min(1, a) });
      if (p.size > 1.2) {
        this.particleGfx.circle(p.x, p.y, p.size * 3.0).fill({ color: p.color, alpha: a * 0.14 });
      }
    }
  }

  // ── Floating symbols ──────────────────────────────────────────────────────

  private spawnSymbols(): void {
    for (let i = 0; i < SYM_COUNT; i++) {
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const size  = 36 + Math.floor(Math.random() * 40);
      const node  = new Text({
        text: SYMS[i % SYMS.length],
        style: new TextStyle({
          fontFamily: "'SymbolsNF', monospace",
          fontSize:   size,
          fill:       color,
          padding:    40,
          dropShadow: { color, blur: 16 + Math.random() * 14, distance: 0, alpha: 0.85, angle: 0 },
        }),
      });
      node.anchor.set(0.5);
      this.symbolCont.addChild(node);

      this.symbols.push({
        node,
        angle:       Math.random() * Math.PI * 2,
        orbitSpeed:  (Math.random() - 0.5) * 0.18,
        orbitR:      80 + Math.random() * 780,
        driftX:      0, driftY: 0,
        driftSpeedX: (Math.random() - 0.5) * 28,
        driftSpeedY: (Math.random() - 0.5) * 28,
        alphaBase:   0.30 + Math.random() * 0.45,
        alphaAmp:    0.15 + Math.random() * 0.25,
        alphaSpeed:  0.4  + Math.random() * 1.2,
        alphaPhase:  Math.random() * Math.PI * 2,
        scaleBase:   0.85 + Math.random() * 0.30,
        scaleAmp:    0.06 + Math.random() * 0.10,
        scaleSpeed:  0.6  + Math.random() * 1.8,
        scalePhase:  Math.random() * Math.PI * 2,
        spinSpeed:   (Math.random() - 0.5) * 0.6,
        wx: 0, wy: 0, color,
      });
    }
  }

  private updateSymbols(dt: number, breathe: number): void {
    const hw = this.w * 0.5, hh = this.h * 0.5;

    for (const s of this.symbols) {
      s.angle  += s.orbitSpeed * dt;
      s.driftX += s.driftSpeedX * dt;
      s.driftY += s.driftSpeedY * dt;

      const px = Math.cos(s.angle) * s.orbitR + s.driftX;
      const py = Math.sin(s.angle) * s.orbitR + s.driftY;
      if (Math.abs(px) > hw - 30) s.driftSpeedX *= -1;
      if (Math.abs(py) > hh - 30) s.driftSpeedY *= -1;

      s.wx = px; s.wy = py;
      s.node.x = px; s.node.y = py;

      s.alphaPhase += s.alphaSpeed * dt;
      s.node.alpha  = Math.min(1, Math.max(0.05,
        (s.alphaBase + s.alphaAmp * Math.sin(s.alphaPhase)) * breathe,
      ));

      s.scalePhase += s.scaleSpeed * dt;
      s.node.scale.set(s.scaleBase + s.scaleAmp * Math.sin(s.scalePhase));
      s.node.rotation += s.spinSpeed * dt;
    }
  }

  // ── Symbol connections ────────────────────────────────────────────────────

  private drawSymbolConnections(): void {
    this.connGfx.clear();
    const MAX_DIST = 260;

    for (let i = 0; i < this.symbols.length; i++) {
      const a = this.symbols[i];
      for (let j = i + 1; j < this.symbols.length; j++) {
        const b    = this.symbols[j];
        const dx   = b.wx - a.wx, dy = b.wy - a.wy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= MAX_DIST) continue;

        const t   = 1 - dist / MAX_DIST;
        const col = lerpColor(a.color, b.color, 0.5);
        const aw  = a.node.alpha * b.node.alpha;

        this.connGfx.moveTo(a.wx, a.wy).lineTo(b.wx, b.wy)
          .stroke({ color: col, alpha: t * t * aw * 0.12, width: 5,   cap: "round" });
        this.connGfx.moveTo(a.wx, a.wy).lineTo(b.wx, b.wy)
          .stroke({ color: col, alpha: t * t * aw * 0.40, width: 1.0, cap: "round" });
      }
    }
  }
}
