import { describe, expect, it } from "vitest";
import { buyTalent, canBuyTalent } from "../src/core/actions";
import {
  attemptBreakthrough,
  canBreakthrough,
  currentBreakthroughRate,
  missingTalent,
} from "../src/core/breakthrough";
import { breakthroughRate, stageNeed, talentCost } from "../src/core/formulas";
import { newLife } from "../src/core/life";
import { CLEARED_FLAG, endLife } from "../src/core/review";
import { deserialize, serialize } from "../src/core/save";
import { emptyMeta, SAVE_VERSION } from "../src/core/state";
import { gameData } from "../src/data/load";
import { validateGameData, validateRealms, validateTalents, validateText } from "../src/data/validate";
import { collectionSummary, describeTalent, formatReviewSummary, reviewTitle } from "../src/ui/format";
import { living, seedWhere } from "./helpers";

const jindan = gameData.realms.find((r) => r.id === "jindan")!;
const rule = jindan.breakthroughRule!;
const shenguang = gameData.talents.find((t) => t.id === "shenguang")!;
const atCap = (level: number, patch = {}) =>
  living(1, {
    realmId: "jindan",
    stage: 2,
    cultivation: stageNeed(jindan, 2),
    attributes: { bone: 5, insight: 10, fortune: 5, mind: 5 },
    originId: "orphan",
    flags: [CLEARED_FLAG],
    meta: { ...emptyMeta(), clears: { orphan: 1 }, talents: { shenguang: level } },
    ...patch,
  });

describe("結嬰：成功率與門檻", () => {
  it("資料：元嬰三階段，第一次元嬰結束這一世且結束方式為 yuanying", () => {
    const last = gameData.realms.find((r) => r.id === "yuanying")!;
    expect(last).toMatchObject({ endsLife: "untilYuanying", ending: "yuanying", stageNames: ["初期", "中期", "後期"] });
    expect(rule.requiresTalent).toEqual({ id: "shenguang", level: 4 });
  });

  it("成功率 = 基礎 + 悟性 + 神光超過門檻的每級加成，沒有丹藥", () => {
    const at = (lv: number) => breakthroughRate(rule, 10, false, { shenguang: lv });
    expect(at(4)).toBeCloseTo(rule.baseRate + 10 * rule.insightBonus);
    expect(at(5)).toBeCloseTo(at(4) + rule.talentRate!.perLevel);
    expect(at(6)).toBeCloseTo(at(4) + 2 * rule.talentRate!.perLevel);
    expect(at(0)).toBeCloseTo(at(4)); // 未超過門檻不扣分，也不加分
    expect(breakthroughRate(rule, 10, true, { shenguang: 6 })).toBeCloseTo(at(6));
  });

  it("神光不足門檻時不能結嬰，並指出缺什麼", () => {
    const s = atCap(3);
    expect(missingTalent(s)).toEqual({ id: "shenguang", level: 4 });
    expect(canBreakthrough(s)).toBe(false);
    expect(attemptBreakthrough(s, false)).toBe(s);
    expect(canBreakthrough(atCap(4))).toBe(true);
    expect(missingTalent(atCap(4))).toBeNull();
  });

  it("目前成功率會算進神光", () => {
    expect(currentBreakthroughRate(atCap(6), false)).toBeGreaterThan(currentBreakthroughRate(atCap(4), false));
  });
});

describe("結嬰：結果", () => {
  it("成功：結束這一世，元嬰次數加一，通關次數不動，道韻照元嬰結算", () => {
    const s = atCap(4, { rngSeed: seedWhere((v) => v < 0.1) });
    const t = attemptBreakthrough(s, false);
    expect(t.phase).toBe("cleared");
    expect(t.realmId).toBe("yuanying");
    expect(t.review?.cause).toBe("yuanying");
    expect(t.meta.yuanying).toEqual({ orphan: 1 });
    expect(t.meta.clears).toEqual({ orphan: 1 });
    expect(t.meta.daoYun).toBeGreaterThanOrEqual(gameData.realms[4].daoYun);
    expect(newLife(t).meta.yuanying).toEqual({ orphan: 1 });
  });

  it("失敗：損失修為，可再試，不記元嬰", () => {
    const s = atCap(4, { rngSeed: seedWhere((v) => v > 0.9) });
    const t = attemptBreakthrough(s, false);
    expect(t.realmId).toBe("jindan");
    expect(t.phase).toBe("living");
    expect(t.cultivation).toBeLessThan(s.cultivation);
    expect(t.meta.yuanying).toEqual({});
  });

  it("結束畫面標題與文字：元嬰大成，不洩漏來源", () => {
    const t = endLife(atCap(4, { realmId: "yuanying", stage: 0 }), "yuanying");
    expect(reviewTitle(t.review)).toBe("元嬰大成");
    expect(formatReviewSummary(t.review!, gameData)).toContain("終身元嬰");
    const all = JSON.stringify(gameData.text.review.yuanying) + gameData.text.breakthroughGate + shenguang.desc;
    expect(all).not.toMatch(/天光|梯|絕通/);
  });

  it("死亡不記元嬰", () => {
    expect(endLife(atCap(6), "lifespan").meta.yuanying).toEqual({});
  });
});

