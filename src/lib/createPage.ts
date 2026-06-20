import { ApplicationOptions, Container } from "pixi.js";

import { setEngine } from "../app/getEngine";
import { CreationEngine } from "../engine/engine";

interface AppScreenConstructor {
  new (): Container;
  assetBundles?: string[];
}

interface CreatePageOptions {
  background?: number | string;
  backgroundAlpha?: number;
  resizeOptions?: { minWidth: number; minHeight: number; letterbox: boolean };
  waitForFonts?: boolean;
  fonts?: string[];
  antialias?: boolean;
  extra?: Partial<ApplicationOptions>;
}

export function createPage(
  ScreenClass: AppScreenConstructor,
  opts: CreatePageOptions = {},
): void {
  const engine = new CreationEngine();
  setEngine(engine);

  (async () => {
    if (opts.waitForFonts) {
      await document.fonts.ready;
    }

    if (opts.fonts && opts.fonts.length > 0) {
      await Promise.all(opts.fonts.map((f) => document.fonts.load(f)));
    }

    await engine.init({
      ...opts.extra,
      background: opts.background,
      backgroundAlpha: opts.backgroundAlpha,
      antialias: opts.antialias,
      resizeOptions: opts.resizeOptions ?? {
        minWidth: 1920,
        minHeight: 1080,
        letterbox: false,
      },
    });

    await engine.navigation.showScreen(ScreenClass);
  })();
}
