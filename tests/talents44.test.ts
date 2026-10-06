import { describe, expect, it } from "vitest";
import { chartPower, chartChoiceLevel, pickChart } from "../src/core/chart";
import { canChoose, chooseEvent, pickEvent } from "../src/core/events";
import { createInitialState, newLife, reroll, startLife } from "../src/core/life";
import { canPeek, omenOf, peekOmen } from "../src/core/omen";
import { deserialize, serialize } from "../src/core/save";
import { emptyMeta, type GameState } from "../src/core/state";
import { gameData as data } from "../src/data/load";
import { validateConfig, validateEvents, validateGoals, validateTalents } from "../src/data/validate";
import type { ChoiceDef, EventDef, Omen } from "../src/data/types";
import { setWish, wishChoices, wishLevel, wishWeightMult } from "../src/core/wish";
import { living } from "./helpers";

const meta = (talents: Record<string, number>) => ({ ...emptyMeta(), talents });
const rolling = (seed: number, talents: Record<string, number> = {}): GameState => createInitialState(seed, data, meta(talents));

describe("擇身：備選命盤", () => {
  it("沒有擇身時沒有備選命盤，重擲也沒有", () => {
    const s = rolling(7);
    expect(s.altCharts).toEqual([]);
    expect(reroll({ ...s, rerolls: 2 }, data).altCharts).toEqual([]);
  });

  it("備選份數等於等級；功率相近、靈根或出身不同；不消耗 rngSeed，也不改目前命盤", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const plain = rolling(seed);
      for (const level of [1, 2]) {
        const s = rolling(seed, { zeshen: level });
        expect(chartChoiceLevel(s, data)).toBe(level);
        expect(s.altCharts).toHaveLength(level);
        // 目前命盤、rngSeed 與沒有天賦時完全相同
        expect(s.rngSeed).toBe(plain.rngSeed);
        expect(s.attributes).toEqual(plain.attributes);
        expect(s.spiritRootId).toBe(plain.spiritRootId);
        const seen = [s, ...s.altCharts];
        for (const alt of s.altCharts) {
          expect(seen.filter((c) => c.spiritRootId === alt.spiritRootId && c.originId === alt.originId)).toHaveLength(1);
        }
      }
    }
  });

  it("備選命盤的功率與目前命盤相差不超過容許範圍（絕大多數；抽不到時取最接近的）", () => {
    let within = 0;
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = rolling(seed, { zeshen: 1 });
      total++;
      if (Math.abs(chartPower(s.altCharts[0], data) / chartPower(s, data) - 1) <= data.config.chartPowerTolerance + 1e-9) within++;
    }
    expect(within / total).toBeGreaterThan(0.97);
  });

  it("同一個種子的備選命盤每次相同", () => {
    expect(rolling(11, { zeshen: 2 }).altCharts).toEqual(rolling(11, { zeshen: 2 }).altCharts);
  });

  it("改選備選命盤：換進去，原本的換到備選位置，再選回來就還原", () => {
    const s = rolling(5, { zeshen: 1 });
    const picked = pickChart(s, 0);
    expect(picked.attributes).toEqual(s.altCharts[0].attributes);
    expect(picked.spiritRootId).toBe(s.altCharts[0].spiritRootId);
    expect(picked.rngSeed).toBe(s.altCharts[0].rngSeed);
    expect(picked.altCharts[0].attributes).toEqual(s.attributes);
    const back = pickChart(picked, 0);
    expect(back.attributes).toEqual(s.attributes);
    expect(back.rngSeed).toBe(s.rngSeed);
    expect(back.goalIds).toEqual(s.goalIds);
    // 超出範圍或不在擲骰階段不動
    expect(pickChart(s, 1)).toBe(s);
    const started = startLife(s, data);
    expect(pickChart(started, 0)).toBe(started);
  });

  it("玩家改過的姓名不會被換盤改掉；重擲重抽備選；開始修行後備選清空", () => {
    const s = { ...rolling(5, { zeshen: 1 }), name: "自訂名", nameCustom: true };
    expect(pickChart(s, 0).name).toBe("自訂名");
    const again = reroll({ ...s, rerolls: 1 }, data);
    expect(again.altCharts).toHaveLength(1);
    expect(again.altCharts[0].rngSeed).not.toBe(s.altCharts[0].rngSeed);
    expect(startLife(s, data).altCharts).toEqual([]);
  });

  it("存檔往返保留備選命盤；v25 遷移補空；只有擲骰階段可以有備選命盤", () => {
    const s = rolling(5, { zeshen: 2 });
    expect(deserialize(serialize(s))).toEqual(s);
    const old = JSON.parse(serialize(rolling(5)));
    old.version = 25;
    for (const k of ["altCharts", "wishId", "omenLeft", "omen"]) delete old[k];
    const m = deserialize(JSON.stringify(old));
    expect([m.altCharts, m.wishId, m.omenLeft, m.omen]).toEqual([[], null, 0, []]);
    const bad = JSON.parse(serialize(s));
    bad.phase = "living";
    expect(() => deserialize(JSON.stringify(bad))).toThrow("altCharts");
    const bad2 = JSON.parse(serialize(s));
    bad2.altCharts[0].spiritRootId = "nope";
    expect(() => deserialize(JSON.stringify(bad2))).toThrow("altCharts[0].spiritRootId");
  });
});

