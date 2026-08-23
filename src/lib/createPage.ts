import { ApplicationOptions } from "pixi.js";

import { setEngine } from "../app/getEngine";
import { CreationEngine } from "../engine/engine";
import type { AppScreenConstructor } from "../engine/navigation/navigation";

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
    const named = Object.fromEntries(
      Object.entries({
        background: opts.background,
        backgroundAlpha: opts.backgroundAlpha,
        antialias: opts.antialias,
      }).filter(([, value]) => value !== undefined),
    );

    if (opts.waitForFonts) {
      await document.fonts.ready;
    }

    if (opts.fonts && opts.fonts.length > 0) {
      await Promise.all(opts.fonts.map((f) => document.fonts.load(f)));
    }

    await engine.init({
      ...opts.extra,
      resizeOptions: opts.resizeOptions ?? {
        minWidth: 1920,
        minHeight: 1080,
        letterbox: false,
      },
      ...named,
    });

    await engine.navigation.showScreen(ScreenClass);
  })().catch((error: unknown) => {
    console.error(
      "[createPage] page initialization failed; no screen was shown.",
      error,
    );
  });
}
