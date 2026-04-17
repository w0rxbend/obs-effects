import type { Ticker } from "pixi.js";
import { BlurFilter, Container, Graphics } from "pixi.js";

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const CATT_ROSEWATER = 0xf5e0dc;
const CATT_FLAMINGO  = 0xf2cdcd;
const CATT_PINK      = 0xf5c2e7;
const CATT_MAUVE     = 0xcba6f7;
const CATT_RED       = 0xf38ba8;
const CATT_MAROON    = 0xeba0ac;
const CATT_PEACH     = 0xfab387;
const CATT_YELLOW    = 0xf9e2af;
const CATT_GREEN     = 0xa6e3a1;
const CATT_TEAL      = 0x94e2d5;
const CATT_SKY       = 0x89dceb;
const CATT_SAPPHIRE  = 0x74c7ec;
const CATT_BLUE      = 0x89b4fa;
const CATT_LAVENDER  = 0xb4befe;
const CATT_TEXT      = 0xcdd6f4;

const PALETTE = [
  CATT_ROSEWATER, CATT_FLAMINGO, CATT_PINK, CATT_MAUVE, CATT_RED,
  CATT_MAROON, CATT_PEACH, CATT_YELLOW, CATT_GREEN, CATT_TEAL,
  CATT_SKY, CATT_SAPPHIRE, CATT_BLUE, CATT_LAVENDER,
] as const;

function palColor(idx: number): number { return PALETTE[Math.abs(Math.floor(idx)) % PALETTE.length]; }

// ── Geometry ──────────────────────────────────────────────────────────────────
const WEBCAM_R   = 210;
const BORDER_R   = WEBCAM_R + 5;
const BLOB_INNER = WEBCAM_R + 12;
const BLOB_OUTER = WEBCAM_R + 95;
const BORDER_N   = 72;
const BLOB_N     = 26;
const REST_L     = 2 * BORDER_R * Math.sin(Math.PI / BORDER_N);

// Orbit rings: [base radius, orb count, angular speed (rad/s), size range]
const ORBIT_RINGS: Array<{ r: number; count: number; speed: number; sMin: number; sMax: number }> = [
  { r: 248, count: 3, speed:  0.52, sMin: 7, sMax: 11 },
  { r: 312, count: 4, speed: -0.36, sMin: 5, sMax:  9 },
  { r: 372, count: 3, speed:  0.68, sMin: 4, sMax:  7 },
];
const TRAIL_LEN = 30;

// ── Types ─────────────────────────────────────────────────────────────────────
interface BorderNode {
  x: number; y: number;
  vx: number; vy: number;
  homeX: number; homeY: number;
  homeAngle: number;
}

interface Blob {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  color: number;
  nodeIdx: number | null;   // tether target in border nodes
  tetherRest: number;
  gfx: Graphics;
}

interface Shockwave {
  r: number;
  alpha: number;
  color: number;
}

interface Sparkle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  decay: number;
  color: number;
  size: number;
}

interface OrbitalOrb {
  angle: number;
  speed: number;
  orbitRBase: number;
  orbitR: number;
  colorIdx: number;
  size: number;
  phase: number;
  trail: Array<{ x: number; y: number }>;
  sparkles: Sparkle[];
  sparkleTimer: number;
  glowBoost: number;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export class TrapCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world:        Container;
  private readonly borderGfx:    Graphics;
  private readonly connectionGfx: Graphics;
  private readonly metaContainer: Container;
  private readonly shockGfx:      Graphics;
  private readonly orbGfx:        Graphics;

  private nodes:      BorderNode[]  = [];
  private blobs:      Blob[]        = [];
  private shockwaves: Shockwave[]   = [];
  private orbs:       OrbitalOrb[]  = [];

  private time         = 0;
  private beatTimer    = 0;
  private beatInterval = 145;
  private beatPhase    = 0;
  private beatColorIdx = 0;

