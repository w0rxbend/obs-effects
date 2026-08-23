import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";

import {
  DROP_COUNT,
  FIRE_ORANGE,
  FIRE_PARTICLE_COUNT,
  FIRE_RED,
  FIRE_TIP,
  FIRE_YELLOW,
  MAIN_PHRASES,
  METEOR_COUNT,
  MOVING_LINE_COUNT,
  NET_DOT_COUNT,
  NET_MAX_DIST,
  ORBIT_GROUP_COUNT,
  PARTICLE_COUNT,
  PARTICLE_PALETTE,
  PULSE_DOT_COUNT,
  RAIN_COUNT,
  SPARK_COUNT,
  STAIN_COUNT,
  TAPE_BLACK,
  TAPE_FADE_DURATION,
  TAPE_SHOW_MAX,
  TAPE_SHOW_MIN,
  TAPE_YELLOW,
  YELLOW_DOT_COUNT,
  YELLOW_PALETTE,
} from "./confidential/palette";
import { buildTapeGraphics, easeInOutCubic } from "./confidential/tape";
import type {
  Drop,
  FireParticle,
  FireworkShell,
  Meteor,
  MovingLine,
  NetDot,
  OrbitDot,
  OrbitGroup,
  Particle,
  PulseDot,
  RainDrop,
  Spark,
  Stain,
  StainBlob,
  TapeObj,
  YellowDot,
} from "./confidential/types";

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

export class ConfidentialScreen extends Container {
  public static assetBundles: string[] = ["main"];

  // ── Layers ─────────────────────────────────────────────────────────────────
  private readonly bgGfx = new Graphics();
  private readonly stainGfx = new Graphics();
  private readonly netGfx = new Graphics();
  private readonly rainGfx = new Graphics();
  private readonly particleGfx = new Graphics();
  private readonly dropGfx = new Graphics();
  private readonly yellowDotGfx = new Graphics();
  private readonly meteorGfx = new Graphics();
  private readonly sparkGfx = new Graphics();
  private readonly fireGfx = new Graphics();
  private readonly fireworkGfx = new Graphics();
  private readonly lineGfx = new Graphics();
  private readonly pulseDotGfx = new Graphics();
  private readonly orbitGfx = new Graphics();
  private readonly tapeCont = new Container();

  private readonly tapes: TapeObj[] = [];
  private readonly netDots: NetDot[] = [];
  private readonly particles: Particle[] = [];
  private readonly rainDrops: RainDrop[] = [];
  private readonly meteors: Meteor[] = [];
  private readonly sparks: Spark[] = [];
  private readonly stains: Stain[] = [];
  private readonly drops: Drop[] = [];
  private readonly yellowDots: YellowDot[] = [];
  private readonly fireParticles: FireParticle[] = [];
  private readonly fireworks: FireworkShell[] = [];
  private readonly movingLines: MovingLine[] = [];
  private readonly pulseDots: PulseDot[] = [];
  private readonly orbitGroups: OrbitGroup[] = [];
  private fireworkTimer = 0;

  private time = 0;
  private w = 0;
  private h = 0;
  private sparkTimer = 0;

  constructor() {
    super();
    this.addChild(this.bgGfx);
    this.addChild(this.stainGfx);
    this.addChild(this.netGfx);
    this.addChild(this.rainGfx);
    this.addChild(this.particleGfx);
    this.addChild(this.dropGfx);
    this.addChild(this.yellowDotGfx);
    this.addChild(this.meteorGfx);
    this.addChild(this.sparkGfx);
    this.addChild(this.fireGfx);
    this.addChild(this.fireworkGfx);
    this.addChild(this.lineGfx);
    this.addChild(this.pulseDotGfx);
    this.addChild(this.orbitGfx);
    this.addChild(this.tapeCont);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public async show(): Promise<void> {
    this.spawnNetDots();
    this.spawnParticles();
    this.spawnRain();
    this.spawnMeteors();
    this.spawnYellowDots();
    this.spawnDrops();
    this.buildStains();
    this.spawnFire();
    this.spawnMovingLines();
    this.spawnPulseDots();
    this.spawnOrbitGroups();
    this.createTapes();
  }

  public update(ticker: Ticker): void {
    const dt = ticker.deltaMS * 0.001;
    this.time += dt;

    const breathe = 1 + 0.025 * Math.sin(this.time * 0.5);
    this.drawBackground(breathe);
    this.drawStains(dt);
    this.drawNetwork(dt);
    this.drawRain(dt);
    this.drawParticles(dt);
    this.drawDrops(dt);
    this.drawYellowDots(dt);
    this.drawMeteors(dt);
    this.drawSparks(dt);
    this.drawFire(dt);
    this.drawFireworks(dt);
    this.drawMovingLines(dt);
    this.drawPulseDots(dt);
    this.drawOrbitGroups(dt);
    this.updateTapes(dt);

    // Periodically burst new sparks
    this.sparkTimer += dt;
    if (this.sparkTimer > 1.2) {
      this.sparkTimer = 0;
      this.burstSparks();
    }

    // Periodically launch new firework
    this.fireworkTimer += dt;
    if (this.fireworkTimer > 2.5 + Math.random() * 2) {
      this.fireworkTimer = 0;
      this.launchFirework();
    }
  }

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.x = width * 0.5;
    this.y = height * 0.5;
  }

