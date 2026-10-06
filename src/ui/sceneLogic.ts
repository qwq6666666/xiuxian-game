// 場景的狀態判斷：年齡段、背景、靈氣強度。純函式，與 DOM 無關，方便測試。
import type { GameData } from "../data/types";
import { lifespanMonths } from "../core/formulas";
import { realmOf } from "../core/progress";
import type { GameState } from "../core/state";

export type AgeBand = "young" | "adult" | "elder";
export type SceneSetting = "cave" | "road" | "market" | "ferry";

/** 少年未滿 18 歲；老年是已用掉壽元的 75% 以上；其餘壯年 */
export const YOUNG_BEFORE_YEARS = 18;
export const ELDER_AT_RATIO = 0.75;

export function ageBand(state: GameState, data: GameData): AgeBand {
  if (state.ageMonths < YOUNG_BEFORE_YEARS * 12) return "young";
  const total = lifespanMonths(realmOf(state, data), state.lifespanBonus);
  return state.ageMonths / total >= ELDER_AT_RATIO ? "elder" : "adult";
}

/** 背景：人在坊市或渡口就是坊市、渡口；否則由日常安排決定（閉關與煉丹是靜室、走訪是渡口、其餘是山道） */
export function sceneSetting(state: GameState): SceneSetting {
  const at = state.travel.locationId;
  if (at === "market" || at === "merchantHq" || at.startsWith("branch:")) return "market";
  if (at.startsWith("ferry:")) return "ferry";
  switch (state.schedule) {
    case "wander":
      return "ferry";
    case "retreat":
    case "alchemy":
      return "cave";
    default:
      return "road";
  }
}

/** 靈氣強度 0–5：凡人 0，之後每個境界加一級，依 realms.json 的順序 */
export function qiLevel(state: GameState, data: GameData): number {
  const idx = data.realms.findIndex((r) => r.id === state.realmId);
  return Math.max(0, Math.min(5, idx));
}
