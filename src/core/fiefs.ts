// 領：政治的最小單位（M51）。在邏輯座標的陸地上撒點，和地形格網無關，所以 sim 不必算地形。
// 國家由領組成，與地域（北西中東南）無關；地域只剩地理意義。
// 純函式：由世界種子決定，不進存檔、不消耗 rngSeed。
import type { GameData, Point } from "../data/types";
import { deriveSeed } from "./rng";
import { seededRandom } from "./noise";
import { distanceToPolygon, flattenPath, pointInPolygon } from "./shape";

export interface Fiefs {
  /** 世界種子 */
  seed: number;
  count: number;
  /** f0、f1… */
  ids: string[];
  /** 領的中心（邏輯座標） */
  points: Point[];
  /** 中心所在的地域 id */
  region: string[];
  /** 取樣面積（邏輯單位平方），只用來比較大小 */
  area: number[];
  /** 鄰領（索引），對稱、由小到大 */
  nb: number[][];
  /** 離某點最近的領 */
  indexAt(p: Point): number;
}

const FIEF_SALT = 53;
const memo: { seed: number; data: GameData; value: Fiefs }[] = [];

/** 這個世界種子的領。同種子同結果；記住最近 4 個。 */
export function fiefsFor(seed: number, data: GameData): Fiefs {
  const hit = memo.findIndex((m) => m.seed === seed && m.data === data);
  if (hit >= 0) {
    const [e] = memo.splice(hit, 1);
    memo.push(e);
    return e.value;
  }
  const value = buildFiefs(seed, data);
  memo.push({ seed, data, value });
  if (memo.length > 4) memo.shift();
  return value;
}

/** 與種子無關的陸地資料：取樣網格的陸地遮罩、各地域輪廓、留白夠的候選點。每份資料只算一次。 */
interface LandCache {
  lands: { id: string; poly: Point[] }[];
  step: number;
  cols: number;
  rows: number;
  /** 取樣格是否在陸地上 */
  mask: Uint8Array;
  /** 離外緣至少 margin 的陸地點（細網格） */
  safe: Point[];
}
const landCache = new WeakMap<GameData, LandCache>();

function landOf(data: GameData): LandCache {
  const hit = landCache.get(data);
  if (hit) return hit;
  const rules = data.map.fiefRules;
  const lands = data.map.regions.filter((r) => r.land).map((r) => ({ id: r.id, poly: flattenPath(r.path) }));
  const [W, H] = data.map.viewBox;
  const inLand = (p: Point): boolean => lands.some((l) => pointInPolygon(l.poly, p));
  const step = rules.step;
  const cols = Math.ceil(W / step);
  const rows = Math.ceil(H / step);
  const mask = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) mask[y * cols + x] = inLand([(x + 0.5) * step, (y + 0.5) * step]) ? 1 : 0;
  const safe: Point[] = [];
  const fine = Math.max(2, step / 2);
  for (let y = fine / 2; y < H; y += fine) {
    for (let x = fine / 2; x < W; x += fine) {
      const p: Point = [x, y];
      if (inLand(p) && Math.min(...lands.map((l) => distanceToPolygon(l.poly, p))) >= rules.margin) safe.push(p);
    }
  }
  const value = { lands, step, cols, rows, mask, safe };
  landCache.set(data, value);
  return value;
}

