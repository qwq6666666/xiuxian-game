import { describe, expect, it } from "vitest";
import { fiefsFor, partitionNations } from "../../src/core/world/fiefs";
import { seededRandom } from "../../src/core/util/noise";
import { gameData as data } from "../../src/data/load";

const SEEDS = Array.from({ length: 30 }, (_, i) => i * 7919 + 13);

describe("領", () => {
  it("決定性、數量固定、在畫布內；不同種子不同", () => {
    const a = fiefsFor(7, data);
    expect(fiefsFor(7, data)).toBe(a);
    expect(a.count).toBe(data.map.fiefRules.count);
    expect(a.points.length).toBe(a.count);
    expect(fiefsFor(8, data).points).not.toEqual(a.points);
    for (const p of a.points) {
      expect(p[0]).toBeGreaterThan(0);
      expect(p[1]).toBeGreaterThan(0);
      expect(p[0]).toBeLessThan(data.map.viewBox[0]);
      expect(p[1]).toBeLessThan(data.map.viewBox[1]);
    }
  });

  it("鄰接對稱、沒有自己、整片陸地大致連通（最大連通塊占九成以上）", () => {
    for (const seed of SEEDS) {
      const f = fiefsFor(seed, data);
      for (let i = 0; i < f.count; i++) {
        expect(f.nb[i]).not.toContain(i);
        for (const j of f.nb[i]) expect(f.nb[j]).toContain(i);
      }
      const seen = new Set<number>([0]);
      const q = [0];
      for (let k = 0; k < q.length; k++) for (const j of f.nb[q[k]]) if (!seen.has(j)) { seen.add(j); q.push(j); }
      expect(seen.size / f.count, String(seed)).toBeGreaterThan(0.9);
    }
  });

  it("indexAt 回傳最近的領中心；每個領的面積為正", () => {
    const f = fiefsFor(11, data);
    for (let i = 0; i < f.count; i++) {
      expect(f.indexAt(f.points[i])).toBe(i);
      expect(f.area[i]).toBeGreaterThan(0);
    }
  });

  it("國家劃分：3 到 9 國都分得出，每國至少一個領、且各國連通", () => {
    for (const seed of SEEDS) {
      const f = fiefsFor(seed, data);
      for (let n = data.map.nations.min; n <= data.map.nations.max; n++) {
        const owner = partitionNations(f, n, seededRandom(seed + n));
        expect(new Set(owner).size, `${seed}/${n}`).toBe(n);
        for (let k = 0; k < n; k++) {
          const members = owner.map((o, i) => (o === k ? i : -1)).filter((i) => i >= 0);
          const seen = new Set<number>([members[0]]);
          const q = [members[0]];
          for (let i = 0; i < q.length; i++) for (const j of f.nb[q[i]]) if (owner[j] === k && !seen.has(j)) { seen.add(j); q.push(j); }
          // 孤島領可能獨立，其餘必須連通
          expect(seen.size, `${seed}/${n}/${k}`).toBeGreaterThanOrEqual(members.length - 1);
        }
      }
    }
  });
});
