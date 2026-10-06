// 地形與氣候：在維諾格網上生成陸地、高度、氣溫、濕度、河流與生態區。
// 只影響天下圖的顯示；由世界種子決定，不進存檔、不消耗 rngSeed。座標一律是顯示座標（橫向版面）。
import type { GameData, MapArtData, Point } from "../data/types";
import { genCells, type CellGrid } from "./cells";
import { MinHeap } from "./heap";
import { fromView, toView } from "./mapview";
import { clamp, fbm } from "./noise";
import { deriveSeed } from "./rng";
import { distanceToPolygon, flattenPath, Outline, pointInPolygon } from "./shape";

export interface Terrain {
  seed: number;
  grid: CellGrid;
  /** 陸地地域 id，region 欄位存的是這張表的索引 */
  regionIds: string[];
  land: Uint8Array;
  /** 每個陸地格所屬的地域索引，海是 -1 */
  region: Int8Array;
  /** 陸地格離海幾格、海格離陸地幾格 */
  dl: Int16Array;
  ds: Int16Array;
  E: Float32Array;
  T: Float32Array;
  M: Float32Array;
  /** 光暈邊緣用的雜訊 */
  hn: Float32Array;
  shade: Float32Array;
  /** 河的流向（下游格 id；-2 是流入海，-1 不在陸地） */
  dir: Int32Array;
  acc: Float32Array;
  lake: Uint8Array;
  biome: Uint8Array;
}

interface Shapes {
  outline: Outline;
  logical: { id: string; poly: Point[] }[];
  markers: Point[];
}

const shapesCache = new WeakMap<GameData, Shapes>();

function shapesOf(data: GameData): Shapes {
  const hit = shapesCache.get(data);
  if (hit) return hit;
  const lands = data.map.regions.filter((r) => r.land);
  const logical = lands.map((r) => ({ id: r.id, poly: flattenPath(r.path) }));
  const outline = new Outline(logical.map((l) => l.poly.map((p) => toView(data.map, p))));
  const markers: Point[] = [];
  for (const r of lands) {
    markers.push(r.capital!, ...r.sites!, ...r.ferries!, r.birth!.village, r.birth!.mountain);
  }
  const shapes = { outline, logical, markers: markers.map((p) => toView(data.map, p)) };
  shapesCache.set(data, shapes);
  return shapes;
}

/** 生態區：依高度、氣溫、濕度判定，回傳 mapart.biomes 的索引 */
export function biomeOf(e: number, t: number, m: number, b: MapArtData["biome"]): number {
  if (e > b.peak) return t < b.warmPeak ? 0 : 3;
  if (t < b.snowTemp) return 0;
  if (t < b.coldTemp) return m > b.coldWet ? 2 : 1;
  if (e > b.mountain) return 4;
  if (e > b.hill) return 5;
  if (t > b.hotTemp && m < b.dry) return 9;
  if (m > b.wet && t > b.wetTemp) return e < b.swampHeight ? 11 : 10;
  if (m > b.forestWet) return 6;
  if (m > b.grassWet) return 7;
  return 8;
}

/** 以邊緣最近的標記距離，讓雜訊在標記附近淡出，避免宗門與渡口被海岸雜訊吃掉 */
function nearestMarker(markers: Point[], x: number, y: number): number {
  let best = Infinity;
  for (const m of markers) best = Math.min(best, Math.hypot(m[0] - x, m[1] - y));
  return best;
}

