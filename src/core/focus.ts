// 運功（M33、M40）：修行時點一下，額外得到若干個月份量的修為的一小部分。
// 每滿 focusCooldown 個月存一次，最多存 focusMaxCharges 次，玩家一次用掉全部；
// 存的次數 × 冷卻月數不會超過實際經過的月數，所以整體上限仍是 +focusBonus。
import { gameData } from "../data/load";
import type { GameData } from "../data/types";
import { monthlyGain } from "./gain";
import { atBottleneck, resolveStages, scheduleOf } from "./progress";
import type { GameState } from "./state";

/** 依經過的月份補上積蓄；每過一個月（含離線閉關）都要呼叫一次 */
export function accrueFocus(state: GameState, data: GameData = gameData): GameState {
  const { focusCooldown: cd, focusMaxCharges: cap } = data.config;
  const n = Math.floor((state.ageMonths - state.focusMonth) / cd);
  if (n <= 0) return state;
  return { ...state, focusMonth: state.focusMonth + n * cd, focusStored: Math.min(cap, state.focusStored + n) };
}

/** 目前積蓄的運功次數 */
export function focusCharges(state: GameState, data: GameData = gameData): number {
  return Math.min(data.config.focusMaxCharges, state.focusStored);
}

/** 修行中、沒有等待抉擇或天劫、還沒卡在瓶頸，且至少存了一次 */
export function canFocus(state: GameState, data: GameData = gameData): boolean {
  return (
    state.phase === "living" &&
    state.pendingEvent === null &&
    state.tribulation === null &&
    state.encounter === null &&
    !atBottleneck(state, data) &&
    focusCharges(state, data) > 0
  );
}

/** 還要幾個月才會再存一次；已存滿時沒有意義 */
export function focusWait(state: GameState, data: GameData = gameData): number {
  return Math.max(0, state.focusMonth + data.config.focusCooldown - state.ageMonths);
}

/** 這次運功（用掉全部積蓄）能得的修為 */
export function focusGain(state: GameState, data: GameData = gameData): number {
  return monthlyGain(state, scheduleOf(state, data), data) * data.config.focusBonus * data.config.focusCooldown * focusCharges(state, data);
}

export function focus(state: GameState, data: GameData = gameData): GameState {
  if (!canFocus(state, data)) return state;
  const gain = focusGain(state, data);
  return resolveStages({ ...state, focusStored: 0, cultivation: state.cultivation + gain }, state.ageMonths, data);
}
