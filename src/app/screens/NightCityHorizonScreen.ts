import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";
import { clamp, TAU, randRange as rand } from "../../lib/math";
import {
  BUILDING_COLORS,
  BUILDING_EDGES,
  CLOUD,
  GOOD_NIGHT_CYCLE,
  GOOD_NIGHT_DURATION,
  GOOD_NIGHT_FIRST_DELAY,
  HORIZON_GLOW,
  MAX_METEORS,
  MAX_SMOKE_PUFFS,
  MOON,
  MOON_GLOW,
  SKY_HORIZON,
  SKY_MID,
  SKY_TOP,
  STAR,
  STAR_COUNT,
  STELLAR_ROTATION_SPEED,
  WIND,
  WIND_LINE_COUNT,
  WINDOW_COOL,
  WINDOW_WARM,
} from "./nightcity/palette";
import { drawBroadleaf, drawConifer, drawPoplar } from "./nightcity/trees";
import type {
  Building,
  BuildingLayer,
  CloudBand,
  CloudPuff,
  Meteor,
  SmokePuff,
  SmokeSource,
  StarNode,
  TextMeshPoint,
  TextMeshSegment,
  TreeCluster,
  WindLine,
  WindowLight,
} from "./nightcity/types";

function mixColor(from: number, to: number, t: number): number {
  const r1 = (from >> 16) & 0xff;
  const g1 = (from >> 8) & 0xff;
  const b1 = from & 0xff;
  const r2 = (to >> 16) & 0xff;
  const g2 = (to >> 8) & 0xff;
  const b2 = to & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return (r << 16) | (g << 8) | b;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export class NightCityHorizonScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfx = new Graphics();

  private w = 1920;
  private h = 1080;
  private time = 0;

  private stars: StarNode[] = [];
  private clouds: CloudBand[] = [];
  private layers: BuildingLayer[] = [];
  private windLines: WindLine[] = [];
  private smoke: SmokePuff[] = [];
  private trees: TreeCluster[] = [];
  private meteors: Meteor[] = [];
  private meteorTimer = 0;
  private nextMeteorIn = 4.8;
  private textMeshPoints: TextMeshPoint[] = [];
  private textMeshSegments: TextMeshSegment[] = [];
  private goodNightOffsetX = 0;
  private goodNightOffsetY = 0;
  private goodNightMeshWidth = 0;
  private goodNightMeshHeight = 0;
  private goodNightCycleIndex = -1;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.buildScene();
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    this.updateClouds(dt);
    this.updateWindows(dt);
    this.updateSmoke(dt);
    this.updateWind(dt);
    this.updateMeteors(dt);
    this.updateGoodNightPlacement();
    this.draw();
  }

  private buildScene(): void {
    this.stars = [];
    this.clouds = [];
    this.layers = [];
    this.windLines = [];
    this.smoke = [];
    this.trees = [];
    this.meteors = [];
    this.textMeshPoints = [];
    this.textMeshSegments = [];
    this.goodNightCycleIndex = -1;
    this.meteorTimer = rand(0.6, 2.4);
    this.nextMeteorIn = rand(4.2, 9.5);

    this.buildStars();
    this.buildClouds();
    this.buildBuildings();
    this.buildWindLines();
    this.buildTrees();
    this.buildGoodNightMesh();
  }

  private buildStars(): void {
    const count = Math.round(((this.w * this.h) / (1920 * 1080)) * STAR_COUNT);
    const pivotX = this.w * 0.78;
    const pivotY = this.h * 1.12;

    for (let i = 0; i < count; i++) {
      const x = rand(-this.w * 0.18, this.w * 1.18);
      const y = rand(-this.h * 0.22, this.h * 0.72);
      const dx = x - pivotX;
      const dy = y - pivotY;

      this.stars.push({
        orbitAngle: Math.atan2(dy, dx),
        orbitRadius: Math.hypot(dx, dy),
        size: rand(0.45, 1.8),
        alpha: rand(0.25, 0.92),
        twinkle: rand(0.25, 1.2),
        phase: rand(0, TAU),
        glow: rand(0.08, 0.38),
        pulse: rand(0.45, 1.8),
        bright: Math.random() < 0.16,
      });
    }
  }

  private buildGoodNightMesh(): void {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = Math.max(900, Math.floor(this.w * 0.64));
    canvas.height = Math.max(180, Math.floor(this.h * 0.16));
    this.goodNightMeshWidth = canvas.width;
    this.goodNightMeshHeight = canvas.height;

    const fontSize = Math.floor(
      Math.min(canvas.width * 0.16, canvas.height * 0.72),
    );
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`;
    ctx.fillText("Good night!", canvas.width * 0.5, canvas.height * 0.56);

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(8, Math.floor(Math.min(this.w, this.h) * 0.006));

    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        if (alpha < 130) continue;

        this.textMeshPoints.push({
          x,
          y,
          phase: rand(0, TAU),
          size: rand(0.9, 1.55),
        });
      }
    }

    const connectionCounts = new Array(this.textMeshPoints.length).fill(0);
    const threshold = Math.max(16, step * 1.95);

    for (let a = 0; a < this.textMeshPoints.length; a++) {
      for (let b = a + 1; b < this.textMeshPoints.length; b++) {
        if (connectionCounts[a] >= 5 || connectionCounts[b] >= 5) continue;

        const dx = this.textMeshPoints[a].x - this.textMeshPoints[b].x;
        const dy = this.textMeshPoints[a].y - this.textMeshPoints[b].y;
        const distance = Math.hypot(dx, dy);

        if (distance > threshold) continue;

        this.textMeshSegments.push({
          a,
          b,
          strength: 1 - distance / threshold,
        });
        connectionCounts[a]++;
        connectionCounts[b]++;
      }
    }

    const placement = this.pickGoodNightPlacement(canvas.width, canvas.height);
    this.goodNightOffsetX = placement.x;
    this.goodNightOffsetY = placement.y;
  }

  private buildClouds(): void {
    const specs = [
      {
        count: 4,
        y: this.h * 0.16,
        speed: 5,
        alpha: 0.08,
        depth: 0.22,
        scale: 1.25,
      },
      {
        count: 5,
        y: this.h * 0.27,
        speed: 8,
        alpha: 0.12,
        depth: 0.4,
        scale: 1,
      },
      {
        count: 4,
        y: this.h * 0.38,
        speed: 11,
        alpha: 0.15,
        depth: 0.62,
        scale: 0.82,
      },
    ];

    for (const spec of specs) {
      for (let i = 0; i < spec.count; i++) {
        const puffs: CloudPuff[] = [];
        const puffCount = 5 + Math.floor(Math.random() * 4);

        for (let puffIndex = 0; puffIndex < puffCount; puffIndex++) {
          puffs.push({
            dx: rand(-0.42, 0.42),
            dy: rand(-0.18, 0.18),
            radius: rand(0.24, 0.42),
          });
        }

        this.clouds.push({
          x: rand(-this.w * 0.2, this.w * 1.2),
          y: spec.y + rand(-this.h * 0.05, this.h * 0.05),
          width: rand(180, 380) * spec.scale,
          height: rand(48, 110) * spec.scale,
          alpha: spec.alpha * rand(0.85, 1.2),
          speed: spec.speed * rand(0.8, 1.3),
          phase: rand(0, TAU),
          depth: spec.depth,
          puffs,
        });
      }
    }
  }

  private buildBuildings(): void {
    const layerSpecs = [
      {
        depth: 0.12,
        baseY: this.h * 0.64,
        color: mixColor(BUILDING_COLORS[0], SKY_HORIZON, 0.24),
        edge: mixColor(BUILDING_EDGES[0], SKY_HORIZON, 0.2),
        windowAlpha: 0.34,
        widthRange: [40, 88],
        heightRange: [72, 170],
        gapRange: [2, 8],
      },
      {
        depth: 0.28,
        baseY: this.h * 0.72,
        color: BUILDING_COLORS[0],
        edge: BUILDING_EDGES[0],
        windowAlpha: 0.5,
        widthRange: [58, 120],
        heightRange: [120, 300],
        gapRange: [4, 12],
      },
      {
        depth: 0.56,
        baseY: this.h * 0.81,
        color: BUILDING_COLORS[1],
        edge: BUILDING_EDGES[1],
        windowAlpha: 0.68,
        widthRange: [80, 170],
        heightRange: [180, 420],
        gapRange: [6, 18],
      },
      {
        depth: 0.9,
        baseY: this.h * 0.91,
        color: BUILDING_COLORS[2],
        edge: BUILDING_EDGES[2],
        windowAlpha: 0.88,
        widthRange: [100, 230],
        heightRange: [250, 560],
        gapRange: [8, 22],
      },
    ] as const;

    for (const spec of layerSpecs) {
      const buildings: Building[] = [];
      let x = -80;

      while (x < this.w + 120) {
        const profile = this.createBuildingProfile(
          spec.depth,
          spec.widthRange,
          spec.heightRange,
        );
        const bodyWidth = Math.max(28, profile.width - profile.bodyInset * 2);
        const windows = this.createWindows(
          bodyWidth,
          profile.height,
          spec.depth,
          profile.windowDensity,
          profile.bodyInset,
        );
        const smokeSources = this.createSmokeSources(
          x + profile.bodyInset,
          spec.baseY,
          bodyWidth,
          profile.height,
          profile.roof,
          spec.depth,
        );

        buildings.push({
          x,
          width: profile.width,
          height: profile.height,
          kind: profile.kind,
          roof: profile.roof,
          bodyInset: profile.bodyInset,
          podiumHeight: profile.podiumHeight,
          podiumInset: profile.podiumInset,
          crownHeight: profile.crownHeight,
          crownInset: profile.crownInset,
          windowDensity: profile.windowDensity,
          windows,
          smokeSources,
        });

        x += profile.width + rand(spec.gapRange[0], spec.gapRange[1]);
      }

      this.layers.push({
        depth: spec.depth,
        baseY: spec.baseY,
        color: spec.color,
        edge: spec.edge,
        windowAlpha: spec.windowAlpha,
        buildings,
      });
    }
  }

  private createBuildingProfile(
    depth: number,
    widthRange: readonly [number, number],
    heightRange: readonly [number, number],
  ): Omit<Building, "x" | "windows" | "smokeSources"> {
    const roll = Math.random();
    const kind: Building["kind"] =
      depth > 0.82
        ? roll < 0.22
          ? "tower"
          : roll < 0.47
            ? "walkup"
            : roll < 0.7
              ? "slab"
              : "midrise"
        : depth > 0.45
          ? roll < 0.28
            ? "tower"
            : roll < 0.54
              ? "slab"
              : roll < 0.78
                ? "midrise"
                : "walkup"
          : roll < 0.34
            ? "tower"
            : roll < 0.66
              ? "slab"
              : roll < 0.88
                ? "midrise"
                : "walkup";

    let width: number;
    let height: number;
    let roof: Building["roof"];
    let bodyInset: number;
    let podiumHeight: number;
    let podiumInset: number;
    let crownHeight: number;
    let crownInset: number;
    let windowDensity: number;

    if (kind === "tower") {
      width = rand(
        Math.max(widthRange[0] * 0.95, 92),
        Math.max(widthRange[1] * 0.92, 170),
      );
      height = rand(
        Math.max(heightRange[1] * 0.72, 360),
        Math.max(heightRange[1] * 1.28, 720),
      );
      roof = Math.random() < 0.45 ? "antenna" : "step";
      bodyInset = rand(width * 0.08, width * 0.18);
      podiumHeight = rand(36, 92);
      podiumInset = rand(0, width * 0.08);
      crownHeight = rand(16, 52);
      crownInset = rand(width * 0.08, width * 0.18);
      windowDensity = rand(0.84, 0.98);
    } else if (kind === "slab") {
      width = rand(
        Math.max(widthRange[0] * 1.05, 130),
        Math.max(widthRange[1] * 1.38, 280),
      );
      height = rand(
        Math.max(heightRange[0] * 0.92, 170),
        Math.max(heightRange[1] * 0.9, 360),
      );
      roof = Math.random() < 0.7 ? "flat" : "step";
      bodyInset = rand(width * 0.02, width * 0.08);
      podiumHeight = rand(0, 34);
      podiumInset = rand(0, width * 0.05);
      crownHeight = rand(0, 18);
      crownInset = rand(width * 0.03, width * 0.1);
      windowDensity = rand(0.72, 0.9);
    } else if (kind === "walkup") {
      width = rand(
        Math.max(widthRange[0] * 0.9, 82),
        Math.max(widthRange[1] * 0.9, 170),
      );
      height = rand(92, 176);
      roof = Math.random() < 0.82 ? "flat" : "step";
      bodyInset = rand(0, width * 0.04);
      podiumHeight = 0;
      podiumInset = 0;
      crownHeight = rand(0, 10);
      crownInset = rand(width * 0.02, width * 0.07);
      windowDensity = rand(0.52, 0.72);
    } else {
      width = rand(
        Math.max(widthRange[0] * 0.94, 92),
        Math.max(widthRange[1] * 1.02, 190),
      );
      height = rand(
        Math.max(heightRange[0] * 0.82, 150),
        Math.max(heightRange[1] * 0.88, 420),
      );
      roof = Math.random() < 0.56 ? "step" : "flat";
      bodyInset = rand(width * 0.03, width * 0.1);
      podiumHeight = rand(8, 42);
      podiumInset = rand(0, width * 0.06);
      crownHeight = rand(6, 24);
      crownInset = rand(width * 0.05, width * 0.12);
      windowDensity = rand(0.68, 0.88);
    }

    return {
      width,
      height,
      kind,
      roof,
      bodyInset,
      podiumHeight,
      podiumInset,
      crownHeight,
      crownInset,
      windowDensity,
    };
  }

  private createWindows(
    width: number,
    height: number,
    depth: number,
    density: number,
    offsetX = 0,
  ): WindowLight[] {
    const windows: WindowLight[] = [];
    const marginX = width * 0.13;
    const marginTop = 20 + depth * 18;
    const spacingX = 10 + depth * 8;
    const spacingY = 12 + depth * 10;
    const windowWidth = 4 + depth * 4.5;
    const windowHeight = 6 + depth * 5.5;
    const usableWidth = width - marginX * 2;
    const usableHeight = height - marginTop - 18;
    const cols = Math.max(2, Math.floor(usableWidth / spacingX));
    const rows = Math.max(3, Math.floor(usableHeight / spacingY));

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (Math.random() > density) continue;
        if (Math.random() < 0.08 + (1 - depth) * 0.08) continue;

        windows.push({
          x: offsetX + marginX + col * spacingX,
          y: marginTop + row * spacingY,
          w: windowWidth,
          h: windowHeight,
          on: Math.random() < 0.54,
          timer: rand(0, 6),
          interval: rand(1.2, 8.5),
          color: Math.random() < 0.75 ? pick(WINDOW_WARM) : pick(WINDOW_COOL),
        });
      }
    }

    return windows;
  }

  private createSmokeSources(
    x: number,
    baseY: number,
    width: number,
    height: number,
    roof: Building["roof"],
    depth: number,
  ): SmokeSource[] {
    if (depth < 0.5 || Math.random() < 0.35) {
      return [];
    }

    const sourceCount = Math.random() < 0.6 ? 1 : 2;
    const roofLift = roof === "step" ? 18 : 0;
    const topY = baseY - height - roofLift;
    const sources: SmokeSource[] = [];

    for (let i = 0; i < sourceCount; i++) {
      sources.push({
        x: x + width * rand(0.2, 0.82),
        y: topY + rand(-4, 6),
        layerDepth: depth,
        timer: rand(0, 1.6),
        nextSpawn: rand(0.45, 1.4),
      });
    }

    return sources;
  }

  private buildWindLines(): void {
    for (let i = 0; i < WIND_LINE_COUNT; i++) {
      this.windLines.push({
        x: rand(-this.w * 0.25, this.w * 1.1),
        y: rand(this.h * 0.1, this.h * 0.55),
        length: rand(90, 280),
        speed: rand(20, 54),
        alpha: rand(0.04, 0.12),
        thickness: rand(0.8, 1.7),
        phase: rand(0, TAU),
      });
    }
  }

  private buildTrees(): void {
    let x = -70;

    while (x < this.w + 90) {
      const typeRoll = Math.random();
      const type: TreeCluster["type"] =
        typeRoll < 0.52 ? "broadleaf" : typeRoll < 0.76 ? "poplar" : "conifer";

      let width: number;
      let trunkWidth: number;
      let trunkHeight: number;
      let canopyWidth: number;
      let canopyHeight: number;

      if (type === "broadleaf") {
        width = rand(52, 96);
        trunkWidth = rand(5, 9);
        trunkHeight = rand(20, 42);
        canopyWidth = rand(40, 74);
        canopyHeight = rand(38, 82);
      } else if (type === "poplar") {
        width = rand(30, 54);
        trunkWidth = rand(4, 7);
        trunkHeight = rand(26, 52);
        canopyWidth = rand(22, 38);
        canopyHeight = rand(58, 118);
      } else {
        width = rand(38, 72);
        trunkWidth = rand(5, 8);
        trunkHeight = rand(16, 30);
        canopyWidth = rand(34, 58);
        canopyHeight = rand(72, 138);
      }

      this.trees.push({
        x,
        width,
        type,
        trunkWidth,
        trunkHeight,
        canopyWidth,
        canopyHeight,
        phase: rand(0, TAU),
        lean: rand(-1.2, 1.2),
        crownLift: rand(0.08, 0.18),
        crownLeft: rand(0.18, 0.34),
        crownRight: rand(0.18, 0.34),
        lobeCount: 4 + Math.floor(Math.random() * 4),
        bushLeft: Math.random() < 0.38 ? rand(10, 18) : 0,
        bushRight: Math.random() < 0.38 ? rand(9, 16) : 0,
        bushY: rand(4, 14),
      });

      x += width * rand(0.52, 0.9);
    }
  }

  private updateClouds(dt: number): void {
    const wind = this.getWind();

    for (const cloud of this.clouds) {
      cloud.x += (cloud.speed + wind * 10 * cloud.depth) * dt;
      cloud.y +=
        Math.sin(this.time * 0.12 + cloud.phase) * dt * 1.2 * cloud.depth;

      if (cloud.x - cloud.width > this.w + 120) {
        cloud.x = -cloud.width - rand(60, 220);
        cloud.y += rand(-50, 50);
      }
    }
  }

  private updateWindows(dt: number): void {
    for (const layer of this.layers) {
      for (const building of layer.buildings) {
        for (const light of building.windows) {
          light.timer += dt;
          if (light.timer < light.interval) continue;

          light.timer = 0;
          light.interval = rand(1.5, 9.5);

          const switchChance =
            layer.depth > 0.8 ? 0.3 : layer.depth > 0.5 ? 0.24 : 0.16;
          if (Math.random() < switchChance) {
            light.on = !light.on;
          }
        }
      }
    }
  }

  private updateSmoke(dt: number): void {
    const wind = this.getWind();

    for (const layer of this.layers) {
      for (const building of layer.buildings) {
        for (const source of building.smokeSources) {
          source.timer += dt;
          if (source.timer < source.nextSpawn) continue;

          source.timer = 0;
          source.nextSpawn = rand(0.35, 1.2);
          this.smoke.push({
            x: source.x,
            y: source.y,
            size: rand(8, 18) * source.layerDepth,
            age: 0,
            life: rand(3.6, 6.2),
            drift: rand(4, 16),
            rise: rand(10, 26),
            alpha: rand(0.08, 0.18),
            phase: rand(0, TAU),
            layerDepth: source.layerDepth,
          });
        }
      }
    }

    const nextSmoke: SmokePuff[] = [];

    for (const puff of this.smoke) {
      puff.age += dt;
      if (puff.age >= puff.life) continue;

      const ageT = puff.age / puff.life;
      puff.x += (puff.drift + wind * 18 * puff.layerDepth) * dt;
      puff.x += Math.sin(this.time * 0.55 + puff.phase + ageT * 3) * dt * 6;
      puff.y -= puff.rise * dt;
      puff.size += dt * (10 + puff.layerDepth * 8);
      nextSmoke.push(puff);
    }

    if (nextSmoke.length > MAX_SMOKE_PUFFS) {
      nextSmoke.splice(0, nextSmoke.length - MAX_SMOKE_PUFFS);
    }

    this.smoke = nextSmoke;
  }

  private updateWind(dt: number): void {
    const wind = this.getWind();

    for (const line of this.windLines) {
      line.x += (line.speed + wind * 22) * dt;
      line.y += Math.sin(this.time * 0.3 + line.phase) * dt * 3;

      if (line.x - line.length > this.w + 140) {
        line.x = -rand(120, 320);
        line.y = rand(this.h * 0.1, this.h * 0.55);
      }
    }
  }

  private updateMeteors(dt: number): void {
    this.meteorTimer += dt;

    if (
      this.meteorTimer >= this.nextMeteorIn &&
      this.meteors.length < MAX_METEORS
    ) {
      this.meteorTimer = 0;
      this.nextMeteorIn = rand(4.5, 10.5);
      this.meteors.push(this.spawnMeteor());
    }

    const active: Meteor[] = [];

    for (const meteor of this.meteors) {
      meteor.age += dt;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;

      if (
        meteor.age < meteor.life &&
        meteor.x > -meteor.length * 2 &&
        meteor.x < this.w + meteor.length * 2 &&
        meteor.y < this.h * 0.72
      ) {
        active.push(meteor);
      }
    }

    this.meteors = active;
  }

  private updateGoodNightPlacement(): void {
    const cycleIndex = Math.floor(
      (this.time + (GOOD_NIGHT_CYCLE - GOOD_NIGHT_FIRST_DELAY)) /
        GOOD_NIGHT_CYCLE,
    );

    if (cycleIndex === this.goodNightCycleIndex) return;
    if (this.goodNightMeshWidth <= 0 || this.goodNightMeshHeight <= 0) return;

    this.goodNightCycleIndex = cycleIndex;
    const placement = this.pickGoodNightPlacement(
      this.goodNightMeshWidth,
      this.goodNightMeshHeight,
    );
    this.goodNightOffsetX = placement.x;
    this.goodNightOffsetY = placement.y;
  }

  private pickGoodNightPlacement(
    meshWidth: number,
    meshHeight: number,
  ): { x: number; y: number } {
    const horizontalMargin = 40;
    const verticalMargin = 28;
    const minX = horizontalMargin;
    const maxX = Math.max(minX, this.w - meshWidth - horizontalMargin);
    const minY = this.h * 0.03;
    let best = {
      x: this.w * 0.5 - meshWidth * 0.5,
      y: minY,
      clearance: -Infinity,
    };

    for (let attempt = 0; attempt < 18; attempt++) {
      const x = rand(minX, maxX);
      let skylineTop = this.h * 0.8;

      for (const layer of this.layers) {
        for (const building of layer.buildings) {
          const roofExtra =
            building.roof === "antenna"
              ? 24
              : building.roof === "step"
                ? 18
                : 0;
          const buildingTop =
            layer.baseY -
            building.height -
            Math.max(building.crownHeight, roofExtra);
          const buildingLeft = building.x;
          const buildingRight = building.x + building.width;
          const overlaps =
            x + meshWidth > buildingLeft - 24 && x < buildingRight + 24;

          if (overlaps) {
            skylineTop = Math.min(skylineTop, buildingTop);
          }
        }
      }

      const maxY = Math.min(
        this.h * 0.16,
        skylineTop - meshHeight - verticalMargin,
      );

      if (maxY > minY + 4) {
        return {
          x,
          y: rand(minY, maxY),
        };
      }

      if (maxY > best.clearance) {
        best = {
          x,
          y: minY,
          clearance: maxY,
        };
      }
    }

    return {
      x: best.x,
      y: clamp(best.clearance, minY, this.h * 0.12),
    };
  }

  private spawnMeteor(): Meteor {
    const startFromLeft = Math.random() < 0.7;
    const x = startFromLeft
      ? rand(-this.w * 0.12, this.w * 0.35)
      : rand(this.w * 0.4, this.w * 0.92);
    const y = rand(this.h * 0.06, this.h * 0.28);
    const vx = startFromLeft ? rand(440, 760) : rand(-760, -440);
    const vy = rand(140, 240);

    return {
      x,
      y,
      vx,
      vy,
      length: rand(110, 220),
      age: 0,
      life: rand(0.7, 1.5),
      alpha: rand(0.55, 0.9),
      thickness: rand(1.4, 2.6),
    };
  }

  private getWind(): number {
    return (
      Math.sin(this.time * 0.18) * 0.9 + Math.sin(this.time * 0.05 + 1.3) * 0.45
    );
  }

  private getGoodNightVisibility(): number {
    const cycleT =
      (this.time + (GOOD_NIGHT_CYCLE - GOOD_NIGHT_FIRST_DELAY)) %
      GOOD_NIGHT_CYCLE;

    if (cycleT > GOOD_NIGHT_DURATION) {
      return 0;
    }

    const fadeIn = 1.3;
    const fadeOut = 1.5;

    if (cycleT < fadeIn) {
      return cycleT / fadeIn;
    }

    if (cycleT > GOOD_NIGHT_DURATION - fadeOut) {
      return (GOOD_NIGHT_DURATION - cycleT) / fadeOut;
    }

    return 1;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    this.drawSky(g);
    this.drawStars(g);
    this.drawGoodNightMesh(g);
    this.drawMeteors(g);
    this.drawMoon(g);
    this.drawWind(g);
    this.drawClouds(g);
    this.drawHaze(g);
    this.drawBuildings(g);
    this.drawTreeSilhouettes(g);
    this.drawSmoke(g);
  }

  private drawSky(g: Graphics): void {
    const bands = 18;

    for (let i = 0; i < bands; i++) {
      const y = (this.h / bands) * i;
      const t = i / Math.max(1, bands - 1);
      const upper = mixColor(SKY_TOP, SKY_MID, Math.min(1, t * 1.25));
      const color = mixColor(
        upper,
        SKY_HORIZON,
        Math.max(0, (t - 0.45) / 0.55),
      );
      g.rect(0, y, this.w, this.h / bands + 2).fill({ color });
    }

    g.rect(0, this.h * 0.58, this.w, this.h * 0.16).fill({
      color: HORIZON_GLOW,
      alpha: 0.13,
    });
    g.rect(0, this.h * 0.7, this.w, this.h * 0.14).fill({
      color: 0x1f3358,
      alpha: 0.17,
    });
  }

  private drawStars(g: Graphics): void {
    const pivotX = this.w * 0.78;
    const pivotY = this.h * 1.12;
    const orbitRotation = this.time * STELLAR_ROTATION_SPEED;

    for (const star of this.stars) {
      const angle = star.orbitAngle + orbitRotation;
      const starX = pivotX + Math.cos(angle) * star.orbitRadius;
      const starY = pivotY + Math.sin(angle) * star.orbitRadius;

      if (
        starX < -24 ||
        starX > this.w + 24 ||
        starY < -24 ||
        starY > this.h * 0.78
      ) {
        continue;
      }

      const twinkle =
        0.45 + 0.55 * Math.sin(this.time * star.twinkle + star.phase);
      const pulse =
        0.55 + 0.45 * Math.sin(this.time * star.pulse + star.phase * 1.7);
      const alpha = star.alpha * twinkle;
      const glowAlpha = alpha * (star.glow + pulse * 0.24);
      const flare = star.bright ? 1.55 : 1;

      g.circle(starX, starY, star.size * 5.4 * flare).fill({
        color: MOON_GLOW,
        alpha: glowAlpha * 0.06,
      });
      g.circle(starX, starY, star.size * 3.1 * flare).fill({
        color: 0xa7c8ff,
        alpha: glowAlpha * 0.11,
      });
      g.circle(starX, starY, star.size).fill({
        color: STAR,
        alpha,
      });

      if (star.bright) {
        const ray = star.size * (2.1 + pulse * 1.5);
        g.moveTo(starX - ray, starY)
          .lineTo(starX + ray, starY)
          .stroke({
            color: 0xdce9ff,
            width: 0.7,
            alpha: glowAlpha * 0.24,
            cap: "round",
          });
        g.moveTo(starX, starY - ray)
          .lineTo(starX, starY + ray)
          .stroke({
            color: 0xdce9ff,
            width: 0.7,
            alpha: glowAlpha * 0.2,
            cap: "round",
          });
      }
    }
  }

  private drawGoodNightMesh(g: Graphics): void {
    const visibility = this.getGoodNightVisibility();
    if (visibility <= 0 || this.textMeshPoints.length === 0) return;

    const projected = this.textMeshPoints.map((point) => ({
      x:
        this.goodNightOffsetX +
        point.x +
        Math.sin(this.time * 0.55 + point.phase) * 1.6,
      y:
        this.goodNightOffsetY +
        point.y +
        Math.cos(this.time * 0.48 + point.phase * 1.2) * 1.2,
      size: point.size,
      phase: point.phase,
    }));
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 1.15);

    for (const segment of this.textMeshSegments) {
      const a = projected[segment.a];
      const b = projected[segment.b];

      g.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({
          color: 0x8fc3ff,
          width: 0.8 + segment.strength * 0.45,
          alpha: visibility * (0.09 + segment.strength * 0.22) * pulse,
          cap: "round",
        });
    }

    for (const point of projected) {
      const glow = 0.55 + 0.45 * Math.sin(this.time * 1.3 + point.phase);

      g.circle(point.x, point.y, point.size * 4.2).fill({
        color: 0x9fcdff,
        alpha: visibility * 0.08 * glow,
      });
      g.circle(point.x, point.y, point.size * 1.35).fill({
        color: 0xf5fbff,
        alpha: visibility * (0.48 + glow * 0.26),
      });
    }
  }

  private drawMeteors(g: Graphics): void {
    for (const meteor of this.meteors) {
      const ageT = meteor.age / meteor.life;
      const alpha = meteor.alpha * Math.sin(Math.min(1, ageT) * Math.PI);
      const speed = Math.hypot(meteor.vx, meteor.vy) || 1;
      const dirX = meteor.vx / speed;
      const dirY = meteor.vy / speed;
      const tailX = meteor.x - dirX * meteor.length;
      const tailY = meteor.y - dirY * meteor.length;

      g.moveTo(tailX, tailY)
        .lineTo(meteor.x, meteor.y)
        .stroke({
          color: 0xa7d3ff,
          width: meteor.thickness * 2.3,
          alpha: alpha * 0.13,
          cap: "round",
        });
      g.moveTo(tailX, tailY).lineTo(meteor.x, meteor.y).stroke({
        color: 0xf6f4ff,
        width: meteor.thickness,
        alpha,
        cap: "round",
      });
      g.circle(meteor.x, meteor.y, meteor.thickness * 1.8).fill({
        color: 0xffffff,
        alpha: alpha * 0.92,
      });
    }
  }

  private drawMoon(g: Graphics): void {
    const moonTravel = (this.time * 5.5) % (this.w * 1.7);
    const x = -this.w * 0.35 + moonTravel;
    const y = this.h * 0.16 + Math.sin(this.time * 0.08) * 22;
    const radius = Math.min(this.w, this.h) * 0.052;

    g.circle(x, y, radius * 2.7).fill({ color: MOON_GLOW, alpha: 0.06 });
    g.circle(x, y, radius * 1.8).fill({ color: MOON_GLOW, alpha: 0.09 });
    g.circle(x, y, radius).fill({ color: MOON, alpha: 0.95 });
    g.circle(x + radius * 0.24, y - radius * 0.12, radius * 0.84).fill({
      color: SKY_MID,
      alpha: 0.1,
    });
  }

  private drawWind(g: Graphics): void {
    for (const line of this.windLines) {
      const amplitude = 5 + Math.sin(this.time * 0.25 + line.phase) * 2;
      const step = line.length / 5;
      const alpha =
        line.alpha * (0.6 + 0.4 * Math.sin(this.time * 0.35 + line.phase));

      let prevX = line.x;
      let prevY = line.y;

      for (let i = 1; i <= 5; i++) {
        const x = line.x + step * i;
        const y =
          line.y +
          Math.sin(this.time * 0.55 + line.phase + i * 0.7) * amplitude * 0.35;

        g.moveTo(prevX, prevY).lineTo(x, y).stroke({
          color: WIND,
          width: line.thickness,
          alpha,
          cap: "round",
        });

        prevX = x;
        prevY = y;
      }
    }
  }

  private drawClouds(g: Graphics): void {
    for (const cloud of this.clouds) {
      const driftAlpha =
        cloud.alpha * (0.82 + Math.sin(this.time * 0.16 + cloud.phase) * 0.12);

      for (const puff of cloud.puffs) {
        g.circle(
          cloud.x + puff.dx * cloud.width,
          cloud.y + puff.dy * cloud.height,
          puff.radius * cloud.width,
        ).fill({
          color: CLOUD,
          alpha: driftAlpha,
        });
      }
    }
  }

  private drawHaze(g: Graphics): void {
    g.rect(0, this.h * 0.62, this.w, this.h * 0.16).fill({
      color: 0x5273aa,
      alpha: 0.04,
    });
    g.rect(0, this.h * 0.72, this.w, this.h * 0.18).fill({
      color: 0x6085c4,
      alpha: 0.045,
    });
    g.rect(0, this.h * 0.82, this.w, this.h * 0.13).fill({
      color: 0x9bc2ff,
      alpha: 0.035,
    });
  }

  private drawBuildings(g: Graphics): void {
    for (const layer of this.layers) {
      for (const building of layer.buildings) {
        const topY = layer.baseY - building.height;
        const bodyX = building.x + building.bodyInset;
        const bodyWidth = Math.max(28, building.width - building.bodyInset * 2);
        const podiumHeight = building.podiumHeight;
        const podiumTop = layer.baseY - podiumHeight;
        const podiumX = building.x + building.podiumInset;
        const podiumWidth = Math.max(
          30,
          building.width - building.podiumInset * 2,
        );

        if (podiumHeight > 0) {
          g.rect(podiumX, podiumTop, podiumWidth, podiumHeight).fill({
            color: mixColor(layer.color, layer.edge, 0.16),
          });
        }

        g.rect(bodyX, topY, bodyWidth, building.height).fill({
          color: layer.color,
        });

        g.rect(
          bodyX + bodyWidth * 0.78,
          topY,
          bodyWidth * 0.06,
          building.height,
        ).fill({
          color: layer.edge,
          alpha: 0.55,
        });

        if (building.crownHeight > 0) {
          const crownX = bodyX + building.crownInset;
          const crownWidth = Math.max(18, bodyWidth - building.crownInset * 2);

          g.rect(
            crownX,
            topY - building.crownHeight,
            crownWidth,
            building.crownHeight,
          ).fill({
            color: mixColor(layer.color, layer.edge, 0.08),
          });
        }

        if (building.roof === "step") {
          g.rect(
            bodyX + bodyWidth * 0.16,
            topY - 18,
            bodyWidth * 0.38,
            18,
          ).fill({ color: layer.color });
        } else if (building.roof === "antenna") {
          const antennaX = bodyX + bodyWidth * 0.56;
          g.moveTo(antennaX, topY)
            .lineTo(antennaX, topY - 24)
            .stroke({ color: layer.edge, width: 2, alpha: 0.85 });
          g.circle(antennaX, topY - 24, 1.7).fill({
            color: WINDOW_WARM[0],
            alpha: 0.95,
          });
        }

        for (const source of building.smokeSources) {
          g.rect(source.x - 5, source.y - 10, 10, 10).fill({
            color: layer.edge,
            alpha: 0.9,
          });
        }

        if (building.kind === "walkup") {
          const bandY = topY + building.height * 0.16;
          g.rect(bodyX, bandY, bodyWidth, 3).fill({
            color: layer.edge,
            alpha: 0.32,
          });
        } else if (building.kind === "tower") {
          g.rect(
            bodyX + bodyWidth * 0.14,
            topY,
            bodyWidth * 0.05,
            building.height,
          ).fill({
            color: layer.edge,
            alpha: 0.18,
          });
        }

        for (const light of building.windows) {
          const twinkle =
            0.82 +
            Math.sin(this.time * 0.4 + light.x * 0.05 + light.y * 0.03) * 0.1;
          const x = building.x + light.x;
          const y = topY + light.y;

          if (light.on) {
            g.rect(x - 1, y - 1, light.w + 2, light.h + 2).fill({
              color: light.color,
              alpha: layer.windowAlpha * 0.18 * twinkle,
            });
            g.rect(x, y, light.w, light.h).fill({
              color: light.color,
              alpha: layer.windowAlpha * twinkle,
            });
          } else {
            g.rect(x, y, light.w, light.h).fill({
              color: 0x091220,
              alpha: 0.65,
            });
          }
        }
      }
    }

    g.rect(0, this.h * 0.95, this.w, this.h * 0.05).fill({
      color: 0x05080d,
      alpha: 0.92,
    });
  }

  private drawTreeSilhouettes(g: Graphics): void {
    const groundY = this.h * 0.95;
    const wind = this.getWind();

    for (const tree of this.trees) {
      const sway = Math.sin(this.time * 0.7 + tree.phase) * (1.6 + wind * 0.7);
      const trunkX = tree.x + tree.width * 0.5;
      const trunkTop = groundY - tree.trunkHeight;

      g.rect(
        trunkX - tree.trunkWidth * 0.5 + tree.lean * 0.3,
        trunkTop,
        tree.trunkWidth,
        tree.trunkHeight,
      ).fill({
        color: 0x020407,
        alpha: 0.98,
      });

      g.circle(
        trunkX + sway * 0.18,
        trunkTop + tree.trunkWidth * 0.15,
        Math.max(tree.trunkWidth * 1.15, tree.canopyWidth * 0.09),
      ).fill({
        color: 0x030508,
        alpha: 0.98,
      });

      if (tree.type === "conifer") {
        drawConifer(g, tree, trunkX, trunkTop, sway);
      } else if (tree.type === "poplar") {
        drawPoplar(g, tree, trunkX, trunkTop, sway);
      } else {
        drawBroadleaf(g, tree, trunkX, trunkTop, sway);
      }

      if (tree.bushLeft > 0) {
        const bushY = groundY - tree.bushY;
        g.circle(tree.x + tree.width * 0.2, bushY, tree.bushLeft).fill({
          color: 0x030508,
          alpha: 0.98,
        });
      }

      if (tree.bushRight > 0) {
        g.circle(
          tree.x + tree.width * 0.78,
          groundY - tree.bushY + 1.5,
          tree.bushRight,
        ).fill({
          color: 0x030508,
          alpha: 0.98,
        });
      }
    }
  }

  private drawSmoke(g: Graphics): void {
    for (const puff of this.smoke) {
      const ageT = puff.age / puff.life;
      const alpha =
        puff.alpha * (1 - ageT) * clamp(0.55 + puff.layerDepth * 0.8, 0, 1);
      const radius = puff.size * (0.8 + ageT * 0.65);

      g.circle(puff.x, puff.y, radius * 1.3).fill({
        color: 0xa9b7cf,
        alpha: alpha * 0.14,
      });
      g.circle(puff.x, puff.y, radius).fill({
        color: 0x73829f,
        alpha,
      });
    }
  }
}
