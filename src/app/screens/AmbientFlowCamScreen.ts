import type { Ticker } from "pixi.js";
import { BlurFilter, Container, Graphics } from "pixi.js";
import { clamp, TAU } from "../../lib/math";

const ICE = 0xeafcff;
const TEAL = 0x53f2dc;
const AQUA = 0x4ed9ff;
const MINT = 0x9ff7d7;
const SKY = 0x8cb8ff;

const ACCENT_PALETTE = [TEAL, AQUA, MINT, SKY] as const;

const FLOW_RINGS = [
  {
    offset: 16,
    amplitude: 7,
    elevation: 10,
    frequencyA: 3,
    frequencyB: 6,
    speed: 0.42,
    phase: 0.0,
    color: ICE,
    alpha: 0.22,
    width: 1.9,
  },
  {
    offset: 34,
    amplitude: 9,
    elevation: 12,
    frequencyA: 4,
    frequencyB: 6,
    speed: -0.3,
    phase: 1.7,
    color: AQUA,
    alpha: 0.16,
    width: 1.4,
  },
] as const;

interface OrbitElement {
  baseAngle: number;
  speed: number;
  radiusOffset: number;
  length: number;
  width: number;
  phase: number;
  color: number;
  alpha: number;
}

interface AccentParticle {
  baseAngle: number;
  speed: number;
  radiusOffset: number;
  size: number;
  phase: number;
  color: number;
  alpha: number;
}

