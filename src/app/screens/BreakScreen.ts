import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { mixHex as lerpColor } from "../../lib/color";

// ── Palette ───────────────────────────────────────────────────────────────────
const TOXIC_GREEN = 0x39ff14;
const CATT_GREEN = 0xa6e3a1;
const CATT_TEAL = 0x94e2d5;
const CATT_SKY = 0x89dceb;
const CATT_BLUE = 0x89b4fa;
const CATT_YELLOW = 0xf9e2af;
const CATT_PEACH = 0xfab387;
const WHITE = 0xffffff;

const PALETTE = [
  TOXIC_GREEN,
  CATT_GREEN,
  CATT_TEAL,
  CATT_SKY,
  CATT_BLUE,
  CATT_YELLOW,
  CATT_PEACH,
  WHITE,
] as const;

// ── Nerd Font symbols ─────────────────────────────────────────────────────────
const SYMS = [
  "\uF0F4",
  "\uF17B",
  "\uF120",
  "\uF11B",
  "\uF001",
  "\uF1FC",
  "\uF135",
  "\uF0EB",
  "\uF017",
  "\uF108",
  "\uF10C",
  "\uF075",
  "\uF086",
  "\uF0C0",
  "\uF007",
  "\uF236",
  "\uF013",
  "\uF09B",
  "\uF0F3",
  "\uF0E7",
  "\uF185",
  "\uF186",
  "\uF0C2",
  "\uF0F4",
  "\uF11B",
  "\uF001",
  "\uF236",
  "\uF017",
] as const;

// ── Text phrases ───────────────────────────────────────────────────────────────
const PHRASES = [
  "BRB",
  "AFK",
  "BE RIGHT BACK",
  "LOADING...",
  "RESPAWNING",
  "PLEASE WAIT",
  "STAND BY",
  "ONE MOMENT",
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
  "GRASS NOT FOUND",
  "UNLOCKING OUTSIDE",
  "FRESH AIR SPEEDRUN",
  "SOCIAL INTERACTION",
  "SUNLIGHT DETECTED",
  "ACHIEVEMENT: MOVED",
] as const;

// ── Font pool ─────────────────────────────────────────────────────────────────
const FONTS = [
  {
    family: "'Rock Salt', cursive",
    size: 72,
    strokeMult: 0.14,
    weight: "normal",
  },
  {
    family: "'Bangers', cursive",
    size: 110,
    strokeMult: 0.05,
    weight: "normal",
  },
  {
    family: "'Silkscreen', monospace",
    size: 68,
    strokeMult: 0.1,
    weight: "normal",
  },
  {
    family: "'Silkscreen', monospace",
    size: 52,
    strokeMult: 0.1,
    weight: "700",
  },
] as const;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface BgLine {
  angle: number;
  offset: number;
  drift: number;
  color: number;
  alpha: number;
  width: number;
}

interface NetDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  phase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface FloatingSymbol {
  node: Text;
  angle: number;
  orbitSpeed: number;
  orbitR: number;
  driftX: number;
  driftY: number;
  driftSpeedX: number;
  driftSpeedY: number;
  alphaBase: number;
  alphaAmp: number;
  alphaSpeed: number;
  alphaPhase: number;
  scaleBase: number;
  scaleAmp: number;
  scaleSpeed: number;
  scalePhase: number;
  spinSpeed: number;
  wx: number;
  wy: number;
  color: number;
}

interface CenterTextSlot {
  node: Text;
  alpha: number;
}

type CenterTextState = "show" | "fade_out" | "fade_in";

