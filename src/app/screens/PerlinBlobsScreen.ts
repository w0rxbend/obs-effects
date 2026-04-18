import type { Ticker } from "pixi.js";
import { Container, Sprite, Texture } from "pixi.js";

// ── 4D Gradient Noise ─────────────────────────────────────────────────────────
// Deterministic permutation table (seeded Fisher-Yates shuffle)
const PERM = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 0xc0ffee;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  // Double to avoid wrapping: max index = X+1 + perm[...] = 256 + 255 = 511
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
})();

function _fade(t: number) { return t * t * t * (t * (6 * t - 15) + 10); }
function _lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function _g4(h: number, x: number, y: number, z: number, w: number): number {
  const u = h < 24 ? x : y;
  const v = h < 16 ? y : z;
  const s = h < 8  ? z : w;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v) + ((h & 4) ? -s : s);
}

// Returns a value in roughly [-1, 1].
// For a seamless loop of period T: pass z = cos(2π·t/T)·R, w = sin(2π·t/T)·R.
function noise4D(x: number, y: number, z: number, w: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), iw = Math.floor(w);
  const fx = x - ix, fy = y - iy, fz = z - iz, fw = w - iw;
  const X = ix & 255, Y = iy & 255, Z = iz & 255, W = iw & 255;
  const u = _fade(fx), v = _fade(fy), s = _fade(fz), t = _fade(fw);
  const h = (xi: number, yi: number, zi: number, wi: number) =>
    PERM[X + xi + PERM[Y + yi + PERM[Z + zi + PERM[W + wi]]]] & 31;
  const g = (xi: number, yi: number, zi: number, wi: number, dx: number, dy: number, dz: number, dw: number) =>
    _g4(h(xi, yi, zi, wi), dx, dy, dz, dw);
  return _lerp(
    _lerp(
      _lerp(_lerp(g(0,0,0,0,fx,  fy,  fz,  fw  ),g(1,0,0,0,fx-1,fy,  fz,  fw  ),u),
            _lerp(g(0,1,0,0,fx,  fy-1,fz,  fw  ),g(1,1,0,0,fx-1,fy-1,fz,  fw  ),u),v),
      _lerp(_lerp(g(0,0,1,0,fx,  fy,  fz-1,fw  ),g(1,0,1,0,fx-1,fy,  fz-1,fw  ),u),
            _lerp(g(0,1,1,0,fx,  fy-1,fz-1,fw  ),g(1,1,1,0,fx-1,fy-1,fz-1,fw  ),u),v),s),
    _lerp(
      _lerp(_lerp(g(0,0,0,1,fx,  fy,  fz,  fw-1),g(1,0,0,1,fx-1,fy,  fz,  fw-1),u),
            _lerp(g(0,1,0,1,fx,  fy-1,fz,  fw-1),g(1,1,0,1,fx-1,fy-1,fz,  fw-1),u),v),
      _lerp(_lerp(g(0,0,1,1,fx,  fy,  fz-1,fw-1),g(1,0,1,1,fx-1,fy,  fz-1,fw-1),u),
            _lerp(g(0,1,1,1,fx,  fy-1,fz-1,fw-1),g(1,1,1,1,fx-1,fy-1,fz-1,fw-1),u),v),s),t);
}

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const CRUST: [number, number, number] = [0x11, 0x11, 0x1b];

const BLOB_COLORS: [number, number, number][] = [
  [0xcb, 0xa6, 0xf7], // Mauve
  [0xf5, 0xc2, 0xe7], // Pink
  [0x74, 0xc7, 0xec], // Sapphire
  [0x94, 0xe2, 0xd5], // Teal
  [0xfa, 0xb3, 0x87], // Peach
  [0xa6, 0xe3, 0xa1], // Green
  [0x89, 0xdc, 0xeb], // Sky
  [0xf3, 0x8b, 0xa8], // Red
  [0x18, 0x18, 0x25], // Mantle
  [0x11, 0x11, 0x1b], // Crust
  [0x00, 0x00, 0x00], // Black
];

