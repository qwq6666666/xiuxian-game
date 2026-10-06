// 心法（M31）：每世在擲骰階段選一個，只用既有的數值欄位，不新增技能。
import { gameData } from "../data/load";
import type { GameData, MethodDef, MethodEffects } from "../data/types";
import type { GameState } from "./state";

export function methodOf(state: GameState, data: GameData = gameData): MethodDef {
  return data.methods.find((m) => m.id === state.methodId) ?? data.methods[0];
}

/** 目前心法的某項效果；沒有該效果為 0 */
export function methodEffect(state: GameState, key: keyof MethodEffects, data: GameData = gameData): number {
  return methodOf(state, data).effects[key] ?? 0;
}

/** 殘卷錄集到足夠份數才解鎖 */
export function methodUnlocked(state: GameState, method: MethodDef): boolean {
  return state.meta.fragments.length >= method.unlock.fragments;
}

/** 擲骰階段換心法；未解鎖或不在擲骰階段原樣回傳 */
export function setMethod(state: GameState, methodId: string, data: GameData = gameData): GameState {
  const m = data.methods.find((x) => x.id === methodId);
  if (state.phase !== "rolling" || !m || !methodUnlocked(state, m)) return state;
  return { ...state, methodId };
}
