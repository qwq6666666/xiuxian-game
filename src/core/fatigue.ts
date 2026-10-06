// 疲勞（M46）：連續閉關太久，每月修為遞減；改做別的安排會逐月回復。
// 規則寫在 schedules.json 該安排的 fatigue 欄位，沒有這個欄位的安排不會疲勞。
import { gameData } from "../data/load";
import type { FatigueRule, GameData, ScheduleDef } from "../data/types";
import type { GameState } from "./state";

/** 連續 streak 個月之後的修為倍率（1 = 不受影響），不低於 floor */
export function fatigueMultAt(rule: FatigueRule, streak: number): number {
  const over = Math.max(0, streak - rule.graceMonths);
  return Math.max(rule.floor, 1 - rule.perYear * (over / 12));
}

/** 目前境界是否已到會疲勞的境界 */
function fatigueApplies(state: GameState, rule: FatigueRule, data: GameData): boolean {
  const at = data.realms.findIndex((r) => r.id === state.realmId);
  if (rule.realmMin !== undefined && at < data.realms.findIndex((r) => r.id === rule.realmMin)) return false;
  if (rule.realmMax !== undefined && at > data.realms.findIndex((r) => r.id === rule.realmMax)) return false;
  return true;
}

/** 這個月選這個安排時的疲勞倍率；安排不會疲勞、或境界還沒到就是 1 */
export function fatigueMult(state: GameState, sched: ScheduleDef, data: GameData = gameData): number {
  return sched.fatigue && fatigueApplies(state, sched.fatigue, data) ? fatigueMultAt(sched.fatigue, state.retreatStreak) : 1;
}

/** 資料裡第一個會疲勞的安排的規則（目前只有閉關）；回復量取自它 */
export function fatigueRule(data: GameData = gameData): FatigueRule | undefined {
  return data.schedules.find((s) => s.fatigue !== undefined)?.fatigue;
}

/**
 * 過完一個月後更新連續月數。會疲勞的安排只在這個月真的累積了修為時才計入
 * （卡在瓶頸等著突破不算），做別的安排則回復 recoverPerMonth 個月。
 */
export function advanceStreak(state: GameState, sched: ScheduleDef, accrued: boolean, data: GameData = gameData): GameState {
  const rule = fatigueRule(data);
  if (!rule || !fatigueApplies(state, rule, data)) return state;
  const next = sched.fatigue ? state.retreatStreak + (accrued ? 1 : 0) : Math.max(0, state.retreatStreak - rule.recoverPerMonth);
  return next === state.retreatStreak ? state : { ...state, retreatStreak: next };
}
