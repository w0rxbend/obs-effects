import type { Ticker } from "pixi.js";
import { Container, Texture } from "pixi.js";

import { CameraBorder } from "./main/CameraBorder";

/**
 * Screen that renders the animated OBS camera border.
 * Loads the "main" bundle so worxbend-logo.png is available by the time
 * show() is called and can be handed to CameraBorder.attachLogo().
 */
export class CameraScreen extends Container {
  public static assetBundles = ["main"];

  private readonly cameraBorder: CameraBorder;

  constructor() {
    super();
    this.cameraBorder = new CameraBorder(200);
    this.addChild(this.cameraBorder);
  }

  /** Called after asset bundles are loaded — safe to use Texture.from() here. */
  public async show(): Promise<void> {
    // attachGraffitiSplats first so splatCont sits below logo layers
    this.cameraBorder.attachGraffitiSplats(Texture.from("sprite.png"));
    this.cameraBorder.attachLogo(Texture.from("worxbend-logo.png"));
  }

  public update(_time: Ticker): void {
    this.cameraBorder.update();
  }

  public resize(width: number, height: number): void {
    this.cameraBorder.x = width * 0.5;
    this.cameraBorder.y = height * 0.5;
  }
}