  constructor() {
    super();

    this.world = new Container();
    this.addChild(this.world);

    // Shockwaves behind everything
    this.shockGfx = new Graphics();
    this.world.addChild(this.shockGfx);

    // Metaball blob layer — BlurFilter makes overlapping blobs meld together
    this.metaContainer = new Container();
    const blurFilter   = new BlurFilter({ strength: 22, quality: 5 });
    blurFilter.padding = 80;
    this.metaContainer.filters = [blurFilter];
    this.world.addChild(this.metaContainer);

    // Tether lines & border on top
    this.connectionGfx = new Graphics();
    this.borderGfx     = new Graphics();
    this.world.addChild(this.connectionGfx);
    this.world.addChild(this.borderGfx);

    // Orbital orbs rendered above everything
    this.orbGfx = new Graphics();
    this.world.addChild(this.orbGfx);

    this._initBorder();
    this._initBlobs();
    this._initOrbs();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _initBorder(): void {
    for (let i = 0; i < BORDER_N; i++) {
      const a  = (i / BORDER_N) * Math.PI * 2;
      const hx = Math.cos(a) * BORDER_R;
      const hy = Math.sin(a) * BORDER_R;
      this.nodes.push({ x: hx, y: hy, vx: 0, vy: 0, homeX: hx, homeY: hy, homeAngle: a });
    }
  }

  private _initOrbs(): void {
    let colorOffset = 0;
    for (const ring of ORBIT_RINGS) {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2 + Math.random() * 0.4;
        this.orbs.push({
          angle,
          speed:      ring.speed * (0.82 + Math.random() * 0.36),
          orbitRBase: ring.r,
          orbitR:     ring.r,
          colorIdx:   colorOffset,
          size:       ring.sMin + Math.random() * (ring.sMax - ring.sMin),
          phase:      Math.random() * Math.PI * 2,
          trail:      [],
          sparkles:   [],
          sparkleTimer: Math.random() * 18,
          glowBoost:  0,
        });
        colorOffset += 2;
      }
    }
  }

  private _initBlobs(): void {
    for (let i = 0; i < BLOB_N; i++) {
      const a    = (i / BLOB_N) * Math.PI * 2 + Math.random() * 0.4;
      const dist = BLOB_INNER + Math.random() * (BLOB_OUTER - BLOB_INNER);
      const gfx  = new Graphics();
      this.metaContainer.addChild(gfx);

      // First 10 blobs are spring-tethered to evenly-spaced border nodes
      const tethered = i < 10;
      const nodeIdx  = tethered
        ? Math.floor((i / 10) * BORDER_N)
        : null;

      this.blobs.push({
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius:     10 + Math.random() * 18,
        color:      PALETTE[i % PALETTE.length],
        nodeIdx,
        tetherRest: 18 + Math.random() * 35,
        gfx,
      });
    }
  }

  // ── Beat / Pulse ──────────────────────────────────────────────────────────

