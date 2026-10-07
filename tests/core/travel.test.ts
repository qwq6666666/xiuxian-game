import { describe, expect, it } from "vitest";
import { createInitialState, startLife } from "../../src/core/life";
import { deserialize, serialize } from "../../src/core/save";
import { tick } from "../../src/core/tick";
import { beginTravel, placesAt, regionRoute, routeTo } from "../../src/core/world/travel";
import { travelMonths } from "../../src/core/formulas";
import { polityLabel, worldAt, worldFor } from "../../src/core/world/world";
import { gameData } from "../../src/data/load";

describe("天下圖旅行", () => {
  it("地域路線固定、月數隨跨域增加", () => {
    expect(regionRoute("west", "east")).toEqual(["west", "center", "east"]);
    expect(travelMonths(0)).toBe(2);
    expect(travelMonths(2)).toBe(10);
  });

  it("抵達宗門山門並記錄軌跡，途中照常修行且不額外消耗亂數", () => {
    const initial = { ...startLife(createInitialState(4)), autoChoice: true };
    const sect = placesAt(initial).find((place) => place.kind === "sect")!;
    const route = routeTo(initial, sect.id)!;
    const started = beginTravel(initial, sect.id);
    expect(started.travel.remainingMonths).toBe(route.months);
    expect(beginTravel(started, "market")).toBe(started);
    const finished = tick(started, route.months);
    const ordinary = tick(initial, route.months);
    expect(finished.travel.locationId).toBe(sect.id);
    expect(finished.travel.targetId).toBeNull();
    expect(finished.travel.trail).toEqual(["village", sect.id]);
    expect(finished.ageMonths).toBe(ordinary.ageMonths);
    expect(finished.rngSeed).toBe(ordinary.rngSeed);
    expect(finished.cultivation).toBe(ordinary.cultivation);
  });

  it("v12 存檔補出生地；v13 保留行程並指出壞掉的地點", () => {
    const initial = startLife(createInitialState(8));
    const old = JSON.parse(serialize(initial));
    old.version = 12;
    delete old.travel;
    expect(deserialize(JSON.stringify(old)).travel).toEqual(initial.travel);

    const underway = beginTravel(initial, "market");
    expect(deserialize(serialize(underway)).travel).toEqual(underway.travel);
    const invalid = JSON.parse(serialize(underway));
    invalid.travel.targetId = "sect:missing";
    expect(() => deserialize(JSON.stringify(invalid))).toThrow("travel.targetId");
  });
});

describe("諸部地域的旅行地點", () => {
  it("沒有都城的諸部不會產生空名稱或「都城」標籤，其餘地點名稱都不為空", () => {
    let tribalSeen = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const state = startLife(createInitialState(seed));
      const places = placesAt(state);
      for (const place of places) expect(place.name, `seed ${seed} ${place.id}`).not.toBe("");
      const world = worldFor(state.worldSeed, gameData, state.nationCount);
      const snap = worldAt(world, Math.floor(state.ageMonths / 12));
      for (const polity of snap.polities.filter((p) => p.tribal)) {
        tribalSeen++;
        const place = places.find((p) => p.id === `capital:${polity.id}`)!;
        expect(place.name).toBe(polityLabel(polity));
        expect(place.status).toBe("諸部聚居地");
      }
    }
    expect(tribalSeen).toBeGreaterThan(0);
  });
});
