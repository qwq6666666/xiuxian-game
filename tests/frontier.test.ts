import { describe, expect, it } from "vitest";
import { generateWorld } from "../src/core/world";
import type { World } from "../src/core/world";
import { territoriesAt } from "../src/core/territory";
import { fiefsFor } from "../src/core/fiefs";
import { ageQuarters, cellFiefs, fightOfCell, polityStrength, territoryHistory, territoryMapAt } from "../src/core/frontier";
import { provinceQuota, provincesFor } from "../src/core/provinces";
import { terrainFor } from "../src/core/terrain";
import { placesAt } from "../src/core/travel";
import { gameData } from "../src/data/load";
import { createInitialState, startLife } from "../src/core/life";

const data = gameData;
const T = data.map.territoryRules.transitionYears;

/** 手工世界：把一次易手放在指定年齡 */
function withChange(world: World, change: World["changes"][number]): World {
  return { ...world, changes: [change] };
}

/** 找一個靠近別國的邊界領：回傳它的索引、原擁有者與鄰國 */
function borderFief(world: World): { fief: number; from: string; to: string } {
  const fiefs = fiefsFor(world.seed, data);
  for (let i = 0; i < fiefs.count; i++) {
    const from = world.owners[fiefs.ids[i]];
    const seat = world.polities.find((p) => p.id === from)!.seat;
    if (fiefs.ids[i] === seat) continue;
    const other = fiefs.nb[i].map((j) => world.owners[fiefs.ids[j]]).find((o) => o !== from);
    if (other) return { fief: i, from, to: other };
  }
  throw new Error("找不到邊界領");
}

function cellsOf(world: World, terrain: ReturnType<typeof terrainFor>, fiefList: number[]): number[] {
  const cf = cellFiefs(terrain, data, fiefsFor(world.seed, data));
  return terrain.grid.cells.filter((c) => terrain.land[c.id] && fiefList.includes(cf[c.id])).map((c) => c.id);
}

function countOwned(map: ReturnType<typeof territoryMapAt>, cells: number[], polity: string): number {
  const pi = map.polityIds.indexOf(polity);
  return cells.filter((id) => map.owner[id] === pi).length;
}

