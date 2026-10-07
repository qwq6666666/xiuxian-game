import { describe, expect, it } from "vitest";
import { gameData } from "../src/data/load";
import { FACINGS, type Facing, QUICK_PILL, caveActive, hotspotsFor, turn } from "../src/ui/caveLogic";
import { living } from "./helpers";

describe("洞府四視角", () => {
  it("轉身：順時針與逆時針各轉四次回到原處", () => {
    for (const dir of ["left", "right"] as const) {
      let f: Facing = FACINGS[0];
      for (let i = 0; i < 4; i++) f = turn(f, dir);
      expect(f).toBe(FACINGS[0]);
    }
    expect(turn("front", "right")).toBe("right");
    expect(turn("front", "left")).toBe("left");
    expect(turn("left", "right")).toBe("front");
  });

  it("只有靜室背景（閉關）顯示洞府，外出歷練不顯示", () => {
    expect(caveActive(living(1, { schedule: "retreat" }))).toBe(true);
    expect(caveActive(living(1, { schedule: "adventure" }))).toBe(false);
  });

  it("每個朝向都有熱點，位置在視圖內，id 不重複", () => {
    const s = living(1);
    const ids = new Set<string>();
    for (const f of FACINGS) {
      const spots = hotspotsFor(s, gameData, f);
      expect(spots.length).toBeGreaterThan(0);
      for (const h of spots) {
        const [x, y, w, hgt] = h.rect;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(100);
        expect(y + hgt).toBeLessThanOrEqual(100);
        expect(ids.has(h.id)).toBe(false);
        ids.add(h.id);
      }
    }
  });

  it("丹瓶：有丹才能服，說明帶出剩餘數量", () => {
    const empty = hotspotsFor(living(1, { realmId: "lianqi" }), gameData, "right").find((h) => h.id === "pill")!;
    expect(empty.enabled).toBe(false);
    const have = hotspotsFor(living(1, { realmId: "lianqi", items: { [QUICK_PILL]: 2 } }), gameData, "right").find((h) => h.id === "pill")!;
    expect(have.enabled).toBe(true);
    expect(have.hint).toContain("2");
  });

  it("丹爐說明依有沒有在煉製而不同", () => {
    const idle = hotspotsFor(living(1), gameData, "left")[0];
    const brewing = hotspotsFor(living(1, { alchemy: { recipeId: "juqi_dan", progress: 0, paid: true } }), gameData, "left")[0];
    expect(idle.hint).not.toBe(brewing.hint);
  });
});

describe("洞府以外的第一人稱場景", () => {
  const settings = {
    road: living(1, { schedule: "adventure" }),
    market: living(1, { travel: { locationId: "market", targetId: null, totalMonths: 0, remainingMonths: 0, trail: ["market"] } }),
    ferry: living(1, { schedule: "wander" }),
  };
  it("山道、坊市、渡口各朝向都有熱點，位置在視圖內，id 在同一朝向內不重複", () => {
    for (const [name, s] of Object.entries(settings)) {
      for (const f of FACINGS) {
        const spots = hotspotsFor(s, gameData, f);
        expect(spots.length, `${name}/${f}`).toBeGreaterThan(0);
        expect(new Set(spots.map((h) => h.id)).size).toBe(spots.length);
        for (const h of spots) {
          const [x, y, w, hgt] = h.rect;
          expect(x, `${name}/${f}/${h.id}`).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + w).toBeLessThanOrEqual(100);
          expect(y + hgt).toBeLessThanOrEqual(100);
        }
      }
    }
  });
  it("坊市的攤位通往行囊頁；山道與渡口的前方可以運功", () => {
    expect(hotspotsFor(settings.market, gameData, "front")[0].action).toBe("market");
    expect(hotspotsFor(settings.road, gameData, "front")[0].action).toBe("focus");
    expect(hotspotsFor(settings.ferry, gameData, "front")[0].action).toBe("focus");
  });
  it("遊戲介面時任何背景都顯示第一人稱場景，經典介面只有靜室", () => {
    expect(caveActive(settings.road)).toBe(false);
    expect(caveActive(settings.road, true)).toBe(true);
  });
});
