// 主畫面的衍生顯示：只讀狀態，不改任何數值、不碰時間。
import { stageNeed } from "../core/formulas";
import { atBottleneck, realmOf, scheduleOf } from "../core/progress";
import type { GameState } from "../core/state";
import { monthlyGain } from "../core/tick";
import type { GameData } from "../data/types";

export interface PaceHint {
  /** eta：可估算距下一階段的時間；bottleneck：已卡瓶頸，不給倒數；none：無法估算 */
  kind: "eta" | "bottleneck" | "none";
  /** 以目前安排計的每月修為增量 */
  perMonth: number;
  /** 距下一階段的月數（只有 eta 有意義） */
  months: number;
  /** 以目前速度換算的現實秒數（只有 eta 有意義） */
  seconds: number;
}

/** 每月增量與距下一階段的約略時間；事件、丹藥、換安排都會讓實際時間不同，所以只是約略值 */
export function paceHint(state: GameState, data: GameData): PaceHint {
  const none: PaceHint = { kind: "none", perMonth: 0, months: 0, seconds: 0 };
  if (state.phase !== "living") return none;
  if (atBottleneck(state, data)) return { ...none, kind: "bottleneck" };
  const perMonth = monthlyGain(state, scheduleOf(state, data), data);
  if (!(perMonth > 0)) return none;
  const remaining = Math.max(0, stageNeed(realmOf(state, data), state.stage) - state.cultivation);
  const months = Math.ceil(remaining / perMonth);
  const seconds = (months * data.config.msPerMonth) / 1000 / Math.max(1, state.speed);
  return { kind: "eta", perMonth, months, seconds };
}

/** 修為增量的顯示：十以上取整，其餘一位小數 */
export function formatGain(perMonth: number): string {
  return perMonth >= 10 ? String(Math.round(perMonth)) : perMonth.toFixed(1);
}

/** 現實秒數的約略說法：不足九十秒用秒，不足一小時用分，其餘小時加分 */
export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} 秒`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

/** 壽元剩餘的整年數（至少 0） */
export function yearsLeft(ageMonths: number, lifespanYears: number): number {
  return Math.max(0, Math.ceil(lifespanYears - ageMonths / 12));
}