describe("疆界流變：歸屬", () => {
  const world = generateWorld(17);
  const terrain = terrainFor(world.seed, data);
  const fiefs = fiefsFor(world.seed, data);

  it("同種子同季兩次結果相同，且最近的結果會被記住", () => {
    const a = territoryMapAt(world, 200, data, terrain);
    expect(territoryMapAt(world, 200, data, terrain)).toBe(a);
    const again = territoryMapAt({ ...world }, 200, data, terrain);
    expect(Array.from(again.owner)).toEqual(Array.from(a.owner));
  });

  it("沒有易手與拉鋸時，每個陸地格的擁有者就是所屬領的擁有者；海沒有擁有者", () => {
    const calm = { ...world, changes: [] };
    const map = territoryMapAt(calm, 0, data, terrain, { drift: false });
    const cf = cellFiefs(terrain, data, fiefs);
    for (const c of terrain.grid.cells) {
      if (!terrain.land[c.id]) expect(map.owner[c.id]).toBe(-1);
      else expect(map.polityIds[map.owner[c.id]]).toBe(world.owners[fiefs.ids[cf[c.id]]]);
    }
    expect(map.fights).toEqual([]);
  });

  it("三種易手：推進中有交戰與部分換主，進度到 1 全部換完", () => {
    const { fief, from, to } = borderFief(world);
    const created = { id: "p_new", name: "新國", tribal: false, color: "#8fb573", capital: "新都", seat: fiefs.ids[fief] };
    const mine = fiefs.ids.map((_, i) => i).filter((i) => world.owners[fiefs.ids[i]] === from && fiefs.ids[i] !== world.polities.find((p) => p.id === from)!.seat);
    const cases: { change: World["changes"][number]; to: string; set: number[] }[] = [
      { change: { kind: "owner", age: 40, fiefs: [fiefs.ids[fief]], to, note: "易手。" }, to, set: [fief] },
      { change: { kind: "merge", age: 40, from, to, note: "併國。" }, to, set: fiefs.ids.map((_, i) => i).filter((i) => world.owners[fiefs.ids[i]] === from) },
      { change: { kind: "split", age: 40, polity: from, fiefs: mine.slice(0, 2).map((i) => fiefs.ids[i]), created, note: "分裂。" }, to: created.id, set: mine.slice(0, 2) },
    ];
    for (const { change, to: target, set } of cases) {
      const w = withChange(world, change);
      const cells = cellsOf(w, terrain, set);
      const before = territoryMapAt(w, 39 * 4, data, terrain, { drift: false });
      const during = territoryMapAt(w, 40 * 4 + Math.floor(T * 2), data, terrain, { drift: false });
      const after = territoryMapAt(w, 47 * 4, data, terrain, { drift: false });
      expect(countOwned(before, cells, target), change.kind).toBe(0);
      expect(before.fights, change.kind).toEqual([]);
      const gained = countOwned(during, cells, target);
      expect(gained, change.kind).toBeGreaterThan(cells.length * 0.3);
      expect(gained, change.kind).toBeLessThan(cells.length * 0.7);
      expect(during.fights.length, change.kind).toBe(1);
      expect(during.fights[0].attacker, change.kind).toBe(target);
      expect(fightOfCell(during, cells[0])?.attacker, change.kind).toBe(target);
      expect(countOwned(after, cells, target), change.kind).toBe(cells.length);
      expect(after.fights, change.kind).toEqual([]);
    }
  });

  it("推進期間進攻方面積單調不減，每季換主的格數有上限，且從相鄰方向開始", () => {
    const { fief, to } = borderFief(world);
    const w = withChange(world, { kind: "owner", age: 40, fiefs: [fiefs.ids[fief]], to, note: "易手。" });
    const cells = cellsOf(w, terrain, [fief]);
    let last = 0;
    for (let q = 40 * 4; q <= 47 * 4; q++) {
      const n = countOwned(territoryMapAt(w, q, data, terrain, { drift: false }), cells, to);
      expect(n, `第 ${q} 季`).toBeGreaterThanOrEqual(last);
      expect(n - last, `第 ${q} 季一次換太多格`).toBeLessThanOrEqual(Math.ceil(cells.length / (T * 4)) + 1);
      last = n;
    }
    expect(last).toBe(cells.length);
    // 剛開始換的格，至少有一個鄰格本來就屬於進攻方
    const early = territoryMapAt(w, 40 * 4 + 6, data, terrain, { drift: false });
    const pi = early.polityIds.indexOf(to);
    const flipped = cells.filter((id) => early.owner[id] === pi);
    expect(flipped.length).toBeGreaterThan(0);
    expect(flipped.some((id) => terrain.grid.cells[id].nb.some((n) => terrain.land[n] && !cells.includes(n) && early.owner[n] === pi))).toBe(true);
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
    expect(e.fiefList.length).toBeGreaterThan(0);
  });

  it("polityStrength：持有領越多國勢越高，近年得地加分", () => {
    const { fief, to } = borderFief(world);
    const fiefs = fiefsFor(world.seed, data);
    const w = withChange(world, { kind: "owner", age: 40, fiefs: [fiefs.ids[fief]], to, note: "易手。" });
    const before = polityStrength(w, 39, data)[to];
    const after = polityStrength(w, 41, data)[to];
    expect(after.fiefs).toBe(before.fiefs + 1);
    expect(after.recent).toBe(before.recent + 1);
    expect(after.score).toBeGreaterThan(before.score);
    expect(polityStrength(w, 60, data)[to].recent).toBe(0);
  });
});

describe("天下圖地點命名", () => {
  it("併國後被併國的都城保留原有城名標舊都，不會出現兩個同名都城；分號帶地域名", () => {
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
