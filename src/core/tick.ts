import type { GameState } from "./state";

/** 推進 months 個月，回傳新狀態，不修改輸入 */
export function tick(state: GameState, months = 1): GameState {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error(`tick：months 必須是非負整數，目前為 ${months}`);
  }
  return { ...state, ageMonths: state.ageMonths + months };
}
