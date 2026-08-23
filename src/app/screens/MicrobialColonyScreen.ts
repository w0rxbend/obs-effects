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

interface ColonyLink {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  alpha: number;
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
  private colonyCenters: ColonyCenter[] = [];
  private colonyLinks: ColonyLink[] = [];
  private mantle: MantleBlob[] = [];

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
    const next: Debris[] = [];
    for (const particle of this.debris) {
      particle.life -= dt;
      if (particle.life <= 0) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.988;
      particle.vy *= 0.988;
      particle.phase += dt * 1.4;
      next.push(particle);
    }
    this.debris = next;
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
        const hunt = normalize(dx, dy, cell.diet === "hunter" ? 42 : 24);
        fx += hunt.x;
        fy += hunt.y;
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
        const n = normalize(cell.vx, cell.vy, maxSpeed);
        cell.vx = n.x;
        cell.vy = n.y;
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

    for (const bac of this.bacteria) {
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

      for (const nutrient of this.nutrients) {
        const d2 = distSq(bac.x, bac.y, nutrient.x, nutrient.y);
        if (d2 < nearestFoodDistSq) {
          nearestFoodDistSq = d2;
          nearestFood = nutrient;
        }
      }
      for (const particle of this.debris) {
        const d2 = distSq(bac.x, bac.y, particle.x, particle.y);
        if (d2 < nearestFoodDistSq) {
          nearestFoodDistSq = d2;
          nearestFood = particle;
        }
      }

      if (nearestFood && nearestFoodDistSq < 180 * 180) {
        const dx = nearestFood.x - bac.x;
        const dy = nearestFood.y - bac.y;
        const foodPull = normalize(dx, dy, 20);
        fx += foodPull.x;
        fy += foodPull.y;
      }

      for (const other of this.bacteria) {
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
        const n = normalize(bac.vx, bac.vy, maxSpeed);
        bac.vx = n.x;
        bac.vy = n.y;
      }

      bac.x = clamp(bac.x + bac.vx * dt, 14, this.w - 14);
      bac.y = clamp(bac.y + bac.vy * dt, 14, this.h - 14);

      const targetAngle = Math.atan2(bac.vy, bac.vx);
      const delta = wrapAngle(targetAngle - bac.angle);
      bac.angle += delta * 0.18 + bac.turnRate * dt * 0.3;

      for (let i = this.nutrients.length - 1; i >= 0; i--) {
        const nutrient = this.nutrients[i];
        const d = Math.hypot(bac.x - nutrient.x, bac.y - nutrient.y);
        if (d < bac.radius + nutrient.size + 8) {
          bac.energy += nutrient.energy;
          bac.health = Math.min(100, bac.health + nutrient.energy * 3);
          bac.flash = 0.8;
          this.nutrients.splice(i, 1);
          this.nutrients.push(this.makeNutrient());
          break;
        }
      }

      for (let i = this.debris.length - 1; i >= 0; i--) {
        const particle = this.debris[i];
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
        this.bacteria.length + spawns.length < MAX_BACTERIA
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
    const deadProto = new Set<number>();
    const deadBacteria = new Set<number>();

    for (const cell of this.protoCells) {
      for (const bac of this.bacteria) {
        if (deadBacteria.has(bac.id)) continue;
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
            deadBacteria.add(bac.id);
            cell.energy += 7;
            this.spawnDebris(bac.x, bac.y, 5, GREEN_3, 3.6);
          }
        }
      }
    }

    for (const hunter of this.protoCells) {
      for (const prey of this.protoCells) {
        if (hunter.id === prey.id || deadProto.has(prey.id)) continue;
        if (hunter.radius <= prey.radius * 1.18 || prey.health > 34) continue;

        const d = Math.hypot(hunter.x - prey.x, hunter.y - prey.y);
        if (d < hunter.radius + prey.radius * 0.8) {
          const bite = dt * 18;
          prey.health -= bite;
          prey.flash = 1;
          hunter.energy += bite * 0.35;
          if (prey.health <= 0) {
            deadProto.add(prey.id);
            hunter.energy += 18;
            this.spawnDebris(prey.x, prey.y, 12, DAMAGE, 5.4);
          }
        }
      }
    }

    for (const cell of this.protoCells) {
      if (deadProto.has(cell.id)) continue;
      if (cell.health <= 0 || cell.energy < -12 || cell.age > 120) {
        deadProto.add(cell.id);
        this.spawnDebris(cell.x, cell.y, 12, DAMAGE, 5.4);
      }
    }

    for (const bac of this.bacteria) {
      if (deadBacteria.has(bac.id)) continue;
      if (bac.health <= 0 || bac.energy < -4 || bac.age > 90) {
        deadBacteria.add(bac.id);
        this.spawnDebris(bac.x, bac.y, 4, GREEN_3, 3.6);
      }
    }

    if (deadProto.size > 0) {
      this.protoCells = this.protoCells.filter(
        (cell) => !deadProto.has(cell.id),
      );
      while (this.protoCells.length < Math.max(8, INITIAL_PROTO_CELLS - 4)) {
        this.protoCells.push(this.makeProtoCell());
      }
    }

