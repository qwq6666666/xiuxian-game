import { describe, expect, it } from "vitest";
import { attemptBreakthrough } from "../src/core/breakthrough";
import { stageNeed } from "../src/core/formulas";
import { applyEndingAndContinue, CLEARED_FLAG, endsLifeOnEntry, totalYuanying, YUANYING_FLAG } from "../src/core/review";
import { deserialize, serialize } from "../src/core/save";
import { emptyMeta } from "../src/core/state";
import { tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { validateRealms } from "../src/data/validate";
import { living, seedWhere } from "./helpers";

const jindan = gameData.realms.find((r) => r.id === "jindan")!;
const yuanying = gameData.realms.find((r) => r.id === "yuanying")!;

const atCap = (patch = {}) =>
  living(1, {
    realmId: "jindan",
    stage: 2,
    cultivation: stageNeed(jindan, 2),
    attributes: { bone: 5, insight: 10, fortune: 5, mind: 5 },
    originId: "orphan",
    flags: [CLEARED_FLAG],
    rngSeed: seedWhere((v) => v < 0.1),
    meta: { ...emptyMeta(), clears: { orphan: 1 }, talents: { shenguang: 4 } },
    ...patch,
  });

describe("元嬰期：第一次結束這一世，之後繼續活", () => {
  it("資料：三階段，需求遞增，endsLife 為 untilYuanying", () => {
    expect(yuanying.stageNames).toEqual(["初期", "中期", "後期"]);
    expect(stageNeed(yuanying, 1)).toBeGreaterThan(stageNeed(yuanying, 0));
    expect(stageNeed(yuanying, 2)).toBeGreaterThan(stageNeed(yuanying, 1));
    expect(yuanying.endsLife).toBe("untilYuanying");
  });

  it("沒元嬰過：進入元嬰結束這一世，記一次元嬰", () => {
    const s = atCap();
    expect(endsLifeOnEntry(yuanying, s)).toBe(true);
    const t = attemptBreakthrough(s, false);
    expect(t.phase).toBe("cleared");
    expect(t.review?.cause).toBe("yuanying");
    expect(t.meta.yuanying).toEqual({ orphan: 1 });
  });

  it("元嬰過後：進入元嬰記一次元嬰，這一世繼續，旗標只加一次", () => {
    const meta = { ...emptyMeta(), clears: { orphan: 1 }, yuanying: { farmer: 1 }, talents: { shenguang: 4 } };
    const s = atCap({ meta });
    expect(endsLifeOnEntry(yuanying, s)).toBe(false);
    const t = attemptBreakthrough(s, false);
    expect(t.phase).toBe("living");
    expect(t.review).toBeNull();
    expect(t.realmId).toBe("yuanying");
    expect(t.stage).toBe(0);
    expect(t.meta.yuanying).toEqual({ farmer: 1, orphan: 1 });
    expect(totalYuanying(t)).toBe(2);
    expect(t.flags).toContain(YUANYING_FLAG);
    expect(applyEndingAndContinue(t, "yuanying").flags.filter((f) => f === YUANYING_FLAG)).toHaveLength(1);
  });

  it("繼續活著的元嬰：修為滿了自動升階，後期圓滿後卡在瓶頸", () => {
    const s = living(2, { realmId: "yuanying", stage: 0, cultivation: stageNeed(yuanying, 0) - 0.1, flags: [YUANYING_FLAG] });
    expect(tick(s, 1).stage).toBe(1);
    const cap = living(2, { realmId: "yuanying", stage: 2, cultivation: stageNeed(yuanying, 2) - 0.1, flags: [YUANYING_FLAG] });
    const u = tick(cap, 1);
    expect(u.stage).toBe(2);
    expect(u.log[u.log.length - 1].kind).toBe("bottleneck");
  });

  it("存檔往返保留旗標與元嬰次數", () => {
    const s = living(1, { realmId: "yuanying", flags: [YUANYING_FLAG], meta: { ...emptyMeta(), clears: { orphan: 1 }, yuanying: { orphan: 2 } } });
    const back = deserialize(serialize(s));
    expect(back.flags).toContain(YUANYING_FLAG);
    expect(back.meta.yuanying).toEqual({ orphan: 2 });
  });
});

describe("endsLife：untilYuanying 的資料檢查", () => {
  const base = JSON.parse(JSON.stringify(gameData.realms));
  it("可以當最後一個境界；never 當最後一個境界報錯", () => {
    expect(validateRealms(base)[base.length - 1].endsLife).toBe("untilYuanying");
    const bad = base.map((r: object, i: number) => (i === base.length - 1 ? { ...r, endsLife: "never" } : r));
    expect(() => validateRealms(bad)).toThrow("最後一個境界不能是");
  });
});