// ── Fluid grid (16:9) ─────────────────────────────────────────────────────────
const GW   = 160;
const GH   = 90;
const ITER = 10;
const VISC = 4e-6;
const DIFF = 6e-5;

const GSIZE = (GW + 2) * (GH + 2);

function IX(i: number, j: number): number { return i + (GW + 2) * j; }

// ── Stam solver ───────────────────────────────────────────────────────────────
function add_source(x: Float32Array, s: Float32Array, dt: number): void {
  for (let i = 0; i < GSIZE; i++) x[i] += dt * s[i];
}

function set_bnd(b: number, x: Float32Array): void {
  for (let j = 1; j <= GH; j++) {
    x[IX(0,    j)] = b === 1 ? -x[IX(1,  j)]  : x[IX(1,  j)];
    x[IX(GW+1, j)] = b === 1 ? -x[IX(GW, j)]  : x[IX(GW, j)];
  }
  for (let i = 1; i <= GW; i++) {
    x[IX(i, 0)]    = b === 2 ? -x[IX(i, 1)]   : x[IX(i, 1)];
    x[IX(i, GH+1)] = b === 2 ? -x[IX(i, GH)]  : x[IX(i, GH)];
  }
  x[IX(0,    0)]    = 0.5 * (x[IX(1,   0)]    + x[IX(0,   1)]);
  x[IX(0,    GH+1)] = 0.5 * (x[IX(1,   GH+1)] + x[IX(0,   GH)]);
  x[IX(GW+1, 0)]    = 0.5 * (x[IX(GW,  0)]    + x[IX(GW+1, 1)]);
  x[IX(GW+1, GH+1)] = 0.5 * (x[IX(GW,  GH+1)] + x[IX(GW+1, GH)]);
}

function lin_solve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number): void {
  const ci = 1 / c;
  for (let k = 0; k < ITER; k++) {
    for (let j = 1; j <= GH; j++) {
      for (let i = 1; i <= GW; i++) {
        x[IX(i,j)] = (x0[IX(i,j)] + a*(x[IX(i-1,j)]+x[IX(i+1,j)]+x[IX(i,j-1)]+x[IX(i,j+1)])) * ci;
      }
    }
    set_bnd(b, x);
  }
}

function diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number): void {
  const a = dt * diff * GW * GH;
  lin_solve(b, x, x0, a, 1 + 4 * a);
}

function advect(b: number, d: Float32Array, d0: Float32Array, u: Float32Array, v: Float32Array, dt: number): void {
  const dt0w = dt * GW;
  const dt0h = dt * GH;
  for (let j = 1; j <= GH; j++) {
    for (let i = 1; i <= GW; i++) {
      let px = i - dt0w * u[IX(i,j)];
      let py = j - dt0h * v[IX(i,j)];
      if (px < 0.5)      px = 0.5;
      if (px > GW + 0.5) px = GW + 0.5;
      if (py < 0.5)      py = 0.5;
      if (py > GH + 0.5) py = GH + 0.5;
      const i0 = Math.floor(px), i1 = i0 + 1;
      const j0 = Math.floor(py), j1 = j0 + 1;
      const s1 = px - i0, s0 = 1 - s1;
      const t1 = py - j0, t0 = 1 - t1;
      d[IX(i,j)] = s0*(t0*d0[IX(i0,j0)] + t1*d0[IX(i0,j1)]) +
                   s1*(t0*d0[IX(i1,j0)] + t1*d0[IX(i1,j1)]);
    }
  }
  set_bnd(b, d);
}

function project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array): void {
  const hx = 1 / GW, hy = 1 / GH;
  for (let j = 1; j <= GH; j++) {
    for (let i = 1; i <= GW; i++) {
      div[IX(i,j)] = -0.5*(hx*(u[IX(i+1,j)]-u[IX(i-1,j)]) + hy*(v[IX(i,j+1)]-v[IX(i,j-1)]));
      p[IX(i,j)]   = 0;
    }
  }
  set_bnd(0, div); set_bnd(0, p);
  lin_solve(0, p, div, 1, 4);
  for (let j = 1; j <= GH; j++) {
    for (let i = 1; i <= GW; i++) {
      u[IX(i,j)] -= 0.5 * GW * (p[IX(i+1,j)] - p[IX(i-1,j)]);
      v[IX(i,j)] -= 0.5 * GH * (p[IX(i,j+1)] - p[IX(i,j-1)]);
    }
  }
  set_bnd(1, u); set_bnd(2, v);
}

