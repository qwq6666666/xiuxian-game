// 年號：世人通用的紀年，只有名字、不帶年數。第 n 世（從 0 起算）用清單第 n 項，
// 清單用完後從頭循環並加「後」。轉世之間隔多久不寫（docs/WORLD.md 第 14.1 節）。
import { gameData } from "../data/load";
import type { GameData } from "../data/types";
import type { GameState } from "./state";

/** 第 index 世的年號，例如「永寧」「後永寧」 */
export function eraName(index: number, data: GameData = gameData): string {
  const names = data.eras;
  const cycle = Math.floor(index / names.length);
  return "後".repeat(cycle) + names[index % names.length];
}

/** 這一世是第幾世（從 0 起算）。結算後 meta.lives 已加一，所以回顧中的這一世要減一。 */
export function lifeIndex(state: GameState): number {
  return state.review !== null ? Math.max(0, state.meta.lives - 1) : state.meta.lives;
}
