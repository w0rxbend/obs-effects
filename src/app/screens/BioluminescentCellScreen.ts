import type { Ticker } from "pixi.js";
import { BlurFilter, Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;
const MEMBRANE_N = 96;
const NUCLEUS_N = 32;
const PARTICLE_N = 50;
const MITO_N = 4;
const RIBO_N = 10;

const C_CYAN = 0xa8ffef;
const C_GLOW = 0x00ffe5;
const C_HALO = 0x7df9ff;
const C_NUCLEUS_FILL = 0xa064ff;
const C_NUCLEUS_STROKE = 0xc8a0ff;
const C_NUCLEOLUS = 0xe8d0ff;
const C_MITO_FILL = 0xff9a3c;
const C_MITO_STROKE = 0xffb347;
const C_MITO_CRISTAE = 0xffb450;
const C_RIBO = 0xffe080;
const PARTICLE_COLORS = [0x00ffc8, 0x80ffea, 0xffffff, 0xb8fff0];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Layered sine displacement for organic membrane deformation.
// Low-frequency terms drive large lobes; high-frequency terms add surface quiver.
function membraneDisp(angle: number, t: number): number {
  return (
    Math.sin(angle * 2 - t * 0.4) * 28 +
    Math.cos(angle * 3 + t * 0.31) * 18 +
    Math.sin(angle * 1 - t * 0.16) * 22 +
    Math.cos(angle * 5 + t * 0.25) * 10 +
    Math.sin(angle * 4 - t * 0.19) * 7 +
    Math.cos(angle * 7 + t * 0.44) * 4 +
    Math.sin(angle * 9 - t * 0.55) * 2.5 +
    Math.cos(angle * 11 + t * 0.38) * 1.5
  );
}

function nucleusDisp(angle: number, t: number): number {
  return (
    Math.sin(angle * 2 - t * 0.12) * 11 +
    Math.cos(angle * 3 + t * 0.09) * 7 +
    Math.sin(angle * 1 - t * 0.06) * 8 +
    Math.cos(angle * 4 + t * 0.07) * 4
  );
}

interface Particle {
  x: number;
  y: number;
  phase: number;
  speed: number;
  r: number;
  alpha: number;
  color: number;
}

interface Ribosome {
  x: number;
  y: number;
  phase: number;
  r: number;
  alpha: number;
}

interface Mito {
  container: Container;
  x: number;
  y: number;
  rotation: number;
  rotSpeed: number;
  phase: number;
}

export class BioluminescentCellScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly haloContainer = new Container();
  private readonly haloGfx = new Graphics();
  private readonly fillGfx = new Graphics();
  private readonly particleContainer = new Container();
  private readonly particleGfx = new Graphics();
  private readonly ribosomeGfx = new Graphics();
  private readonly mitoContainer = new Container();
  private readonly nucleusGfx = new Graphics();
  private readonly membraneGfx = new Graphics();

  private readonly membranePts: number[] = new Array(MEMBRANE_N * 2);
  private readonly haloPts: number[] = new Array(MEMBRANE_N * 2);
  private readonly nucleusPts: number[] = new Array(NUCLEUS_N * 2);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private driftAngle = 0;
  private cx = 960;
  private cy = 540;
  private baseR = 200;

  private nukX = 0;
  private nukY = 0;
  private nukTgtX = 0;
  private nukTgtY = 0;
  private nukShift = 0;
  private nuclX = 0;
  private nuclY = 0;
  private nuclTgtX = 0;
  private nuclTgtY = 0;

  private particles: Particle[] = [];
  private ribosomes: Ribosome[] = [];
  private mitos: Mito[] = [];

  constructor() {
    super();

    this.haloContainer.filters = [new BlurFilter({ strength: 22, quality: 3 })];
    this.haloContainer.blendMode = "add";
    this.haloContainer.addChild(this.haloGfx);

    this.particleContainer.filters = [
      new BlurFilter({ strength: 4, quality: 2 }),
    ];
    this.particleContainer.blendMode = "add";
    this.particleContainer.addChild(this.particleGfx);

    this.ribosomeGfx.blendMode = "add";
    this.nucleusGfx.blendMode = "add";
    this.membraneGfx.blendMode = "add";

    this.addChild(this.haloContainer);
    this.addChild(this.fillGfx);
    this.addChild(this.particleContainer);
    this.addChild(this.ribosomeGfx);
    this.addChild(this.mitoContainer);
    this.addChild(this.nucleusGfx);
    this.addChild(this.membraneGfx);
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || this.w, window.innerHeight || this.h);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.cx = width * 0.5;
    this.cy = height * 0.5;
    this.baseR = Math.min(width, height) * 0.185;
    this._initOrganelles();
  }

  private _initOrganelles(): void {
    this._initParticles();
    this._initRibosomes();
    this._initMitos();
  }

  private _initParticles(): void {
    this.particles = [];
    const safeR = this.baseR * 0.68;
    for (let i = 0; i < PARTICLE_N; i++) {
      const angle = Math.random() * TAU;
      const r = Math.random() * safeR;
      this.particles.push({
        x: this.cx + Math.cos(angle) * r,
        y: this.cy + Math.sin(angle) * r,
        phase: Math.random() * TAU,
        speed: 0.12 + Math.random() * 0.28,
        r: 1.5 + Math.random() * 2,
        alpha: 0.15 + Math.random() * 0.2,
        color:
          PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      });
    }
  }

  private _initRibosomes(): void {
    this.ribosomes = [];
    const safeR = this.baseR * 0.72;
    for (let i = 0; i < RIBO_N; i++) {
      const angle = Math.random() * TAU;
      const r = Math.random() * safeR;
      this.ribosomes.push({
        x: this.cx + Math.cos(angle) * r,
        y: this.cy + Math.sin(angle) * r,
        phase: Math.random() * TAU,
        r: 2 + Math.random(),
        alpha: 0.3 + Math.random() * 0.2,
      });
    }
  }

  private _initMitos(): void {
    for (const m of this.mitos) {
      m.container.destroy({ children: true });
    }
    this.mitos = [];
    this.mitoContainer.removeChildren();

    const safeR = this.baseR * 0.58;
    for (let i = 0; i < MITO_N; i++) {
      const angle = Math.random() * TAU;
      const r = (0.3 + Math.random() * 0.65) * safeR;
      const len = 28 + Math.random() * 12;
      const wid = 12 + Math.random() * 4;
      const halfLen = len * 0.5;
      const halfWid = wid * 0.5;

      const container = new Container();
      container.blendMode = "add";
      const gfx = new Graphics();

      // Outer glow halo
      gfx
        .ellipse(0, 0, halfLen + 5, halfWid + 4)
        .fill({ color: C_MITO_FILL, alpha: 0.1 });
      // Main fill + stroke
      gfx
        .ellipse(0, 0, halfLen, halfWid)
        .fill({ color: C_MITO_FILL, alpha: 0.35 })
        .stroke({ color: C_MITO_STROKE, width: 1.2, alpha: 0.5 });
      // Cristae: short perpendicular lines suggesting inner membrane folds
      const nCristae = 2 + Math.floor(Math.random() * 2);
      for (let c = 0; c < nCristae; c++) {
        const lx =
          -halfLen * 0.55 + (c / Math.max(nCristae - 1, 1)) * halfLen * 1.1;
        const lh = halfWid * 0.72;
        gfx
          .moveTo(lx, -lh)
          .lineTo(lx, lh)
          .stroke({ color: C_MITO_CRISTAE, width: 0.6, alpha: 0.22 });
      }

      container.addChild(gfx);
      this.mitoContainer.addChild(container);

      this.mitos.push({
        container,
        x: this.cx + Math.cos(angle) * r,
        y: this.cy + Math.sin(angle) * r,
        rotation: Math.random() * TAU,
        rotSpeed:
          (0.002 + Math.random() * 0.002) * (Math.random() < 0.5 ? 1 : -1),
        phase: Math.random() * TAU,
      });
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;
    this.driftAngle += dt * 0.04;
    this._updateNucleus(dt);
    this._updateParticles(dt);
    this._updateMitos(dt);
    this._draw();
  }

  private _updateNucleus(dt: number): void {
    this.nukShift -= dt;
    if (this.nukShift <= 0) {
      this.nukTgtX = (Math.random() - 0.5) * this.baseR * 0.14;
      this.nukTgtY = (Math.random() - 0.5) * this.baseR * 0.14;
      this.nukShift = 6 + Math.random() * 4;
      this.nuclTgtX = (Math.random() - 0.5) * this.baseR * 0.025;
      this.nuclTgtY = (Math.random() - 0.5) * this.baseR * 0.025;
    }
    const eNuk = 1 - Math.exp(-dt * 2.5);
    const eNucl = 1 - Math.exp(-dt * 0.55);
    this.nukX += (this.nukTgtX - this.nukX) * eNuk;
    this.nukY += (this.nukTgtY - this.nukY) * eNuk;
    this.nuclX += (this.nuclTgtX - this.nuclX) * eNucl;
    this.nuclY += (this.nuclTgtY - this.nuclY) * eNucl;
  }

  private _updateParticles(dt: number): void {
    const safeR = this.baseR * 0.7;
    const repelStart = safeR - 22;
    const t = this.time;

    for (const p of this.particles) {
      const ph = p.phase;
      p.x +=
        Math.sin(t * 0.32 + ph) * p.speed * 0.4 * dt * 60 +
        (Math.random() - 0.5) * 0.3;
      p.y +=
        Math.cos(t * 0.27 + ph * 1.3) * p.speed * 0.4 * dt * 60 +
        (Math.random() - 0.5) * 0.3;

      const dx = p.x - this.cx;
      const dy = p.y - this.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > repelStart) {
        const force = clamp((dist - repelStart) / 22, 0, 1) * 0.9;
        p.x -= (dx / dist) * force;
        p.y -= (dy / dist) * force;
      }
    }
  }

  private _updateMitos(dt: number): void {
    const safeR = this.baseR * 0.6;
    const t = this.time;

    for (const m of this.mitos) {
      m.rotation += m.rotSpeed;
      m.x += Math.sin(t * 0.18 + m.phase) * 0.22 * dt * 60;
      m.y += Math.cos(t * 0.22 + m.phase * 1.5) * 0.2 * dt * 60;

      const dx = m.x - this.cx;
      const dy = m.y - this.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > safeR) {
        m.x = this.cx + (dx / dist) * safeR * 0.96;
        m.y = this.cy + (dy / dist) * safeR * 0.96;
      }

      m.container.x = m.x;
      m.container.y = m.y;
      m.container.rotation = m.rotation;
    }
  }

  private _buildMembrane(): void {
    for (let i = 0; i < MEMBRANE_N; i++) {
      const angle = (i / MEMBRANE_N) * TAU + this.driftAngle;
      const disp = membraneDisp(angle, this.time);
      const r = this.baseR + disp;
      this.membranePts[i * 2] = this.cx + Math.cos(angle) * r;
      this.membranePts[i * 2 + 1] = this.cy + Math.sin(angle) * r;
      const rh = r + 18;
      this.haloPts[i * 2] = this.cx + Math.cos(angle) * rh;
      this.haloPts[i * 2 + 1] = this.cy + Math.sin(angle) * rh;
    }
  }

  private _buildNucleus(): void {
    const nkCx = this.cx + this.nukX;
    const nkCy = this.cy + this.nukY;
    const nukR = this.baseR * 0.34;
    for (let i = 0; i < NUCLEUS_N; i++) {
      const angle = (i / NUCLEUS_N) * TAU;
      const r = nukR + nucleusDisp(angle, this.time);
      this.nucleusPts[i * 2] = nkCx + Math.cos(angle) * r;
      this.nucleusPts[i * 2 + 1] = nkCy + Math.sin(angle) * r;
    }
  }

  private _draw(): void {
    this._buildMembrane();
    this._buildNucleus();
    this._drawHalo();
    this._drawFill();
    this._drawParticles();
    this._drawRibosomes();
    this._drawNucleus();
    this._drawMembrane();
  }

  private _drawHalo(): void {
    const g = this.haloGfx;
    g.clear();
    // Alpha pulses gently between 0.07 and 0.12
    const haloAlpha = 0.095 + Math.sin(this.time * 0.78) * 0.025;
    g.poly(this.haloPts, true).fill({
      color: C_HALO,
      alpha: clamp(haloAlpha, 0.06, 0.13),
    });
  }

  private _drawFill(): void {
    const g = this.fillGfx;
    g.clear();
    // Barely-there cytoplasm volume hint — "the cell has interior, not hollow"
    g.poly(this.membranePts, true).fill({ color: 0x00c8b4, alpha: 0.06 });
  }

  private _drawParticles(): void {
    const g = this.particleGfx;
    g.clear();
    for (const p of this.particles) {
      g.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: p.alpha });
    }
  }

  private _drawRibosomes(): void {
    const g = this.ribosomeGfx;
    g.clear();
    const safeR = this.baseR * 0.72;
    const t = this.time;

    for (const rb of this.ribosomes) {
      rb.x +=
        Math.sin(t * 0.14 + rb.phase) * 0.08 + (Math.random() - 0.5) * 0.15;
      rb.y +=
        Math.cos(t * 0.11 + rb.phase) * 0.08 + (Math.random() - 0.5) * 0.15;

      const dx = rb.x - this.cx;
      const dy = rb.y - this.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > safeR) {
        rb.x = this.cx + (dx / dist) * safeR * 0.97;
        rb.y = this.cy + (dy / dist) * safeR * 0.97;
      }

      g.circle(rb.x, rb.y, rb.r).fill({ color: C_RIBO, alpha: rb.alpha });
    }
  }

  private _drawNucleus(): void {
    const g = this.nucleusGfx;
    g.clear();

    // Nucleus body — outer deep fill + brighter inner
    g.poly(this.nucleusPts, true).fill({ color: 0x5028b4, alpha: 0.28 });
    g.poly(this.nucleusPts, true).fill({ color: C_NUCLEUS_FILL, alpha: 0.38 });

    // Nuclear envelope strokes: core + soft outer glow ring
    g.poly(this.nucleusPts, true).stroke({
      color: C_NUCLEUS_STROKE,
      width: 5,
      alpha: 0.07,
    });
    g.poly(this.nucleusPts, true).stroke({
      color: C_NUCLEUS_STROKE,
      width: 1.8,
      alpha: 0.65,
    });

    // Nucleolus — barely moves, soft glow + bright core dot
    const nucAbsX = this.cx + this.nukX + this.nuclX;
    const nucAbsY = this.cy + this.nukY + this.nuclY;
    const nucloR = 15 + Math.sin(this.time * 0.26) * 1.5;
    g.circle(nucAbsX, nucAbsY, nucloR + 8).fill({
      color: C_NUCLEOLUS,
      alpha: 0.1,
    });
    g.circle(nucAbsX, nucAbsY, nucloR + 3).fill({
      color: C_NUCLEOLUS,
      alpha: 0.18,
    });
    g.circle(nucAbsX, nucAbsY, nucloR).fill({ color: C_NUCLEOLUS, alpha: 0.5 });
  }

  private _drawMembrane(): void {
    const g = this.membraneGfx;
    g.clear();
    // Multi-pass stroke: wide soft halos + crisp core line
    g.poly(this.membranePts, true).stroke({
      color: C_GLOW,
      width: 12,
      alpha: 0.04,
    });
    g.poly(this.membranePts, true).stroke({
      color: C_GLOW,
      width: 7,
      alpha: 0.1,
    });
    g.poly(this.membranePts, true).stroke({
      color: C_GLOW,
      width: 4,
      alpha: 0.2,
    });
    g.poly(this.membranePts, true).stroke({
      color: C_CYAN,
      width: 2.5,
      alpha: 0.75,
    });
  }
}
