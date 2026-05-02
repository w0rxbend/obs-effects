import type { Ticker } from "pixi.js";
import { Container, Texture } from "pixi.js";

import { AudioActivatedCameraBorder } from "./main/AudioActivatedCameraBorder";

export class AudioActivatedCameraScreen extends Container {
  public static assetBundles = ["main"];

  private readonly cameraBorder: AudioActivatedCameraBorder;

  constructor() {
    super();
    this.cameraBorder = new AudioActivatedCameraBorder(200);
    this.addChild(this.cameraBorder);
  }

  public async show(): Promise<void> {
    this.cameraBorder.attachGraffitiSplats(Texture.from("sprite.png"));
    this.cameraBorder.attachLogo(Texture.from("worxbend-logo.png"));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public update(_time: Ticker): void {
    this.cameraBorder.update();
  }

  public resize(width: number, height: number): void {
    this.cameraBorder.x = width * 0.5;
    this.cameraBorder.y = height * 0.5;
  }
}
