import { describe, expect, it } from "vitest";
import { achievementStatuses } from "../../src/core/character/achievements";
import { emptyMeta } from "../../src/core/state";
import { gameData } from "../../src/data/load";
import { validateAchievements } from "../../src/data/validate";

const status = (meta = emptyMeta()) => Object.fromEntries(achievementStatuses(meta, gameData).map((s) => [s.def.id, s]));

describe("成就", () => {
  it("全新的收藏沒有任何成就，計數型有進度", () => {
    const s = status();
    expect(Object.values(s).every((x) => !x.done)).toBe(true);
    expect(s.lives_10.progress).toEqual({ now: 0, target: 10 });
    expect(s.zhuji_1.progress).toBeNull();
  });

  it("世數、階段、通關、最快年齡各自依收藏判定", () => {
    const meta = {
      ...emptyMeta(),
      lives: 12,
      reached: ["lianqi:4", "zhuji:0"],
      clears: { farmer: 2, merchant: 3 },
      fastest: { "cleared:farmer": 90 * 12, "cleared:noble": 130 * 12 },
      talents: { suhui: 9, tianjuan: 2 },
    };
    const s = status(meta);
    expect(s.first_life.done && s.lives_10.done).toBe(true);
    expect(s.lives_30.done).toBe(false);
    expect(s.lives_30.progress).toEqual({ now: 12, target: 30 });
    expect(s.lianqi_5.done && s.zhuji_1.done).toBe(true);
    expect(s.zhuji_3.done).toBe(false);
    expect(s.clears_5.done).toBe(true);
    expect(s.origins_all.progress).toEqual({ now: 2, target: 4 });
    expect(s.fast_clear.done).toBe(true);
    expect(s.talents_10.done).toBe(true);
  });

  it("進度不超過目標", () => {
    expect(status({ ...emptyMeta(), lives: 999 }).lives_30.progress).toEqual({ now: 30, target: 30 });
  });

  it("資料裡每個成就都有達成的可能（目標不超過遊戲內容總量）", () => {
    const totalTalentLevels = gameData.talents.reduce((n, t) => n + t.maxLevel, 0);
    const realms = new Map(gameData.realms.map((r) => [r.id, r.stageNames.length]));
    for (const { condition: c, id } of gameData.achievements) {
      if (c.kind === "fragments") expect(c.count, id).toBeLessThanOrEqual(gameData.fragments.items.length);
      if (c.kind === "bestiarySeen") expect(c.count, id).toBeLessThanOrEqual(gameData.monsters.monsters.length);
      if (c.kind === "met") expect(c.count, id).toBeLessThanOrEqual(gameData.acquaintances.length);
      if (c.kind === "goalsDone") expect(c.count, id).toBeLessThanOrEqual(gameData.goals.length);
      if (c.kind === "originsCleared") expect(c.count, id).toBeLessThanOrEqual(gameData.origins.length);
      if (c.kind === "sectRank") expect(c.rank, id).toBeLessThanOrEqual(gameData.sects.ranks.length);
      if (c.kind === "talentLevels") expect(c.count, id).toBeLessThanOrEqual(totalTalentLevels);
      if (c.kind === "reached") {
        const [realmId, stage] = c.key.split(":");
        expect(realms.get(realmId), `${id} 的境界 ${realmId}`).toBeGreaterThan(Number(stage));
      }
    }
  });

  it("格式檢查會指出哪一筆的哪個欄位錯", () => {
    expect(() => validateAchievements([{ id: "x", name: "a", desc: "b", group: "g", condition: { kind: "nope" } }])).toThrow(/x.*kind/);
    expect(() => validateAchievements([{ id: "x", name: "a", desc: "b", group: "g", condition: { kind: "lives", count: 0 } }])).toThrow(/count/);
    expect(() => validateAchievements([])).toThrow();
  });
});
