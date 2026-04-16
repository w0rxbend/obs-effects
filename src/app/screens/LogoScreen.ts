import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";

// ── Palette ────────────────────────────────────────────────────────────────────
const RAZER_GREEN   = 0x00ff41;
const LOL_VIOLET    = 0xc050ff;
const CATT_TEAL_CAT = 0x94e2d5;
const TOXIC_GREEN   = 0x39ff14;

// ── Catppuccin orbit-dot palette ───────────────────────────────────────────────
const CATT_PALETTE = [
  0xcba6f7, // mauve
  0xf38ba8, // pink
  0xfab387, // peach
  0xf9e2af, // yellow
  0x89dceb, // sky
  0x74c7ec, // sapphire
  0xb4befe, // lavender
  0x94e2d5, // teal
] as const;

function randomCatt(): number {
  return CATT_PALETTE[Math.floor(Math.random() * CATT_PALETTE.length)];
}

// ── Orbit-dot type ─────────────────────────────────────────────────────────────
interface OrbitDot {
  angle: number;        // current angular position (radians)
  speed: number;        // rad/s, signed
  radius: number;       // orbit radius in px
  size: number;         // dot radius in px
  color: number;
  alphaPhase: number;
  alphaSpeed: number;
  glowAlpha: number;
}

// ── Sizing ─────────────────────────────────────────────────────────────────────
const LOGO_SIZE = 200;

// ── Heartbeat constants ────────────────────────────────────────────────────────
/** Length of one full heartbeat cycle in seconds (~70 BPM). */
const BEAT_INTERVAL   = 0.857;
/** Phase (0‥1) within the cycle where the "dub" secondary beat fires. */
const DUB_PHASE_RATIO = 0.28;

// ── ECG line constants ─────────────────────────────────────────────────────────
/** Seconds of history shown per horizontal pixel. */
const ECG_SCROLL = 0.007;
/** Peak deflection of the R-spike in pixels. */
const ECG_AMP    = 50;

/**
 * Standalone animated logo overlay with heartbeat animation and ECG background.
 * Drop it into OBS as a browser source over any scene.
 */
export class LogoScreen extends Container {
  public static assetBundles = ["main"];

  // ── Layers ─────────────────────────────────────────────────────────────────
  /** ECG waveform — behind everything. */
  private readonly ecgGfx: Graphics;
  /** Logo aura glows and orbiting arcs. */
  private readonly auraGfx: Graphics;
  /** Catppuccin orbit dots — above aura, below logo sprite. */
  private readonly orbitDotGfx: Graphics;
  /** Actual logo image (added in show()). */
  private logoSprite: Sprite | null = null;
  /** Blinking recording indicator dot (added in show()). */
  private liveDot: Graphics | null = null;
  /** "LIVE" pixel-font label (added in show()). */
  private liveText: Text | null = null;

  // ── State ──────────────────────────────────────────────────────────────────
  private logoBaseScale = 1.0;
  private time          = 0;
  /** 0‥1 — spikes to 1 on each beat, decays to 0. Drives logo scale punch. */
  private beatDecay     = 0;
  private readonly orbitDots: OrbitDot[] = [];

  constructor() {
    super();
    // z-order bottom → top: ecgGfx, auraGfx, orbitDotGfx, logo (show), liveDot (show), liveText (show)
    this.ecgGfx      = new Graphics();
    this.auraGfx     = new Graphics();
    this.orbitDotGfx = new Graphics();
    this.addChild(this.ecgGfx);
    this.addChild(this.auraGfx);
    this.addChild(this.orbitDotGfx);
    this.initOrbitDots();
  }

  public async show(): Promise<void> {
    const sprite = new Sprite(Texture.from("worxbend-logo.png"));
    sprite.anchor.set(0.5);
    sprite.width  = LOGO_SIZE;
    sprite.scale.y = sprite.scale.x;
    this.logoBaseScale = sprite.scale.x;
    this.addChild(sprite);
    this.logoSprite = sprite;

    // LIVE indicator — red blink dot
    this.liveDot = new Graphics();
    this.addChild(this.liveDot);

    // LIVE label — pixel font, toxic green
    this.liveText = new Text({
      text: "LIVE",
      style: new TextStyle({
        fontFamily: "'Silkscreen', monospace",
        fontSize: LOGO_SIZE * 0.48,
        fill: TOXIC_GREEN,
      }),
    });
    this.liveText.anchor.set(0, 0.5);
    this.addChild(this.liveText);
  }

  public update(_ticker: Ticker): void {
    this.time += 1 / 60;
    this.animateLogo();
  }

  public resize(width: number, height: number): void {
    this.x = width  * 0.5;
    this.y = height * 0.5;
  }

  // ── ECG waveform maths ─────────────────────────────────────────────────────

