import { describe, expect, it } from "vitest";
import { generateWorld } from "../src/core/world";
import type { World } from "../src/core/world";
import { territoriesAt, territoryForPoint, territoryPolygon } from "../src/core/territory";
import { ageQuarters, frontLines, polityStrength, powerCell, regionFight, territoryGeometryAt, territoryHistory, type GeoCell } from "../src/core/frontier";
import { routeTo } from "../src/core/travel";
import { gameData } from "../src/data/load";
import { validateMap } from "../src/data/validate";
import { createInitialState, startLife } from "../src/core/life";
import type { Point } from "../src/data/types";

const data = gameData;
const BOX = data.map.viewBox;

/** 把只含 M／C／L／Z（絕對座標）的 SVG path 攤平成多邊形 */
function flatten(d: string): Point[] {
  const tokens = d.match(/[MCLZ]|-?\d+(?:\.\d+)?/g)!;
  const pts: Point[] = [];
  let i = 0;
  let cur: Point = [0, 0];
  let cmd = "";
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MCLZ]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "Z") break;
    if (cmd === "M" || cmd === "L") {
      cur = [num(), num()];
      pts.push(cur);
    } else if (cmd === "C") {
      const [p1, p2, p3]: Point[] = [[num(), num()], [num(), num()], [num(), num()]];
      for (let s = 1; s <= 12; s++) {
        const t = s / 12;
        const u = 1 - t;
        pts.push([
          u ** 3 * cur[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
          u ** 3 * cur[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        ]);
      }
      cur = p3;
    }
  }
  return pts;
}

function inside(poly: Point[], p: Point): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function area(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

const landShapes = data.map.regions.filter((r) => r.land).map((r) => ({ id: r.id, poly: flatten(r.path) }));
const regionAt = (p: Point) => landShapes.find((s) => inside(s.poly, p))?.id;

/** 手工世界：把一次易手放在指定年齡 */
function withChange(change: World["changes"][number]): World {
  const world = generateWorld(17);
  return { ...world, changes: [change] };
}

const ownedArea = (cells: GeoCell[], owner: string, region: string) =>
  cells.filter((c) => c.region === region && c.ownerId === owner).reduce((n, c) => n + area(c.polygon), 0);

describe("疆界流變：加權 Voronoi", () => {
  it("權重全等時等於一般 Voronoi", () => {
    const region = data.map.regions.find((r) => r.id === "north")!;
    const sites = region.nodes!.map((center) => ({ center, weight: 0 }));
    const plain = territoryPolygon(sites[0].center, region.nodes!.slice(1), BOX);
    const { polygon } = powerCell(sites[0], sites.slice(1).map((site, i) => ({ site, index: i + 1 })), BOX);
    expect(polygon.length).toBe(plain.length);
    polygon.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(plain[i][0], 6);
      expect(p[1]).toBeCloseTo(plain[i][1], 6);
    });
  });

  it("權重大的格往外推，邊界向弱者平移", () => {
    const a = { center: [100, 100] as Point, weight: 0 };
    const b = { center: [200, 100] as Point, weight: 0 };
    const even = area(powerCell(a, [{ site: b, index: 1 }], BOX).polygon);
    const heavy = area(powerCell({ ...a, weight: 3000 }, [{ site: b, index: 1 }], BOX).polygon);
    const light = area(powerCell({ ...a, weight: -3000 }, [{ site: b, index: 1 }], BOX).polygon);
    expect(heavy).toBeGreaterThan(even);
    expect(light).toBeLessThan(even);
    // 邊界位置：x = (|b|²−|a|² + w)/(2(bx−ax)) 的平移量
    const cell = powerCell({ ...a, weight: 3000 }, [{ site: b, index: 1 }], BOX).polygon;
    expect(Math.max(...cell.map((p) => p[0]))).toBeCloseTo(150 + 3000 / (2 * 100), 6);
  });
});