// ── Screen ────────────────────────────────────────────────────────────────────
// Loop period in seconds — blobs return to the same position after this time
const LOOP_PERIOD = 30;
// Radius of the time circle in 4D noise space
const LOOP_RADIUS = 1.4;

interface Blob {
  seedX: number; seedY: number; // unique offsets in noise space per blob
  cr: number; cg: number; cb: number; // dye color [0-1]
  rad: number;                  // injection radius (grid cells)
}

export class PerlinBlobsScreen extends Container {
  public static assetBundles: string[] = [];

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private imgData!: ImageData;
  private sprite!: Sprite;
  private texture!: Texture;

  private u     = new Float32Array(GSIZE);
  private v     = new Float32Array(GSIZE);
  private uPrev = new Float32Array(GSIZE);
  private vPrev = new Float32Array(GSIZE);
  private dr    = new Float32Array(GSIZE);
  private dg    = new Float32Array(GSIZE);
  private db    = new Float32Array(GSIZE);
  private drPrev = new Float32Array(GSIZE);
  private dgPrev = new Float32Array(GSIZE);
  private dbPrev = new Float32Array(GSIZE);
  private p     = new Float32Array(GSIZE);
  private div   = new Float32Array(GSIZE);

  private blobs: Blob[] = [];
  private time = 0;
  private w = 1920;
  private h = 1080;

  public async show(): Promise<void> {
    this.canvas       = document.createElement("canvas");
    this.canvas.width  = GW;
    this.canvas.height = GH;
    this.ctx     = this.canvas.getContext("2d")!;
    this.imgData = this.ctx.createImageData(GW, GH);
    for (let i = 3; i < this.imgData.data.length; i += 4) this.imgData.data[i] = 255;

    this.texture = Texture.from(this.canvas);
    this.sprite  = new Sprite(this.texture);
    this.sprite.anchor.set(0, 0);
    this.addChild(this.sprite);

    this._buildBlobs();
    this._applySize();
  }

  public resize(w: number, h: number): void {
    this.w = w; this.h = h;
    this._applySize();
  }

  private _applySize(): void {
    if (!this.sprite) return;
    this.sprite.width  = this.w;
    this.sprite.height = this.h;
  }

