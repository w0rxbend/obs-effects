import type { Graphics } from "pixi.js";
import type { TreeCluster } from "./types";

export function drawBroadleaf(
  g: Graphics,
  tree: TreeCluster,
  trunkX: number,
  trunkTop: number,
  sway: number,
): void {
  const centerY = trunkTop - tree.canopyHeight * tree.crownLift;
  const span = tree.canopyWidth * 0.62;

  g.circle(
    trunkX + sway * 0.24,
    trunkTop - tree.canopyHeight * 0.02,
    tree.canopyWidth * 0.2,
  ).fill({
    color: 0x04070b,
    alpha: 0.97,
  });

  for (let index = 0; index < tree.lobeCount; index++) {
    const t = tree.lobeCount === 1 ? 0.5 : index / (tree.lobeCount - 1);
    const x =
      trunkX +
      (t - 0.5) * span +
      sway * (0.55 + t * 0.35) +
      Math.sin(tree.phase + index * 0.9) * 1.6;
    const y =
      centerY -
      Math.sin(t * Math.PI) * tree.canopyHeight * 0.34 -
      Math.cos(tree.phase * 0.6 + index) * 2.4;
    const r =
      tree.canopyWidth * (0.18 + Math.sin(t * Math.PI) * 0.12) +
      tree.canopyHeight * 0.1;

    g.circle(x, y, r).fill({
      color: index % 2 === 0 ? 0x04070b : 0x05080d,
      alpha: 0.97,
    });
  }

  g.circle(
    trunkX - tree.canopyWidth * tree.crownLeft + sway * 0.55,
    trunkTop - tree.canopyHeight * 0.32,
    tree.canopyWidth * 0.28,
  ).fill({
    color: 0x04070b,
    alpha: 0.96,
  });
  g.circle(
    trunkX + tree.canopyWidth * tree.crownRight + sway * 0.72,
    trunkTop - tree.canopyHeight * 0.38,
    tree.canopyWidth * 0.24,
  ).fill({
    color: 0x05080d,
    alpha: 0.95,
  });
}

export function drawPoplar(
  g: Graphics,
  tree: TreeCluster,
  trunkX: number,
  trunkTop: number,
  sway: number,
): void {
  const lobeCount = Math.max(5, tree.lobeCount + 1);

  g.circle(
    trunkX + sway * 0.25,
    trunkTop - tree.canopyHeight * 0.04,
    tree.canopyWidth * 0.26,
  ).fill({
    color: 0x04070b,
    alpha: 0.97,
  });

  for (let index = 0; index < lobeCount; index++) {
    const t = index / (lobeCount - 1);
    const y = trunkTop - tree.canopyHeight * (0.04 + t * 0.9);
    const widthBias = 1 - Math.abs(t - 0.5) * 1.25;
    const radius = tree.canopyWidth * (0.22 + widthBias * 0.18);
    const x =
      trunkX +
      Math.sin(tree.phase + index * 0.55) * tree.canopyWidth * 0.08 +
      sway * (0.48 + t * 0.45);

    g.circle(x, y, radius).fill({
      color: index % 2 === 0 ? 0x04070b : 0x05080d,
      alpha: 0.97,
    });
  }

  g.circle(
    trunkX + sway * 0.75,
    trunkTop - tree.canopyHeight * 0.96,
    tree.canopyWidth * 0.2,
  ).fill({
    color: 0x05080d,
    alpha: 0.95,
  });
}

export function drawConifer(
  g: Graphics,
  tree: TreeCluster,
  trunkX: number,
  trunkTop: number,
  sway: number,
): void {
  const tiers = Math.max(3, Math.floor(tree.lobeCount * 0.8));
  const crownTop = trunkTop - tree.canopyHeight;

  g.moveTo(trunkX + sway * 0.18, trunkTop - tree.canopyHeight * 0.1)
    .lineTo(
      trunkX - tree.canopyWidth * 0.2 + sway * 0.12,
      trunkTop + tree.canopyHeight * 0.04,
    )
    .lineTo(
      trunkX + tree.canopyWidth * 0.2 + sway * 0.24,
      trunkTop + tree.canopyHeight * 0.04,
    )
    .lineTo(trunkX + sway * 0.18, trunkTop - tree.canopyHeight * 0.1)
    .fill({
      color: 0x04070b,
      alpha: 0.97,
    });

  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / Math.max(1, tiers - 1);
    const tierWidth = tree.canopyWidth * (0.6 - t * 0.22);
    const tierY =
      trunkTop + tree.canopyHeight * 0.04 - tree.canopyHeight * (t * 0.74);
    const tipY = crownTop + tree.canopyHeight * t * 0.26;
    const offset = sway * (0.35 + t * 0.55);

    g.moveTo(trunkX + offset, tipY)
      .lineTo(trunkX - tierWidth * 0.5 + offset, tierY)
      .lineTo(trunkX + tierWidth * 0.5 + offset, tierY)
      .lineTo(trunkX + offset, tipY)
      .fill({
        color: tier % 2 === 0 ? 0x04070b : 0x05080d,
        alpha: 0.97,
      });
  }

  g.circle(
    trunkX + sway * 0.5,
    crownTop - tree.canopyHeight * 0.03,
    tree.canopyWidth * 0.08,
  ).fill({
    color: 0x05080d,
    alpha: 0.96,
  });
}
