import type { Ticker } from "pixi.js";
import { Container, Graphics, Text, TextStyle } from "pixi.js";

// ── Редагуй цей масив як завгодно ─────────────────────────────────────────────
const MESSAGES = [
  "ласкаво просимо на стрім!",
  "підписуйся щоб не пропустити нові відео",
  "питання? пиши в чат — відповім наживо",
  "discord у описі каналу — заходь поспілкуватись",
  "якщо сподобалось — лайк допомагає алгоритму",
  "сьогодні розбираємо реальний проєкт без туторіальщини",
  "код відкритий — посилання в описі",
  "налаштовуй звук та якість під себе у кутку екрану",
] as const;

// Роздільник між повідомленнями
const SEPARATOR = "  //  ";

// Швидкість прокрутки пікселів за мілісекунду
const SCROLL_SPEED = 0.14;

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const COLOR_TEXT   = 0x162e1c; // темний ліс — текст у траві
const COLOR_STROKE = 0x4a9a52; // середній зелений — тонкий контур

// ── Grass palette – back to front ─────────────────────────────────────────────
const BACK_COLORS  = [0x0f2415, 0x162e1c, 0x1a3320, 0x22422a, 0x2a5232, 0x2d5536] as const;
const MID_COLORS   = [0x306838, 0x3a7a42, 0x42884a, 0x4a9a52, 0x52a85a, 0x5db868, 0x68c473] as const;
const FRONT_COLORS = [0x78cc7e, 0x8ed88a, 0xa6e3a1, 0xb8ebb5, 0x94e2d5, 0x7fd8c8, 0x6db476, 0x82c97f, 0x9ed99b] as const;

const TICKER_STYLE = new TextStyle({
  fontFamily: "'Bangers', cursive",
  fontSize: 38,
  fill: COLOR_TEXT,
  stroke: { color: COLOR_STROKE, width: 3 },
  letterSpacing: 2,
  padding: 8,
});

interface Blade {
  x: number;
  height: number;
  width: number;
  color: number;
  phase: number;
  lean: number;
  layer: 0 | 1 | 2;
}

interface TickerItem {
  obj: Text;
  width: number;
}

