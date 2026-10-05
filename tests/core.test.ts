import { describe, expect, it } from "vitest";
import { msToMonths, splitAge } from "../src/core/formulas";
import { nextInt, nextRandom } from "../src/core/rng";
import { deserialize, serialize } from "../src/core/save";
import { createInitialState, SAVE_VERSION } from "../src/core/state";
import { tick } from "../src/core/tick";
import { validateConfig } from "../src/data/load";

describe("rng", () => {
  it("同種子得到同序列", () => {
    const run = (seed: number) => {
      const out: number[] = [];
      let s = seed;
      for (let i = 0; i < 5; i++) {
        const [v, n] = nextRandom(s);
        out.push(v);
        s = n;
      }
      return out;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it("存下種子後可接續序列", () => {
    const [a1, s1] = nextRandom(7);
    const [a2] = nextRandom(s1);
    const [, s1b] = nextRandom(7);
    expect(nextRandom(s1b)[0]).toBe(a2);
    expect(a1).toBeGreaterThanOrEqual(0);
    expect(a1).toBeLessThan(1);
  });

  it("nextInt 落在範圍內且涵蓋端點", () => {
    let s = 1;
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const [v, n] = nextInt(s, 1, 10);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
      seen.add(v);
      s = n;
    }
    expect(seen.has(1) && seen.has(10)).toBe(true);
  });
});

describe("tick", () => {
  it("推進月數且不修改輸入", () => {
    const s = createInitialState(1, 10);
    const t = tick(s, 5);
    expect(s.ageMonths).toBe(120);
    expect(t.ageMonths).toBe(125);
  });

  it("拒絕負數或小數", () => {
    const s = createInitialState(1, 10);
    expect(() => tick(s, -1)).toThrow();
    expect(() => tick(s, 1.5)).toThrow();
  });
});

describe("formulas", () => {
  it("時間換算", () => {
    expect(msToMonths(1000, 1, 1000)).toBe(1);
    expect(msToMonths(1000, 4, 1000)).toBe(4);
  });
  it("拆分年齡", () => {
    expect(splitAge(125)).toEqual([10, 5]);
  });
});

describe("save", () => {
  it("序列化後再讀取結果相同", () => {
    const s = tick(createInitialState(99, 10), 33);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("格式錯誤時指出欄位", () => {
    expect(() => deserialize("{")).toThrow("JSON");
    expect(() => deserialize(JSON.stringify({ version: SAVE_VERSION, rngSeed: 1, ageMonths: "x", speed: 1 }))).toThrow(
      "ageMonths",
    );
    expect(() => deserialize(JSON.stringify({ rngSeed: 1 }))).toThrow("version");
  });

  it("拒絕比遊戲新的版本", () => {
    expect(() => deserialize(JSON.stringify({ version: SAVE_VERSION + 1 }))).toThrow("版本");
  });
});

describe("config 檢查", () => {
  it("錯誤訊息指出欄位", () => {
    expect(() => validateConfig({ msPerMonth: -1 })).toThrow("msPerMonth");
    expect(() =>
      validateConfig({ msPerMonth: 1000, speeds: [], startAgeYears: 10, maxCatchUpMonths: 12 }),
    ).toThrow("speeds");
  });
});
