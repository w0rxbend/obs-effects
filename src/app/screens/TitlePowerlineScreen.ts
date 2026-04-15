import type { Ticker } from "pixi.js";
import { Container } from "pixi.js";

/**
 * "Starting Soon / Title Powerline" overlay.
 *
 * TODO: implement the animated powerline banner here.
 */
export class TitlePowerlineScreen extends Container {
  public static assetBundles = ["default"];

  public async show(): Promise<void> {
    // TODO: initialise scene
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public update(_time: Ticker): void {
    // TODO: per-frame animation
  }

  public resize(_width: number, _height: number): void {
    // TODO: reposition elements
  }
}
