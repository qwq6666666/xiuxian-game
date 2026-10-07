// 時間暫停的判斷集中在這裡：等待抉擇、天劫、遇怪（含秘境，每一層就是一場遇怪）都會讓時間停住。
// 新增會暫停時間的狀態，只改這個檔案，tick、離線、計時與各種「現在能不能做」的檢查都會一起生效。
import type { GameData } from "../data/types";
import { autoEncounter } from "./combat/encounter";
import type { GameState } from "./state";

/** 有事等玩家處理：抉擇、天劫、遇怪 */
export function isWaiting(state: GameState): boolean {
  return state.pendingEvent !== null || state.tribulation !== null || state.encounter !== null;
}

/** 修行中且沒有事等著處理：時間可以往前走，玩家也可以自由安排 */
export function isFree(state: GameState): boolean {
  return state.phase === "living" && !isWaiting(state);
}

/** 自動抉擇開著時，把眼前的遇怪（或秘境一層）照預設打法打完；否則原樣回傳 */
export function settleEncounter(state: GameState, data: GameData): GameState {
  return state.encounter !== null && state.autoChoice ? autoEncounter(state, data) : state;
}