  /**
   * Returns a normalised ECG value (−0.18 ‥ 1.0) for the given time t.
   * Models P wave → QRS complex → T wave in one BEAT_INTERVAL second cycle.
   */
  private ecgSample(t: number): number {
    const phase = ((t % BEAT_INTERVAL) + BEAT_INTERVAL) % BEAT_INTERVAL;
    const n = phase / BEAT_INTERVAL; // 0..1

    const p  =  0.18 * Math.exp(-((n - 0.080) ** 2) / 0.004);   // P wave
    const q  = -0.08 * Math.exp(-((n - 0.148) ** 2) / 0.0008);  // Q dip
    const r  =  1.00 * Math.exp(-((n - 0.175) ** 2) / 0.001);   // R spike
    const s  = -0.18 * Math.exp(-((n - 0.210) ** 2) / 0.001);   // S dip
    const tw =  0.35 * Math.exp(-((n - 0.420) ** 2) / 0.008);   // T wave

    return p + q + r + s + tw;
  }

  // ── Main animation ─────────────────────────────────────────────────────────

  private animateLogo(): void {
    const sprite = this.logoSprite;
    if (!sprite) return;

    // ── Lub-dub beat detection ────────────────────────────────────────────────
    const prevPhase   = (this.time - 1 / 60) % BEAT_INTERVAL;
    const currPhase   = this.time % BEAT_INTERVAL;
    const dubPhase    = BEAT_INTERVAL * DUB_PHASE_RATIO;

    if (currPhase < prevPhase) {
      // Phase wrapped → "lub" (main beat)
      this.beatDecay = 1.0;
    } else if (prevPhase < dubPhase && currPhase >= dubPhase) {
      // Passed dub threshold → secondary beat (smaller punch)
      this.beatDecay = Math.max(this.beatDecay, 0.55);
    }
    // Decay ~5.5 units/s → fully gone in ~0.18 s
    this.beatDecay = Math.max(0, this.beatDecay - 5.5 / 60);

    // ── Float ─────────────────────────────────────────────────────────────────
    const float = Math.sin(this.time * 0.5) * 9;

    // ── Logo scale: breathe + tremor + heartbeat punch ─────────────────────────
    const breathe   = 1 + 0.06  * Math.sin(this.time * 0.6);
    const tremor    =
      1 +
      0.013 * Math.sin(this.time * 19.4) +
      0.009 * Math.sin(this.time * 27.1) +
      0.006 * Math.sin(this.time * 41.7);
    const beatPunch = 1 + 0.18 * this.beatDecay;
    sprite.scale.set(this.logoBaseScale * breathe * tremor * beatPunch);

    // ── Micro position quake ──────────────────────────────────────────────────
    const qx = Math.sin(this.time * 17.3) * 1.8 + Math.sin(this.time * 31.1) * 1.0;
    const qy = Math.cos(this.time * 23.7) * 1.4 + Math.cos(this.time * 37.9) * 0.8;
    sprite.x     = qx;
    sprite.y     = float + qy;
    sprite.alpha = 0.9 + Math.sin(this.time * 0.75) * 0.1;

    // ── Aura glow ─────────────────────────────────────────────────────────────
    const cy   = float;
    const aura = 72 + 8 * Math.sin(this.time * 0.5);

    this.auraGfx.clear();

    this.auraGfx.circle(0, cy, aura * 2.4).fill({ color: RAZER_GREEN,   alpha: 0.04 });
    this.auraGfx.circle(0, cy, aura * 1.6).fill({ color: RAZER_GREEN,   alpha: 0.08 });
    this.auraGfx.circle(0, cy, aura * 1.0).fill({ color: LOL_VIOLET,    alpha: 0.06 });

    // Orbiting arc 1 — green, slow clockwise
    const r0 = aura + 8;
    const a0 = this.time * 0.75;
    this.auraGfx
      .moveTo(Math.cos(a0) * r0, cy + Math.sin(a0) * r0)
      .arc(0, cy, r0, a0, a0 + Math.PI * 1.4)
      .stroke({ color: RAZER_GREEN, alpha: 0.9, width: 1.5, cap: "round" });

    // Orbiting arc 2 — violet, counter-clockwise
    const r1 = r0 - 8;
    const a1 = -this.time * 0.48 + Math.PI * 0.5;
    this.auraGfx
      .moveTo(Math.cos(a1) * r1, cy + Math.sin(a1) * r1)
      .arc(0, cy, r1, a1, a1 + Math.PI * 0.8)
      .stroke({ color: LOL_VIOLET, alpha: 0.65, width: 1.0, cap: "round" });

    // Orbiting arc 3 — teal, mid-speed
    const r2 = r0 + 14;
    const a2 = this.time * 0.32 + Math.PI;
    this.auraGfx
      .moveTo(Math.cos(a2) * r2, cy + Math.sin(a2) * r2)
      .arc(0, cy, r2, a2, a2 + Math.PI * 0.55)
      .stroke({ color: CATT_TEAL_CAT, alpha: 0.5, width: 1.0, cap: "round" });

    // ── Catppuccin orbit dots ─────────────────────────────────────────────────
    this.drawOrbitDots(float);

    // ── ECG background line ───────────────────────────────────────────────────
    this.drawECG(sprite.x, sprite.y);

    // ── LIVE indicator ─────────────────────────────────────────────────────────
    this.drawLiveIndicator(sprite.x, sprite.y);
  }

