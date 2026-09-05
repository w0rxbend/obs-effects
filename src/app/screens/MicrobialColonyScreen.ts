import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { mixHex as lerpColor } from "../../lib/color";
import { clamp, lerp, TAU, randRange as rand } from "../../lib/math";

const CRUST = 0x11111b;
const MANTLE = 0x181825;
const SURFACE0 = 0x1e1e2e;
const SURFACE1 = 0x313244;
const GREEN_0 = 0x11251a;
const GREEN_1 = 0x214a31;
const GREEN_2 = 0x3d7a4d;
const GREEN_3 = 0x7fd18f;
const GREEN_4 = 0xb8ffb7;
const ACID = 0xd9ff8b;
const CORE = 0xeaffc8;
const DAMAGE = 0xff8f80;

const INITIAL_PROTO_CELLS = 16;
const INITIAL_BACTERIA = 136;
const INITIAL_NUTRIENTS = 160;
const MAX_PROTO_CELLS = 24;
const MAX_BACTERIA = 220;
const MAX_DEBRIS = 260;
const COLONY_COUNT = 7;

// Neighbour-scan ranges. Every per-agent scan below is bounded by one of these,
// which is what lets the bucket grid stand in for the old all-pairs loops.
/**
 * Colony cohesion reaches 120 px. The grid is filled from the positions the
 * agents had when the frame's movement pass started, so the query adds a few px
 * of slack (nothing moves faster than ~2.3 px per frame) and can never hide a
 * neighbour the old full-array scan would have seen.
 */
const BACTERIA_SENSE_RADIUS = 128;
/** Beyond this a bacterium ignores food entirely, so nearest-food is bounded. */
const FOOD_SENSE_RADIUS = 180;
/** Two bacteria of the same colony are linked when they are this close. */
const COLONY_LINK_RANGE = 66;
/** Largest nutrient/debris `size` plus the contact slack each eat test allows. */
const NUTRIENT_REACH = 4.8 + 8;
const DEBRIS_REACH = 5.8 + 4;
const BACTERIA_GRID_CELL = 66;
const FOOD_GRID_CELL = 90;

/** Floats per colony link in the packed link buffer: ax, ay, bx, by, alpha. */
const LINK_STRIDE = 5;
/** Membrane outline resolution. Fixed, so its angles are tabulated once below. */
const PROTO_PATH_POINTS = 24;

// The membrane samples sit at the same 24 angles every frame for every cell, so
// the angle-only trig is computed once here instead of ~1150 times per frame.
const PROTO_PATH_COS = new Float64Array(PROTO_PATH_POINTS);
const PROTO_PATH_SIN = new Float64Array(PROTO_PATH_POINTS);
const PROTO_PATH_ANGLE3 = new Float64Array(PROTO_PATH_POINTS);
const PROTO_PATH_ANGLE5 = new Float64Array(PROTO_PATH_POINTS);
for (let i = 0; i < PROTO_PATH_POINTS; i++) {
  const angle = (i / PROTO_PATH_POINTS) * TAU;
  PROTO_PATH_COS[i] = Math.cos(angle);
  PROTO_PATH_SIN[i] = Math.sin(angle);
  PROTO_PATH_ANGLE3[i] = angle * 3;
  PROTO_PATH_ANGLE5[i] = angle * 5;
}

/**
 * Draw styles that never vary. Pixi copies whatever `fill`/`stroke` is handed
 * into its own style record, so sharing one object per style is safe and keeps
 * the draw pass from allocating a fresh literal for every shape it emits.
 */
const FLAGELLA_STROKE = { color: GREEN_3, width: 0.8, alpha: 0.35 };
const BACTERIA_CORE_FILL = { color: CORE, alpha: 0.18 };

type ProtoDiet = "hunter" | "scavenger";
type BacteriaShape = "rod" | "coccus" | "vibrio";

interface Organelle {
  orbit: number;
  distance: number;
  radius: number;
  phase: number;
  pulse: number;
  color: number;
}

interface ProtoCell {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  energy: number;
  health: number;
  age: number;
  divisionCooldown: number;
  phase: number;
  membraneJitter: number;
  nucleusAngle: number;
  nucleusDistance: number;
  nucleusRadius: number;
  organelles: Organelle[];
  diet: ProtoDiet;
  flash: number;
  engulf: number;
  dead: boolean;
}

interface Bacteria {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  energy: number;
  health: number;
  age: number;
  divisionCooldown: number;
  colonyId: number;
  shape: BacteriaShape;
  angle: number;
  turnRate: number;
  elongation: number;
  curvature: number;
  flagella: number;
  phase: number;
  flash: number;
  dead: boolean;
}

interface Nutrient {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  energy: number;
  pulse: number;
}

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: number;
  phase: number;
}

interface ColonyCenter {
  id: number;
  x: number;
  y: number;
  count: number;
}

