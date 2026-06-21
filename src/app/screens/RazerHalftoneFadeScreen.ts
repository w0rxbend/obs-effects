import { HalftoneFadeScreen } from "./HalftoneFadeScreen";

export class RazerHalftoneFadeScreen extends HalftoneFadeScreen {
  protected override get dotColor(): number {
    return 0x44ff00;
  }
}