describe("夙願：指定本世目標", () => {
  const goal = (id: string) => data.goals.find((g) => g.id === id)!;

  it("1 級只能從本世的目標挑，2 級可從已解鎖的全部目標挑", () => {
    const s1 = rolling(3, { suyuan: 1 });
    expect(wishLevel(s1, data)).toBe(1);
    expect(wishChoices(s1, data).map((g) => g.id).sort()).toEqual([...s1.goalIds].sort());
    expect(setWish(s1, "no_such", data)).toBe(s1);
    const outside = data.goals.find((g) => !s1.goalIds.includes(g.id) && g.minLives <= 0)!;
    expect(setWish(s1, outside.id, data)).toBe(s1);
    const s2 = rolling(3, { suyuan: 2 });
    expect(wishChoices(s2, data).every((g) => g.minLives <= s2.meta.lives)).toBe(true);
    expect(wishChoices(rolling(3), data)).toEqual([]);
  });

  it("指定本世目標裡的一個：只設 wishId；指定清單外的：換進目標清單、同群組先讓位、長度不變", () => {
    const s = rolling(3, { suyuan: 2 });
    const inList = setWish(s, s.goalIds[1], data);
    expect(inList.wishId).toBe(s.goalIds[1]);
    expect(inList.goalIds).toEqual(s.goalIds);
    const outside = data.goals.find((g) => !s.goalIds.includes(g.id) && g.minLives <= 0)!;
    const swapped = setWish(s, outside.id, data);
    expect(swapped.wishId).toBe(outside.id);
    expect(swapped.goalIds).toContain(outside.id);
    expect(swapped.goalIds).toHaveLength(s.goalIds.length);
    const groups = swapped.goalIds.map((id) => goal(id).group);
    expect(new Set(groups).size).toBe(groups.length);
    expect(setWish(swapped, null, data).wishId).toBeNull();
  });

  it("重擲會取消夙願；開始修行後夙願保留但不能再改", () => {
    const base = rolling(3, { suyuan: 1 });
    const s = setWish(base, base.goalIds[0], data);
    expect(s.wishId).not.toBeNull();
    expect(reroll({ ...s, rerolls: 1 }, data).wishId).toBeNull();
    const living1 = startLife(s, data);
    expect(living1.wishId).toBe(s.wishId);
    expect(setWish(living1, null, data)).toBe(living1);
  });

  it("夙願讓掛鉤的事件權重 ×倍率，其他事件不變；沒有指定或目標沒掛鉤時為 1", () => {
    const orphan = data.events.find((e) => e.id === "orphan_001")!;
    const plain = data.events.find((e) => e.id === "flood_001")!;
    const base = living(1, { goalIds: ["raise_child"] });
    expect(wishWeightMult(base, orphan, data)).toBe(1);
    const wished = { ...base, wishId: "raise_child" };
    expect(wishWeightMult(wished, orphan, data)).toBe(data.config.wishWeightMult);
    expect(wishWeightMult(wished, plain, data)).toBe(1);
    // 後段事件（要求旗標）也掛得上
    const later = data.events.find((e) => e.id === "orphan_002")!;
    expect(wishWeightMult(wished, later, data)).toBe(data.config.wishWeightMult);
    // 沒掛鉤的目標（年歲）只是標記
    expect(wishWeightMult({ ...base, goalIds: ["age_60"], wishId: "age_60" }, orphan, data)).toBe(1);
    // 故人目標掛上重逢事件
    const reunion = data.events.find((e) => e.conditions.acquaintance)!;
    expect(wishWeightMult({ ...base, goalIds: ["meet_old_friend"], wishId: "meet_old_friend" }, reunion, data)).toBe(data.config.wishWeightMult);
  });

  it("夙願真的讓被掛鉤的事件更常被抽到（統計）", () => {
    const only = (id: string): EventDef => ({ ...data.events.find((e) => e.id === id)!, conditions: {}, guaranteed: false, weight: 10, tone: "neutral" });
    const d = { ...data, events: [only("orphan_001"), only("flood_001")] };
    const hits = (wishId: string | null): number => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const s = living(seed, { goalIds: ["raise_child"], wishId });
        if (pickEvent(s, d)[0]?.id === "orphan_001") n++;
      }
      return n;
    };
    expect(hits("raise_child")).toBeGreaterThan(hits(null) * 1.3);
  });

  it("存檔：夙願必須是本世目標之一", () => {
    const base = rolling(3, { suyuan: 1 });
    const s = setWish(base, base.goalIds[0], data);
    expect(deserialize(serialize(s))).toEqual(s);
    const bad = JSON.parse(serialize(s));
    bad.wishId = "no_such";
    expect(() => deserialize(JSON.stringify(bad))).toThrow("wishId");
  });
});

