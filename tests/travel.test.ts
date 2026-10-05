import { describe, expect, it } from "vitest";
import { createInitialState, startLife } from "../src/core/life";
import { deserialize, serialize } from "../src/core/save";
import { tick } from "../src/core/tick";
import { beginTravel, placesAt, regionRoute, routeTo } from "../src/core/travel";
import { travelMonths } from "../src/core/formulas";

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
