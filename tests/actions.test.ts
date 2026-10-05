import { describe, expect, it } from "vitest";
import { buyItem, canBuyItem, canUseItem, setSchedule, useItem } from "../src/core/actions";
import { tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { lianqiNeed, living } from "./helpers";

describe("日常安排", () => {
  it("可切換，未知的安排與非修行中會被忽略", () => {
    const s = living();
    expect(s.schedule).toBe("retreat");
    expect(setSchedule(s, "herb").schedule).toBe("herb");
    expect(setSchedule(s, "nope")).toBe(s);
    const dead = living(1, { phase: "dead" });
    expect(setSchedule(dead, "herb")).toBe(dead);
  });

  it("修為倍率：閉關 100%、歷練 30%、採藥 20%", () => {
    const base = living(3, { realmId: "lianqi", stage: 0, cultivation: 0 });
    const gain = (id: string) => tick(setSchedule(base, id), 1).cultivation;
    expect(gain("adventure") / gain("retreat")).toBeCloseTo(0.3);
    expect(gain("herb") / gain("retreat")).toBeCloseTo(0.2);
  });

  it("採藥每月穩定獲得靈石，閉關沒有", () => {
    const base = living(3, { spiritStones: 0 });
    expect(tick(setSchedule(base, "herb"), 10).spiritStones).toBe(30);
    expect(tick(base, 10).spiritStones).toBe(0);
  });

  it("歷練會獲得靈石與丹藥（統計）", () => {
    const noDeath = {
      ...gameData,
      schedules: gameData.schedules.map((s) => (s.id === "adventure" ? { ...s, deathChance: 0 } : s)),
    };
    const base = setSchedule(living(5, { spiritStones: 0, lifespanBonus: 2000, items: {} }), "adventure", noDeath);
    const t = tick(base, 2000, noDeath);
    expect(t.spiritStones / 2000).toBeGreaterThan(0.7);
    expect(t.spiritStones / 2000).toBeLessThan(0.9);
    expect(t.items.juqi_dan).toBeGreaterThan(5);
    expect(t.items.juqi_dan).toBeLessThan(40);
    expect(t.log.some((e) => e.kind === "find" && e.itemId === "juqi_dan")).toBe(true);
  });

  it("歷練可能身亡，並記下日誌", () => {
    const deadly = {
      ...gameData,
      schedules: gameData.schedules.map((s) => (s.id === "adventure" ? { ...s, deathChance: 1 } : s)),
    };
    const t = tick(setSchedule(living(1), "adventure", deadly), 5, deadly);
    expect(t.phase).toBe("dead");
    expect(t.ageMonths).toBe(121);
    expect(t.log[t.log.length - 1].kind).toBe("adventureDeath");
  });

  it("歷練身亡的機率極低：整世都在歷練約 4%", () => {
    const p = 1 - (1 - gameData.schedules[1].deathChance) ** 1320;
    expect(p).toBeLessThan(0.05);
    expect(p).toBeGreaterThan(0.02);
  });
});

describe("坊市", () => {
  it("購買：扣靈石、加物品、記日誌", () => {
    const s = living(1, { spiritStones: 50 });
    expect(canBuyItem(s, "juqi_dan")).toBe(true);
    const t = buyItem(s, "juqi_dan");
    expect(t.spiritStones).toBe(30);
    expect(t.items.juqi_dan).toBe(1);
    expect(t.log[t.log.length - 1]).toMatchObject({ kind: "buy", itemId: "juqi_dan" });
  });

  it("靈石不足或非修行中不能買", () => {
    const poor = living(1, { spiritStones: 19 });
    expect(canBuyItem(poor, "juqi_dan")).toBe(false);
    expect(buyItem(poor, "juqi_dan")).toBe(poor);
    expect(canBuyItem(living(1, { spiritStones: 999, phase: "dead" }), "juqi_dan")).toBe(false);
    expect(canBuyItem(living(1, { spiritStones: 999 }), "不存在")).toBe(false);
  });

  it("延壽丹持有加已服超過每世上限就不能再買", () => {
    const s = living(1, { spiritStones: 9999, items: { yanshou_dan: 2 }, itemsUsed: { yanshou_dan: 1 } });
    expect(canBuyItem(s, "yanshou_dan")).toBe(false);
    expect(canBuyItem({ ...s, items: { yanshou_dan: 1 } }, "yanshou_dan")).toBe(true);
  });
});

describe("使用丹藥", () => {
  it("聚氣丹：立得當前階段所需修為的 25%", () => {
    const s = living(1, { realmId: "lianqi", stage: 2, cultivation: 0, items: { juqi_dan: 2 } });
    const t = useItem(s, "juqi_dan");
    expect(t.cultivation).toBeCloseTo(lianqiNeed(2) * 0.25);
    expect(t.items.juqi_dan).toBe(1);
    expect(t.itemsUsed.juqi_dan).toBe(1);
  });

  it("丹毒：同一階段每顆藥力遞減，第四顆起不能再服", () => {
    let s = living(1, { realmId: "lianqi", stage: 2, cultivation: 0, items: { juqi_dan: 5 } });
    const need = lianqiNeed(2);
    s = useItem(s, "juqi_dan");
    expect(s.cultivation).toBeCloseTo(need * 0.25);
    s = useItem(s, "juqi_dan");
    expect(s.cultivation).toBeCloseTo(need * 0.25 * 1.6);
    s = useItem(s, "juqi_dan");
    expect(s.cultivation).toBeCloseTo(need * 0.25 * 1.9);
    expect(canUseItem(s, "juqi_dan")).toBe(false);
    expect(useItem(s, "juqi_dan")).toBe(s);
    expect(s.items.juqi_dan).toBe(2);
  });

  it("丹毒：換了階段就重新計算", () => {
    let s = living(1, { realmId: "lianqi", stage: 2, cultivation: 0, items: { juqi_dan: 5 } });
    for (let i = 0; i < 3; i++) s = useItem(s, "juqi_dan");
    const next = { ...s, stage: 3, cultivation: 0 };
    expect(canUseItem(next, "juqi_dan")).toBe(true);
    expect(useItem(next, "juqi_dan").cultivation).toBeCloseTo(lianqiNeed(3) * 0.25);
  });

  it("聚氣丹足以升級時會直接升層", () => {
    const s = living(1, { realmId: "lianqi", stage: 0, cultivation: lianqiNeed(0) - 10, items: { juqi_dan: 1 } });
    const t = useItem(s, "juqi_dan");
    expect(t.stage).toBe(1);
    expect(t.cultivation).toBeCloseTo(lianqiNeed(0) - 10 + lianqiNeed(0) * 0.25 - lianqiNeed(0));
  });

  it("卡在瓶頸時不能服聚氣丹", () => {
    const s = living(1, { realmId: "lianqi", stage: 8, cultivation: 2563, items: { juqi_dan: 1 } });
    expect(canUseItem(s, "juqi_dan")).toBe(false);
    expect(useItem(s, "juqi_dan")).toBe(s);
  });

  it("沒有該物品、非修行中不能用", () => {
    expect(canUseItem(living(1), "juqi_dan")).toBe(false);
    expect(canUseItem(living(1, { items: { juqi_dan: 1 }, phase: "dead" }), "juqi_dan")).toBe(false);
  });

  it("築基丹不能直接服用", () => {
    const s = living(1, { items: { zhuji_dan: 1 } });
    expect(canUseItem(s, "zhuji_dan")).toBe(false);
    expect(useItem(s, "zhuji_dan")).toBe(s);
  });

  it("延壽丹：壽元上限 +10 年，每世最多 3 顆", () => {
    let s = living(1, { items: { yanshou_dan: 5 } });
    for (let i = 0; i < 3; i++) s = useItem(s, "yanshou_dan");
    expect(s.lifespanBonus).toBe(30);
    expect(s.items.yanshou_dan).toBe(2);
    expect(canUseItem(s, "yanshou_dan")).toBe(false);
    expect(useItem(s, "yanshou_dan")).toBe(s);
  });

  it("延壽丹讓壽元延長，原本會死的年紀不再死", () => {
    const base = living(1, { realmId: "lianqi", stage: 0, ageMonths: 1438 });
    expect(tick(base, 5).phase).toBe("dead");
    const extended = useItem({ ...base, items: { yanshou_dan: 1 } }, "yanshou_dan");
    const t = tick(extended, 5);
    expect(t.phase).toBe("living");
    expect(t.ageMonths).toBe(1443);
  });
});
