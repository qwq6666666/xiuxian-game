// 運功（M33）：修行時點一下，額外得到幾個月份量的修為的一小部分；有冷卻，所以連點也只是小幅加速（整體 +focusBonus）。
import { gameData } from "../data/load";
import type { GameData } from "../data/types";
import { monthlyGain, resolveStages, scheduleOf } from "./tick";
import type { GameState } from "./state";
import { atBottleneck } from "./progress";

/** 修行中、沒有等待抉擇或天劫、還沒卡在瓶頸，且冷卻已過 */
export function canFocus(state: GameState, data: GameData = gameData): boolean {
  return (
    state.phase === "living" &&
    state.pendingEvent === null &&
    state.tribulation === null &&
    !atBottleneck(state, data) &&
    state.ageMonths - state.focusMonth >= data.config.focusCooldown
  );
}

/** 還要幾個月才能再運功；現在就能運功為 0 */
export function focusWait(state: GameState, data: GameData = gameData): number {
  return Math.max(0, state.focusMonth + data.config.focusCooldown - state.ageMonths);
}

/** 這次運功能得的修為 */
export function focusGain(state: GameState, data: GameData = gameData): number {
  return monthlyGain(state, scheduleOf(state, data), data) * data.config.focusBonus * data.config.focusCooldown;
}

export function focus(state: GameState, data: GameData = gameData): GameState {
  if (!canFocus(state, data)) return state;
  const gain = focusGain(state, data);
  return resolveStages({ ...state, focusMonth: state.ageMonths, cultivation: state.cultivation + gain }, state.ageMonths, data);
}
