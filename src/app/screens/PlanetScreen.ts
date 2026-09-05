import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import {
  ADMIRAL_HEALTH,
  ADMIRAL_SHOOT_INTERVAL,
  ADMIRAL_SPAWN_RADIUS,
  ADMIRAL_SPEED,
  ADMIRAL_WANDER_INTERVAL,
  ALI_RADIUS,
  ASTEROID_COUNT,
  BH_EVENT_HORIZON,
  BH_GRAVITY,
  BH_SWALLOW_R,
  BOID_HEALTH,
  BOID_MAX_FORCE,
  BOID_MAX_SPEED,
  BOIDS_PER_TEAM,
  CATT_BASE,
  CATT_BLUE,
  CATT_CRUST,
  CATT_FLAMINGO,
  CATT_LAVENDER,
  CATT_MAUVE,
  CATT_OVERLAY0,
  CATT_PEACH,
  CATT_ROSEWATER,
  CATT_SKY,
  CATT_SURFACE0,
  CATT_TEAL,
  CATT_YELLOW,
  COH_RADIUS,
  DEEP_CLUSTER_COUNT,
  DETECT_RANGE,
  FIRE_RANGE,
  GALAXY_COLORS,
  GALAXY_COUNT,
  INNER_BELT_COUNT,
  KUIPER_COUNT,
  LASER_LIFE,
  LASER_SPEED,
  PULSAR_COUNT,
  QUASAR_COUNT,
  REINFORCE_COUNT,
  REINFORCE_INTERVAL,
  SEP_RADIUS,
  SHOOT_INTERVAL,
  SOLAR_SCALE,
  SPLIT_CHANCE,
  STAR_COLORS,
  STAR_COUNT,
  SUN_CORE,
  SUN_CORONA,
  SUN_MID,
  TEAM_BLUE,
  TEAM_COLOR,
  TEAM_LASER_COLOR,
  TEAM_RED,
} from "./planet/constants";
import { PLANET_DEFS } from "./planet/planet-defs";
import {
  drawDashedOrbit,
  keplerTrueAnomaly,
  orbitPos,
  rotate,
} from "./planet/orbits";
import { drawAdmiralShip, drawShip } from "./planet/ships";
import type {
  Admiral,
  Asteroid,
  BlackHole,
  Boid,
  BoidExplosion,
  Comet,
  Galaxy,
  Laser,
  Moon,
  Planet,
  Pulsar,
  Quasar,
  Star,
  StarCluster,
} from "./planet/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lerpColor(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
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

// Pixi copies the style object on the way in (see `toFillStyle`), so a single
// shared mutable style keeps the per-frame draw loops free of object literals.
const scratchFill = { color: 0, alpha: 1 };

/** Filled circle drawn without allocating a fill-style object per call. */
function dot(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  alpha: number,
): void {
  scratchFill.color = color;
  scratchFill.alpha = alpha;
  g.circle(x, y, r).fill(scratchFill);
}

// ── Precomputed trig ──────────────────────────────────────────────────────────
// The deep-sky art samples the same fixed ring of angles every single frame, so
// the sines and cosines are built once here instead of thousands of times a
// second inside the draw loops.

const GAL_ELLIPSE_STEPS = 40;
const GAL_ELLIPSE_COS = new Float64Array(GAL_ELLIPSE_STEPS);
const GAL_ELLIPSE_SIN = new Float64Array(GAL_ELLIPSE_STEPS);
for (let i = 0; i < GAL_ELLIPSE_STEPS; i++) {
  const ta = (i / GAL_ELLIPSE_STEPS) * Math.PI * 2;
  GAL_ELLIPSE_COS[i] = Math.cos(ta);
  GAL_ELLIPSE_SIN[i] = Math.sin(ta);
}

const GAL_ARM_STEPS = 22;
const GAL_ARM_COS = new Float64Array(GAL_ARM_STEPS);
const GAL_ARM_SIN = new Float64Array(GAL_ARM_STEPS);
for (let j = 0; j < GAL_ARM_STEPS; j++) {
  const ta = (j / GAL_ARM_STEPS) * Math.PI * 2.5;
  GAL_ARM_COS[j] = Math.cos(ta);
  GAL_ARM_SIN[j] = Math.sin(ta);
}

const QUASAR_DISK_STEPS = 32;
const QUASAR_DISK_COS = new Float64Array(QUASAR_DISK_STEPS);
const QUASAR_DISK_SIN = new Float64Array(QUASAR_DISK_STEPS);
for (let i = 0; i < QUASAR_DISK_STEPS; i++) {
  const ta = (i / QUASAR_DISK_STEPS) * Math.PI * 2;
  QUASAR_DISK_COS[i] = Math.cos(ta);
  QUASAR_DISK_SIN[i] = Math.sin(ta);
}

// Accretion-arc samples run over [0, PI) measured from the arc's own start, so
// brightness — and therefore dot radius and colour — depend on the index alone.
const BH_ARC_STEPS = 60;
const BH_ARC_COS = new Float64Array(BH_ARC_STEPS);
const BH_ARC_SIN = new Float64Array(BH_ARC_STEPS);
const BH_ARC_RADIUS = new Float64Array(BH_ARC_STEPS);
const BH_ARC_COLOR = new Int32Array(BH_ARC_STEPS);
for (let i = 0; i < BH_ARC_STEPS; i++) {
  const ta = (i / BH_ARC_STEPS) * Math.PI;
  BH_ARC_COS[i] = Math.cos(ta);
  BH_ARC_SIN[i] = Math.sin(ta); // non-negative on [0, PI) — this is `brightness`
  BH_ARC_RADIUS[i] = 1.0 + BH_ARC_SIN[i] * 1.5;
  BH_ARC_COLOR[i] = lerpColor(0xf38ba8, 0xfab387, BH_ARC_SIN[i]);
}

// ── Boid spatial hash ─────────────────────────────────────────────────────────

// Cell size matches the widest radius the flock loop asks about (DETECT_RANGE),
// so the 3x3 block around a boid is guaranteed to contain every boid that can
// influence it. Buckets are singly-linked lists through `next`, so no boid is
// ever dropped from the grid, and the block is a superset of the exact
// neighbour set: the extra 32px of slack absorbs the distance a boid stepped
// earlier in the same frame has moved since it was bucketed (~5px at 60fps).
//
// The one case the slack cannot absorb is a boid that wraps to the opposite
// screen edge mid-frame: it stays bucketed at its pre-wrap cell, so boids
// stepped after it miss it for that single frame. At the wrap seam only, for
// one frame, out of a 76-boid flock — below anything visible on screen.
const BOID_CELL = DETECT_RANGE + 32;
/** Boids wrap 20px outside the viewport; pad the grid so they stay in range. */
const BOID_GRID_PAD = 48;

class BoidGrid {
  private cols = 1;
  private rows = 1;
  private originX = 0;
  private originY = 0;
  private head = new Int32Array(1);
  private next = new Int32Array(256);

  public resize(w: number, h: number): void {
    // Screen space is centred on (0, 0), so the origin shifts by half the extent
    this.originX = w * 0.5 + BOID_GRID_PAD;
    this.originY = h * 0.5 + BOID_GRID_PAD;
    this.cols = Math.max(1, Math.ceil((w + BOID_GRID_PAD * 2) / BOID_CELL));
    this.rows = Math.max(1, Math.ceil((h + BOID_GRID_PAD * 2) / BOID_CELL));
    this.head = new Int32Array(this.cols * this.rows);
  }

  public build(boids: readonly Boid[]): void {
    if (this.next.length < boids.length) {
      this.next = new Int32Array(boids.length * 2);
    }
    this.head.fill(-1);
    for (let i = 0; i < boids.length; i++) {
      const ci = this.row(boids[i].y) * this.cols + this.col(boids[i].x);
      this.next[i] = this.head[ci];
      this.head[ci] = i;
    }
  }

