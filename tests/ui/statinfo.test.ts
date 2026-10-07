import { describe, expect, it } from "vitest";
import { monthlyGain } from "../../src/core/tick";
import { scheduleOf } from "../../src/core/progress";
import { gameData as data } from "../../src/data/load";
import { statPanel } from "../../src/ui/panels/statinfo";
import { living } from "../helpers";

describe("當前數值面板", () => {
  it("每月修為與核心公式一致；明細的乘數連乘等於它", () => {
    const s = living(3, { realmId: "lianqi", stage: 2, methodId: "jixing", cultivationBonus: 0.1 });
    const p = statPanel(s, data);
    expect(p.main[1].label).toBe("每月修為");
    const gain = monthlyGain(s, scheduleOf(s, data), data);
    let product = 1;
    for (const r of p.breakdown) {
      const v = r.value.startsWith("×") ? Number(r.value.slice(1)) : 1 + (r.value.startsWith("−") ? -1 : 1) * Number(r.value.slice(1, -1)) / 100;
      product *= v;
    }
    expect(product).toBeCloseTo(gain, 1);
  });
  it("心法與出身加成才列出；沒有突破規則的境界不列成功率", () => {
    const plain = statPanel(living(3, { realmId: "lianqi" }), data);
    expect(plain.breakdown.some((r) => r.label.startsWith("心法"))).toBe(false);
    expect(plain.main.some((r) => r.label === "突破成功率")).toBe(true);
    const fast = statPanel(living(3, { realmId: "lianqi", methodId: "jixing" }), data);
    expect(fast.breakdown.find((r) => r.label.startsWith("心法"))?.value).toBe("+6%");
  });
});
