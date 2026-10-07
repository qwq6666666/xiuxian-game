// 每世目標：開局抽出，進度與結果全由既有狀態算出。只作收藏，不給道韻、不動任何數值。
import { gameData } from "../../data/load";
import type { GameData, GoalDef } from "../../data/types";
import { deriveSeed, nextInt } from "../rng";
import type { GameState, LifeBrief, LifeReview } from "../state";

/** 每世抽出的目標數上限（每個群組至多一個） */
export const GOALS_PER_LIFE = 3;

/** 依種子抽出這一世的目標：只看已走完的世數，每個群組至多一個，群組順序打亂 */
export function pickGoals(seed: number, lives: number, data: GameData = gameData): string[] {
  const groups = new Map<string, GoalDef[]>();
  for (const g of data.goals) {
    if (g.minLives > lives) continue;
    groups.set(g.group, [...(groups.get(g.group) ?? []), g]);
  }
  const names = [...groups.keys()];
  let s = deriveSeed(seed, 2);
  // Fisher-Yates 洗牌群組，再依序各抽一個
  for (let i = names.length - 1; i > 0; i--) {
    const [j, next] = nextInt(s, 0, i);
    s = next;
    [names[i], names[j]] = [names[j], names[i]];
  }
  const picked: string[] = [];
  for (const name of names.slice(0, GOALS_PER_LIFE)) {
    const pool = groups.get(name)!;
    const [k, next] = nextInt(s, 0, pool.length - 1);
    s = next;
    picked.push(pool[k].id);
  }
  return picked;
}

export interface GoalProgress {
  def: GoalDef;
  /** 目前進度與目標值；二元條件（旗標、境界）用 0／1 */
  current: number;
  target: number;
  done: boolean;
}

/** 境界與階段排成一條線的位置，用來比較誰走得遠 */
export function realmRank(realmId: string, stage: number, data: GameData = gameData): number {
  let rank = 0;
  for (const r of data.realms) {
    if (r.id === realmId) return rank + stage;
    rank += r.stageNames.length;
  }
  throw new Error(`找不到境界 ${realmId}`);
}

/** 一個目標在目前狀態下的進度 */
export function goalProgress(state: GameState, def: GoalDef, data: GameData = gameData): GoalProgress {
  const c = def.condition;
  let current = 0;
  let target = 1;
  switch (c.kind) {
    case "realm": {
      target = realmRank(c.realmId, c.stage ?? 0, data);
      current = realmRank(state.realmId, state.stage, data);
      break;
    }
    case "age":
      target = c.years;
      current = Math.floor(state.ageMonths / 12);
      break;
    case "fragments":
      target = c.count;
      current = Math.max(0, state.meta.fragments.length - state.startFragments);
      break;
    case "events":
      target = c.count;
      current = Object.keys(state.eventCounts).length;
      break;
    case "flag":
      current = state.flags.includes(c.flagId) ? 1 : 0;
      break;
  }
  return { def, current: Math.min(current, target), target, done: current >= target };
}

/** 這一世所有目標的進度，依抽出順序 */
export function goalStatuses(state: GameState, data: GameData = gameData): GoalProgress[] {
  return state.goalIds.flatMap((id) => {
    const def = data.goals.find((g) => g.id === id);
    return def ? [goalProgress(state, def, data)] : [];
  });
}

/** 一世結束時的簡要結果 */
export function lifeBrief(state: GameState): LifeBrief {
  return { ageMonths: state.ageMonths, realmId: state.realmId, stage: state.stage, originId: state.originId };
}

export type VersusLine =
  | { kind: "age"; cmp: "more" | "less" | "same"; years: number }
  | { kind: "progress"; cmp: "far" | "short" | "same"; from: LifeBrief; to: LifeBrief }
  | { kind: "origin" };

/** 這一世與上一世的差別：壽數、走得多遠、出身，最多三行；沒有上一世時為空 */
export function compareLives(review: Pick<LifeReview, "ageMonths" | "realmId" | "stage" | "originId" | "prev">, data: GameData = gameData): VersusLine[] {
  const prev = review.prev;
  if (prev === null) return [];
  const now: LifeBrief = { ageMonths: review.ageMonths, realmId: review.realmId, stage: review.stage, originId: review.originId };
  const diffYears = Math.floor(now.ageMonths / 12) - Math.floor(prev.ageMonths / 12);
  const progress = realmRank(now.realmId, now.stage, data) - realmRank(prev.realmId, prev.stage, data);
  const lines: VersusLine[] = [
    { kind: "age", cmp: diffYears > 0 ? "more" : diffYears < 0 ? "less" : "same", years: Math.abs(diffYears) },
    { kind: "progress", cmp: progress > 0 ? "far" : progress < 0 ? "short" : "same", from: prev, to: now },
  ];
  if (prev.originId !== now.originId) lines.push({ kind: "origin" });
  return lines;
}
