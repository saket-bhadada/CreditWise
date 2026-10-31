/** Deterministic PRNG so torn edges are identical on every render. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * CSS clip-path polygon with a ragged, torn-paper outline.
 * `ampX` / `ampY` are the max inward jitter in % of width / height (keep padding larger than
 * the jitter so content is never clipped).
 */
export function tornPolygon(seed = 1, { ampX = 1.6, ampY = 5, step = 4.5 } = {}) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let x = 0; x <= 100; x += step) pts.push([Math.min(x, 100), rnd() * ampY]);
  for (let y = 0; y <= 100; y += step * 2.2) pts.push([100 - rnd() * ampX, Math.min(y, 100)]);
  for (let x = 100; x >= 0; x -= step) pts.push([Math.max(x, 0), 100 - rnd() * ampY]);
  for (let y = 100; y >= 0; y -= step * 2.2) pts.push([rnd() * ampX, Math.max(y, 0)]);
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(", ")})`;
}

/** Polygon for a block whose TOP edge is torn (amplitude in px), straight everywhere else. */
export function tornTopPolygon(seed = 1, { amp = 16, step = 3.2 } = {}) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let x = 0; x <= 100; x += step) pts.push(`${Math.min(x, 100).toFixed(1)}% ${(rnd() * amp).toFixed(1)}px`);
  pts.push("100% 100%", "0% 100%");
  return `polygon(${pts.join(", ")})`;
}
