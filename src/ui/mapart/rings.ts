// 有機邊緣：先扭曲頂點，再把每條邊細分成三段並橫向抖動。
// 位移只由座標決定，相鄰兩格算出同一條線，所以填色與描線不會有縫。
import type { Point } from "../../data/types";
import { fbm, hashPoint } from "../../core/noise";
import type { Terrain } from "../../core/terrain";

export type Rings = Point[][][];

const cache = new WeakMap<Terrain, Rings>();

function warp(p: Point, size: Point, amp: number, seed: number): Point {
  const [x, y] = p;
  const nx = x > 0.01 && x < size[0] - 0.01 ? x + (fbm(x / 22, y / 22, seed + 1, 3) - 0.5) * 2 * amp : x;
  const ny = y > 0.01 && y < size[1] - 0.01 ? y + (fbm(x / 22, y / 22, seed + 2, 3) - 0.5) * 2 * amp : y;
  return [nx, ny];
}

function edge(a: Point, b: Point, seed: number, rough: number): Point[] {
  if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) return edge(b, a, seed, rough).reverse();
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const out: Point[] = [a];
  for (const t of [1 / 3, 2 / 3]) {
    const off = (hashPoint(a[0] + b[0], a[1] + b[1], seed + (t < 0.5 ? 5 : 6)) - 0.5) * rough * len;
    out.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
  }
  out.push(b);
  return out;
}

/** 每格每條邊的折線；ringsFor(terrain)[格][邊] */
export function ringsFor(terrain: Terrain): Rings {
  const hit = cache.get(terrain);
  if (hit) return hit;
  const { cells, spacing, size } = terrain.grid;
  const rings: Rings = cells.map((c) => {
    const pts = c.poly.map((p) => warp(p, size, spacing * 0.32, terrain.seed));
    return pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length];
      return c.nbEdge[i] < 0 ? [a, b] : edge(a, b, terrain.seed, 0.55);
    });
  });
  cache.set(terrain, rings);
  return rings;
}