  private _buildBlobs(): void {
    this.blobs = BLOB_COLORS.map(([r, g, b], k) => ({
      seedX: k * 19.7 + 2.3,
      seedY: k * 13.1 + 5.8,
      cr: r / 255, cg: g / 255, cb: b / 255,
      rad: 5 + (k % 3) * 2,
    }));
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS / 1000, 0.033);
    this.time += dt;
    this._inject(dt);
    this._velStep(dt);
    this._densStep(dt);
    this._render();
  }

  private _inject(dt: number): void {
    this.uPrev.fill(0);
    this.vPrev.fill(0);
    this.drPrev.fill(0);
    this.dgPrev.fill(0);
    this.dbPrev.fill(0);

    // Encode time as a point on a circle in z,w — after LOOP_PERIOD seconds
    // the angle completes a full revolution and positions repeat exactly.
    const angle = (this.time / LOOP_PERIOD) * Math.PI * 2;
    const cz = Math.cos(angle) * LOOP_RADIUS;
    const cw = Math.sin(angle) * LOOP_RADIUS;

    for (const b of this.blobs) {
      const bx = noise4D(b.seedX, 0, cz, cw) * 0.38 + 0.5;
      const by = noise4D(0, b.seedY, cz, cw) * 0.38 + 0.5;
      // Numerical velocity: derivative of noise position w.r.t. time
      const eps  = 0.01;
      const czE  = Math.cos(angle + eps) * LOOP_RADIUS;
      const cwE  = Math.sin(angle + eps) * LOOP_RADIUS;
      const vx = (noise4D(b.seedX, 0, czE, cwE) * 0.38 + 0.5 - bx) / eps * GW * 0.6;
      const vy = (noise4D(0, b.seedY, czE, cwE) * 0.38 + 0.5 - by) / eps * GH * 0.6;

      const gi = Math.round(bx * GW);
      const gj = Math.round(by * GH);

      for (let dj = -b.rad; dj <= b.rad; dj++) {
        for (let di = -b.rad; di <= b.rad; di++) {
          const d2 = di*di + dj*dj;
          if (d2 > b.rad * b.rad) continue;
          const ci = gi + di, cj = gj + dj;
          if (ci < 1 || ci > GW || cj < 1 || cj > GH) continue;
          const w = 1 - d2 / (b.rad * b.rad);
          const idx = IX(ci, cj);
          this.uPrev[idx] += vx * w * 15 * dt;
          this.vPrev[idx] += vy * w * 15 * dt;
          this.drPrev[idx] += b.cr * w * 8 * dt;
          this.dgPrev[idx] += b.cg * w * 8 * dt;
          this.dbPrev[idx] += b.cb * w * 8 * dt;
        }
      }
    }
  }

  private _velStep(dt: number): void {
    add_source(this.u, this.uPrev, dt);
    add_source(this.v, this.vPrev, dt);

    this.uPrev.set(this.u);
    diffuse(1, this.u, this.uPrev, VISC, dt);
    this.vPrev.set(this.v);
    diffuse(2, this.v, this.vPrev, VISC, dt);
    project(this.u, this.v, this.p, this.div);

    this.uPrev.set(this.u);
    this.vPrev.set(this.v);
    advect(1, this.u, this.uPrev, this.uPrev, this.vPrev, dt);
    advect(2, this.v, this.vPrev, this.uPrev, this.vPrev, dt);
    project(this.u, this.v, this.p, this.div);
  }

  private _densStep(dt: number): void {
    add_source(this.dr, this.drPrev, dt);
    add_source(this.dg, this.dgPrev, dt);
    add_source(this.db, this.dbPrev, dt);

    this.drPrev.set(this.dr);
    diffuse(0, this.dr, this.drPrev, DIFF, dt);
    this.dgPrev.set(this.dg);
    diffuse(0, this.dg, this.dgPrev, DIFF, dt);
    this.dbPrev.set(this.db);
    diffuse(0, this.db, this.dbPrev, DIFF, dt);

    this.drPrev.set(this.dr);
    this.dgPrev.set(this.dg);
    this.dbPrev.set(this.db);
    advect(0, this.dr, this.drPrev, this.u, this.v, dt);
    advect(0, this.dg, this.dgPrev, this.u, this.v, dt);
    advect(0, this.db, this.dbPrev, this.u, this.v, dt);
  }

  private _render(): void {
    const px = this.imgData.data;
    // Brightness cycles dark → bright → dark on its own 20 s period, looping forever
    const breath = 0.5 - 0.5 * Math.cos((this.time / 20) * Math.PI * 2);
    const cap = 18 + 82 * breath * breath;
    for (let j = 1; j <= GH; j++) {
      for (let i = 1; i <= GW; i++) {
        const idx = IX(i, j);
        const pr = Math.min(1, this.dr[idx]);
        const pg = Math.min(1, this.dg[idx]);
        const pb = Math.min(1, this.db[idx]);
        const p4 = ((j - 1) * GW + (i - 1)) * 4;
        px[p4]     = (CRUST[0] + cap * pr + 0.5) | 0;
        px[p4 + 1] = (CRUST[1] + cap * pg + 0.5) | 0;
        px[p4 + 2] = (CRUST[2] + cap * pb + 0.5) | 0;
      }
    }
    this.ctx.putImageData(this.imgData, 0, 0);
    this.texture.source.update();
  }
}
