// 省：每個地域內的維諾格，以多源最短路分成若干群；山脊讓路變難，所以省界傾向落在山脊上。
// 只影響顯示（細省界、資訊卡的省編號），不影響判定。
import type { GameData } from "../data/types";
import { MinHeap } from "./heap";
import { clamp, seededRandom } from "./noise";
import { deriveSeed } from "./rng";
import type { Terrain } from "./terrain";

export interface Provinces {
  count: number;
  /** 每格所屬的省，海是 -1 */
  of: Int16Array;
  /** 各省的種子格 */
  seeds: number[];
  /** 各省所屬的地域索引（對應 Terrain.regionIds） */
  region: number[];
}

const memo = new WeakMap<Terrain, Map<number, Provinces>>();

/** 把總省數依各地域的面積分配，每個地域至少 minPerRegion 個 */
export function provinceQuota(areas: number[], total: number, minPerRegion: number): number[] {
  const sum = areas.reduce((s, a) => s + a, 0) || 1;
  const quota = areas.map((a) => Math.max(minPerRegion, Math.round((total * a) / sum)));
  const biggest = () => quota.reduce((best, q, i) => (areas[i] / q > areas[best] / quota[best] ? i : best), 0);
  while (quota.reduce((s, q) => s + q, 0) < total) quota[biggest()]++;
  while (quota.reduce((s, q) => s + q, 0) > total) {
    const shrink = quota.reduce((best, q, i) => (q > minPerRegion && (best < 0 || areas[i] / q < areas[best] / quota[best]) ? i : best), -1);
    if (shrink < 0) break;
    quota[shrink]--;
  }
  return quota;
}

export function provincesFor(terrain: Terrain, data: GameData, count: number = data.mapart.provinces.count): Provinces {
  const wanted = clamp(Math.round(count), data.mapart.provinces.min, data.mapart.provinces.max);
  let byCount = memo.get(terrain);
  if (!byCount) memo.set(terrain, (byCount = new Map()));
  const hit = byCount.get(wanted);
  if (hit) return hit;
  const value = generate(terrain, data, wanted);
  byCount.set(wanted, value);
  return value;
}

function generate(terrain: Terrain, data: GameData, count: number): Provinces {
  const { cells, spacing } = terrain.grid;
  const regionCells = terrain.regionIds.map((): number[] => []);
  for (const c of cells) if (terrain.land[c.id]) regionCells[terrain.region[c.id]].push(c.id);
  const quota = provinceQuota(regionCells.map((l) => l.length), count, data.mapart.provinces.minPerRegion);
  const of = new Int16Array(cells.length).fill(-1);
  const seeds: number[] = [];
  const region: number[] = [];

  regionCells.forEach((ids, ri) => {
    if (ids.length === 0) return;
    const k = Math.min(quota[ri], ids.length);
    const rand = seededRandom(deriveSeed(terrain.seed, 0x9a00 + ri * 131 + count));
    // 撒種子：最小間距由面積估計，撒不滿就逐步放寬
    let radius = Math.sqrt(ids.length * spacing * spacing / k) * 0.8;
    let picked: number[] = [];
    for (let round = 0; round < 16 && picked.length < k; round++) {
      picked = [];
      for (let t = 0; t < k * 120 && picked.length < k; t++) {
        const c = cells[ids[Math.floor(rand() * ids.length)]];
        if (picked.every((p) => (cells[p].x - c.x) ** 2 + (cells[p].y - c.y) ** 2 > radius * radius)) picked.push(c.id);
      }
      radius *= 0.9;
    }
    while (picked.length < k) {
      const id = ids[Math.floor(rand() * ids.length)];
      if (!picked.includes(id)) picked.push(id);
    }
    const base = seeds.length;
    picked.forEach((s, i) => {
      seeds.push(s);
      region.push(ri);
      of[s] = base + i;
    });
    // 多源最短路：翻越高處的成本大，所以省界落在山脊
    const dist = new Map<number, number>();
    const heap = new MinHeap();
    for (const s of picked) {
      dist.set(s, 0);
      heap.push(0, s);
    }
    while (heap.size > 0) {
      const [d, a] = heap.pop();
      if (d > (dist.get(a) ?? Infinity)) continue;
      for (const b of cells[a].nb) {
        if (!terrain.land[b] || terrain.region[b] !== ri) continue;
        const len = Math.hypot(cells[a].x - cells[b].x, cells[a].y - cells[b].y);
        const nd = d + len * (1 + 3.2 * Math.max(0, Math.max(terrain.E[a], terrain.E[b]) - 0.5) + rand() * 0.25);
        if (nd < (dist.get(b) ?? Infinity)) {
          dist.set(b, nd);
          of[b] = of[a];
          heap.push(nd, b);
        }
      }
    }
    // 沒連到任何種子的格（孤島）：併入最近的省
    for (const id of ids) {
      if (of[id] >= 0) continue;
      let best = base;
      let bd = Infinity;
      picked.forEach((s, i) => {
        const q = (cells[s].x - cells[id].x) ** 2 + (cells[s].y - cells[id].y) ** 2;
        if (q < bd) {
          bd = q;
          best = base + i;
        }
      });
      of[id] = best;
    }
  });
  return { count: seeds.length, of, seeds, region };
}
