import { describe, expect, it } from "vitest";
import { buyItem } from "../src/core/actions";
import { marketDistanceMonths } from "../src/core/travel";
import { freightRate, itemFreight, itemPrice, priceBeforeFreight } from "../src/core/worldeffects";
import { gameData } from "../src/data/load";
import { formatLogEntry } from "../src/ui/format";
import { living } from "./helpers";

const data = gameData;
const at = (locationId: string, patch = {}) => living(1, { spiritStones: 1000, travel: { locationId, targetId: null, totalMonths: 0, remainingMonths: 0, trail: [locationId] }, ...patch });

describe("坊市運費（M63）", () => {
  it("在坊市與商行沒有運費，價格就是不含運費的價格", () => {
    for (const where of ["market", "merchantHq"]) {
      const s = at(where);
      expect(marketDistanceMonths(s, data)).toBe(0);
      expect(freightRate(s, data)).toBe(0);
      expect(itemFreight(s, "juqi_dan", data)).toBe(0);
      expect(itemPrice(s, "juqi_dan", data)).toBe(priceBeforeFreight(s, "juqi_dan", data));
    }
  });

  it("不在坊市：運費隨到最近坊市的月數增加，有上限，至少 1 靈石", () => {
    const village = at("village");
    const months = marketDistanceMonths(village, data);
    expect(months).toBeGreaterThan(0);
    expect(freightRate(village, data)).toBeCloseTo(Math.min(data.config.freightMax, months * data.config.freightPerMonth));
    expect(itemFreight(village, "juqi_dan", data)).toBeGreaterThanOrEqual(1);
    expect(itemPrice(village, "juqi_dan", data)).toBe(priceBeforeFreight(village, "juqi_dan", data) + itemFreight(village, "juqi_dan", data));
    const far = at("sect:" + data.map.regions.length); // 不存在的地點：視為沒有運費可算，不應丟錯
    expect(Number.isFinite(itemPrice(far, "juqi_dan", data))).toBe(true);
    const capped = { ...data, config: { ...data.config, freightPerMonth: 1, freightMax: 0.1 } };
    expect(freightRate(village, capped)).toBeCloseTo(0.1);
  });

  it("運費設為 0 就等於沒有運費", () => {
    const none = { ...data, config: { ...data.config, freightPerMonth: 0 } };
    const village = at("village");
    expect(itemPrice(village, "juqi_dan", none)).toBe(priceBeforeFreight(village, "juqi_dan", none));
  });

  it("買東西照含運費的價格扣靈石，並記下是行腳商送來的", () => {
    const village = at("village");
    const price = itemPrice(village, "juqi_dan", data);
    const bought = buyItem(village, "juqi_dan", data);
    expect(bought.spiritStones).toBe(village.spiritStones - price);
    const entry = bought.log.at(-1)!;
    expect(entry).toMatchObject({ kind: "buy", outcome: 1 });
    expect(formatLogEntry(entry, data, "我")).toMatch(/行腳商|託人|託/);
    const market = at("market");
    expect(buyItem(market, "juqi_dan", data).log.at(-1)!.outcome).toBeUndefined();
  });
});
