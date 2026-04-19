import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const BG = 0x11111b;

// Grid dimensions
const COLS           = 32;
const ROWS           = 22;
const CELL_W         = 52;     // rest spacing (px)
const CELL_H         = 44;
const CONSTRAINT_IT  = 6;      // constraint solver iterations

// Forces
const GRAVITY_Y  = 18;    // px/s²
const WIND_AMP   = 55;    // turbulent wind amplitude

// Damping (Verlet inherent, but we add a little)
const DAMPING    = 0.998;

// Anchored nodes: all four corners are fixed
const ANCHOR_CORNERS = true;

interface Node {
  x: number; y: number;
  px: number; py: number; // previous position
  fixed: boolean;
}

interface Spring {
  a: number; b: number;   // node indices
  rest: number;
}

export class VerletClothScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();
  private w = 1920;
  private h = 1080;
  private time = 0;

  private nodes: Node[]    = [];
  private springs: Spring[] = [];

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.w = window.innerWidth  || 1920;
    this.h = window.innerHeight || 1080;
    this.init();
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void { this.w = w; this.h = h; this.init(); }

  private idx(c: number, r: number): number { return r * COLS + c; }

  private init(): void {
    // Place grid centred on screen
    const startX = (this.w - (COLS - 1) * CELL_W) / 2;
    const startY = (this.h - (ROWS - 1) * CELL_H) / 2;

    this.nodes   = [];
    this.springs = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x      = startX + c * CELL_W;
        const y      = startY + r * CELL_H;
        const corner = ANCHOR_CORNERS && (
          (c === 0 && r === 0) || (c === COLS - 1 && r === 0) ||
          (c === 0 && r === ROWS - 1) || (c === COLS - 1 && r === ROWS - 1)
        );
        this.nodes.push({ x, y, px: x, py: y, fixed: corner });
      }
    }

    const addSpring = (ai: number, bi: number): void => {
      const a = this.nodes[ai];
      const b = this.nodes[bi];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.springs.push({ a: ai, b: bi, rest: d });
    };

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS) addSpring(this.idx(c, r), this.idx(c + 1, r));      // H
        if (r + 1 < ROWS) addSpring(this.idx(c, r), this.idx(c, r + 1));      // V
        if (c + 1 < COLS && r + 1 < ROWS) {
          addSpring(this.idx(c, r), this.idx(c + 1, r + 1));                  // D1
          addSpring(this.idx(c + 1, r), this.idx(c, r + 1));                  // D2
        }
      }
    }
  }

  public update(ticker: Ticker): void {
    const dt   = Math.min(ticker.deltaMS * 0.001, 0.033);
    this.time += dt;

    // Verlet integrate
    for (const n of this.nodes) {
      if (n.fixed) continue;

      // Turbulent wind: two sine waves out of phase
      const wx = WIND_AMP * Math.sin(n.x * 0.006 + this.time * 0.55)
               * Math.cos(n.y * 0.005 + this.time * 0.38);
      const wy = WIND_AMP * Math.cos(n.x * 0.007 - this.time * 0.42)
               * Math.sin(n.y * 0.006 + this.time * 0.60);

      const ax = wx;
      const ay = GRAVITY_Y + wy;

      const nx = n.x + (n.x - n.px) * DAMPING + ax * dt * dt;
      const ny = n.y + (n.y - n.py) * DAMPING + ay * dt * dt;
      n.px = n.x;
      n.py = n.y;
      n.x  = nx;
      n.y  = ny;
    }

    // Constraint satisfaction
    for (let it = 0; it < CONSTRAINT_IT; it++) {
      for (const sp of this.springs) {
        const a  = this.nodes[sp.a];
        const b  = this.nodes[sp.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.0001) continue;
        const diff = (d - sp.rest) / d * 0.5;
        const cx   = dx * diff;
        const cy2  = dy * diff;
        if (!a.fixed) { a.x += cx; a.y += cy2; }
        if (!b.fixed) { b.x -= cx; b.y -= cy2; }
      }
    }

    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    g.rect(0, 0, this.w, this.h).fill({ color: BG });

    // Draw horizontal + vertical structural springs as glowing filaments
    for (const sp of this.springs) {
      const a   = this.nodes[sp.a];
      const b   = this.nodes[sp.b];
      const dx  = b.x - a.x;
      const dy  = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      // Stretch ratio → color: relaxed=teal, stretched=cyan/white, compressed=blue
      const stretch = (len - sp.rest) / sp.rest; // + = stretched, - = compressed
      const tStr    = Math.min(Math.abs(stretch) * 4, 1);

      // Color: teal (0x94e2d5) → cyan (0x89dceb) → white on high stretch
      const r  = Math.round(148 + (255 - 148) * tStr * tStr);
      const gr = Math.round(226 + (255 - 226) * tStr);
      const b2 = Math.round(213 + (255 - 213) * tStr);
      const color = (r << 16) | (gr << 8) | b2;

      // Row/col springs are more opaque, diagonals faint
      const diagonal = Math.abs(sp.rest - Math.max(CELL_W, CELL_H)) > 5;
      const baseAlpha = diagonal ? 0.06 : 0.3;
      const alpha = baseAlpha + tStr * 0.25;

      if (!diagonal) {
        // Glow
        g.moveTo(a.x, a.y).lineTo(b.x, b.y)
          .stroke({ width: 5, color, alpha: alpha * 0.08 });
      }
      // Core line
      g.moveTo(a.x, a.y).lineTo(b.x, b.y)
        .stroke({ width: diagonal ? 0.4 : 0.9, color, alpha });
    }

    // Corner anchors
    for (const n of this.nodes) {
      if (!n.fixed) continue;
      g.circle(n.x, n.y, 4).fill({ color: 0xcba6f7, alpha: 0.7 });
    }
  }
}
