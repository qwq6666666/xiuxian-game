import { describe, expect, it } from "vitest";
import { buyTalent, canBuyTalent } from "../src/core/actions";
import { attemptBreakthrough, currentFailLoss } from "../src/core/breakthrough";
import { breakthroughFailLoss, talentBonus, talentCost } from "../src/core/formulas";
import { createInitialState, newLife, rollLife, startLife } from "../src/core/life";
import { deserialize, serialize } from "../src/core/save";
import { emptyMeta, SAVE_VERSION, type GameState, type Meta } from "../src/core/state";
import { tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { describeTalent, talentSummary } from "../src/ui/format";
import { living, seedWhere } from "./helpers";

const talent = (id: string) => gameData.talents.find((t) => t.id === id)!;
const withTalents = (talents: Record<string, number>, daoYun = 0): Meta => ({ ...emptyMeta(), talents, daoYun });
const ended = (patch: Partial<GameState> = {}) => living(1, { phase: "dead", ...patch });

describe("價格與購買", () => {
  it("第 n 級的價格 = 無條件進位（base × growth^目前等級）", () => {
    const suhui = talent("suhui");
    expect([0, 1, 2, 3, 4].map((lv) => talentCost(suhui, lv))).toEqual([0, 1, 2, 3, 4].map((lv) => Math.ceil(suhui.cost.base * suhui.cost.growth ** lv)));
    expect(talentCost(talent("tianjuan"), 2)).toBe(32);
    expect(talentCost(talent("fuyuan"), 1)).toBe(22);
  });

  it("一生結束後才能買，扣道韻、等級 +1", () => {
    const s = ended({ meta: withTalents({}, 10) });
    expect(canBuyTalent(s, "suhui")).toBe(true);
    const t = buyTalent(s, "suhui");
    expect(t.meta.talents.suhui).toBe(1);
    expect(t.meta.daoYun).toBe(8);
    const u = buyTalent(t, "suhui");
    expect(u.meta.talents.suhui).toBe(2);
    expect(u.meta.daoYun).toBe(5);
  });

  it("通關後也能買；修行中與擲骰中不能買", () => {
    expect(canBuyTalent(ended({ phase: "cleared", meta: withTalents({}, 5) }), "suhui")).toBe(true);
    expect(canBuyTalent(living(1, { meta: withTalents({}, 99) }), "suhui")).toBe(false);
    expect(canBuyTalent(createInitialState(1, gameData, withTalents({}, 99)), "suhui")).toBe(false);
  });

  it("道韻不足、已達上限、未知天賦都不能買，狀態原樣", () => {
    const poor = ended({ meta: withTalents({}, 1) });
    expect(canBuyTalent(poor, "suhui")).toBe(false);
    expect(buyTalent(poor, "suhui")).toBe(poor);
    const maxed = ended({ meta: withTalents({ fuyuan: 3 }, 9999) });
    expect(canBuyTalent(maxed, "fuyuan")).toBe(false);
    expect(buyTalent(maxed, "fuyuan")).toBe(maxed);
    expect(canBuyTalent(maxed, "ghost")).toBe(false);
  });

  it("宿慧等級達上限後不能再買", () => {
    const s = ended({ meta: withTalents({ suhui: talent("suhui").maxLevel - 1 }, 1e9) });
    const t = buyTalent(s, "suhui");
    expect(t.meta.talents.suhui).toBe(talent("suhui").maxLevel);
    expect(canBuyTalent(t, "suhui")).toBe(false);
  });
});

describe("天賦效果", () => {
  it("效果加總 = 等級 × 每級效果", () => {
    const meta = withTalents({ suhui: 4, fuyuan: 2, tianjuan: 3, yize: 5, daoxin: 2 });
    expect(talentBonus(meta, gameData.talents, "cultivation")).toBeCloseTo(4 * talent("suhui").perLevel);
    expect(talentBonus(meta, gameData.talents, "fortune")).toBe(2);
    expect(talentBonus(meta, gameData.talents, "rerolls")).toBe(3);
    expect(talentBonus(meta, gameData.talents, "stoneCarry")).toBeCloseTo(0.5);
    expect(talentBonus(meta, gameData.talents, "failLoss")).toBeCloseTo(0.1);
    expect(talentBonus(emptyMeta(), gameData.talents, "cultivation")).toBe(0);
  });

  it("宿慧：每級修煉速度加成（同角色同月份比較）", () => {
    const month = (level: number) =>
      tick(living(3, { realmId: "lianqi", stage: 0, cultivation: 0, meta: withTalents({ suhui: level }) }), 1).cultivation;
    expect(month(0)).toBeGreaterThan(0);
    const per = talent("suhui").perLevel;
    expect(month(4) / month(0)).toBeCloseTo(1 + 4 * per);
    expect(month(20) / month(0)).toBeCloseTo(1 + 20 * per);
  });

  it("天眷：開局重擲次數 +1 每級", () => {
    expect(createInitialState(1).rerolls).toBe(1);
    expect(createInitialState(1, gameData, withTalents({ tianjuan: 3 })).rerolls).toBe(4);
  });

  it("福緣：氣運 +1 每級，重擲後依然保留", () => {
    const meta = withTalents({ fuyuan: 2 });
    const base = createInitialState(7);
    const boosted = createInitialState(7, gameData, meta);
    // 同種子擲出的屬性相同，只差福緣的加成
    expect(boosted.attributes.fortune).toBe(base.attributes.fortune + 2);
    expect(boosted.attributes.bone).toBe(base.attributes.bone);
    const again = rollLife(boosted);
    expect(again.attributes.fortune - rollLife(base).attributes.fortune).toBe(2);
  });

  it("道心：突破失敗的損失每級 −5%，最低 0", () => {
    const meta = withTalents({ daoxin: 2 });
    const s = living(1, { meta, attributes: { bone: 5, insight: 5, fortune: 5, mind: 5 } });
    expect(breakthroughFailLoss(gameData.config, 5)).toBeCloseTo(0.2);
    expect(currentFailLoss(s)).toBeCloseTo(0.1);
    expect(currentFailLoss({ ...s, attributes: { ...s.attributes, mind: 10 } })).toBe(0);
  });

  it("道心：實際突破失敗時少損失修為", () => {
    const rngSeed = seedWhere((v) => v >= 0.4);
    const capped = (meta: Meta) =>
      attemptBreakthrough(
        living(1, {
          realmId: "lianqi",
          stage: 8,
          cultivation: 2563,
          rngSeed,
          meta,
          attributes: { bone: 5, insight: 5, fortune: 5, mind: 5 },
        }),
        false,
      );
    expect(capped(emptyMeta()).cultivation).toBeCloseTo(2563 * 0.8);
    expect(capped(withTalents({ daoxin: 2 })).cultivation).toBeCloseTo(2563 * 0.9);
  });

  it("遺澤：轉世時保留上一世的一部分靈石，並算進初始靈石", () => {
    const dead = ended({ spiritStones: 200, meta: withTalents({ yize: 3 }) });
    const next = newLife(dead);
    expect(next.carriedStones).toBe(60);
    const origin = gameData.origins.find((o) => o.id === next.originId)!;
    expect(next.spiritStones).toBe(origin.spiritStones + 60);
    // 重擲後仍保留（重擲會改出身，靈石以新出身加上遺澤）
    const rerolled = newLife(dead);
    const r = rollLife(rerolled);
    const rOrigin = gameData.origins.find((o) => o.id === r.originId)!;
    expect(r.spiritStones).toBe(rOrigin.spiritStones + 60);
  });

  it("遺澤最多保留全部，沒有天賦時不保留", () => {
    expect(newLife(ended({ spiritStones: 99, meta: withTalents({ yize: 5 }) })).carriedStones).toBe(49);
    expect(newLife(ended({ spiritStones: 99 })).carriedStones).toBe(0);
  });
});

describe("轉世保留跨世資料", () => {
  it("道韻、天賦、已達成階段、世數都保留，其餘重來", () => {
    const meta: Meta = { daoYun: 7, talents: { suhui: 3, daoxin: 1 }, reached: ["lianqi:0"], lives: 2, fragments: ["f01"], clears: {}, yuanying: {}, huashen: {}, sectBest: 0, fastest: {}, goals: {}, lastLife: null };
    const dead = ended({
      meta,
      realmId: "zhuji",
      stage: 1,
      items: { zhuji_dan: 2 },
      flags: ["cave_001_marked"],
      lifespanBonus: 20,
      breakthroughs: 3,
      review: {
        cause: "lifespan", closing: 0, ageMonths: 1440, originId: "farmer", spiritRootId: "san",
        realmId: "zhuji", stage: 1, breakthroughs: 3, daoYunBase: 1, daoYunBonus: 0, highlights: [], goals: [], prev: null,
      sectPeak: 0,
      },
      speed: 4,
    });
    const next = newLife(dead);
    expect(next.meta).toEqual(meta);
    expect(next.review).toBeNull();
    expect(next.realmId).toBe("mortal");
    expect(next.flags).toEqual([]);
    expect(next.breakthroughs).toBe(0);
    expect(next.lifespanBonus).toBe(0);
    expect(next.speed).toBe(4);
    expect(next.phase).toBe("rolling");
  });

  it("擲骰畫面的加成摘要", () => {
    expect(talentSummary({}, gameData)).toEqual([]);
    expect(talentSummary({ suhui: 3, daoxin: 1 }, gameData)).toEqual([
      `宿慧 3 級：修煉速度 +${Math.round(talent("suhui").perLevel * 300)}%`,
      "道心 1 級：突破失敗的修為損失 −5%",
    ]);
    expect(describeTalent(talent("tianjuan"), 2)).toBe("開局重擲 +2 次");
    expect(describeTalent(talent("fuyuan"), 1)).toBe("氣運 +1");
    expect(describeTalent(talent("yize"), 3)).toBe("保留上一世 30% 的靈石");
  });
});

describe("第二世比第一世快", () => {
  it("買了宿慧之後，同一個角色同樣月數修為更多（統計）", () => {
    let plain = 0;
    let boosted = 0;
    const n = 200;
    for (let seed = 1; seed <= n; seed++) {
      const run = (meta: Meta) => {
        const s = startLife(createInitialState(seed, gameData, meta));
        return tick({ ...s, eventThreshold: 1e9 }, 600).cultivation + tick({ ...s, eventThreshold: 1e9 }, 600).stage * 1000;
      };
      plain += run(emptyMeta());
      boosted += run(withTalents({ suhui: 4 }));
    }
    expect(boosted / plain).toBeGreaterThan(1.1);
  });
});

describe("存檔：跨世資料與回顧", () => {
  it("meta 與 review 可存可讀", () => {
    const dead = tick(living(1, { realmId: "lianqi", stage: 5, ageMonths: 1439 }), 1);
    expect(dead.review).not.toBeNull();
    const back = deserialize(serialize(dead));
    expect(back).toEqual(dead);
    expect(back.meta.daoYun).toBe(12 * gameData.realms.find((r) => r.id === "lianqi")!.daoYun);
  });

  it("欄位錯誤時指出欄位", () => {
    const good = JSON.parse(serialize(createInitialState(1)));
    const bad = (patch: object) => () => deserialize(JSON.stringify({ ...good, ...patch }));
    expect(bad({ meta: { ...good.meta, daoYun: -1 } })).toThrow("meta.daoYun");
    expect(bad({ meta: { ...good.meta, talents: { ghost: 1 } } })).toThrow("meta.talents.ghost");
    expect(bad({ meta: { ...good.meta, talents: { fuyuan: 4 } } })).toThrow("meta.talents.fuyuan");
    expect(bad({ meta: { ...good.meta, reached: [1] } })).toThrow("meta.reached");
    expect(bad({ meta: { ...good.meta, lives: 1.5 } })).toThrow("meta.lives");
    expect(bad({ carriedStones: -1 })).toThrow("carriedStones");
    const review = { cause: "lifespan", closing: 0, ageMonths: 1, originId: "a", spiritRootId: "b", realmId: "mortal", stage: 0, breakthroughs: 0, daoYunBase: 0, daoYunBonus: 0, highlights: [] };
    expect(bad({ review: { ...review, cause: "x" } })).toThrow("review.cause");
    expect(bad({ review: { ...review, closing: 99 } })).toThrow("review.closing");
    expect(bad({ review: { ...review, realmId: "ghost" } })).toThrow("review.realmId");
    expect(bad({ review: { ...review, highlights: [{ month: 1, kind: "zzz", realmId: "mortal", stage: 0 }] } })).toThrow(
      "review.highlights[0].kind",
    );
  });

  it("v4 存檔遷移：補上空的跨世資料；停在死亡畫面的舊存檔沒有回顧", () => {
    const current = living(5, { phase: "dead" });
    const rest: Record<string, unknown> = { ...current, version: 4 };
    for (const k of ["carriedStones", "meta", "review"]) delete rest[k];
    const s = deserialize(JSON.stringify(rest));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.meta).toEqual(emptyMeta());
    expect(s.review).toBeNull();
    expect(s.carriedStones).toBe(0);
    expect(s.phase).toBe("dead");
    expect(newLife(s).phase).toBe("rolling");
  });
});
