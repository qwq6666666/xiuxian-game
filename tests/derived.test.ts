import { describe, expect, it } from "vitest";
import { stageNeed } from "../src/core/formulas";
import { monthlyGain } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { formatDuration, formatGain, paceHint, yearsLeft } from "../src/ui/derived";
import { lianqiNeed, living } from "./helpers";

const lianqi = gameData.realms.find((r) => r.id === "lianqi")!;

describe("主畫面衍生顯示", () => {
  it("每月增量與目前安排一致，換安排會變", () => {
    const s = living(1, { realmId: "lianqi", stage: 2, cultivation: 0, schedule: "retreat" });
    const retreat = paceHint(s, gameData);
    const herb = paceHint({ ...s, schedule: "herb" }, gameData);
    expect(retreat.kind).toBe("eta");
    expect(retreat.perMonth).toBeCloseTo(monthlyGain(s, gameData.schedules.find((x) => x.id === "retreat")!, gameData));
    expect(herb.perMonth).toBeLessThan(retreat.perMonth);
    expect(herb.months).toBeGreaterThan(retreat.months);
  });

  it("剩餘月數 = 還差的修為 ÷ 每月增量，無條件進位", () => {
    const s = living(1, { realmId: "lianqi", stage: 0, cultivation: 10 });
    const p = paceHint(s, gameData);
    expect(p.months).toBe(Math.ceil((stageNeed(lianqi, 0) - 10) / p.perMonth));
  });

  it("現實秒數隨速度縮短", () => {
    const s = living(1, { realmId: "lianqi", stage: 0, cultivation: 0, speed: 1 });
    const x1 = paceHint(s, gameData);
    const x4 = paceHint({ ...s, speed: 4 }, gameData);
    expect(x1.seconds).toBeCloseTo((x1.months * gameData.config.msPerMonth) / 1000);
    expect(x4.seconds).toBeCloseTo(x1.seconds / 4);
  });

  it("卡在瓶頸時不給倒數", () => {
    const s = living(1, { realmId: "lianqi", stage: 8, cultivation: lianqiNeed(8) });
    expect(paceHint(s, gameData).kind).toBe("bottleneck");
  });

  it("不在修行中時不估算", () => {
    expect(paceHint({ ...living(1), phase: "dead" }, gameData).kind).toBe("none");
  });

  it("時間與數字的說法", () => {
    expect(formatDuration(0.2)).toBe("1 秒");
    expect(formatDuration(45)).toBe("45 秒");
    expect(formatDuration(150)).toBe("3 分鐘");
    expect(formatDuration(3600)).toBe("1 小時");
    expect(formatDuration(5400 + 60)).toBe("1 小時 31 分");
    expect(formatGain(3.14159)).toBe("3.1");
    expect(formatGain(42.6)).toBe("43");
  });

  it("壽元剩餘整年數不為負", () => {
    expect(yearsLeft(10 * 12, 120)).toBe(110);
    expect(yearsLeft(10 * 12 + 1, 120)).toBe(110);
    expect(yearsLeft(130 * 12, 120)).toBe(0);
  });
});