describe("神光天賦", () => {
  it("價格依成長率，上限 6 級，道韻足夠才能買", () => {
    expect(shenguang.maxLevel).toBe(6);
    expect(talentCost(shenguang, 0)).toBe(250);
    expect(talentCost(shenguang, 1)).toBe(375);
    const dead = { ...endLife(atCap(0), "lifespan"), meta: { ...emptyMeta(), daoYun: 250 } };
    expect(canBuyTalent(dead, "shenguang")).toBe(true);
    expect(buyTalent(dead, "shenguang").meta.talents.shenguang).toBe(1);
    expect(canBuyTalent({ ...dead, meta: { ...dead.meta, daoYun: 249 } }, "shenguang")).toBe(false);
  });

  it("說明文字帶出等級", () => {
    expect(describeTalent(shenguang, 2)).toContain("2 級");
  });
});

describe("收藏與存檔", () => {
  it("收藏摘要含各出身元嬰次數與總數", () => {
    const sum = collectionSummary({ ...emptyMeta(), clears: { farmer: 2 }, yuanying: { orphan: 1, farmer: 1 } }, gameData);
    expect(sum.yuanyingTotal).toBe(2);
    expect(sum.rows.find((r) => r.id === "orphan")!.yuanying).toBe(1);
    expect(sum.rows.find((r) => r.id === "farmer")).toMatchObject({ count: 2, yuanying: 1 });
  });

  it("存讀保留元嬰次數；未知出身或次數不合法時指出欄位", () => {
    const s = living(1, { meta: { ...emptyMeta(), yuanying: { orphan: 2 } } });
    expect(deserialize(serialize(s)).meta.yuanying).toEqual({ orphan: 2 });
    const good = JSON.parse(serialize(living(1)));
    const bad = (yuanying: unknown) => () => deserialize(JSON.stringify({ ...good, meta: { ...good.meta, yuanying } }));
    expect(bad({ ghost: 1 })).toThrow("meta.yuanying.ghost");
    expect(bad({ orphan: 0 })).toThrow("meta.yuanying.orphan");
    expect(bad([])).toThrow("meta.yuanying");
  });

  it("v9 存檔遷移：元嬰紀錄為空，其餘保留", () => {
    const cur = living(3, { meta: { ...emptyMeta(), daoYun: 9, clears: { orphan: 2 } } });
    const meta: Record<string, unknown> = { ...cur.meta };
    delete meta.yuanying;
    const s = deserialize(JSON.stringify({ ...cur, version: 9, meta }));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.meta.yuanying).toEqual({});
    expect(s.meta.clears).toEqual({ orphan: 2 });
    expect(s.meta.daoYun).toBe(9);
  });
});

describe("資料檢查：突破門檻與結束方式", () => {
  const realms = () => JSON.parse(JSON.stringify(gameData.realms));
  const withRule = (patch: object) =>
    realms().map((r: { id: string; breakthroughRule: object }) =>
      r.id === "jindan" ? { ...r, breakthroughRule: { ...r.breakthroughRule, ...patch } } : r,
    );

  it("天賦 id 不存在或等級超過上限時指出哪一筆", () => {
    const bad = (rs: unknown) => () => validateGameData({ ...gameData, realms: validateRealms(rs) });
    expect(bad(withRule({ requiresTalent: { id: "ghost", level: 1 } }))).toThrow("ghost");
    expect(bad(withRule({ requiresTalent: { id: "shenguang", level: 99 } }))).toThrow("超過天賦上限");
    expect(bad(withRule({ talentRate: { id: "shenguang", from: 4, perLevel: 0 } }))).toThrow("perLevel");
  });

  it("ending 不合法時報錯；effect 認得 breakthroughAid", () => {
    const rs = realms().map((r: object, i: number) => (i === 4 ? { ...r, ending: "zzz" } : r));
    expect(() => validateRealms(rs)).toThrow("ending");
    expect(() => validateTalents([{ ...gameData.talents[0], effect: "nope" }])).toThrow("breakthroughAid");
  });

  it("text.json 缺 breakthroughGate 或 review.yuanying 時指出欄位", () => {
    const t = { ...gameData.text } as Record<string, unknown>;
    delete t.breakthroughGate;
    expect(() => validateText(t)).toThrow("breakthroughGate");
    const r = { ...gameData.text.review } as Record<string, unknown>;
    delete r.yuanying;
    expect(() => validateText({ ...gameData.text, review: r })).toThrow("yuanying");
  });
});
