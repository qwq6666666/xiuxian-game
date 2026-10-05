import { describe, expect, it } from "vitest";
import { generateWorld, worldAt, worldFor } from "../src/core/world";
import { sectReach, territoriesAt, territoryForPoint, territoryPolygon } from "../src/core/territory";
import { gameData } from "../src/data/load";
import { validateMap } from "../src/data/validate";
import { createInitialState, startLife } from "../src/core/life";
import { eventAvailable } from "../src/core/events";
import { localSectInfluence } from "../src/core/travel";

describe("領土與宗門影響", () => {
  it("領土形狀固定、涵蓋中心點且不消耗世局亂數", () => {
    const region = gameData.map.regions.find((r) => r.id === "north")!;
    const polygon = territoryPolygon(region.territories![0], region.territories!.slice(1), gameData.map.viewBox);
    expect(polygon.length).toBeGreaterThan(2);
    const world = generateWorld(17);
    expect(territoriesAt(world, 50, gameData)).toEqual(territoriesAt(world, 50, gameData));
    expect(territoryForPoint(territoriesAt(world, 0, gameData), "north", region.territories![0])?.id).toBe("north:0");
  });

  it("每一世都有一次可在地圖上看見的國家擴張", () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(generateWorld(seed).changes.some((c) => c.kind === "merge"), `種子 ${seed}`).toBe(true);
    }
  });

  it("易手從一處領土推進，六年後全部換色", () => {
    const world = generateWorld(17);
    const from = world.owners.north;
    const to = world.owners.center;
    world.changes = [{ kind: "owner", age: 40, region: "north", to, note: "邊界易手。" }];
    const before = territoriesAt(world, 39, gameData).filter((t) => t.region === "north");
    const during = territoriesAt(world, 40, gameData).filter((t) => t.region === "north");
    const after = territoriesAt(world, 46, gameData).filter((t) => t.region === "north");
    expect(before.every((t) => t.ownerId === from && !t.contested)).toBe(true);
    expect(during.some((t) => t.ownerId === from)).toBe(true);
    expect(during.some((t) => t.ownerId === to && t.contested)).toBe(true);
    expect(after.every((t) => t.ownerId === to && !t.contested)).toBe(true);
  });

  it("宗門興衰改變影響半徑，閉山後不再顯示範圍", () => {
    const sect = generateWorld(17).sects[0];
    expect(sectReach({ ...sect, state: "prosper" }, gameData)).toBeGreaterThan(sectReach({ ...sect, state: "stable" }, gameData));
    expect(sectReach({ ...sect, state: "decline" }, gameData)).toBeLessThan(sectReach({ ...sect, state: "stable" }, gameData));
    expect(sectReach({ ...sect, state: "closed" }, gameData)).toBe(0);
  });

  it("進入開放宗門的靈脈範圍才開放當地見聞", () => {
    const state = startLife(createInitialState(4));
    const sect = worldAt(worldFor(state.worldSeed), Math.floor(state.ageMonths / 12)).sects.find((s) => sectReach(s, gameData) > 0)!;
    const nearby = { ...state, realmId: "lianqi", travel: { ...state.travel, locationId: `sect:${sect.id}` } };
    const event = gameData.events.find((e) => e.id === "sect_vein_001")!;
    expect(localSectInfluence(nearby)).toBe(true);
    expect(eventAvailable(nearby, event)).toBe(true);
  });

  it("領土資料指出具體欄位錯誤", () => {
    const raw = JSON.parse(JSON.stringify(gameData.map));
    raw.regions.find((r: { id: string }) => r.id === "north").territories[0] = [999, 0];
    expect(() => validateMap(raw)).toThrow("territories[0]");
  });
});
