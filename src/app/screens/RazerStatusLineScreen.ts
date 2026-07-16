import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

import { obsAudio } from "../../lib/obsAudio";
import {
  TOXIC_ACID,
  TOXIC_BLACK,
  TOXIC_GREEN,
  TOXIC_LIME,
  TOXIC_WHITE,
} from "../../lib/shaders/toxicGreen";

const BAND_H = 56;
const BAR_COUNT = 28;
const BAR_GAP = 3;

const LABEL_STYLE = new TextStyle({
  fontFamily: "'Share Tech Mono', 'Consolas', monospace",
  fontSize: 20,
  fill: TOXIC_WHITE,
  letterSpacing: 2,
});

const CLOCK_STYLE = new TextStyle({
  fontFamily: "'Share Tech Mono', 'Consolas', monospace",
  fontSize: 20,
  fill: TOXIC_ACID,
  letterSpacing: 2,
});

export class RazerStatusLineScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly band = new Graphics();
  private readonly meter = new Graphics();
  private readonly badge = new Graphics();
  private readonly liveLabel: Text;
  private readonly clock: Text;

  private readonly bars = new Float32Array(BAR_COUNT);
  private readonly barSeeds = new Float32Array(BAR_COUNT);

  private w = 1920;
  private h = 1080;
  private time = 0;
  private uptime = 0;
  private beatPulse = 0;

  constructor() {
    super();

    for (let i = 0; i < BAR_COUNT; i++) {
      const s = Math.sin(i * 71.13) * 43758.5453;
      this.barSeeds[i] = s - Math.floor(s);
    }

    this.addChild(this.band);
    this.addChild(this.meter);
    this.addChild(this.badge);

    this.liveLabel = new Text({ text: "LIVE", style: LABEL_STYLE });
    this.clock = new Text({ text: "00:00:00", style: CLOCK_STYLE });
    this.addChild(this.liveLabel);
    this.addChild(this.clock);

    void obsAudio.connect();
  }

  public async show(): Promise<void> {}
  public async hide(): Promise<void> {}

  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.layout();
  }

  private layout(): void {
    const y = this.h - BAND_H;

    this.band.clear();
    this.band
      .rect(0, y, this.w, BAND_H)
      .fill({ color: TOXIC_BLACK, alpha: 0.72 });
    this.band.rect(0, y, this.w, 2).fill({ color: TOXIC_GREEN, alpha: 0.9 });

    this.liveLabel.x = 78;
    this.liveLabel.y = y + BAND_H / 2 - this.liveLabel.height / 2;

    this.clock.x = this.w - this.clock.width - 28;
    this.clock.y = y + BAND_H / 2 - this.clock.height / 2;
  }

  public update(ticker: Ticker): void {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    this.time += dt;
    this.uptime += dt;
    obsAudio.update(dt);

    const beatTarget = obsAudio.beat ? 1 : 0;
    this.beatPulse += (beatTarget - this.beatPulse) * Math.min(1, dt * 8);

    this.updateBadge();
    this.updateMeter();
    this.updateClock();
  }

  private updateBadge(): void {
    const y = this.h - BAND_H;
    const cx = 38;
    const cy = y + BAND_H / 2;
    const blink = 0.55 + 0.45 * Math.sin(this.time * 3.2);
    const radius = 8 + this.beatPulse * 3;

    this.badge.clear();
    this.badge
      .circle(cx, cy, radius + 6)
      .fill({ color: TOXIC_GREEN, alpha: 0.18 * blink });
    this.badge.circle(cx, cy, radius).fill({ color: TOXIC_LIME, alpha: blink });
  }

  private updateMeter(): void {
    const y = this.h - BAND_H;
    const areaLeft =
      this.w * 0.5 - (BAR_COUNT * (this.meterBarWidth() + BAR_GAP)) / 2;
    const barW = this.meterBarWidth();
    const maxH = BAND_H * 0.62;
    const baseY = y + BAND_H - 10;

    this.meter.clear();

    for (let i = 0; i < BAR_COUNT; i++) {
      const centerBias = 1 - Math.abs(i / (BAR_COUNT - 1) - 0.5) * 2;
      const wobble =
        0.5 +
        0.5 * Math.sin(this.time * (2.4 + this.barSeeds[i] * 3) + i * 0.6);
      const energy =
        obsAudio.bass * 0.5 +
        obsAudio.mid * 0.35 +
        obsAudio.high * 0.2 +
        obsAudio.level * 0.4;
      const target = Math.min(
        1,
        0.05 + energy * (0.5 + centerBias * 0.6) * (0.6 + wobble * 0.5),
      );
      this.bars[i] += (target - this.bars[i]) * Math.min(1, 12 * (1 / 60));

      const barH = Math.max(2, this.bars[i] * maxH);
      const x = areaLeft + i * (barW + BAR_GAP);
      const alpha = 0.55 + this.bars[i] * 0.45;
      const color = this.bars[i] > 0.7 ? TOXIC_LIME : TOXIC_GREEN;

      this.meter.rect(x, baseY - barH, barW, barH).fill({ color, alpha });
    }
  }

  private meterBarWidth(): number {
    return Math.max(3, this.w * 0.012);
  }

  private updateClock(): void {
    const total = Math.floor(this.uptime);
    const hh = String(Math.floor(total / 3600)).padStart(2, "0");
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    const next = `${hh}:${mm}:${ss}`;
    if (this.clock.text !== next) {
      this.clock.text = next;
      this.clock.x = this.w - this.clock.width - 28;
    }
  }
}
