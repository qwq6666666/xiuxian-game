import { describe, expect, it } from "vitest";
import { lifespanMonths } from "../../src/core/formulas";
import { gameData as data } from "../../src/data/load";
import { ageBand, qiLevel, sceneSetting } from "../../src/ui/scene/sceneLogic";
import { living } from "../helpers";

const zhuji = data.realms.find((r) => r.id === "zhuji")!;

describe("場景狀態判斷", () => {
  it("年齡三段：18 歲前少年、壽元用掉 75% 起老年", () => {
    expect(ageBand(living(1, { ageMonths: 12 * 12 }), data)).toBe("young");
    expect(ageBand(living(1, { ageMonths: 18 * 12, realmId: "lianqi" }), data)).toBe("adult");
    const total = lifespanMonths(zhuji, 0);
    expect(ageBand(living(1, { realmId: "zhuji", ageMonths: Math.floor(total * 0.74) }), data)).toBe("adult");
    expect(ageBand(living(1, { realmId: "zhuji", ageMonths: Math.ceil(total * 0.75) }), data)).toBe("elder");
    // 延壽之後老年門檻往後移
    expect(ageBand(living(1, { realmId: "zhuji", lifespanBonus: 100, ageMonths: Math.ceil(total * 0.75) }), data)).toBe("adult");
  });

  it("背景：所在地優先，其次依日常安排", () => {
    const at = (locationId: string, schedule: string) => living(1, { schedule, travel: { locationId, targetId: null, totalMonths: 0, remainingMonths: 0, trail: [locationId] } });
    expect(sceneSetting(at("village", "retreat"))).toBe("cave");
    expect(sceneSetting(at("village", "alchemy"))).toBe("cave");
    expect(sceneSetting(at("village", "adventure"))).toBe("road");
    expect(sceneSetting(at("village", "herb"))).toBe("road");
    expect(sceneSetting(at("village", "wander"))).toBe("ferry");
    expect(sceneSetting(at("market", "retreat"))).toBe("market");
    expect(sceneSetting(at("ferry:a", "adventure"))).toBe("ferry");
  });

  it("靈氣強度隨境界遞增，凡人為 0", () => {
    const levels = data.realms.map((r) => qiLevel(living(1, { realmId: r.id }), data));
    expect(levels[0]).toBe(0);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    expect(Math.max(...levels)).toBeLessThanOrEqual(5);
  });
});
