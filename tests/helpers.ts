import { createInitialState, startLife } from "../src/core/life";
import { nextRandom } from "../src/core/rng";
import type { GameState } from "../src/core/state";

/** 建立修行中的狀態，可覆寫欄位 */
export function living(seed = 1, patch: Partial<GameState> = {}): GameState {
  return { ...startLife(createInitialState(seed)), ...patch };
}

/** 找一個種子，使第一次亂數滿足條件（用來讓機率事件可重現） */
export function seedWhere(pred: (v: number) => boolean): number {
  for (let seed = 1; seed < 100000; seed++) {
    if (pred(nextRandom(seed)[0])) return seed;
  }
  throw new Error("找不到符合條件的種子");
}