  private _triggerBeat(): void {
    this.beatPhase    = 1.0;
    this.beatColorIdx = Math.floor(Math.random() * PALETTE.length);

    // Outward push on all border nodes
    const mag = 9 + Math.random() * 7;
    for (const n of this.nodes) {
      const len = Math.sqrt(n.homeX * n.homeX + n.homeY * n.homeY) || 1;
      n.vx += (n.homeX / len) * mag * (0.6 + Math.random() * 0.8);
      n.vy += (n.homeY / len) * mag * (0.6 + Math.random() * 0.8);
    }

    // Kick blobs
    for (const b of this.blobs) {
      const d   = Math.sqrt(b.x * b.x + b.y * b.y) || 1;
      const mag2 = 2 + Math.random() * 4;
      b.vx += (b.x / d) * mag2 * (Math.random() > 0.5 ? 1 : -1);
      b.vy += (b.y / d) * mag2 * (Math.random() > 0.5 ? 1 : -1);
    }

    // Boost orb glow on beat
    for (const o of this.orbs) {
      o.glowBoost = Math.min(1, o.glowBoost + 0.55 + Math.random() * 0.45);
    }

    // Spawn expanding shockwave ring
    this.shockwaves.push({
      r:     BORDER_R,
      alpha: 0.65,
      color: palColor(this.beatColorIdx),
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    const dt = ticker.deltaTime;
    this.time += dt * 0.016;

    this.beatTimer -= dt;
    if (this.beatTimer <= 0) {
      this.beatTimer = this.beatInterval * (0.75 + Math.random() * 0.5);
      this._triggerBeat();
    }
    this.beatPhase = Math.max(0, this.beatPhase - dt * 0.04);

    this._updateBorder(dt);
    this._updateBlobs(dt);
    this._updateOrbs(dt);
    this._drawShockwaves(dt);
    this._drawBorder();
    this._drawConnections();
    this._drawOrbs();
  }

  private _updateBorder(dt: number): void {
    const homeK     = 0.042;
    const neighborK = 0.13;
    const damping   = 0.86;
    const dts       = dt * 0.5;

    for (let i = 0; i < BORDER_N; i++) {
      const n    = this.nodes[i];
      const prev = this.nodes[(i - 1 + BORDER_N) % BORDER_N];
      const next = this.nodes[(i + 1) % BORDER_N];

      // Home radial spring
      n.vx += (n.homeX - n.x) * homeK;
      n.vy += (n.homeY - n.y) * homeK;

      // Neighbor arc springs
      for (const nb of [prev, next]) {
        const dx   = nb.x - n.x;
        const dy   = nb.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const err  = dist - REST_L;
        n.vx += (dx / dist) * err * neighborK;
        n.vy += (dy / dist) * err * neighborK;
      }

      // Breathing sine wave (Trap Nation style pulsing stroke position)
      const breath = Math.sin(this.time * 2.4 + n.homeAngle * 4) * 0.10;
      n.vx += -Math.sin(n.homeAngle) * breath;
      n.vy +=  Math.cos(n.homeAngle) * breath;

      // Low-level turbulence
      n.vx += (Math.random() - 0.5) * 0.18;
      n.vy += (Math.random() - 0.5) * 0.18;

      n.vx *= damping; n.vy *= damping;
      n.x  += n.vx * dts;
      n.y  += n.vy * dts;
    }
  }

  private _updateBlobs(dt: number): void {
    const damping   = 0.91;
    const dts       = dt * 0.5;
    const orbitR    = BLOB_INNER + (BLOB_OUTER - BLOB_INNER) * 0.5;

    for (let i = 0; i < BLOB_N; i++) {
      const b    = this.blobs[i];
      const dist = Math.sqrt(b.x * b.x + b.y * b.y) || 0.001;

      // Soft orbit ring attraction — keeps blobs in the donut zone
      const orbitErr = dist - orbitR;
      b.vx -= (b.x / dist) * orbitErr * 0.0018;
      b.vy -= (b.y / dist) * orbitErr * 0.0018;

      // Tether spring to a fixed border node
      if (b.nodeIdx !== null) {
        const n    = this.nodes[b.nodeIdx];
        const tdx  = n.x - b.x;
        const tdy  = n.y - b.y;
        const td   = Math.sqrt(tdx * tdx + tdy * tdy) || 0.001;
        const terr = td - b.tetherRest;
        b.vx += (tdx / td) * terr * 0.028;
        b.vy += (tdy / td) * terr * 0.028;
      }

      // Blob–blob soft repulsion
      for (let j = i + 1; j < BLOB_N; j++) {
        const b2   = this.blobs[j];
        const dx   = b.x - b2.x;
        const dy   = b.y - b2.y;
        const d    = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minD = b.radius + b2.radius + 8;
        if (d < minD) {
          const push = ((minD - d) / minD) * 0.38;
          b.vx  += (dx / d) * push;
          b.vy  += (dy / d) * push;
          b2.vx -= (dx / d) * push;
          b2.vy -= (dy / d) * push;
        }
      }

      // Gentle random walk
      b.vx += (Math.random() - 0.5) * 0.14;
      b.vy += (Math.random() - 0.5) * 0.14;

      b.vx *= damping; b.vy *= damping;
      b.x  += b.vx * dts;
      b.y  += b.vy * dts;

      // Draw blob — solid filled circles; BlurFilter on the container
      // creates the metaball merging effect where blobs overlap
      const g = b.gfx;
      g.clear();
      g.circle(b.x, b.y, b.radius * 2.2);
      g.fill({ color: b.color, alpha: 0.18 });
      g.circle(b.x, b.y, b.radius * 1.4);
      g.fill({ color: b.color, alpha: 0.38 });
      g.circle(b.x, b.y, b.radius);
      g.fill({ color: b.color, alpha: 0.80 });
    }
  }

  private _updateOrbs(dt: number): void {
    for (const orb of this.orbs) {
      // Advance angle
      orb.angle += orb.speed * dt * 0.016;

      // Breathe orbit radius
      orb.orbitR = orb.orbitRBase + Math.sin(this.time * 1.6 + orb.phase) * 9;

      const cx = Math.cos(orb.angle) * orb.orbitR;
      const cy = Math.sin(orb.angle) * orb.orbitR;

      // Record trail
      orb.trail.unshift({ x: cx, y: cy });
      if (orb.trail.length > TRAIL_LEN) orb.trail.pop();

      // Sparkle spawning
      orb.sparkleTimer -= dt;
      if (orb.sparkleTimer <= 0) {
        orb.sparkleTimer = 7 + Math.random() * 14;
        if (orb.sparkles.length < 28) {
          for (let s = 0; s < 2; s++) {
            const sa  = Math.random() * Math.PI * 2;
            const spd = 0.4 + Math.random() * 1.6;
            orb.sparkles.push({
              x: cx, y: cy,
              vx: Math.cos(sa) * spd,
              vy: Math.sin(sa) * spd,
              life:  1,
              decay: 0.018 + Math.random() * 0.028,
              color: palColor(orb.colorIdx + Math.floor(Math.random() * 3)),
              size:  1.2 + Math.random() * 2.6,
            });
          }
        }
      }

      // Advance sparkles
      for (let i = orb.sparkles.length - 1; i >= 0; i--) {
        const sp = orb.sparkles[i];
        sp.x    += sp.vx * dt * 0.5;
        sp.y    += sp.vy * dt * 0.5;
        sp.life -= sp.decay * dt;
        if (sp.life <= 0) orb.sparkles.splice(i, 1);
      }

      // Fade glow boost
      orb.glowBoost = Math.max(0, orb.glowBoost - dt * 0.032);
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  private _drawOrbs(): void {
    const g = this.orbGfx;
    g.clear();

    for (const orb of this.orbs) {
      if (orb.trail.length === 0) continue;

      const cx    = orb.trail[0].x;
      const cy    = orb.trail[0].y;
      const col   = palColor(orb.colorIdx + Math.floor(this.time * 0.28));
      const boost = orb.glowBoost;
      const sz    = orb.size * (1 + Math.sin(this.time * 2.1 + orb.phase) * 0.18);

      // Fading trail
      for (let i = 1; i < orb.trail.length; i++) {
        const t  = orb.trail[i];
        const p  = 1 - i / orb.trail.length;   // 1 near head → 0 at tail
        const tr = sz * p * 1.3;
        if (tr < 0.4) continue;
        g.circle(t.x, t.y, tr);
        g.fill({ color: col, alpha: p * 0.38 });
      }

      // Wide outer glow — expands on beat
      g.circle(cx, cy, sz * 4.0 + boost * 14);
      g.fill({ color: col, alpha: 0.04 + boost * 0.10 });

      // Mid glow ring
      g.circle(cx, cy, sz * 2.4 + boost * 7);
      g.fill({ color: col, alpha: 0.14 + boost * 0.18 });

      // Inner corona
      g.circle(cx, cy, sz * 1.3 + boost * 2);
      g.fill({ color: col, alpha: 0.65 + boost * 0.28 });

      // Bright white core
      g.circle(cx, cy, sz * 0.45);
      g.fill({ color: 0xffffff, alpha: 0.90 });

      // Sparkle particles
      for (const sp of orb.sparkles) {
        const a  = sp.life * 0.88;
        const sr = sp.size * sp.life;
        g.circle(sp.x, sp.y, sr);
        g.fill({ color: sp.color, alpha: a });
        if (sr > 0.8) {
          g.circle(sp.x, sp.y, sr * 0.38);
          g.fill({ color: 0xffffff, alpha: a * 0.65 });
        }
      }
    }
  }

  private _drawShockwaves(dt: number): void {
    const g = this.shockGfx;
    g.clear();

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.r    += dt * 2.8;
      sw.alpha = Math.max(0, sw.alpha - dt * 0.025);

      if (sw.alpha <= 0) { this.shockwaves.splice(i, 1); continue; }

      // Outer halo
      g.circle(0, 0, sw.r + 6);
      g.stroke({ color: sw.color, width: 14, alpha: sw.alpha * 0.12 });
      // Core ring
      g.circle(0, 0, sw.r);
      g.stroke({ color: sw.color, width: 2.5, alpha: sw.alpha * 0.70 });
    }
  }

  private _drawBorder(): void {
    const g     = this.borderGfx;
    const N     = BORDER_N;
    const beat  = this.beatPhase;
    const col   = palColor(this.beatColorIdx + Math.floor(this.time * 0.35));
    g.clear();

    // Outer glow — swells on beat
    g.moveTo(this.nodes[0].x, this.nodes[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(this.nodes[i % N].x, this.nodes[i % N].y);
    g.stroke({ color: col, width: 18 + beat * 12, alpha: 0.07 + beat * 0.08 });

    // Mid halo
    g.moveTo(this.nodes[0].x, this.nodes[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(this.nodes[i % N].x, this.nodes[i % N].y);
    g.stroke({ color: col, width: 5 + beat * 4, alpha: 0.22 + beat * 0.15 });

    // Core border line
    g.moveTo(this.nodes[0].x, this.nodes[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(this.nodes[i % N].x, this.nodes[i % N].y);
    g.stroke({ color: CATT_TEXT, width: 2.5 + beat * 2, alpha: 0.88 });

    // Inner accent ring
    g.circle(0, 0, WEBCAM_R - 2);
    g.stroke({ color: col, width: 1.5, alpha: 0.25 + beat * 0.20 });
  }

  private _drawConnections(): void {
    const g = this.connectionGfx;
    g.clear();

    for (const b of this.blobs) {
      if (b.nodeIdx === null) continue;
      const n  = this.nodes[b.nodeIdx];
      const dx = n.x - b.x;
      const dy = n.y - b.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d > 140) continue;

      const alpha = (1 - d / 140) * 0.30;
      g.moveTo(b.x, b.y);
      g.lineTo(n.x, n.y);
      g.stroke({ color: b.color, width: 1, alpha });
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  public resize(width: number, height: number): void {
    this.world.x = width  * 0.5;
    this.world.y = height * 0.5;
  }
}
