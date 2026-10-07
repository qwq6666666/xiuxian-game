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