function buildFiefs(seed: number, data: GameData): Fiefs {
  const rules = data.map.fiefRules;
  const rand = seededRandom(deriveSeed(seed, FIEF_SALT));
  const { lands, mask, cols, rows, safe } = landOf(data);
  if (safe.length === 0) throw new Error("領：找不到陸地上的點，檢查地域輪廓");
  const candidate = (): Point => safe[Math.floor(rand() * safe.length)];

  // 最佳候選：每次抽幾個陸地點，取離已有點最遠的，點會分得均勻
  const points: Point[] = [candidate()];
  while (points.length < rules.count) {
    let best = candidate();
    let bd = -1;
    for (let k = 0; k < rules.candidates; k++) {
      const p = k === 0 ? best : candidate();
      const d = Math.min(...points.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    points.push(best);
  }
  const n = points.length;
  const indexAt = (p: Point): number => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (points[i][0] - p[0]) ** 2 + (points[i][1] - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };

  // 取樣網格：求面積與鄰接
  const step = rules.step;
  const grid = new Int16Array(cols * rows).fill(-1);
  const area = new Array<number>(n).fill(0);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!mask[y * cols + x]) continue;
      const f = indexAt([(x + 0.5) * step, (y + 0.5) * step]);
      grid[y * cols + x] = f;
      area[f] += step * step;
    }
  }
  const nbSet = Array.from({ length: n }, () => new Set<number>());
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = grid[y * cols + x];
      if (a < 0) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= cols || yy >= rows) continue;
        const b = grid[yy * cols + xx];
        if (b >= 0 && b !== a) {
          nbSet[a].add(b);
          nbSet[b].add(a);
        }
      }
    }
  }
  const regionOf = (p: Point): string => {
    const inside = lands.find((l) => pointInPolygon(l.poly, p));
    if (inside) return inside.id;
    return lands.reduce((best, l) => (distanceToPolygon(l.poly, p) < distanceToPolygon(best.poly, p) ? l : best)).id;
  };
  return {
    seed,
    count: n,
    ids: points.map((_, i) => `f${i}`),
    points,
    region: points.map(regionOf),
    area: area.map((a) => Math.max(a, step * step)),
    nb: nbSet.map((s) => [...s].sort((a, b) => a - b)),
    indexAt,
  };
}

/** 兩領中心的邏輯距離 */
export const fiefDistance = (f: Fiefs, a: number, b: number): number => Math.hypot(f.points[a][0] - f.points[b][0], f.points[a][1] - f.points[b][1]);

/**
 * 把領分給 nations 個國家：由遠點取樣選起點，面積小的國優先吞併相鄰領，每國連通。
 * 沒有相鄰關係的孤島領歸最近的國。回傳每個領的國家序號。
 */
export function partitionNations(f: Fiefs, nations: number, rng: () => number): number[] {
  const n = f.count;
  const owner = new Array<number>(n).fill(-1);
  const seeds: number[] = [Math.floor(rng() * n)];
  while (seeds.length < nations) {
    let best = -1;
    let bd = -1;
    for (let k = 0; k < 8; k++) {
      const c = Math.floor(rng() * n);
      if (seeds.includes(c)) continue;
      const d = Math.min(...seeds.map((s) => fiefDistance(f, s, c)));
      if (d > bd) {
        bd = d;
        best = c;
      }
    }
    if (best < 0) best = [...Array(n).keys()].find((i) => !seeds.includes(i))!;
    seeds.push(best);
  }
  const size = new Array<number>(nations).fill(0);
  seeds.forEach((s, i) => {
    owner[s] = i;
    size[i] += f.area[s];
  });
  const frontier = (k: number): number[] => {
    const out = new Set<number>();
    for (let i = 0; i < n; i++) if (owner[i] === k) for (const b of f.nb[i]) if (owner[b] < 0) out.add(b);
    return [...out].sort((a, b) => a - b);
  };
  for (;;) {
    const open = Array.from({ length: nations }, (_, k) => ({ k, fr: frontier(k) })).filter((x) => x.fr.length > 0);
    if (open.length === 0) break;
    // 面積越小越優先，保留一點隨機讓國有大有小
    const weights = open.map((x) => 1 / (size[x.k] + 400));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let pick = open[open.length - 1];
    for (let i = 0; i < open.length; i++) {
      r -= weights[i];
      if (r < 0) {
        pick = open[i];
        break;
      }
    }
    const fief = pick.fr[Math.floor(rng() * pick.fr.length)];
    owner[fief] = pick.k;
    size[pick.k] += f.area[fief];
  }
  for (let i = 0; i < n; i++) {
    if (owner[i] >= 0) continue;
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      if (owner[j] < 0) continue;
      const d = fiefDistance(f, i, j);
      if (d < bd) {
        bd = d;
        best = owner[j];
      }
    }
    owner[i] = best;
  }
  return owner;
}

/** 一組領的「國都領」：最靠近面積加權重心的領 */
export function seatOf(f: Fiefs, members: number[]): number {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const m of members) {
    sx += f.points[m][0] * f.area[m];
    sy += f.points[m][1] * f.area[m];
    sw += f.area[m];
  }
  const cx = sx / sw;
  const cy = sy / sw;
  let best = members[0];
  let bd = Infinity;
  for (const m of members) {
    const d = (f.points[m][0] - cx) ** 2 + (f.points[m][1] - cy) ** 2;
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}
