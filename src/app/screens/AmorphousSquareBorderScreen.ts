import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const SIZE = 600;
const CX = SIZE / 2;
const CY = SIZE / 2;

const MAUVE = 0xcba6f7;
const LAVENDER = 0xb4befe;
const SAPPHIRE = 0x74c7ec;
const BLUE = 0x89b4fa;
const TEAL = 0x94e2d5;

// Points sampled per border path
const STEPS = 240;

interface Layer {
  halfSize: number; // half-extent of the square template
  amp1: number;
  freq1: number; // wave cycles around full perimeter
  speed1: number; // phase drift, rad/s
  phase1: number;
  amp2: number;
  freq2: number;
  speed2: number;
  phase2: number;
  color: number;
  alpha: number;
  width: number;
}

// Layers ordered innermost → outermost
const LAYERS: Layer[] = [
  // Straight black back line — no displacement
  {
    halfSize: 220,
    amp1: 0,
    freq1: 1,
    speed1: 0,
    phase1: 0,
    amp2: 0,
    freq2: 1,
    speed2: 0,
    phase2: 0,
    color: 0x000000,
    alpha: 0.9,
    width: 8,
  },
  // Inner repulsor A — drifts outward
  {
    halfSize: 226,
    amp1: 14,
    freq1: 6,
    speed1: 1.1,
    phase1: 0,
    amp2: 6,
    freq2: 13,
    speed2: -0.8,
    phase2: 0.7,
    color: LAVENDER,
    alpha: 0.55,
    width: 2,
  },
  // Inner repulsor B — opposing phase/drift, pushes apart from A
  {
    halfSize: 229,
    amp1: 14,
    freq1: 6,
    speed1: -1.1,
    phase1: 3.14,
    amp2: 6,
    freq2: 13,
    speed2: 0.8,
    phase2: 3.84,
    color: MAUVE,
    alpha: 0.45,
    width: 1.5,
  },
  // Thin crisp inner accent
  {
    halfSize: 234,
    amp1: 2,
    freq1: 7,
    speed1: 0.4,
    phase1: 0,
    amp2: 1,
    freq2: 15,
    speed2: -0.6,
    phase2: 1.2,
    color: LAVENDER,
    alpha: 0.3,
    width: 1.5,
  },
  // Inner frame — slight breath
  {
    halfSize: 240,
    amp1: 5,
    freq1: 5,
    speed1: 0.28,
    phase1: 0.8,
    amp2: 2.5,
    freq2: 11,
    speed2: 0.45,
    phase2: 2.1,
    color: LAVENDER,
    alpha: 0.6,
    width: 2.5,
  },
  // Mid repulsor A — fast outward swell
  {
    halfSize: 245,
    amp1: 18,
    freq1: 4,
    speed1: 0.95,
    phase1: 0.5,
    amp2: 9,
    freq2: 9,
    speed2: -0.7,
    phase2: 1.8,
    color: SAPPHIRE,
    alpha: 0.6,
    width: 2.5,
  },
  // Mid repulsor B — phase-inverted, repulses from A
  {
    halfSize: 248,
    amp1: 18,
    freq1: 4,
    speed1: -0.95,
    phase1: 3.64,
    amp2: 9,
    freq2: 9,
    speed2: 0.7,
    phase2: 4.94,
    color: TEAL,
    alpha: 0.45,
    width: 2,
  },
  // Main bold frame — centrepiece
  {
    halfSize: 252,
    amp1: 7,
    freq1: 3,
    speed1: 0.2,
    phase1: 1.6,
    amp2: 3.5,
    freq2: 8,
    speed2: -0.32,
    phase2: 0.4,
    color: MAUVE,
    alpha: 0.88,
    width: 6,
  },
  // Outer fast wave — clearly visible moving sine
  {
    halfSize: 257,
    amp1: 16,
    freq1: 5,
    speed1: 0.85,
    phase1: 2.0,
    amp2: 7,
    freq2: 11,
    speed2: -0.6,
    phase2: 0.9,
    color: BLUE,
    alpha: 0.55,
    width: 2.5,
  },
  // Mid outer layer — more fluid
  {
    halfSize: 260,
    amp1: 11,
    freq1: 4.5,
    speed1: -0.18,
    phase1: 2.7,
    amp2: 5,
    freq2: 10,
    speed2: 0.38,
    phase2: 3.5,
    color: SAPPHIRE,
    alpha: 0.5,
    width: 3.5,
  },
  // Outer repulsor A
  {
    halfSize: 264,
    amp1: 20,
    freq1: 3,
    speed1: 0.6,
    phase1: 0.3,
    amp2: 10,
    freq2: 7,
    speed2: -0.45,
    phase2: 2.1,
    color: BLUE,
    alpha: 0.4,
    width: 2,
  },
  // Outer repulsor B — opposing drift
  {
    halfSize: 268,
    amp1: 20,
    freq1: 3,
    speed1: -0.6,
    phase1: 3.44,
    amp2: 10,
    freq2: 7,
    speed2: 0.45,
    phase2: 5.24,
    color: TEAL,
    alpha: 0.28,
    width: 2,
  },
  // Outermost diffuse halo
  {
    halfSize: 272,
    amp1: 22,
    freq1: 2,
    speed1: -0.1,
    phase1: 1.1,
    amp2: 11,
    freq2: 4.5,
    speed2: 0.17,
    phase2: 3.0,
    color: TEAL,
    alpha: 0.12,
    width: 1.5,
  },
];