interface MantleBlob {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: number;
  drift: number;
  phase: number;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function normalize(x: number, y: number, length = 1): { x: number; y: number } {
  const d = Math.hypot(x, y) || 1;
  return { x: (x / d) * length, y: (y / d) * length };
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function wrapAngle(angle: number): number {
  if (angle > Math.PI) return angle - TAU;
  if (angle < -Math.PI) return angle + TAU;
  return angle;
}

/**
 * Uniform bucket grid backing every neighbour scan in the simulation.
 *
 * The layout is a counting sort: `starts[c]` is the first slot of cell `c`
 * inside `items`, so no cell has a capacity limit and, once the arrays are big
 * enough for the population, rebuilding allocates nothing. `query` writes the
 * indices it finds into `hits`, which `build` sizes to the whole population so
 * a query can never silently drop a neighbour.
 */
class BucketGrid {
  /** Indices found by the most recent `query`, valid up to its return value. */
  public hits = new Int32Array(0);

  private cols = 1;
  private rows = 1;
  private cell = 1;
  private starts = new Int32Array(2);
  private cursor = new Int32Array(1);
  private items = new Int32Array(0);

  /** Size the grid to the play area. `cell` should be near the query radius. */
  public resize(width: number, height: number, cell: number): void {
    this.cell = Math.max(1, cell);
    this.cols = Math.max(1, Math.ceil(width / this.cell));
    this.rows = Math.max(1, Math.ceil(height / this.cell));
    const cells = this.cols * this.rows;
    if (this.starts.length < cells + 1) {
      this.starts = new Int32Array(cells + 1);
      this.cursor = new Int32Array(cells);
    }
  }

  /** Bucket `count` agents whose positions are packed as [x0, y0, x1, y1, ...]. */
  public build(xy: Float32Array, count: number): void {
    const cells = this.cols * this.rows;
    const starts = this.starts;
    const cursor = this.cursor;

    if (this.items.length < count) {
      this.items = new Int32Array(count);
      this.hits = new Int32Array(count);
    }

    starts.fill(0, 0, cells + 1);
    for (let i = 0; i < count; i++) {
      starts[this.cellOf(xy[i * 2], xy[i * 2 + 1]) + 1]++;
    }
    // Prefix sum turns the per-cell counts into slot offsets; `cursor` is the
    // write head each cell advances as its members are filed below.
    for (let c = 0; c < cells; c++) {
      starts[c + 1] += starts[c];
      cursor[c] = starts[c];
    }
    const items = this.items;
    for (let i = 0; i < count; i++) {
      items[cursor[this.cellOf(xy[i * 2], xy[i * 2 + 1])]++] = i;
    }
  }

  /** Collect every agent bucketed within `radius` of (x, y) into `hits`. */
  public query(x: number, y: number, radius: number): number {
    const cell = this.cell;
    const cols = this.cols;
    // Both ends are clamped, so a query starting off-screen still lands on the
    // edge cells rather than producing an empty column or row range.
    const c0 = clamp(Math.floor((x - radius) / cell), 0, cols - 1);
    const c1 = clamp(Math.floor((x + radius) / cell), 0, cols - 1);
    const r0 = clamp(Math.floor((y - radius) / cell), 0, this.rows - 1);
    const r1 = clamp(Math.floor((y + radius) / cell), 0, this.rows - 1);
    const starts = this.starts;
    const items = this.items;
    const hits = this.hits;

    let n = 0;
    for (let r = r0; r <= r1; r++) {
      const row = r * cols;
      for (let c = c0; c <= c1; c++) {
        const ci = row + c;
        const end = starts[ci + 1];
        for (let k = starts[ci]; k < end; k++) hits[n++] = items[k];
      }
    }
    return n;
  }

  /** Agents that drift off-screen are filed in the nearest edge cell, and a
   *  query from out there clamps to the same cell, so nothing is ever missed. */
  private cellOf(x: number, y: number): number {
    const col = clamp(Math.floor(x / this.cell), 0, this.cols - 1);
    const row = clamp(Math.floor(y / this.cell), 0, this.rows - 1);
    return row * this.cols + col;
  }
}

export class MicrobialColonyScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;
  private protoId = 0;
  private bacteriaId = 0;
  private protoCells: ProtoCell[] = [];
  private bacteria: Bacteria[] = [];
  private nutrients: Nutrient[] = [];
  private debris: Debris[] = [];
  private mantle: MantleBlob[] = [];

  // The seven colony centres are recomputed in place every frame rather than
  // rebuilt, so nothing downstream ever sees a different array identity.
  private readonly colonyCenters: ColonyCenter[] = Array.from(
    { length: COLONY_COUNT },
    (_, id) => ({ id, x: 0, y: 0, count: 0 }),
  );

  // Colony links live in one packed buffer (ax, ay, bx, by, alpha per link) that
  // grows on demand, instead of an array of fresh objects rebuilt every frame.
  private colonyLinks = new Float32Array(4096 * LINK_STRIDE);
  private colonyLinkCount = 0;

  // Neighbour grids plus the packed [x, y, ...] buffers they index. Sized once
  // per population growth; a frame reuses them without allocating.
  private readonly bacteriaGrid = new BucketGrid();
  private readonly nutrientGrid = new BucketGrid();
  private readonly debrisGrid = new BucketGrid();
  private bacteriaXY: Float32Array = new Float32Array(MAX_BACTERIA * 2);
  private nutrientXY: Float32Array = new Float32Array(INITIAL_NUTRIENTS * 2);
  private debrisXY: Float32Array = new Float32Array(MAX_DEBRIS * 2);

  // Membrane outlines are traced twice each (fill then stroke), so both scales
  // are kept in reusable buffers instead of arrays of point objects.
  private readonly protoOuterPath = new Float32Array(PROTO_PATH_POINTS * 2);
  private readonly protoInnerPath = new Float32Array(PROTO_PATH_POINTS * 2);

  // Draw styles whose colour or alpha varies. See the note on FLAGELLA_STROKE.
  private readonly nutrientGlowFill = { color: GREEN_2, alpha: 0 };
  private readonly nutrientCoreFill = { color: ACID, alpha: 0 };
  private readonly colonyLinkStroke = { color: GREEN_2, width: 1.4, alpha: 0 };
  private readonly debrisFill = { color: GREEN_3, alpha: 0 };
  private readonly bacteriaGlowFill = { color: GREEN_2, alpha: 0.16 };
  private readonly bacteriaBodyFill = { color: GREEN_3, alpha: 0.46 };
  private readonly organelleGlowFill = { color: GREEN_2, alpha: 0 };
  private readonly organelleCoreFill = { color: GREEN_2, alpha: 0 };

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    if (this.mantle.length === 0) this.seedBackground();
    if (this.protoCells.length === 0) this.seedSimulation();
  }

