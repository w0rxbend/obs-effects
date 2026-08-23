import type { Ticker } from "pixi.js";
import { Container, Texture } from "pixi.js";

import { CameraBorder3 } from "./main/CameraBorder3";

export class CameraScreen3 extends Container {
  public static assetBundles = ["main"];

  private readonly cameraBorder: CameraBorder3;

  constructor() {
    super();
    this.cameraBorder = new CameraBorder3(200);
    this.addChild(this.cameraBorder);
  }

  public async show(): Promise<void> {
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
