import { describe, expect, it } from "vitest";
import {
  advanceEvents,
  canChoose,
  chooseEvent,
  eventAvailable,
  firstAvailableChoice,
  pickEvent,
  setAutoChoice,
} from "../src/core/events";
import { eventWeight, outcomeWeight } from "../src/core/formulas";
import { createInitialState, newLife, startLife } from "../src/core/life";
import type { GameState } from "../src/core/state";
import { tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import type { Effects, EventDef, GameData } from "../src/data/types";
import { living } from "./helpers";

const ev = (id: string): EventDef => gameData.events.find((e) => e.id === id)!;

/** 只含指定事件的資料，讓測試不受其他事件干擾 */
const withEvents = (events: EventDef[]): GameData => ({ ...gameData, events });

function anecdote(id: string, patch: Partial<EventDef> = {}): EventDef {
  return { id, type: "anecdote", title: id, text: "測試。", weight: 10, tone: "neutral", maxPerLife: 1, conditions: {}, ...patch };
}

function choiceEvent(id: string, outcomes: EventDef["choices"], patch: Partial<EventDef> = {}): EventDef {
  return { ...anecdote(id), type: "choice", choices: outcomes, ...patch };
}

/** 單一結果、固定效果的抉擇事件 */
function fixed(effects: Effects): EventDef {
  return choiceEvent("fx", [{ text: "選", outcomes: [{ weight: 1, text: "結果。", effects }] }]);
}

/** 正在等待抉擇的狀態 */
function pending(id: string, patch: Partial<GameState> = {}): GameState {
  return { ...living(1, patch), pendingEvent: id, ageMonths: 400 };
}

describe("事件資料", () => {
  it("第一版目標：20 個事件、至少 8 個抉擇、2 組連鎖", () => {
    expect(gameData.events).toHaveLength(20);
    expect(gameData.events.filter((e) => e.type === "choice").length).toBeGreaterThanOrEqual(8);
    // 連鎖：後段事件要求前段事件設定的旗標
    expect(ev("cave_002").conditions.flags).toEqual(["cave_001_marked"]);
    expect(ev("senior_002").conditions.flags).toEqual(["senior_helped"]);
  });

  it("文字規則：每段不超過三句、不含數字與數值用語", () => {
    const texts: string[] = [];
    for (const e of gameData.events) {
      texts.push(e.text);
      for (const c of e.choices ?? []) for (const o of c.outcomes) texts.push(o.text);
    }
    expect(texts.length).toBeGreaterThan(50);
    for (const t of texts) {
      const sentences = (t.match(/[。！？]/g) ?? []).length;
      expect(sentences, t).toBeLessThanOrEqual(3);
      expect(t, t).not.toMatch(/[0-9０-９]/);
      expect(t, t).not.toMatch(/玩家|遊戲|數值|恭喜|哈哈|[+＋]/);
    }
  });

  it("連鎖的結局與重場面不吐槽：以資料檢查它們都有文字且是正經筆調（無表情符號）", () => {
    for (const e of gameData.events) {
      for (const c of e.choices ?? []) for (const o of c.outcomes) expect(o.text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("條件與重複上限", () => {
  it("境界、年齡、旗標、安排、瓶頸、次數都會篩選", () => {
    const base = living(1, { realmId: "lianqi", ageMonths: 20 * 12 });
    const e = (conditions: EventDef["conditions"], maxPerLife = 1) => anecdote("t", { conditions, maxPerLife });

    expect(eventAvailable(base, e({ realmMin: "lianqi" }))).toBe(true);
    expect(eventAvailable(base, e({ realmMin: "zhuji" }))).toBe(false);
    expect(eventAvailable(base, e({ realmMax: "mortal" }))).toBe(false);
    expect(eventAvailable(base, e({ ageMin: 20 }))).toBe(true);
    expect(eventAvailable(base, e({ ageMin: 21 }))).toBe(false);
    expect(eventAvailable(base, e({ ageMax: 19 }))).toBe(false);
    expect(eventAvailable(base, e({ flags: ["a"] }))).toBe(false);
    expect(eventAvailable({ ...base, flags: ["a"] }, e({ flags: ["a"] }))).toBe(true);
    expect(eventAvailable({ ...base, flags: ["a"] }, e({ flagsNot: ["a"] }))).toBe(false);
    expect(eventAvailable(base, e({ schedules: ["herb"] }))).toBe(false);
    expect(eventAvailable({ ...base, schedule: "herb" }, e({ schedules: ["herb"] }))).toBe(true);

    const capped = { ...base, stage: 8, cultivation: 2563 };
    expect(eventAvailable(base, e({ bottleneck: true }))).toBe(false);
    expect(eventAvailable(capped, e({ bottleneck: true }))).toBe(true);

    expect(eventAvailable({ ...base, eventCounts: { t: 1 } }, e({}, 1))).toBe(false);
    expect(eventAvailable({ ...base, eventCounts: { t: 1 } }, e({}, 2))).toBe(true);
  });

  it("GDD 範例事件：練氣、16 歲以上，且沒有 cave_001_done 才會出現", () => {
    const e = ev("cave_001");
    const ok = living(1, { realmId: "lianqi", ageMonths: 16 * 12 });
    expect(eventAvailable(ok, e)).toBe(true);
    expect(eventAvailable({ ...ok, ageMonths: 15 * 12 }, e)).toBe(false);
    expect(eventAvailable({ ...ok, realmId: "mortal" }, e)).toBe(false);
    expect(eventAvailable({ ...ok, flags: ["cave_001_done"] }, e)).toBe(false);
  });

  it("沒有可出現的事件時回傳 null", () => {
    const [picked] = pickEvent(living(1), withEvents([anecdote("t", { conditions: { ageMin: 99 } })]));
    expect(picked).toBeNull();
  });
});

describe("抽取權重", () => {
  const config = gameData.config;

  it("好事件隨氣運增加權重，壞事件與中性不受影響", () => {
    expect(eventWeight(10, "good", 0, 1, config)).toBe(10);
    expect(eventWeight(10, "good", 10, 1, config)).toBeCloseTo(15);
    expect(eventWeight(10, "bad", 10, 1, config)).toBe(10);
    expect(eventWeight(10, "neutral", 10, 1, config)).toBe(10);
    expect(eventWeight(10, "bad", 0, 3, config)).toBe(30);
  });

  it("氣運高時，好事件被抽到的機率實際上升（統計）", () => {
    const data = withEvents([anecdote("good", { tone: "good" }), anecdote("plain")]);
    const rate = (fortune: number) => {
      let good = 0;
      const n = 4000;
      for (let seed = 1; seed <= n; seed++) {
        const s = living(1, { rngSeed: seed, attributes: { bone: 5, insight: 5, fortune, mind: 5 } });
        if (pickEvent(s, data)[0]!.id === "good") good++;
      }
      return good / n;
    };
    expect(rate(0)).toBeCloseTo(0.5, 1);
    expect(rate(10)).toBeCloseTo(0.6, 1);
  });

  it("scheduleWeights 讓歷練時山道遇獸更常出現", () => {
    const data = withEvents([ev("beast_001"), anecdote("plain", { weight: 8 })]);
    const rate = (schedule: string) => {
      let beast = 0;
      const n = 4000;
      for (let seed = 1; seed <= n; seed++) {
        const s = living(1, { rngSeed: seed, realmId: "lianqi", schedule });
        if (pickEvent(s, data)[0]!.id === "beast_001") beast++;
      }
      return beast / n;
    };
    expect(rate("retreat")).toBeCloseTo(0.5, 1);
    expect(rate("adventure")).toBeCloseTo(0.75, 1);
  });

  it("結果權重 = 基礎 + 屬性 × 每點加成，最低 0", () => {
    const attrs = { bone: 5, insight: 5, fortune: 5, mind: 8 };
    expect(outcomeWeight(20, { mind: 8 }, attrs)).toBe(84);
    expect(outcomeWeight(20, undefined, attrs)).toBe(20);
    expect(outcomeWeight(5, { mind: -2 }, attrs)).toBe(0);
  });

  it("心魔事件：心性高時守住靈台的成功率較高（統計）", () => {
    const demon = withEvents([ev("demon_001")]);
    const winRate = (mind: number) => {
      let wins = 0;
      const n = 3000;
      for (let seed = 1; seed <= n; seed++) {
        const s = { ...living(1, { rngSeed: seed, realmId: "lianqi", attributes: { bone: 5, insight: 5, fortune: 5, mind } }), pendingEvent: "demon_001" };
        const after = chooseEvent(s, 0, demon);
        if (after.log[after.log.length - 1].outcome === 0) wins++;
      }
      return wins / n;
    };
    const low = winRate(1);
    const high = winRate(10);
    expect(low).toBeCloseTo(28 / 88, 1);
    expect(high).toBeCloseTo(100 / 160, 1);
    expect(high).toBeGreaterThan(low + 0.2);
  });
});

describe("計時與觸發", () => {
  const only = withEvents([anecdote("a", { maxPerLife: 99 })]);

  it("事件頻率倍率：閉關 24 個月、採藥 12 個月、歷練 6 個月才觸發", () => {
    const fired = (schedule: string, months: number) => {
      const s = living(1, { schedule, eventThreshold: 12 });
      return tick(s, months, only).log.some((e) => e.kind === "event");
    };
    expect(fired("retreat", 23)).toBe(false);
    expect(fired("retreat", 24)).toBe(true);
    expect(fired("herb", 11)).toBe(false);
    expect(fired("herb", 12)).toBe(true);
    expect(fired("adventure", 5)).toBe(false);
    expect(fired("adventure", 6)).toBe(true);
  });

  it("切換安排後依新的倍率累計", () => {
    let s = living(1, { eventThreshold: 12 });
    s = tick(s, 12, only); // 閉關：累計 6
    expect(s.log.some((e) => e.kind === "event")).toBe(false);
    s = tick({ ...s, schedule: "adventure" }, 3, only); // 歷練 ×2：再 +6 → 達標
    expect(s.log.some((e) => e.kind === "event")).toBe(true);
  });

  it("觸發後重抽門檻（12–36）並重置計時，事件次數 +1", () => {
    const s = tick(living(1, { eventThreshold: 12, schedule: "herb" }), 12, only);
    expect(s.eventClock).toBe(0);
    expect(s.eventThreshold).toBeGreaterThanOrEqual(12);
    expect(s.eventThreshold).toBeLessThanOrEqual(36);
    expect(s.eventCounts.a).toBe(1);
  });

  it("見聞直接寫入日誌並套用效果，不暫停", () => {
    const data = withEvents([anecdote("rain", { effects: { cultivation: 0.5 } })]);
    const s = living(1, { realmId: "lianqi", stage: 0, cultivation: 0, eventThreshold: 1, schedule: "herb" });
    const t = tick(s, 1, data);
    expect(t.pendingEvent).toBeNull();
    const entry = t.log[t.log.length - 1];
    expect(entry).toMatchObject({ kind: "event", eventId: "rain" });
    expect(entry.choice).toBeUndefined();
    expect(entry.changes?.cultivation).toBe(50);
  });

  it("每世上限：maxPerLife 為 1 的事件不會重複", () => {
    const data = withEvents([anecdote("once")]);
    let s = living(1, { eventThreshold: 1, schedule: "herb", lifespanBonus: 500 });
    for (let i = 0; i < 100; i++) s = { ...tick(s, 1, data), eventThreshold: 1 };
    expect(s.log.filter((e) => e.kind === "event")).toHaveLength(1);
  });

  it("抉擇事件會暫停時間，直到玩家選擇", () => {
    const data = withEvents([fixed({})]);
    const s = tick(living(1, { eventThreshold: 12, schedule: "herb" }), 100, data);
    expect(s.pendingEvent).toBe("fx");
    expect(s.ageMonths).toBe(120 + 12);
    expect(tick(s, 50, data)).toBe(s);
    const after = chooseEvent(s, 0, data);
    expect(after.pendingEvent).toBeNull();
    expect(tick(after, 1, data).ageMonths).toBe(s.ageMonths + 1);
  });

  it("自動抉擇：不暫停，直接選第一個可選的選項", () => {
    const data = withEvents([fixed({ spiritStones: 7 })]);
    const s = tick(living(1, { eventThreshold: 12, schedule: "herb", autoChoice: true, spiritStones: 0 }), 12, data);
    expect(s.pendingEvent).toBeNull();
    expect(s.log.filter((e) => e.kind === "event")).toHaveLength(1);
    expect(s.spiritStones).toBe(7 + 36);
  });

  it("第一個選項前提不足時，自動抉擇跳到下一個可選的", () => {
    const e = choiceEvent("req", [
      { text: "貴", requires: { spiritStones: 100 }, outcomes: [{ weight: 1, text: "。", effects: {} }] },
      { text: "平", outcomes: [{ weight: 1, text: "。", effects: {} }] },
    ]);
    expect(firstAvailableChoice(living(1, { spiritStones: 0 }), e)).toBe(1);
    expect(firstAvailableChoice(living(1, { spiritStones: 100 }), e)).toBe(0);
  });

  it("等待抉擇時才打開自動抉擇：立刻替玩家選好，關閉則只改設定", () => {
    const s = { ...living(1, { spiritStones: 0 }), pendingEvent: "senior_001" };
    const on = setAutoChoice(s, true);
    expect(on.autoChoice).toBe(true);
    expect(on.pendingEvent).toBeNull();
    expect(on.flags).toContain("senior_helped"); // 第一個選項「分他乾糧」
    const off = setAutoChoice(s, false);
    expect(off.autoChoice).toBe(false);
    expect(off.pendingEvent).toBe("senior_001");
    const idle = living(1);
    expect(setAutoChoice(idle, true).pendingEvent).toBeNull();
    expect(setAutoChoice(idle, true).autoChoice).toBe(true);
  });

  it("轉世後保留自動抉擇設定", () => {
    const dead = living(1, { phase: "dead", autoChoice: true });
    expect(newLife(dead).autoChoice).toBe(true);
  });

  it("沒有抉擇待處理時，advanceEvents 在門檻前只累計計時", () => {
    const s = living(1, { eventThreshold: 12 });
    const t = advanceEvents(s, 121, gameData);
    expect(t.eventClock).toBe(0.5);
    expect(t.pendingEvent).toBeNull();
  });
});

describe("抉擇結算", () => {
  const run = (effects: Parameters<typeof fixed>[0], patch: Partial<GameState> = {}) => {
    const data = withEvents([fixed(effects)]);
    const s = { ...living(1, { realmId: "lianqi", stage: 2, cultivation: 100, ...patch }), pendingEvent: "fx" };
    return chooseEvent(s, 0, data);
  };

  it("修為：以當前階段所需修為的比例計算（練氣三層需 225）", () => {
    const up = run({ cultivation: 0.2 });
    expect(up.cultivation).toBe(145);
    expect(up.log[up.log.length - 1].changes?.cultivation).toBe(45);
    const down = run({ cultivation: -0.2 });
    expect(down.cultivation).toBe(55);
    expect(down.log[down.log.length - 1].changes?.cultivation).toBe(-45);
  });

  it("修為損失不會低於 0，增加足夠時會升層", () => {
    expect(run({ cultivation: -5 }).cultivation).toBe(0);
    const up = run({ cultivation: 0.6 }); // +135 → 235 ≥ 225 → 升到四層
    expect(up.stage).toBe(3);
  });

  it("卡在瓶頸時修為增加無效、不記變化", () => {
    const t = run({ cultivation: 0.5 }, { stage: 8, cultivation: 2563 });
    expect(t.cultivation).toBe(2563);
    expect(t.log[t.log.length - 1].changes).toBeUndefined();
  });

  it("靈石、物品增減不會變成負數，變化量記實際值", () => {
    const t = run({ spiritStones: -50, items: { juqi_dan: -3, zhuji_dan: 2 } }, { spiritStones: 20, items: { juqi_dan: 1 } });
    expect(t.spiritStones).toBe(0);
    expect(t.items.juqi_dan).toBe(0);
    expect(t.items.zhuji_dan).toBe(2);
    expect(t.log[t.log.length - 1].changes).toEqual({
      spiritStones: -20,
      items: { juqi_dan: -1, zhuji_dan: 2 },
    });
  });

  it("壽元上限可增減，屬性最低不低於 1", () => {
    const t = run({ lifespan: -5, attributes: { mind: -99, fortune: 2 } }, { attributes: { bone: 5, insight: 5, fortune: 5, mind: 3 } });
    expect(t.lifespanBonus).toBe(-5);
    expect(t.attributes.mind).toBe(1);
    expect(t.attributes.fortune).toBe(7);
    expect(t.log[t.log.length - 1].changes).toEqual({ lifespan: -5, attributes: { mind: -2, fortune: 2 } });
  });

  it("旗標會累積且不重複", () => {
    const t = run({ flags: ["x", "y"] }, { flags: ["x"] });
    expect(t.flags).toEqual(["x", "y"]);
  });

  it("death 效果：記下事件與死亡日誌，進入死亡階段", () => {
    const t = run({ death: true });
    expect(t.phase).toBe("dead");
    expect(t.pendingEvent).toBeNull();
    expect(t.log.slice(-2).map((e) => e.kind)).toEqual(["event", "death"]);
  });

  it("壽元上限被削到低於年齡時，下個月就死亡", () => {
    const t = run({ lifespan: -200 });
    expect(t.phase).toBe("living");
    const data = withEvents([fixed({ lifespan: -200 })]);
    expect(tick(t, 1, data).phase).toBe("dead");
  });

  it("選項前提不足時不能選，狀態原樣", () => {
    const e = choiceEvent("req", [
      { text: "貴", requires: { spiritStones: 30 }, outcomes: [{ weight: 1, text: "。", effects: { spiritStones: -30 } }] },
      { text: "平", outcomes: [{ weight: 1, text: "。", effects: {} }] },
    ]);
    const data = withEvents([e]);
    const poor = { ...living(1, { spiritStones: 29 }), pendingEvent: "req" };
    expect(canChoose(poor, e.choices![0])).toBe(false);
    expect(chooseEvent(poor, 0, data)).toBe(poor);
    const rich = { ...poor, spiritStones: 30 };
    expect(canChoose(rich, e.choices![0])).toBe(true);
    expect(chooseEvent(rich, 0, data).spiritStones).toBe(0);
    expect(chooseEvent(poor, 5, data)).toBe(poor);
  });

  it("沒有待處理事件時選擇無效", () => {
    const s = living(1);
    expect(chooseEvent(s, 0)).toBe(s);
  });

  it("同種子同選擇，結果固定", () => {
    const s = pending("beast_001", { realmId: "lianqi", rngSeed: 123 });
    expect(chooseEvent(s, 1)).toEqual(chooseEvent(s, 1));
  });
});

describe("連鎖事件走完", () => {
  it("古洞：先記下位置 → 重返古洞出現、原事件不再出現 → 走完結局", () => {
    const start = living(1, { realmId: "lianqi", ageMonths: 20 * 12, stage: 3, cultivation: 0 });
    const only = withEvents([ev("cave_001"), ev("cave_002")]);

    // 一開始只有第一段能出現
    expect(pickEvent(start, only)[0]!.id).toBe("cave_001");
    expect(eventAvailable(start, ev("cave_002"))).toBe(false);

    // 第一段：記下位置
    let s = chooseEvent({ ...start, pendingEvent: "cave_001", eventCounts: { cave_001: 1 } }, 1, only);
    expect(s.flags).toContain("cave_001_marked");
    expect(s.pendingEvent).toBeNull();

    // 第二段出現，第一段已不再出現
    expect(eventAvailable(s, ev("cave_001"))).toBe(false);
    expect(eventAvailable(s, ev("cave_002"))).toBe(true);
    expect(pickEvent(s, only)[0]!.id).toBe("cave_002");

    // 第二段：深入洞府，走完結局
    s = chooseEvent({ ...s, pendingEvent: "cave_002", eventCounts: { ...s.eventCounts, cave_002: 1 } }, 0, only);
    const last = s.log[s.log.length - 1];
    expect(last).toMatchObject({ kind: "event", eventId: "cave_002", choice: 0 });
    expect(pickEvent(s, only)[0]).toBeNull();
  });

  it("古洞：入洞一探會設 cave_001_done，不會走到第二段", () => {
    const start = living(1, { realmId: "lianqi", ageMonths: 20 * 12 });
    const s = chooseEvent({ ...start, pendingEvent: "cave_001", eventCounts: { cave_001: 1 } }, 0);
    expect(s.flags).toContain("cave_001_done");
    expect(eventAvailable(s, ev("cave_002"))).toBe(false);
  });

  it("老者：幫過他之後才會遇到回贈；沒幫就永遠遇不到", () => {
    const start = living(1, { ageMonths: 25 * 12, spiritStones: 50 });
    expect(eventAvailable(start, ev("senior_002"))).toBe(false);

    const helped = chooseEvent({ ...start, pendingEvent: "senior_001", eventCounts: { senior_001: 1 } }, 0);
    expect(helped.flags).toContain("senior_helped");
    expect(eventAvailable(helped, ev("senior_002"))).toBe(true);
    expect(eventAvailable({ ...helped, ageMonths: 15 * 12 }, ev("senior_002"))).toBe(false);

    const ignored = chooseEvent({ ...start, pendingEvent: "senior_001", eventCounts: { senior_001: 1 } }, 2);
    expect(eventAvailable(ignored, ev("senior_002"))).toBe(false);

    // 贈靈石也算幫過，且需要 10 靈石
    const gift = chooseEvent({ ...start, pendingEvent: "senior_001", eventCounts: { senior_001: 1 } }, 1);
    expect(gift.flags).toContain("senior_helped");
    expect(gift.spiritStones).toBe(40);
    const poor = { ...start, spiritStones: 5, pendingEvent: "senior_001" };
    expect(chooseEvent(poor, 1)).toBe(poor);
  });

  it("老者回贈走完：任一結果都能正常結算", () => {
    const base = { ...living(1, { ageMonths: 25 * 12, flags: ["senior_helped"], realmId: "lianqi", stage: 2, cultivation: 0 }), pendingEvent: "senior_002" };
    const seen = new Set<number>();
    for (let seed = 1; seed < 200; seed++) {
      const t = chooseEvent({ ...base, rngSeed: seed }, 0);
      seen.add(t.log[t.log.length - 1].outcome!);
      expect(t.pendingEvent).toBeNull();
    }
    expect(seen.size).toBe(3);
  });
});

describe("整世", () => {
  it("開啟自動抉擇跑完一世：事件正常觸發，連鎖與抉擇都出現", () => {
    let totalChoices = 0;
    let lives = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let s: GameState = { ...startLife(createInitialState(seed)), autoChoice: true };
      while (s.phase === "living") s = tick(s, 12);
      expect(s.pendingEvent).toBeNull();
      totalChoices += gameData.events.filter((e) => e.type === "choice").reduce((n, e) => n + (s.eventCounts[e.id] ?? 0), 0);
      lives++;
    }
    const avg = totalChoices / lives;
    expect(avg).toBeGreaterThan(4);
    expect(avg).toBeLessThan(20);
  });
});
