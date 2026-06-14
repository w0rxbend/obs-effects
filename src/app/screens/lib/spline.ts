// ── Shared organic-shape helpers ─────────────────────────────────────────────
// Catmull-Rom spline sampling (closed + open) and a tiny deterministic PRNG,
// used by the blob / wave background screens so their compositions stay stable
// across reloads and resizes.

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Sample a smooth closed loop through `ctrl` (flat [x,y,...]); returns flat points. */
export function catmullClosed(ctrl: number[], sub: number): number[] {
  const n = ctrl.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const i0 = ((i - 1 + n) % n) * 2;
    const i1 = i * 2;
    const i2 = ((i + 1) % n) * 2;
    const i3 = ((i + 2) % n) * 2;
    for (let s = 0; s < sub; s++) {
      const u = s / sub;
      out.push(catmull(ctrl[i0], ctrl[i1], ctrl[i2], ctrl[i3], u));
      out.push(
        catmull(ctrl[i0 + 1], ctrl[i1 + 1], ctrl[i2 + 1], ctrl[i3 + 1], u),
      );
    }
  }
  return out;
}

/** Sample a smooth open curve through `ctrl` (flat [x,y,...]); returns flat points. */
export function catmullOpen(ctrl: number[], sub: number): number[] {
  const n = ctrl.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(i - 1, 0) * 2;
    const i1 = i * 2;
    const i2 = (i + 1) * 2;
    const i3 = Math.min(i + 2, n - 1) * 2;
    const last = i === n - 2;
    const steps = last ? sub : sub - 1;
    for (let s = 0; s <= steps; s++) {
      const u = s / sub;
      out.push(catmull(ctrl[i0], ctrl[i1], ctrl[i2], ctrl[i3], u));
      out.push(
        catmull(ctrl[i0 + 1], ctrl[i1 + 1], ctrl[i2 + 1], ctrl[i3 + 1], u),
      );
    }
  }
  return out;
}

/** Deterministic seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
