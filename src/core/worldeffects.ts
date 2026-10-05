// 世局效果（M17）：世局隨年齡變化，坊市價格與部分事件的條件跟著變。
// 全由世界種子與年齡算出，不進存檔、不動亂數。
import { gameData } from "../data/load";
import type { GameData, WorldEffectDef } from "../data/types";
import type { GameState } from "./state";
import { worldAt, worldFor, type WorldSnapshot } from "./world";

/** 世局是否符合效果的全部條件 */
export function effectApplies(snap: WorldSnapshot, effect: WorldEffectDef): boolean {
  const w = effect.when;
  if (w.guardState) {
    const guard = snap.sects.find((s) => s.kind === "guard");
    if (!guard || !w.guardState.includes(guard.state)) return false;
  }
  if (w.merchantBranchesMin !== undefined && snap.merchantBranches.length < w.merchantBranchesMin) return false;
  if (w.ferriesBrokenMin !== undefined && snap.ferries.filter((f) => f.broken).length < w.ferriesBrokenMin) return false;
  return true;
}

let memo: { seed: number; age: number; data: GameData; effects: WorldEffectDef[] } | null = null;

/** 這個狀態此刻生效的世局效果（同一世同一歲只算一次，買丹與抽事件每月都會問） */
export function activeWorldEffects(state: GameState, data: GameData = gameData): WorldEffectDef[] {
  if (data.worldEffects.length === 0) return [];
  const age = Math.floor(state.ageMonths / 12);
  if (memo && memo.seed === state.worldSeed && memo.age === age && memo.data === data) return memo.effects;
  const snap = worldAt(worldFor(state.worldSeed, data), age);
  const effects = data.worldEffects.filter((e) => effectApplies(snap, e));
  memo = { seed: state.worldSeed, age, data, effects };
  return effects;
}

/** 事件條件 world / worldNot 用的旗標：就是生效中的效果 id */
export function worldFlagsOf(state: GameState, data: GameData = gameData): string[] {
  return activeWorldEffects(state, data).map((e) => e.id);
}

/** 物品此刻的價格：基本價乘上所有生效效果的倍率，四捨五入，至少 1 */
export function itemPrice(state: GameState, itemId: string, data: GameData = gameData): number {
  const item = data.items.find((i) => i.id === itemId);
  if (!item) return 0;
  let mult = 1;
  for (const e of activeWorldEffects(state, data)) mult *= e.market[itemId] ?? 1;
  return Math.max(1, Math.round(item.price * mult));
}
