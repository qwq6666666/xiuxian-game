import { describe, expect, it } from "vitest";
import { generateWorld } from "../src/core/world";
import type { World } from "../src/core/world";
import { territoriesAt } from "../src/core/territory";
import { ageQuarters, polityStrength, regionFight, territoryHistory, territoryMapAt } from "../src/core/frontier";
import { provinceQuota, provincesFor } from "../src/core/provinces";
import { terrainFor } from "../src/core/terrain";
import { placesAt } from "../src/core/travel";
import { gameData } from "../src/data/load";
import { createInitialState, startLife } from "../src/core/life";

const data = gameData;
const T = data.map.territoryRules.transitionYears;

/** 手工世界：把一次易手放在指定年齡 */
function withChange(change: World["changes"][number]): World {
  return { ...generateWorld(17), changes: [change] };
}

function countOwned(map: ReturnType<typeof territoryMapAt>, terrain: ReturnType<typeof terrainFor>, polity: string, region: string): number {
  const ri = terrain.regionIds.indexOf(region);
  const pi = map.polityIds.indexOf(polity);
  let n = 0;
  for (const c of terrain.grid.cells) if (terrain.land[c.id] && terrain.region[c.id] === ri && map.owner[c.id] === pi) n++;
  return n;
}

function regionSize(terrain: ReturnType<typeof terrainFor>, region: string): number {
  const ri = terrain.regionIds.indexOf(region);
  let n = 0;
  for (const c of terrain.grid.cells) if (terrain.land[c.id] && terrain.region[c.id] === ri) n++;
  return n;
}

describe("疆界流變：歸屬", () => {
  const world = generateWorld(17);
  const terrain = terrainFor(world.seed, data);

  it("同種子同季兩次結果相同，且最近的結果會被記住", () => {
    const a = territoryMapAt(world, 200, data, terrain);
    expect(territoryMapAt(world, 200, data, terrain)).toBe(a);
    const again = territoryMapAt({ ...world }, 200, data, terrain);
    expect(Array.from(again.owner)).toEqual(Array.from(a.owner));
  });

  it("沒有易手與拉鋸時，每個陸地格的擁有者就是所屬地域的擁有者；海沒有擁有者", () => {
    const calm = { ...world, changes: [] };
    const map = territoryMapAt(calm, 0, data, terrain, { drift: false });
    for (const c of terrain.grid.cells) {
      if (!terrain.land[c.id]) expect(map.owner[c.id]).toBe(-1);
      else expect(map.polityIds[map.owner[c.id]]).toBe(world.owners[terrain.regionIds[terrain.region[c.id]]]);
    }
    expect(map.fights).toEqual([]);
  });

  it("三種易手：推進中有交戰與部分換主，進度到 1 全部換完；北方荒原不參與", () => {
    const owners = world.owners;
    const other = Object.values(owners).find((o) => o !== owners.north)!;
    const created = { id: "p_new", name: "新國", tribal: false, color: "#8fb573", capital: "新都" };
    const cases: { change: World["changes"][number]; to: string }[] = [
      { change: { kind: "owner", age: 40, region: "north", to: other, note: "易手。" }, to: other },
      { change: { kind: "merge", age: 40, from: owners.north, to: other, note: "併國。" }, to: other },
      { change: { kind: "split", age: 40, polity: owners.north, region: "north", created, note: "分裂。" }, to: created.id },
    ];
    for (const { change, to } of cases) {
      const w = withChange(change);
      const size = regionSize(terrain, "north");
      const before = territoryMapAt(w, 39 * 4, data, terrain, { drift: false });
      const during = territoryMapAt(w, 42 * 4, data, terrain, { drift: false });
      const after = territoryMapAt(w, 46 * 4, data, terrain, { drift: false });
      expect(countOwned(before, terrain, to, "north"), change.kind).toBe(0);
      expect(before.fights, change.kind).toEqual([]);
      const gained = countOwned(during, terrain, to, "north");
      expect(gained, change.kind).toBeGreaterThan(size * 0.3);
      expect(gained, change.kind).toBeLessThan(size * 0.7);
      expect(regionFight(during, "north")?.attacker, change.kind).toBe(to);
      expect(countOwned(after, terrain, to, "north"), change.kind).toBe(size);
      expect(after.fights, change.kind).toEqual([]);
    }
    expect(terrain.regionIds).not.toContain("beihuang");
  });

  it("推進期間進攻方面積單調不減，每季換主的格數有上限，且從相鄰方向開始", () => {
    const to = Object.values(world.owners).find((o) => o !== world.owners.center)!;
    const w = withChange({ kind: "owner", age: 40, region: "center", to, note: "易手。" });
    const size = regionSize(terrain, "center");
    let last = 0;
    for (let q = 40 * 4; q <= 47 * 4; q++) {
      const n = countOwned(territoryMapAt(w, q, data, terrain, { drift: false }), terrain, to, "center");
      expect(n, `第 ${q} 季`).toBeGreaterThanOrEqual(last);
      expect(n - last, `第 ${q} 季一次換太多格`).toBeLessThanOrEqual(Math.ceil(size / (T * 4)) + 1);
      last = n;
    }
    expect(last).toBe(size);
    // 剛開始換的格，至少有一個鄰格屬於進攻方相鄰的地域
    const early = territoryMapAt(w, 40 * 4 + 4, data, terrain, { drift: false });
    const adjacent = new Set((data.map.adjacency.center ?? []).filter((r) => world.owners[r] === to).map((r) => terrain.regionIds.indexOf(r)));
    const pi = early.polityIds.indexOf(to);
    const flipped = terrain.grid.cells.filter((c) => terrain.land[c.id] && terrain.region[c.id] === terrain.regionIds.indexOf("center") && early.owner[c.id] === pi);
    if (adjacent.size > 0) {
      expect(flipped.some((c) => c.nb.some((n) => terrain.land[n] && adjacent.has(terrain.region[n])))).toBe(true);
    }
  });

  it("和平拉鋸只改交界格的畫面歸屬，不改判定", () => {
    const calm = { ...world, changes: [] };
    const q = 300;
    const still = territoryMapAt(calm, q, data, terrain, { drift: false });
    const drifting = territoryMapAt(calm, q, data, terrain, { drift: true });
    let moved = 0;
    for (const c of terrain.grid.cells) {
      if (still.owner[c.id] === drifting.owner[c.id]) continue;
      moved++;
      // 被改的格一定在交界上
      expect(c.nb.some((n) => still.owner[n] >= 0 && still.owner[n] !== still.owner[c.id])).toBe(true);
    }
    expect(moved).toBeLessThan(terrain.grid.cells.length * 0.05);
    // 判定層不看幾何
    const before = territoriesAt(calm, 75, data).map((t) => [t.id, t.ownerId, t.contested]);
    territoryMapAt(calm, q, data, terrain);
    expect(territoriesAt(calm, 75, data).map((t) => [t.id, t.ownerId, t.contested])).toEqual(before);
  });

  it("季量化", () => {
    expect(ageQuarters(0)).toBe(0);
    expect(ageQuarters(11)).toBe(3);
    expect(ageQuarters(12)).toBe(4);
  });
});