    if (deadBacteria.size > 0) {
      this.bacteria = this.bacteria.filter((bac) => !deadBacteria.has(bac.id));
      while (this.bacteria.length < Math.max(72, INITIAL_BACTERIA - 40)) {
        this.bacteria.push(
          this.makeBacteria(Math.floor(rand(0, COLONY_COUNT))),
        );
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
    const centers = Array.from({ length: COLONY_COUNT }, (_, id) => ({
      id,
      x: 0,
      y: 0,
      count: 0,
    }));

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

    this.colonyCenters = centers;
  }

  private rebuildColonyLinks(): void {
    this.colonyLinks = [];
    for (let i = 0; i < this.bacteria.length; i++) {
      const a = this.bacteria[i];
      for (let j = i + 1; j < this.bacteria.length; j++) {
        const b = this.bacteria[j];
        if (a.colonyId !== b.colonyId) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 66) continue;
        this.colonyLinks.push({
          ax: a.x,
          ay: a.y,
          bx: b.x,
          by: b.y,
          alpha: clamp(1 - d / 66, 0.08, 0.3),
        });
      }
    }
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

    for (const nutrient of this.nutrients) {
      const pulse = 0.65 + 0.35 * Math.sin(this.time * 1.8 + nutrient.pulse);
      g.circle(nutrient.x, nutrient.y, nutrient.size * 2.2).fill({
        color: GREEN_2,
        alpha: 0.06 * pulse,
      });
      g.circle(nutrient.x, nutrient.y, nutrient.size).fill({
        color: ACID,
        alpha: 0.32 + 0.18 * pulse,
      });
    }

    for (const link of this.colonyLinks) {
      g.moveTo(link.ax, link.ay);
      g.lineTo(link.bx, link.by);
      g.stroke({ color: GREEN_2, width: 1.4, alpha: link.alpha });
    }

    for (const particle of this.debris) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      g.circle(
        particle.x + Math.cos(this.time * 2 + particle.phase) * 1.6,
        particle.y + Math.sin(this.time * 2.2 + particle.phase) * 1.6,
        particle.size,
      ).fill({
        color: particle.color,
        alpha: 0.18 + alpha * 0.26,
      });
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
    const points = this.buildProtoPath(cell, 1);
    const innerPoints = this.buildProtoPath(cell, 0.82);

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

    for (const organelle of cell.organelles) {
      const orbit = organelle.orbit + this.time * organelle.pulse * 0.4;
      const ox = cell.x + Math.cos(orbit) * organelle.distance;
      const oy = cell.y + Math.sin(orbit) * organelle.distance;
      const pulse =
        0.7 + 0.3 * Math.sin(this.time * organelle.pulse + organelle.phase);
      g.circle(ox, oy, organelle.radius * 1.7).fill({
        color: organelle.color,
        alpha: 0.05 * pulse,
      });
      g.circle(ox, oy, organelle.radius).fill({
        color: organelle.color,
        alpha: 0.28 + 0.12 * pulse,
      });
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

    for (let i = 0; i < bac.flagella; i++) {
      const tailT = i / Math.max(1, bac.flagella - 1) - 0.5;
      const startX = bac.x - dirX * length * 0.6 + sideX * tailT * width * 0.8;
      const startY = bac.y - dirY * length * 0.6 + sideY * tailT * width * 0.8;
      g.moveTo(startX, startY);
      for (let s = 1; s <= 4; s++) {
        const t = s / 4;
        const wobble = Math.sin(this.time * 8 + bac.phase + t * 4 + i) * 4;
        g.lineTo(
          startX - dirX * t * 18 + sideX * wobble * 0.4,
          startY - dirY * t * 18 + sideY * wobble,
        );
      }
      g.stroke({ color: GREEN_3, width: 0.8, alpha: 0.35 });
    }

    for (let i = -2; i <= 2; i++) {
      const t = i / 2;
      const bend = Math.sin(t * Math.PI) * curve;
      const cx = bac.x + dirX * t * length + sideX * bend;
      const cy = bac.y + dirY * t * length + sideY * bend;
      const r = width * (1 - Math.abs(t) * 0.2);

      g.circle(cx, cy, r * 1.28).fill({
        color: bac.flash > 0.3 ? DAMAGE : GREEN_2,
        alpha: 0.16,
      });
      g.circle(cx, cy, r).fill({
        color:
          bac.flash > 0.3
            ? lerpColor(GREEN_3, DAMAGE, bac.flash * 0.7)
            : GREEN_3,
        alpha: 0.46,
      });
      g.circle(cx + dirX * 1.4, cy + dirY * 1.4, r * 0.42).fill({
        color: CORE,
        alpha: 0.18,
      });
    }
  }

  private buildProtoPath(
    cell: ProtoCell,
    scale: number,
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const count = 24;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU;
      const waveA = Math.sin(angle * 3 + this.time * 1.2 + cell.phase);
      const waveB = Math.cos(angle * 5 - this.time * 0.8 + cell.phase * 1.3);
      const radius =
        cell.radius *
        scale *
        (1 +
          cell.membraneJitter * 0.32 * waveA +
          cell.membraneJitter * 0.22 * waveB);

      points.push({
        x: cell.x + Math.cos(angle) * radius,
        y: cell.y + Math.sin(angle) * radius,
      });
    }

    return points;
  }

  private traceLoop(g: Graphics, points: { x: number; y: number }[]): void {
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i].x, points[i].y);
    }
    g.lineTo(points[0].x, points[0].y);
  }
}
