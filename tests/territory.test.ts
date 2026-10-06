import { describe, expect, it } from "vitest";
import { generateWorld, worldAt, worldFor } from "../src/core/world";
import { sectReach, territoriesAt, territoryAt } from "../src/core/territory";
import { fiefsFor } from "../src/core/fiefs";
import { gameData } from "../src/data/load";
import { validateMap } from "../src/data/validate";
import { createInitialState, startLife } from "../src/core/life";
import { eventAvailable } from "../src/core/events";
import { localSectInfluence } from "../src/core/travel";

describe("領土與宗門影響", () => {
  it("領土固定、涵蓋每個領的中心，且不消耗世局亂數", () => {
    const world = generateWorld(17);
    const fiefs = fiefsFor(world.seed, gameData);
    expect(territoriesAt(world, 50, gameData)).toEqual(territoriesAt(world, 50, gameData));
    const all = territoriesAt(world, 0, gameData);
    expect(all.length).toBe(fiefs.count);
    for (let i = 0; i < fiefs.count; i++) expect(territoryAt(all, fiefs.points[i]).fief).toBe(i);
  });

  it("每一世都有一次可在地圖上看見的國家擴張", () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(generateWorld(seed).changes.some((c) => c.kind === "merge"), `種子 ${seed}`).toBe(true);
    }
  });

  it("易手從一處領推進，六年後全部換色", () => {
    const world = generateWorld(17);
    const fiefs = fiefsFor(world.seed, gameData);
    const fief = fiefs.ids.findIndex((id, i) => id !== world.polities.find((p) => p.id === world.owners[id])!.seat && fiefs.nb[i].some((j) => world.owners[fiefs.ids[j]] !== world.owners[id]));
    const from = world.owners[fiefs.ids[fief]];
    const to = fiefs.nb[fief].map((j) => world.owners[fiefs.ids[j]]).find((o) => o !== from)!;
    world.changes = [{ kind: "owner", age: 40, fiefs: [fiefs.ids[fief]], to, note: "邊界易手。" }];
    const before = territoriesAt(world, 39, gameData)[fief];
    const during = territoriesAt(world, 40, gameData)[fief];
    const after = territoriesAt(world, 46, gameData)[fief];
    expect(before.ownerId).toBe(from);
    expect(before.contested).toBe(false);
    expect(during.ownerId).toBe(from);
    expect(during.contested).toBe(true);
    expect(after.ownerId).toBe(to);
    expect(after.contested).toBe(false);
  });

  it("宗門興衰改變影響半徑，閉山後不再顯示範圍", () => {
    const sect = generateWorld(17).sects[0];
    expect(sectReach({ ...sect, state: "prosper" }, gameData)).toBeGreaterThan(sectReach({ ...sect, state: "stable" }, gameData));
    expect(sectReach({ ...sect, state: "decline" }, gameData)).toBeLessThan(sectReach({ ...sect, state: "stable" }, gameData));
    expect(sectReach({ ...sect, state: "closed" }, gameData)).toBe(0);
  });

  it("進入開放宗門的靈脈範圍才開放當地見聞", () => {
    const state = startLife(createInitialState(4));
    const sect = worldAt(worldFor(state.worldSeed, gameData, state.nationCount), Math.floor(state.ageMonths / 12)).sects.find((s) => sectReach(s, gameData) > 0)!;
    const nearby = { ...state, realmId: "lianqi", travel: { ...state.travel, locationId: `sect:${sect.id}` } };
    const event = gameData.events.find((e) => e.id === "sect_vein_001")!;
    expect(localSectInfluence(nearby)).toBe(true);
    expect(eventAvailable(nearby, event)).toBe(true);
  });

  it("領的設定指出具體欄位錯誤", () => {
    const raw = JSON.parse(JSON.stringify(gameData.map));
    raw.fiefRules.count = 5;
    expect(() => validateMap(raw)).toThrow("fiefRules");
    const raw2 = JSON.parse(JSON.stringify(gameData.map));
    raw2.nations.default = 99;
    expect(() => validateMap(raw2)).toThrow("default");
  });
});
