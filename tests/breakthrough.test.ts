import { describe, expect, it } from "vitest";
import {
  attemptBreakthrough,
  canBreakthrough,
  currentBreakthroughRate,
  pillAvailable,
} from "../src/core/breakthrough";
import { breakthroughFailLoss, breakthroughRate } from "../src/core/formulas";
import { tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { lianqiNeed, living, seedWhere } from "./helpers";

const attrs = { bone: 5, insight: 5, fortune: 5, mind: 5 };

/** 練氣九層圓滿、卡在瓶頸：悟性 5 → 成功率 40%，心性 5 → 失敗損失 20% */
function atLianqiCap(patch = {}) {
  return living(1, { realmId: "lianqi", stage: 8, cultivation: lianqiNeed(8), attributes: attrs, ...patch });
}

describe("突破公式", () => {
  const rule = gameData.realms[1].breakthroughRule!;

  it("成功率 = 基礎 + 悟性加成 + 丹藥加成，限制在 0–100%", () => {
    expect(breakthroughRate(rule, 0, false)).toBeCloseTo(0.3);
    expect(breakthroughRate(rule, 5, false)).toBeCloseTo(0.4);
    expect(breakthroughRate(rule, 5, true)).toBeCloseTo(0.6);
    expect(breakthroughRate(rule, 100, true)).toBe(1);
    expect(breakthroughRate({ baseRate: 0.15, insightBonus: 0.02 }, 10, true)).toBeCloseTo(0.35);
  });

  it("失敗損失 = 30% − 心性 × 2%，最低 0", () => {
    expect(breakthroughFailLoss(gameData.config, 0)).toBeCloseTo(0.3);
    expect(breakthroughFailLoss(gameData.config, 5)).toBeCloseTo(0.2);
    expect(breakthroughFailLoss(gameData.config, 20)).toBe(0);
  });
});

describe("手動突破", () => {
  it("只有卡在瓶頸的修行中才能突破", () => {
    expect(canBreakthrough(atLianqiCap())).toBe(true);
    expect(canBreakthrough(atLianqiCap({ cultivation: lianqiNeed(8) - 1 }))).toBe(false);
    expect(canBreakthrough(atLianqiCap({ stage: 7, cultivation: lianqiNeed(7) }))).toBe(false);
    expect(canBreakthrough(atLianqiCap({ phase: "dead" }))).toBe(false);
    expect(canBreakthrough(living(1))).toBe(false);
    const s = atLianqiCap({ cultivation: lianqiNeed(8) - 1 });
    expect(attemptBreakthrough(s, false)).toBe(s);
  });

  it("成功：進入築基初期、修為歸零、突破次數 +1、記一筆日誌", () => {
    const rngSeed = seedWhere((v) => v < 0.4);
    const t = attemptBreakthrough(atLianqiCap({ rngSeed }), false);
    expect(t.realmId).toBe("zhuji");
    expect(t.stage).toBe(0);
    expect(t.cultivation).toBe(0);
    expect(t.breakthroughs).toBe(1);
    expect(t.phase).toBe("living");
    expect(t.log[t.log.length - 1]).toMatchObject({ kind: "breakthroughSuccess", realmId: "zhuji" });
  });

  it("失敗：損失修為、境界不變，之後補滿修為可再試", () => {
    const rngSeed = seedWhere((v) => v >= 0.4);
    const t = attemptBreakthrough(atLianqiCap({ rngSeed }), false);
    expect(t.realmId).toBe("lianqi");
    expect(t.stage).toBe(8);
    expect(t.cultivation).toBeCloseTo(lianqiNeed(8) * 0.8);
    expect(t.breakthroughs).toBe(0);
    expect(t.log[t.log.length - 1].kind).toBe("breakthroughFail");
    expect(canBreakthrough(t)).toBe(false);
    // 補回修為後又卡在瓶頸，可以再試
    const again = tick({ ...t, ageMonths: 100 }, 1000);
    expect(canBreakthrough(again)).toBe(true);
  });

  it("築基丹：持有且勾選時才加成，嘗試時消耗（成敗皆然）", () => {
    const withPill = atLianqiCap({ items: { zhuji_dan: 1 } });
    expect(pillAvailable(withPill)).toBe(true);
    expect(currentBreakthroughRate(withPill, true)).toBeCloseTo(0.6);
    expect(currentBreakthroughRate(withPill, false)).toBeCloseTo(0.4);
    // 沒有丹藥時，勾選不算數
    expect(currentBreakthroughRate(atLianqiCap(), true)).toBeCloseTo(0.4);

    const win = attemptBreakthrough({ ...withPill, rngSeed: seedWhere((v) => v < 0.4) }, true);
    expect(win.items.zhuji_dan).toBe(0);
    const lose = attemptBreakthrough({ ...withPill, rngSeed: seedWhere((v) => v >= 0.6) }, true);
    expect(lose.items.zhuji_dan).toBe(0);
    // 沒勾選就不消耗
    const kept = attemptBreakthrough({ ...withPill, rngSeed: seedWhere((v) => v >= 0.4) }, false);
    expect(kept.items.zhuji_dan).toBe(1);
  });

  it("丹藥讓 40%~60% 之間的結果翻成成功", () => {
    const rngSeed = seedWhere((v) => v >= 0.4 && v < 0.6);
    const base = atLianqiCap({ rngSeed, items: { zhuji_dan: 1 } });
    expect(attemptBreakthrough(base, false).realmId).toBe("lianqi");
    expect(attemptBreakthrough(base, true).realmId).toBe("zhuji");
  });

  it("成功率與公式相符（統計）", () => {
    let wins = 0;
    const n = 4000;
    for (let seed = 1; seed <= n; seed++) {
      if (attemptBreakthrough(atLianqiCap({ rngSeed: seed }), false).realmId === "zhuji") wins++;
    }
    expect(wins / n).toBeGreaterThan(0.37);
    expect(wins / n).toBeLessThan(0.43);
  });

  it("築基後期突破金丹成功即通關", () => {
    const s = living(1, {
      realmId: "zhuji",
      stage: 2,
      cultivation: 20000,
      attributes: attrs,
      rngSeed: seedWhere((v) => v < 0.25),
    });
    expect(canBreakthrough(s)).toBe(true);
    expect(currentBreakthroughRate(s, true)).toBeCloseTo(0.25);
    const t = attemptBreakthrough(s, false);
    expect(t.phase).toBe("cleared");
    expect(t.realmId).toBe("jindan");
    expect(t.breakthroughs).toBe(1);
    expect(tick(t, 12)).toBe(t);
  });

  it("同種子結果固定", () => {
    const a = attemptBreakthrough(atLianqiCap({ rngSeed: 77 }), false);
    expect(a).toEqual(attemptBreakthrough(atLianqiCap({ rngSeed: 77 }), false));
  });
});