describe("疆界流變：幾何", () => {
  const world = generateWorld(17);

  it("同種子同季兩次結果完全相同，也與記憶體快取無關", () => {
    const a = territoryGeometryAt(world, 200, data);
    const fresh = territoryGeometryAt(generateWorld(17), 200, data);
    expect(fresh.map((c) => c.polygon)).toEqual(a.map((c) => c.polygon));
    expect(territoryGeometryAt(world, 200, data)).toBe(a);
  });

  it("所有格涵蓋整個地圖框、互不重疊；極北荒原不參與", () => {
    const cells = territoryGeometryAt(world, 200, data);
    expect(cells.every((c) => c.region !== "beihuang")).toBe(true);
    const total = cells.reduce((n, c) => n + area(c.polygon), 0);
    expect(total).toBeCloseTo(BOX[0] * BOX[1], 3);
    for (let x = 31; x < BOX[0]; x += 13) {
      for (let y = 7; y < BOX[1]; y += 11) {
        const hits = cells.filter((c) => inside(c.polygon, [x, y])).length;
        expect(hits, `(${x},${y})`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("沒有推進與擺動時，國界大致貼著原本的地域輪廓", () => {
    const calm = { ...world, changes: [] };
    const cells = territoryGeometryAt(calm, 0, data, { drift: false });
    let total = 0;
    let match = 0;
    for (let x = 30; x < BOX[0]; x += 4) {
      for (let y = 90; y < BOX[1]; y += 4) {
        const region = regionAt([x, y]);
        if (!region) continue;
        total++;
        if (cells.find((c) => inside(c.polygon, [x, y]))?.region === region) match++;
      }
    }
    expect(match / total).toBeGreaterThan(0.9);
  });

  it("三種易手：推進中有交戰、進度到 1 時全換成新主", () => {
    const owners = world.owners;
    const other = Object.values(owners).find((o) => o !== owners.north)!;
    const created = { id: "p_new", name: "新國", tribal: false, color: "#8fb573", capital: "新都" };
    const mergeFrom = owners.north;
    const cases: { change: World["changes"][number]; region: string; to: string }[] = [
      { change: { kind: "owner", age: 40, region: "north", to: other, note: "易手。" }, region: "north", to: other },
      { change: { kind: "merge", age: 40, from: mergeFrom, to: other, note: "併國。" }, region: "north", to: other },
      { change: { kind: "split", age: 40, polity: owners.north, region: "north", created, note: "分裂。" }, region: "north", to: created.id },
    ];
    for (const { change, region, to } of cases) {
      const w = withChange(change);
      const before = territoryGeometryAt(w, 39 * 4, data, { drift: false }).filter((c) => c.region === region);
      const during = territoryGeometryAt(w, 42 * 4, data, { drift: false }).filter((c) => c.region === region);
      const after = territoryGeometryAt(w, 46 * 4, data, { drift: false }).filter((c) => c.region === region);
      expect(before.every((c) => !c.fight && c.ownerId === owners.north), change.kind).toBe(true);
      expect(during.some((c) => c.fight), change.kind).toBe(true);
      expect(during.some((c) => c.ownerId === to) && during.some((c) => c.ownerId === owners.north), change.kind).toBe(true);
      expect(after.every((c) => c.ownerId === to && !c.fight), change.kind).toBe(true);
      expect(regionFight(territoryGeometryAt(w, 42 * 4, data), region)?.attacker).toBe(to);
    }
  });

  it("推進期間進攻方在該地域的面積單調不減", () => {
    const to = Object.values(world.owners).find((o) => o !== world.owners.north)!;
    const w = withChange({ kind: "owner", age: 40, region: "north", to, note: "易手。" });
    let last = -1;
    for (let q = 40 * 4; q <= 47 * 4; q++) {
      const a = ownedArea(territoryGeometryAt(w, q, data, { drift: false }), to, "north");
      expect(a, `第 ${q} 季`).toBeGreaterThanOrEqual(last - 1e-6);
      last = a;
    }
    // 進度 1 時與靜態分割相同：所有權重都回到基準
    const settled = territoryGeometryAt(w, 46 * 4, data, { drift: false });
    const plain = territoryGeometryAt({ ...w, owners: { ...w.owners, north: to }, changes: [] }, 0, data, { drift: false });
    expect(settled.map((c) => c.polygon)).toEqual(plain.map((c) => c.polygon));
  });

  it("相鄰兩季，任一頂點位移不超過上限", () => {
    const to = Object.values(world.owners).find((o) => o !== world.owners.center)!;
    const w = withChange({ kind: "owner", age: 40, region: "center", to, note: "易手。" });
    for (let q = 39 * 4; q < 48 * 4; q++) {
      const a = territoryGeometryAt(w, q, data);
      const b = territoryGeometryAt(w, q + 1, data);
      a.forEach((cell, i) => {
        // 以格的頂點對最近的新頂點量位移
        for (const p of cell.polygon) {
          const d = Math.min(...b[i].polygon.map((n) => Math.hypot(n[0] - p[0], n[1] - p[1])));
          expect(d, `${cell.id} 第 ${q} 季`).toBeLessThanOrEqual(data.map.territoryRules.maxVertexStep);
        }
      });
    }
  });

  it("和平拉鋸只改畫面，不改所屬與判定", () => {
    const cells = territoryGeometryAt(world, 300, data, { drift: true });
    const still = territoryGeometryAt(world, 300, data, { drift: false });
    expect(cells.map((c) => c.ownerId)).toEqual(still.map((c) => c.ownerId));
    expect(cells.map((c) => c.polygon)).not.toEqual(still.map((c) => c.polygon));
    // 判定層不看幾何
    let state = startLife(createInitialState(4));
    state = { ...state, ageMonths: 300 * 3 };
    const before = territoriesAt(generateWorld(state.worldSeed), 75, data).map((t) => [t.id, t.ownerId, t.contested]);
    territoryGeometryAt(generateWorld(state.worldSeed), 300, data);
    expect(territoriesAt(generateWorld(state.worldSeed), 75, data).map((t) => [t.id, t.ownerId, t.contested])).toEqual(before);
    expect(routeTo(state, "village", data)).toEqual(routeTo(state, "village", data));
    expect(territoryForPoint(territoriesAt(world, 75, data), "north", [100, 100])).toBeDefined();
  });

  it("單次計算夠快（已有 memo 時不重算）", () => {
    const w = generateWorld(23);
    const t0 = performance.now();
    territoryGeometryAt(w, 123, data);
    expect(performance.now() - t0).toBeLessThan(50);
    const t1 = performance.now();
    territoryGeometryAt(w, 123, data);
    expect(performance.now() - t1).toBeLessThan(1);
  });

  it("季量化", () => {
    expect(ageQuarters(0)).toBe(0);
    expect(ageQuarters(11)).toBe(3);
    expect(ageQuarters(12)).toBe(4);
  });
});

describe("疆界流變：查詢", () => {
  const world = generateWorld(17);

  it("frontLines 只回不同國家之間的邊，交戰邊標示出來", () => {
    const to = Object.values(world.owners).find((o) => o !== world.owners.north)!;
    const w = withChange({ kind: "owner", age: 40, region: "north", to, note: "易手。" });
    const lines = frontLines(territoryGeometryAt(w, 42 * 4, data, { drift: false }));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.ownerA !== l.ownerB)).toBe(true);
    expect(lines.some((l) => l.fighting)).toBe(true);
    const calm = frontLines(territoryGeometryAt({ ...world, changes: [] }, 0, data, { drift: false }));
    expect(calm.every((l) => !l.fighting)).toBe(true);
  });

  it("territoryHistory 依序列出到目前為止的國界變化", () => {
    const merge = world.changes.find((c) => c.kind === "merge")!;
    const all = territoryHistory(world, data, 200);
    expect(all.some((e) => e.kind === "merge" && e.age === merge.age)).toBe(true);
    expect(all.every((e, i) => i === 0 || all[i - 1].age <= e.age)).toBe(true);
    expect(territoryHistory(world, data, merge.age - 1).every((e) => e.age < merge.age)).toBe(true);
    const e = all.find((x) => x.kind === "merge")!;
    expect(e.from).not.toBe(e.to);
    expect(e.regionName.length).toBeGreaterThan(0);
  });

  it("polityStrength：持有地域越多國勢越高，近年得地加分", () => {
    const to = Object.values(world.owners).find((o) => o !== world.owners.north)!;
    const w = withChange({ kind: "owner", age: 40, region: "north", to, note: "易手。" });
    const before = polityStrength(w, 39, data)[to];
    const after = polityStrength(w, 41, data)[to];
    expect(after.regions).toBe(before.regions + 1);
    expect(after.recent).toBe(before.recent + 1);
    expect(after.score).toBeGreaterThan(before.score);
    expect(polityStrength(w, 60, data)[to].recent).toBe(0);
  });
});

describe("疆界流變：資料檢查", () => {
  it("節點與新規則的錯誤指出具體欄位", () => {
    const raw = JSON.parse(JSON.stringify(data.map));
    raw.regions.find((r: { id: string }) => r.id === "west").nodes[2] = [999, 0];
    expect(() => validateMap(raw)).toThrow("nodes[2]");
    const few = JSON.parse(JSON.stringify(data.map));
    few.regions.find((r: { id: string }) => r.id === "west").nodes = [[10, 10]];
    expect(() => validateMap(few)).toThrow("nodes");
    const rules = JSON.parse(JSON.stringify(data.map));
    delete rules.territoryRules.frontWeight;
    expect(() => validateMap(rules)).toThrow("frontWeight");
  });
});

describe("天下圖地點命名", () => {
  it("併國後被併地域保留原有城名，不會出現兩個同名都城；分號帶地域名", async () => {
    const { placesAt } = await import("../src/core/travel");
    for (let seed = 1; seed <= 40; seed++) {
      let state = startLife(createInitialState(seed));
      state = { ...state, ageMonths: 80 * 12 };
      const places = placesAt(state, data);
      const capitals = places.filter((p) => p.kind === "capital").map((p) => p.name);
      expect(new Set(capitals).size, `種子 ${seed}`).toBe(capitals.length);
      const branches = places.filter((p) => p.id.startsWith("branch:")).map((p) => p.name);
      expect(new Set(branches).size).toBe(branches.length);
    }
  });
});
