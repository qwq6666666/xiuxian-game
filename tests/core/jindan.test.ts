import { describe, expect, it } from "vitest";
import { canBreakthrough } from "../../src/core/character/breakthrough";
import { stageNeed } from "../../src/core/formulas";
import { emptyMeta } from "../../src/core/state";
import { CLEARED_FLAG, endsLifeOnEntry, totalClears } from "../../src/core/character/review";
import { applyOffline } from "../../src/core/offline";
import { tick } from "../../src/core/tick";
import { gameData } from "../../src/data/load";
import { validateRealms } from "../../src/data/validate";
import { living, seedWhere, attemptBreakthrough } from "../helpers";

const jindan = gameData.realms.find((r) => r.id === "jindan")!;
const zhujiCap = (patch = {}) =>
  living(1, {
    realmId: "zhuji",
    stage: 2,
    cultivation: 1e6,
    attributes: { bone: 5, insight: 10, fortune: 5, mind: 5 },
    rngSeed: seedWhere((v) => v < 0.1),
    ...patch,
  });

describe("金丹期：三個階段", () => {
  it("金丹有初期、中期、後期，需求逐階遞增", () => {
    expect(jindan.stageNames).toEqual(["初期", "中期", "後期"]);
    expect(stageNeed(jindan, 1)).toBeGreaterThan(stageNeed(jindan, 0));
    expect(stageNeed(jindan, 2)).toBeGreaterThan(stageNeed(jindan, 1));
  });

  it("修為滿了自動升階，後期圓滿後卡在瓶頸", () => {
    const s = living(2, { realmId: "jindan", stage: 0, cultivation: stageNeed(jindan, 0) - 0.1, flags: [CLEARED_FLAG] });
    const t = tick(s, 1);
    expect(t.stage).toBe(1);
    const cap = living(2, { realmId: "jindan", stage: 2, cultivation: stageNeed(jindan, 2) - 0.1, flags: [CLEARED_FLAG] });
    const u = tick(cap, 1);
    expect(u.stage).toBe(2);
    expect(u.cultivation).toBe(stageNeed(jindan, 2));
    expect(u.log[u.log.length - 1].kind).toBe("bottleneck");
    // 目前沒有下一個境界，無法突破
    expect(canBreakthrough(u)).toBe(false);
  });
});

describe("endsLife：第一次通關結束，之後繼續活", () => {
  it("沒通關過時，突破金丹結束這一世並記一次通關", () => {
    const s = zhujiCap();
    expect(endsLifeOnEntry(jindan, s)).toBe(true);
    const t = attemptBreakthrough(s, false);
    expect(t.phase).toBe("cleared");
    expect(t.meta.clears).toEqual({ [s.originId]: 1 });
    expect(t.meta.fragments).toContain("f14");
  });

  it("通關過後，突破金丹記一次通關但這一世繼續", () => {
    const meta = { ...emptyMeta(), clears: { orphan: 1 }, fragments: ["f14"] };
    const s = zhujiCap({ originId: "orphan", meta });
    expect(endsLifeOnEntry(jindan, s)).toBe(false);
    const t = attemptBreakthrough(s, false);
    expect(t.phase).toBe("living");
    expect(t.review).toBeNull();
    expect(t.realmId).toBe("jindan");
    expect(t.stage).toBe(0);
    expect(t.flags).toContain(CLEARED_FLAG);
    expect(t.meta.clears).toEqual({ orphan: 2 });
    expect(totalClears(t)).toBe(2);
    expect(t.meta.lives).toBe(meta.lives);
    // 繼續活著：時間照走
    expect(tick(t, 12).ageMonths).toBe(t.ageMonths + 12);
  });

  it("繼續活著的通關計入對應出身，不影響其他出身，旗標不會重複", () => {
    const meta = { ...emptyMeta(), clears: { farmer: 3 }, fragments: ["f14"] };
    const t = attemptBreakthrough(zhujiCap({ originId: "noble", meta }), false);
    expect(t.meta.clears).toEqual({ farmer: 3, noble: 1 });
    expect(t.flags.filter((f) => f === CLEARED_FLAG)).toHaveLength(1);
  });

  it("突破失敗不記通關", () => {
    const meta = { ...emptyMeta(), clears: { orphan: 1 } };
    const s = zhujiCap({ meta, rngSeed: seedWhere((v) => v > 0.9) });
    const t = attemptBreakthrough(s, false);
    expect(t.realmId).toBe("zhuji");
    expect(t.meta.clears).toEqual({ orphan: 1 });
  });

  it("通關後的金丹期離線閉關：修為照走、卡瓶頸就停", () => {
    const s = living(3, { realmId: "jindan", stage: 2, cultivation: stageNeed(jindan, 2) - 10, flags: [CLEARED_FLAG] });
    const { summary } = applyOffline(s, 3_600_000, gameData);
    expect(summary.stop).toBe("bottleneck");
  });
});

describe("endsLife：資料檢查", () => {
  const base = JSON.parse(JSON.stringify(gameData.realms));
  it("不合法的值指出是哪一筆的哪個欄位", () => {
    const bad = base.map((r: object, i: number) => (i === 3 ? { ...r, endsLife: "sometimes" } : r));
    expect(() => validateRealms(bad)).toThrow("endsLife");
    expect(() => validateRealms(bad)).toThrow("jindan");
  });

  it("沒寫就是 never；最後一個境界不是 always 則沒有終點，報錯", () => {
    const none = base.map((r: { endsLife?: string }) => ({ ...r, endsLife: undefined }));
    expect(() => validateRealms(none)).toThrow("最後一個境界必須是");
    expect(validateRealms(base)[1].endsLife).toBe("never");
    expect(validateRealms(base)[3].endsLife).toBe("untilCleared");
  });
});
