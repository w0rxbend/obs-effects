import type { Graphics } from "pixi.js";
import {
  ADMIRAL_SIZE,
  BOID_HEALTH,
  CATT_OVERLAY0,
  TEAM_COLOR,
  TEAM_ENGINE,
} from "./constants";
import type { Admiral, Boid } from "./types";

export function drawShip(g: Graphics, b: Boid): void {
  const angle = Math.atan2(b.vy, b.vx);
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const s = b.size;
  const col = TEAM_COLOR[b.team];
  const engCol = TEAM_ENGINE[b.team];

  // engine glow behind the ship
  const ex = b.x - cos * s * 1.4;
  const ey = b.y - sin * s * 1.4;
  g.circle(ex, ey, s * 1.5).fill({ color: engCol, alpha: 0.22 });
  g.circle(ex, ey, s * 0.7).fill({ color: engCol, alpha: 0.55 });

  // ship body (triangle: nose forward, two wing tips back)
  const nx = b.x + cos * s * 2.2;
  const ny = b.y + sin * s * 2.2;
  const w1x = b.x - cos * s + sin * s * 1.1;
  const w1y = b.y - sin * s - cos * s * 1.1;
  const w2x = b.x - cos * s - sin * s * 1.1;
  const w2y = b.y - sin * s + cos * s * 1.1;

  g.poly([nx, ny, w1x, w1y, w2x, w2y]).fill({ color: col, alpha: 0.92 });
  g.poly([nx, ny, w1x, w1y, w2x, w2y]).stroke({
    color: 0xffffff,
    alpha: 0.22,
    width: 0.5,
  });

  // health bar (thin line above ship)
  if (b.health < BOID_HEALTH) {
    const hp = b.health / (b.isOffspring ? 2 : BOID_HEALTH);
    const barW = s * 3.5;
    const barY = b.y - s * 3.2;
    g.rect(b.x - barW * 0.5, barY, barW * hp, 1.5).fill({
      color: col,
      alpha: 0.8,
    });
    g.rect(b.x - barW * 0.5 + barW * hp, barY, barW * (1 - hp), 1.5).fill({
      color: CATT_OVERLAY0,
      alpha: 0.5,
    });
  }
}

export function drawAdmiralShip(g: Graphics, adm: Admiral): void {
  const angle = Math.atan2(adm.vy || 1, adm.vx || 0);
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const s = ADMIRAL_SIZE;
  const col = TEAM_COLOR[adm.team];
  const eng = TEAM_ENGINE[adm.team];

  // engine glow
  const ex = adm.x - cos * s * 1.6,
    ey = adm.y - sin * s * 1.6;
  g.circle(ex, ey, s * 1.8).fill({ color: eng, alpha: 0.28 });
  g.circle(ex, ey, s * 0.9).fill({ color: eng, alpha: 0.7 });

  // large command ship body — hexagonal silhouette (6-point polygon)
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = angle + (i / 6) * Math.PI * 2;
    pts.push(adm.x + Math.cos(a) * s, adm.y + Math.sin(a) * s);
  }
  g.poly(pts).fill({ color: col, alpha: 0.95 });
  g.poly(pts).stroke({ color: 0xffffff, alpha: 0.55, width: 1.2 });

  // forward cannon nose
  const nx = adm.x + cos * s * 2.0,
    ny = adm.y + sin * s * 2.0;
  g.moveTo(adm.x + cos * s * 0.8, adm.y + sin * s * 0.8)
    .lineTo(nx, ny)
    .stroke({ color: 0xffffff, alpha: 0.7, width: 2.5, cap: "round" });

  // rotating shield ring
  const shieldR = s * 2.6;
  const shieldArc = Math.PI * 1.3;
  const shieldStart = adm.shieldPhase;
  for (let i = 0; i < 24; i++) {
    const ta = shieldStart + (i / 24) * shieldArc;
    g.circle(
      adm.x + Math.cos(ta) * shieldR,
      adm.y + Math.sin(ta) * shieldR,
      1.0,
    ).fill({ color: col, alpha: 0.45 });
  }

  // health bar below ship
  const hp = adm.health / adm.maxHealth;
  const bw = s * 5;
  const by = adm.y + s * 3.8;
  g.rect(adm.x - bw * 0.5, by, bw * hp, 2.5).fill({ color: col, alpha: 0.9 });
  g.rect(adm.x - bw * 0.5 + bw * hp, by, bw * (1 - hp), 2.5).fill({
    color: CATT_OVERLAY0,
    alpha: 0.5,
  });

  // "ADM" label dot — small bright pip at centre
  g.circle(adm.x, adm.y, s * 0.38).fill({ color: 0xffffff, alpha: 0.9 });
}
