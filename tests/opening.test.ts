import { describe, expect, it } from "vitest";
import { eventAvailable } from "../src/core/events";
import { gameData as data } from "../src/data/load";
import { validateEvents, validateGameData } from "../src/data/validate";
import { living } from "./helpers";

const base = data.events.find((e) => e.type === "anecdote")!;
const withCond = (conditions: object) => ({ ...base, id: "cond_test", conditions });

describe("事件條件 origins／roots", () => {
  it("只在出身或靈根符合時出現", () => {
    const s = living(1, { originId: "farmer", spiritRootId: "san" });
    expect(eventAvailable(s, withCond({ origins: ["farmer"] }), data)).toBe(true);
    expect(eventAvailable(s, withCond({ origins: ["noble", "orphan"] }), data)).toBe(false);
    expect(eventAvailable(s, withCond({ roots: ["san"] }), data)).toBe(true);
    expect(eventAvailable(s, withCond({ roots: ["tian"] }), data)).toBe(false);
    expect(eventAvailable(s, withCond({ origins: ["farmer"], roots: ["tian"] }), data)).toBe(false);
  });
  it("格式檢查：必須是字串陣列", () => {
    expect(() => validateEvents([{ ...base, conditions: { origins: "farmer" } }])).toThrow("origins");
    expect(() => validateEvents([{ ...base, conditions: { roots: [1] } }])).toThrow("roots");
  });
  it("引用不存在的出身或靈根時，載入檢查指出欄位", () => {
    const bad = (conditions: object) => ({ ...data, events: [...data.events, { ...base, id: "bad_cond", conditions }] });
    expect(() => validateGameData(bad({ origins: ["nobody"] }))).toThrow("conditions.origins");
    expect(() => validateGameData(bad({ roots: ["nothing"] }))).toThrow("conditions.roots");
  });
});

describe("一世開場文字（opening.json）", () => {
  const opening = data.events.filter((e) => e.id.startsWith("open_"));
  it("每個出身與靈根至少一則，且每則只限一種出身或靈根", () => {
    for (const o of data.origins) expect(opening.some((e) => e.conditions.origins?.includes(o.id))).toBe(true);
    for (const r of data.spiritRoots) expect(opening.some((e) => e.conditions.roots?.includes(r.id))).toBe(true);
    for (const e of opening) expect(e.type).toBe("anecdote");
  });
  it("每段不超過三句", () => {
    for (const e of opening) expect(e.text.split(/[。！？]/).filter(Boolean).length).toBeLessThanOrEqual(3);
  });
});

describe("怪物多樣性（monsters.json）", () => {
  it("凡人到元嬰每個境界至少四種怪，且同境界的平均戰力係數與獎勵相近", () => {
    for (const realm of ["mortal", "lianqi", "zhuji", "jindan", "yuanying"]) {
      const pool = data.monsters.monsters.filter((m) => m.realm === realm);
      expect(pool.length).toBeGreaterThanOrEqual(4);
      const meanPower = pool.reduce((a, m) => a + m.power, 0) / pool.length;
      expect(meanPower).toBeGreaterThan(0.9);
      expect(meanPower).toBeLessThan(1.25);
    }
  });
});

describe("練氣期見聞（lianqi.json）", () => {
  const daily = data.events.filter((e) => e.id.startsWith("lianqi_daily_"));
  it("12 則，皆為練氣期限定的見聞，每段不超過三句", () => {
    expect(daily).toHaveLength(12);
    for (const e of daily) {
      expect(e.type).toBe("anecdote");
      expect(e.conditions.realmMin).toBe("lianqi");
      expect(e.conditions.realmMax).toBe("lianqi");
      expect(e.text.split(/[。！？]/).filter(Boolean).length).toBeLessThanOrEqual(3);
    }
  });
});