  // ── Background subtle haze ─────────────────────────────────────────────────

  private drawBackground(breathe: number): void {
    this.bgGfx.clear();
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    const r = Math.max(hw, hh);

    // Very subtle warm amber glow behind the tape
    this.bgGfx
      .circle(0, 0, r * 1.8 * breathe)
      .fill({ color: TAPE_YELLOW, alpha: 0.018 });
    this.bgGfx
      .circle(0, 0, r * 1.0 * breathe)
      .fill({ color: TAPE_YELLOW, alpha: 0.03 });
    this.bgGfx
      .circle(0, 0, r * 0.5 * breathe)
      .fill({ color: TAPE_YELLOW, alpha: 0.035 });
  }

  // ── Tape creation ──────────────────────────────────────────────────────────

  private createTapes(): void {
    const tapeDefs = [
      // Main tape — centre, nearly horizontal, large
      {
        cx: 0,
        cy: 0,
        angle: (Math.random() - 0.5) * 0.06,
        height: 160,
        isMain: true,
        bounceAmp: 22,
        bounceFreq: 0.38,
        wobbleAmp: 0.012,
        wobbleFreq: 0.22,
        scrollSpeed: 220,
      },
      // Secondary tapes — scattered, various angles
      {
        cx: -0.05,
        cy: -0.52,
        angle: 0.38,
        height: 110,
        isMain: false,
        bounceAmp: 14,
        bounceFreq: 0.31,
        wobbleAmp: 0.018,
        wobbleFreq: 0.27,
        scrollSpeed: -170,
      },
      {
        cx: 0.08,
        cy: 0.55,
        angle: -0.28,
        height: 100,
        isMain: false,
        bounceAmp: 16,
        bounceFreq: 0.27,
        wobbleAmp: 0.021,
        wobbleFreq: 0.19,
        scrollSpeed: 150,
      },
      {
        cx: -0.18,
        cy: -0.26,
        angle: 0.72,
        height: 115,
        isMain: false,
        bounceAmp: 12,
        bounceFreq: 0.42,
        wobbleAmp: 0.016,
        wobbleFreq: 0.31,
        scrollSpeed: -200,
      },
      {
        cx: 0.22,
        cy: 0.3,
        angle: -0.55,
        height: 105,
        isMain: false,
        bounceAmp: 18,
        bounceFreq: 0.35,
        wobbleAmp: 0.02,
        wobbleFreq: 0.24,
        scrollSpeed: 130,
      },
      {
        cx: -0.08,
        cy: 0.65,
        angle: 0.18,
        height: 120,
        isMain: false,
        bounceAmp: 10,
        bounceFreq: 0.29,
        wobbleAmp: 0.014,
        wobbleFreq: 0.22,
        scrollSpeed: -180,
      },
      {
        cx: 0.04,
        cy: -0.68,
        angle: -0.42,
        height: 108,
        isMain: false,
        bounceAmp: 20,
        bounceFreq: 0.44,
        wobbleAmp: 0.022,
        wobbleFreq: 0.33,
        scrollSpeed: 240,
      },
      {
        cx: -0.14,
        cy: 0.14,
        angle: 1.1,
        height: 100,
        isMain: false,
        bounceAmp: 13,
        bounceFreq: 0.33,
        wobbleAmp: 0.019,
        wobbleFreq: 0.28,
        scrollSpeed: -140,
      },
      {
        cx: 0.18,
        cy: -0.4,
        angle: -0.88,
        height: 112,
        isMain: false,
        bounceAmp: 17,
        bounceFreq: 0.38,
        wobbleAmp: 0.017,
        wobbleFreq: 0.2,
        scrollSpeed: 190,
      },
    ] as const;

    const sw = this.w > 0 ? this.w : 1920;
    const sh = this.h > 0 ? this.h : 1080;

    for (const def of tapeDefs) {
      this.buildTape({
        cx: def.cx * sw,
        cy: def.cy * sh,
        angle: def.angle,
        height: def.height,
        isMain: def.isMain,
        bounceAmp: def.bounceAmp,
        bounceFreq: def.bounceFreq,
        wobbleAmp: def.wobbleAmp,
        wobbleFreq: def.wobbleFreq,
        scrollSpeed: def.scrollSpeed,
      });
    }

    // Main tape on top
    this.tapeCont.setChildIndex(
      this.tapes[0].container,
      this.tapeCont.children.length - 1,
    );
  }

