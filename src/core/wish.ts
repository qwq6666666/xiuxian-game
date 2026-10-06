// 夙願（M44）：擲骰階段指定這一世的一個目標；被指定的目標若有掛鉤的事件，抽事件時權重提高。
// 夙願只偏事件池，不給修為、靈石或道韻（每世目標只作收藏，第 10.5 節）。
import { gameData } from "../data/load";
import type { EventDef, GameData, GoalDef } from "../data/types";
import { talentBonus } from "./formulas";
import { GOALS_PER_LIFE } from "./goals";
import type { GameState } from "./state";

/** 夙願的等級：1 級從本世備選的目標中挑，2 級可從已解鎖的全部目標中挑 */
export function wishLevel(state: Pick<GameState, "meta">, data: GameData = gameData): number {
  return Math.max(0, Math.round(talentBonus(state.meta, data.talents, "wish")));
}

/** 現在能指定為夙願的目標 */
export function wishChoices(state: GameState, data: GameData = gameData): GoalDef[] {
  const level = wishLevel(state, data);
  if (level <= 0) return [];
  if (level === 1) return state.goalIds.map((id) => data.goals.find((g) => g.id === id)!).filter(Boolean);
  return data.goals.filter((g) => g.minLives <= state.meta.lives);
}

/** 指定（或用 null 取消）夙願。不在備選目標裡的，換進這一世的目標清單：同群組的先讓位，沒有就換掉最後一個。 */
export function setWish(state: GameState, goalId: string | null, data: GameData = gameData): GameState {
  if (state.phase !== "rolling") return state;
  if (goalId === null) return { ...state, wishId: null };
  const goal = wishChoices(state, data).find((g) => g.id === goalId);
  if (!goal) return state;
  if (state.goalIds.includes(goalId)) return { ...state, wishId: goalId };
  const others = state.goalIds.filter((id) => data.goals.find((g) => g.id === id)?.group !== goal.group);
  const goalIds = [goalId, ...others].slice(0, GOALS_PER_LIFE);
  return { ...state, goalIds, wishId: goalId };
}

/** 事件有沒有被夙願掛上：點名、要求或設定了掛鉤的旗標、或與掛鉤的故人相關 */
export function wishMatches(goal: GoalDef, ev: EventDef): boolean {
  const t = goal.tilt;
  if (!t) return false;
  if (t.eventIds?.includes(ev.id)) return true;
  if (t.acquaintances && ev.conditions.acquaintance && t.acquaintances.includes(ev.conditions.acquaintance.id)) return true;
  if (t.flags) {
    const produced = [...(ev.effects?.flags ?? []), ...(ev.choices ?? []).flatMap((c) => c.outcomes.flatMap((o) => o.effects.flags ?? []))];
    if ([...(ev.conditions.flags ?? []), ...produced].some((f) => t.flags!.includes(f))) return true;
  }
  return false;
}

/** 抽事件時，夙願對這個事件的權重倍率；沒指定夙願或沒掛上為 1 */
export function wishWeightMult(state: GameState, ev: EventDef, data: GameData = gameData): number {
  if (state.wishId === null) return 1;
  const goal = data.goals.find((g) => g.id === state.wishId);
  return goal && wishMatches(goal, ev) ? data.config.wishWeightMult : 1;
}
