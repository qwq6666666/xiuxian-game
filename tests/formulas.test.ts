import { describe, expect, it } from "vitest";
import {
  cultivationPerMonth,
  lifespanMonths,
  msToMonths,
  pillPower,
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

  it("練氣各層修為需求：基礎 × 成長率^階段，四捨五入", () => {
    const { base, growth } = lianqi.need;
    for (let i = 0; i < 9; i++) expect(stageNeed(lianqi, i)).toBe(Math.round(base * growth ** i));
    expect(stageNeed(lianqi, 0)).toBe(base);
    expect(stageNeed(lianqi, 8)).toBeGreaterThan(stageNeed(lianqi, 7));
  });

  it("凡人修為滿 50 進練氣", () => {
    expect(stageNeed(mortal, 0)).toBe(50);
  });

  it("壽元上限以月計", () => {
    expect(lifespanMonths(mortal)).toBe(960);
    expect(lifespanMonths(lianqi)).toBe(1440);
  });
});

describe("pillPower", () => {
  it("依服用順序取藥力倍率，超過清單為 0", () => {
    expect(pillPower([1, 0.6, 0.3], 0)).toBe(1);
    expect(pillPower([1, 0.6, 0.3], 2)).toBe(0.3);
    expect(pillPower([1, 0.6, 0.3], 3)).toBe(0);
  });
});