describe("靈犀：窺看結局傾向", () => {
  const outcome = (effects: object, omen?: Omen) => ({ weight: 1, text: "。", effects, ...(omen ? { omen } : {}) });
  const choice = (outcomes: ChoiceDef["outcomes"]): ChoiceDef => ({ text: "選", outcomes });
  const eventOf3 = (): EventDef => ({
    id: "omen_test",
    type: "choice",
    title: "測試",
    text: "測試。",
    weight: 1,
    tone: "neutral",
    maxPerLife: 1,
    conditions: {},
    choices: [
      choice([outcome({ spiritStones: 30 }), outcome({ spiritStones: -50 })]),
      choice([outcome({ spiritStones: 30 })]),
      choice([outcome({ death: true })]),
    ],
  });
  const dataWith = (e: EventDef) => ({ ...data, events: [e] });
  const waiting = (omenLeft: number, seed = 1): GameState => ({ ...living(seed, { omenLeft, ageMonths: 400, spiritStones: 100 }), pendingEvent: "omen_test" });

  it("吉凶由效果推出：死亡與損失為凶、收穫為吉、有得有失與無效果為平，可被 omen 欄位覆蓋", () => {
    expect(omenOf(outcome({ spiritStones: 5 }), data)).toBe("good");
    expect(omenOf(outcome({ items: { juqi_dan: 1 } }), data)).toBe("good");
    expect(omenOf(outcome({ fragment: { maxTier: 1 } }), data)).toBe("good");
    expect(omenOf(outcome({ death: true }), data)).toBe("bad");
    expect(omenOf(outcome({ lifespan: -5 }), data)).toBe("bad");
    expect(omenOf(outcome({ attributes: { mind: -1 } }), data)).toBe("bad");
    expect(omenOf(outcome({ spiritStones: -data.config.omenLossStones }), data)).toBe("bad");
    // 小額損失不算凶
    expect(omenOf(outcome({ spiritStones: -1 }), data)).toBe("neutral");
    expect(omenOf(outcome({ spiritStones: -300, attributes: { mind: 1 } }), data)).toBe("neutral");
    expect(omenOf(outcome({}), data)).toBe("neutral");
    expect(omenOf(outcome({ spiritStones: 50 }, "bad"), data)).toBe("bad");
  });

  it("窺看的就是這一次實際會落到的結果：吉凶與選了之後的實際結果一致，且不動亂數", () => {
    const d = dataWith(eventOf3());
    for (let seed = 1; seed <= 60; seed++) {
      const s = waiting(3, seed);
      for (let c = 0; c < 3; c++) {
        const peeked = peekOmen(s, c, d);
        expect(peeked.rngSeed).toBe(s.rngSeed);
        expect(peeked.omenLeft).toBe(2);
        const tendency = peeked.omen[0].omen;
        const after = chooseEvent(peeked, c, d);
        const delta = after.spiritStones - s.spiritStones;
        if (tendency === "good") expect(delta).toBeGreaterThan(0);
        if (tendency === "bad") expect(delta < 0 || after.phase !== "living").toBe(true);
        expect(after.omen).toEqual([]);
      }
    }
  });

  it("次數用完、已窺看過、沒有抉擇、前提不足的選項都不能窺看", () => {
    const e = eventOf3();
    const d = dataWith(e);
    const s = waiting(1);
    expect(canPeek(s, 0, d)).toBe(true);
    const once = peekOmen(s, 0, d);
    expect(canPeek(once, 0, d)).toBe(false);
    expect(peekOmen(once, 0, d)).toBe(once);
    expect(canPeek(waiting(0), 0, d)).toBe(false);
    expect(canPeek(living(1, { omenLeft: 3 }), 0, d)).toBe(false);
    expect(canPeek(s, 9, d)).toBe(false);
    const gated = { ...e, choices: [{ ...e.choices![0], requires: { spiritStones: 9999 } }, ...e.choices!.slice(1)] };
    expect(canChoose(s, gated.choices[0])).toBe(false);
    expect(canPeek(s, 0, dataWith(gated))).toBe(false);
  });

  it("每世的次數依等級給；存檔往返與檢查", () => {
    const s = startLife(rolling(4, { lingxi: 3 }), data);
    expect(s.omenLeft).toBe(3);
    expect(startLife(rolling(4), data).omenLeft).toBe(0);
    const after = newLife({ ...s, phase: "dead" }, data);
    expect(after.phase).toBe("rolling");
    const e = eventOf3();
    const w = peekOmen(waiting(2), 1, dataWith(e));
    // 存檔檢查用真實事件 id（存檔載入時會對照資料）
    const real = { ...w, pendingEvent: "flood_001" } as GameState;
    expect(deserialize(serialize(real)).omen).toHaveLength(1);
    const bad = JSON.parse(serialize(real));
    bad.omen[0].omen = "lucky";
    expect(() => deserialize(JSON.stringify(bad))).toThrow("omen[0].omen");
    const bad2 = JSON.parse(serialize({ ...w, pendingEvent: null }));
    expect(() => deserialize(JSON.stringify(bad2))).toThrow("omen[0].choice");
  });
});

