import { describe, expect, it } from "vitest";

import { stageNeed } from "../src/core/formulas";
import { applyClear, withFastest, YUANYING_FLAG } from "../src/core/review";
import { deserialize, serialize } from "../src/core/save";
import { emptyMeta } from "../src/core/state";
import { gameData } from "../src/data/load";
import { collectionSummary } from "../src/ui/format";
import { living, seedWhere, attemptBreakthrough } from "./helpers";

describe("各出身最快達成年齡", () => {
  it("沒有紀錄或這次更快才更新；更慢不動", () => {
    const m = emptyMeta();
    const a = withFastest(m, "cleared", "orphan", 1200);
    expect(a.fastest).toEqual({ "cleared:orphan": 1200 });
    expect(withFastest(a, "cleared", "orphan", 1500)).toBe(a);
    expect(withFastest(a, "cleared", "orphan", 1000).fastest["cleared:orphan"]).toBe(1000);
    expect(withFastest(a, "yuanying", "orphan", 5000).fastest).toEqual({ "cleared:orphan": 1200, "yuanying:orphan": 5000 });
  });
  it("通關、元嬰、化神結束一世時都記下當時的年齡", () => {
    const jindan = gameData.realms.find((r) => r.id === "jindan")!;
    const s = living(1, { realmId: "jindan", stage: 2, cultivation: stageNeed(jindan, 2), originId: "orphan", ageMonths: 7777, meta: { ...emptyMeta(), talents: { shenguang: 4 } }, rngSeed: seedWhere((v) => v < 0.1) });
    // 金丹後期圓滿，結嬰：沒元嬰過所以結束這一世，記元嬰年齡
    const t = attemptBreakthrough(s, false);
    expect(t.review?.cause).toBe("yuanying");
    expect(t.meta.fastest["yuanying:orphan"]).toBe(7777);
    // 繼續活著的通關也記
    expect(applyClear({ ...s, ageMonths: 4321 }).meta.fastest["cleared:orphan"]).toBe(4321);
    const huashen = living(2, { realmId: "yuanying", stage: 2, cultivation: stageNeed(gameData.realms.find((r) => r.id === "yuanying")!, 2), originId: "orphan", ageMonths: 9000, flags: [YUANYING_FLAG], attributes: { bone: 5, insight: 10, fortune: 5, mind: 5 }, meta: { ...emptyMeta(), yuanying: { orphan: 1 }, talents: { ningshen: 6 } }, rngSeed: seedWhere((v) => v < 0.1) });
    expect(attemptBreakthrough(huashen, false).meta.fastest["huashen:orphan"]).toBe(9000);
  });
  it("收藏摘要列出各出身的最快年齡", () => {
    const sum = collectionSummary({ ...emptyMeta(), fastest: { "cleared:orphan": 900, "huashen:orphan": 20000 } }, gameData);
    const row = sum.rows.find((r) => r.id === "orphan")!;
    expect(row.fastest).toEqual({ cleared: 900, yuanying: undefined, huashen: 20000 });
  });
  it("存檔往返；v15 遷移補上空紀錄；壞資料指出欄位", () => {
    const s = living(3, { meta: { ...emptyMeta(), fastest: { "cleared:orphan": 900 } } });
    expect(deserialize(serialize(s)).meta.fastest).toEqual({ "cleared:orphan": 900 });
    const old = JSON.parse(serialize(s));
    old.version = 15;
    delete old.meta.fastest;
    expect(deserialize(JSON.stringify(old)).meta.fastest).toEqual({});
    const badKey = JSON.parse(serialize(s));
    badKey.meta.fastest = { "ghost:orphan": 5 };
    expect(() => deserialize(JSON.stringify(badKey))).toThrow("meta.fastest.ghost:orphan");
    const badOrigin = JSON.parse(serialize(s));
    badOrigin.meta.fastest = { "cleared:ghost": 5 };
    expect(() => deserialize(JSON.stringify(badOrigin))).toThrow("ghost");
  });
});
