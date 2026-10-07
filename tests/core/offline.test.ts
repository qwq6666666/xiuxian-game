import { describe, expect, it } from "vitest";
import { gameData as data } from "../../src/data/load";
import { lifespanMonths } from "../../src/core/formulas";
import { applyOffline } from "../../src/core/offline";
import { realmOf } from "../../src/core/progress";
import { tick } from "../../src/core/tick";
import { lianqiNeed, living } from "../helpers";

const HOUR = 3_600_000;

describe("離線進度", () => {
  it("閉關推進年齡與修為，結果與一般閉關 tick 相同", () => {
    const s = living(3);
    const { state, summary } = applyOffline(s, 100 * data.config.msPerMonth + 500, data);
    expect(summary).toMatchObject({ months: 100, stop: "elapsed" });
    expect(state.ageMonths).toBe(s.ageMonths + 100);
    const ref = tick(s, 100, data);
    expect(state.stage).toBe(ref.stage);
    expect(state.cultivation).toBeCloseTo(ref.cultivation, 6);
    expect(summary.gained).toBeGreaterThan(0);
  });

  it("前景補算：較小的門檻與遊戲速度倍率", () => {
    const s = living(3);
    const ms = 10 * data.config.msPerMonth;
    expect(applyOffline(s, ms, data).summary.months).toBe(0);
    const bg = { minSeconds: data.config.backgroundMinSeconds };
    expect(applyOffline(s, ms, data, bg).summary.months).toBe(10);
    expect(applyOffline(s, ms, data, { ...bg, speed: 4 }).summary.months).toBe(40);
    expect(applyOffline(s, 2_000, data, bg).summary.months).toBe(0);
  });

  it("不觸發事件、不改變靈石與亂數", () => {
    const s = living(5, { eventThreshold: 1, schedule: "adventure" });
    const { state } = applyOffline(s, 30 * data.config.msPerMonth, data);
    expect(state.pendingEvent).toBeNull();
    expect(state.eventCounts).toEqual({});
    expect(state.spiritStones).toBe(s.spiritStones);
    expect(state.rngSeed).toBe(s.rngSeed);
  });

  it("卡在大境界瓶頸就停止", () => {
    const { state, summary } = applyOffline(living(2, { realmId: "lianqi", stage: 8, cultivation: lianqiNeed(8) - 5 }), 168 * HOUR, data);
    expect(summary.stop).toBe("bottleneck");
    expect(summary.months).toBeGreaterThan(0);
    expect(state.phase).toBe("living");
  });

  it("壽元剩餘不足門檻就停止，且不會死亡", () => {
    const realm = data.realms[1];
    const total = lifespanMonths(realm, 0);
    const s = living(2, { realmId: realm.id, stage: 0, ageMonths: Math.floor(total * 0.85) });
    const { state, summary } = applyOffline(s, 168 * HOUR, data);
    expect(state.phase).toBe("living");
    expect(summary.stop).toBe("lifespan");
    const left = total - state.ageMonths;
    expect(left).toBeGreaterThanOrEqual(total * data.config.offlineStopLifespanRatio);
    expect(realmOf(state, data).id).toBe(realm.id);
  });

  it("單次閉關年數有上限", () => {
    const s = living(2, { realmId: "lianqi", stage: 0, lifespanBonus: 100000, cultivation: 0 });
    const { summary } = applyOffline(s, 168 * HOUR, data);
    expect(summary.months).toBeLessThanOrEqual(data.config.offlineMaxYears * 12);
  });

  it("離線時間有上限", () => {
    const s = living(2, { realmId: "lianqi", stage: 0, lifespanBonus: 100000, cultivation: 0 });
    const { summary } = applyOffline(s, 10_000 * HOUR, data);
    expect(summary.months).toBeLessThanOrEqual((data.config.offlineMaxHours * HOUR) / data.config.msPerMonth);
  });

  it("閉關結束時在日誌補一筆見聞，記下月數與結束原因", () => {
    const s = living(3);
    const { state, summary } = applyOffline(s, 100 * data.config.msPerMonth, data);
    const last = state.log[state.log.length - 1];
    expect(last).toMatchObject({ kind: "retreat", retreatMonths: 100, stop: "elapsed", month: state.ageMonths });
    expect(summary.months).toBe(100);
  });

  it("卡瓶頸時見聞記下 bottleneck，沒閉關則不寫", () => {
    const s = living(2, { realmId: "lianqi", stage: 8, cultivation: lianqiNeed(8) - 5 });
    const { state } = applyOffline(s, 168 * HOUR, data);
    expect(state.log[state.log.length - 1]).toMatchObject({ kind: "retreat", stop: "bottleneck" });
    const full = living(2, { realmId: "lianqi", stage: 8, cultivation: lianqiNeed(8) });
    const r = applyOffline(full, 168 * HOUR, data);
    expect(r.state.log.some((e) => e.kind === "retreat")).toBe(false);
  });

  it("見聞不影響亂數與修為結果", () => {
    const s = living(4);
    const { state } = applyOffline(s, 100 * data.config.msPerMonth, data);
    expect(state.rngSeed).toBe(s.rngSeed);
    expect(state.log.filter((e) => e.kind === "retreat")).toHaveLength(1);
  });

  it("時間太短、負數、非修行中或等待抉擇時原樣回傳", () => {
    const s = living(1);
    for (const ms of [0, -5000, 10_000, Number.NaN]) {
      const r = applyOffline(s, ms, data);
      expect(r.state).toBe(s);
      expect(r.summary.months).toBe(0);
    }
    const dead = { ...s, phase: "dead" as const };
    expect(applyOffline(dead, HOUR, data).state).toBe(dead);
    const pending = { ...s, pendingEvent: "rain_001" };
    expect(applyOffline(pending, HOUR, data).state).toBe(pending);
  });
});
