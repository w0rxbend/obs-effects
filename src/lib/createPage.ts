import { Container } from "pixi.js";

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

    await engine.init({
      background: opts.background,
      backgroundAlpha: opts.backgroundAlpha,
      resizeOptions: opts.resizeOptions ?? {
        minWidth: 1920,
        minHeight: 1080,
        letterbox: false,
      },
    });

    await engine.navigation.showScreen(ScreenClass);
  })();
}