export class AmorphousSquareBorderScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly gfx = new Graphics();
  private time = 0;

  constructor() {
    super();
    this.world.x = CX;
    this.world.y = CY;
    this.addChild(this.world);
    this.world.addChild(this.gfx);
  }

  public async show(): Promise<void> {}

  public update(ticker: Ticker): void {
    this.time += Math.min(ticker.deltaMS, 50) / 1000;
    this.draw();
  }

  public resize(width: number, height: number): void {
    this.x = Math.round((width - SIZE) / 2);
    this.y = Math.round((height - SIZE) / 2);
  }

  private squarePath(
    halfSize: number,
    amp1: number,
    freq1: number,
    phase1: number,
    amp2: number,
    freq2: number,
    phase2: number,
  ): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i <= STEPS; i++) {
      // t ∈ [0, 4): one unit per side
      const t = (i / STEPS) * 4;
      const s = t % 4;

      let px: number, py: number, nx: number, ny: number;

      if (s < 1) {
        // Top — left to right
        px = -halfSize + s * 2 * halfSize;
        py = -halfSize;
        nx = 0;
        ny = -1;
      } else if (s < 2) {
        // Right — top to bottom
        px = halfSize;
        py = -halfSize + (s - 1) * 2 * halfSize;
        nx = 1;
        ny = 0;
      } else if (s < 3) {
        // Bottom — right to left
        px = halfSize - (s - 2) * 2 * halfSize;
        py = halfSize;
        nx = 0;
        ny = 1;
      } else {
        // Left — bottom to top
        px = -halfSize;
        py = halfSize - (s - 3) * 2 * halfSize;
        nx = -1;
        ny = 0;
      }

      const disp =
        Math.sin(t * freq1 * Math.PI * 2 + phase1) * amp1 +
        Math.sin(t * freq2 * Math.PI * 2 + phase2) * amp2;

      pts.push({ x: px + nx * disp, y: py + ny * disp });
    }

    return pts;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    for (const l of LAYERS) {
      const phase1 = l.phase1 + this.time * l.speed1;
      const phase2 = l.phase2 + this.time * l.speed2;

      const pts = this.squarePath(
        l.halfSize,
        l.amp1,
        l.freq1,
        phase1,
        l.amp2,
        l.freq2,
        phase2,
      );

      g.poly(pts, true).stroke({
        color: l.color,
        alpha: l.alpha,
        width: l.width,
        cap: "round",
        join: "round",
      });
    }
  }
}
