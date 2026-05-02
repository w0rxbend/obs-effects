import type { Ticker } from "pixi.js";
import { Container, Graphics } from "pixi.js";

const TAU = Math.PI * 2;

const WEBCAM_R = 220;
const MIC_THRESHOLD = 0.15;
const N_PTS = 128;

// ── Plasma palette ─────────────────────────────────────────────────────────────
const HOT_WHITE = 0xffffff;
const BRIGHT_YELLOW = 0xffee60;
const WARM_YELLOW = 0xffcc00;
const PLASMA_ORANGE = 0xff8800;
const DEEP_ORANGE = 0xff5000;
const EMBER = 0xdd2200;
const DARK_COAL = 0x550a00;

// ── Disk inclination (tilt from face-on) ──────────────────────────────────────
const TILT_RAD = 20 * (Math.PI / 180);
const COS_T = Math.cos(TILT_RAD);
const SIN_T = Math.sin(TILT_RAD);
const B_RATIO = Math.sin(TILT_RAD); // minor/major axis ratio ≈ 0.34

function tiltPt(a: number, b: number, theta: number): { x: number; y: number } {
  const rx = a * Math.cos(theta);
  const ry = b * Math.sin(theta);
  return { x: rx * COS_T - ry * SIN_T, y: rx * SIN_T + ry * COS_T };
}

// ── Harmonics for fluid disk deformation ──────────────────────────────────────
interface Harmonic {
  freq: number;
  amp: number;
  speed: number;
  phase: number;
}

const BASE_H: Harmonic[] = [
  { freq: 2, amp: 1.0, speed: 0.18, phase: 0.0 },
  { freq: 3, amp: 0.7, speed: -0.27, phase: 1.5 },
  { freq: 5, amp: 0.5, speed: 0.15, phase: 2.9 },
  { freq: 7, amp: 0.3, speed: -0.34, phase: 0.8 },
];

// turbulence blends in proportional to audio volume
const TURB_H: Harmonic[] = [
  { freq: 6, amp: 1.2, speed: 1.4, phase: 0.4 },
  { freq: 9, amp: 0.9, speed: -1.1, phase: 2.3 },
  { freq: 11, amp: 0.7, speed: 1.8, phase: 3.7 },
  { freq: 15, amp: 0.5, speed: -2.1, phase: 1.2 },
];

function harmonicDr(
  theta: number,
  scaledTime: number,
  ampBase: number,
  vol: number,
): number {
  let dr = 0;
  for (const h of BASE_H) {
    dr +=
      Math.sin(theta * h.freq + scaledTime * h.speed + h.phase) *
      h.amp *
      ampBase;
  }
  for (const h of TURB_H) {
    dr +=
      Math.sin(theta * h.freq + scaledTime * h.speed + h.phase) *
      h.amp *
      ampBase *
      vol;
  }
  return dr;
}

// ── Disk ring definitions (inner-hot → outer-cool) ────────────────────────────
interface RingDef {
  a: number;
  b: number;
  color: number;
  coreWidth: number;
  glow2Width: number;
  glow1Width: number;
  coreAlpha: number;
  glow2Alpha: number;
  glow1Alpha: number;
  rotSpeed: number;
  harmAmpBase: number;
}

function mkRing(
  aFactor: number,
  color: number,
  coreW: number,
  g2W: number,
  g1W: number,
  cA: number,
  g2A: number,
  g1A: number,
  rotSpeed: number,
  harmAmp: number,
): RingDef {
  const a = WEBCAM_R * aFactor;
  return {
    a,
    b: a * B_RATIO,
    color,
    coreWidth: coreW,
    glow2Width: g2W,
    glow1Width: g1W,
    coreAlpha: cA,
    glow2Alpha: g2A,
    glow1Alpha: g1A,
    rotSpeed,
    harmAmpBase: harmAmp,
  };
}

//                      aFactor   color          cW  g2W  g1W   cA    g2A   g1A   rot    harm
const RINGS: RingDef[] = [
  mkRing(1.05, HOT_WHITE, 2, 5, 10, 0.95, 0.45, 0.18, 0.9, 2.5),
  mkRing(1.1, BRIGHT_YELLOW, 2.5, 6, 12, 0.9, 0.42, 0.18, 0.72, 4.0),
  mkRing(1.17, BRIGHT_YELLOW, 3, 7, 14, 0.85, 0.4, 0.17, 0.57, 5.5),
  mkRing(1.25, WARM_YELLOW, 3.5, 8, 16, 0.78, 0.36, 0.16, 0.46, 7.0),
  mkRing(1.35, PLASMA_ORANGE, 4, 9, 18, 0.7, 0.3, 0.14, 0.37, 9.0),
  mkRing(1.47, PLASMA_ORANGE, 4.5, 10, 20, 0.6, 0.24, 0.12, 0.29, 11.0),
  mkRing(1.61, DEEP_ORANGE, 5, 11, 22, 0.5, 0.18, 0.09, 0.23, 13.0),
  mkRing(1.78, EMBER, 5, 12, 24, 0.38, 0.12, 0.07, 0.18, 15.0),
  mkRing(1.98, DARK_COAL, 4, 13, 26, 0.24, 0.08, 0.04, 0.13, 17.0),
  mkRing(2.22, DARK_COAL, 3, 14, 28, 0.14, 0.05, 0.02, 0.09, 19.0),
];