function bfs(grid: CellGrid, sources: number[], allowed: (id: number) => boolean): Int16Array {
  const dist = new Int16Array(grid.cells.length).fill(-1);
  const queue: number[] = [];
  for (const s of sources) {
    dist[s] = 0;
    queue.push(s);
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (const n of grid.cells[c].nb) {
      if (dist[n] < 0 && allowed(n)) {
        dist[n] = dist[c] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

const MEMO_SIZE = 4;
const memo: { key: string; data: GameData; value: Terrain }[] = [];

/** 這一世的地形；同種子同格數的結果相同，最近 4 個留在記憶體 */
export function terrainFor(worldSeed: number, data: GameData, count: number = data.mapart.cells.count): Terrain {
  const key = `${worldSeed}:${count}`;
  const hit = memo.findIndex((m) => m.key === key && m.data === data);
  if (hit >= 0) {
    const [entry] = memo.splice(hit, 1);
    memo.push(entry);
    return entry.value;
  }
  const value = generate(worldSeed, data, count);
  memo.push({ key, data, value });
  if (memo.length > MEMO_SIZE) memo.shift();
  return value;
}

function generate(worldSeed: number, data: GameData, count: number): Terrain {
  const art = data.mapart;
  const [W, H] = data.map.view.size;
  const seed = deriveSeed(worldSeed, 0x7e11);
  const grid = genCells(deriveSeed(worldSeed, 0x7e12), clamp(count, art.cells.min, art.cells.max), [W, H], art.cells.jitter);
  const { cells } = grid;
  const N = cells.length;
  const shapes = shapesOf(data);
  const regionIds = shapes.logical.map((l) => l.id);

  // 陸地：到輪廓聯集的有符號距離加雜訊；標記附近雜訊淡出並強制為陸，離外框太近一律是海
  const land = new Uint8Array(N);
  for (const c of cells) {
    const { x, y } = c;
    const markerDist = nearestMarker(shapes.markers, x, y);
    const fade = clamp((markerDist - art.markerRadius) / 20, 0, 1);
    let sd = shapes.outline.signedDistance([x, y]);
    sd += ((fbm(x / 26, y / 26, seed + 101, 3) - 0.5) * art.coast.large + (fbm(x / 8, y / 8, seed + 202, 2) - 0.5) * art.coast.small) * fade;
    if (sd < -art.coast.islandNear && sd > -art.coast.islandFar) {
      sd = Math.max(sd, (fbm(x / 22, y / 22, seed + 303, 3) - art.coast.islandCutoff) * art.coast.islandStrength);
    }
    sd -= Math.max(0, art.edgeMargin - Math.min(x, W - x, y, H - y)) * art.coast.edgePenalty;
    if (markerDist <= art.markerRadius) sd = Math.max(sd, 1);
    land[c.id] = sd > 0 ? 1 : 0;
  }
  const seaIds: number[] = [];
  const landIds: number[] = [];
  for (const c of cells) (land[c.id] ? landIds : seaIds).push(c.id);
  const dl = bfs(grid, seaIds, (n) => land[n] === 1);
  const ds = bfs(grid, landIds, (n) => land[n] === 0);

  // 所屬地域（邏輯座標）：落在輪廓內就是該地域，輪廓外的島嶼歸最近的地域
  const region = new Int8Array(N).fill(-1);
  for (const id of landIds) {
    const p = fromView(data.map, [cells[id].x, cells[id].y]);
    let best = -1;
    let bd = Infinity;
    shapes.logical.forEach((l, k) => {
      const d = pointInPolygon(l.poly, p) ? -1 : distanceToPolygon(l.poly, p);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    region[id] = best;
  }

  // 高度、氣溫、濕度
  const E = new Float32Array(N);
  const T = new Float32Array(N);
  const M = new Float32Array(N);
  const hn = new Float32Array(N);
  const { relief: rl, climate: cl } = art;
  for (const id of landIds) {
    const { x, y } = cells[id];
    const inland = Math.max(0, dl[id]) * grid.spacing;
    const bias = rl.base + rl.slope * ((1 - y / H) * rl.north + (1 - x / W) * rl.west);
    const ridge = Math.pow(1 - Math.abs(2 * fbm(x / 55, y / 55, seed + 11, 4) - 1), rl.ridgeSharp);
    E[id] = clamp(Math.min(1, inland / rl.inlandRange) * rl.inlandWeight + ridge * rl.ridgeWeight * bias * Math.min(1, inland / rl.ridgeRamp) + (fbm(x / 17, y / 17, seed + 13, 3) - 0.5) * rl.detail + rl.floor, 0, 1.2);
    T[id] = clamp(1 - cl.coldGradient * (1 - y / H) + (fbm(x / 90, y / 90, seed + 17, 3) - 0.5) * cl.coldNoise - Math.max(0, E[id] - cl.chillStart) * cl.heightChill, 0, 1);
    M[id] = clamp(cl.base + cl.noise * fbm(x / 70, y / 70, seed + 19, 4) + cl.coast * Math.exp(-inland / cl.coastRange) + cl.south * (y / H) + cl.east * (x / W) + cl.wetOffset + (E[id] > 0.55 ? 0.05 : 0), 0, 1);
    hn[id] = fbm(x / 11, y / 11, seed + 707, 3);
  }
  // 相鄰格取平均，讓生態區連成片
  for (let pass = 0; pass < rl.smoothPasses; pass++) {
    for (const arr of [E, T, M]) {
      const copy = arr.slice();
      for (const id of landIds) {
        let sum = copy[id] * 2;
        let w = 2;
        for (const n of cells[id].nb) {
          if (land[n]) {
            sum += copy[n];
            w++;
          }
        }
        arr[id] = sum / w;
      }
    }
  }

  // 河流：從海邊優先洪填得到流向，再由高到低累積水量
  const EF = new Float32Array(N);
  for (const id of landIds) EF[id] = E[id] + (fbm(cells[id].x / 7, cells[id].y / 7, seed + 33, 3) - 0.5) * art.river.jitter;
  const dir = new Int32Array(N).fill(-1);
  const fill = new Float32Array(N);
  const seen = new Uint8Array(N);
  const order: number[] = [];
  const heap = new MinHeap();
  for (const id of landIds) {
    if (cells[id].nb.some((n) => !land[n])) {
      seen[id] = 1;
      fill[id] = EF[id];
      dir[id] = -2;
      heap.push(EF[id], id);
    }
  }
  while (heap.size > 0) {
    const [, i] = heap.pop();
    order.push(i);
    for (const j of cells[i].nb) {
      if (!land[j] || seen[j]) continue;
      seen[j] = 1;
      dir[j] = i;
      fill[j] = Math.max(EF[j], fill[i] + 1e-4);
      heap.push(fill[j], j);
    }
  }
  const acc = new Float32Array(N);
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    acc[i] += 0.5 + M[i];
    if (dir[i] >= 0) acc[dir[i]] += acc[i];
  }
  const lake = new Uint8Array(N);
  for (const id of landIds) {
    if (fill[id] - EF[id] > art.river.lakeFillDelta && acc[id] > art.river.lakeMinAccumulation && nearestMarker(shapes.markers, cells[id].x, cells[id].y) > art.markerRadius * 1.5) lake[id] = 1;
  }

  // 光影（光從西北來）與生態區
  const shade = new Float32Array(N);
  const biome = new Uint8Array(N);
  for (const id of landIds) {
    let best = -1;
    let bw = -2;
    for (const n of cells[id].nb) {
      const dx = cells[n].x - cells[id].x;
      const dy = cells[n].y - cells[id].y;
      const w = -(dx + dy) / Math.hypot(dx, dy);
      if (w > bw) {
        bw = w;
        best = n;
      }
    }
    shade[id] = clamp(((best >= 0 && land[best] ? E[best] : E[id]) - E[id]) * -3.2, -0.3, 0.3);
    biome[id] = biomeOf(E[id], T[id], M[id], art.biome);
  }
  return { seed, grid, regionIds, land, region, dl, ds, E, T, M, hn, shade, dir, acc, lake, biome };
}