  private buildTape(opts: {
    cx: number;
    cy: number;
    angle: number;
    height: number;
    isMain: boolean;
    bounceAmp: number;
    bounceFreq: number;
    wobbleAmp: number;
    wobbleFreq: number;
    scrollSpeed: number;
  }): void {
    const {
      cx,
      cy,
      angle,
      height,
      isMain,
      bounceAmp,
      bounceFreq,
      wobbleAmp,
      wobbleFreq,
    } = opts;
    const hh = height * 0.5;

    const container = new Container();
    container.x = cx;
    container.y = cy;
    container.rotation = angle;
    container.addChild(buildTapeGraphics(hh));

    const fontSize = isMain ? 52 : Math.round(height * 0.4);
    const contentCont = new Container();
    container.addChild(contentCont);
    this.buildTapeContent(contentCont, fontSize, hh, isMain);

    this.tapeCont.addChild(container);
    this.tapes.push({
      container,
      contentCont,
      isMain,
      baseCX: cx,
      baseCY: cy,
      baseAngle: angle,
      bounceAmp,
      bounceFreq,
      bouncePhase: Math.random() * Math.PI * 2,
      wobbleAmp,
      wobbleFreq,
      wobblePhase: Math.random() * Math.PI * 2,
      fontSize,
      hh,
      state: "show",
      fadeTimer: 0,
      showTimer: Math.random() * TAPE_SHOW_MIN,
      showDuration:
        TAPE_SHOW_MIN + Math.random() * (TAPE_SHOW_MAX - TAPE_SHOW_MIN),
    });
  }

  private buildTapeContent(
    contentCont: Container,
    fontSize: number,
    hh: number,
    isMain: boolean,
  ): void {
    contentCont
      .removeChildren()
      .forEach((c) => (c as Container).destroy({ children: true }));

    const ICON_NAMES = ["1.png", "2.png", "3.png", "4.png", "5.png"] as const;
    const iconSize = Math.round(hh * 0.75);
    const charPx = fontSize * 0.62;
    const phrase = randomFrom(MAIN_PHRASES);
    const halfW = phrase.length * charPx * 0.5;

    // Label — centred on the tape
    const label = new Text({
      text: phrase,
      style: new TextStyle({
        fontFamily: "'Silkscreen', monospace",
        fontSize,
        fill: TAPE_BLACK,
        align: "center",
        padding: 12,
        letterSpacing: isMain ? 3 : 2,
      }),
    });
    label.anchor.set(0.5);
    contentCont.addChild(label);

    // Left icon (before text) and right icon (after text)
    for (const side of [-1, 1]) {
      const tex = Texture.from(randomFrom(ICON_NAMES));
      const node = new Sprite(tex);
      node.anchor.set(0.5);
      node.width = iconSize;
      node.height = iconSize;
      node.x = side * (halfW + iconSize * 4.0);
      node.y = 0;
      contentCont.addChild(node);
    }
  }

  // ── Tape update ────────────────────────────────────────────────────────────

  private updateTapes(dt: number): void {
    for (const tape of this.tapes) {
      tape.bouncePhase += tape.bounceFreq * dt;
      tape.wobblePhase += tape.wobbleFreq * dt;

      const offset = Math.sin(tape.bouncePhase) * tape.bounceAmp;
      tape.container.x = tape.baseCX - Math.sin(tape.baseAngle) * offset;
      tape.container.y = tape.baseCY + Math.cos(tape.baseAngle) * offset;
      tape.container.rotation =
        tape.baseAngle + Math.sin(tape.wobblePhase) * tape.wobbleAmp;

      // Fade cycle
      switch (tape.state) {
        case "show": {
          tape.showTimer += dt;
          if (tape.showTimer >= tape.showDuration) {
            tape.state = "fade_out";
            tape.fadeTimer = 0;
          }
          break;
        }
        case "fade_out": {
          tape.fadeTimer += dt;
          const t = Math.min(1, tape.fadeTimer / TAPE_FADE_DURATION);
          tape.contentCont.alpha = 1 - easeInOutCubic(t);
          if (t >= 1) {
            this.buildTapeContent(
              tape.contentCont,
              tape.fontSize,
              tape.hh,
              tape.isMain,
            );
            tape.contentCont.alpha = 0;
            tape.state = "fade_in";
            tape.fadeTimer = 0;
          }
          break;
        }
        case "fade_in": {
          tape.fadeTimer += dt;
          const t = Math.min(1, tape.fadeTimer / TAPE_FADE_DURATION);
          tape.contentCont.alpha = easeInOutCubic(t);
          if (t >= 1) {
            tape.contentCont.alpha = 1;
            tape.state = "show";
            tape.showTimer = 0;
            tape.showDuration =
              TAPE_SHOW_MIN + Math.random() * (TAPE_SHOW_MAX - TAPE_SHOW_MIN);
          }
          break;
        }
      }
    }
  }

  // ── Network dots ──────────────────────────────────────────────────────────