// ── Plasma particles ──────────────────────────────────────────────────────────
interface Particle {
  theta: number;
  speed: number;
  ringIdx: number;
  size: number;
  color: number;
  baseAlpha: number;
}

const PARTICLE_COLORS = [
  HOT_WHITE,
  BRIGHT_YELLOW,
  WARM_YELLOW,
  PLASMA_ORANGE,
  DEEP_ORANGE,
];

export class AccretionDiskCamScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly world = new Container();
  private readonly backDiskGfx = new Graphics();
  private readonly holeGfx = new Graphics(); // erase blend disc — punches transparent hole
  private readonly photonGfx = new Graphics();
  private readonly frontDiskGfx = new Graphics();
  private readonly particleGfx = new Graphics();

  private time = 0;
  private diskTime = 0;
  private volume = 0;

  private analyser: AnalyserNode | null = null;
  private audioData: Uint8Array<ArrayBuffer> | null = null;

  private readonly particles: Particle[] = [];

  constructor() {
    super();
    this.addChild(this.world);
    this.holeGfx.blendMode = "erase";
    for (const g of [
      this.backDiskGfx,
      this.holeGfx,
      this.photonGfx,
      this.frontDiskGfx,
      this.particleGfx,
    ]) {
      this.world.addChild(g);
    }
    this._initParticles();
    void this._initAudio();
  }

  private _initParticles(): void {
    for (let i = 0; i < 65; i++) {
      const ri = Math.floor(Math.random() * (RINGS.length - 2));
      const col =
        PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      this.particles.push({
        theta: Math.random() * TAU,
        speed: (0.05 + Math.random() * 0.09) * (Math.random() > 0.5 ? 1 : -1),
        ringIdx: ri,
        size: 1.5 + Math.random() * 2.5,
        color: col,
        baseAlpha: 0.5 + Math.random() * 0.5,
      });
    }
  }

  private async _initAudio(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      src.connect(this.analyser);
      this.audioData = new Uint8Array(
        this.analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
    } catch {
      // No mic — idle animation runs at low volume
    }
  }

  private _readRMS(): number {
    if (!this.analyser || !this.audioData) return 0;
    this.analyser.getByteTimeDomainData(this.audioData);
    let sum = 0;
    for (const v of this.audioData) {
      const n = (v - 128) / 128;
      sum += n * n;
    }
    return Math.sqrt(sum / this.audioData.length);
  }

  public async show(): Promise<void> {
    this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  public async hide(): Promise<void> {}

  public resize(w: number, h: number): void {
    this.world.x = w * 0.5;
    this.world.y = h * 0.5;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS * 0.001, 0.05);
    this.time += dt;

    const rms = this._readRMS() * 4;
    const raw = Math.min(
      1,
      rms < MIC_THRESHOLD ? 0 : (rms - MIC_THRESHOLD) / (1 - MIC_THRESHOLD),
    );
    const rate = raw > this.volume ? 0.7 : 0.04;
    this.volume += (raw - this.volume) * rate;

    // disk clock accelerates with volume — drives Keplerian rotation feel
    this.diskTime += dt * (0.4 + this.volume * 2.0);

    this._drawBackDisk();
    this._drawHole();
    this._drawPhotonRing();
    this._drawFrontDisk();
    this._updateParticles(dt);
  }

  // ── Ring geometry helpers ────────────────────────────────────────────────────

  private _buildRingPts(
    ring: RingDef,
    tStart: number,
    tEnd: number,
    skipCam: boolean,
  ): Array<{ x: number; y: number } | null> {
    const camR2 = (WEBCAM_R - 2) * (WEBCAM_R - 2);
    const vol = this.volume;
    const scaledTime = this.diskTime * ring.rotSpeed;
    const pts: Array<{ x: number; y: number } | null> = [];

    for (let i = 0; i <= N_PTS; i++) {
      const theta = tStart + (i / N_PTS) * (tEnd - tStart);
      const dr = harmonicDr(theta, scaledTime, ring.harmAmpBase, vol);
      const a_eff = ring.a + dr;
      const b_eff = ring.b + dr * B_RATIO;
      const pt = tiltPt(a_eff, b_eff, theta);
      pts.push(skipCam && pt.x * pt.x + pt.y * pt.y < camR2 ? null : pt);
    }
    return pts;
  }

  private _strokePts(
    g: Graphics,
    pts: Array<{ x: number; y: number } | null>,
    color: number,
    width: number,
    alpha: number,
  ): void {
    if (alpha < 0.002) return;
    let started = false;
    for (const pt of pts) {
      if (!pt) {
        started = false;
        continue;
      }
      if (!started) {
        g.moveTo(pt.x, pt.y);
        started = true;
      } else g.lineTo(pt.x, pt.y);
    }
    g.stroke({ color, width, alpha });
  }

  private _strokeRing(
    g: Graphics,
    pts: Array<{ x: number; y: number } | null>,
    ring: RingDef,
    scale: number,
  ): void {
    const boost = 1 + this.volume * 0.55;
    this._strokePts(
      g,
      pts,
      ring.color,
      ring.glow1Width,
      ring.glow1Alpha * scale * boost,
    );
    this._strokePts(
      g,
      pts,
      ring.color,
      ring.glow2Width,
      ring.glow2Alpha * scale * boost,
    );
    this._strokePts(
      g,
      pts,
      ring.color,
      ring.coreWidth,
      Math.min(1, ring.coreAlpha * scale * boost),
    );
  }

  // ── Back disk: far side (π→2π), same scale as front ─────────────────────────

  private _drawBackDisk(): void {
    const g = this.backDiskGfx;
    g.clear();
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 0.65);
    for (const ring of RINGS) {
      const pts = this._buildRingPts(ring, Math.PI, TAU, true);
      this._strokeRing(g, pts, ring, pulse);
    }
  }

  // ── Event horizon erase disc ─────────────────────────────────────────────────

  private _drawHole(): void {
    const g = this.holeGfx;
    g.clear();
    g.circle(0, 0, WEBCAM_R).fill({ color: 0xffffff, alpha: 1 });
  }

  // ── Photon sphere ring ───────────────────────────────────────────────────────

  private _drawPhotonRing(): void {
    const g = this.photonGfx;
    g.clear();
    const vol = this.volume;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.2) + vol * 0.4;
    const lr = WEBCAM_R + 4;
    const SEG = 160;

    const arc = () => {
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * TAU;
        if (i === 0) g.moveTo(lr * Math.cos(a), lr * Math.sin(a));
        else g.lineTo(lr * Math.cos(a), lr * Math.sin(a));
      }
    };

    // Wide outer diffuse haze
    arc();
    g.stroke({ color: PLASMA_ORANGE, width: 90, alpha: 0.05 + vol * 0.05 });

    // Medium warm glow
    arc();
    g.stroke({
      color: WARM_YELLOW,
      width: 38,
      alpha: (0.18 + vol * 0.18) * pulse,
    });

    // Inner hot glow
    arc();
    g.stroke({
      color: BRIGHT_YELLOW,
      width: 16,
      alpha: (0.42 + vol * 0.32) * pulse,
    });

    // Bright photon ring core — approaches white at peak volume
    const coreCol = vol > 0.5 ? 0xffffff : BRIGHT_YELLOW;
    arc();
    g.stroke({
      color: coreCol,
      width: 5,
      alpha: Math.min(1, 0.8 + vol * 0.55),
    });
  }

  // ── Front disk: near side (0→π) ─────────────────────────────────────────────

  private _drawFrontDisk(): void {
    const g = this.frontDiskGfx;
    g.clear();
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 0.65);
    for (const ring of RINGS) {
      const pts = this._buildRingPts(ring, 0, Math.PI, false);
      this._strokeRing(g, pts, ring, pulse);
    }
  }

  // ── Hot plasma particles ─────────────────────────────────────────────────────

  private _updateParticles(dt: number): void {
    const g = this.particleGfx;
    g.clear();
    const camR2 = WEBCAM_R * WEBCAM_R;
    const vol = this.volume;
    const spdMul = 1 + vol * 2.2;

    for (const p of this.particles) {
      p.theta += p.speed * dt * spdMul;

      const ring = RINGS[p.ringIdx];
      const scaledT = this.diskTime * ring.rotSpeed;
      const dr = harmonicDr(p.theta, scaledT, ring.harmAmpBase, vol);
      const a_eff = ring.a + dr;
      const b_eff = ring.b + dr * B_RATIO;
      const pt = tiltPt(a_eff, b_eff, p.theta);
      const isFront = Math.sin(p.theta) >= 0;
      const d2 = pt.x * pt.x + pt.y * pt.y;

      if (!isFront && d2 < camR2) continue;

      const a = Math.min(
        1,
        p.baseAlpha * (isFront ? 1.0 : 0.45) * (1 + vol * 0.6),
      );
      g.circle(pt.x, pt.y, p.size * 3.2).fill({
        color: p.color,
        alpha: a * 0.07,
      });
      g.circle(pt.x, pt.y, p.size).fill({ color: p.color, alpha: a });
    }
  }
}
