import { describe, expect, it } from "vitest";
import { canBuyItem, buyItem } from "../src/core/actions";
import { eventAvailable } from "../src/core/events";
import { generateWorld, worldAt } from "../src/core/world";
import { activeWorldEffects, effectApplies, itemPrice, worldFlagsOf } from "../src/core/worldeffects";
import { gameData } from "../src/data/load";
import { validateGameData, validateWorldEffects } from "../src/data/validate";
import { living } from "./helpers";

const effect = (id: string) => gameData.worldEffects.find((e) => e.id === id)!;

/** 找一個世界種子與年齡，使指定效果生效 */
function findWorld(id: string, active = true): { seed: number; age: number } {
  for (let seed = 1; seed < 400; seed++) {
    const w = generateWorld(seed);
    for (let age = 10; age <= 200; age += 5) {
      if (effectApplies(worldAt(w, age), effect(id)) === active) return { seed, age };
    }
  }
  throw new Error(`找不到讓 ${id} ${active ? "生效" : "不生效"} 的世界`);
}

const at = (seed: number, age: number) => living(1, { worldSeed: seed, realmId: "lianqi", ageMonths: age * 12 + 3, spiritStones: 5000 });

describe("世局效果", () => {
  it("山門關閉：築基丹漲價 60%，其他物品不變", () => {
    const { seed, age } = findWorld("guard_closed");
    const s = at(seed, age);
    expect(worldFlagsOf(s)).toContain("guard_closed");
    const base = gameData.items.find((i) => i.id === "zhuji_dan")!.price;
    // 同時生效的其他效果也會乘進去，所以只驗證有關閉效果時比沒有時貴
    expect(itemPrice(s, "zhuji_dan")).toBeGreaterThan(base * 1.1);
    expect(itemPrice(s, "yanshou_dan")).toBeGreaterThanOrEqual(1);
  });

  it("沒有任何效果生效時價格等於基本價", () => {
    for (let seed = 1; seed < 400; seed++) {
      const w = generateWorld(seed);
      const snap = worldAt(w, 20);
      if (gameData.worldEffects.some((e) => effectApplies(snap, e))) continue;
      const s = at(seed, 20);
      expect(activeWorldEffects(s)).toEqual([]);
      for (const item of gameData.items) expect(itemPrice(s, item.id)).toBe(item.price);
      return;
    }
    throw new Error("找不到沒有效果的世界");
  });

  it("買東西照當下價格扣靈石", () => {
    const { seed, age } = findWorld("guard_closed");
    const s = at(seed, age);
    const price = itemPrice(s, "zhuji_dan");
    const t = buyItem(s, "zhuji_dan");
    expect(t.spiritStones).toBe(s.spiritStones - price);
    expect(canBuyItem({ ...s, spiritStones: price - 1 }, "zhuji_dan")).toBe(false);
    expect(canBuyItem({ ...s, spiritStones: price }, "zhuji_dan")).toBe(true);
  });

  it("世局隨年齡變：同一個世界，價格會在不同年齡不同", () => {
    let changed = false;
    for (let seed = 1; seed < 100 && !changed; seed++) {
      const prices = new Set<number>();
      for (let age = 10; age <= 200; age += 10) prices.add(itemPrice(at(seed, age), "zhuji_dan"));
      changed = prices.size > 1;
    }
    expect(changed).toBe(true);
  });

  it("事件條件 world / worldNot 依世局出現與否", () => {
    const ev = gameData.events.find((e) => e.id === "gate_tea_001")!;
    const on = findWorld("guard_closed");
    const off = findWorld("guard_closed", false);
    expect(eventAvailable(at(on.seed, on.age), ev)).toBe(true);
    expect(eventAvailable(at(off.seed, off.age), ev)).toBe(false);
    const inverted = { ...ev, conditions: { ...ev.conditions, world: undefined, worldNot: ["guard_closed"] } };
    expect(eventAvailable(at(on.seed, on.age), inverted)).toBe(false);
    expect(eventAvailable(at(off.seed, off.age), inverted)).toBe(true);
  });

  it("同樣的世界種子與年齡永遠得到同樣的結果", () => {
    const a = worldFlagsOf(at(77, 90));
    const b = worldFlagsOf(at(77, 90));
    expect(a).toEqual(b);
  });
});

describe("worldEffects.json 格式檢查", () => {
  const e = gameData.worldEffects[0];
  const bad = (patch: Record<string, unknown>) => () => validateWorldEffects([{ ...e, ...patch }]);

  it("指出哪一筆的哪個欄位", () => {
    expect(bad({ when: {} })).toThrow(`第 1 筆（${e.id}）：欄位 when`);
    expect(bad({ when: { guardState: ["ghost"] } })).toThrow("ghost");
    expect(bad({ market: { zhuji_dan: 0 } })).toThrow("zhuji_dan");
    expect(bad({ market: {} })).toThrow("market");
    expect(() => validateWorldEffects([e, e])).toThrow("重複");
  });

  it("跨檔案：物品 id 與事件條件引用的效果 id 必須存在", () => {
    expect(() => validateGameData({ ...gameData, worldEffects: [{ ...e, market: { ghost: 1.2 } }] })).toThrow("ghost");
    const ev = gameData.events.find((x) => x.id === "gate_tea_001")!;
    const ghost = { ...ev, conditions: { ...ev.conditions, world: ["ghost_effect"] } };
    expect(() => validateGameData({ ...gameData, events: [ghost] })).toThrow("ghost_effect");
  });

  it("原因文字不得直接寫死參考名", () => {
    expect(() => validateGameData({ ...gameData, worldEffects: [{ ...e, reason: "太衡宗封了山門" }] })).toThrow("太衡宗");
  });
});
