import { describe, expect, it } from "vitest";
import { breakthroughRateParts, currentBreakthroughRate } from "../src/core/breakthrough";
import { advanceStreak, fatigueMult, fatigueMultAt, fatigueRule } from "../src/core/fatigue";
import { studyRate } from "../src/core/formulas";
import { monthlyGain } from "../src/core/gain";
import { newLife } from "../src/core/life";
import { applyOffline } from "../src/core/offline";
import { deserialize, serialize } from "../src/core/save";
import { setSchedule } from "../src/core/actions";
import { tick } from "../src/core/tick";
import { gameData as data } from "../src/data/load";
import { validateConfig, validateGameData, validateSchedules } from "../src/data/validate";
import { attemptBreakthrough, lianqiNeed, living } from "./helpers";
import { endLife } from "../src/core/review";

const retreat = data.schedules.find((s) => s.id === "retreat")!;
const rule = retreat.fatigue!;

describe("疲勞（M46）", () => {
  it("寬限期內不受影響，之後逐年遞減，不低於下限", () => {
    expect(fatigueMultAt(rule, 0)).toBe(1);
    expect(fatigueMultAt(rule, rule.graceMonths)).toBe(1);
    expect(fatigueMultAt(rule, rule.graceMonths + 12)).toBeCloseTo(1 - rule.perYear);
    expect(fatigueMultAt(rule, rule.graceMonths + 12 * 1000)).toBe(rule.floor);
  });

  it("只有設了 fatigue 的安排會疲勞，倍率進入每月修為", () => {
    const tired = living(1, { realmId: "zhuji", stage: 0, retreatStreak: rule.graceMonths + 12 * 5, schedule: "retreat" });
    const fresh = { ...tired, retreatStreak: 0 };
    expect(monthlyGain(tired, retreat, data) / monthlyGain(fresh, retreat, data)).toBeCloseTo(fatigueMult(tired, retreat));
    expect(fatigueMult(tired, retreat)).toBeLessThan(1);
    const herb = data.schedules.find((s) => s.id === "herb")!;
    expect(fatigueMult(tired, herb)).toBe(1);
  });

  it("閉關累積連續月數；做別的安排逐月回復；卡在瓶頸不累積", () => {
    let s = living(1, { realmId: "zhuji", stage: 0, cultivation: 0 });
    s = tick(s, 10);
    expect(s.retreatStreak).toBe(10);
    s = setSchedule(s, "adventure", data);
    const before = s.retreatStreak;
    s = tick({ ...s, eventThreshold: 1e9 }, 1);
    expect(s.retreatStreak).toBe(Math.max(0, before - rule.recoverPerMonth));
    const stuck = living(1, { realmId: "zhuji", stage: 2, cultivation: 1e9, retreatStreak: 7 });
    expect(tick(stuck, 5).retreatStreak).toBe(7);
  });

  it("築基以前不疲勞，連續月數也不累積", () => {
    const s = tick(living(1, { realmId: "lianqi", stage: 0, cultivation: 0, retreatStreak: 0 }), 100);
    expect(s.retreatStreak).toBe(0);
    const old = living(1, { realmId: "lianqi", retreatStreak: 9999 });
    expect(fatigueMult(old, retreat, data)).toBe(1);
  });

  it("advanceStreak 在沒有疲勞規則的資料中原樣回傳", () => {
    const noFatigue = { ...data, schedules: data.schedules.map((s) => ({ ...s, fatigue: undefined })) };
    expect(fatigueRule(noFatigue)).toBeUndefined();
    const s = living(1, { retreatStreak: 9 });
    expect(advanceStreak(s, retreat, true, noFatigue)).toBe(s);
  });

  it("離線補算與逐月 tick 的結果相同，連續月數也一致", () => {
    const base = living(2, { realmId: "zhuji", stage: 0, cultivation: 0, lifespanBonus: 100000 });
    const months = 150;
    const viaTick = tick(base, months);
    const { state } = applyOffline(base, months * data.config.msPerMonth, data);
    expect(state.retreatStreak).toBe(viaTick.retreatStreak);
    expect(state.cultivation).toBeCloseTo(viaTick.cultivation);
    expect(state.ageMonths).toBe(viaTick.ageMonths);
  });

  it("轉世歸零，存檔往返保留，v27 的舊檔補零", () => {
    const s = living(3, { retreatStreak: 88, breakthroughStudy: 3 });
    expect(deserialize(serialize(s))).toEqual(s);
    const old = JSON.parse(serialize(s));
    old.version = 27;
    delete old.retreatStreak;
    delete old.breakthroughStudy;
    const m = deserialize(JSON.stringify(old));
    expect([m.retreatStreak, m.breakthroughStudy]).toEqual([0, 0]);
    const next = newLife(endLife(s, "lifespan", data), data);
    expect([next.retreatStreak, next.breakthroughStudy]).toEqual([0, 0]);
  });

  it("資料驗證指出哪個欄位", () => {
    const bad = (patch: object) => () => validateSchedules(data.schedules.map((x) => (x.id === "retreat" ? { ...x, fatigue: { ...rule, ...patch } } : x)));
    expect(bad({ floor: 2 })).toThrow("floor");
    expect(bad({ recoverPerMonth: 0 })).toThrow("recoverPerMonth");
    expect(() => validateGameData({ ...data, schedules: data.schedules.map((x) => (x.id === "retreat" ? { ...x, fatigue: { ...rule, realmMin: "ghost" } } : x)) })).toThrow("ghost");
    expect(() => validateConfig({ ...data.config, breakthroughStudyCap: 2 })).toThrow("breakthroughStudyCap");
  });
});

