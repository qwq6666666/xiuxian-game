import { describe, expect, it } from "vitest";
import { canBreakthrough, currentBreakthroughRate, currentFailLoss, missingTalent } from "../../src/core/character/breakthrough";
import { breakthroughRate, stageNeed } from "../../src/core/formulas";
import { YUANYING_FLAG, endLife } from "../../src/core/character/review";
import { deserialize, serialize } from "../../src/core/save";
import { emptyMeta } from "../../src/core/state";
import { gameData } from "../../src/data/load";
import { validateRealms } from "../../src/data/validate";
import { collectionSummary, describeTalent, formatReviewSummary, reviewTitle } from "../../src/ui/format";
import { living, seedWhere, attemptBreakthrough } from "../helpers";

const yuanying = gameData.realms.find((r) => r.id === "yuanying")!;
const huashen = gameData.realms.find((r) => r.id === "huashen")!;
const rule = yuanying.breakthroughRule!;
const ningshen = gameData.talents.find((t) => t.id === "ningshen")!;

// 元嬰過的世：元嬰後期圓滿，卡在瓶頸
const atCap = (level: number, patch = {}) =>
  living(2, {
    realmId: "yuanying",
    stage: 2,
    cultivation: stageNeed(yuanying, 2),
    attributes: { bone: 5, insight: 10, fortune: 5, mind: 5 },
    originId: "orphan",
    flags: [YUANYING_FLAG],
    meta: { ...emptyMeta(), yuanying: { orphan: 1 }, talents: { ningshen: level } },
    ...patch,
  });

describe("化神：資料", () => {
  it("化神是最後一個境界，單一階段，進入即結束，結束方式為 huashen", () => {
    expect(gameData.realms[gameData.realms.length - 1].id).toBe("huashen");
    expect(huashen).toMatchObject({ endsLife: "always", ending: "huashen", lifespan: 2000, daoYun: 2000, stageNames: [""] });
  });
  it("凝神：6 級、起始價 900、成長 1.5；元嬰的突破規則引用它，且沒有丹藥", () => {
    expect(ningshen).toMatchObject({ maxLevel: 6, effect: "breakthroughAid", cost: { base: 1100, growth: 1.5 } });
    expect(rule.requiresTalent).toEqual({ id: "ningshen", level: 4 });
    expect(rule.talentRate).toEqual({ id: "ningshen", from: 4, perLevel: 0.08 });
    expect(rule.pillId).toBeUndefined();
    expect(rule.gateText).toBeTruthy();
  });
  it("文字不洩漏來源：不出現天光、梯、絕通", () => {
    const all = JSON.stringify(gameData.text.review.huashen) + gameData.text.log.breakthroughSuccess.huashen + rule.gateText + ningshen.desc;
    for (const w of ["天光", "梯", "絕通"]) expect(all.includes(w), w).toBe(false);
  });
  it("最後一個境界不是 always 時報錯", () => {
    const base = JSON.parse(JSON.stringify(gameData.realms));
    const bad = base.map((r: object, i: number) => (i === base.length - 1 ? { ...r, endsLife: "never" } : r));
    expect(() => validateRealms(bad)).toThrow("最後一個境界必須是");
  });
});

describe("化神：突破", () => {
  it("成功率 = 基礎 + 悟性 + 凝神超過 4 級的每級加成，沒有丹藥", () => {
    const at = (lv: number) => breakthroughRate(rule, 10, false, { ningshen: lv });
    expect(at(4)).toBeCloseTo(rule.baseRate + 10 * rule.insightBonus);
    expect(at(6)).toBeCloseTo(at(4) + 2 * rule.talentRate!.perLevel);
    expect(at(0)).toBeCloseTo(at(4));
    expect(currentBreakthroughRate(atCap(6), true)).toBeCloseTo(at(6));
  });
  it("凝神不足 4 級不能嘗試，並指出缺什麼", () => {
    const s = atCap(3);
    expect(missingTalent(s)).toEqual({ id: "ningshen", level: 4 });
    expect(canBreakthrough(s)).toBe(false);
    expect(attemptBreakthrough(s, false)).toBe(s);
    expect(canBreakthrough(atCap(4))).toBe(true);
  });
  it("元嬰修為未圓滿時不能突破", () => {
    expect(canBreakthrough(atCap(4, { cultivation: 1 }))).toBe(false);
  });
  it("成功：結束這一世，化神次數加一，通關與元嬰次數不動，道韻照化神結算", () => {
    const s = atCap(4, { rngSeed: seedWhere((v) => v < 0.1) });
    const t = attemptBreakthrough(s, false);
    expect(t.phase).toBe("cleared");
    expect(t.realmId).toBe("huashen");
    expect(t.review?.cause).toBe("huashen");
    expect(t.meta.huashen).toEqual({ orphan: 1 });
    expect(t.meta.yuanying).toEqual({ orphan: 1 });
    expect(t.meta.clears).toEqual({});
    expect(t.meta.daoYun).toBeGreaterThanOrEqual(2000);
    expect(t.log[t.log.length - 1].kind).toBe("breakthroughSuccess");
  });
  it("失敗：不致死，損失修為，可再試", () => {
    const s = atCap(4, { rngSeed: seedWhere((v) => v >= 0.99) });
    const t = attemptBreakthrough(s, false);
    expect(t.phase).toBe("living");
    expect(t.realmId).toBe("yuanying");
    expect(t.cultivation).toBeCloseTo(s.cultivation * (1 - currentFailLoss(s)));
    expect(t.log[t.log.length - 1].kind).toBe("breakthroughFail");
  });
  it("只結算一次", () => {
    const t = attemptBreakthrough(atCap(4, { rngSeed: seedWhere((v) => v < 0.1) }), false);
    expect(endLife(t, "huashen")).toBe(t);
  });
});

describe("化神：回顧、收藏與存檔", () => {
  const done = () => attemptBreakthrough(atCap(4, { rngSeed: seedWhere((v) => v < 0.1) }), false);
  it("標題與文字", () => {
    const t = done();
    expect(reviewTitle(t.review)).toBe("化神大成");
    expect(formatReviewSummary(t.review!, gameData)).toContain("化神");
    expect(describeTalent(ningshen, 2)).toContain("2 級");
  });
  it("收藏摘要加總各出身的化神次數", () => {
    const s = collectionSummary({ ...emptyMeta(), huashen: { orphan: 2, farmer: 1 } }, gameData);
    expect(s.huashenTotal).toBe(3);
    expect(s.rows.find((r) => r.id === "orphan")?.huashen).toBe(2);
  });
  it("存檔往返保留化神紀錄；v13 存檔遷移補上空紀錄；壞資料指出欄位", () => {
    const t = done();
    expect(deserialize(serialize(t)).meta.huashen).toEqual({ orphan: 1 });
    const old = JSON.parse(serialize(t));
    old.version = 13;
    delete old.meta.huashen;
    expect(deserialize(JSON.stringify(old)).meta.huashen).toEqual({});
    const bad = JSON.parse(serialize(t));
    bad.meta.huashen = { ghost: 1 };
    expect(() => deserialize(JSON.stringify(bad))).toThrow("meta.huashen.ghost");
  });
});
