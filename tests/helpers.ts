import { attemptBreakthrough as attemptRaw, autoTribulation } from "../src/core/breakthrough";
import { stageNeed } from "../src/core/formulas";
import { gameData } from "../src/data/load";
import { createInitialState, startLife } from "../src/core/life";
import { nextRandom } from "../src/core/rng";
import type { GameState } from "../src/core/state";

/**
 * 建立修行中的狀態，可覆寫欄位。
 * 預設把事件門檻設得極高（等於關閉事件），讓與事件無關的測試結果固定；
 * 要測事件時用 patch 覆寫 eventThreshold。
 */
export function living(seed = 1, patch: Partial<GameState> = {}): GameState {
  return { ...startLife(createInitialState(seed)), eventThreshold: 1e9, ...patch };
}

/** 練氣第 stage 階段（從 0 起算）升級所需修為，隨資料檔變動 */
export const lianqiNeed = (stage: number): number =>
  stageNeed(gameData.realms.find((r) => r.id === "lianqi")!, stage);

/** 找一個種子，使第一次亂數滿足條件（用來讓機率事件可重現） */
export function seedWhere(pred: (v: number) => boolean): number {
  for (let seed = 1; seed < 100000; seed++) {
    if (pred(nextRandom(seed)[0])) return seed;
  }
  throw new Error("找不到符合條件的種子");
}

/** 嘗試突破並把天劫（若有）每一道都硬抗到結束：結果等同舊的一鍵突破 */
export function attemptBreakthrough(state: GameState, usePill: boolean, data = gameData): GameState {
  return autoTribulation(attemptRaw(state, usePill, data), data);
}