describe("省", () => {
  const terrain = terrainFor(21, data);

  it("省數 30、60、100：總數正確、每個地域至少 2 省、每個陸地格恰屬於同地域的一省", () => {
    for (const count of [30, 60, 100]) {
      const p = provincesFor(terrain, data, count);
      expect(p.count, `${count}`).toBe(count);
      const perRegion = terrain.regionIds.map(() => 0);
      for (const r of p.region) perRegion[r]++;
      perRegion.forEach((n, i) => expect(n, `${count} ${terrain.regionIds[i]}`).toBeGreaterThanOrEqual(data.mapart.provinces.minPerRegion));
      for (const c of terrain.grid.cells) {
        if (!terrain.land[c.id]) expect(p.of[c.id]).toBe(-1);
        else expect(p.region[p.of[c.id]], `${count} 格 ${c.id}`).toBe(terrain.region[c.id]);
      }
    }
  });

  it("同樣的要求得到同一份結果（記憶）；超出範圍會被限制", () => {
    expect(provincesFor(terrain, data, 80)).toBe(provincesFor(terrain, data, 80));
    expect(provincesFor(terrain, data, 5).count).toBe(data.mapart.provinces.min);
    expect(provincesFor(terrain, data, 999).count).toBe(data.mapart.provinces.max);
  });

  it("名額依面積分配，總和等於要求", () => {
    const q = provinceQuota([100, 300, 600], 10, 2);
    expect(q.reduce((s, n) => s + n, 0)).toBe(10);
    expect(q[2]).toBeGreaterThan(q[0]);
    expect(provinceQuota([10, 10, 10], 6, 2)).toEqual([2, 2, 2]);
  });
});

describe("疆界流變：查詢", () => {
  const world = generateWorld(17);

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

describe("天下圖地點命名", () => {
  it("併國後被併地域保留原有城名，不會出現兩個同名都城；分號帶地域名", () => {
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
