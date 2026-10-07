// 成就（M65）：由跨世收藏（meta）算出的長期目標。只收藏，不給道韻、不動任何數值，也不新增存檔欄位。
import type { AchievementCondition, AchievementDef, GameData } from "../../data/types";
import type { Meta } from "../state";

export interface AchievementStatus {
  def: AchievementDef;
  done: boolean;
  /** 計數型條件的目前進度與目標；其餘條件為 null */
  progress: { now: number; target: number } | null;
}

const sum = (rec: Record<string, number>): number => Object.values(rec).reduce((a, b) => a + b, 0);

/** 某個終局目前最快的年齡（歲），沒達成過為 null */
function fastestYears(meta: Meta, ending: "cleared" | "yuanying" | "huashen"): number | null {
  const months = Object.entries(meta.fastest)
    .filter(([key]) => key.startsWith(`${ending}:`))
    .map(([, m]) => m);
  return months.length === 0 ? null : Math.min(...months) / 12;
}

/** 條件的目前值與目標；done 另外算，因為「最快年齡」是越小越好 */
function measure(c: AchievementCondition, meta: Meta): { now: number; target: number; done: boolean; counted: boolean } {
  const count = (now: number, target: number) => ({ now: Math.min(now, target), target, done: now >= target, counted: true });
  switch (c.kind) {
    case "lives": return count(meta.lives, c.count);
    case "clears": return count(sum(meta.clears), c.count);
    case "originsCleared": return count(Object.values(meta.clears).filter((n) => n > 0).length, c.count);
    case "yuanying": return count(sum(meta.yuanying), c.count);
    case "huashen": return count(sum(meta.huashen), c.count);
    case "fragments": return count(meta.fragments.length, c.count);
    case "bestiarySeen": return count(Object.keys(meta.bestiary).length, c.count);
    case "bestiaryWins": return count(Object.values(meta.bestiary).reduce((n, e) => n + e.win, 0), c.count);
    case "met": return count(Object.keys(meta.met).length, c.count);
    case "goalsDone": return count(Object.values(meta.goals).filter((n) => n > 0).length, c.count);
    case "talentLevels": return count(sum(meta.talents), c.count);
    case "sectRank": return { now: meta.sectBest, target: c.rank, done: meta.sectBest >= c.rank, counted: false };
    case "reached": return { now: 0, target: 1, done: meta.reached.includes(c.key), counted: false };
    case "fastest": {
      const y = fastestYears(meta, c.ending);
      return { now: 0, target: 1, done: y !== null && y <= c.years, counted: false };
    }
  }
}

/** 全部成就的狀態，順序依資料檔 */
export function achievementStatuses(meta: Meta, data: GameData): AchievementStatus[] {
  return data.achievements.map((def) => {
    const m = measure(def.condition, meta);
    return { def, done: m.done, progress: m.counted ? { now: m.now, target: m.target } : null };
  });
}