  public resize(width: number, height: number): void {
    const nextW = Math.max(1, width);
    const nextH = Math.max(1, height);
    const changed = nextW !== this.w || nextH !== this.h;

    this.w = nextW;
    this.h = nextH;
    this.x = 0;
    this.y = 0;

    if (changed) {
      this.seedBackground();
      this.seedSimulation();
    }
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS / 1000, 0.04);
    this.time += dt;

    this.updateNutrients(dt);
    this.updateDebris(dt);
    this.updateProtoCells(dt);
    this.updateBacteria(dt);
    this.resolvePredation(dt);
    this.updateColonyCenters();
    this.rebuildColonyLinks();
    this.spawnAmbientNutrients();
    this.draw();
  }

  private seedBackground(): void {
    this.mantle = [];
    for (let i = 0; i < 18; i++) {
      this.mantle.push({
        x: rand(0, this.w),
        y: rand(0, this.h),
        radius: rand(120, 420),
        alpha: rand(0.04, 0.15),
        color: pick([MANTLE, SURFACE0, GREEN_0, GREEN_1]),
        drift: rand(10, 48),
        phase: rand(0, TAU),
      });
    }
  }

  private seedSimulation(): void {
    this.protoCells = [];
    this.bacteria = [];
    this.nutrients = [];
    this.debris = [];
    this.colonyLinkCount = 0;

    this.bacteriaGrid.resize(this.w, this.h, BACTERIA_GRID_CELL);
    this.nutrientGrid.resize(this.w, this.h, FOOD_GRID_CELL);
    this.debrisGrid.resize(this.w, this.h, FOOD_GRID_CELL);

    const colonySeeds = Array.from({ length: COLONY_COUNT }, (_, id) => ({
      id,
      x: rand(180, this.w - 180),
      y: rand(180, this.h - 180),
    }));

    for (let i = 0; i < INITIAL_NUTRIENTS; i++) {
      this.nutrients.push(this.makeNutrient());
    }

    for (let i = 0; i < INITIAL_PROTO_CELLS; i++) {
      this.protoCells.push(this.makeProtoCell());
    }

    for (let i = 0; i < INITIAL_BACTERIA; i++) {
      const seed = colonySeeds[i % colonySeeds.length];
      this.bacteria.push(this.makeBacteria(seed.id, seed.x, seed.y));
    }

    this.updateColonyCenters();
    this.rebuildColonyLinks();
    this.draw();
  }

  private makeProtoCell(
    x = rand(140, this.w - 140),
    y = rand(140, this.h - 140),
  ): ProtoCell {
    const radius = rand(24, 44);
    const organelleCount = Math.floor(rand(4, 8));
    const organelles: Organelle[] = [];
    for (let i = 0; i < organelleCount; i++) {
      organelles.push({
        orbit: rand(0, TAU),
        distance: rand(radius * 0.18, radius * 0.52),
        radius: rand(radius * 0.08, radius * 0.18),
        phase: rand(0, TAU),
        pulse: rand(0.8, 1.6),
        color: pick([GREEN_2, GREEN_3, ACID]),
      });
    }

    return {
      id: this.protoId++,
      x,
      y,
      vx: rand(-24, 24),
      vy: rand(-24, 24),
      radius,
      energy: rand(68, 94),
      health: 100,
      age: rand(0, 30),
      divisionCooldown: rand(6, 16),
      phase: rand(0, TAU),
      membraneJitter: rand(0.12, 0.28),
      nucleusAngle: rand(0, TAU),
      nucleusDistance: rand(radius * 0.08, radius * 0.18),
      nucleusRadius: radius * rand(0.22, 0.3),
      organelles,
      diet: Math.random() < 0.7 ? "hunter" : "scavenger",
      flash: 0,
      engulf: 0,
      dead: false,
    };
  }

  private makeBacteria(
    colonyId: number,
    seedX = rand(160, this.w - 160),
    seedY = rand(160, this.h - 160),
    angle = rand(0, TAU),
  ): Bacteria {
    const radius = rand(5.5, 10.5);
    return {
      id: this.bacteriaId++,
      x: seedX + Math.cos(angle) * rand(0, 90),
      y: seedY + Math.sin(angle) * rand(0, 90),
      vx: rand(-22, 22),
      vy: rand(-22, 22),
      radius,
      energy: rand(10, 18),
      health: 100,
      age: rand(0, 24),
      divisionCooldown: rand(2.5, 7),
      colonyId,
      shape: pick(["rod", "rod", "coccus", "vibrio"]),
      angle: rand(0, TAU),
      turnRate: rand(-1.6, 1.6),
      elongation: rand(1.4, 2.6),
      curvature: rand(-0.8, 0.8),
      flagella: Math.floor(rand(1, 4)),
      phase: rand(0, TAU),
      flash: 0,
      dead: false,
    };
  }

  private makeNutrient(x = rand(0, this.w), y = rand(0, this.h)): Nutrient {
    return {
      x,
      y,
      vx: rand(-10, 10),
      vy: rand(-10, 10),
      size: rand(1.5, 4.8),
      energy: rand(2, 5),
      pulse: rand(0, TAU),
    };
  }

  private updateNutrients(dt: number): void {
    for (const nutrient of this.nutrients) {
      nutrient.pulse += dt * (0.6 + nutrient.energy * 0.08);
      nutrient.x +=
        nutrient.vx * dt + Math.sin(this.time * 0.45 + nutrient.pulse) * 1.2;
      nutrient.y +=
        nutrient.vy * dt + Math.cos(this.time * 0.4 + nutrient.pulse) * 1.2;

      if (nutrient.x < -10) nutrient.x = this.w + 10;
      if (nutrient.x > this.w + 10) nutrient.x = -10;
      if (nutrient.y < -10) nutrient.y = this.h + 10;
      if (nutrient.y > this.h + 10) nutrient.y = -10;
    }
  }

  private updateDebris(dt: number): void {
    // Compact survivors towards the front of the same array instead of building
    // a replacement one; order is preserved exactly as the old copy did.
    const debris = this.debris;
    let live = 0;
    for (let i = 0; i < debris.length; i++) {
      const particle = debris[i];
      particle.life -= dt;
      if (particle.life <= 0) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.988;
      particle.vy *= 0.988;
      particle.phase += dt * 1.4;
      debris[live++] = particle;
    }
    debris.length = live;
  }

  private updateProtoCells(dt: number): void {
    const spawns: ProtoCell[] = [];

    for (const cell of this.protoCells) {
      cell.age += dt;
      cell.divisionCooldown -= dt;
      cell.flash = Math.max(0, cell.flash - dt * 2.4);
      cell.engulf = Math.max(0, cell.engulf - dt * 1.5);
      cell.energy -= dt * (1.2 + cell.radius * 0.06);
      if (cell.energy < 8) cell.health -= dt * 3.5;

      let fx = Math.cos(this.time * 0.55 + cell.phase) * 18;
      let fy = Math.sin(this.time * 0.48 + cell.phase * 1.4) * 18;

      let nearestBacteria: Bacteria | null = null;
      let nearestDistSq = Number.POSITIVE_INFINITY;
      for (const bacteria of this.bacteria) {
        const d2 = distSq(cell.x, cell.y, bacteria.x, bacteria.y);
        if (d2 < nearestDistSq) {
          nearestDistSq = d2;
          nearestBacteria = bacteria;
        }
      }

      if (nearestBacteria) {
        const dx = nearestBacteria.x - cell.x;
        const dy = nearestBacteria.y - cell.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = cell.diet === "hunter" ? 42 : 24;
        fx += (dx / d) * pull;
        fy += (dy / d) * pull;
      }

      for (const other of this.protoCells) {
        if (other.id === cell.id) continue;
        const dx = cell.x - other.x;
        const dy = cell.y - other.y;
        const d = Math.hypot(dx, dy) || 1;
        const minDistance = cell.radius + other.radius + 26;
        if (d < minDistance) {
          const push = (minDistance - d) * 2.2;
          fx += (dx / d) * push;
          fy += (dy / d) * push;
        } else if (
          cell.radius > other.radius * 1.2 &&
          other.health < 40 &&
          d < 180
        ) {
          fx -= (dx / d) * 10;
          fy -= (dy / d) * 10;
        }
      }

      const margin = 90;
      if (cell.x < margin) fx += (margin - cell.x) * 1.2;
      if (cell.x > this.w - margin) fx -= (cell.x - (this.w - margin)) * 1.2;
      if (cell.y < margin) fy += (margin - cell.y) * 1.2;
      if (cell.y > this.h - margin) fy -= (cell.y - (this.h - margin)) * 1.2;

      cell.vx += fx * dt;
      cell.vy += fy * dt;
      cell.vx *= 0.985;
      cell.vy *= 0.985;

      const maxSpeed = lerp(34, 58, clamp((100 - cell.health) / 100, 0, 1));
      const speed = Math.hypot(cell.vx, cell.vy);
      if (speed > maxSpeed) {
        cell.vx = (cell.vx / speed) * maxSpeed;
        cell.vy = (cell.vy / speed) * maxSpeed;
      }

      cell.x = clamp(cell.x + cell.vx * dt, 40, this.w - 40);
      cell.y = clamp(cell.y + cell.vy * dt, 40, this.h - 40);
      cell.nucleusAngle += dt * (0.5 + cell.radius * 0.01);

      if (
        cell.energy > 120 &&
        cell.divisionCooldown <= 0 &&
        this.protoCells.length + spawns.length < MAX_PROTO_CELLS
      ) {
        cell.divisionCooldown = rand(12, 22);
        cell.energy *= 0.58;
        cell.radius *= 0.92;

        const splitDir = normalize(rand(-1, 1), rand(-1, 1), cell.radius * 1.4);
        spawns.push(
          this.makeProtoCell(cell.x + splitDir.x, cell.y + splitDir.y),
        );
      }
    }

    if (spawns.length > 0) {
      this.protoCells.push(...spawns);
    }
  }

  private updateBacteria(dt: number): void {
    const spawns: Bacteria[] = [];
    const bacteria = this.bacteria;
    const nutrients = this.nutrients;
    const debris = this.debris;

    // One grid rebuild per agent kind replaces the per-bacterium scans over the
    // whole nutrient, debris and bacteria arrays. Nothing is added to any of the
    // three arrays inside the loop, so the bucketed indices stay valid.
    this.bacteriaXY = this.packPositions(bacteria, this.bacteriaXY);
    this.nutrientXY = this.packPositions(nutrients, this.nutrientXY);
    this.debrisXY = this.packPositions(debris, this.debrisXY);
    this.bacteriaGrid.build(this.bacteriaXY, bacteria.length);
    this.nutrientGrid.build(this.nutrientXY, nutrients.length);
    this.debrisGrid.build(this.debrisXY, debris.length);

    for (let index = 0; index < bacteria.length; index++) {
      const bac = bacteria[index];
      bac.age += dt;
      bac.divisionCooldown -= dt;
      bac.flash = Math.max(0, bac.flash - dt * 3.4);
      bac.energy -= dt * (0.45 + bac.radius * 0.05);
      if (bac.energy < 4) bac.health -= dt * 7;

      let fx = Math.cos(this.time * 1.2 + bac.phase) * 16;
      let fy = Math.sin(this.time * 1.1 + bac.phase * 1.7) * 16;

      const center = this.colonyCenters[bac.colonyId];
      if (center && center.count > 2) {
        const dx = center.x - bac.x;
        const dy = center.y - bac.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 24) {
          fx += (dx / d) * 18;
          fy += (dy / d) * 18;
        }
      }

      let nearestFood: Nutrient | Debris | null = null;
      let nearestFoodDistSq = Number.POSITIVE_INFINITY;

      // Food further than FOOD_SENSE_RADIUS is discarded below anyway, so the
      // bounded query finds the same morsel the old full-array scan did.
      const nutrientHits = this.nutrientGrid.query(
        bac.x,
        bac.y,
        FOOD_SENSE_RADIUS,
      );
      const nutrientNear = this.nutrientGrid.hits;
      for (let n = 0; n < nutrientHits; n++) {
        const nutrient = nutrients[nutrientNear[n]];
        const d2 = distSq(bac.x, bac.y, nutrient.x, nutrient.y);
        if (d2 < nearestFoodDistSq) {
          nearestFoodDistSq = d2;
          nearestFood = nutrient;
        }
      }
      const debrisHits = this.debrisGrid.query(bac.x, bac.y, FOOD_SENSE_RADIUS);
      const debrisNear = this.debrisGrid.hits;
      for (let n = 0; n < debrisHits; n++) {
        const particle = debris[debrisNear[n]];
        const d2 = distSq(bac.x, bac.y, particle.x, particle.y);
        if (d2 < nearestFoodDistSq) {
          nearestFoodDistSq = d2;
          nearestFood = particle;
        }
      }

      if (nearestFood && nearestFoodDistSq < FOOD_SENSE_RADIUS ** 2) {
        const dx = nearestFood.x - bac.x;
        const dy = nearestFood.y - bac.y;
        const d = Math.hypot(dx, dy) || 1;
        fx += (dx / d) * 20;
        fy += (dy / d) * 20;
      }

      // Cohesion dies at 120 px and repulsion well before that, so neighbours
      // outside BACTERIA_SENSE_RADIUS contribute nothing and can be skipped.
      const neighbourHits = this.bacteriaGrid.query(
        bac.x,
        bac.y,
        BACTERIA_SENSE_RADIUS,
      );
      const neighbours = this.bacteriaGrid.hits;
      for (let n = 0; n < neighbourHits; n++) {
        const other = bacteria[neighbours[n]];
        if (other.id === bac.id) continue;
        const dx = bac.x - other.x;
        const dy = bac.y - other.y;
        const d = Math.hypot(dx, dy) || 1;

        if (bac.colonyId === other.colonyId && d < 120) {
          fx -= (dx / d) * 5;
          fy -= (dy / d) * 5;
        }

        const minDistance = bac.radius + other.radius + 8;
        if (d < minDistance) {
          const repulse = (minDistance - d) * 12;
          fx += (dx / d) * repulse;
          fy += (dy / d) * repulse;
        }
      }

      for (const cell of this.protoCells) {
        const dx = bac.x - cell.x;
        const dy = bac.y - cell.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 170) {
          const fear = (170 - d) * 1.45;
          fx += (dx / d) * fear;
          fy += (dy / d) * fear;
        }
      }

      const margin = 28;
      if (bac.x < margin) fx += (margin - bac.x) * 3.2;
      if (bac.x > this.w - margin) fx -= (bac.x - (this.w - margin)) * 3.2;
      if (bac.y < margin) fy += (margin - bac.y) * 3.2;
      if (bac.y > this.h - margin) fy -= (bac.y - (this.h - margin)) * 3.2;

      bac.vx += fx * dt;
      bac.vy += fy * dt;
      bac.vx *= 0.965;
      bac.vy *= 0.965;

      const maxSpeed = 56;
      const speed = Math.hypot(bac.vx, bac.vy);
      if (speed > maxSpeed) {
        bac.vx = (bac.vx / speed) * maxSpeed;
        bac.vy = (bac.vy / speed) * maxSpeed;
      }

      bac.x = clamp(bac.x + bac.vx * dt, 14, this.w - 14);
      bac.y = clamp(bac.y + bac.vy * dt, 14, this.h - 14);

      const targetAngle = Math.atan2(bac.vy, bac.vx);
      const delta = wrapAngle(targetAngle - bac.angle);
      bac.angle += delta * 0.18 + bac.turnRate * dt * 0.3;

      // NUTRIENT_REACH / DEBRIS_REACH cover the largest possible morsel plus the
      // contact slack, so the grid can never hide something already in reach.
      const eatenHits = this.nutrientGrid.query(
        bac.x,
        bac.y,
        bac.radius + NUTRIENT_REACH,
      );
      // The old code walked the nutrient array backwards and ate the first
      // morsel in reach, i.e. the highest-indexed one. The grid hands its hits
      // back in bucket order instead, so pick the highest slot explicitly:
      // when two morsels are in reach at once, the same one gets eaten as
      // before, and the simulation stays in step with the old version.
      const eatenNear = this.nutrientGrid.hits;
      let eatenSlot = -1;
      for (let n = 0; n < eatenHits; n++) {
        const slot = eatenNear[n];
        if (slot <= eatenSlot) continue;
        const nutrient = nutrients[slot];
        const d = Math.hypot(bac.x - nutrient.x, bac.y - nutrient.y);
        if (d < bac.radius + nutrient.size + 8) eatenSlot = slot;
      }

      if (eatenSlot >= 0) {
        const nutrient = nutrients[eatenSlot];
        bac.energy += nutrient.energy;
        bac.health = Math.min(100, bac.health + nutrient.energy * 3);
        bac.flash = 0.8;
        nutrients.splice(eatenSlot, 1);
        nutrients.push(this.makeNutrient());
        // Dropping a slot renumbers every later nutrient, and the replacement
        // has to be visible to the bacteria processed after this one — the old
        // full-array scan saw it immediately — so refile the grid. Respawns
        // average well under one per frame, so re-bucketing 160 nutrients here
        // costs far less than the all-pairs scan the grid replaced. Safe at
        // this point because the hit list above has already been consumed.
        this.nutrientXY = this.packPositions(nutrients, this.nutrientXY);
        this.nutrientGrid.build(this.nutrientXY, nutrients.length);
      }

      const chewedHits = this.debrisGrid.query(
        bac.x,
        bac.y,
        bac.radius + DEBRIS_REACH,
      );
      const chewedNear = this.debrisGrid.hits;
      for (let n = 0; n < chewedHits; n++) {
        const particle = debris[chewedNear[n]];
        const d = Math.hypot(bac.x - particle.x, bac.y - particle.y);
        if (d < bac.radius + particle.size + 4) {
          bac.energy += 0.8;
          bac.flash = 0.6;
          particle.life -= 0.55;
        }
      }

      if (
        bac.energy > 24 &&
        bac.divisionCooldown <= 0 &&
        bacteria.length + spawns.length < MAX_BACTERIA
      ) {
        bac.divisionCooldown = rand(4.5, 10);
        bac.energy *= 0.55;
        const offset = normalize(rand(-1, 1), rand(-1, 1), bac.radius * 2.4);
        const child = this.makeBacteria(
          Math.random() < 0.93
            ? bac.colonyId
            : Math.floor(rand(0, COLONY_COUNT)),
          bac.x + offset.x,
          bac.y + offset.y,
          bac.angle + rand(-0.5, 0.5),
        );
        child.energy = bac.energy;
        child.health = bac.health;
        spawns.push(child);
      }
    }

    if (spawns.length > 0) {
      this.bacteria.push(...spawns);
    }
  }

  private resolvePredation(dt: number): void {
    // Casualties are flagged on the agent itself rather than collected into a
    // pair of Sets, so the sweep below is a plain field read and the frame
    // allocates nothing. Every flagged agent is removed before this returns.
    let deadProto = 0;
    let deadBacteria = 0;

    for (const cell of this.protoCells) {
      for (const bac of this.bacteria) {
        if (bac.dead) continue;
        const d = Math.hypot(cell.x - bac.x, cell.y - bac.y);
        const reach = cell.radius + bac.radius + 6;
        if (d < reach) {
          const bite = dt * 44;
          bac.health -= bite;
          cell.energy += bite * 0.52;
          cell.engulf = 1;
          cell.flash = 0.4;
          bac.flash = 1;

          if (bac.health <= 0) {
            bac.dead = true;
            deadBacteria++;
            cell.energy += 7;
            this.spawnDebris(bac.x, bac.y, 5, GREEN_3, 3.6);
          }
        }
      }
    }

    for (const hunter of this.protoCells) {
      for (const prey of this.protoCells) {
        if (hunter.id === prey.id || prey.dead) continue;
        if (hunter.radius <= prey.radius * 1.18 || prey.health > 34) continue;

        const d = Math.hypot(hunter.x - prey.x, hunter.y - prey.y);
        if (d < hunter.radius + prey.radius * 0.8) {
          const bite = dt * 18;
          prey.health -= bite;
          prey.flash = 1;
          hunter.energy += bite * 0.35;
          if (prey.health <= 0) {
            prey.dead = true;
            deadProto++;
            hunter.energy += 18;
            this.spawnDebris(prey.x, prey.y, 12, DAMAGE, 5.4);
          }
        }
      }
    }

    for (const cell of this.protoCells) {
      if (cell.dead) continue;
      if (cell.health <= 0 || cell.energy < -12 || cell.age > 120) {
        cell.dead = true;
        deadProto++;
        this.spawnDebris(cell.x, cell.y, 12, DAMAGE, 5.4);
      }
    }

    for (const bac of this.bacteria) {
      if (bac.dead) continue;
      if (bac.health <= 0 || bac.energy < -4 || bac.age > 90) {
        bac.dead = true;
        deadBacteria++;
        this.spawnDebris(bac.x, bac.y, 4, GREEN_3, 3.6);
      }
    }

    // Compact the survivors in place, keeping their order, rather than letting
    // filter() hand back a fresh array for both populations every frame.
    if (deadProto > 0) {
      const protoCells = this.protoCells;
      let live = 0;
      for (let i = 0; i < protoCells.length; i++) {
        if (!protoCells[i].dead) protoCells[live++] = protoCells[i];
      }
      protoCells.length = live;
      while (protoCells.length < Math.max(8, INITIAL_PROTO_CELLS - 4)) {
        protoCells.push(this.makeProtoCell());
      }
    }

    if (deadBacteria > 0) {
      const bacteria = this.bacteria;
      let live = 0;
      for (let i = 0; i < bacteria.length; i++) {
        if (!bacteria[i].dead) bacteria[live++] = bacteria[i];
      }
      bacteria.length = live;
      while (bacteria.length < Math.max(72, INITIAL_BACTERIA - 40)) {
        bacteria.push(this.makeBacteria(Math.floor(rand(0, COLONY_COUNT))));
      }
    }
  }

  private spawnDebris(
    x: number,
    y: number,
    count: number,
    color: number,
    life: number,
  ): void {
    for (let i = 0; i < count && this.debris.length < MAX_DEBRIS; i++) {
      const angle = rand(0, TAU);
      const speed = rand(16, 72);
      this.debris.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: rand(1.8, 5.8),
        life,
        maxLife: life,
        color,
        phase: rand(0, TAU),
      });
    }
  }

  private updateColonyCenters(): void {
    const centers = this.colonyCenters;

    for (let i = 0; i < centers.length; i++) {
      const center = centers[i];
      center.x = 0;
      center.y = 0;
      center.count = 0;
    }

    for (const bac of this.bacteria) {
      const center = centers[bac.colonyId];
      center.x += bac.x;
      center.y += bac.y;
      center.count += 1;
    }

    for (const center of centers) {
      if (center.count > 0) {
        center.x /= center.count;
        center.y /= center.count;
      }
    }
  }

  private rebuildColonyLinks(): void {
    const bacteria = this.bacteria;

    // Refill the grid from the positions produced by this frame's movement pass,
    // then look up each bacterium's neighbourhood instead of testing all pairs.
    this.bacteriaXY = this.packPositions(bacteria, this.bacteriaXY);
    this.bacteriaGrid.build(this.bacteriaXY, bacteria.length);

    let links = this.colonyLinks;
    let count = 0;

    for (let i = 0; i < bacteria.length; i++) {
      const a = bacteria[i];
      const hits = this.bacteriaGrid.query(a.x, a.y, COLONY_LINK_RANGE);
      const near = this.bacteriaGrid.hits;

      for (let n = 0; n < hits; n++) {
        const j = near[n];
        if (j <= i) continue; // keeps each pair once, as the old i < j loop did
        const b = bacteria[j];
        if (a.colonyId !== b.colonyId) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > COLONY_LINK_RANGE) continue;

        const offset = count * LINK_STRIDE;
        if (offset + LINK_STRIDE > links.length) {
          const grown = new Float32Array(links.length * 2);
          grown.set(links);
          links = grown;
        }
        links[offset] = a.x;
        links[offset + 1] = a.y;
        links[offset + 2] = b.x;
        links[offset + 3] = b.y;
        links[offset + 4] = clamp(1 - d / COLONY_LINK_RANGE, 0.08, 0.3);
        count++;
      }
    }

    this.colonyLinks = links;
    this.colonyLinkCount = count;
  }

  /** Copy agent positions into the packed [x, y, ...] buffer a grid indexes. */
  private packPositions(
    agents: readonly { x: number; y: number }[],
    buffer: Float32Array,
  ): Float32Array {
    const packed =
      buffer.length < agents.length * 2
        ? new Float32Array(agents.length * 2)
        : buffer;
    for (let i = 0; i < agents.length; i++) {
      packed[i * 2] = agents[i].x;
      packed[i * 2 + 1] = agents[i].y;
    }
    return packed;
  }

  private spawnAmbientNutrients(): void {
    while (this.nutrients.length < INITIAL_NUTRIENTS) {
      this.nutrients.push(this.makeNutrient());
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    g.rect(0, 0, this.w, this.h).fill({ color: CRUST });
    g.rect(0, 0, this.w, this.h).fill({ color: MANTLE, alpha: 0.28 });

    for (const blob of this.mantle) {
      const driftX = Math.cos(this.time * 0.08 + blob.phase) * blob.drift;
      const driftY = Math.sin(this.time * 0.06 + blob.phase * 1.4) * blob.drift;
      g.circle(blob.x + driftX, blob.y + driftY, blob.radius).fill({
        color: blob.color,
        alpha: blob.alpha,
      });
    }

    for (let i = 0; i < 12; i++) {
      const y = (i / 11) * this.h;
      const wave = Math.sin(this.time * 0.11 + i * 0.7) * 18;
      g.moveTo(0, y + wave);
      for (let x = 160; x <= this.w; x += 160) {
        g.lineTo(x, y + Math.sin(this.time * 0.11 + i * 0.7 + x * 0.0012) * 18);
      }
      g.stroke({ color: GREEN_1, width: 1, alpha: 0.08 });
    }

    for (const center of this.colonyCenters) {
      if (center.count < 4) continue;
      const glow = 32 + center.count * 4;
      g.circle(
        center.x + Math.cos(this.time * 0.3 + center.id) * 10,
        center.y + Math.sin(this.time * 0.25 + center.id) * 10,
        glow,
      ).fill({
        color: GREEN_1,
        alpha: 0.06 + center.count * 0.002,
      });
    }

    const nutrientGlow = this.nutrientGlowFill;
    const nutrientCore = this.nutrientCoreFill;
    for (const nutrient of this.nutrients) {
      const pulse = 0.65 + 0.35 * Math.sin(this.time * 1.8 + nutrient.pulse);
      nutrientGlow.alpha = 0.06 * pulse;
      g.circle(nutrient.x, nutrient.y, nutrient.size * 2.2).fill(nutrientGlow);
      nutrientCore.alpha = 0.32 + 0.18 * pulse;
      g.circle(nutrient.x, nutrient.y, nutrient.size).fill(nutrientCore);
    }

    const links = this.colonyLinks;
    const linkStroke = this.colonyLinkStroke;
    for (let i = 0; i < this.colonyLinkCount; i++) {
      const offset = i * LINK_STRIDE;
      g.moveTo(links[offset], links[offset + 1]);
      g.lineTo(links[offset + 2], links[offset + 3]);
      linkStroke.alpha = links[offset + 4];
      g.stroke(linkStroke);
    }

    const debrisFill = this.debrisFill;
    for (const particle of this.debris) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      debrisFill.color = particle.color;
      debrisFill.alpha = 0.18 + alpha * 0.26;
      g.circle(
        particle.x + Math.cos(this.time * 2 + particle.phase) * 1.6,
        particle.y + Math.sin(this.time * 2.2 + particle.phase) * 1.6,
        particle.size,
      ).fill(debrisFill);
    }

    for (const bac of this.bacteria) {
      this.drawBacteria(g, bac);
    }

    for (const cell of this.protoCells) {
      this.drawProtoCell(g, cell);
    }

    g.rect(0, 0, this.w, this.h).fill({ color: SURFACE1, alpha: 0.04 });
  }

  private drawProtoCell(g: Graphics, cell: ProtoCell): void {
    const points = this.protoOuterPath;
    const innerPoints = this.protoInnerPath;
    this.buildProtoPath(cell, 1, points);
    this.buildProtoPath(cell, 0.82, innerPoints);

    this.traceLoop(g, points);
    g.fill({
      color:
        cell.flash > 0.2
          ? lerpColor(GREEN_2, DAMAGE, cell.flash * 0.5)
          : GREEN_1,
      alpha: 0.24 + cell.engulf * 0.06,
    });
    this.traceLoop(g, points);
    g.stroke({
      color: cell.flash > 0.2 ? DAMAGE : GREEN_3,
      width: 2.2,
      alpha: 0.7,
    });

    this.traceLoop(g, innerPoints);
    g.fill({ color: GREEN_2, alpha: 0.12 });
    this.traceLoop(g, innerPoints);
    g.stroke({ color: GREEN_4, width: 1.2, alpha: 0.35 });

    const nucleusX =
      cell.x + Math.cos(cell.nucleusAngle) * cell.nucleusDistance;
    const nucleusY =
      cell.y + Math.sin(cell.nucleusAngle) * cell.nucleusDistance;
    g.circle(nucleusX, nucleusY, cell.nucleusRadius * 1.35).fill({
      color: CORE,
      alpha: 0.08,
    });
    g.circle(nucleusX, nucleusY, cell.nucleusRadius).fill({
      color: GREEN_4,
      alpha: 0.24,
    });
    g.circle(
      nucleusX +
        Math.cos(this.time * 0.9 + cell.phase) * cell.nucleusRadius * 0.18,
      nucleusY +
        Math.sin(this.time * 0.8 + cell.phase) * cell.nucleusRadius * 0.18,
      cell.nucleusRadius * 0.34,
    ).fill({
      color: CORE,
      alpha: 0.55,
    });

    const organelleGlow = this.organelleGlowFill;
    const organelleCore = this.organelleCoreFill;
    for (const organelle of cell.organelles) {
      const orbit = organelle.orbit + this.time * organelle.pulse * 0.4;
      const ox = cell.x + Math.cos(orbit) * organelle.distance;
      const oy = cell.y + Math.sin(orbit) * organelle.distance;
      const pulse =
        0.7 + 0.3 * Math.sin(this.time * organelle.pulse + organelle.phase);
      organelleGlow.color = organelle.color;
      organelleGlow.alpha = 0.05 * pulse;
      g.circle(ox, oy, organelle.radius * 1.7).fill(organelleGlow);
      organelleCore.color = organelle.color;
      organelleCore.alpha = 0.28 + 0.12 * pulse;
      g.circle(ox, oy, organelle.radius).fill(organelleCore);
    }
  }

  private drawBacteria(g: Graphics, bac: Bacteria): void {
    const dirX = Math.cos(bac.angle);
    const dirY = Math.sin(bac.angle);
    const sideX = -dirY;
    const sideY = dirX;
    const length =
      bac.radius * bac.elongation * (bac.shape === "coccus" ? 1.1 : 1.8);
    const width = bac.radius * (bac.shape === "coccus" ? 1.2 : 0.95);
    const curve = bac.shape === "vibrio" ? bac.curvature * bac.radius * 0.7 : 0;
    const tailSpread = Math.max(1, bac.flagella - 1);
    const wobblePhase = this.time * 8 + bac.phase;

    for (let i = 0; i < bac.flagella; i++) {
      const tailT = i / tailSpread - 0.5;
      const startX = bac.x - dirX * length * 0.6 + sideX * tailT * width * 0.8;
      const startY = bac.y - dirY * length * 0.6 + sideY * tailT * width * 0.8;
      g.moveTo(startX, startY);
      for (let s = 1; s <= 4; s++) {
        const t = s / 4;
        const wobble = Math.sin(wobblePhase + t * 4 + i) * 4;
        g.lineTo(
          startX - dirX * t * 18 + sideX * wobble * 0.4,
          startY - dirY * t * 18 + sideY * wobble,
        );
      }
      g.stroke(FLAGELLA_STROKE);
    }

    // The body colours depend only on bac.flash, so resolve them once instead of
    // re-running the blend for each of the five segments.
    const glowFill = this.bacteriaGlowFill;
    const bodyFill = this.bacteriaBodyFill;
    glowFill.color = bac.flash > 0.3 ? DAMAGE : GREEN_2;
    bodyFill.color =
      bac.flash > 0.3 ? lerpColor(GREEN_3, DAMAGE, bac.flash * 0.7) : GREEN_3;

    for (let i = -2; i <= 2; i++) {
      const t = i / 2;
      const bend = Math.sin(t * Math.PI) * curve;
      const cx = bac.x + dirX * t * length + sideX * bend;
      const cy = bac.y + dirY * t * length + sideY * bend;
      const r = width * (1 - Math.abs(t) * 0.2);

      g.circle(cx, cy, r * 1.28).fill(glowFill);
      g.circle(cx, cy, r).fill(bodyFill);
      g.circle(cx + dirX * 1.4, cy + dirY * 1.4, r * 0.42).fill(
        BACTERIA_CORE_FILL,
      );
    }
  }

  /** Write the membrane outline as packed [x, y, ...] into the caller's buffer. */
  private buildProtoPath(
    cell: ProtoCell,
    scale: number,
    out: Float32Array,
  ): void {
    const phaseA = this.time * 1.2 + cell.phase;
    const phaseB = cell.phase * 1.3 - this.time * 0.8;

    for (let i = 0; i < PROTO_PATH_POINTS; i++) {
      const waveA = Math.sin(PROTO_PATH_ANGLE3[i] + phaseA);
      const waveB = Math.cos(PROTO_PATH_ANGLE5[i] + phaseB);
      const radius =
        cell.radius *
        scale *
        (1 +
          cell.membraneJitter * 0.32 * waveA +
          cell.membraneJitter * 0.22 * waveB);

      out[i * 2] = cell.x + PROTO_PATH_COS[i] * radius;
      out[i * 2 + 1] = cell.y + PROTO_PATH_SIN[i] * radius;
    }
  }

  private traceLoop(g: Graphics, path: Float32Array): void {
    g.moveTo(path[0], path[1]);
    for (let i = 2; i < path.length; i += 2) {
      g.lineTo(path[i], path[i + 1]);
    }
    g.lineTo(path[0], path[1]);
  }
}