export class AmbientFlowCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly auraLayer = new Container();
  private readonly elementLayer = new Container();
  private readonly lineLayer = new Container();
  private readonly accentLayer = new Container();
  private readonly rimLayer = new Container();

  private readonly auraGfx = new Graphics();
  private readonly elementGfx = new Graphics();
  private readonly lineGfx = new Graphics();
  private readonly accentGfx = new Graphics();
  private readonly rimGfx = new Graphics();

  private readonly pathBuffer: number[] = [];
  private readonly orbitElements: OrbitElement[] = [];
  private readonly accentParticles: AccentParticle[] = [];

  private screenWidth = 1920;
  private screenHeight = 1080;
  private time = 0;

  constructor() {
    super();

    const auraBlur = new BlurFilter({ strength: 26, quality: 5 });
    auraBlur.padding = 120;
    this.auraLayer.filters = [auraBlur];

    this.addChild(this.world);
    this.world.addChild(this.auraLayer);
    this.world.addChild(this.elementLayer);
    this.world.addChild(this.lineLayer);
    this.world.addChild(this.accentLayer);
    this.world.addChild(this.rimLayer);

    this.auraLayer.addChild(this.auraGfx);
    this.elementLayer.addChild(this.elementGfx);
    this.lineLayer.addChild(this.lineGfx);
    this.accentLayer.addChild(this.accentGfx);
    this.rimLayer.addChild(this.rimGfx);

    this.seedOrbitElements();
    this.seedAccentParticles();
  }

  private get baseSize(): number {
    return Math.min(this.screenWidth, this.screenHeight);
  }

  private get cameraRadius(): number {
    return this.baseSize * 0.225;
  }

  private get borderRadius(): number {
    return this.cameraRadius + this.baseSize * 0.078;
  }

  public resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.world.position.set(width * 0.5, height * 0.5);
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    this.drawAura();
    this.drawOrbitElements();
    this.drawFlowLines();
    this.drawAccentParticles();
    this.drawRim();
  }

  private seedOrbitElements(): void {
    const elementCount = 16;
    let colorIndex = 0;
    for (let i = 0; i < elementCount; i++) {
      this.orbitElements.push({
        baseAngle: (i / elementCount) * TAU + Math.random() * 0.14,
        speed: (0.08 + Math.random() * 0.08) * (Math.random() > 0.5 ? 1 : -1),
        radiusOffset: 18 + Math.random() * 42,
        length: 18 + Math.random() * 24,
        width: 1.4 + Math.random() * 1.8,
        phase: Math.random() * TAU,
        color: ACCENT_PALETTE[colorIndex % ACCENT_PALETTE.length],
        alpha: 0.42 + Math.random() * 0.24,
      });
      colorIndex += 1;
    }
  }

  private seedAccentParticles(): void {
    for (let i = 0; i < 18; i++) {
      this.accentParticles.push({
        baseAngle: (i / 18) * TAU + Math.random() * 0.2,
        speed: (0.1 + Math.random() * 0.09) * (Math.random() > 0.5 ? 1 : -1),
        radiusOffset: 18 + Math.random() * 58,
        size: 2 + Math.random() * 4,
        phase: Math.random() * TAU,
        color: i % 3 === 0 ? ICE : ACCENT_PALETTE[i % ACCENT_PALETTE.length],
        alpha: 0.34 + Math.random() * 0.3,
      });
    }
  }

  private drawAura(): void {
    const g = this.auraGfx;
    g.clear();

    this.strokeFluidLoop(g, this.borderRadius + 18, {
      amplitude: 12,
      elevation: 18,
      frequencyA: 2,
      frequencyB: 5,
      speed: 0.22,
      phase: 0.5,
      color: TEAL,
      alpha: 0.09,
      width: this.baseSize * 0.028,
    });

    this.strokeFluidLoop(g, this.borderRadius + 42, {
      amplitude: 16,
      elevation: 28,
      frequencyA: 3,
      frequencyB: 6,
      speed: -0.18,
      phase: 2.1,
      color: AQUA,
      alpha: 0.06,
      width: this.baseSize * 0.024,
    });

    this.strokeFluidLoop(g, this.borderRadius - 4, {
      amplitude: 8,
      elevation: 12,
      frequencyA: 4,
      frequencyB: 9,
      speed: 0.3,
      phase: 4.8,
      color: ICE,
      alpha: 0.05,
      width: this.baseSize * 0.016,
    });
  }

  private drawOrbitElements(): void {
    const g = this.elementGfx;
    g.clear();

    for (const element of this.orbitElements) {
      const angle = element.baseAngle + this.time * element.speed;
      const wave =
        Math.sin(this.time * 0.9 + element.phase) * 8 +
        Math.sin(angle * 3.2 + element.phase) * 6;
      const radius = this.borderRadius + element.radiusOffset + wave;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const tangentX = -Math.sin(angle);
      const tangentY = Math.cos(angle);
      const normalX = Math.cos(angle);
      const normalY = Math.sin(angle);
      const length =
        element.length * (0.86 + 0.18 * Math.sin(this.time + element.phase));
      const width =
        element.width *
        (0.9 + 0.16 * Math.cos(this.time * 1.2 + element.phase));
      const lift = 6 + Math.max(0, wave) * 0.45;

      const x1 = x - tangentX * length * 0.5;
      const y1 = y - tangentY * length * 0.5;
      const x2 = x + tangentX * length * 0.5;
      const y2 = y + tangentY * length * 0.5;
      const anchorX = x + normalX * lift;
      const anchorY = y + normalY * lift;

      g.moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({
          color: element.color,
          alpha: element.alpha * 0.22,
          width: width * 2.2,
          cap: "round",
          join: "round",
        });

      g.moveTo(x1, y1).lineTo(x2, y2).stroke({
        color: element.color,
        alpha: element.alpha,
        width,
        cap: "round",
        join: "round",
      });

      g.moveTo(x1, y1)
        .quadraticCurveTo(anchorX, anchorY, x2, y2)
        .stroke({
          color: element.color,
          alpha: element.alpha * 0.48,
          width: Math.max(1, width * 0.52),
          cap: "round",
          join: "round",
        });

      g.circle(x1, y1, width * 0.72).fill({
        color: element.color,
        alpha: element.alpha * 0.24,
      });
      g.circle(x2, y2, width * 0.72).fill({
        color: element.color,
        alpha: element.alpha * 0.24,
      });
      g.circle(anchorX, anchorY, width * 0.58).fill({
        color: element.color,
        alpha: element.alpha * 0.82,
      });
    }
  }

  private drawFlowLines(): void {
    const g = this.lineGfx;
    g.clear();

    for (const ring of FLOW_RINGS) {
      this.strokeFluidLoop(g, this.borderRadius + ring.offset, ring);
    }

    for (let i = 0; i < 3; i++) {
      const sweep = 0.72 + i * 0.18;
      const start = this.time * (0.18 + i * 0.03) + i * 2.1;
      this.drawArcSegment(
        g,
        this.borderRadius + 18 + i * 16,
        start,
        sweep,
        3 - i * 0.55,
        i === 0 ? ICE : AQUA,
        0.12 - i * 0.02,
      );
    }
  }

  private drawAccentParticles(): void {
    const g = this.accentGfx;
    g.clear();

    for (const particle of this.accentParticles) {
      const angle = particle.baseAngle + this.time * particle.speed;
      const crest =
        Math.max(0, Math.sin(angle * 3.6 - this.time * 0.8 + particle.phase)) *
        (10 + this.baseSize * 0.005);
      const shimmer = 0.55 + 0.45 * Math.sin(this.time * 1.4 + particle.phase);
      const radius = this.borderRadius + particle.radiusOffset + crest;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const tailX = -Math.sin(angle);
      const tailY = Math.cos(angle);
      const tailLength = particle.size * 4.8;

      g.moveTo(x - tailX * tailLength, y - tailY * tailLength)
        .lineTo(x, y)
        .stroke({
          color: particle.color,
          alpha: particle.alpha * 0.45 * shimmer,
          width: particle.size * 0.8,
          cap: "round",
        });

      g.circle(x, y, particle.size * (0.8 + 0.35 * shimmer)).fill({
        color: particle.color,
        alpha: particle.alpha * shimmer,
      });
    }
  }

  private drawRim(): void {
    const g = this.rimGfx;
    g.clear();

    g.circle(0, 0, this.cameraRadius + 7).stroke({
      color: TEAL,
      width: Math.max(8, this.baseSize * 0.012),
      alpha: 0.08,
    });

    g.circle(0, 0, this.cameraRadius + 7).stroke({
      color: AQUA,
      width: Math.max(4.5, this.baseSize * 0.006),
      alpha: 0.15,
    });

    g.circle(0, 0, this.cameraRadius + 1.5).stroke({
      color: ICE,
      width: Math.max(1.5, this.baseSize * 0.0022),
      alpha: 0.76,
    });

    g.circle(0, 0, this.cameraRadius + this.baseSize * 0.012).stroke({
      color: AQUA,
      width: Math.max(1, this.baseSize * 0.0015),
      alpha: 0.18,
    });

    const boldRadius = this.cameraRadius + 7;
    this.drawArcSegment(g, boldRadius, -0.28, 0.54, 12, TEAL, 0.28);
    this.drawArcSegment(g, boldRadius, 1.02, 0.34, 9, SKY, 0.22);
    this.drawArcSegment(g, boldRadius, 1.98, 0.62, 11, AQUA, 0.24);
    this.drawArcSegment(g, boldRadius, 3.62, 0.42, 9, TEAL, 0.22);
    this.drawArcSegment(g, boldRadius, 4.26, 0.58, 12, ICE, 0.24);
    this.drawArcSegment(g, boldRadius, 5.38, 0.3, 8, MINT, 0.2);

    this.drawArcSegment(g, boldRadius, -0.28, 0.54, 5.5, ICE, 0.6);
    this.drawArcSegment(g, boldRadius, 1.98, 0.62, 5, ICE, 0.52);
    this.drawArcSegment(g, boldRadius, 4.26, 0.58, 5.5, AQUA, 0.56);

    this.drawArcSegment(g, this.cameraRadius + 12, 0.52, 0.24, 4, ICE, 0.4);
    this.drawArcSegment(g, this.cameraRadius + 12, 2.72, 0.2, 3.5, AQUA, 0.34);
    this.drawArcSegment(g, this.cameraRadius + 12, 5.76, 0.22, 3.5, TEAL, 0.34);

    for (const angle of [0.08, 1.72, 3.26, 4.96]) {
      const inner = this.cameraRadius + 16;
      const outer = this.cameraRadius + 32;
      const cos = Math.cos(angle + this.time * 0.03);
      const sin = Math.sin(angle + this.time * 0.03);
      g.moveTo(cos * inner, sin * inner)
        .lineTo(cos * outer, sin * outer)
        .stroke({
          color: ICE,
          alpha: 0.22,
          width: 1.6,
          cap: "round",
        });
    }
  }

  private strokeFluidLoop(
    g: Graphics,
    baseRadius: number,
    config: {
      amplitude: number;
      elevation: number;
      frequencyA: number;
      frequencyB: number;
      speed: number;
      phase: number;
      color: number;
      alpha: number;
      width: number;
    },
  ): void {
    const steps = 220;
    const path = this.pathBuffer;
    path.length = 0;

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * TAU;
      const waveA =
        Math.sin(
          angle * config.frequencyA + this.time * config.speed + config.phase,
        ) * config.amplitude;
      const waveB =
        Math.sin(
          angle * config.frequencyB -
            this.time * config.speed * 0.7 -
            config.phase * 1.3,
        ) *
        config.amplitude *
        0.46;
      const crest =
        Math.max(
          0,
          Math.sin(
            angle * (config.frequencyA * 0.5 + 1.5) -
              this.time * 0.85 +
              config.phase * 0.8,
          ),
        ) * config.elevation;
      const radius = baseRadius + waveA + waveB + crest;

      path.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

    g.poly(path).stroke({
      color: config.color,
      alpha: config.alpha,
      width: config.width,
      cap: "round",
      join: "round",
    });
  }

  private drawArcSegment(
    g: Graphics,
    radius: number,
    start: number,
    sweep: number,
    width: number,
    color: number,
    alpha: number,
  ): void {
    const path = this.pathBuffer;
    path.length = 0;

    const steps = clamp(Math.round((Math.abs(sweep) / TAU) * 120), 24, 90);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = start + sweep * t;
      const wobble =
        Math.sin(t * Math.PI) *
        Math.sin(this.time * 0.6 + start * 2.7) *
        (this.baseSize * 0.004);
      const r = radius + wobble;
      path.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }

    g.poly(path).stroke({
      color,
      alpha,
      width,
      cap: "round",
      join: "round",
    });
  }
}