  /** Fills `out` with the boid indices in the 3x3 block around (x, y). */
  public query(x: number, y: number, out: Int32Array): number {
    const cc = this.col(x);
    const cr = this.row(y);
    const c0 = cc > 0 ? cc - 1 : 0;
    const c1 = cc < this.cols - 1 ? cc + 1 : this.cols - 1;
    const r0 = cr > 0 ? cr - 1 : 0;
    const r1 = cr < this.rows - 1 ? cr + 1 : this.rows - 1;
    let n = 0;
    for (let r = r0; r <= r1; r++) {
      const rowOff = r * this.cols;
      for (let c = c0; c <= c1; c++) {
        for (let i = this.head[rowOff + c]; i !== -1; i = this.next[i]) {
          out[n++] = i;
        }
      }
    }
    return n;
  }

  private col(x: number): number {
    const c = ((x + this.originX) / BOID_CELL) | 0;
    return c < 0 ? 0 : c > this.cols - 1 ? this.cols - 1 : c;
  }

  private row(y: number): number {
    const r = ((y + this.originY) / BOID_CELL) | 0;
    return r < 0 ? 0 : r > this.rows - 1 ? this.rows - 1 : r;
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export class PlanetScreen extends Container {
  public static assetBundles = ["main"];

  // layers (back to front)
  private readonly bgGfx = new Graphics();
  private readonly galaxyGfx = new Graphics();
  private readonly pulsarGfx = new Graphics();
  private readonly quasarGfx = new Graphics();
  private readonly starGfx = new Graphics();
  private readonly orbitRingGfx = new Graphics();
  private readonly asteroidGfx = new Graphics();
  private readonly trailGfx = new Graphics();
  private readonly planetGfx = new Graphics();
  private readonly cometGfx = new Graphics();
  private readonly sunGfx = new Graphics();
  private readonly blackHoleGfx = new Graphics();
  private readonly admiralGfx = new Graphics();
  private readonly boidsGfx = new Graphics();
  private readonly laserGfx = new Graphics();
  private readonly explosionGfx = new Graphics();

  private readonly stars: Star[] = [];
  private readonly clusters: StarCluster[] = [];
  private readonly galaxies: Galaxy[] = [];
  private readonly pulsars: Pulsar[] = [];
  private readonly quasars: Quasar[] = [];
  private readonly planets: Planet[] = [];
  private readonly asteroids: Asteroid[] = [];
  private readonly kuiperBelt: Asteroid[] = [];
  private readonly innerBelt: Asteroid[] = [];
  private readonly comets: Comet[] = [];
  private blackHole: BlackHole | null = null;
  private readonly admirals: Admiral[] = [];
  private readonly boids: Boid[] = [];
  private readonly lasers: Laser[] = [];
  private readonly explosions: BoidExplosion[] = [];

  // Planet trails are ring buffers over a preallocated Array<{x,y}>: `trailHead`
  // is the newest sample, `trailCount` how many are live. Avoids one object
  // literal plus an O(n) Array#shift per planet per frame.
  private readonly trailHead = new Int32Array(PLANET_DEFS.length);
  private readonly trailCount = new Int32Array(PLANET_DEFS.length);

  private readonly grid = new BoidGrid();
  private neighBuf = new Int32Array(256);
  /** Reused between frames so the boid loop never allocates a kill list. */
  private readonly deadBoids: number[] = [];

  private time = 0;
  private w = 0;
  private h = 0;
  private maxOrbitR = 0;
  private cometTimer = 0;
  private reinforceTimer = 0;
  /** Orbit rings only change when the planet ellipses are rebuilt on resize. */
  private orbitRingsDirty = true;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.galaxyGfx);
    this.addChild(this.pulsarGfx);
    this.addChild(this.quasarGfx);
    this.addChild(this.starGfx);
    this.addChild(this.orbitRingGfx);
    this.addChild(this.asteroidGfx);
    this.addChild(this.trailGfx);
    this.addChild(this.planetGfx);
    this.addChild(this.cometGfx);
    this.addChild(this.sunGfx);
    this.addChild(this.blackHoleGfx);
    this.addChild(this.admiralGfx);
    this.addChild(this.boidsGfx);
    this.addChild(this.laserGfx);
    this.addChild(this.explosionGfx);
  }

  public async show(): Promise<void> {
    this.spawnStars();
    this.spawnGalaxies();
    this.spawnPulsars();
    this.spawnQuasars();
    this.spawnAdmirals();
    this.spawnBoids();
    this.spawnBlackHole();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    this.drawBackground();
    this.drawGalaxies(dt);
    this.drawPulsars(dt);
    this.drawQuasars(dt);
    this.drawStars(dt);
    this.drawOrbitRings();
    this.updatePlanets(dt);
    this.asteroidGfx.clear();
    this.drawAsteroidBelt(this.asteroids, dt);
    this.drawAsteroidBelt(this.kuiperBelt, dt);
    this.drawAsteroidBelt(this.innerBelt, dt);
    this.drawComets(dt);
    this.drawSun();
    this.drawBlackHole(dt);
    this.updateAdmirals(dt);
    this.updateBoids(dt);
    this.updateLasers(dt);
    this.drawExplosions(dt);

    this.cometTimer += dt;
    if (this.cometTimer > 7 + Math.random() * 5) {
      this.cometTimer = 0;
      this.spawnComet();
    }

    this.reinforceTimer += dt;
    if (this.reinforceTimer > REINFORCE_INTERVAL) {
      this.reinforceTimer = 0;
      this.reinforceBoids();
    }
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width * 0.5;
    this.y = height * 0.5;
    this.maxOrbitR = Math.min(width, height) * 0.5 * SOLAR_SCALE;
    this.grid.resize(width, height);
    this.buildPlanets();
    this.buildAsteroidBelt(
      this.asteroids,
      ASTEROID_COUNT,
      0.48,
      0.56, // main belt: between Mars and Jupiter
      0.1,
      0.22,
    );
    this.buildAsteroidBelt(
      this.kuiperBelt,
      KUIPER_COUNT,
      0.98,
      1.08, // Kuiper belt: just beyond Neptune
      0.05,
      0.14,
    );
    this.buildAsteroidBelt(
      this.innerBelt,
      INNER_BELT_COUNT,
      0.12,
      0.16, // inner dust ring: inside Mercury orbit
      0.02,
      0.08,
    );
  }

  // ── Background ────────────────────────────────────────────────────────────

  private drawBackground(): void {
    this.bgGfx.clear();
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    this.bgGfx.rect(-hw, -hh, this.w, this.h).fill({ color: CATT_CRUST });
    const r = Math.max(hw, hh);
    this.bgGfx.circle(0, 0, r * 1.1).fill({ color: CATT_BASE, alpha: 0.6 });
    const pulse = 1 + 0.012 * Math.sin(this.time * 0.25);
    // central warm glow from sun
    this.bgGfx
      .circle(0, 0, r * 0.28 * pulse)
      .fill({ color: SUN_CORONA, alpha: 0.04 });
    this.bgGfx
      .circle(0, 0, r * 0.14 * pulse)
      .fill({ color: SUN_MID, alpha: 0.06 });
  }

  // ── Galaxies / deep-sky objects ───────────────────────────────────────────

