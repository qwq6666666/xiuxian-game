import { describe, expect, it } from "vitest";
import { eventAvailable } from "../src/core/events";
import { gameData as data } from "../src/data/load";
import { living } from "./helpers";

const zhuji = data.events.filter((e) => e.id.startsWith("zhuji_") && e.conditions.realmMax === "zhuji");
const sentences = (t: string): number => (t.match(/[。！？]/g) ?? []).length;

describe("築基期事件（M33 補充）", () => {
  it("新增 15 則築基專屬事件，只在築基期出現", () => {
    expect(zhuji.length).toBe(15);
    for (const e of zhuji) expect(e.conditions.realmMin).toBe("zhuji");
    expect(eventAvailable(living(1, { realmId: "zhuji", stage: 1 }), data.events.find((e) => e.id === "zhuji_homecoming_001")!, data)).toBe(true);
    expect(eventAvailable(living(1, { realmId: "jindan", stage: 1 }), data.events.find((e) => e.id === "zhuji_homecoming_001")!, data)).toBe(false);
    expect(eventAvailable(living(1, { realmId: "lianqi", stage: 1 }), data.events.find((e) => e.id === "zhuji_homecoming_001")!, data)).toBe(false);
  });
  it("每段文字不超過三句；抉擇事件至少兩個選項；有取捨", () => {
    for (const e of zhuji) {
      expect(sentences(e.text), e.id).toBeLessThanOrEqual(3);
      for (const c of e.choices ?? []) for (const o of c.outcomes) expect(sentences(o.text), `${e.id}:${c.text}`).toBeLessThanOrEqual(3);
      if (e.type === "choice") expect(e.choices!.length, e.id).toBeGreaterThanOrEqual(2);
    }
  });
  it("連鎖：收留孩子才會有後續，後續權重拉高、每世一次", () => {
    const first = data.events.find((e) => e.id === "zhuji_orphan_001")!;
    const second = data.events.find((e) => e.id === "zhuji_orphan_002")!;
    const fedFlags = first.choices!.flatMap((c) => c.outcomes.flatMap((o) => o.effects.flags ?? []));
    expect(fedFlags).toContain("zhuji_orphan_fed");
    expect(second.weight).toBeGreaterThanOrEqual(20);
    expect(second.maxPerLife).toBe(1);
    const base = living(1, { realmId: "zhuji", stage: 1, ageMonths: 12 * 60 });
    expect(eventAvailable(base, second, data)).toBe(false);
    expect(eventAvailable({ ...base, flags: ["zhuji_orphan_fed"] }, second, data)).toBe(true);
  });
  it("給殘卷的事件有 fragmentAvailable 條件", () => {
    for (const e of zhuji) {
      const gives = (e.choices ?? []).some((c) => c.outcomes.some((o) => o.effects.fragment));
      if (gives) expect(e.conditions.fragmentAvailable, e.id).toBeGreaterThanOrEqual(1);
    }
  });
});
