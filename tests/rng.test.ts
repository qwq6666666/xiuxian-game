import { describe, expect, it } from "vitest";
import { nextInt, nextRandom, pickWeighted } from "../src/core/rng";

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

  it("pickWeighted 依權重分布", () => {
    const items = [{ weight: 50 }, { weight: 35 }, { weight: 13 }, { weight: 2 }];
    const counts = [0, 0, 0, 0];
    let s = 123;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const [idx, next] = pickWeighted(s, items);
      counts[idx]++;
      s = next;
    }
    expect(counts[0] / n).toBeCloseTo(0.5, 1);
    expect(counts[1] / n).toBeCloseTo(0.35, 1);
    expect(counts[3] / n).toBeCloseTo(0.02, 1);
  });
});
