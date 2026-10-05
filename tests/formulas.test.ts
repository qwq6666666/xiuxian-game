import { describe, expect, it } from "vitest";
import {
  cultivationPerMonth,
  lifespanMonths,
  msToMonths,
  splitAge,
  stageNeed,
} from "../src/core/formulas";
import { gameData } from "../src/data/load";

const lianqi = gameData.realms.find((r) => r.id === "lianqi")!;
const mortal = gameData.realms.find((r) => r.id === "mortal")!;

describe("formulas", () => {
  it("時間換算", () => {
    expect(msToMonths(1000, 1, 1000)).toBe(1);
    expect(msToMonths(1000, 4, 1000)).toBe(4);
  });

  it("拆分年齡", () => {
    expect(splitAge(125)).toEqual([10, 5]);
  });

  it("每月修為：三靈根、根骨 5 的基準值", () => {
    const v = cultivationPerMonth({
      config: gameData.config,
      rootMult: 1,
      bone: 5,
      realmMult: 1,
      scheduleMult: 1,
      originBonus: 0,
      reincarnationBonus: 0,
    });
    expect(v).toBeCloseTo(1.25);
  });

  it("每月修為：各項倍率相乘", () => {
    const v = cultivationPerMonth({
      config: gameData.config,
      rootMult: 2.5,
      bone: 10,
      realmMult: 3,
      scheduleMult: 0.3,
      originBonus: 0.1,
      reincarnationBonus: 0.2,
    });
    expect(v).toBeCloseTo(1 * 2.5 * 1.5 * 3 * 0.3 * 1.1 * 1.2);
  });

  it("練氣各層修為需求：一層 100、九層約 2563", () => {
    expect(stageNeed(lianqi, 0)).toBe(100);
    expect(stageNeed(lianqi, 1)).toBe(150);
    expect(stageNeed(lianqi, 8)).toBe(2563);
    const total = Array.from({ length: 9 }, (_, i) => stageNeed(lianqi, i)).reduce((a, b) => a + b);
    expect(total).toBeGreaterThan(7400);
    expect(total).toBeLessThan(7600);
  });

  it("凡人修為滿 50 進練氣", () => {
    expect(stageNeed(mortal, 0)).toBe(50);
  });

  it("壽元上限以月計", () => {
    expect(lifespanMonths(mortal)).toBe(960);
    expect(lifespanMonths(lianqi)).toBe(1440);
  });
});