describe("資料格式檢查", () => {
  it("設定、天賦、目標夙願掛鉤、事件結果傾向的錯誤指出欄位", () => {
    expect(() => validateConfig({ ...data.config, wishWeightMult: 0.5 })).toThrow("wishWeightMult");
    expect(() => validateConfig({ ...data.config, chartPowerTolerance: 0 })).toThrow("chartPowerTolerance");
    expect(() => validateConfig({ ...data.config, omenLossStones: 0 })).toThrow("omenLossStones");
    const t = data.talents.find((x) => x.id === "lingxi")!;
    expect(() => validateTalents([{ ...t, effect: "luck" }])).toThrow("欄位 effect");
    const g = data.goals.find((x) => x.id === "raise_child")!;
    expect(() => validateGoals([{ ...g, tilt: { flags: "x" } }])).toThrow("tilt");
    expect(() => validateGoals([{ ...g, tilt: {} }])).toThrow("tilt");
    expect(() => validateGoals([{ ...g, tilt: { bogus: ["x"] } }])).toThrow("bogus");
    const ev = JSON.parse(JSON.stringify(data.events.find((e) => e.type === "choice")));
    ev.choices[0].outcomes[0].omen = "lucky";
    expect(() => validateEvents([ev])).toThrow("omen");
  });

  it("夙願掛鉤的事件與故人都真的存在", () => {
    for (const g of data.goals) {
      for (const id of g.tilt?.eventIds ?? []) expect(data.events.some((e) => e.id === id), `${g.id}.${id}`).toBe(true);
      for (const id of g.tilt?.acquaintances ?? []) expect(data.acquaintances.some((a) => a.id === id), `${g.id}.${id}`).toBe(true);
    }
  });
});
