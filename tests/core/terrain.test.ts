import { describe, expect, it } from "vitest";
import { genCells } from "../../src/core/world/cells";
import { fromView, logicalDistance, toView } from "../../src/core/world/mapview";
import { seededRandom } from "../../src/core/util/noise";
import { Outline, flattenPath, pointInPolygon } from "../../src/core/world/shape";
import { biomeOf, terrainFor } from "../../src/core/world/terrain";
import { gameData } from "../../src/data/load";
import { validateMap, validateMapArt } from "../../src/data/validate";
import type { Point } from "../../src/data/types";

const data = gameData;
const [W, H] = data.map.view.size;
const SEEDS = [7, 21, 333, 9001, 123456789];

function area(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

describe("座標轉換", () => {
  it("toView 與 fromView 互為反函式，距離在邏輯座標上算", () => {
    const p: Point = [123.4, 56.7];
    const back = fromView(data.map, toView(data.map, p));
    expect(back[0]).toBeCloseTo(p[0], 9);
    expect(back[1]).toBeCloseTo(p[1], 9);
    const a = toView(data.map, [100, 100]);
    const b = toView(data.map, [100, 200]);
    expect(logicalDistance(data.map, a, b)).toBeCloseTo(100, 9);
    // 顯示座標下的直線距離與邏輯距離不同
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).not.toBeCloseTo(100, 1);
  });

  it("view 設定的錯誤指出欄位", () => {
    const bad = JSON.parse(JSON.stringify(data.map));
    bad.view.scale = [3, 3];
    expect(() => validateMap(bad)).toThrow("view");
    const worse = JSON.parse(JSON.stringify(data.map));
    delete worse.view;
    expect(() => validateMap(worse)).toThrow("view");
  });
});

describe("輪廓幾何", () => {
  it("攤平 path 並判斷內外；聯集外緣的有符號距離正負正確", () => {
    const polys = data.map.regions.filter((r) => r.land).map((r) => flattenPath(r.path).map((p) => toView(data.map, p)));
    expect(polys.every((p) => p.length > 20)).toBe(true);
    const outline = new Outline(polys);
    const capital = toView(data.map, data.map.regions.find((r) => r.id === "center")!.capital!);
    expect(outline.contains(capital)).toBe(true);
    expect(outline.signedDistance(capital)).toBeGreaterThan(10);
    expect(outline.signedDistance([5, 5])).toBeLessThan(-20);
    // 相鄰地域共用的邊不算外緣：中部與東方交界附近的點離外緣仍然很遠
    const border = toView(data.map, [262, 250]);
    expect(pointInPolygon(polys[2], border) || pointInPolygon(polys[3], border)).toBe(true);
    expect(outline.signedDistance(border)).toBeGreaterThan(20);
  });

  it("不支援的 path 指令直接報錯", () => {
    expect(() => flattenPath("M0,0 Q1,1 2,2 Z")).toThrow("只支援");
  });
});

describe("維諾格網", () => {
  const grid = genCells(5, 3500, [W, H], 0.85);

  it("格數接近要求、涵蓋整個地圖框、互不重疊", () => {
    expect(grid.cells.length).toBeGreaterThan(3200);
    expect(grid.cells.length).toBeLessThan(4100);
    const total = grid.cells.reduce((s, c) => s + area(c.poly), 0);
    expect(total).toBeCloseTo(W * H, 1);
  });

  it("鄰格表對稱，locate 找到的是最近的格心", () => {
    for (const c of grid.cells) for (const n of c.nb) expect(grid.cells[n].nb).toContain(c.id);
    const rand = seededRandom(9);
    for (let k = 0; k < 400; k++) {
      const x = rand() * W;
      const y = rand() * H;
      const id = grid.locate(x, y);
      let best = -1;
      let bd = Infinity;
      for (const c of grid.cells) {
        const q = (c.x - x) ** 2 + (c.y - y) ** 2;
        if (q < bd) {
          bd = q;
          best = c.id;
        }
      }
      expect(id).toBe(best);
    }
    expect(grid.locate(-1, 5)).toBe(-1);
  });

  it("同種子同結果", () => {
    const again = genCells(5, 3500, [W, H], 0.85);
    expect(again.cells.map((c) => c.poly)).toEqual(grid.cells.map((c) => c.poly));
  });
});

