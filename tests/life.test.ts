import { describe, expect, it } from "vitest";
import { createInitialState, newLife, reroll, rollLife, startLife } from "../src/core/life";
import type { GameState } from "../src/core/state";
import { atBottleneck, tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { ATTRIBUTE_KEYS } from "../src/data/types";

function living(seed = 1, patch: Partial<GameState> = {}): GameState {
  return { ...startLife(createInitialState(seed)), ...patch };
}

describe("開局擲骰", () => {
  it("同種子結果相同，起始年齡 10 歲、停在擲骰階段", () => {
    const a = createInitialState(7);
    expect(a).toEqual(createInitialState(7));
    expect(a.phase).toBe("rolling");
    expect(a.ageMonths).toBe(120);
    expect(a.rerolls).toBe(1);
  });

  it("屬性落在範圍內（孤兒氣運可 +2）", () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = createInitialState(seed);
      for (const k of ATTRIBUTE_KEYS) {
        expect(s.attributes[k]).toBeGreaterThanOrEqual(1);
        expect(s.attributes[k]).toBeLessThanOrEqual(k === "fortune" && s.originId === "orphan" ? 12 : 10);
      }
    }
  });

  it("出身效果：商賈靈石多、世家有聚氣丹與加成、孤兒氣運 +2 且靈石 0", () => {
    const seen = new Map<string, GameState>();
    for (let seed = 1; seed < 200 && seen.size < 4; seed++) {
      const s = createInitialState(seed);
      seen.set(s.originId, s);
    }
    expect(seen.get("merchant")!.spiritStones).toBe(50);
    expect(seen.get("noble")!.items).toEqual({ juqi_dan: 1 });
    expect(seen.get("noble")!.cultivationBonus).toBeCloseTo(0.1);
    expect(seen.get("orphan")!.spiritStones).toBe(0);
    expect(seen.get("farmer")!.cultivationBonus).toBe(0);
  });

  it("重擲消耗次數，用完後不再變動", () => {
    const s0 = createInitialState(3);
    const s1 = reroll(s0);
    expect(s1.rerolls).toBe(0);
    expect(s1.rngSeed).not.toBe(s0.rngSeed);
    expect(reroll(s1)).toBe(s1);
  });

  it("重擲不會殘留上一次出身的物品", () => {
    const s = createInitialState(1);
    const rolled = rollLife({ ...s, items: { juqi_dan: 5 }, spiritStones: 999 });
    expect(rolled.spiritStones).toBeLessThan(999);
    expect(Object.values(rolled.items).every((n) => n <= 1)).toBe(true);
  });

  it("開始修行後不能再重擲", () => {
    const s = startLife(createInitialState(3));
    expect(s.phase).toBe("living");
    expect(reroll(s)).toBe(s);
  });
});

describe("tick", () => {
  it("推進月數且不修改輸入", () => {
    const s = living();
    const t = tick(s, 5);
    expect(s.ageMonths).toBe(120);
    expect(t.ageMonths).toBe(125);
    expect(t.cultivation).toBeGreaterThan(s.cultivation);
  });

  it("擲骰階段與死亡後不推進", () => {
    const rolling = createInitialState(1);
    expect(tick(rolling, 10)).toBe(rolling);
    const dead = living(1, { phase: "dead" });
    expect(tick(dead, 10)).toBe(dead);
  });

  it("拒絕負數或小數", () => {
    expect(() => tick(living(), -1)).toThrow();
    expect(() => tick(living(), 1.5)).toThrow();
  });

  it("凡人修為滿 50 自動進練氣一層，並留下超出的修為", () => {
    const s = living(1, { realmId: "mortal", stage: 0, cultivation: 49.9 });
    const t = tick(s, 1);
    expect(t.realmId).toBe("lianqi");
    expect(t.stage).toBe(0);
    expect(t.cultivation).toBeLessThan(5);
    expect(t.log.map((e) => e.kind)).toEqual(["realmUp"]);
  });

  it("練氣小階段修為滿了自動升級", () => {
    const s = living(1, { realmId: "lianqi", stage: 2, cultivation: 224.9 });
    const t = tick(s, 1);
    expect(t.stage).toBe(3);
    expect(t.log[t.log.length - 1].kind).toBe("stageUp");
  });

  it("一次修為足夠可連升多層", () => {
    const s = living(1, { realmId: "lianqi", stage: 0, cultivation: 99.9 + 150 + 225 });
    const t = tick(s, 1);
    expect(t.stage).toBe(3);
  });

  it("練氣九層圓滿後卡在瓶頸：修為封頂、只記一次日誌", () => {
    const need9 = 2563;
    const s = living(1, { realmId: "lianqi", stage: 8, cultivation: need9 - 0.1 });
    const t = tick(s, 1);
    expect(atBottleneck(t)).toBe(true);
    expect(t.cultivation).toBe(need9);
    const t2 = tick(t, 24);
    expect(t2.cultivation).toBe(need9);
    expect(t2.log.filter((e) => e.kind === "bottleneck")).toHaveLength(1);
    expect(t2.ageMonths).toBe(t.ageMonths + 24);
  });

  it("壽元耗盡即死亡，且年齡停在壽元上限", () => {
    const s = living(1, { realmId: "lianqi", stage: 0, ageMonths: 1438 });
    const t = tick(s, 10);
    expect(t.phase).toBe("dead");
    expect(t.ageMonths).toBe(1440);
    expect(t.log[t.log.length - 1].kind).toBe("death");
  });

  it("日誌長度受上限限制", () => {
    const data = { ...gameData, config: { ...gameData.config, logLimit: 3 } };
    const s = living(1, { realmId: "lianqi", stage: 0, cultivation: 0 });
    // 每月給足夠修為連升多層
    let t = s;
    for (let i = 0; i < 6; i++) t = tick({ ...t, cultivation: t.cultivation + 1000 }, 1, data);
    expect(t.log.length).toBeLessThanOrEqual(3);
  });
});

describe("整世與轉世", () => {
  it("同種子跑完一世結果固定，且從 10 歲走到老死", () => {
    const run = () => {
      let s = living(42);
      while (s.phase === "living") s = tick(s, 12);
      return s;
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.phase).toBe("dead");
    expect(a.ageMonths).toBeGreaterThan(120);
    expect(a.ageMonths % 12).toBe(0);
    expect(a.log[a.log.length - 1].kind).toBe("death");
  });

  it("凡人沒進入練氣前壽元上限 80 歲；一般一世都會進練氣", () => {
    const s = living(5);
    const t = tick(s, 12 * 70);
    expect(t.realmId).toBe("lianqi");
  });

  it("死亡後轉世回到擲骰階段，保留速度與亂數序列", () => {
    const dead = living(9, { phase: "dead", speed: 4 });
    const next = newLife(dead);
    expect(next.phase).toBe("rolling");
    expect(next.speed).toBe(4);
    expect(next.ageMonths).toBe(120);
    expect(next.cultivation).toBe(0);
    expect(next.log).toEqual([]);
    expect(newLife(next)).toBe(next);
  });
});
