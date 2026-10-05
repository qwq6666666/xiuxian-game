import { describe, expect, it } from "vitest";
import { chooseEvent } from "../src/core/events";
import { attemptBreakthrough } from "../src/core/breakthrough";
import { setSchedule } from "../src/core/actions";
import { endLife, highlightScore, pickClosing, selectHighlights, settleDaoYun } from "../src/core/review";
import { emptyMeta, type GameState, type LogEntry } from "../src/core/state";
import { tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import type { EventDef, GameData } from "../src/data/types";
import { formatReviewSummary, reviewTitle } from "../src/ui/format";
import { living } from "./helpers";

const at = (realmId: string, stage: number, patch: Partial<GameState> = {}) => living(1, { realmId, stage, ...patch });

describe("道韻結算", () => {
  it("凡人沒有道韻", () => {
    expect(settleDaoYun(at("mortal", 0))).toEqual({ base: 0, bonus: 0, newlyReached: [] });
  });

  it("練氣每層 1 點：到練氣六層共 6 點，首次達成再加 6", () => {
    const r = settleDaoYun(at("lianqi", 5));
    expect(r.base).toBe(6);
    expect(r.bonus).toBe(6);
    expect(r.newlyReached).toEqual(["lianqi:0", "lianqi:1", "lianqi:2", "lianqi:3", "lianqi:4", "lianqi:5"]);
  });

  it("築基每期 10 點、金丹 50 點，並計入先前境界的全部階段", () => {
    // 練氣 9 層 ×1 + 築基初期、中期 ×10
    expect(settleDaoYun(at("zhuji", 1)).base).toBe(9 + 20);
    // 練氣 9 + 築基 3 期 30 + 金丹 50
    expect(settleDaoYun(at("jindan", 0)).base).toBe(9 + 30 + 50);
  });

  it("首次達成加倍只算一次：曾經達成的階段不再加倍", () => {
    const meta = { ...emptyMeta(), reached: ["lianqi:0", "lianqi:1", "lianqi:2"] };
    const r = settleDaoYun(at("lianqi", 4, { meta }));
    expect(r.base).toBe(5);
    expect(r.bonus).toBe(2); // 只有第 4、5 層是新的
    expect(r.newlyReached).toEqual(["lianqi:3", "lianqi:4"]);
  });

  it("倍率由設定決定", () => {
    const data: GameData = { ...gameData, config: { ...gameData.config, daoYunFirstTimeMult: 3 } };
    expect(settleDaoYun(at("lianqi", 1), data)).toMatchObject({ base: 2, bonus: 4 });
  });
});

describe("結束一世", () => {
  const dying = (patch: Partial<GameState> = {}) => at("lianqi", 5, { ageMonths: 1439, ...patch });

  it("壽元耗盡：產生回顧、道韻入帳、世數 +1、進入死亡階段", () => {
    const t = tick(dying(), 1);
    expect(t.phase).toBe("dead");
    expect(t.review).toMatchObject({
      cause: "lifespan",
      ageMonths: 1440,
      realmId: "lianqi",
      stage: 5,
      daoYunBase: 6,
      daoYunBonus: 6,
    });
    expect(t.meta.daoYun).toBe(12);
    expect(t.meta.lives).toBe(1);
    expect(t.meta.reached).toHaveLength(6);
    expect(t.log[t.log.length - 1].kind).toBe("death");
  });

  it("歷練身亡、事件致死、金丹通關也各自結算", () => {
    const deadly: GameData = {
      ...gameData,
      schedules: gameData.schedules.map((s) => (s.id === "adventure" ? { ...s, deathChance: 1 } : s)),
    };
    const adv = tick(setSchedule(dying({ ageMonths: 500 }), "adventure", deadly), 1, deadly);
    expect(adv.review?.cause).toBe("adventure");
    expect(adv.phase).toBe("dead");
    expect(adv.meta.lives).toBe(1);

    const killer: EventDef = {
      id: "k", type: "choice", title: "k", text: "。", weight: 1, tone: "bad", maxPerLife: 1, conditions: {},
      choices: [{ text: "x", outcomes: [{ weight: 1, text: "。", effects: { death: true } }] }],
    };
    const data = { ...gameData, events: [killer] };
    const ev = chooseEvent({ ...dying({ ageMonths: 500 }), pendingEvent: "k" }, 0, data);
    expect(ev.review?.cause).toBe("event");
    expect(ev.phase).toBe("dead");
    expect(ev.log.slice(-2).map((e) => e.kind)).toEqual(["event", "death"]);

    const top = at("zhuji", 2, { cultivation: 20000, attributes: { bone: 5, insight: 50, fortune: 5, mind: 5 } });
    const won = attemptBreakthrough(top, false);
    expect(won.phase).toBe("cleared");
    expect(won.review?.cause).toBe("cleared");
    expect(won.review).toMatchObject({ realmId: "jindan", stage: 0, breakthroughs: 1 });
    expect(won.meta.lives).toBe(1);
    expect(reviewTitle(won.review)).toBe("金丹大成");
  });

  it("只結算一次：重複呼叫不會再加道韻", () => {
    const t = tick(dying(), 1);
    expect(endLife(t, "lifespan")).toBe(t);
    expect(tick(t, 12)).toBe(t);
  });

  it("首次達成加倍跨世只算一次：同一境界第二世不再加倍", () => {
    const first = tick(dying(), 1);
    const second = tick(dying({ meta: first.meta }), 1);
    expect(first.review).toMatchObject({ daoYunBase: 6, daoYunBonus: 6 });
    expect(second.review).toMatchObject({ daoYunBase: 6, daoYunBonus: 0 });
    expect(second.meta.daoYun).toBe(12 + 6);
    expect(second.meta.lives).toBe(2);
  });

  it("回顧只記錄輸出需要的資料，並可轉成文字", () => {
    const t = tick(dying({ originId: "farmer", spiritRootId: "san" }), 1);
    const text = formatReviewSummary(t.review!, gameData);
    expect(text).toMatch(/^享年一百二十歲，終身練氣六層。/);
  });
});

describe("收尾句", () => {
  // 出身可能附帶丹藥，先清空物品，避免干擾收尾句的挑選
  const base = () => at("lianqi", 3, { items: {} });

  it("持有未用的聚氣丹時用範例那句", () => {
    const s = { ...base(), items: { juqi_dan: 1 } };
    const idx = pickClosing(s, "lifespan");
    expect(gameData.text.review.lifespan[idx].text).toBe("臨終之際你望著窗外流雲，想起那顆始終沒捨得吃的聚氣丹。");
    const t = tick({ ...s, ageMonths: 1439 }, 1);
    expect(formatReviewSummary(t.review!, gameData)).toBe(
      "享年一百二十歲，終身練氣四層。臨終之際你望著窗外流雲，想起那顆始終沒捨得吃的聚氣丹。",
    );
  });

  it("沒有對應物品時在不限物品的句子中選，不會選到有 ifItem 的", () => {
    for (let age = 100; age < 160; age++) {
      const idx = pickClosing({ ...base(), ageMonths: age }, "lifespan");
      expect(gameData.text.review.lifespan[idx].ifItem).toBeUndefined();
    }
  });

  it("每種結束方式都有句子，且文字規則同其他玩家可見文字", () => {
    for (const cause of ["lifespan", "adventure", "event", "cleared"] as const) {
      expect(gameData.text.review[cause].length).toBeGreaterThan(0);
      for (const v of gameData.text.review[cause]) {
        expect((v.text.match(/[。！？]/g) ?? []).length).toBeLessThanOrEqual(3);
        expect(v.text).not.toMatch(/[0-9]|玩家|遊戲|數值/);
      }
    }
  });
});

describe("關鍵事件", () => {
  const ev = (eventId: string, month: number, extra: Partial<LogEntry> = {}): LogEntry => ({
    month, kind: "event", realmId: "lianqi", stage: 0, eventId, ...extra,
  });

  it("分數：突破成功最高，連鎖結局次之，見聞最低", () => {
    expect(highlightScore({ month: 1, kind: "breakthroughSuccess", realmId: "zhuji", stage: 0 })).toBe(5);
    expect(highlightScore(ev("cave_002", 1, { choice: 0, outcome: 0 }))).toBe(4);
    expect(highlightScore(ev("village_001", 1, { choice: 0, outcome: 0 }))).toBe(1);
    expect(highlightScore(ev("rain_001", 1))).toBe(0.5);
    expect(highlightScore({ month: 1, kind: "stageUp", realmId: "lianqi", stage: 1 })).toBe(0);
    expect(highlightScore({ month: 1, kind: "death", realmId: "lianqi", stage: 1 })).toBe(0);
  });

  it("挑分數最高的 5 條，再依時間排序；同分取較近的", () => {
    const log: LogEntry[] = [
      { month: 10, kind: "realmUp", realmId: "lianqi", stage: 0 },
      ev("rain_001", 20),
      ev("village_001", 30, { choice: 0, outcome: 0 }),
      ev("cave_002", 40, { choice: 0, outcome: 0 }),
      { month: 50, kind: "breakthroughSuccess", realmId: "zhuji", stage: 0 },
      ev("village_001", 60, { choice: 0, outcome: 0 }),
      ev("village_001", 70, { choice: 0, outcome: 0 }),
      ev("rain_001", 80),
      { month: 90, kind: "stageUp", realmId: "lianqi", stage: 3 },
      { month: 100, kind: "death", realmId: "lianqi", stage: 3 },
    ];
    const picked = selectHighlights(log);
    expect(picked).toHaveLength(5);
    expect(picked.map((e) => e.month)).toEqual([10, 40, 50, 60, 70]);
  });

  it("不足 5 條時全部列出；沒有可記的事則為空", () => {
    expect(selectHighlights([])).toEqual([]);
    expect(selectHighlights([{ month: 1, kind: "death", realmId: "mortal", stage: 0 }])).toEqual([]);
    expect(selectHighlights([ev("rain_001", 5), ev("sword_001", 9)])).toHaveLength(2);
  });

  it("結算時存下挑好的關鍵事件", () => {
    const log: LogEntry[] = [ev("cave_002", 200, { choice: 0, outcome: 0 }), ev("rain_001", 210)];
    const t = tick(at("lianqi", 2, { ageMonths: 1439, log }), 1);
    expect(t.review!.highlights.map((e) => e.eventId)).toEqual(["cave_002", "rain_001"]);
  });

  it("連鎖結局在資料裡有較高的 highlight 分數", () => {
    const score = (id: string) => gameData.events.find((e) => e.id === id)!.highlight;
    expect(score("cave_002")).toBeGreaterThan(score("cave_001")!);
    expect(score("senior_002")).toBeGreaterThan(score("senior_001")!);
  });
});