// ── Constants ─────────────────────────────────────────────────────────────────
const NET_DOT_COUNT = 55;
const NET_MAX_DIST = 200;
const PARTICLE_COUNT = 180;
const SYM_COUNT = 48;
const BG_LINE_COUNT = 18;
const FADE_DURATION = 0.7;
const SHOW_DURATION_MIN = 3.5;
const SHOW_DURATION_MAX = 6.5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhrase(): string {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

function randomShowDuration(): number {
  return (
    SHOW_DURATION_MIN + Math.random() * (SHOW_DURATION_MAX - SHOW_DURATION_MIN)
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class BreakScreen extends Container {
  public static assetBundles = ["main"];

  // ── Layers ─────────────────────────────────────────────────────────────────
  private readonly bgGfx = new Graphics();
  private readonly bgLinesGfx = new Graphics();
  private readonly netGfx = new Graphics();
  private readonly particleGfx = new Graphics();
  private readonly connGfx = new Graphics();
  private readonly symbolCont = new Container();
  private readonly centerTextCont = new Container();

  private readonly bgLines: BgLine[] = [];
  private readonly netDots: NetDot[] = [];
  private readonly particles: Particle[] = [];
  private readonly symbols: FloatingSymbol[] = [];

  // ── Center text state ──────────────────────────────────────────────────────
  private readonly slot: CenterTextSlot[] = [];
  private activeSlot = 0;
  private centerState: CenterTextState = "show";
  private centerTimer = 0;
  private showDuration = SHOW_DURATION_MIN;
  private fadeTimer = 0;

  private time = 0;
  private w = 0;
  private h = 0;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.bgLinesGfx);
    this.addChild(this.netGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.connGfx);
    this.addChild(this.symbolCont);
    this.addChild(this.centerTextCont);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.spawnBgLines();
    this.spawnSymbols();
    this.spawnNetDots();
    this.spawnParticles();
    this.spawnCenterText();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    const breathe = 1 + 0.03 * Math.sin(this.time * 0.55);

    this.drawBackground(breathe);
    this.drawBgLines(dt);
    this.drawNetwork(dt);
    this.drawParticles(dt);
    this.updateSymbols(dt, breathe);
    this.drawSymbolConnections();
    this.updateCenterText(dt);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width * 0.5;
    this.y = height * 0.5;
  }

  // ── Background radial haze ────────────────────────────────────────────────

  private drawBackground(breathe: number): void {
    this.bgGfx.clear();
    const r = Math.max(this.w, this.h) * 0.5;

    this.bgGfx
      .circle(0, 0, r * 2.0 * breathe)
      .fill({ color: CATT_TEAL, alpha: 0.018 });
    this.bgGfx
      .circle(0, 0, r * 1.4 * breathe)
      .fill({ color: TOXIC_GREEN, alpha: 0.028 });
    this.bgGfx
      .circle(0, 0, r * 0.9 * breathe)
      .fill({ color: CATT_GREEN, alpha: 0.038 });
    this.bgGfx
      .circle(0, 0, r * 0.5 * breathe)
      .fill({ color: CATT_GREEN, alpha: 0.048 });
    this.bgGfx
      .circle(0, 0, r * 0.22 * breathe)
      .fill({ color: WHITE, alpha: 0.012 });
  }

  // ── Background diagonal lines ─────────────────────────────────────────────

  private spawnBgLines(): void {
    for (let i = 0; i < BG_LINE_COUNT; i++) {
      this.bgLines.push({
        angle: Math.random() * Math.PI,
        offset: (Math.random() - 0.5) * 1200,
        drift: (Math.random() - 0.5) * 18,
        color: randomFrom(PALETTE),
        alpha: 0.04 + Math.random() * 0.1,
        width: 0.5 + Math.random() * 2.0,
      });
    }
  }

  private drawBgLines(dt: number): void {
    this.bgLinesGfx.clear();
    if (this.w === 0) return;

    const diag = Math.sqrt(this.w * this.w + this.h * this.h) * 0.5 + 40;

    for (const l of this.bgLines) {
      l.offset += l.drift * dt;
      if (Math.abs(l.offset) > diag * 1.2) l.drift *= -1;

      const nx = -Math.sin(l.angle);
      const ny = Math.cos(l.angle);
      const cx = nx * l.offset;
      const cy = ny * l.offset;
      const dx = Math.cos(l.angle);
      const dy = Math.sin(l.angle);

      const x1 = cx - dx * diag,
        y1 = cy - dy * diag;
      const x2 = cx + dx * diag,
        y2 = cy + dy * diag;

      this.bgLinesGfx
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({
          color: l.color,
          alpha: l.alpha * 0.35,
          width: l.width * 6,
          cap: "butt",
        });
      this.bgLinesGfx.moveTo(x1, y1).lineTo(x2, y2).stroke({
        color: l.color,
        alpha: l.alpha,
        width: l.width,
        cap: "butt",
      });
    }
  }

  // ── Centered text with fade transitions ───────────────────────────────────

  private makeTextNode(phrase: string, color: number, fontIdx: number): Text {
    const f = FONTS[fontIdx % FONTS.length];
    return new Text({
      text: phrase,
      style: new TextStyle({
        fontFamily: f.family,
        fontWeight: f.weight as import("pixi.js").TextStyleFontWeight,
        fontSize: f.size,
        fill: color,
        stroke: { color: 0x000000, width: Math.max(3, f.size * f.strokeMult) },
        align: "center",
        padding: 48,
        dropShadow: { color, blur: 28, distance: 0, alpha: 0.9, angle: 0 },
      }),
    });
  }

  private spawnCenterText(): void {
    for (let i = 0; i < 2; i++) {
      const node = this.makeTextNode(randomPhrase(), randomFrom(PALETTE), i);
      node.anchor.set(0.5);
      node.alpha = i === 0 ? 1 : 0;
      this.centerTextCont.addChild(node);
      this.slot.push({ node, alpha: node.alpha });
    }
    this.showDuration = randomShowDuration();
    this.centerState = "show";
    this.centerTimer = 0;
  }

  private applyNewPhrase(slotIdx: number): void {
    const s = this.slot[slotIdx];
    const node = this.makeTextNode(
      randomPhrase(),
      randomFrom(PALETTE),
      Math.floor(Math.random() * FONTS.length),
    );
    node.anchor.set(0.5);
    node.alpha = 0;
    s.node.destroy();
    this.centerTextCont.addChild(node);
    s.node = node;
    s.alpha = 0;
  }

  private updateCenterText(dt: number): void {
    switch (this.centerState) {
      case "show": {
        this.centerTimer += dt;
        if (this.centerTimer >= this.showDuration) {
          this.centerState = "fade_out";
          this.fadeTimer = 0;
        }
        break;
      }
      case "fade_out": {
        this.fadeTimer += dt;
        const t = Math.min(1, this.fadeTimer / FADE_DURATION);
        this.slot[this.activeSlot].alpha = 1 - easeInOutCubic(t);
        this.slot[this.activeSlot].node.alpha =
          this.slot[this.activeSlot].alpha;
        if (t >= 1) {
          const next = 1 - this.activeSlot;
          this.applyNewPhrase(next);
          this.centerState = "fade_in";
          this.fadeTimer = 0;
        }
        break;
      }
      case "fade_in": {
        this.fadeTimer += dt;
        const t = Math.min(1, this.fadeTimer / FADE_DURATION);
        const next = 1 - this.activeSlot;
        this.slot[next].alpha = easeInOutCubic(t);
        this.slot[next].node.alpha = this.slot[next].alpha;
        if (t >= 1) {
          this.slot[this.activeSlot].node.alpha = 0;
          this.activeSlot = next;
          this.centerState = "show";
          this.centerTimer = 0;
          this.showDuration = randomShowDuration();
        }
        break;
      }
    }

    const active = this.slot[this.activeSlot];
    active.node.scale.set(1 + 0.03 * Math.sin(this.time * 1.1));
  }

  // ── Network dots ──────────────────────────────────────────────────────────

  private spawnNetDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < NET_DOT_COUNT; i++) {
      this.netDots.push({
        x: (Math.random() - 0.5) * hw * 1.8,
        y: (Math.random() - 0.5) * hh * 1.8,
        vx: (Math.random() - 0.5) * 22,
        vy: (Math.random() - 0.5) * 22,
        size: 1.0 + Math.random() * 2.2,
        color: randomFrom(PALETTE),
        alpha: 0.2 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private drawNetwork(dt: number): void {
    this.netGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    const drag = 0.98;

    for (const d of this.netDots) {
      d.vx *= drag;
      d.vy *= drag;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x > hw - 8) {
        d.x = hw - 8;
        d.vx *= -0.8;
      }
      if (d.x < -hw + 8) {
        d.x = -hw + 8;
        d.vx *= -0.8;
      }
      if (d.y > hh - 8) {
        d.y = hh - 8;
        d.vy *= -0.8;
      }
      if (d.y < -hh + 8) {
        d.y = -hh + 8;
        d.vy *= -0.8;
      }
    }

    for (let i = 0; i < this.netDots.length; i++) {
      const a = this.netDots[i];
      for (let j = i + 1; j < this.netDots.length; j++) {
        const b = this.netDots[j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= NET_MAX_DIST) continue;
        const t = 1 - dist / NET_MAX_DIST;
        const col = lerpColor(a.color, b.color, 0.5);
        this.netGfx
          .moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({
            color: col,
            alpha: t * t * 0.28,
            width: 0.5 + t * 0.7,
            cap: "round",
          });
      }
    }

    for (const d of this.netDots) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 1.2 + d.phase);
      const a = d.alpha * tw;
      this.netGfx
        .circle(d.x, d.y, d.size * 3.2)
        .fill({ color: d.color, alpha: a * 0.1 });
      this.netGfx
        .circle(d.x, d.y, d.size)
        .fill({ color: d.color, alpha: Math.min(1, a) });
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private spawnParticles(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * hw * 2,
        y: (Math.random() - 0.5) * hh * 2,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20 - 5,
        size: 0.5 + Math.random() * 2.2,
        alpha: 0.12 + Math.random() * 0.45,
        color: randomFrom(PALETTE),
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.6 + Math.random() * 2.2,
      });
    }
  }

  private drawParticles(dt: number): void {
    this.particleGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x > hw + 40) p.x = -hw - 40;
      if (p.x < -hw - 40) p.x = hw + 40;
      if (p.y > hh + 40) p.y = -hh - 40;
      if (p.y < -hh - 40) p.y = hh + 40;

      p.twinklePhase += p.twinkleSpeed * dt;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(p.twinklePhase));
      const a = p.alpha * tw;

      this.particleGfx
        .circle(p.x, p.y, p.size)
        .fill({ color: p.color, alpha: Math.min(1, a) });
      if (p.size > 1.2) {
        this.particleGfx
          .circle(p.x, p.y, p.size * 3.0)
          .fill({ color: p.color, alpha: a * 0.14 });
      }
    }
  }

  // ── Floating symbols ──────────────────────────────────────────────────────

  private spawnSymbols(): void {
    for (let i = 0; i < SYM_COUNT; i++) {
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const size = 36 + Math.floor(Math.random() * 40);
      const node = new Text({
        text: SYMS[i % SYMS.length],
        style: new TextStyle({
          fontFamily: "'SymbolsNF', monospace",
          fontSize: size,
          fill: color,
          padding: 40,
          dropShadow: {
            color,
            blur: 16 + Math.random() * 14,
            distance: 0,
            alpha: 0.85,
            angle: 0,
          },
        }),
      });
      node.anchor.set(0.5);
      this.symbolCont.addChild(node);

      this.symbols.push({
        node,
        angle: Math.random() * Math.PI * 2,
        orbitSpeed: (Math.random() - 0.5) * 0.18,
        orbitR: 80 + Math.random() * 780,
        driftX: 0,
        driftY: 0,
        driftSpeedX: (Math.random() - 0.5) * 28,
        driftSpeedY: (Math.random() - 0.5) * 28,
        alphaBase: 0.3 + Math.random() * 0.45,
        alphaAmp: 0.15 + Math.random() * 0.25,
        alphaSpeed: 0.4 + Math.random() * 1.2,
        alphaPhase: Math.random() * Math.PI * 2,
        scaleBase: 0.85 + Math.random() * 0.3,
        scaleAmp: 0.06 + Math.random() * 0.1,
        scaleSpeed: 0.6 + Math.random() * 1.8,
        scalePhase: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 0.6,
        wx: 0,
        wy: 0,
        color,
      });
    }
  }

  private updateSymbols(dt: number, breathe: number): void {
    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    for (const s of this.symbols) {
      s.angle += s.orbitSpeed * dt;
      s.driftX += s.driftSpeedX * dt;
      s.driftY += s.driftSpeedY * dt;

      const px = Math.cos(s.angle) * s.orbitR + s.driftX;
      const py = Math.sin(s.angle) * s.orbitR + s.driftY;
      if (Math.abs(px) > hw - 30) s.driftSpeedX *= -1;
      if (Math.abs(py) > hh - 30) s.driftSpeedY *= -1;

      s.wx = px;
      s.wy = py;
      s.node.x = px;
      s.node.y = py;

      s.alphaPhase += s.alphaSpeed * dt;
      s.node.alpha = Math.min(
        1,
        Math.max(
          0.05,
          (s.alphaBase + s.alphaAmp * Math.sin(s.alphaPhase)) * breathe,
        ),
      );

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
        const b = this.symbols[j];
        const dx = b.wx - a.wx,
          dy = b.wy - a.wy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= MAX_DIST) continue;

        const t = 1 - dist / MAX_DIST;
        const col = lerpColor(a.color, b.color, 0.5);
        const aw = a.node.alpha * b.node.alpha;

        this.connGfx
          .moveTo(a.wx, a.wy)
          .lineTo(b.wx, b.wy)
          .stroke({
            color: col,
            alpha: t * t * aw * 0.12,
            width: 5,
            cap: "round",
          });
        this.connGfx
          .moveTo(a.wx, a.wy)
          .lineTo(b.wx, b.wy)
          .stroke({
            color: col,
            alpha: t * t * aw * 0.4,
            width: 1.0,
            cap: "round",
          });
      }
    }
  }
}
