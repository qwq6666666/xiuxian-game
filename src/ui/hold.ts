import { canBreakthrough } from "../core/breakthrough";
import { lifespanMonths } from "../core/formulas";
import { atBottleneck, realmOf } from "../core/progress";
import type { GameState } from "../core/state";
import type { GameData } from "../data/types";

export interface Hold {
  /** 同一個節點只暫停一次：用這個鍵記下玩家已看過 */
  key: string;
  message: string;
}

/**
 * 時間該不該自動暫停：可突破、壽元將盡這類錯過就回不來的節點。
 * 只看狀態，不碰時間；玩家按「繼續」後由呼叫端記下 key，不再重複暫停。
 */
export function holdFor(state: GameState, data: GameData): Hold | null {
  if (state.phase !== "living") return null;
  if (state.pendingEvent !== null || state.tribulation !== null || state.encounter !== null) return null;
  const life = state.meta.lives;
  const left = lifespanMonths(realmOf(state, data), state.lifespanBonus) - state.ageMonths;
  if (left <= data.config.holdLifespanMonths) return { key: `end:${life}`, message: "壽元所剩不到一年，時間已停住。想做的事，趁現在。" };
  if (atBottleneck(state, data) && canBreakthrough(state, data)) {
    return { key: `bt:${life}:${state.realmId}`, message: "修為圓滿，關隘就在眼前。時間已停住，備好丹藥再叩關。" };
  }
  return null;
}