describe("突破心得（M46）", () => {
  const atGate = (patch = {}) => living(1, { realmId: "lianqi", stage: 8, cultivation: lianqiNeed(8) + 1, ...patch });

  it("加成 = 失敗次數 × 每次加成，不超過上限", () => {
    expect(studyRate(data.config, 0)).toBe(0);
    expect(studyRate(data.config, 2)).toBeCloseTo(2 * data.config.breakthroughStudyBonus);
    expect(studyRate(data.config, 1000)).toBe(data.config.breakthroughStudyCap);
  });

  it("失敗累積心得並提高下次成功率；成功後歸零", () => {
    let s = atGate();
    const base = currentBreakthroughRate(s, false, data);
    let failed = 0;
    for (let seed = 1; seed < 400 && failed === 0; seed++) {
      const t = attemptBreakthrough(atGate({ rngSeed: seed }), false, data);
      if (t.realmId === "lianqi") {
        s = t;
        failed = 1;
      }
    }
    expect(s.breakthroughStudy).toBe(1);
    const refilled = { ...s, cultivation: lianqiNeed(8) + 1 };
    expect(currentBreakthroughRate(refilled, false, data)).toBeCloseTo(base + data.config.breakthroughStudyBonus);
    let won = 0;
    for (let seed = 1; seed < 400 && won === 0; seed++) {
      const t = attemptBreakthrough({ ...refilled, rngSeed: seed }, false, data);
      if (t.realmId !== "lianqi") {
        expect(t.breakthroughStudy).toBe(0);
        won = 1;
      }
    }
    expect(won).toBe(1);
  });

  it("成功率明細加總等於目前成功率", () => {
    const s = atGate({ breakthroughStudy: 2, items: { zhuji_dan: 1 } });
    for (const usePill of [false, true]) {
      const p = breakthroughRateParts(s, usePill, data);
      expect(Math.min(1, p.base + p.insight + p.pill + p.talent + p.study)).toBeCloseTo(p.total);
      expect(p.study).toBeCloseTo(2 * data.config.breakthroughStudyBonus);
    }
    expect(breakthroughRateParts(s, true, data).pill).toBeGreaterThan(0);
    expect(breakthroughRateParts(s, false, data).pill).toBe(0);
  });
});