  private spawnNetDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < NET_DOT_COUNT; i++) {
      this.netDots.push({
        x: (Math.random() - 0.5) * hw * 1.8,
        y: (Math.random() - 0.5) * hh * 1.8,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18,
        size: 1.0 + Math.random() * 2.0,
        color: randomFrom(PARTICLE_PALETTE),
        alpha: 0.15 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private drawNetwork(dt: number): void {
    this.netGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    for (const d of this.netDots) {
      d.vx *= 0.985;
      d.vy *= 0.985;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x > hw - 8) {
        d.x = hw - 8;
        d.vx *= -0.8;
      }
      if (d.x < -hw + 8) {
        d.x = -hw + 8;
        d.vx *= -0.8;
      }
      if (d.y > hh - 8) {
        d.y = hh - 8;
        d.vy *= -0.8;
      }
      if (d.y < -hh + 8) {
        d.y = -hh + 8;
        d.vy *= -0.8;
      }
    }

    for (let i = 0; i < this.netDots.length; i++) {
      const a = this.netDots[i];
      for (let j = i + 1; j < this.netDots.length; j++) {
        const b = this.netDots[j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= NET_MAX_DIST) continue;
        const t = 1 - dist / NET_MAX_DIST;
        const col = lerpColor(a.color, b.color, 0.5);
        this.netGfx
          .moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({
            color: col,
            alpha: t * t * 0.2,
            width: 0.4 + t * 0.6,
            cap: "round",
          });
      }
    }

    for (const d of this.netDots) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 1.1 + d.phase);
      const a = d.alpha * tw;
      this.netGfx
        .circle(d.x, d.y, d.size * 3.0)
        .fill({ color: d.color, alpha: a * 0.08 });
      this.netGfx
        .circle(d.x, d.y, d.size)
        .fill({ color: d.color, alpha: Math.min(1, a) });
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private spawnParticles(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * hw * 2,
        y: (Math.random() - 0.5) * hh * 2,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18 - 4,
        size: 0.4 + Math.random() * 2.0,
        alpha: 0.1 + Math.random() * 0.4,
        color: randomFrom(PARTICLE_PALETTE),
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2.0,
      });
    }
  }

  // ── Rain ──────────────────────────────────────────────────────────────────

  private spawnRain(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * hw * 2.2,
        y: (Math.random() - 0.5) * hh * 2,
        vy: 180 + Math.random() * 280,
        length: 8 + Math.random() * 22,
        alpha: 0.08 + Math.random() * 0.18,
        color: randomFrom(YELLOW_PALETTE),
        width: 0.5 + Math.random() * 1.2,
      });
    }
  }

  private drawRain(dt: number): void {
    this.rainGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (const r of this.rainDrops) {
      r.y += r.vy * dt;
      if (r.y - r.length > hh + 20) r.y = -hh - 20;
      this.rainGfx
        .moveTo(r.x, r.y)
        .lineTo(r.x + r.length * 0.18, r.y - r.length)
        .stroke({
          color: r.color,
          alpha: r.alpha,
          width: r.width,
          cap: "round",
        });
    }
    void hw;
  }

  // ── Meteors / comets ──────────────────────────────────────────────────────

  private spawnMeteors(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < METEOR_COUNT; i++) {
      this.meteors.push(this.makeMeteor(hw, hh));
    }
  }

  private makeMeteor(hw: number, hh: number): Meteor {
    const maxLife = 1.2 + Math.random() * 2.0;
    const speed = 400 + Math.random() * 500;
    const angle = Math.PI * 0.18 + Math.random() * 0.22;
    return {
      x: -hw + Math.random() * hw * 2,
      y: -hh + Math.random() * hh * 0.6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length: 60 + Math.random() * 100,
      alpha: 0.5 + Math.random() * 0.5,
      color: randomFrom(YELLOW_PALETTE),
      life: Math.random() * maxLife,
      maxLife,
      trailAlpha: 0.3 + Math.random() * 0.3,
    };
  }

  private drawMeteors(dt: number): void {
    this.meteorGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (const m of this.meteors) {
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.life > m.maxLife || m.x > hw + 200 || m.y > hh + 200) {
        Object.assign(m, this.makeMeteor(hw, hh));
        m.life = 0;
      }
      const prog = m.life / m.maxLife;
      const a = m.alpha * (1 - prog);
      const dx = -m.vx / Math.hypot(m.vx, m.vy);
      const dy = -m.vy / Math.hypot(m.vx, m.vy);
      // Head glow
      this.meteorGfx.circle(m.x, m.y, 3.5).fill({ color: m.color, alpha: a });
      this.meteorGfx
        .circle(m.x, m.y, 7)
        .fill({ color: m.color, alpha: a * 0.3 });
      // Trail
      const tx = m.x + dx * m.length;
      const ty = m.y + dy * m.length;
      this.meteorGfx
        .moveTo(m.x, m.y)
        .lineTo(tx, ty)
        .stroke({
          color: m.color,
          alpha: m.trailAlpha * (1 - prog),
          width: 1.8,
          cap: "round",
        });
    }
  }

  // ── Sparks ────────────────────────────────────────────────────────────────

  private burstSparks(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    const ox = (Math.random() - 0.5) * hw * 1.4;
    const oy = (Math.random() - 0.5) * hh * 1.4;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 220;
      this.sparks.push({
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.8,
        size: 0.8 + Math.random() * 2.0,
        color: randomFrom(YELLOW_PALETTE),
        gravity: 80 + Math.random() * 120,
      });
    }
  }

  private drawSparks(dt: number): void {
    this.sparkGfx.clear();
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const prog = s.life / s.maxLife;
      const a = (1 - prog) * 0.9;
      this.sparkGfx
        .circle(s.x, s.y, s.size * (1 - prog * 0.5))
        .fill({ color: s.color, alpha: a });
      if (s.size > 1.2)
        this.sparkGfx
          .circle(s.x, s.y, s.size * 2.5)
          .fill({ color: s.color, alpha: a * 0.18 });
    }
  }

  // ── Stains ────────────────────────────────────────────────────────────────

  private buildStains(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < STAIN_COUNT; i++) {
      const spread = 40 + Math.random() * 90;
      const color = randomFrom(YELLOW_PALETTE);
      const blobs: StainBlob[] = [];
      const blobCount = 5 + Math.floor(Math.random() * 7);
      for (let b = 0; b < blobCount; b++) {
        const baseR = spread * (0.25 + Math.random() * 0.55);
        blobs.push({
          dx: (Math.random() - 0.5) * spread * 1.6,
          dy: (Math.random() - 0.5) * spread * 1.0,
          r: baseR,
          baseR,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.3 + Math.random() * 0.8,
          pulseAmp: 0.08 + Math.random() * 0.18,
          driftVx: (Math.random() - 0.5) * 5,
          driftVy: (Math.random() - 0.5) * 3,
          colorB: randomFrom(YELLOW_PALETTE),
          colorPhase: Math.random() * Math.PI * 2,
          colorSpeed: 0.15 + Math.random() * 0.35,
        });
      }
      this.stains.push({
        x: (Math.random() - 0.5) * hw * 1.8,
        y: (Math.random() - 0.5) * hh * 1.8,
        alpha: 0.055 + Math.random() * 0.11,
        color,
        blobs,
      });
    }
  }

  private drawStains(dt: number): void {
    this.stainGfx.clear();
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (const s of this.stains) {
      for (const b of s.blobs) {
        b.pulsePhase += b.pulseSpeed * dt;
        b.colorPhase += b.colorSpeed * dt;
        b.dx += b.driftVx * dt;
        b.dy += b.driftVy * dt;
        // Soft boundary: push blobs back toward centre
        const dist = Math.hypot(b.dx, b.dy);
        const maxDist = hw * 0.55;
        if (dist > maxDist) {
          b.dx *= 0.98;
          b.dy *= 0.98;
          b.driftVx *= -0.5;
          b.driftVy *= -0.5;
        }
        b.r = b.baseR * (1 + Math.sin(b.pulsePhase) * b.pulseAmp);
        const col = lerpColor(
          s.color,
          b.colorB,
          Math.sin(b.colorPhase) * 0.5 + 0.5,
        );
        // Outer soft halo
        this.stainGfx
          .circle(s.x + b.dx, s.y + b.dy, b.r * 1.7)
          .fill({ color: col, alpha: s.alpha * 0.3 });
        // Core blob
        this.stainGfx
          .circle(s.x + b.dx, s.y + b.dy, b.r)
          .fill({ color: col, alpha: s.alpha });
      }
    }
    void hw;
    void hh;
  }

  // ── Drops ─────────────────────────────────────────────────────────────────

  private spawnDrops(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < DROP_COUNT; i++) {
      this.drops.push(this.makeDrop(hw, hh, true));
    }
  }

  private makeDrop(hw: number, hh: number, randomY = false): Drop {
    const splatMax = 6 + Math.random() * 14;
    return {
      x: (Math.random() - 0.5) * hw * 2,
      y: randomY ? (Math.random() - 0.5) * hh * 2 : -hh - 10,
      vy: 200 + Math.random() * 300,
      size: 2 + Math.random() * 4,
      alpha: 0.25 + Math.random() * 0.45,
      color: randomFrom(YELLOW_PALETTE),
      splat: 0,
      splatMax,
    };
  }

  private drawDrops(dt: number): void {
    this.dropGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      if (d.splat > 0) {
        d.splat += dt * 60;
        const a = d.alpha * (1 - d.splat / d.splatMax);
        if (a <= 0) {
          this.drops[i] = this.makeDrop(hw, hh);
          continue;
        }
        this.dropGfx
          .circle(d.x, d.y, d.splat)
          .stroke({ color: d.color, alpha: a, width: 1 });
      } else {
        d.y += d.vy * dt;
        this.dropGfx
          .ellipse(d.x, d.y, d.size * 0.5, d.size)
          .fill({ color: d.color, alpha: d.alpha });
        if (d.y > hh + d.size) d.splat = 1;
      }
    }
  }

  // ── Yellow dots ───────────────────────────────────────────────────────────

  private spawnYellowDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < YELLOW_DOT_COUNT; i++) {
      this.yellowDots.push({
        x: (Math.random() - 0.5) * hw * 2,
        y: (Math.random() - 0.5) * hh * 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        size: 1.5 + Math.random() * 4.5,
        alpha: 0.18 + Math.random() * 0.5,
        color: randomFrom(YELLOW_PALETTE),
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.8,
      });
    }
  }

  private drawYellowDots(dt: number): void {
    this.yellowDotGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    for (const d of this.yellowDots) {
      d.phase += d.speed * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x > hw + 20) d.x = -hw - 20;
      if (d.x < -hw - 20) d.x = hw + 20;
      if (d.y > hh + 20) d.y = -hh - 20;
      if (d.y < -hh - 20) d.y = hh + 20;
      const pulse = 0.55 + 0.45 * Math.sin(d.phase);
      const a = d.alpha * pulse;
      this.yellowDotGfx
        .circle(d.x, d.y, d.size)
        .fill({ color: d.color, alpha: Math.min(1, a) });
      this.yellowDotGfx
        .circle(d.x, d.y, d.size * 2.6)
        .fill({ color: d.color, alpha: a * 0.1 });
    }
  }

  private drawParticles(dt: number): void {
    this.particleGfx.clear();
    if (this.w === 0) return;

    const hw = this.w * 0.5,
      hh = this.h * 0.5;

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x > hw + 30) p.x = -hw - 30;
      if (p.x < -hw - 30) p.x = hw + 30;
      if (p.y > hh + 30) p.y = -hh - 30;
      if (p.y < -hh - 30) p.y = hh + 30;

      p.twinklePhase += p.twinkleSpeed * dt;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(p.twinklePhase));
      const a = p.alpha * tw;

      this.particleGfx
        .circle(p.x, p.y, p.size)
        .fill({ color: p.color, alpha: Math.min(1, a) });
      if (p.size > 1.0) {
        this.particleGfx
          .circle(p.x, p.y, p.size * 2.8)
          .fill({ color: p.color, alpha: a * 0.12 });
      }
    }
  }

  // ── Fire ──────────────────────────────────────────────────────────────────

  private spawnFire(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    // Seven fire columns spread across the full bottom edge
    const emitters = [
      -hw * 0.85,
      -hw * 0.55,
      -hw * 0.25,
      0,
      hw * 0.25,
      hw * 0.55,
      hw * 0.85,
    ];
    for (const bx of emitters) {
      for (let i = 0; i < FIRE_PARTICLE_COUNT / emitters.length; i++) {
        this.fireParticles.push(this.makeFireParticle(bx, hh, true));
      }
    }
  }

  private makeFireParticle(
    baseX: number,
    baseY: number,
    randomY = false,
  ): FireParticle {
    const maxLife = 0.9 + Math.random() * 1.8;
    return {
      baseX,
      baseY,
      x: baseX + (Math.random() - 0.5) * 70,
      y: randomY ? baseY - Math.random() * 400 : baseY - Math.random() * 8,
      vx: (Math.random() - 0.5) * 28,
      vy: -(200 + Math.random() * 320),
      life: randomY ? Math.random() * maxLife : 0,
      maxLife,
      size: 3 + Math.random() * Math.random() * 52,
      turbPhase: Math.random() * Math.PI * 2,
      turbFreq: 1.8 + Math.random() * 3.5,
      turbAmp: 18 + Math.random() * 38,
    };
  }

  private drawFire(dt: number): void {
    this.fireGfx.clear();
    if (this.w === 0) return;
    const hh = this.h * 0.5;

    // Base glow at each emitter
    const hw = this.w * 0.5;
    const emitterXs = [
      -hw * 0.85,
      -hw * 0.55,
      -hw * 0.25,
      0,
      hw * 0.25,
      hw * 0.55,
      hw * 0.85,
    ];
    for (const bx of emitterXs) {
      this.fireGfx
        .ellipse(bx, hh, 90, 28)
        .fill({ color: FIRE_ORANGE, alpha: 0.18 });
      this.fireGfx
        .ellipse(bx, hh, 44, 14)
        .fill({ color: 0xffffff, alpha: 0.12 });
    }

    for (const p of this.fireParticles) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        Object.assign(p, this.makeFireParticle(p.baseX, p.baseY));
        continue;
      }

      // Turbulent horizontal drift
      p.turbPhase += p.turbFreq * dt;
      p.vx += Math.sin(p.turbPhase) * p.turbAmp * dt;
      p.vx *= 0.965;
      p.vy -= 55 * dt; // buoyancy
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const prog = p.life / p.maxLife;
      const size = p.size * Math.pow(1 - prog, 0.55);

      // Color: white-hot base → orange → red → yellow tip
      let col: number;
      if (prog < 0.12) col = lerpColor(0xffffff, FIRE_ORANGE, prog / 0.12);
      else if (prog < 0.4)
        col = lerpColor(FIRE_ORANGE, FIRE_RED, (prog - 0.12) / 0.28);
      else if (prog < 0.72)
        col = lerpColor(FIRE_RED, FIRE_YELLOW, (prog - 0.4) / 0.32);
      else col = lerpColor(FIRE_YELLOW, FIRE_TIP, (prog - 0.72) / 0.28);

      const a = Math.pow(1 - prog, 1.05) * 0.8;

      // Three layers: wide soft halo → mid bloom → hot core
      this.fireGfx
        .circle(p.x, p.y, size * 2.4)
        .fill({ color: col, alpha: a * 0.12 });
      this.fireGfx
        .circle(p.x, p.y, size * 1.3)
        .fill({ color: col, alpha: a * 0.42 });
      this.fireGfx
        .circle(p.x, p.y, size * 0.55)
        .fill({ color: 0xffffff, alpha: a * 0.25 });
    }
  }

  // ── Fireworks ─────────────────────────────────────────────────────────────

  private launchFirework(): void {
    if (this.w === 0) return;
    const hw = this.w * 0.5;
    const hh = this.h * 0.5;
    this.fireworks.push({
      x: (Math.random() - 0.5) * hw * 1.6,
      y: hh * 0.1 + Math.random() * hh * 0.5, // burst anywhere in upper-mid area
      vy: 0,
      life: 0,
      maxLife: 1.8 + Math.random() * 1.0,
      burst: true, // spawn already burst
      color: randomFrom(YELLOW_PALETTE),
      trailParticles: this.makeBurst(
        (Math.random() - 0.5) * hw * 1.6,
        hh * 0.1 + Math.random() * hh * 0.5,
      ),
    });
  }

  private makeBurst(x: number, y: number): FireworkShell["trailParticles"] {
    const count = 55 + Math.floor(Math.random() * 40);
    const particles: FireworkShell["trailParticles"] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 80 + Math.random() * 220;
      const maxLife = 0.8 + Math.random() * 0.9;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife,
        size: 1.2 + Math.random() * 3.0,
      });
    }
    return particles;
  }

  private drawFireworks(dt: number): void {
    this.fireworkGfx.clear();

    for (let fi = this.fireworks.length - 1; fi >= 0; fi--) {
      const fw = this.fireworks[fi];
      fw.life += dt;

      let allDead = true;
      for (const p of fw.trailParticles) {
        p.life += dt;
        if (p.life >= p.maxLife) continue;
        allDead = false;
        p.vy += 60 * dt; // gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;

        const prog = p.life / p.maxLife;
        const col = lerpColor(
          fw.color,
          FIRE_TIP,
          prog < 0.5 ? 0 : (prog - 0.5) * 2,
        );
        const a = (1 - prog) * 0.9;
        this.fireworkGfx
          .circle(p.x, p.y, p.size * (1 - prog * 0.5))
          .fill({ color: col, alpha: a });
        if (p.size > 1.8) {
          this.fireworkGfx
            .circle(p.x, p.y, p.size * 2.8)
            .fill({ color: col, alpha: a * 0.15 });
        }
      }

      if (allDead || fw.life > fw.maxLife) {
        this.fireworks.splice(fi, 1);
      }
    }
  }

  // ── Moving lines ──────────────────────────────────────────────────────────

  private spawnMovingLines(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < MOVING_LINE_COUNT; i++) {
      this.movingLines.push(this.makeMovingLine(hw, hh, true));
    }
  }

  private makeMovingLine(hw: number, hh: number, scatter = false): MovingLine {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 160;
    // Start at a random edge position
    const side = Math.floor(Math.random() * 4);
    let x: number, y: number;
    if (scatter) {
      x = (Math.random() - 0.5) * hw * 2.2;
      y = (Math.random() - 0.5) * hh * 2.2;
    } else {
      if (side === 0) {
        x = -hw - 20;
        y = (Math.random() - 0.5) * hh * 2;
      } else if (side === 1) {
        x = hw + 20;
        y = (Math.random() - 0.5) * hh * 2;
      } else if (side === 2) {
        x = (Math.random() - 0.5) * hw * 2;
        y = -hh - 20;
      } else {
        x = (Math.random() - 0.5) * hw * 2;
        y = hh + 20;
      }
    }
    return {
      x,
      y,
      angle,
      length: 60 + Math.random() * 200,
      speed,
      alpha: 0.06 + Math.random() * 0.18,
      color: randomFrom(YELLOW_PALETTE),
      width: 0.5 + Math.random() * 2.0,
    };
  }

  private drawMovingLines(dt: number): void {
    this.lineGfx.clear();
    if (this.w === 0) return;
    const hw = this.w * 0.5,
      hh = this.h * 0.5;
    const pad = 300;
    for (let i = 0; i < this.movingLines.length; i++) {
      const l = this.movingLines[i];
      l.x += Math.cos(l.angle) * l.speed * dt;
      l.y += Math.sin(l.angle) * l.speed * dt;
      if (
        l.x > hw + pad ||
        l.x < -hw - pad ||
        l.y > hh + pad ||
        l.y < -hh - pad
      ) {
        this.movingLines[i] = this.makeMovingLine(hw, hh);
      }
      const tx = l.x - Math.cos(l.angle) * l.length;
      const ty = l.y - Math.sin(l.angle) * l.length;
      // Gradient: bright head fading to transparent tail
      this.lineGfx.moveTo(l.x, l.y).lineTo(tx, ty).stroke({
        color: l.color,
        alpha: l.alpha,
        width: l.width,
        cap: "round",
      });
      // Bright head dot
      this.lineGfx
        .circle(l.x, l.y, l.width * 1.8)
        .fill({ color: l.color, alpha: l.alpha * 1.4 });
    }
  }

  // ── Pulsating dots ────────────────────────────────────────────────────────

  private spawnPulseDots(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < PULSE_DOT_COUNT; i++) {
      const color = randomFrom(YELLOW_PALETTE);
      this.pulseDots.push({
        x: (Math.random() - 0.5) * hw * 1.9,
        y: (Math.random() - 0.5) * hh * 1.9,
        baseR: 4 + Math.random() * 18,
        pulseAmp: 0.25 + Math.random() * 0.55,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.5 + Math.random() * 2.5,
        alpha: 0.25 + Math.random() * 0.5,
        color,
        colorB: randomFrom(YELLOW_PALETTE),
        colorPhase: Math.random() * Math.PI * 2,
        colorSpeed: 0.2 + Math.random() * 0.6,
        ringAlpha: 0.3 + Math.random() * 0.5,
      });
    }
  }

  private drawPulseDots(dt: number): void {
    this.pulseDotGfx.clear();
    if (this.w === 0) return;
    for (const d of this.pulseDots) {
      d.pulsePhase += d.pulseSpeed * dt;
      d.colorPhase += d.colorSpeed * dt;
      const pulse = 1 + Math.sin(d.pulsePhase) * d.pulseAmp;
      const r = d.baseR * pulse;
      const col = lerpColor(
        d.color,
        d.colorB,
        Math.sin(d.colorPhase) * 0.5 + 0.5,
      );
      // Outermost soft halo (3 rings)
      this.pulseDotGfx
        .circle(d.x, d.y, r * 3.5)
        .fill({ color: col, alpha: d.alpha * 0.05 });
      this.pulseDotGfx
        .circle(d.x, d.y, r * 2.2)
        .fill({ color: col, alpha: d.alpha * 0.12 });
      // Sharp ring outline that breathes
      this.pulseDotGfx
        .circle(d.x, d.y, r * 1.6)
        .stroke({ color: col, alpha: d.alpha * d.ringAlpha, width: 0.8 });
      // Solid core
      this.pulseDotGfx.circle(d.x, d.y, r).fill({ color: col, alpha: d.alpha });
      // Bright centre highlight
      this.pulseDotGfx
        .circle(d.x, d.y, r * 0.35)
        .fill({ color: 0xffffff, alpha: d.alpha * 0.4 });
    }
  }

  // ── Orbit groups ──────────────────────────────────────────────────────────

  private spawnOrbitGroups(): void {
    const hw = this.w > 0 ? this.w * 0.5 : 960;
    const hh = this.h > 0 ? this.h * 0.5 : 540;
    for (let i = 0; i < ORBIT_GROUP_COUNT; i++) {
      const dotCount = 2 + Math.floor(Math.random() * 4);
      const dots: OrbitDot[] = [];
      for (let d = 0; d < dotCount; d++) {
        dots.push({
          angle: (d / dotCount) * Math.PI * 2,
          speed: (0.4 + Math.random() * 1.2) * (Math.random() < 0.5 ? 1 : -1),
          radius: 30 + Math.random() * 90,
          size: 2 + Math.random() * 5,
          trailLen: 8 + Math.floor(Math.random() * 14),
          alpha: 0.3 + Math.random() * 0.5,
          color: randomFrom(YELLOW_PALETTE),
        });
      }
      this.orbitGroups.push({
        cx: (Math.random() - 0.5) * hw * 1.7,
        cy: (Math.random() - 0.5) * hh * 1.7,
        dots,
      });
    }
  }

  private drawOrbitGroups(dt: number): void {
    this.orbitGfx.clear();
    if (this.w === 0) return;
    for (const g of this.orbitGroups) {
      for (const d of g.dots) {
        d.angle += d.speed * dt;
        const cx = g.cx + Math.cos(d.angle) * d.radius;
        const cy = g.cy + Math.sin(d.angle) * d.radius;
        // Draw faded trail as ghost circles stepping back along the orbit
        for (let t = 1; t <= d.trailLen; t++) {
          const ta = d.angle - d.speed * dt * t * 3;
          const tx = g.cx + Math.cos(ta) * d.radius;
          const ty = g.cy + Math.sin(ta) * d.radius;
          const tf = 1 - t / d.trailLen;
          this.orbitGfx
            .circle(tx, ty, d.size * tf * 0.9)
            .fill({ color: d.color, alpha: d.alpha * tf * 0.4 });
        }
        // Head dot with halo
        this.orbitGfx
          .circle(cx, cy, d.size * 2.4)
          .fill({ color: d.color, alpha: d.alpha * 0.15 });
        this.orbitGfx
          .circle(cx, cy, d.size)
          .fill({ color: d.color, alpha: d.alpha });
      }
    }
  }
}
