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

import { generateWorld, worldAt } from "../src/core/world";
import { worldSlots } from "../src/core/world";
import { attributeGuide, scheduleFactLines, scheduleFacts, scheduleHints } from "../src/ui/derived";

describe("安排的效率數字", () => {
  const sched = (id: string) => gameData.schedules.find((x) => x.id === id)!;

  it("採藥：靈石期望值與攢一顆參考物品的年數由資料算出", () => {
    const s = living(1, { realmId: "lianqi", stage: 1 });
    const f = scheduleFacts(s, sched("herb"), gameData);
    const per = sched("herb").stones.min;
    expect(f.stonesPerMonth).toBe(per);
    expect(f.refYears).toBeCloseTo(f.refPrice / per / 12);
    expect(f.cultivationPct).toBe(20);
    expect(f.perMonth).toBeCloseTo(monthlyGain(s, sched("herb"), gameData));
  });

  it("事件頻率倍率越高，遇事間隔越短；閉關沒有靈石收入", () => {
    const s = living(1, { realmId: "lianqi", stage: 1 });
    const retreat = scheduleFacts(s, sched("retreat"), gameData);
    const adventure = scheduleFacts(s, sched("adventure"), gameData);
    expect(adventure.eventEveryYears).toBeLessThan(retreat.eventEveryYears);
    expect(retreat.refYears).toBeNull();
    expect(scheduleFactLines(retreat).some((l) => l.includes("靈石"))).toBe(false);
    expect(scheduleFactLines(adventure).some((l) => l.includes("性命"))).toBe(true);
  });

  it("走訪渡口的提示隨世局出現，且已填入名稱欄位", () => {
    let shown = 0;
    let hidden = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const age of [20, 60, 100]) {
        const s = living(seed, { worldSeed: seed, ageMonths: age * 12, realmId: "lianqi" });
        const hints = scheduleHints(s, sched("wander"), worldSlots(generateWorld(seed, gameData)), gameData);
        for (const h of hints) expect(h).not.toMatch(/[{}]/);
        if (hints.length > 0) shown++;
        else hidden++;
      }
    }
    expect(shown).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
    // 其他安排沒有提示
    expect(scheduleHints(living(1), sched("retreat"), worldSlots(generateWorld(1, gameData)), gameData)).toEqual([]);
    void worldAt;
  });

  it("屬性說明的百分比取自 config", () => {
    const g = attributeGuide(gameData);
    expect(g.attributes.bone.text).toContain(`${Math.round(gameData.config.bonePerPoint * 100)}%`);
    expect(g.attributes.mind.text).toContain(`${Math.round(gameData.config.mindLossReduction * 100)}%`);
    for (const k of ["bone", "insight", "fortune", "mind"] as const) expect(g.attributes[k].text).not.toContain("#");
  });
});

import { emptyMeta } from "../src/core/state";
import { recommendTalent, talentPreview } from "../src/ui/derived";

describe("天賦頁的推薦與預覽", () => {
  const talent = (id: string) => gameData.talents.find((t) => t.id === id)!;

  it("新玩家被推薦第一個有 advice 的天賦，等級夠了就換下一個", () => {
    expect(recommendTalent(emptyMeta(), gameData)?.talentId).toBe("suhui");
    const upTo = talent("suhui").advice!.upTo;
    expect(recommendTalent({ ...emptyMeta(), talents: { suhui: upTo } }, gameData)?.talentId).toBe("tianjuan");
  });

  it("走到金丹卻缺神光時，優先推薦神光並說出還差幾級；夠了就不再優先", () => {
    const reached = { ...emptyMeta(), reached: ["lianqi:0", "jindan:0"] };
    const r = recommendTalent(reached, gameData)!;
    expect(r.talentId).toBe("shenguang");
    expect(r.reason).toContain("4");
    expect(r.reason).not.toMatch(/[{}]/);
    const done = { ...reached, talents: { shenguang: 4 } };
    expect(recommendTalent(done, gameData)?.talentId).not.toBe("shenguang");
  });

  it("全部都達標時沒有推薦", () => {
    const talents = Object.fromEntries(gameData.talents.map((t) => [t.id, t.advice?.upTo ?? 0]));
    expect(recommendTalent({ ...emptyMeta(), talents }, gameData)).toBeNull();
  });

  it("預覽：升級後效果、道韻缺口、滿級總價；已滿級沒有預覽", () => {
    const s = talent("suhui");
    const lines = talentPreview(s, 0, 0, gameData);
    expect(lines[0]).toContain("1 級");
    expect(lines.some((l) => l.includes("尚差 2"))).toBe(true);
    expect(lines.some((l) => l.startsWith("升到滿級"))).toBe(true);
    expect(talentPreview(s, 0, 999, gameData).some((l) => l.includes("尚差"))).toBe(false);
    expect(talentPreview(s, s.maxLevel, 0, gameData)).toEqual([]);
    for (const l of lines) expect(l).not.toMatch(/[{}]/);
  });

  it("神光的預覽說明結嬰門檻，到門檻前後文字不同", () => {
    const sg = talent("shenguang");
    expect(talentPreview(sg, 0, 0, gameData).some((l) => l.includes("門檻 4 級"))).toBe(true);
    expect(talentPreview(sg, 3, 0, gameData).some((l) => l.includes("已達門檻"))).toBe(true);
  });
});