  private spawnGalaxies(): void {
    const hw = 1400,
      hh = 900;
    for (let i = 0; i < GALAXY_COUNT; i++) {
      // Place galaxies well away from centre
      const angle = (i / GALAXY_COUNT) * Math.PI * 2 + Math.random() * 0.6;
      const dist = 420 + Math.random() * 340;
      this.galaxies.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.65,
        angle: Math.random() * Math.PI,
        scaleX: 55 + Math.random() * 70,
        scaleY: 18 + Math.random() * 30,
        color: randomFrom(GALAXY_COLORS),
        alpha: 0.06 + Math.random() * 0.09,
        rotation: 0,
        rotSpeed: 0.006 + Math.random() * 0.01,
        arms: 2 + Math.floor(Math.random() * 3),
      });
      void hw;
      void hh;
    }

    // Star clusters
    for (let i = 0; i < DEEP_CLUSTER_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 300 + Math.random() * 500;
      const r = 20 + Math.random() * 45;
      const count = 14 + Math.floor(Math.random() * 22);
      const stars: StarCluster["stars"] = [];
      for (let j = 0; j < count; j++) {
        const da = Math.random() * Math.PI * 2;
        const dr = Math.random() * r;
        stars.push({
          dx: Math.cos(da) * dr,
          dy: Math.sin(da) * dr * 0.6,
          size: 0.5 + Math.random() * 1.5,
          alpha: 0.2 + Math.random() * 0.55,
          phase: Math.random() * Math.PI * 2,
        });
      }
      this.clusters.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.7,
        radius: r,
        color: randomFrom(STAR_COLORS),
        stars,
      });
    }
  }

  private drawGalaxies(dt: number): void {
    this.galaxyGfx.clear();

    // Draw clusters
    for (const c of this.clusters) {
      // Faint halo
      dot(this.galaxyGfx, c.x, c.y, c.radius * 1.4, c.color, 0.025);
      for (const s of c.stars) {
        s.phase += dt * (0.3 + Math.random() * 0.1);
        const a = s.alpha * (0.6 + 0.4 * Math.abs(Math.sin(s.phase)));
        dot(this.galaxyGfx, c.x + s.dx, c.y + s.dy, s.size, c.color, a);
      }
    }

    // Draw galaxies as layered ellipses + arm dots
    for (const gal of this.galaxies) {
      gal.rotation += gal.rotSpeed * dt;
      const cos = Math.cos(gal.angle + gal.rotation);
      const sin = Math.sin(gal.angle + gal.rotation);

      // Core glow (multiple layers)
      for (let layer = 3; layer >= 0; layer--) {
        const scale = 1 - layer * 0.18;
        const rx = gal.scaleX * scale;
        const ry = gal.scaleY * scale;
        const layerAlpha = gal.alpha * (0.15 + layer * 0.25);
        // Draw ellipse rotated manually via point samples
        const dotAlpha = layerAlpha * 0.4;
        for (let i = 0; i < GAL_ELLIPSE_STEPS; i++) {
          const ex = rx * GAL_ELLIPSE_COS[i];
          const ey = ry * GAL_ELLIPSE_SIN[i];
          const rx2 = ex * cos - ey * sin + gal.x;
          const ry2 = ex * sin + ey * cos + gal.y;
          dot(this.galaxyGfx, rx2, ry2, 0.8, gal.color, dotAlpha);
        }
      }

      // Central bright core
      dot(
        this.galaxyGfx,
        gal.x,
        gal.y,
        gal.scaleY * 0.5,
        0xffffff,
        gal.alpha * 0.6,
      );
      dot(
        this.galaxyGfx,
        gal.x,
        gal.y,
        gal.scaleY * 1.1,
        gal.color,
        gal.alpha * 1.2,
      );

      // Spiral arm dots
      for (let arm = 0; arm < gal.arms; arm++) {
        // Every sample on an arm shares this base angle, so its sin/cos are
        // hoisted and combined with the table entries via the angle-sum rule
        const base = (arm / gal.arms) * Math.PI * 2 + gal.rotation * 0.4;
        const baseCos = Math.cos(base);
        const baseSin = Math.sin(base);
        for (let j = 0; j < GAL_ARM_STEPS; j++) {
          const t = j / GAL_ARM_STEPS;
          const taCos = baseCos * GAL_ARM_COS[j] - baseSin * GAL_ARM_SIN[j];
          const taSin = baseSin * GAL_ARM_COS[j] + baseCos * GAL_ARM_SIN[j];
          const r = t * gal.scaleX;
          const ex = r * taCos * 0.9;
          const ey = r * taSin * 0.35;
          const rx2 = ex * cos - ey * sin + gal.x;
          const ry2 = ex * sin + ey * cos + gal.y;
          dot(
            this.galaxyGfx,
            rx2,
            ry2,
            0.7 + t * 1.0,
            gal.color,
            gal.alpha * (1 - t * 0.6) * 1.5,
          );
        }
      }
    }
  }

  // ── Stars ─────────────────────────────────────────────────────────────────

  private spawnStars(): void {
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 3200,
        y: (Math.random() - 0.5) * 2000,
        size: 0.3 + Math.random() * 2.0,
        alpha: 0.12 + Math.random() * 0.65,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.3 + Math.random() * 1.6,
        color: randomFrom(STAR_COLORS),
      });
    }
  }

  private drawStars(dt: number): void {
    this.starGfx.clear();
    for (const s of this.stars) {
      s.twinklePhase += s.twinkleSpeed * dt;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(s.twinklePhase));
      const a = s.alpha * tw;
      dot(this.starGfx, s.x, s.y, s.size, s.color, a);
      if (s.size > 1.2) {
        dot(this.starGfx, s.x, s.y, s.size * 2.8, s.color, a * 0.1);
      }
    }
  }

  // ── Orbit rings (dashed) ──────────────────────────────────────────────────

  private drawOrbitRings(): void {
    // The rings are pure geometry derived from the planet ellipses, which only
    // change on resize. Re-stroking ~180 dashes per planet every frame was by
    // far the heaviest layer in the scene, so the Graphics is left untouched
    // (and therefore not re-tessellated) until `buildPlanets` marks it dirty.
    if (!this.orbitRingsDirty) return;
    this.orbitRingsDirty = false;

    this.orbitRingGfx.clear();
    if (this.maxOrbitR === 0) return;
    for (const p of this.planets) {
      drawDashedOrbit(this.orbitRingGfx, p.a, p.b, p.e, p.inc, p.color, 0.14);
      // Mark apogee and perigee dots
      const apogeeTA = Math.PI;
      const periTA = 0;
      for (const ta of [apogeeTA, periTA]) {
        const pos = orbitPos(p.a, p.e, ta);
        const rp = rotate(pos.x, pos.y, p.inc);
        const isApogee = ta === apogeeTA;
        this.orbitRingGfx.circle(rp.x, rp.y, 2.2).stroke({
          color: p.color,
          alpha: isApogee ? 0.45 : 0.65,
          width: 0.8,
        });
      }
    }
  }

  // ── Planet building ───────────────────────────────────────────────────────

  private buildPlanets(): void {
    this.planets.length = 0;
    this.trailHead.fill(0);
    this.trailCount.fill(0);
    this.orbitRingsDirty = true;
    if (this.maxOrbitR === 0) return;
    for (const def of PLANET_DEFS) {
      const a = def.semiMajorFrac * this.maxOrbitR;
      const e = def.eccentricity;
      const b = a * Math.sqrt(1 - e * e);
      const moons: Moon[] = def.moons.map((m) => ({
        angle: Math.random() * Math.PI * 2,
        speed: (Math.PI * 2) / m.period,
        orbitR: m.orbitFrac * def.size * 9,
        size: m.size,
        color: m.color,
      }));
      // Trail samples are allocated once here and then overwritten in place
      const trail: Array<{ x: number; y: number }> = new Array(def.trailLen);
      for (let i = 0; i < def.trailLen; i++) trail[i] = { x: 0, y: 0 };
      this.planets.push({
        a,
        b,
        e,
        inc: def.inclination,
        foci: a * e,
        meanAnomaly: Math.random() * Math.PI * 2,
        meanMotion: (Math.PI * 2) / def.period,
        size: def.size,
        color: def.color,
        atmoColor: def.atmoColor,
        hasRings: def.hasRings,
        ringColor: def.ringColor,
        pulsePhase: Math.random() * Math.PI * 2,
        moons,
        trail,
        trailLen: def.trailLen,
        px: 0,
        py: 0,
      });
    }
  }

  private updatePlanets(dt: number): void {
    if (this.maxOrbitR === 0) return;
    this.trailGfx.clear();
    this.planetGfx.clear();

    for (let pi = 0; pi < this.planets.length; pi++) {
      const p = this.planets[pi];
      p.meanAnomaly += p.meanMotion * dt;
      p.pulsePhase += dt * 0.7;

      const trueAnomaly = keplerTrueAnomaly(p.meanAnomaly, p.e);
      const pos = orbitPos(p.a, p.e, trueAnomaly);
      const rp = rotate(pos.x, pos.y, p.inc);
      p.px = rp.x;
      p.py = rp.y;

      // trail — advance the ring buffer and overwrite the retired sample
      let count = this.trailCount[pi];
      let head: number;
      if (count < p.trailLen) {
        head = count;
        count++;
      } else {
        head = this.trailHead[pi] + 1;
        if (head === p.trailLen) head = 0;
      }
      this.trailHead[pi] = head;
      this.trailCount[pi] = count;
      const newest = p.trail[head];
      newest.x = p.px;
      newest.y = p.py;

      // walk oldest -> newest so the fade matches the old push/shift ordering
      const oldest =
        count < p.trailLen ? 0 : head + 1 === p.trailLen ? 0 : head + 1;
      for (let i = 1; i < count; i++) {
        const tf = i / count;
        let ti = oldest + i;
        if (ti >= p.trailLen) ti -= p.trailLen;
        const tp = p.trail[ti];
        dot(
          this.trailGfx,
          tp.x,
          tp.y,
          p.size * tf * 0.32,
          p.color,
          tf * tf * 0.22,
        );
      }

      // atmosphere
      const glowPulse = 1 + 0.07 * Math.sin(p.pulsePhase);
      this.planetGfx
        .circle(p.px, p.py, p.size * 2.4 * glowPulse)
        .fill({ color: p.atmoColor, alpha: 0.1 });
      this.planetGfx
        .circle(p.px, p.py, p.size * 1.6 * glowPulse)
        .fill({ color: p.atmoColor, alpha: 0.16 });

      // rings
      if (p.hasRings) {
        const ringW = p.size * 2.6;
        const ringH = p.size * 0.42;
        this.planetGfx
          .ellipse(p.px, p.py, ringW, ringH)
          .stroke({ color: p.ringColor, alpha: 0.6, width: 2.8 });
        this.planetGfx
          .ellipse(p.px, p.py, ringW * 1.4, ringH * 1.4)
          .stroke({ color: p.ringColor, alpha: 0.2, width: 1.2 });
      }

      // planet body
      this.planetGfx.circle(p.px, p.py, p.size).fill({ color: p.color });
      this.planetGfx
        .circle(p.px - p.size * 0.3, p.py - p.size * 0.3, p.size * 0.36)
        .fill({ color: 0xffffff, alpha: 0.17 });

      // apogee/perigee distance indicator (thin line from planet to apogee marker)
      const apogeePos = orbitPos(p.a, p.e, Math.PI);
      const aRot = rotate(apogeePos.x, apogeePos.y, p.inc);
      this.planetGfx
        .moveTo(p.px, p.py)
        .lineTo(aRot.x, aRot.y)
        .stroke({ color: p.color, alpha: 0.04, width: 0.4 });

      // moons
      for (const m of p.moons) {
        m.angle += m.speed * dt;
        const mx = p.px + Math.cos(m.angle) * m.orbitR;
        const my = p.py + Math.sin(m.angle) * m.orbitR;
        this.planetGfx
          .circle(mx, my, m.size)
          .fill({ color: m.color, alpha: 0.88 });
        this.planetGfx
          .circle(mx, my, m.size * 1.8)
          .fill({ color: m.color, alpha: 0.09 });
      }
    }
  }

  // ── Sun ───────────────────────────────────────────────────────────────────

  private drawSun(): void {
    this.sunGfx.clear();
    if (this.maxOrbitR === 0) return;
    const sunR = this.maxOrbitR * 0.075;
    const pulse = 1 + 0.04 * Math.sin(this.time * 1.3);
    const flarePulse = 1 + 0.14 * Math.sin(this.time * 0.55);

    this.sunGfx
      .circle(0, 0, sunR * 5.0 * flarePulse)
      .fill({ color: SUN_CORONA, alpha: 0.025 });
    this.sunGfx
      .circle(0, 0, sunR * 3.2 * pulse)
      .fill({ color: SUN_MID, alpha: 0.06 });
    this.sunGfx
      .circle(0, 0, sunR * 2.0 * pulse)
      .fill({ color: SUN_MID, alpha: 0.14 });

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.time * 0.07;
      const lx = Math.cos(a) * sunR * 1.7 * flarePulse;
      const ly = Math.sin(a) * sunR * 1.7 * flarePulse;
      this.sunGfx
        .circle(lx, ly, sunR * 0.38)
        .fill({ color: SUN_MID, alpha: 0.22 });
    }

    this.sunGfx.circle(0, 0, sunR * pulse).fill({ color: SUN_CORE });
    this.sunGfx
      .circle(0, 0, sunR * 0.62)
      .fill({ color: 0xffffff, alpha: 0.55 });

    for (let i = 0; i < 5; i++) {
      const sa = this.time * 0.2 + i * 1.26;
      const sr = sunR * (0.3 + 0.55 * Math.abs(Math.sin(i * 1.9)));
      const col = lerpColor(
        SUN_MID,
        SUN_CORE,
        Math.abs(Math.sin(this.time + i)),
      );
      this.sunGfx
        .circle(Math.cos(sa) * sr * 0.55, Math.sin(sa) * sr * 0.55, sunR * 0.13)
        .fill({ color: col, alpha: 0.6 });
    }
  }

  // ── Asteroid belts ────────────────────────────────────────────────────────

  private buildAsteroidBelt(
    target: Asteroid[],
    count: number,
    innerFrac: number,
    outerFrac: number,
    minEcc: number,
    maxEcc: number,
  ): void {
    target.length = 0;
    if (this.maxOrbitR === 0) return;
    const innerA = innerFrac * this.maxOrbitR;
    const outerA = outerFrac * this.maxOrbitR;
    const baseMotion = 0.08 + 0.5 * ((1 / (innerFrac + outerFrac)) * 2);
    for (let i = 0; i < count; i++) {
      const a = innerA + Math.random() * (outerA - innerA);
      const e = minEcc + Math.random() * (maxEcc - minEcc);
      target.push({
        a,
        e,
        inc: (Math.random() - 0.5) * 0.5,
        meanAnomaly: Math.random() * Math.PI * 2,
        meanMotion: baseMotion * (0.8 + Math.random() * 0.4),
        offsetR: (Math.random() - 0.5) * 6,
        size: 0.7 + Math.random() * 1.6,
        alpha: 0.2 + Math.random() * 0.4,
        color: randomFrom([
          CATT_OVERLAY0,
          CATT_SURFACE0,
          CATT_ROSEWATER,
          CATT_FLAMINGO,
          CATT_TEAL,
        ]),
      });
    }
  }

  private drawAsteroidBelt(belt: Asteroid[], dt: number): void {
    if (this.maxOrbitR === 0) return;
    for (const a of belt) {
      a.meanAnomaly += a.meanMotion * dt;
      const ta = keplerTrueAnomaly(a.meanAnomaly, a.e);
      // orbitPos() and rotate() each return a fresh {x, y}; inlined here because
      // the three belts together push 200 bodies through this loop every frame
      const r = (a.a * (1 - a.e * a.e)) / (1 + a.e * Math.cos(ta));
      const ox = r * Math.cos(ta) + a.offsetR;
      const oy = r * Math.sin(ta);
      const ic = Math.cos(a.inc);
      const is = Math.sin(a.inc);
      dot(
        this.asteroidGfx,
        ox * ic - oy * is,
        ox * is + oy * ic,
        a.size,
        a.color,
        a.alpha,
      );
    }
  }

  // ── Pulsars ───────────────────────────────────────────────────────────────

  private spawnPulsars(): void {
    const PULSAR_COLORS = [
      CATT_SKY,
      CATT_TEAL,
      CATT_LAVENDER,
      0xffffff,
    ] as const;
    for (let i = 0; i < PULSAR_COUNT; i++) {
      const angle = (i / PULSAR_COUNT) * Math.PI * 2 + 0.8;
      const dist = 580 + Math.random() * 320;
      this.pulsars.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.7,
        phase: Math.random() * Math.PI * 2,
        rotSpeed: 8 + Math.random() * 18, // fast spin
        beamLen: 60 + Math.random() * 80,
        color: randomFrom(PULSAR_COLORS),
        pulseTimer: Math.random() * 2,
        pulsePeriod: 0.4 + Math.random() * 1.2,
        burstAlpha: 0,
        size: 2.5 + Math.random() * 2,
      });
    }
  }

  private drawPulsars(dt: number): void {
    this.pulsarGfx.clear();
    for (const p of this.pulsars) {
      p.phase += p.rotSpeed * dt;
      p.pulseTimer += dt;
      p.burstAlpha = Math.max(0, p.burstAlpha - dt * 3.5);

      if (p.pulseTimer >= p.pulsePeriod) {
        p.pulseTimer = 0;
        p.burstAlpha = 1.0;
      }

      // Rotating beams (two opposites)
      for (let beam = 0; beam < 2; beam++) {
        const ba = p.phase + beam * Math.PI;
        const bx = Math.cos(ba) * p.beamLen;
        const by = Math.sin(ba) * p.beamLen;
        // Beam fade toward tip
        for (let j = 1; j <= 12; j++) {
          const t = j / 12;
          this.pulsarGfx
            .moveTo(p.x, p.y)
            .lineTo(p.x + bx * t, p.y + by * t)
            .stroke({ color: p.color, alpha: (1 - t) * 0.35, width: 1.5 - t });
        }
      }

      // Burst pulse ring
      if (p.burstAlpha > 0) {
        const br = p.beamLen * 0.6 * (1 - p.burstAlpha * 0.5);
        this.pulsarGfx
          .circle(p.x, p.y, br)
          .stroke({ color: p.color, alpha: p.burstAlpha * 0.7, width: 1.2 });
        this.pulsarGfx
          .circle(p.x, p.y, br * 0.4)
          .fill({ color: p.color, alpha: p.burstAlpha * 0.5 });
      }

      // Core neutron star
      this.pulsarGfx
        .circle(p.x, p.y, p.size * 1.8)
        .fill({ color: p.color, alpha: 0.15 });
      this.pulsarGfx
        .circle(p.x, p.y, p.size)
        .fill({ color: 0xffffff, alpha: 0.9 });
    }
  }

  // ── Quasars ───────────────────────────────────────────────────────────────

  private spawnQuasars(): void {
    const QUASAR_COLORS = [
      CATT_MAUVE,
      CATT_FLAMINGO,
      CATT_PEACH,
      CATT_YELLOW,
      CATT_BLUE,
    ] as const;
    const QUASAR_CORE_COLORS = [
      0xffffff,
      CATT_ROSEWATER,
      CATT_LAVENDER,
      CATT_YELLOW,
    ] as const;
    for (let i = 0; i < QUASAR_COUNT; i++) {
      const angle = (i / QUASAR_COUNT) * Math.PI * 2 + 1.4;
      const dist = 500 + Math.random() * 380;
      this.quasars.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.65,
        color: randomFrom(QUASAR_COLORS),
        coreColor: randomFrom(QUASAR_CORE_COLORS),
        size: 3.5 + Math.random() * 4,
        jetAngle: Math.random() * Math.PI,
        jetLen: 80 + Math.random() * 120,
        phase: Math.random() * Math.PI * 2,
        flickerSpeed: 1.5 + Math.random() * 3.0,
        alpha: 0.7 + Math.random() * 0.3,
        diskAngle: Math.random() * Math.PI,
      });
    }
  }

  private drawQuasars(dt: number): void {
    this.quasarGfx.clear();
    for (const q of this.quasars) {
      q.phase += q.flickerSpeed * dt;
      q.diskAngle += 0.15 * dt;
      const flicker = 0.75 + 0.25 * Math.abs(Math.sin(q.phase));

      // Bipolar relativistic jets (two opposite narrow cones)
      for (let dir = 0; dir < 2; dir++) {
        const ja = q.jetAngle + dir * Math.PI;
        const perpA = ja + Math.PI * 0.5;
        for (let j = 0; j < 8; j++) {
          const t = (j + 1) / 8;
          const spread = t * q.size * 0.5;
          const jx = q.x + Math.cos(ja) * q.jetLen * t;
          const jy = q.y + Math.sin(ja) * q.jetLen * t;
          const px = Math.cos(perpA) * spread;
          const py = Math.sin(perpA) * spread;
          this.quasarGfx
            .moveTo(q.x, q.y)
            .lineTo(jx + px, jy + py)
            .stroke({
              color: q.color,
              alpha: (1 - t) * 0.45 * flicker,
              width: 0.8,
            });
          this.quasarGfx
            .moveTo(q.x, q.y)
            .lineTo(jx - px, jy - py)
            .stroke({
              color: q.color,
              alpha: (1 - t) * 0.45 * flicker,
              width: 0.8,
            });
        }
        // Bright jet spine
        this.quasarGfx
          .moveTo(q.x, q.y)
          .lineTo(q.x + Math.cos(ja) * q.jetLen, q.y + Math.sin(ja) * q.jetLen)
          .stroke({ color: 0xffffff, alpha: 0.35 * flicker, width: 0.6 });
      }

      // Accretion disk (rotated thin ellipse)
      const dCos = Math.cos(q.diskAngle),
        dSin = Math.sin(q.diskAngle);
      const dr = q.size * 2.2;
      const diskAlpha = 0.35 * flicker * q.alpha;
      for (let i = 0; i < QUASAR_DISK_STEPS; i++) {
        const ex = dr * QUASAR_DISK_COS[i];
        const ey = dr * 0.28 * QUASAR_DISK_SIN[i];
        const rx = ex * dCos - ey * dSin + q.x;
        const ry = ex * dSin + ey * dCos + q.y;
        dot(this.quasarGfx, rx, ry, 0.7, q.color, diskAlpha);
      }

      // Glow layers
      dot(this.quasarGfx, q.x, q.y, q.size * 4, q.color, 0.06 * flicker);
      dot(this.quasarGfx, q.x, q.y, q.size * 2, q.color, 0.15 * flicker);
      // Core blazar point
      dot(this.quasarGfx, q.x, q.y, q.size, q.coreColor, q.alpha * flicker);
      dot(this.quasarGfx, q.x, q.y, q.size * 0.4, 0xffffff, flicker);
    }
  }

  // ── Comets ────────────────────────────────────────────────────────────────

  private spawnComet(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    const side = Math.floor(Math.random() * 4);
    let sx: number, sy: number;
    if (side === 0) {
      sx = -hw - 40;
      sy = (Math.random() - 0.5) * hh * 2;
    } else if (side === 1) {
      sx = hw + 40;
      sy = (Math.random() - 0.5) * hh * 2;
    } else if (side === 2) {
      sx = (Math.random() - 0.5) * hw * 2;
      sy = -hh - 40;
    } else {
      sx = (Math.random() - 0.5) * hw * 2;
      sy = hh + 40;
    }
    const targetX = (Math.random() - 0.5) * hw * 0.5;
    const targetY = (Math.random() - 0.5) * hh * 0.5;
    const speed = 300 + Math.random() * 250;
    const dx = targetX - sx,
      dy = targetY - sy;
    const len = Math.hypot(dx, dy);
    const maxLife = (len / speed) * 3.8;
    this.comets.push({
      x: sx,
      y: sy,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      life: 0,
      maxLife,
      size: 2.5 + Math.random() * 3.5,
      color: randomFrom([
        CATT_ROSEWATER,
        CATT_LAVENDER,
        CATT_SKY,
        0xffffff,
        CATT_TEAL,
      ]),
      trailPoints: [],
    });
  }

  private drawComets(dt: number): void {
    this.cometGfx.clear();
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.life += dt;
      if (c.life >= c.maxLife) {
        this.comets.splice(i, 1);
        continue;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.trailPoints.push({ x: c.x, y: c.y });
      if (c.trailPoints.length > 65) c.trailPoints.shift();

      const prog = c.life / c.maxLife;
      const a = (1 - prog) * 0.92;

      for (let j = 1; j < c.trailPoints.length; j++) {
        const tf = j / c.trailPoints.length;
        const tp = c.trailPoints[j];
        dot(
          this.cometGfx,
          tp.x,
          tp.y,
          c.size * tf * 0.55,
          c.color,
          tf * tf * a * 0.5,
        );
      }
      dot(this.cometGfx, c.x, c.y, c.size * 3.0, c.color, a * 0.18);
      dot(this.cometGfx, c.x, c.y, c.size, c.color, a);
      dot(this.cometGfx, c.x, c.y, c.size * 0.4, 0xffffff, a * 0.85);
    }
  }

  // ── Black hole ────────────────────────────────────────────────────────────

  private spawnBlackHole(): void {
    if (this.w === 0) return;
    // Place it far from the solar system — upper-right corner area
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    this.blackHole = {
      x: hw * 0.72,
      y: -hh * 0.65,
      accretionPhase: 0,
      swallowFlashes: [],
    };
  }

  private drawBlackHole(dt: number): void {
    this.blackHoleGfx.clear();
    const bh = this.blackHole;
    if (!bh) return;

    bh.accretionPhase += dt * 0.55;

    const r = BH_EVENT_HORIZON;

    // Gravitational lensing rings — faint distortion halos
    for (let ring = 4; ring >= 1; ring--) {
      const rr = r * (1 + ring * 0.9);
      const ringAlpha = 0.06 / ring;
      this.blackHoleGfx
        .circle(bh.x, bh.y, rr)
        .stroke({ color: 0xb4befe, alpha: ringAlpha, width: 1 });
    }

    // Photon sphere — bright thin ring right at the edge
    this.blackHoleGfx
      .circle(bh.x, bh.y, r * 1.18)
      .stroke({ color: 0xffffff, alpha: 0.35, width: 0.8 });

    // Accretion disk — two bright arcs rotating around the singularity
    for (let arc = 0; arc < 2; arc++) {
      const arcOff = arc * Math.PI + bh.accretionPhase;
      const diskRX = r * 3.2,
        diskRY = r * 0.55;
      // Sample angles are arcOff plus a fixed offset, so the per-sample sin/cos,
      // brightness, dot radius and colour all come from the precomputed tables
      const offCos = Math.cos(arcOff);
      const offSin = Math.sin(arcOff);
      for (let i = 0; i < BH_ARC_STEPS; i++) {
        const ex = (offCos * BH_ARC_COS[i] - offSin * BH_ARC_SIN[i]) * diskRX;
        const ey = (offSin * BH_ARC_COS[i] + offCos * BH_ARC_SIN[i]) * diskRY;
        const a =
          BH_ARC_SIN[i] *
          0.7 *
          (0.6 + 0.4 * Math.sin(bh.accretionPhase * 3 + i * 0.3));
        dot(
          this.blackHoleGfx,
          bh.x + ex,
          bh.y + ey,
          BH_ARC_RADIUS[i],
          BH_ARC_COLOR[i],
          a,
        );
      }
    }

    // Relativistic jet — faint bidirectional beam perpendicular to disk
    for (let dir = 0; dir < 2; dir++) {
      const jDir = dir === 0 ? -1 : 1;
      for (let j = 0; j < 10; j++) {
        const t = (j + 1) / 10;
        const jLen = r * 5.5 * t;
        const spread = t * r * 0.3;
        const ja = bh.accretionPhase * 0.05;
        const jx = bh.x + Math.sin(ja) * spread;
        const jy = bh.y + jDir * jLen;
        dot(this.blackHoleGfx, jx, jy, 0.7, 0xcba6f7, (1 - t) * 0.4);
      }
    }

    // Swallow flash events
    for (let i = bh.swallowFlashes.length - 1; i >= 0; i--) {
      const f = bh.swallowFlashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        bh.swallowFlashes.splice(i, 1);
        continue;
      }
      const fl = r * 1.6 * (1 - f.life / 0.5);
      dot(
        this.blackHoleGfx,
        bh.x + Math.cos(f.angle) * fl,
        bh.y + Math.sin(f.angle) * fl,
        2.5,
        f.color,
        (f.life / 0.5) * 0.9,
      );
    }

    // Singularity — pure black disc erasing everything underneath
    this.blackHoleGfx.circle(bh.x, bh.y, r).fill({ color: 0x000000, alpha: 1 });
    // Faint inner glow right at the edge (Hawking radiation flavour)
    this.blackHoleGfx.circle(bh.x, bh.y, r * 1.05).stroke({
      color: 0xcba6f7,
      alpha: 0.18 + 0.12 * Math.sin(bh.accretionPhase * 2.2),
      width: 1.2,
    });
  }

  // ── Boids ─────────────────────────────────────────────────────────────────

  private makeBoid(
    team: 0 | 1,
    x: number,
    y: number,
    isOffspring = false,
  ): Boid {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 60;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      team,
      health: isOffspring ? 2 : BOID_HEALTH,
      shootTimer: Math.random() * SHOOT_INTERVAL,
      wanderAngle: Math.random() * Math.PI * 2,
      size: isOffspring ? 1.8 : 2.8,
      isOffspring,
    };
  }

  private spawnBoids(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    // spawn near admiral if available, else fall back to quadrant
    const redAdm = this.admirals.find((a) => a.team === TEAM_RED);
    const blueAdm = this.admirals.find((a) => a.team === TEAM_BLUE);
    for (let i = 0; i < BOIDS_PER_TEAM; i++) {
      const ra = Math.random() * Math.PI * 2;
      const rd = Math.random() * ADMIRAL_SPAWN_RADIUS;
      this.boids.push(
        this.makeBoid(
          TEAM_RED,
          (redAdm?.x ?? -hw * 0.35) + Math.cos(ra) * rd,
          (redAdm?.y ?? -hh * 0.35) + Math.sin(ra) * rd,
        ),
      );
      const ba = Math.random() * Math.PI * 2;
      const bd = Math.random() * ADMIRAL_SPAWN_RADIUS;
      this.boids.push(
        this.makeBoid(
          TEAM_BLUE,
          (blueAdm?.x ?? hw * 0.35) + Math.cos(ba) * bd,
          (blueAdm?.y ?? hh * 0.35) + Math.sin(ba) * bd,
        ),
      );
    }
  }

  private reinforceBoids(): void {
    if (this.w === 0) return;
    const counts = [0, 0];
    for (const b of this.boids) counts[b.team]++;
    for (const team of [TEAM_RED, TEAM_BLUE] as const) {
      const needed = Math.max(0, 20 - counts[team]);
      const count = Math.min(REINFORCE_COUNT, needed + 2);
      const adm = this.admirals.find((a) => a.team === team);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = ADMIRAL_SPAWN_RADIUS * (0.5 + Math.random() * 0.5);
        const x = (adm?.x ?? 0) + Math.cos(a) * d;
        const y = (adm?.y ?? 0) + Math.sin(a) * d;
        this.boids.push(this.makeBoid(team, x, y));
      }
    }
  }

  private updateBoids(dt: number): void {
    if (this.w === 0 || this.boids.length === 0) return;
    this.boidsGfx.clear();
    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    const dead = this.deadBoids;
    dead.length = 0;

    // Neighbour lookups go through a spatial hash instead of scanning every
    // other boid. Distances are compared squared so the inner loop never calls
    // Math.hypot, which is an order of magnitude slower than a plain multiply.
    if (this.neighBuf.length < this.boids.length) {
      this.neighBuf = new Int32Array(this.boids.length * 2);
    }
    const neigh = this.neighBuf;
    this.grid.build(this.boids);

    const sepR2 = SEP_RADIUS * SEP_RADIUS;
    const aliR2 = ALI_RADIUS * ALI_RADIUS;
    const cohR2 = COH_RADIUS * COH_RADIUS;
    const detectR2 = DETECT_RANGE * DETECT_RANGE;
    const fireR2 = FIRE_RANGE * FIRE_RANGE;

    for (let i = 0; i < this.boids.length; i++) {
      const b = this.boids[i];
      b.shootTimer = Math.max(0, b.shootTimer - dt);

      // ── find nearest enemy and compute flock forces ──────────────────────
      let nearestEnemy: Boid | null = null;
      let nearestEnemyD2 = Infinity;
      let sepX = 0,
        sepY = 0,
        sepN = 0;
      let aliVX = 0,
        aliVY = 0,
        aliN = 0;
      let cohX = 0,
        cohY = 0,
        cohN = 0;

      const nCount = this.grid.query(b.x, b.y, neigh);
      for (let n = 0; n < nCount; n++) {
        const j = neigh[n];
        if (i === j) continue;
        const o = this.boids[j];
        const dx = b.x - o.x,
          dy = b.y - o.y;
        const d2 = dx * dx + dy * dy;

        if (o.team !== b.team) {
          if (d2 < nearestEnemyD2) {
            nearestEnemyD2 = d2;
            nearestEnemy = o;
          }
        } else if (d2 < cohR2) {
          // cohesion — widest radius, so it gates the tighter two
          cohX += o.x;
          cohY += o.y;
          cohN++;
          // alignment
          if (d2 < aliR2) {
            aliVX += o.vx;
            aliVY += o.vy;
            aliN++;
          }
          // separation
          if (d2 < sepR2) {
            const d = Math.sqrt(d2) || 0.001;
            sepX += dx / d;
            sepY += dy / d;
            sepN++;
          }
        }
      }

      // ── compute desired velocity ──────────────────────────────────────────
      let desVX = b.vx,
        desVY = b.vy;

      if (nearestEnemy !== null && nearestEnemyD2 < detectR2) {
        // attack: steer toward nearest enemy (with some separation preserved)
        const ex = nearestEnemy.x - b.x,
          ey = nearestEnemy.y - b.y;
        const el = Math.sqrt(nearestEnemyD2) || 1;
        desVX = (ex / el) * BOID_MAX_SPEED;
        desVY = (ey / el) * BOID_MAX_SPEED;
        // still apply separation from teammates
        if (sepN > 0) {
          desVX += (sepX / sepN) * 55;
          desVY += (sepY / sepN) * 55;
        }
        // fire
        if (nearestEnemyD2 < fireR2 && b.shootTimer <= 0) {
          b.shootTimer = SHOOT_INTERVAL;
          const ldir = el;
          this.lasers.push({
            x: b.x,
            y: b.y,
            vx: (ex / ldir) * LASER_SPEED,
            vy: (ey / ldir) * LASER_SPEED,
            team: b.team,
            life: LASER_LIFE,
          });
        }
      } else {
        // flock toward teammates
        if (sepN > 0) {
          desVX += (sepX / sepN) * 1.6 * BOID_MAX_SPEED;
          desVY += (sepY / sepN) * 1.6 * BOID_MAX_SPEED;
        }
        if (aliN > 0) {
          desVX += aliVX / aliN;
          desVY += aliVY / aliN;
        }
        if (cohN > 0) {
          desVX += (cohX / cohN - b.x) * 0.55;
          desVY += (cohY / cohN - b.y) * 0.55;
        }
        // wander: slight random heading drift
        b.wanderAngle += (Math.random() - 0.5) * 1.8 * dt;
        desVX += Math.cos(b.wanderAngle) * 28;
        desVY += Math.sin(b.wanderAngle) * 28;
      }

      // ── black hole gravity (applied before steering so it can't be clamped away) ──
      let bhPullWeight = 0; // 0 = no BH influence, 1 = fully captured
      if (this.blackHole) {
        const bh = this.blackHole;
        const gdx = bh.x - b.x,
          gdy = bh.y - b.y;
        const gdist = Math.sqrt(gdx * gdx + gdy * gdy) || 1;

        if (gdist < BH_SWALLOW_R) {
          bh.swallowFlashes.push({
            angle: Math.atan2(gdy, gdx),
            life: 0.5,
            color: TEAM_COLOR[b.team],
          });
          dead.push(i);
          continue;
        }

        // radial gravity (softened inverse-square)
        const gForce = BH_GRAVITY / (gdist * gdist + 200);
        b.vx += (gdx / gdist) * gForce * dt;
        b.vy += (gdy / gdist) * gForce * dt;

        // orbital correction: nudge tangential speed toward √(G/r) so boids orbit
        // rather than spiral straight in.  Influence fades beyond 650 px.
        const orbInfluence = Math.max(0, 1 - (gdist - BH_SWALLOW_R) / 1100);
        if (orbInfluence > 0) {
          const vOrb = Math.sqrt(BH_GRAVITY / gdist); // ideal circular-orbit speed

          // radial unit vector pointing FROM bh TOWARD boid
          const rx = -gdx / gdist,
            ry = -gdy / gdist;
          // pick tangential direction that matches the boid's current angular momentum
          const angMom = b.vx * -ry + b.vy * rx;
          const tSign = angMom >= 0 ? 1 : -1;
          const tx = -ry * tSign,
            ty = rx * tSign; // tangential unit vector

          // current speed projected onto tangential axis
          const curTan = b.vx * tx + b.vy * ty;
          // impulse closes the gap between current and orbital tangential speed
          const impulse = (vOrb - curTan) * orbInfluence * dt * 2.2;
          b.vx += tx * impulse;
          b.vy += ty * impulse;
        }

        // how much gravity suppresses combat/flock steering
        bhPullWeight = Math.max(0, Math.min(1, (1400 - gdist) / 1320));
      }

      // ── steer toward desired, clamped by max force ────────────────────────
      // gravity near BH increasingly overrides combat steering
      const steerScale = 1 - bhPullWeight;
      const steerX = (desVX - b.vx) * steerScale,
        steerY = (desVY - b.vy) * steerScale;
      const steerMag = Math.sqrt(steerX * steerX + steerY * steerY) || 1;
      const clampedF = Math.min(steerMag, BOID_MAX_FORCE * dt);
      b.vx += (steerX / steerMag) * clampedF;
      b.vy += (steerY / steerMag) * clampedF;

      // clamp to higher limit near BH so boids can actually spiral in fast
      const maxSpd = BOID_MAX_SPEED * (1 + bhPullWeight * 1.5);
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      if (spd > maxSpd) {
        b.vx = (b.vx / spd) * maxSpd;
        b.vy = (b.vy / spd) * maxSpd;
      }

      // minimum speed only when far from black hole
      if (spd < 20 && bhPullWeight < 0.1) {
        b.vx = (b.vx / spd) * 20;
        b.vy = (b.vy / spd) * 20;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // wrap around screen edges
      if (b.x > hw + 20) b.x = -hw - 20;
      else if (b.x < -hw - 20) b.x = hw + 20;
      if (b.y > hh + 20) b.y = -hh - 20;
      else if (b.y < -hh - 20) b.y = hh + 20;

      if (b.health <= 0) {
        dead.push(i);
        continue;
      }

      // ── draw ship ─────────────────────────────────────────────────────────
      drawShip(this.boidsGfx, b);
    }

    // remove dead boids (reverse to preserve indices)
    for (let i = dead.length - 1; i >= 0; i--) {
      const idx = dead[i];
      const b = this.boids[idx];
      this.spawnExplosion(b.x, b.y, TEAM_COLOR[b.team]);
      // split: small chance to spawn two offspring
      if (!b.isOffspring && Math.random() < SPLIT_CHANCE) {
        this.boids.push(
          this.makeBoid(
            b.team,
            b.x + (Math.random() - 0.5) * 12,
            b.y + (Math.random() - 0.5) * 12,
            true,
          ),
        );
        this.boids.push(
          this.makeBoid(
            b.team,
            b.x + (Math.random() - 0.5) * 12,
            b.y + (Math.random() - 0.5) * 12,
            true,
          ),
        );
      }
      this.boids.splice(idx, 1);
    }
  }

  // ── Lasers ────────────────────────────────────────────────────────────────

  private updateLasers(dt: number): void {
    this.laserGfx.clear();
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.lasers.splice(i, 1);
        continue;
      }

      const ox = l.x,
        oy = l.y;
      l.x += l.vx * dt;
      l.y += l.vy * dt;

      // hit detection against enemies
      let hit = false;
      for (const b of this.boids) {
        if (b.team === l.team) continue;
        const dx = b.x - l.x,
          dy = b.y - l.y;
        const hitR = b.size * 1.6;
        if (dx * dx + dy * dy < hitR * hitR) {
          b.health--;
          this.spawnImpactFlash(l.x, l.y, TEAM_COLOR[l.team]);
          this.lasers.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // draw laser bolt: bright line with glow
      const col = TEAM_LASER_COLOR[l.team];
      const prog = l.life / LASER_LIFE;
      this.laserGfx
        .moveTo(ox, oy)
        .lineTo(l.x, l.y)
        .stroke({ color: col, alpha: prog * 0.9, width: 2.2, cap: "round" });
      this.laserGfx
        .moveTo(ox, oy)
        .lineTo(l.x, l.y)
        .stroke({
          color: 0xffffff,
          alpha: prog * 0.5,
          width: 0.8,
          cap: "round",
        });
    }
  }

  // ── Explosions ────────────────────────────────────────────────────────────

  private spawnExplosion(x: number, y: number, color: number): void {
    const count = 10 + Math.floor(Math.random() * 10);
    const sparks: BoidExplosion["sparks"] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const spd = 35 + Math.random() * 110;
      sparks.push({
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 1 + Math.random() * 2.8,
        color: Math.random() < 0.5 ? color : 0xffffff,
      });
    }
    this.explosions.push({ x, y, life: 0.7, color, sparks });
  }

  private spawnImpactFlash(x: number, y: number, color: number): void {
    const sparks: BoidExplosion["sparks"] = [];
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      sparks.push({
        vx: Math.cos(a) * 60,
        vy: Math.sin(a) * 60,
        size: 0.8,
        color,
      });
    }
    this.explosions.push({ x, y, life: 0.2, color, sparks });
  }

  private drawExplosions(dt: number): void {
    this.explosionGfx.clear();
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.explosions.splice(i, 1);
        continue;
      }
      const prog = 1 - e.life / 0.7;
      for (const s of e.sparks) {
        const sx = e.x + s.vx * prog * 0.7;
        const sy = e.y + s.vy * prog * 0.7;
        const a = (1 - prog) * 0.95;
        dot(this.explosionGfx, sx, sy, s.size * (1 - prog * 0.6), s.color, a);
      }
      // central flash ring
      if (prog < 0.4) {
        this.explosionGfx
          .circle(e.x, e.y, prog * 22)
          .stroke({ color: e.color, alpha: (0.4 - prog) * 2.5, width: 1.5 });
      }
    }
  }

  // ── Admirals ──────────────────────────────────────────────────────────────

  private spawnAdmirals(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    this.admirals.length = 0;
    // Red admiral: upper-left; blue admiral: lower-right
    for (const [team, sx, sy] of [
      [TEAM_RED, -hw * 0.38, -hh * 0.38],
      [TEAM_BLUE, hw * 0.38, hh * 0.38],
    ] as const) {
      this.admirals.push({
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        team,
        health: ADMIRAL_HEALTH,
        maxHealth: ADMIRAL_HEALTH,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: ADMIRAL_WANDER_INTERVAL * Math.random(),
        shootTimer: 0,
        shieldPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  private updateAdmirals(dt: number): void {
    if (this.w === 0) return;
    this.admiralGfx.clear();
    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    for (const adm of this.admirals) {
      adm.shieldPhase += dt * 1.1;
      adm.shootTimer = Math.max(0, adm.shootTimer - dt);

      // ── wander: change heading periodically ──────────────────────────────
      adm.wanderTimer -= dt;
      if (adm.wanderTimer <= 0) {
        adm.wanderTimer = ADMIRAL_WANDER_INTERVAL * (0.6 + Math.random() * 0.8);
        adm.wanderAngle += (Math.random() - 0.5) * Math.PI * 1.2;
      }
      const targetVX = Math.cos(adm.wanderAngle) * ADMIRAL_SPEED;
      const targetVY = Math.sin(adm.wanderAngle) * ADMIRAL_SPEED;
      adm.vx += (targetVX - adm.vx) * dt * 1.8;
      adm.vy += (targetVY - adm.vy) * dt * 1.8;
      adm.x += adm.vx * dt;
      adm.y += adm.vy * dt;

      // soft boundary — bounce back from edges
      if (adm.x > hw * 0.9) {
        adm.vx -= 60 * dt;
        adm.wanderAngle = Math.PI - adm.wanderAngle;
      }
      if (adm.x < -hw * 0.9) {
        adm.vx += 60 * dt;
        adm.wanderAngle = Math.PI - adm.wanderAngle;
      }
      if (adm.y > hh * 0.9) {
        adm.vy -= 60 * dt;
        adm.wanderAngle = -adm.wanderAngle;
      }
      if (adm.y < -hh * 0.9) {
        adm.vy += 60 * dt;
        adm.wanderAngle = -adm.wanderAngle;
      }

      // ── black hole gravity on admiral ─────────────────────────────────────
      if (this.blackHole) {
        const bh = this.blackHole;
        const dx = bh.x - adm.x,
          dy = bh.y - adm.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = BH_GRAVITY / (d * d + 200);
        adm.vx += (dx / d) * f * dt;
        adm.vy += (dy / d) * f * dt;
        if (d < BH_SWALLOW_R) {
          adm.health = 0;
        }
      }

      if (adm.health <= 0) continue;

      // ── shoot at nearest enemy boid ───────────────────────────────────────
      if (adm.shootTimer <= 0) {
        // squared distances keep this scan off Math.hypot; only the winner
        // needs a square root, for the firing direction
        const admRange = DETECT_RANGE * 1.4;
        let nearestD2 = admRange * admRange;
        let nearestEnemy: Boid | null = null;
        for (const b of this.boids) {
          if (b.team === adm.team) continue;
          const bdx = b.x - adm.x,
            bdy = b.y - adm.y;
          const d2 = bdx * bdx + bdy * bdy;
          if (d2 < nearestD2) {
            nearestD2 = d2;
            nearestEnemy = b;
          }
        }
        if (nearestEnemy) {
          adm.shootTimer = ADMIRAL_SHOOT_INTERVAL;
          const dx = nearestEnemy.x - adm.x,
            dy = nearestEnemy.y - adm.y;
          const d = Math.sqrt(nearestD2) || 1;
          // admiral fires a burst of 3 lasers with slight spread
          for (let s = -1; s <= 1; s++) {
            const spread = s * 0.08;
            const cos = Math.cos(spread),
              sin2 = Math.sin(spread);
            this.lasers.push({
              x: adm.x,
              y: adm.y,
              vx: ((dx / d) * cos - (dy / d) * sin2) * LASER_SPEED * 1.2,
              vy: ((dx / d) * sin2 + (dy / d) * cos) * LASER_SPEED * 1.2,
              team: adm.team,
              life: LASER_LIFE * 1.4,
            });
          }
        }
      }

      // ── draw admiral ship ─────────────────────────────────────────────────
      drawAdmiralShip(this.admiralGfx, adm);
    }

    // remove dead admirals and respawn after delay
    let deadIdx = -1;
    for (let i = 0; i < this.admirals.length; i++) {
      if (this.admirals[i].health <= 0) {
        deadIdx = i;
        break;
      }
    }
    if (deadIdx !== -1) {
      const dead = this.admirals[deadIdx];
      this.spawnExplosion(dead.x, dead.y, TEAM_COLOR[dead.team]);
      this.spawnExplosion(dead.x + 10, dead.y - 8, TEAM_COLOR[dead.team]);
      this.admirals.splice(deadIdx, 1);
      // respawn after 8 seconds via a one-shot timer tracked in reinforceTimer
      // (simple approach: just add a new admiral immediately at a safe position)
      const hw2 = this.w * 0.5,
        hh2 = this.h * 0.5;
      const sx = dead.team === TEAM_RED ? -hw2 * 0.55 : hw2 * 0.55;
      const sy = dead.team === TEAM_RED ? -hh2 * 0.55 : hh2 * 0.55;
      this.admirals.push({
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        team: dead.team,
        health: ADMIRAL_HEALTH,
        maxHealth: ADMIRAL_HEALTH,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: ADMIRAL_WANDER_INTERVAL,
        shootTimer: 3,
        shieldPhase: 0,
      });
    }
  }
}