// Wind parameters per layer: [amplitude px, speed rad/s, freq rad/px]
const WIND = [
  { amp: 12, speed: 0.6, freq: 0.0025 },
  { amp: 24, speed: 0.7, freq: 0.0022 },
  { amp: 42, speed: 0.8, freq: 0.0018 },
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class GrassScreen extends Container {
  public static assetBundles: string[] = [];

  private readonly gfxBack     = new Graphics(); // ground + layer 0 + layer 1
  private readonly scrollCont  = new Container();
  private readonly gfxFront    = new Graphics(); // layer 2 — поверх тексту

  private blades:  Blade[]      = [];
  private items:   TickerItem[] = [];
  private msgIdx   = 0;

  private time = 0;
  private W    = 1920;
  private H    = 1080;

  constructor() {
    super();
    this.addChild(this.gfxBack);
    this.addChild(this.scrollCont);
    this.addChild(this.gfxFront);  // рендер поверх ticker
  }

  public async show(): Promise<void> {
    this.buildBlades();
    this.populateTicker();
  }

  // ── Grass ──────────────────────────────────────────────────────────────────

  private buildBlades(): void {
    this.blades = [];
    const zone = this.H * 0.11;

    const spawn = (
      count: number,
      layer: 0 | 1 | 2,
      heightMin: number,
      heightMax: number,
      widthMin: number,
      widthMax: number,
      colors: readonly number[],
    ) => {
      for (let i = 0; i < count; i++) {
        this.blades.push({
          x: -20 + Math.random() * (this.W + 40),
          height: zone * (heightMin + Math.random() * (heightMax - heightMin)),
          width: widthMin + Math.random() * (widthMax - widthMin),
          color: pick(colors),
          phase: Math.random() * Math.PI * 2,
          lean: (Math.random() - 0.5) * 0.4,
          layer,
        });
      }
    };

    spawn(750, 0, 0.20, 0.55, 2,  4,  BACK_COLORS);
    spawn(620, 1, 0.40, 0.78, 3,  7,  MID_COLORS);
    spawn(100, 2, 0.60, 1.00, 4,  10, FRONT_COLORS);

    this.blades.sort((a, b) => a.layer - b.layer);
  }

  private windAt(x: number, layer: 0 | 1 | 2): number {
    const { amp, speed, freq } = WIND[layer];
    const t = this.time;
    return (
      Math.sin(t * speed + x * freq) * amp +
      Math.sin(t * speed * 1.37 + x * freq * 2.3 + 1.1) * amp * 0.28
    );
  }

  private drawBlade(g: Graphics, blade: Blade): void {
    const baseY        = this.H;
    const personalWind = this.windAt(blade.x + blade.phase * 80, blade.layer);

    const tipX = blade.x + personalWind + blade.lean * blade.height * 0.25;
    const tipY = baseY   - blade.height;
    const cpX  = blade.x + personalWind * 0.45 + blade.lean * blade.height * 0.12;
    const cpY  = baseY   - blade.height * 0.65;
    const half = blade.width * 0.5;

    g.moveTo(blade.x - half, baseY)
     .quadraticCurveTo(cpX - half * 0.4, cpY, tipX, tipY)
     .quadraticCurveTo(cpX + half * 0.6, cpY, blade.x + half, baseY)
     .fill({ color: blade.color, alpha: 0.82 + blade.layer * 0.06 });
  }

  // ── Ticker ─────────────────────────────────────────────────────────────────

  private get tickerY(): number {
    const zone = this.H * 0.11;
    return this.H - zone * 0.38; // глибше в траві
  }

  private populateTicker(): void {
    for (const item of this.items) {
      this.scrollCont.removeChild(item.obj);
      item.obj.destroy();
    }
    this.items = [];
    this.msgIdx = 0;
    this.scrollCont.x = 0;

    let right = 0;
    while (right < this.W + 600) {
      const item = this.spawnItem();
      item.obj.x = right;
      this.scrollCont.addChild(item.obj);
      this.items.push(item);
      right = item.obj.x + item.width;
    }
  }

  private spawnItem(): TickerItem {
    const label = MESSAGES[this.msgIdx % MESSAGES.length] + SEPARATOR;
    this.msgIdx++;
    const obj = new Text({ text: label, style: TICKER_STYLE });
    obj.y = this.tickerY - obj.height * 0.5;
    return { obj, width: obj.width };
  }

  private rightEdge(): number {
    if (this.items.length === 0) return 0;
    const last = this.items[this.items.length - 1];
    return last.obj.x + last.width;
  }

  private scrollTicker(deltaMS: number): void {
    this.scrollCont.x -= SCROLL_SPEED * deltaMS;

    // Remove items that scrolled fully off the left
    const leftBound = -this.scrollCont.x;
    while (this.items.length > 0) {
      const first = this.items[0];
      if (first.obj.x + first.width < leftBound) {
        this.scrollCont.removeChild(first.obj);
        first.obj.destroy();
        this.items.shift();
      } else break;
    }

    // Append new items to fill the right side
    const fillTo = leftBound + this.W + 600;
    let right = this.rightEdge();
    while (right < fillTo) {
      const item = this.spawnItem();
      item.obj.x = right;
      this.scrollCont.addChild(item.obj);
      this.items.push(item);
      right = item.obj.x + item.width;
    }
  }

  // ── Loop ───────────────────────────────────────────────────────────────────

  public update(ticker: Ticker): void {
    this.time += ticker.deltaMS * 0.001;
    this.scrollTicker(ticker.deltaMS);
    this.draw();
  }

  private draw(): void {
    this.gfxBack.clear();
    this.gfxFront.clear();

    // Земля — найнижчий шар
    this.gfxBack.rect(0, this.H - 12, this.W, 12).fill({ color: 0x0f2415, alpha: 1 });

    for (const blade of this.blades) {
      if (blade.layer < 2) {
        this.drawBlade(this.gfxBack, blade);  // за текстом
      } else {
        this.drawBlade(this.gfxFront, blade); // перед текстом
      }
    }
  }

  public resize(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.buildBlades();
    if (this.items.length > 0) this.populateTicker();
  }
}