  // ── ECG drawing ─────────────────────────────────────────────────────────────

  private drawECG(cx: number, cy: number): void {
    const gfx   = this.ecgGfx;
    const yBase = cy;
    // Span 2× the logo diameter, centred on the logo's current position
    const half    = LOGO_SIZE;
    const SAMPLES = half * 2;

    gfx.clear();

    /** Traces the P-QRS-T waveform centred under the logo. */
    const buildPath = () => {
      for (let i = 0; i <= SAMPLES; i++) {
        const t   = this.time - (SAMPLES - i) * ECG_SCROLL;
        const val = this.ecgSample(t) * ECG_AMP;
        const x   = cx - half + (i / SAMPLES) * (half * 2);
        const y   = yBase - val; // peaks go upward (negative y)
        if (i === 0) gfx.moveTo(x, y);
        else         gfx.lineTo(x, y);
      }
    };

    // Three-pass glow (wide dim → mid → sharp core)
    buildPath();
    gfx.stroke({ color: TOXIC_GREEN, alpha: 0.08, width: 18 });

    buildPath();
    gfx.stroke({ color: TOXIC_GREEN, alpha: 0.22, width: 5 });

    buildPath();
    gfx.stroke({ color: TOXIC_GREEN, alpha: 0.88, width: 1.5 });
  }

  // ── Orbit dots ─────────────────────────────────────────────────────────────

  private initOrbitDots(): void {
    // Three concentric rings of dots with distinct radii and speeds.
    const rings: Array<{ count: number; radius: number; speedBase: number; dir: number; sizeBase: number }> = [
      { count: 8,  radius: LOGO_SIZE * 0.62, speedBase: 0.55, dir:  1, sizeBase: 3.5 },
      { count: 12, radius: LOGO_SIZE * 0.78, speedBase: 0.32, dir: -1, sizeBase: 2.5 },
      { count: 6,  radius: LOGO_SIZE * 0.95, speedBase: 0.18, dir:  1, sizeBase: 5.0 },
    ];

    for (const ring of rings) {
      for (let i = 0; i < ring.count; i++) {
        const beacon = i % Math.ceil(ring.count / 2) === 0;
        this.orbitDots.push({
          angle:      (i / ring.count) * Math.PI * 2,
          speed:      ring.dir * (ring.speedBase + Math.random() * 0.15),
          radius:     ring.radius + (Math.random() - 0.5) * 10,
          size:       ring.sizeBase * (beacon ? 1.5 : 0.8 + Math.random() * 0.5),
          color:      randomCatt(),
          alphaPhase: Math.random() * Math.PI * 2,
          alphaSpeed: 0.5 + Math.random() * 1.5,
          glowAlpha:  beacon ? 0.25 : 0.12,
        });
      }
    }
  }

  private drawOrbitDots(floatY: number): void {
    const dt = 1 / 60;
    this.orbitDotGfx.clear();

    for (const dot of this.orbitDots) {
      // Beat gives a brief speed surge and size kick
      dot.angle += dot.speed * dt * (1 + this.beatDecay * 0.4);

      const x = Math.cos(dot.angle) * dot.radius;
      const y = floatY + Math.sin(dot.angle) * dot.radius;

      const baseAlpha = 0.5 + 0.5 * Math.sin(this.time * dot.alphaSpeed + dot.alphaPhase);
      const alpha     = Math.min(1.0, baseAlpha + this.beatDecay * 0.4);
      const size      = dot.size * (1 + this.beatDecay * 0.3);

      // Outer glow
      this.orbitDotGfx.circle(x, y, size * 3.5).fill({ color: dot.color, alpha: dot.glowAlpha * alpha });
      // Mid bloom
      this.orbitDotGfx.circle(x, y, size * 1.8).fill({ color: dot.color, alpha: alpha * 0.4 });
      // Bright core
      this.orbitDotGfx.circle(x, y, size).fill({ color: dot.color, alpha });
    }
  }

  // ── LIVE indicator drawing ─────────────────────────────────────────────────

  private drawLiveIndicator(cx: number, cy: number): void {
    if (!this.liveDot || !this.liveText) return;

    // Dot radius scaled to logo — core ~10 % of LOGO_SIZE
    const DOT_R = LOGO_SIZE * 0.10;

    // Attach to the right edge of the logo, vertically centred on it
    const dotX = cx + LOGO_SIZE * 0.5 + DOT_R * 2.5;
    this.liveDot.x  = dotX;
    this.liveDot.y  = cy;
    this.liveText.x = dotX + DOT_R * 2.2;
    this.liveText.y = cy;

    // Dot: slow sine pulse with a heartbeat flash on each beat
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.2);
    const alpha = Math.min(1.0, pulse + this.beatDecay * 0.55);

    this.liveDot.clear();
    this.liveDot.circle(0, 0, DOT_R).fill({ color: 0xff3333, alpha });
    this.liveDot.circle(0, 0, DOT_R * 2).fill({ color: 0xff3333, alpha: alpha * 0.22 });

    // Text: tied to the same pulse for a subtle breathing effect
    this.liveText.alpha = 0.65 + 0.35 * pulse;
  }
}