describe("地形與氣候", () => {
  it("同種子兩次生成（含重新生成）結果完全相同；最近的結果會被記住", () => {
    const a = terrainFor(77, data);
    expect(terrainFor(77, data)).toBe(a);
    const fresh = terrainFor(77, { ...data });
    expect(Array.from(fresh.land)).toEqual(Array.from(a.land));
    expect(Array.from(fresh.E)).toEqual(Array.from(a.E));
    expect(Array.from(fresh.acc)).toEqual(Array.from(a.acc));
  });

  it("不同種子的地形不同", () => {
    const a = terrainFor(1, data);
    const b = terrainFor(2, data);
    expect(Array.from(a.land)).not.toEqual(Array.from(b.land));
  });

  it("陸地與小島離外框有留白，沒有任何陸地格碰到外框", () => {
    for (const seed of SEEDS) {
      const t = terrainFor(seed, data);
      let min = Infinity;
      for (const c of t.grid.cells) {
        if (!t.land[c.id]) continue;
        expect(c.nbEdge.includes(-1), `種子 ${seed} 格 ${c.id} 碰到外框`).toBe(false);
        min = Math.min(min, c.x, W - c.x, c.y, H - c.y);
      }
      expect(min, `種子 ${seed}`).toBeGreaterThanOrEqual(data.mapart.edgeMargin - 6);
    }
  });

  it("宗門位置、渡口、都城、出生點都在陸地上、不在湖裡、離外框夠遠", () => {
    for (const seed of SEEDS) {
      const t = terrainFor(seed, data);
      for (const r of data.map.regions.filter((x) => x.land)) {
        const marks: [string, Point][] = [["capital", r.capital!], ["village", r.birth!.village], ["mountain", r.birth!.mountain]];
        r.sites!.forEach((p, i) => marks.push([`sites[${i}]`, p]));
        r.ferries!.forEach((p, i) => marks.push([`ferries[${i}]`, p]));
        for (const [name, p] of marks) {
          const v = toView(data.map, p);
          const id = t.grid.locate(v[0], v[1]);
          expect(id, `種子 ${seed} ${r.id} ${name}`).toBeGreaterThanOrEqual(0);
          expect(t.land[id], `種子 ${seed} ${r.id} ${name} 不在陸地`).toBe(1);
          expect(t.lake[id], `種子 ${seed} ${r.id} ${name} 在湖裡`).toBe(0);
          expect(Math.min(v[0], W - v[0], v[1], H - v[1]), `${r.id} ${name} 離外框太近`).toBeGreaterThanOrEqual(data.mapart.edgeMargin);
        }
      }
    }
  });

  it("每條河最終流入海，沒有迴圈", () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const t = terrainFor(seed, data);
      for (const c of t.grid.cells) {
        if (!t.land[c.id]) continue;
        let cur = c.id;
        let steps = 0;
        while (t.dir[cur] >= 0 && steps < t.grid.cells.length) {
          cur = t.dir[cur];
          steps++;
          expect(t.land[cur]).toBe(1);
        }
        expect(t.dir[cur], `種子 ${seed} 格 ${c.id} 的水沒有流到海`).toBe(-2);
      }
    }
  });

  it("每個陸地地域都有足夠的格；都城所在格屬於該地域", () => {
    const t = terrainFor(21, data);
    const count = t.regionIds.map(() => 0);
    for (const c of t.grid.cells) if (t.land[c.id]) count[t.region[c.id]]++;
    count.forEach((n, i) => expect(n, t.regionIds[i]).toBeGreaterThan(100));
    for (const r of data.map.regions.filter((x) => x.land)) {
      const v = toView(data.map, r.capital!);
      expect(t.regionIds[t.region[t.grid.locate(v[0], v[1])]]).toBe(r.id);
    }
  });

  it("生態區對任何高度、氣溫、濕度都有值，且北冷南暖、山高", () => {
    for (let e = 0; e <= 1.2; e += 0.1) for (let tt = 0; tt <= 1; tt += 0.1) for (let m = 0; m <= 1; m += 0.1) {
      const b = biomeOf(e, tt, m, data.mapart.biome);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(data.mapart.biomes.length);
    }
    const t = terrainFor(21, data);
    let north = 0;
    let south = 0;
    let nn = 0;
    let sn = 0;
    for (const c of t.grid.cells) {
      if (!t.land[c.id]) continue;
      if (c.y < H * 0.35) { north += t.T[c.id]; nn++; } else if (c.y > H * 0.65) { south += t.T[c.id]; sn++; }
    }
    expect(north / nn).toBeLessThan(south / sn);
  });

  it("效能：一次生成（含格網）在合理時間內", () => {
    const t0 = performance.now();
    terrainFor(555, { ...data });
    expect(performance.now() - t0).toBeLessThan(2500);
  });

  it("mapart 的錯誤指出欄位", () => {
    const raw = JSON.parse(JSON.stringify(data.mapart));
    raw.cells.count = 99999;
    expect(() => validateMapArt(raw)).toThrow("cells");
    const noBiome = JSON.parse(JSON.stringify(data.mapart));
    noBiome.biomes.pop();
    expect(() => validateMapArt(noBiome)).toThrow("biomes");
    const badColor = JSON.parse(JSON.stringify(data.mapart));
    badColor.biomes[3].color = [0, 0, 300];
    expect(() => validateMapArt(badColor)).toThrow("color");
    const missing = JSON.parse(JSON.stringify(data.mapart));
    delete missing.river.minAccumulation;
    expect(() => validateMapArt(missing)).toThrow("minAccumulation");
  });
});
